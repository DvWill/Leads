import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/src/server/auth";
import { AuthorizationError } from "@/src/server/rbac";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { $transaction: vi.fn() },
}));

vi.mock("@/src/server/db", () => ({ db: dbMock }));

import { archiveLead } from "@/src/server/services/lead-service";

const context = {
  sessionId: "session-1",
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  user: { id: "user-1", name: "Admin", email: "admin@example.com", role: "ADMIN" },
  organization: { id: "org-1", name: "Org", timezone: "America/Sao_Paulo" },
  permissions: new Set(["LEAD_DELETE"]),
} as AuthContext;

describe("arquivamento de lead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige a permissão específica", async () => {
    await expect(archiveLead({ ...context, permissions: new Set() }, "lead-1")).rejects.toBeInstanceOf(AuthorizationError);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it("arquiva o lead, cancela tarefas abertas e registra auditoria", async () => {
    const transaction = {
      lead: {
        findFirst: vi.fn().mockResolvedValue({ id: "lead-1", title: "Empresa", assigneeId: null, stageId: "stage-1" }),
        update: vi.fn().mockResolvedValue({ id: "lead-1" }),
      },
      task: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    dbMock.$transaction.mockImplementation(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction));

    await expect(archiveLead(context, "lead-1")).resolves.toMatchObject({ id: "lead-1", archivedAt: expect.any(Date) });
    expect(transaction.lead.update).toHaveBeenCalledWith({ where: { id: "lead-1" }, data: { archivedAt: expect.any(Date) } });
    expect(transaction.task.updateMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1", leadId: "lead-1", status: "OPEN" },
      data: { status: "CANCELED" },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "ARCHIVE", entityId: "lead-1" }) });
  });
});
