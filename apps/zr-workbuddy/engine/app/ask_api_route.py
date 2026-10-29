"""问数：按已导入 api_docs 匹配只读接口（通用、谨慎）。

硬约束：
- 默认只调 GET，且 path 不含 {path_param}（避免瞎填 id）
- 排除登录/鉴权/写操作语义
- 高分才自动调用；不够分则交给调用方回退 MES 或诚实说明
- 不执行任意 POST/PUT/DELETE
"""
from __future__ import annotations

import re
import time
from datetime import date, datetime
from typing import Any

# 问数路由短时记忆：同引擎进程内记住最近成功命中的接口，供追问/改写消歧
_ROUTE_MEMORY: list[dict[str, Any]] = []
_ROUTE_MEMORY_TTL_SEC = 1800
_ROUTE_MEMORY_MAX = 12

# 意图 metric → 表名提示 + 额外关键词（增强匹配，不绑死某一家 ERP）
_METRIC_HINTS: dict[str, tuple[str, tuple[str, ...]]] = {
    "work_orders_total": ("work_orders", ("工单", "work-order", "work_order", "生产工单")),
    "in_progress_orders": (
        "work_orders",
        ("在制", "在制品", "生产中", "wip", "work-order", "工单"),
    ),
    "completed_orders": ("work_orders", ("完工", "已完成", "completed", "工单")),
    "output": ("work_orders", ("产量", "日产", "产出", "daily-output", "output")),
    "planned": ("work_orders", ("计划产量", "计划数", "planned", "daily-output")),
    "achievement": ("work_orders", ("达成", "达成率", "achievement", "daily-output")),
    "yield": ("quality_records", ("良率", "品质", "quality", "kpi")),
    "defect_rate": ("quality_records", ("不良", "缺陷率", "quality", "defect")),
    "defect_share": ("quality_records", ("缺陷", "defect", "分布")),
    "oee": ("equipment_events", ("oee", "设备综合", "综合效率")),
    "downtime": ("equipment_events", ("停机", "告警", "alarm", "downtime")),
    "utilization": ("equipment_events", ("利用率", "utilization")),
}

_WRITE_TOKENS = (
    "create",
    "update",
    "delete",
    "remove",
    "post",
    "put",
    "patch",
    "login",
    "logout",
    "register",
    "upload",
    "新建",
    "删除",
    "更新",
    "修改",
    "变更",
    "登录",
    "注册",
    "上传",
    "下发",
    "保存",
)

_AUTH_PATH_BITS = (
    "/auth/login",
    "/auth/logout",
    "/auth/register",
    "/auth/refresh",
    "/token",
)

# 分数阈值：宁可不调，也不要乱调
SCORE_AUTO = 10.0
SCORE_WEAK = 6.0
SCORE_MARGIN = 2.0

_TOKEN_RE = re.compile(r"[a-zA-Z0-9_\-]+|[\u4e00-\u9fff]{2,}")
_PATH_PARAM_RE = re.compile(r"\{[^}]+\}|<[^>]+>")


def _norm(s: str) -> str:
    return str(s or "").strip().lower()


def _tokens(text: str) -> set[str]:
    raw = _norm(text)
    if not raw:
        return set()
    out: set[str] = set()
    for m in _TOKEN_RE.finditer(raw):
        t = m.group(0)
        if len(t) >= 2:
            out.add(t)
    # 连续中文再切 2-gram，提高「在制品工单」命中
    hans = re.findall(r"[\u4e00-\u9fff]+", raw)
    for h in hans:
        if len(h) >= 2:
            out.add(h)
        for i in range(max(0, len(h) - 1)):
            out.add(h[i : i + 2])
    return out


# 过泛的键：多表共用语义不同（如 name=计划名 vs 设备名），宁可不改表头
_GENERIC_FIELD_KEYS = frozenset(
    {"name", "status", "type", "code", "title", "value", "id", "data", "items", "list"}
)
_HAN_RE = re.compile(r"[\u4e00-\u9fff]")


def _is_zh_header_label(text: str) -> bool:
    """可用作表头的中文短标签；枚举说明（含 /）一律不用。"""
    s = str(text or "").strip()
    if not s or len(s) > 24:
        return False
    if "/" in s or "\\" in s:
        return False
    if not _HAN_RE.search(s):
        return False
    if "pending" in s.lower() or "http" in s.lower():
        return False
    return True


def list_queryable_endpoints(cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    """可参与问数的只读接口。"""
    root = cfg if isinstance(cfg, dict) else {}
    docs = root.get("api_docs") if isinstance(root.get("api_docs"), dict) else {}
    raw = docs.get("endpoints") if isinstance(docs.get("endpoints"), list) else []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for ep in raw:
        if not isinstance(ep, dict):
            continue
        method = _norm(ep.get("method") or "get") or "get"
        if method != "get":
            continue
        path = str(ep.get("path") or "").strip()
        if not path.startswith("/"):
            continue
        if _PATH_PARAM_RE.search(path):
            continue
        path_l = path.lower()
        if any(b in path_l for b in _AUTH_PATH_BITS):
            continue
        blob = " ".join(
            [
                str(ep.get("name") or ""),
                str(ep.get("desc") or ""),
                path,
                str(ep.get("table") or ""),
            ]
        ).lower()
        if any(w in blob for w in _WRITE_TOKENS):
            # path 自身是 list/get 报表时，name 里偶发带 update 的假阳性：仅当 path 也像写操作才丢
            if any(w in path_l for w in ("/delete", "/update", "/create", "/login")):
                continue
            if re.search(r"(^|_)(create|update|delete|remove)(_|$)", _norm(ep.get("name") or "")):
                continue
        key = f"get {path_l}"
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "name": str(ep.get("name") or "").strip(),
                "method": "GET",
                "path": path,
                "table": str(ep.get("table") or "").strip(),
                "desc": str(ep.get("desc") or "").strip(),
            }
        )
    return out


def _metric_boost(ep: dict[str, Any], intent: dict[str, Any] | None) -> float:
    intent = intent if isinstance(intent, dict) else {}
    metric = str(intent.get("metric") or "").strip()
    if not metric or metric not in _METRIC_HINTS:
        return 0.0
    table_hint, kws = _METRIC_HINTS[metric]
    score = 0.0
    table = _norm(ep.get("table"))
    path = _norm(ep.get("path"))
    desc = _norm(ep.get("desc"))
    name = _norm(ep.get("name"))
    if table_hint and table == table_hint:
        score += 4.0
    for kw in kws:
        k = kw.lower()
        if k in path:
            score += 3.0
        if k in desc or k in name:
            score += 2.0
        if k in table:
            score += 1.5
    # 列表/汇总优先于 options
    if "option" in path or "options" in path or "选项" in desc:
        score -= 4.0
    if any(x in path for x in ("/list", "report", "kpi", "trend", "orders", "dashboard")):
        score += 1.0
    return score


def _dict_group_zh_labels(cfg: dict[str, Any] | None, table: str) -> list[str]:
    """某标准表分组下可用作匹配弱信号的中文标签（表头规则同展示）。"""
    dd = (cfg or {}).get("data_dictionary")
    if not isinstance(dd, dict):
        return []
    rows = dd.get(table)
    if not isinstance(rows, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            continue
        mes = str(row.get("mes_field") or "").strip()
        desc = str(row.get("desc") or "").strip()
        label = ""
        if _is_zh_header_label(desc):
            label = desc
        elif _is_zh_header_label(mes):
            label = mes
        if not label or label in seen:
            continue
        seen.add(label)
        out.append(label)
    return out


def clear_route_memory() -> None:
    """单测用：清空路由记忆。"""
    _ROUTE_MEMORY.clear()


def remember_ask_route(
    question: str,
    endpoint: dict[str, Any] | None,
    intent: dict[str, Any] | None = None,
) -> None:
    """成功调通导入接口后写入短时记忆，供后续改写/追问加分。"""
    if not endpoint or not isinstance(endpoint, dict):
        return
    path = str(endpoint.get("path") or "").strip()
    if not path:
        return
    tokens = _tokens(_ask_blob(question, intent))
    if not tokens:
        return
    now = time.time()
    entry = {
        "path": path,
        "table": str(endpoint.get("table") or "").strip(),
        "desc": str(endpoint.get("desc") or endpoint.get("name") or ""),
        "tokens": tokens,
        "ts": now,
    }
    # 同 path 更新到队首
    kept = [m for m in _ROUTE_MEMORY if str(m.get("path") or "") != path]
    kept.insert(0, entry)
    del _ROUTE_MEMORY[:]
    _ROUTE_MEMORY.extend(kept[:_ROUTE_MEMORY_MAX])


def _prune_route_memory(now: float | None = None) -> list[dict[str, Any]]:
    t = time.time() if now is None else now
    alive = [
        m
        for m in _ROUTE_MEMORY
        if isinstance(m, dict) and (t - float(m.get("ts") or 0)) <= _ROUTE_MEMORY_TTL_SEC
    ]
    if len(alive) != len(_ROUTE_MEMORY):
        del _ROUTE_MEMORY[:]
        _ROUTE_MEMORY.extend(alive)
    return alive


def _path_core_work_orders(path: str) -> bool:
    p = _norm(path).rstrip("/")
    return p.endswith("/work-orders") or p.endswith("work-orders")


def _path_employee_roster(path: str) -> bool:
    """员工名单接口（不含工时报表）。"""
    p = _norm(path).rstrip("/")
    if "employee-work-hours" in p or "work-hours" in p:
        return False
    return p.endswith("/employees") or p.endswith("/employee") or "/employees/" in (p + "/")


def _wants_employee_roster(question: str, intent: dict[str, Any] | None = None) -> bool:
    """问员工/人员名单，而不是工时、工资或工单。"""
    q = _question_blob(question, intent)
    if not q:
        return False
    if any(k in q for k in ("工时", "工资", "薪酬", "薪资", "考勤", "加班", "工单", "保养")):
        return False
    return any(
        k in q
        for k in (
            "员工列表",
            "员工名单",
            "人员列表",
            "人员名单",
            "花名册",
            "员工",
            "人员",
            "employees",
        )
    )


def _wants_employee_hours(question: str, intent: dict[str, Any] | None = None) -> bool:
    q = _question_blob(question, intent)
    if not q:
        return False
    if not any(k in q for k in ("员工", "人员", "employee")):
        return False
    return any(k in q for k in ("工时", "加班", "考勤", "出勤"))


def _wants_employee_salary(question: str, intent: dict[str, Any] | None = None) -> bool:
    """问员工工资/薪酬（敏感项；路由到员工名单接口上的嵌套字段，不猜工时）。"""
    q = _question_blob(question, intent)
    if not q:
        return False
    try:
        from .auth.data_access import targets_salary

        return bool(targets_salary(q))
    except Exception:  # noqa: BLE001
        return any(k in q for k in ("工资", "薪酬", "薪资", "月薪"))


def _path_material_purchase(path: str) -> bool:
    p = _norm(path).rstrip("/")
    return "material-purchase" in p or p.endswith("/material-purchases")


def _wants_purchase_unit_price(question: str, intent: dict[str, Any] | None = None) -> bool:
    """问物料采购单价（敏感项；路由到物料采购列表上的嵌套字段）。"""
    q = _question_blob(question, intent)
    if not q:
        return False
    try:
        from .auth.data_access import targets_price_only

        if targets_price_only(q):
            return True
    except Exception:  # noqa: BLE001
        pass
    return any(k in q for k in ("采购单价", "物料单价", "物料采购单价", "purchase_price"))


def _wants_material_purchase_list(question: str, intent: dict[str, Any] | None = None) -> bool:
    """问物料采购清单/供应商主数据（可含单价列，由数据权限决定是否展示）。"""
    q = _question_blob(question, intent)
    if not q:
        return False
    if _wants_purchase_unit_price(question, intent):
        return True
    return any(
        k in q
        for k in (
            "物料采购",
            "采购列表",
            "采购物料",
            "物料供应商",
            "material-purchase",
            "material_purchase",
        )
    )


def _relevance_adjust(
    question: str,
    ep: dict[str, Any],
    intent: dict[str, Any] | None = None,
) -> float:
    """按问句领域微调：避免「完工工单」误打到保养工单等（不写死某一家 ERP path）。"""
    q = _question_blob(question, intent)
    if not q:
        return 0.0
    ql = q.lower()
    path = _norm(ep.get("path"))
    desc = str(ep.get("desc") or "")
    adj = 0.0
    wants_prod_wo = any(k in q for k in ("完工", "在制", "再制", "生产工单", "完工工单", "在制品", "再制品"))
    wants_maint = ("保养" in q) or ("maintenance" in ql)
    path_maint = ("maintenance" in path) or ("保养" in desc)
    path_core_wo = _path_core_work_orders(path)
    wants_emp = _wants_employee_roster(question, intent)
    wants_emp_hours = _wants_employee_hours(question, intent)
    wants_emp_salary = _wants_employee_salary(question, intent)
    wants_price = _wants_purchase_unit_price(question, intent)
    wants_mat_po = _wants_material_purchase_list(question, intent)
    path_emp = _path_employee_roster(path)
    path_emp_hours = "employee-work-hours" in path
    path_mat_po = _path_material_purchase(path)
    # 员工名单：短问法词面分不够；且「列表」易误打保养/设备台账等同分候选
    if wants_emp:
        if path_emp:
            adj += 12.0
        elif path_emp_hours:
            adj -= 6.0
        elif path_maint or "equipment" in path or "/devices" in path or "repair" in path:
            adj -= 14.0
        elif path_core_wo or "work-order" in path or "/production" in path or "kanban" in path:
            adj -= 12.0
        else:
            # 其它「xxx列表」弱命中：压分，避免并列 7 分误调
            if "列表" in desc or path.rstrip("/").endswith("s"):
                adj -= 4.0
    # 工资嵌在员工列表字段时：抬员工名单，压工时报表
    if wants_emp_salary:
        if path_emp:
            adj += 10.0
        elif path_emp_hours:
            adj -= 10.0
        elif path_core_wo or "work-order" in path:
            adj -= 10.0
    # 采购单价嵌在物料采购列表：抬 material-purchases，压库存/领料
    if wants_price or wants_mat_po:
        if path_mat_po:
            adj += 10.0
        elif "inventory-stock" in path or "material-inbound" in path or "material-outbound" in path:
            adj -= 8.0
        elif path_core_wo:
            adj -= 8.0
    if wants_emp_hours:
        if path_emp_hours and "filter" not in path:
            adj += 8.0
        elif path_emp:
            adj -= 2.0
        elif path_core_wo:
            adj -= 8.0
    if wants_prod_wo and path_maint and not wants_maint:
        adj -= 10.0
    if any(k in q for k in ("工单", "完工", "在制", "再制")) and not wants_maint and not wants_emp:
        if path_core_wo:
            adj += 6.0
        if "material-outbound" in path or "work-order-alerts" in path:
            adj -= 5.0
        if "employee-work-hours" in path or "/messages" in path:
            adj -= 6.0
        if "sales-order" in path:
            adj -= 4.0
    if wants_maint and path_maint:
        adj += 6.0
    return adj


def _context_memory_adjust(
    question: str,
    ep: dict[str, Any],
    intent: dict[str, Any] | None = None,
) -> float:
    """用对话 context + 近期成功路由消歧：同一业务追问时粘住上次接口。"""
    path = _norm(ep.get("path"))
    if not path:
        return 0.0
    # 换话题到员工名单/工资时，禁止「查一下工单」的记忆/上文把工单粘回来
    if _wants_employee_roster(question, intent) and not _path_employee_roster(path):
        return 0.0
    if _wants_employee_salary(question, intent) and not _path_employee_roster(path):
        return 0.0
    if (
        _wants_purchase_unit_price(question, intent)
        or _wants_material_purchase_list(question, intent)
    ) and not _path_material_purchase(path):
        return 0.0
    if _wants_employee_hours(question, intent) and "employee-work-hours" not in path:
        return 0.0
    blob_tokens = _tokens(_ask_blob(question, intent))
    if not blob_tokens:
        return 0.0
    adj = 0.0
    table = str(ep.get("table") or "").strip()
    for m in _prune_route_memory():
        mpath = _norm(m.get("path"))
        mtok = m.get("tokens") if isinstance(m.get("tokens"), set) else _tokens(str(m.get("q") or ""))
        if not mpath or not mtok:
            continue
        overlap = len(blob_tokens & mtok)
        if overlap < 2:
            continue
        if path == mpath:
            adj += 5.0 + min(3.0, overlap * 0.4)
        elif table and table == str(m.get("table") or "").strip() and table != "other":
            adj += 2.0
    # 显式 context 里点名过的 path 片段（否定词附近的「保养」不加分）
    it = intent if isinstance(intent, dict) else {}
    ctx = str(it.get("context") or "")
    if ctx:
        ctx_l = ctx.lower()
        segs = [s for s in path.split("/") if len(s) >= 4]
        if any(s in ctx_l for s in segs):
            adj += 3.0
        neg_maint = any(k in ctx for k in ("不是保养", "非保养", "不要保养", "不是设备保养"))
        if (
            not neg_maint
            and ("保养" in ctx or "maintenance" in ctx_l)
            and ("maintenance" in path or "保养" in str(ep.get("desc") or ""))
        ):
            adj += 2.0
        if any(k in ctx for k in ("生产工单", "在制品", "完工工单", "再制品", "/api/work-orders", "work-orders")) and (
            _path_core_work_orders(path)
        ):
            adj += 3.0
    return adj


def score_endpoint(
    question: str,
    ep: dict[str, Any],
    intent: dict[str, Any] | None = None,
    cfg: dict[str, Any] | None = None,
) -> float:
    q_tokens = _tokens(_ask_blob(question, intent))

    table = str(ep.get("table") or "").strip()
    dict_bits = ""
    if cfg and table and table != "other":
        dict_bits = " ".join(_dict_group_zh_labels(cfg, table))

    blob = " ".join(
        [
            str(ep.get("name") or ""),
            str(ep.get("desc") or ""),
            str(ep.get("path") or ""),
            table,
            dict_bits,
        ]
    )
    e_tokens = _tokens(blob)
    path = _norm(ep.get("path"))
    for seg in path.split("/"):
        if len(seg) >= 2:
            e_tokens.add(seg)

    overlap = q_tokens & e_tokens
    score = float(len(overlap)) * 2.0
    desc = _norm(ep.get("desc"))
    for t in q_tokens:
        if len(t) >= 2 and t in desc:
            score += 1.5
        if len(t) >= 2 and t in path:
            score += 2.0
    score += _metric_boost(ep, intent)
    score += _relevance_adjust(question, ep, intent)
    score += _context_memory_adjust(question, ep, intent)
    return score


def rank_endpoints(
    question: str,
    cfg: dict[str, Any] | None,
    intent: dict[str, Any] | None = None,
    *,
    limit: int = 5,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ep in list_queryable_endpoints(cfg):
        sc = score_endpoint(question, ep, intent, cfg=cfg)
        if sc <= 0:
            continue
        rows.append({**ep, "score": round(sc, 2)})
    rows.sort(key=lambda r: (-float(r.get("score") or 0), str(r.get("path") or "")))
    return rows[: max(1, limit)]


def pick_endpoint(
    question: str,
    cfg: dict[str, Any] | None,
    intent: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """高分且明显领先时才自动选定（按用户意图对导入接口打分，不靠手工绑定）。"""
    ranked = rank_endpoints(question, cfg, intent, limit=5)
    if not ranked:
        return None
    best = ranked[0]
    score = float(best.get("score") or 0)
    second = float(ranked[1].get("score") or 0) if len(ranked) > 1 else 0.0
    best_path = str(best.get("path") or "")
    # 问员工名单：必须落到员工接口；清单未导入 /api/employees 时宁可不调，
    # 禁止弱分并列误选保养工单/设备列表（现象：问啥都返回 MO-保养工单）。
    if _wants_employee_roster(question, intent) and not _path_employee_roster(best_path):
        return None
    if score >= SCORE_AUTO:
        return best
    if score >= SCORE_WEAK and (score - second) >= SCORE_MARGIN:
        return best
    return None


def looks_like_imported_query(
    question: str,
    cfg: dict[str, Any] | None,
    *,
    intent: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """规则未命中硬指标时：若问题与已导入 GET 词面达到弱门槛，返回最佳候选。

    供上层改走查数意图、少依赖 LLM 把业务问法判成闲聊。
    仍须后续 pick_endpoint / try_ask 过自动调用门槛才会真调接口。
    """
    q = str(question or "").strip()
    if not q or not list_queryable_endpoints(cfg):
        return None
    ranked = rank_endpoints(q, cfg, intent, limit=2)
    if not ranked:
        return None
    best = ranked[0]
    score = float(best.get("score") or 0)
    second = float(ranked[1].get("score") or 0) if len(ranked) > 1 else 0.0
    if score < SCORE_WEAK:
        return None
    if score >= SCORE_AUTO or (score - second) >= SCORE_MARGIN:
        return best
    return None


def _wants_count_answer(question: str, intent: dict[str, Any] | None) -> bool:
    """用户在问数量时，列表结果优先点明条数。"""
    it = intent if isinstance(intent, dict) else {}
    if str(it.get("type") or "") == "single":
        return True
    q = str(question or "")
    return any(k in q for k in ("多少", "几个", "多少个", "有多少", "数量", "总数", "几条", "几项"))


def _parse_enum_pairs(desc: str) -> list[tuple[str, str, tuple[str, ...]]]:
    """从数据字典 desc 解析枚举：(码, 主展示名, 别名…)。

    支持：
    - pending / in_progress
    - pending=待开工 / in_progress=生产中
    - in_progress=生产中|在制|在制品|再制品
    - in_progress=生产中（在制/再制）
    - pending:待开工 / pending（待开工）
    """
    raw = str(desc or "").strip()
    if not raw or ("/" not in raw and "=" not in raw and ":" not in raw and "（" not in raw and "|" not in raw):
        return []
    parts = re.split(r"\s*/\s*", raw)
    out: list[tuple[str, str, tuple[str, ...]]] = []
    for part in parts:
        p = part.strip()
        if not p:
            continue
        code, label = p, p
        m = re.match(r"^([^\s=:（(|]+)[=:]\s*(.+)$", p)
        if m:
            code, label = m.group(1).strip(), m.group(2).strip()
        else:
            m2 = re.match(r"^([^\s（(]+)[（(]([^）)]+)[）)]$", p)
            if m2:
                code, label = m2.group(1).strip(), m2.group(2).strip()
        if not code:
            continue
        # 主展示取 |、 前第一段，其余当别名
        display = label
        aliases: list[str] = []
        m3 = re.match(r"^(.+?)[（(]([^）)]+)[）)]\s*$", label)
        if m3:
            display = m3.group(1).strip() or label
            for a in re.split(r"[|、/]", m3.group(2)):
                a = a.strip()
                if a:
                    aliases.append(a)
        for a in re.split(r"[|、]", label):
            a = a.strip()
            if a:
                aliases.append(a)
        if "|" in display or "、" in display:
            segs = [s.strip() for s in re.split(r"[|、]", display) if s.strip()]
            if segs:
                display = segs[0]
                aliases.extend(segs)
        if display and display not in aliases:
            aliases.insert(0, display)
        seen: set[str] = set()
        uniq: list[str] = []
        for a in aliases:
            if a not in seen:
                seen.add(a)
                uniq.append(a)
        out.append((code, display or code, tuple(uniq)))
    return out


def _dict_enum_fields(
    cfg: dict[str, Any] | None,
    *,
    table: str | None = None,
) -> dict[str, list[tuple[str, str, tuple[str, ...]]]]:
    """字段 → [(码, 展示, 别名)]，来自 data_dictionary；优先指定 table。"""
    dd = (cfg or {}).get("data_dictionary")
    if not isinstance(dd, dict) or not dd:
        return {}
    groups: list[Any] = []
    t = str(table or "").strip()
    if t and t != "other" and isinstance(dd.get(t), list):
        groups = [dd.get(t)]
    else:
        groups = [rows for rows in dd.values() if isinstance(rows, list)]
    out: dict[str, list[tuple[str, str, tuple[str, ...]]]] = {}
    for rows in groups:
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            pairs = _parse_enum_pairs(str(row.get("desc") or ""))
            if not pairs:
                continue
            for key in (row.get("mes_field"), row.get("std_field")):
                k = str(key or "").strip().lower()
                if not k or _HAN_RE.search(k):
                    continue
                cur = {c.lower(): (c, lab, als) for c, lab, als in out.get(k, [])}
                for c, lab, als in pairs:
                    cur.setdefault(c.lower(), (c, lab, als))
                out[k] = list(cur.values())
    return out


def _ask_blob(question: str, intent: dict[str, Any] | None) -> str:
    it = intent if isinstance(intent, dict) else {}
    return " ".join(
        [
            str(question or ""),
            str(it.get("raw") or ""),
            str(it.get("metric_name") or ""),
            str(it.get("context") or ""),
        ]
    ).strip()


def _question_blob(question: str, intent: dict[str, Any] | None) -> str:
    """仅问句本身（不含 context），用于领域正负向判断，避免「不是保养」误触发。"""
    it = intent if isinstance(intent, dict) else {}
    return " ".join(
        [
            str(question or ""),
            str(it.get("raw") or ""),
            str(it.get("metric_name") or ""),
        ]
    ).strip()


def _resolve_enum_query_value(
    question: str,
    intent: dict[str, Any] | None,
    enums: list[tuple[str, str, tuple[str, ...]]],
) -> tuple[str, str, tuple[str, ...]] | None:
    """问句命中字典枚举的码/展示/别名时，返回 (码, 展示, 别名)；无把握则 None。"""
    if not enums:
        return None
    blob = _ask_blob(question, intent)
    if not blob:
        return None
    blob_l = blob.lower()
    hits: list[tuple[int, str, str, tuple[str, ...]]] = []
    for code, label, aliases in enums:
        c = str(code).strip()
        lab = str(label).strip()
        if not c:
            continue
        scored = 0
        if c.lower() in blob_l:
            scored = max(scored, len(c))
        for a in aliases or (lab,):
            a = str(a).strip()
            if not a:
                continue
            if a.lower() == c.lower():
                continue
            if a in blob or a.lower() in blob_l:
                scored = max(scored, len(a))
        if scored:
            hits.append((scored, c, lab or c, tuple(aliases or (lab or c,))))
    if not hits:
        return None
    hits.sort(key=lambda x: (-x[0], x[1]))
    best_n = hits[0][0]
    best_codes = {c for n, c, _l, _a in hits if n == best_n}
    if len(best_codes) != 1:
        return None
    _n, code, lab, als = hits[0]
    return code, lab, als


def _status_enums(
    cfg: dict[str, Any] | None,
    *,
    table: str | None = None,
) -> list[tuple[str, str, tuple[str, ...]]]:
    enums = _dict_enum_fields(cfg, table=table)
    return list(enums.get("status") or enums.get("order_status") or enums.get("state") or [])


def _row_status_raw(row: dict[str, Any]) -> str:
    flat = _flatten_row_shallow(row) if isinstance(row, dict) else {}
    for key in ("status", "order_status", "wo_status", "state"):
        if key in flat and flat.get(key) not in (None, ""):
            return str(flat.get(key)).strip()
    return ""


def _filter_rows_by_status_enum(
    rows: list[dict[str, Any]],
    *,
    code: str,
    label: str,
    aliases: tuple[str, ...],
    strict: bool = True,
) -> list[dict[str, Any]]:
    """按字典解析出的状态码/展示/别名过滤；接口未按参过滤时兜底。

    strict=True（默认）：问句已点名状态时，0 条也算答案，禁止回退成全量。
    """
    if not rows or not code:
        return rows
    accept = {str(code).strip().lower(), str(label).strip().lower()}
    for a in aliases:
        if a:
            accept.add(str(a).strip().lower())
    accept.discard("")
    kept = [r for r in rows if _row_status_raw(r).lower() in accept]
    if strict:
        return kept
    return kept if kept else rows


def _as_date(v: Any) -> date | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v).strip()
    if not s:
        return None
    s = s.replace("/", "-")
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if m:
        try:
            return date.fromisoformat(m.group(1))
        except Exception:
            return None
    m2 = re.match(r"^(\d{8})", s)
    if m2:
        try:
            return datetime.strptime(m2.group(1), "%Y%m%d").date()
        except Exception:
            return None
    return None


def _dict_time_field_keys(
    cfg: dict[str, Any] | None,
    *,
    table: str | None,
    prefer_completed: bool,
) -> list[str]:
    """从字典挑时间字段键；完工问法优先带「完成/完工/实际」的字段，否则 end 优先于 start。"""
    dd = (cfg or {}).get("data_dictionary")
    if not isinstance(dd, dict):
        return []
    t = str(table or "").strip()
    groups: list[list] = []
    if t and t in dd and isinstance(dd.get(t), list):
        groups.append(dd[t])  # type: ignore[arg-type]
    else:
        for rows in dd.values():
            if isinstance(rows, list):
                groups.append(rows)
    scored: list[tuple[int, str]] = []
    seen: set[str] = set()
    for rows in groups:
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            typ = str(row.get("type") or "")
            desc = str(row.get("desc") or "")
            mes = str(row.get("mes_field") or "").strip()
            std = str(row.get("std_field") or "").strip()
            is_time = ("时间" in typ) or ("日期" in typ) or any(
                k in (mes + std).lower() for k in ("date", "time", "_at")
            )
            if not is_time:
                continue
            blob = mes + std + desc
            sc = 1
            if prefer_completed and any(
                k in blob for k in ("完成", "完工", "实际结束", "实际完成", "finish", "complet")
            ):
                sc += 10
            if any(k in (mes + std).lower() for k in ("end", "finish", "complet", "close")):
                sc += 4
            if any(k in (mes + std).lower() for k in ("start", "begin", "plan")):
                sc += 1
            for key in (mes, std):
                k = str(key or "").strip()
                if not k or _HAN_RE.search(k) or k.lower() in seen:
                    continue
                seen.add(k.lower())
                scored.append((sc, k))
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [k for _s, k in scored]


def _filter_rows_by_date_range(
    rows: list[dict[str, Any]],
    *,
    date_from: Any,
    date_to: Any,
    cfg: dict[str, Any] | None,
    table: str | None,
    prefer_completed: bool,
) -> tuple[list[dict[str, Any]], str | None]:
    """按字典时间字段做区间过滤；行上完全没有可解析日期时不硬清空（只记 note）。"""
    df = _as_date(date_from)
    dt = _as_date(date_to)
    if not rows or (df is None and dt is None):
        return rows, None
    keys = _dict_time_field_keys(cfg, table=table, prefer_completed=prefer_completed)
    # 行里出现的常见日期键补尾
    sample = rows[0] if isinstance(rows[0], dict) else {}
    flat0 = _flatten_row_shallow(sample) if isinstance(sample, dict) else {}
    for k in flat0:
        kl = str(k).lower()
        if any(x in kl for x in ("date", "_at", "time")) and kl not in {x.lower() for x in keys}:
            keys.append(str(k))
    if not keys:
        return rows, "未在数据字典找到时间字段，未按日期过滤"

    def _row_in_range(row: dict[str, Any]) -> bool | None:
        flat = _flatten_row_shallow(row)
        parsed_any = False
        for key in keys:
            d = _as_date(flat.get(key))
            if d is None:
                continue
            parsed_any = True
            if df is not None and d < df:
                continue
            if dt is not None and d > dt:
                continue
            return True
        if not parsed_any:
            return None
        return False

    kept: list[dict[str, Any]] = []
    unknown = 0
    for r in rows:
        if not isinstance(r, dict):
            continue
        hit = _row_in_range(r)
        if hit is True:
            kept.append(r)
        elif hit is None:
            unknown += 1
    if not kept and unknown == len([r for r in rows if isinstance(r, dict)]):
        return rows, "返回行无可用日期值，仅按状态过滤"
    return kept, None


def _apply_enum_cell(field: str, value: Any, enum_maps: dict[str, dict[str, str]]) -> str:
    """单元格：字典枚举有中文展示则替换，否则原值。"""
    raw = _cell(value)
    if raw == "—":
        return raw
    m = enum_maps.get(str(field).lower())
    if not m:
        return raw
    mapped = m.get(raw.lower()) or m.get(str(value).strip().lower())
    return mapped if mapped else raw


def build_query_params(
    intent: dict[str, Any] | None,
    path: str,
    *,
    question: str = "",
    cfg: dict[str, Any] | None = None,
    table: str | None = None,
) -> dict[str, Any]:
    """只塞常见、低风险查询参数；状态码来自数据字典枚举与问句/别名命中。"""
    intent = intent if isinstance(intent, dict) else {}
    params: dict[str, Any] = {"page": 1, "page_size": 50}
    q_blob = _ask_blob(question, intent)
    # 工资问句即使用了「本月」也不向员工名单塞入职日区间（无独立薪资账期参数时）
    roster_no_time = _path_employee_roster(path) and (
        _wants_employee_salary(question, intent)
        or not any(
            k in q_blob for k in ("入职", "今天", "今日", "昨天", "本周", "本月", "最近", "号", "日")
        )
    )
    df = intent.get("date_from")
    dt = intent.get("date_to")
    if not roster_no_time:
        if df is not None and hasattr(df, "isoformat"):
            params["date_from"] = df.isoformat()
        elif isinstance(df, str) and df.strip():
            params["date_from"] = df.strip()[:32]
        if dt is not None and hasattr(dt, "isoformat"):
            params["date_to"] = dt.isoformat()
        elif isinstance(dt, str) and dt.strip():
            params["date_to"] = dt.strip()[:32]

    resolved = _resolve_enum_query_value(question, intent, _status_enums(cfg, table=table))
    if resolved:
        params["status"] = resolved[0]

    filters = intent.get("filters") if isinstance(intent.get("filters"), dict) else {}
    line = str(filters.get("line") or filters.get("production_line") or "").strip()
    path_l = _norm(path)
    if line and ("work-order" in path_l or "daily-output" in path_l or "report" in path_l):
        params["production_line"] = line[:64]
    return params


def _cell(v: Any) -> str:
    if v is None or v == "":
        return "—"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float):
        s = f"{v:.4g}"
        return s
    if isinstance(v, (dict, list)):
        try:
            import json

            s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        except Exception:
            s = str(v)
    else:
        s = str(v)
    s = s.replace("|", "/").replace("\n", " ")
    return s if len(s) <= 80 else s[:77] + "…"


# 常见列表容器字段（各项目命名差异大，按优先级尝试）
_LIST_KEYS = (
    "items",
    "records",
    "rows",
    "list",
    "results",
    "content",
    "data",
    "datas",
    "result",
    "payload",
    "value",
    "values",
    "entry",
    "entries",
    "plans",
    "orders",
    "nodes",
)

_TOTAL_KEYS = (
    "total",
    "count",
    "totalCount",
    "total_count",
    "Total",
    "recordCount",
    "record_count",
    "totalElements",
    "total_elements",
)

# 展示列优先：人类可读；再退回其它标量字段
_LABEL_PREF = (
    "name",
    "title",
    "label",
    "plan_name",
    "planName",
    "order_no",
    "orderNo",
    "work_order_no",
    "code",
    "equipment_name",
    "equipmentName",
    "equipment_code",
    "product_name",
    "productName",
    "display_name",
    "displayName",
)

_COL_SKIP = {
    "password",
    "passwd",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "apikey",
    "authorization",
    "raw",
    "blob",
    "content_base64",
}

# 列表展示时默认跳过的噪音列（仍保留在原始 JSON；只是表格不铺满）
_COL_NOISE = {
    "created_at",
    "updated_at",
    "deleted_at",
    "password",
    "token",
    "results",
    "items",  # 嵌套数组，另计项目数时可展平
}


def _dict_list(val: Any) -> list[dict[str, Any]] | None:
    if not isinstance(val, list) or not val:
        return None
    dicts = [x for x in val if isinstance(x, dict)]
    if len(dicts) >= max(1, len(val) // 2):
        return dicts
    return None


def _score_list_candidate(rows: list[dict[str, Any]]) -> float:
    """列表越「像业务明细」分越高：长度 + 可读字段。"""
    if not rows:
        return 0.0
    score = min(len(rows), 50) * 1.0
    keys = {str(k).lower() for k in rows[0].keys()}
    for pref in _LABEL_PREF:
        if pref.lower() in keys:
            score += 3.0
    # 全是 id/uuid 类短对象降权
    if keys <= {"id", "uuid", "pk"}:
        score *= 0.3
    return score


def _walk_list_candidates(node: Any, depth: int = 0, acc: list[list[dict[str, Any]]] | None = None) -> list[list[dict[str, Any]]]:
    """浅层遍历，收集「字典数组」候选（不深挖大树，避免误抓）。"""
    if acc is None:
        acc = []
    if depth > 4:
        return acc
    rows = _dict_list(node)
    if rows is not None:
        acc.append(rows)
        return acc
    if isinstance(node, dict):
        # 先按常见键
        for key in _LIST_KEYS:
            if key in node:
                _walk_list_candidates(node.get(key), depth + 1, acc)
        # 再扫其它值（限制数量）
        for i, (k, v) in enumerate(node.items()):
            if k in _LIST_KEYS:
                continue
            if i > 24:
                break
            if isinstance(v, (dict, list)):
                _walk_list_candidates(v, depth + 1, acc)
    return acc


def _rows_from_payload(data: Any) -> list[dict[str, Any]]:
    """自适应抽出明细行：兼容 root 数组 / items / data.list / result.records 等。"""
    if isinstance(data, list):
        rows = _dict_list(data)
        return rows or []
    if not isinstance(data, dict):
        return []

    # 1) 常见键直取
    for key in _LIST_KEYS:
        if key not in data:
            continue
        val = data.get(key)
        rows = _dict_list(val)
        if rows is not None:
            return rows
        if isinstance(val, dict):
            for inner in _LIST_KEYS:
                rows = _dict_list(val.get(inner))
                if rows is not None:
                    return rows

    # 2) 浅层候选打分择优（不同项目字段名未知时）
    cands = _walk_list_candidates(data)
    if not cands:
        # 单对象当一行（详情型 GET）
        scalarish = [
            k
            for k, v in data.items()
            if k not in _COL_SKIP and not isinstance(v, (dict, list))
        ]
        if len(scalarish) >= 2:
            return [data]
        return []
    cands.sort(key=_score_list_candidate, reverse=True)
    return cands[0]


def _extract_total(data: Any, rows: list[dict[str, Any]]) -> int:
    if isinstance(data, dict):
        for key in _TOTAL_KEYS:
            if key in data and data.get(key) is not None:
                try:
                    return int(data.get(key))
                except (TypeError, ValueError):
                    pass
        # pagination / page 嵌套
        for wrap_key in ("pagination", "page", "meta", "pageInfo", "page_info"):
            wrap = data.get(wrap_key)
            if isinstance(wrap, dict):
                for key in _TOTAL_KEYS:
                    if key in wrap and wrap.get(key) is not None:
                        try:
                            return int(wrap.get(key))
                        except (TypeError, ValueError):
                            pass
        # data: { total, list }
        inner = data.get("data")
        if isinstance(inner, dict):
            for key in _TOTAL_KEYS:
                if key in inner and inner.get(key) is not None:
                    try:
                        return int(inner.get(key))
                    except (TypeError, ValueError):
                        pass
    return len(rows)


def _flatten_row_shallow(row: dict[str, Any], *, max_keys: int = 24) -> dict[str, Any]:
    """一层展平嵌套对象；不改名、不翻译，只展开 equipment.code → equipment_code。"""
    out: dict[str, Any] = {}
    for k, v in row.items():
        ks = str(k)
        if ks.lower() in _COL_SKIP:
            continue
        if isinstance(v, dict):
            for sk, sv in list(v.items())[:8]:
                if isinstance(sv, (dict, list)):
                    continue
                out[f"{ks}_{sk}"] = sv
            continue
        if isinstance(v, list):
            out[ks] = len(v)
            continue
        out[ks] = v
        if len(out) >= max_keys:
            break
    return out


def _is_empty_val(v: Any) -> bool:
    return v is None or v == "" or v == "—"


def _choose_columns(
    rows: list[dict[str, Any]],
    *,
    limit: int = 8,
    must_include: list[str] | None = None,
) -> list[str]:
    """保持接口返回字段顺序；跳过全空列与噪音列。不做「偏好字段」重排（避免与界面不一致）。

    must_include：问工资等场景强制保留已返回的敏感列（否则 8 列上限会把末尾 salary 挤掉）。
    """
    if not rows:
        return []
    flat_rows = [_flatten_row_shallow(r) for r in rows[: min(20, len(rows))]]
    # 首行键序 + 后续行补齐（稳定，贴近接口）
    ordered: list[str] = []
    seen: set[str] = set()
    for fr in flat_rows:
        for k in fr.keys():
            if k in seen:
                continue
            seen.add(k)
            ordered.append(str(k))

    picked: list[str] = []
    for k in ordered:
        kl = k.lower()
        if kl in _COL_SKIP or kl in _COL_NOISE:
            continue
        # 内部 id 列界面通常不展示（order_no 等业务编号保留）
        if kl == "id" or kl.endswith("_id"):
            continue
        # 全空列跳过（如 actual_start_at 全是 null，界面也不会当主列）
        if all(_is_empty_val(fr.get(k)) for fr in flat_rows):
            continue
        picked.append(k)
        if len(picked) >= limit:
            break
    if not picked:
        # 退回：哪怕全空也给前几列，避免空白表
        picked = [k for k in ordered if k.lower() not in _COL_SKIP][:limit]
    # 强制纳入仍存在于返回体的字段（大小写不敏感对齐原键名）
    must = [str(x).strip() for x in (must_include or []) if str(x).strip()]
    if must:
        lower_to_key = {str(k).lower(): k for k in ordered}
        picked_l = {str(k).lower() for k in picked}
        for name in must:
            key = lower_to_key.get(name.lower())
            if not key or name.lower() in picked_l:
                continue
            if all(_is_empty_val(fr.get(key)) for fr in flat_rows):
                continue
            picked.append(key)
            picked_l.add(name.lower())
    return picked


def _must_include_columns(
    question: str,
    intent: dict[str, Any] | None,
    rows: list[dict[str, Any]],
    cfg: dict[str, Any] | None,
) -> list[str]:
    """强制展示仍留在结果里的已配置敏感字段（工资 / 采购单价）。

    问敏感项或对应主数据列表时带上；未授权时 strip 已去掉字段，此处自然为空。
    避免 8 列上限把末尾 salary / purchase_price 挤掉。
    """
    if not rows:
        return []
    present_l = {str(k).lower() for k in (_flatten_row_shallow(rows[0]) or {})}
    out: list[str] = []
    seen: set[str] = set()

    def _add(fields: list[str]) -> None:
        for f in fields:
            key = str(f).lower()
            if key in present_l and key not in seen:
                seen.add(key)
                out.append(f)

    try:
        from .auth.data_access import ITEM_PURCHASE_PRICE, ITEM_SALARY, item_spec

        # 只强制已配置字段；fields 空 = 未接入，禁止猜 salary / purchase_price
        if _wants_employee_salary(question, intent) or _wants_employee_roster(
            question, intent
        ):
            _add(list(item_spec(cfg, ITEM_SALARY).get("fields") or []))
        if _wants_purchase_unit_price(question, intent) or _wants_material_purchase_list(
            question, intent
        ):
            _add(list(item_spec(cfg, ITEM_PURCHASE_PRICE).get("fields") or []))
    except Exception:  # noqa: BLE001
        return out
    return out


def _row_label(keys: list[str], cells: list[str]) -> str:
    """行主标题：取第一个非空单元格（不臆造字段优先级）。"""
    for cell in cells:
        if cell and cell != "—":
            return cell
    return "—"


def _collect_label_candidates(
    rows: list[Any],
    *,
    into: dict[str, set[str]] | None = None,
) -> dict[str, set[str]]:
    """从一组字典行收集 field→label 候选（不裁决歧义）。"""
    candidates: dict[str, set[str]] = into if into is not None else {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        mes = str(row.get("mes_field") or "").strip()
        std = str(row.get("std_field") or "").strip()
        desc = str(row.get("desc") or "").strip()
        label = ""
        if _is_zh_header_label(desc):
            label = desc
        elif _is_zh_header_label(mes):
            label = mes
        if not label:
            continue
        for key in (mes, std):
            if not key:
                continue
            kl = key.lower()
            if kl in _GENERIC_FIELD_KEYS:
                continue
            if _HAN_RE.search(key) and key == mes and not std:
                continue
            candidates.setdefault(kl, set()).add(label)
    return candidates


def _unique_labels(candidates: dict[str, set[str]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for kl, labs in candidates.items():
        if len(labs) == 1:
            out[kl] = next(iter(labs))
    return out


def build_field_label_map(
    cfg: dict[str, Any] | None,
    *,
    table: str | None = None,
) -> dict[str, str]:
    """从 data_dictionary 建「接口字段 → 表头」；仅无歧义且标签为中文时生效。

    - 无 table / table=other / 未知表：全库唯一标签（同键多组不一致则跳过）
    - 有明确 table：先取该组标签，再用全库唯一标签补缺（同键以本组为准）
    不改单元格取值，不做枚举翻译。
    """
    dd = (cfg or {}).get("data_dictionary")
    if not isinstance(dd, dict) or not dd:
        return {}

    global_cands: dict[str, set[str]] = {}
    for _group, rows in dd.items():
        if isinstance(rows, list):
            _collect_label_candidates(rows, into=global_cands)
    global_map = _unique_labels(global_cands)

    t = str(table or "").strip()
    if not t or t == "other" or t not in dd:
        return global_map
    group_rows = dd.get(t)
    if not isinstance(group_rows, list):
        return global_map
    scoped = _unique_labels(_collect_label_candidates(group_rows))
    out = dict(global_map)
    out.update(scoped)
    return out


def ask_example_lines(cfg: dict[str, Any] | None, *, limit: int = 4) -> list[str]:
    """从已导入可查询 GET 的中文 desc 抽示例问法（帮助/未知用）。"""
    lines: list[str] = []
    seen_prefix: set[str] = set()
    for ep in list_queryable_endpoints(cfg):
        desc = str(ep.get("desc") or "").strip()
        if not desc or not _HAN_RE.search(desc):
            continue
        if len(desc) < 2 or len(desc) > 40 or "/" in desc or "\\" in desc:
            continue
        path = str(ep.get("path") or "")
        parts = [p for p in path.split("/") if p]
        prefix = "/".join(parts[:2]) if parts else path
        if prefix in seen_prefix:
            continue
        seen_prefix.add(prefix)
        lines.append(desc)
        if len(lines) >= max(1, limit):
            break
    return lines


def _header_label(field: str, labels: dict[str, str] | None) -> str:
    if not labels:
        return field
    mapped = labels.get(str(field).lower())
    return mapped if mapped else field


def format_api_result(
    data: Any,
    *,
    endpoint: dict[str, Any],
    question: str,
    cfg: dict[str, Any] | None = None,
    field_labels: dict[str, str] | None = None,
    intent: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """把任意项目的接口 JSON 收成问数结果（谨慎、不跑偏）。

    - 表头优先用 data_dictionary 无歧义中文标签（优先 endpoint.table 作用域）；否则保持接口字段名
    - 单元格原值；若字典枚举写了「码=中文展示」则按字典替换，不写死业务状态表
    - 问数量时优先点明条数，再附明细表
    - 列顺序跟返回体；跳过全空列与敏感/噪音列
    - table 必须是 [{label,value,extra},...] 或 null（mes_ask schema）
    """
    from .detail_list import DETAIL_LIST_LIMIT, pack_detail_list

    table_name = str(endpoint.get("table") or "") or None
    if field_labels is not None:
        labels = field_labels
    else:
        labels = build_field_label_map(cfg, table=table_name)
    enum_fields = _dict_enum_fields(cfg, table=table_name)
    enum_maps: dict[str, dict[str, str]] = {}
    for fk, pairs in enum_fields.items():
        m: dict[str, str] = {}
        for code, lab, _als in pairs:
            # 仅当展示与码不同且含中文时才替换（纯英文枚举保持原样）
            if lab and lab != code and _HAN_RE.search(lab):
                m[str(code).lower()] = lab
        if m:
            enum_maps[fk] = m
    path = str(endpoint.get("path") or "")
    desc = str(endpoint.get("desc") or endpoint.get("name") or path)
    rows_raw = _rows_from_payload(data)
    rows = rows_raw
    status_hit = _resolve_enum_query_value(
        question, intent, _status_enums(cfg, table=table_name)
    )
    if status_hit and rows:
        code, lab, als = status_hit
        rows = _filter_rows_by_status_enum(
            rows, code=code, label=lab, aliases=als, strict=True
        )
    date_note: str | None = None
    it = intent if isinstance(intent, dict) else {}
    # 员工/人员名单：问句未点名入职/日期时，不按 hire_date 等字段套默认时间窗
    # 工资问句：即使带「本月」也不按入职日过滤（无独立薪资账期字段时）
    skip_date = _wants_employee_salary(question, intent) or (
        _wants_employee_roster(question, intent)
        and not any(
            k in _ask_blob(question, intent)
            for k in ("入职", "今天", "今日", "昨天", "本周", "本月", "最近", "号", "日")
        )
    )
    if (
        rows
        and not skip_date
        and (it.get("date_from") is not None or it.get("date_to") is not None)
    ):
        prefer_completed = bool(status_hit and str(status_hit[0]).lower() in {
            "completed", "closed", "done", "finished"
        }) or any(k in _ask_blob(question, intent) for k in ("完工", "已完成", "结案"))
        rows, date_note = _filter_rows_by_date_range(
            rows,
            date_from=it.get("date_from"),
            date_to=it.get("date_to"),
            cfg=cfg,
            table=table_name,
            prefer_completed=prefer_completed,
        )
    note = f"已按导入接口调用 GET {path}"
    if date_note:
        note = note + f"；{date_note}"
    matched = {
        "path": path,
        "method": "GET",
        "name": endpoint.get("name"),
        "desc": desc,
        "score": endpoint.get("score"),
    }

    if rows:
        keys = _choose_columns(
            rows,
            limit=8,
            must_include=_must_include_columns(question, intent, rows, cfg),
        )
        headers = [_header_label(k, labels) for k in keys]
        total = _extract_total(data, rows_raw)
        if len(rows) < len(rows_raw):
            total = len(rows)
        shown = rows[:DETAIL_LIST_LIMIT]
        projected: list[tuple[str, str, list[str]]] = []
        for r in shown:
            flat = _flatten_row_shallow(r)
            cells = [_apply_enum_cell(k, flat.get(k), enum_maps) for k in keys]
            label = _row_label(keys, cells)
            summary = " · ".join(c for c in cells if c and c != "—")
            if not summary:
                summary = label
            if summary.startswith(label + " · "):
                rest = summary[len(label) + 3 :]
                summary = rest if rest else label
            projected.append((label, summary, cells))
        out = pack_detail_list(
            desc,
            headers,
            projected,
            total=int(total),
            empty_hint="接口有返回但没有可展示的记录。",
        )
        reply = str(out.get("reply") or "")
        if _wants_count_answer(question, intent):
            count_line = f"「{desc}」共 {int(total)} 条。"
            if count_line not in reply:
                reply = count_line + ("\n\n" + reply if reply else "")
        if reply and f"GET {path}" not in reply:
            reply = reply + f"\n\n接口：GET {path}"
        out["reply"] = reply
        out["note"] = note
        out["data_source"] = "api_docs"
        out["matched_endpoint"] = matched
        remember_ask_route(question, endpoint, intent)
        tbl = out.get("table")
        if tbl is not None and not isinstance(tbl, list):
            out["table"] = None
        return out

    # 有列表体但按状态/日期过滤后为空：仍是有效答案（尤其「多少个」）
    if rows_raw and (status_hit or date_note is not None or it.get("date_from") is not None):
        reply = f"「{desc}」共 0 条。"
        if status_hit:
            reply += f"（已按状态「{status_hit[1]}」过滤）"
        if date_note:
            reply += f"\n说明：{date_note}"
        reply += f"\n\n接口：GET {path}"
        remember_ask_route(question, endpoint, intent)
        return {
            "reply": reply,
            "chart": None,
            "table": None,
            "note": note,
            "title": desc,
            "data_source": "api_docs",
            "matched_endpoint": matched,
        }

    if isinstance(data, dict):
        flat = _flatten_row_shallow(data, max_keys=12)
        table_rows: list[dict[str, str]] = []
        parts: list[str] = []
        for k, v in flat.items():
            if str(k).lower() in _COL_SKIP:
                continue
            ks = _header_label(str(k), labels)
            vs = _apply_enum_cell(str(k), v, enum_maps)
            if vs == "—":
                continue
            parts.append(f"- {ks}：{vs}")
            table_rows.append({"label": ks, "value": vs, "extra": ""})
        if parts:
            reply = f"已根据你的问题匹配接口「{desc}」。\n" + "\n".join(parts) + f"\n\n接口：GET {path}"
            remember_ask_route(question, endpoint, intent)
            return {
                "reply": reply,
                "chart": None,
                "table": table_rows or None,
                "note": note,
                "title": desc,
                "data_source": "api_docs",
                "matched_endpoint": matched,
            }

    preview = _cell(data)[:400]
    return {
        "reply": f"已调用接口「{desc}」（GET {path}），但返回结构无法自动列表化。\n预览：{preview}",
        "chart": None,
        "table": None,
        "note": note,
        "title": desc,
        "data_source": "api_docs",
        "matched_endpoint": matched,
    }


def no_match_reply(
    question: str,
    cfg: dict[str, Any] | None,
    intent: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ranked = rank_endpoints(question, cfg, intent, limit=5)
    n = len(list_queryable_endpoints(cfg))
    lines = [
        "没有在已导入的只读接口里找到足够匹配的项，因此没有擅自调用接口。",
        "",
    ]
    if ranked:
        lines.append("相近接口（请换个问法或到配置中心核对描述）：")
        for ep in ranked[:5]:
            lines.append(
                f"• {ep.get('desc') or ep.get('name') or ep.get('path')} "
                f"（GET {ep.get('path')}，相关度 {ep.get('score')}）"
            )
    elif n == 0:
        lines.append("当前没有可查询的 GET 接口。请在配置中心导入 OpenAPI，并确认存在列表/报表类 GET。")
    else:
        lines.append(f"已导入可查询 GET {n} 个，但与「{question[:40]}」关键词重叠不足。")
    lines.extend(
        [
            "",
            "说明：只会自动调用无路径参数的 GET；带 {id} 的详情、以及新建/删除类接口不会自动调用。",
        ]
    )
    return {
        "reply": "\n".join(lines),
        "chart": None,
        "table": None,
        "note": "api_docs 未匹配到可自动调用的接口",
        "title": "",
        "data_source": "api_docs_unmatched",
        "candidates": ranked,
    }


async def try_ask_via_api_docs(
    question: str,
    intent: dict[str, Any],
    cfg: dict[str, Any],
    mes: dict[str, Any],
) -> dict[str, Any] | None:
    """匹配成功则调用并返回结果；不够分返回 None（由上层回退）。"""
    from .auth.data_access import (
        block_sensitive_path,
        enforce_after_fetch,
        gate_before_fetch,
        note_hidden_items,
    )
    from .mes_client import MesError, api_get

    early = gate_before_fetch(question, cfg)
    if early is not None:
        return early
    picked = pick_endpoint(question, cfg, intent)
    if not picked:
        return None
    path = str(picked.get("path") or "")
    blocked = block_sensitive_path(path, cfg)
    if blocked is not None:
        return blocked
    params = build_query_params(
        intent,
        path,
        question=question,
        cfg=cfg,
        table=str(picked.get("table") or "") or None,
    )
    try:
        data = await api_get(mes, path, params)
    except MesError:
        # 部分接口不认 page 参数 → 再试一次无分页参数（仍只读）
        slim = {k: v for k, v in params.items() if k in {"date_from", "date_to", "status", "production_line"}}
        try:
            data = await api_get(mes, path, slim or None)
        except MesError as e:
            return {
                "reply": (
                    f"已匹配到接口「{picked.get('desc') or path}」，但调用失败。\n"
                    f"GET {path}\n原因：{e}"
                ),
                "chart": None,
                "table": None,
                "note": f"api_docs 调用失败：{e}",
                "title": "",
                "data_source": "api_docs_error",
                "matched_endpoint": {
                    "path": path,
                    "method": "GET",
                    "name": picked.get("name"),
                    "desc": picked.get("desc"),
                    "score": picked.get("score"),
                },
            }
    # 第二道门：载荷含已配置敏感字段时再验权（不单靠问句关键词）
    data, denied, hidden = enforce_after_fetch(question, data, cfg, path=path)
    if denied is not None:
        denied["matched_endpoint"] = {
            "path": path,
            "method": "GET",
            "name": picked.get("name"),
            "desc": picked.get("desc"),
            "score": picked.get("score"),
        }
        return denied
    result = format_api_result(
        data, endpoint=picked, question=question, cfg=cfg, intent=intent
    )
    if hidden:
        result["reply"] = note_hidden_items(str(result.get("reply") or ""), hidden)
        note = str(result.get("note") or "").strip()
        result["note"] = (note + "；已按权限隐藏敏感字段").strip("；")
    return result
