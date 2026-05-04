# Proximas Frentes de Auditoria - SavePointFinance - 2026-05-04

Esta lista nao duplica os 36 achados confirmados. Ela aponta areas que ainda valem investigacao adicional.

## Prioridade Alta

1. Convites e cadastro publico
   - Verificar enumeracao de e-mail em cadastro publico, consulta de convite por token, aceite/revogue/resend e throttling de envio.

2. Sharing familiar
   - Auditar convite, revogacao, limite de membros, reenvio, entrega de e-mail e consistencia entre titular, admin e member.

3. Installments e classification updateMany/deleteMany
   - Revisar `web/app/api/installments/[id]/route.ts` e `web/app/api/transactions/[id]/classification/route.ts` para efeitos em massa, tenant guard e idempotencia.

4. Retencao automatica
   - Confirmar se encerramento por inatividade/trial usa ator correto, preserva auditoria, respeita grace period e nao apaga conta errada em edge cases.

## Prioridade Media

5. Rotas admin com casts manuais
   - Ampliar a revisao alem de planos: invitations, tenants, retention, profile e sharing ainda aparecem com `request.json()` tipado manualmente.

6. Billing admin e reparos financeiros
   - Auditar acoes de sync, process queue, tithe recalculation, installments reconciliation e suas permissoes/logs.

7. Health, maintenance e observabilidade publica
   - Depois do achado de `/api/health`, revisar bypass de manutencao, exposicao de estados operacionais e scripts de smoke.

8. Test harness de auditores
   - Mapear todos os scripts em `web/scripts`, separar self-contained vs dependentes de Docker/Next e criar uma matriz de cobertura.

## Prioridade Baixa / Hardening

9. Email externo fora de suporte
   - Revisar convites, sharing, notificacoes e retention para rate limit, retry, status persistido e erros operacionais.

10. Build artifacts e hygiene
   - A varredura encontrou artefatos `.next` dentro da arvore local; convem confirmar se `.gitignore`/cleanup/relatorio ignoram build output.

11. Unicidade e normalizacao
   - Revisar e-mail e WhatsApp com foco em unique index, lower-case, legado importado e migracoes antigas.

12. Performance de listas admin
   - Revisar listagens com `take` fixo, sort em memoria, ausencia de cursor e filtros por tenant em admin/support/audit/tenants.
