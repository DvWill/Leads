import {
  Permission,
  PermissionEffect,
  PrismaClient,
  UserRole,
  UserStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

const IDS = {
  organization: "00000000-0000-4000-8000-000000000001",
  admin: "00000000-0000-4000-8000-000000000101",
  collaborator: "00000000-0000-4000-8000-000000000102",
  arthur: "00000000-0000-4000-8000-000000000103",
  ana: "00000000-0000-4000-8000-000000000104",
} as const;

const DEFAULT_ADMIN_PASSWORD = "Admin@Prospecta123!";
const DEFAULT_COLLABORATOR_PASSWORD = "Colab@Prospecta123!";

function optionalDemoCredentials(emailName: string, passwordName: string) {
  const email = process.env[emailName]?.trim().toLowerCase();
  const password = process.env[passwordName]?.trim();
  if (Boolean(email) !== Boolean(password)) {
    throw new Error(`${emailName} e ${passwordName} devem ser configuradas juntas.`);
  }
  if (password && password.length < 12) throw new Error(`${passwordName} deve ter pelo menos 12 caracteres.`);
  return { email, password, enabled: Boolean(email && password) };
}

function seedPassword(
  name:
    | "DEMO_ADMIN_PASSWORD"
    | "DEMO_COLLABORATOR_PASSWORD",
  fallback: string,
) {
  const configured = process.env[name]?.trim();

  if (configured && configured.length >= 12) {
    return configured;
  }

  if (configured) {
    throw new Error(`${name} deve ter pelo menos 12 caracteres.`);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} é obrigatória ao executar o seed em produção.`);
  }

  return fallback;
}

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: "prospecta-demo" },
    update: {
      name: "Prospecta Demo",
      isActive: true,
      timezone: "America/Sao_Paulo",
      dataRetentionDays: 730,
      maxCsvUploadBytes: 10 * 1024 * 1024,
      settings: {
        locale: "pt-BR",
        csvAllowedMimeTypes: ["text/csv", "application/csv", "text/plain"],
        defaultCountryCode: "BR",
        excludeClosedFromDistribution: true,
        excludeWithoutPhoneFromDistribution: true,
      },
    },
    create: {
      id: IDS.organization,
      name: "Prospecta Demo",
      slug: "prospecta-demo",
      timezone: "America/Sao_Paulo",
      dataRetentionDays: 730,
      maxCsvUploadBytes: 10 * 1024 * 1024,
      settings: {
        locale: "pt-BR",
        csvAllowedMimeTypes: ["text/csv", "application/csv", "text/plain"],
        defaultCountryCode: "BR",
        excludeClosedFromDistribution: true,
        excludeWithoutPhoneFromDistribution: true,
      },
    },
  });

  const adminEmail = (process.env.DEMO_ADMIN_EMAIL ?? "admin@prospecta.local").trim().toLowerCase();
  const collaboratorEmail = (process.env.DEMO_COLLABORATOR_EMAIL ?? "colaborador@prospecta.local")
    .trim()
    .toLowerCase();
  const arthurCredentials = optionalDemoCredentials("DEMO_ARTHUR_EMAIL", "DEMO_ARTHUR_PASSWORD");
  const anaCredentials = optionalDemoCredentials("DEMO_ANA_EMAIL", "DEMO_ANA_PASSWORD");
  const arthurEmail = arthurCredentials.email ?? "arthur@prospecta.disabled";
  const anaEmail = anaCredentials.email ?? "ana@prospecta.disabled";
  const [adminPasswordHash, collaboratorPasswordHash, arthurPasswordHash, anaPasswordHash] = await Promise.all([
    bcrypt.hash(seedPassword("DEMO_ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD), 12),
    bcrypt.hash(seedPassword("DEMO_COLLABORATOR_PASSWORD", DEFAULT_COLLABORATOR_PASSWORD), 12),
    bcrypt.hash(arthurCredentials.password ?? randomBytes(32).toString("base64url"), 12),
    bcrypt.hash(anaCredentials.password ?? randomBytes(32).toString("base64url"), 12),
  ]);
  const resetSeedPasswords = process.env.SEED_RESET_PASSWORDS === "true";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      organizationId: organization.id,
      name: "Administrador Demo",
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      ...(resetSeedPasswords ? { passwordHash: adminPasswordHash, passwordChangedAt: new Date() } : {}),
    },
    create: {
      id: IDS.admin,
      organizationId: organization.id,
      name: "Administrador Demo",
      email: adminEmail,
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const collaborator = await prisma.user.upsert({
    where: { email: collaboratorEmail },
    update: {
      organizationId: organization.id,
      name: "Colaborador Demo",
      role: UserRole.COLLABORATOR,
      status: UserStatus.ACTIVE,
      maxActiveLeads: null,
      ...(resetSeedPasswords
        ? { passwordHash: collaboratorPasswordHash, passwordChangedAt: new Date() }
        : {}),
    },
    create: {
      id: IDS.collaborator,
      organizationId: organization.id,
      name: "Colaborador Demo",
      email: collaboratorEmail,
      passwordHash: collaboratorPasswordHash,
      role: UserRole.COLLABORATOR,
      status: UserStatus.ACTIVE,
      maxActiveLeads: null,
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.arthur },
    update: {
      organizationId: organization.id,
      name: "Arthur",
      email: arthurEmail,
      role: UserRole.MANAGER,
      status: arthurCredentials.enabled ? UserStatus.ACTIVE : UserStatus.INACTIVE,
      maxActiveLeads: null,
      ...((resetSeedPasswords || !arthurCredentials.enabled) ? { passwordHash: arthurPasswordHash, passwordChangedAt: new Date() } : {}),
    },
    create: {
      id: IDS.arthur,
      organizationId: organization.id,
      name: "Arthur",
      email: arthurEmail,
      passwordHash: arthurPasswordHash,
      role: UserRole.MANAGER,
      status: arthurCredentials.enabled ? UserStatus.ACTIVE : UserStatus.INACTIVE,
      maxActiveLeads: null,
    },
  });

  await prisma.user.upsert({
    where: { id: IDS.ana },
    update: {
      organizationId: organization.id,
      name: "Ana",
      email: anaEmail,
      role: UserRole.MANAGER,
      status: anaCredentials.enabled ? UserStatus.ACTIVE : UserStatus.INACTIVE,
      maxActiveLeads: null,
      ...((resetSeedPasswords || !anaCredentials.enabled) ? { passwordHash: anaPasswordHash, passwordChangedAt: new Date() } : {}),
    },
    create: {
      id: IDS.ana,
      organizationId: organization.id,
      name: "Ana",
      email: anaEmail,
      passwordHash: anaPasswordHash,
      role: UserRole.MANAGER,
      status: anaCredentials.enabled ? UserStatus.ACTIVE : UserStatus.INACTIVE,
      maxActiveLeads: null,
    },
  });

  const stages = [
    { key: "new", name: "Novo", position: 1, color: "#64748B", rules: { description: "Importado e ainda não trabalhado" } },
    { key: "assigned", name: "Atribuído", position: 2, color: "#475569", rules: { requiresAssignee: true } },
    { key: "contact_pending", name: "Contato pendente", position: 3, color: "#0EA5E9", rules: { requiresAssignee: true } },
    { key: "first_attempt", name: "Primeira tentativa", position: 4, color: "#2563EB", rules: { requiresContactAttempt: true } },
    { key: "no_response", name: "Sem resposta", position: 5, color: "#6366F1", rules: { requiresContactAttempt: true } },
    { key: "response_received", name: "Retorno recebido", position: 6, color: "#8B5CF6", rules: { requiresResponse: true } },
    { key: "in_conversation", name: "Em conversa", position: 7, color: "#A855F7", rules: { requiresResponse: true } },
    { key: "interested", name: "Interessado", position: 8, color: "#D946EF", rules: { requiresResponse: true } },
    {
      key: "meeting_scheduled",
      name: "Reunião agendada",
      position: 9,
      color: "#F59E0B",
      rules: { requiredFields: ["meetingAt"] },
      requiresMeetingAt: true,
    },
    {
      key: "proposal_sent",
      name: "Proposta enviada",
      position: 10,
      color: "#F97316",
      rules: { requiredFields: ["proposalSentAt"], optionalFields: ["proposalValue"] },
      requiresProposalAt: true,
    },
    { key: "negotiation", name: "Negociação", position: 11, color: "#EA580C", rules: { description: "Condições em discussão" } },
    {
      key: "closed_won",
      name: "Fechado ganho",
      position: 12,
      color: "#16A34A",
      rules: { requiredFields: ["wonAt"], optionalFields: ["wonValue"] },
      isClosed: true,
      isWon: true,
    },
    {
      key: "closed_lost",
      name: "Fechado perdido",
      position: 13,
      color: "#DC2626",
      rules: { requiredFields: ["lostAt", "lossReasonId"] },
      isClosed: true,
      isLost: true,
      requiresLossReason: true,
    },
    {
      key: "do_not_contact",
      name: "Não contatar",
      position: 14,
      color: "#991B1B",
      rules: { requiredFields: ["doNotContactAt", "doNotContactReason"] },
      isClosed: true,
      blocksContact: true,
    },
  ] as const;

  for (const stage of stages) {
    await prisma.pipelineStage.upsert({
      where: { organizationId_key: { organizationId: organization.id, key: stage.key } },
      update: {
        name: stage.name,
        position: stage.position,
        color: stage.color,
        rules: stage.rules,
        isActive: true,
        isClosed: "isClosed" in stage ? stage.isClosed : false,
        isWon: "isWon" in stage ? stage.isWon : false,
        isLost: "isLost" in stage ? stage.isLost : false,
        requiresMeetingAt: "requiresMeetingAt" in stage ? stage.requiresMeetingAt : false,
        requiresProposalAt: "requiresProposalAt" in stage ? stage.requiresProposalAt : false,
        requiresLossReason: "requiresLossReason" in stage ? stage.requiresLossReason : false,
        blocksContact: "blocksContact" in stage ? stage.blocksContact : false,
      },
      create: {
        organizationId: organization.id,
        key: stage.key,
        name: stage.name,
        position: stage.position,
        color: stage.color,
        rules: stage.rules,
        isClosed: "isClosed" in stage ? stage.isClosed : false,
        isWon: "isWon" in stage ? stage.isWon : false,
        isLost: "isLost" in stage ? stage.isLost : false,
        requiresMeetingAt: "requiresMeetingAt" in stage ? stage.requiresMeetingAt : false,
        requiresProposalAt: "requiresProposalAt" in stage ? stage.requiresProposalAt : false,
        requiresLossReason: "requiresLossReason" in stage ? stage.requiresLossReason : false,
        blocksContact: "blocksContact" in stage ? stage.blocksContact : false,
      },
    });
  }

  const lossReasons = [
    ["Sem interesse", "O lead informou que não tem interesse."],
    ["Sem orçamento", "Não há orçamento disponível no momento."],
    ["Já possui fornecedor", "O lead já trabalha com outro fornecedor."],
    ["Contato inválido", "Telefone, e-mail ou contato não pertence à empresa."],
    ["Fora do perfil", "A empresa não atende aos critérios comerciais."],
    ["Momento inadequado", "Pode haver oportunidade em outro momento."],
    ["Outro", "Motivo detalhado na observação da atividade."],
  ] as const;

  for (const [position, [name, description]] of lossReasons.entries()) {
    await prisma.lossReason.upsert({
      where: { organizationId_name: { organizationId: organization.id, name } },
      update: { description, position: position + 1, isActive: true },
      create: { organizationId: organization.id, name, description, position: position + 1 },
    });
  }

  const tags = [
    { name: "Sem telefone", color: "#DC2626", isSystem: true },
    { name: "Temporariamente fechada", color: "#F59E0B", isSystem: true },
    { name: "Permanentemente fechada", color: "#991B1B", isSystem: true },
    { name: "Alta prioridade", color: "#EA580C", isSystem: false },
    { name: "Indicação", color: "#16A34A", isSystem: false },
  ] as const;

  for (const tag of tags) {
    await prisma.tag.upsert({
      where: { organizationId_name: { organizationId: organization.id, name: tag.name } },
      update: { color: tag.color, isSystem: tag.isSystem, isActive: true },
      create: {
        organizationId: organization.id,
        name: tag.name,
        color: tag.color,
        isSystem: tag.isSystem,
        createdById: admin.id,
      },
    });
  }

  for (const permission of [Permission.LEAD_VIEW_PHONE, Permission.LEAD_EDIT]) {
    await prisma.userPermissionGrant.upsert({
      where: { userId_permission: { userId: collaborator.id, permission } },
      update: { organizationId: organization.id, effect: PermissionEffect.ALLOW },
      create: {
        organizationId: organization.id,
        userId: collaborator.id,
        permission,
        effect: PermissionEffect.ALLOW,
        grantedById: admin.id,
        note: "Permissão padrão do ambiente de demonstração",
      },
    });
  }

  console.info(`Seed concluído para ${organization.slug}.`);
  console.info(`Usuários de demonstração: ${admin.email}, ${collaborator.email}.`);
  console.info("As senhas não são exibidas em logs; consulte/configure as variáveis DEMO_*_PASSWORD.");
}

main()
  .catch((error: unknown) => {
    console.error("Falha ao executar seed do banco de dados.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
