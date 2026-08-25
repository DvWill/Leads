import {
  AuditAction,
  GoalPeriod,
  Permission,
  PermissionEffect,
  Prisma,
  UserRole,
  UserStatus,
} from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";

import type { AuthContext } from "@/src/server/auth";
import { db } from "@/src/server/db";
import { AuthorizationError, hasPermission } from "@/src/server/rbac";
import { DomainError } from "@/src/server/services/lead-service";
import { emailSchema, newPasswordSchema } from "@/src/lib/validation/auth";

const BCRYPT_ROUNDS = 12;
const uuidSchema = z.string().uuid("Identificador inválido.");
const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Informe uma cor hexadecimal com seis dígitos.")
  .transform((value) => value.toUpperCase());
const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();
const nonNegativeTarget = z.coerce.number().int().min(0).max(1_000_000);

export const createUserSchema = z.strictObject({
  name: z.string().trim().min(2, "Informe o nome.").max(160),
  email: emailSchema,
  password: newPasswordSchema,
  role: z.nativeEnum(UserRole).default(UserRole.COLLABORATOR),
  phone: optionalText(32),
  maxActiveLeads: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
});

const permissionGrantSchema = z.strictObject({
  permission: z.nativeEnum(Permission),
  effect: z.nativeEnum(PermissionEffect).default(PermissionEffect.ALLOW),
});

export const updateUserSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(160).optional(),
    email: emailSchema.optional(),
    role: z.nativeEnum(UserRole).optional(),
    phone: optionalText(32),
    maxActiveLeads: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
    permissions: z.array(permissionGrantSchema).max(50).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Informe ao menos uma alteração.")
  .refine(
    (input) =>
      !input.permissions ||
      new Set(input.permissions.map((grant) => grant.permission)).size === input.permissions.length,
    { message: "Não repita permissões.", path: ["permissions"] },
  );

export const userStatusSchema = z.strictObject({
  status: z.enum([UserStatus.ACTIVE, UserStatus.INACTIVE]),
});

export const adminResetPasswordSchema = z
  .strictObject({
    password: newPasswordSchema,
    confirmation: z.string(),
  })
  .refine((input) => input.password === input.confirmation, {
    message: "A confirmação da senha não confere.",
    path: ["confirmation"],
  });

export const createGoalSchema = z
  .strictObject({
    userId: uuidSchema,
    period: z.nativeEnum(GoalPeriod),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    targetAttempts: nonNegativeTarget.default(0),
    targetResponses: nonNegativeTarget.default(0),
    targetMeetings: nonNegativeTarget.default(0),
    targetProposals: nonNegativeTarget.default(0),
    targetWins: nonNegativeTarget.default(0),
    isActive: z.boolean().default(true),
  })
  .refine((input) => input.endsAt > input.startsAt, {
    message: "O fim da meta deve ser posterior ao início.",
    path: ["endsAt"],
  });

export const updateGoalSchema = z
  .strictObject({
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    targetAttempts: nonNegativeTarget.optional(),
    targetResponses: nonNegativeTarget.optional(),
    targetMeetings: nonNegativeTarget.optional(),
    targetProposals: nonNegativeTarget.optional(),
    targetWins: nonNegativeTarget.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Informe ao menos uma alteração.");

const stageFields = {
  name: z.string().trim().min(2, "Informe o nome da etapa.").max(100),
  color: colorSchema,
  position: z.coerce.number().int().min(1).max(100).optional(),
  isActive: z.boolean().default(true),
  isClosed: z.boolean().default(false),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
  requiresMeetingAt: z.boolean().default(false),
  requiresProposalAt: z.boolean().default(false),
  requiresLossReason: z.boolean().default(false),
  blocksContact: z.boolean().default(false),
  rules: z.record(z.string(), z.unknown()).default({}),
};

function validStageFlags(stage: {
  isClosed?: boolean;
  isWon?: boolean;
  isLost?: boolean;
  blocksContact?: boolean;
}): boolean {
  if (stage.isWon && stage.isLost) return false;
  if ((stage.isWon || stage.isLost || stage.blocksContact) && stage.isClosed === false) return false;
  return true;
}

export const createPipelineStageSchema = z
  .strictObject(stageFields)
  .refine(validStageFlags, {
    message: "Etapas ganhas, perdidas ou de bloqueio devem ser fechadas e não podem conflitar.",
  });

export const updatePipelineStageSchema = z
  .strictObject({
    name: stageFields.name.optional(),
    color: stageFields.color.optional(),
    position: stageFields.position,
    isActive: z.boolean().optional(),
    isClosed: z.boolean().optional(),
    isWon: z.boolean().optional(),
    isLost: z.boolean().optional(),
    requiresMeetingAt: z.boolean().optional(),
    requiresProposalAt: z.boolean().optional(),
    requiresLossReason: z.boolean().optional(),
    blocksContact: z.boolean().optional(),
    rules: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Informe ao menos uma alteração.");

export const createLossReasonSchema = z.strictObject({
  name: z.string().trim().min(2, "Informe o motivo.").max(120),
  description: optionalText(2_000),
  position: z.coerce.number().int().min(1).max(1_000).optional(),
  isActive: z.boolean().default(true),
});

export const updateLossReasonSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(120).optional(),
    description: optionalText(2_000),
    position: z.coerce.number().int().min(1).max(1_000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Informe ao menos uma alteração.");

export const createTagSchema = z.strictObject({
  name: z.string().trim().min(2, "Informe o nome da etiqueta.").max(80),
  color: colorSchema,
  isActive: z.boolean().default(true),
});

export const updateTagSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(80).optional(),
    color: colorSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "Informe ao menos uma alteração.");

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nullable(value: string | null | undefined): string | null | undefined {
  return value === undefined ? undefined : value?.trim() || null;
}

function requireTeamManagement(context: AuthContext): void {
  if (!hasPermission(context, "TEAM_MANAGE")) throw new AuthorizationError();
}

function requirePipelineManagement(context: AuthContext): void {
  if (!hasPermission(context, "PIPELINE_MANAGE") && !hasPermission(context, "SETTINGS_MANAGE")) {
    throw new AuthorizationError();
  }
}

function requireTeamDashboard(context: AuthContext): void {
  if (!hasPermission(context, "DASHBOARD_TEAM")) throw new AuthorizationError();
}

function assertCanManageRole(context: AuthContext, targetRole: UserRole, requestedRole?: UserRole): void {
  if (context.user.role === UserRole.ADMIN) return;
  if (targetRole !== UserRole.COLLABORATOR || (requestedRole && requestedRole !== UserRole.COLLABORATOR)) {
    throw new AuthorizationError("Somente administradores podem gerenciar administradores ou gestores.");
  }
}

async function ensureAnotherActiveAdmin(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
): Promise<void> {
  const count = await tx.user.count({
    where: {
      organizationId,
      id: { not: userId },
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });
  if (count === 0) throw new DomainError("A organização precisa manter ao menos um administrador ativo.", 409);
}

function conflict(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new DomainError(message, 409);
  }
  throw error;
}

function stageKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56) || "etapa";
}

async function uniqueStageKey(tx: Prisma.TransactionClient, organizationId: string, name: string) {
  const base = stageKey(name);
  let candidate = base;
  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const exists = await tx.pipelineStage.count({ where: { organizationId, key: candidate } });
    if (!exists) return candidate;
    candidate = `${base.slice(0, 56)}-${suffix}`;
  }
  throw new DomainError("Não foi possível gerar uma chave única para a etapa.", 409);
}

async function reorderStages(
  tx: Prisma.TransactionClient,
  organizationId: string,
  movingId: string,
  requestedPosition?: number,
) {
  const stages = await tx.pipelineStage.findMany({
    where: { organizationId },
    select: { id: true, position: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const moving = stages.find((stage) => stage.id === movingId);
  if (!moving) throw new DomainError("Etapa não encontrada.", 404);
  const withoutMoving = stages.filter((stage) => stage.id !== movingId);
  const targetIndex = Math.min(Math.max((requestedPosition ?? moving.position) - 1, 0), withoutMoving.length);
  withoutMoving.splice(targetIndex, 0, moving);
  const temporaryBase = Math.max(...stages.map((stage) => stage.position), 0) + stages.length + 1_000;

  for (const [index, stage] of withoutMoving.entries()) {
    await tx.pipelineStage.update({ where: { id: stage.id }, data: { position: temporaryBase + index } });
  }
  for (const [index, stage] of withoutMoving.entries()) {
    await tx.pipelineStage.update({ where: { id: stage.id }, data: { position: index + 1 } });
  }
}

async function reorderLossReasons(
  tx: Prisma.TransactionClient,
  organizationId: string,
  movingId: string,
  requestedPosition?: number,
) {
  const reasons = await tx.lossReason.findMany({
    where: { organizationId },
    select: { id: true, position: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const moving = reasons.find((reason) => reason.id === movingId);
  if (!moving) throw new DomainError("Motivo de perda não encontrado.", 404);
  const ordered = reasons.filter((reason) => reason.id !== movingId);
  ordered.splice(
    Math.min(Math.max((requestedPosition ?? moving.position) - 1, 0), ordered.length),
    0,
    moving,
  );
  for (const [index, reason] of ordered.entries()) {
    await tx.lossReason.update({ where: { id: reason.id }, data: { position: index + 1 } });
  }
}

async function validateStageAgainstExistingLeads(
  tx: Prisma.TransactionClient,
  organizationId: string,
  stageId: string,
  stage: {
    requiresMeetingAt: boolean;
    requiresProposalAt: boolean;
    requiresLossReason: boolean;
    isWon: boolean;
    isLost: boolean;
    blocksContact: boolean;
  },
) {
  const OR: Prisma.LeadWhereInput[] = [];
  if (stage.requiresMeetingAt) OR.push({ meetingAt: null });
  if (stage.requiresProposalAt) OR.push({ proposalSentAt: null });
  if (stage.requiresLossReason) OR.push({ lossReasonId: null });
  if (stage.isWon) OR.push({ wonAt: null });
  if (stage.isLost) OR.push({ lostAt: null });
  if (stage.blocksContact) {
    OR.push({ doNotContactAt: null }, { doNotContactReason: null }, { doNotContactReason: "" });
  }
  if (!OR.length) return;
  const invalid = await tx.lead.count({ where: { organizationId, stageId, OR } });
  if (invalid > 0) {
    throw new DomainError(
      `Há ${invalid} lead(s) nesta etapa sem os dados que a nova regra exige. Corrija-os antes.`,
      409,
    );
  }
}

export async function getAdminConfiguration(context: AuthContext) {
  const canTeam = hasPermission(context, "TEAM_MANAGE");
  const canPipeline = hasPermission(context, "PIPELINE_MANAGE") || hasPermission(context, "SETTINGS_MANAGE");
  if (!canTeam && !canPipeline) throw new AuthorizationError();

  const organizationId = context.organization.id;
  const [users, goals, stages, lossReasons, tags] = await Promise.all([
    canTeam
      ? db.user.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            maxActiveLeads: true,
            lastLoginAt: true,
            createdAt: true,
            permissionGrants: { select: { permission: true, effect: true, expiresAt: true } },
            _count: { select: { assignedLeads: { where: { archivedAt: null, stage: { isClosed: false } } } } },
          },
          orderBy: [{ status: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    canTeam
      ? db.userGoal.findMany({
          where: { organizationId },
          include: { user: { select: { id: true, name: true } } },
          orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
          take: 200,
        })
      : Promise.resolve([]),
    canPipeline
      ? db.pipelineStage.findMany({ where: { organizationId }, orderBy: { position: "asc" } })
      : Promise.resolve([]),
    canPipeline
      ? db.lossReason.findMany({ where: { organizationId }, orderBy: [{ position: "asc" }, { name: "asc" }] })
      : Promise.resolve([]),
    canPipeline
      ? db.tag.findMany({
          where: { organizationId },
          include: { _count: { select: { leads: true } } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);
  return {
    organization: context.organization,
    capabilities: {
      canTeam,
      canPipeline,
      canManageRoles: context.user.role === UserRole.ADMIN,
    },
    users,
    goals,
    stages,
    lossReasons,
    tags,
  };
}

export async function listUsers(context: AuthContext) {
  requireTeamManagement(context);
  return db.user.findMany({
    where: { organizationId: context.organization.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      maxActiveLeads: true,
      lastLoginAt: true,
      lastSeenAt: true,
      createdAt: true,
      permissionGrants: { select: { permission: true, effect: true, expiresAt: true } },
      _count: { select: { assignedLeads: { where: { archivedAt: null, stage: { isClosed: false } } } } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
}

export async function createUser(context: AuthContext, raw: unknown) {
  requireTeamManagement(context);
  const input = createUserSchema.parse(raw);
  assertCanManageRole(context, UserRole.COLLABORATOR, input.role);
  const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          organizationId: context.organization.id,
          name: input.name,
          email: input.email,
          passwordHash,
          role: input.role,
          status: UserStatus.ACTIVE,
          phone: nullable(input.phone),
          maxActiveLeads: input.maxActiveLeads ?? null,
        },
        select: { id: true, name: true, email: true, role: true, status: true, maxActiveLeads: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorId: context.user.id,
          action: AuditAction.CREATE,
          entityType: "User",
          entityId: user.id,
          after: json({ name: user.name, email: user.email, role: user.role, status: user.status }),
        },
      });
      return user;
    });
  } catch (error) {
    conflict(error, "Já existe um usuário com este e-mail.");
  }
}

export async function updateUser(context: AuthContext, userId: string, raw: unknown) {
  requireTeamManagement(context);
  const id = uuidSchema.parse(userId);
  const input = updateUserSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.user.findFirst({
        where: { id, organizationId: context.organization.id },
        include: { permissionGrants: { select: { permission: true, effect: true } } },
      });
      if (!current) throw new DomainError("Colaborador não encontrado.", 404);
      assertCanManageRole(context, current.role, input.role);
      if ((input.role || input.permissions) && context.user.role !== UserRole.ADMIN) {
        throw new AuthorizationError("Somente administradores podem alterar papéis e permissões.");
      }
      if (id === context.user.id && input.role && input.role !== current.role) {
        throw new DomainError("Você não pode alterar o próprio papel administrativo.", 409);
      }
      if (current.role === UserRole.ADMIN && input.role && input.role !== UserRole.ADMIN) {
        await ensureAnotherActiveAdmin(tx, context.organization.id, id);
      }

      const updated = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          phone: nullable(input.phone),
          maxActiveLeads: input.maxActiveLeads,
        },
        select: { id: true, name: true, email: true, phone: true, role: true, status: true, maxActiveLeads: true },
      });

      if (input.permissions) {
        await tx.userPermissionGrant.deleteMany({ where: { userId: id, organizationId: context.organization.id } });
        if (input.permissions.length) {
          await tx.userPermissionGrant.createMany({
            data: input.permissions.map((grant) => ({
              organizationId: context.organization.id,
              userId: id,
              permission: grant.permission,
              effect: grant.effect,
              grantedById: context.user.id,
              note: "Configuração administrativa",
            })),
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorId: context.user.id,
          action: input.permissions ? AuditAction.PERMISSION_CHANGE : AuditAction.UPDATE,
          entityType: "User",
          entityId: id,
          before: json({
            name: current.name,
            email: current.email,
            phone: current.phone,
            role: current.role,
            maxActiveLeads: current.maxActiveLeads,
            permissions: current.permissionGrants,
          }),
          after: json({ ...updated, permissions: input.permissions }),
        },
      });
      return updated;
    });
  } catch (error) {
    conflict(error, "Já existe um usuário com este e-mail.");
  }
}

export async function setUserStatus(context: AuthContext, userId: string, raw: unknown) {
  requireTeamManagement(context);
  const id = uuidSchema.parse(userId);
  const input = userStatusSchema.parse(raw);
  return db.$transaction(async (tx) => {
    const current = await tx.user.findFirst({ where: { id, organizationId: context.organization.id } });
    if (!current) throw new DomainError("Colaborador não encontrado.", 404);
    assertCanManageRole(context, current.role);
    if (id === context.user.id && input.status !== UserStatus.ACTIVE) {
      throw new DomainError("Você não pode desativar o próprio acesso.", 409);
    }
    if (current.role === UserRole.ADMIN && input.status !== UserStatus.ACTIVE) {
      await ensureAnotherActiveAdmin(tx, context.organization.id, id);
    }
    const updated = await tx.user.update({
      where: { id },
      data: {
        status: input.status,
        failedLoginAttempts: input.status === UserStatus.ACTIVE ? 0 : undefined,
        lockedUntil: input.status === UserStatus.ACTIVE ? null : undefined,
      },
      select: { id: true, name: true, email: true, role: true, status: true },
    });
    const now = new Date();
    const revoked =
      input.status === UserStatus.INACTIVE
        ? await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } })
        : { count: 0 };
    await tx.auditLog.create({
      data: {
        organizationId: context.organization.id,
        actorId: context.user.id,
        action: AuditAction.UPDATE,
        entityType: "User",
        entityId: id,
        before: json({ status: current.status }),
        after: json({ status: updated.status, sessionsRevoked: revoked.count }),
      },
    });
    return updated;
  });
}

export async function resetUserPassword(context: AuthContext, userId: string, raw: unknown) {
  requireTeamManagement(context);
  const id = uuidSchema.parse(userId);
  const input = adminResetPasswordSchema.parse(raw);
  if (id === context.user.id) {
    throw new DomainError("Use a troca de senha da própria conta para alterar sua senha.", 409);
  }
  const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
  return db.$transaction(async (tx) => {
    const current = await tx.user.findFirst({ where: { id, organizationId: context.organization.id } });
    if (!current) throw new DomainError("Colaborador não encontrado.", 404);
    assertCanManageRole(context, current.role);
    const now = new Date();
    await tx.user.update({
      where: { id },
      data: { passwordHash, passwordChangedAt: now, failedLoginAttempts: 0, lockedUntil: null },
    });
    const revoked = await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
    await tx.passwordResetToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: now } });
    await tx.auditLog.create({
      data: {
        organizationId: context.organization.id,
        actorId: context.user.id,
        action: AuditAction.PASSWORD_RESET,
        entityType: "User",
        entityId: id,
        after: json({ passwordReset: true, sessionsRevoked: revoked.count }),
      },
    });
    return { success: true, sessionsRevoked: revoked.count };
  });
}

export async function listGoals(context: AuthContext) {
  requireTeamManagement(context);
  return db.userGoal.findMany({
    where: { organizationId: context.organization.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
}

export async function createGoal(context: AuthContext, raw: unknown) {
  requireTeamManagement(context);
  const input = createGoalSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id: input.userId, organizationId: context.organization.id } });
      if (!user) throw new DomainError("Colaborador não encontrado.", 404);
      assertCanManageRole(context, user.role);
      const goal = await tx.userGoal.create({ data: { organizationId: context.organization.id, ...input } });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorId: context.user.id,
          action: AuditAction.CREATE,
          entityType: "UserGoal",
          entityId: goal.id,
          after: json(goal),
        },
      });
      return goal;
    });
  } catch (error) {
    conflict(error, "Já existe uma meta deste período com a mesma data inicial.");
  }
}

export async function updateGoal(context: AuthContext, goalId: string, raw: unknown) {
  requireTeamManagement(context);
  const id = uuidSchema.parse(goalId);
  const input = updateGoalSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.userGoal.findFirst({
        where: { id, organizationId: context.organization.id },
        include: { user: { select: { role: true } } },
      });
      if (!current) throw new DomainError("Meta não encontrada.", 404);
      assertCanManageRole(context, current.user.role);
      const startsAt = input.startsAt ?? current.startsAt;
      const endsAt = input.endsAt ?? current.endsAt;
      if (endsAt <= startsAt) throw new DomainError("O fim da meta deve ser posterior ao início.");
      const goal = await tx.userGoal.update({ where: { id }, data: input });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorId: context.user.id,
          action: AuditAction.UPDATE,
          entityType: "UserGoal",
          entityId: id,
          before: json(current),
          after: json(goal),
        },
      });
      return goal;
    });
  } catch (error) {
    conflict(error, "Já existe uma meta deste período com a mesma data inicial.");
  }
}

export async function listPipelineStages(context: AuthContext) {
  requirePipelineManagement(context);
  return db.pipelineStage.findMany({
    where: { organizationId: context.organization.id },
    orderBy: { position: "asc" },
  });
}

export async function createPipelineStage(context: AuthContext, raw: unknown) {
  requirePipelineManagement(context);
  const input = createPipelineStageSchema.parse(raw);
  if (JSON.stringify(input.rules).length > 10_000) throw new DomainError("As regras da etapa são muito extensas.");
  try {
    return await db.$transaction(
      async (tx) => {
        const maximum = await tx.pipelineStage.aggregate({
          where: { organizationId: context.organization.id },
          _max: { position: true },
        });
        if ((maximum._max.position ?? 0) >= 100) throw new DomainError("O funil atingiu o limite de 100 etapas.", 409);
        const key = await uniqueStageKey(tx, context.organization.id, input.name);
        const stage = await tx.pipelineStage.create({
          data: {
            organizationId: context.organization.id,
            key,
            name: input.name,
            color: input.color,
            position: (maximum._max.position ?? 0) + 1,
            isActive: input.isActive,
            isClosed: input.isWon || input.isLost || input.blocksContact ? true : input.isClosed,
            isWon: input.isWon,
            isLost: input.isLost,
            requiresMeetingAt: input.requiresMeetingAt,
            requiresProposalAt: input.requiresProposalAt,
            requiresLossReason: input.requiresLossReason,
            blocksContact: input.blocksContact,
            rules: json(input.rules),
          },
        });
        if (input.position) await reorderStages(tx, context.organization.id, stage.id, input.position);
        const created = await tx.pipelineStage.findUniqueOrThrow({ where: { id: stage.id } });
        await tx.auditLog.create({
          data: {
            organizationId: context.organization.id,
            actorId: context.user.id,
            action: AuditAction.CREATE,
            entityType: "PipelineStage",
            entityId: stage.id,
            after: json(created),
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    conflict(error, "Já existe uma etapa com este nome, chave ou posição.");
  }
}

export async function updatePipelineStage(context: AuthContext, stageId: string, raw: unknown) {
  requirePipelineManagement(context);
  const id = uuidSchema.parse(stageId);
  const input = updatePipelineStageSchema.parse(raw);
  if (input.rules && JSON.stringify(input.rules).length > 10_000) {
    throw new DomainError("As regras da etapa são muito extensas.");
  }
  try {
    return await db.$transaction(
      async (tx) => {
        const current = await tx.pipelineStage.findFirst({
          where: { id, organizationId: context.organization.id },
        });
        if (!current) throw new DomainError("Etapa não encontrada.", 404);
        const effective = {
          isActive: input.isActive ?? current.isActive,
          isClosed: input.isClosed ?? current.isClosed,
          isWon: input.isWon ?? current.isWon,
          isLost: input.isLost ?? current.isLost,
          requiresMeetingAt: input.requiresMeetingAt ?? current.requiresMeetingAt,
          requiresProposalAt: input.requiresProposalAt ?? current.requiresProposalAt,
          requiresLossReason: input.requiresLossReason ?? current.requiresLossReason,
          blocksContact: input.blocksContact ?? current.blocksContact,
        };
        if (effective.isWon || effective.isLost || effective.blocksContact) effective.isClosed = true;
        if (!validStageFlags(effective)) throw new DomainError("As regras de fechamento da etapa são incompatíveis.");
        if (current.key === "new" && !effective.isActive) {
          throw new DomainError("A etapa Novo precisa permanecer ativa para receber importações.", 409);
        }
        if (!effective.isActive && current.isActive) {
          const active = await tx.pipelineStage.count({ where: { organizationId: context.organization.id, isActive: true } });
          if (active <= 1) throw new DomainError("O funil precisa manter ao menos uma etapa ativa.", 409);
        }
        await validateStageAgainstExistingLeads(tx, context.organization.id, id, effective);
        await tx.pipelineStage.update({
          where: { id },
          data: {
            name: input.name,
            color: input.color,
            isActive: effective.isActive,
            isClosed: effective.isClosed,
            isWon: effective.isWon,
            isLost: effective.isLost,
            requiresMeetingAt: effective.requiresMeetingAt,
            requiresProposalAt: effective.requiresProposalAt,
            requiresLossReason: effective.requiresLossReason,
            blocksContact: effective.blocksContact,
            rules: input.rules ? json(input.rules) : undefined,
          },
        });
        if (input.position && input.position !== current.position) {
          await reorderStages(tx, context.organization.id, id, input.position);
        }
        const final = await tx.pipelineStage.findUniqueOrThrow({ where: { id } });
        await tx.auditLog.create({
          data: {
            organizationId: context.organization.id,
            actorId: context.user.id,
            action: AuditAction.UPDATE,
            entityType: "PipelineStage",
            entityId: id,
            before: json(current),
            after: json(final),
          },
        });
        return final;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    conflict(error, "Não foi possível salvar a etapa por conflito de nome ou posição.");
  }
}

export async function listLossReasons(context: AuthContext) {
  requirePipelineManagement(context);
  return db.lossReason.findMany({
    where: { organizationId: context.organization.id },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
}

export async function createLossReason(context: AuthContext, raw: unknown) {
  requirePipelineManagement(context);
  const input = createLossReasonSchema.parse(raw);
  try {
    return await db.$transaction(
      async (tx) => {
        const maximum = await tx.lossReason.aggregate({
          where: { organizationId: context.organization.id },
          _max: { position: true },
        });
        const reason = await tx.lossReason.create({
          data: {
            organizationId: context.organization.id,
            name: input.name,
            description: nullable(input.description),
            position: (maximum._max.position ?? 0) + 1,
            isActive: input.isActive,
          },
        });
        if (input.position) await reorderLossReasons(tx, context.organization.id, reason.id, input.position);
        const created = await tx.lossReason.findUniqueOrThrow({ where: { id: reason.id } });
        await tx.auditLog.create({
          data: {
            organizationId: context.organization.id,
            actorId: context.user.id,
            action: AuditAction.CREATE,
            entityType: "LossReason",
            entityId: reason.id,
            after: json(created),
          },
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    conflict(error, "Já existe um motivo de perda com este nome.");
  }
}

export async function updateLossReason(context: AuthContext, reasonId: string, raw: unknown) {
  requirePipelineManagement(context);
  const id = uuidSchema.parse(reasonId);
  const input = updateLossReasonSchema.parse(raw);
  try {
    return await db.$transaction(
      async (tx) => {
        const current = await tx.lossReason.findFirst({ where: { id, organizationId: context.organization.id } });
        if (!current) throw new DomainError("Motivo de perda não encontrado.", 404);
        await tx.lossReason.update({
          where: { id },
          data: { name: input.name, description: nullable(input.description), isActive: input.isActive },
        });
        if (input.position && input.position !== current.position) {
          await reorderLossReasons(tx, context.organization.id, id, input.position);
        }
        const final = await tx.lossReason.findUniqueOrThrow({ where: { id } });
        await tx.auditLog.create({
          data: {
            organizationId: context.organization.id,
            actorId: context.user.id,
            action: AuditAction.UPDATE,
            entityType: "LossReason",
            entityId: id,
            before: json(current),
            after: json(final),
          },
        });
        return final;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    conflict(error, "Já existe um motivo de perda com este nome.");
  }
}

export async function listTags(context: AuthContext) {
  requirePipelineManagement(context);
  return db.tag.findMany({
    where: { organizationId: context.organization.id },
    include: { _count: { select: { leads: true } } },
    orderBy: { name: "asc" },
  });
}

export async function createTag(context: AuthContext, raw: unknown) {
  requirePipelineManagement(context);
  const input = createTagSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const tag = await tx.tag.create({
        data: {
          organizationId: context.organization.id,
          name: input.name,
          color: input.color,
          isActive: input.isActive,
          isSystem: false,
          createdById: context.user.id,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorId: context.user.id,
          action: AuditAction.CREATE,
          entityType: "Tag",
          entityId: tag.id,
          after: json(tag),
        },
      });
      return tag;
    });
  } catch (error) {
    conflict(error, "Já existe uma etiqueta com este nome.");
  }
}

export async function updateTag(context: AuthContext, tagId: string, raw: unknown) {
  requirePipelineManagement(context);
  const id = uuidSchema.parse(tagId);
  const input = updateTagSchema.parse(raw);
  try {
    return await db.$transaction(async (tx) => {
      const current = await tx.tag.findFirst({ where: { id, organizationId: context.organization.id } });
      if (!current) throw new DomainError("Etiqueta não encontrada.", 404);
      if (current.isSystem && input.name && input.name !== current.name) {
        throw new DomainError("Etiquetas automáticas não podem ser renomeadas.", 409);
      }
      if (current.isSystem && input.isActive === false) {
        throw new DomainError("Etiquetas automáticas precisam permanecer ativas.", 409);
      }
      const tag = await tx.tag.update({
        where: { id },
        data: { name: input.name, color: input.color, isActive: input.isActive },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorId: context.user.id,
          action: AuditAction.UPDATE,
          entityType: "Tag",
          entityId: id,
          before: json(current),
          after: json(tag),
        },
      });
      return tag;
    });
  } catch (error) {
    conflict(error, "Já existe uma etiqueta com este nome.");
  }
}

export async function getCollaboratorReport(context: AuthContext, userId: string, days = 30) {
  requireTeamDashboard(context);
  const id = uuidSchema.parse(userId);
  const periodDays = [7, 30, 90, 180, 365].includes(days) ? days : 30;
  const end = new Date();
  const start = new Date(end.getTime() - (periodDays - 1) * 86_400_000);
  start.setHours(0, 0, 0, 0);
  const organizationId = context.organization.id;
  const user = await db.user.findFirst({
    where: { id, organizationId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      lastLoginAt: true,
      lastSeenAt: true,
      maxActiveLeads: true,
      createdAt: true,
      permissionGrants: { select: { permission: true, effect: true, expiresAt: true } },
      goals: {
        where: { isActive: true, endsAt: { gte: start }, startsAt: { lte: end } },
        orderBy: { startsAt: "desc" },
      },
    },
  });
  if (!user) throw new DomainError("Colaborador não encontrado.", 404);

  const leadScope: Prisma.LeadWhereInput = { organizationId, assigneeId: id, archivedAt: null };
  const activityScope: Prisma.ActivityWhereInput = { organizationId, authorId: id, occurredAt: { gte: start, lte: end } };
  const [
    portfolio,
    worked,
    attempts,
    contactedLeadIds,
    responseLeadIds,
    interested,
    meetings,
    proposals,
    wins,
    losses,
    overdue,
    activities,
    funnel,
    recentActivities,
  ] = await Promise.all([
    db.lead.count({ where: { ...leadScope, stage: { isClosed: false } } }),
    db.lead.count({ where: { ...leadScope, firstContactAt: { not: null } } }),
    db.activity.count({ where: { ...activityScope, type: "CONTACT_ATTEMPT" } }),
    db.activity.findMany({ where: { ...activityScope, type: "CONTACT_ATTEMPT" }, distinct: ["leadId"], select: { leadId: true } }),
    db.activity.findMany({ where: { ...activityScope, OR: [{ type: "CONTACT_RESPONSE" }, { direction: "INBOUND" }] }, distinct: ["leadId"], select: { leadId: true } }),
    db.lead.count({ where: { ...leadScope, stage: { key: "interested" }, lastActivityAt: { gte: start, lte: end } } }),
    db.lead.count({ where: { ...leadScope, meetingAt: { gte: start, lte: end } } }),
    db.lead.count({ where: { ...leadScope, proposalSentAt: { gte: start, lte: end } } }),
    db.lead.count({ where: { ...leadScope, wonAt: { gte: start, lte: end } } }),
    db.lead.count({ where: { ...leadScope, lostAt: { gte: start, lte: end } } }),
    db.task.count({ where: { organizationId, assigneeId: id, status: "OPEN", dueAt: { lt: end } } }),
    db.activity.findMany({
      where: activityScope,
      select: { occurredAt: true, type: true, direction: true },
      orderBy: { occurredAt: "asc" },
      take: 20_000,
    }),
    db.lead.groupBy({ by: ["stageId"], where: leadScope, _count: { _all: true } }),
    db.activity.findMany({
      where: activityScope,
      select: {
        id: true,
        type: true,
        channel: true,
        outcome: true,
        notes: true,
        occurredAt: true,
        lead: { select: { id: true, title: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 25,
    }),
  ]);
  const stageRows = await db.pipelineStage.findMany({
    where: { organizationId, id: { in: funnel.map((row) => row.stageId) } },
    select: { id: true, name: true, color: true, position: true },
  });
  const stageById = new Map(stageRows.map((stage) => [stage.id, stage]));
  const trend = new Map<string, { date: string; attempts: number; responses: number }>();
  for (let index = 0; index < periodDays; index += 1) {
    const date = new Date(start.getTime() + index * 86_400_000);
    const key = date.toISOString().slice(0, 10);
    trend.set(key, { date: key, attempts: 0, responses: 0 });
  }
  for (const activity of activities) {
    const point = trend.get(activity.occurredAt.toISOString().slice(0, 10));
    if (!point) continue;
    if (activity.type === "CONTACT_ATTEMPT") point.attempts += 1;
    if (activity.type === "CONTACT_RESPONSE" || activity.direction === "INBOUND") point.responses += 1;
  }
  const contactRate = portfolio + worked > 0 ? (contactedLeadIds.length / (portfolio + worked)) * 100 : 0;
  const responseRate = contactedLeadIds.length > 0 ? (responseLeadIds.length / contactedLeadIds.length) * 100 : 0;
  const conversionRate = worked > 0 ? (wins / worked) * 100 : 0;
  return {
    period: { days: periodDays, start, end },
    user,
    metrics: {
      portfolio,
      worked,
      attempts,
      contacted: contactedLeadIds.length,
      responses: responseLeadIds.length,
      interested,
      meetings,
      proposals,
      wins,
      losses,
      overdue,
      contactRate,
      responseRate,
      conversionRate,
    },
    trend: [...trend.values()],
    funnel: funnel
      .map((row) => ({ ...stageById.get(row.stageId), count: row._count._all }))
      .filter((row): row is { id: string; name: string; color: string; position: number; count: number } => Boolean(row.id))
      .sort((left, right) => left.position - right.position),
    recentActivities,
  };
}
