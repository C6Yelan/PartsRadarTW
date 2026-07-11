#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ROOT="${BACKUP_DIR:-backups}"
BACKUP_PATH="${1:-}"

if [[ -z "$BACKUP_PATH" ]]; then
  BACKUP_PATH="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d | sort | tail -n 1)"
fi

if [[ -z "$BACKUP_PATH" || ! -f "$BACKUP_PATH/postgres.dump" || ! -f "$BACKUP_PATH/SHA256SUMS" ]]; then
  echo "Backup directory with postgres.dump and SHA256SUMS was not found." >&2
  exit 1
fi

echo "Verifying backup checksums..."
(
  cd "$BACKUP_PATH"
  sha256sum --check SHA256SUMS
)

POSTGRES_DB_NAME="$(docker compose exec -T postgres sh -c 'printf "%s" "$POSTGRES_DB"')"
DRILL_DB="${RESTORE_DRILL_DB:-${POSTGRES_DB_NAME}_restore_drill}"

validate_identifier() {
  local value="$1"
  local label="$2"

  if [[ ! "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "$label must be a safe PostgreSQL identifier: $value" >&2
    exit 1
  fi
}

validate_identifier "$DRILL_DB" "RESTORE_DRILL_DB"

if [[
  "$DRILL_DB" == "$POSTGRES_DB_NAME" ||
    "$DRILL_DB" == "postgres" ||
    "$DRILL_DB" == "template0" ||
    "$DRILL_DB" == "template1"
]]; then
  echo "RESTORE_DRILL_DB must not name the production or a PostgreSQL system database: $DRILL_DB" >&2
  exit 1
fi

echo "Restoring $BACKUP_PATH/postgres.dump into temporary database $DRILL_DB..."
docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1' \
  <<SQL
DROP DATABASE IF EXISTS "$DRILL_DB";
CREATE DATABASE "$DRILL_DB";
SQL

docker compose exec -T postgres sh -c \
  'pg_restore --username "$POSTGRES_USER" --dbname "$1" --no-owner --no-acl' sh "$DRILL_DB" \
  < "$BACKUP_PATH/postgres.dump"

docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$1" --set ON_ERROR_STOP=1 --command "select count(*) as source_category_count from source_categories;"' sh "$DRILL_DB"

if [[ "${KEEP_RESTORE_DRILL_DB:-0}" == "1" ]]; then
  echo "Keeping restore drill database: $DRILL_DB"
else
  docker compose exec -T postgres sh -c \
    'psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 --command "DROP DATABASE \"$1\";"' sh "$DRILL_DB"
  echo "Dropped restore drill database: $DRILL_DB"
fi

echo "Restore drill finished."
