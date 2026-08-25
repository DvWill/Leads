import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";
import { getAdminConfiguration } from "@/src/server/services/admin-service";
import { PageHeader } from "@/src/components/ui/page-header";
import { ConfigAdmin } from "@/src/components/admin/config-admin";
import { notFound } from "next/navigation";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const context = await requireAuth();
  if (!hasPermission(context, "PIPELINE_MANAGE") && !hasPermission(context, "SETTINGS_MANAGE")) notFound();
  const config = await getAdminConfiguration(context);
  return <div className="space-y-6"><PageHeader eyebrow="Administração" title="Configurações" description={`Funil, etiquetas, motivos de perda e metas de ${config.organization.name}.`} /><ConfigAdmin stages={config.stages} reasons={config.lossReasons} tags={config.tags} users={config.users.map((user)=>({id:user.id,name:user.name}))} goals={config.goals.map((goal)=>({...goal,startsAt:goal.startsAt.toISOString(),endsAt:goal.endsAt.toISOString()}))} /></div>;
}
