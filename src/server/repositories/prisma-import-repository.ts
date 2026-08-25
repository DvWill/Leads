import {
  AssignmentReason,
  AuditAction,
  DuplicateStrategy as PrismaDuplicateStrategy,
  ImportAssignmentStrategy,
  ImportRowStatus as PrismaImportRowStatus,
  ImportStatus as PrismaImportStatus,
  Prisma,
  UserStatus,
  type PrismaClient,
} from "@prisma/client";

import { db } from "../db";
import type {
  AssignImportedLeadInput,
  AssignmentCandidate,
  CreatedLead,
  DuplicateStrategy,
  ExistingLeadSource,
  ImportAssignment,
  ImportJobCreateInput,
  ImportJobRowInput,
  ImportJobStatus,
  ImportJobUpdateInput,
  ImportRepository,
  ImportRepositoryTransaction,
  UpdateImportedLeadSourceInput,
  CreateImportedLeadInput,
} from "../services/import-service";
import type { DedupeKeys } from "../../lib/csv";

const sourceLeadSelect = {
  id: true,
  title: true,
  normalizedName: true,
  phoneOriginal: true,
  phoneNormalized: true,
  categoryName: true,
  categories: true,
  address: true,
  normalizedAddress: true,
  street: true,
  neighborhood: true,
  city: true,
  state: true,
  postalCode: true,
  countryCode: true,
  googleMapsUrl: true,
  placeId: true,
  cid: true,
  businessProfileId: true,
  totalScore: true,
  reviewsCount: true,
  searchString: true,
  scrapedAt: true,
  temporarilyClosed: true,
  permanentlyClosed: true,
  description: true,
  imageUrl: true,
  latitude: true,
  longitude: true,
  rawData: true,
} satisfies Prisma.LeadSelect;

type SourceLeadRecord = Prisma.LeadGetPayload<{ select: typeof sourceLeadSelect }>;

const jobStatusMap: Record<ImportJobStatus, PrismaImportStatus> = {
  PROCESSING: PrismaImportStatus.PROCESSING,
  COMPLETED: PrismaImportStatus.COMPLETED,
  COMPLETED_WITH_ERRORS: PrismaImportStatus.COMPLETED_WITH_ERRORS,
  FAILED: PrismaImportStatus.FAILED,
};

const rowStatusMap: Record<ImportJobRowInput["status"], PrismaImportRowStatus> = {
  CREATED: PrismaImportRowStatus.CREATED,
  UPDATED: PrismaImportRowStatus.UPDATED,
  DUPLICATE_SKIPPED: PrismaImportRowStatus.DUPLICATE_SKIPPED,
  INVALID: PrismaImportRowStatus.INVALID,
  FAILED: PrismaImportRowStatus.FAILED,
};

const duplicateStrategyMap: Record<DuplicateStrategy, PrismaDuplicateStrategy> = {
  skip: PrismaDuplicateStrategy.SKIP,
  "fill-empty": PrismaDuplicateStrategy.FILL_EMPTY,
  "refresh-source": PrismaDuplicateStrategy.UPDATE_SOURCE,
};

const automaticTagColors: Record<string, string> = {
  "Sem telefone": "#F59E0B",
  "Temporariamente fechada": "#F97316",
  "Permanentemente fechada": "#DC2626",
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function sourceSnapshot(lead: SourceLeadRecord): Record<string, unknown> {
  return {
    title: lead.title,
    normalizedName: lead.normalizedName,
    phoneOriginal: lead.phoneOriginal,
    phoneNormalized: lead.phoneNormalized,
    categoryName: lead.categoryName,
    categories: lead.categories,
    address: lead.address,
    normalizedAddress: lead.normalizedAddress,
    street: lead.street,
    neighborhood: lead.neighborhood,
    city: lead.city,
    state: lead.state,
    postalCode: lead.postalCode,
    countryCode: lead.countryCode,
    googleMapsUrl: lead.googleMapsUrl,
    placeId: lead.placeId,
    cid: lead.cid,
    businessProfileId: lead.businessProfileId,
    totalScore: lead.totalScore?.toNumber() ?? null,
    reviewsCount: lead.reviewsCount,
    searchString: lead.searchString,
    scrapedAt: lead.scrapedAt?.toISOString() ?? null,
    temporarilyClosed: lead.temporarilyClosed,
    permanentlyClosed: lead.permanentlyClosed,
    description: lead.description,
    imageUrl: lead.imageUrl,
    latitude: lead.latitude?.toNumber() ?? null,
    longitude: lead.longitude?.toNumber() ?? null,
    rawData: lead.rawData,
  };
}

function assignmentStrategy(assignment: ImportAssignment): ImportAssignmentStrategy {
  switch (assignment.mode) {
    case "specific":
      return ImportAssignmentStrategy.SINGLE_USER;
    case "round-robin":
      return ImportAssignmentStrategy.ROUND_ROBIN;
    default:
      return ImportAssignmentStrategy.UNASSIGNED;
  }
}

function hasOwn(
  value: object,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("Patch numérico inválido na importação.");
  return result;
}

function nullableDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error("Patch de data inválido na importação.");
  return date;
}

/** Runtime allowlist mirroring the source-only contract from CsvImportService. */
function toPrismaSourcePatch(
  patch: Readonly<Record<string, unknown>>,
): Prisma.LeadUpdateInput {
  const data: Prisma.LeadUpdateInput = {};
  if (hasOwn(patch, "title")) data.title = String(patch.title);
  if (hasOwn(patch, "normalizedName")) {
    data.normalizedName = String(patch.normalizedName);
  }
  if (hasOwn(patch, "phoneOriginal")) {
    data.phoneOriginal = nullableString(patch.phoneOriginal);
  }
  if (hasOwn(patch, "phoneNormalized")) {
    data.phoneNormalized = nullableString(patch.phoneNormalized);
  }
  if (hasOwn(patch, "categoryName")) {
    data.categoryName = nullableString(patch.categoryName);
  }
  if (hasOwn(patch, "categories")) {
    if (!Array.isArray(patch.categories)) throw new Error("Categorias inválidas.");
    data.categories = patch.categories.map(String);
  }
  if (hasOwn(patch, "address")) data.address = nullableString(patch.address);
  if (hasOwn(patch, "normalizedAddress")) {
    data.normalizedAddress = nullableString(patch.normalizedAddress);
  }
  if (hasOwn(patch, "street")) data.street = nullableString(patch.street);
  if (hasOwn(patch, "neighborhood")) {
    data.neighborhood = nullableString(patch.neighborhood);
  }
  if (hasOwn(patch, "city")) data.city = nullableString(patch.city);
  if (hasOwn(patch, "state")) data.state = nullableString(patch.state);
  if (hasOwn(patch, "postalCode")) {
    data.postalCode = nullableString(patch.postalCode);
  }
  if (hasOwn(patch, "countryCode")) {
    data.countryCode = nullableString(patch.countryCode);
  }
  if (hasOwn(patch, "googleMapsUrl")) {
    data.googleMapsUrl = nullableString(patch.googleMapsUrl);
  }
  if (hasOwn(patch, "placeId")) data.placeId = nullableString(patch.placeId);
  if (hasOwn(patch, "cid")) data.cid = nullableString(patch.cid);
  if (hasOwn(patch, "businessProfileId")) {
    data.businessProfileId = nullableString(patch.businessProfileId);
  }
  if (hasOwn(patch, "totalScore")) {
    data.totalScore = nullableNumber(patch.totalScore);
  }
  if (hasOwn(patch, "reviewsCount")) {
    data.reviewsCount = nullableNumber(patch.reviewsCount);
  }
  if (hasOwn(patch, "searchString")) {
    data.searchString = nullableString(patch.searchString);
  }
  if (hasOwn(patch, "scrapedAt")) data.scrapedAt = nullableDate(patch.scrapedAt);
  if (hasOwn(patch, "temporarilyClosed")) {
    if (typeof patch.temporarilyClosed !== "boolean") {
      throw new Error("Indicador de fechamento temporário inválido.");
    }
    data.temporarilyClosed = patch.temporarilyClosed;
  }
  if (hasOwn(patch, "permanentlyClosed")) {
    if (typeof patch.permanentlyClosed !== "boolean") {
      throw new Error("Indicador de fechamento permanente inválido.");
    }
    data.permanentlyClosed = patch.permanentlyClosed;
  }
  if (hasOwn(patch, "description")) {
    data.description = nullableString(patch.description);
  }
  if (hasOwn(patch, "imageUrl")) data.imageUrl = nullableString(patch.imageUrl);
  if (hasOwn(patch, "latitude")) data.latitude = nullableNumber(patch.latitude);
  if (hasOwn(patch, "longitude")) data.longitude = nullableNumber(patch.longitude);
  if (hasOwn(patch, "rawData")) data.rawData = json(patch.rawData);
  return data;
}

export class PrismaImportRepository implements ImportRepository {
  constructor(private readonly prisma: PrismaClient = db) {}

  async createImportJob(input: ImportJobCreateInput): Promise<{ id: string }> {
    const actor = await this.prisma.user.findFirst({
      where: {
        id: input.actorId,
        organizationId: input.organizationId,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!actor) throw new Error("Administrador da importação inválido.");

    return this.prisma.importJob.create({
      data: {
        organizationId: input.organizationId,
        createdById: input.actorId,
        filename: input.fileName,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSize,
        encoding: input.encoding,
        delimiter: input.delimiter,
        hasHeader: true,
        columnMapping: json(input.mapping),
        duplicateStrategy: duplicateStrategyMap[input.duplicateStrategy],
        assignmentStrategy: assignmentStrategy(input.assignment),
        assignmentConfig: json(input.assignment),
        status: PrismaImportStatus.PROCESSING,
        totalRows: input.totalRows,
        startedAt: new Date(),
      },
      select: { id: true },
    });
  }

  async updateImportJob(
    jobId: string,
    input: ImportJobUpdateInput,
  ): Promise<void> {
    const data: Prisma.ImportJobUpdateInput = {};
    if (input.status) data.status = jobStatusMap[input.status];
    if (input.summary) {
      data.processedRows = input.summary.processedRows;
      data.createdRows = input.summary.newLeads;
      data.updatedRows = input.summary.updatedLeads;
      data.skippedRows = input.summary.duplicatesIgnored;
      data.errorRows = input.summary.errorRows;
    }
    if (hasOwn(input, "failureMessage")) {
      data.failureMessage = input.failureMessage ?? null;
    }
    if (hasOwn(input, "finishedAt")) data.completedAt = input.finishedAt ?? null;
    await this.prisma.importJob.update({ where: { id: jobId }, data });
  }

  async listAssignmentCandidates(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<AssignmentCandidate[]> {
    if (userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: {
        organizationId,
        id: { in: [...userIds] },
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        maxActiveLeads: true,
        _count: {
          select: {
            assignedLeads: {
              where: { archivedAt: null, stage: { isClosed: false } },
            },
          },
        },
      },
    });
    return users.map((user) => ({
      id: user.id,
      activeLeadCount: user._count.assignedLeads,
      maxActiveLeads: user.maxActiveLeads,
    }));
  }

  async transaction<T>(
    operation: (transaction: ImportRepositoryTransaction) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      (transaction) => operation(new PrismaImportTransaction(transaction)),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10_000,
        timeout: 60_000,
      },
    );
  }
}

class PrismaImportTransaction implements ImportRepositoryTransaction {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async findDuplicate(
    organizationId: string,
    keys: DedupeKeys,
  ): Promise<ExistingLeadSource | null> {
    let lead: SourceLeadRecord | null = null;
    if (keys.placeId) {
      lead = await this.transaction.lead.findFirst({
        where: { organizationId, placeId: keys.placeId },
        select: sourceLeadSelect,
      });
    }
    if (!lead && keys.phoneNormalized) {
      lead = await this.transaction.lead.findFirst({
        where: { organizationId, phoneNormalized: keys.phoneNormalized },
        orderBy: { createdAt: "asc" },
        select: sourceLeadSelect,
      });
    }
    if (!lead && keys.nameAddress) {
      const separator = keys.nameAddress.indexOf("::");
      if (separator > 0) {
        const normalizedName = keys.nameAddress.slice(0, separator);
        const normalizedAddress = keys.nameAddress.slice(separator + 2);
        lead = await this.transaction.lead.findFirst({
          where: { organizationId, normalizedName, normalizedAddress },
          orderBy: { createdAt: "asc" },
          select: sourceLeadSelect,
        });
      }
    }
    return lead ? { id: lead.id, sourceData: sourceSnapshot(lead) } : null;
  }

  async createLead(input: CreateImportedLeadInput): Promise<CreatedLead> {
    const stage = await this.transaction.pipelineStage.findFirst({
      where: {
        organizationId: input.organizationId,
        key: "new",
        isActive: true,
      },
      select: { id: true },
    });
    if (!stage) throw new Error("A etapa inicial 'Novo' não está configurada.");

    const lead = input.lead;
    const created = await this.transaction.lead.create({
      data: {
        organizationId: input.organizationId,
        title: lead.title,
        normalizedName: lead.normalizedName,
        phoneOriginal: lead.phoneOriginal,
        phoneNormalized: lead.phoneNormalized,
        categoryName: lead.categoryName,
        categories: lead.categories,
        address: lead.address,
        normalizedAddress: lead.normalizedAddress,
        street: lead.street,
        neighborhood: lead.neighborhood,
        city: lead.city,
        state: lead.state,
        postalCode: lead.postalCode,
        countryCode: lead.countryCode,
        googleMapsUrl: lead.googleMapsUrl,
        placeId: lead.placeId,
        cid: lead.cid,
        businessProfileId: lead.businessProfileId,
        totalScore: lead.totalScore,
        reviewsCount: lead.reviewsCount,
        searchString: lead.searchString,
        scrapedAt: lead.scrapedAt,
        temporarilyClosed: lead.temporarilyClosed ?? false,
        permanentlyClosed: lead.permanentlyClosed ?? false,
        description: lead.description,
        imageUrl: lead.imageUrl,
        latitude: lead.latitude,
        longitude: lead.longitude,
        rawData: json(lead.rawData),
        stageId: stage.id,
        importJobId: input.importJobId,
        createdById: input.actorId,
      },
      select: { id: true },
    });

    await this.transaction.leadStageHistory.create({
      data: {
        organizationId: input.organizationId,
        leadId: created.id,
        fromStageId: null,
        toStageId: stage.id,
        changedById: input.actorId,
        reason: "Lead importado por CSV",
        metadata: json({ importJobId: input.importJobId }),
      },
    });

    for (const tagName of input.automaticTags) {
      const tag = await this.transaction.tag.upsert({
        where: {
          organizationId_name: {
            organizationId: input.organizationId,
            name: tagName,
          },
        },
        create: {
          organizationId: input.organizationId,
          name: tagName,
          color: automaticTagColors[tagName] ?? "#64748B",
          isSystem: true,
          createdById: input.actorId,
        },
        update: { isActive: true },
        select: { id: true },
      });
      await this.transaction.leadTag.upsert({
        where: { leadId_tagId: { leadId: created.id, tagId: tag.id } },
        create: {
          organizationId: input.organizationId,
          leadId: created.id,
          tagId: tag.id,
          createdById: input.actorId,
        },
        update: {},
      });
    }

    await this.transaction.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: AuditAction.IMPORT,
        entityType: "Lead",
        entityId: created.id,
        after: json({
          title: lead.title,
          placeId: lead.placeId,
          importJobId: input.importJobId,
          stageId: stage.id,
        }),
      },
    });
    return created;
  }

  async updateLeadSource(input: UpdateImportedLeadSourceInput): Promise<void> {
    const current = await this.transaction.lead.findFirst({
      where: { id: input.leadId, organizationId: input.organizationId },
      select: sourceLeadSelect,
    });
    if (!current) throw new Error("Lead duplicado não pertence à organização.");
    const data = toPrismaSourcePatch(input.patch);
    if (Object.keys(data).length === 0) return;
    const before = sourceSnapshot(current);
    const updated = await this.transaction.lead.update({
      where: { id: current.id },
      data,
      select: sourceLeadSelect,
    });

    await this.transaction.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: AuditAction.IMPORT,
        entityType: "Lead",
        entityId: current.id,
        before: json(
          Object.fromEntries(Object.keys(input.patch).map((key) => [key, before[key]])),
        ),
        after: json(
          Object.fromEntries(
            Object.keys(input.patch).map((key) => [key, sourceSnapshot(updated)[key]]),
          ),
        ),
        metadata: json({
          importJobId: input.importJobId,
          duplicateStrategy: input.strategy,
        }),
      },
    });
  }

  async assignLead(input: AssignImportedLeadInput): Promise<boolean> {
    const user = await this.transaction.user.findFirst({
      where: {
        id: input.assigneeId,
        organizationId: input.organizationId,
        status: UserStatus.ACTIVE,
      },
      select: { id: true, maxActiveLeads: true },
    });
    if (!user) return false;
    if (user.maxActiveLeads !== null) {
      const activeCount = await this.transaction.lead.count({
        where: {
          organizationId: input.organizationId,
          assigneeId: user.id,
          archivedAt: null,
          stage: { isClosed: false },
        },
      });
      if (activeCount >= user.maxActiveLeads) return false;
    }

    const lead = await this.transaction.lead.findFirst({
      where: { id: input.leadId, organizationId: input.organizationId },
      select: { id: true, assigneeId: true, stageId: true, stage: { select: { key: true } } },
    });
    if (!lead) throw new Error("Lead da atribuição não pertence à organização.");
    const assignedStage =
      lead.stage.key === "new"
        ? await this.transaction.pipelineStage.findFirst({
            where: {
              organizationId: input.organizationId,
              key: "assigned",
              isActive: true,
            },
            select: { id: true },
          })
        : null;
    if (lead.stage.key === "new" && !assignedStage) {
      throw new Error("A etapa 'Atribuído' não está configurada ou está inativa.");
    }

    await this.transaction.lead.update({
      where: { id: lead.id },
      data: {
        assigneeId: user.id,
        ...(assignedStage ? { stageId: assignedStage.id } : {}),
      },
    });
    await this.transaction.leadAssignment.create({
      data: {
        organizationId: input.organizationId,
        leadId: lead.id,
        previousAssigneeId: lead.assigneeId,
        assigneeId: user.id,
        assignedById: input.actorId,
        reason: AssignmentReason.IMPORT,
      },
    });
    if (assignedStage) {
      await this.transaction.leadStageHistory.create({
        data: {
          organizationId: input.organizationId,
          leadId: lead.id,
          fromStageId: lead.stageId,
          toStageId: assignedStage.id,
          changedById: input.actorId,
          reason: "Atribuição durante importação CSV",
          metadata: json({ assignmentReason: input.reason }),
        },
      });
    }
    await this.transaction.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: lead.assigneeId ? AuditAction.REASSIGN : AuditAction.ASSIGN,
        entityType: "Lead",
        entityId: lead.id,
        before: json({ assigneeId: lead.assigneeId, stageId: lead.stageId }),
        after: json({
          assigneeId: user.id,
          stageId: assignedStage?.id ?? lead.stageId,
          reason: input.reason,
        }),
      },
    });
    return true;
  }

  async createImportJobRows(rows: readonly ImportJobRowInput[]): Promise<void> {
    if (rows.length === 0) return;
    const jobIds = [...new Set(rows.map((row) => row.importJobId))];
    if (jobIds.length !== 1) throw new Error("Um lote não pode misturar importações.");
    const job = await this.transaction.importJob.findUnique({
      where: { id: jobIds[0] },
      select: { organizationId: true },
    });
    if (!job) throw new Error("Importação não encontrada ao registrar as linhas.");
    const processedAt = new Date();
    await this.transaction.importJobRow.createMany({
      data: rows.map((row) => ({
        organizationId: job.organizationId,
        importJobId: row.importJobId,
        rowNumber: row.rowNumber,
        status: rowStatusMap[row.status],
        rawData: json(row.rawData),
        errors: json(row.issues),
        leadId: row.leadId,
        duplicateLeadId: row.duplicateLeadId,
        processedAt,
      })),
    });
  }
}

export const prismaImportRepository = new PrismaImportRepository();
