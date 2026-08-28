import Link from "next/link";
import { Activity, Download, LayoutGrid, List, Plus, Search, Star, UserRound } from "lucide-react";
import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";
import { db } from "@/src/server/db";
import { listLeads, type LeadListFilters } from "@/src/server/services/crm-query-service";
import { PageHeader } from "@/src/components/ui/page-header";
import { Badge } from "@/src/components/ui/badge";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LeadActions } from "@/src/components/leads/lead-actions";
import { StageQuickSelect } from "@/src/components/leads/stage-quick-select";
import { BulkAssignToolbar } from "@/src/components/leads/bulk-assign-toolbar";
import { Pagination } from "@/src/components/ui/pagination";
import { formatDate, maskPhone, relativeDate } from "@/src/lib/utils";

export const metadata = { title: "Leads" };
type Query = Record<string, string | string[] | undefined>;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const context = await requireAuth();
  const raw = await searchParams;
  const value = (key: string) => typeof raw[key] === "string" ? raw[key] as string : undefined;
  const filters: LeadListFilters = {
    q: value("q"), stage: value("stage"), tag: value("tag"), city: value("city"), category: value("category"), priority: value("priority"), returnStatus: value("returnStatus"),
    uncontacted: value("uncontacted") === "1", overdue: value("overdue") === "1", noActivityDays: Number(value("noActivityDays")) || undefined,
    page: Number(value("page")) || 1, view: value("view") === "kanban" ? "kanban" : "table",
  };
  const canAssign = hasPermission(context, "LEAD_ASSIGN");
  const canDelete = hasPermission(context, "LEAD_DELETE");
  const [data, users] = await Promise.all([
    listLeads(context, filters),
    canAssign ? db.user.findMany({ where: { organizationId: context.organization.id, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const queryRecord = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const whatsappFilters = { q: filters.q, category: filters.category, city: filters.city, stage: data.stages.find((stage) => stage.id === filters.stage)?.name, uncontacted: filters.uncontacted, noActivityDays: filters.noActivityDays };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Carteira comercial"
        title="Leads"
        description={`${data.total.toLocaleString("pt-BR")} empresas encontradas com os filtros atuais.`}
        actions={<>{hasPermission(context, "LEAD_EXPORT") ? <a className="inline-flex min-h-10 items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" href={`/api/exports/leads?${new URLSearchParams(queryRecord)}`}><Download className="size-4" />Exportar CSV</a> : null}{hasPermission(context, "IMPORT_MANAGE") ? <Link className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700" href="/importacoes"><Plus className="size-4" />Importar leads</Link> : null}</>}
      />

      <form className="card p-4" method="get">
        <input type="hidden" name="view" value={filters.view} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative xl:col-span-2"><span className="sr-only">Buscar</span><Search className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" /><input className="field pl-9" name="q" defaultValue={filters.q} placeholder="Empresa, telefone, endereço ou placeId" /></label>
          <select className="field" name="stage" defaultValue={filters.stage ?? ""}><option value="">Todas as etapas</option>{data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>
          <select className="field" name="city" defaultValue={filters.city ?? ""}><option value="">Todas as cidades</option>{data.cities.map((city) => <option key={city} value={city!}>{city}</option>)}</select>
          <select className="field" name="category" defaultValue={filters.category ?? ""}><option value="">Todas as categorias</option>{data.categories.map((category) => <option key={category} value={category!}>{category}</option>)}</select>
          <select className="field" name="tag" defaultValue={filters.tag ?? ""}><option value="">Todas as etiquetas</option>{data.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select>
          <select className="field" name="priority" defaultValue={filters.priority ?? ""}><option value="">Toda prioridade</option><option value="URGENT">Urgente</option><option value="HIGH">Alta</option><option value="NORMAL">Normal</option><option value="LOW">Baixa</option></select>
          <select className="field" name="returnStatus" defaultValue={filters.returnStatus ?? ""}><option value="">Qualquer retorno</option><option value="YES">Respondeu</option><option value="NO">Sem retorno</option><option value="WAITING">Aguardando</option></select>
          <select className="field" name="noActivityDays" defaultValue={filters.noActivityDays ?? ""}><option value="">Qualquer atividade</option><option value="3">Sem atividade há 3 dias</option><option value="7">Sem atividade há 7 dias</option><option value="15">Sem atividade há 15 dias</option><option value="30">Sem atividade há 30 dias</option></select>
          <div className="flex items-center gap-3 text-sm text-slate-600"><label className="flex items-center gap-2"><input type="checkbox" name="uncontacted" value="1" defaultChecked={filters.uncontacted} />Nunca contatado</label><label className="flex items-center gap-2"><input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} />Vencido</label></div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1"><Link href={`?${new URLSearchParams({ ...queryRecord, view: "table", page: "1" })}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${filters.view === "table" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><List className="size-4" />Tabela</Link><Link href={`?${new URLSearchParams({ ...queryRecord, view: "kanban", page: "1" })}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${filters.view === "kanban" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><LayoutGrid className="size-4" />Kanban</Link></div>
          <div className="flex gap-2"><Link className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100" href="/leads">Limpar</Link><button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="submit">Aplicar filtros</button></div>
        </div>
      </form>

      {canAssign ? <BulkAssignToolbar leadIds={data.items.map((lead) => lead.id)} users={users} /> : null}

      {data.items.length === 0 ? (
        <div className="card"><EmptyState icon={Search} title="Nenhum lead encontrado" description="Ajuste os filtros ou importe uma nova lista para começar." /></div>
      ) : filters.view === "kanban" ? (
        <div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {data.stages.map((stage) => {
              const cards = data.items.filter((lead) => lead.stage.id === stage.id);
              return (
                <section key={stage.id} className="w-80 shrink-0">
                  <div className="mb-3 flex items-center justify-between px-1"><div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: stage.color }} /><h2 className="text-sm font-semibold text-slate-800">{stage.name}</h2></div><Badge>{cards.length}</Badge></div>
                  <div className="space-y-3">
                    {cards.map((lead) => (
                      <article key={lead.id} className="card p-4">
                        <Link prefetch={false} className="font-semibold text-slate-900 hover:text-brand-600" href={`/leads/${lead.id}`}>{lead.title}</Link>
                        <p className="mt-1 truncate text-xs text-slate-500">{lead.categoryName ?? "Sem categoria"} · {lead.city ?? "Sem cidade"}</p>
                        <div className="mt-3 flex flex-wrap gap-1">{lead.tags.slice(0, 2).map(({ tag }) => <span key={tag.id} className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${tag.color}18`, color: tag.color }}>{tag.name}</span>)}</div>
                        <div className="mt-4 flex items-center justify-between gap-2"><div className="min-w-0 text-xs text-slate-500"><UserRound className="mr-1 inline size-3.5" />{lead.assignee?.name ?? "Sem responsável"}</div><LeadActions leadId={lead.id} phone={lead.phoneNormalized} mapsUrl={null} compact blocked={lead.stage.blocksContact} canDelete={canDelete} lead={{ title: lead.title, categoryName: lead.categoryName, city: lead.city, state: lead.state, searchString: lead.searchString, stageName: lead.stage.name }} filters={whatsappFilters} /></div>
                        <div className="mt-3"><StageQuickSelect leadId={lead.id} currentStageId={lead.stage.id} stages={data.stages} /></div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          {data.pages > 1 ? <div className="card mt-4 overflow-hidden"><Pagination page={data.page} pages={data.pages} searchParams={queryRecord} /></div> : null}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y">
              <thead className="bg-slate-50"><tr>{["Empresa", "Etapa", "Responsável", "Última atividade", "Próxima ação", "Ações"].map((title) => <th key={title} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</th>)}</tr></thead>
              <tbody className="divide-y bg-white">
                {data.items.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/70">
                    <td className="min-w-64 px-4 py-3"><Link prefetch={false} href={`/leads/${lead.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{lead.title}</Link><div className="mt-1 flex items-center gap-2 text-xs text-slate-500"><span>{maskPhone(lead.phoneOriginal)}</span>{lead.totalScore ? <span className="inline-flex items-center gap-1"><Star className="size-3 fill-amber-400 text-amber-400" />{lead.totalScore.toString()}</span> : null}</div><p className="mt-1 max-w-sm truncate text-xs text-slate-400">{[lead.address, lead.city, lead.state].filter(Boolean).join(" · ")}</p></td>
                    <td className="px-4 py-3"><Badge tone={lead.stage.blocksContact ? "red" : "blue"}>{lead.stage.name}</Badge>{lead.permanentlyClosed || lead.temporarilyClosed ? <div className="mt-1"><Badge tone="amber">Empresa fechada</Badge></div> : null}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{lead.assignee?.name ?? <span className="text-slate-400">Não atribuído</span>}</td>
                    <td className="px-4 py-3 text-xs text-slate-500"><Activity className="mr-1 inline size-3.5" />{relativeDate(lead.lastActivityAt)}</td>
                    <td className={`px-4 py-3 text-xs ${lead.nextFollowUpAt && lead.nextFollowUpAt < new Date() ? "font-semibold text-rose-600" : "text-slate-500"}`}>{formatDate(lead.nextFollowUpAt, true)}</td>
                    <td className="px-4 py-3"><LeadActions leadId={lead.id} phone={lead.phoneNormalized} mapsUrl={null} blocked={lead.stage.blocksContact} canDelete={canDelete} lead={{ title: lead.title, categoryName: lead.categoryName, city: lead.city, state: lead.state, searchString: lead.searchString, stageName: lead.stage.name }} filters={whatsappFilters} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pages={data.pages} searchParams={queryRecord} />
        </div>
      )}
    </div>
  );
}
