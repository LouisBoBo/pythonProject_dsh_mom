"""读取 DSH 侧栏「工作区」注册表（storages/workspace.json）。

设置页绑定下拉与左侧工作区列表同源；不依赖浏览器 Cordis store 是否已投影。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from .dsh_chat_credential import resolve_dsh_homes


def _norm_key(path: str) -> str:
    s = str(path or "").strip().replace("\\", "/").rstrip("/")
    return s.lower()


def list_dsh_workspaces() -> List[Dict[str, str]]:
    """按各 DSH_HOME 的 workspace.json 合并；同路径去重，保注册表顺序。"""
    out: List[Dict[str, str]] = []
    seen = set()

    def push(path: str, title: str) -> None:
        p = str(path or "").strip()
        if not p:
            return
        k = _norm_key(p)
        if k in seen:
            return
        seen.add(k)
        t = str(title or "").strip()
        if not t:
            t = Path(p).name or p
        out.append({"path": p, "title": t})

    for home in resolve_dsh_homes():
        fp = Path(home).expanduser() / "storages" / "workspace.json"
        if not fp.is_file():
            continue
        try:
            raw = json.loads(fp.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError):
            continue
        if not isinstance(raw, dict):
            continue
        global_block = raw.get("global") if isinstance(raw.get("global"), dict) else {}
        tables = raw.get("tables") if isinstance(raw.get("tables"), dict) else {}
        workspaces = tables.get("workspaces") if isinstance(tables.get("workspaces"), dict) else {}
        ids = global_block.get("workspaceIds")
        ordered: List[str] = [str(x) for x in ids] if isinstance(ids, list) else list(workspaces.keys())
        for wid in ordered:
            row = workspaces.get(wid)
            if not isinstance(row, dict):
                continue
            push(str(row.get("path") or ""), str(row.get("title") or ""))
        # 未出现在 order 里的残留行也附上
        for wid, row in workspaces.items():
            if str(wid) in ordered or not isinstance(row, dict):
                continue
            push(str(row.get("path") or ""), str(row.get("title") or ""))

    return out


def public_dsh_workspaces() -> Dict[str, Any]:
    items = list_dsh_workspaces()
    return {"ok": True, "items": items, "count": len(items)}
