#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ROOT="${BACKUP_DIR:-backups}"
BACKUP_PATH="${1:-}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-partsradar-tw}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-alpine:3.20}"
KEEP_RESTORE_DRILL_DB="${KEEP_RESTORE_DRILL_DB:-0}"

if [[ ! "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "COMPOSE_PROJECT_NAME contains unsupported characters: $COMPOSE_PROJECT_NAME" >&2
  exit 1
fi

if [[ "$KEEP_RESTORE_DRILL_DB" != "0" && "$KEEP_RESTORE_DRILL_DB" != "1" ]]; then
  echo "KEEP_RESTORE_DRILL_DB must be 0 or 1." >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME

if [[ -z "$BACKUP_PATH" ]]; then
  BACKUP_PATH="$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*T[0-9]*Z' | sort | tail -n 1)"
fi

if [[ -z "$BACKUP_PATH" || ! -d "$BACKUP_PATH" ]]; then
  echo "Backup directory was not found." >&2
  exit 1
fi

BACKUP_PATH="$(cd "$BACKUP_PATH" && pwd -P)"

if [[ ! -f "$BACKUP_PATH/postgres.dump" || ! -f "$BACKUP_PATH/SHA256SUMS" ]]; then
  echo "Backup directory with postgres.dump and SHA256SUMS was not found." >&2
  exit 1
fi

if [[ -L "$BACKUP_PATH/postgres.dump" || -L "$BACKUP_PATH/SHA256SUMS" ]]; then
  echo "postgres.dump and SHA256SUMS must not be symbolic links." >&2
  exit 1
fi

declare -A CHECKSUM_ARTIFACTS=()

manifest_has_artifact() {
  local artifact_name="$1"
  [[ -n "${CHECKSUM_ARTIFACTS[$artifact_name]:-}" ]]
}

require_manifest_artifact() {
  local artifact_name="$1"

  if ! manifest_has_artifact "$artifact_name"; then
    echo "Required artifact is not protected by SHA256SUMS: $artifact_name" >&2
    exit 1
  fi
}

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
    if [[ "$artifact_name" == "SHA256SUMS" ]]; then
      echo "SHA256SUMS must not include itself." >&2
      exit 1
    fi

    if manifest_has_artifact "$artifact_name"; then
      echo "Duplicate checksum artifact: $artifact_name" >&2
      exit 1
    fi

    if [[ ! -f "$BACKUP_PATH/$artifact_name" || -L "$BACKUP_PATH/$artifact_name" ]]; then
      echo "Checksum artifact must be a regular non-symlink file: $artifact_name" >&2
      exit 1
    fi

    CHECKSUM_ARTIFACTS["$artifact_name"]=1
    if [[ "$artifact_name" == "postgres.dump" ]]; then
      dump_entry_count=$((dump_entry_count + 1))
    fi
  done < "$manifest_path"

  if [[ "$dump_entry_count" -ne 1 ]]; then
    echo "SHA256SUMS must contain exactly one postgres.dump entry." >&2
    exit 1
  fi
}

METADATA_FORMAT_VERSION=""
METADATA_CREATED_AT=""
METADATA_COMPOSE_PROJECT=""
METADATA_SOURCE_COMMIT=""
METADATA_PRODUCT_IMAGES_INCLUDED=""
METADATA_SNAPSHOTS_INCLUDED=""

validate_backup_metadata() {
  local metadata_path="$1"
  local line=""
  local key=""
  local value=""
  declare -A seen_keys=()

  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" != *=* ]]; then
      echo "Malformed backup metadata entry." >&2
      exit 1
    fi

    key="${line%%=*}"
    value="${line#*=}"
    if [[ -n "${seen_keys[$key]:-}" ]]; then
      echo "Duplicate backup metadata key: $key" >&2
      exit 1
    fi
    seen_keys["$key"]=1

    case "$key" in
      backup_format_version) METADATA_FORMAT_VERSION="$value" ;;
      created_at_utc) METADATA_CREATED_AT="$value" ;;
      compose_project_name) METADATA_COMPOSE_PROJECT="$value" ;;
      source_git_commit) METADATA_SOURCE_COMMIT="$value" ;;
      product_images_included) METADATA_PRODUCT_IMAGES_INCLUDED="$value" ;;
      snapshots_included) METADATA_SNAPSHOTS_INCLUDED="$value" ;;
      *)
        echo "Unsupported backup metadata key: $key" >&2
        exit 1
        ;;
    esac
  done < "$metadata_path"

  if [[ "$METADATA_FORMAT_VERSION" != "2" ]]; then
    echo "Unsupported backup format version: ${METADATA_FORMAT_VERSION:-missing}" >&2
    exit 1
  fi
  if [[ ! "$METADATA_CREATED_AT" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
    echo "Invalid created_at_utc in backup metadata." >&2
    exit 1
  fi
  if [[ ! "$METADATA_COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
    echo "Invalid compose_project_name in backup metadata." >&2
    exit 1
  fi
  if [[ ! "$METADATA_SOURCE_COMMIT" =~ ^([0-9a-f]{40}|[0-9a-f]{64}|unknown)$ ]]; then
    echo "Invalid source_git_commit in backup metadata." >&2
    exit 1
  fi
  if [[ "$METADATA_PRODUCT_IMAGES_INCLUDED" != "1" ]]; then
    echo "Backup format v2 requires product_images_included=1." >&2
    exit 1
  fi
  if [[ "$METADATA_SNAPSHOTS_INCLUDED" != "0" && "$METADATA_SNAPSHOTS_INCLUDED" != "1" ]]; then
    echo "snapshots_included must be 0 or 1 in backup metadata." >&2
    exit 1
  fi
}

echo "Verifying backup checksums..."
validate_checksum_manifest "$BACKUP_PATH/SHA256SUMS"

for archive_name in product-images.tgz snapshots.tgz; do
  if [[ -f "$BACKUP_PATH/$archive_name" ]] && ! manifest_has_artifact "$archive_name"; then
    echo "Archive exists but is not protected by SHA256SUMS: $archive_name" >&2
    exit 1
  fi
done

(
  cd "$BACKUP_PATH"
  sha256sum --check --strict -- SHA256SUMS
)

if [[ -f "$BACKUP_PATH/backup-metadata.txt" ]]; then
  require_manifest_artifact "backup-metadata.txt"
  validate_backup_metadata "$BACKUP_PATH/backup-metadata.txt"
  require_manifest_artifact "README.txt"
  require_manifest_artifact "postgres.timestamp.txt"
  require_manifest_artifact "postgres.version.txt"
  require_manifest_artifact "product-images.tgz"

  if [[ "$METADATA_SNAPSHOTS_INCLUDED" == "1" ]]; then
    require_manifest_artifact "snapshots.tgz"
  elif manifest_has_artifact "snapshots.tgz" || [[ -f "$BACKUP_PATH/snapshots.tgz" ]]; then
    echo "Backup metadata says snapshots are excluded, but snapshots.tgz is present." >&2
    exit 1
  fi
else
  echo "Warning: legacy backup without versioned metadata; only listed artifacts can be drilled." >&2
fi

if [[ "${RESTORE_DRILL_CONFIRM_DISPOSABLE:-0}" != "1" ]]; then
  echo "Set RESTORE_DRILL_CONFIRM_DISPOSABLE=1 only after targeting a disposable Compose/PostgreSQL project." >&2
  exit 1
fi

echo "Validating PostgreSQL dump catalog..."
docker compose exec -T postgres sh -c 'pg_restore --list >/dev/null' < "$BACKUP_PATH/postgres.dump"

POSTGRES_DB_NAME="$(docker compose exec -T postgres sh -c 'printf "%s" "$POSTGRES_DB"')"
DEFAULT_DRILL_DB="partsradar_restore_drill_$(date -u +%Y%m%d%H%M%S)_$$"
DRILL_DB="${RESTORE_DRILL_DB:-$DEFAULT_DRILL_DB}"
POSTGRES_CONTAINER_ID="$(docker compose ps -q postgres)"

validate_identifier() {
  local value="$1"
  local label="$2"

  if [[ ! "$value" =~ ^[A-Za-z_][A-Za-z0-9_]*$ || ${#value} -gt 63 ]]; then
    echo "$label must be a safe PostgreSQL identifier of at most 63 bytes: $value" >&2
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

if [[ -z "$POSTGRES_CONTAINER_ID" ]]; then
  echo "Disposable PostgreSQL container is not running." >&2
  exit 1
fi

echo "Restore target: compose_project=$COMPOSE_PROJECT_NAME postgres_container=${POSTGRES_CONTAINER_ID:0:12} database=$DRILL_DB"

DRILL_DB_CREATED=0
declare -a DRILL_VOLUMES=()

drop_restore_drill_database() {
  docker compose exec -T postgres sh -c \
    'psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 --command "DROP DATABASE \"$1\" WITH (FORCE);"' sh "$DRILL_DB"
}

cleanup_restore_drill_database() {
  if drop_restore_drill_database; then
    DRILL_DB_CREATED=0
    echo "Dropped restore drill database: $DRILL_DB"
    return 0
  fi

  echo "Failed to drop restore drill database $DRILL_DB; manual cleanup is required." >&2
  return 1
}

cleanup_restore_drill_volumes() {
  local cleanup_status=0
  local volume_name=""

  for volume_name in "${DRILL_VOLUMES[@]}"; do
    if docker volume rm "$volume_name" >/dev/null; then
      echo "Removed restore drill volume: $volume_name"
    else
      echo "Failed to remove restore drill volume $volume_name; manual cleanup is required." >&2
      cleanup_status=1
    fi
  done

  DRILL_VOLUMES=()
  return "$cleanup_status"
}

cleanup_restore_drill_resources_on_exit() {
  local exit_status=$?
  local cleanup_status=0
  trap - EXIT INT TERM
  set +e

  if [[ "$DRILL_DB_CREATED" == "1" ]]; then
    if [[ "$KEEP_RESTORE_DRILL_DB" == "1" ]]; then
      echo "Keeping restore drill database: $DRILL_DB"
    elif ! cleanup_restore_drill_database; then
      cleanup_status=1
    fi
  fi

  if ! cleanup_restore_drill_volumes; then
    cleanup_status=1
  fi

  set -e
  if [[ "$exit_status" -ne 0 ]]; then
    exit "$exit_status"
  fi
  if [[ "$cleanup_status" -ne 0 ]]; then
    exit "$cleanup_status"
  fi

  echo "Restore drill finished."
  exit 0
}

trap cleanup_restore_drill_resources_on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

DATABASE_EXISTS="$(
  docker compose exec -T postgres sh -c \
    'psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 --tuples-only --no-align' <<SQL
SELECT 1 FROM pg_database WHERE datname = '$DRILL_DB';
SQL
)"

if [[ -n "$DATABASE_EXISTS" ]]; then
  echo "Restore drill database already exists and will not be overwritten: $DRILL_DB" >&2
  exit 1
fi

echo "Restoring $BACKUP_PATH/postgres.dump into temporary database $DRILL_DB..."
docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1' <<SQL
CREATE DATABASE "$DRILL_DB";
SQL

DRILL_DB_CREATED=1

docker compose exec -T postgres sh -c \
  'pg_restore --username "$POSTGRES_USER" --dbname "$1" --no-owner --no-acl --exit-on-error' sh "$DRILL_DB" \
  < "$BACKUP_PATH/postgres.dump"

UNRESOLVED_MIGRATIONS="$(
  docker compose exec -T postgres sh -c \
    'psql --username "$POSTGRES_USER" --dbname "$1" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select count(*) from \"_prisma_migrations\" where finished_at is null and rolled_back_at is null;"' sh "$DRILL_DB"
)"

if [[ ! "$UNRESOLVED_MIGRATIONS" =~ ^[0-9]+$ || "$UNRESOLVED_MIGRATIONS" != "0" ]]; then
  echo "Restored database contains unresolved Prisma migrations: $UNRESOLVED_MIGRATIONS" >&2
  exit 1
fi

RESTORED_MIGRATION_HISTORY="$(
  docker compose exec -T postgres sh -c \
    'psql --username "$POSTGRES_USER" --dbname "$1" --set ON_ERROR_STOP=1 --tuples-only --no-align --field-separator="|" --command "select migration_name, checksum from \"_prisma_migrations\" where finished_at is not null and rolled_back_at is null order by started_at, migration_name;"' sh "$DRILL_DB"
)"

declare -a REPOSITORY_MIGRATIONS=()
while IFS= read -r migration_name; do
  REPOSITORY_MIGRATIONS+=("$migration_name")
done < <(find packages/db/prisma/migrations -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)

RESTORED_MIGRATION_COUNT=0
if [[ -n "$RESTORED_MIGRATION_HISTORY" ]]; then
  while IFS='|' read -r migration_name migration_checksum; do
    if [[ ! "$migration_name" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ || ! "$migration_checksum" =~ ^[0-9a-f]{64}$ ]]; then
      echo "Restored Prisma migration history contains an unsafe or malformed entry." >&2
      exit 1
    fi
    if [[ "$RESTORED_MIGRATION_COUNT" -ge "${#REPOSITORY_MIGRATIONS[@]}" ]]; then
      echo "Restored database contains a migration not present in the repository: $migration_name" >&2
      exit 1
    fi

    expected_migration_name="${REPOSITORY_MIGRATIONS[$RESTORED_MIGRATION_COUNT]}"
    if [[ "$migration_name" != "$expected_migration_name" ]]; then
      echo "Restored migration history is not a repository prefix at: $migration_name" >&2
      exit 1
    fi

    migration_file="packages/db/prisma/migrations/$migration_name/migration.sql"
    expected_checksum="$(sha256sum -- "$migration_file")"
    expected_checksum="${expected_checksum%% *}"
    if [[ "$migration_checksum" != "$expected_checksum" ]]; then
      echo "Restored migration checksum differs from the repository: $migration_name" >&2
      exit 1
    fi

    RESTORED_MIGRATION_COUNT=$((RESTORED_MIGRATION_COUNT + 1))
  done <<< "$RESTORED_MIGRATION_HISTORY"
fi

echo "Validated $RESTORED_MIGRATION_COUNT restored Prisma migrations against the repository prefix."
echo "Restored core table counts:"
docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$1" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select metric || '\''='\'' || row_count from (select '\''crawl_runs'\'' as metric, count(*)::text as row_count from crawl_runs union all select '\''current_prices'\'', count(*)::text from current_prices union all select '\''price_snapshots'\'', count(*)::text from price_snapshots union all select '\''products'\'', count(*)::text from products union all select '\''raw_snapshots'\'', count(*)::text from raw_snapshots union all select '\''source_categories'\'', count(*)::text from source_categories) as controls order by metric;"' sh "$DRILL_DB"

DRILL_VOLUME_PREFIX="${RESTORE_DRILL_VOLUME_PREFIX:-${COMPOSE_PROJECT_NAME}_restore_drill_$(date -u +%Y%m%d%H%M%S)_$$}"
if [[ ! "$DRILL_VOLUME_PREFIX" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ || ${#DRILL_VOLUME_PREFIX} -gt 200 ]]; then
  echo "RESTORE_DRILL_VOLUME_PREFIX contains unsupported characters or is too long." >&2
  exit 1
fi

drill_volume_archive() {
  local archive_name="$1"
  local volume_suffix="$2"
  local volume_name="${DRILL_VOLUME_PREFIX}_${volume_suffix}"
  local regular_file_count=""

  if docker volume inspect "$volume_name" >/dev/null 2>&1; then
    echo "Restore drill volume already exists and will not be overwritten: $volume_name" >&2
    exit 1
  fi

  docker volume create "$volume_name" >/dev/null
  DRILL_VOLUMES+=("$volume_name")
  echo "Extracting $archive_name into temporary volume $volume_name..."
  docker run --rm --interactive \
    --network none \
    --read-only \
    --cap-drop ALL \
    --security-opt no-new-privileges \
    --volume "$volume_name:/restore" \
    "$HELPER_IMAGE" \
    tar --no-same-owner -C /restore -xzf - < "$BACKUP_PATH/$archive_name"

  regular_file_count="$(
    docker run --rm \
      --network none \
      --read-only \
      --cap-drop ALL \
      --security-opt no-new-privileges \
      --volume "$volume_name:/restore:ro" \
      "$HELPER_IMAGE" \
      sh -c 'find /restore -type f -print | wc -l'
  )"
  echo "Extracted $archive_name regular_files=$regular_file_count"
}

if manifest_has_artifact "product-images.tgz"; then
  drill_volume_archive "product-images.tgz" "product_images"
elif [[ -z "$METADATA_FORMAT_VERSION" ]]; then
  echo "Warning: legacy backup has no product image archive; DB-only drill continues." >&2
fi

if manifest_has_artifact "snapshots.tgz"; then
  drill_volume_archive "snapshots.tgz" "snapshots"
elif [[ -z "$METADATA_FORMAT_VERSION" ]]; then
  echo "Warning: legacy backup has no raw snapshot archive." >&2
fi

exit 0
