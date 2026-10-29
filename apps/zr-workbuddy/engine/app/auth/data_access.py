"""数据访问：只管控物料采购单价、员工工资。

成员默认两项都不勾。管理员始终可看。path 与 fields 都空 = 尚未接入，
问数不从其它接口里猜测字段。未提及这两项的问题不进入整项门禁，
但响应里若仍带已配置敏感字段，必须再验权并摘除或硬拒绝。
"""
from __future__ import annotations

from typing import Any


ITEM_PURCHASE_PRICE = "purchase_unit_price"
ITEM_SALARY = "employee_salary"

DATA_ACCESS_ITEMS: tuple[dict[str, str], ...] = (
    {"id": ITEM_PURCHASE_PRICE, "label": "物料采购单价"},
    {"id": ITEM_SALARY, "label": "员工工资"},
)

_ITEM_IDS = tuple(str(x["id"]) for x in DATA_ACCESS_ITEMS)
_LABEL = {str(x["id"]): str(x["label"]) for x in DATA_ACCESS_ITEMS}

# 整项关闭：问句碰到这些说法就不再改去调别的接口
_SALARY_PHRASES = (
    "员工工资",
    "工资",
    "薪酬",
    "薪资",
    "薪水",
    "月薪",
    "年薪",
    "底薪",
    "基本工资",
    "应发工资",
    "实发工资",
    "应发薪",
    "实发薪",
)
# 口语试探（单独即可触发整项门禁，避免靠「员工列表」绕过）
_SALARY_SOFT = (
    "拿多少钱",
    "一个月多少",
    "一个月拿",
    "月收入",
    "到手多少",
    "发多少钱",
    "多少薪水",
    "薪资多少",
    "工资多少",
    "薪酬多少",
)
# 只问单价本身。带采购单/品名/数量时仍查采购单，只摘单价字段
_PRICE_PHRASES = ("物料采购单价", "采购单价", "物料单价", "含税单价", "未税单价")
_PRICE_LIST_PHRASES = ("采购单", "采购明细", "品名", "采购数量")
# 避免单独「什么价」误伤普通问价；须带单价字样
_PRICE_SOFT = ("单价多少", "多少单价", "什么单价")

_NOT_CONNECTED = {
    ITEM_PURCHASE_PRICE: "物料采购单价尚未接入，暂时无法查询。",
    ITEM_SALARY: "员工工资尚未接入，暂时无法查询。",
}
_DENIED = {
    ITEM_PURCHASE_PRICE: "当前账号不能查看物料采购单价，请联系管理员开通。你本人无法自行开通。",
    ITEM_SALARY: "当前账号不能查看员工工资，请联系管理员开通。你本人无法自行开通。",
}


def catalog() -> list[dict[str, str]]:
    return [dict(x) for x in DATA_ACCESS_ITEMS]


def normalize_data_access(raw: Any) -> dict[str, bool]:
    """缺省 / 非法 → 两项都是 false（成员默认不能看）。"""
    src = raw if isinstance(raw, dict) else {}
    out: dict[str, bool] = {}
    for item_id in _ITEM_IDS:
        out[item_id] = bool(src.get(item_id))
    return out


def effective_data_access(user_row: dict[str, Any] | None) -> dict[str, bool]:
    """管理员恒为 true。无用户行时两项都是 false。"""
    if not isinstance(user_row, dict):
        return normalize_data_access(None)
    if str(user_row.get("role") or "") == "admin":
        return {item_id: True for item_id in _ITEM_IDS}
    return normalize_data_access(user_row.get("data_access"))


def item_spec(cfg: dict[str, Any] | None, item_id: str) -> dict[str, Any]:
    root = cfg if isinstance(cfg, dict) else {}
    block_root = root.get("sensitive_data")
    block_root = block_root if isinstance(block_root, dict) else {}
    block = block_root.get(item_id)
    block = block if isinstance(block, dict) else {}
    path = str(block.get("path") or "").strip()
    fields: list[str] = []
    raw_fields = block.get("fields")
    if isinstance(raw_fields, str):
        raw_fields = [p.strip() for p in raw_fields.split(",")]
    if isinstance(raw_fields, list):
        seen: set[str] = set()
        for item in raw_fields:
            name = str(item or "").strip()
            key = name.lower()
            if not name or key in seen:
                continue
            seen.add(key)
            fields.append(name)
    return {
        "id": item_id,
        "label": _LABEL.get(item_id) or item_id,
        "path": path,
        "fields": fields,
        "configured": bool(path or fields),
    }


def _norm_path(path: str) -> str:
    p = str(path or "").strip().lower()
    if not p:
        return ""
    if not p.startswith("/"):
        p = "/" + p
    if len(p) > 1 and p.endswith("/"):
        p = p[:-1]
    return p


def path_item(cfg: dict[str, Any] | None, path: str) -> str:
    """该 path 若是某项的独立接口，返回项 id；否则空串。"""
    target = _norm_path(path)
    if not target:
        return ""
    for item_id in _ITEM_IDS:
        spec = item_spec(cfg, item_id)
        if spec["path"] and _norm_path(str(spec["path"])) == target:
            return item_id
    return ""


def _question_mentions_fields(question: str, fields: list[str]) -> bool:
    """问句是否点名已配置字段（英文标识，长度≥3，防误伤）。"""
    q = (question or "").lower()
    if not q:
        return False
    for name in fields:
        key = str(name or "").strip().lower()
        if len(key) < 3:
            continue
        if key in q:
            return True
    return False


def targets_salary(question: str, cfg: dict[str, Any] | None = None) -> bool:
    q = question or ""
    if any(p in q for p in _SALARY_PHRASES):
        return True
    if any(p in q for p in _SALARY_SOFT):
        return True
    ql = q.lower()
    if "salary" in ql or "payroll" in ql or "wage" in ql:
        return True
    spec = item_spec(cfg, ITEM_SALARY)
    return _question_mentions_fields(q, list(spec.get("fields") or []))


def targets_price_only(question: str, cfg: dict[str, Any] | None = None) -> bool:
    q = question or ""
    soft_hit = any(p in q for p in _PRICE_SOFT)
    hard_hit = any(p in q for p in _PRICE_PHRASES)
    if not hard_hit and not soft_hit:
        spec = item_spec(cfg, ITEM_PURCHASE_PRICE)
        if not _question_mentions_fields(q, list(spec.get("fields") or [])):
            return False
        hard_hit = True
    # 「采购单价」含有「采购单」，先摘掉单价说法再看是不是在查整张采购单
    rest = q
    for phrase in _PRICE_PHRASES + _PRICE_SOFT:
        rest = rest.replace(phrase, "")
    if any(p in rest for p in _PRICE_LIST_PHRASES):
        return False
    return True


def _actor_row() -> dict[str, Any] | None:
    try:
        from .capabilities import resolve_actor_user_id
        from .users import find_user_by_id, user_is_active

        uid = resolve_actor_user_id()
        if not uid:
            return None
        row = find_user_by_id(uid)
        if not row or not user_is_active(row):
            return None
        return row
    except Exception:  # noqa: BLE001
        return None


def actor_allows(item_id: str) -> bool:
    """无执行人、非管理员且未勾选 → 不允许。只用于这两项，不拦其它问数。"""
    if item_id not in _ITEM_IDS:
        return True
    return bool(effective_data_access(_actor_row()).get(item_id))


def _actor_audit_ids() -> dict[str, str]:
    row = _actor_row()
    if not isinstance(row, dict):
        return {"user_id": "", "username": ""}
    return {
        "user_id": str(row.get("id") or "").strip(),
        "username": str(row.get("username") or "").strip(),
    }


def _audit(event: str, *, item_id: str, path: str = "", result: str) -> None:
    try:
        from ..security_audit import append_audit

        who = _actor_audit_ids()
        append_audit(
            event,
            item=item_id,
            label=_LABEL.get(item_id) or item_id,
            path=path or "",
            result=result,
            user_id=who.get("user_id") or "",
            username=who.get("username") or "",
        )
    except Exception:  # noqa: BLE001
        return


def _reply(text: str, *, note: str) -> dict[str, Any]:
    return {
        "reply": text,
        "chart": None,
        "table": None,
        "note": note,
        "title": "",
        "data_source": "data_access",
    }


def gate_before_fetch(question: str, cfg: dict[str, Any] | None) -> dict[str, Any] | None:
    """整项问题在发请求前结束。普通产量/工单问句返回 None。"""
    q = str(question or "")
    hits: list[str] = []
    if targets_salary(q, cfg):
        hits.append(ITEM_SALARY)
    if targets_price_only(q, cfg):
        hits.append(ITEM_PURCHASE_PRICE)
    if not hits:
        return None
    messages: list[str] = []
    for item_id in hits:
        spec = item_spec(cfg, item_id)
        if not spec["configured"]:
            messages.append(_NOT_CONNECTED[item_id])
            _audit("data_access_unconfigured", item_id=item_id, result="unconfigured")
            continue
        if not actor_allows(item_id):
            messages.append(_DENIED[item_id])
            _audit(
                "data_access_denied",
                item_id=item_id,
                path=str(spec["path"] or ""),
                result="denied",
            )
            continue
        # 该项已授权：继续检查同句其它敏感项，全部通过才放行
    if not messages:
        return None
    return _reply("\n".join(messages), note="data_access")


def block_sensitive_path(path: str, cfg: dict[str, Any] | None) -> dict[str, Any] | None:
    """独立接口：没勾则不发 HTTP。已勾返回 None，由调用方照常请求。"""
    item_id = path_item(cfg, path)
    if not item_id:
        return None
    if actor_allows(item_id):
        return None
    _audit("data_access_denied", item_id=item_id, path=path, result="denied")
    return _reply(_DENIED[item_id], note="data_access")


def hidden_field_names(cfg: dict[str, Any] | None) -> dict[str, list[str]]:
    """当前执行人不能看的字段名，按项分组。未配置或已勾的项不在内。"""
    out: dict[str, list[str]] = {}
    for item_id in _ITEM_IDS:
        if actor_allows(item_id):
            continue
        spec = item_spec(cfg, item_id)
        if spec["fields"]:
            out[item_id] = list(spec["fields"])
    return out


def strip_named_fields(data: Any, names: list[str]) -> tuple[Any, bool]:
    """从返回体去掉指定字段。不改入参。没有任何命中时原样返回。"""
    wanted = {str(n).strip().lower() for n in names if str(n).strip()}
    if not wanted:
        return data, False
    removed = False

    def walk(node: Any) -> Any:
        nonlocal removed
        if isinstance(node, dict):
            out: dict[str, Any] = {}
            for key, value in node.items():
                if str(key).strip().lower() in wanted:
                    removed = True
                    continue
                out[key] = walk(value)
            return out
        if isinstance(node, list):
            return [walk(item) for item in node]
        return node

    return walk(data), removed


def payload_has_fields(data: Any, names: list[str], *, max_nodes: int = 4000) -> bool:
    """载荷（含嵌套）是否出现指定字段名。有上限，防超大 JSON 拖死。"""
    wanted = {str(n).strip().lower() for n in names if str(n).strip()}
    if not wanted or data is None:
        return False
    seen = 0
    stack: list[Any] = [data]
    while stack:
        node = stack.pop()
        seen += 1
        if seen > max_nodes:
            break
        if isinstance(node, dict):
            for key, value in node.items():
                if str(key).strip().lower() in wanted:
                    return True
                if isinstance(value, (dict, list)):
                    stack.append(value)
        elif isinstance(node, list):
            for item in node:
                if isinstance(item, (dict, list)):
                    stack.append(item)
    return False


def strip_hidden_fields(data: Any, cfg: dict[str, Any] | None, *, path: str = "") -> tuple[Any, list[str]]:
    """摘掉当前人不能看的单价/工资字段，并记审计。没有可摘字段时不改数据。"""
    grouped = hidden_field_names(cfg)
    if not grouped:
        return data, []
    names: list[str] = []
    for fields in grouped.values():
        names.extend(fields)
    stripped, removed = strip_named_fields(data, names)
    if not removed:
        return data, []
    hit = [item_id for item_id, fields in grouped.items() if fields]
    for item_id in hit:
        _audit("data_access_stripped", item_id=item_id, path=path, result="stripped")
    return stripped, hit


def note_hidden_items(reply: str, item_ids: list[str]) -> str:
    labels = [_LABEL[i] for i in item_ids if i in _LABEL]
    if not labels:
        return reply
    line = "已按权限隐藏" + "、".join(labels) + "。"
    text = str(reply or "").strip()
    if line in text:
        return text
    return (text + "\n\n" + line).strip()


def audit_allowed(item_id: str, path: str) -> None:
    if item_id not in _ITEM_IDS:
        return
    if not actor_allows(item_id):
        return
    _audit("data_access_allowed", item_id=item_id, path=path, result="allowed")


def enforce_after_fetch(
    question: str,
    data: Any,
    cfg: dict[str, Any] | None,
    *,
    path: str = "",
) -> tuple[Any, dict[str, Any] | None, list[str]]:
    """取数后的第二道门：按字段再验权。

    返回 (data, deny_or_None, hidden_item_ids)。

    - 未授权字段一律摘除（不依赖问句关键词）
    - 问句明确指向工资/单价且未授权 → 硬拒绝（不给「已隐藏」的半答案）
    - 问句未指向但摘了字段 → 保留其它列，由调用方附加隐藏说明
    - 已授权且原载荷含敏感字段 / 命中独立 path → 记放行（含 user_id）
    """
    q = str(question or "")
    original = data

    # 整项意图未授权：硬拒绝（与 gate 双保险；含口语/字段名）
    hard: list[str] = []
    if targets_salary(q, cfg) and item_spec(cfg, ITEM_SALARY)["configured"] and not actor_allows(
        ITEM_SALARY
    ):
        hard.append(ITEM_SALARY)
    if targets_price_only(q, cfg) and item_spec(cfg, ITEM_PURCHASE_PRICE)["configured"] and not actor_allows(
        ITEM_PURCHASE_PRICE
    ):
        hard.append(ITEM_PURCHASE_PRICE)
    if hard:
        for item_id in hard:
            spec = item_spec(cfg, item_id)
            _audit(
                "data_access_denied",
                item_id=item_id,
                path=path or str(spec.get("path") or ""),
                result="denied",
            )
        return original, _reply("\n".join(_DENIED[i] for i in hard), note="data_access"), []

    stripped, hidden = strip_hidden_fields(original, cfg, path=path)

    # 放行审计：独立 path 或嵌套字段实际出现在原载荷中
    for item_id in _ITEM_IDS:
        if not actor_allows(item_id):
            continue
        if not item_spec(cfg, item_id)["configured"]:
            continue
        spec = item_spec(cfg, item_id)
        path_hit = bool(spec["path"]) and _norm_path(str(spec["path"])) == _norm_path(path)
        field_hit = bool(spec["fields"]) and payload_has_fields(original, list(spec["fields"]))
        if path_hit or field_hit:
            audit_allowed(item_id, path)

    return stripped, None, hidden
