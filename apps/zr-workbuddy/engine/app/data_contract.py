"""导入的 api_docs / data_dictionary → 问数与写码共用的运行时契约摘要。

问数已由 ask_api_route / ask_data 消费；本模块只做：
- 配置页状态文案（已接入 N 个接口…）
- 写码任务卡短契约（禁止塞密钥；路径/名称消毒防提示词注入）
"""
from __future__ import annotations

import re
from typing import Any

_CTRL_RE = re.compile(r"[\x00-\x1f\x7f]")


def _safe_token(value: Any, *, max_len: int = 40) -> str:
    """去掉控制字符与换行，压空白；供写进 Agent 正文。"""
    t = _CTRL_RE.sub(" ", str(value or ""))
    t = " ".join(t.split())
    return t[:max_len].strip()


def _safe_api_path(path: Any) -> str:
    """只保留相对 API 路径；拒绝 URL / 穿越 / 反斜杠。"""
    p = _safe_token(path, max_len=120)
    if not p.startswith("/"):
        return ""
    if "://" in p or ".." in p or "\\" in p or " " in p:
        return ""
    return p


def _norm_endpoints(cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    root = cfg if isinstance(cfg, dict) else {}
    docs = root.get("api_docs") if isinstance(root.get("api_docs"), dict) else {}
    raw = docs.get("endpoints") if isinstance(docs.get("endpoints"), list) else []
    out: list[dict[str, Any]] = []
    for ep in raw:
        if not isinstance(ep, dict):
            continue
        path = _safe_api_path(ep.get("path"))
        if not path:
            continue
        out.append(ep)
    return out


def _dict_tables(cfg: dict[str, Any] | None) -> list[tuple[str, int]]:
    root = cfg if isinstance(cfg, dict) else {}
    dd = root.get("data_dictionary") if isinstance(root.get("data_dictionary"), dict) else {}
    tables: list[tuple[str, int]] = []
    for key, rows in dd.items():
        name = _safe_token(key, max_len=48)
        if not name or name.startswith("_"):
            continue
        if not isinstance(rows, list):
            continue
        n = sum(1 for r in rows if isinstance(r, dict))
        if n <= 0:
            continue
        tables.append((name, n))
    tables.sort(key=lambda x: (-x[1], x[0]))
    return tables


def summarize_data_contract(cfg: dict[str, Any] | None) -> dict[str, Any]:
    """配置页 / 探活用的契约状态（无密钥）。"""
    endpoints = _norm_endpoints(cfg)
    endpoint_count = len(endpoints)
    queryable_count = 0
    try:
        from .ask_api_route import list_queryable_endpoints

        queryable_count = len(list_queryable_endpoints(cfg if isinstance(cfg, dict) else {}))
    except Exception:
        queryable_count = 0
    tables = _dict_tables(cfg)
    dict_table_count = len(tables)
    dict_field_count = sum(n for _, n in tables)

    if endpoint_count > 0:
        status_line = f"已接入 {endpoint_count} 个接口，问数将走这些接口"
        if queryable_count and queryable_count != endpoint_count:
            status_line += f"（其中 {queryable_count} 个只读 GET 可自动匹配）"
    else:
        status_line = "尚未接入接口。导入后问数将优先匹配其中的只读 GET。"
    if dict_table_count > 0:
        status_line += f"；数据字典 {dict_table_count} 张表 / {dict_field_count} 字段"

    return {
        "ok": True,
        "endpoint_count": endpoint_count,
        "queryable_count": queryable_count,
        "dict_table_count": dict_table_count,
        "dict_field_count": dict_field_count,
        "status_line": status_line,
        "has_contract": endpoint_count > 0 or dict_table_count > 0,
    }


def format_for_coding(cfg: dict[str, Any] | None) -> str:
    """写入写码 requirement 的短契约；无导入时返回空串。"""
    summary = summarize_data_contract(cfg)
    if not summary.get("has_contract"):
        return ""

    lines = [
        "【数据契约 · 已导入接口/字典；写码与问数须对齐，禁止臆造未导入路径】",
        str(summary.get("status_line") or "").strip(),
    ]

    try:
        from .ask_api_route import list_queryable_endpoints

        qeps = list_queryable_endpoints(cfg if isinstance(cfg, dict) else {})
    except Exception:
        qeps = []
    if qeps:
        lines.append("可自动问数的只读 GET（优先复用，勿另起同义 URL）：")
        for ep in qeps[:12]:
            path = _safe_api_path(ep.get("path"))
            if not path:
                continue
            method = _safe_token(ep.get("method") or "GET", max_len=8).upper() or "GET"
            name = _safe_token(ep.get("name") or ep.get("desc") or "", max_len=40)
            table = _safe_token(ep.get("table") or "", max_len=32)
            bit = f"- {method} {path}"
            if name:
                bit += f" · {name}"
            if table:
                bit += f" · 表 {table}"
            lines.append(bit)
        if len(qeps) > 12:
            lines.append(f"- … 另有 {len(qeps) - 12} 个只读 GET")
    else:
        eps = _norm_endpoints(cfg)
        if eps:
            lines.append("已导入接口（暂无自动可匹配的只读 GET，写码仍须对照下列路径）：")
            for ep in eps[:10]:
                path = _safe_api_path(ep.get("path"))
                if not path:
                    continue
                method = _safe_token(ep.get("method") or "GET", max_len=8).upper() or "GET"
                name = _safe_token(ep.get("name") or "", max_len=40)
                bit = f"- {method} {path}"
                if name:
                    bit += f" · {name}"
                lines.append(bit)

    tables = _dict_tables(cfg)
    if tables:
        bits = [f"{name}({n}字段)" for name, n in tables[:8]]
        lines.append("数据字典表：" + "、".join(bits))
        lines.append("列表列名/字段优先用字典标签；禁止硬编码演示行冒充业务数据。")

    return "\n".join(lines)[:1800]
