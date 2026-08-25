import { NextResponse } from "next/server";
import { requireAuth } from "@/src/server/auth";
import { assertCsrf } from "@/src/server/csrf";
import { apiError } from "@/src/server/http";
import { registerActivity } from "@/src/server/services/lead-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const context = await requireAuth();
    const { id } = await params;
    const activity = await registerActivity(context, id, await request.json());
    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
