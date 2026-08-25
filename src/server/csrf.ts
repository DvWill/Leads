const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface CsrfValidationResult {
  valid: boolean;
  reason?: "cross-site" | "invalid-origin" | "missing-origin";
}

export class CsrfError extends Error {
  readonly status = 403;
  readonly code = "CSRF_VALIDATION_FAILED";

  constructor() {
    super("Não foi possível validar a origem da solicitação.");
    this.name = "CsrfError";
  }
}

function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();

  for (const configured of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!configured) continue;
    const origin = normalizedOrigin(configured);
    if (origin) origins.add(origin);
  }

  // In production APP_URL should always be configured. Falling back to the
  // request URL keeps local/test environments usable, but avoids trusting a
  // potentially spoofed Host header whenever an explicit origin is available.
  if (origins.size === 0) {
    const requestOrigin = normalizedOrigin(request.url);
    if (requestOrigin) origins.add(requestOrigin);
  }

  return origins;
}

/**
 * Cookie-authenticated mutations must come from the application origin. This
 * complements SameSite cookies and also protects endpoints invoked with fetch.
 */
export function validateCsrf(request: Request): CsrfValidationResult {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return { valid: true };

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return { valid: false, reason: "cross-site" };
  }

  const origins = allowedOrigins(request);
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    const origin = normalizedOrigin(originHeader);
    return origin && origins.has(origin)
      ? { valid: true }
      : { valid: false, reason: "invalid-origin" };
  }

  const referer = request.headers.get("referer");
  if (referer) {
    const origin = normalizedOrigin(referer);
    return origin && origins.has(origin)
      ? { valid: true }
      : { valid: false, reason: "invalid-origin" };
  }

  // Origin-less cookie mutations are rejected. Machine-to-machine adapters
  // should use a separate, token-authenticated route rather than this bypass.
  return { valid: false, reason: "missing-origin" };
}

export function assertCsrf(request: Request): void {
  if (!validateCsrf(request).valid) throw new CsrfError();
}
