import {
  Permission as PrismaPermission,
  UserRole as PrismaUserRole,
} from "@prisma/client";

import type { AuthContext } from "./auth";

// Template-literal enum types accept ergonomic string literals at call sites,
// while the runtime list remains sourced from the generated Prisma enum.
export type Permission = `${PrismaPermission}`;
export type UserRoleName = `${PrismaUserRole}`;
export const PERMISSIONS: readonly Permission[] = Object.freeze(
  Object.values(PrismaPermission),
);

export interface PermissionGrantLike {
  permission: string;
  effect: "ALLOW" | "DENY" | string;
  expiresAt?: Date | null;
}

const ALL_PERMISSIONS = new Set<Permission>(PERMISSIONS);

const ROLE_PERMISSIONS: Record<UserRoleName, ReadonlySet<Permission>> = {
  [PrismaUserRole.ADMIN]: ALL_PERMISSIONS,
  [PrismaUserRole.MANAGER]: new Set<Permission>([
    "LEAD_VIEW_ALL",
    "LEAD_VIEW_PHONE",
    "LEAD_EDIT",
    "LEAD_EXPORT",
    "LEAD_ASSIGN",
    "ACTIVITY_CORRECT",
    "PIPELINE_MANAGE",
    "TEAM_MANAGE",
    "IMPORT_MANAGE",
    "DASHBOARD_TEAM",
    "AUDIT_VIEW",
  ]),
  [PrismaUserRole.COLLABORATOR]: new Set<Permission>([
    "LEAD_VIEW_PHONE",
    "LEAD_EDIT",
  ]),
};

function isPermission(value: string): value is Permission {
  return ALL_PERMISSIONS.has(value as Permission);
}

export function resolvePermissions(
  role: UserRoleName,
  grants: readonly PermissionGrantLike[] = [],
  now = new Date(),
): ReadonlySet<Permission> {
  // Administrators intentionally bypass per-user grants, including DENY.
  if (role === PrismaUserRole.ADMIN) return new Set(ALL_PERMISSIONS);

  const resolved = new Set(ROLE_PERMISSIONS[role] ?? []);
  for (const grant of grants) {
    if (!isPermission(grant.permission)) continue;
    if (grant.expiresAt && grant.expiresAt <= now) continue;

    if (grant.effect === "ALLOW") resolved.add(grant.permission);
    if (grant.effect === "DENY") resolved.delete(grant.permission);
  }

  return resolved;
}

export function hasPermission(
  context: Pick<AuthContext, "permissions">,
  permission: Permission,
): boolean {
  return context.permissions.has(permission);
}

export class AuthorizationError extends Error {
  readonly status = 403;
  readonly code = "FORBIDDEN";

  constructor(message = "Você não tem permissão para realizar esta ação.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function requirePermission(
  permission: Permission,
): Promise<AuthContext> {
  // Dynamic import avoids a runtime initialization cycle: auth resolves grants
  // with this module, while this convenience helper obtains the current session.
  const { requireAuth } = await import("./auth");
  const context = await requireAuth();
  if (!hasPermission(context, permission)) throw new AuthorizationError();
  return context;
}

export function assertOrganizationAccess(
  context: AuthContext,
  organizationId: string,
): void {
  if (context.organization.id !== organizationId) {
    throw new AuthorizationError();
  }
}

export interface LeadAccessSubject {
  organizationId: string;
  assigneeId: string | null;
}

export function canAccessLead(
  context: AuthContext,
  lead: LeadAccessSubject,
): boolean {
  if (lead.organizationId !== context.organization.id) return false;
  return (
    hasPermission(context, "LEAD_VIEW_ALL") ||
    lead.assigneeId === context.user.id
  );
}

export function assertLeadAccess(
  context: AuthContext,
  lead: LeadAccessSubject,
): void {
  if (!canAccessLead(context, lead)) throw new AuthorizationError();
}

/** Apply this predicate at query time; never fetch another tenant's row first. */
export function leadAccessWhere(context: AuthContext): {
  organizationId: string;
  assigneeId?: string;
} {
  return hasPermission(context, "LEAD_VIEW_ALL")
    ? { organizationId: context.organization.id }
    : {
        organizationId: context.organization.id,
        assigneeId: context.user.id,
      };
}

export function organizationWhere(context: AuthContext): {
  organizationId: string;
} {
  return { organizationId: context.organization.id };
}
