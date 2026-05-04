# Consolidado de Achados - Auditoria SavePointFinance - 2026-05-04

Fonte principal: `AUDIT_REPORT_2026-05-04.md`.

Total consolidado: 41 achados confirmados.

## P1 - Criticos / Alta Prioridade

1. Fresh bootstrap ainda quebra
   - Banco limpo falha no `bootstrap-admin` por drift entre migration inicial e schema atual em indices `tenantId/name` vs `ownerUserId/name`.

2. Drift de FKs entre Prisma schema e banco novo
   - O schema espera `Cascade`, mas migrations antigas deixam FKs reais com `SET NULL`, mudando comportamento de exclusao.

3. Auditoria financeira ainda falha
   - A regra de fatura/cartao em `previous_month` continua inconsistente e o auditor financeiro confirma divergencia.

4. Runtime regression falha em valor inteiro
   - POST de transacao valida defaults, mas usa `body` bruto em campos como `installments`, quebrando parcelamento.

5. Drift de FKs muda o comportamento real de delecao de contas e cartoes
   - Excluir conta/cartao pode preservar transacoes com FK nula no banco real, apesar do schema sugerir cascade.

6. Automacao de assinaturas esta acoplada ao cache do Next
   - Jobs/scripts chamam `revalidateTag` fora de contexto Next e podem falhar ao processar recorrencias.

7. Parcelamento com defaults validados ainda usa `body` bruto
   - O schema aplica default, mas a rota usa `body.amount`/`body.installments`, ignorando `parsedData`.

8. Familiar pode alterar contas/cartoes sem guard de gerenciamento
   - Usuario `member` consegue criar/editar/excluir contas e cartoes estruturais da carteira compartilhada.

9. Webhook Mercado Pago com assinatura invalida entra na fila reprocessavel
   - Evento invalido e rejeitado no HTTP, mas fica persistido como `failed` e elegivel ao processador.

10. Retencao automatica encerra tenant com `delete` fisico
    - A rotina de retencao pode chamar `prisma.tenant.delete`, transformando inatividade/trial vencido em remocao fisica dependente de backup.

## P2 - Importantes

11. Smoke operacional do `.env` esta inconsistente
    - Variaveis para smoke/local podem apontar para usuario nao coerente com bootstrap/admin.

12. `subscription-classification-audit` roda fora de contexto Next
    - Auditor usa funcao que chama cache Next e falha fora do runtime correto.

13. Dependencias com vulnerabilidade moderada
    - `npm audit` confirmou vulnerabilidade moderada pendente.

14. Templates de env ausentes
    - Arquivos de template esperados nao existem, dificultando reproducibilidade segura.

15. Nao ha harness formal de testes
    - Auditores existem, mas varios nao estao expostos em `package.json` nem agrupados num comando oficial.

16. Documentacao referencia templates de env que nao existem
    - Docs apontam para artefatos ausentes, causando onboarding/deploy impreciso.

17. Deploy permite migration sem backup obrigatorio e rollback nao reverte schema
    - Script operacional aceita migrar sem backup preventivo por padrao e rollback nao desfaz banco.

18. Mutacoes autenticadas nao mostram protecao CSRF/Origin propria
    - Muitas rotas mutantes dependem de cookies/sessao, mas poucas validam Origin/CSRF explicitamente.

19. Senhas nao tem limite maximo antes de bcrypt
    - Login, reset, convite, cadastro e reset admin aceitam senha sem `.max(...)` antes de hashing.

20. Reset de senha e aceite de convite nao usam throttling proprio
    - Tokens sao fortes, mas endpoints sensiveis nao limitam tentativa por IP/token.

21. Campos monetarios nao tem teto compativel com `Decimal(15,2)`
    - Schemas aceitam numeros maiores que a precisao real do banco.

22. Data de transacao aceita datas inexistentes por coercao JS
    - `z.coerce.date()` aceita datas como `2026-02-31` e normaliza para outro dia.

23. Familiar tambem pode alterar categorias globais da carteira
    - Categorias do tenant podem ser criadas/editadas/removidas por `member`, afetando classificacao e limites.

24. Exclusao de usuario apaga trilha historica de auditoria
    - Fluxos de delete removem logs ou deixam FKs em cascade, apagando contexto historico de auditoria.

25. Sincronizacao de assinaturas recorrentes roda em GET e sem feature gate consistente
    - Rotas de leitura podem criar transacoes recorrentes e furar o gate da feature `automation`.

26. Relatorios e saldos carregam historico inteiro do tenant sem teto operacional

27. Convite administrativo reutiliza convite ativo apenas por e-mail
    - Criacao de convite admin isolado pode rotacionar/reusar convite pendente de outro tenant ou de `shared_wallet`, pois o lookup nao filtra `tenantId` nem `kind`.

28. Aceite de classificacao pode promover regra global entre tenants sem moderacao
    - Confirmar uma sugestao de IA em um tenant pode criar/alterar `GlobalCategoryRule` usada por outros tenants.
    - Relatorios/contas carregam transacoes historicas amplas e filtram parte em memoria.

## P3 - Menores / Hardening / Operacionais

29. `web` nao tem healthcheck no Compose
    - Compose depende de servicos auxiliares, mas nao valida HTTP do app web.

30. Postgres exposto no host por padrao
    - Banco fica publicado no host, ampliando superficie em servidor.

31. Metadado de package manager ausente
    - Falta `packageManager`, reduzindo reprodutibilidade de install/build.

32. Lookup legado por token de convite em texto puro
    - Rotas ainda aceitam token legado em claro alem do hash, mantendo compatibilidade com risco residual.

33. Templates ausentes sao mascarados por fallback embutido
    - Codigo/scripts conseguem seguir com defaults, escondendo ausencia dos templates reais.

34. Suporte autenticado envia email externo sem limite de taxa
    - Abertura/reabertura de chamados pode consumir cota Resend sem throttle por usuario/ticket.

35. Popup individual de suporte ignora validacao central de URL
    - Rota especial de suporte cria popup direto e nao reaproveita validacao `http(s)`/caminho interno.

36. Reabertura de suporte confirma sucesso mesmo se o e-mail falhar
    - Ticket reabre, mas falha de envio externo nao e persistida nem comunicada como 202/degradado.

37. Admin de planos usa type assertion em vez de schema
    - Rotas admin de planos fazem cast manual e validacao parcial de limites/flags.

38. CSP existe, mas ainda permite `unsafe-eval`
    - Politica CSP foi confirmada, mas `unsafe-eval` permanece ativo globalmente.

39. Healthcheck publico revela nomes de variaveis sensiveis ausentes

40. DELETE de installments nao valida se o id e raiz de parcelamento
    - O endpoint de grupo de parcelas apaga por `id`/`parentId` sem checar `installmentsTotal > 1`, diferente do PATCH.

41. Cadastro publico enumera e-mail existente
    - Registro publico retorna 409 explicito para e-mail ja cadastrado, embora tenha throttle e o reset de senha use resposta generica.
    - `/api/health` publico mostra nomes de secrets/configs faltantes e dados operacionais.

## Achados desconfirmados ou ajustados

- `.env` atualizado esta coerente para provedores externos principais.
- `DATABASE_URL` ausente no `.env` raiz nao quebra Docker Compose, pois Compose monta a URL pelos `POSTGRES_*`.
- CSP nao esta ausente; existe em `proxy.ts`, mas precisa hardening.
- Webhook WhatsApp valida assinatura antes de parse/persist.
- Resend e Mercado Pago possuem validacao de assinatura, embora Mercado Pago tenha o problema de persistir evento invalido.
- Guards multi-tenant para referencias financeiras existem nos fluxos principais.
- Billing routes delegam guard de acesso para `lib/billing/access.ts`/`service.ts`.
- Varredura refinada nao encontrou segredos live/high-confidence fora de `.env`.
- Suporte nao mostrou vazamento direto de tickets entre usuarios/tenants.
- ObsidianVault foi reconsultado e nao contradisse os achados; as notas reforcam Docker, auditorias, billing, backup e cuidados operacionais.
