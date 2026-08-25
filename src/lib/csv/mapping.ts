import type {
  CanonicalLeadField,
  ColumnMapping,
  RowIssue,
} from "./types";

const aliases: Record<CanonicalLeadField, readonly string[]> = {
  title: [
    "title",
    "name",
    "business name",
    "business_name",
    "company",
    "company name",
    "nome",
    "nome da empresa",
    "nome empresa",
    "empresa",
    "estabelecimento",
  ],
  phone: [
    "phone",
    "phone formatted",
    "formatted phone",
    "telephone",
    "tel",
    "telefone",
    "celular",
    "whatsapp",
    "contact phone",
  ],
  phoneUnformatted: [
    "phoneUnformatted",
    "phone unformatted",
    "unformatted phone",
    "phone raw",
    "raw phone",
    "phone digits",
    "telefone sem formatacao",
    "telefone normalizado",
    "normalized phone",
  ],
  categoryName: [
    "categoryName",
    "category name",
    "primary category",
    "main category",
    "categoria",
    "categoria principal",
    "segmento",
  ],
  categories: ["categories", "category list", "categorias", "segmentos"],
  address: [
    "address",
    "full address",
    "complete address",
    "endereco",
    "endereco completo",
  ],
  street: ["street", "street address", "logradouro", "rua", "avenida"],
  neighborhood: ["neighborhood", "district", "bairro"],
  city: ["city", "locality", "municipality", "cidade", "municipio"],
  state: ["state", "province", "region", "uf", "estado"],
  postalCode: [
    "postalCode",
    "postal code",
    "postcode",
    "zip",
    "zip code",
    "cep",
  ],
  countryCode: [
    "countryCode",
    "country code",
    "country",
    "pais",
    "codigo do pais",
  ],
  url: [
    "url",
    "maps url",
    "google maps url",
    "googleMapsUrl",
    "link",
    "link maps",
  ],
  placeId: ["placeId", "place id", "google place id", "googlePlaceId"],
  cid: ["cid", "google cid"],
  businessProfileId: [
    "businessProfileId",
    "business profile id",
    "google business profile id",
    "gbp id",
  ],
  totalScore: [
    "totalScore",
    "total score",
    "score",
    "rating",
    "stars",
    "nota",
    "avaliacao",
  ],
  reviewsCount: [
    "reviewsCount",
    "reviews count",
    "review count",
    "reviews",
    "ratings count",
    "quantidade de avaliacoes",
    "avaliacoes",
  ],
  searchString: [
    "searchString",
    "search string",
    "search query",
    "query",
    "keyword",
    "termo de busca",
    "busca",
  ],
  scrapedAt: [
    "scrapedAt",
    "scraped at",
    "scrape date",
    "collected at",
    "data da coleta",
    "coletado em",
  ],
  temporarilyClosed: [
    "temporarilyClosed",
    "temporarily closed",
    "temporary closed",
    "fechado temporariamente",
    "temporariamente fechado",
  ],
  permanentlyClosed: [
    "permanentlyClosed",
    "permanently closed",
    "permanent closed",
    "fechado permanentemente",
    "permanentemente fechado",
  ],
  description: ["description", "about", "descricao", "sobre"],
  imageUrl: [
    "imageUrl",
    "image url",
    "photo url",
    "thumbnail",
    "imagem",
    "url da imagem",
  ],
  latitude: [
    "latitude",
    "lat",
    "location/lat",
    "location.lat",
    "coordinates/latitude",
  ],
  longitude: [
    "longitude",
    "lng",
    "lon",
    "location/lng",
    "location.lng",
    "coordinates/longitude",
  ],
};

export function normalizeColumnName(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/[\[\]]/g, "/")
    .replace(/[_.-]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ");
}

const aliasLookup = new Map<string, CanonicalLeadField>();

for (const [field, fieldAliases] of Object.entries(aliases) as Array<
  [CanonicalLeadField, readonly string[]]
>) {
  for (const alias of fieldAliases) {
    aliasLookup.set(normalizeColumnName(alias), field);
  }
}

export function inferCanonicalField(header: string): CanonicalLeadField | null {
  const normalized = normalizeColumnName(header);
  const exact = aliasLookup.get(normalized);
  if (exact) return exact;

  // Google Maps scrapers commonly flatten arrays as categories/0, categories/1…
  if (/^(?:categories|categorias)(?:\/\d+| \d+)$/.test(normalized)) {
    return "categories";
  }

  return null;
}

export function autoMapColumns(headers: readonly string[]): ColumnMapping {
  return Object.fromEntries(
    headers.map((header) => [header, inferCanonicalField(header)]),
  );
}

/**
 * Checks a user-edited mapping before import. Multiple category columns are valid;
 * repeated scalar targets are reported so the UI can ask which source wins.
 */
export function validateColumnMapping(mapping: ColumnMapping): RowIssue[] {
  const issues: RowIssue[] = [];
  const targetToHeaders = new Map<CanonicalLeadField, string[]>();

  for (const [header, field] of Object.entries(mapping)) {
    if (!field) continue;
    const headers = targetToHeaders.get(field) ?? [];
    headers.push(header);
    targetToHeaders.set(field, headers);
  }

  for (const [field, headers] of targetToHeaders) {
    if (headers.length <= 1 || field === "categories") continue;
    issues.push({
      code: "duplicate_mapping_target",
      field,
      severity: "warning",
      message: `As colunas ${headers.join(", ")} apontam para ${field}; o primeiro valor não vazio será usado.`,
    });
  }

  if (!(targetToHeaders.get("title")?.length)) {
    issues.push({
      code: "missing_title_mapping",
      field: "title",
      severity: "error",
      message: "Mapeie uma coluna para o nome da empresa.",
    });
  }

  return issues;
}

export const COLUMN_ALIASES: Readonly<
  Record<CanonicalLeadField, readonly string[]>
> = aliases;
