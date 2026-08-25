import type {
  CanonicalLeadField,
  ColumnMapping,
  NormalizedLeadInput,
  NormalizedRowResult,
  RowIssue,
} from "./types";

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned === "" ? null : cleaned;
}

export function normalizeIdentityText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeBrazilianPhone(value: unknown): string | null {
  const original = cleanText(value);
  if (!original) return null;

  let digits = original.replace(/\D/g, "");
  const explicitlyInternational = /^\s*(?:\+|00)/.test(original);
  if (digits.startsWith("00")) digits = digits.slice(2);

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  // Brazilian carrier/trunk prefix, e.g. 011 99999-9999 or 021 11 99999-9999.
  if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) {
    digits = digits.slice(1);
  } else if (
    digits.startsWith("0") &&
    digits.length >= 13 &&
    digits.length <= 14
  ) {
    // Remove 0 + two-digit carrier code when present.
    digits = digits.slice(3);
  }

  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Preserve an already international, non-Brazilian E.164 number.
  if (explicitlyInternational && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export function parseLocalizedNumber(value: unknown): number | null {
  const text = cleanText(value)?.replace(/\s/g, "");
  if (!text) return null;
  if (!/^[+-]?[\d.,]+$/.test(text)) return null;

  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  let normalized = text;

  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = normalized.split(thousandsSeparator).join("");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (comma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseReviewCount(value: unknown): number | null {
  const text = cleanText(value);
  if (!text) return null;
  const sign = text.startsWith("-") ? -1 : 1;
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits) * sign;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseBoolean(value: unknown): boolean | null {
  const text = cleanText(value)?.toLocaleLowerCase("pt-BR");
  if (!text) return null;
  if (["true", "1", "yes", "y", "sim", "s"].includes(text)) return true;
  if (["false", "0", "no", "n", "nao", "não"].includes(text)) return false;
  return null;
}

export function parseCsvDate(value: unknown): Date | null {
  const text = cleanText(value);
  if (!text) return null;

  const brazilian = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (brazilian) {
    const [, dayText, monthText, yearText, hourText, minuteText, secondText] =
      brazilian;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText ?? 0);
    const minute = Number(minuteText ?? 0);
    const second = Number(secondText ?? 0);
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day &&
      hour <= 23 &&
      minute <= 59 &&
      second <= 59
    ) {
      return date;
    }
    return null;
  }

  // Restrict the fallback to ISO-like values to avoid locale-dependent Date parsing.
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ][\d:.+-]+Z?)?$/.test(text)) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseCategories(values: readonly string[]): string[] {
  const categories: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          categories.push(
            ...parsed.map(cleanText).filter((item): item is string => Boolean(item)),
          );
          continue;
        }
      } catch {
        // Treat invalid JSON as a normal category value below.
      }
    }

    categories.push(...trimmed.split(/\s*[|;]\s*/).filter(Boolean));
  }

  const unique = new Map<string, string>();
  for (const category of categories) {
    const cleaned = cleanText(category);
    if (!cleaned) continue;
    unique.set(normalizeIdentityText(cleaned), cleaned);
  }
  return [...unique.values()];
}

function firstMappedValue(
  values: ReadonlyMap<CanonicalLeadField, Array<{ header: string; value: string }>>,
  field: CanonicalLeadField,
): { header: string; value: string } | null {
  return values.get(field)?.find(({ value }) => cleanText(value) !== null) ?? null;
}

function invalidValueIssue(
  field: CanonicalLeadField,
  source: { header: string; value: string } | null,
  expected: string,
): RowIssue | null {
  if (!source || cleanText(source.value) === null) return null;
  return {
    code: `invalid_${field}`,
    field,
    sourceHeader: source.header,
    severity: "error",
    message: `O valor "${cleanText(source.value)}" não é ${expected}.`,
  };
}

export function normalizeMappedRow(
  rawRow: Readonly<Record<string, string | null>>,
  mapping: ColumnMapping,
): NormalizedRowResult {
  const grouped = new Map<
    CanonicalLeadField,
    Array<{ header: string; value: string }>
  >();
  const rawData: Record<string, string | null> = {};

  for (const [header, rawValue] of Object.entries(rawRow)) {
    const value = rawValue ?? "";
    const target = mapping[header] ?? null;
    if (!target) {
      rawData[header] = cleanText(value);
      continue;
    }
    const entries = grouped.get(target) ?? [];
    entries.push({ header, value });
    grouped.set(target, entries);
  }

  const get = (field: CanonicalLeadField): string | null =>
    cleanText(firstMappedValue(grouped, field)?.value);
  const issues: RowIssue[] = [];

  const title = get("title") ?? "";
  const phoneFormatted = get("phone");
  const phoneRaw = get("phoneUnformatted");
  const phoneSource =
    firstMappedValue(grouped, "phoneUnformatted") ??
    firstMappedValue(grouped, "phone");
  const phoneOriginal = phoneFormatted ?? phoneRaw;
  const phoneNormalized = normalizeBrazilianPhone(phoneRaw ?? phoneFormatted);
  if (phoneSource && !phoneNormalized) {
    const issue = invalidValueIssue("phone", phoneSource, "um telefone válido");
    if (issue) issues.push(issue);
  }

  const scoreSource = firstMappedValue(grouped, "totalScore");
  const totalScore = parseLocalizedNumber(scoreSource?.value);
  if (scoreSource && totalScore === null) {
    const issue = invalidValueIssue("totalScore", scoreSource, "uma nota numérica");
    if (issue) issues.push(issue);
  }

  const reviewsSource = firstMappedValue(grouped, "reviewsCount");
  const reviewsCount = parseReviewCount(reviewsSource?.value);
  if (reviewsSource && reviewsCount === null) {
    const issue = invalidValueIssue(
      "reviewsCount",
      reviewsSource,
      "uma quantidade inteira",
    );
    if (issue) issues.push(issue);
  }

  const scrapedSource = firstMappedValue(grouped, "scrapedAt");
  const scrapedAt = parseCsvDate(scrapedSource?.value);
  if (scrapedSource && scrapedAt === null) {
    const issue = invalidValueIssue("scrapedAt", scrapedSource, "uma data válida");
    if (issue) issues.push(issue);
  }

  const temporarySource = firstMappedValue(grouped, "temporarilyClosed");
  const temporarilyClosed = parseBoolean(temporarySource?.value);
  if (temporarySource && temporarilyClosed === null) {
    const issue = invalidValueIssue(
      "temporarilyClosed",
      temporarySource,
      "um booleano (true/false, sim/não ou 1/0)",
    );
    if (issue) issues.push(issue);
  }

  const permanentSource = firstMappedValue(grouped, "permanentlyClosed");
  const permanentlyClosed = parseBoolean(permanentSource?.value);
  if (permanentSource && permanentlyClosed === null) {
    const issue = invalidValueIssue(
      "permanentlyClosed",
      permanentSource,
      "um booleano (true/false, sim/não ou 1/0)",
    );
    if (issue) issues.push(issue);
  }

  const latitudeSource = firstMappedValue(grouped, "latitude");
  const latitude = parseLocalizedNumber(latitudeSource?.value);
  if (latitudeSource && latitude === null) {
    const issue = invalidValueIssue("latitude", latitudeSource, "uma latitude numérica");
    if (issue) issues.push(issue);
  }

  const longitudeSource = firstMappedValue(grouped, "longitude");
  const longitude = parseLocalizedNumber(longitudeSource?.value);
  if (longitudeSource && longitude === null) {
    const issue = invalidValueIssue(
      "longitude",
      longitudeSource,
      "uma longitude numérica",
    );
    if (issue) issues.push(issue);
  }

  const categoryName = get("categoryName");
  const categories = parseCategories(
    (grouped.get("categories") ?? []).map(({ value }) => value),
  );
  if (categoryName && !categories.some((value) => value === categoryName)) {
    categories.unshift(categoryName);
  }

  const stateValue = get("state");
  const countryValue = get("countryCode");
  const address = get("address");
  const street = get("street");
  const neighborhood = get("neighborhood");
  const city = get("city");
  const postalCode = get("postalCode");
  const addressIdentitySource =
    address ??
    [street, neighborhood, city, stateValue, postalCode].filter(Boolean).join(", ") ??
    null;
  const normalizedCountry = countryValue
    ? /^(?:brasil|brazil)$/i.test(countryValue)
      ? "BR"
      : countryValue.toUpperCase()
    : null;
  const value: NormalizedLeadInput = {
    title,
    normalizedName: normalizeIdentityText(title),
    phoneOriginal,
    phoneNormalized,
    categoryName,
    categories,
    address,
    normalizedAddress: addressIdentitySource
      ? normalizeIdentityText(addressIdentitySource)
      : null,
    street,
    neighborhood,
    city,
    state: stateValue?.length === 2 ? stateValue.toUpperCase() : stateValue,
    postalCode,
    countryCode: normalizedCountry,
    googleMapsUrl: get("url"),
    placeId: get("placeId"),
    cid: get("cid"),
    businessProfileId: get("businessProfileId"),
    totalScore,
    reviewsCount,
    searchString: get("searchString"),
    scrapedAt,
    temporarilyClosed,
    permanentlyClosed,
    description: get("description"),
    imageUrl: get("imageUrl"),
    latitude,
    longitude,
    rawData,
    sourceData: {},
  };

  // Reimports may contain only a subset of columns. Recording only mapped
  // fields prevents refresh-source from clearing data absent from that file.
  const sourceData: Record<string, unknown> = {
    title: value.title,
    normalizedName: value.normalizedName,
    rawData: value.rawData,
  };
  const expose = (mappedField: CanonicalLeadField, values: Record<string, unknown>) => {
    if (grouped.has(mappedField)) Object.assign(sourceData, values);
  };
  if (grouped.has("phone") || grouped.has("phoneUnformatted")) {
    sourceData.phoneOriginal = value.phoneOriginal;
    sourceData.phoneNormalized = value.phoneNormalized;
  }
  expose("categoryName", { categoryName: value.categoryName });
  expose("categories", { categories: value.categories });
  expose("address", {
    address: value.address,
    normalizedAddress: value.normalizedAddress,
  });
  expose("street", { street: value.street });
  expose("neighborhood", { neighborhood: value.neighborhood });
  expose("city", { city: value.city });
  expose("state", { state: value.state });
  expose("postalCode", { postalCode: value.postalCode });
  expose("countryCode", { countryCode: value.countryCode });
  expose("url", { googleMapsUrl: value.googleMapsUrl });
  expose("placeId", { placeId: value.placeId });
  expose("cid", { cid: value.cid });
  expose("businessProfileId", { businessProfileId: value.businessProfileId });
  expose("totalScore", { totalScore: value.totalScore });
  expose("reviewsCount", { reviewsCount: value.reviewsCount });
  expose("searchString", { searchString: value.searchString });
  expose("scrapedAt", { scrapedAt: value.scrapedAt?.toISOString() ?? null });
  if (grouped.has("temporarilyClosed") && value.temporarilyClosed !== null) {
    sourceData.temporarilyClosed = value.temporarilyClosed;
  }
  if (grouped.has("permanentlyClosed") && value.permanentlyClosed !== null) {
    sourceData.permanentlyClosed = value.permanentlyClosed;
  }
  expose("description", { description: value.description });
  expose("imageUrl", { imageUrl: value.imageUrl });
  expose("latitude", { latitude: value.latitude });
  expose("longitude", { longitude: value.longitude });
  if (
    !grouped.has("address") &&
    ["street", "neighborhood", "city", "state", "postalCode"].some((field) =>
      grouped.has(field as CanonicalLeadField),
    )
  ) {
    sourceData.normalizedAddress = value.normalizedAddress;
  }
  value.sourceData = sourceData;

  return { value, issues };
}
