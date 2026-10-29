#!/bin/bash
# 框架：应用引擎进程生命周期（实现在 scripts/lib/engine_ctl.py，不依赖 lsof）。
# 用法:
#   scripts/engine.sh <应用名> status
#   scripts/engine.sh <应用名> ensure    # 未监听则后台启动
#   scripts/engine.sh <应用名> start     # 前台（或已在跑则退出）
#   scripts/engine.sh <应用名> start -d  # 后台
#   scripts/engine.sh <应用名> stop
#   scripts/engine.sh <应用名> restart
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/python3_shim.sh
. "$ROOT/scripts/lib/python3_shim.sh"
# shellcheck source=lib/resolve_app.sh
. "$ROOT/scripts/lib/resolve_app.sh"
APP="${1:?用法: engine.sh <应用名> status|ensure|start|stop|restart}"
APP="$(resolve_app_name "$APP")"
CMD="${2:?}"
shift 2 || true

export MPLBACKEND="${MPLBACKEND:-Agg}"
export VECLIB_MAXIMUM_THREADS="${VECLIB_MAXIMUM_THREADS:-1}"
export OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-1}"

BOOT_PY=""
for try in "${APP_ENGINE_PYTHON:-}" python3 python py; do
  [ -n "$try" ] || continue
  if [ -x "$try" ] || command -v "$try" >/dev/null 2>&1; then
    BOOT_PY="$try"
    break
  fi
done
if [ -z "$BOOT_PY" ]; then
  echo "找不到 Python（python3/python）。请安装 3.10+ 或设 APP_ENGINE_PYTHON。" >&2
  exit 1
fi

ARGS=()
for a in "$@"; do
  case "$a" in
    -d|--detach) ARGS+=(--detach) ;;
    [0-9]*) ARGS+=(--port "$a") ;;
    *) ARGS+=("$a") ;;
  esac
done

exec "$BOOT_PY" "$ROOT/scripts/lib/engine_ctl.py" "$APP" "$CMD" "${ARGS[@]}"
