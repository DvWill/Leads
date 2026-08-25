import { createHash } from "node:crypto";

import { db } from "./db";

export interface RateLimitOptions {
  scope: string;
  keyHash: string;
  organizationId?: string | null;
  limit: number;
  windowMs: number;
  blockDurationMs?: number;
  now?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
}

const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const SCOPE_PATTERN = /^[a-z0-9:_-]{1,64}$/i;
const SERIALIZATION_RETRIES = 3;

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} deve ser um inteiro positivo.`);
  }
  return value;
}

function validateIdentity(scope: string, keyHash: string): void {
  if (!SCOPE_PATTERN.test(scope)) {
    throw new TypeError("Escopo de rate limit inválido.");
  }
  if (!SHA_256_PATTERN.test(keyHash)) {
    throw new TypeError("A chave do rate limit deve ser um hash SHA-256.");
  }
}

function retryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "P2002" || error.code === "P2034";
}

/**
 * PostgreSQL-backed fixed-window limiter. Serializable transactions and a
 * unique (scope, keyHash) constraint keep the counter consistent across app
 * instances. Errors fail closed at the calling route.
 */
export async function consumeRateLimit(
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const limit = positiveInteger(options.limit, "limit");
  const windowMs = positiveInteger(options.windowMs, "windowMs");
  const blockDurationMs = options.blockDurationMs
    ? positiveInteger(options.blockDurationMs, "blockDurationMs")
    : windowMs;
  validateIdentity(options.scope, options.keyHash);

  for (let attempt = 0; attempt < SERIALIZATION_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(
        async (transaction) => {
          const nowMs = options.now ?? Date.now();
          const now = new Date(nowMs);
          const existing = await transaction.rateLimitBucket.findUnique({
            where: {
              scope_keyHash: {
                scope: options.scope,
                keyHash: options.keyHash,
              },
            },
          });

          if (existing?.blockedUntil && existing.blockedUntil > now) {
            const retryAfterSeconds = Math.max(
              1,
              Math.ceil((existing.blockedUntil.getTime() - nowMs) / 1_000),
            );
            return {
              allowed: false,
              limit,
              remaining: 0,
              resetAt: existing.blockedUntil,
              retryAfterSeconds,
            };
          }

          const existingWindowEndsAt = existing
            ? existing.windowStartedAt.getTime() + windowMs
            : 0;
          const windowExpired = !existing || nowMs >= existingWindowEndsAt;
          const windowStartedAt = windowExpired
            ? now
            : existing.windowStartedAt;
          const count = windowExpired ? 1 : existing.count + 1;
          const windowEndsAt = new Date(windowStartedAt.getTime() + windowMs);
          const blockedUntil =
            count > limit
              ? new Date(Math.max(windowEndsAt.getTime(), nowMs + blockDurationMs))
              : null;
          const expiresAt = blockedUntil ?? windowEndsAt;

          await transaction.rateLimitBucket.upsert({
            where: {
              scope_keyHash: {
                scope: options.scope,
                keyHash: options.keyHash,
              },
            },
            create: {
              organizationId: options.organizationId ?? null,
              scope: options.scope,
              keyHash: options.keyHash,
              count,
              windowStartedAt,
              blockedUntil,
              expiresAt,
            },
            update: {
              // Do not allow a caller to move an existing bucket across tenants.
              count,
              windowStartedAt,
              blockedUntil,
              expiresAt,
            },
          });

          if (blockedUntil) {
            return {
              allowed: false,
              limit,
              remaining: 0,
              resetAt: blockedUntil,
              retryAfterSeconds: Math.max(
                1,
                Math.ceil((blockedUntil.getTime() - nowMs) / 1_000),
              ),
            };
          }

          return {
            allowed: true,
            limit,
            remaining: Math.max(0, limit - count),
            resetAt: windowEndsAt,
            retryAfterSeconds: 0,
          };
        },
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      if (attempt + 1 >= SERIALIZATION_RETRIES || !retryableTransactionError(error)) {
        throw error;
      }
    }
  }

  throw new Error("Não foi possível aplicar o limite de solicitações.");
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(Math.ceil(result.resetAt.getTime() / 1_000)),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

/** Hash identifiers so e-mails, IPs and tokens are never stored in clear text. */
export function rateLimitKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function getClientIp(request: Request): string {
  const trustProxy =
    process.env.TRUST_PROXY === "true" || process.env.VERCEL === "1";

  if (trustProxy) {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const direct =
      request.headers.get("cf-connecting-ip")?.trim() ??
      request.headers.get("x-real-ip")?.trim();
    return (forwarded || direct || "unknown").slice(0, 64);
  }

  // Next's web Request does not expose the socket address. Do not trust a
  // client-supplied forwarding header unless the deployment proxy is trusted.
  return "unknown";
}

export async function resetRateLimit(
  scope: string,
  keyHash: string,
): Promise<void> {
  validateIdentity(scope, keyHash);
  await db.rateLimitBucket.deleteMany({ where: { scope, keyHash } });
}

/** Remove expired buckets from a scheduled maintenance task. */
export async function pruneExpiredRateLimits(now = new Date()): Promise<number> {
  const deleted = await db.rateLimitBucket.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return deleted.count;
}
