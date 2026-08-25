import {
  buildDedupeKeys,
  inspectCsv,
  iterateCsvRows,
  normalizeAndValidateRow,
  sanitizeUploadFileName,
  stringifyCsvSafe,
  validateColumnMapping,
  validateCsvUpload,
  type ColumnMapping,
  type CsvInspection,
  type DedupeKeys,
  type NormalizedLeadInput,
  type RowIssue,
  type ValidatedRowResult,
} from "../../lib/csv";

export type DuplicateStrategy = "skip" | "fill-empty" | "refresh-source";
export type ImportJobStatus =
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED";
export type ImportRowStatus =
  | "CREATED"
  | "UPDATED"
  | "DUPLICATE_SKIPPED"
  | "INVALID"
  | "FAILED";

export interface ImportActor {
  id: string;
  organizationId: string;
  canImportLeads: boolean;
}

export interface CsvUpload {
  fileName: string;
  mimeType?: string | null;
  bytes: Uint8Array;
}

export type ImportAssignment =
  | { mode: "unassigned" }
  | {
      mode: "specific";
      userId: string;
      excludeWithoutPhone?: boolean;
      excludeClosed?: boolean;
    }
  | {
      mode: "round-robin";
      userIds: string[];
      excludeWithoutPhone?: boolean;
      excludeClosed?: boolean;
    };

export interface ImportPreviewRequest {
  actor: ImportActor;
  upload: CsvUpload;
  mapping?: ColumnMapping;
  previewRows?: number;
  maxUploadBytes?: number;
}

export interface PreviewValidationRow {
  rowNumber: number;
  values: Record<string, string | null>;
  validation: ValidatedRowResult;
}

export interface ImportPreviewResult {
  inspection: CsvInspection;
  mapping: ColumnMapping;
  mappingIssues: RowIssue[];
  rows: PreviewValidationRow[];
}

export interface ExecuteImportRequest {
  actor: ImportActor;
  upload: CsvUpload;
  mapping?: ColumnMapping;
  duplicateStrategy: DuplicateStrategy;
  assignment?: ImportAssignment;
  batchSize?: number;
  maxUploadBytes?: number;
  onProgress?: (progress: ImportProgress) => void | Promise<void>;
}

export interface ImportSummary {
  totalRows: number;
  processedRows: number;
  newLeads: number;
  updatedLeads: number;
  duplicatesIgnored: number;
  errorRows: number;
  assignedLeads: number;
  unassignedLeads: number;
}

export interface ImportProgress extends ImportSummary {
  jobId: string;
  percentage: number;
}

export interface ExecuteImportResult {
  jobId: string;
  status: Extract<ImportJobStatus, "COMPLETED" | "COMPLETED_WITH_ERRORS">;
  summary: ImportSummary;
}

export interface ImportJobCreateInput {
  organizationId: string;
  actorId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  encoding: CsvInspection["encoding"];
  delimiter: CsvInspection["delimiter"];
  totalRows: number;
  mapping: ColumnMapping;
  duplicateStrategy: DuplicateStrategy;
  assignment: ImportAssignment;
  status: "PROCESSING";
}

export interface ImportJobUpdateInput {
  status?: ImportJobStatus;
  summary?: ImportSummary;
  failureMessage?: string | null;
  finishedAt?: Date | null;
}

export interface ImportJobRowInput {
  importJobId: string;
  rowNumber: number;
  status: ImportRowStatus;
  leadId: string | null;
  duplicateLeadId: string | null;
  rawData: Record<string, string | null>;
  issues: RowIssue[];
}

export interface AssignmentCandidate {
  id: string;
  activeLeadCount: number;
  maxActiveLeads: number | null;
}

export interface ExistingLeadSource {
  id: string;
  /** Complete source-owned snapshot; never include stage, owner, notes or history. */
  sourceData: Record<string, unknown>;
}

export interface CreatedLead {
  id: string;
}

export interface CreateImportedLeadInput {
  organizationId: string;
  actorId: string;
  importJobId: string;
  lead: NormalizedLeadInput;
  automaticTags: string[];
}

export interface UpdateImportedLeadSourceInput {
  organizationId: string;
  actorId: string;
  importJobId: string;
  leadId: string;
  patch: Record<string, unknown>;
  strategy: Exclude<DuplicateStrategy, "skip">;
}

export interface AssignImportedLeadInput {
  organizationId: string;
  actorId: string;
  leadId: string;
  assigneeId: string;
  reason: "IMPORT";
}

export interface ImportRepositoryTransaction {
  /** Must resolve in placeId -> phone -> normalized name+address order. */
  findDuplicate(
    organizationId: string,
    keys: DedupeKeys,
  ): Promise<ExistingLeadSource | null>;
  /**
   * Must set the organization's `new` stage and atomically create its initial
   * stage-history/audit records. `lead.normalizedName`, `normalizedAddress` and
   * `googleMapsUrl` intentionally use the names from the Prisma Lead model.
   */
  createLead(input: CreateImportedLeadInput): Promise<CreatedLead>;
  /** Must write an audit entry containing old/new source values. */
  updateLeadSource(input: UpdateImportedLeadSourceInput): Promise<void>;
  /** Must update Lead.assigneeId and append LeadAssignment plus audit records. */
  /** Returns false when the user became unavailable or reached capacity. */
  assignLead(input: AssignImportedLeadInput): Promise<boolean>;
  createImportJobRows(rows: readonly ImportJobRowInput[]): Promise<void>;
}

export interface ImportRepository {
  createImportJob(input: ImportJobCreateInput): Promise<{ id: string }>;
  updateImportJob(jobId: string, input: ImportJobUpdateInput): Promise<void>;
  listAssignmentCandidates(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<AssignmentCandidate[]>;
  transaction<T>(
    operation: (transaction: ImportRepositoryTransaction) => Promise<T>,
  ): Promise<T>;
}

export class ImportServiceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImportServiceError";
    this.code = code;
    this.status = status;
  }
}

const SOURCE_OWNED_FIELDS = new Set([
  "title",
  "normalizedName",
  "phoneOriginal",
  "phoneNormalized",
  "categoryName",
  "categories",
  "address",
  "normalizedAddress",
  "street",
  "neighborhood",
  "city",
  "state",
  "postalCode",
  "countryCode",
  "googleMapsUrl",
  "placeId",
  "cid",
  "businessProfileId",
  "totalScore",
  "reviewsCount",
  "searchString",
  "scrapedAt",
  "temporarilyClosed",
  "permanentlyClosed",
  "description",
  "imageUrl",
  "latitude",
  "longitude",
  "rawData",
]);

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isEquivalent(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    (Array.isArray(left) && Array.isArray(right)) ||
    (typeof left === "object" &&
      left !== null &&
      typeof right === "object" &&
      right !== null)
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return false;
}

function mergeRawData(
  current: unknown,
  incoming: unknown,
  strategy: Exclude<DuplicateStrategy, "skip">,
): Record<string, unknown> | null {
  if (
    typeof incoming !== "object" ||
    incoming === null ||
    Array.isArray(incoming)
  ) {
    return null;
  }
  const currentRecord =
    typeof current === "object" && current !== null && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : {};
  const merged: Record<string, unknown> = { ...currentRecord };
  let changed = false;

  for (const [key, value] of Object.entries(incoming)) {
    if (
      strategy === "refresh-source" ||
      !(key in currentRecord) ||
      isEmpty(currentRecord[key])
    ) {
      if (!isEquivalent(currentRecord[key], value)) changed = true;
      merged[key] = value;
    }
  }
  return changed ? merged : null;
}

/** Creates a strict source-only patch, making commercial/history overwrite impossible. */
export function buildSourceUpdatePatch(
  existing: Readonly<Record<string, unknown>>,
  incoming: Readonly<Record<string, unknown>>,
  strategy: Exclude<DuplicateStrategy, "skip">,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const [field, incomingValue] of Object.entries(incoming)) {
    if (!SOURCE_OWNED_FIELDS.has(field)) continue;
    const currentValue = existing[field];
    if (field === "rawData") {
      const merged = mergeRawData(currentValue, incomingValue, strategy);
      if (merged) patch.rawData = merged;
      continue;
    }

    const mayWrite = strategy === "refresh-source" || isEmpty(currentValue);
    if (mayWrite && !isEquivalent(currentValue, incomingValue)) {
      patch[field] = incomingValue;
    }
  }
  return patch;
}

function automaticTags(lead: NormalizedLeadInput): string[] {
  const tags: string[] = [];
  if (!lead.phoneNormalized) tags.push("Sem telefone");
  if (lead.permanentlyClosed) tags.push("Permanentemente fechada");
  else if (lead.temporarilyClosed) tags.push("Temporariamente fechada");
  return tags;
}

function assignmentRequestedIds(assignment: ImportAssignment): string[] {
  if (assignment.mode === "unassigned") return [];
  return assignment.mode === "specific"
    ? [assignment.userId]
    : [...new Set(assignment.userIds)];
}

class AssignmentBalancer {
  private readonly candidates: Array<AssignmentCandidate & { order: number }>;

  constructor(
    private readonly assignment: ImportAssignment,
    candidates: readonly AssignmentCandidate[],
  ) {
    const requested = assignmentRequestedIds(assignment);
    const order = new Map(requested.map((id, index) => [id, index]));
    this.candidates = candidates.map((candidate) => ({
      ...candidate,
      order: order.get(candidate.id) ?? Number.MAX_SAFE_INTEGER,
    }));
  }

  next(lead: NormalizedLeadInput): string | null {
    if (this.assignment.mode === "unassigned") return null;
    const excludeWithoutPhone = this.assignment.excludeWithoutPhone ?? true;
    const excludeClosed = this.assignment.excludeClosed ?? true;
    if (excludeWithoutPhone && !lead.phoneNormalized) return null;
    if (
      excludeClosed &&
      (lead.temporarilyClosed === true || lead.permanentlyClosed === true)
    ) {
      return null;
    }

    const eligible = this.candidates.filter(
      (candidate) =>
        candidate.maxActiveLeads === null ||
        candidate.activeLeadCount < candidate.maxActiveLeads,
    );
    if (eligible.length === 0) return null;

    let selected: (AssignmentCandidate & { order: number }) | undefined;
    if (this.assignment.mode === "specific") {
      const userId = this.assignment.userId;
      selected = eligible.find((candidate) => candidate.id === userId);
    } else {
      selected = eligible.sort(
        (left, right) =>
          left.activeLeadCount - right.activeLeadCount ||
          left.order - right.order ||
          left.id.localeCompare(right.id),
      )[0];
    }
    if (!selected) return null;
    selected.activeLeadCount += 1;
    return selected.id;
  }
}

function assertAuthorized(actor: ImportActor): void {
  if (!actor.canImportLeads) {
    throw new ImportServiceError(
      "FORBIDDEN",
      "Você não tem permissão para importar leads.",
      403,
    );
  }
  if (!actor.id || !actor.organizationId) {
    throw new ImportServiceError(
      "INVALID_ACTOR",
      "A organização e o usuário são obrigatórios.",
      400,
    );
  }
}

function validateMappingOrThrow(mapping: ColumnMapping): RowIssue[] {
  const issues = validateColumnMapping(mapping);
  if (issues.some((issue) => issue.severity === "error")) {
    throw new ImportServiceError(
      "INVALID_MAPPING",
      issues.map((issue) => issue.message).join(" "),
    );
  }
  return issues;
}

async function prepareCandidates(
  repository: ImportRepository,
  actor: ImportActor,
  assignment: ImportAssignment,
): Promise<AssignmentCandidate[]> {
  const requestedIds = assignmentRequestedIds(assignment);
  if (assignment.mode === "round-robin" && requestedIds.length === 0) {
    throw new ImportServiceError(
      "NO_ASSIGNEES",
      "Selecione ao menos um colaborador para a distribuição.",
    );
  }
  if (requestedIds.length === 0) return [];

  const candidates = await repository.listAssignmentCandidates(
    actor.organizationId,
    requestedIds,
  );
  const returnedIds = new Set(candidates.map(({ id }) => id));
  const unavailable = requestedIds.filter((id) => !returnedIds.has(id));
  if (unavailable.length > 0) {
    throw new ImportServiceError(
      "ASSIGNEE_UNAVAILABLE",
      "Um ou mais colaboradores estão inativos, não pertencem à organização ou não podem receber leads.",
    );
  }
  return candidates;
}

interface PendingRow {
  rowNumber: number;
  rawData: Record<string, string | null>;
  validation: ValidatedRowResult;
  parserIssues: RowIssue[];
}

function emptySummary(totalRows: number): ImportSummary {
  return {
    totalRows,
    processedRows: 0,
    newLeads: 0,
    updatedLeads: 0,
    duplicatesIgnored: 0,
    errorRows: 0,
    assignedLeads: 0,
    unassignedLeads: 0,
  };
}

function progressFor(jobId: string, summary: ImportSummary): ImportProgress {
  return {
    jobId,
    ...summary,
    percentage:
      summary.totalRows === 0
        ? 100
        : Math.min(100, Math.round((summary.processedRows / summary.totalRows) * 100)),
  };
}

async function notifyProgress(
  callback: ExecuteImportRequest["onProgress"],
  progress: ImportProgress,
): Promise<void> {
  if (!callback) return;
  try {
    await callback(progress);
  } catch {
    // A disconnected UI must not roll back a valid server-side import.
  }
}

export class CsvImportService {
  constructor(private readonly repository: ImportRepository) {}

  async preview(request: ImportPreviewRequest): Promise<ImportPreviewResult> {
    assertAuthorized(request.actor);
    validateCsvUpload(
      {
        fileName: request.upload.fileName,
        mimeType: request.upload.mimeType,
        byteLength: request.upload.bytes.byteLength,
      },
      request.maxUploadBytes,
    );
    const inspection = await inspectCsv(request.upload.bytes, {
      previewRows: request.previewRows,
    });
    const mapping = request.mapping ?? inspection.suggestedMapping;
    const mappingIssues = validateColumnMapping(mapping);
    const rows = inspection.preview.map((row) => ({
      rowNumber: row.rowNumber,
      values: row.values,
      validation: normalizeAndValidateRow(row.values, mapping, row.rowNumber),
    }));

    return { inspection, mapping, mappingIssues, rows };
  }

  async execute(request: ExecuteImportRequest): Promise<ExecuteImportResult> {
    assertAuthorized(request.actor);
    validateCsvUpload(
      {
        fileName: request.upload.fileName,
        mimeType: request.upload.mimeType,
        byteLength: request.upload.bytes.byteLength,
      },
      request.maxUploadBytes,
    );
    const inspection = await inspectCsv(request.upload.bytes);
    if (!inspection.hasHeader) {
      throw new ImportServiceError(
        "MISSING_HEADER",
        "Confirme um arquivo CSV com cabeçalho antes de importar.",
      );
    }

    const mapping = request.mapping ?? inspection.suggestedMapping;
    validateMappingOrThrow(mapping);
    const assignment = request.assignment ?? { mode: "unassigned" };
    const candidates = await prepareCandidates(
      this.repository,
      request.actor,
      assignment,
    );
    const balancer = new AssignmentBalancer(assignment, candidates);
    const safeFileName = sanitizeUploadFileName(request.upload.fileName);
    const job = await this.repository.createImportJob({
      organizationId: request.actor.organizationId,
      actorId: request.actor.id,
      fileName: safeFileName,
      mimeType:
        request.upload.mimeType?.split(";", 1)[0]?.trim().slice(0, 120) ||
        "text/csv",
      fileSize: request.upload.bytes.byteLength,
      encoding: inspection.encoding,
      delimiter: inspection.delimiter,
      totalRows: inspection.totalRows,
      mapping,
      duplicateStrategy: request.duplicateStrategy,
      assignment,
      status: "PROCESSING",
    });
    const summary = emptySummary(inspection.totalRows);
    const batchSize = Math.min(1_000, Math.max(1, request.batchSize ?? 200));
    let batch: PendingRow[] = [];

    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      const currentBatch = batch;
      batch = [];
      const delta = emptySummary(summary.totalRows);

      await this.repository.transaction(async (transaction) => {
        const rowLogs: ImportJobRowInput[] = [];

        for (const row of currentBatch) {
          const issues = [...row.parserIssues, ...row.validation.issues];
          if (
            issues.some((issue) => issue.severity === "error") ||
            !row.validation.success ||
            !row.validation.value
          ) {
            delta.errorRows += 1;
            delta.processedRows += 1;
            rowLogs.push({
              importJobId: job.id,
              rowNumber: row.rowNumber,
              status: "INVALID",
              leadId: null,
              duplicateLeadId: null,
              rawData: row.rawData,
              issues,
            });
            continue;
          }

          const lead = row.validation.value;
          const duplicate = await transaction.findDuplicate(
            request.actor.organizationId,
            buildDedupeKeys(lead),
          );

          if (duplicate) {
            if (request.duplicateStrategy === "skip") {
              delta.duplicatesIgnored += 1;
              rowLogs.push({
                importJobId: job.id,
                rowNumber: row.rowNumber,
                status: "DUPLICATE_SKIPPED",
                leadId: null,
                duplicateLeadId: duplicate.id,
                rawData: row.rawData,
                issues,
              });
            } else {
              const patch = buildSourceUpdatePatch(
                duplicate.sourceData,
                lead.sourceData,
                request.duplicateStrategy,
              );
              if (Object.keys(patch).length > 0) {
                await transaction.updateLeadSource({
                  organizationId: request.actor.organizationId,
                  actorId: request.actor.id,
                  importJobId: job.id,
                  leadId: duplicate.id,
                  patch,
                  strategy: request.duplicateStrategy,
                });
                delta.updatedLeads += 1;
                rowLogs.push({
                  importJobId: job.id,
                  rowNumber: row.rowNumber,
                  status: "UPDATED",
                  leadId: duplicate.id,
                  duplicateLeadId: duplicate.id,
                  rawData: row.rawData,
                  issues,
                });
              } else {
                delta.duplicatesIgnored += 1;
                rowLogs.push({
                  importJobId: job.id,
                  rowNumber: row.rowNumber,
                  status: "DUPLICATE_SKIPPED",
                  leadId: null,
                  duplicateLeadId: duplicate.id,
                  rawData: row.rawData,
                  issues,
                });
              }
            }
          } else {
            const created = await transaction.createLead({
              organizationId: request.actor.organizationId,
              actorId: request.actor.id,
              importJobId: job.id,
              lead,
              automaticTags: automaticTags(lead),
            });
            delta.newLeads += 1;
            const assigneeId = balancer.next(lead);
            if (assigneeId) {
              const assigned = await transaction.assignLead({
                organizationId: request.actor.organizationId,
                actorId: request.actor.id,
                leadId: created.id,
                assigneeId,
                reason: "IMPORT",
              });
              if (assigned) delta.assignedLeads += 1;
              else delta.unassignedLeads += 1;
            } else {
              delta.unassignedLeads += 1;
            }
            rowLogs.push({
              importJobId: job.id,
              rowNumber: row.rowNumber,
              status: "CREATED",
              leadId: created.id,
              duplicateLeadId: null,
              rawData: row.rawData,
              issues,
            });
          }
          delta.processedRows += 1;
        }

        await transaction.createImportJobRows(rowLogs);
      });

      summary.processedRows += delta.processedRows;
      summary.newLeads += delta.newLeads;
      summary.updatedLeads += delta.updatedLeads;
      summary.duplicatesIgnored += delta.duplicatesIgnored;
      summary.errorRows += delta.errorRows;
      summary.assignedLeads += delta.assignedLeads;
      summary.unassignedLeads += delta.unassignedLeads;

      await this.repository.updateImportJob(job.id, { summary: { ...summary } });
      await notifyProgress(request.onProgress, progressFor(job.id, summary));
    };

    try {
      for await (const parsedRow of iterateCsvRows(request.upload.bytes, {
        delimiter: inspection.delimiter,
      })) {
        batch.push({
          rowNumber: parsedRow.rowNumber,
          rawData: parsedRow.values,
          validation: normalizeAndValidateRow(
            parsedRow.values,
            mapping,
            parsedRow.rowNumber,
          ),
          parserIssues: parsedRow.issues,
        });
        if (batch.length >= batchSize) await flush();
      }
      await flush();

      const status =
        summary.errorRows > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
      await this.repository.updateImportJob(job.id, {
        status,
        summary: { ...summary },
        finishedAt: new Date(),
      });
      await notifyProgress(request.onProgress, progressFor(job.id, summary));
      return { jobId: job.id, status, summary };
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message.slice(0, 1_000) : "Falha inesperada";
      try {
        await this.repository.updateImportJob(job.id, {
          status: "FAILED",
          summary: { ...summary },
          failureMessage: message,
          finishedAt: new Date(),
        });
      } catch {
        // Preserve the original import failure if the status write also fails.
      }
      throw new ImportServiceError(
        "IMPORT_FAILED",
        "A importação falhou. Os lotes já confirmados permanecem auditados.",
        500,
        { cause: cause instanceof Error ? cause : undefined },
      );
    }
  }
}

export interface ImportErrorReportRow {
  rowNumber: number;
  field?: string | null;
  code: string;
  message: string;
  sourceValue?: string | null;
}

export function buildImportErrorReportCsv(
  rows: readonly ImportErrorReportRow[],
): string {
  return stringifyCsvSafe(
    rows.map((row) => ({
      linha: row.rowNumber,
      campo: row.field ?? "",
      codigo: row.code,
      erro: row.message,
      valor_origem: row.sourceValue ?? "",
    })),
    {
      columns: ["linha", "campo", "codigo", "erro", "valor_origem"],
      delimiter: ";",
      includeBom: true,
    },
  );
}
