import { z } from "zod";

export const contactActivitySchema = z
  .object({
    type: z.enum(["CONTACT_ATTEMPT", "CONTACT_RESPONSE", "NOTE", "MEETING", "PROPOSAL", "SALE"]),
    channel: z.enum(["WHATSAPP", "PHONE", "EMAIL", "INSTAGRAM", "OTHER"]).optional(),
    direction: z.enum(["OUTBOUND", "INBOUND"]).optional(),
    outcome: z.enum(["SENT", "NO_ANSWER", "CONNECTED", "REPLIED", "INVALID_CONTACT", "INTERESTED", "NOT_INTERESTED", "MEETING_BOOKED", "PROPOSAL_SENT", "WON", "LOST", "OTHER"]).optional(),
    returnStatus: z.enum(["YES", "NO", "WAITING"]).optional(),
    notes: z.string().trim().max(5_000).optional(),
    occurredAt: z.coerce.date().max(new Date(Date.now() + 5 * 60_000), "A data da atividade não pode estar no futuro."),
    durationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
    nextActionAt: z.coerce.date().optional(),
    nextActionTitle: z.string().trim().min(2).max(180).optional(),
  })
  .superRefine((value, context) => {
    if (value.type.startsWith("CONTACT_") && !value.channel) {
      context.addIssue({ code: "custom", path: ["channel"], message: "Selecione o canal." });
    }
    if (value.type.startsWith("CONTACT_") && !value.direction) {
      context.addIssue({ code: "custom", path: ["direction"], message: "Selecione a direção." });
    }
    if (value.type === "CONTACT_ATTEMPT" && !value.outcome) {
      context.addIssue({ code: "custom", path: ["outcome"], message: "Selecione o resultado." });
    }
    if (value.nextActionAt && value.nextActionAt <= value.occurredAt) {
      context.addIssue({ code: "custom", path: ["nextActionAt"], message: "O acompanhamento deve ser posterior à atividade." });
    }
    if (value.nextActionAt && !value.nextActionTitle) {
      context.addIssue({ code: "custom", path: ["nextActionTitle"], message: "Descreva a próxima ação." });
    }
  });

export const assignLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(1_000),
  assigneeId: z.string().uuid().nullable(),
  note: z.string().trim().max(1_000).optional(),
});

export const roundRobinSchema = z.object({
  leadIds: z.array(z.string().uuid()).min(1).max(5_000),
  collaboratorIds: z.array(z.string().uuid()).min(1).max(100),
  includeWithoutPhone: z.boolean().default(false),
  includeClosed: z.boolean().default(false),
});

export const taskSchema = z.object({
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2_000).optional(),
  dueAt: z.coerce.date(),
  reminderAt: z.coerce.date().optional(),
  assigneeId: z.string().uuid().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});
