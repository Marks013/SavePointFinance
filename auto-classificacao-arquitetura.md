# Auto-Classificacao Save Point

## Objetivo
Redesenhar o sistema de auto-classificacao para que ele seja:
- rapido no caminho normal
- barato no uso de IA
- multi-tenant sem acoplamento ao nome da categoria
- auditavel por origem da decisao
- capaz de aprender com revisao manual sem repetir o mesmo erro

## Premissas do plano
- O produto continua em Next.js + Node.js + Prisma + Postgres.
- O sistema e multi-tenant e as categorias pertencem ao `tenant`.
- O fluxo atual precisa continuar atendendo `transactions`, `subscriptions`, `automation` e `whatsapp`.
- A UI nao deve esperar Gemini no caminho interativo.
- Categoria errada custa mais do que categoria vazia.

## Diagnostico do estado atual
Hoje a classificacao passa por `web/lib/finance/transaction-classification.ts` e `web/lib/finance/category-classifier.ts`.

Problemas estruturais atuais:
- cada classificacao busca categorias e historico no banco
- a revisao manual so troca `categoryId` na transacao; ela nao vira regra futura
- os boosts locais dependem de nomes literais como `"Supermercado"` e `"Moradia"`
- `Category` nao tem `slug` nem `systemKey`, entao a proposta baseada em slug nao encaixa no schema atual
- `Transaction` so guarda `aiClassified` e `aiConfidence`, o que e insuficiente para separar `GLOBAL`, `MANUAL`, `AI_LEARNED`, `UNKNOWN`
- o Gemini ainda roda de forma sincrona no fluxo interativo
- o fallback para "Outras despesas/receitas" mascara desconhecidos reais

## Decisao central
Adotar um motor hibrido em estagios, com prioridade por fonte, e desacoplar a taxonomia global da apresentacao local do tenant.

O que eu manteria do codigo atual:
- `resolveTransactionClassification(...)` como fachada unica
- `Category.keywords` como fonte manual do tenant
- `default-categories.json` como seed das categorias padrao

O que eu substituiria:
- heuristicas hardcoded acopladas a `category.name`
- revisao manual sem aprendizado
- Gemini como resolvedor sincrono de ultimo passo em requests interativos

## ADR-001: usar chave canonica do sistema, nao nome nem slug
### Contexto
A proposta do contexto global precisa apontar para uma categoria padrao do produto, mas o schema atual so tem `Category.name`.

### Decisao
Adicionar `systemKey` em `Category` para as categorias padrao do Save Point.

Exemplos:
- `supermercado`
- `delivery`
- `moradia`
- `internet-telefonia`
- `streaming-assinaturas`

### Racional
- nome pode ser renomeado pelo usuario
- `slug` nao existe hoje
- `systemKey` permite o contexto global resolver para a categoria equivalente do tenant sem depender do texto exibido

### Trade-off aceito
Mais uma coluna em `Category` e uma migracao de backfill.

## ADR-002: regras persistidas separadas da categoria
### Contexto
`Category.keywords` e util para configuracao manual, mas nao cobre aprendizado por IA, prioridade, auditoria e override manual.

### Decisao
Adicionar `CategoryRule` como entidade propria.

Schema proposto:

```prisma
enum ClassificationSource {
  manual_input
  manual_rule
  category_keyword
  global_context
  ai_learned
  ai_runtime
  fallback
  unknown
}

enum CategoryRuleSource {
  manual
  ai_learned
  imported
}

enum CategoryRuleMatchMode {
  exact_phrase
  contains_phrase
}

model CategoryRule {
  id                       String                 @id @default(cuid())
  tenantId                 String
  categoryId               String
  type                     CategoryType
  normalizedKeyword        String
  matchMode                CategoryRuleMatchMode @default(exact_phrase)
  source                   CategoryRuleSource
  priority                 Int                    @default(100)
  confidence               Decimal?               @db.Decimal(3, 2)
  createdFromTransactionId String?
  hitCount                 Int                    @default(0)
  lastMatchedAt            DateTime?
  isActive                 Boolean                @default(true)
  createdAt                DateTime               @default(now())
  updatedAt                DateTime               @updatedAt

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([tenantId, type, normalizedKeyword, source])
  @@index([tenantId, type, isActive, priority])
}
```

### Racional
- revisao manual vira regra de verdade
- IA pode aprender sem sobrescrever regra manual
- fica possivel medir acerto por origem

## ADR-003: `Transaction` precisa guardar origem da classificacao
### Contexto
`aiClassified` e `aiConfidence` nao diferenciam regra manual, keyword do tenant, contexto global e fallback.

### Decisao
Adicionar em `Transaction`:

```prisma
classificationSource    ClassificationSource @default(unknown)
classificationKeyword   String?
classificationReason    String?
classificationVersion   Int                  @default(2)
classificationReviewedAt DateTime?
classificationReviewedByUserId String?
```

Manter `aiClassified` e `aiConfidence` temporariamente por compatibilidade de API e dashboard.

### Racional
- a UI pode mostrar "por regra manual", "por contexto global" ou "por IA"
- os relatorios deixam de tratar tudo como "automatico" do mesmo jeito
- fica possivel reprocessar por versao do motor

## Estrutura alvo dos modulos
- `web/lib/finance/global-keywords.ts`
  dicionario global em memoria, compilado uma vez no boot do processo
- `web/lib/finance/classification-normalization.ts`
  normalizacao, limpeza de descricao bancaria, extracao de raiz e geracao de n-grams
- `web/lib/finance/classification-cache.ts`
  cache por tenant de categorias, `systemKey -> categoryId`, regras e keywords
- `web/lib/finance/category-classifier.ts`
  adaptador de IA com JSON schema estrito
- `web/lib/finance/classification-engine.ts`
  orquestrador dos estagios
- `web/lib/finance/transaction-classification.ts`
  fachada publica usada pelas rotas atuais

## Sobre o arquivo global
O arquivo sugerido pelo usuario faz sentido, mas eu nao recomendaria `Record<string, string>` como contrato final.

Melhor contrato:

```ts
export type GlobalCategoryKey =
  | "supermercado"
  | "delivery"
  | "restaurantes"
  | "combustivel"
  | "mobilidade"
  | "moradia"
  | "saude"
  | "streaming-assinaturas"
  | "compras-online"
  | "educacao"
  | "impostos-taxas"
  | "renda"
  | "investimentos";

export type GlobalKeywordRule = {
  phrase: string;
  categoryKey: GlobalCategoryKey;
  type: "income" | "expense";
  priority: number;
};
```

Motivo:
- precisamos resolver colisao entre `uber` e `uber eats`
- precisamos ordenar por frase mais especifica
- precisamos diferenciar `income` e `expense`

Se quiser manter o arquivo simples no inicio, tudo bem. Mas ele deve ser compilado em um indice interno com:
- normalizacao
- ordenacao por comprimento desc
- prioridade

## Pipeline alvo
### Stage 0: normalizacao unica
Entrada:
- descricao
- notes
- type
- paymentMethod

Saida:
- `normalizedText`
- `merchantRoot`
- `candidatePhrases[]`

Regras:
- remover CNPJ, NSU, datas, cidades, UF, `BR`, `SAO PAULO`, codigos de adquirente
- reduzir ruido bancario antes de qualquer match
- gerar frases multi-palavra primeiro

### Stage 1: categoria definida manualmente no request
Se `categoryId` veio no payload, retorna imediatamente:
- `classificationSource = manual_input`

### Stage 2: regras manuais do tenant
Fonte:
- `CategoryRule.source = manual`
- `Category.keywords` do proprio tenant, projetadas para cache como `category_keyword`

Politica:
- prioridade maxima
- nunca podem ser sobrescritas por IA

### Stage 3: regras aprendidas por IA
Fonte:
- `CategoryRule.source = ai_learned`

Politica:
- abaixo de regra manual
- acima do contexto global
- acima de Gemini em tempo real
- pode ser desativada se houver revisao manual contraria

### Stage 4: contexto global em memoria
Fonte:
- `global-keywords.ts`

Resolucao:
- `categoryKey` global -> `categoryId` do tenant via cache de `systemKey`
- se o tenant nao tiver categoria mapeada para aquele `systemKey`, o estagio e ignorado

### Stage 5: IA estruturada
Objetivo:
- classificar apenas o que sobrou
- extrair keyword raiz para virar regra futura

Saida esperada:

```ts
type AiClassificationResult = {
  categoryId: string | null;
  extractedKeyword: string | null;
  confidence: number;
  rationale: string;
};
```

Importante:
- o schema precisa aceitar `categoryId: null`
- o exemplo proposto com `categoryId` obrigatorio como `STRING` entra em conflito com a regra "se < 0.6, force null"
- o modelo deve continuar vindo de `process.env.GEMINI_MODEL`; nao vale hardcode fixo em `gemini-1.5-flash`

Politica:
- `confidence >= 0.80`: aplica e pode persistir regra `AI_LEARNED`
- `0.60 <= confidence < 0.80`: aplica so na transacao, sem aprender
- `< 0.60`: retorna `null`

### Stage 6: unknown
Politica recomendada:
- default do sistema: `categoryId = null`
- fallback para "Outras despesas/receitas" apenas via feature flag ou fluxo legacy

Motivo:
- categoria vazia e revisavel
- categoria errada polui relatorio e aprendizado

## Politica de latencia
### Fluxos interativos
- `POST /api/transactions`
- `PATCH /api/transactions/[id]`
- `POST/PATCH /api/subscriptions`
- WhatsApp

Comportamento:
- stages 0 a 4 sempre inline
- stage 5 so inline se existir budget de tempo curto
- se IA nao responder dentro do budget, gravar sem categoria e enfileirar classificacao assinc

### Fluxos em background
- automacoes
- reprocessamento
- importacoes grandes

Comportamento:
- IA pode rodar inline ou em lote

## Fila de classificacao
Nao usaria apenas `after()` como pilar da arquitetura.

Melhor desenho:
- `ClassificationJob` persistido no banco
- `after()` apenas como tentativa de disparo imediato
- worker/cron consumindo jobs pendentes

Motivo:
- `after()` melhora UX
- job persistido traz confiabilidade se o processo cair

## Cache por tenant
Cache em memoria por processo:
- categorias do tenant
- mapa `systemKey -> categoryId`
- regras manuais
- regras AI aprendidas
- keywords projetadas de `Category.keywords`

Invalidacao:
- ao criar/editar/apagar categoria
- ao revisar classificacao
- ao criar/desativar `CategoryRule`

Politica minima:
- invalidacao explicita no processo atual
- TTL curto como rede de seguranca

## Revisao manual como aprendizado
Ao revisar em `PATCH /api/transactions/[id]/classification`:
- atualizar `categoryId`
- limpar marca de IA runtime
- gravar `classificationSource = manual_rule`
- fazer `upsert` de `CategoryRule(source = manual)`

Regra de extracao:
- preferir `classificationKeyword` ja salvo na transacao
- se nao existir, derivar de `merchantRoot` ou da descricao normalizada

Se `applyToInstallments = true`:
- atualiza as parcelas
- ainda assim grava apenas uma regra manual reutilizavel

## Compatibilidade com o codigo atual
### O que precisa mudar
- `Category` recebe `systemKey`
- `Transaction` recebe metadados novos de classificacao
- novo `CategoryRule`
- `category-classifier.ts` deixa de ser o motor inteiro e vira o adaptador de IA
- `transaction-classification.ts` vira o maestro real

### O que pode continuar
- `default-categories.json`
- formulario de categoria com `keywords`
- auditoria `web/scripts/category-classification-audit.ts`

## Plano de migracao
### Fase 1
- adicionar schema novo
- backfill de `systemKey` para categorias padrao
- adicionar `classificationSource` em transacoes novas

### Fase 2
- extrair contexto global atual para `global-keywords.ts`
- compilar cache por tenant
- trocar o motor atual pelo pipeline em estagios, ainda sem job assinc

### Fase 3
- criar `CategoryRule`
- transformar revisao manual em `upsert` de regra manual
- persistir `classificationKeyword`

### Fase 4
- reduzir o prompt do Gemini
- retornar `categoryId | null`, `extractedKeyword`, `confidence`
- aprender regras `AI_LEARNED` so acima do limiar alto

### Fase 5
- adicionar `ClassificationJob`
- tirar Gemini do caminho interativo padrao
- reprocessar `UNKNOWN` pendentes

## Testes e verificacao
- casos de merchant brasileiro: ifood, uber trip, shell box, mercado livre, drogasil
- casos ambigos: `gas` vs `gasolina`, `uber` vs `uber eats`, `prime` vs `amazon prime`
- revisao manual deve corrigir a transacao atual e a proxima ocorrencia
- tenant que renomeou categoria default nao pode perder match global
- transacao sem match nao deve cair automaticamente em fallback por padrao
- dashboards e APIs devem refletir `classificationSource`

## Metas operacionais
- match local sem banco adicional: sub-5ms
- match com cache miss do tenant: sub-50ms
- request interativa sem bloquear por IA: sub-300ms
- custo de IA restrito aos desconhecidos reais

## Conclusao
O desenho proposto pelo usuario esta correto na direcao, mas precisa de quatro ajustes para caber no Save Point real:
- trocar `slug` por `systemKey`
- introduzir `CategoryRule`
- tratar revisao manual como verdade persistida
- separar "motor de IA" de "motor de decisao"

Sem isso, o sistema continua rapido em alguns casos, mas nao fica governavel nem confiavel a medio prazo.
