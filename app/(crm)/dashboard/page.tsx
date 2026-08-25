import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, CalendarCheck, Clock3, Import, MessageCircleReply, PhoneCall, Target, Trophy, Users } from "lucide-react";
import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";
import { db } from "@/src/server/db";
import { getDashboardData } from "@/src/server/services/crm-query-service";
import { PageHeader } from "@/src/components/ui/page-header";
import { StatCard } from "@/src/components/ui/stat-card";
import { Badge } from "@/src/components/ui/badge";
import { TrendChart } from "@/src/components/dashboard/trend-chart";
import { CompleteTaskButton } from "@/src/components/tasks/complete-task-button";
import { formatDate } from "@/src/lib/utils";

export const metadata = { title: "Resumo" };

type Props = { searchParams: Promise<{ days?: string; collaborator?: string }> };

export default async function DashboardPage({ searchParams }: Props) {
  const context = await requireAuth();
  const params = await searchParams;
  const days = Number(params.days) || 30;
  const canSeeTeam = hasPermission(context, "DASHBOARD_TEAM");
  const [dashboard, collaborators] = await Promise.all([
    getDashboardData(context, { days, collaboratorId: params.collaborator }),
    canSeeTeam ? db.user.findMany({ where: { organizationId: context.organization.id, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const { volumes, rates } = dashboard;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Visão operacional"
        title={`Olá, ${context.user.name.split(" ")[0]}`}
        description="Acompanhe prioridades, ritmo de contatos e evolução do funil com dados registrados pela equipe."
        actions={
          <form className="flex flex-wrap gap-2" method="get">
            {canSeeTeam ? (
              <select className="field min-w-44 py-2" name="collaborator" defaultValue={params.collaborator ?? ""} aria-label="Colaborador">
                <option value="">Toda a equipe</option>
                {collaborators.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            ) : null}
            <select className="field py-2" name="days" defaultValue={String(days)} aria-label="Período">
              <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="180">Últimos 6 meses</option>
            </select>
            <button className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" type="submit">Aplicar</button>
          </form>
        }
      />

      <section aria-label="Resumo de hoje">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Hoje e carteira atual</h2><span className="text-xs text-slate-400">Atualizado agora</span></div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <StatCard label="Atribuídos" value={volumes.assigned} icon={Users} tone="blue" />
          <StatCard label="Pendentes" value={volumes.uncontacted} icon={Clock3} tone="amber" />
          <StatCard label="Contatos hoje" value={volumes.contactsToday} icon={PhoneCall} tone="blue" />
          <StatCard label="Respostas hoje" value={volumes.responsesToday} icon={MessageCircleReply} tone="green" />
          <StatCard label="Reuniões" value={volumes.meetings} icon={CalendarCheck} tone="purple" />
          <StatCard label="Propostas" value={volumes.proposals} icon={BriefcaseBusiness} tone="slate" />
          <StatCard label="Vendas" value={volumes.wins} icon={Trophy} tone="green" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
        <div className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold text-slate-950">Evolução de contatos</h2><p className="mt-1 text-xs text-slate-500">Tentativas e respostas efetivamente registradas.</p></div>
            <Badge tone="blue">{dashboard.period.days} dias</Badge>
          </div>
          <div className="mt-5"><TrendChart data={dashboard.trend} /></div>
        </div>
        <div className="card p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-950">Taxas do período</h2><p className="mt-1 text-xs text-slate-500">Com volume para dar contexto.</p></div><Target className="size-5 text-brand-600" /></div>
          <div className="mt-6 space-y-6">
            {[
              { label: "Taxa de contato", value: rates.contact, detail: `${volumes.effectiveContacts} de ${volumes.assigned} atribuídos`, color: "bg-brand-500" },
              { label: "Taxa de resposta", value: rates.response, detail: `${volumes.responses} de ${volumes.effectiveContacts} contatados`, color: "bg-emerald-500" },
              { label: "Taxa de conversão", value: rates.conversion, detail: `${volumes.wins} de ${volumes.worked} trabalhados`, color: "bg-violet-500" },
            ].map((metric) => (
              <div key={metric.label}>
                <div className="mb-2 flex items-end justify-between"><div><p className="text-sm font-medium text-slate-700">{metric.label}</p><p className="text-xs text-slate-400">{metric.detail}</p></div><p className="text-lg font-bold tabular-nums">{metric.value.toFixed(1)}%</p></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${metric.color}`} style={{ width: `${Math.min(metric.value, 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Tempo médio até o primeiro contato: <strong className="text-slate-800">{dashboard.timing.averageFirstContactHours.toFixed(1)}h</strong></div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6"><div><h2 className="font-semibold text-slate-950">Próximas ações</h2><p className="mt-1 text-xs text-slate-500">Ordenadas por atraso e prioridade.</p></div><Link className="text-sm font-semibold text-brand-600 hover:text-brand-700" href="/tarefas">Ver agenda</Link></div>
          <div className="divide-y">
            {dashboard.tasks.length ? dashboard.tasks.map((task) => {
              const overdue = task.dueAt < new Date();
              return (
                <div key={task.id} className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                  <CompleteTaskButton taskId={task.id} />
                  <div className="min-w-0 flex-1"><Link className="block truncate text-sm font-semibold text-slate-800 hover:text-brand-600" href={`/leads/${task.lead.id}`}>{task.title}</Link><p className="truncate text-xs text-slate-500">{task.lead.title} · {task.lead.stage.name}</p></div>
                  <span className={overdue ? "text-xs font-semibold text-rose-600" : "text-xs text-slate-500"}>{overdue ? "Atrasada · " : ""}{formatDate(task.dueAt, true)}</span>
                </div>
              );
            }) : <div className="px-6 py-12 text-center text-sm text-slate-500">Nenhuma ação pendente. Ótimo trabalho.</div>}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b px-5 py-4 sm:px-6"><div><h2 className="font-semibold text-slate-950">Funil consolidado</h2><p className="mt-1 text-xs text-slate-500">Posição atual dos leads da carteira.</p></div><Link href="/leads?view=kanban" className="text-sm font-semibold text-brand-600">Abrir Kanban</Link></div>
          <div className="max-h-[360px] space-y-3 overflow-y-auto p-5 sm:p-6">
            {dashboard.funnel.map((stage) => {
              const max = Math.max(...dashboard.funnel.map((item) => item.count), 1);
              return <div key={stage.id}><div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-slate-700">{stage.name}</span><span className="font-semibold tabular-nums text-slate-900">{stage.count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(stage.count / max) * 100}%`, backgroundColor: stage.color }} /></div></div>;
            })}
          </div>
        </div>
      </section>

      {hasPermission(context, "IMPORT_MANAGE") && volumes.assigned === 0 ? (
        <Link href="/importacoes" className="card flex items-center gap-4 border-dashed border-brand-300 bg-brand-50/50 p-5 transition hover:border-brand-500">
          <span className="rounded-xl bg-brand-600 p-3 text-white"><Import className="size-5" /></span><span className="flex-1"><strong className="block text-sm text-slate-900">Importe seus primeiros leads</strong><span className="text-xs text-slate-500">Use um CSV do Google Maps ou mapeie qualquer planilha compatível.</span></span><ArrowRight className="size-5 text-brand-600" />
        </Link>
      ) : null}
    </div>
  );
}
