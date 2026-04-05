# SavePoint

Aplicacao financeira fullstack em `Next.js 15`, `TypeScript 5`, `Prisma 7` e `PostgreSQL 17`, preparada para deploy com `Docker Compose` e proxy reverso como `Nginx Proxy Manager`.

O banco foi consolidado em uma migration baseline unica para ambientes novos.

## Estrutura

```text
SavePoint/
├── web/
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

## Deploy em producao

Fluxo recomendado para Oracle Cloud com Nginx Proxy Manager:

1. copie [`.env.server.example`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env.server.example) para `.env`
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
- refinamento contextual opcional com Haiku, quando configurado por ambiente

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
