import { parse } from "csv-parse";

import { CsvFormatError, decodeUtf8Csv, detectCsvFormat } from "./detection";
import { inferCanonicalField } from "./mapping";
import type {
  ColumnMapping,
  CsvDelimiter,
  CsvInspection,
  CsvPreviewRow,
  ParsedCsvRow,
  RowIssue,
} from "./types";

export interface CsvParserOptions {
  delimiter?: CsvDelimiter;
  previewRows?: number;
  maxRecordBytes?: number;
  requireHeader?: boolean;
}

interface PreparedCsv {
  text: string;
  delimiter: CsvDelimiter;
  inspection: ReturnType<typeof detectCsvFormat>;
}

function prepareCsv(
  input: string | Uint8Array,
  delimiter?: CsvDelimiter,
): PreparedCsv {
  const decoded = decodeUtf8Csv(input);
  const inspection = detectCsvFormat(input);
  return {
    text: decoded.text,
    delimiter: delimiter ?? inspection.delimiter,
    inspection: delimiter
      ? { ...inspection, delimiter }
      : inspection,
  };
}

async function* parseRecords(
  text: string,
  delimiter: CsvDelimiter,
  maxRecordBytes: number,
): AsyncGenerator<string[]> {
  const parser = parse({
    bom: true,
    delimiter,
    encoding: "utf8",
    max_record_size: maxRecordBytes,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    skip_records_with_empty_values: true,
  });

  parser.end(text);

  try {
    for await (const record of parser) {
      if (!Array.isArray(record)) continue;
      yield record.map((value) => String(value));
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "erro desconhecido";
    throw new CsvFormatError(
      "malformed_csv",
      `Não foi possível ler o CSV: ${detail}`,
      { cause: cause instanceof Error ? cause : undefined },
    );
  }
}

function uniqueHeaders(originalHeaders: readonly string[]): {
  headers: string[];
  warnings: string[];
} {
  const seen = new Map<string, number>();
  const warnings: string[] = [];
  const headers = originalHeaders.map((rawHeader, index) => {
    const base = rawHeader.replace(/^\uFEFF/, "").trim() || `coluna_${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    if (count === 1) return base;
    warnings.push(`O cabeçalho "${base}" aparece mais de uma vez.`);
    return `${base}__${count}`;
  });

  return { headers, warnings };
}

function rowToObject(
  record: readonly string[],
  headers: readonly string[],
  rowNumber: number,
): ParsedCsvRow {
  const issues: RowIssue[] = [];
  if (record.length !== headers.length) {
    issues.push({
      code: "column_count_mismatch",
      severity: "error",
      rowNumber,
      message: `A linha tem ${record.length} coluna(s), mas o cabeçalho tem ${headers.length}.`,
    });
  }

  const values: Record<string, string | null> = Object.fromEntries(
    headers.map((header, index) => {
      const value = record[index];
      return [header, value === undefined || value.trim() === "" ? null : value];
    }),
  );
  for (let index = headers.length; index < record.length; index += 1) {
    const value = record[index];
    values[`__coluna_extra_${index - headers.length + 1}`] =
      value === undefined || value.trim() === "" ? null : value;
  }

  return { rowNumber, values, columnCount: record.length, issues };
}

export async function inspectCsv(
  input: string | Uint8Array,
  options: CsvParserOptions = {},
): Promise<CsvInspection> {
  const prepared = prepareCsv(input, options.delimiter);
  const previewLimit = Math.max(1, options.previewRows ?? 5);
  const maxRecordBytes = options.maxRecordBytes ?? 2 * 1024 * 1024;
  const iterator = parseRecords(
    prepared.text,
    prepared.delimiter,
    maxRecordBytes,
  )[Symbol.asyncIterator]();
  const firstResult = await iterator.next();
  if (firstResult.done || !firstResult.value) {
    throw new CsvFormatError("empty_file", "O arquivo CSV não possui registros.");
  }

  const firstRecord = firstResult.value;
  const hasHeader = prepared.inspection.hasHeader;
  const originalHeaders = hasHeader
    ? firstRecord.map((header) => header.replace(/^\uFEFF/, "").trim())
    : firstRecord.map((_, index) => `coluna_${index + 1}`);
  const { headers, warnings } = uniqueHeaders(originalHeaders);

  const suggestedMapping: ColumnMapping = Object.fromEntries(
    headers.map((header, index) => [
      header,
      inferCanonicalField(originalHeaders[index] ?? header),
    ]),
  );

  const preview: CsvPreviewRow[] = [];
  let totalRows = 0;

  if (!hasHeader) {
    totalRows += 1;
    preview.push(rowToObject(firstRecord, headers, 1));
    warnings.push("Não foi possível confirmar a presença de um cabeçalho.");
  }

  let logicalRow = hasHeader ? 1 : 1;
  while (true) {
    const result = await iterator.next();
    if (result.done) break;
    logicalRow += 1;
    totalRows += 1;
    if (preview.length < previewLimit) {
      preview.push(rowToObject(result.value, headers, logicalRow));
    }
  }

  return {
    ...prepared.inspection,
    delimiter: prepared.delimiter,
    hasHeader,
    headers,
    originalHeaders,
    totalRows,
    preview,
    suggestedMapping,
    warnings,
  };
}

/**
 * Parses through csv-parse's streaming iterator and keeps only one row in memory.
 * Upload bytes are intentionally decoded once so invalid UTF-8 is rejected before writes.
 */
export async function* iterateCsvRows(
  input: string | Uint8Array,
  options: CsvParserOptions = {},
): AsyncGenerator<ParsedCsvRow> {
  const prepared = prepareCsv(input, options.delimiter);
  const requireHeader = options.requireHeader ?? true;
  if (requireHeader && !prepared.inspection.hasHeader) {
    throw new CsvFormatError(
      "missing_header",
      "O CSV precisa ter uma linha de cabeçalho.",
    );
  }

  const iterator = parseRecords(
    prepared.text,
    prepared.delimiter,
    options.maxRecordBytes ?? 2 * 1024 * 1024,
  )[Symbol.asyncIterator]();
  const firstResult = await iterator.next();
  if (firstResult.done || !firstResult.value) return;

  const originalHeaders = prepared.inspection.hasHeader
    ? firstResult.value
    : firstResult.value.map((_, index) => `coluna_${index + 1}`);
  const { headers } = uniqueHeaders(originalHeaders);
  let logicalRow = 1;

  if (!prepared.inspection.hasHeader) {
    yield rowToObject(firstResult.value, headers, logicalRow);
  }

  while (true) {
    const result = await iterator.next();
    if (result.done) return;
    logicalRow += 1;
    yield rowToObject(result.value, headers, logicalRow);
  }
}
