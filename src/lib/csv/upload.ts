import { CsvFormatError } from "./detection";

export const DEFAULT_MAX_CSV_BYTES = 25 * 1024 * 1024;

const allowedMimeTypes = new Set([
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "text/plain",
]);

export interface CsvUploadDescriptor {
  fileName: string;
  mimeType?: string | null;
  byteLength: number;
}

export function sanitizeUploadFileName(fileName: string): string {
  const baseName = fileName.split(/[\\/]/).pop() ?? "importacao.csv";
  return baseName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255);
}

export function validateCsvUpload(
  upload: CsvUploadDescriptor,
  maxBytes = DEFAULT_MAX_CSV_BYTES,
): void {
  const safeName = sanitizeUploadFileName(upload.fileName);
  if (!safeName.toLocaleLowerCase("pt-BR").endsWith(".csv")) {
    throw new CsvFormatError(
      "invalid_extension",
      "Selecione um arquivo com extensão .csv.",
    );
  }
  if (upload.byteLength <= 0) {
    throw new CsvFormatError("empty_file", "O arquivo CSV está vazio.");
  }
  if (upload.byteLength > maxBytes) {
    throw new CsvFormatError(
      "file_too_large",
      `O arquivo excede o limite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
    );
  }

  const mime = upload.mimeType?.split(";", 1)[0]?.trim().toLocaleLowerCase("en-US");
  if (mime && !allowedMimeTypes.has(mime)) {
    throw new CsvFormatError(
      "invalid_mime_type",
      "O tipo do arquivo não corresponde a um CSV de texto.",
    );
  }
}
