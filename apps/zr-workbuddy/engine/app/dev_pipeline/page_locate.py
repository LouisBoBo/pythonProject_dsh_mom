"""在当前工作区按页面标题检索候选文件（只读），替代写死制造业路径表。"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

_SKIP_DIRS = frozenset(
    {
        "node_modules",
        ".git",
        ".svn",
        "dist",
        "build",
        "bin",
        "obj",
        ".venv",
        "venv",
        "__pycache__",
        "target",
        "coverage",
        ".idea",
        ".vscode",
        "vendor",
        ".cursor",
    }
)
_CODE_SUFFIX = frozenset(
    {".vue", ".tsx", ".jsx", ".ts", ".js", ".cshtml", ".razor", ".cs", ".py"}
)


def _norm_title(s: str) -> str:
    return re.sub(r"\s+", "", str(s or "").strip())


def _profile_roots(profile: dict[str, Any] | None) -> list[str]:
    if not isinstance(profile, dict):
        return []
    layout = profile.get("layout") if isinstance(profile.get("layout"), dict) else {}
    ui = profile.get("ui") if isinstance(profile.get("ui"), dict) else {}
    out: list[str] = []
    for key in ("view_dirs", "frontend_root", "api_dirs"):
        raw = layout.get(key)
        if isinstance(raw, list):
            out.extend(str(x).strip().replace("\\", "/") for x in raw if str(x).strip())
        elif isinstance(raw, str) and raw.strip():
            out.append(raw.strip().replace("\\", "/"))
    for p in ui.get("sample_pages") or []:
        s = str(p or "").strip().replace("\\", "/")
        if s:
            out.append(str(Path(s).parent).replace("\\", "/"))
    # 去重保序
    seen: set[str] = set()
    uniq: list[str] = []
    for p in out:
        if p and p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq[:12]


def locate_page_files(
    page_title: str,
    *,
    workspace: str = "",
    profile: dict[str, Any] | None = None,
    limit: int = 6,
) -> list[str]:
    """按标题在工作区找相对路径；找不到返回 []（由上层请用户确认）。"""
    title = _norm_title(page_title)
    if len(title) < 2:
        return []
    root_s = str(workspace or "").strip()
    if not root_s and isinstance(profile, dict):
        root_s = str(profile.get("workspace") or "").strip()
    if not root_s:
        return []
    root = Path(root_s)
    if not root.is_dir():
        return []

    scored: list[tuple[int, str]] = []
    prefer_dirs = _profile_roots(profile)
    max_files = 800
    scanned = 0

    def _score_file(rel: str, text_head: str) -> int:
        sc = 0
        base = Path(rel).stem.lower()
        name = Path(rel).name.lower()
        t_l = title.lower()
        if title in text_head:
            sc += 20
        if t_l and t_l in text_head.lower():
            sc += 12
        # 文件名拼音/英文弱匹配：标题汉字不进文件名时仍靠正文
        for pref in prefer_dirs:
            if rel.startswith(pref.rstrip("/") + "/") or rel.startswith(pref):
                sc += 3
        if any(k in name for k in ("view", "page", "report", "list", "index")):
            sc += 1
        if base and len(base) >= 4 and base in text_head.lower():
            sc += 1
        return sc

    search_roots: list[Path] = []
    for pref in prefer_dirs:
        p = root / pref
        if p.is_dir():
            search_roots.append(p)
    if not search_roots:
        search_roots = [root]

    for base in search_roots:
        try:
            for path in base.rglob("*"):
                if scanned >= max_files:
                    break
                if not path.is_file():
                    continue
                if path.suffix.lower() not in _CODE_SUFFIX:
                    continue
                if any(part in _SKIP_DIRS for part in path.parts):
                    continue
                scanned += 1
                try:
                    rel = path.relative_to(root).as_posix()
                except ValueError:
                    continue
                try:
                    head = path.read_text(encoding="utf-8", errors="ignore")[:8000]
                except OSError:
                    continue
                sc = _score_file(rel, head)
                if sc >= 12:  # 至少正文命中标题
                    scored.append((sc, rel))
        except OSError:
            continue

    scored.sort(key=lambda x: (-x[0], x[1]))
    out: list[str] = []
    seen: set[str] = set()
    for _sc, rel in scored:
        if rel in seen:
            continue
        seen.add(rel)
        out.append(rel)
        if len(out) >= max(1, limit):
            break
    return out
