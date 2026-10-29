"""查明细：返回记录列表，最多 50 条，不按维度汇总。"""

from __future__ import annotations

DETAIL_LIST_LIMIT = 50

DETAIL_NOTE = "明细列表，最多 50 条。请按表格逐条展示，不要改成按产线或其它维度汇总。"

_STATUS_LABELS = {
    "pending": "待生产",
    "in_progress": "生产中",
    "completed": "已完成",
    "closed": "已关闭",
    "cancelled": "已取消",
    "draft": "草稿",
}

_WO_HEADERS = ["工单号", "产品", "产线", "计划数量", "实际数量", "状态", "开始"]


def _first(row: dict, *keys: str):
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return ""


def _cell(value) -> str:
    if value is None or value == "":
        return "—"
    return str(value).replace("|", "/").replace("\n", " ")


def project_work_order(row: dict) -> tuple[str, str, list[str]]:
    """把一条工单收成（工单号, 面板摘要, 表格单元格）。"""
    order_no = _cell(_first(row, "order_no", "work_order_no", "order_number"))
    product = _cell(_first(row, "product_name", "product", "product_code"))
    line = _cell(_first(row, "production_line", "line", "line_name"))
    plan = _cell(_first(row, "plan_quantity", "planned_qty", "plan_qty"))
    actual = _cell(_first(row, "actual_quantity", "actual_qty"))
    raw_status = _first(row, "status")
    status = _cell(_STATUS_LABELS.get(str(raw_status), raw_status))
    start = _cell(_first(row, "start_date", "date", "start_time"))[:10] or "—"
    summary = f"{product} · {line} · 计划{plan} · 实际{actual} · {status} · {start}"
    return order_no, summary, [order_no, product, line, plan, actual, status, start]


def work_order_detail_result(title: str, rows: list, total: int | None = None) -> dict:
    rows = list(rows or [])
    if total is None:
        total = len(rows)
    shown = rows[:DETAIL_LIST_LIMIT]
    projected = [project_work_order(r) for r in shown]
    return pack_detail_list(
        title,
        _WO_HEADERS,
        projected,
        total=int(total),
        empty_hint="没有符合条件的工单明细。",
    )


def columnar_detail_result(title: str, rows: list, columns: list[tuple[str, tuple[str, ...]]], *, total: int | None = None) -> dict:
    """通用列表：columns 为 (表头, 字段别名)。"""
    rows = list(rows or [])
    if total is None:
        total = len(rows)
    shown = rows[:DETAIL_LIST_LIMIT]
    headers = [c[0] for c in columns]
    projected = []
    for row in shown:
        cells = [_cell(_first(row, *keys)) for _, keys in columns]
        label = cells[0] if cells else "—"
        summary = " · ".join(cells[1:]) if len(cells) > 1 else label
        projected.append((label, summary, cells))
    return pack_detail_list(title, headers, projected, total=int(total), empty_hint="没有符合条件的明细。")


def pack_detail_list(title: str, headers: list[str], projected: list, *, total: int, empty_hint: str) -> dict:
    n = len(projected)
    if n == 0:
        return {
            "reply": f"{title}：{empty_hint}",
            "chart": None,
            "table": None,
            "title": title,
            "note": DETAIL_NOTE,
        }
    if total > n:
        head = f"📋 {title}：共 {total} 条，以下展示前 {n} 条。"
    else:
        head = f"📋 {title}：共 {n} 条。"
    reply = head + "\n\n" + _markdown(headers, [item[2] for item in projected])
    table = [{"label": item[0], "value": item[1], "extra": ""} for item in projected]
    return {"reply": reply, "chart": None, "table": table, "title": title, "note": DETAIL_NOTE}


def _markdown(headers: list[str], rows: list[list[str]]) -> str:
    head = "| " + " | ".join(headers) + " |"
    sep = "| " + " | ".join("---" for _ in headers) + " |"
    body = ["| " + " | ".join(cells) + " |" for cells in rows]
    return "\n".join([head, sep, *body])
