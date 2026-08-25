import { stringify } from "csv-stringify/sync";

import type { CsvExportOptions } from "./types";

/**
 * Neutralizes spreadsheet formulas while retaining the visible source value.
 * It must run before csv-stringify so quoting cannot be mistaken for protection.
 */
export function escapeCsvFormula(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^[\t\r]|^\s*[=+\-@]/.test(value)) return `'${value}`;
  return value;
}

export function sanitizeCsvRecord<T extends Readonly<Record<string, unknown>>>(
  record: T,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, escapeCsvFormula(value)]),
  );
}

export function stringifyCsvSafe(
  records: readonly Readonly<Record<string, unknown>>[],
  options: CsvExportOptions = {},
): string {
  const columns = options.columns ?? (records[0] ? Object.keys(records[0]) : []);
  const csv = stringify(records.map(sanitizeCsvRecord), {
    columns,
    delimiter: options.delimiter ?? ",",
    header: options.header ?? true,
    record_delimiter: "windows",
  });
  return options.includeBom === false ? csv : `\uFEFF${csv}`;
}
