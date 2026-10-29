"""本机 Cursor 写码配置（~/.zhongruan/cursor-coding/config.json）。

设置页「Cursor 写码」原先直连插件 :18788；桌面隔离 profile 未装/未起该服务时
浏览器只显示 Failed to fetch。引擎读写同一份文件，不依赖插件进程。
不改 @zhongruan/dsh-cursor-coding 源码。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List

MASK = "••••••••"
DEFAULT_PORT = 18788
DEFAULT_LISTEN = "127.0.0.1"


def data_root() -> Path:
    override = (os.environ.get("WORKBUDDY_CURSOR_CODING_ROOT") or "").strip()
    if override:
        return Path(override)
    return Path.home() / ".zhongruan" / "cursor-coding"


def config_path() -> Path:
    return data_root() / "config.json"


def _scope_from_text(text: Any) -> List[str]:
    raw = "" if text is None else str(text)
    out: List[str] = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if s:
            out.append(s)
    return out


def _text_from_scope(scope: Any) -> str:
    if isinstance(scope, str):
        return scope
    if isinstance(scope, list):
        return "\n".join(str(x).strip() for x in scope if str(x).strip())
    return ""


def _read_raw() -> Dict[str, Any]:
    path = config_path()
    if not path.is_file():
        return {
            "listen": DEFAULT_LISTEN,
            "port": DEFAULT_PORT,
            "dataRoot": str(data_root()),
            "cursorApiKey": "",
            "writeScope": [],
            "model": "composer-2.5",
        }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        data = {}
    if not isinstance(data, dict):
        data = {}
    return data


def _write_raw(data: Dict[str, Any]) -> None:
    root = data_root()
    root.mkdir(parents=True, exist_ok=True)
    path = config_path()
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def public_config() -> Dict[str, Any]:
    raw = _read_raw()
    key = str(raw.get("cursorApiKey") or "").strip()
    port = raw.get("port")
    try:
        port_n = int(port)
    except (TypeError, ValueError):
        port_n = DEFAULT_PORT
    return {
        "listen": str(raw.get("listen") or DEFAULT_LISTEN),
        "port": port_n,
        "dataRoot": str(raw.get("dataRoot") or data_root()),
        "cursorKeyConfigured": bool(key),
        "writeScopeText": _text_from_scope(raw.get("writeScope") or raw.get("writeScopeText")),
        "model": str(raw.get("model") or "composer-2.5"),
    }


def save_public(incoming: Dict[str, Any] | None) -> Dict[str, Any]:
    """合并写入；打码/空圆点不覆盖原 Key。"""
    body = incoming if isinstance(incoming, dict) else {}
    raw = _read_raw()
    listen = str(body.get("listen") or raw.get("listen") or DEFAULT_LISTEN).strip() or DEFAULT_LISTEN
    try:
        port_n = int(body.get("port") if body.get("port") not in (None, "") else raw.get("port") or DEFAULT_PORT)
    except (TypeError, ValueError):
        port_n = DEFAULT_PORT
    if "writeScopeText" in body or "writeScope" in body:
        if "writeScopeText" in body:
            scope = _scope_from_text(body.get("writeScopeText"))
        else:
            scope = body.get("writeScope") if isinstance(body.get("writeScope"), list) else []
    else:
        scope = raw.get("writeScope") if isinstance(raw.get("writeScope"), list) else []

    new_key = body.get("cursorApiKey")
    old_key = str(raw.get("cursorApiKey") or "")
    if new_key is None:
        key = old_key
    else:
        s = str(new_key).strip()
        if (not s) or s == MASK or set(s) <= {"•"}:
            key = old_key
        else:
            key = s

    out = dict(raw)
    out["listen"] = listen
    out["port"] = port_n
    out["dataRoot"] = str(raw.get("dataRoot") or data_root())
    out["cursorApiKey"] = key
    out["writeScope"] = scope
    if not out.get("model"):
        out["model"] = "composer-2.5"
    _write_raw(out)
    _sync_engine_code_dev_key(key)
    _sync_cursor_chat_key(key, write_scope=scope, model=str(out.get("model") or ""))
    return {
        "ok": True,
        "detail": "已保存 Cursor Key 到本机 ~/.zhongruan/cursor-coding（已同步对话写码）",
        "config": public_config(),
    }


def _sync_cursor_chat_key(key: str, *, write_scope: list | None = None, model: str = "") -> None:
    """对话写码插件读 ~/.zhongruan/cursor-chat；保存写码配置时共用同一把 Key（不改插件源码）。

    端口必须避开 dsh-automations 默认 18789（同机冲突会导致确认令牌永远拉不到）。
    """
    if not str(key or "").strip():
        return
    # 与 coding(18788)、automations(18789)、esc(18786/7) 错开
    chat_port = 18791
    automations_conflict = 18789
    try:
        chat_dir = Path.home() / ".zhongruan" / "cursor-chat"
        chat_dir.mkdir(parents=True, exist_ok=True)
        path = chat_dir / "config.json"
        data: Dict[str, Any] = {}
        if path.is_file():
            try:
                loaded = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    data = loaded
            except Exception:
                data = {}
        data["cursorApiKey"] = key
        data["listen"] = "127.0.0.1"
        try:
            cur_port = int(data.get("port") or 0)
        except (TypeError, ValueError):
            cur_port = 0
        # 未设 / 非法 / 与 automations 撞车 → 强制迁到对话写码专用口
        if cur_port <= 0 or cur_port == automations_conflict:
            data["port"] = chat_port
        data.setdefault("dataRoot", str(chat_dir))
        if write_scope is not None and not data.get("writeScope"):
            data["writeScope"] = list(write_scope)
        if model and not data.get("model"):
            data["model"] = model
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        tmp.replace(path)
        try:
            path.chmod(0o600)
        except OSError:
            pass
    except Exception:
        return


def _sync_engine_code_dev_key(key: str) -> None:
    """同步到引擎写码车道；失败不影响文件保存。"""
    if not str(key or "").strip():
        return
    try:
        from .config_store import load_config, save_config

        cfg = load_config()
        cd = cfg.setdefault("code_dev", {})
        if not isinstance(cd, dict):
            return
        cd["cursor_api_key"] = key
        save_config(cfg)
    except Exception:
        return
