"""步骤 3：在已绑定 workspace 内构建 context_pack（只读，复用 code_dev 目录校验）。"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from ..code_dev.workspace import validate_workspace

_READ_FILES = (
    "AGENTS.md",
    "README.md",
    "readme.md",
    "package.json",
    "pyproject.toml",
    "tsconfig.json",
)
_MAX_FILE_BYTES = 48_000
_MAX_TOP_DIRS = 40
_MAX_READ = 8


def _safe_read(path: Path) -> str:
    try:
        if not path.is_file():
            return ""
        if path.stat().st_size > _MAX_FILE_BYTES:
            return f"（文件过大，已截断前 {_MAX_FILE_BYTES} 字节）\n" + path.read_text(
                encoding="utf-8", errors="replace"
            )[:_MAX_FILE_BYTES]
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def build_context_pack(workspace: str) -> dict[str, Any]:
    """返回 context_pack；workspace 无效时仍返回结构，由调用方决定 pass/warn。"""
    check = validate_workspace(workspace or "")
    pack: dict[str, Any] = {
        "workspace": check.get("path") or (workspace or "").strip(),
        "workspace_ok": bool(check.get("ok")),
        "workspace_error": str(check.get("error") or ""),
        "project_markers": list(check.get("project_markers") or []),
        "top_level_dirs": [],
        "must_read": [],
        "risks": [],
        "rev": "",
    }
    if not check.get("ok"):
        pack["risks"].append("workspace 未通过校验，Prime 仅落盘占位")
        return pack

    root = Path(str(check["path"]))
    dirs: list[str] = []
    try:
        for ent in sorted(root.iterdir(), key=lambda p: p.name.lower()):
            if ent.name.startswith("."):
                continue
            if ent.is_dir():
                dirs.append(ent.name + "/")
            if len(dirs) >= _MAX_TOP_DIRS:
                break
    except OSError as e:
        pack["risks"].append(f"列举目录失败: {e}")
    pack["top_level_dirs"] = dirs

    must_read: list[dict[str, Any]] = []
    for name in _READ_FILES:
        fp = root / name
        if not fp.is_file():
            continue
        text = _safe_read(fp)
        must_read.append(
            {
                "path": name,
                "bytes": len(text.encode("utf-8", errors="replace")),
                "excerpt": text[:4000],
            }
        )
        if len(must_read) >= _MAX_READ:
            break

    pack["must_read"] = must_read
    if not must_read:
        pack["risks"].append("未读到 AGENTS/README/package 等标记文件，计划可能偏泛化")
    if not check.get("looks_like_project"):
        pack["risks"].append("目录缺少常见工程标记，请确认 workspace 正确")
    pack["rev"] = f"ctx_{int(os.path.getmtime(root) if root.exists() else 0)}_{len(must_read)}"
    return pack
