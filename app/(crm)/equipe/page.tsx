import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, CalendarClock, Eye, PhoneCall, Trophy, Users } from "lucide-react";
import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";
import { getTeamData } from "@/src/server/services/crm-query-service";
import { PageHeader } from "@/src/components/ui/page-header";
import { Badge } from "@/src/components/ui/badge";
import { CreateUserForm, UserAdminActions } from "@/src/components/admin/team-admin";
import { formatDate } from "@/src/lib/utils";

export const metadata = { title: "Equipe" };

export default async function TeamPage() {
  const context = await requireAuth();
  if (!hasPermission(context, "DASHBOARD_TEAM")) notFound();
  const team = await getTeamData(context);
  return <div className="space-y-6"><PageHeader eyebrow="Gestão" title="Equipe" description="Carteira, atividade e conversão de cada colaborador com os volumes que dão contexto às taxas." /><CreateUserForm /><div className="card overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full divide-y text-sm"><thead className="bg-slate-50"><tr>{["Colaborador", "Status", "Carteira", "Contatos hoje", "Vencidos", "Respostas", "Reuniões", "Vendas", "Ações"].map((title) => <th key={title} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</th>)}</tr></thead><tbody className="divide-y">{team.map((person) => <tr key={person.id}><td className="px-4 py-3"><Link href={`/equipe/${person.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{person.name}</Link><p className="text-xs text-slate-400">{person.email} · último acesso {formatDate(person.lastLoginAt, true)}</p></td><td className="px-4 py-3"><Badge tone={person.status === "ACTIVE" ? "green" : "slate"}>{person.status === "ACTIVE" ? "Ativo" : "Inativo"}</Badge></td><td className="px-4 py-3 tabular-nums"><Users className="mr-1 inline size-4 text-slate-400" />{person.portfolio}</td><td className="px-4 py-3 tabular-nums"><PhoneCall className="mr-1 inline size-4 text-slate-400" />{person.contactsToday}</td><td className="px-4 py-3 tabular-nums text-rose-600"><CalendarClock className="mr-1 inline size-4" />{person.overdue}</td><td className="px-4 py-3"><span className="font-semibold tabular-nums">{person.responseRate.toFixed(1)}%</span><p className="text-xs text-slate-400">{person.responses}/{person.contacted}</p></td><td className="px-4 py-3 tabular-nums"><Activity className="mr-1 inline size-4 text-slate-400" />{person.meetings}</td><td className="px-4 py-3 tabular-nums"><Trophy className="mr-1 inline size-4 text-emerald-500" />{person.wins}</td><td className="px-4 py-3"><div className="flex items-start gap-3"><Link className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700" href={`/equipe/${person.id}`}><Eye className="size-4" />Relatório</Link><UserAdminActions user={person} /></div></td></tr>)}</tbody></table></div></div></div>;
}
