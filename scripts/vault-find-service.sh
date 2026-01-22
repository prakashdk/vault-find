#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="${APP_ROOT}/.vault-find.pid"
LOG_FILE="${APP_ROOT}/.vault-find.log"
PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
SERVER_CMD=(python -m uvicorn app.main:app --host "${HOST}" --port "${PORT}" --workers "${WORKERS:-2}")

usage() {
  cat <<'USAGE'
Usage: vault-find-service.sh <command>

Commands:
  start     Start the Vault Find API server
  stop      Stop the running server
  restart   Restart the server
  status    Show whether the server is running
  logs      Tail the server logs (Ctrl+C to exit)
USAGE
}

is_running() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid="$(cat "${PID_FILE}")"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1; then
      echo "${pid}"
      return 0
    fi
  fi
  return 1
}

start_service() {
  if pid="$(is_running)"; then
    echo "Vault Find already running (PID ${pid})."
    exit 0
  fi

  echo "Starting Vault Find on ${HOST}:${PORT}..."
  (
    cd "${APP_ROOT}"
    nohup "${SERVER_CMD[@]}" >>"${LOG_FILE}" 2>&1 &
    echo $! >"${PID_FILE}"
  )
  echo "Vault Find started (PID $(cat "${PID_FILE}")). Logs: ${LOG_FILE}"
}

stop_service() {
  if ! pid="$(is_running)"; then
    echo "Vault Find is not running."
    rm -f "${PID_FILE}"
    exit 0
  fi

  echo "Stopping Vault Find (PID ${pid})..."
  kill "${pid}" >/dev/null 2>&1 || true
  wait "${pid}" 2>/dev/null || true
  rm -f "${PID_FILE}"
  echo "Vault Find stopped."
}

status_service() {
  if pid="$(is_running)"; then
    echo "Vault Find is running (PID ${pid})."
  else
    echo "Vault Find is not running."
  fi
}

restart_service() {
  stop_service || true
  start_service
}

logs_service() {
  if [[ ! -f "${LOG_FILE}" ]]; then
    echo "No log file found yet. Start the service first."
    exit 1
  fi
  echo "Tailing logs from ${LOG_FILE} (press Ctrl+C to stop)"
  tail -f "${LOG_FILE}"
}

main() {
  local command="${1:-}"
  case "${command}" in
    start)
      start_service
      ;;
    stop)
      stop_service
      ;;
    restart)
      restart_service
      ;;
    status)
      status_service
      ;;
    logs)
      logs_service
      ;;
    ""|help|-h|--help)
      usage
      ;;
    *)
      echo "Unknown command: ${command}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
