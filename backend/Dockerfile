# ═══════════════════════════════════════════════════════════════════════════
# Save Point Finanças v3.1 — Dockerfile
#
# Multi-arch: ARM64 (Oracle Cloud Free Tier) + x86_64 (qualquer VPS)
# O Coolify detecta a arquitetura automaticamente no build.
#
# IMPORTANTE: O app roda na porta 8000 internamente.
# A porta 80/443 é gerenciada pelo Traefik do Coolify — NÃO exponha aqui.
# ═══════════════════════════════════════════════════════════════════════════

FROM python:3.12-slim

# Metadados
LABEL maintainer="Save Point Finanças"
LABEL version="3.1.0"

WORKDIR /app

# ── Dependências de sistema ────────────────────────────────────────
# libpq-dev + gcc: necessários para asyncpg compilar em ARM64
# curl: usado pelo healthcheck do docker-compose
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ── Dependências Python ────────────────────────────────────────────
# Copia só o requirements.txt primeiro para aproveitar cache do Docker
# (camada só invalida se requirements.txt mudar)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Código da aplicação ────────────────────────────────────────────
COPY . .

# ── Porta interna ──────────────────────────────────────────────────
# Apenas documenta — o Traefik do Coolify acessa esta porta via rede Docker
EXPOSE 8000

# ── Comando de produção ────────────────────────────────────────────
# Configuração otimizada para Oracle Cloud (3 CPU, 24GB RAM):
# --workers 6       → 2x CPU = 6 workers (balance ideal)
# --proxy-headers   → Lê X-Forwarded-For / X-Forwarded-Proto do Traefik
# --forwarded-allow-ips='*' → Confia em qualquer proxy upstream
# --access-log      → Loga requisições (útil para debug)
# --log-level info  → Nível de log adequado para produção
# --limit-concurrency 100   → Max 100 requisições simultâneas por worker
# --limit-max-connections 1000 → Max conexões simultâneas total
# --timeout-keep-alive 60   → Keep-alive para conexões persistentes
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "6", \
     "--proxy-headers", \
     "--forwarded-allow-ips=*", \
     "--access-log", \
     "--log-level", "info", \
     "--limit-concurrency", "100", \
     "--timeout-keep-alive", "60"]
