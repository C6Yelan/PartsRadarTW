#!/usr/bin/env bash
set -euo pipefail

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$workspace_root"

default_image="cloudflare/cloudflared:2026.7.2@sha256:4f6655284ab3d252b7f28fedb19fe6c8fc82ee5b1295c20ac74d475e5398a52d"
default_secret_file="/etc/partsradar/secrets/cloudflare-tunnel-token"
cloudflared_uid=65532
cloudflared_gid=65532

read_dotenv_value() {
  local requested_key="$1"
  local line key value

  [[ -f .env ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    line="${line#"${line%%[![:space:]]*}"}"
    if [[ "$line" == export[[:space:]]* ]]; then
      line="${line#export}"
    fi
    [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]] || continue

    key="${BASH_REMATCH[1]}"
    [[ "$key" == "$requested_key" ]] || continue

    value="${BASH_REMATCH[2]}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    if [[ ${#value} -ge 2 ]]; then
      if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    printf '%s' "$value"
    return 0
  done <.env

  return 1
}

dotenv_has_key() {
  local requested_key="$1"
  local line

  [[ -f .env ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    line="${line#"${line%%[![:space:]]*}"}"
    if [[ "$line" == export[[:space:]]* ]]; then
      line="${line#export}"
    fi
    if [[ "$line" =~ ^[[:space:]]*${requested_key}[[:space:]]*= ]]; then
      return 0
    fi
  done <.env

  return 1
}

fail() {
  printf 'Cloudflare Tunnel preflight failed: %s\n' "$1" >&2
  exit 1
}

if [[ -v CLOUDFLARE_TUNNEL_TOKEN || -v TUNNEL_TOKEN ]] ||
  dotenv_has_key "CLOUDFLARE_TUNNEL_TOKEN" ||
  dotenv_has_key "TUNNEL_TOKEN"; then
  fail "remove legacy token environment settings; use the file secret only."
fi

cloudflared_image="${CLOUDFLARED_IMAGE:-}"
if [[ -z "$cloudflared_image" ]]; then
  cloudflared_image="$(read_dotenv_value "CLOUDFLARED_IMAGE" || true)"
fi
cloudflared_image="${cloudflared_image:-$default_image}"

if [[ ! "$cloudflared_image" =~ ^[^[:space:]@]+(:[^[:space:]@]+)?@sha256:[0-9a-fA-F]{64}$ ]]; then
  fail "CLOUDFLARED_IMAGE must include an immutable sha256 digest."
fi

secret_file="${CLOUDFLARE_TUNNEL_TOKEN_FILE:-}"
if [[ -z "$secret_file" ]]; then
  secret_file="$(read_dotenv_value "CLOUDFLARE_TUNNEL_TOKEN_FILE" || true)"
fi
secret_file="${secret_file:-$default_secret_file}"

if [[ "$secret_file" != /* || "$secret_file" == *"replace_with"* ]]; then
  fail "CLOUDFLARE_TUNNEL_TOKEN_FILE must be an absolute, provisioned host path."
fi
[[ -f "$secret_file" ]] || fail "the token file is missing or is not a regular file."
[[ -s "$secret_file" ]] || fail "the token file is empty."
[[ ! -L "$secret_file" ]] || fail "the token file must not be a symbolic link."

resolved_workspace_root="$(realpath -e -- "$workspace_root" 2>/dev/null)" ||
  fail "the repository path cannot be resolved."
resolved_secret_file="$(realpath -e -- "$secret_file" 2>/dev/null)" ||
  fail "the token file path cannot be resolved."

if [[ "$secret_file" == "$resolved_workspace_root" ||
  "$secret_file" == "$resolved_workspace_root/"* ||
  "$resolved_secret_file" == "$resolved_workspace_root" ||
  "$resolved_secret_file" == "$resolved_workspace_root/"* ]]; then
  fail "the token file must resolve outside the repository and Docker build context."
fi

read -r secret_uid secret_gid secret_mode secret_size < <(
  stat -Lc '%u %g %a %s' -- "$resolved_secret_file"
) || fail "the token file metadata is unreadable."

[[ "$secret_size" -gt 0 ]] || fail "the token file is empty."
mode_value=$((8#$secret_mode))

if ((mode_value & 0137)); then
  fail "the token file must not be executable, group-writable, or accessible to other users."
fi

container_can_read=false
if [[ "$secret_uid" -eq "$cloudflared_uid" ]] && ((mode_value & 0400)); then
  container_can_read=true
fi
if [[ "$secret_gid" -eq "$cloudflared_gid" ]] && ((mode_value & 0040)); then
  container_can_read=true
fi
[[ "$container_can_read" == true ]] ||
  fail "the token file is not readable by the pinned cloudflared runtime UID/GID."
