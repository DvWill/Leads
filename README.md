# Prospecta CRM

CRM de prospecção comercial em Next.js 16, TypeScript, Tailwind CSS, PostgreSQL e Prisma. O sistema importa listas do Google Places/Maps, distribui leads, registra contatos e retornos com histórico imutável e calcula dashboards a partir do banco.

## Requisitos

- Node.js 20.19 a 24
- PostgreSQL 16 (local, Neon ou outro serviço compatível)
- npm 10+

## Instalação local

```bash
npm install
copy .env.example .env
docker compose up -d db
npm run db:deploy
npm run db:seed
npm run dev
```

No Windows PowerShell com política de scripts restrita, use `npm.cmd` no lugar de `npm`.

Abra `http://localhost:3000`. Os acessos locais padrão do `.env.example` são:

- Administrador: `admin@prospecta.local`
- Colaborador: `colaborador@prospecta.local`

As senhas são definidas por `DEMO_ADMIN_PASSWORD` e `DEMO_COLLABORATOR_PASSWORD`. Em produção, use senhas fortes e nunca versione o arquivo `.env`.

Para redefinir deliberadamente as senhas dos usuários de seed:

```bash
SEED_RESET_PASSWORDS=true npm run db:seed
```

O seed é idempotente. Contas extras só ficam ativas quando seu par `DEMO_*_EMAIL`/`DEMO_*_PASSWORD` é explicitamente configurado.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Conexão PostgreSQL. Em Neon, prefira a URL com pooler para a aplicação. |
| `APP_URL` | URL canônica, por exemplo `https://crm.suaempresa.com.br`. |
| `NEXT_PUBLIC_APP_URL` | Mesma URL pública usada pelo navegador. |
| `APP_TIMEZONE` | Fuso padrão; inicialmente `America/Sao_Paulo`. |
| `TRUST_PROXY` | `true` apenas atrás de proxy confiável; a Vercel é detectada automaticamente. |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | Acesso administrativo criado pelo seed. |
| `DEMO_COLLABORATOR_EMAIL` / `DEMO_COLLABORATOR_PASSWORD` | Acesso de colaborador criado pelo seed. |
| `SEED_RESET_PASSWORDS` | Redefine as senhas do seed somente quando `true`. |
| `MAX_CSV_UPLOAD_BYTES` | Limite lógico do importador. A organização também possui limite no banco. |
| `CSV_IMPORT_BATCH_SIZE` | Tamanho dos lotes transacionais. |

Consulte [.env.example](./.env.example) para a lista completa.

## Banco de dados

```bash
npm run db:generate   # gera o Prisma Client
npm run db:deploy     # aplica migrações pendentes, sem criar migração nova
npm run db:migrate    # desenvolvimento: cria/aplica uma nova migração
npm run db:seed       # organização, acessos e funil padrão
npm run db:studio     # interface local do Prisma
```

A migração inicial cria índices multi-tenant, constraints, proteção cross-tenant e triggers append-only para atividades, histórico de etapas e auditoria.

## Importação

A tela **Importações** aceita:

- CSV UTF-8/UTF-8 BOM com vírgula ou ponto e vírgula;
- JSON em formato de array exportado pelo Google Places;
- cabeçalhos variáveis, com detecção de sinônimos e mapeamento editável;
- até 50 MB como limite absoluto (10 MB por padrão da organização).

O fluxo apresenta prévia e erros por linha, normaliza telefone brasileiro para E.164, preserva dados brutos, detecta duplicatas por `placeId`, telefone e nome+endereço e nunca sobrescreve etapa, responsável ou histórico comercial durante reimportação.

## Vercel

1. Conecte o repositório à Vercel.
2. Em **Project Settings → Environment Variables**, defina no mínimo `DATABASE_URL`, `APP_URL`, `NEXT_PUBLIC_APP_URL`, `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_COLLABORATOR_EMAIL` e `DEMO_COLLABORATOR_PASSWORD` para Production e Preview.
3. Execute `npm run db:deploy` uma vez no ambiente de produção antes da primeira publicação e sempre que houver novas migrações. O build gera o Prisma Client e compila o Next.js sem disputar o advisory lock do PostgreSQL entre deploys concorrentes.
4. Execute o seed uma vez contra o banco de produção, a partir de um ambiente seguro:

```bash
npm run db:seed
```

5. Desative **Deployment Protection** para o domínio público quando os usuários finais precisarem acessar o CRM. Proteção da Vercel é independente do login da aplicação.

`VERCEL_URL` e `VERCEL_PROJECT_PRODUCTION_URL` são reconhecidas automaticamente pela proteção CSRF. Para domínio próprio, mantenha `APP_URL` e `NEXT_PUBLIC_APP_URL` com a URL canônica.

## Validação

```bash
npm run lint
npm run typecheck
npm run test
npm run test:integration
npm run build
```

O fluxo E2E requer um PostgreSQL isolado e as variáveis `PLAYWRIGHT_BASE_URL`/credenciais de teste quando executado contra um servidor externo.

## Segurança e privacidade

- sessão opaca armazenada como hash SHA-256, cookie `HttpOnly`, `Secure` e `SameSite=Lax`;
- bcrypt com custo 12, bloqueio progressivo de login e rate limit persistente;
- RBAC e escopo de organização em rotas e consultas do servidor;
- validação CSRF por origem, uploads por tipo/extensão/tamanho e exportação protegida contra CSV injection;
- telefone omitido para usuários sem permissão;
- histórico e auditoria append-only; correções são novos registros;
- retenção padrão de 730 dias, com eventos de base legal, bloqueio, exportação e anonimização previstos no schema.
