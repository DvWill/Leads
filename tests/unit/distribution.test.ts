import { describe, expect, it } from "vitest";
import { buildBalancedRoundRobinPlan } from "@/src/domain/distribution";

describe("buildBalancedRoundRobinPlan", () => {
  it("equilibra pela carteira atual e respeita limite", () => {
    const plan = buildBalancedRoundRobinPlan(
      [
        { id: "l1", hasPhone: true },
        { id: "l2", hasPhone: true },
        { id: "l3", hasPhone: true },
      ],
      [
        { id: "u1", activeLeadCount: 4, maxActiveLeads: 5 },
        { id: "u2", activeLeadCount: 2, maxActiveLeads: 10 },
      ],
    );
    expect(plan).toEqual([
      { leadId: "l1", assigneeId: "u2" },
      { leadId: "l2", assigneeId: "u2" },
      { leadId: "l3", assigneeId: "u1" },
    ]);
  });

  it("exclui sem telefone e fechados por padrão", () => {
    const plan = buildBalancedRoundRobinPlan(
      [
        { id: "sem-telefone", hasPhone: false },
        { id: "fechado", hasPhone: true, temporarilyClosed: true },
        { id: "ok", hasPhone: true },
      ],
      [{ id: "u1", activeLeadCount: 0 }],
    );
    expect(plan).toEqual([{ leadId: "ok", assigneeId: "u1" }]);
  });
});
