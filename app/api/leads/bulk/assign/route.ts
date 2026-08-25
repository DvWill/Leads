import { NextResponse } from "next/server";
import { requireAuth } from "@/src/server/auth";
import { assertCsrf } from "@/src/server/csrf";
import { apiError } from "@/src/server/http";
import { assignLeads } from "@/src/server/services/lead-service";

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const context = await requireAuth();
    return NextResponse.json(await assignLeads(context, await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
