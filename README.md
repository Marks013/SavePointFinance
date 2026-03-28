# Save Point Finanças v3.1

Plataforma de controle financeiro pessoal, gamificada, com integração WhatsApp e classificação por IA em 3 camadas.

## Deploy (Coolify + Oracle Cloud)

1. Fork/clone este repositório
2. No Coolify: New Service → Docker Compose → cole o `docker-compose.yml`
3. Configure as variáveis de ambiente (veja `.env.example`)
4. Defina seu domínio no painel → Coolify gera o SSL automaticamente
5. Deploy

## Após o primeiro deploy

Execute a migration SQL no banco:
```bash
docker exec -i savepoint_db psql -U savepoint -d savepoint < backend/app/migrations/migration_v3_1.sql
```

Crie o superadmin:
```bash
curl -X POST https://SEU_DOMINIO/api/v1/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"name":"Admin","email":"admin@exemplo.com","password":"senha123","secret_key":"SUA_SECRET_KEY"}'
```

## Stack
- FastAPI + Jinja2 + HTMX (monolith SSR)
- PostgreSQL 16 + Redis 7
- Claude Haiku 4.5 (classificação IA — ~R$ 0,15/mês)
- Backblaze B2 (backup automático diário)
