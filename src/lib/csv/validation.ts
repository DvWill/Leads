import { z } from "zod";

import { normalizeMappedRow } from "./normalization";
import type {
  ColumnMapping,
  NormalizedLeadInput,
  RowIssue,
  ValidatedRowResult,
} from "./types";

const nullableText = (max: number) => z.string().trim().min(1).max(max).nullable();
const nullableHttpUrl = z
  .string()
  .trim()
  .max(4_096)
  .url("Informe uma URL válida.")
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "A URL precisa usar http ou https.",
  })
  .nullable();

export const normalizedLeadSchema = z
  .object({
    title: z.string().trim().min(1, "O nome da empresa é obrigatório.").max(255),
    normalizedName: z.string().min(1).max(255),
    phoneOriginal: nullableText(80),
    phoneNormalized: z
      .string()
      .regex(/^\+[1-9]\d{7,14}$/, "O telefone não está em E.164.")
      .nullable(),
    categoryName: nullableText(160),
    categories: z.array(z.string().trim().min(1).max(160)).max(100),
    address: nullableText(2_000),
    normalizedAddress: nullableText(2_000),
    street: nullableText(255),
    neighborhood: nullableText(160),
    city: nullableText(160),
    state: nullableText(80),
    postalCode: nullableText(24),
    countryCode: z.string().regex(/^[A-Z]{2}$/).nullable(),
    googleMapsUrl: nullableHttpUrl,
    placeId: nullableText(255),
    cid: nullableText(80),
    businessProfileId: nullableText(255),
    totalScore: z.number().min(0).max(5).nullable(),
    reviewsCount: z.number().int().nonnegative().nullable(),
    searchString: nullableText(255),
    scrapedAt: z.date().nullable(),
    temporarilyClosed: z.boolean().nullable(),
    permanentlyClosed: z.boolean().nullable(),
    description: nullableText(20_000),
    imageUrl: nullableHttpUrl,
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    rawData: z.record(z.string(), z.string().nullable()),
    sourceData: z.record(z.string(), z.unknown()),
  })
  .strict();

function zodIssues(error: z.ZodError, rowNumber?: number): RowIssue[] {
  return error.issues.map((issue) => ({
    code: `validation_${issue.code}`,
    field: issue.path.length > 0 ? issue.path.join(".") : undefined,
    severity: "error" as const,
    rowNumber,
    message: issue.message,
  }));
}

export function validateNormalizedRow(
  input: NormalizedLeadInput,
  rowNumber?: number,
): ValidatedRowResult {
  const parsed = normalizedLeadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      value: null,
      issues: zodIssues(parsed.error, rowNumber),
    };
  }
  return { success: true, value: parsed.data, issues: [] };
}

export function normalizeAndValidateRow(
  rawRow: Readonly<Record<string, string | null>>,
  mapping: ColumnMapping,
  rowNumber?: number,
): ValidatedRowResult {
  const normalized = normalizeMappedRow(rawRow, mapping);
  const validation = validateNormalizedRow(normalized.value, rowNumber);
  const issues = [...normalized.issues, ...validation.issues].map((issue) => ({
    ...issue,
    rowNumber: issue.rowNumber ?? rowNumber,
  }));
  const hasErrors = issues.some((issue) => issue.severity === "error");

  return {
    success: validation.success && !hasErrors,
    value: validation.success && !hasErrors ? validation.value : null,
    issues,
  };
}
