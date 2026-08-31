export type WhatsAppLeadContext = {
  title: string;
  categoryName?: string | null;
  categories?: readonly string[] | null;
  city?: string | null;
  state?: string | null;
  searchString?: string | null;
  stageName?: string | null;
};

export type WhatsAppFilterContext = {
  q?: string | null;
  category?: string | null;
  city?: string | null;
  stage?: string | null;
  uncontacted?: boolean;
  noActivityDays?: number | null;
};

function clean(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function occupationFor(lead: WhatsAppLeadContext, filters?: WhatsAppFilterContext): string {
  return (
    clean(filters?.category) ??
    clean(lead.categoryName) ??
    lead.categories?.map(clean).find(Boolean) ??
    clean(lead.searchString) ??
    "sua área de atuação"
  );
}

function locationFor(lead: WhatsAppLeadContext, filters?: WhatsAppFilterContext): string | null {
  const city = clean(filters?.city) ?? clean(lead.city);
  const state = clean(lead.state);
  if (city && state) return `${city}/${state}`;
  return city ?? state;
}

function sourceFor(lead: WhatsAppLeadContext, filters?: WhatsAppFilterContext): string | null {
  const query = clean(filters?.q);
  if (query) return `Encontrei a empresa pesquisando por "${query}".`;
  const source = clean(lead.searchString);
  return source ? `Encontrei a empresa pela busca "${source}".` : null;
}

function intentFor(occupation: string): string {
  const normalized = occupation.toLocaleLowerCase("pt-BR");

  if (/restaurante|pizzaria|lanchonete|bar|caf[eé]|food|hamburg/i.test(normalized)) {
    return "apresentar o cardápio, destacar os diferenciais da casa e transformar mais visitas em pedidos";
  }
  if (/cl[ií]nica|m[eé]dic|dent|odont|est[eé]tica|sa[uú]de|fisi/i.test(normalized)) {
    return "apresentar os tratamentos com clareza, transmitir confiança e gerar mais agendamentos";
  }
  if (/imobili|construt|arquitet|engenh/i.test(normalized)) {
    return "valorizar os imóveis ou projetos e transformar mais interessados em visitas e propostas";
  }
  if (/academia|fitness|pilates|cross|esporte/i.test(normalized)) {
    return "mostrar a estrutura, os planos e os resultados para converter mais interessados em matrículas";
  }
  if (/auto|carro|moto|oficina|mec[aâ]nic|ve[ií]cul/i.test(normalized)) {
    return "destacar os serviços, facilitar pedidos de orçamento e gerar novas oportunidades";
  }
  if (/advoc|contabil|consult|servi[cç]o/i.test(normalized)) {
    return "explicar os serviços, reforçar a autoridade da empresa e captar contatos mais qualificados";
  }

  return "apresentar os serviços com mais profissionalismo e transformar visitantes em novos contatos";
}

export function buildLeadWhatsAppMessage(
  lead: WhatsAppLeadContext,
  filters?: WhatsAppFilterContext,
): string {
  const occupation = occupationFor(lead, filters);
  const location = locationFor(lead, filters);
  const source = sourceFor(lead, filters);
  const staleContext =
    filters?.uncontacted
      ? "Como ainda não encontrei um contato anterior por aqui, pensei em falar direto."
      : filters?.noActivityDays
        ? `Vi que fazia pelo menos ${filters.noActivityDays} dias desde o último acompanhamento, então quis retomar.`
        : null;

  return [
    `Olá, tudo bem? Falo com alguém da ${lead.title}?`,
    `Somos da A Sua Publicidade e vimos que vocês atuam com ${occupation}${location ? ` em ${location}` : ""}.`,
    source,
    staleContext,
    `Criamos Landing Pages pensadas para ${intentFor(occupation)}. Como adicional, também oferecemos um SaaS interno para organizar os contatos e acompanhar cada oportunidade em um só lugar.`,
    "Posso te enviar uma ideia rápida de como isso funcionaria para vocês?",
  ].filter(Boolean).join("\n\n");
}
