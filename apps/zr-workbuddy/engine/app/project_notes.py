"""按工程隔离的说明备忘（§15 P1 本仓子集）。

DSH 宿主「知识库」插件仍是全局能力，本仓不改其源码。
这里提供：按工程目录哈希存一份说明，写码任务卡注入短摘录，减少答错旧系统。
"""
from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _root() -> Path:
    return Path(__file__).resolve().parents[1] / "data" / "project_notes"


def workspace_key(workspace: str) -> str:
    ws = str(workspace or "").strip()
    if not ws:
        return ""
    try:
        resolved = str(Path(ws).expanduser().resolve())
    except OSError:
        resolved = ws
    return hashlib.sha256(resolved.encode("utf-8")).hexdigest()[:24]


def _safe_text(raw: str, *, max_len: int = 12000) -> str:
    t = _CTRL.sub(" ", str(raw or ""))
    t = t.replace("\r\n", "\n").replace("\r", "\n")
    return t[:max_len]


def load_notes(workspace: str) -> dict[str, Any]:
    key = workspace_key(workspace)
    if not key:
        return {"ok": False, "detail": "工程目录为空", "text": ""}
    path = _root() / f"{key}.md"
    if not path.is_file():
        return {
            "ok": True,
            "workspace": workspace,
            "key": key,
            "text": "",
            "empty": True,
        }
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as e:
        return {"ok": False, "detail": str(e), "text": ""}
    return {
        "ok": True,
        "workspace": workspace,
        "key": key,
        "text": text,
        "empty": not bool(text.strip()),
    }


def save_notes(workspace: str, text: str) -> dict[str, Any]:
    key = workspace_key(workspace)
    if not key:
        return {"ok": False, "detail": "工程目录为空"}
    try:
        resolved = str(Path(workspace).expanduser().resolve())
        if not Path(resolved).is_dir():
            return {"ok": False, "detail": "工程目录不存在"}
    except OSError:
        return {"ok": False, "detail": "工程目录无效"}
    body = _safe_text(text)
    root = _root()
    root.mkdir(parents=True, exist_ok=True)
    path = root / f"{key}.md"
    meta = root / f"{key}.path.txt"
    try:
        path.write_text(body, encoding="utf-8")
        meta.write_text(resolved + "\n", encoding="utf-8")
    except OSError as e:
        return {"ok": False, "detail": str(e)}
    return {"ok": True, "workspace": resolved, "key": key, "chars": len(body)}


def format_for_coding(workspace: str, *, max_chars: int = 900) -> str:
    """写入写码 requirement 的工程说明摘录。"""
    out = load_notes(workspace)
    if not out.get("ok") or out.get("empty"):
        return ""
    text = str(out.get("text") or "").strip()
    if not text:
        return ""
    # 再压一道：去掉易打断任务卡结构的孤立控制符（正文仍允许换行）
    text = _CTRL.sub(" ", text)
    excerpt = text[:max_chars].strip()
    if len(text) > max_chars:
        excerpt += "…"
    return (
        "【本工程说明 · 用户上传，优先于其它仓库常识】\n"
        + excerpt
        + "\n（完整说明仅属本工程；禁止套用其它项目文档）"
    )
