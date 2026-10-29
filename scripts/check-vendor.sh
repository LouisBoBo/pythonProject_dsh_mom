#!/bin/bash
# 核对（并可修复）dsh-tools 是否与宿主同一 realpath。
# 不同路径 → Node ESM 双实例 → TOOL_RUNTIME_SCHEDULER 用 Symbol() 时不一致
# → agent-loop 调用 ctx.tools[SYMBOL].prepare 报
#   Cannot read properties of undefined (reading 'prepare')
#
# 实现：scripts/lib/align_dsh_tools.py
# （Windows 全球 npm 布局 + junction；禁止 rm -rf 掉宿主包）
#
# 用法:
#   scripts/check-vendor.sh           # 只检查
#   scripts/check-vendor.sh --fix    # 把 vendor / profile 副本链到宿主同包
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/python3_shim.sh
. "$ROOT/scripts/lib/python3_shim.sh"
exec python3 "$ROOT/scripts/lib/align_dsh_tools.py" "$@"
