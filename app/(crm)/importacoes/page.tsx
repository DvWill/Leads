import { ImportPage } from "@/src/components/imports/import-page";
import { requireAuth } from "@/src/server/auth";
import { hasPermission } from "@/src/server/rbac";
import { db } from "@/src/server/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ImportacoesPage() {
  const context = await requireAuth();
  if (!hasPermission(context, "IMPORT_MANAGE")) notFound();
  const [users, jobs] = await Promise.all([
    db.user.findMany({
      where: { organizationId: context.organization.id, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.importJob.findMany({
      where: { organizationId: context.organization.id },
      select: {
        id: true,
        filename: true,
        status: true,
        totalRows: true,
        createdRows: true,
        updatedRows: true,
        errorRows: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return <ImportPage users={users} jobs={jobs.map((job) => ({
    id: job.id,
    filename: job.filename,
    status: job.status,
    totalRows: job.totalRows,
    createdRows: job.createdRows,
    updatedRows: job.updatedRows,
    errorRows: job.errorRows,
    createdAt: job.createdAt.toISOString(),
    createdBy: job.createdBy.name,
  }))} />;
}
