# Checklist de Producao

## Deploy padrao

Use este fluxo para publicar uma nova versao da aplicacao com validacao basica:

chmod +x ./update.sh
chmod +x ./ops/toggle-maintenance.sh

```bash
./ops/toggle-maintenance.sh on
git pull
docker compose build web audit-server-smoke
docker compose up -d --force-recreate web
docker compose logs --tail=100 web
docker compose run --rm audit-server-smoke
./ops/toggle-maintenance.sh off
```

## Deploy com migration

Quando houver alteracao real de schema:

```bash
git pull
docker compose build web migrate
docker compose up -d --force-recreate web
docker compose --profile ops run --rm migrate
docker compose up -d postgres
docker compose build web migrate
docker compose run --rm backup-once
docker compose run --rm --build migrate
docker compose build web audit-server-smoke
docker compose run --rm migrate
docker compose up -d --force-recreate web
docker compose logs --tail=100 web
docker compose run --rm audit-server-smoke
```

## O que validar

- `savepoint_db` saudavel
- `savepoint_web` recriado sem erro
- logs do `web` sem falha de boot
- `audit-server-smoke` com `Server smoke audit OK`
- em `Configuracoes > Automacoes`, validar se e-mail e WhatsApp aparecem como prontos para envio quando esperados
- em `Configuracoes > Automacoes`, conferir se a pre-visualizacao de avisos mostra assinaturas, faturas e metas coerentes para os proximos 7 dias
- em `Configuracoes > Entregas recentes`, confirmar se os avisos manuais registram status `Entregue` ou mostram a causa real da falha
- ao testar uma transacao de dizimo gerada automaticamente, confirmar que editar/excluir mostra mensagem explicando o vinculo com a receita original

## Servicos que ficam ativos

Depois do smoke, o que permanece ligado e consumindo recurso e apenas o necessario:

- `savepoint_web`
- `savepoint_db`
- `backup`, somente se voce tiver subido esse servico

O container `audit-server-smoke` nao fica residente porque roda com `--rm`.

## Comandos uteis

Estado da stack:

```bash
docker compose ps
```

Logs recentes do app:

```bash
docker compose logs --tail=100 web
```

Logs recentes do banco:

```bash
docker compose logs --tail=100 postgres
```

Parar so a aplicacao:

```bash
docker compose stop web
```

Parar app e banco:

```bash
docker compose stop web postgres
```

Desligar tudo:

```bash
docker compose down
```

## Variaveis importantes para o smoke

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `SMOKE_USER_EMAIL`
- `SMOKE_USER_PASSWORD`
- `SMOKE_MONTH`
- `AUDIT_BASE_URL`

Valor recomendado para ambiente Docker:

```bash
AUDIT_BASE_URL=http://web:3000
```
