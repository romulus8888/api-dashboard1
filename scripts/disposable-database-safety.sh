#!/usr/bin/env bash
# Shared disposable PostgreSQL safety gate — source from validation/integration scripts.
# Never point at hosted Supabase or production databases.

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Source disposable-database-safety.sh; do not execute it directly." >&2
  exit 1
fi

if [[ -n "${DISPOSABLE_DATABASE_SAFETY_LOADED:-}" ]]; then
  return 0
fi
DISPOSABLE_DATABASE_SAFETY_LOADED=1

disposable_require_ack() {
  if [[ "${DISPOSABLE_TEST_ACK:-}" != "yes" ]]; then
    echo "Refusing to run: set DISPOSABLE_TEST_ACK=yes to confirm a disposable-only target." >&2
    exit 1
  fi
}

disposable_require_database_url() {
  if [[ -z "${DISPOSABLE_DATABASE_URL:-}" ]]; then
    echo "DISPOSABLE_DATABASE_URL is required (postgresql://…)." >&2
    exit 1
  fi

  node -e "
    try {
      new URL(process.env.DISPOSABLE_DATABASE_URL);
    } catch {
      console.error('DISPOSABLE_DATABASE_URL must be a valid URL.');
      process.exit(1);
    }
  "
}

disposable_resolve_hostname() {
  node -e "const u = new URL(process.argv[1]); process.stdout.write(u.hostname.toLowerCase());" "$DISPOSABLE_DATABASE_URL"
}

disposable_refuse_production_like_target() {
  local host="$1"
  local url_lower
  url_lower="$(printf '%s' "$DISPOSABLE_DATABASE_URL" | tr '[:upper:]' '[:lower:]')"

  case "$url_lower" in
    *supabase.co*|*supabase.com*|*pooler.supabase*|*neon.tech*|*amazonaws.com*|*rds.amazonaws.com*)
      echo "Refusing production-like database URL." >&2
      exit 1
      ;;
  esac

  case "$host" in
    localhost|127.0.0.1|::1|postgres|disposable-postgres)
      return 0
      ;;
  esac

  if [[ -n "${DISPOSABLE_TEST_EXTRA_HOSTS:-}" ]]; then
    local allowed
    IFS=',' read -r -a allowed <<< "$DISPOSABLE_TEST_EXTRA_HOSTS"
    for entry in "${allowed[@]}"; do
      if [[ "$host" == "$(echo "$entry" | tr '[:upper:]' '[:lower:]' | xargs)" ]]; then
        return 0
      fi
    done
  fi

  echo "Refusing database host '$host'. Allowed: localhost, 127.0.0.1, ::1, postgres, or DISPOSABLE_TEST_EXTRA_HOSTS." >&2
  exit 1
}

disposable_require_psql() {
  if [[ "${DISPOSABLE_PSQL_MODE:-}" == "docker-exec" ]]; then
    if ! command -v docker >/dev/null 2>&1; then
      echo "docker is required but was not found in PATH." >&2
      exit 1
    fi
    return 0
  fi

  if ! command -v psql >/dev/null 2>&1; then
    echo "psql is required but was not found in PATH." >&2
    exit 1
  fi
}

require_disposable_database_target() {
  disposable_require_ack
  disposable_require_database_url
  disposable_refuse_production_like_target "$(disposable_resolve_hostname)"
  disposable_require_psql
}

disposable_resolve_database_name() {
  node -e "const u = new URL(process.env.DISPOSABLE_DATABASE_URL); process.stdout.write((u.pathname || '/postgres').replace(/^\//, '') || 'postgres');"
}

disposable_psql() {
  if [[ -z "${DISPOSABLE_DATABASE_URL:-}" ]]; then
    echo "DISPOSABLE_DATABASE_URL is required (postgresql://…)." >&2
    exit 1
  fi

  if [[ "${DISPOSABLE_PSQL_MODE:-}" == "docker-exec" ]]; then
    local container="${DISPOSABLE_CI_CONTAINER_NAME:-disposable-postgres}"
    local workspace_root="${DISPOSABLE_CI_WORKSPACE_ROOT:-/workspace}"
    local host_root="${DISPOSABLE_CI_HOST_WORKSPACE_ROOT:-}"
    local database
    database="$(disposable_resolve_database_name)"
    if [[ "${1:-}" == "-f" && -n "${2:-}" ]]; then
      local file="$2"
      if [[ -n "$host_root" ]]; then
        case "$file" in
          "$host_root"/*)
            local rel="${file#$host_root/}"
            docker exec -i "$container" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 \
              -f "$workspace_root/$rel"
            return
            ;;
        esac
      fi
      docker exec -i "$container" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 < "$file"
      return
    fi
    docker exec -i "$container" psql -U postgres -d "$database" -v ON_ERROR_STOP=1 "$@"
    return
  fi

  unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE
  psql "$DISPOSABLE_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

wait_for_disposable_postgres() {
  local attempts=30
  while [ "$attempts" -gt 0 ]; do
    if disposable_psql -c 'select 1' >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempts=$((attempts - 1))
  done

  echo "PostgreSQL is not reachable at DISPOSABLE_DATABASE_URL." >&2
  exit 2
}

prepare_disposable_database_connection() {
  require_disposable_database_target
  wait_for_disposable_postgres
}
