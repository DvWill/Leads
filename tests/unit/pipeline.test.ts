import { describe, expect, it } from "vitest";
import { activityCountsAsResponse, validateStageRequirements } from "@/src/domain/pipeline";

describe("regras do funil", () => {
  it("exige dados configurados pela etapa", () => {
    expect(validateStageRequirements({ requiresMeetingAt: true }, { stageId: crypto.randomUUID() })).toContain("Informe a data e hora da reunião.");
    expect(validateStageRequirements({ requiresLossReason: true }, { stageId: crypto.randomUUID() })).toContain("Selecione o motivo da perda.");
    expect(validateStageRequirements({ blocksContact: true }, { stageId: crypto.randomUUID() })).toContain("Informe o motivo para bloquear novas abordagens.");
  });

  it("considera resposta somente por evidência explícita", () => {
    expect(activityCountsAsResponse("CONTACT_ATTEMPT", "OUTBOUND", "NO")).toBe(false);
    expect(activityCountsAsResponse("CONTACT_RESPONSE", "OUTBOUND", "YES")).toBe(true);
    expect(activityCountsAsResponse("CONTACT_ATTEMPT", "INBOUND", "WAITING")).toBe(true);
  });
});
