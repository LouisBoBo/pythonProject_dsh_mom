"""部署单元：把路径映射为可独立同步的插件/层。"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .deploy_strategy import (
    PRESET_CUSTOM,
    PRESET_STATIC,
    PRESET_UNKNOWN,
    PRESET_VITE_BACKEND,
    PRESET_WORKBUDDY,
    is_vite_backend_layout,
    is_workbuddy_layout,
    resolve_deploy_strategy,
)

# apps/zr-workbuddy/features/<id>/...
_FEATURE_RE = re.compile(
    r"^apps/zr-workbuddy/features/([a-z][a-z0-9_-]*)(?:/|$)"
)

__all__ = [
    "DeployUnit",
    "build_unit",
    "filter_units_by_ids",
    "is_vite_backend_layout",
    "is_workbuddy_layout",
    "list_catalog_units",
    "map_paths_to_units",
    "path_to_unit_id",
    "resolve_deploy_strategy",
]


@dataclass(frozen=True)
class DeployUnit:
    id: str
    kind: str  # feature | engine | bridge | skills | scripts | workspace
    label: str
    local_rels: tuple[str, ...]  # 相对仓库根，rsync 源
    action: str  # sync_feature | sync_engine_restart | sync_bridge | sync_bridge_reinstall | sync_only | sync_build_restart
    risk: str  # low | medium | high
    selected: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "label": self.label,
            "local_rels": list(self.local_rels),
            "action": self.action,
            "risk": self.risk,
            "selected": self.selected,
            "action_hint": _action_hint(self.action),
        }


def _action_hint(action: str) -> str:
    return {
        "sync_feature": "仅同步插件目录，热加载，不重启",
        "sync_engine_restart": "同步引擎代码后重启本应用引擎（不影响其它服务）",
        "sync_bridge": "仅同步 bridge 文件（一体部署关且未开 auto_restart_bridge 时）",
        "sync_bridge_reinstall": "同步 bridge；一体部署收尾会确保远端聊天壳",
        "sync_only": "仅同步文件",
        "sync_build_restart": "构建前端 dist、同步 backend，并重启远端 API",
        "sync_static": "本机构建静态产物并同步 dist（不假设后端 uvicorn）",
        "sync_custom": "按配置的 build_cmd / sync_paths / 重启命令执行",
    }.get(action, action)


def _norm(rel: str) -> str:
    r = (rel or "").replace("\\", "/").strip()
    while r.startswith("./"):
        r = r[2:]
    return r.lstrip("/")


def path_to_unit_id(rel: str) -> str | None:
    """单文件相对路径 → 单元 id；docs 等返回 None（默认不部署）。"""
    r = _norm(rel)
    if not r:
        return None
    m = _FEATURE_RE.match(r)
    if m:
        return f"feature:{m.group(1)}"
    if r.startswith("apps/zr-workbuddy/plugins/mes-bridge/") or r.startswith(
        "apps/zr-workbuddy/plugins/mes-runtime/"
    ):
        return "bridge"
    if (
        r.startswith("apps/zr-workbuddy/engine/app/")
        or r == "apps/zr-workbuddy/engine/engine_cli.py"
        or r == "apps/zr-workbuddy/engine/requirements.txt"
        or r.startswith("apps/zr-workbuddy/engine/tests/")
        or r.startswith("apps/zr-workbuddy/engine/config/")
    ):
        # 运行时密钥与数据不进部署单元（亦不应因此强制全量）
        if r.endswith("/config.yaml") or r == "apps/zr-workbuddy/engine/config/config.yaml":
            return None
        if "engine/data/" in r or r.startswith("apps/zr-workbuddy/engine/data/"):
            return None
        return "engine"
    if r.startswith("apps/zr-workbuddy/engine/app/static/"):
        return "engine"
    if r.startswith(".dsh/skills/"):
        return "skills"
    if r.startswith("scripts/"):
        return "scripts"
    return None


def build_unit(unit_id: str, *, selected: bool = True) -> DeployUnit | None:
    uid = (unit_id or "").strip()
    if uid.startswith("feature:"):
        fid = uid.split(":", 1)[1].strip()
        if not re.match(r"^[a-z][a-z0-9_-]*$", fid):
            return None
        return DeployUnit(
            id=uid,
            kind="feature",
            label=f"插件 {fid}",
            local_rels=(f"apps/zr-workbuddy/features/{fid}",),
            action="sync_feature",
            risk="low",
            selected=selected,
        )
    if uid == "engine":
        return DeployUnit(
            id="engine",
            kind="engine",
            label="引擎（Python / SPA）",
            local_rels=(
                "apps/zr-workbuddy/engine/app",
                "apps/zr-workbuddy/engine/engine_cli.py",
                "apps/zr-workbuddy/engine/requirements.txt",
                # 示例/公开配置；真实 config.yaml 由 rsync_excludes 排除
                "apps/zr-workbuddy/engine/config",
            ),
            action="sync_engine_restart",
            risk="medium",
            selected=selected,
        )
    if uid == "bridge":
        return DeployUnit(
            id="bridge",
            kind="bridge",
            label="mes-bridge + mes-runtime",
            local_rels=(
                "apps/zr-workbuddy/plugins/mes-bridge",
                "apps/zr-workbuddy/plugins/mes-runtime",
            ),
            # 默认仅同步；auto_restart_bridge=true 时才随 bridge 重启远端宿主
            action="sync_bridge",
            risk="medium",
            selected=selected,
        )
    if uid == "skills":
        return DeployUnit(
            id="skills",
            kind="skills",
            label="Agent Skills",
            local_rels=(".dsh/skills",),
            action="sync_only",
            risk="low",
            selected=selected,
        )
    if uid == "scripts":
        return DeployUnit(
            id="scripts",
            kind="scripts",
            label="运维脚本 scripts/",
            local_rels=("scripts",),
            action="sync_only",
            risk="low",
            selected=selected,
        )
    if uid == "workspace":
        return DeployUnit(
            id="workspace",
            kind="workspace",
            label="当前项目（按部署策略同步）",
            local_rels=(".",),
            action="sync_build_restart",
            risk="medium",
            selected=selected,
        )
    if uid == "workspace:static":
        return DeployUnit(
            id="workspace:static",
            kind="workspace",
            label="纯静态产物（构建 dist 后同步）",
            local_rels=(".",),
            action="sync_static",
            risk="medium",
            selected=selected,
        )
    if uid == "workspace:custom":
        return DeployUnit(
            id="workspace:custom",
            kind="workspace",
            label="自定义部署（按配置构建/同步/重启）",
            local_rels=(".",),
            action="sync_custom",
            risk="medium",
            selected=selected,
        )
    return None


def map_paths_to_units(
    paths: list[str], workspace: Path | str | None = None
) -> list[DeployUnit]:
    """变更路径 → 去重后的部署单元（默认全选）。"""
    strategy = resolve_deploy_strategy(workspace) if workspace else {
        "preset": PRESET_WORKBUDDY,
        "can_deploy": True,
    }
    preset = str(strategy.get("preset") or PRESET_WORKBUDDY)
    if preset == PRESET_UNKNOWN or not strategy.get("can_deploy"):
        return []
    if preset == PRESET_WORKBUDDY:
        generic = False
        workspace_uid = ""
    elif preset == PRESET_VITE_BACKEND:
        generic = True
        workspace_uid = "workspace"
    elif preset == PRESET_STATIC:
        generic = True
        workspace_uid = "workspace:static"
    elif preset == PRESET_CUSTOM:
        generic = True
        workspace_uid = "workspace:custom"
    else:
        return []

    order: list[str] = []
    seen: set[str] = set()
    for p in paths:
        if generic:
            r = _norm(p)
            uid = workspace_uid if r and r != ".git" and not r.startswith(".git/") else None
        else:
            uid = path_to_unit_id(p)
        if not uid or uid in seen:
            continue
        seen.add(uid)
        order.append(uid)
    # 执行顺序：feature → workspace → skills/scripts → engine → bridge
    rank = {
        "feature": 0,
        "workspace": 0,
        "skills": 1,
        "scripts": 2,
        "engine": 3,
        "bridge": 4,
    }

    def sort_key(uid: str) -> tuple[int, str]:
        u = build_unit(uid)
        kind = u.kind if u else "z"
        return (rank.get(kind, 9), uid)

    order.sort(key=sort_key)
    out: list[DeployUnit] = []
    for uid in order:
        u = build_unit(uid, selected=True)
        if u:
            out.append(u)
    return out


def filter_units_by_ids(units: list[DeployUnit], selected_ids: list[str] | None) -> list[DeployUnit]:
    """按人勾选过滤；None/空 = 保持 prepare 时 selected 标记。"""
    if selected_ids is None:
        return [u for u in units if u.selected]
    want = {str(x).strip() for x in selected_ids if str(x).strip()}
    if not want:
        return []
    out: list[DeployUnit] = []
    for u in units:
        if u.id in want:
            out.append(
                DeployUnit(
                    id=u.id,
                    kind=u.kind,
                    label=u.label,
                    local_rels=u.local_rels,
                    action=u.action,
                    risk=u.risk,
                    selected=True,
                )
            )
    return out


def list_catalog_units(
    workspace: Path | str | None = None,
    *,
    cfg: Any | None = None,
    profile: dict[str, Any] | None = None,
) -> list[DeployUnit]:
    """按部署策略列单元；识别失败返回空列表（prepare 须拒绝部署）。"""
    root = Path(workspace or ".").expanduser()
    try:
        root = root.resolve()
    except OSError:
        root = Path(".")

    strategy = resolve_deploy_strategy(root, cfg=cfg, profile=profile)
    preset = str(strategy.get("preset") or PRESET_UNKNOWN)
    if preset == PRESET_UNKNOWN or not strategy.get("can_deploy"):
        return []

    if preset == PRESET_VITE_BACKEND:
        built = build_unit("workspace", selected=True)
        return [built] if built else []
    if preset == PRESET_STATIC:
        built = build_unit("workspace:static", selected=True)
        return [built] if built else []
    if preset == PRESET_CUSTOM:
        built = build_unit("workspace:custom", selected=True)
        return [built] if built else []

    # workbuddy
    ids: list[str] = []
    feat_root = root / "apps" / "zr-workbuddy" / "features"
    if feat_root.is_dir():
        for d in sorted(feat_root.iterdir()):
            if not d.is_dir() or d.name.startswith("."):
                continue
            if not re.match(r"^[a-z][a-z0-9_-]*$", d.name):
                continue
            if (d / "index.js").is_file() or (d / "manifest.json").is_file():
                ids.append(f"feature:{d.name}")

    for uid in ("skills", "scripts", "engine", "bridge"):
        u = build_unit(uid)
        if not u:
            continue
        if any((root / rel).exists() for rel in u.local_rels):
            ids.append(uid)

    out: list[DeployUnit] = []
    seen: set[str] = set()
    rank = {"feature": 0, "workspace": 0, "skills": 1, "scripts": 2, "engine": 3, "bridge": 4}

    def sort_key(uid: str) -> tuple[int, str]:
        bu = build_unit(uid)
        kind = bu.kind if bu else "z"
        return (rank.get(kind, 9), uid)

    for uid in sorted(ids, key=sort_key):
        if uid in seen:
            continue
        seen.add(uid)
        built = build_unit(uid, selected=True)
        if built:
            out.append(built)
    return out
