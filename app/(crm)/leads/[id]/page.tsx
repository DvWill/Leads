import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertOctagon, ArrowLeft, Building2, Check, ClipboardCheck, Clock3, FileText, History, MapPin, MessageCircle, RefreshCw, Star, Tag, UserRound } from "lucide-react";
import { requireAuth } from "@/src/server/auth";
import { getLeadDetail } from "@/src/server/services/crm-query-service";
import { Badge } from "@/src/components/ui/badge";
import { LeadActions } from "@/src/components/leads/lead-actions";
import { LeadWorkspace } from "@/src/components/leads/lead-workspace";
import { CompleteTaskButton } from "@/src/components/tasks/complete-task-button";
import { formatCurrency, formatDate, maskPhone } from "@/src/lib/utils";

export const metadata = { title: "Ficha do lead" };

const activityLabels: Record<string, string> = { CONTACT_ATTEMPT: "Tentativa de contato", CONTACT_RESPONSE: "Retorno recebido", NOTE: "Observação", MEETING: "Reunião", PROPOSAL: "Proposta", SALE: "Venda", CORRECTION: "Correção", SYSTEM: "Sistema" };
const channelLabels: Record<string, string> = { WHATSAPP: "WhatsApp", PHONE: "Ligação", EMAIL: "E-mail", INSTAGRAM: "Instagram", OTHER: "Outro" };
const outcomeLabels: Record<string, string> = { SENT: "Enviado", NO_ANSWER: "Sem resposta", CONNECTED: "Conectado", REPLIED: "Respondeu", INVALID_CONTACT: "Contato inválido", INTERESTED: "Interessado", NOT_INTERESTED: "Sem interesse", MEETING_BOOKED: "Reunião agendada", PROPOSAL_SENT: "Proposta enviada", WON: "Ganho", LOST: "Perdido", OTHER: "Outro" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requireAuth();
  const { id } = await params;
  const data = await getLeadDetail(context, id);
  if (!data) notFound();
  const { lead } = data;
  const blocked = Boolean(lead.doNotContactAt || lead.stage.blocksContact) && !data.canOverrideDnc;
  const timeline = [
    ...lead.activities.map((item) => ({ id: `activity-${item.id}`, date: item.occurredAt, kind: "activity", title: activityLabels[item.type] ?? item.type, text: [item.channel ? channelLabels[item.channel] : null, item.outcome ? outcomeLabels[item.outcome] : null, item.notes].filter(Boolean).join(" · "), author: item.author.name })),
    ...lead.stageHistory.map((item) => ({ id: `stage-${item.id}`, date: item.changedAt, kind: "stage", title: `Etapa alterada para ${item.toStage.name}`, text: [item.fromStage?.name ? `Antes: ${item.fromStage.name}` : null, item.reason].filter(Boolean).join(" · "), author: item.changedBy.name })),
    ...lead.assignments.map((item) => ({ id: `assignment-${item.id}`, date: item.assignedAt, kind: "assignment", title: item.assignee ? `Atribuído a ${item.assignee.name}` : "Responsável removido", text: item.previousAssignee ? `Responsável anterior: ${item.previousAssignee.name}` : "Primeira atribuição", author: item.assignedBy.name })),
    { id: "created", date: lead.createdAt, kind: "import", title: "Lead importado", text: lead.searchString ? `Origem da busca: ${lead.searchString}` : "Registro criado no CRM", author: "Sistema" },
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return <div className="space-y-6">
    <Link href="/leads" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-600"><ArrowLeft className="size-4" />Voltar para leads</Link>
    {(lead.doNotContactAt || lead.stage.blocksContact) ? <div className="flex items-start gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-rose-800"><AlertOctagon className="mt-0.5 size-5 shrink-0" /><div><strong className="block">Não contatar</strong><p className="mt-0.5 text-sm">{lead.doNotContactReason ?? "Novas abordagens estão bloqueadas até liberação administrativa."}</p></div></div> : null}
    {(lead.temporarilyClosed || lead.permanentlyClosed) ? <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800"><AlertOctagon className="size-5" /><strong>{lead.permanentlyClosed ? "Empresa permanentemente fechada no Google" : "Empresa temporariamente fechada no Google"}</strong></div> : null}

    <section className="card p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Building2 className="size-7" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold tracking-tight text-slate-950">{lead.title}</h1><Badge tone={lead.stage.blocksContact ? "red" : "blue"}>{lead.stage.name}</Badge></div><p className="mt-1 text-sm text-slate-500">{lead.categoryName ?? "Sem categoria"}</p><div className="mt-3 flex flex-wrap gap-2">{lead.tags.map(({tag}) => <span key={tag.id} className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${tag.color}18`, color: tag.color }}><Tag className="mr-1 inline size-3" />{tag.name}</span>)}</div></div></div>
        <LeadActions leadId={lead.id} phone={(lead as {phoneNormalized?: string|null}).phoneNormalized ?? null} mapsUrl={lead.googleMapsUrl} blocked={blocked} lead={{ title: lead.title, categoryName: lead.categoryName, categories: lead.categories, city: lead.city, state: lead.state, searchString: lead.searchString, stageName: lead.stage.name }} />
      </div>
      <div className="mt-6 grid gap-4 border-t pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-slate-400">Telefone</p><p className="mt-1 text-sm font-semibold">{maskPhone((lead as {phoneOriginal?:string|null}).phoneOriginal)}</p></div>
        <div><p className="text-xs text-slate-400">Responsável</p><p className="mt-1 text-sm font-semibold">{lead.assignee?.name ?? "Sem responsável"}</p></div>
        <div><p className="text-xs text-slate-400">Prioridade / temperatura</p><p className="mt-1 text-sm font-semibold">{lead.priority} · {lead.temperature}</p></div>
        <div><p className="text-xs text-slate-400">Google</p><p className="mt-1 flex items-center gap-1 text-sm font-semibold"><Star className="size-4 fill-amber-400 text-amber-400" />{lead.totalScore?.toString() ?? "—"} <span className="font-normal text-slate-400">({lead.reviewsCount ?? 0} avaliações)</span></p></div>
      </div>
    </section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,.75fr)]">
      <div className="space-y-6">
        <LeadWorkspace leadId={lead.id} stages={data.stages.map((stage) => ({ id: stage.id, name: stage.name, color: stage.color, requiresMeetingAt: stage.requiresMeetingAt, requiresProposalAt: stage.requiresProposalAt, requiresLossReason: stage.requiresLossReason, blocksContact: stage.blocksContact, isWon: stage.isWon }))} currentStageId={lead.stage.id} reasons={data.reasons} users={data.users} assigneeId={lead.assigneeId} blocked={blocked} />
        <section className="card overflow-hidden"><div className="flex items-center gap-2 border-b px-5 py-4 sm:px-6"><History className="size-5 text-brand-600" /><div><h2 className="font-semibold text-slate-950">Linha do tempo</h2><p className="text-xs text-slate-500">Histórico cronológico e imutável.</p></div></div><div className="divide-y">{timeline.map((item) => <article key={item.id} className="relative flex gap-3 px-5 py-4 sm:px-6"><span className={`mt-1 grid size-8 shrink-0 place-items-center rounded-full ${item.kind === "activity" ? "bg-blue-50 text-blue-600" : item.kind === "stage" ? "bg-violet-50 text-violet-600" : item.kind === "assignment" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"}`}>{item.kind === "activity" ? <MessageCircle className="size-4" /> : item.kind === "stage" ? <RefreshCw className="size-4" /> : item.kind === "assignment" ? <UserRound className="size-4" /> : <FileText className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">{item.title}</h3><time className="text-xs text-slate-400">{formatDate(item.date, true)}</time></div>{item.text ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{item.text}</p> : null}<p className="mt-1 text-xs text-slate-400">por {item.author}</p></div></article>)}</div></section>
      </div>

      <aside className="space-y-5">
        <section className="card p-5"><h2 className="flex items-center gap-2 font-semibold"><MapPin className="size-4 text-brand-600" />Dados da empresa</h2><dl className="mt-4 space-y-3 text-sm">{[["Endereço", [lead.address, lead.city, lead.state, lead.postalCode].filter(Boolean).join(" · ")], ["Place ID", lead.placeId], ["CID", lead.cid], ["Busca de origem", lead.searchString], ["Coletado em", formatDate(lead.scrapedAt, true)]].map(([label,value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-0.5 break-words text-slate-700">{value || "—"}</dd></div>)}</dl></section>
        <section className="card p-5"><h2 className="flex items-center gap-2 font-semibold"><Clock3 className="size-4 text-brand-600" />Indicadores do lead</h2><dl className="mt-4 grid grid-cols-2 gap-4 text-sm">{[["Primeiro contato", formatDate(lead.firstContactAt, true)], ["Último contato", formatDate(lead.lastContactAt, true)], ["Última resposta", formatDate(lead.lastResponseAt, true)], ["Próxima ação", formatDate(lead.nextFollowUpAt, true)], ["Reunião", formatDate(lead.meetingAt, true)], ["Proposta", formatCurrency(lead.proposalValue?.toString())], ["Venda", formatCurrency(lead.wonValue?.toString())], ["Base legal", lead.legalBasis]].map(([label,value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className="mt-1 font-medium text-slate-700">{value}</dd></div>)}</dl></section>
        <section className="card overflow-hidden"><div className="flex items-center gap-2 border-b px-5 py-4"><ClipboardCheck className="size-4 text-brand-600" /><h2 className="font-semibold">Tarefas</h2></div><div className="divide-y">{lead.tasks.length ? lead.tasks.map((task) => <div key={task.id} className={`flex items-center gap-3 px-5 py-3 ${task.status !== "OPEN" ? "opacity-50" : ""}`}>{task.status === "OPEN" ? <CompleteTaskButton taskId={task.id} /> : <Check className="size-4 text-emerald-500" />}<div className="min-w-0"><p className={`truncate text-sm font-medium ${task.status !== "OPEN" ? "line-through" : ""}`}>{task.title}</p><p className="text-xs text-slate-400">{formatDate(task.dueAt, true)} · {task.assignee.name}</p></div></div>) : <p className="p-5 text-sm text-slate-500">Nenhuma tarefa.</p>}</div></section>
      </aside>
    </div>
  </div>;
}
