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

if [[ -L "$BACKUP_PATH/postgres.dump" || -L "$BACKUP_PATH/SHA256SUMS" ]]; then
  echo "postgres.dump and SHA256SUMS must not be symbolic links." >&2
  exit 1
fi

validate_checksum_manifest() {
  local manifest_path="$1"
  local manifest_line_pattern='^[0-9A-Fa-f]{64} [ *](\./)?([A-Za-z0-9][A-Za-z0-9._-]*)$'
  local line=""
  local line_number=0
  local artifact_name=""
  local dump_entry_count=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line_number=$((line_number + 1))

    if [[ ! "$line" =~ $manifest_line_pattern ]]; then
      echo "Unsafe or malformed checksum entry at line $line_number." >&2
      exit 1
    fi

    artifact_name="${BASH_REMATCH[2]}"
    if [[ ! -f "$BACKUP_PATH/$artifact_name" || -L "$BACKUP_PATH/$artifact_name" ]]; then
      echo "Checksum artifact must be a regular non-symlink file: $artifact_name" >&2
      exit 1
    fi

    if [[ "$artifact_name" == "postgres.dump" ]]; then
      dump_entry_count=$((dump_entry_count + 1))
    fi
  done < "$manifest_path"

  if [[ "$dump_entry_count" -ne 1 ]]; then
    echo "SHA256SUMS must contain exactly one postgres.dump entry." >&2
    exit 1
  fi
}

echo "Verifying backup checksums..."
validate_checksum_manifest "$BACKUP_PATH/SHA256SUMS"
(
  cd "$BACKUP_PATH"
  sha256sum --check --strict -- SHA256SUMS
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

DRILL_DB_CREATED=0

drop_restore_drill_database() {
  docker compose exec -T postgres sh -c \
    'psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 --command "DROP DATABASE \"$1\";"' sh "$DRILL_DB"
}

cleanup_restore_drill_database() {
  local cleanup_status=0

  if drop_restore_drill_database; then
    DRILL_DB_CREATED=0
    echo "Dropped restore drill database: $DRILL_DB"
    return 0
  else
    cleanup_status=$?
    echo "Failed to drop restore drill database $DRILL_DB; manual cleanup is required." >&2
    return "$cleanup_status"
  fi
}

cleanup_restore_drill_database_on_exit() {
  local exit_status=$?
  local cleanup_status=0

  trap - EXIT

  if [[ "$DRILL_DB_CREATED" != "1" ]]; then
    exit "$exit_status"
  fi

  if [[ "${KEEP_RESTORE_DRILL_DB:-0}" == "1" ]]; then
    echo "Keeping restore drill database: $DRILL_DB"
    exit "$exit_status"
  fi

  set +e
  cleanup_restore_drill_database
  cleanup_status=$?
  set -e

  if [[ "$exit_status" -ne 0 ]]; then
    exit "$exit_status"
  fi

  exit "$cleanup_status"
}

echo "Restoring $BACKUP_PATH/postgres.dump into temporary database $DRILL_DB..."
docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1' \
  <<SQL
DROP DATABASE IF EXISTS "$DRILL_DB";
CREATE DATABASE "$DRILL_DB";
SQL

DRILL_DB_CREATED=1
trap cleanup_restore_drill_database_on_exit EXIT

docker compose exec -T postgres sh -c \
  'pg_restore --username "$POSTGRES_USER" --dbname "$1" --no-owner --no-acl' sh "$DRILL_DB" \
  < "$BACKUP_PATH/postgres.dump"

docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$1" --set ON_ERROR_STOP=1 --command "select count(*) as source_category_count from source_categories;"' sh "$DRILL_DB"

if [[ "${KEEP_RESTORE_DRILL_DB:-0}" == "1" ]]; then
  echo "Keeping restore drill database: $DRILL_DB"
  DRILL_DB_CREATED=0
else
  if cleanup_restore_drill_database; then
    :
  else
    cleanup_status=$?
    trap - EXIT
    exit "$cleanup_status"
  fi
fi

trap - EXIT
echo "Restore drill finished."
