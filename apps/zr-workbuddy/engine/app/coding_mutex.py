"""写码通道互斥与入口选择。

产品定稿（2026-09-30）：**唯一写码入口** = Cursor 对话写码（`zr_cchat_begin`）。
禁止回退到旧 `@zhongruan/dsh-cursor-coding` 或本仓 `code-dev` begin。
未装对话写码时 begin 为空，须安装插件，不得悄悄改走其它通道。

开对话写码时自动停用 WorkBuddy code-dev，并把旧 Cursor 写码包挪到 disabledBundles。
DSH 侧只改 profile package.json 的 bundles / disabledBundles，不自动重启宿主。
"""
from __future__ import annotations

import json
import os
import tempfile
from copy import deepcopy
from typing import Any, Dict, Iterator, List

CODE_DEV_FEATURE = "code-dev"
DSH_CURSOR_PKG = "@zhongruan/dsh-cursor-coding"
DSH_CHAT_PKG = "@zhongruan/dsh-cursor-chat"
WB_BEGIN = "mes_code_dev_begin"
DSH_BEGIN = "zr_cursor_begin"
CHAT_BEGIN = "zr_cchat_begin"


def _profile_manifests() -> Iterator[str]:
    homes: List[str] = []
    env_home = (os.environ.get("DSH_HOME") or "").strip()
    if env_home:
        homes.append(env_home)
    homes.append(os.path.expanduser("~/.dsh"))
    homes.append(os.path.expanduser("~/.dsh-workbuddy"))
    seen = set()
    for home in homes:
        real = os.path.abspath(os.path.expanduser(home))
        if real in seen:
            continue
        seen.add(real)
        path = os.path.join(real, "profiles", "web", "package.json")
        if os.path.isfile(path):
            yield path


def _read_json(path: str) -> Dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        data = json.loads(f.read() or "{}")
    return data if isinstance(data, dict) else {}


def _atomic_write_json(path: str, data: Dict[str, Any]) -> None:
    raw = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".pkg.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def _bundle_state(data: Dict[str, Any]) -> tuple[list[str], list[str]]:
    prof = (data.get("dsh") or {}).get("profile") or {}
    if not isinstance(prof, dict):
        prof = {}
    bundles = [str(x) for x in (prof.get("bundles") or [])]
    disabled = [str(x) for x in (prof.get("disabledBundles") or [])]
    return bundles, disabled


def _pkg_installed(data: Dict[str, Any], pkg: str) -> bool:
    deps = data.get("dependencies") if isinstance(data.get("dependencies"), dict) else {}
    bundles, disabled = _bundle_state(data)
    return pkg in deps or pkg in bundles or pkg in disabled


def _is_pkg_enabled(pkg: str) -> bool:
    for path in _profile_manifests():
        try:
            data = _read_json(path)
        except Exception:
            continue
        bundles, _disabled = _bundle_state(data)
        if pkg in bundles:
            return True
    return False


def is_dsh_cursor_enabled() -> bool:
    """任一活动 profile 的 bundles 含旧 Cursor 写码包即视为开（兼容探测；不再作写码入口）。"""
    return _is_pkg_enabled(DSH_CURSOR_PKG)


def is_dsh_cursor_chat_enabled() -> bool:
    """任一活动 profile 的 bundles 含对话写码包即视为开。"""
    return _is_pkg_enabled(DSH_CHAT_PKG)


def set_dsh_cursor_enabled(enabled: bool) -> Dict[str, Any]:
    """把旧 Cursor 写码包在 bundles ↔ disabledBundles 之间移动；未安装则跳过。"""
    updated: List[str] = []
    skipped: List[str] = []
    for path in _profile_manifests():
        try:
            data = _read_json(path)
        except Exception as e:
            skipped.append(f"{path}: {e}")
            continue
        if not _pkg_installed(data, DSH_CURSOR_PKG):
            continue
        bundles, disabled = _bundle_state(data)
        before = (list(bundles), list(disabled))
        if enabled:
            if DSH_CURSOR_PKG not in bundles:
                bundles.append(DSH_CURSOR_PKG)
            disabled = [x for x in disabled if x != DSH_CURSOR_PKG]
        else:
            bundles = [x for x in bundles if x != DSH_CURSOR_PKG]
            if DSH_CURSOR_PKG not in disabled:
                disabled.append(DSH_CURSOR_PKG)
        if (bundles, disabled) == before:
            continue
        out = deepcopy(data)
        out.setdefault("dsh", {}).setdefault("profile", {})
        out["dsh"]["profile"]["bundles"] = bundles
        out["dsh"]["profile"]["disabledBundles"] = disabled
        try:
            _atomic_write_json(path, out)
        except Exception as e:
            skipped.append(f"{path}: {e}")
            continue
        updated.append(path)
    return {
        "ok": True,
        "enabled": bool(enabled),
        "package": DSH_CURSOR_PKG,
        "updated": updated,
        "skipped": skipped,
    }


def coding_begin(
    *,
    workbuddy_on: bool = False,
    dsh_on: bool = False,
    chat_on: bool = False,
) -> str:
    """当前应调用的写码 begin。

    唯一入口：对话写码。workbuddy_on / dsh_on 参数保留供调用方传参兼容，**一律忽略、禁止回退**。
    """
    _ = (workbuddy_on, dsh_on)
    if chat_on:
        return CHAT_BEGIN
    return ""


def reconcile() -> Dict[str, Any]:
    """对话写码启用时：停用 code-dev，并禁用旧 Cursor 写码包（无回退入口）。"""
    from . import plugins_store

    chat_on = is_dsh_cursor_chat_enabled()
    dsh_on = is_dsh_cursor_enabled()
    wb_on = plugins_store.is_enabled(CODE_DEV_FEATURE)
    mutex_parts: List[str] = []
    if chat_on and wb_on:
        plugins_store.disable(CODE_DEV_FEATURE)
        wb_on = False
        mutex_parts.append("disabled-code-dev")
    if chat_on and dsh_on:
        set_dsh_cursor_enabled(False)
        dsh_on = is_dsh_cursor_enabled()
        mutex_parts.append("disabled-legacy-cursor-coding")
    begin = coding_begin(workbuddy_on=wb_on, dsh_on=dsh_on, chat_on=chat_on)
    return {
        "ok": True,
        "workbuddy": wb_on,
        "dsh_cursor": dsh_on,
        "dsh_cursor_chat": chat_on,
        "begin": begin,
        "mutex": "+".join(mutex_parts),
    }
