#!/usr/bin/env bash
# Windows：PATH 常只有 python / py，没有 python3；Git Bash 与 WSL 路径不同。
# 被 host.sh 等 source 后，提供 python3() 转调本机解释器。
# 禁止依赖 /mnt/c  alone（那是 WSL）；Git Bash 用 /c/Users/...
# shellcheck shell=bash

_wb_py_path_from_userprofile() {
  local up drive rest
  up="${USERPROFILE:-}"
  [ -n "$up" ] || return 1
  case "$up" in
    [A-Za-z]:*)
      drive=$(printf '%s' "$up" | cut -c1 | tr 'A-Z' 'a-z')
      rest=$(printf '%s' "$up" | cut -c3- | tr '\\' '/')
      # Git Bash: /c/Users/...   WSL: /mnt/c/Users/...
      printf '%s\n' "/${drive}${rest}"
      printf '%s\n' "/mnt/${drive}${rest}"
      ;;
    /*)
      printf '%s\n' "${up%/}"
      ;;
  esac
}

_wb_resolve_python() {
  local c base
  # 已有真命令则直接用（不要递归到本函数）
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    command -v python
    return 0
  fi
  if command -v py >/dev/null 2>&1; then
    printf '%s\n' "py"
    return 0
  fi
  while IFS= read -r base; do
    [ -n "$base" ] || continue
    for c in \
      "$base/AppData/Local/Programs/Python/Python312/python.exe" \
      "$base/AppData/Local/Programs/Python/Python311/python.exe" \
      "$base/AppData/Local/Programs/Python/Python310/python.exe"
    do
      if [ -f "$c" ]; then
        printf '%s\n' "$c"
        return 0
      fi
    done
  done <<EOF
$(_wb_py_path_from_userprofile 2>/dev/null || true)
EOF
  for c in \
    "/c/Program Files/Python312/python.exe" \
    "/c/Program Files/Python311/python.exe" \
    "/mnt/c/Program Files/Python312/python.exe" \
    "/mnt/c/Program Files/Python311/python.exe"
  do
    if [ -f "$c" ]; then
      printf '%s\n' "$c"
      return 0
    fi
  done
  return 1
}

# 仅当系统没有 python3 命令时注入函数（避免盖掉真 python3）
if ! command -v python3 >/dev/null 2>&1; then
  _WB_PY=$(_wb_resolve_python 2>/dev/null || true)
  if [ -n "${_WB_PY}" ]; then
    if [ "${_WB_PY}" = "py" ]; then
      python3() {
        command py -3 "$@"
      }
    else
      # 用环境变量传路径，避免函数体解析时路径含空格/特殊字符出问题
      export _WB_PYTHON3_BIN="${_WB_PY}"
      python3() {
        "$_WB_PYTHON3_BIN" "$@"
      }
    fi
  fi
  unset _WB_PY
fi
