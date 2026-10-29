#!/bin/bash
# 冒烟测试：引擎 unittest + CLI + 密钥检查
# 用法: scripts/test.sh [应用名]
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/python3_shim.sh
. "$ROOT/scripts/lib/python3_shim.sh"
# shellcheck source=lib/resolve_app.sh
. "$ROOT/scripts/lib/resolve_app.sh"
APP="$(resolve_app_name "${1:-zr-workbuddy}")"
ENG="$ROOT/apps/$APP/engine"
export MPLBACKEND="${MPLBACKEND:-Agg}"
# 规避部分 macOS + NumPy/Accelerate 在 import 期 polyfit 触发 SIGFPE
export VECLIB_MAXIMUM_THREADS="${VECLIB_MAXIMUM_THREADS:-1}"
export OPENBLAS_NUM_THREADS="${OPENBLAS_NUM_THREADS:-1}"

echo "== secrets check =="
"$ROOT/scripts/check-secrets.sh"

echo "== company dsh market merge =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_merge_company_dsh_market.py -q )

echo "== ensure dsh-knowledge =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_dsh_knowledge.py -q )

echo "== ensure workbuddy MES sidecar env =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_workbuddy_config_yaml_env.py -q )

echo "== ensure dsh core bundles =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_dsh_core_bundles.py -q )

echo "== purge broken profile bundles =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_purge_broken_profile_bundles.py -q )

echo "== ensure dsh-llm-meter =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_dsh_llm_meter.py -q )

echo "== ensure dshmarket =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_dshmarket.py -q )

echo "== win hide console =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_win_hide.py -q )
( cd "$ROOT/scripts/lib" && python3 -m unittest test_npm_pkg_integrity.py test_ensure_runtime.py -q )

echo "== ensure cursor sdk zod =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_cursor_sdk_zod.py -q )

echo "== ensure dsh deepseek credential =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_dsh_deepseek_credential.py -q )
( cd "$ROOT/scripts/lib" && python3 -m unittest test_ensure_company_knowledge.py -q )

echo "== native path / port listen =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_native_path.py test_port_listen.py -q )

echo "== find python =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_find_python.py -q )

echo "== package desktop =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_package_desktop.py test_build_runtime.py test_prune_pack_junk.py test_upload_desktop_feed.py -q )

echo "== align dsh-tools =="
( cd "$ROOT/scripts/lib" && python3 -m unittest test_align_dsh_tools.py -q )

echo "== vendor vs host (dsh-tools realpath) =="
"$ROOT/scripts/check-vendor.sh"

# 与 engine.sh 一致：避开 macOS CLT python（常无 fastapi/yaml/uvicorn）
resolve_test_python() {
  local cand="$1" try resolved
  for try in \
    "$cand" \
    "${APP_ENGINE_PYTHON:-}" \
    /usr/local/bin/python3 \
    /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
    /Library/Frameworks/Python.framework/Versions/3.11/bin/python3 \
    /opt/homebrew/bin/python3 \
    python3.12 \
    python3 \
    python; do
    [ -n "$try" ] || continue
    if [ -x "$try" ]; then
      resolved="$try"
    else
      resolved="$(command -v "$try" 2>/dev/null || true)"
    fi
    [ -n "$resolved" ] || continue
    if "$resolved" -c "import fastapi, yaml" >/dev/null 2>&1; then
      printf '%s' "$resolved"
      return 0
    fi
  done
  return 1
}
_RT_JSON=""
if [ -f "$ROOT/scripts/lib/read_runtime.py" ] && [ -f "$ENG/config/runtime.yaml" ]; then
  _RT_JSON="$(python3 "$ROOT/scripts/lib/read_runtime.py" "$ENG/config/runtime.yaml" 2>/dev/null || true)"
fi
_CFG_PY="python3"
if [ -n "$_RT_JSON" ]; then
  _CFG_PY="$(printf '%s' "$_RT_JSON" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("python","python3"))' 2>/dev/null || echo python3)"
fi
TEST_PYTHON="$(resolve_test_python "$_CFG_PY" || true)"
if [ -z "$TEST_PYTHON" ]; then
  echo "找不到带 fastapi/yaml 的 Python，跳过 unittest（请装依赖或设 APP_ENGINE_PYTHON）" >&2
  TEST_PYTHON=""
fi

if [ -d "$ENG/tests" ] && [ -n "$TEST_PYTHON" ]; then
  echo "== unittest ($APP) python=$TEST_PYTHON =="
  cd "$ENG"
  PYTHONPATH=. "$TEST_PYTHON" -m unittest discover -s tests -p 'test_*.py' -q
fi

if [ -f "$ENG/engine_cli.py" ] && [ -n "$TEST_PYTHON" ]; then
  echo "== engine_cli status =="
  cd "$ENG"
  "$TEST_PYTHON" engine_cli.py status | head -c 400
  echo
fi

if [ -f "$ROOT/desktop/tests/test_win_hide.js" ]; then
  echo "== desktop win hide =="
  node "$ROOT/desktop/tests/test_win_hide.js"
fi

if [ -f "$ROOT/desktop/tests/test_persist_user_features.js" ]; then
  echo "== desktop persist user features =="
  node "$ROOT/desktop/tests/test_persist_user_features.js"
fi

if [ -f "$ROOT/desktop/tests/test_read_engine_argv.js" ]; then
  echo "== desktop engine argv =="
  node "$ROOT/desktop/tests/test_read_engine_argv.js"
fi

if [ -f "$ROOT/desktop/tests/test_kill_install_tree.js" ]; then
  echo "== desktop kill install tree =="
  node "$ROOT/desktop/tests/test_kill_install_tree.js"
fi

if [ -f "$ROOT/desktop/tests/test_self_update.js" ]; then
  echo "== desktop self update =="
  node "$ROOT/desktop/tests/test_self_update.js"
fi

echo "✅ test.sh 完成 ($APP)"
