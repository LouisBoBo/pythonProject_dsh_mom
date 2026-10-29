"""部署策略解析：画像 / 配置 / 目录探测；识别失败标 unknown，禁止默认套 Vite+uvicorn。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# 四种可执行预设 + 识别失败
PRESET_WORKBUDDY = "workbuddy"
PRESET_VITE_BACKEND = "vite_backend"
PRESET_STATIC = "static"
PRESET_CUSTOM = "custom"
PRESET_UNKNOWN = "unknown"

_KNOWN = frozenset(
    {PRESET_WORKBUDDY, PRESET_VITE_BACKEND, PRESET_STATIC, PRESET_CUSTOM, PRESET_UNKNOWN}
)


def is_workbuddy_layout(root: Path | str | None) -> bool:
    p = Path(root or ".").expanduser()
    try:
        p = p.resolve()
    except OSError:
        return False
    return (p / "apps" / "zr-workbuddy" / "engine").is_dir()


def is_vite_backend_layout(root: Path | str | None) -> bool:
    p = Path(root or ".").expanduser()
    try:
        p = p.resolve()
    except OSError:
        return False
    return (p / "frontend" / "package.json").is_file() and (p / "backend").is_dir()


def is_static_frontend_layout(root: Path | str | None) -> bool:
    """纯前端：有 frontend/package.json（或根 package.json 含 build），无 backend/。"""
    p = Path(root or ".").expanduser()
    try:
        p = p.resolve()
    except OSError:
        return False
    if (p / "backend").is_dir():
        return False
    if is_workbuddy_layout(p):
        return False
    fe = p / "frontend" / "package.json"
    if fe.is_file():
        return _pkg_has_build(fe)
    root_pkg = p / "package.json"
    if root_pkg.is_file() and not (p / "apps" / "zr-workbuddy").is_dir():
        return _pkg_has_build(root_pkg)
    return False


def _pkg_has_build(pkg: Path) -> bool:
    try:
        scripts = (json.loads(pkg.read_text(encoding="utf-8")) or {}).get("scripts") or {}
    except Exception:
        return False
    return isinstance(scripts, dict) and "build" in scripts


def _norm_preset(raw: str) -> str:
    s = (raw or "").strip().lower().replace("-", "_")
    aliases = {
        "wb": PRESET_WORKBUDDY,
        "work_buddy": PRESET_WORKBUDDY,
        "vite": PRESET_VITE_BACKEND,
        "vite+backend": PRESET_VITE_BACKEND,
        "frontend_backend": PRESET_VITE_BACKEND,
        "spa": PRESET_STATIC,
        "static_site": PRESET_STATIC,
        "frontend_only": PRESET_STATIC,
        "next": PRESET_STATIC,
        "nuxt": PRESET_STATIC,
        "manual": PRESET_CUSTOM,
        "auto": "auto",
        "": "auto",
        # 画像里这些布局不能自动部署，须显式 custom
        "java_maven": PRESET_UNKNOWN,
        "go": PRESET_UNKNOWN,
        "dotnet": PRESET_UNKNOWN,
        "dotnet_web": PRESET_UNKNOWN,
        "python_app": PRESET_UNKNOWN,
        "docker": PRESET_UNKNOWN,
        "mixed": PRESET_UNKNOWN,
    }
    s = aliases.get(s, s)
    if s == "auto":
        return "auto"
    return s if s in _KNOWN else PRESET_UNKNOWN


def detect_layout_preset(root: Path | str | None) -> str:
    """只认目录结构，不读配置。"""
    if is_workbuddy_layout(root):
        return PRESET_WORKBUDDY
    if is_vite_backend_layout(root):
        return PRESET_VITE_BACKEND
    if is_static_frontend_layout(root):
        return PRESET_STATIC
    return PRESET_UNKNOWN


def resolve_deploy_strategy(
    workspace: str | Path | None,
    *,
    cfg: Any | None = None,
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """解析部署预设。

    优先级：config.deploy_preset（非 auto）→ 画像 deploy.preset → 目录探测。
    unknown 时 can_deploy=False，禁止假装成 vite_backend。
    """
    root = Path(workspace or ".").expanduser()
    try:
        root = root.resolve()
    except OSError:
        root = Path(".")

    cfg_preset = "auto"
    build_cmd = ""
    build_cwd = ""
    sync_paths: list[str] = []
    dist_rel = ""
    process_match = ""
    build_where = "local"
    if cfg is not None:
        cfg_preset = _norm_preset(str(getattr(cfg, "deploy_preset", "") or "auto"))
        build_cmd = str(getattr(cfg, "build_cmd", "") or "").strip()
        build_cwd = str(getattr(cfg, "build_cwd", "") or "").strip()
        raw_sync = getattr(cfg, "sync_paths", None) or []
        if isinstance(raw_sync, list):
            sync_paths = [str(x).strip().replace("\\", "/") for x in raw_sync if str(x).strip()]
        dist_rel = str(getattr(cfg, "dist_rel", "") or "").strip().replace("\\", "/")
        process_match = str(getattr(cfg, "process_match", "") or "").strip()
        bw = str(getattr(cfg, "build_where", "") or "local").strip().lower()
        build_where = "remote" if bw in {"remote", "server", "远端"} else "local"

    profile_preset = ""
    if isinstance(profile, dict):
        dep = profile.get("deploy") if isinstance(profile.get("deploy"), dict) else {}
        profile_preset = _norm_preset(str(dep.get("preset") or ""))
        if not build_cmd:
            build_cmd = str(dep.get("build_cmd") or "").strip()
        if not build_cwd:
            build_cwd = str(dep.get("build_cwd") or "").strip()

    source = "detect"
    if cfg_preset not in ("auto", PRESET_UNKNOWN) and cfg_preset in _KNOWN:
        preset = cfg_preset
        source = "config"
    elif profile_preset in _KNOWN and profile_preset != PRESET_UNKNOWN:
        preset = profile_preset
        source = "profile"
    else:
        preset = detect_layout_preset(root)
        source = "detect"

    # 显式 custom：必须有同步路径或构建命令，否则仍 unknown
    if preset == PRESET_CUSTOM:
        if not sync_paths and not build_cmd:
            return {
                "preset": PRESET_UNKNOWN,
                "source": source,
                "can_deploy": False,
                "detail": (
                    "已选自定义部署，但未配置 sync_paths / build_cmd。"
                    "请在 config.yaml · code_deploy 填写后再部署。"
                ),
                "build_cmd": "",
                "build_cwd": "",
                "sync_paths": [],
                "dist_rel": "",
                "process_match": process_match,
                "build_where": build_where,
            }
        return {
            "preset": PRESET_CUSTOM,
            "source": source,
            "can_deploy": True,
            "detail": "",
            "build_cmd": build_cmd,
            "build_cwd": build_cwd or ".",
            "sync_paths": sync_paths or (["."] if build_cmd else []),
            "dist_rel": dist_rel,
            "process_match": process_match,
            "build_where": build_where,
        }

    if preset == PRESET_WORKBUDDY:
        return {
            "preset": PRESET_WORKBUDDY,
            "source": source,
            "can_deploy": True,
            "detail": "",
            "build_cmd": "",
            "build_cwd": "",
            "sync_paths": [],
            "dist_rel": "",
            "process_match": process_match,
            "build_where": build_where,
        }

    if preset == PRESET_VITE_BACKEND:
        return {
            "preset": PRESET_VITE_BACKEND,
            "source": source,
            "can_deploy": True,
            "detail": "",
            "build_cmd": build_cmd or "npm run build",
            "build_cwd": build_cwd or "frontend",
            "sync_paths": sync_paths or ["frontend/dist", "backend"],
            "dist_rel": dist_rel or "frontend/dist",
            "process_match": process_match,
            "build_where": build_where,
        }

    if preset == PRESET_STATIC:
        # 根 package.json 或 frontend/
        if (root / "frontend" / "package.json").is_file():
            cwd = build_cwd or "frontend"
            dist = dist_rel or "frontend/dist"
        else:
            cwd = build_cwd or "."
            dist = dist_rel or "dist"
        return {
            "preset": PRESET_STATIC,
            "source": source,
            "can_deploy": True,
            "detail": "",
            "build_cmd": build_cmd or "npm run build",
            "build_cwd": cwd,
            "sync_paths": sync_paths or [dist],
            "dist_rel": dist,
            "process_match": process_match,
            "build_where": build_where,
        }

    return {
        "preset": PRESET_UNKNOWN,
        "source": source,
        "can_deploy": False,
        "detail": (
            "无法识别部署布局（不是 WorkBuddy 单元仓、也不是 frontend+backend / 纯静态）。"
            "请在 config.yaml · code_deploy 设置 deploy_preset=custom|vite_backend|static|workbuddy，"
            "并配置 sync_paths / build_cmd / remote_restart_cmd / health_url。"
            "禁止默认套 Vite + uvicorn。"
        ),
        "build_cmd": build_cmd,
        "build_cwd": build_cwd,
        "sync_paths": sync_paths,
        "dist_rel": dist_rel,
        "process_match": process_match,
        "build_where": build_where,
    }
