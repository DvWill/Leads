import { NextResponse } from "next/server";
import { requireAuth } from "@/src/server/auth";
import { assertCsrf } from "@/src/server/csrf";
import { apiError } from "@/src/server/http";
import { changeLeadStage } from "@/src/server/services/lead-service";
import { stageChangeInputSchema } from "@/src/domain/pipeline";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request);
    const context = await requireAuth();
    const { id } = await params;
    const input = stageChangeInputSchema.parse(await request.json());
    const lead = await changeLeadStage(context, id, input);
    return NextResponse.json({ lead });
  } catch (error) {
    return apiError(error);
  }
}
