import { NextResponse } from "next/server";
import { requireAuth, type AuthContext } from "@/src/server/auth";
import { assertCsrf } from "@/src/server/csrf";
import { apiError } from "@/src/server/http";

export async function handleAdminMutation(
  request: Request,
  operation: (context: AuthContext, body: unknown) => Promise<unknown>,
  status = 200,
) {
  try {
    assertCsrf(request);
    const context = await requireAuth();
    const body = await request.json();
    const result = await operation(context, body);
    return NextResponse.json({ ok: true, result }, { status });
  } catch (error) {
    return apiError(error);
  }
}
