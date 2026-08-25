import { NextResponse } from "next/server";
import { requirePermission } from "@/src/server/rbac";
import { apiError } from "@/src/server/http";
import { googlePlacesJsonToCsv } from "@/src/lib/json/google-places";
import { CsvImportService, type DuplicateStrategy, type ImportAssignment } from "@/src/server/services/import-service";
import { PrismaImportRepository } from "@/src/server/repositories/prisma-import-repository";
import type { ColumnMapping } from "@/src/lib/csv";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function jsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || !value) return undefined;
  return JSON.parse(value);
}
function mapping(value: FormDataEntryValue | null): ColumnMapping | undefined {
  const parsed = jsonField(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ColumnMapping : undefined;
}
function assignment(value: FormDataEntryValue | null): ImportAssignment {
  const parsed = jsonField(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as ImportAssignment : { mode: "unassigned" };
}
function strategy(value: FormDataEntryValue | null): DuplicateStrategy {
  return value === "fill-empty" || value === "refresh-source" ? value : "skip";
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const context = await requirePermission("IMPORT_MANAGE");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo JSON." }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "O arquivo excede o limite de 10 MB." }, { status: 413 });

    const json = JSON.parse(await file.text()) as unknown;
    const csv = googlePlacesJsonToCsv(json);
    const upload = { fileName: `${file.name.replace(/\.json$/i, "")}.csv`, mimeType: "text/csv", bytes: new TextEncoder().encode(csv) };
    const service = new CsvImportService(new PrismaImportRepository());
    const actor = { id: context.user.id, organizationId: context.organization.id, canImportLeads: true };

    if (form.get("action") === "preview") {
      return NextResponse.json(await service.preview({ actor, upload, mapping: mapping(form.get("mapping")), previewRows: 8, maxUploadBytes: MAX_UPLOAD_BYTES }));
    }
    return NextResponse.json(await service.execute({ actor, upload, mapping: mapping(form.get("mapping")), duplicateStrategy: strategy(form.get("duplicateStrategy")), assignment: assignment(form.get("assignment")), maxUploadBytes: MAX_UPLOAD_BYTES }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
