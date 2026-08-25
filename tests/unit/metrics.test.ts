import { describe, expect, it } from "vitest";
import { safeRate } from "@/src/domain/metrics";

describe("safeRate", () => {
  it("evita divisão por zero e retorna percentual", () => {
    expect(safeRate(1, 4)).toBe(25);
    expect(safeRate(4, 0)).toBe(0);
  });
});
