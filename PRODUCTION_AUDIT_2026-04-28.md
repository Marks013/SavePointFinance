# Auditoria de Producao - 2026-04-28

Projeto auditado no servidor: `/home/ubuntu/SavePointFinance`
Host: `161.153.198.128`
Dominio: `https://savepointfinanca.site`

## Veredito

Pronto tecnicamente nos checks automatizados executados. As credenciais Mercado Pago ativas permanecem de producao, e os fluxos de pagamento/assinatura foram validados com credenciais sandbox em processo isolado de teste.

## Evidencias positivas

- `/api/health` publico respondeu `200` com database `ok` e environment `ok`.
- Containers `savepoint_web`, `savepoint_db` e `savepoint_backup` estavam ativos; `savepoint_db` healthy.
- `sudo docker compose build web` passou: Prisma generate, Next build, TypeScript e geracao de 79 rotas/paginas.
- `sudo npm run verify:server-smoke` passou apos criar usuario tecnico familiar dedicado.
- `sudo npm run audit:billing-webhook` passou com `BILLING_WEBHOOK_E2E_SIM_OK`.
- Webhook Mercado Pago:
  - `GET /api/integrations/mercadopago/webhook` respondeu `405`.
  - `POST` sem assinatura valida respondeu `401`.
- WhatsApp webhook:
  - Verify token invalido respondeu `403`.
  - POST sem assinatura respondeu `401`.
  - Handshake GET com token valido respondeu `200` e devolveu o challenge.
- Resend webhook invalido respondeu `400`.
- Configuracao de checkout no container esta presente: billing habilitado, token/secret presentes, mensal `14.90`, anual `150.00`, parcelas `12`, URL publica configurada.
- Tabelas de billing ficaram limpas apos o teste: `BillingWebhookEvent=0`, `BillingSubscription=0`, `BillingPayment=0`.
- O container `savepoint_web` foi recriado com a imagem nova `sha256:39e8ce800c3607fa30d7f175a8bfdb0d2311ed4d6b50414f895aa77a94fa1072`.
- Apos a recriacao, `/api/health` seguiu `200` e nao apareceram novos logs `Failed to find Server Action` na janela verificada.
- Teste controlado Mercado Pago com API de producao e cartao oficial de teste:
  - Tokenizacao do cartao de teste: `201`.
  - Criacao de pagamento controlado de R$ 1,00: `201`, status `rejected`, detalhe `cc_rejected_high_risk`; sem aprovacao, sem estorno necessario.
  - Consulta do pagamento: `200`.
  - Criacao de preference para fluxo anual: `201`, com `init_point` e `sandbox_init_point`, expirada em poucos minutos.
  - Tentativa de preapproval mensal: recusada pela API com `401 CC_VAL_433 Credit card validation has failed`; nenhuma assinatura foi criada.
  - Webhooks de teste gerados foram removidos; tabelas `BillingWebhookEvent`, `BillingSubscription` e `BillingPayment` voltaram a `0`.
  - Arquivos temporarios/cache escopados: `remaining_tmp=0`, `remaining_audit_containers=0`, `remaining_audit_images=0`.
- Teste Mercado Pago com credenciais sandbox `TEST-*` implantadas em producao:
  - `.env` e container `web` passaram a usar `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY` de teste.
  - Pagamento direto sandbox com Visa APRO e pagador controlado: `201 approved/accredited`.
  - Estorno do pagamento sandbox aprovado: `201 approved`.
  - Matriz de e-mails confirmou que o pagador funcional para estas credenciais foi `mp-controlled-test@savepointfinanca.site`; os usuarios `test_user_*@testuser.com` informados foram recusados pela API com `Payer email forbidden`.
  - Preference/checkout anual direto: `201`.
  - Endpoint do app `/api/billing/checkout/create-annual-payment`: `201`, mensagem `Checkout anual iniciado`.
  - Preapproval/assinatura mensal direta e pelo app falhou na API Mercado Pago com `Card token service not found`; nenhuma assinatura mensal foi criada.
  - Registros de teste removidos: `BillingWebhookEvent=0`, `BillingSubscription=0`, `BillingPayment=0`, usuario tecnico removido.
  - Dados de teste persistidos no `.env` para uso futuro (`MP_TEST_*`, cartoes de teste, contas de teste e webhook de teste).
- Correcao do fluxo mensal recorrente:
  - O backend agora tenta criar a assinatura autorizada com `card_token_id`.
  - Se a API Mercado Pago responder `Card token service not found`, o backend faz fallback para `/preapproval` com `status: pending`, sem `card_token_id`, e devolve o link de checkout mensal.
  - Teste temporario com `MP_TEST_*`: endpoint `/api/billing/checkout/create-subscription` respondeu `201`, mensagem `Checkout mensal iniciado`, URL Mercado Pago presente.
  - Registro criado ficou `status=pending`, `checkoutKind=pending_checkout`, com `mercadoPagoPreapprovalId`.
  - Preapproval de teste cancelado via API Mercado Pago: `200`, status `cancelled`.
  - Banco limpo depois do teste: `BillingWebhookEvent=0`, `BillingSubscription=0`, `BillingPayment=0`, usuario tecnico removido.
  - Ambiente final restaurado para producao ativa (`MP_ACCESS_TOKEN`/`MP_PUBLIC_KEY` `APP_USR-*`) mantendo credenciais de teste em `MP_TEST_*`.
- Teste E2E sandbox de mudanca/cancelamento/reembolso/retorno ao gratis:
  - Tenant tecnico criado em plano gratis.
  - Pagamento sandbox Visa/APRO aprovado via API Mercado Pago.
  - Sync do pagamento aplicou `plan-premium-completo` e assinatura `authorized`.
  - Reembolso sandbox aprovado, sync posterior marcou pagamento `refunded` e assinatura `canceled`.
  - Tenant retornou para `plan-gratuito-essencial`.
  - Cleanup validado: `tenants=0`, `subscriptions=0`, `payments=0` para o marcador `mp-plan-e2e`.
  - Pagamento sandbox orfao de tentativa interrompida tambem foi localizado e estornado.

## Correcoes feitas

1. Usuario familiar de smoke:
   - O usuario real `mrsammy01@pm.me` voltou para `isActive=false`.
   - Foi criado/atualizado o usuario tecnico `smoke-family@savepoint.local` como `member`, `isPlatformAdmin=false`, `isActive=true`.
   - `.env` agora aponta `FAMILY_USER_EMAIL` para `smoke-family@savepoint.local`.

2. Divergencia de commits:
   - Servidor/origin: `ddfbba8`.
   - Local foi atualizado para `ddfbba8`.
   - Backup local do estado antigo criado em `codex/local-before-ddfbba8`.

3. Server Actions:
   - O container antigo usava imagem criada em `2026-04-26`.
   - A imagem nova criada em `2026-04-28` foi ativada recriando `savepoint_web`.

## Ressalvas antes de liberar

1. Credenciais Mercado Pago ativas agora sao de producao:
   - `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY` voltaram para `APP_USR-*`.
   - Credenciais sandbox e dados de teste ficaram preservados em `MP_TEST_*`.
   - Checkout anual, pagamento sandbox, fallback mensal recorrente, ativacao de plano, reembolso e retorno ao plano gratis foram validados com sandbox.

2. O ambiente direto do servidor esta com dependencias de desenvolvimento ausentes:
   - `npm run typecheck` falha porque `tsc` nao existe no `node_modules` de producao.
   - As auditorias devem ser rodadas via Docker ops profile, como feito.

## Proximo passo recomendado

- Opcional: commitar a correcao do fallback mensal recorrente e abrir deploy formal, porque o servidor ja foi atualizado manualmente e validado.
