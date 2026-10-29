"""提交车道配置（读 engine config.yaml 的 code_commit 节）。"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from ..config_store import load_config

_DEFAULT_PROTECTED = ("main", "master", "trunk", "production", "prod")


@dataclass
class CodeCommitConfig:
    enabled: bool = True
    default_workspace: str = ""
    work_branch: str = ""
    remote_name: str = "origin"
    default_push: bool = True
    use_skill_review: bool = True
    allow_blocked: bool = False
    max_files: int = 80
    # 保护分支：禁止直接提交；全部来自配置（默认与历史硬编码一致）
    protected_branches: list[str] = field(
        default_factory=lambda: list(_DEFAULT_PROTECTED)
    )


def _parse_protected(raw: Any) -> list[str]:
    if raw is None:
        return list(_DEFAULT_PROTECTED)
    if isinstance(raw, str):
        items = [x.strip() for x in raw.replace(";", ",").split(",")]
    elif isinstance(raw, (list, tuple)):
        items = [str(x).strip() for x in raw]
    else:
        return list(_DEFAULT_PROTECTED)
    out: list[str] = []
    seen: set[str] = set()
    for x in items:
        if not x:
            continue
        low = x.lower()
        if low in seen:
            continue
        # 简单分支名，防注入
        if any(ch in x for ch in (":", " ", "\n", "\t", "..")):
            continue
        seen.add(low)
        out.append(x)
    return out or list(_DEFAULT_PROTECTED)


def get_config() -> CodeCommitConfig:
    raw = load_config().get("code_commit") or {}
    # 常用能力：配置层恒开；启停只认功能插件 code-commit
    # allow_blocked 仅环境变量，禁止靠 yaml 放行阻断项
    allow_blocked = (os.getenv("CODE_COMMIT_ALLOW_BLOCKED") or "").strip() in {
        "1",
        "true",
        "TRUE",
        "yes",
    }
    return CodeCommitConfig(
        enabled=True,
        default_workspace=str(raw.get("default_workspace") or "").strip(),
        work_branch=str(raw.get("work_branch") or "").strip().strip("/"),
        remote_name=(str(raw.get("remote_name") or "origin").strip() or "origin"),
        default_push=bool(raw.get("default_push", True)),
        use_skill_review=bool(raw.get("use_skill_review", True)),
        allow_blocked=allow_blocked,
        max_files=max(1, min(int(raw.get("max_files") or 80), 200)),
        protected_branches=_parse_protected(raw.get("protected_branches")),
    )


def availability() -> dict[str, Any]:
    cfg = get_config()
    return {
        "ok": True,
        "enabled": True,
        "detail": "提交车道就绪（门禁审核 → 人确认 → commit/push；分支默认当前，无则自动创建）",
        "default_push": cfg.default_push,
        "work_branch": "(默认当前分支；保护分支/无分支时自动创建)",
        "remote_name": cfg.remote_name,
        "protected_branches": list(cfg.protected_branches),
        "max_files": cfg.max_files,
    }
