#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: scripts/ops/compose-production.sh <docker-compose-arguments...>" >&2
  exit 2
fi

workspace_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$workspace_root"

fail_cli() {
  printf 'Production Compose wrapper rejected arguments: %s\n' "$1" >&2
  exit 2
}

require_option_value() {
  local option="$1"
  local index="$2"
  local -n arguments_ref="$3"

  ((index + 1 < ${#arguments_ref[@]})) || fail_cli "$option requires a value."
  [[ -n "${arguments_ref[index + 1]}" ]] || fail_cli "$option requires a non-empty value."
}

is_production_service() {
  case "$1" in
    postgres | migrate | seed | storage-init | web | crawler | image-cache-backfill | \
      crawler-daemon | image-cache-recovery-daemon | raw-snapshot-cleanup-daemon | \
      smoke-daemon | discord-bot | cloudflared)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

arguments=("$@")
compose_command=""
command_index=-1
index=0

while ((index < ${#arguments[@]})); do
  argument="${arguments[index]}"
  case "$argument" in
    --ansi)
      require_option_value "$argument" "$index" arguments
      case "${arguments[index + 1]}" in
        auto | always | never) ;;
        *) fail_cli "--ansi must be auto, always, or never." ;;
      esac
      ((index += 2))
      ;;
    --ansi=auto | --ansi=always | --ansi=never)
      ((index += 1))
      ;;
    -f | --file | --env-file | --profile | --project-directory | -p | --project-name)
      fail_cli "$argument is managed by this production wrapper."
      ;;
    -f=* | --file=* | --env-file=* | --profile=* | --project-directory=* | -p=* | \
      --project-name=*)
      fail_cli "${argument%%=*} is managed by this production wrapper."
      ;;
    -*)
      fail_cli "unsupported Docker Compose global option: $argument."
      ;;
    *)
      compose_command="$argument"
      command_index="$index"
      break
      ;;
  esac
done

[[ -n "$compose_command" ]] || fail_cli "a Docker Compose command is required."

target_services=()
if [[ "$compose_command" =~ ^(create|restart|start|up)$ ]]; then
  index=$((command_index + 1))
  while ((index < ${#arguments[@]})); do
    argument="${arguments[index]}"
    case "$compose_command:$argument" in
      up:--attach | up:--exit-code-from | up:--no-attach | up:--pull | up:--timeout | \
        up:--wait-timeout | up:-t | create:--pull | restart:--timeout | restart:-t)
        require_option_value "$argument" "$index" arguments
        ((index += 2))
        ;;
      up:--attach=* | up:--exit-code-from=* | up:--no-attach=* | up:--pull=* | \
        up:--timeout=* | up:--wait-timeout=* | create:--pull=* | restart:--timeout=*)
        ((index += 1))
        ;;
      up:-d | up:--detach | up:--abort-on-container-exit | up:--abort-on-container-failure | \
        up:--always-recreate-deps | up:--attach-dependencies | up:--build | \
        up:--force-recreate | up:--menu | up:--no-build | up:--no-color | up:--no-deps | \
        up:--no-log-prefix | up:--no-recreate | up:--no-start | up:--quiet-pull | \
        up:--remove-orphans | up:-V | up:--renew-anon-volumes | up:--timestamps | up:--wait | \
        up:-w | up:--watch | up:-y | up:--yes | create:--build | \
        create:--force-recreate | create:--no-build | create:--no-recreate | \
        create:--quiet-pull | create:--remove-orphans | create:-y | create:--yes | \
        restart:--no-deps)
        ((index += 1))
        ;;
      *:--)
        ((index += 1))
        ;;
      *:-*)
        fail_cli "unsupported $compose_command option: $argument."
        ;;
      *)
        is_production_service "$argument" ||
          fail_cli "unknown production service for $compose_command: $argument."
        target_services+=("$argument")
        ((index += 1))
        ;;
    esac
  done
elif [[ "$compose_command" == "run" ]]; then
  index=$((command_index + 1))
  while ((index < ${#arguments[@]})); do
    argument="${arguments[index]}"
    case "$argument" in
      --cap-add | --cap-drop | --entrypoint | -e | --env | --env-from-file | -l | --label | \
        --name | -p | --publish | --pull | -u | --user | -v | --volume | -w | --workdir)
        require_option_value "$argument" "$index" arguments
        ((index += 2))
        ;;
      --cap-add=* | --cap-drop=* | --entrypoint=* | --env=* | --env-from-file=* | \
        --label=* | --name=* | --publish=* | --pull=* | --user=* | --volume=* | --workdir=*)
        ((index += 1))
        ;;
      --build | -d | --detach | -i | --interactive | -T | --no-TTY | --no-deps | -P | \
        --quiet | --quiet-build | --quiet-pull | --remove-orphans | --rm | --service-ports | \
        --use-aliases)
        ((index += 1))
        ;;
      --)
        ((index += 1))
        ;;
      -*)
        fail_cli "unsupported run option: $argument."
        ;;
      *)
        is_production_service "$argument" ||
          fail_cli "unknown production service for run: $argument."
        target_services=("$argument")
        break
        ;;
    esac
  done
  ((${#target_services[@]} == 1)) || fail_cli "run requires one production service."
elif [[ "$compose_command" == "scale" ]]; then
  index=$((command_index + 1))
  while ((index < ${#arguments[@]})); do
    argument="${arguments[index]}"
    case "$argument" in
      --no-deps)
        ((index += 1))
        ;;
      --dry-run | -*)
        fail_cli "unsupported scale option: $argument."
        ;;
      *)
        service="${argument%%=*}"
        replicas="${argument#*=}"
        [[ "$argument" == *=* && "$replicas" =~ ^[0-9]+$ ]] ||
          fail_cli "scale requires SERVICE=REPLICAS entries."
        is_production_service "$service" ||
          fail_cli "unknown production service for scale: $service."
        target_services+=("$service")
        ((index += 1))
        ;;
    esac
  done
  ((${#target_services[@]} > 0)) || fail_cli "scale requires at least one production service."
elif [[ "$compose_command" == "watch" ]]; then
  fail_cli "watch is not supported by this production wrapper."
fi

requires_tunnel_preflight=false
case "$compose_command" in
  create | restart | start | up)
    if ((${#target_services[@]} == 0)); then
      requires_tunnel_preflight=true
    fi
    ;;
esac
for service in "${target_services[@]}"; do
  if [[ "$service" == "cloudflared" ]]; then
    requires_tunnel_preflight=true
    break
  fi
done

compose=(
  docker compose
  -f compose.yml
  -f compose.crawler.yml
  -f compose.ops.yml
  -f compose.tunnel.yml
  --profile scheduled-crawler
  --profile ops
  --profile discord-bot
  --profile public-tunnel
)

if [[ "$requires_tunnel_preflight" == true ]]; then
  scripts/ops/validate-cloudflare-tunnel.sh
fi

"${compose[@]}" config --quiet
exec "${compose[@]}" "$@"
