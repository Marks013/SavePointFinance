# SavePoint

Aplicacao financeira fullstack em `Next.js 15`, `TypeScript 5`, `Prisma 7` e `PostgreSQL 17`, preparada para deploy com `Docker Compose` e proxy reverso como `Nginx Proxy Manager`.

O banco foi consolidado em uma migration baseline unica para ambientes novos.

## Estrutura

```text
SavePoint/
├── web/
├── scripts/
├── package.json
├── docker-compose.yml
├── .env.example
├── .env.server.example
├── .env.local-docker.example
├── DEPLOY_AND_BOOTSTRAP.md
└── STACK_MIGRATION_PLAN.md
```

## Ambientes

- raiz: arquivos de producao e deploy com Docker
- `web/`: codigo da aplicacao e ambiente de desenvolvimento local

## Configuracao rapida

### 1. Desenvolvimento local do `web`

Cria `web/.env.local` com segredos locais automaticamente:

```bash
npm run bootstrap:web
```

### 2. Docker local

Cria `.env` na raiz com URLs locais e segredos gerados:

```bash
npm run bootstrap:docker
```

Para configurar e subir a stack inteira:

```bash
npm run bootstrap:docker:up
```

### 3. Servidor ou producao

Cria `.env` na raiz com base no modelo de servidor:

```bash
npm run bootstrap:server
```

Se quiser recriar o arquivo de destino:

```bash
npm run bootstrap:docker -- --force
npm run bootstrap:server -- --force
```

## Deploy em producao

Fluxo recomendado para Oracle Cloud com Nginx Proxy Manager:

1. gere `.env` com:

```bash
npm run bootstrap:server
```

2. ajuste `NEXT_PUBLIC_APP_URL`, `AUTH_URL`, segredos, senha do admin e `RESEND_API_KEY`
3. execute:

```bash
docker compose up -d postgres
docker compose run --rm migrate
docker compose run --rm bootstrap-admin
docker compose up -d web
```

App:

- `http://SEU_SERVIDOR:3000`

No Nginx Proxy Manager:

- Forward Host/IP: IP do servidor
- Forward Port: `3000`
- Scheme: `http`
- Domain Names: seu dominio final, o mesmo de `NEXT_PUBLIC_APP_URL`
- SSL: emitir certificado e ativar `Force SSL`

## Atualizacoes futuras

Sem alteracao de banco:

```bash
docker compose up -d --build web
```

Com alteracao de schema:

```bash
docker compose up -d postgres
docker compose run --rm migrate
docker compose up -d --build web
```

## Backup automatico

O projeto agora inclui um servico dedicado de backup criptografado.

O fluxo gera:
- dump do Postgres em formato custom
- dump de roles/globals
- pacote com arquivos criticos do servidor
- artefato final criptografado
- copia local em volume Docker
- copia opcional no GitHub Releases de um repositorio privado
- copia opcional no Oracle Object Storage
- alerta de falha por e-mail via Resend

Ativar:

```bash
docker compose up -d --build backup
```

Testar manualmente:

```bash
docker compose run --rm backup-once
```

Restaurar em banco de teste:

```bash
docker compose run --rm restore-backup-test
```

Restaurar em producao:

```bash
docker compose stop web
docker compose run --rm restore-backup-prod
docker compose up -d web
```

As variaveis de backup ficam no [`.env.example`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env.example) e a operacao completa esta em [DEPLOY_AND_BOOTSTRAP.md](/C:/Users/samue/Desktop/SavePoint/SavePoint/DEPLOY_AND_BOOTSTRAP.md).

## Conta administrativa

O admin inicial vem das variaveis do `.env`:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `ADMIN_TENANT_NAME`
- `ADMIN_TENANT_SLUG`

Para recriar ou atualizar o admin:

```bash
docker compose run --rm bootstrap-admin
```

## Licenciamento

O sistema agora aplica licenca real por organizacao (`tenant`) com os estados:

- `Gratuito`
- `Premium`
- `Avaliação Premium`
- `Expirado`
- `Inativo`

Regras atuais:

- `Gratuito`
  - ate `1` usuario ativo
  - ate `1` conta ativa por usuario
  - ate `1` cartao ativo por usuario
  - sem assistente no WhatsApp
  - sem automacoes recorrentes
  - sem exportacao PDF dos relatorios
- `Premium`
  - multiplos usuarios conforme `maxUsers`
  - contas e cartoes sem o limite do plano gratuito
  - WhatsApp habilitavel
  - automacoes habilitadas
  - exportacao PDF habilitada

Bloqueios aplicados:

- login bloqueado para organizacao inativa ou expirada
- rotas protegidas redirecionam para `/license` quando a licenca estiver bloqueada
- convite e ativacao de usuarios respeitam o limite do plano
- criacao de contas e cartoes respeita o limite do plano
- WhatsApp, automacoes e PDF respeitam o plano atual

## Classificacao automatica de categorias

O projeto ja possui classificacao automatica de categorias em dois niveis:

- base brasileira por regras contextuais e palavras-chave
- refinamento contextual opcional com Gemini, quando configurado por ambiente

As categorias padrao do tenant sao provisionadas automaticamente no bootstrap inicial e podem ser restauradas sob demanda pela interface.

## Assistente no WhatsApp

O projeto agora suporta integracao direta com `WhatsApp Cloud API`, sem `n8n`, com estas regras:

- o numero de WhatsApp fica vinculado ao usuario em `Configuracoes`
- contas e cartoes sao filtrados por usuario
- o assistente consegue:
  - registrar despesa
  - registrar receita
  - consultar saldo
  - consultar fatura e limite

Webhook:

- `GET/POST /api/integrations/whatsapp/webhook`

Configure no `.env`:

- `WHATSAPP_ASSISTANT_ENABLED=true`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`
- `WHATSAPP_APP_SECRET` opcional

## E-mail transacional

O sistema agora envia notificacoes e recuperacao de senha por um destes modos:

- `EMAIL_PROVIDER=resend`
- `EMAIL_PROVIDER=brevo`
- `EMAIL_PROVIDER=webhook`

Variaveis:

- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`
- `EMAIL_REPLY_TO`
- `RESEND_API_KEY`
- `BREVO_API_KEY`
- `NOTIFICATION_EMAIL_WEBHOOK_URL`

Recomendacao para producao:

- Oracle Cloud com dominio proprio: `EMAIL_PROVIDER=resend`
- se voce ja tiver uma automacao externa: `EMAIL_PROVIDER=webhook`

Sem provedor configurado, o sistema registra a tentativa e marca como `skipped`.

Guia completo:

- [WHATSAPP_ASSISTANT.md](/C:/Users/samue/Desktop/SavePoint/SavePoint/WHATSAPP_ASSISTANT.md)
- [EMAIL_WEBHOOK_RESEND.md](/C:/Users/samue/Desktop/SavePoint/SavePoint/EMAIL_WEBHOOK_RESEND.md)

## Desenvolvimento local

### Docker local

Para testar localmente com Docker sem mexer no arquivo de servidor:

```bash
cp .env.local-docker.example .env
docker compose up -d postgres
docker compose run --rm migrate
docker compose run --rm bootstrap-admin
docker compose up -d web
```

### Desenvolvimento fora do Docker

Para rodar fora do Docker:

```bash
cd web
npm install
npm run dev
```

O ambiente local usa [web/.env.example](/C:/Users/samue/Desktop/SavePoint/SavePoint/web/.env.example) como base.

## Documentacao adicional

- deploy, bootstrap e operacao: [DEPLOY_AND_BOOTSTRAP.md](/C:/Users/samue/Desktop/SavePoint/SavePoint/DEPLOY_AND_BOOTSTRAP.md)
- historico da migracao: [STACK_MIGRATION_PLAN.md](/C:/Users/samue/Desktop/SavePoint/SavePoint/STACK_MIGRATION_PLAN.md)
- assistente virtual no WhatsApp: [WHATSAPP_ASSISTANT.md](/C:/Users/samue/Desktop/SavePoint/SavePoint/WHATSAPP_ASSISTANT.md)
- exemplo de webhook de e-mail com Resend: [EMAIL_WEBHOOK_RESEND.md](/C:/Users/samue/Desktop/SavePoint/SavePoint/EMAIL_WEBHOOK_RESEND.md)
