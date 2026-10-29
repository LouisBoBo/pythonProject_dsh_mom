#!/usr/bin/env bash
# 跨平台桌面一体打包入口（自动按本机 OS：Mac zip/dmg 或 Windows NSIS）
# 实际逻辑在 scripts/lib/package_desktop.py，本文件只做兼容包装。
# 用法:
#   ./scripts/package-desktop.sh
#   ./scripts/package-desktop.sh unified
#   ./scripts/package-desktop.sh engine
#   MAKE_DMG=1 ./scripts/package-desktop.sh          # 仅 macOS
#   SKIP_RUNTIME=1 SKIP_HOST=1 SKIP_NODE=1 SKIP_MARKET=1 SKIP_PNPM=1 ./scripts/package-desktop.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/python3_shim.sh
. "$ROOT/scripts/lib/python3_shim.sh"
exec python3 "$ROOT/scripts/lib/package_desktop.py" "$@"
