import { compare, hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { newPasswordSchema, normalizeEmail } from "../lib/validation/auth";
import { db } from "./db";
import {
  resolvePermissions,
  type Permission,
  type PermissionGrantLike,
  type UserRoleName,
} from "./rbac";

export { hasPermission, requirePermission } from "./rbac";
export type { Permission } from "./rbac";

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BCRYPT_ROUNDS = 12;
const TOUCH_INTERVAL_MS = 5 * 60 * 1_000;

function boundedIntegerFromEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(process.env[name]);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

const SESSION_TTL_SECONDS = boundedIntegerFromEnv(
  "SESSION_TTL_SECONDS",
  12 * 60 * 60,
  15 * 60,
  30 * 24 * 60 * 60,
);
const MAX_FAILED_LOGINS = boundedIntegerFromEnv(
  "MAX_FAILED_LOGINS",
  6,
  3,
  50,
);
const LOGIN_LOCK_SECONDS = boundedIntegerFromEnv(
  "LOGIN_LOCK_SECONDS",
  15 * 60,
  60,
  24 * 60 * 60,
);

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-prospecta-session"
    : "prospecta-session";

// Computing one real bcrypt hash per process keeps unknown-user comparisons
// expensive and avoids embedding a reusable credential in source code.
const dummyPasswordHash = hash(
  randomBytes(32).toString("base64url"),
  BCRYPT_ROUNDS,
);

export interface AuthContext {
  sessionId: string;
  expiresAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRoleName;
  };
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
  permissions: ReadonlySet<Permission>;
}

export interface SessionMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PasswordAuthenticationResult {
  context: AuthContext;
  token: string;
}

export interface CurrentSessionOptions {
  touch?: boolean;
}

export class AuthenticationError extends Error {
  readonly status = 401;
  readonly code = "UNAUTHENTICATED";

  constructor(message = "Faça login para continuar.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

function sessionTokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function newSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
}

function cleanMetadata(metadata: SessionMetadata): Required<SessionMetadata> {
  return {
    ipAddress: metadata.ipAddress?.trim().slice(0, 64) || null,
    userAgent: metadata.userAgent?.trim().slice(0, 512) || null,
  };
}

function contextFromUser(
  session: { id: string; expiresAt: Date },
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRoleName;
    organization: { id: string; name: string; timezone: string };
    permissionGrants: PermissionGrantLike[];
  },
): AuthContext {
  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    organization: user.organization,
    permissions: resolvePermissions(user.role, user.permissionGrants),
  };
}

async function registerFailedLogin(userId: string): Promise<void> {
  const attempted = await db.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });

  if (attempted.failedLoginAttempts >= MAX_FAILED_LOGINS) {
    await db.user.update({
      where: { id: userId },
      data: {
        lockedUntil: new Date(Date.now() + LOGIN_LOCK_SECONDS * 1_000),
      },
    });
  }
}

export async function hashPassword(password: string): Promise<string> {
  return hash(newPasswordSchema.parse(password), BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await compare(password, passwordHash);
  } catch {
    return false;
  }
}

/**
 * Verifies a credential and creates a fresh opaque database session. All
 * account failures intentionally collapse to null to prevent enumeration.
 */
export async function authenticateWithPassword(
  email: string,
  password: string,
  metadata: SessionMetadata = {},
): Promise<PasswordAuthenticationResult | null> {
  const now = new Date();
  const clean = cleanMetadata(metadata);
  const user = await db.user.findUnique({
    where: { email: normalizeEmail(email) },
    select: {
      id: true,
      organizationId: true,
      name: true,
      email: true,
      passwordHash: true,
      role: true,
      status: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      organization: {
        select: { id: true, name: true, timezone: true, isActive: true },
      },
      permissionGrants: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { permission: true, effect: true, expiresAt: true },
      },
    },
  });

  const candidateHash = user?.passwordHash ?? (await dummyPasswordHash);
  const passwordMatches = await verifyPassword(password, candidateHash);
  const temporarilyLocked = Boolean(user?.lockedUntil && user.lockedUntil > now);
  const accountCanLogin = Boolean(
    user &&
      user.status === "ACTIVE" &&
      user.organization.isActive &&
      !temporarilyLocked,
  );

  if (!user || !passwordMatches || !accountCanLogin) {
    if (user && !passwordMatches && user.status === "ACTIVE" && !temporarilyLocked) {
      await registerFailedLogin(user.id);
    }
    if (user) {
      await db.auditLog.create({
        data: {
          organizationId: user.organizationId,
          actorId: user.id,
          action: "LOGIN_FAILED",
          entityType: "User",
          entityId: user.id,
          metadata: { outcome: "DENIED" },
          ipAddress: clean.ipAddress,
          userAgent: clean.userAgent,
          occurredAt: now,
        },
      });
    }
    return null;
  }

  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1_000);

  const session = await db.$transaction(async (transaction) => {
    await transaction.session.updateMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { lte: now } },
      data: { revokedAt: now },
    });
    await transaction.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        lastSeenAt: now,
      },
    });
    const createdSession = await transaction.session.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: sessionTokenHash(token),
        expiresAt,
        lastSeenAt: now,
        ipAddress: clean.ipAddress,
        userAgent: clean.userAgent,
      },
      select: { id: true, expiresAt: true },
    });
    await transaction.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.id,
        action: "LOGIN",
        entityType: "Session",
        entityId: createdSession.id,
        metadata: {},
        ipAddress: clean.ipAddress,
        userAgent: clean.userAgent,
        occurredAt: now,
      },
    });
    return createdSession;
  });

  return {
    token,
    context: contextFromUser(session, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      permissionGrants: user.permissionGrants,
    }),
  };
}

async function findSessionByToken(
  token: string,
  touch: boolean,
): Promise<AuthContext | null> {
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;

  const now = new Date();
  const session = await db.session.findUnique({
    where: { tokenHash: sessionTokenHash(token) },
    select: {
      id: true,
      organizationId: true,
      expiresAt: true,
      lastSeenAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          organizationId: true,
          name: true,
          email: true,
          role: true,
          status: true,
          organization: {
            select: { id: true, name: true, timezone: true, isActive: true },
          },
          permissionGrants: {
            where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            select: { permission: true, effect: true, expiresAt: true },
          },
        },
      },
    },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    session.organizationId !== session.user.organizationId ||
    session.user.status !== "ACTIVE" ||
    !session.user.organization.isActive
  ) {
    return null;
  }

  if (
    touch &&
    (!session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS)
  ) {
    await db.$transaction([
      db.session.updateMany({
        where: {
          id: session.id,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { lastSeenAt: now },
      }),
      db.user.update({
        where: { id: session.user.id },
        data: { lastSeenAt: now },
      }),
    ]);
  }

  return contextFromUser(session, session.user);
}

export async function getCurrentSession(
  options: CurrentSessionOptions = {},
): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return findSessionByToken(token, options.touch ?? true);
}

export async function requireAuth(): Promise<AuthContext> {
  const context = await getCurrentSession();
  if (!context) throw new AuthenticationError();
  return context;
}

export async function setSessionCookie(
  token: string,
  expiresAt: Date,
): Promise<void> {
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    throw new TypeError("Token de sessão inválido.");
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
    priority: "high",
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  try {
    if (token && SESSION_TOKEN_PATTERN.test(token)) {
      await db.session.updateMany({
        where: { tokenHash: sessionTokenHash(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } finally {
    // Clear the browser credential even when persistence is temporarily down.
    await clearSessionCookie();
  }
}

export function permissionArray(context: AuthContext): Permission[] {
  return [...context.permissions];
}
