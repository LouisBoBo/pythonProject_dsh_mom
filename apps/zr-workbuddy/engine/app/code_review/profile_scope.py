# -*- coding: utf-8 -*-
"""审码范围：跳过目录与附加审查条款跟项目画像走。"""
from __future__ import annotations

import re
from typing import Any

from .config import SKIP_DIR_NAMES

# 仅允许简单目录名（防路径注入）
_DIR_NAME_OK = re.compile(r"^[A-Za-z0-9_.+\-]{1,64}$")

# 语言 / 布局 → 额外跳过的构建产物目录（叠在基线 SKIP_DIR_NAMES 上）
_LANG_EXTRA_SKIP: dict[str, tuple[str, ...]] = {
    "java": ("target", "out"),
    "kotlin": ("target", "out", "build"),
    "c#": ("bin", "obj"),
    "csharp": ("bin", "obj"),
    "f#": ("bin", "obj"),
    "go": ("vendor",),
    "rust": ("target",),
    "swift": ("Pods", "DerivedData", "build"),
    "objective-c": ("Pods", "DerivedData", "build"),
    "dart": (".dart_tool", "build"),
    "flutter": (".dart_tool", "build"),
    "scala": ("target", "out", "project/target"),
}

_LAYOUT_EXTRA_SKIP: dict[str, tuple[str, ...]] = {
    "java_maven": ("target",),
    "dotnet": ("bin", "obj"),
    "dotnet_web": ("bin", "obj"),
    "go": ("vendor",),
}


def _clean_dir_name(raw: str) -> str:
    s = str(raw or "").strip().replace("\\", "/").strip("/")
    if not s or "/" in s or s in {".", ".."}:
        return ""
    if s.startswith(".") and s not in {".dart_tool", ".gradle", ".idea", ".vscode", ".next", ".tox", ".venv"}:
        # 允许常见点目录；其它点目录仍可由基线覆盖
        if not _DIR_NAME_OK.match(s):
            return ""
    elif not _DIR_NAME_OK.match(s):
        return ""
    # 拒绝路径逃逸残留
    if ".." in s:
        return ""
    return s


def skip_dirs_for_languages(languages: list[str] | None, layout_kind: str = "") -> list[str]:
    """按语言与布局推断额外跳过目录。"""
    out: list[str] = []
    seen: set[str] = set()

    def add(name: str) -> None:
        n = _clean_dir_name(name)
        if not n:
            return
        key = n.lower()
        if key in seen:
            return
        seen.add(key)
        out.append(n)

    for lang in languages or []:
        key = str(lang or "").strip().lower()
        for d in _LANG_EXTRA_SKIP.get(key, ()):
            add(d)
    lk = str(layout_kind or "").strip().lower()
    for d in _LAYOUT_EXTRA_SKIP.get(lk, ()):
        add(d)
    return out


def resolve_skip_dir_names(profile: dict[str, Any] | None = None) -> frozenset[str]:
    """合并基线跳过目录 + 画像 review.skip_dirs + 语言推断。"""
    names: set[str] = set(SKIP_DIR_NAMES)
    if not isinstance(profile, dict):
        return frozenset(names)

    review = profile.get("review") if isinstance(profile.get("review"), dict) else {}
    explicit = review.get("skip_dirs") if isinstance(review, dict) else None
    if isinstance(explicit, list):
        for x in explicit:
            n = _clean_dir_name(str(x))
            if n:
                names.add(n)

    languages = [str(x) for x in (profile.get("languages") or []) if str(x).strip()]
    layout = profile.get("layout") if isinstance(profile.get("layout"), dict) else {}
    layout_kind = ""
    if isinstance(layout, dict):
        layout_kind = str(layout.get("kind") or layout.get("preset") or "").strip()
    # 画像顶层也可能有 layout 字符串（旧缓存）
    if not layout_kind and isinstance(profile.get("layout"), str):
        layout_kind = str(profile.get("layout") or "")
    # scan 把 layout 细节放在 layout 字典，preset 在 deploy.preset
    if not layout_kind:
        dep = profile.get("deploy") if isinstance(profile.get("deploy"), dict) else {}
        layout_kind = str((dep or {}).get("preset") or "").strip()

    for d in skip_dirs_for_languages(languages, layout_kind):
        names.add(d)
    return frozenset(names)


def build_project_review_addon(profile: dict[str, Any] | None) -> str:
    """项目规范附加审查条款（叠在通用安全清单之上，不替代）。"""
    if not isinstance(profile, dict) or not profile:
        return ""
    summary = str(profile.get("summary_zh") or "").strip()
    conv = profile.get("conventions") if isinstance(profile.get("conventions"), dict) else {}
    readme = str((conv or {}).get("readme_excerpt") or "").strip()
    agents = str((conv or {}).get("agents_excerpt") or "").strip()
    layout = profile.get("layout") if isinstance(profile.get("layout"), dict) else {}
    view_dirs = [str(x) for x in ((layout or {}).get("view_dirs") or []) if str(x).strip()]
    api_dirs = [str(x) for x in ((layout or {}).get("api_dirs") or []) if str(x).strip()]
    languages = [str(x) for x in (profile.get("languages") or []) if str(x).strip()]
    directory = ""
    try:
        from ..project_profile import format_directory_block

        directory = format_directory_block(profile).strip()
    except Exception:  # noqa: BLE001
        directory = ""

    if not any([summary, readme, agents, view_dirs, api_dirs, languages, directory]):
        return ""

    lines = [
        "【本工程附加审查条款】（来自项目画像；**不替代**通用安全/正确性清单，只补充命名、分层与仓库约定）",
        "风格/命名类问题仍标 low；真实安全与正确性硬伤仍须 critical/high。",
    ]
    if summary:
        lines.append("工程摘要：" + summary[:400])
    if languages:
        lines.append("主语言：" + "、".join(languages[:8]))
    if view_dirs:
        lines.append("页面/视图目录习惯：" + "、".join(view_dirs[:6]) + "（新逻辑应落在相近分层）")
    if api_dirs:
        lines.append("接口/控制器目录习惯：" + "、".join(api_dirs[:6]))
    if agents:
        lines.append("仓库 AGENTS/规范摘录：\n" + agents[:700])
    if readme:
        lines.append("README 约定摘录：\n" + readme[:700])
    lines.append("审查时对照以上约定指出偏离；勿把其它仓库（如某一家 MES）的目录习惯套到本工程。")
    text = "\n".join(lines)
    if len(text) > 2400:
        text = text[:2400]
    if directory and "【工作区目录画像】" not in text:
        text = text + "\n\n" + directory
    return text


def load_profile_for_review(workspace: str | Any) -> dict[str, Any] | None:
    """只读缓存画像；缺失不强制扫描（避免审码路径变慢或失败）。"""
    from pathlib import Path

    ws = str(workspace or "").strip()
    if not ws:
        return None
    try:
        from ..project_profile import load_cached

        return load_cached(str(Path(ws).expanduser().resolve()))
    except Exception:  # noqa: BLE001
        return None
