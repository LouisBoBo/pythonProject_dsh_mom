"""选目录卡：当前工作区优先建议，配置 default_workspace 仅作兜底芯片。

不改流水线 resolve_workspace，也不自动改盘；只影响 pick 卡预填与 suggestions。
"""
from __future__ import annotations

from typing import Iterable


def resolve_pick_workspace(*candidates: str) -> str:
    """返回第一个非空绝对路径候选；全空则空串。"""
    for raw in candidates:
        ws = str(raw or "").strip()
        if ws:
            return ws
    return ""


def build_pick_suggestions(
    *,
    current_workspace: str = "",
    lane_default: str = "",
    lane_label: str = "本车道常用",
    extras: Iterable[tuple[str, str]] | None = None,
) -> list[dict[str, str]]:
    """芯片顺序：当前工作区 → 本车道常用 → extras。同路径只保留先出现的标签。"""
    out: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(path: str, label: str) -> None:
        p = str(path or "").strip()
        if not p or p in seen:
            return
        seen.add(p)
        out.append({"path": p, "label": str(label or "").strip() or "建议"})

    add(current_workspace, "当前工作区")
    add(lane_default, lane_label)
    if extras:
        for path, label in extras:
            add(path, label)
    return out


__all__ = ["build_pick_suggestions", "resolve_pick_workspace"]
