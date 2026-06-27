#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

BACKUP_ROOT="${BACKUP_DIR:-backups}"
BACKUP_TIMESTAMP="${BACKUP_TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
TARGET_DIR="$BACKUP_ROOT/$BACKUP_TIMESTAMP"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-partsradar-tw}"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-alpine:3.20}"

mkdir -p "$TARGET_DIR"

echo "Creating PostgreSQL dump..."
docker compose exec -T postgres sh -c \
  'pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format custom --no-owner --no-acl' \
  > "$TARGET_DIR/postgres.dump"

docker compose exec -T postgres sh -c \
  'psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --tuples-only --no-align --command "select current_timestamp;"' \
  > "$TARGET_DIR/postgres.timestamp.txt"

backup_volume() {
  local volume_name="$1"
  local archive_name="$2"

  if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
    echo "Skipping missing Docker volume: $volume_name"
    return
  fi

  echo "Archiving Docker volume: $volume_name"
  docker run --rm \
    --volume "$volume_name:/source:ro" \
    --volume "$PWD/$TARGET_DIR:/backup" \
    "$HELPER_IMAGE" \
    sh -c "cd /source && tar -czf /backup/$archive_name ."
}

backup_volume "${COMPOSE_PROJECT_NAME}_product_images" "product-images.tgz"

if [[ "${BACKUP_INCLUDE_SNAPSHOTS:-0}" == "1" ]]; then
  backup_volume "${COMPOSE_PROJECT_NAME}_snapshots" "snapshots.tgz"
fi

(
  cd "$TARGET_DIR"
  sha256sum ./* > SHA256SUMS
)

cat > "$TARGET_DIR/README.txt" <<EOF
PartsRadarTW backup created at $BACKUP_TIMESTAMP UTC.

Contents:
- postgres.dump: PostgreSQL custom-format dump.
- product-images.tgz: Product image cache volume archive, when the volume exists.
- snapshots.tgz: Raw snapshot volume archive, only when BACKUP_INCLUDE_SNAPSHOTS=1.
- SHA256SUMS: Integrity checksums for this backup directory.

Use scripts/ops/restore-drill.sh to restore postgres.dump into a temporary drill database.
EOF

echo "Backup written to $TARGET_DIR"
