# Save Point Finanças

Plataforma de controle financeiro pessoal com categorização automática por IA, período de teste e sistema de diagnóstico robusto.

## Stack 2026

**100% Dockerizado (x86_64 / ARM64)**

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Vanilla HTML + JS + CSS (Nginx) + HTMX |
| **Backend** | FastAPI + SQLAlchemy (async) |
| **Banco de dados** | PostgreSQL 16 |
| **Cache & Filas** | Redis 7 |
| **Inteligência Artificial** | Claude 3.5 Haiku (Anthropic) |
| **Backup Automático** | Backblaze B2 |

---

## 🚀 Quick Start

```bash
# Clone e configure
git clone <repo> savepoint
cd savepoint
cp .env.example .env

# Configure o .env (veja seção abaixo)
nano .env

# Iniciar
docker compose up -d --build
```

Acesse: `http://localhost` (ou seu domínio)

---

## ⚙️ Configuração do .env

```env
# ── App ─────────────────────────────────────────────────────
APP_NAME=Save Point Finanças
APP_ENV=production
SECRET_KEY=gerar_com_openssl_rand_hex_32
ALLOWED_ORIGINS=["https://seudominio.com"]

# ── Database ─────────────────────────────────────────────────
POSTGRES_DB=savepoint
POSTGRES_USER=savepoint
POSTGRES_PASSWORD=senha_forte

# ── Redis ───────────────────────────────────────────────────
REDIS_PASSWORD=senha_forte
REDIS_URL=redis://:senha_forte@redis:6379/0

# ── Auth ─────────────────────────────────────────────────────
JWT_SECRET_KEY=gerar_com_openssl_rand_hex_64
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# ── AI (Opcional - sem key, só palavras-chave) ─────────────
ANTHROPIC_API_KEY=sk-ant-...

# ── E-mail (Opcional) ───────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=senha_app_google
SMTP_FROM_EMAIL=noreply@seudominio.com
APP_URL=https://seudominio.com

# ── Backup (Opcional) ────────────────────────────────────────
B2_APPLICATION_KEY_ID=
B2_APPLICATION_KEY=
B2_BUCKET_NAME=savepoint-backups
```

---

## 📦 Planos

| Plano | Acesso | Limites |
|-------|--------|---------|
| **Free** | 31 dias de teste | 3 contas, 10 categorias, 100 tx/mês |
| **Pro** | Vitalício | Ilimitado |

### Migrar para Production

Execute a migration após o primeiro deploy:

```bash
# Via API (requires admin)
curl -X POST "https://seudominio.com/api/v1/admin/migrate" \
  -H "Authorization: Bearer TOKEN_ADMIN"
```

---

## 🤖 Sistema de Categorização Automática

### 70% - Palavras-chave (Gratuito)
- 150+ padrões brasileiros
- Suporta: com/sem acentos, minúsculas/maiúsculas
- Execução instantânea, sem custos

### 30% - IA Claude Haiku (Pro)
- Contexto brasileiro completo
- Contextualiza: PIX, TED, termos locais
- Fallback automático para "Outros"

**Arquivo:** `backend/app/services/category_rules.py`

---

## 🔍 Sistema de Diagnóstico Robusto

Endpoints disponíveis (requer auth admin):

| Endpoint | Descrição |
|----------|-----------|
| `/api/v1/admin/diagnostic/complete` | Diagnóstico TOTAL (Python, DB, Frontend, HTMX, etc) |
| `/api/v1/admin/diagnostic` | Diagnóstico rápido do tenant |
| `/api/v1/admin/diagnostic/quick` | Status público do servidor |
| `/api/v1/admin/diagnostic/category/{name}` | Por categoria específica |

### Categorias de Diagnóstico
- **python**: Imports, configurações, routers
- **database**: Conexão, tabelas, FKs, índices
- **auth**: Usuário, tenant, roles
- **routers**: Endpoints, páginas web
- **frontend**: Arquivos HTML, CSS, JS, partials
- **jinja2**: Templates, blocks, extensões
- **htmx**: Partial requests, atributos
- **modais**: Arquivos de modais
- **system**: CPU, memória, disco

```bash
# Diagnóstico completo
curl -H "Authorization: Bearer TOKEN" \
  https://seudominio.com/api/v1/admin/diagnostic/complete

# Resposta exemplo:
{
  "status": "ok",
  "summary": {"total": 25, "ok": 23, "warning": 2, "error": 0},
  "checks": [...]
}
```

---

## 🛡️ Sistema de Roles

| Role | Permissão |
|------|-----------|
| **Admin** | Gerenciar workspace, usuários, configurações |
| **Member** | Adicionar transações, ver relatórios |

---

## 📁 Estrutura

```
savepoint/
├── backend/                    # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── models/            # Modelos SQLAlchemy
│   │   ├── routers/          # Endpoints API
│   │   ├── services/          # AI, E-mail, Auditoria
│   │   ├── middleware/       # Captura de erros
│   │   └── migrations/        # Scripts de migration
│   ├── Dockerfile
│   └── requirements.txt
├── frontend-html/             # UI Vanilla
│   ├── css/                  # Estilos
│   ├── js/                   # Scripts
│   ├── partials/             # Componentes HTMX
│   ├── Dockerfile
│   └── nginx.conf
├── backup/                   # Script B2
├── migrations/               # SQL migrations
├── docker-compose.yml
└── .env
```

---

## 🐳 Comandos Docker

```bash
# Iniciar todos os serviços
docker compose up -d

# Ver logs
docker compose logs -f backend

# Reiniciar
docker compose restart

# Parar
docker compose down

# Rebuild
docker compose up -d --build
```

---

## 📋 Serviços

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| **Frontend** | 80 | Interface web |
| **Backend** | 8000 | API FastAPI |
| **PostgreSQL** | 5432 | Banco de dados |
| **Redis** | 6379 | Cache/Session |
| **Nginx Proxy** | 80/443 | Proxy reverso |

---

## ✅ Funcionalidades

- [x] Controle de receitas e despesas
- [x] Categorização automática (palavras-chave + IA)
- [x] Metas de economia
- [x] Assinaturas e parcelamentos
- [x] Relatórios e gráficos
- [x] Período de teste 31 dias (Free)
- [x] Plano Pro vitalício
- [x] Sistema de diagnóstico completo
- [x] Recuperação de senha por e-mail
- [x] Backup automático (Backblaze B2)

---

## 📄 Licença

MIT License