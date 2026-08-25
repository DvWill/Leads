export type DistributionCollaborator = {
  id: string;
  activeLeadCount: number;
  maxActiveLeads?: number | null;
  active?: boolean;
};

export type DistributionLead = {
  id: string;
  hasPhone: boolean;
  temporarilyClosed?: boolean;
  permanentlyClosed?: boolean;
};

export type DistributionOptions = {
  includeWithoutPhone?: boolean;
  includeClosed?: boolean;
};

export type AssignmentPlan = { leadId: string; assigneeId: string };

/**
 * Distribui para a menor carteira projetada e usa a ordem original como
 * desempate determinístico. O plano é puro; persistência e locks ficam no serviço.
 */
export function buildBalancedRoundRobinPlan(
  leads: DistributionLead[],
  collaborators: DistributionCollaborator[],
  options: DistributionOptions = {},
): AssignmentPlan[] {
  const pool = collaborators
    .filter((person) => person.active !== false)
    .map((person, index) => ({ ...person, index, projected: person.activeLeadCount }))
    .filter((person) => person.maxActiveLeads == null || person.projected < person.maxActiveLeads);

  const eligibleLeads = leads.filter((lead) => {
    if (!options.includeWithoutPhone && !lead.hasPhone) return false;
    if (!options.includeClosed && (lead.temporarilyClosed || lead.permanentlyClosed)) return false;
    return true;
  });

  const result: AssignmentPlan[] = [];
  for (const lead of eligibleLeads) {
    const available = pool
      .filter((person) => person.maxActiveLeads == null || person.projected < person.maxActiveLeads)
      .sort((left, right) => left.projected - right.projected || left.index - right.index);
    const selected = available[0];
    if (!selected) break;
    result.push({ leadId: lead.id, assigneeId: selected.id });
    selected.projected += 1;
  }
  return result;
}
