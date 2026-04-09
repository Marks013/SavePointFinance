# SavePointFinance Auto-Classificacao 2.0

## Goal
Redesenhar a auto-classificacao para ficar mais barata, previsivel e rapida, sem quebrar o modelo multi-tenant ja existente no SavePointFinance.

## Current State
- `Category` ja guarda palavras-chave por tenant em `keywords`, mas nao existe uma entidade separada de regra reutilizavel. Isso mistura taxonomia com matching. Ver [schema.prisma](/C:/Users/User/Desktop/SavePointFinance/web/prisma/schema.prisma#L186) e [default-categories.ts](/C:/Users/User/Desktop/SavePointFinance/web/lib/finance/default-categories.ts#L41).
- `Transaction` so persiste `aiClassified` e `aiConfidence`. Nao existe `classificationSource`, `matchedKeyword`, `reviewedByUser` ou `ruleId`. Ver [schema.prisma](/C:/Users/User/Desktop/SavePointFinance/web/prisma/schema.prisma#L262).
- O fluxo atual carrega todas as categorias do tenant, busca ate 120 transacoes historicas e chama um classificador que mistura aliases hardcoded, sinais por estabelecimento, matching de keywords e Gemini no mesmo modulo. Ver [transaction-classification.ts](/C:/Users/User/Desktop/SavePointFinance/web/lib/finance/transaction-classification.ts#L24) e [category-classifier.ts](/C:/Users/User/Desktop/SavePointFinance/web/lib/finance/category-classifier.ts#L664).
- A revisao manual apenas troca `categoryId` e limpa flags de IA. Ela nao gera memoria persistente para classificacoes futuras. Ver [route.ts](/C:/Users/User/Desktop/SavePointFinance/web/app/api/transactions/[id]/classification/route.ts#L13).
- O mesmo classificador tambem e consumido por transacoes manuais, assinaturas e WhatsApp. Ver [transactions route](/C:/Users/User/Desktop/SavePointFinance/web/app/api/transactions/route.ts#L190), [subscriptions route](/C:/Users/User/Desktop/SavePointFinance/web/app/api/subscriptions/route.ts#L105) e [assistant.ts](/C:/Users/User/Desktop/SavePointFinance/web/lib/whatsapp/assistant.ts#L346).

## Architectural Diagnosis
O problema central nao e so o prompt do Gemini. O problema e de separacao de responsabilidades.

Hoje o sistema usa:
- `Category.keywords` como taxonomia, regra manual e memoria historica ao mesmo tempo.
- `category-classifier.ts` como motor de scoring local, base global brasileira e gateway de IA ao mesmo tempo.
- `Transaction` como unico registro de decisao, sem trilha suficiente para reaproveitar o aprendizado.

Esse desenho funciona para um MVP, mas degrada quando o volume cresce porque:
- toda classificacao refaz leitura de categorias e historico;
- override manual nao vira regra reutilizavel;
- IA continua necessaria para descricoes parecidas;
- nao existe precedencia formal entre regra manual, regra aprendida, contexto global e fallback.

## Target Architecture

### Decision 1
Separar taxonomia de categoria das regras de classificacao.

### Decision 2
Introduzir um dicionario global em memoria, mas nao amarrado a nomes mutaveis de categoria.

### Decision 3
Persistir regras aprendidas e overrides manuais em tabela propria, com prioridade explicita.

### Decision 4
Transformar IA em ultimo recurso, e preferencialmente assíncrono para itens nao resolvidos localmente.

## Domain Model

### 1. Category
Manter `Category`, mas adicionar um identificador canonico estavel para categorias default.

Campos novos recomendados:
- `systemKey String?`
- `slug String?` opcional, apenas para URLs ou UX

Decisao:
- usar `systemKey` para o motor interno, nao `slug`.

Rationale:
- o usuario pode renomear "Supermercado" para "Mercado da casa";
- `systemKey = "mercado"` continua estavel;
- categorias criadas pelo usuario podem nao ter `systemKey`.

Exemplos:
- `mercado`
- `alimentacao`
- `transporte`
- `moradia`
- `assinaturas-e-servicos`
- `saude`
- `compras`
- `educacao`
- `taxas-bancarias`
- `impostos`
- `renda`
- `investimentos`
- `lazer`

### 2. CategoryRule
Criar uma tabela dedicada para regras persistidas por tenant.

Campos recomendados:
- `id`
- `tenantId`
- `categoryId`
- `matchText`
- `matchType` enum: `contains`, `exact`, `merchant_root`
- `normalizedText`
- `priority` int
- `source` enum: `manual`, `ai_learned`, `seeded`
- `confidence` decimal?
- `usageCount` int
- `lastMatchedAt` datetime?
- `createdAt`
- `updatedAt`

Indices:
- `(tenantId, normalizedText)`
- `(tenantId, source, priority)`
- unique parcial logica em `(tenantId, normalizedText, matchType)`

### 3. Transaction Classification Metadata
Expandir `Transaction` para observabilidade e reuso.

Campos novos recomendados:
- `classificationSource` enum: `manual`, `manual_rule`, `global_context`, `ai_learned_rule`, `ai_live`, `fallback`, `unknown`
- `classificationKeyword` string?
- `classificationVersion` string?
- `classificationReviewedAt` datetime?
- `classificationRuleId` string?

Nao e obrigatorio fazer tudo na primeira migracao, mas `classificationSource` e `classificationKeyword` valem muito a pena.

## Matching Pipeline

### Stage 0. Normalize
Criar um util unico de normalizacao:
- remove acentos;
- lowercase;
- remove lixo de extrato;
- colapsa espacos;
- extrai `merchantRoot`.

Saida sugerida:
- `rawDescription`
- `normalizedDescription`
- `merchantRoot`
- `tokens`

### Stage 1. Manual Explicit
Se o usuario informar `categoryId`, salvar imediatamente:
- `classificationSource = manual`
- sem IA
- sem fallback

### Stage 2. Manual Rules
Buscar em `CategoryRule` com `source = manual`.
Essas regras sempre vencem.

### Stage 3. AI Learned Rules
Buscar em `CategoryRule` com `source = ai_learned`.
Essas regras vencem o dicionario global, mas perdem para `manual`.

### Stage 4. Global In-Memory Context
Usar `GLOBAL_KEYWORD_CONTEXT` compilado em memoria de processo.

Formato recomendado:
- chave: keyword normalizada
- valor: `systemKey`

Importante:
- ordenar por comprimento descrescente da keyword;
- precompilar na carga do processo;
- expor `GLOBAL_KEYWORD_CONTEXT_VERSION`.

Resolucao:
1. encontra keyword global;
2. resolve `systemKey` para a categoria real do tenant;
3. se o tenant nao tiver categoria com aquele `systemKey`, ignora e segue.

### Stage 5. Local Heuristic Scorer
Manter uma heuristica local pequena para casos onde a descricao e humana e curta.

Exemplos:
- `"pao frances"` -> padaria
- `"dipirona"` -> farmacia
- `"financiamento da casa"` -> moradia

Mas reduzir escopo:
- sair do modelo atual gigante em [category-classifier.ts](/C:/Users/User/Desktop/SavePointFinance/web/lib/finance/category-classifier.ts#L33);
- mover sinais brasileiros globais para o dicionario global;
- deixar a heuristica local apenas para composicao leve por token/contexto.

### Stage 6. AI Resolver
Se nada anterior resolver com confianca suficiente:
- executar IA;
- preferir assíncrono para transacoes criadas sem urgencia de resposta;
- permitir modo sincrono somente para canais que precisem resposta imediata.

## AI Design

### Prompt
Sua proposta de prompt esta na direcao correta:
- schema rigido;
- instrucoes autoritarias;
- extracao de `extractedKeyword`;
- baixa temperatura;
- foco em string suja de extrato.

### Ajuste importante
No SavePoint atual, a IA nao deve depender de nomes livres de categoria. Ela deve operar sobre uma lista controlada do tenant.

Formato recomendado da resposta:
```json
{
  "categoryId": "cat_123_or_null",
  "extractedKeyword": "uber trip",
  "confidence": 0.84
}
```

### Choice
Manter uma shortlist pequena de categorias candidatas para a IA:
- categorias do mesmo tipo;
- opcionalmente top 8 sugeridas por scoring local.

Isso reduz ambiguidade e token cost.

### SDK
Hoje o projeto nao usa `@google/generative-ai`. Ver [package.json](/C:/Users/User/Desktop/SavePointFinance/web/package.json).

Escolha pragmatica:
- fase 1: manter `fetch` bruto e ajustar payload/schema;
- fase 2: migrar para SDK se a ergonomia e observabilidade compensarem.

## Orchestrator Contract
Criar um servico central, por exemplo:

```ts
type ClassificationDecision = {
  categoryId: string | null;
  confidence: number | null;
  source:
    | "manual"
    | "manual_rule"
    | "global_context"
    | "ai_learned_rule"
    | "ai_live"
    | "fallback"
    | "unknown";
  matchedKeyword: string | null;
  extractedKeyword: string | null;
  ruleId: string | null;
  shouldPersistLearnedRule: boolean;
  reason: string;
};
```

Servico sugerido:
- `web/lib/finance/classification-engine.ts`

Responsabilidades:
- normalizar;
- aplicar precedencia;
- retornar decisao estruturada;
- nunca fazer `prisma` espalhado por rotas.

## Manual Review Flow
O endpoint de revisao precisa deixar de ser apenas corretivo e passar a ser tambem formativo.

Comportamento novo:
1. usuario escolhe categoria;
2. API busca a descricao original e o `merchantRoot`;
3. faz `upsert` em `CategoryRule` com `source = manual`;
4. atualiza a transacao;
5. se `applyToInstallments = true`, replica nas parcelas;
6. opcionalmente incrementa `usageCount`.

Resultado:
- erro corrigido uma vez;
- mesmas descricoes futuras nao chamam IA;
- override manual se torna absoluto.

## Fallback Policy
Aqui ha uma decisao de produto.

Opcao escolhida para o redesenho:
- se `confidence < threshold`, retornar `categoryId = null` e `source = unknown`.

Rationale:
- categoria errada custa mais do que categoria pendente;
- melhora revisao humana;
- evita esconder erro atras de "Outras despesas".

Mitigacao:
- manter flag de compatibilidade para continuar usando fallback automatico durante a migracao inicial.

## Performance Strategy
- dicionario global em RAM: O(1) de acesso por hash e custo irrelevante para 500-1000 termos;
- regras do tenant: carregar uma vez por request, ou cache curto por tenant;
- IA: usar so para misses;
- learned rules diminuem custo ao longo do tempo.

Otimizacao simples e suficiente agora:
- cache em memoria por processo para o dicionario global compilado;
- cache curto de `CategoryRule[]` por tenant com TTL baixo;
- sem Redis na primeira versao.

## Multi-Tenant Safety
Todo matching persistido deve ser por `tenantId`.

Regras:
- dicionario global nao carrega dados de usuario;
- `CategoryRule` sempre filtrado por `tenantId`;
- `systemKey` so resolve para categorias do tenant atual;
- nenhuma regra aprendida pode atravessar tenants.

## Migration Plan

### Phase 1. Foundation
- adicionar `systemKey` em `Category`;
- preencher defaults existentes com `systemKey`;
- criar `CategoryRule`;
- criar normalizador compartilhado;
- criar `global-keywords.ts`.

### Phase 2. Engine
- criar `classification-engine.ts`;
- mover o fluxo de `transaction-classification.ts` para o novo engine;
- manter assinatura compatível com transacoes, assinaturas e WhatsApp.

### Phase 3. Review Learning
- alterar [route.ts](/C:/Users/User/Desktop/SavePointFinance/web/app/api/transactions/[id]/classification/route.ts#L13) para fazer `upsert` de regra manual;
- persistir `classificationSource` e `classificationKeyword`.

### Phase 4. AI Hardening
- simplificar o classificador atual;
- usar prompt estruturado;
- gravar `ai_learned` apenas acima do threshold;
- nao sobrescrever regra manual.

### Phase 5. Async AI
- itens `unknown` viram jobs de enriquecimento;
- atualizar UI para mostrar `pendente de revisao` ou `classificado posteriormente`.

## Verification
- auditoria de regressao para `mercado`, `uber`, `ifood`, `netflix`, `drogasil`, `aluguel`, `salario`;
- teste de precedencia: `manual > ai_learned > global_context > ai_live > fallback`;
- teste multi-tenant: mesma keyword em tenants diferentes aponta para categorias diferentes;
- teste de review: revisar uma transacao deve afetar classificacoes futuras;
- teste de no-AI path: cenarios cobertos pelo dicionario global nao devem chamar Gemini.

## Risks And Mitigations
- risco: `systemKey` errado nos defaults.
  mitigacao: script de auditoria de mapeamento antes de ativar.
- risco: learned rule ruim se propagar.
  mitigacao: threshold alto, `usageCount`, capacidade de downgrade para `manual`.
- risco: nomes livres do usuario divergirem da taxonomia default.
  mitigacao: `systemKey` opcional e resolucao apenas quando existir.
- risco: transacao ambigua ficar sem categoria demais.
  mitigacao: rollout com feature flag e monitoramento da taxa de `unknown`.

## Final Recommendation
Aceitar a ideia-base do "motor hibrido", mas com tres correcoes arquiteturais:
- trocar lookup por `slug` mutavel por `systemKey` estavel;
- criar `CategoryRule` em vez de sobrecarregar `Category.keywords`;
- transformar revisao manual em aprendizado persistente.

Esse desenho entrega o beneficio que voce quer:
- menos custo de IA;
- latencia local de milissegundos;
- aprendizagem progressiva por tenant;
- override manual absoluto;
- caminho claro para IA assíncrona sem reescrever o dominio depois.
