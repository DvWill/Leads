import { z } from "zod";

export const DEFAULT_STAGE_KEYS = {
  NEW: "new",
  ASSIGNED: "assigned",
  CONTACT_PENDING: "contact_pending",
  FIRST_ATTEMPT: "first_attempt",
  NO_RESPONSE: "no_response",
  RESPONSE_RECEIVED: "response_received",
  IN_CONVERSATION: "in_conversation",
  INTERESTED: "interested",
  MEETING_SCHEDULED: "meeting_scheduled",
  PROPOSAL_SENT: "proposal_sent",
  NEGOTIATION: "negotiation",
  CLOSED_WON: "closed_won",
  CLOSED_LOST: "closed_lost",
  DO_NOT_CONTACT: "do_not_contact",
} as const;

export type StageRule = {
  requiresMeetingAt?: boolean;
  requiresProposalAt?: boolean;
  requiresLossReason?: boolean;
  blocksContact?: boolean;
  isWon?: boolean;
  isLost?: boolean;
};

export const stageChangeInputSchema = z.object({
  stageId: z.string().uuid("Etapa inválida."),
  meetingAt: z.coerce.date().optional(),
  proposalSentAt: z.coerce.date().optional(),
  proposalValue: z.coerce.number().nonnegative().max(999_999_999_999).optional(),
  wonAt: z.coerce.date().optional(),
  wonValue: z.coerce.number().nonnegative().max(999_999_999_999).optional(),
  lossReasonId: z.string().uuid().optional(),
  reason: z.string().trim().max(2_000).optional(),
});

export type StageChangeInput = z.infer<typeof stageChangeInputSchema>;

export function validateStageRequirements(rule: StageRule, input: StageChangeInput) {
  const errors: string[] = [];
  if (rule.requiresMeetingAt && !input.meetingAt) errors.push("Informe a data e hora da reunião.");
  if (rule.requiresProposalAt && !input.proposalSentAt) errors.push("Informe a data de envio da proposta.");
  if (rule.requiresLossReason && !input.lossReasonId) errors.push("Selecione o motivo da perda.");
  if (rule.blocksContact && !input.reason?.trim()) errors.push("Informe o motivo para bloquear novas abordagens.");
  return errors;
}

export function isContactActivity(type: string) {
  return type === "CONTACT_ATTEMPT" || type === "CONTACT_RESPONSE";
}

export function activityCountsAsAttempt(type: string) {
  return type === "CONTACT_ATTEMPT";
}

export function activityCountsAsResponse(type: string, direction?: string | null, returnStatus?: string | null) {
  return type === "CONTACT_RESPONSE" || direction === "INBOUND" || returnStatus === "YES";
}
