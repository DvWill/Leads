import { stringifyCsvSafe } from "@/src/lib/csv";

const KNOWN_FIELDS = [
  "title", "description", "categoryName", "address", "neighborhood", "street", "city",
  "postalCode", "state", "countryCode", "phone", "phoneUnformatted", "totalScore",
  "reviewsCount", "permanentlyClosed", "temporarilyClosed", "placeId", "categories", "cid",
  "scrapedAt", "url", "imageUrl", "businessProfileId", "searchString", "location/lat", "location/lng",
] as const;

type JsonRecord = Record<string, unknown>;

function text(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function scalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return JSON.stringify(value);
}

function flattenRecord(record: JsonRecord): Record<string, unknown> {
  const location = record.location;
  const row: Record<string, unknown> = {};
  for (const field of KNOWN_FIELDS) {
    if (field === "location/lat" || field === "location/lng") continue;
    let value = record[field];
    if (field === "categories" && Array.isArray(value)) value = value.join(" | ");
    if ((field === "phone" || field === "phoneUnformatted") && typeof value === "string") {
      value = value.replace(/^\+/, "");
    }
    row[field] = scalar(value);
  }
  if (typeof location === "object" && location !== null && !Array.isArray(location)) {
    const coordinates = location as Record<string, unknown>;
    row["location/lat"] = typeof coordinates.lat === "number" ? coordinates.lat : text(coordinates.lat);
    row["location/lng"] = typeof coordinates.lng === "number" ? coordinates.lng : text(coordinates.lng);
  }

  for (const [key, value] of Object.entries(record)) {
    if (key === "location" || KNOWN_FIELDS.includes(key as (typeof KNOWN_FIELDS)[number])) continue;
    row[`json/${key}`] = text(value);
  }
  return row;
}

export function googlePlacesJsonToCsv(input: unknown): string {
  if (!Array.isArray(input)) throw new Error("O JSON deve conter uma lista de estabelecimentos.");
  if (input.length === 0) throw new Error("O arquivo JSON não contém estabelecimentos.");
  if (input.some((item) => typeof item !== "object" || item === null || Array.isArray(item))) {
    throw new Error("Cada item do JSON deve ser um objeto de estabelecimento.");
  }
  const rows = input.map((item) => flattenRecord(item as JsonRecord));
  if (rows.some((row) => !text(row.title))) throw new Error("Todos os estabelecimentos precisam ter o campo title.");
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return stringifyCsvSafe(rows, { columns, delimiter: ",", includeBom: true });
}
