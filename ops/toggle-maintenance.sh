#!/bin/sh

set -eu

MODE="${1:-}"
ENV_FILE="${ENV_FILE:-./.env}"
SERVICE_NAME="${SERVICE_NAME:-web}"

if [ -z "$MODE" ]; then
  echo "Uso: ./ops/toggle-maintenance.sh [on|off]"
  exit 1
fi

mkdir -p "$(dirname "$ENV_FILE")"
[ -f "$ENV_FILE" ] || : > "$ENV_FILE"

set_env_value() {
  key="$1"
  value="$2"
  tmp_file="$3"

  if grep -q "^${key}=" "$ENV_FILE"; then
    awk -v key="$key" -v value="$value" '
      BEGIN { updated = 0 }
      $0 ~ "^" key "=" {
        print key "=" value
        updated = 1
        next
      }
      { print }
      END {
        if (!updated) {
          print key "=" value
        }
      }
    ' "$ENV_FILE" > "$tmp_file"
  else
    cat "$ENV_FILE" > "$tmp_file"
    printf '\n%s=%s\n' "$key" "$value" >> "$tmp_file"
  fi

  mv "$tmp_file" "$ENV_FILE"
}

generate_bypass_token() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v sha256sum >/dev/null 2>&1; then
    printf '%s-%s-%s\n' "$(date +%s)" "$$" "$(hostname 2>/dev/null || echo savepoint)" | sha256sum | awk '{ print $1 }'
  else
    printf '%s-%s-%s\n' "$(date +%s)" "$$" "$(hostname 2>/dev/null || echo savepoint)"
  fi
}

case "$MODE" in
  on)
    NEXT_VALUE="true"
    echo "Ativando modo de manutencao..."
    ;;
  off)
    NEXT_VALUE="false"
    echo "Desativando modo de manutencao..."
    ;;
  *)
    echo "Argumento invalido. Use 'on' ou 'off'."
    exit 1
    ;;
esac

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT
set_env_value "MAINTENANCE_MODE" "$NEXT_VALUE" "$TMP_FILE"

if [ "$NEXT_VALUE" = "true" ]; then
  EXISTING_TOKEN="$(grep '^MAINTENANCE_BYPASS_TOKEN=' "$ENV_FILE" | tail -n 1 | cut -d '=' -f 2- || true)"

  if [ -z "$EXISTING_TOKEN" ]; then
    TMP_FILE="$(mktemp)"
    EXISTING_TOKEN="$(generate_bypass_token)"
    set_env_value "MAINTENANCE_BYPASS_TOKEN" "$EXISTING_TOKEN" "$TMP_FILE"
  fi
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Docker Compose nao esta disponivel no host."
  exit 1
fi

echo "Recriando apenas o servico ${SERVICE_NAME} para recarregar o .env..."
# restart nao recarrega env_file; force-recreate recarrega sem rebuildar a imagem
$COMPOSE_CMD up -d --no-deps --force-recreate "$SERVICE_NAME"

echo "Modo de manutencao atualizado com sucesso."
if [ "$NEXT_VALUE" = "true" ]; then
  echo "Bypass para auditorias: export AUDIT_MAINTENANCE_BYPASS_TOKEN=${EXISTING_TOKEN}"
fi
