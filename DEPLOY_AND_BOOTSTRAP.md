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
- `AUTH_URL`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `ADMIN_TENANT_NAME`
- `ADMIN_TENANT_SLUG`
- `GEMINI_ENABLED`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_BASE_URL`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_FROM_NAME`
- `EMAIL_REPLY_TO`
- `RESEND_API_KEY`
- `BREVO_API_KEY`
- `NOTIFICATION_EMAIL_WEBHOOK_URL`
- `NOTIFICATION_WHATSAPP_WEBHOOK_URL`
- `TZ`
- `BACKUP_CRON_SCHEDULE`
- `BACKUP_RUN_ON_STARTUP`
- `BACKUP_LOCAL_RETENTION_DAYS`
- `BACKUP_CRITICAL_PATHS`
- `BACKUP_ENCRYPTION_PASSPHRASE`
- `BACKUP_ALERT_EMAIL_ENABLED`
- `BACKUP_ALERT_EMAIL_TO`
- `BACKUP_GITHUB_ENABLED`
- `BACKUP_GITHUB_TOKEN`
- `BACKUP_GITHUB_REPOSITORY`
- `BACKUP_GITHUB_RELEASE_TAG`
- `BACKUP_GITHUB_RETENTION_COUNT`
- `BACKUP_OBJECT_STORAGE_ENABLED`
- `BACKUP_OBJECT_STORAGE_ENDPOINT`
- `BACKUP_OBJECT_STORAGE_BUCKET`
- `BACKUP_OBJECT_STORAGE_REGION`
- `BACKUP_OBJECT_STORAGE_PREFIX`
- `BACKUP_OBJECT_STORAGE_ACCESS_KEY`
- `BACKUP_OBJECT_STORAGE_SECRET_KEY`

Modelos disponiveis:

- servidor: [`.env.server.example`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env.server.example)
- docker local: [`.env.local-docker.example`](/C:/Users/samue/Desktop/SavePoint/SavePoint/.env.local-docker.example)
- o arquivo ativo usado pelo `docker compose` continua sendo `.env`
- o modo de manutencao usa `MAINTENANCE_MODE=true|false` no mesmo `.env`

Geracao rapida:

```bash
npm run bootstrap:docker
npm run bootstrap:server
```

Para desenvolvimento do `web` sem Docker:

```bash
npm run bootstrap:web
```

## Como funciona

### `web`

Servico principal da aplicacao.

Uso:
- executar o site em producao

Nao deve ser usado para criar schema.

### `backup`

Servico dedicado ao backup automatico criptografado.

Uso:
- gerar dump do Postgres
- empacotar arquivos criticos do servidor
- criptografar o artefato final
- manter copia local
- enviar copia para GitHub Releases
- enviar copia para OCI Object Storage

Agendamento padrao:
- todos os dias as `03:00` com `TZ=America/Sao_Paulo`

### `backup-once`

Servico operacional para testar manualmente o backup sem esperar o cron.

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

Atalho padronizado para Docker local:

```bash
npm run bootstrap:docker:up
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

Em seguida, valide o deploy:

```bash
docker compose ps
docker compose logs --tail=100 web
docker compose --profile ops run --rm audit-server-smoke
```

### Deploy com alteracao de banco

```bash
docker compose up -d postgres
docker compose run --rm migrate
docker compose up -d --build web
```

Depois da subida, rode o mesmo smoke:

```bash
docker compose --profile ops run --rm audit-server-smoke
```

Variaveis importantes para o smoke:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SMOKE_USER_EMAIL`
- `SMOKE_USER_PASSWORD`
- `FAMILY_USER_EMAIL`
- `FAMILY_USER_PASSWORD`
- `SMOKE_MONTH`
- `AUDIT_BASE_URL`

O smoke atualizado agora cobre tambem:

- `GET /api/health`
- acesso administrativo do `Admin de Conta`
- restricoes do `Familiar`
- bloqueio de acesso do Familiar em `/dashboard/admin`, `/dashboard/sharing` e `/api/admin/users`
- validacao server-side das preferencias que o Familiar nao pode alterar

### Ativar backup automatico

1. preencha as variaveis de backup no `.env`
2. suba o servico:

```bash
docker compose up -d --build backup
```

### Testar backup manualmente

```bash
docker compose run --rm backup-once
```

### Ver logs do backup

```bash
docker compose logs --tail=200 backup
```

### Restaurar backup em banco de teste

O restore automatizado valida checksum, descriptografa, extrai o payload e recria um banco de teste separado.

Padrao:
- usa o backup local mais recente em `/backups/archives`
- restaura em `${POSTGRES_DB}_restore_test`
- extrai os arquivos criticos para `/backups/restored-files/...`

```bash
docker compose run --rm restore-backup-test
```

### Restaurar backup em producao

Fluxo minimo recomendado:

1. parar a aplicacao para evitar escrita concorrente:

```bash
docker compose stop web
```

2. confirmar no `.env`:

```env
RESTORE_PRODUCTION_CONFIRMATION=RESTORE_SAVEPOINT_PROD
```

3. executar o restore:

```bash
docker compose run --rm restore-backup-prod
```

4. subir a aplicacao novamente:

```bash
docker compose up -d web
```

### Restaurar a partir do GitHub Release

```env
RESTORE_SOURCE=github
RESTORE_GITHUB_RELEASE_TAG=savepoint-backups
RESTORE_ASSET_BASENAME=
```

Se `RESTORE_ASSET_BASENAME` ficar vazio, o sistema baixa o artefato mais recente da release.

### Restaurar a partir do Object Storage

```env
RESTORE_SOURCE=object_storage
RESTORE_ASSET_BASENAME=
RESTORE_OBJECT_STORAGE_DATE_PATH=
```

Se `RESTORE_ASSET_BASENAME` ficar vazio, o sistema usa o artefato mais recente encontrado no bucket/prefixo configurado.

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
- timezone do Brasil com `TZ=America/Sao_Paulo`

Para classificacao contextual opcional com Gemini:

- defina `GEMINI_ENABLED=true`
- informe `GEMINI_API_KEY`
- ajuste `GEMINI_MODEL` e `GEMINI_BASE_URL` se necessario

Sem isso, a classificacao continua funcionando apenas com a base brasileira padrao do sistema.

## Backup robusto recomendado

Para dados financeiros, nao envie dump puro para GitHub ou Object Storage.

O fluxo implementado faz:
- dump do banco em formato custom do Postgres
- dump de roles/globals
- pacote dos arquivos criticos
- criptografia simetrica forte com `openssl` e `pbkdf2`
- checksum SHA-256 do artefato final
- alerta de falha por e-mail usando Resend

### GitHub

O destino do GitHub usa `Releases` de um repositorio privado dedicado, e nao commits em branch.

Configuracao minima:

```env
BACKUP_GITHUB_ENABLED=true
BACKUP_GITHUB_TOKEN=github_pat_xxx
BACKUP_GITHUB_REPOSITORY=seu-usuario/seu-repo-privado-de-backup
BACKUP_GITHUB_RELEASE_TAG=savepoint-backups
BACKUP_GITHUB_RETENTION_COUNT=30
```

### Oracle Object Storage

Use o endpoint S3 compativel do bucket.

Configuracao minima:

```env
BACKUP_OBJECT_STORAGE_ENABLED=true
BACKUP_OBJECT_STORAGE_ENDPOINT=https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com
BACKUP_OBJECT_STORAGE_BUCKET=nome-do-bucket
BACKUP_OBJECT_STORAGE_REGION=sa-saopaulo-1
BACKUP_OBJECT_STORAGE_PREFIX=savepoint-prod
BACKUP_OBJECT_STORAGE_ACCESS_KEY=sua-access-key
BACKUP_OBJECT_STORAGE_SECRET_KEY=sua-secret-key
```

### Chave de criptografia

```env
BACKUP_ENCRYPTION_PASSPHRASE=uma-frase-longa-forte-e-fora-do-git
```

Sem essa chave, o restore do backup nao sera possivel.

Lista padrao de arquivos criticos:

```env
BACKUP_CRITICAL_PATHS=.env,docker-compose.yml,DEPLOY_AND_BOOTSTRAP.md
```

### Alerta de falha por e-mail

Se o backup falhar em qualquer etapa, o proprio container de backup envia um e-mail via Resend.

Configuracao:

```env
BACKUP_ALERT_EMAIL_ENABLED=true
BACKUP_ALERT_EMAIL_TO=voce@seudominio.com
```

Se `BACKUP_ALERT_EMAIL_TO` ficar vazio, o sistema usa `ADMIN_EMAIL`.

### Restore

O artefato gerado e um `.tar.gz.enc`.

Exemplo:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in savepoint-backup.tar.gz.enc -out savepoint-backup.tar.gz
tar -xzf savepoint-backup.tar.gz
pg_restore --clean --if-exists --no-owner -h localhost -U savepoint -d savepoint_restored database.dump
```

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
- backup diario: `backup`
- teste manual do backup: `backup-once`

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

## Modo de manutencao operacional

Para bloquear temporariamente o acesso web sem rebuildar imagem:

```bash
./ops/toggle-maintenance.sh on
```

Para liberar novamente:

```bash
./ops/toggle-maintenance.sh off
```

O script altera `MAINTENANCE_MODE` no `.env` e recria apenas o servico `web`. Isso recarrega as variaveis em runtime sem derrubar o banco. Nao use `docker compose restart web` para esse caso, porque `restart` nao recarrega o `env_file`.

## Deploy robusto com rollback

O `update.sh` agora faz um fluxo mais seguro:

1. ativa manutencao
2. salva a imagem atual como snapshot local de rollback
3. registra evidencias em `.deploy/releases/<timestamp>`
4. executa `git pull --ff-only`
5. opcionalmente roda backup preventivo com `RUN_BACKUP_ON_DEPLOY=true`
6. opcionalmente roda migrations com `RUN_DB_MIGRATIONS=true`
7. recria `web`
8. espera `GET /api/health`
9. executa `audit-server-smoke` ainda com manutencao ativa
10. so libera o trafego se tudo passar

Uso padrao:

```bash
./update.sh
```

Com migrations:

```bash
RUN_DB_MIGRATIONS=true ./update.sh
```

Com backup preventivo:

```bash
RUN_BACKUP_ON_DEPLOY=true ./update.sh
```

### Evidencias operacionais

Cada deploy salva artefatos em `.deploy/releases/<timestamp>`:

- `release.env`
- `git-pull.log`
- `build.log`
- `up.log`
- `health.log`
- `smoke.log`
- `web.log`
- `compose-ps.log`
- `maintenance.log`
- `rollback.log` quando houver falha e rollback automatico

### Rollback manual

Se precisar restaurar explicitamente a release anterior:

```bash
./ops/rollback-release.sh .deploy/releases/<timestamp>/release.env
```

O rollback reutiliza a imagem snapshot salva no deploy, recria apenas `web` e espera o `/api/health` voltar com status `ok`.
2. ajuste seus valores reais
