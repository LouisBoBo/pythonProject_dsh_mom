"""问数通道的工程背景。只附加说明，不改 kind、不改分流。"""
from __future__ import annotations

from typing import Any

_HEAD_LINES = 5
_MAX_CHARS = 500


def format_ask_hint(profile: dict[str, Any] | None) -> str:
    """缓存画像的前几行。无画像则空串，调用方保持原上下文。"""
    if not isinstance(profile, dict):
        return ""
    summary = str(profile.get("summary_zh") or "").strip()
    if not summary:
        return ""
    lines = [ln.strip() for ln in summary.splitlines() if ln.strip()]
    head = "\n".join(lines[:_HEAD_LINES]).strip()
    if not head:
        return ""
    text = (
        "【当前工程背景】\n"
        + head
        + "\n此背景不改变查数规则：该查数仍 kind=query，概念解释仍 kind=chat。"
        + "不要根据技术栈拒绝查询，也不要据此改去写码。"
    )
    return text[:_MAX_CHARS]


def append_ask_hint(context: str, workspace: str) -> str:
    """有缓存才附加。读缓存失败时原样返回，避免问数被背景逻辑打断。"""
    base = context or ""
    ws = str(workspace or "").strip()
    if not ws:
        return base
    try:
        from .project_profile import load_cached

        hint = format_ask_hint(load_cached(ws))
    except Exception:
        return base
    if not hint:
        return base
    return base + "\n" + hint
