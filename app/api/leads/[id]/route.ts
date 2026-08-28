import { NextResponse } from "next/server";
import { requireAuth } from "@/src/server/auth";
import { assertCsrf } from "@/src/server/csrf";
import { apiError } from "@/src/server/http";
import { archiveLead } from "@/src/server/services/lead-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertCsrf(request);
    const context = await requireAuth();
    const { id } = await params;
    const lead = await archiveLead(context, id);
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return apiError(error);
  }
}
