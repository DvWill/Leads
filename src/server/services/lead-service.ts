import {
  ActivityDirection,
  ActivityType,
  AssignmentReason,
  AuditAction,
  ContactOutcome,
  Prisma,
  ReturnStatus,
  TaskStatus,
  UserStatus,
} from "@prisma/client";
import { db } from "@/src/server/db";
import type { AuthContext } from "@/src/server/auth";
import { assertLeadAccess, AuthorizationError, hasPermission, leadAccessWhere } from "@/src/server/rbac";
import { activityCountsAsAttempt, activityCountsAsResponse, validateStageRequirements, type StageChangeInput } from "@/src/domain/pipeline";
import { buildBalancedRoundRobinPlan } from "@/src/domain/distribution";
import { assignLeadsSchema, contactActivitySchema, roundRobinSchema, taskSchema } from "@/src/lib/validation/lead";

export class DomainError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "DomainError";
    this.status = status;
  }
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stageKeyForActivity(type: ActivityType, outcome?: ContactOutcome, direction?: ActivityDirection) {
  if (type === "CONTACT_RESPONSE" || direction === "INBOUND") return "response_received";
  switch (outcome) {
    case "SENT":
    case "NO_ANSWER":
      return "no_response";
    case "CONNECTED":
    case "REPLIED":
      return "in_conversation";
    case "INTERESTED":
      return "interested";
    case "MEETING_BOOKED":
      return "meeting_scheduled";
    case "PROPOSAL_SENT":
      return "proposal_sent";
    case "WON":
      return "closed_won";
    case "LOST":
      return null;
    default:
      return type === "CONTACT_ATTEMPT" ? "first_attempt" : null;
  }
}

export async function registerActivity(context: AuthContext, leadId: string, raw: unknown) {
  if (!hasPermission(context, "LEAD_EDIT")) throw new AuthorizationError();
  const input = contactActivitySchema.parse(raw);

  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({
      where: { id: leadId, ...leadAccessWhere(context), archivedAt: null },
      include: { stage: true },
    });
    if (!lead) throw new DomainError("Lead não encontrado.", 404);
    assertLeadAccess(context, lead);

    const isContact = input.type === "CONTACT_ATTEMPT" || input.type === "CONTACT_RESPONSE";
    if (isContact && (lead.doNotContactAt || lead.stage.blocksContact || lead.processingBlockedAt) && !hasPermission(context, "DO_NOT_CONTACT_OVERRIDE")) {
      throw new DomainError("Este lead está marcado como Não contatar. Solicite a liberação administrativa.", 409);
    }

    const occurredAt = input.occurredAt;
    const countsAttempt = activityCountsAsAttempt(input.type);
    const countsResponse = activityCountsAsResponse(input.type, input.direction, input.returnStatus);
    const activity = await tx.activity.create({
      data: {
        organizationId: context.organization.id,
        leadId,
        authorId: context.user.id,
        type: input.type,
        channel: input.channel,
        direction: input.direction,
        outcome: input.outcome,
        returnStatus: input.returnStatus,
        notes: input.notes || null,
        durationSeconds: input.durationSeconds,
        nextActionAt: input.nextActionAt,
        occurredAt,
      },
    });

    const update: Prisma.LeadUpdateInput = {
      lastActivityAt: occurredAt,
      ...(countsAttempt
        ? { firstContactAt: lead.firstContactAt ?? occurredAt, lastContactAt: occurredAt }
        : {}),
      ...(countsResponse ? { lastResponseAt: occurredAt, returnStatus: ReturnStatus.YES } : {}),
      ...(input.returnStatus ? { returnStatus: input.returnStatus } : {}),
      ...(input.nextActionAt ? { nextFollowUpAt: input.nextActionAt } : {}),
      ...(input.outcome === "MEETING_BOOKED" ? { meetingAt: input.nextActionAt ?? occurredAt } : {}),
      ...(input.outcome === "PROPOSAL_SENT" ? { proposalSentAt: occurredAt } : {}),
      ...(input.outcome === "WON" ? { wonAt: occurredAt } : {}),
    };

    const targetKey = stageKeyForActivity(input.type, input.outcome, input.direction);
    let targetStageId: string | null = null;
    if (targetKey) {
      const stage = await tx.pipelineStage.findFirst({ where: { organizationId: context.organization.id, key: targetKey, isActive: true } });
      if (stage && stage.id !== lead.stageId) {
        // Do not silently go backwards after an advanced commercial stage.
        if (stage.position >= lead.stage.position || stage.isWon) {
          targetStageId = stage.id;
          update.stage = { connect: { id: stage.id } };
          await tx.leadStageHistory.create({ data: { organizationId: context.organization.id, leadId, fromStageId: lead.stageId, toStageId: stage.id, changedById: context.user.id, reason: "Movimentação automática pelo resultado do contato", metadata: json({ activityId: activity.id }) } });
        }
      }
    }

    await tx.lead.update({ where: { id: leadId }, data: update });

    if (input.nextActionAt && input.nextActionTitle) {
      await tx.task.create({ data: { organizationId: context.organization.id, leadId, assigneeId: lead.assigneeId ?? context.user.id, createdById: context.user.id, title: input.nextActionTitle, dueAt: input.nextActionAt, reminderAt: input.nextActionAt, priority: lead.priority } });
    }

    await tx.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: AuditAction.CREATE, entityType: "Activity", entityId: activity.id, after: json({ leadId, type: input.type, outcome: input.outcome, targetStageId }) } });
    return activity;
  });
}

export async function changeLeadStage(context: AuthContext, leadId: string, input: StageChangeInput) {
  if (!hasPermission(context, "LEAD_EDIT")) throw new AuthorizationError();
  return db.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, ...leadAccessWhere(context), archivedAt: null }, include: { stage: true } });
    if (!lead) throw new DomainError("Lead não encontrado.", 404);
    const target = await tx.pipelineStage.findFirst({ where: { id: input.stageId, organizationId: context.organization.id, isActive: true } });
    if (!target) throw new DomainError("Etapa inválida.");
    const errors = validateStageRequirements(target, input);
    if (target.isWon && !input.wonAt) input.wonAt = new Date();
    if (errors.length) throw new DomainError(errors.join(" "));
    if (target.id === lead.stageId) return lead;

    const before = { stageId: lead.stageId, stage: lead.stage.name };
    const updated = await tx.lead.update({
      where: { id: lead.id },
      data: {
        stageId: target.id,
        meetingAt: input.meetingAt,
        proposalSentAt: input.proposalSentAt,
        proposalValue: input.proposalValue,
        wonAt: target.isWon ? input.wonAt ?? new Date() : undefined,
        wonValue: target.isWon ? input.wonValue : undefined,
        lostAt: target.isLost ? new Date() : undefined,
        lossReasonId: target.requiresLossReason ? input.lossReasonId : undefined,
        doNotContactAt: target.blocksContact ? new Date() : undefined,
        doNotContactReason: target.blocksContact ? input.reason : undefined,
        processingBlockedAt: target.blocksContact ? new Date() : undefined,
        lastActivityAt: new Date(),
      },
    });
    await tx.leadStageHistory.create({ data: { organizationId: context.organization.id, leadId, fromStageId: lead.stageId, toStageId: target.id, changedById: context.user.id, reason: input.reason, metadata: json(input) } });
    await tx.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: AuditAction.STAGE_CHANGE, entityType: "Lead", entityId: leadId, before: json(before), after: json({ stageId: target.id, stage: target.name }) } });
    return updated;
  });
}

export async function assignLeads(context: AuthContext, raw: unknown) {
  if (!hasPermission(context, "LEAD_ASSIGN")) throw new AuthorizationError();
  const input = assignLeadsSchema.parse(raw);
  return db.$transaction(async (tx) => {
    if (input.assigneeId) {
      const user = await tx.user.findFirst({ where: { id: input.assigneeId, organizationId: context.organization.id, status: UserStatus.ACTIVE } });
      if (!user) throw new DomainError("Colaborador ativo não encontrado.");
    }
    const leads = await tx.lead.findMany({ where: { id: { in: input.leadIds }, organizationId: context.organization.id, archivedAt: null }, select: { id: true, assigneeId: true } });
    if (leads.length !== new Set(input.leadIds).size) throw new DomainError("Um ou mais leads não pertencem à organização.", 404);
    const now = new Date();
    for (const lead of leads) {
      await tx.lead.update({ where: { id: lead.id }, data: { assigneeId: input.assigneeId, lastActivityAt: now } });
      await tx.leadAssignment.create({ data: { organizationId: context.organization.id, leadId: lead.id, previousAssigneeId: lead.assigneeId, assigneeId: input.assigneeId, assignedById: context.user.id, reason: lead.assigneeId ? AssignmentReason.REASSIGNMENT : AssignmentReason.BULK, note: input.note } });
      await tx.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: lead.assigneeId ? AuditAction.REASSIGN : AuditAction.ASSIGN, entityType: "Lead", entityId: lead.id, before: json({ assigneeId: lead.assigneeId }), after: json({ assigneeId: input.assigneeId }) } });
    }
    return { assigned: leads.length };
  });
}

export async function distributeRoundRobin(context: AuthContext, raw: unknown) {
  if (!hasPermission(context, "LEAD_ASSIGN")) throw new AuthorizationError();
  const input = roundRobinSchema.parse(raw);
  return db.$transaction(async (tx) => {
    // Serializable prevents concurrent distributors from calculating the same capacity.
    const collaborators = await tx.user.findMany({
      where: { id: { in: input.collaboratorIds }, organizationId: context.organization.id, status: UserStatus.ACTIVE },
      select: { id: true, maxActiveLeads: true, _count: { select: { assignedLeads: { where: { archivedAt: null, stage: { isClosed: false } } } } } },
      orderBy: { id: "asc" },
    });
    if (!collaborators.length) throw new DomainError("Selecione ao menos um colaborador ativo.");
    const leads = await tx.lead.findMany({ where: { id: { in: input.leadIds }, organizationId: context.organization.id, archivedAt: null }, select: { id: true, assigneeId: true, phoneNormalized: true, temporarilyClosed: true, permanentlyClosed: true } });
    const plan = buildBalancedRoundRobinPlan(
      leads.map((lead) => ({ id: lead.id, hasPhone: Boolean(lead.phoneNormalized), temporarilyClosed: lead.temporarilyClosed, permanentlyClosed: lead.permanentlyClosed })),
      collaborators.map((user) => ({ id: user.id, activeLeadCount: user._count.assignedLeads, maxActiveLeads: user.maxActiveLeads })),
      input,
    );
    const previousById = new Map(leads.map((lead) => [lead.id, lead.assigneeId]));
    for (const item of plan) {
      const previousAssigneeId = previousById.get(item.leadId) ?? null;
      await tx.lead.update({ where: { id: item.leadId }, data: { assigneeId: item.assigneeId, lastActivityAt: new Date() } });
      await tx.leadAssignment.create({ data: { organizationId: context.organization.id, leadId: item.leadId, previousAssigneeId, assigneeId: item.assigneeId, assignedById: context.user.id, reason: AssignmentReason.ROUND_ROBIN } });
      await tx.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: previousAssigneeId ? AuditAction.REASSIGN : AuditAction.ASSIGN, entityType: "Lead", entityId: item.leadId, before: json({ assigneeId: previousAssigneeId }), after: json({ assigneeId: item.assigneeId, strategy: "ROUND_ROBIN" }) } });
    }
    return { assigned: plan.length, excluded: leads.length - plan.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function createTask(context: AuthContext, leadId: string, raw: unknown) {
  if (!hasPermission(context, "LEAD_EDIT")) throw new AuthorizationError();
  const input = taskSchema.parse(raw);
  const lead = await db.lead.findFirst({ where: { id: leadId, ...leadAccessWhere(context), archivedAt: null }, select: { id: true, organizationId: true, assigneeId: true } });
  if (!lead) throw new DomainError("Lead não encontrado.", 404);
  const assigneeId = input.assigneeId ?? lead.assigneeId ?? context.user.id;
  const validAssignee = await db.user.count({ where: { id: assigneeId, organizationId: context.organization.id, status: UserStatus.ACTIVE } });
  if (!validAssignee) throw new DomainError("Responsável inválido.");
  return db.$transaction(async (tx) => {
    const task = await tx.task.create({ data: { organizationId: context.organization.id, leadId, assigneeId, createdById: context.user.id, title: input.title, description: input.description, dueAt: input.dueAt, reminderAt: input.reminderAt, priority: input.priority } });
    await tx.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: input.dueAt, lastActivityAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: AuditAction.CREATE, entityType: "Task", entityId: task.id, after: json({ leadId, dueAt: input.dueAt, assigneeId }) } });
    return task;
  });
}

export async function completeTask(context: AuthContext, taskId: string) {
  return db.$transaction(async (tx) => {
    const task = await tx.task.findFirst({ where: { id: taskId, organizationId: context.organization.id, assigneeId: hasPermission(context, "LEAD_VIEW_ALL") ? undefined : context.user.id, status: TaskStatus.OPEN } });
    if (!task) throw new DomainError("Tarefa não encontrada.", 404);
    const completed = await tx.task.update({ where: { id: task.id }, data: { status: TaskStatus.COMPLETED, completedAt: new Date(), completedById: context.user.id } });
    const nextTask = await tx.task.findFirst({ where: { leadId: task.leadId, organizationId: context.organization.id, status: TaskStatus.OPEN }, orderBy: { dueAt: "asc" } });
    await tx.lead.update({ where: { id: task.leadId }, data: { nextFollowUpAt: nextTask?.dueAt ?? null, lastActivityAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: AuditAction.UPDATE, entityType: "Task", entityId: task.id, before: json({ status: task.status }), after: json({ status: TaskStatus.COMPLETED }) } });
    return completed;
  });
}
