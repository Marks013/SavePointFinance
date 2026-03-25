# Save Point Finanças

Plataforma de controle financeiro pessoal gamificada, focada em metas e sonhos, com integração WhatsApp nativa e classificação de transações por IA.

## Stack 2026

**100% Dockerizado e Multi-arch (x86_64 / ARM64 - Compatível com Oracle Cloud Free Tier)**

| Camada | Tecnologia |
|--------|-----------|
| **Frontend** | Vanilla HTML + JS + CSS Vitals (Nginx) |
| **Backend** | FastAPI + SQLAlchemy (async) |
| **Banco de dados** | PostgreSQL 16 |
| **Cache & Filas** | Redis 7 |
| **Integração WhatsApp**| Meta Cloud API Nativa (Webhooks) |
| **Inteligência Artificial**| Claude 3.5 Haiku (Anthropic) |
| **Backup Automático** | Backblaze B2 |

## 🚀 Arquitetura Multi-Arch e Deploy

Este projeto está pronto para rodar em qualquer VPS (DigitalOcean, Hetzner, Contabo) ou **Oracle Cloud Free Tier (ARM)**.

### 1. Preparação

```bash
# Clone o projeto
git clone <seu-repositorio> savepoint
cd savepoint

# Configure as variáveis de ambiente
cp .env.example .env
nano .env  # Preencha todas as chaves obrigatórias!
```

**Variáveis Obrigatórias no `.env`:**
- `SECRET_KEY` — Gere com `openssl rand -hex 32`
- `JWT_SECRET_KEY` — Gere com `openssl rand -hex 64`
- `POSTGRES_PASSWORD` — Senha forte para o banco
- `ANTHROPIC_API_KEY` — Chave do Claude API
- `META_VERIFY_TOKEN` e `META_TOKEN` — Integração WhatsApp

### 2. Rodando o Projeto

Suba todos os serviços usando Docker Compose. Ele já construirá o Nginx para o Frontend e a imagem customizada para o FastAPI de forma compatível com a arquitetura do servidor hospedeiro.

```bash
docker compose up -d --build
```

**Serviços Iniciados:**
- **Frontend (Painel):** http://localhost (ou porta configurada em HTTP_PORT)
- **Backend API & Webhooks:** Isolado da rede externa pelo Nginx
- **API Docs:** http://localhost/api/docs

## 💬 Integração WhatsApp (Meta Cloud API)

O sistema possui integração oficial com o WhatsApp via Meta Cloud API.

1. Configure o Webhook no painel da Meta Developers apontando para:
   `https://seu-dominio.com/api/v1/webhook`
2. Configure o `Token de Verificação` para bater com o `META_VERIFY_TOKEN` no `.env`.
3. Interaja com a IA pelo WhatsApp:
   - *"Gastei 45 no ifood hoje"* (Registra R$ 45,00 em Alimentação)
   - *"Recebi 5000 do meu salário"* (Registra R$ 5000 como Receita)
   - *"Qual meu saldo?"* (Responde com fechamento atual)

## 🛡️ Backups Automáticos

O serviço `backup` no Docker Compose roda às **03:00 AM** diariamente (via cron), criando um dump do PostgreSQL comprimido e enviando para o seu bucket no Backblaze B2.
A retenção padrão é de 30 dias (configurável no `.env`).

## 🧱 Estrutura de Diretórios

```
savepoint/
├── backend/            # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── models/     # Modelos do DB
│   │   ├── routers/    # Endpoints
│   │   └── services/   # Integração Claude e Meta API
│   ├── Dockerfile
│   └── requirements.txt
├── frontend-html/      # UI (Vanilla HTML/CSS/JS)
│   ├── css/
│   ├── js/
│   ├── Dockerfile
│   └── nginx.conf      # Reverse Proxy
├── backup/             # Script de backup para B2
├── docker-compose.yml  # Orquestração
└── .env.example
```
