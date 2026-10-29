"""共享知识库召回权限：只管控公司中央库文档，本机知识库不在此列。

默认全员可召回（与共享库「公司唯一版本」一致）。
管理员可对成员改为「仅勾选文档可召回」；未勾选的文档 cite / 工具召回均不返回。
管理员账号始终可召回全部。
"""
from __future__ import annotations

from typing import Any

_MAX_ENTRY_IDS = 200


def _parse_allow_all_flag(value: Any) -> bool | None:
    """解析 allow_all：True / False / None（缺省或无法识别）。

    字符串 false/0 必须当 False，禁止静默当成缺省全开。
    """
    if value is True or value == 1:
        return True
    if value is False or value == 0:
        return False
    if isinstance(value, str):
        s = value.strip().lower()
        if s in {"true", "1", "yes", "on"}:
            return True
        if s in {"false", "0", "no", "off"}:
            return False
    return None


def _normalize_entry_ids(raw_ids: Any) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for item in raw_ids or []:
        eid = str(item or "").strip()
        if not eid or eid in seen:
            continue
        if len(eid) > 128:
            continue
        seen.add(eid)
        ids.append(eid)
        if len(ids) >= _MAX_ENTRY_IDS:
            break
    return ids


def normalize_company_knowledge_access(raw: Any) -> dict[str, Any]:
    """缺省（无字段）→ allow_all=True；显式白名单 / 假值不得抬成全开。"""
    if not isinstance(raw, dict):
        return {"allow_all": True, "entry_ids": []}
    ids = _normalize_entry_ids(raw.get("entry_ids"))
    flag = _parse_allow_all_flag(raw["allow_all"]) if "allow_all" in raw else None
    if flag is False:
        return {"allow_all": False, "entry_ids": ids}
    if flag is True:
        return {"allow_all": True, "entry_ids": []}
    # 未写 allow_all 但写了 entry_ids（含空列表）→ 按白名单，避免手改 users.json 误全开
    if "entry_ids" in raw:
        return {"allow_all": False, "entry_ids": ids}
    return {"allow_all": True, "entry_ids": []}


def effective_company_knowledge_access(user_row: dict[str, Any] | None) -> dict[str, Any]:
    # 无账号：一律视为不可召回（防御层；cite 入口也会拒未登录）
    if not user_row:
        return {"allow_all": False, "entry_ids": []}
    if str(user_row.get("role") or "") == "admin":
        return {"allow_all": True, "entry_ids": []}
    return normalize_company_knowledge_access(user_row.get("company_knowledge_access"))


def can_recall_entry(user_row: dict[str, Any] | None, entry_id: str) -> bool:
    eid = str(entry_id or "").strip()
    if not eid or not user_row:
        return False
    access = effective_company_knowledge_access(user_row)
    if access.get("allow_all"):
        return True
    return eid in set(access.get("entry_ids") or [])


def filter_hits_for_user(
    hits: list[dict[str, Any]] | None,
    user_row: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """按账号过滤公司库命中；无权限篇不进召回。无 user_row → 空。"""
    rows = [h for h in (hits or []) if isinstance(h, dict)]
    if not rows or not user_row:
        return []
    access = effective_company_knowledge_access(user_row)
    if access.get("allow_all"):
        return rows
    allowed = set(access.get("entry_ids") or [])
    return [h for h in rows if str(h.get("id") or "").strip() in allowed]


def access_from_entry_ids(entry_ids: list[str] | None, *, allow_all: bool | None = None) -> dict[str, Any]:
    """人员页保存：勾全量 → allow_all；否则写 allowlist。

    - allow_all=True：全开（忽略 entry_ids）
    - allow_all=False：白名单（可为空=一篇都不能召回）
    - allow_all=None 且传入 entry_ids 列表：按白名单（避免只传空列表被误当成全开）
    - 两者皆未传：保持默认全开
    """
    if allow_all is True:
        return {"allow_all": True, "entry_ids": []}
    ids = _normalize_entry_ids(entry_ids) if entry_ids is not None else []
    if allow_all is False or entry_ids is not None:
        return {"allow_all": False, "entry_ids": ids}
    return {"allow_all": True, "entry_ids": []}
