# Auditoria Unificada Final - SavePointFinance - 2026-05-04

Documento unico consolidado a partir de:
- `AUDIT_REPORT_2026-05-04.md`
- `AUDIT_FINDINGS_CONSOLIDATED_2026-05-04.md`
- `AUDIT_NEXT_AREAS_2026-05-04.md`
- Notas relevantes em `C:\Users\samue\Desktop\ObsidianVault`

Total: 41 achados confirmados.

## Resumo executivo

A auditoria confirmou problemas funcionais, operacionais e de seguranca em cinco eixos principais:

1. Drift entre schema Prisma, migrations e banco real.
2. Rotas mutantes e jobs com efeitos colaterais em contextos de leitura, cron ou script.
3. Falhas de escopo entre tenant, convite, sharing e memoria global de classificacao.
4. Operacoes destrutivas sem soft-delete/auditoria resiliente.
5. Ausencia de harness formal que execute auditores, smokes e regressions de forma confiavel.

O `.env` atualizado melhorou a consistencia dos provedores externos, mas nao remove os achados estruturais.

## Mapa causal

- Drift de banco explica bootstrap quebrado, divergencia de FKs e risco de delecao inconsistente.
- Uso de dados brutos apos validacao explica regressao de parcelamento e riscos em casts manuais.
- Jobs financeiros acoplados ao Next/cache explicam falhas fora do runtime e GETs com escrita.
- Ausencia de guard de papel em areas estruturais explica familiar alterando contas, cartoes e categorias.
- Delecao fisica de usuario/tenant conecta perda de auditoria, retencao automatica e dependencia de backup.
- Escopo incompleto conecta convite admin por e-mail, token legado, aceite de convite e reuso de links.
- Classificacao IA validada localmente ainda pode contaminar outros tenants via regra global.

## P1 - Criticos / Alta Prioridade

1. Fresh bootstrap ainda quebra
   - Banco limpo falha no `bootstrap-admin` por drift entre migration inicial e schema atual em indices de categoria.

2. Drift de FKs entre Prisma schema e banco novo
   - O schema espera `Cascade`, mas migrations antigas deixam FKs reais com `SET NULL`.

3. Auditoria financeira ainda falha
   - Regra de fatura/cartao em `previous_month` continua divergente no auditor financeiro.

4. Runtime regression falha em valor inteiro
   - POST de transacao valida defaults, mas usa `body` bruto e quebra parcelamento.

5. Drift de FKs muda o comportamento real de delecao de contas e cartoes
   - Excluir conta/cartao pode preservar transacoes com FK nula no banco real.

6. Automacao de assinaturas esta acoplada ao cache do Next
   - Jobs/scripts chamam `revalidateTag` fora de contexto Next.

7. Parcelamento com defaults validados ainda usa `body` bruto
   - A rota ignora `parsedData` em campos criticos como `amount` e `installments`.

8. Familiar pode alterar contas/cartoes sem guard de gerenciamento
   - Usuario `member` consegue criar/editar/excluir estruturas globais da carteira.

9. Webhook Mercado Pago com assinatura invalida entra na fila reprocessavel
   - Evento invalido e rejeitado no HTTP, mas fica persistido como `failed` e elegivel ao processador.

10. Retencao automatica encerra tenant com `delete` fisico
    - A rotina pode chamar `prisma.tenant.delete`, removendo fisicamente a conta por inatividade/trial vencido.

## P2 - Importantes

11. Smoke operacional do `.env` esta inconsistente
    - Variaveis de smoke/local podem apontar para usuario nao coerente com bootstrap/admin.

12. `subscription-classification-audit` roda fora de contexto Next
    - Auditor usa funcao que chama cache Next e falha fora do runtime correto.

13. Dependencias com vulnerabilidade moderada
    - `npm audit` confirmou vulnerabilidade moderada pendente.

14. Templates de env ausentes
    - Arquivos de template esperados nao existem.

15. Nao ha harness formal de testes
    - Auditores existem, mas varios nao estao expostos em `package.json`.

16. Documentacao referencia templates de env que nao existem
    - Docs apontam para artefatos ausentes.

17. Deploy permite migration sem backup obrigatorio e rollback nao reverte schema
    - Script operacional aceita migrar sem backup preventivo por padrao.

18. Mutacoes autenticadas nao mostram protecao CSRF/Origin propria
    - Muitas rotas mutantes dependem de cookies/sessao sem Origin/CSRF proprio.

19. Senhas nao tem limite maximo antes de bcrypt
    - Login, reset, convite, cadastro e reset admin aceitam senha sem `.max(...)`.

20. Reset de senha e aceite de convite nao usam throttling proprio
    - Endpoints sensiveis nao limitam tentativa por IP/token.

21. Campos monetarios nao tem teto compativel com `Decimal(15,2)`
    - Schemas aceitam numeros maiores que a precisao real do banco.

22. Data de transacao aceita datas inexistentes por coercao JS
    - `z.coerce.date()` aceita datas impossiveis e normaliza para outro dia.

23. Familiar tambem pode alterar categorias globais da carteira
    - `member` consegue mudar categorias que afetam classificacao e limites.

24. Exclusao de usuario apaga trilha historica de auditoria
    - Fluxos de delete removem logs ou deixam FKs em cascade.

25. Sincronizacao de assinaturas recorrentes roda em GET e sem feature gate consistente
    - Rotas de leitura podem criar transacoes recorrentes e furar o gate de `automation`.

26. Relatorios e saldos carregam historico inteiro do tenant sem teto operacional
    - Relatorios/contas carregam historico amplo e filtram parte em memoria.

27. Convite administrativo reutiliza convite ativo apenas por e-mail
    - Criacao de convite admin isolado pode reusar convite de outro tenant ou `shared_wallet`.

28. Aceite de classificacao pode promover regra global entre tenants sem moderacao
    - Confirmar uma sugestao de IA em um tenant pode alterar `GlobalCategoryRule` usada por outros tenants.

## P3 - Menores / Hardening / Operacionais

29. `web` nao tem healthcheck no Compose
    - Compose nao valida HTTP do app web.

30. Postgres exposto no host por padrao
    - Banco fica publicado no host.

31. Metadado de package manager ausente
    - Falta `packageManager`.

32. Lookup legado por token de convite em texto puro
    - Rotas ainda aceitam token legado em claro alem do hash.

33. Templates ausentes sao mascarados por fallback embutido
    - Codigo/scripts seguem com defaults, escondendo ausencia de templates.

34. Suporte autenticado envia email externo sem limite de taxa
    - Abertura/reabertura de chamados pode consumir cota sem throttle.

35. Popup individual de suporte ignora validacao central de URL
    - Rota especial cria popup sem reaproveitar validacao central.

36. Reabertura de suporte confirma sucesso mesmo se o e-mail falhar
    - Ticket reabre sem persistir/comunicar falha de envio externo.

37. Admin de planos usa type assertion em vez de schema
    - Rotas admin de planos fazem cast manual e validacao parcial.

38. CSP existe, mas ainda permite `unsafe-eval`
    - Politica CSP foi confirmada, mas `unsafe-eval` permanece ativo.

39. Healthcheck publico revela nomes de variaveis sensiveis ausentes
    - `/api/health` publico mostra nomes de configs/secrets faltantes.

40. DELETE de installments nao valida se o id e raiz de parcelamento
    - Endpoint de grupo apaga por `id`/`parentId` sem checar `installmentsTotal > 1`.

41. Cadastro publico enumera e-mail existente
    - Registro publico retorna 409 explicito para e-mail ja cadastrado.

## Desconfirmacoes e ajustes

- `.env` atualizado esta coerente para provedores externos principais.
- `DATABASE_URL` ausente no `.env` raiz nao quebra Docker Compose, pois Compose monta a URL pelos `POSTGRES_*`.
- CSP nao esta ausente; existe em `proxy.ts`, mas precisa hardening.
- Webhook WhatsApp valida assinatura antes de parse/persist.
- Resend valida assinatura Svix com tolerancia de timestamp.
- Mercado Pago valida assinatura, embora persista evento invalido como processavel.
- Guards multi-tenant para referencias financeiras existem nos fluxos principais.
- Billing routes delegam guard para `lib/billing/access.ts`/`service.ts`.
- Varredura refinada nao encontrou segredos live/high-confidence fora de `.env`.
- Suporte nao mostrou vazamento direto de tickets entre usuarios/tenants.
- ObsidianVault nao contradisse os achados; reforcou Docker, auditorias, billing, backup e cuidados operacionais.

## Ordem recomendada de correcao

1. Corrigir drift de migrations/FKs e validar bootstrap em banco limpo.
2. Corrigir parcelamento e regressions que usam `body` bruto depois de schema.
3. Desacoplar jobs financeiros de cache Next e remover escrita de GETs.
4. Bloquear alteracoes estruturais para `member` em contas, cartoes e categorias.
5. Trocar delecao fisica de usuario/tenant/retencao por soft-delete com auditoria preservada.
6. Corrigir escopo de convites por `kind`/`tenantId` e throttling de aceite/reset.
7. Tornar regras aprendidas de classificacao tenant-local ou moderadas.
8. Recriar templates `.env.example` e alinhar docs/runbooks.
9. Criar harness `audit:all`/`test` para auditores self-contained, Docker e Next.
10. Fechar hardening operacional: healthcheck web, Postgres host, CSP, rate limits e health publico.

