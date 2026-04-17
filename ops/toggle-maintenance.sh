#!/bin/sh

set -eu

MODE="${1:-}"
ENV_FILE="${ENV_FILE:-./.env}"
SERVICE_NAME="${SERVICE_NAME:-web}"

if [ -z "$MODE" ]; then
  echo "Uso: ./ops/toggle-maintenance.sh [on|off]"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo de ambiente não encontrado: $ENV_FILE"
  exit 1
fi

case "$MODE" in
  on)
    NEXT_VALUE="true"
    echo "Ativando modo de manutenção..."
    ;;
  off)
    NEXT_VALUE="false"
    echo "Desativando modo de manutenção..."
    ;;
  *)
    echo "Argumento inválido. Use 'on' ou 'off'."
    exit 1
    ;;
esac

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

if grep -q '^MAINTENANCE_MODE=' "$ENV_FILE"; then
  awk -v value="$NEXT_VALUE" '
    BEGIN { updated = 0 }
    /^MAINTENANCE_MODE=/ {
      print "MAINTENANCE_MODE=" value
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print "MAINTENANCE_MODE=" value
      }
    }
  ' "$ENV_FILE" > "$TMP_FILE"
else
  cat "$ENV_FILE" > "$TMP_FILE"
  printf '\nMAINTENANCE_MODE=%s\n' "$NEXT_VALUE" >> "$TMP_FILE"
fi

mv "$TMP_FILE" "$ENV_FILE"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "Docker Compose não está disponível no host."
  exit 1
fi

echo "Recriando apenas o serviço ${SERVICE_NAME} para recarregar o .env..."
# restart não recarrega env_file; force-recreate recarrega sem rebuildar a imagem
$COMPOSE_CMD up -d --no-deps --force-recreate "$SERVICE_NAME"

echo "Modo de manutenção atualizado com sucesso."
