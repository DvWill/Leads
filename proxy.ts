import { NextResponse, type NextRequest } from "next/server";

import { validateCsrf } from "@/src/server/csrf";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-prospecta-session"
    : "prospecta-session";

const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/login",
  "/favicon.ico",
  "/robots.txt",
]);

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/public/")
  );
}

function unauthorized(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, error: "Autenticação necessária." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const loginUrl = new URL("/login", request.url);
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    loginUrl.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    const csrf = validateCsrf(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { ok: false, error: "Não foi possível validar a origem da solicitação." },
        {
          status: 403,
          headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
        },
      );
    }
  }

  if (
    !isPublicPath(request.nextUrl.pathname) &&
    !request.cookies.get(SESSION_COOKIE_NAME)?.value
  ) {
    return unauthorized(request);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
