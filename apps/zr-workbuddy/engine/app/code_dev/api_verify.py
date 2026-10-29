"""新增/改后端接口后验尸：router 必须挂进 FastAPI。

历史事故：只同步 ``backend/app/api/xxx.py`` 与页面，未改 ``main.py`` /
``api/__init__.py`` 的 include_router。页面能打开，axios 却弹出 FastAPI
原文 ``Not Found``（接口 404）。禁止这种假成功。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from .path_scope import normalize_rel

_SKIP_MODULE = {
    "__init__",
    "deps",
    "errors",
    "auth",
    "common",
    "utils",
    "router",
    "base",
}

_MOUNT_RELS = (
    "backend/app/main.py",
    "backend/main.py",
    "backend/app/api/__init__.py",
    "backend/app/api/router.py",
    "backend/app/router.py",
    "backend/app/api.py",
)


def _synced_rels(synced_files: list[str] | None) -> list[str]:
    out: list[str] = []
    for raw in synced_files or []:
        s = str(raw or "").strip().replace("\\", "/")
        if not s or s.startswith("删除 "):
            continue
        rel = normalize_rel(s)
        if rel:
            out.append(rel)
    return out


def _looks_like_router_file(path: Path) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return "APIRouter" in text or "APIRoute" in text


def _new_router_modules(target: Path, synced: list[str]) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for rel in synced:
        if not rel.endswith(".py"):
            continue
        if not (
            rel.startswith("backend/app/api/")
            or rel.startswith("backend/app/routers/")
        ):
            continue
        name = rel.rsplit("/", 1)[-1][:-3]
        if not name or name in _SKIP_MODULE or name.startswith("_"):
            continue
        path = target / rel
        if not path.is_file() or not _looks_like_router_file(path):
            continue
        found.append((rel, name))
    return found


def _mount_corpus(target: Path) -> str:
    chunks: list[str] = []
    for rel in _MOUNT_RELS:
        path = target / rel
        if not path.is_file():
            continue
        try:
            chunks.append(path.read_text(encoding="utf-8", errors="ignore"))
        except OSError:
            continue
    return "\n".join(chunks)


def _module_mounted(corpus: str, name: str) -> bool:
    if not corpus or not name:
        return False
    if name in corpus:
        return True
    dashed = name.replace("_", "-")
    if dashed != name and dashed in corpus:
        return True
    return False


def verify_api_mounted_on_target(
    target_root: Path | str,
    requirement: str,
    *,
    synced_files: list[str] | None = None,
) -> dict[str, Any]:
    """同步后的本机工程：新 APIRouter 模块必须出现在挂载文件里。"""
    from .brief import is_delete_intent

    if is_delete_intent(requirement):
        return {"ok": True, "detail": ""}
    target = Path(target_root).resolve()
    synced = _synced_rels(synced_files)
    modules = _new_router_modules(target, synced)
    if not modules:
        return {"ok": True, "detail": ""}
    corpus = _mount_corpus(target)
    missing = [rel for rel, name in modules if not _module_mounted(corpus, name)]
    if not missing:
        return {"ok": True, "detail": "本机接口挂载验尸通过"}
    sample = "、".join(missing[:6])
    return {
        "ok": False,
        "detail": (
            f"{sample} 已同步但未挂进 FastAPI（main.py / api/__init__.py 无 include_router）。"
            "页面会弹出英文 Not Found（接口 404），禁止报成功。"
            "请把新 router 注册进挂载文件后重试，并重启本机后端。"
        ),
    }
