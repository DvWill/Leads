import { NextResponse } from "next/server";
import { requirePermission } from "@/src/server/rbac";
import { apiError } from "@/src/server/http";
import { assertCsrf } from "@/src/server/csrf";
import { consumeRateLimit, getClientIp, rateLimitHeaders, rateLimitKey } from "@/src/server/rate-limit";
import { db } from "@/src/server/db";
import { googlePlacesJsonToCsv } from "@/src/lib/json/google-places";
import { CsvImportService, type DuplicateStrategy, type ImportAssignment } from "@/src/server/services/import-service";
import { PrismaImportRepository } from "@/src/server/repositories/prisma-import-repository";
import type { ColumnMapping } from "@/src/lib/csv";

export const runtime = "nodejs";
const ABSOLUTE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const CSV_MIME_TYPES = new Set(["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", "application/octet-stream", ""]);
const JSON_MIME_TYPES = new Set(["application/json", "text/json", "text/plain", "application/octet-stream", ""]);

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
    assertCsrf(request);
    const context = await requirePermission("IMPORT_MANAGE");
    const limit = await consumeRateLimit({
      scope: "csv-import",
      keyHash: rateLimitKey(`${context.organization.id}:${context.user.id}:${getClientIp(request)}`),
      organizationId: context.organization.id,
      limit: 12,
      windowMs: 10 * 60_000,
      blockDurationMs: 15 * 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ error: "Muitas importações em sequência. Aguarde alguns minutos." }, { status: 429, headers: rateLimitHeaders(limit) });
    }

    const organization = await db.organization.findUnique({
      where: { id: context.organization.id },
      select: { maxCsvUploadBytes: true },
    });
    const maxUploadBytes = Math.min(organization?.maxCsvUploadBytes ?? 10 * 1024 * 1024, ABSOLUTE_MAX_UPLOAD_BYTES);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Selecione um arquivo CSV ou JSON." }, { status: 400 });
    if (file.size <= 0) return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });
    if (file.size > maxUploadBytes) return NextResponse.json({ error: `O arquivo excede o limite de ${Math.floor(maxUploadBytes / 1024 / 1024)} MB.` }, { status: 413 });

    const isJson = /\.json$/i.test(file.name);
    const isCsv = /\.csv$/i.test(file.name);
    if (!isJson && !isCsv) return NextResponse.json({ error: "Use um arquivo com extensão .csv ou .json." }, { status: 415 });
    const mimeType = file.type.toLowerCase();
    if ((isJson && !JSON_MIME_TYPES.has(mimeType)) || (isCsv && !CSV_MIME_TYPES.has(mimeType))) {
      return NextResponse.json({ error: "O tipo do arquivo não corresponde à extensão informada." }, { status: 415 });
    }

    let upload: { fileName: string; mimeType: string; bytes: Uint8Array };
    if (isJson) {
      let json: unknown;
      try {
        json = JSON.parse(await file.text()) as unknown;
      } catch {
        return NextResponse.json({ error: "O JSON está malformado ou usa uma codificação inválida." }, { status: 422 });
      }
      const csv = googlePlacesJsonToCsv(json);
      upload = { fileName: `${file.name.replace(/\.json$/i, "")}.csv`, mimeType: "text/csv", bytes: new TextEncoder().encode(csv) };
    } else {
      upload = { fileName: file.name, mimeType: mimeType || "text/csv", bytes: new Uint8Array(await file.arrayBuffer()) };
    }
    const service = new CsvImportService(new PrismaImportRepository());
    const actor = { id: context.user.id, organizationId: context.organization.id, canImportLeads: true };

    if (form.get("action") === "preview") {
      return NextResponse.json(await service.preview({ actor, upload, mapping: mapping(form.get("mapping")), previewRows: 8, maxUploadBytes }));
    }
    return NextResponse.json(await service.execute({ actor, upload, mapping: mapping(form.get("mapping")), duplicateStrategy: strategy(form.get("duplicateStrategy")), assignment: assignment(form.get("assignment")), maxUploadBytes }), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
