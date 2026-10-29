"""工程对接档案（MES 地址 + 接口文档一体）· 解析与兼容镜像。

产品口径见 Framework/docs/功能实现/多工程MES连接-可行性方案.md。

P0 策略（不影响现网）：
- 无 mes_connections.items 时，把顶层 mes/api_docs/data_dictionary 整包升成 default 档案；
- 读写仍以顶层三键为现网 UI / 问数入口；
- load 时用 active 档案镜像到顶层；save 时把顶层写回 active 档案，其它档案文档不被盖掉。
"""
from __future__ import annotations

import os
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ProfileView = Dict[str, Any]

# 首张对接卡（id=default）展示名
DEFAULT_PROFILE_NAME = "江西中软制造执行系统"


def _norm_path(p: str) -> str:
    s = str(p or "").strip()
    if not s:
        return ""
    try:
        s = os.path.abspath(os.path.expanduser(s))
    except OSError:
        pass
    s = s.replace("\\", "/")
    if os.name == "nt":
        s = s.lower()
    while s.endswith("/") and len(s) > 1:
        s = s[:-1]
    return s


def _path_under(workspace: str, root: str) -> bool:
    w = _norm_path(workspace)
    r = _norm_path(root)
    if not w or not r:
        return False
    if w == r:
        return True
    prefix = r if r.endswith("/") else r + "/"
    return w.startswith(prefix)


def _as_dict(v: Any) -> Dict[str, Any]:
    return deepcopy(v) if isinstance(v, dict) else {}


def _items(cfg: Dict[str, Any]) -> List[Dict[str, Any]]:
    mc = cfg.get("mes_connections")
    if not isinstance(mc, dict):
        return []
    raw = mc.get("items")
    if not isinstance(raw, list):
        return []
    return [x for x in raw if isinstance(x, dict) and str(x.get("id") or "").strip()]


def _active_id(cfg: Dict[str, Any]) -> str:
    mc = cfg.get("mes_connections")
    if isinstance(mc, dict):
        aid = str(mc.get("active_profile_id") or "").strip()
        if aid:
            return aid
    return "default"


def ensure_mes_profiles(cfg: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
    """保证 mes_connections 结构；空列表则从顶层整包迁移。返回 (cfg, migrated)。"""
    if not isinstance(cfg, dict):
        return cfg, False
    migrated = False
    mc = cfg.get("mes_connections")
    if not isinstance(mc, dict):
        mc = {}
        cfg["mes_connections"] = mc
        migrated = True
    items = mc.get("items")
    if not isinstance(items, list):
        items = []
        mc["items"] = items
        migrated = True

    valid = [x for x in items if isinstance(x, dict) and str(x.get("id") or "").strip()]
    if not valid:
        roots: List[str] = []
        cd = cfg.get("code_dev") if isinstance(cfg.get("code_dev"), dict) else {}
        ws = str(cd.get("default_workspace") or "").strip()
        if ws:
            roots.append(_norm_path(ws) or ws)
        item = {
            "id": "default",
            "name": DEFAULT_PROFILE_NAME,
            "workspace_roots": roots,
            "mes": _as_dict(cfg.get("mes")),
            "api_docs": _as_dict(cfg.get("api_docs")),
            "data_dictionary": _as_dict(cfg.get("data_dictionary")),
        }
        mc["items"] = [item]
        mc["active_profile_id"] = "default"
        migrated = True
    else:
        mc["items"] = valid
        if not str(mc.get("active_profile_id") or "").strip():
            mc["active_profile_id"] = str(valid[0].get("id") or "default")
            migrated = True
        # 旧版展示名「默认对接」→ 产品名
        for it in valid:
            if str(it.get("id") or "") != "default":
                continue
            old = str(it.get("name") or "").strip()
            if old in ("", "默认对接"):
                it["name"] = DEFAULT_PROFILE_NAME
                migrated = True

    return cfg, migrated


def find_profile(cfg: Dict[str, Any], profile_id: str) -> Optional[Dict[str, Any]]:
    pid = str(profile_id or "").strip()
    for it in _items(cfg):
        if str(it.get("id") or "").strip() == pid:
            return it
    return None


def resolve_mes_profile(
    cfg: Dict[str, Any],
    *,
    workspace: Optional[str] = None,
    profile_id: Optional[str] = None,
) -> ProfileView:
    """解析一份完整档案（mes + api_docs + data_dictionary）。"""
    cfg, _ = ensure_mes_profiles(deepcopy(cfg) if cfg else {})
    items = _items(cfg)
    if not items:
        return {
            "id": "default",
            "name": DEFAULT_PROFILE_NAME,
            "workspace_roots": [],
            "mes": _as_dict(cfg.get("mes")),
            "api_docs": _as_dict(cfg.get("api_docs")),
            "data_dictionary": _as_dict(cfg.get("data_dictionary")),
        }

    if profile_id:
        hit = find_profile(cfg, profile_id)
        if hit:
            return _view(hit)

    ws = str(workspace or "").strip()
    if ws:
        for it in items:
            roots = it.get("workspace_roots") if isinstance(it.get("workspace_roots"), list) else []
            for root in roots:
                if _path_under(ws, str(root or "")):
                    return _view(it)

    aid = _active_id(cfg)
    hit = find_profile(cfg, aid)
    if hit:
        return _view(hit)
    return _view(items[0])


def _view(item: Dict[str, Any]) -> ProfileView:
    return {
        "id": str(item.get("id") or "default"),
        "name": str(item.get("name") or item.get("id") or "对接档案"),
        "workspace_roots": list(item.get("workspace_roots") or [])
        if isinstance(item.get("workspace_roots"), list)
        else [],
        "mes": _as_dict(item.get("mes")),
        "api_docs": _as_dict(item.get("api_docs")),
        "data_dictionary": _as_dict(item.get("data_dictionary")),
    }


def mirror_active_profile_to_top(cfg: Dict[str, Any]) -> None:
    """把 active（或 default）档案整包写到顶层三键，供现网读者。"""
    if not isinstance(cfg, dict):
        return
    ensure_mes_profiles(cfg)
    view = resolve_mes_profile(cfg, workspace=None)
    cfg["mes"] = deepcopy(view["mes"])
    cfg["api_docs"] = deepcopy(view["api_docs"])
    cfg["data_dictionary"] = deepcopy(view["data_dictionary"])


def sync_top_level_into_active_profile(cfg: Dict[str, Any]) -> None:
    """现网设置页只改顶层：写回 active 档案，其它档案不动。"""
    if not isinstance(cfg, dict):
        return
    ensure_mes_profiles(cfg)
    aid = _active_id(cfg)
    item = find_profile(cfg, aid)
    if item is None:
        items = _items(cfg)
        item = items[0] if items else None
    if item is None:
        return
    item["mes"] = _as_dict(cfg.get("mes"))
    item["api_docs"] = _as_dict(cfg.get("api_docs"))
    item["data_dictionary"] = _as_dict(cfg.get("data_dictionary"))


def apply_profile_to_config_root(cfg: Dict[str, Any], profile: ProfileView) -> Dict[str, Any]:
    """构造问数用的临时 root：顶层三键换成该档案（不写盘）。"""
    out = deepcopy(cfg) if isinstance(cfg, dict) else {}
    out["mes"] = deepcopy(profile.get("mes") or {})
    out["api_docs"] = deepcopy(profile.get("api_docs") or {})
    out["data_dictionary"] = deepcopy(profile.get("data_dictionary") or {})
    return out


def mask_mes_connection_secrets(cfg: Dict[str, Any], mask: str) -> None:
    """脱敏 mes_connections.items 内密钥（就地）。"""
    for it in _items(cfg):
        mes = it.get("mes")
        if isinstance(mes, dict):
            for k in ("password", "token"):
                if mes.get(k):
                    mes[k] = mask
        docs = it.get("api_docs")
        if isinstance(docs, dict) and docs.get("source_password"):
            docs["source_password"] = mask


def _is_secret_mask(value: Any, mask: str) -> bool:
    if value is None:
        return False
    s = str(value)
    if not s:
        return False
    if s == str(mask or ""):
        return True
    # 兼容历史/其它 UI 用的全 • / * 占位
    return set(s) <= {"•", "*"}


def merge_mes_connection_secrets(
    saved: Dict[str, Any],
    incoming: Dict[str, Any],
    merged: Dict[str, Any],
    mask: str,
) -> None:
    """deep_merge 之后：打码占位不覆盖各对接卡 password/token/source_password。

    仅当 incoming 显式带了 mes_connections 时处理；顶层 mes 仍由 SECRET_PATHS 管。
    """
    if not isinstance(incoming, dict) or not isinstance(merged, dict):
        return
    inv_mc = incoming.get("mes_connections")
    if not isinstance(inv_mc, dict):
        return
    saved_by_id: Dict[str, Dict[str, Any]] = {}
    for it in _items(saved if isinstance(saved, dict) else {}):
        saved_by_id[str(it.get("id") or "")] = it
    out_items = _items(merged)
    for it in out_items:
        pid = str(it.get("id") or "")
        old = saved_by_id.get(pid) or {}
        old_mes = old.get("mes") if isinstance(old.get("mes"), dict) else {}
        old_docs = old.get("api_docs") if isinstance(old.get("api_docs"), dict) else {}
        mes = it.get("mes")
        if isinstance(mes, dict):
            for k in ("password", "token"):
                if k not in mes:
                    continue
                if _is_secret_mask(mes.get(k), mask):
                    mes[k] = old_mes.get(k) or ""
        docs = it.get("api_docs")
        if isinstance(docs, dict) and "source_password" in docs:
            if _is_secret_mask(docs.get("source_password"), mask):
                docs["source_password"] = old_docs.get("source_password") or ""


def bind_config_for_workspace(cfg: Dict[str, Any], workspace: Optional[str] = None) -> Dict[str, Any]:
    """问数用：有工作区则换成命中档案的顶层三键；无则原样（已由 load 镜像 active）。"""
    if not isinstance(cfg, dict):
        return {}
    ws = str(workspace or "").strip()
    if not ws:
        return cfg
    profile = resolve_mes_profile(cfg, workspace=ws)
    return apply_profile_to_config_root(cfg, profile)


def cfg_for_ask(cfg: Dict[str, Any], workspace: Optional[str] = None) -> Dict[str, Any]:
    """问数实际使用的配置。

    有工作区：按绑定路径命中对接卡（未命中仍回落 active）。
    无工作区：沿用 active；若 active 的 base_url 为空、且只有一张卡配了地址，
    用那张已接通的卡，避免「设置里正在编辑空卡」把已接通的 MES 挡掉。
    """
    if not isinstance(cfg, dict):
        return {}
    ensure_mes_profiles(cfg)
    ws = str(workspace or "").strip()
    if ws:
        return bind_config_for_workspace(cfg, ws)
    active = resolve_mes_profile(cfg, workspace=None)
    if str((active.get("mes") or {}).get("base_url") or "").strip():
        return apply_profile_to_config_root(cfg, active)
    configured = []
    for it in _items(cfg):
        url = str(((it.get("mes") or {}) if isinstance(it.get("mes"), dict) else {}).get("base_url") or "").strip()
        if url:
            configured.append(it)
    if len(configured) == 1:
        return apply_profile_to_config_root(cfg, _view(configured[0]))
    return apply_profile_to_config_root(cfg, active)


def _new_profile_id(existing: List[Dict[str, Any]]) -> str:
    used = {str(x.get("id") or "") for x in existing}
    if "default" not in used:
        return "default"
    n = 1
    while f"p{n}" in used:
        n += 1
    return f"p{n}"


def create_mes_profile(
    cfg: Dict[str, Any],
    *,
    name: str = "",
    workspace: str = "",
    clone_from_active: bool = False,
) -> Dict[str, Any]:
    """新建空档案（或从 active 克隆含文档）。返回新建 item。"""
    ensure_mes_profiles(cfg)
    sync_top_level_into_active_profile(cfg)
    items = _items(cfg)
    pid = _new_profile_id(items)
    label = str(name or "").strip() or f"对接 {pid}"
    roots: List[str] = []
    ws = str(workspace or "").strip()
    if ws:
        roots.append(_norm_path(ws) or ws)
    if clone_from_active:
        src = resolve_mes_profile(cfg, workspace=None)
        item = {
            "id": pid,
            "name": label,
            "workspace_roots": roots or list(src.get("workspace_roots") or []),
            "mes": deepcopy(src.get("mes") or {}),
            "api_docs": deepcopy(src.get("api_docs") or {}),
            "data_dictionary": deepcopy(src.get("data_dictionary") or {}),
        }
    else:
        item = {
            "id": pid,
            "name": label,
            "workspace_roots": roots,
            "mes": {
                "base_url": "",
                "auth_type": "password",
                "username": "",
                "password": "",
                "token": "",
                "enterprise_code": "",
                "extra_headers": "{}",
                "verify_ssl": True,
                "timeout": 30,
                "allow_demo_fallback": False,
            },
            "api_docs": {
                "source_url": "",
                "source_username": "",
                "source_password": "",
                "sync_interval_sec": 24 * 3600,
                "endpoints": [],
                "raw_docs": "",
            },
            "data_dictionary": {},
        }
    items.append(item)
    cfg["mes_connections"]["items"] = items
    return item


def select_mes_profile(cfg: Dict[str, Any], profile_id: str) -> ProfileView:
    """先把当前顶层写回旧 active，再切换 active 并镜像到顶层。"""
    ensure_mes_profiles(cfg)
    sync_top_level_into_active_profile(cfg)
    pid = str(profile_id or "").strip()
    hit = find_profile(cfg, pid)
    if hit is None:
        raise KeyError(f"对接档案不存在：{pid}")
    # 绑定冲突不在此检查（创建/绑定时检查）
    cfg["mes_connections"]["active_profile_id"] = pid
    mirror_active_profile_to_top(cfg)
    return _view(hit)


def _workspace_root_too_shallow(workspace: str) -> bool:
    """拒绝盘符根 / 家目录本身等过浅绑定（否则几乎所有路径都会命中该卡）。"""
    raw = str(workspace or "").strip()
    if not raw:
        return True
    try:
        p = Path(raw).expanduser().resolve()
    except OSError:
        return True
    # Unix /
    if str(p) in {"/", "\\"}:
        return True
    # Windows 盘符根 C:\
    if os.name == "nt":
        parts = p.parts
        if len(parts) <= 1:
            return True
        # 仅「用户主目录」一层也不宜当工程根
        try:
            if p == Path.home().resolve():
                return True
        except OSError:
            pass
        return False
    try:
        if p == Path.home().resolve():
            return True
    except OSError:
        pass
    # 非 Windows：路径段过少（如 /tmp）仍允许；只拦 home 与 /
    return False


def bind_workspace_to_active(cfg: Dict[str, Any], workspace: str) -> None:
    """把工作区绑到当前 active 档案；若其它档案已占用则抛 ValueError。"""
    ensure_mes_profiles(cfg)
    sync_top_level_into_active_profile(cfg)
    # 展示用保留用户所选原文（大小写 / 分隔符）；冲突与问数命中用 _norm_path
    display = str(workspace or "").strip()
    ws = _norm_path(display) or display
    if not ws:
        raise ValueError("工作区路径为空")
    if _workspace_root_too_shallow(display):
        raise ValueError("工作区路径过浅（不能绑盘符根或用户主目录），请选具体工程目录")
    aid = _active_id(cfg)
    for it in _items(cfg):
        iid = str(it.get("id") or "")
        if iid == aid:
            continue
        roots = it.get("workspace_roots") if isinstance(it.get("workspace_roots"), list) else []
        for root in roots:
            if _path_under(ws, str(root or "")) or _norm_path(str(root or "")) == ws:
                raise ValueError(
                    f"工作区已绑定到档案「{it.get('name') or iid}」，请先在该档案解绑"
                )
    item = find_profile(cfg, aid)
    if item is None:
        raise KeyError("当前无 active 档案")
    # 一卡 ↔ 一工作区：下拉选择即覆盖，不累积多根
    item["workspace_roots"] = [display or ws]


def delete_mes_profile(cfg: Dict[str, Any], profile_id: str) -> None:
    ensure_mes_profiles(cfg)
    pid = str(profile_id or "").strip()
    items = _items(cfg)
    if not any(str(x.get("id") or "") == pid for x in items):
        raise KeyError(f"对接档案不存在：{pid}")
    if len(items) <= 1:
        raise ValueError("至少保留一张对接卡，无法删除最后一张")
    cfg["mes_connections"]["items"] = [x for x in items if str(x.get("id") or "") != pid]
    remaining = _items(cfg)
    if _active_id(cfg) == pid or not find_profile(cfg, _active_id(cfg)):
        # 删的是当前卡：优先 default，否则取剩余第一张
        nxt = "default" if find_profile(cfg, "default") else str(remaining[0].get("id") or "")
        cfg["mes_connections"]["active_profile_id"] = nxt
    mirror_active_profile_to_top(cfg)
