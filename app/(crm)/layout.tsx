import { AppShell } from "@/src/components/layout/app-shell";
import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";

export const dynamic = "force-dynamic";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  return (
    <AppShell
      user={session.user}
      organization={session.organization}
      canAdmin={hasPermission(session, "TEAM_MANAGE") || hasPermission(session, "SETTINGS_MANAGE")}
      canImport={hasPermission(session, "IMPORT_MANAGE")}
    >
      {children}
    </AppShell>
  );
}
