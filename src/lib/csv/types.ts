export const CANONICAL_LEAD_FIELDS = [
  "title",
  "phone",
  "phoneUnformatted",
  "categoryName",
  "categories",
  "address",
  "street",
  "neighborhood",
  "city",
  "state",
  "postalCode",
  "countryCode",
  "url",
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
] as const;

export type CanonicalLeadField = (typeof CANONICAL_LEAD_FIELDS)[number];

/** A source header maps to one system field. `null` means preserve only in rawData. */
export type ColumnMapping = Readonly<
  Record<string, CanonicalLeadField | null | undefined>
>;

export type CsvEncoding = "utf-8" | "utf-8-bom";
export type CsvDelimiter = "," | ";";

export interface CsvFormatDetection {
  encoding: CsvEncoding;
  delimiter: CsvDelimiter;
  hasHeader: boolean;
  confidence: number;
}

export interface CsvPreviewRow {
  rowNumber: number;
  values: Record<string, string | null>;
  columnCount: number;
  issues: RowIssue[];
}

export interface CsvInspection extends CsvFormatDetection {
  headers: string[];
  originalHeaders: string[];
  totalRows: number;
  preview: CsvPreviewRow[];
  suggestedMapping: ColumnMapping;
  warnings: string[];
}

export interface ParsedCsvRow extends CsvPreviewRow {}

export type RowIssueSeverity = "error" | "warning";

export interface RowIssue {
  code: string;
  message: string;
  severity: RowIssueSeverity;
  field?: CanonicalLeadField | string;
  sourceHeader?: string;
  rowNumber?: number;
}

export interface NormalizedLeadInput {
  title: string;
  normalizedName: string;
  phoneOriginal: string | null;
  phoneNormalized: string | null;
  categoryName: string | null;
  categories: string[];
  address: string | null;
  normalizedAddress: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  googleMapsUrl: string | null;
  placeId: string | null;
  cid: string | null;
  businessProfileId: string | null;
  totalScore: number | null;
  reviewsCount: number | null;
  searchString: string | null;
  scrapedAt: Date | null;
  temporarilyClosed: boolean | null;
  permanentlyClosed: boolean | null;
  description: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Only source columns which the user did not map. Suitable for JSONB. */
  rawData: Record<string, string | null>;
  /** Normalized source-owned values. It intentionally has no CRM/commercial fields. */
  sourceData: Record<string, unknown>;
}

export interface NormalizedRowResult {
  value: NormalizedLeadInput;
  issues: RowIssue[];
}

export interface ValidatedRowResult {
  success: boolean;
  value: NormalizedLeadInput | null;
  issues: RowIssue[];
}

export interface DedupeKeys {
  placeId: string | null;
  phoneNormalized: string | null;
  nameAddress: string | null;
}

export interface CsvExportOptions {
  delimiter?: CsvDelimiter;
  includeBom?: boolean;
  columns?: string[];
  header?: boolean;
}
