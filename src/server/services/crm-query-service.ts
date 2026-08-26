import { ActivityType, Prisma, TaskStatus, UserStatus } from "@prisma/client";
import { endOfDay, startOfDay, subDays } from "date-fns";
import { db } from "@/src/server/db";
import type { AuthContext } from "@/src/server/auth";
import { hasPermission, leadAccessWhere } from "@/src/server/rbac";
import { safeRate } from "@/src/domain/metrics";

function periodBounds(days: number) {
  const safeDays = [7, 30, 90, 180, 365].includes(days) ? days : 30;
  const end = endOfDay(new Date());
  const start = startOfDay(subDays(end, safeDays - 1));
  return { start, end, days: safeDays };
}

function leadScope(context: AuthContext, collaboratorId?: string | null): Prisma.LeadWhereInput {
  const access = leadAccessWhere(context);
  if (collaboratorId && hasPermission(context, "DASHBOARD_TEAM")) return { organizationId: context.organization.id, assigneeId: collaboratorId };
  return access;
}

export async function getDashboardData(context: AuthContext, options: { days?: number; collaboratorId?: string | null } = {}) {
  const { start, end, days } = periodBounds(options.days ?? 30);
  const scope = leadScope(context, options.collaboratorId);
  const activityScope: Prisma.ActivityWhereInput = { organizationId: context.organization.id, occurredAt: { gte: start, lte: end }, lead: scope };
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const now = new Date();

  const [
    imported,
    assigned,
    uncontacted,
    overdue,
    attempts,
    effectiveLeadIds,
    responseLeadIds,
    interested,
    meetings,
    proposals,
    wins,
    losses,
    workedLeadIds,
    stale,
    contactsToday,
    responsesToday,
    tasks,
    stageGroups,
    stages,
    firstContactRows,
    activitiesForTrend,
    currentGoal,
  ] = await Promise.all([
    db.lead.count({ where: { ...scope, createdAt: { gte: start, lte: end }, archivedAt: null } }),
    db.lead.count({ where: { ...scope, assigneeId: { not: null }, archivedAt: null } }),
    db.lead.count({ where: { ...scope, firstContactAt: null, archivedAt: null } }),
    db.lead.count({ where: { ...scope, nextFollowUpAt: { lt: now }, archivedAt: null, stage: { isClosed: false } } }),
    db.activity.count({ where: { ...activityScope, type: ActivityType.CONTACT_ATTEMPT } }),
    db.activity.findMany({ where: { ...activityScope, type: { in: [ActivityType.CONTACT_ATTEMPT, ActivityType.CONTACT_RESPONSE] } }, distinct: ["leadId"], select: { leadId: true } }),
    db.activity.findMany({ where: { ...activityScope, OR: [{ type: ActivityType.CONTACT_RESPONSE }, { direction: "INBOUND" }, { returnStatus: "YES" }] }, distinct: ["leadId"], select: { leadId: true } }),
    db.leadStageHistory.count({ where: { organizationId: context.organization.id, changedAt: { gte: start, lte: end }, toStage: { key: "interested" }, lead: scope } }),
    db.lead.count({ where: { ...scope, meetingAt: { gte: start, lte: end }, archivedAt: null } }),
    db.lead.count({ where: { ...scope, proposalSentAt: { gte: start, lte: end }, archivedAt: null } }),
    db.lead.count({ where: { ...scope, wonAt: { gte: start, lte: end }, archivedAt: null } }),
    db.lead.count({ where: { ...scope, lostAt: { gte: start, lte: end }, archivedAt: null } }),
    db.activity.findMany({ where: activityScope, distinct: ["leadId"], select: { leadId: true } }),
    db.lead.count({ where: { ...scope, archivedAt: null, OR: [{ lastActivityAt: { lt: subDays(now, 7) } }, { lastActivityAt: null, createdAt: { lt: subDays(now, 7) } }] } }),
    db.activity.count({ where: { organizationId: context.organization.id, occurredAt: { gte: todayStart, lte: todayEnd }, type: ActivityType.CONTACT_ATTEMPT, lead: scope } }),
    db.activity.count({ where: { organizationId: context.organization.id, occurredAt: { gte: todayStart, lte: todayEnd }, OR: [{ type: ActivityType.CONTACT_RESPONSE }, { direction: "INBOUND" }], lead: scope } }),
    db.task.findMany({ where: { organizationId: context.organization.id, status: TaskStatus.OPEN, assigneeId: scope.assigneeId as string | undefined }, include: { lead: { select: { id: true, title: true, phoneNormalized: hasPermission(context, "LEAD_VIEW_PHONE"), stage: { select: { name: true, color: true } } } } }, orderBy: [{ dueAt: "asc" }, { priority: "desc" }], take: 8 }),
    db.lead.groupBy({ by: ["stageId"], where: { ...scope, archivedAt: null }, _count: { _all: true } }),
    db.pipelineStage.findMany({ where: { organizationId: context.organization.id, isActive: true }, orderBy: { position: "asc" } }),
    db.lead.findMany({ where: { ...scope, createdAt: { gte: start, lte: end }, firstContactAt: { not: null } }, select: { createdAt: true, firstContactAt: true } }),
    db.activity.findMany({ where: activityScope, select: { occurredAt: true, type: true, direction: true, outcome: true }, orderBy: { occurredAt: "asc" } }),
    db.userGoal.findFirst({ where: { organizationId: context.organization.id, userId: scope.assigneeId as string | undefined, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } }, orderBy: { startsAt: "desc" } }),
  ]);

  const averageFirstContactHours = firstContactRows.length
    ? firstContactRows.reduce((sum, row) => sum + ((row.firstContactAt?.getTime() ?? row.createdAt.getTime()) - row.createdAt.getTime()) / 3_600_000, 0) / firstContactRows.length
    : 0;

  const trend = new Map<string, { date: string; attempts: number; responses: number }>();
  for (let offset = 0; offset < days; offset += 1) {
    const date = subDays(end, days - 1 - offset).toISOString().slice(0, 10);
    trend.set(date, { date, attempts: 0, responses: 0 });
  }
  for (const activity of activitiesForTrend) {
    const key = activity.occurredAt.toISOString().slice(0, 10);
    const bucket = trend.get(key);
    if (!bucket) continue;
    if (activity.type === ActivityType.CONTACT_ATTEMPT) bucket.attempts += 1;
    if (activity.type === ActivityType.CONTACT_RESPONSE || activity.direction === "INBOUND") bucket.responses += 1;
  }

  const countsByStage = new Map(stageGroups.map((item) => [item.stageId, item._count._all]));
  const funnel = stages.map((stage) => ({ id: stage.id, name: stage.name, color: stage.color, position: stage.position, count: countsByStage.get(stage.id) ?? 0 }));

  return {
    period: { start: start.toISOString(), end: end.toISOString(), days },
    volumes: { imported, assigned, uncontacted, overdue, attempts, effectiveContacts: effectiveLeadIds.length, responses: responseLeadIds.length, interested, meetings, proposals, wins, losses, worked: workedLeadIds.length, stale, contactsToday, responsesToday },
    rates: { contact: safeRate(effectiveLeadIds.length, assigned), response: safeRate(responseLeadIds.length, effectiveLeadIds.length), conversion: safeRate(wins, workedLeadIds.length) },
    timing: { averageFirstContactHours: Math.round(averageFirstContactHours * 10) / 10 },
    funnel,
    trend: Array.from(trend.values()),
    tasks,
    goal: currentGoal,
  };
}

export type LeadListFilters = {
  q?: string;
  stage?: string;
  tag?: string;
  city?: string;
  category?: string;
  priority?: string;
  returnStatus?: string;
  uncontacted?: boolean;
  overdue?: boolean;
  noActivityDays?: number;
  page?: number;
  pageSize?: number;
  view?: "table" | "kanban";
};

export async function listLeads(context: AuthContext, filters: LeadListFilters) {
  const pageSize = Math.min(Math.max(filters.pageSize ?? (filters.view === "kanban" ? 200 : 25), 1), 200);
  const page = Math.max(filters.page ?? 1, 1);
  const canViewPhone = hasPermission(context, "LEAD_VIEW_PHONE");
  const and: Prisma.LeadWhereInput[] = [{ ...leadAccessWhere(context), archivedAt: null }];
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    and.push({ OR: [
      { title: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { placeId: { contains: q, mode: "insensitive" } },
      ...(canViewPhone ? [{ phoneNormalized: { contains: q.replace(/\D/g, "") } } as Prisma.LeadWhereInput] : []),
    ] });
  }
  if (filters.stage) and.push({ stageId: filters.stage });
  if (filters.tag) and.push({ tags: { some: { tagId: filters.tag } } });
  if (filters.city) and.push({ city: filters.city });
  if (filters.category) and.push({ categoryName: filters.category });
  if (filters.priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(filters.priority)) and.push({ priority: filters.priority as Prisma.EnumLeadPriorityFilter });
  if (filters.returnStatus && ["YES", "NO", "WAITING"].includes(filters.returnStatus)) and.push({ returnStatus: filters.returnStatus as Prisma.EnumReturnStatusFilter });
  if (filters.uncontacted) and.push({ firstContactAt: null });
  if (filters.overdue) and.push({ nextFollowUpAt: { lt: new Date() }, stage: { isClosed: false } });
  if (filters.noActivityDays && filters.noActivityDays > 0) and.push({ OR: [{ lastActivityAt: { lt: subDays(new Date(), filters.noActivityDays) } }, { lastActivityAt: null, createdAt: { lt: subDays(new Date(), filters.noActivityDays) } }] });
  const where: Prisma.LeadWhereInput = { AND: and };

  const [items, total, stages, tags, cities, categories] = await Promise.all([
    db.lead.findMany({
      where,
      select: {
        id: true, title: true, phoneOriginal: canViewPhone, phoneNormalized: canViewPhone, address: true, city: true, state: true, searchString: true,
        categoryName: true, placeId: true, priority: true, temperature: true, returnStatus: true, totalScore: true, reviewsCount: true,
        temporarilyClosed: true, permanentlyClosed: true, firstContactAt: true, lastActivityAt: true, nextFollowUpAt: true,
        stage: { select: { id: true, key: true, name: true, color: true, position: true, blocksContact: true } },
        assignee: { select: { id: true, name: true } },
        tags: { select: { tag: { select: { id: true, name: true, color: true } } } },
      },
      orderBy: [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { createdAt: "desc" }],
      skip: filters.view === "kanban" ? 0 : (page - 1) * pageSize,
      take: pageSize,
    }),
    db.lead.count({ where }),
    db.pipelineStage.findMany({ where: { organizationId: context.organization.id, isActive: true }, orderBy: { position: "asc" } }),
    db.tag.findMany({ where: { organizationId: context.organization.id, isActive: true }, orderBy: { name: "asc" } }),
    db.lead.findMany({ where: { ...leadAccessWhere(context), archivedAt: null, city: { not: null } }, distinct: ["city"], select: { city: true }, orderBy: { city: "asc" } }),
    db.lead.findMany({ where: { ...leadAccessWhere(context), archivedAt: null, categoryName: { not: null } }, distinct: ["categoryName"], select: { categoryName: true }, orderBy: { categoryName: "asc" } }),
  ]);
  return { items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), stages, tags, cities: cities.map((item) => item.city).filter(Boolean), categories: categories.map((item) => item.categoryName).filter(Boolean), canViewPhone };
}

export async function getLeadDetail(context: AuthContext, id: string) {
  const canViewPhone = hasPermission(context, "LEAD_VIEW_PHONE");
  const lead = await db.lead.findFirst({
    where: { id, ...leadAccessWhere(context), archivedAt: null },
    select: {
      id: true, organizationId: true, title: true, description: true, phoneOriginal: canViewPhone, phoneNormalized: canViewPhone,
      categoryName: true, categories: true, address: true, street: true, neighborhood: true, city: true, state: true, postalCode: true, countryCode: true,
      googleMapsUrl: true, placeId: true, cid: true, businessProfileId: true, totalScore: true, reviewsCount: true, searchString: true, scrapedAt: true,
      temporarilyClosed: true, permanentlyClosed: true, imageUrl: true, latitude: true, longitude: true, priority: true, temperature: true, returnStatus: true,
      firstContactAt: true, lastContactAt: true, lastResponseAt: true, lastActivityAt: true, nextFollowUpAt: true, meetingAt: true, proposalSentAt: true,
      proposalValue: true, wonAt: true, wonValue: true, lostAt: true, doNotContactAt: true, doNotContactReason: true, legalBasis: true, legalBasisNote: true,
      createdAt: true, updatedAt: true, assigneeId: true,
      stage: true, assignee: { select: { id: true, name: true, email: true } }, lossReason: true,
      tags: { include: { tag: true } },
      activities: { include: { author: { select: { id: true, name: true } } }, orderBy: { occurredAt: "desc" }, take: 100 },
      stageHistory: { include: { fromStage: true, toStage: true, changedBy: { select: { id: true, name: true } } }, orderBy: { changedAt: "desc" }, take: 100 },
      assignments: { include: { previousAssignee: { select: { name: true } }, assignee: { select: { name: true } }, assignedBy: { select: { name: true } } }, orderBy: { assignedAt: "desc" }, take: 100 },
      tasks: { include: { assignee: { select: { id: true, name: true } } }, orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 100 },
    },
  });
  if (!lead) return null;
  const [stages, reasons, users] = await Promise.all([
    db.pipelineStage.findMany({ where: { organizationId: context.organization.id, isActive: true }, orderBy: { position: "asc" } }),
    db.lossReason.findMany({ where: { organizationId: context.organization.id, isActive: true }, orderBy: { position: "asc" } }),
    hasPermission(context, "LEAD_ASSIGN") ? db.user.findMany({ where: { organizationId: context.organization.id, status: UserStatus.ACTIVE }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  return { lead, stages, reasons, users, canViewPhone, canAssign: hasPermission(context, "LEAD_ASSIGN"), canOverrideDnc: hasPermission(context, "DO_NOT_CONTACT_OVERRIDE") };
}

export async function getTasks(context: AuthContext, filter: "all" | "today" | "overdue" | "upcoming" = "all") {
  const now = new Date();
  const dueAt = filter === "today" ? { gte: startOfDay(now), lte: endOfDay(now) } : filter === "overdue" ? { lt: now } : filter === "upcoming" ? { gt: endOfDay(now) } : undefined;
  return db.task.findMany({ where: { organizationId: context.organization.id, assigneeId: hasPermission(context, "LEAD_VIEW_ALL") ? undefined : context.user.id, status: TaskStatus.OPEN, dueAt }, include: { lead: { select: { id: true, title: true, stage: { select: { name: true, color: true } }, assignee: { select: { name: true } } } }, assignee: { select: { id: true, name: true } } }, orderBy: [{ dueAt: "asc" }, { priority: "desc" }], take: 200 });
}

export async function getTeamData(context: AuthContext, start = subDays(new Date(), 30)) {
  if (!hasPermission(context, "DASHBOARD_TEAM")) return [];
  const users = await db.user.findMany({ where: { organizationId: context.organization.id }, orderBy: [{ status: "asc" }, { name: "asc" }] });
  return Promise.all(users.map(async (user) => {
    const [portfolio, contactsToday, overdue, responses, contacted, meetings, wins] = await Promise.all([
      db.lead.count({ where: { organizationId: context.organization.id, assigneeId: user.id, archivedAt: null, stage: { isClosed: false } } }),
      db.activity.count({ where: { organizationId: context.organization.id, authorId: user.id, type: ActivityType.CONTACT_ATTEMPT, occurredAt: { gte: startOfDay(new Date()), lte: endOfDay(new Date()) } } }),
      db.task.count({ where: { organizationId: context.organization.id, assigneeId: user.id, status: TaskStatus.OPEN, dueAt: { lt: new Date() } } }),
      db.activity.findMany({ where: { organizationId: context.organization.id, authorId: user.id, occurredAt: { gte: start }, OR: [{ type: ActivityType.CONTACT_RESPONSE }, { direction: "INBOUND" }] }, distinct: ["leadId"], select: { leadId: true } }),
      db.activity.findMany({ where: { organizationId: context.organization.id, authorId: user.id, occurredAt: { gte: start }, type: ActivityType.CONTACT_ATTEMPT }, distinct: ["leadId"], select: { leadId: true } }),
      db.lead.count({ where: { organizationId: context.organization.id, assigneeId: user.id, meetingAt: { gte: start } } }),
      db.lead.count({ where: { organizationId: context.organization.id, assigneeId: user.id, wonAt: { gte: start } } }),
    ]);
    return { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, lastLoginAt: user.lastLoginAt, portfolio, contactsToday, overdue, responses: responses.length, contacted: contacted.length, responseRate: safeRate(responses.length, contacted.length), meetings, wins };
  }));
}

export async function getAuditData(context: AuthContext, page = 1) {
  if (!hasPermission(context, "AUDIT_VIEW")) return { items: [], total: 0, pages: 0 };
  const pageSize = 50;
  const where = { organizationId: context.organization.id };
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where, include: { actor: { select: { name: true, email: true } } }, orderBy: { occurredAt: "desc" }, skip: (Math.max(page, 1) - 1) * pageSize, take: pageSize }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, pages: Math.ceil(total / pageSize) };
}
