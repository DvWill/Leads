import { NextResponse } from "next/server";

import { destroyCurrentSession } from "@/src/server/auth";
import { assertCsrf, CsrfError } from "@/src/server/csrf";
import {
  consumeRateLimit,
  getClientIp,
  rateLimitHeaders,
  rateLimitKey,
} from "@/src/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertCsrf(request);
  } catch (error) {
    if (error instanceof CsrfError) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }
    throw error;
  }

  let limit;
  try {
    limit = await consumeRateLimit({
      scope: "logout-ip",
      keyHash: rateLimitKey(getClientIp(request)),
      limit: 60,
      windowMs: 15 * 60 * 1_000,
    });
  } catch (error) {
    console.error("Falha ao aplicar limite de encerramento de sessão.", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "Serviço temporariamente indisponível." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Muitas solicitações. Tente novamente em instantes." },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
      },
    );
  }

  try {
    await destroyCurrentSession();
    if (request.headers.get("accept")?.includes("text/html")) {
      return NextResponse.redirect(new URL("/login", request.url), {
        status: 303,
        headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
      });
    }
    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store", ...rateLimitHeaders(limit) },
      },
    );
  } catch (error) {
    console.error("Falha interna ao encerrar sessão.", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      { ok: false, error: "Não foi possível encerrar a sessão." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
