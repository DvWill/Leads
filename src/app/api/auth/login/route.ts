import { NextResponse } from "next/server";

import { loginSchema } from "@/src/lib/validation/auth";
import {
  authenticateWithPassword,
  permissionArray,
  setSessionCookie,
} from "@/src/server/auth";
import { assertCsrf, CsrfError } from "@/src/server/csrf";
import { getClientIp } from "@/src/server/rate-limit";

export const runtime = "nodejs";

const MAX_LOGIN_BODY_BYTES = 8 * 1_024;

class RequestBodyTooLargeError extends Error {}

async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.body) throw new SyntaxError("Empty body");

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let received = 0;
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    received += chunk.value.byteLength;
    if (received > MAX_LOGIN_BODY_BYTES) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    text += decoder.decode(chunk.value, { stream: true });
  }

  text += decoder.decode();
  return JSON.parse(text) as unknown;
}

function responseHeaders(): Record<string, string> {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  };
}

function jsonError(
  message: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { ok: false, error: message },
    { status, headers: responseHeaders() },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertCsrf(request);
  } catch (error) {
    if (error instanceof CsrfError) return jsonError(error.message, error.status);
    throw error;
  }

  const ipAddress = getClientIp(request);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_LOGIN_BODY_BYTES) {
    return jsonError("Solicitação inválida.", 413);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return jsonError("Envie os dados em formato JSON.", 415);
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return jsonError("Solicitação inválida.", 413);
    }
    return jsonError("Solicitação inválida.", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("E-mail ou senha inválidos.", 400);
  }

  try {
    const authenticated = await authenticateWithPassword(
      parsed.data.email,
      parsed.data.password,
      {
        ipAddress,
        userAgent: request.headers.get("user-agent"),
      },
    );

    if (!authenticated) {
      return jsonError("E-mail ou senha inválidos.", 401);
    }

    await setSessionCookie(authenticated.token, authenticated.context.expiresAt);

    return NextResponse.json(
      {
        ok: true,
        user: authenticated.context.user,
        organization: authenticated.context.organization,
        permissions: permissionArray(authenticated.context),
      },
      { status: 200, headers: responseHeaders() },
    );
  } catch (error) {
    // Never log credentials or the submitted body.
    console.error("Falha interna ao autenticar.", {
      errorType: error instanceof Error ? error.name : "unknown",
    });
    return jsonError("Não foi possível entrar agora.", 500);
  }
}
