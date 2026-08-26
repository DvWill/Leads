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
    return "atrair mais pedidos e organizar melhor o atendimento pelo WhatsApp";
  }
  if (/cl[ií]nica|m[eé]dic|dent|odont|est[eé]tica|sa[uú]de|fisi/i.test(normalized)) {
    return "aumentar agendamentos e reduzir perda de contatos no WhatsApp";
  }
  if (/imobili|construt|arquitet|engenh/i.test(normalized)) {
    return "transformar interessados em visitas e propostas com mais previsibilidade";
  }
  if (/academia|fitness|pilates|cross|esporte/i.test(normalized)) {
    return "converter mais interessados em matrículas e acompanhar retornos";
  }
  if (/auto|carro|moto|oficina|mec[aâ]nic|ve[ií]cul/i.test(normalized)) {
    return "organizar orçamentos, retornos e oportunidades que chegam pelo WhatsApp";
  }
  if (/advoc|contabil|consult|servi[cç]o/i.test(normalized)) {
    return "qualificar contatos e acompanhar oportunidades sem perder histórico";
  }

  return "organizar contatos, retornos e oportunidades que chegam pelo WhatsApp";
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
    `Vi que vocês atuam com ${occupation}${location ? ` em ${location}` : ""}.`,
    source,
    staleContext,
    `Queria entender se hoje faz sentido conversar sobre como ${intentFor(occupation)}.`,
    "Posso te mandar uma ideia rápida por aqui?",
  ].filter(Boolean).join("\n\n");
}
