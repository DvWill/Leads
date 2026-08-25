import { inferCanonicalField } from "./mapping";
import type {
  CsvDelimiter,
  CsvEncoding,
  CsvFormatDetection,
} from "./types";

export class CsvFormatError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CsvFormatError";
    this.code = code;
  }
}

export interface DecodedCsv {
  text: string;
  encoding: CsvEncoding;
}

export function decodeUtf8Csv(input: string | Uint8Array): DecodedCsv {
  if (typeof input === "string") {
    const hasBom = input.charCodeAt(0) === 0xfeff;
    const text = hasBom ? input.slice(1) : input;
    assertSafeText(text);
    return { text, encoding: hasBom ? "utf-8-bom" : "utf-8" };
  }

  const hasBom =
    input.byteLength >= 3 &&
    input[0] === 0xef &&
    input[1] === 0xbb &&
    input[2] === 0xbf;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(
      hasBom ? input.subarray(3) : input,
    );
  } catch (cause) {
    throw new CsvFormatError(
      "unsupported_encoding",
      "O arquivo não é UTF-8 válido. Salve-o como UTF-8 ou UTF-8 com BOM.",
      { cause },
    );
  }

  assertSafeText(text);
  return { text, encoding: hasBom ? "utf-8-bom" : "utf-8" };
}

function assertSafeText(text: string): void {
  if (text.includes("\0")) {
    throw new CsvFormatError(
      "binary_content",
      "O arquivo contém bytes nulos e não parece ser um CSV de texto.",
    );
  }
  if (!text.trim()) {
    throw new CsvFormatError("empty_file", "O arquivo CSV está vazio.");
  }
}

interface DelimiterStats {
  delimiter: CsvDelimiter;
  rows: string[][];
  modalColumns: number;
  consistentRows: number;
  score: number;
}

/** Reads a bounded number of logical rows and respects RFC-4180 quoted fields. */
function sampleRows(
  text: string,
  delimiter: CsvDelimiter,
  maxRows = 25,
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length && rows.length < maxRows; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  if (rows.length < maxRows && (field.length > 0 || row.length > 0)) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) rows.push(row);
  }

  return rows;
}

function delimiterStats(text: string, delimiter: CsvDelimiter): DelimiterStats {
  const rows = sampleRows(text, delimiter);
  const frequencies = new Map<number, number>();
  for (const row of rows) {
    frequencies.set(row.length, (frequencies.get(row.length) ?? 0) + 1);
  }

  const [modalColumns = 1, consistentRows = 0] = [...frequencies.entries()].sort(
    (left, right) => right[1] - left[1] || right[0] - left[0],
  )[0] ?? [1, 0];
  const consistency = rows.length > 0 ? consistentRows / rows.length : 0;
  const score = modalColumns > 1 ? consistency * 100 + modalColumns : 0;

  return { delimiter, rows, modalColumns, consistentRows, score };
}

export function detectDelimiter(text: string): {
  delimiter: CsvDelimiter;
  confidence: number;
} {
  const candidates = [delimiterStats(text, ","), delimiterStats(text, ";")];
  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      right.consistentRows - left.consistentRows ||
      (left.delimiter === "," ? -1 : 1),
  );

  const winner = candidates[0];
  const runnerUp = candidates[1];
  if (!winner || winner.modalColumns <= 1) {
    throw new CsvFormatError(
      "delimiter_not_detected",
      "Não foi possível detectar vírgula ou ponto e vírgula como delimitador.",
    );
  }

  const relativeLead =
    winner.score === 0 ? 0 : Math.max(0, winner.score - (runnerUp?.score ?? 0)) / winner.score;
  const consistency =
    winner.rows.length === 0 ? 0 : winner.consistentRows / winner.rows.length;

  return {
    delimiter: winner.delimiter,
    confidence: Math.min(1, consistency * 0.75 + relativeLead * 0.25),
  };
}

function looksLikeData(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  return (
    /^[-+]?\d+(?:[.,]\d+)?$/.test(normalized) ||
    /^(?:true|false|sim|nao|não|yes|no)$/i.test(normalized) ||
    /^https?:\/\//i.test(normalized) ||
    /^\+?[\d\s().-]{8,}$/.test(normalized)
  );
}

export function detectHeader(rows: readonly string[][]): boolean {
  const first = rows[0];
  if (!first || first.length < 2) return false;

  const normalized = first.map((value) => value.trim().toLocaleLowerCase("pt-BR"));
  const unique = new Set(normalized.filter(Boolean));
  const mapped = first.filter((value) => inferCanonicalField(value) !== null).length;
  const dataLike = first.filter(looksLikeData).length;

  if (mapped > 0) return true;
  return (
    unique.size === first.length &&
    normalized.every(Boolean) &&
    dataLike / first.length < 0.35
  );
}

export function detectCsvFormat(input: string | Uint8Array): CsvFormatDetection {
  const { text, encoding } = decodeUtf8Csv(input);
  const { delimiter, confidence } = detectDelimiter(text);
  const rows = sampleRows(text, delimiter, 3);

  return {
    encoding,
    delimiter,
    confidence,
    hasHeader: detectHeader(rows),
  };
}
