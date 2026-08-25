import { notFound } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, CalendarClock, MessageCircleReply, PhoneCall, Trophy } from "lucide-react";
import Link from "next/link";
import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";
import { getCollaboratorReport } from "@/src/server/services/admin-service";
import { PageHeader } from "@/src/components/ui/page-header";
import { StatCard } from "@/src/components/ui/stat-card";
import { TrendChart } from "@/src/components/dashboard/trend-chart";
import { formatDate } from "@/src/lib/utils";

export default async function CollaboratorPage({ params, searchParams }: PageProps<"/equipe/[id]">) {
  const context = await requireAuth();
  if (!hasPermission(context, "DASHBOARD_TEAM")) notFound();
  const { id } = await params;
  const query = await searchParams;
  let report;
  try { report = await getCollaboratorReport(context, id, Number(query.days) || 30); } catch { notFound(); }
  return <div className="space-y-6"><Link href="/equipe" className="inline-flex items-center gap-2 text-sm text-slate-500"><ArrowLeft className="size-4" />Voltar para equipe</Link><PageHeader eyebrow="Desempenho individual" title={report.user.name} description={`${report.user.email} · último acesso ${formatDate(report.user.lastLoginAt, true)}`} actions={<form className="flex gap-2"><select className="field" name="days" defaultValue={String(report.period.days)}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select><button className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">Aplicar</button></form>} /><div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><StatCard label="Carteira" value={report.metrics.portfolio} icon={BriefcaseBusiness} /><StatCard label="Tentativas" value={report.metrics.attempts} icon={PhoneCall} /><StatCard label="Respostas" value={report.metrics.responses} icon={MessageCircleReply} tone="green" /><StatCard label="Vencidos" value={report.metrics.overdue} icon={CalendarClock} tone="amber" /><StatCard label="Vendas" value={report.metrics.wins} icon={Trophy} tone="green" /></div><div className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]"><section className="card p-5"><h2 className="font-semibold">Evolução de atividade</h2><TrendChart data={report.trend} /></section><section className="card p-5"><h2 className="font-semibold">Conversão</h2><dl className="mt-5 space-y-4">{[["Contato", report.metrics.contactRate, `${report.metrics.contacted} leads`],["Resposta", report.metrics.responseRate, `${report.metrics.responses} respostas`],["Conversão", report.metrics.conversionRate, `${report.metrics.wins} vendas`]].map(([label,rate,volume]) => <div key={String(label)}><div className="flex justify-between"><dt className="text-sm text-slate-600">{label}</dt><dd className="font-bold">{Number(rate).toFixed(1)}%</dd></div><p className="text-xs text-slate-400">{volume}</p></div>)}</dl></section></div><section className="card overflow-hidden"><div className="border-b px-5 py-4"><h2 className="font-semibold">Atividades recentes</h2></div><div className="divide-y">{report.recentActivities.map((activity) => <div key={activity.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><Link href={`/leads/${activity.lead.id}`} className="text-sm font-semibold text-slate-800 hover:text-brand-600">{activity.lead.title}</Link><p className="text-xs text-slate-500">{activity.type} · {activity.channel ?? "—"} · {activity.outcome ?? "—"}</p></div><time className="text-xs text-slate-400">{formatDate(activity.occurredAt, true)}</time></div>)}</div></section></div>;
}
