import { describe, expect, it } from "vitest";

import {
  autoMapColumns,
  buildDedupeKeys,
  decodeUtf8Csv,
  detectCsvFormat,
  escapeCsvFormula,
  inspectCsv,
  iterateCsvRows,
  normalizeAndValidateRow,
  normalizeBrazilianPhone,
  stringifyCsvSafe,
  validateCsvUpload,
} from "../../src/lib/csv";

describe("detecção e parsing de CSV", () => {
  it("detecta UTF-8 BOM, ponto e vírgula e cabeçalho", async () => {
    const bytes = new TextEncoder().encode(
      '\uFEFFtitle;phone;description\r\n"Empresa, Um";"(11) 99999-0000";"texto; citado"\r\n',
    );

    expect(decodeUtf8Csv(bytes).encoding).toBe("utf-8-bom");
    expect(detectCsvFormat(bytes)).toMatchObject({
      encoding: "utf-8-bom",
      delimiter: ";",
      hasHeader: true,
    });

    const inspection = await inspectCsv(bytes);
    expect(inspection.totalRows).toBe(1);
    expect(inspection.headers).toEqual(["title", "phone", "description"]);
    expect(inspection.preview[0]?.values.description).toBe("texto; citado");
  });

  it("não quebra vírgulas e quebras de linha dentro de aspas", async () => {
    const csv = 'title,address,description\n"ACME","Rua A, 10","linha 1\nlinha 2"\n';
    const rows = [];
    for await (const row of iterateCsvRows(csv)) rows.push(row);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.values.address).toBe("Rua A, 10");
    expect(rows[0]?.values.description).toBe("linha 1\nlinha 2");
  });

  it("rejeita bytes que não formam UTF-8", () => {
    expect(() => decodeUtf8Csv(Uint8Array.from([0xff, 0xfe, 0x00]))).toThrow(
      /UTF-8/i,
    );
  });
});

describe("mapeamento, normalização e validação", () => {
  it("reconhece sinônimos e arrays achatados do scraper", () => {
    expect(
      autoMapColumns([
        "Nome da empresa",
        "telefone normalizado",
        "categories/0",
        "location/lat",
        "location/lng",
        "Google Place ID",
      ]),
    ).toEqual({
      "Nome da empresa": "title",
      "telefone normalizado": "phoneUnformatted",
      "categories/0": "categories",
      "location/lat": "latitude",
      "location/lng": "longitude",
      "Google Place ID": "placeId",
    });
  });

  it("normaliza os tipos, preserva telefone original e guarda não mapeados", () => {
    const row = {
      Empresa: "  Clínica   São José  ",
      Telefone: " (11) 98765-4321 ",
      Nota: "4,8",
      Avaliacoes: "1.234 avaliações",
      Fechada: "não",
      Coleta: "25/08/2026 14:30",
      Extra: "  valor   livre ",
    };
    const result = normalizeAndValidateRow(row, {
      Empresa: "title",
      Telefone: "phone",
      Nota: "totalScore",
      Avaliacoes: "reviewsCount",
      Fechada: "temporarilyClosed",
      Coleta: "scrapedAt",
      Extra: null,
    });

    expect(result.success).toBe(true);
    expect(result.value).toMatchObject({
      title: "Clínica São José",
      phoneOriginal: "(11) 98765-4321",
      phoneNormalized: "+5511987654321",
      totalScore: 4.8,
      reviewsCount: 1234,
      temporarilyClosed: false,
      rawData: { Extra: "valor livre" },
    });
    expect(result.value?.scrapedAt?.toISOString()).toBe("2026-08-25T14:30:00.000Z");
  });

  it("aceita lead sem telefone, mas rejeita telefone preenchido inválido", () => {
    expect(
      normalizeAndValidateRow(
        { title: "Sem telefone", phone: null },
        { title: "title", phone: "phone" },
      ).success,
    ).toBe(true);

    const invalid = normalizeAndValidateRow(
      { title: "Telefone ruim", phone: "123" },
      { title: "title", phone: "phone" },
    );
    expect(invalid.success).toBe(false);
    expect(invalid.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "invalid_phone" })]),
    );
  });

  it("expõe para reimportação somente campos presentes no mapeamento", () => {
    const result = normalizeAndValidateRow(
      { Empresa: "ACME", Cidade: "Campinas" },
      { Empresa: "title", Cidade: "city" },
    );
    expect(result.success).toBe(true);
    expect(result.value?.sourceData).toMatchObject({
      title: "ACME",
      normalizedName: "acme",
      city: "Campinas",
    });
    expect(result.value?.sourceData).not.toHaveProperty("phoneNormalized");
    expect(result.value?.sourceData).not.toHaveProperty("temporarilyClosed");
    expect(result.value?.sourceData).not.toHaveProperty("googleMapsUrl");
  });

  it("normaliza formatos brasileiros usuais em E.164", () => {
    expect(normalizeBrazilianPhone("11 3333-4444")).toBe("+551133334444");
    expect(normalizeBrazilianPhone("+55 (11) 99999-8888")).toBe(
      "+5511999998888",
    );
    expect(normalizeBrazilianPhone("011 99999-8888")).toBe(
      "+5511999998888",
    );
  });

  it("constrói dedupe na ordem de placeId, telefone e nome+endereço", () => {
    expect(
      buildDedupeKeys({
        placeId: "ChIJ-1",
        phoneNormalized: "+5511999998888",
        title: "Clínica São José",
        address: "Av. Brasil, 10",
      }),
    ).toEqual({
      placeId: "ChIJ-1",
      phoneNormalized: "+5511999998888",
      nameAddress: "clinica sao jose::av brasil 10",
    });
  });
});

describe("segurança de upload e exportação", () => {
  it("valida extensão, MIME e tamanho", () => {
    expect(() =>
      validateCsvUpload({ fileName: "leads.csv", mimeType: "text/csv", byteLength: 20 }),
    ).not.toThrow();
    expect(() =>
      validateCsvUpload({ fileName: "leads.exe", mimeType: "text/csv", byteLength: 20 }),
    ).toThrow(/\.csv/i);
    expect(() =>
      validateCsvUpload({ fileName: "leads.csv", mimeType: "image/png", byteLength: 20 }),
    ).toThrow(/tipo/i);
  });

  it("neutraliza fórmulas antes de serializar", () => {
    expect(escapeCsvFormula("=HYPERLINK(\"x\")")).toBe(
      "'=HYPERLINK(\"x\")",
    );
    expect(escapeCsvFormula("  +SUM(1,2)")).toBe("'  +SUM(1,2)");
    expect(escapeCsvFormula("Empresa normal")).toBe("Empresa normal");

    const csv = stringifyCsvSafe([{ empresa: "@malicioso", vendas: 10 }], {
      includeBom: false,
    });
    expect(csv).toContain("'@malicioso");
  });
});
