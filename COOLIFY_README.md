# Coolify Configuration for Save Point Finanças
#
# Este arquivo é lido automaticamente pelo Coolify ao fazer deploy.
# Cole o conteúdo abaixo no campo "Docker Compose" do Coolify.

# ── Configurações Obrigatórias ─────────────────────────────────────────
# Variables to set in Coolify Environment Variables:
#
# APP_NAME=Save Point Finanças
# APP_ENV=production
# SECRET_KEY=<gerar com: openssl rand -hex 32>
# JWT_SECRET_KEY=<gerar com: openssl rand -hex 64>
# ALLOWED_ORIGINS=["https://SEU_DOMINIO"]
# POSTGRES_PASSWORD=<gerar com: openssl rand -hex 24>
# REDIS_PASSWORD=<gerar com: openssl rand -hex 24>
# SECURE_COOKIES=true

# ── Configurações Opcionais ─────────────────────────────────────────────
# ANTHROPIC_API_KEY=sk-ant-...  (para classificação IA)
# META_TOKEN=...  (para WhatsApp)
# META_PHONE_ID=...
# B2_APPLICATION_KEY_ID=...  (para backups)
# B2_APPLICATION_KEY=...

# ── Recursos do Servidor ───────────────────────────────────────────────
# Oracle Cloud Free Tier: 1 OCPU, 1GB RAM
# workers: 2 (no uvicorn CMD)
# PostgreSQL: 1GB RAM alocado
# Redis: 128MB RAM

# ── URLs de Banco ───────────────────────────────────────────────────────
# DATABASE_URL é montada automaticamente no docker-compose:
# postgresql+asyncpg://savepoint:<SENHA>@postgres:5432/savepoint

# REDIS_URL é montada automaticamente no docker-compose:
# redis://:password@redis:6379/0
