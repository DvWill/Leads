import { FileClock, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";
import { getAuditData } from "@/src/server/services/crm-query-service";
import { PageHeader } from "@/src/components/ui/page-header";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Pagination } from "@/src/components/ui/pagination";
import { formatDate } from "@/src/lib/utils";

export const metadata = { title: "Auditoria" };

const actionLabels: Record<string,string> = { CREATE:"Criação", UPDATE:"Alteração", ARCHIVE:"Arquivamento", ASSIGN:"Atribuição", REASSIGN:"Reatribuição", STAGE_CHANGE:"Mudança de etapa", IMPORT:"Importação", EXPORT:"Exportação", LOGIN:"Login", LOGIN_FAILED:"Falha de login", PASSWORD_RESET:"Senha redefinida", PERMISSION_CHANGE:"Permissão alterada", PRIVACY_CHANGE:"Privacidade" };

export default async function AuditPage({ searchParams }: PageProps<"/auditoria">) {
  const context = await requireAuth();
  if (!hasPermission(context, "AUDIT_VIEW")) notFound();
  const query = await searchParams;
  const page = Math.max(Number(query.page) || 1, 1);
  const data = await getAuditData(context, page);
  return <div className="space-y-6"><PageHeader eyebrow="Governança" title="Auditoria" description={`${data.total.toLocaleString("pt-BR")} eventos preservados. Registros não podem ser excluídos pela interface.`} /><section className="card overflow-hidden">{data.items.length ? <div className="divide-y">{data.items.map((item) => <article key={item.id} className="px-5 py-4 sm:px-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{actionLabels[item.action] ?? item.action}</span><strong className="text-sm text-slate-900">{item.entityType}{item.entityId ? ` · ${item.entityId}` : ""}</strong></div><p className="mt-2 text-xs text-slate-500"><UserRound className="mr-1 inline size-3.5" />{item.actor?.name ?? "Sistema"} · {formatDate(item.occurredAt, true)}</p></div>{item.before || item.after ? <details className="max-w-xl text-xs"><summary className="cursor-pointer font-semibold text-brand-700">Ver valores anteriores e novos</summary><div className="mt-2 grid gap-2 sm:grid-cols-2"><pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-slate-200">{JSON.stringify(item.before, null, 2)}</pre><pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-slate-200">{JSON.stringify(item.after, null, 2)}</pre></div></details> : null}</div></article>)}</div> : <EmptyState icon={FileClock} title="Nenhum evento de auditoria" description="Alterações administrativas e comerciais aparecerão aqui." />}<Pagination page={page} pages={data.pages} searchParams={{}} /></section></div>;
}
