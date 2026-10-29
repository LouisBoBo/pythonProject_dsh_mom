#!/usr/bin/env python3
"""对齐对话写码配置：与 cursor-coding 共用 Key，端口避开 automations:18789。

供 ensure_runtime 启动门禁调用。不改 DSH 插件源码。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

CHAT_PORT = 18791
AUTOMATIONS_PORT = 18789
CODING_CFG = Path.home() / ".zhongruan" / "cursor-coding" / "config.json"
CHAT_CFG = Path.home() / ".zhongruan" / "cursor-chat" / "config.json"


def _read(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write(path: Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    try:
        path.chmod(0o600)
    except OSError:
        pass


def _looks_like_placeholder_key(key: str) -> bool:
    k = (key or "").strip()
    if not k:
        return True
    if k in ("test-key-not-real", "crsr_test_abc", "••••••••"):
        return True
    if k.startswith("test-") or k.startswith("crsr_test"):
        return True
    # 真实 Cursor User API Key 通常明显长于测试短串
    if len(k) < 24:
        return True
    return False


def ensure_cursor_chat_align(*, fix: bool = True) -> Dict[str, Any]:
    """把 coding 的有效 Key 同步到 chat，并钉端口 18791。"""
    coding = _read(CODING_CFG)
    chat = _read(CHAT_CFG)
    coding_key = str(coding.get("cursorApiKey") or "").strip()
    chat_key = str(chat.get("cursorApiKey") or "").strip()
    notes: list[str] = []
    fixed = False

    want_key = coding_key if not _looks_like_placeholder_key(coding_key) else ""
    if not want_key and not _looks_like_placeholder_key(chat_key):
        want_key = chat_key

    try:
        cur_port = int(chat.get("port") or 0)
    except (TypeError, ValueError):
        cur_port = 0

    need = False
    if cur_port <= 0 or cur_port == AUTOMATIONS_PORT or cur_port != CHAT_PORT:
        need = True
        notes.append(f"port {cur_port or '?'} → {CHAT_PORT}")
    if want_key and chat_key != want_key:
        need = True
        notes.append("cursorApiKey synced from cursor-coding")
    if _looks_like_placeholder_key(chat_key) and want_key:
        need = True
        if "cursorApiKey synced from cursor-coding" not in notes:
            notes.append("replaced placeholder chat key")
    if not chat.get("listen"):
        need = True

    c_scope = coding.get("writeScope") if isinstance(coding.get("writeScope"), list) else []
    h_scope = chat.get("writeScope") if isinstance(chat.get("writeScope"), list) else []
    if c_scope and (not h_scope or h_scope == ["src/", "apps/"]):
        need = True
        notes.append("writeScope from coding")
    elif (not c_scope) and h_scope == ["src/", "apps/"]:
        need = True
        notes.append("cleared test writeScope pollution")

    if need and fix:
        chat["listen"] = "127.0.0.1"
        chat["port"] = CHAT_PORT
        chat.setdefault("dataRoot", str(CHAT_CFG.parent))
        if want_key:
            chat["cursorApiKey"] = want_key
        if coding.get("model") and not chat.get("model"):
            chat["model"] = coding.get("model")
        if c_scope and (not h_scope or h_scope == ["src/", "apps/"]):
            chat["writeScope"] = list(c_scope)
        elif (not c_scope) and h_scope == ["src/", "apps/"]:
            chat["writeScope"] = []
        _write(CHAT_CFG, chat)
        fixed = True

    chat2 = _read(CHAT_CFG)
    key_ok = not _looks_like_placeholder_key(str(chat2.get("cursorApiKey") or ""))
    try:
        port_ok = int(chat2.get("port") or 0) == CHAT_PORT
    except (TypeError, ValueError):
        port_ok = False

    ok = port_ok and (key_ok or not want_key)
    detail = "；".join(notes) if notes else (
        f"chat port={CHAT_PORT} key={'ok' if key_ok else 'missing'}"
    )
    if not key_ok and want_key:
        ok = False
        detail = (detail + "；" if detail else "") + "对话写码 Key 仍无效"
    if not key_ok and not want_key:
        detail = (detail + "；" if detail else "") + "请到 WorkBuddy 设置→写码/Cursor 填写有效 Key"

    return {
        "ok": ok,
        "fixed": fixed,
        "detail": detail,
        "port": int(chat2.get("port") or 0) if chat2 else 0,
        "key_ready": key_ok,
        "path": str(CHAT_CFG),
    }


def main(argv: Optional[list] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--require", action="store_true")
    args = ap.parse_args(argv)
    out = ensure_cursor_chat_align(fix=bool(args.fix or True))
    print(json.dumps(out, ensure_ascii=False))
    if args.require and not out.get("ok"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
