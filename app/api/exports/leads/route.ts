import { AuditAction, Prisma } from "@prisma/client";
import { requirePermission, hasPermission, leadAccessWhere } from "@/src/server/rbac";
import { db } from "@/src/server/db";
import { apiError } from "@/src/server/http";
import { stringifyCsvSafe } from "@/src/lib/csv";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requirePermission("LEAD_EXPORT");
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim();
    const canViewPhone = hasPermission(context, "LEAD_VIEW_PHONE");
    const and: Prisma.LeadWhereInput[] = [{ ...leadAccessWhere(context), archivedAt: null }];
    if (q) and.push({ OR: [
      { title: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { placeId: { contains: q, mode: "insensitive" } },
      ...(canViewPhone ? [{ phoneNormalized: { contains: q.replace(/\D/g, "") } } as Prisma.LeadWhereInput] : []),
    ] });
    const stage = url.searchParams.get("stage");
    const city = url.searchParams.get("city");
    const category = url.searchParams.get("category");
    const tag = url.searchParams.get("tag");
    if (stage) and.push({ stageId: stage });
    if (city) and.push({ city });
    if (category) and.push({ categoryName: category });
    if (tag) and.push({ tags: { some: { tagId: tag } } });
    if (url.searchParams.get("uncontacted") === "1") and.push({ firstContactAt: null });
    if (url.searchParams.get("overdue") === "1") and.push({ nextFollowUpAt: { lt: new Date() }, stage: { isClosed: false } });

    const leads = await db.lead.findMany({
      where: { AND: and },
      select: {
        title: true,
        phoneOriginal: canViewPhone,
        phoneNormalized: canViewPhone,
        categoryName: true,
        address: true,
        neighborhood: true,
        city: true,
        state: true,
        postalCode: true,
        placeId: true,
        googleMapsUrl: true,
        totalScore: true,
        reviewsCount: true,
        priority: true,
        temperature: true,
        firstContactAt: true,
        lastContactAt: true,
        lastResponseAt: true,
        nextFollowUpAt: true,
        stage: { select: { name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50_000,
    });
    const csv = stringifyCsvSafe(leads.map((lead) => ({
      empresa: lead.title,
      telefone_original: "phoneOriginal" in lead ? lead.phoneOriginal : "",
      telefone_e164: "phoneNormalized" in lead ? lead.phoneNormalized : "",
      categoria: lead.categoryName,
      endereco: lead.address,
      bairro: lead.neighborhood,
      cidade: lead.city,
      estado: lead.state,
      cep: lead.postalCode,
      place_id: lead.placeId,
      google_maps: lead.googleMapsUrl,
      nota: lead.totalScore?.toString(),
      avaliacoes: lead.reviewsCount,
      etapa: lead.stage.name,
      responsavel: lead.assignee?.name,
      prioridade: lead.priority,
      temperatura: lead.temperature,
      primeiro_contato: lead.firstContactAt?.toISOString(),
      ultimo_contato: lead.lastContactAt?.toISOString(),
      ultima_resposta: lead.lastResponseAt?.toISOString(),
      proxima_acao: lead.nextFollowUpAt?.toISOString(),
    })));
    await db.auditLog.create({ data: { organizationId: context.organization.id, actorId: context.user.id, action: AuditAction.EXPORT, entityType: "Lead", metadata: { count: leads.length, filters: Object.fromEntries(url.searchParams) } } });
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${date}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
