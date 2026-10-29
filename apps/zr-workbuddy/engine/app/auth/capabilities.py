"""人员引擎能力（按账号启停；默认全开）。

硬规则（防误伤）：
1. 未登录 / 无明确执行人 → 不拦人员能力（只认全局 plugins.json）
2. 账号无 disabled_caps 或为空 → 目录内能力全部可用
3. 未知 feature_id（不在目录）→ 不拦
4. 账号查不到 / 已停用 → 不拦人员能力（停用登录另有门禁）
5. 仅当 disabled_caps 明确包含该 feature_id 时才拦截

与 plugins.json 叠加：全局停用 → 全员不可用；全局启用后才看账号开关。

写码语义（§5 P1 · 2026-09-30）：目录 id 仍为 `code-dev`（兼容已存 disabled_caps），
但产品含义 = **Cursor 对话写码通道**（`zr_cchat_*`），含门禁修复交接与旧 begin 回退；
不是「仅停用本仓 code-dev feature」。
"""
from __future__ import annotations

from typing import Any

# 与 features/*/manifest 对齐的可授权能力（展示名给人看，id=feature_id）
CAPABILITY_CATALOG: tuple[dict[str, str], ...] = (
    {"id": "mes-ask", "label": "问数", "feature_id": "mes-ask"},
    {"id": "mes-pcb", "label": "PCB工艺", "feature_id": "mes-pcb"},
    {
        "id": "code-dev",
        "label": "写码（Cursor 对话写码）",
        "feature_id": "code-dev",
    },
    {"id": "code-review", "label": "审码", "feature_id": "code-review"},
    {"id": "code-commit", "label": "提交", "feature_id": "code-commit"},
    {"id": "code-deploy", "label": "部署", "feature_id": "code-deploy"},
    {"id": "dev-pipeline", "label": "需求到上线", "feature_id": "dev-pipeline"},
    {"id": "vision", "label": "视觉识图", "feature_id": "vision"},
    {"id": "mes-config", "label": "连接配置", "feature_id": "mes-config"},
)

# 人员「写码」开关对应的目录 id（历史名 code-dev，勿改以免弄丢已存禁用列表）
CODING_CAPABILITY_ID = "code-dev"

_CATALOG_IDS = frozenset(str(c["id"]) for c in CAPABILITY_CATALOG)
_FEATURE_TO_LABEL = {str(c["feature_id"]): str(c["label"]) for c in CAPABILITY_CATALOG}


def catalog() -> list[dict[str, str]]:
    return [dict(c) for c in CAPABILITY_CATALOG]


def normalize_disabled_caps(raw: Any) -> list[str]:
    """缺省 / 非法 → 空列表（= 默认全开）。"""
    if raw is None:
        return []
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        fid = str(item or "").strip()
        if not fid or fid not in _CATALOG_IDS or fid in seen:
            continue
        seen.add(fid)
        out.append(fid)
    out.sort()
    return out


def effective_capabilities(disabled_caps: Any) -> dict[str, bool]:
    denied = set(normalize_disabled_caps(disabled_caps))
    return {
        str(c["id"]): (str(c["id"]) not in denied) for c in CAPABILITY_CATALOG
    }


def user_allows_feature(user_row: dict[str, Any] | None, feature_id: str) -> bool:
    """无用户行、未知能力、未写入禁用列表 → 一律放行。"""
    fid = (feature_id or "").strip()
    if not fid or fid not in _CATALOG_IDS:
        return True
    if not user_row or not isinstance(user_row, dict):
        return True
    denied = set(normalize_disabled_caps(user_row.get("disabled_caps")))
    if not denied:
        return True
    return fid not in denied


def resolve_actor_user_id() -> str:
    """只认请求内 ContextVar（Bearer 中间件或 /api/cli 显式绑定）。

    故意不用 active.json 做隐式回落，避免「本机上次登录是别人」导致误拦当前操作者。
    """
    try:
        from . import current_user_id

        return (current_user_id() or "").strip()
    except Exception:  # noqa: BLE001
        return ""


def deny_if_user_blocked(feature_id: str, *, capability: str = "") -> dict[str, Any] | None:
    """当前执行人被明确关掉该能力时返回禁用响应；默认放行。"""
    fid = (feature_id or "").strip()
    if not fid or fid not in _CATALOG_IDS:
        return None
    uid = resolve_actor_user_id()
    if not uid:
        return None
    try:
        from .users import find_user_by_id, user_is_active

        row = find_user_by_id(uid)
    except Exception:  # noqa: BLE001
        return None
    # 查不到或已停用：不在此用人员能力拦（登录门禁另管），避免误伤
    if not row or not user_is_active(row):
        return None
    if user_allows_feature(row, fid):
        return None
    label = _FEATURE_TO_LABEL.get(fid) or capability or fid
    title = (capability or "").strip() or label
    # 对话卡 / 工具结果直接展示 detail（普通账号无人员页权限，勿写自助开通步骤）
    tip = (
        f"当前账号没有「{title}」能力，无法使用。\n\n"
        f"请联系管理员开通「{label}」。你本人无法自行开通。"
    )
    return {
        "ok": False,
        "detail": tip,
        "reply": f"当前账号没有「{title}」能力，请联系管理员开通（你本人无法自行开通）。",
        "source": "user_capability",
        "code": "capability_denied",
        "note": f"{fid} 未对本账号开通",
        "feature_id": fid,
        "capability_label": label,
    }


def deny_if_coding_blocked(*, capability: str = "") -> dict[str, Any] | None:
    """关掉人员「写码」= 禁止对话写码通道（含门禁修复交接 / 旧 begin）。"""
    title = (capability or "").strip() or "Cursor 对话写码"
    return deny_if_user_blocked(CODING_CAPABILITY_ID, capability=title)


def coding_allowed_status() -> dict[str, Any]:
    """供 CLI / 宿主 guard 查询：当前执行人是否可用对话写码。

    无执行人时 allowed=true（与 deny_if_user_blocked 防误伤一致）。
    """
    denied = deny_if_coding_blocked()
    if denied:
        return {
            "ok": True,
            "allowed": False,
            "detail": str(denied.get("detail") or ""),
            "reply": str(denied.get("reply") or ""),
            "source": "user_capability",
            "feature_id": CODING_CAPABILITY_ID,
        }
    return {
        "ok": True,
        "allowed": True,
        "detail": "",
        "source": "ok",
        "feature_id": CODING_CAPABILITY_ID,
    }
