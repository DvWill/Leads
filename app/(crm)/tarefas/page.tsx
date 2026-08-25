import Link from "next/link";
import { CalendarCheck, CalendarClock, UserRound } from "lucide-react";
import { requireAuth } from "@/src/server/auth";
import { getTasks } from "@/src/server/services/crm-query-service";
import { PageHeader } from "@/src/components/ui/page-header";
import { Badge } from "@/src/components/ui/badge";
import { EmptyState } from "@/src/components/ui/empty-state";
import { CompleteTaskButton } from "@/src/components/tasks/complete-task-button";
import { formatDate } from "@/src/lib/utils";

export const metadata = { title: "Agenda e tarefas" };

export default async function TasksPage({ searchParams }: PageProps<"/tarefas">) {
  const context = await requireAuth();
  const query = await searchParams;
  const selected = typeof query.filtro === "string" && ["today", "overdue", "upcoming"].includes(query.filtro) ? query.filtro as "today" | "overdue" | "upcoming" : "all";
  const tasks = await getTasks(context, selected);
  return <div className="space-y-6"><PageHeader eyebrow="Organização pessoal" title="Agenda e tarefas" description="Próximos acompanhamentos em ordem de vencimento e prioridade." /><nav className="flex flex-wrap gap-2">{[["all","Todas"],["today","Hoje"],["overdue","Atrasadas"],["upcoming","Próximas"]].map(([value,label]) => <Link key={value} href={value === "all" ? "/tarefas" : `/tarefas?filtro=${value}`} className={`rounded-xl px-4 py-2 text-sm font-semibold ${selected === value ? "bg-brand-600 text-white" : "border bg-white text-slate-600"}`}>{label}</Link>)}</nav><section className="card overflow-hidden">{tasks.length ? <div className="divide-y">{tasks.map((task) => { const overdue = task.dueAt < new Date(); return <article key={task.id} className="flex items-center gap-4 px-5 py-4 sm:px-6"><CompleteTaskButton taskId={task.id} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Link href={`/leads/${task.lead.id}`} className="font-semibold text-slate-900 hover:text-brand-600">{task.title}</Link><Badge tone={task.priority === "URGENT" || task.priority === "HIGH" ? "red" : "slate"}>{task.priority}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{task.lead.title} · {task.lead.stage.name}</p><p className="mt-1 text-xs text-slate-400"><UserRound className="mr-1 inline size-3.5" />{task.assignee.name}</p></div><time className={`shrink-0 text-xs ${overdue ? "font-semibold text-rose-600" : "text-slate-500"}`}><CalendarClock className="mr-1 inline size-4" />{overdue ? "Atrasada · " : ""}{formatDate(task.dueAt, true)}</time></article>; })}</div> : <EmptyState icon={CalendarCheck} title="Nenhuma tarefa pendente" description="Agende a próxima ação diretamente na ficha de um lead." />}</section></div>;
}
