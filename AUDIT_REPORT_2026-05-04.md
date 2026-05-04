# Auditoria funcional ampliada - SavePointFinance

Gerado em: 2026-05-04
Revalidado apos atualizacao do `.env`: 2026-05-04

Escopo:
- Projeto: `C:\Users\samue\Desktop\SavePointFinance`
- Vault consultado: `C:\Users\samue\Desktop\ObsidianVault`
- Docker isolado: projeto Compose `savepoint_reaudit`, portas `3311` e `55434`

## Resumo executivo

O `.env` foi corrigido em um ponto importante: `EMAIL_PROVIDER=resend` agora e valido, e `docker compose config --quiet` passa. O 500 anterior causado por `EMAIL_PROVIDER` invalido nao se sustenta mais.

Ainda ha bloqueios reais para deploy limpo e consistencia funcional:

1. `bootstrap-admin` ainda falha em banco novo por drift entre Prisma schema, migration baseline e SQL do bootstrap.
2. O smoke configurado no `.env` nao corresponde a um usuario criado pelo bootstrap atual.
3. A auditoria financeira ainda falha no fechamento da competencia de fevereiro.
4. Dois auditores extras nao expostos no `package.json` falham: classificacao de assinatura e regressao runtime.
5. `npm audit --omit=dev` ainda aponta 2 vulnerabilidades moderadas em `next`/`postcss`.

## Validacoes que passaram

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npx prisma validate`
- `docker compose config --quiet`
- Docker isolado: `migrate` em banco limpo
- Docker isolado: build/up do `web`
- Docker isolado: `audit:billing-webhook`
- Docker isolado: `audit:invitations`
- Docker isolado: `audit:cards-smoke`
- Docker isolado: `audit:encoding`
- Docker isolado: `audit:server-smoke` em rodada de controle com `SMOKE_USER_EMAIL=${ADMIN_EMAIL}`
- Auditores extras:
  - `category-classification-audit.ts`
  - `transaction-classification-precedence-audit.ts`
  - `notification-template-smoke.ts`
  - `whatsapp-webhook-e2e-sim.ts`
- Operacao:
  - `backup-once` local, com uploads/alertas externos desligados
  - `restore-backup-test` restaurou com sucesso em `savepoint_restore_test`
- Compose/ops:
  - `postgres` tem healthcheck e logging rotativo
  - `backup` tem healthcheck
  - `web` e `postgres` sao os unicos servicos com porta exposta no host
- Probes dinamicos sem autenticacao:
  - `/dashboard` redireciona para `/login`
  - `/api/profile`, `/api/accounts`, `/api/admin/stats`, `/api/billing`, `/api/billing/cancel` retornam `401`
  - `/api/cron/automation` e `/api/cron/retention` retornam `401` sem segredo
  - WhatsApp webhook rejeita verify token invalido (`403`) e assinatura invalida (`401`)
  - Resend webhook sem assinatura retorna `400`
  - Mercado Pago webhook sem assinatura retorna `401`
- Headers dinamicos em `/login`:
  - CSP com nonce presente
  - HSTS presente
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`

## Validacoes que falharam

- `bootstrap-admin` em banco limpo:
  - erro: `there is no unique or exclusion constraint matching the ON CONFLICT specification`
  - codigo Postgres: `42P10`
- `audit:server-smoke` com o `.env` atual:
  - erro: `Perfil autenticado nao corresponde ao usuario de smoke configurado`
  - causa operacional: `SMOKE_USER_EMAIL` nao e igual a `ADMIN_EMAIL`, nao e igual a `LOCAL_OWNER_EMAIL`, e `LOCAL_OWNER_EMAIL` nao esta definido.
- `audit:finance-consistency`:
  - com `AUDIT_BASE_URL=http://web:3000`, falha em `Fechamento da competência de fevereiro ficou incorreto`.
- `subscription-classification-audit.ts`:
  - falha: `Invariant: static generation store missing in revalidateTag ...:finance-reports`
- `runtime-regression-audit.ts`:
  - falha: `Valor inteiro nao persistiu corretamente`
- `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` contra banco novo:
  - apontou drift de indices, FKs e indice extra de webhook.

## Achados revalidados

## Mapa causal dos achados

### Cluster A - Drift de banco explica bootstrap e risco de delecao

Achados relacionados:
- Fresh bootstrap quebra em `ON CONFLICT ("tenantId", "name")`.
- Prisma diff aponta indices e FKs divergentes.
- Schema atual espera `tenantId,name` em `FinancialAccount` e `Card`, mas baseline criou `ownerUserId,name`.
- Schema atual espera `onDelete: Cascade` em varios relacionamentos, mas banco novo esta com `ON DELETE SET NULL`.

Conclusao:
- Este e um problema de fonte de verdade: `schema.prisma`, baseline SQL e scripts operacionais nao descrevem o mesmo banco.
- Nao e apenas bug do bootstrap; qualquer fluxo que dependa de uniqueness por tenant ou cascade pode divergir entre ambiente atual e ambiente corrigido.

### Cluster B - Falhas runtime dos auditores apontam uso inconsistente de dados validados

Achados relacionados:
- `runtime-regression-audit.ts` falha em `Valor inteiro nao persistiu corretamente`.
- `features/transactions/schemas/transaction-schema.ts:21` define `installments` com `.default(1)`.
- `app/api/transactions/route.ts:184` parseia `parsedData`, mas `app/api/transactions/route.ts:191` chama `splitAmountIntoInstallments(body.amount, body.installments)`.
- `lib/utils.ts:47-55` nao trata `installments` `undefined`: `Math.trunc(undefined)` vira `NaN`, e o array de parcelas pode ficar vazio.

Conclusao:
- A falha do valor inteiro provavelmente nao e sobre `3001` especificamente; e sobre a rota misturar payload cru (`body`) com payload validado/defaultado (`parsedData`).
- Correcao candidata: usar `parsedData.amount` e `parsedData.installments` no create.

### Cluster C - Datas de fatura tem semantica inconsistente de anchor

Achados relacionados:
- `finance-consistency-audit.ts:548-552` espera que a fatura `2026-02` feche em `2026-02-03`.
- `lib/cards/statement.ts:61-62` define `previous_month` como offset `-1`.
- `lib/cards/statement.ts:105-124` calcula o mes de fechamento subtraindo esse offset; para `previous_month`, isso desloca o fechamento para frente.
- `app/api/cards/[id]/statement/route.ts:304-305` usa essas funcoes para `closeDate`/`dueDate`.

Conclusao:
- A falha financeira esta ligada a uma inversao conceitual entre "mes da competencia" e "mes do fechamento".
- Antes de mexer, vale escrever um teste pequeno com os casos do proprio auditor: `closeDay=3,dueDay=10` e `closeDay=24,dueDay=8`.

### Cluster D - Jobs CLI chamam invalidacao de cache Next

Achados relacionados:
- `subscription-classification-audit.ts` falha com `static generation store missing in revalidateTag`.
- `lib/cache/finance-read-models.ts:40` chama `revalidateTag(getFinanceReportsTag(...))`.
- Scripts CLI e automacoes importam funcoes de dominio que podem chegar nessa invalidacao.

Conclusao:
- O dominio esta acoplado ao runtime do Next. Em scripts/jobs, a invalidacao deveria ser opcional, injetada ou tolerante a ausencia do static generation store.

### P1 - Fresh bootstrap ainda quebra

Evidencia:
- `web/scripts/bootstrap-admin.mjs:345` usa `ON CONFLICT ("tenantId", "name")` para `FinancialAccount`.
- `web/prisma/schema.prisma:442` declara `@@unique([tenantId, name])`.
- `web/prisma/migrations/20260405220000_initial_baseline/migration.sql:414` cria `FinancialAccount_ownerUserId_name_key` em `("ownerUserId", "name")`.
- Banco novo migrado confirmou indice real em `FinancialAccount_ownerUserId_name_key`.

Impacto:
- Banco novo migra, mas bootstrap operacional nao fecha.

Recomendacao:
- Criar migration corrigindo o indice para `tenantId,name` ou alinhar schema/bootstrap ao indice `ownerUserId,name`.
- Verificar tambem `Card`: schema atual declara `@@unique([tenantId, name])`, mas banco novo cria `Card_ownerUserId_name_key`.

### P1 - Drift de FKs entre Prisma schema e banco novo

Evidencia:
- `prisma migrate diff` contra o banco recem-migrado quer dropar e recriar FKs de `Transaction`, `Goal` e `Subscription`.
- Schema atual declara varios relacionamentos com `onDelete: Cascade`, por exemplo:
  - `web/prisma/schema.prisma:508-514`
  - `web/prisma/schema.prisma:552-553`
  - `web/prisma/schema.prisma:577-580`
- Banco novo real esta com `ON DELETE SET NULL` para varias dessas FKs:
  - `Transaction_accountId_fkey`
  - `Transaction_cardId_fkey`
  - `Transaction_categoryId_fkey`
  - `Transaction_subscriptionId_fkey`
  - `Transaction_userId_fkey`
  - `Goal_accountId_fkey`
  - `Goal_userId_fkey`
  - `Subscription_accountId_fkey`
  - `Subscription_cardId_fkey`
  - `Subscription_categoryId_fkey`
  - `Subscription_userId_fkey`
- Prova comportamental em banco isolado com rollback:
  - inseri `FinancialAccount` + `Transaction`
  - deletei a conta
  - a transacao permaneceu e `accountId` virou `NULL`
  - portanto o banco real executa `SET NULL`, nao `CASCADE`

Impacto:
- O comportamento real de exclusao no banco nao corresponde ao que o Prisma Client/schema anunciam. Isso pode deixar dados orfaos ou apagar dados em ambientes corrigidos de modo diferente do ambiente atual.

Recomendacao:
- Decidir regra de dominio para cada FK e criar migration explicita. Este ponto deve ser resolvido junto com os indices `FinancialAccount`/`Card`.

### P1 - Auditoria financeira ainda falha

Evidencia:
- `web/scripts/finance-consistency-audit.ts:548-552` consulta `/api/cards/:id/statement?month=2026-02` e espera fechamento em `2026-02-03`.
- Rodada Docker com URL interna explicita falhou em `Fechamento da competência de fevereiro ficou incorreto`.
- A rota usa datas em `web/app/api/cards/[id]/statement/route.ts:304-305`.

Impacto:
- Risco em fechamento/vencimento de fatura por competencia.

### P1 - Runtime regression falha em valor inteiro

Evidencia:
- `web/scripts/runtime-regression-audit.ts:364-376` cria transacao com `amount: 3001`.
- O auditor falha em `Valor inteiro nao persistiu corretamente`.
- Causa provavel:
  - `web/features/transactions/schemas/transaction-schema.ts:21` define default `installments=1`.
  - `web/app/api/transactions/route.ts:191` usa `body.installments`, nao `parsedData.installments`.
  - `web/lib/utils.ts:47-55` nao normaliza `NaN` para `1`.

Impacto:
- Risco em persistencia/serializacao de valores monetarios inteiros via API.

### P2 - Smoke operacional do `.env` esta inconsistente

Evidencia:
- `audit:server-smoke` com o `.env` atual falha em `Perfil autenticado nao corresponde ao usuario de smoke configurado`.
- Rodada de controle com `SMOKE_USER_EMAIL=${ADMIN_EMAIL}` passa.

Impacto:
- O app consegue passar smoke, mas o smoke padrao do ambiente atual nao valida o usuario esperado.

Recomendacao:
- Definir `LOCAL_OWNER_EMAIL`/`LOCAL_OWNER_PASSWORD` ou apontar `SMOKE_USER_EMAIL` para um usuario que o bootstrap crie.

### P2 - `subscription-classification-audit` roda fora de contexto Next

Evidencia:
- Falha em `revalidateTag ... static generation store missing`.
- Relacao causal:
  - `web/lib/cache/finance-read-models.ts:40` chama `revalidateTag`.
  - O auditor importa automacao de assinaturas fora de request/render Next.

Impacto:
- Automacao de assinatura chama caminho que invalida cache Next fora de request/render context.

Recomendacao:
- Blindar chamadas de `revalidateTag` em scripts/jobs, ou isolar invalidacao em adapter tolerante a runtime CLI.

### P2 - Dependencias com vulnerabilidade moderada

Evidencia:
- `npm audit --omit=dev --json`: 2 moderadas.
- Pacotes: `next` direto, `postcss` indireto.
- `npm audit --json` completo confirma o mesmo conjunto: `next` via `postcss`, advisory `GHSA-qx2v-qp2m-jg93`.

### P2 - Templates de env ausentes

Evidencia:
- Ausentes: `.env.example`, `.env.local-docker.example`, `.env.server.example`, `web/.env.example`, `web/.env.local.example`.
- `.env` atual tem 102 chaves.

Impacto:
- Onboarding/deploy fica dependente de copiar ambiente real ou conhecimento externo.

### P2 - Nao ha harness formal de testes

Evidencia:
- `web/package.json` nao tem script `test`.
- Nao encontrei arquivos `*.test.*`, `*.spec.*`, `jest.config`, `vitest.config` ou `playwright.config`.

Impacto:
- A qualidade depende de scripts de auditoria/smoke, mas nao ha regressao automatizada granular por unidade/integracao.

### P2 - Documentacao referencia templates de env que nao existem

Evidencia:
- `README.md` e `DEPLOY_AND_BOOTSTRAP.md` mencionam `.env.example` / templates por ambiente.
- Arquivos ausentes no workspace atual:
  - `.env.example`
  - `.env.local-docker.example`
  - `.env.server.example`
  - `web/.env.example`
  - `web/.env.local.example`
- `STACK_MIGRATION_PLAN.md` tambem e mencionado no README, mas nao existe.

Impacto:
- Onboarding, servidor novo e reprodutibilidade de auditoria dependem do `.env` real.

### P3 - `web` nao tem healthcheck no Compose

Evidencia:
- `docker-compose.yml` tem healthcheck para `postgres` e `backup`, mas nao para `web`.
- O smoke consegue validar o app, mas o orquestrador so sabe que o processo iniciou.

Impacto:
- Em deploy, `depends_on: condition: service_started` e restart policy podem mascarar app que sobe com 500 em rotas essenciais.

Recomendacao:
- Adicionar healthcheck HTTP no `web`, idealmente contra `/api/health`.

### P3 - Postgres exposto no host por padrao

Evidencia:
- `docker-compose.yml` expoe `postgres` em `${POSTGRES_PORT:-5433}:5432`.

Impacto:
- Bom para desenvolvimento, mas em servidor deve ficar restrito por firewall/rede ou removido em compose de producao.

### P3 - Metadado de package manager ausente

Evidencia:
- `web/package.json` tem `package-lock.json`, mas nao define `packageManager`.

Impacto:
- Baixo, mas declarar `packageManager` reduz drift entre npm versions em maquinas diferentes.

### P3 - Lookup legado por token de convite em texto puro

Evidencia:
- Convites novos sao armazenados com hash em:
  - `web/app/api/admin/invitations/route.ts:170`
  - `web/app/api/admin/invitations/route.ts:227`
- Validacao ainda aceita fallback por token puro:
  - `web/app/api/auth/invitation/route.ts:16`
  - `web/app/api/auth/accept-invitation/route.ts:37`

Impacto:
- Provavel compatibilidade com convites antigos, mas amplia superficie caso algum token puro exista no banco.

Recomendacao:
- Planejar remocao do fallback apos migrar/expirar convites antigos.

## Achados adicionais desta rodada

### P1 - Drift de FKs muda o comportamento real de delecao de contas e cartoes

Relacao com achado anterior:
- O drift de FK nao afeta apenas `bootstrap-admin` ou `prisma migrate diff`; ele muda o resultado funcional das rotas de delecao.

Evidencia:
- `web/app/api/accounts/[id]/route.ts:180` executa `prisma.financialAccount.delete({ where: { id, tenantId } })`.
- `web/app/api/cards/[id]/route.ts:88` executa `prisma.card.delete({ where: { id, tenantId } })`.
- `web/app/api/categories/[id]/route.ts:95` primeiro procura transacao vinculada e bloqueia com 400 em `web/app/api/categories/[id]/route.ts:103`.
- No banco criado por migrations, as FKs de `Transaction.accountId` e `Transaction.cardId` estao em `ON DELETE SET NULL`; no schema Prisma elas declaram Cascade.
- A prova SQL isolada confirmou que deletar uma conta deixa a transacao viva com `accountId = NULL`.

Impacto:
- A UI/API pode vender a ideia de "excluir conta/cartao", mas o historico financeiro fica preservado e desassociado no banco real.
- Se a intencao de produto for preservar historico, o Prisma schema esta errado. Se a intencao for apagar em cascata, o banco novo esta errado.
- Categoria tem regra explicita de protecao; conta/cartao nao tem a mesma protecao, entao a experiencia fica inconsistente.

Recomendacao:
- Decidir regra de negocio unica:
  - preservar historico: trocar schema para `SetNull` e bloquear/avisar na UI antes de deletar conta/cartao;
  - apagar historico: corrigir migrations/FKs para Cascade e adicionar teste de regressao.

### P1 - Automacao de assinaturas esta acoplada ao cache do Next

Relacao com achado anterior:
- O erro `static generation store missing in revalidateTag` do `subscription-classification-audit.ts` vem do mesmo desenho: regra de dominio chama invalidacao de cache de framework.

Evidencia:
- `web/lib/automation/subscriptions.ts:11` importa `revalidateFinanceReports`.
- `web/lib/automation/subscriptions.ts:213`, `:295` e `:325` chamam `revalidateFinanceReports(tenantId)`.
- `web/lib/cache/finance-read-models.ts:39` chama `revalidateTag(...)`.
- `web/app/api/cron/automation/route.ts:90` chama `runRecurringAutomation(...)`.
- `web/app/api/automation/route.ts:174` chama `runRecurringAutomation(...)` e ainda invalida de novo em `:175`.

Impacto:
- Rotas HTTP podem funcionar, mas cron, scripts e auditores CLI ficam vulneraveis ao contexto interno do Next.
- A invalidacao duplicada na rota `/api/automation` indica que o limite entre dominio e camada web nao esta claro.

Recomendacao:
- Remover `revalidateFinanceReports` de `lib/automation/subscriptions.ts`.
- Fazer a funcao de dominio retornar `affectedTenantIds`/`affectedCompetences`; as rotas Next decidem se invalidam cache.
- Em cron/scripts, usar no-op ou adaptador proprio para invalidacao.

### P2 - Deploy permite migration sem backup obrigatorio e rollback nao reverte schema

Relacao com achados de banco:
- Como ja existe drift entre migrations e schema, a trilha de deploy precisa ser especialmente conservadora em mudancas de banco.

Evidencia:
- `update.sh:15` define `RUN_DB_MIGRATIONS=true` por padrao.
- `update.sh:16` define `RUN_BACKUP_ON_DEPLOY=false` por padrao.
- `update.sh:502-503` aplica migrations se `RUN_DB_MIGRATIONS=true`.
- `update.sh:376-388` aciona rollback por imagem.
- `ops/rollback-release.sh:140-146` restaura a imagem anterior e recria o servico, mas nao restaura banco.

Impacto:
- Um deploy com migration destrutiva ou incompatibilidade de schema pode fazer rollback da imagem, mas deixar o banco em estado novo.
- O backup preventivo existe, mas nao e default mesmo quando migrations estao default-on.

Recomendacao:
- Quando `RUN_DB_MIGRATIONS=true`, exigir `RUN_BACKUP_ON_DEPLOY=true` ou uma confirmacao explicita.
- Documentar que rollback automatico e apenas de imagem; rollback de banco depende de restore separado.

### P2 - Mutacoes autenticadas nao mostram protecao CSRF/Origin propria

Evidencia:
- Foram encontradas 59 rotas API mutantes.
- 42 usam autenticacao/sessao.
- Apenas 5 mencionam termos ligados a CSRF/Origin/Referer.
- A maioria das rotas autenticadas (`accounts`, `cards`, `transactions`, `subscriptions`, `admin/*`) depende apenas da sessao/cookies e dos defaults do Next/Auth.

Impacto:
- Nao confirmei explorabilidade nesta rodada, porque depende dos atributos reais dos cookies do NextAuth e do fluxo browser.
- Ainda assim, para APIs state-changing com cookie de sessao, a ausencia de validacao central de Origin/Referer e um ponto de auditoria de seguranca pendente.

Recomendacao:
- Confirmar cookies reais (`SameSite`, `Secure`, `HttpOnly`) no ambiente final.
- Considerar middleware/helper central para bloquear `POST/PATCH/DELETE` autenticados com Origin/Referer fora de `NEXT_PUBLIC_APP_URL`.

### P3 - Templates ausentes sao mascarados por fallback embutido

Relacao com achado anterior:
- O problema de templates nao quebra sempre o bootstrap, mas aumenta drift operacional.

Evidencia:
- Nao existe nenhum arquivo `.env.*.example` no repositorio.
- `scripts/bootstrap.mjs:14-15` espera `.env.local-docker.example` e `.env.server.example`.
- `scripts/bootstrap.mjs:160-167` cria `.env` com defaults embutidos quando o template nao existe.

Impacto:
- O bootstrap consegue seguir, mas os defaults ficam escondidos no script em vez de revisaveis como contrato operacional.
- A documentacao manda copiar/usar templates que nao existem.

Recomendacao:
- Versionar templates sem segredo e manter o fallback apenas como ultima rede de seguranca.

### P2 - Senhas nao tem limite maximo antes de bcrypt

Evidencia:
- `web/features/auth/schemas/login-schema.ts:5` usa `password: z.string().min(8)` sem `.max(...)`.
- `web/features/password/schemas/password-schema.ts:34-35` usa `newPassword`/`confirmPassword` sem `.max(...)`.
- `web/features/password/schemas/password-schema.ts:52-53` usa senha de aceite de convite sem `.max(...)`.
- `web/features/password/schemas/password-schema.ts:76-77` usa senha de cadastro publico sem `.max(...)`.
- `web/app/api/admin/users/[id]/route.ts:16` permite `newPassword: z.string().min(8).optional()` no reset manual de usuario, tambem sem `.max(...)`.
- Essas entradas chegam a `bcryptjs` em:
  - `web/lib/auth/auth-config.ts:122`
  - `web/app/api/auth/register/route.ts:137`
  - `web/app/api/auth/reset-password/route.ts:26`
  - `web/app/api/auth/accept-invitation/route.ts:59`
  - `web/app/api/admin/users/[id]/route.ts:83`

Impacto:
- O app tem throttling em login/cadastro/esqueci-senha, mas payloads de senha muito grandes ainda podem consumir CPU/memoria antes da resposta.
- Reset de senha e aceite de convite nao tem throttling proprio nesta camada.

Recomendacao:
- Definir limite maximo de senha, por exemplo 128 ou 256 caracteres, nos schemas compartilhados.
- Aplicar limite maximo tambem ao token normalizado de reset/convite.

### P2 - Reset de senha e aceite de convite nao usam throttling proprio

Evidencia:
- `web/app/api/auth/forgot-password/route.ts:38`, `:50` e `:61` aplicam throttle por IP, cooldown por email e janela por email.
- `web/app/api/auth/register/route.ts:64-83` aplica throttle por email/IP.
- `web/app/api/auth/reset-password/route.ts:9-35` valida token e grava nova senha sem `takeThrottleHit`.
- `web/app/api/auth/accept-invitation/route.ts:30-198` aceita convite sem `takeThrottleHit`.
- Tokens sao fortes: reset e convite usam `crypto.randomBytes(24).toString("hex")`, ou seja, 48 hex chars.

Impacto:
- Nao e brute force pratico contra tokens aleatorios de 192 bits.
- Ainda assim, sem throttle proprio, esses endpoints ficam mais expostos a abuso de CPU/IO e volume de tentativa, especialmente combinado com senha sem limite maximo.

Recomendacao:
- Adicionar throttle por IP e por hash/token-prefix seguro para reset/convite.
- Manter respostas genericas, sem enumerar validade alem do necessario.

### P3 - Suporte autenticado envia email externo sem limite de taxa

Evidencia:
- `web/app/api/support/route.ts:93-128` cria ticket e chama `sendSupportEmail(...)`.
- `web/features/support/schemas/support-schema.ts:37-40` limita assunto, mensagem, email e nome.
- Nao ha `takeThrottleHit` no fluxo de suporte.
- `web/lib/support/email.ts:149-195` envia para Resend com timeout de 8s.
- A reabertura tambem envia email externo em `web/app/api/support/[id]/reopen/route.ts:61-84` sem throttle por usuario/ticket.

Impacto:
- Usuario autenticado pode gerar muitos tickets/emails em sequencia, consumindo cota do provedor e poluindo fila/admin.
- O schema limita tamanho do conteudo, entao o risco principal e taxa/frequencia, nao payload gigante.

Recomendacao:
- Adicionar throttle por usuario/tenant para abertura de chamados, por exemplo N por hora e cooldown curto.
- Aplicar cooldown tambem em reabertura, com limite por ticket para evitar loop de fechamento/reabertura.

### P3 - Popup individual de suporte ignora validacao central de URL

Evidencia:
- O gerenciador geral de popup normaliza e valida `ctaUrl` em `web/lib/notifications/popup-campaigns.ts:103-130`; especificamente, `:116-118` aceita apenas `http(s)` ou caminho interno iniciado por `/`.
- As rotas gerais de popup admin usam esse helper: `web/app/api/admin/popup-campaigns/route.ts:34-38` e `web/app/api/admin/popup-campaigns/[id]/route.ts:24-29`.
- O atalho de suporte cria `popupCampaign` diretamente em `web/app/api/admin/support/popup/route.ts:42-67`, com schema proprio em `:9-15` que limita tamanho mas nao valida esquema de URL.
- A UI permite preencher livremente esse campo em `web/features/admin-support/components/admin-support-client.tsx:611-620`.
- O popup exibido ao usuario navega diretamente para `campaign.ctaUrl` em `web/components/providers/login-popup-announcer.tsx:183-190`.

Impacto:
- A mesma entidade `PopupCampaign` tem duas politicas de entrada diferentes: campanhas gerais recusam esquemas inesperados, popup individual de suporte grava qualquer string de ate 500 caracteres.
- Como a rota exige admin, o risco nao e publico; o problema e uma superficie administrativa menos protegida, relevante em conta admin comprometida ou tenant admin malicioso mirando usuarios do proprio tenant.
- A CSP atual reduz parte do risco de `javascript:` URL, mas nao deveria ser a unica linha de defesa para navegacao controlada por dado persistido.

Recomendacao:
- Fazer `admin/support/popup` reutilizar `createPopupCampaign`/`normalizePopupCampaignInput` ou extrair um validador comum de `ctaUrl`.
- Restringir popup individual preferencialmente a caminhos internos, por exemplo `/dashboard/support`, se o caso de uso for suporte dentro do app.

### P3 - Reabertura de suporte confirma sucesso mesmo se o e-mail falhar

Evidencia:
- `web/app/api/support/[id]/reopen/route.ts:50-60` muda o ticket para `open`, limpa `closedAt` e incrementa `reopenCount`.
- Em seguida `web/app/api/support/[id]/reopen/route.ts:61-84` chama `sendSupportEmail(...)`.
- Diferente de abertura de ticket (`web/app/api/support/route.ts:139-176`) e resposta admin (`web/app/api/admin/support/[id]/reply/route.ts:81-90`), a reabertura nao inspeciona `result.ok`, nao incrementa tentativa e nao grava `deliveryStatus`/`providerError`.
- A resposta final sempre e sucesso em `web/app/api/support/[id]/reopen/route.ts:87`, salvo excecao lancada.

Impacto:
- Se Resend estiver desconfigurado ou indisponivel, o usuario recebe confirmacao de continuidade do atendimento, mas a equipe pode nao receber o aviso externo.
- Isso se conecta ao achado de suporte sem rate limit: o fluxo de e-mail externo nao tem uma politica uniforme de entrega, retry e visibilidade operacional.

Recomendacao:
- Capturar o resultado de `sendSupportEmail` na reabertura e persistir tentativa/status/erro, como a abertura inicial ja faz.
- Retornar mensagem 202 quando o ticket foi reaberto mas o aviso externo falhou, deixando claro que o admin vera a pendencia.

### P2 - Campos monetarios nao tem teto compativel com `Decimal(15,2)`

Evidencia:
- O schema Prisma limita valores financeiros principais:
  - `FinancialAccount.openingBalance` em `web/prisma/schema.prisma:425` -> `@db.Decimal(15, 2)`.
  - `Card.limitAmount` em `web/prisma/schema.prisma:452` -> `@db.Decimal(15, 2)`.
  - `Transaction.amount` em `web/prisma/schema.prisma:484` -> `@db.Decimal(15, 2)`.
  - `Goal.targetAmount/currentAmount` em `web/prisma/schema.prisma:536-537` -> `@db.Decimal(15, 2)`.
  - `Subscription.amount` em `web/prisma/schema.prisma:569` -> `@db.Decimal(15, 2)`.
- Os schemas de entrada aceitam numeros positivos/minimos sem `.max(...)`:
  - `web/features/accounts/schemas/account-schema.ts:10`
  - `web/features/cards/schemas/card-schema.ts:19`
  - `web/features/categories/schemas/category-schema.ts:10`
  - `web/features/goals/schemas/goal-schema.ts:7-8`
  - `web/features/subscriptions/schemas/subscription-schema.ts:8`
  - `web/features/transactions/schemas/transaction-schema.ts:12`
- Teste local com Zod confirmou que `1e309`/`Infinity` sao rejeitados, mas valores finitos enormes como `1e36` passam em `z.coerce.number().positive()`.

Impacto:
- Entradas muito grandes passam pela validacao de aplicacao e so falham no banco/Prisma.
- Isso tende a virar erro 400/500 generico e pode afetar relatorios que convertem `Decimal` para `Number`.

Recomendacao:
- Criar schema monetario compartilhado com `.finite()`, `.max(9999999999999.99)` para `Decimal(15,2)` e normalizacao de centavos.
- Usar o mesmo schema em contas, cartoes, categorias, metas, assinaturas, transacoes e installments.

### P2 - Data de transacao aceita datas inexistentes por coerção JS

Relacao com achados de fatura:
- A auditoria financeira ja mostrou fragilidade em competencia/fechamento; este achado amplia a mesma familia de risco em calendario.

Evidencia:
- `web/features/transactions/schemas/transaction-schema.ts:11` usa `z.coerce.date().transform(normalizeCalendarDate)`.
- Teste local confirmou:
  - `2026-02-29` vira `2026-03-01T15:00:00.000Z`.
  - `2026-02-31` vira `2026-03-03T15:00:00.000Z`.
- `web/lib/date.ts:20` ja tem `dateKeySchema` com validacao de data real.
- `web/features/subscriptions/schemas/subscription-schema.ts:13` usa `dateKeySchema`, entao assinaturas rejeitam data inexistente, mas transacoes nao.

Impacto:
- Um cliente/API pode enviar uma data invalida e criar transacao em outro dia/competencia sem erro.
- Em cartao de credito, isso pode cair em outra fatura.

Recomendacao:
- Trocar `transactionFormSchema.date` para `dateKeySchema.transform(...)` ou validar string `YYYY-MM-DD` real antes da coercao.

### P1 - Parcelamento com defaults validados ainda usa `body` bruto

Relacao com achado anterior:
- Este e o root cause preciso do `runtime-regression-audit` falhar em valor inteiro.

Evidencia:
- `web/features/transactions/schemas/transaction-schema.ts:21` define `installments` com `.default(1)`.
- `web/app/api/transactions/route.ts:184` cria `parsedData`.
- A rota usa `body.installments` e `body.amount` em vez de `parsedData.installments` e `parsedData.amount`:
  - `web/app/api/transactions/route.ts:191`
  - `web/app/api/transactions/route.ts:262`
  - `web/app/api/transactions/route.ts:281`
- `web/lib/utils.ts:47-57` transforma `installments = undefined` em array vazio porque `Math.trunc(undefined)` e `NaN`.

Impacto:
- Uma transacao valida pelo schema, mas sem `installments`, nao cria parcelas e retorna erro.
- Esse comportamento ja foi reproduzido pelo auditor `runtime-regression-audit.ts`.

Recomendacao:
- Apos `transactionFormSchema.parse(body)`, usar apenas `parsedData` para campos normalizados/defaultados.

### P1 - Familiar pode alterar contas/cartoes sem guard de gerenciamento

Evidencia:
- A matriz de permissao diferencia administracao de conta: `web/lib/users/account-permissions.ts:27` calcula `canManageAccount = isPlatformAdmin || role === "admin"` e usa isso para preferencias sensiveis em `:37-41`.
- A pagina de compartilhamento usa guard forte: `web/app/(protected)/dashboard/sharing/page.tsx:8-11` chama `requireProtectedPageAccess` e exige `authority.canManage`.
- As paginas de contas e cartoes nao aplicam guard equivalente: `web/app/(protected)/dashboard/accounts/page.tsx:5-7` e `web/app/(protected)/dashboard/cards/page.tsx:5-7` exigem apenas `requireEndUserDashboardPageUser()`.
- A UI oferece criar/editar/excluir para qualquer usuario que acessa a pagina:
  - `web/features/accounts/components/accounts-client.tsx:47-78`, `:221-224`, `:317-319`, `:420-430`.
  - `web/features/cards/components/cards-client.tsx:122-154`, `:501-504`, `:672-674`, `:681-686`.
- As rotas de mutacao tambem exigem apenas sessao/licenca, sem `getSharingAuthority`/`canManage`/`role === "admin"`:
  - `web/app/api/accounts/route.ts:63-68`
  - `web/app/api/accounts/[id]/route.ts:18-23` e `:175-180`
  - `web/app/api/cards/route.ts:99-104`
  - `web/app/api/cards/[id]/route.ts:16-21` e `:83-88`
- Quando cria conta/cartao, a rota grava o familiar como dono direto:
  - `web/app/api/accounts/route.ts:103-107` usa `ownerUserId: user.id`.
  - `web/app/api/cards/route.ts:139-143` usa `ownerUserId: user.id`.
- O fluxo de exclusao permanente de usuario apaga ativos por dono: `web/lib/users/delete-user.ts:130-139` remove transacoes ligadas a contas/cartoes do usuario, e `:153-158` remove `financialAccount`/`card` por `ownerUserId`.
- A propria UI permite exclusao permanente do perfil por `DELETE /api/profile`: `web/features/settings/components/settings-client.tsx:315-320` chama a rota e `:619-632` confirma apenas digitando o e-mail.

Impacto:
- Um usuario `member`/familiar com acesso a carteira compartilhada pode criar, editar e excluir contas/cartoes estruturais da carteira.
- Este achado amplia o P1 de drift de FK: se um familiar excluir conta/cartao, o banco migrado hoje pode preservar transacoes com FK nula, enquanto o schema sugere cascade. Ou seja, autorizacao frouxa aumenta a chance de materializar o comportamento divergente de delecao.
- A permissao tambem se conecta ao fluxo de exclusao de usuario: se um familiar cria uma conta/cartao na carteira compartilhada, esse ativo passa a pertencer ao familiar. Ao excluir o familiar permanentemente, o sistema pode remover ativos e transacoes da carteira compartilhada junto com ele.

Recomendacao:
- Definir explicitamente se familiares podem gerenciar estrutura financeira. Se nao puderem, aplicar guard server-side nas rotas de POST/PATCH/DELETE de contas/cartoes usando `getSharingAuthority` ou uma funcao de permissao compartilhada.
- Refletir a mesma permissao na UI, escondendo/desabilitando formularios e botoes de edicao/exclusao para `member`.
- Se membros puderem contribuir com dados, considerar `ownerUserId` como criador/auditoria e nao como dono de ciclo de vida dos ativos compartilhados; exclusao de usuario deve reatribuir ou anonimizar, nao apagar recursos de tenant por acidente.

### P2 - Familiar tambem pode alterar categorias globais da carteira

Evidencia:
- A tela de compartilhamento descreve o modelo familiar como uma carteira onde "o controle fica com o titular" e o convidado nao administra acessos (`web/features/sharing/components/sharing-client.tsx:205-206`).
- A pagina de categorias usa apenas `requireEndUserDashboardPageUser()` em `web/app/(protected)/dashboard/categories/page.tsx:4-7`.
- As rotas de categoria usam apenas `requireSessionUser()`:
  - listar/criar em `web/app/api/categories/route.ts:16-56`;
  - restaurar padroes em `web/app/api/categories/defaults/route.ts:10-21`;
  - editar/excluir em `web/app/api/categories/[id]/route.ts:17-68` e `:90-118`.
- Categorias sao do tenant, nao do usuario: criacao grava `tenantId: user.tenantId` em `web/app/api/categories/route.ts:83-92`; edicao/exclusao filtram por `tenantId`, mas nao por papel.
- Essas categorias alimentam classificacao, relatorios e limites mensais (`monthlyLimit`), e a mutacao invalida cache de classificacao/relatorio (`web/app/api/categories/route.ts:96-97`, `web/app/api/categories/[id]/route.ts:67-68`).

Impacto:
- Um familiar pode criar, renomear, recolorir ou remover categorias globais que afetam todos os lancamentos e leituras do tenant.
- Isso se relaciona ao P1 de contas/cartoes: o sistema ja tem uma nocao de titular/gestor, mas algumas configuracoes estruturais da carteira continuam protegidas apenas por sessao.
- O problema e menor que excluir conta/cartao porque a rota bloqueia remover categoria vinculada a transacoes (`web/app/api/categories/[id]/route.ts:95-107`), mas ainda permite alterar semantica e limites.

Recomendacao:
- Decidir se categorias sao configuracao gerencial ou colaborativa.
- Se forem gerenciais, aplicar `canManageAccount`/`role === admin` em POST/PATCH/DELETE/defaults.
- Se forem colaborativas, registrar auditoria de categoria e expor claramente que familiares podem alterar a taxonomia compartilhada.

### P2 - Exclusao de usuario apaga trilha historica de auditoria

Evidencia:
- `web/lib/users/delete-user.ts:87-91` executa `adminAuditLog.deleteMany` para qualquer log em que o usuario deletado seja ator ou alvo.
- O schema tambem prende `AdminAuditLog.actorUserId` ao usuario com `onDelete: Cascade` em `web/prisma/schema.prisma:901`, o que inviabiliza preservar logs de acoes antigas se o ator for removido.
- A rota admin registra somente o evento final de remocao depois da exclusao em `web/app/api/admin/users/[id]/route.ts:204-218`; os eventos anteriores relacionados ao usuario ja foram removidos.
- O mesmo padrao existe em escala de tenant: `web/lib/tenants/delete-tenant.ts:44-53` executa `prisma.tenant.delete`, enquanto `AdminAuditLog.actorTenantId` tem `onDelete: Cascade` em `web/prisma/schema.prisma:902`. Logs em que o tenant deletado foi ator sao removidos.
- A exclusao de tenant registra `tenant.deleted` somente apos o delete em `web/app/api/admin/tenants/[id]/route.ts:144-160`, sem `targetTenantId`, porque o tenant ja foi removido.

Impacto:
- A exclusao permanente remove evidencias historicas de alteracoes administrativas, reassignment, convites, mudancas de papel e outras acoes que podem ser importantes para auditoria, suporte e investigacao.
- O problema se conecta aos fluxos de retencao/exclusao: quanto mais automacao destrutiva existir no sistema, mais importante e que os logs sejam imutaveis ou preservados com redacao.
- Em exclusao de tenant, a UI exige confirmacao por slug (`web/features/admin/components/admin-tenant-card.tsx:290-305`), entao o problema nao e clique acidental; e perda de rastreabilidade historica por desenho de FK/cascade.

Recomendacao:
- Preservar `AdminAuditLog` e trocar referencias pessoais por snapshots/redacao, ou tornar `actorUserId` opcional com `onDelete: SetNull` e armazenar `actorEmail`/`actorName` redigidos no metadata.
- Evitar `deleteMany` de logs de auditoria no fluxo de remocao; se houver exigencia LGPD, usar anonimizacao controlada em vez de apagar a trilha.
- Para tenant, considerar `actorTenantId` opcional ou uma entidade/snapshot de ator que sobreviva ao apagamento do tenant.

### P3 - Admin de planos usa type assertion em vez de schema

Evidencia:
- `web/app/api/admin/plans/route.ts:102-113` faz cast direto de `await request.json()` para o formato esperado.
- `web/app/api/admin/plans/route.ts:143-148` grava limites/flags com normalizacao parcial e `:145` usa `Math.max(0, body.trialDays ?? 0)` sem validar tipo finito/int.
- `web/app/api/admin/plans/[id]/route.ts:28-40` repete cast manual no PATCH.
- `web/app/api/admin/plans/[id]/route.ts:63-71` aceita `tier`, `trialDays`, `sortOrder` e flags por checks ad hoc; por exemplo, `tier` truthy invalido pode chegar ao Prisma e `trialDays`/`sortOrder` nao tem teto compatível com inteiro de banco.

Impacto:
- Como a rota e restrita a platform admin, nao e uma exposicao ampla; o risco principal e operacional: payload malformado pode gerar erro Prisma/400 generico ou persistir valores administrativos fora da politica esperada.
- Isso conversa com o achado de inputs numericos sem teto: campos administrativos que controlam limites comerciais tambem deveriam ter limites explicitos e mensagens previsiveis.

Recomendacao:
- Criar `planCreateSchema`/`planUpdateSchema` com `z.enum`, `z.coerce.number().int().min(...).max(...)`, `.trim().min().max()` e booleanos estritos.
- Reutilizar os schemas tambem no cliente admin para reduzir divergencia entre formulario e API.

### P3 - CSP existe, mas ainda permite `unsafe-eval`

Evidencia:
- `web/proxy.ts:47-73` monta a CSP central.
- `web/proxy.ts:63` inclui `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'` sem condicionar a ambiente de desenvolvimento.
- `web/proxy.ts:50-52` tambem permite `script-src-elem 'unsafe-inline'` quando `allowMercadoPagoCheckout` esta ativo para `/billing`.

Impacto:
- O achado anterior de CSP ausente foi desconfirmado, mas a politica ainda reduz a protecao contra XSS ao permitir avaliacao dinamica de script.
- Se alguma injecao futura ocorrer, `unsafe-eval` amplia o que o payload consegue executar mesmo com nonce em scripts normais.

Recomendacao:
- Condicionar `unsafe-eval` a desenvolvimento, se realmente necessario, e testar build/producao sem essa permissao.
- Para Mercado Pago, manter permissões restritas ao caminho de billing e revisar se `unsafe-inline` ainda e exigido pelo SDK atual.

### P3 - Healthcheck publico revela nomes de variaveis sensiveis ausentes

Evidencia:
- `web/app/api/health/route.ts:62-95` nao exige sessao, token ou segredo.
- `web/proxy.ts:7` inclui `/api/health` em `ALLOWED_API_PREFIXES`, entao o endpoint segue acessivel inclusive durante modo manutencao.
- `web/app/api/health/route.ts:14-21` lista nomes de variaveis sensiveis esperadas, incluindo `AUTH_SECRET`, `AUTOMATION_CRON_SECRET`, tokens WhatsApp e chaves Mercado Pago.
- Quando algo falta, `web/app/api/health/route.ts:67-72` devolve `missing: missingEnv`; a resposta tambem inclui `nodeEnv`, `maintenanceMode` e `uptimeSeconds` em `:86-90`.
- O smoke usa esse endpoint em `web/scripts/server-smoke-audit.ts:424-428`, mas o Docker Compose revisado nao depende dele como healthcheck do container web.

Impacto:
- O endpoint nao vaza valores, mas revela configuracao operacional e quais integracoes estao habilitadas/mal configuradas.
- Em incidente ou deploy degradado, um atacante externo consegue mapear rapidamente dependencias e nomes de segredos a partir de uma rota sem autenticacao.

Recomendacao:
- Manter `/api/health` publico apenas com `status`, `service`, `timestamp` e talvez status agregado.
- Mover detalhes de ambiente para `/api/admin/health` ou exigir `AUTOMATION_CRON_SECRET`/token operacional para a versao detalhada.
- Ajustar o smoke para aceitar o health resumido ou usar o token de health detalhado em ambiente local/CI.

### P1 - Webhook Mercado Pago com assinatura invalida entra na fila reprocessavel

Evidencia:
- `web/lib/billing/async-processor.ts:210-215` faz parse do payload e calcula `dedupeKey` antes de validar a assinatura.
- `web/lib/billing/async-processor.ts:230-249` valida a assinatura, mas ainda cria `BillingWebhookEvent` mesmo quando invalida, com `status: "failed"`, `error: "Invalid Mercado Pago webhook signature"` e `nextAttemptAt: null`.
- `web/lib/billing/async-processor.ts:252-253` joga erro 401 para a rota, entao a resposta HTTP rejeita a chamada, mas o registro ja ficou persistido.
- `web/lib/billing/async-processor.ts:263-286` inclui eventos `failed` com `attempts < max` e `nextAttemptAt: null` na fila de processamento.
- `web/lib/billing/async-processor.ts:147-184` processa o registro selecionado chamando `syncMercadoPagoPaymentById` ou `syncMercadoPagoSubscriptionById` sem revalidar a assinatura nem checar se o erro original era assinatura invalida.
- O auditor existente `web/scripts/billing-webhook-e2e-sim.ts:88-106` confirma assinatura valida/invalida em memoria, mas nao cobre a persistencia do evento invalido nem o processamento posterior de `BillingWebhookEvent` com `status = failed`.

Impacto:
- Um webhook invalido pode ser recusado no POST, mas ainda ficar elegivel para o cron `app/api/cron/billing-webhook/route.ts`.
- Isso permite que payloads nao autenticados forcem tentativas de sincronizacao contra a API do Mercado Pago para `resourceId` arbitrario. Se o id existir ou for conhecido, o sistema pode sincronizar estado a partir de uma notificacao que nunca deveria ter entrado na fila confiavel.
- O problema tambem cria ruído operacional: eventos de assinatura invalida se misturam com falhas retryable reais.

Recomendacao:
- Validar assinatura antes de criar evento processavel. Eventos invalidos podem ser logados em tabela/campo separado, mas com status terminal nao elegivel para retry.
- Alternativamente, adicionar `signatureValid` ao modelo e filtrar o processador para `signatureValid = true`.
- Mover o `findUnique(dedupeKey)` para depois da verificacao ou garantir que dedupe de evento invalido nunca bloqueie/processa um evento valido posterior com o mesmo corpo.

### P2 - Sincronizacao de assinaturas recorrentes roda em GET e sem feature gate consistente

Evidencia:
- A feature `automation` existe no licenciamento em `web/lib/licensing/policy.ts:3` e `:84-88`.
- O layout protegido respeita essa feature: `web/app/(protected)/layout.tsx:46-58` so agenda `syncDueSubscriptionTransactions` quando `access.license.features.automation` esta ativo.
- Rotas de leitura chamam a mesma sincronizacao antes de responder, sem `requireSessionUser({ feature: "automation" })`:
  - `web/app/api/reports/summary/route.ts:9-15`
  - `web/app/api/reports/pdf/route.ts:95-101`
  - `web/app/api/transactions/route.ts:24-31`
  - `web/app/api/subscriptions/route.ts:34-40`
- A pagina de assinaturas tambem nao exige feature de automacao: `web/app/(protected)/dashboard/subscriptions/page.tsx:4-7` chama apenas `requireEndUserDashboardPageUser()`.
- Criar/editar/gerar assinatura tambem usa apenas sessao comum:
  - `web/app/api/subscriptions/route.ts:125-128`
  - `web/app/api/subscriptions/[id]/route.ts:18-23`
  - `web/app/api/subscriptions/[id]/generate-transaction/route.ts:13-18`
- `syncDueSubscriptionTransactions` pode criar ate 24 transacoes por assinatura atrasada em uma chamada (`web/lib/automation/subscriptions.ts:361-385`) chamando `generateSubscriptionTransaction` (`:377`), que grava transacao e avanca `nextBillingDate`.

Impacto:
- Endpoints GET deixam de ser leitura pura: abrir transacoes, relatorio JSON, exportar PDF ou listar assinaturas pode criar movimentacoes e avancar recorrencias.
- Contas sem feature `automation` ainda podem disparar sincronizacao se existirem assinaturas ativas, criando uma divergencia entre o gate do layout e as rotas de API.
- Isso se relaciona ao P1 de cache Next: a mesma funcao de automacao escreve dados e chama `revalidateFinanceReports`, sendo usada em superficies de request, after hooks, cron e scripts.

Recomendacao:
- Separar `syncDueSubscriptionTransactions` em job/POST explicito ou `after()` controlado, evitando escrita antes de GETs de leitura/exportacao.
- Aplicar `requireSessionUser({ feature: "automation" })` nas rotas de assinatura e nos pontos que disparam geracao recorrente, se a feature realmente for premium.
- Manter GET de relatorios/transacoes idempotente: no maximo mostrar estado pendente ou enfileirar sync em background com gate de licenca.

### P2 - Relatorios e saldos carregam historico inteiro do tenant sem teto operacional

Evidencia:
- `web/lib/finance/reports.ts:227-249` aceita `from`/`to` customizados sem limite maximo de janela; se o intervalo for valido, `listMonthKeysBetween` monta todos os meses entre as datas.
- `web/lib/finance/reports.ts:280-285` filtra transacoes por `competence in (...)`, potencialmente com uma lista muito grande.
- Mesmo para um relatorio mensal, `getFinanceReport` carrega `balanceTransactions` sem filtro de periodo em `web/lib/finance/reports.ts:420-435`.
- `getAccountsWithComputedBalance` tambem carrega todas as transacoes do tenant/usuario em `web/lib/finance/accounts.ts:39-61` e so depois filtra o periodo em memoria em `:88-139`.
- A rota de contas chama esse helper em `web/app/api/accounts/route.ts:23-32`, e relatorios chamam em `web/lib/finance/reports.ts:419`.

Impacto:
- O custo de abrir contas/relatorios cresce com todo o historico da carteira, nao com o periodo solicitado.
- Um usuario autenticado pode pedir intervalos muito amplos em `/api/reports/summary` ou `/api/reports/pdf`, aumentando memoria/CPU e tempo de renderizacao PDF.
- Esse ponto se soma ao achado de GETs com side effect: uma tela de leitura pode ao mesmo tempo gerar recorrencias e carregar historico completo.

Recomendacao:
- Impor limite maximo para `from/to` em rotas de relatorio, por exemplo 12/24/36 meses conforme produto.
- Mover agregacoes de saldo para SQL ou snapshots, evitando carregar todas as transacoes em memoria para cada request.
- Separar saldo atual acumulado de metricas do periodo, com consultas/indexes especificos para cada finalidade.

### P1 - Retencao automatica encerra tenant com `delete` fisico

Evidencia:
- `web/app/api/cron/retention/route.ts:15-22` expoe a rotina de retencao por POST com `AUTOMATION_CRON_SECRET`.
- `web/app/api/admin/retention/route.ts:32-47` permite ao platform admin executar a rotina real quando `dryRun` e `false` e `confirm` e `ENCERRAR-CONTAS`.
- `web/lib/retention/service.ts:439-465` registra auditoria e depois chama `prisma.tenant.delete({ where: { id } })`.
- `web/lib/retention/service.ts:565-711` executa essa delecao para trial vencido sem billing autorizado e para inatividade quando o tenant chega ao stage 3.

Impacto:
- A rotina nao apenas suspende acesso; ela remove fisicamente o tenant e depende dos cascades reais do banco.
- Isso amplia o achado de delecao de usuario/tenant apagando trilha historica: a propria automacao de retencao pode destruir a conta e reduzir a capacidade de auditoria posterior.
- Em caso de policy mal configurada, cron indevido ou falso positivo de inatividade, a recuperacao fica dependente de backup/restore, nao de um rollback logico simples.

Recomendacao:
- Trocar encerramento automatico por soft-delete/suspensao (`isActive = false`, status de retencao, `closedAt`) e manter dados/auditoria por janela definida.
- Separar stage 3 em duas fases: bloquear acesso e somente apagar apos processo manual/backup confirmado.
- Registrar snapshot minimo do tenant, usuarios, plano e motivo em trilha fora do cascade antes de qualquer purge definitivo.

### P2 - Convite administrativo reutiliza convite ativo apenas por e-mail

Evidencia:
- `web/app/api/admin/invitations/route.ts:108-117` restringe criacao de convite administrativo a platform admin.
- A busca de convite ativo em `web/app/api/admin/invitations/route.ts:141-152` filtra apenas por e-mail, `acceptedAt`, `revokedAt` e `expiresAt`, sem `tenantId` e sem `kind`.
- Se encontrar um registro, a rota rotaciona o token desse convite em `web/app/api/admin/invitations/route.ts:162-172` e retorna `inviteUrl` com `reused: true` em `:174-183`.
- O fluxo novo esperado criaria tenant isolado e convite `InvitationKind.admin_isolated` em `web/app/api/admin/invitations/route.ts:204-228`.
- O aceite resolve o convite pelo token e define papel/tenant pelo proprio registro encontrado (`web/app/api/auth/accept-invitation/route.ts:35-60`).

Impacto:
- Ao tentar criar convite administrativo isolado para um e-mail, a plataforma pode reutilizar um convite pendente de outro tenant ou de `shared_wallet`.
- O link retornado pode colocar a pessoa no tenant/tipo errado, ou invalidar o token pendente anterior ao rotaciona-lo.
- O risco e limitado ao fluxo de platform admin, mas e uma confusao real de escopo entre convites, tenants e tipos.

Recomendacao:
- Para convite admin isolado, filtrar reuso por `kind: admin_isolated` e pelo tenant alvo, ou remover reuso global por e-mail.
- Retornar e auditar explicitamente `kind` e `tenantId` no caso de reuso.
- Ao reenviar/reusar, renovar `expiresAt` de forma deliberada ou informar que a expiracao original foi preservada.

### P2 - Aceite de classificacao pode promover regra global entre tenants sem moderacao

Evidencia:
- `web/app/api/transactions/[id]/classification/route.ts:68-82` confirma que a transacao pertence ao tenant atual.
- Se a transacao foi classificada por IA e o usuario confirma a mesma categoria, `shouldPromoteAiSuggestionGlobally` fica verdadeiro em `web/app/api/transactions/[id]/classification/route.ts:94-106`.
- A rota grava em `globalCategoryRule` por `type + normalizedKeyword + matchMode` e atualiza `categorySystemKey`, `priority: 750`, `confidence`, `acceptedCount` e `createdFromTenantId` em `web/app/api/transactions/[id]/classification/route.ts:156-190`.
- O modelo `GlobalCategoryRule` nao tem `tenantId` como chave de escopo (`web/prisma/schema.prisma:397-416`).
- `getGlobalClassificationRules` carrega todas as regras ativas em `web/lib/finance/classification-cache.ts:126-177`, e `resolveTransactionClassification` aplica essas regras antes das keywords globais em `web/lib/finance/transaction-classification.ts:152-166`.

Impacto:
- Uma confirmacao em um tenant pode criar ou sobrescrever regra aprendida que passa a classificar transacoes de outros tenants.
- Isso contrasta com o ponto positivo do Gemini estar restrito por schema: a resposta da IA e validada, mas o feedback do usuario ainda pode virar memoria global sem quorum, revisao ou isolamento.
- Uma keyword comum com prioridade alta pode enviesar classificacoes futuras em carteiras que nunca aceitaram aquela sugestao.

Recomendacao:
- Tornar regras aprendidas tenant-local por padrao.
- Promover regra global apenas com moderacao/admin ou limiar multi-tenant, com auditoria de origem e rollback.
- Evitar que uma unica confirmacao sobrescreva `categorySystemKey` global; no minimo exigir contagem, decaimento e confianca minima.

### P3 - DELETE de installments nao valida se o id e raiz de parcelamento

Evidencia:
- `web/app/api/installments/[id]/route.ts:17-30` deleta qualquer transacao do tenant cujo `id` seja o parametro ou cujo `parentId` aponte para ele.
- A propria rota PATCH valida antes que o alvo tenha `installmentsTotal > 1` em `web/app/api/installments/[id]/route.ts:47-59`.

Impacto:
- O endpoint semantico de grupo de parcelas tambem aceita id de transacao comum e retorna sucesso.
- Isso nao amplia tenant scope, mas enfraquece o invariante funcional e torna mais facil uma chamada de UI/API errada apagar lancamento individual pelo endpoint de grupo.

Recomendacao:
- Reaproveitar no DELETE a mesma verificacao do PATCH: raiz existente, tenant correto e `installmentsTotal > 1`.
- Retornar 404 quando o id nao for grupo de parcelas e registrar `deleted.count` para rastreabilidade.

### P3 - Cadastro publico enumera e-mail existente

Evidencia:
- `web/app/api/auth/register/route.ts:64-95` aplica throttle por e-mail/IP.
- Depois do throttle, a rota busca usuario por e-mail em `web/app/api/auth/register/route.ts:108-118`.
- Se existir, responde 409 com mensagem explicita: "Este e-mail ja possui uma conta..." (`web/app/api/auth/register/route.ts:120-126`).
- O fluxo de recuperacao de senha usa resposta generica para e-mail inexistente em `web/app/api/auth/forgot-password/route.ts:72-92`, mostrando que o projeto ja conhece o padrao anti-enumeracao.

Impacto:
- Um atacante com baixa taxa, mas persistente, consegue confirmar se determinado e-mail tem conta no produto.
- O throttle reduz abuso volumetrico, mas nao remove o canal de enumeracao.

Recomendacao:
- Retornar resposta generica para cadastro quando o e-mail ja existe, por exemplo orientar login/recuperacao sem confirmar existencia.
- Manter telemetria interna/auditoria para tentativa duplicada e usar UX progressiva no front.

## Desconfirmacoes e ajustes de precisao

- `DATABASE_URL` ausente no `.env` raiz nao e problema para Docker Compose: `docker-compose.yml:18`, `:48`, `:67` e `:89` injetam `DATABASE_URL` a partir de `POSTGRES_*` nos servicos relevantes.
- O `.env` atualizado esta coerente para provedores externos: `EMAIL_PROVIDER=resend` tem `RESEND_API_KEY`; billing Mercado Pago habilitado tem chaves principais; WhatsApp habilitado tem token, access token, phone number id e app secret.
- As rotas admin revisadas usam `requireAdminUser`/`isPlatformAdmin`, incluindo `admin/users`, `admin/tenants`, `admin/plans`, `admin/support` e billing admin.
- Nao confirmei vazamento direto de chamados de suporte entre usuarios/tenants: historico, rating e reopen filtram por `tenantId` + `userId`, enquanto as rotas admin de suporte aplicam `tenantId` para admin comum e escopo amplo apenas para platform admin.
- Os guards multi-tenant para referencias financeiras existem em `web/lib/finance/tenant-reference-guard.ts` e sao usados nos fluxos principais de transacoes, assinaturas, metas, contas/cartoes/categorias.
- As rotas de billing que pareciam publicas delegam para `lib/billing/service.ts`, que chama `getBillingSessionAccess({ requireManager: true })` nos fluxos de checkout, portal, assinatura, troca de cartao e cancelamento.
- Backup operacional esta configurado no `.env`: `BACKUP_ENCRYPTION_PASSPHRASE` presente, backup GitHub habilitado com token presente, retenção local de 14 dias. O ponto pendente e o deploy nao ativar backup preventivo por padrao.
- Requisicoes externas server-side revisadas nao mostram URL controlada pelo usuario em fluxos principais: Resend/Brevo/Mercado Pago/Graph API usam destinos fixos; Gemini usa `GEMINI_BASE_URL` de ambiente; download de midia usa URL retornada pela Graph API do WhatsApp com timeout e limite de 18 MB.
- Varredura refinada de segredos fora de `.env` nao encontrou padroes live/high-confidence como private key, AWS key, GitHub PAT, OpenAI key, Resend live key, Mercado Pago live token ou JWT completo.

## Pontos positivos confirmados

- Dockerfile usa `node:24-alpine`, `npm ci --no-audit --no-fund`, standalone e usuario nao-root.
- TypeScript esta com `strict: true`.
- Nao encontrei uso de `$queryRawUnsafe`, `$executeRawUnsafe`, `eval` ou `new Function`.
- O unico `dangerouslySetInnerHTML` injeta script estatico de tema (`themeBootstrapScript`) com nonce.
- Cron routes exigem `AUTOMATION_CRON_SECRET` via Bearer ou `x-automation-secret`.
- Webhooks:
  - WhatsApp verifica token no GET e assinatura `x-hub-signature-256` no POST.
  - Resend valida assinatura Svix com tolerancia de timestamp.
  - Mercado Pago enfileira evento e valida `x-signature`/`x-request-id` com HMAC e `timingSafeEqual`.
- Billing routes sem guard explicito no arquivo delegam acesso para `lib/billing/access.ts`, que usa `getCurrentTenantAccess`.
- Backup e restore test passaram em Docker isolado.
- CSP existe na resposta real, aplicada via `proxy.ts` com nonce. O achado anterior de CSP ausente foi desconfirmado.
- A classificacao com Gemini limita a resposta por `responseJsonSchema` e revalida categoria sugerida contra categorias reais antes de persistir (`web/lib/finance/category-classifier.ts:611-629`, `:687-703`).
- Webhook WhatsApp valida assinatura antes de parsear/persistir eventos (`web/app/api/integrations/whatsapp/webhook/route.ts:42-45`) e usa HMAC com `timingSafeEqual` (`web/lib/whatsapp/cloud-api.ts:176-194`).
- A sessao JWT nao fica confiando apenas em claims antigas: `web/lib/auth/auth-config.ts:185-211` recarrega `role`, `tenantId` e `isPlatformAdmin` do banco ao montar a sessao, e `web/lib/licensing/server.ts:26-68` revalida usuario ativo/tenant no acesso atual.

## Scripts de auditoria nao expostos no package.json

Existem 14 scripts de auditoria/smoke/e2e em `web/scripts` sem atalho `npm run audit:*`, incluindo:
- `runtime-regression-audit.ts`
- `subscription-classification-audit.ts`
- `transaction-classification-precedence-audit.ts`
- `category-classification-audit.ts`
- `whatsapp-webhook-e2e-sim.ts`
- `notification-template-smoke.ts`

Recomendacao:
- Expor os auditores mais importantes no `package.json` e criar um `audit:all:local` que rode somente os self-contained.

## ObsidianVault

Notas relevantes usadas:
- `06-Runbooks/SavePointFinance - Operacao e Verificacao.md`
- `02-IAs/Configuracoes/SavePointFinance - Configuracao Codex e IA.md`
- `01-Projetos/SavePointFinance.md`

O runbook continua alinhado ao fluxo testado: Docker Compose, migrate, smoke, auditorias e variaveis operacionais.

## Ordem recomendada de correcao

1. Corrigir drift de indices e FKs entre banco novo e Prisma schema, depois validar `migrate` + `bootstrap-admin` em banco limpo.
2. Ajustar usuario de smoke no `.env` ou criar `LOCAL_OWNER_EMAIL`/`LOCAL_OWNER_PASSWORD` no bootstrap.
3. Corrigir `audit:finance-consistency`.
4. Corrigir `runtime-regression-audit` para valores inteiros.
5. Blindar `revalidateTag` em jobs/scripts.
6. Recriar templates `.env.example` por ambiente, sem segredos.
7. Adicionar harness de testes formal para regras financeiras, auth e billing.
8. Adicionar healthcheck HTTP para `web` e revisar exposicao de Postgres no servidor.
9. Atualizar `next/postcss` quando houver versao compativel e reexecutar build/smokes.
