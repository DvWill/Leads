import { describe, expect, it } from "vitest";

import {
  CsvImportService,
  ImportServiceError,
  buildSourceUpdatePatch,
  type AssignmentCandidate,
  type ExistingLeadSource,
  type ImportJobCreateInput,
  type ImportJobRowInput,
  type ImportJobUpdateInput,
  type ImportRepository,
  type ImportRepositoryTransaction,
} from "../../src/server/services/import-service";
import { buildDedupeKeys, type DedupeKeys } from "../../src/lib/csv";

class MemoryRepository implements ImportRepository, ImportRepositoryTransaction {
  jobs: Array<ImportJobCreateInput & { id: string }> = [];
  updates: Array<{ id: string; input: ImportJobUpdateInput }> = [];
  rows: ImportJobRowInput[] = [];
  candidates: AssignmentCandidate[] = [];
  leads = new Map<string, ExistingLeadSource & { keys: DedupeKeys; tags: string[] }>();
  assignments: Array<{ leadId: string; assigneeId: string }> = [];
  sourceUpdates: Array<{ leadId: string; patch: Record<string, unknown> }> = [];

  async createImportJob(input: ImportJobCreateInput): Promise<{ id: string }> {
    const id = `job-${this.jobs.length + 1}`;
    this.jobs.push({ ...input, id });
    return { id };
  }

  async updateImportJob(id: string, input: ImportJobUpdateInput): Promise<void> {
    this.updates.push({ id, input });
  }

  async listAssignmentCandidates(
    _organizationId: string,
    userIds: readonly string[],
  ): Promise<AssignmentCandidate[]> {
    return this.candidates
      .filter(({ id }) => userIds.includes(id))
      .map((candidate) => ({ ...candidate }));
  }

  async transaction<T>(
    operation: (transaction: ImportRepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }

  async findDuplicate(
    _organizationId: string,
    keys: DedupeKeys,
  ): Promise<ExistingLeadSource | null> {
    const existing = [...this.leads.values()];
    return (
      (keys.placeId
        ? existing.find((lead) => lead.keys.placeId === keys.placeId)
        : undefined) ??
      (keys.phoneNormalized
        ? existing.find(
            (lead) => lead.keys.phoneNormalized === keys.phoneNormalized,
          )
        : undefined) ??
      (keys.nameAddress
        ? existing.find((lead) => lead.keys.nameAddress === keys.nameAddress)
        : undefined) ??
      null
    );
  }

  async createLead(
    input: Parameters<ImportRepositoryTransaction["createLead"]>[0],
  ): Promise<{ id: string }> {
    const id = `lead-${this.leads.size + 1}`;
    this.leads.set(id, {
      id,
      sourceData: { ...input.lead.sourceData },
      keys: buildDedupeKeys(input.lead),
      tags: [...input.automaticTags],
    });
    return { id };
  }

  async updateLeadSource(
    input: Parameters<ImportRepositoryTransaction["updateLeadSource"]>[0],
  ): Promise<void> {
    this.sourceUpdates.push({ leadId: input.leadId, patch: input.patch });
    const lead = this.leads.get(input.leadId);
    if (lead) lead.sourceData = { ...lead.sourceData, ...input.patch };
  }

  async assignLead(
    input: Parameters<ImportRepositoryTransaction["assignLead"]>[0],
  ): Promise<boolean> {
    this.assignments.push({ leadId: input.leadId, assigneeId: input.assigneeId });
    return true;
  }

  async createImportJobRows(rows: readonly ImportJobRowInput[]): Promise<void> {
    this.rows.push(...rows);
  }
}

const actor = {
  id: "admin-1",
  organizationId: "org-1",
  canImportLeads: true,
};

function upload(csv: string) {
  return {
    fileName: "google-maps.csv",
    mimeType: "text/csv",
    bytes: new TextEncoder().encode(csv),
  };
}

describe("CsvImportService", () => {
  it("bloqueia a operação no serviço quando falta permissão", async () => {
    const repository = new MemoryRepository();
    const service = new CsvImportService(repository);

    await expect(
      service.preview({
        actor: { ...actor, canImportLeads: false },
        upload: upload("title,phone\nACME,11999999999\n"),
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    } satisfies Partial<ImportServiceError>);
    expect(repository.jobs).toHaveLength(0);
  });

  it("importa em lotes, registra erro por linha, deduplica e respeita exclusões", async () => {
    const repository = new MemoryRepository();
    repository.candidates = [
      { id: "user-a", activeLeadCount: 2, maxActiveLeads: 10 },
      { id: "user-b", activeLeadCount: 0, maxActiveLeads: 10 },
    ];
    const service = new CsvImportService(repository);
    const csv = [
      "title;phone;placeId;address;temporarilyClosed;extra",
      "Empresa A;(11) 99999-0000;place-a;Rua A, 1;false;=FORMULA()",
      "Empresa B;;place-b;Rua B, 2;false;sem telefone",
      "Empresa A duplicada;(11) 98888-0000;place-a;Outra rua;false;duplicada",
      ";(11) 97777-0000;place-c;Rua C, 3;false;sem nome",
    ].join("\n");

    const result = await service.execute({
      actor,
      upload: upload(csv),
      duplicateStrategy: "skip",
      assignment: {
        mode: "round-robin",
        userIds: ["user-a", "user-b"],
      },
      batchSize: 2,
    });

    expect(result.status).toBe("COMPLETED_WITH_ERRORS");
    expect(result.summary).toEqual({
      totalRows: 4,
      processedRows: 4,
      newLeads: 2,
      updatedLeads: 0,
      duplicatesIgnored: 1,
      errorRows: 1,
      assignedLeads: 1,
      unassignedLeads: 1,
    });
    expect(repository.assignments).toEqual([
      { leadId: "lead-1", assigneeId: "user-b" },
    ]);
    expect(repository.leads.get("lead-2")?.tags).toContain("Sem telefone");
    expect(repository.rows.map(({ status }) => status)).toEqual([
      "CREATED",
      "CREATED",
      "DUPLICATE_SKIPPED",
      "INVALID",
    ]);
    expect(repository.updates.at(-1)?.input.status).toBe(
      "COMPLETED_WITH_ERRORS",
    );
  });

  it("não inclui campos comerciais em patches de reimportação", () => {
    const patch = buildSourceUpdatePatch(
      {
        phoneNormalized: null,
        city: "São Paulo",
        stageId: "stage-interessado",
        assigneeId: "user-a",
        notes: "não sobrescrever",
        rawData: { antigo: "x" },
      },
      {
        phoneNormalized: "+5511999990000",
        city: "Campinas",
        stageId: "stage-novo",
        assigneeId: "user-b",
        notes: "tentativa maliciosa",
        rawData: { novo: "y" },
      },
      "fill-empty",
    );

    expect(patch).toEqual({
      phoneNormalized: "+5511999990000",
      rawData: { antigo: "x", novo: "y" },
    });
    expect(patch).not.toHaveProperty("stageId");
    expect(patch).not.toHaveProperty("assigneeId");
    expect(patch).not.toHaveProperty("notes");
  });
});
