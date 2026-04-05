# Deploy e Bootstrap

## Objetivo

Este projeto foi ajustado para producao com separacao clara entre:

- inicializacao da infraestrutura
- criacao inicial do schema do banco
- criacao ou atualizacao da conta administrativa
- subida normal da aplicacao

A aplicacao `web` nao cria schema automaticamente no boot.

## Estado das migrations

O Prisma foi consolidado em uma baseline inicial unica, pensada para banco vazio em servidor novo.

Isso significa:

- o fluxo oficial para um ambiente novo e `migrate` seguido de `bootstrap-admin`
- nao existe dependencia de ajustes manuais no banco para o primeiro deploy
- o historico antigo de testes locais nao faz parte da trilha oficial de producao

## Dados do admin

- e-mail padrao: `admin@savepoint.local`
- nome padrao: `Administrador SavePoint`
- organizacao padrao: `SavePoint`
- slug padrao da organizacao: `savepoint`

A senha do admin vem da variavel `ADMIN_PASSWORD` no arquivo `.env`.

## Variaveis importantes

Arquivo: [`.env`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env)

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `AUTH_SECRET`
- `AUTOMATION_CRON_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `ADMIN_TENANT_NAME`
- `ADMIN_TENANT_SLUG`
- `HAIKU_ENABLED`
- `HAIKU_API_KEY`
- `HAIKU_MODEL`
- `HAIKU_BASE_URL`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`
- `EMAIL_REPLY_TO`
- `RESEND_API_KEY`
- `BREVO_API_KEY`
- `NOTIFICATION_EMAIL_WEBHOOK_URL`
- `NOTIFICATION_WHATSAPP_WEBHOOK_URL`

Modelos disponiveis:

- servidor: [`.env.server.example`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env.server.example)
- docker local: [`.env.local-docker.example`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env.local-docker.example)
- o arquivo ativo usado pelo `docker compose` continua sendo `.env`

## Como funciona

### `web`

Servico principal da aplicacao.

Uso:
- executar o site em producao

Nao deve ser usado para criar schema.

### `migrate`

Servico operacional para aplicar as migrations versionadas do Prisma.

Uso:
- primeira instalacao em banco vazio
- deploy com alteracoes reais no schema do banco

Quando usar:
- sempre na primeira subida em um servidor novo
- sempre que houver nova migration no repositorio

Quando nao usar:
- em reinicios comuns do container
- em deploys sem mudanca de schema

### `bootstrap-admin`

Servico operacional para criar ou atualizar a conta administrativa e a organizacao inicial.

Uso:
- primeira instalacao
- recuperar ou atualizar o admin

Quando usar:
- depois do `migrate` em um banco novo
- quando quiser garantir que o admin existe

Quando nao usar:
- nao e necessario em toda reinicializacao

## Fluxo correto no primeiro deploy

1. Subir apenas o banco:

```bash
docker compose up -d postgres
```

2. Aplicar o schema inicial:

```bash
docker compose run --rm migrate
```

3. Criar ou atualizar o admin:

```bash
docker compose run --rm bootstrap-admin
```

4. Subir a aplicacao:

```bash
docker compose up -d web
```

Se for usar armazenamento S3 compativel/MinIO:

```bash
docker compose --profile storage up -d
```

## Fluxo correto em updates futuros

### Deploy sem alteracao de banco

```bash
docker compose up -d --build web
```

### Deploy com alteracao de banco

```bash
docker compose up -d postgres
docker compose run --rm migrate
docker compose up -d --build web
```

## Recuperar o admin

Se perder a conta admin ou quiser redefinir a senha/configuracao via `.env`:

1. ajuste `ADMIN_PASSWORD` no `.env`
2. execute:

```bash
docker compose run --rm bootstrap-admin
```

Isso atualiza:

- senha do admin
- nome do admin
- organizacao inicial
- conta principal basica

## Oracle Cloud + Nginx Proxy Manager

No Oracle Cloud:

1. clone o repositorio
2. copie `.env.server.example` para `.env`
3. preencha dominio real, segredos fortes e `RESEND_API_KEY`
4. execute o fluxo de primeiro deploy

O template [`.env.server.example`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env.server.example) ja esta preparado para este cenário:

- `NEXT_PUBLIC_APP_URL` com `https://`
- `APP_PORT=3000` para proxy reverso
- `EMAIL_PROVIDER=resend`
- remetente `no-reply`
- conta administrativa inicial via `bootstrap-admin`

Para classificacao contextual opcional com Haiku:

- defina `HAIKU_ENABLED=true`
- informe `HAIKU_API_KEY`
- ajuste `HAIKU_MODEL` e `HAIKU_BASE_URL` se necessario

Sem isso, a classificacao continua funcionando apenas com a base brasileira padrao do sistema.

## E-mail em producao

O fluxo de recuperacao de senha e as notificacoes por e-mail agora suportam:

- `Resend`
- `Brevo`
- `Webhook`

Configuracao recomendada para Oracle Cloud:

```env
EMAIL_PROVIDER=resend
EMAIL_FROM=no-reply@seudominio.com
EMAIL_FROM_NAME=Save Point Finança
EMAIL_REPLY_TO=suporte@seudominio.com
RESEND_API_KEY=seu-token
```

Alternativa com Brevo:

```env
EMAIL_PROVIDER=brevo
EMAIL_FROM=no-reply@seudominio.com
EMAIL_FROM_NAME=Save Point Finança
EMAIL_REPLY_TO=suporte@seudominio.com
BREVO_API_KEY=seu-token
```

Alternativa com servico proprio:

```env
EMAIL_PROVIDER=webhook
NOTIFICATION_EMAIL_WEBHOOK_URL=https://seu-endpoint/email
```

Sem provedor configurado, o sistema registra a tentativa, mas nao entrega o e-mail.

No Nginx Proxy Manager:

- Host/Domain: seu dominio real
- Forward Hostname/IP: IP privado ou publico do servidor
- Forward Port: `3000`
- Scheme: `http`
- SSL: emitir certificado no NPM
- Force SSL: habilitado

## Resumo operacional

- banco vazio: `migrate` + `bootstrap-admin`
- banco ja criado, sem mudanca de schema: apenas `web`
- banco com mudanca de schema: `migrate` antes do `web`
- recuperar admin: `bootstrap-admin`

## Teste local com Docker

Se quiser testar localmente sem ficar trocando configuracao manual:

1. copie `.env.local-docker.example` para `.env`
2. execute:

```bash
docker compose up -d postgres
docker compose run --rm migrate
docker compose run --rm bootstrap-admin
docker compose up -d web
```

Depois, para voltar ao perfil de servidor:

1. copie `.env.server.example` para `.env`
2. ajuste seus valores reais
