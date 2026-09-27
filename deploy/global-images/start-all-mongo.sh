#!/usr/bin/env bash
# Mongo-Metadaten-Variante des TDAI-Stacks starten.
#
# Nur die METADATEN-Ebene geht nach MongoDB (audit / skills / instances).
# Die Memory/Vector-Ebene kennt kein Mongo (nur sqlite | tcvdb) und bleibt hier
# bewusst auf sqlite — siehe Kommentar in docker-compose.mongo.yml.
#
# Usage:
#   ./start-all-mongo.sh            # evaluiert .env, prueft Ports, startet beide Container
#   PULL=1 ./start-all-mongo.sh     # vorher Images pullen
#   ./start-all-mongo.sh --down     # wieder runterfahren (Volumes bleiben)
#   ./start-all-mongo.sh --logs     # Logs folgen
#
# Vorher: cp .env.example .env   und die MEMORY_LLM_* / MEMORY_CORE_* Werte setzen.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_lib.sh
source "$SCRIPT_DIR/_lib.sh"

COMPOSE_FILE="$SCRIPT_DIR/docker-compose.mongo.yml"
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-tdai-mongo}"

case "${1:-}" in
  --down)
    info "Fahre Stack herunter (Volumes bleiben erhalten)"
    $DOCKER compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down
    ok "Down. Volumes: docker volume ls | grep tdai-mongo"
    exit 0
    ;;
  --logs)
    exec $DOCKER compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" logs -f
    ;;
  "") ;;
  *) die "Unbekanntes Argument: $1 (erlaubt: --down, --logs)" ;;
esac

[[ -f "$ENV_FILE" ]] || die ".env fehlt. Erst: cp .env.example .env und MEMORY_LLM_* setzen."
load_env

# Nur die Variablen pruefen, die diese Variante wirklich braucht.
# PROXY_* / PANEL_* / KNOWLEDGE_* sind hier irrelevant — es laeuft nur der Core.
require_vars \
  MEMORY_CORE_IMAGE MEMORY_CORE_PORT \
  MEMORY_LLM_BASE_URL MEMORY_LLM_API_KEY MEMORY_LLM_MODEL

info "═══ Hintergrund: welche Ebene geht wohin ═══════════════════════════"
echo "  Metadaten (audit/skills/instances) → MongoDB  (TDAI_METADATA_MONGO_URI)"
echo "  Memory/Vector (L0-L3)              → SQLite   (STORE_MODE=sqlite)"

if [[ "${PULL:-0}" == "1" ]]; then
  info "Pulle Images"
  $DOCKER compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" pull
fi

info "═══ Starte mongo-search + memory-core ══════════════════════════════"
# --wait blockiert, bis beide Container healthy sind (mongo-search wartet auf
# isWritablePrimary, memory-core auf /health). Ohne --wait wuerde das Skript
# gruen melden, waehrend das ReplicaSet noch gar keinen Primary hat.
$DOCKER compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d --wait

ok "═══ Stack oben ══════════════════════════════════════════════════════"
echo ""
echo "  Health:      curl -s http://localhost:${MEMORY_CORE_PORT}/health"
echo "  Logs:        $DOCKER compose -p $PROJECT_NAME -f docker-compose.mongo.yml logs -f"
echo "  Stoppen:     ./start-all-mongo.sh --down"
echo ""
echo "  ── Verifizieren, dass Mongo WIRKLICH genutzt wird ───────────────"
echo "  /health kennt kein metadata.backend (Stand 2026-09). Stattdessen:"
echo "    1) $DOCKER logs tdai-memory-core-mongo 2>&1 | grep -i 'metadata\\|mongo'"
echo "    2) $DOCKER exec tdai-mongo-search mongosh --quiet --eval \"db.getMongo().getDBNames()\""
echo "       → erwartet: tdai_metadata_<instance_id>"
echo ""
