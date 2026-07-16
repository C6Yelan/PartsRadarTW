#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ROOT_INPUT="${BACKUP_DIR:-backups}"
BACKUP_TIMESTAMP="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
BACKUP_INCLUDE_SNAPSHOTS="${BACKUP_INCLUDE_SNAPSHOTS:-0}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-partsradar-tw}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-alpine:3.20}"

if [[ ! "$BACKUP_TIMESTAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  echo "BACKUP_TIMESTAMP must use UTC YYYYMMDDTHHMMSSZ format." >&2
  exit 1
fi

if [[ "$BACKUP_INCLUDE_SNAPSHOTS" != "0" && "$BACKUP_INCLUDE_SNAPSHOTS" != "1" ]]; then
  echo "BACKUP_INCLUDE_SNAPSHOTS must be 0 or 1." >&2
  exit 1
fi

if [[ ! "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "COMPOSE_PROJECT_NAME contains unsupported characters: $COMPOSE_PROJECT_NAME" >&2
  exit 1
fi

export COMPOSE_PROJECT_NAME
mkdir -p -- "$BACKUP_ROOT_INPUT"
BACKUP_ROOT="$(cd -- "$BACKUP_ROOT_INPUT" && pwd -P)"
TARGET_DIR="$BACKUP_ROOT/$BACKUP_TIMESTAMP"

if [[ -e "$TARGET_DIR" || -L "$TARGET_DIR" ]]; then
  echo "Backup target already exists and will not be overwritten: $TARGET_DIR" >&2
  exit 1
fi

STAGING_DIR="$(mktemp -d "$BACKUP_ROOT/.${BACKUP_TIMESTAMP}.incomplete.XXXXXX")"

cleanup_incomplete_backup() {
  local exit_status=$?
  trap - EXIT HUP INT TERM

  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    if ! rm -rf -- "$STAGING_DIR"; then
      echo "Failed to remove incomplete backup staging directory: $STAGING_DIR" >&2
      if [[ "$exit_status" -eq 0 ]]; then
        exit_status=1
      fi
    fi
  fi

  exit "$exit_status"
}

trap cleanup_incomplete_backup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

require_volume() {
  local volume_name="$1"

  if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
    echo "Required Docker volume is missing or inaccessible: $volume_name" >&2
    exit 1
  fi
}

backup_volume() {
  local volume_name="$1"
  local archive_name="$2"

  require_volume "$volume_name"
  echo "Archiving Docker volume: $volume_name"
  docker run --rm \
    --volume "$volume_name:/source:ro" \
    "$HELPER_IMAGE" \
    tar -C /source -czf - . > "$STAGING_DIR/$archive_name"

  if [[ ! -s "$STAGING_DIR/$archive_name" ]]; then
    echo "Docker volume archive is empty or missing: $archive_name" >&2
    exit 1
  fi
}

echo "Creating PostgreSQL dump..."
docker compose exec -T postgres sh -c \
  'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --no-owner --no-acl' \
  > "$STAGING_DIR/postgres.dump"

if [[ ! -s "$STAGING_DIR/postgres.dump" ]]; then
  echo "PostgreSQL dump is empty." >&2
  exit 1
fi

docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "select current_timestamp;"' \
  > "$STAGING_DIR/postgres.timestamp.txt"

docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 --tuples-only --no-align --command "show server_version;"' \
  > "$STAGING_DIR/postgres.version.txt"

if [[ ! -s "$STAGING_DIR/postgres.timestamp.txt" || ! -s "$STAGING_DIR/postgres.version.txt" ]]; then
  echo "PostgreSQL timestamp or version metadata is empty." >&2
  exit 1
fi

backup_volume "${COMPOSE_PROJECT_NAME}_product_images" "product-images.tgz"

if [[ "$BACKUP_INCLUDE_SNAPSHOTS" == "1" ]]; then
  backup_volume "${COMPOSE_PROJECT_NAME}_snapshots" "snapshots.tgz"
fi

SOURCE_GIT_COMMIT="$(git rev-parse --verify HEAD 2>/dev/null || printf 'unknown')"
cat > "$STAGING_DIR/backup-metadata.txt" <<EOF
backup_format_version=2
created_at_utc=$BACKUP_TIMESTAMP
compose_project_name=$COMPOSE_PROJECT_NAME
source_git_commit=$SOURCE_GIT_COMMIT
product_images_included=1
snapshots_included=$BACKUP_INCLUDE_SNAPSHOTS
EOF

cat > "$STAGING_DIR/README.txt" <<EOF
PartsRadarTW backup created at $BACKUP_TIMESTAMP UTC.

Contents:
- postgres.dump: PostgreSQL custom-format dump.
- postgres.timestamp.txt: Database timestamp recorded after the dump.
- postgres.version.txt: PostgreSQL server version.
- product-images.tgz: Product image Docker volume archive.
- snapshots.tgz: Raw snapshot Docker volume archive when snapshots_included=1.
- backup-metadata.txt: Non-secret backup format and provenance metadata.
- SHA256SUMS: Integrity checksums for every backup artifact above.

Use scripts/ops/restore-drill.sh against a disposable Compose project to verify
the database dump and extract included volume archives into temporary volumes.
EOF

ARTIFACTS=(
  "README.txt"
  "backup-metadata.txt"
  "postgres.dump"
  "postgres.timestamp.txt"
  "postgres.version.txt"
  "product-images.tgz"
)

if [[ "$BACKUP_INCLUDE_SNAPSHOTS" == "1" ]]; then
  ARTIFACTS+=("snapshots.tgz")
fi

(
  cd "$STAGING_DIR"
  sha256sum -- "${ARTIFACTS[@]}" > SHA256SUMS
  sha256sum --check --strict -- SHA256SUMS
)

mv -T -n -- "$STAGING_DIR" "$TARGET_DIR"
if [[ -d "$STAGING_DIR" ]]; then
  echo "Backup target appeared while publishing; refusing to merge: $TARGET_DIR" >&2
  exit 1
fi

STAGING_DIR=""
trap - EXIT HUP INT TERM
echo "Backup written to $TARGET_DIR"
