# -*- coding: utf-8 -*-
"""提交车道 VCS 识别：画像优先（与磁盘一致时），否则按磁盘 .git / .svn。"""
from __future__ import annotations

from pathlib import Path
from typing import Any


def _disk_vcs_kind(root: Path) -> str:
    has_git = (root / ".git").exists()
    has_svn = (root / ".svn").is_dir()
    if has_git:
        return "git"
    if has_svn:
        return "svn"
    return "none"


def _profile_vcs(profile: dict[str, Any] | None) -> tuple[str, str]:
    if not isinstance(profile, dict):
        return "", ""
    block = profile.get("vcs") if isinstance(profile.get("vcs"), dict) else {}
    kind = str((block or {}).get("kind") or "").strip().lower()
    remote = str((block or {}).get("remote") or "").strip()
    if kind in {"git", "svn", "none"}:
        return kind, remote
    return "", remote


def resolve_commit_vcs(
    workspace: Path | str,
    *,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """解析提交用托管类型。

    返回：kind(git|svn|none)、remote、has_remote、source(profile|disk)、path
    规则：画像 kind 与磁盘一致时用画像；冲突或以空画像时用磁盘（避免假 SVN/假 Git）。
    """
    root = Path(str(workspace or "")).expanduser().resolve()
    disk = _disk_vcs_kind(root) if root.is_dir() else "none"
    prof_kind, prof_remote = _profile_vcs(profile)

    if prof_kind and (prof_kind == disk or (prof_kind == "none" and disk == "none")):
        kind = prof_kind
        source = "profile"
    elif prof_kind and disk == "none":
        # 画像有声明但磁盘尚无检出痕迹：仍信画像（用户刚配完）
        kind = prof_kind
        source = "profile"
    else:
        kind = disk
        source = "disk"

    remote = ""
    has_remote = False
    if kind == "git":
        try:
            from .git_ops import inspect_git_repo

            info = inspect_git_repo(root)
            remote = str(info.get("remote_url") or "") or prof_remote
            has_remote = bool(info.get("has_remote")) or bool(prof_remote)
        except Exception:  # noqa: BLE001
            remote = prof_remote
            has_remote = bool(prof_remote)
    elif kind == "svn":
        try:
            from .svn_ops import inspect_svn_repo

            info = inspect_svn_repo(root)
            remote = str(info.get("url") or "") or prof_remote
            has_remote = bool(info.get("has_remote")) or bool(remote)
        except Exception:  # noqa: BLE001
            remote = prof_remote
            has_remote = bool(prof_remote)

    return {
        "ok": kind != "none",
        "kind": kind,
        "remote": remote,
        "has_remote": has_remote,
        "source": source,
        "path": str(root),
        "disk_kind": disk,
        "profile_kind": prof_kind or "",
    }


def load_vcs_for_workspace(workspace: Path | str) -> dict[str, Any]:
    """读缓存画像再 resolve（画像缺失不报错）。"""
    root = Path(str(workspace or "")).expanduser().resolve()
    profile: dict[str, Any] | None = None
    try:
        from ..project_profile import load_cached

        profile = load_cached(str(root))
    except Exception:  # noqa: BLE001
        profile = None
    return resolve_commit_vcs(root, profile=profile)
