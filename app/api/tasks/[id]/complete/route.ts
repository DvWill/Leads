import { NextResponse } from "next/server";
import { requireAuth } from "@/src/server/auth";
import { assertCsrf } from "@/src/server/csrf";
import { apiError } from "@/src/server/http";
import { completeTask } from "@/src/server/services/lead-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const context = await requireAuth();
    const { id } = await params;
    const task = await completeTask(context, id);
    return NextResponse.json({ task });
  } catch (error) {
    return apiError(error);
  }
}
