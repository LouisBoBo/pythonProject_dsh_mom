#!/bin/bash
# 聊天壳接线 / 启停（显式子命令，默认不乱启）。本仓不放 DSH 源码，一律走 PATH 上的 dsh。
#
#   scripts/host.sh status|where|hint
#   scripts/host.sh verify              # 检查 link / profile Bridge / 引擎探活
#   scripts/host.sh wire                # 复用 plugin.sh install bridge（默认不 --restart）
#   scripts/host.sh wire --restart      # 接线后重启宿主（走 restart-dsh.sh）
#   scripts/host.sh ensure-engine       # 仅 ensure 业务引擎
#   scripts/host.sh ensure-web          # :3081 未监听则后台拉起（脱离 IDE 进程组）
#   scripts/host.sh up                  # ensure-engine + ensure-web（推荐日常入口）
#   scripts/host.sh start-web           # 强制启动（已在跑则报错）
#   scripts/host.sh restart-web         # stop-web + start-web（守护式）
#   scripts/host.sh fix-ports           # 纠正端口错位 + 自检
#   scripts/host.sh verify-ports        # 仅检查 :3081 WorkBuddy / :3080 官方
#   scripts/host.sh stop-web            # 停掉监听 :3081 的进程（若有）
#
# 端口约定（勿混）：
#   - WorkBuddy 开发壳 :3081（DSH_HOME=~/.dsh，profile 含 mes-bridge，工作区在此）
#   - 干净官方 Harness 可选 :3080（DSH_HOME=~/.dsh-workbuddy，无 bridge）
#   - 桌面一体包默认 :13080（Application Support/.../dsh-home，另一套会话）
#   - 可用 DSH_WEB_PORT=… / DSH_HOME=… / DSH_PROFILE=… 覆盖
#
# 拒绝裸 install|start|dev，防误伤。不改 code_deploy / 不焊业务进 DSH。
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/workbuddy_web_env.sh
. "$ROOT/scripts/lib/workbuddy_web_env.sh"
prepend_workbuddy_node_path
# shellcheck source=lib/web_port_verify.sh
. "$ROOT/scripts/lib/web_port_verify.sh"
WORKBUDDY_WEB_PORT="${WORKBUDDY_WEB_PORT:-3081}"
OFFICIAL_WEB_PORT="${OFFICIAL_WEB_PORT:-3080}"
# DSH_HOME 决定会话库；DSH_PROFILE 可为绝对路径，或相对 profiles 下的名字
# 与会话/工作区共用 ~/.dsh；勿再用空的 ~/.dsh-workbuddy 当主开发壳
#
# Windows：PowerShell 里直接敲 `bash` 常进 WSL（HOME=/home/某人），与
# C:\Users\<WindowsUser>\.dsh 不是同一套。未显式设 DSH_HOME 时，若默认
# $HOME/.dsh 无 profile，则回退到 Windows 用户侧 .dsh（防 restart-web 假失败）。
_win_dsh_home_candidates() {
  local up drive rest u
  if [ -n "${USERPROFILE:-}" ]; then
    up="${USERPROFILE}"
    case "$up" in
      [A-Za-z]:*)
        drive="$(printf '%s' "$up" | cut -c1 | tr 'A-Z' 'a-z')"
        rest="$(printf '%s' "$up" | cut -c3- | tr '\\' '/')"
        printf '%s\n' "/mnt/${drive}${rest}/.dsh"
        ;;
      /*) printf '%s\n' "${up%/}/.dsh" ;;
    esac
  fi
  # WSL：常见 Windows 用户目录（USER 在 WSL 里常是 Linux 名，不等于 Windows 用户名）
  for u in "${USERNAME:-}" "${USER:-}"; do
    [ -n "$u" ] || continue
    printf '%s\n' "/mnt/c/Users/${u}/.dsh"
  done
  if [ -d /mnt/c/Users ]; then
    for u in /mnt/c/Users/*/.dsh; do
      [ -d "$u" ] && printf '%s\n' "$u"
    done
  fi
}

_resolve_dsh_home_dir() {
  local cand
  if [ -n "${DSH_HOME:-}" ]; then
    printf '%s' "$DSH_HOME"
    return 0
  fi
  cand="$HOME/.dsh"
  if [ -f "$cand/profiles/web/package.json" ]; then
    printf '%s' "$cand"
    return 0
  fi
  # WSL / 混用：优先已有 Windows profile
  while IFS= read -r cand; do
    [ -n "$cand" ] || continue
    if [ -f "$cand/profiles/web/package.json" ]; then
      echo "提示: 使用 Windows 侧 DSH_HOME=$cand（WSL \$HOME/.dsh 无 profile）" >&2
      printf '%s' "$cand"
      return 0
    fi
  done < <(_win_dsh_home_candidates)
  printf '%s' "$HOME/.dsh"
}

DSH_HOME_DIR="$(_resolve_dsh_home_dir)"
export DSH_HOME="$DSH_HOME_DIR"
if [ -n "${DSH_PROFILE:-}" ]; then
  case "$DSH_PROFILE" in
    /*|~*) PROFILE="$DSH_PROFILE" ;;
    [A-Za-z]:*) PROFILE="$DSH_PROFILE" ;;
    *) PROFILE="$DSH_HOME_DIR/profiles/$DSH_PROFILE" ;;
  esac
else
  PROFILE="$DSH_HOME_DIR/profiles/web"
fi
# 展开 ~
PROFILE="${PROFILE/#\~/$HOME}"
LINK_DIR="$DSH_HOME_DIR/link"
LINK_REPO="$LINK_DIR/DSH-ZR-WorkBuddy"
PORT="${DSH_WEB_PORT:-3081}"
DAEMONIZE="$ROOT/scripts/lib/daemonize.py"
# 公网 IP/域名访问时需加入浏览器信任名单（逗号分隔），例：DSH_TRUSTED_HOSTS=175.178.238.31
TRUSTED_HOSTS="${DSH_TRUSTED_HOSTS:-}"
CMD="${1:-status}"
shift || true

resolve_dsh_bin() {
  local dsh_bin
  dsh_bin="$(command -v dsh || true)"
  if [ -z "$dsh_bin" ]; then
    for c in \
      "$HOME/.nvm/versions/node/v22.23.1/bin/dsh" \
      "$HOME/.nvm/versions/node/current/bin/dsh" \
      "${APPDATA:-$HOME/AppData/Roaming}/npm/dsh.cmd" \
      "${APPDATA:-$HOME/AppData/Roaming}/npm/dsh" \
      /usr/local/bin/dsh; do
      [ -x "$c" ] || [ -f "$c" ] && dsh_bin="$c" && break
    done
  fi
  # Git Bash 的 command -v 先命中无后缀 shebang；Python CreateProcess 会 WinError 193
  if [ -n "$dsh_bin" ] && [ -n "${WINDIR:-}" ]; then
    case "$dsh_bin" in
      *.cmd|*.bat|*.exe) ;;
      *)
        if [ -f "${dsh_bin}.cmd" ]; then
          dsh_bin="${dsh_bin}.cmd"
        fi
        ;;
    esac
  fi
  printf '%s' "$dsh_bin"
}

# dsh 脚本为 #!/usr/bin/env node；须把同目录 node 置于 PATH 前，避免误用 /usr/local 的 Node 20
prepend_dsh_node_path() {
  prepend_workbuddy_node_path
}

cmd_status() {
  echo "本仓不放 DSH 源码。聊天壳 = PATH 上的 dsh（npm @deepseek-ai/dsh）。"
  local dsh_bin
  dsh_bin="$(resolve_dsh_bin)"
  if [ -n "$dsh_bin" ]; then
    echo "dsh: $dsh_bin"
    prepend_dsh_node_path "$dsh_bin"
    "$dsh_bin" --version 2>/dev/null || true
  else
    echo "dsh: 未找到。请: npm i -g @deepseek-ai/dsh"
  fi
  echo "说明: docs/架构与选型/宿主二次开发-同仓host与部署方案.md"
  echo "业务目录: apps/zr-workbuddy/"
  echo "DSH_HOME: $DSH_HOME_DIR（工作区 $(dsh_home_workspace_count "$DSH_HOME_DIR") 个）"
  local wb_pid
  wb_pid="$(web_port_listen_pid "$WORKBUDDY_WEB_PORT")"
  if [ -n "$wb_pid" ]; then
    echo "WorkBuddy web: :$WORKBUDDY_WEB_PORT 监听中 (PID $wb_pid)"
  else
    echo "WorkBuddy web: :$WORKBUDDY_WEB_PORT 未监听 → scripts/host.sh fix-ports"
  fi
  echo "开发请开: http://127.0.0.1:$WORKBUDDY_WEB_PORT"
}

cmd_hint() {
  cat <<EOF
【聊天壳操作提示】
1. 本机 CLI:         npm i -g @deepseek-ai/dsh
2. 接线 Bridge:      scripts/host.sh wire          # 含第一次预装 dshmarket + 对齐 dsh-tools + 同步 WorkBuddy Key
3. 检查接线:         scripts/host.sh verify
4. 日常一键保活:     scripts/host.sh up          # 引擎 + :3081（守护进程，不被 IDE 关掉）
5. 仅确保引擎:       scripts/host.sh ensure-engine
6. 仅确保聊天壳:     scripts/host.sh ensure-web
7. 重启聊天壳:       scripts/host.sh restart-web
8. 停 Web 宿主:      scripts/host.sh stop-web
9. DeepSeek Key：只在 WorkBuddy 配置中心填并保存，聊天壳会同步；不必再去「设置 → 模型」
10. 生态插件: 宿主跑起来后用插件中心 / \`dsh plugin add\`——勿往引擎功能页硬塞整仓 zip；知识库 \`@zhongruan/dsh-knowledge\`、用量计量 \`@zhongruan/dsh-llm-meter\` 由 wire/桌面预装
11. 本仓禁止再导入 DSH Studio 源码树。桌面包内嵌 CLI 见 desktop/runtime/host（打包时 npm 安装，不进 git）
EOF
}

cmd_verify() {
  local ok=1
  echo "=== P2 接线检查 ==="
  if [ -L "$LINK_REPO" ] || [ -e "$LINK_REPO" ]; then
    echo "link: $LINK_REPO -> $(readlink "$LINK_REPO" 2>/dev/null || echo '?')"
    case "$(readlink "$LINK_REPO" 2>/dev/null || true)" in
      "$ROOT") ;;
      *) echo "警告: link 目标不是本仓库 $ROOT" >&2; ok=0 ;;
    esac
  else
    echo "缺失: $LINK_REPO（请 scripts/host.sh wire）" >&2
    ok=0
  fi

  if [ ! -f "$PROFILE/package.json" ]; then
    echo "缺失: $PROFILE/package.json（请先按上游文档初始化 profiles/web）" >&2
    ok=0
  else
    python3 - <<'PY' "$PROFILE/package.json" "$ROOT" || ok=0
import json,sys
pj, root = sys.argv[1], sys.argv[2]
deps=(json.load(open(pj)).get("dependencies") or {})
spec=deps.get("@dsh-external/dsh-mes-bridge")
print("profile bridge dep:", spec or "<missing>")
if not spec or "DSH-ZR-WorkBuddy/apps/zr-workbuddy/plugins/mes-bridge" not in str(spec):
    print("错误: profile 未指向本仓 apps/zr-workbuddy/plugins/mes-bridge", file=sys.stderr)
    raise SystemExit(1)
PY
  fi

  if [ -f "$PROFILE/cordis.patch.yml" ]; then
    if grep -q "id: dsh-mes-bridge" "$PROFILE/cordis.patch.yml"; then
      echo "cordis.patch: 含 id dsh-mes-bridge"
    else
      echo "错误: cordis.patch.yml 缺少 dsh-mes-bridge insert" >&2
      ok=0
    fi
  else
    echo "缺失: $PROFILE/cordis.patch.yml" >&2
    ok=0
  fi

  if "$ROOT/scripts/engine.sh" zr-workbuddy status >/tmp/wb-engine-status.$$ 2>&1; then
    head -5 /tmp/wb-engine-status.$$
  else
    echo "引擎未就绪（可用 scripts/host.sh ensure-engine）:" >&2
    cat /tmp/wb-engine-status.$$ >&2 || true
    ok=0
  fi
  rm -f /tmp/wb-engine-status.$$

  PID="$(web_port_listen_pid "$PORT")"
  if [ -n "$PID" ]; then
    echo "宿主 web: 监听 :$PORT (PID $PID) → http://127.0.0.1:$PORT"
  else
    echo "宿主 web: :$PORT 未监听（可用 scripts/host.sh ensure-web / up）"
  fi

  if [ -f "$PROFILE/package.json" ]; then
    if python3 "$ROOT/scripts/lib/ensure_runtime.py" --require \
        --profile "$PROFILE" --dsh-home "$DSH_HOME_DIR"; then
      echo "运行时依赖: 通过"
    else
      echo "错误: 运行时依赖门禁未通过（新机缺包 / zod dist / dsh-tools 等）" >&2
      ok=0
    fi
  fi

  # 公司/私有插件市场不得静默掉回官方（见 .cursor/rules/workbuddy-company-market.mdc）
  if ! WORKBUDDY_WEB_PORT="$PORT" DSH_HOME="$DSH_HOME_DIR" \
    python3 "$ROOT/scripts/lib/verify_company_dsh_market.py"; then
    ok=0
  fi

  if [ "$ok" -eq 1 ]; then
    echo "=== verify OK ==="
    return 0
  fi
  echo "=== verify 有问题（见上）===" >&2
  return 1
}

cmd_wire() {
  local do_restart=0
  for a in "$@"; do
    case "$a" in --restart) do_restart=1 ;; esac
  done
  if [ ! -f "$PROFILE/package.json" ]; then
    echo "本机尚无 $PROFILE/package.json。" >&2
    echo "请先按 DeepSeek Harness 文档初始化 profiles/web，再重跑 wire。" >&2
    exit 1
  fi
  if [ "$do_restart" -eq 1 ]; then
    echo "执行: plugin.sh --app zr-workbuddy install bridge --restart"
    echo "提示: --restart 走 scripts/host.sh restart-web（:$WORKBUDDY_WEB_PORT）。" >&2
    "$ROOT/scripts/plugin.sh" --app zr-workbuddy install bridge --restart
  else
    echo "执行: plugin.sh --app zr-workbuddy install bridge（不重启宿主）"
    "$ROOT/scripts/plugin.sh" --app zr-workbuddy install bridge
  fi
  # 接线时同步写入公司市场 npmrc（不启动 web 也会准备好）
  # shellcheck source=lib/company_dsh_market.sh
  . "$ROOT/scripts/lib/company_dsh_market.sh"
  if ! apply_company_dsh_market; then
    echo "wire 失败：公司插件市场未就绪（LOCKED）" >&2
    exit 1
  fi
  # 第一次接线硬门禁：设置「插件市场」= dshmarket（裸 dsh web 不会带）
  if ! ensure_workbuddy_dshmarket_plugin; then
    echo "wire 失败：未装上 dshmarket" >&2
    exit 1
  fi
  # 预装 LLM 用量计量（只记 llm/stream；缺包则 dsh plugin add；失败不拖垮 wire）
  ensure_workbuddy_llm_meter_plugin || true
  python3 "$ROOT/scripts/lib/ensure_dsh_core_bundles.py" --fix --require "$PROFILE" || {
    echo "wire 失败：dsh-base / dsh-web-app 无法恢复" >&2
    exit 1
  }
  # 残包不得进 bundles：否则 3081 整页 Failed to load plugins 卡死
  if ! python3 "$ROOT/scripts/lib/purge_broken_profile_bundles.py" --fix --require "$PROFILE"; then
    echo "wire 失败：profile bundles 含不可加载包" >&2
    exit 1
  fi
  # LOCKED：统一依赖门禁（Key / dsh-tools / zod dist / Python / Node / npm 入口）
  if ! ensure_workbuddy_runtime; then
    echo "wire 失败：运行时依赖未就绪" >&2
    exit 1
  fi
  python3 "$ROOT/scripts/lib/ensure_dsh_core_bundles.py" --fix --require "$PROFILE" || {
    echo "wire 失败：runtime 后核心包仍缺失" >&2
    exit 1
  }
  # 知识库在 runtime 之后再对齐，避免被 pnpm 旧锁打回；失败拒绝 wire（与 restart-web 一致）
  if ! ensure_workbuddy_knowledge_plugin; then
    echo "wire 失败：知识库托管/peer 接线未就绪" >&2
    exit 1
  fi
  cmd_verify || true
}

cmd_ensure_engine() {
  sync_dev_engine_env
  "$ROOT/scripts/engine.sh" zr-workbuddy ensure
}

cmd_stop_web() {
  stop_web_port "$PORT"
  rm -f "$ROOT/tmp/host-web-${PORT}.pid" "$ROOT/tmp/host-web.pid"
  echo "已停止 :$PORT"
}

# 引擎 config.yaml 是 DeepSeek Key 真相源：有可用 Key 则写入/覆盖 DSH 聊天凭据。
ensure_workbuddy_dsh_deepseek_credential() {
  python3 "$ROOT/scripts/lib/ensure_dsh_deepseek_credential.py" \
    --config "$ROOT/apps/zr-workbuddy/engine/config/config.yaml" \
    --dsh-home "$DSH_HOME_DIR"
}

# LOCKED：新机启动统一依赖门禁。能修则修，过不了拒绝启动。
ensure_workbuddy_runtime() {
  if ! python3 "$ROOT/scripts/lib/ensure_runtime.py" --fix --require \
      --profile "$PROFILE" --dsh-home "$DSH_HOME_DIR"; then
    echo "LOCKED：运行时依赖未就绪，拒绝启动。请看上方 FAIL 项。" >&2
    echo "请: python3 scripts/lib/ensure_runtime.py --fix --require" >&2
    return 1
  fi
  return 0
}

# LOCKED：dsh-tools 必须与宿主同源，否则工具 reading prepare。第一次启动就对齐。
ensure_workbuddy_dsh_tools_aligned() {
  if ! python3 "$ROOT/scripts/lib/align_dsh_tools.py" --fix --require --profile-dir "$PROFILE"; then
    echo "LOCKED：dsh-tools 未与宿主同源，聊天调工具会 reading prepare" >&2
    echo "请: python3 scripts/lib/align_dsh_tools.py --fix --require" >&2
    return 1
  fi
  return 0
}

# DSH Cursor 写码：@cursor/sdk 依赖 zod/dist/esm。zod@3.25.0 npm 包无 dist。
ensure_workbuddy_cursor_sdk_zod() {
  local zod_tb="$ROOT/vendor/zod/zod-3.25.67.tgz"
  if [ -f "$zod_tb" ]; then
    export WORKBUDDY_ZOD_TARBALL="$zod_tb"
  fi
  if ! python3 "$ROOT/scripts/lib/ensure_cursor_sdk_zod.py" --fix --require "$PROFILE"; then
    echo "写码依赖 zod dist 缺失，zr_cursor_begin 会失败" >&2
    echo "请: python3 scripts/lib/ensure_cursor_sdk_zod.py --fix --require" >&2
    return 1
  fi
  return 0
}

ensure_workbuddy_webserver_patch() {
  if [ ! -f "$PROFILE/cordis.patch.yml" ]; then
    echo "跳过 webserver patch：缺少 $PROFILE/cordis.patch.yml" >&2
    return 0
  fi
  python3 "$ROOT/scripts/lib/ensure_web_port_patch.py" "$PROFILE" "$WORKBUDDY_WEB_PORT"
}

# 预装 dshmarket：设置 → 插件市场。第一次接线硬门禁，失败则拒绝 wire/up。
# 版本可用 WORKBUDDY_MARKET_VERSION 覆盖（默认 1.66.38，对齐 package_desktop.py MARKET_VER）
ensure_workbuddy_dshmarket_plugin() {
  if [ ! -f "$PROFILE/package.json" ]; then
    echo "拒绝：缺少 $PROFILE/package.json，无法预装插件市场（dshmarket）" >&2
    return 1
  fi
  local out market_spec
  out="$(python3 "$ROOT/scripts/lib/ensure_dshmarket.py" "$PROFILE" 2>&1)" || true
  printf '%s\n' "$out"
  market_spec="$(printf '%s\n' "$out" | sed -n 's/^NEED_INSTALL //p' | head -1)"
  if [ -n "$market_spec" ]; then
    local dsh_bin profile_name
    dsh_bin="$(resolve_dsh_bin 2>/dev/null || command -v dsh 2>/dev/null || true)"
    profile_name="$(basename "$PROFILE")"
    if [ -n "$dsh_bin" ]; then
      echo "执行: dsh plugin --profile $profile_name add ${market_spec}"
      "$dsh_bin" plugin --profile "$profile_name" add "$market_spec" || true
    fi
    if ! python3 "$ROOT/scripts/lib/ensure_dshmarket.py" --require "$PROFILE" >/dev/null 2>&1; then
      if command -v pnpm >/dev/null 2>&1; then
        echo "执行: pnpm add ${market_spec} （profile=$PROFILE）"
        (cd "$PROFILE" && pnpm add "$market_spec") || true
      fi
    fi
  fi
  if ! python3 "$ROOT/scripts/lib/ensure_dshmarket.py" --require "$PROFILE"; then
    echo "LOCKED：第一次接线必须装上 dshmarket，否则 3081 设置里没有「插件市场」。" >&2
    echo "请: dsh plugin --profile web add dshmarket@${WORKBUDDY_MARKET_VERSION:-1.66.38}" >&2
    return 1
  fi
  return 0
}

# 预装 @zhongruan/dsh-knowledge：托管 pack + link:（不走 dsh plugin add，防 pnpm 打回旧版）
# 默认跟公司 npm latest；仅调试时可设 WORKBUDDY_KB_VERSION 钉死某一版
ensure_workbuddy_knowledge_plugin() {
  if [ ! -f "$PROFILE/package.json" ]; then
    echo "跳过知识库预装：缺少 $PROFILE/package.json" >&2
    return 0
  fi
  local out
  # peer/link 失败必须显式失败：否则宿主启动后 ERR_MODULE_NOT_FOUND → :3081 未监听
  if ! out="$(python3 "$ROOT/scripts/lib/ensure_dsh_knowledge.py" --fix "$PROFILE" 2>&1)"; then
    printf '%s\n' "$out" >&2
    echo "知识库托管接线失败（见上）" >&2
    return 1
  fi
  printf '%s\n' "$out"
  if printf '%s\n' "$out" | grep -qE '托管安装失败|NEED_INSTALL|NEED_UPGRADE|peer 未齐|缺少 schemastery|pnpm-lock 未改写'; then
    echo "知识库未就绪，拒绝继续启动" >&2
    return 1
  fi
}


# 预装 @zhongruan/dsh-llm-meter：cordis 启用 + 登记依赖；缺包时尝试 dsh plugin add
# 失败只 warn，不拖垮宿主。版本可用 WORKBUDDY_METER_VERSION 覆盖（默认 0.1.0）
ensure_workbuddy_llm_meter_plugin() {
  if [ ! -f "$PROFILE/package.json" ]; then
    echo "跳过用量计量预装：缺少 $PROFILE/package.json" >&2
    return 0
  fi
  local out meter_spec
  out="$(python3 "$ROOT/scripts/lib/ensure_dsh_llm_meter.py" "$PROFILE" 2>&1)" || true
  printf '%s\n' "$out"
  meter_spec="$(printf '%s\n' "$out" | sed -n 's/^NEED_INSTALL //p' | head -1)"
  if [ -n "$meter_spec" ]; then
    local dsh_bin
    dsh_bin="$(resolve_dsh_bin 2>/dev/null || command -v dsh 2>/dev/null || true)"
    if [ -z "$dsh_bin" ]; then
      echo "用量计量包未安装且 PATH 无 dsh；请稍后: dsh plugin --profile web add ${meter_spec}" >&2
      return 0
    fi
    echo "执行: dsh plugin --profile web add ${meter_spec}"
    local profile_name
    profile_name="$(basename "$PROFILE")"
    if ! "$dsh_bin" plugin --profile "$profile_name" add "$meter_spec"; then
      echo "dsh plugin add 用量计量失败：请确认 ${meter_spec} 已发布到公司 npm。配置已写入；未装上时用量页回退会话补采。" >&2
      return 0
    fi
    python3 "$ROOT/scripts/lib/ensure_dsh_llm_meter.py" "$PROFILE" >/dev/null || true
  fi
}

_launch_web_daemon() {
  sync_dev_engine_env
  # 强制会话库落到本脚本解析出的家目录（daemon 子进程也继承）
  export DSH_HOME="$DSH_HOME_DIR"
  echo "DSH_HOME=$DSH_HOME  PROFILE=$PROFILE  port=$PORT"
  # 公司插件市场：合并目录（公司在前）+ @zhongruan npmrc
  # LOCKED：无 DSHM 不得启动（见 workbuddy-company-market.mdc）
  # shellcheck source=lib/company_dsh_market.sh
  . "$ROOT/scripts/lib/company_dsh_market.sh"
  if ! apply_company_dsh_market; then
    echo "拒绝启动宿主：公司/私有插件市场未就绪（中软插件会「消失」）" >&2
    echo "破窗（仅调试）: WORKBUDDY_ALLOW_OFFICIAL_MARKET=1 scripts/host.sh restart-web" >&2
    exit 1
  fi
  if ! ensure_workbuddy_dshmarket_plugin; then
    echo "拒绝启动宿主：未装上 dshmarket（设置里不会有「插件市场」）" >&2
    exit 1
  fi
  if ! ensure_workbuddy_runtime; then
    echo "拒绝启动宿主：运行时依赖未就绪" >&2
    exit 1
  fi
  mkdir -p "$ROOT/tmp"
  local log pidf
  log="$(web_port_log_file "$ROOT" "$PORT")"
  pidf="$ROOT/tmp/host-web-${PORT}.pid"
  : >"$log"

  # shellcheck disable=SC2207
  local web_args=(web --no-open --host 127.0.0.1 --port "$PORT")
  if [ -n "$TRUSTED_HOSTS" ]; then
    local IFS=',' h
    for h in $TRUSTED_HOSTS; do
      h="$(printf '%s' "$h" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
      [ -n "$h" ] && web_args+=(--trusted-host "$h")
    done
  fi

  local dsh_bin
  dsh_bin="$(resolve_dsh_bin)"
  if [ -z "$dsh_bin" ]; then
    echo "PATH 无 dsh。请先: npm i -g @deepseek-ai/dsh" >&2
    exit 1
  fi
  prepend_dsh_node_path "$dsh_bin"
  echo "启动全局 dsh（守护、脱离 IDE 进程组）: $dsh_bin ${web_args[*]} （:$PORT）"
  echo "日志: $log"
  # cwd=HOME：与 restart-dsh.sh 一致，credentials/profile 可解析
  python3 "$DAEMONIZE" --cwd "$HOME" --log "$log" --pid "$pidf" -- \
    "$dsh_bin" "${web_args[@]}"
}

# DSH 0.2 起，直接打开 http://127.0.0.1:PORT/ 会 401（authentication required）。
# 日志里的 dsh web: …?token= 会种下浏览器 Cookie，之后裸地址才能进。
open_dsh_authenticated_url() {
  local log url i
  log="$(web_port_log_file "$ROOT" "$PORT")"
  url=""
  for i in $(seq 1 30); do
    url="$(grep -E 'dsh web: https?://[^[:space:]]+' "$log" 2>/dev/null | tail -n 1 | sed -E 's/^dsh web: //')"
    case "$url" in
      *token=*) break ;;
    esac
    url=""
    sleep 0.5
  done
  if [ -z "$url" ]; then
    echo "未找到带 token 的打开地址，禁止改开裸地址（会停在 authentication required）。请看日志: $log" >&2
    return 1
  fi
  echo "打开聊天壳: $url"
  echo "（这一下会写入浏览器 Cookie。Cookie 写入后，同一浏览器才可以再开 http://127.0.0.1:$PORT ）"
  case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW*|MSYS*|CYGWIN*)
      MSYS_NO_PATHCONV=1 cmd.exe /c start "" "$url" >/dev/null 2>&1 || true
      ;;
    Darwin)
      open "$url" >/dev/null 2>&1 || true
      ;;
    *)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 || true
      fi
      ;;
  esac
  return 0
}

_wait_web() {
  local i code
  for i in $(seq 1 25); do
    sleep 1
    if [ -n "$(web_port_listen_pid "$PORT")" ]; then
      code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null || echo 000)"
      # 401 是 DSH 0.2 的本机门锁，表示进程已在听，不是没起来。
      echo "宿主 web 已监听 http://127.0.0.1:$PORT （HTTP $code）"
      echo "业务引擎请另看: scripts/engine.sh zr-workbuddy status"
      if [ "$code" = "401" ] || [ "$code" = "200" ] || [ "$code" = "303" ]; then
        open_dsh_authenticated_url || true
      fi
      return 0
    fi
  done
  echo "25s 内未听到 :$PORT，请查看日志: $(web_port_log_file "$ROOT" "$PORT")" >&2
  tail -40 "$(web_port_log_file "$ROOT" "$PORT")" 2>/dev/null || true
  return 1
}

cmd_start_web() {
  for a in "$@"; do
    case "$a" in
      --from-host)
        echo "已废弃 --from-host：本仓不再包含 DSH 源码。请用全局 dsh（npm i -g @deepseek-ai/dsh）。" >&2
        exit 2
        ;;
    esac
  done

  if [ ! -f "$PROFILE/package.json" ]; then
    echo "缺少 profile: $PROFILE —— 请先初始化并 scripts/host.sh wire" >&2
    exit 1
  fi
  local PID
  PID="$(web_port_listen_pid "$PORT")"
  if [ -n "$PID" ]; then
    echo ":$PORT 已有进程 PID $PID。若要重启请先: scripts/host.sh restart-web" >&2
    exit 2
  fi

  _launch_web_daemon
  _wait_web
}

cmd_ensure_web() {
  if [ ! -f "$PROFILE/package.json" ]; then
    echo "缺少 profile: $PROFILE —— 请先 scripts/host.sh wire" >&2
    exit 1
  fi
  local PID code need_relaunch=0
  if ! python3 "$ROOT/scripts/lib/ensure_runtime.py" --require \
      --profile "$PROFILE" --dsh-home "$DSH_HOME_DIR" >/dev/null 2>&1; then
    need_relaunch=1
  fi
  PID="$(web_port_listen_pid "$PORT")"
  if [ -n "$PID" ] && [ "$need_relaunch" = "1" ]; then
    echo "已发现运行时依赖缺口，先停聊天壳再补齐…" >&2
    cmd_stop_web || true
    PID=""
  fi
  if ! ensure_workbuddy_dshmarket_plugin; then
    echo "ensure-web 失败：未装上 dshmarket" >&2
    exit 1
  fi
  if ! python3 "$ROOT/scripts/lib/purge_broken_profile_bundles.py" --fix --require "$PROFILE"; then
    echo "ensure-web 失败：profile bundles 含不可加载包" >&2
    exit 1
  fi
  if ! ensure_workbuddy_runtime; then
    echo "ensure-web 失败：运行时依赖未就绪" >&2
    exit 1
  fi
  PID="$(web_port_listen_pid "$PORT")"
  if [ -n "$PID" ]; then
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$PORT/" 2>/dev/null || echo 000)"
    # 401：DSH 0.2 门锁。进程是好的，不能当成坏了再重启（重启会换掉 token）。
    if [ "$code" = "200" ] || [ "$code" = "304" ] || [ "$code" = "401" ]; then
      echo "宿主 web 已就绪 → http://127.0.0.1:$PORT （PID $PID，HTTP $code）"
      if [ "$code" = "401" ]; then
        open_dsh_authenticated_url || true
      fi
      return 0
    fi
    echo "端口占用但 HTTP 异常（$code），重启聊天壳…" >&2
    cmd_stop_web || true
  fi
  _launch_web_daemon
  _wait_web
}

cmd_restart_web() {
  ensure_workbuddy_webserver_patch
  if ! ensure_workbuddy_dshmarket_plugin; then
    echo "restart-web 失败：未装上 dshmarket" >&2
    exit 1
  fi
  ensure_workbuddy_llm_meter_plugin || true
  # 核心 base/web-app 常被 pnpm 剪掉（不在 dependencies）——purge 前必须先恢复
  python3 "$ROOT/scripts/lib/ensure_dsh_core_bundles.py" --fix --require "$PROFILE" || {
    echo "restart-web 失败：dsh-base / dsh-web-app 无法恢复" >&2
    exit 1
  }
  if ! python3 "$ROOT/scripts/lib/purge_broken_profile_bundles.py" --fix --require "$PROFILE"; then
    echo "restart-web 失败：profile bundles 含不可加载包" >&2
    exit 1
  fi
  cmd_stop_web || true
  sleep 1
  if ! ensure_workbuddy_runtime; then
    echo "restart-web 失败：运行时依赖未就绪" >&2
    exit 1
  fi
  # runtime/pnpm 之后再对齐知识库；失败则不启动（避免 schemastery 崩进程）
  if ! ensure_workbuddy_knowledge_plugin; then
    echo "restart-web 失败：知识库托管/peer 接线未就绪" >&2
    exit 1
  fi
  # pnpm 可能再次剪掉核心包
  python3 "$ROOT/scripts/lib/ensure_dsh_core_bundles.py" --fix --require "$PROFILE" || {
    echo "restart-web 失败：runtime 后核心包仍缺失" >&2
    exit 1
  }
  # 核心包 / 市场更新常把 zod@3.25.0 残包装回——必须在最后一次 materialize 之后再钉 dist
  if ! ensure_workbuddy_cursor_sdk_zod; then
    echo "restart-web 失败：写码依赖 zod dist 未就绪" >&2
    exit 1
  fi
  cmd_start_web "$@"
  # 启动后只验收，禁止再 materialize（会 rmtree 正在加载的包 → 宿主崩）
  sleep 2
  python3 "$ROOT/scripts/lib/verify_kb_version.py" "$PROFILE" || true
  verify_workbuddy_ports "$ROOT" || true
}

cmd_fix_ports() {
  echo "=== WorkBuddy :$WORKBUDDY_WEB_PORT（DSH_HOME=$DSH_HOME_DIR，含工作区 + mes-bridge）==="
  stop_web_port "$WORKBUDDY_WEB_PORT" || true
  stop_web_port "$OFFICIAL_WEB_PORT" || true
  sleep 1

  echo "接线 mes-bridge → $PROFILE"
  "$ROOT/scripts/plugin.sh" --app zr-workbuddy install bridge
  ensure_workbuddy_webserver_patch

  sync_dev_engine_env
  export DSH_HOME="$DSH_HOME_DIR"
  export DSH_WEB_PORT="$WORKBUDDY_WEB_PORT"
  PORT="$WORKBUDDY_WEB_PORT"

  if ! cmd_ensure_engine; then
    echo "警告: 引擎 ensure 未成功，继续拉起聊天壳…" >&2
  fi
  _launch_web_daemon
  _wait_web || true
  local i wb_log
  wb_log="$(web_port_log_file "$ROOT" "$WORKBUDDY_WEB_PORT")"
  for i in $(seq 1 45); do
    if web_port_has_mes_bridge "$wb_log"; then
      break
    fi
    sleep 1
  done

  if DSH_HOME="$DSH_HOME_DIR" python3 "$ROOT/scripts/lib/verify_workbuddy_web.py"; then
    echo "打开 WorkBuddy: http://127.0.0.1:$WORKBUDDY_WEB_PORT"
  else
    return 1
  fi
}

cmd_verify_ports() {
  verify_workbuddy_ports "$ROOT"
}

cmd_up() {
  echo "=== WorkBuddy up：引擎 + 聊天壳（守护）==="
  local desk_pid
  desk_pid="$(web_port_listen_pid 13080)"
  if [ -n "$desk_pid" ]; then
    echo "警告: 桌面 App 仍在 :13080 (PID $desk_pid)，会注入 APP_ENGINE_PORT=18000 污染环境。" >&2
    echo "      开发请完全退出桌面 App，只用 http://127.0.0.1:$PORT （浏览器壳，勿开桌面 :13080 混看会话）。" >&2
  fi
  # 引擎失败不阻断聊天壳；两边各自 ensure
  if ! cmd_ensure_engine; then
    echo "警告: 引擎 ensure 未成功，继续尝试聊天壳…" >&2
  fi
  cmd_ensure_web
  cmd_verify || true
  verify_workbuddy_ports "$ROOT" || true
  echo "打开: http://127.0.0.1:$PORT"
}

case "$CMD" in
  where) resolve_dsh_bin; echo ;;
  status) cmd_status ;;
  hint) cmd_hint ;;
  verify) cmd_verify ;;
  wire) cmd_wire "$@" ;;
  ensure-engine) cmd_ensure_engine ;;
  ensure-web) cmd_ensure_web ;;
  up) cmd_up ;;
  start-web) cmd_start_web "$@" ;;
  restart-web) cmd_restart_web "$@" ;;
  fix-ports) cmd_fix_ports ;;
  verify-ports) cmd_verify_ports ;;
  stop-web) cmd_stop_web ;;
  install|start|dev)
    echo "已拒绝自动执行「$CMD」。请用: up | ensure-web | ensure-engine | wire | hint" >&2
    exit 2
    ;;
  *)
    echo "用法: scripts/host.sh status|where|hint|verify|wire [--restart]|up|ensure-engine|ensure-web|start-web|restart-web|fix-ports|verify-ports|stop-web" >&2
    exit 1
    ;;
esac
