"""问数数据源裁决：真实连接优先，禁止默认用演示库冒充业务结果。

P0（通用智能体清单）：
- 未配置 mes.base_url → 明确未连接，不落 demo
- MES 调用失败 → 回报失败；仅当 mes.allow_demo_fallback=true 才可用演示表
- 演示开启时 reply/note 必须标明「演示数据」
- 已导入 api_docs：按用户意图对只读 GET 自动打分匹配；不够分再回退硬编码 MES；仍无则诚实说明
"""
from __future__ import annotations

from typing import Any


def allow_demo_fallback(mes: dict[str, Any] | None) -> bool:
    """默认 False。兼容旧字段 use_demo_fallback。"""
    m = mes if isinstance(mes, dict) else {}
    return bool(m.get("allow_demo_fallback") or m.get("use_demo_fallback"))


def mes_base_url(mes: dict[str, Any] | None) -> str:
    m = mes if isinstance(mes, dict) else {}
    return str(m.get("base_url") or "").strip().rstrip("/")


def count_imported_endpoints(cfg: dict[str, Any] | None) -> int:
    """配置中心里已导入、且 path 非空的接口数。"""
    root = cfg if isinstance(cfg, dict) else {}
    docs = root.get("api_docs") if isinstance(root.get("api_docs"), dict) else {}
    eps = docs.get("endpoints") if isinstance(docs.get("endpoints"), list) else []
    n = 0
    for ep in eps:
        if not isinstance(ep, dict):
            continue
        if str(ep.get("path") or "").strip():
            n += 1
    return n


def _question_from_intent(intent: dict[str, Any] | None) -> str:
    it = intent if isinstance(intent, dict) else {}
    for key in ("raw", "metric_name"):
        s = str(it.get(key) or "").strip()
        if s:
            return s
    return str(it.get("metric") or "").strip()


def docs_query_intent(question: str) -> dict[str, Any]:
    """无硬编码指标时的查数意图：交给导入接口匹配。

    默认不带日期。原先一律塞「今天」会把员工列表等主数据按入职日滤成 0 条。
    仅当问句里出现今天/本月/最近等时间词时才解析区间。
    """
    import re
    from datetime import date

    from .nl_engine import _parse_time

    today = date.today()
    q = str(question or "").strip()
    qtype = "list"
    if any(k in q for k in ("多少", "几个", "多少个", "有多少", "数量", "总数", "几条", "几项")):
        qtype = "single"
    date_from = date_to = None
    range_desc = ""
    time_markers = (
        "今天",
        "今日",
        "当天",
        "昨天",
        "昨日",
        "本周",
        "这周",
        "上周",
        "本月",
        "这个月",
        "上月",
        "上个月",
        "最近",
        "近",
        "过去",
    )
    if any(k in q for k in time_markers) or re.search(r"\d{1,2}[月/]\d{1,2}", q):
        date_from, date_to, range_desc = _parse_time(q, today)
    return {
        "metric": "",
        "dim": None,
        "type": qtype,
        "chart": "bar",
        "direction": "desc",
        "date_from": date_from,
        "date_to": date_to,
        "range_desc": range_desc,
        "granularity": "day",
        "filters": {},
        "metric_name": "",
        "dim_name": "",
        "raw": q,
    }


async def try_imported_api_answer(
    question: str,
    cfg: dict[str, Any],
    intent: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """已接通 MES 且导入接口高分命中时直接查；否则 None（不瞎调）。"""
    from .ask_api_route import list_queryable_endpoints, try_ask_via_api_docs

    mes = cfg.get("mes") if isinstance(cfg.get("mes"), dict) else {}
    if not mes_base_url(mes):
        return None
    if not list_queryable_endpoints(cfg):
        return None
    q = str(question or "").strip()
    if not q:
        return None
    it = dict(intent) if isinstance(intent, dict) else docs_query_intent(q)
    if not str(it.get("raw") or "").strip():
        it["raw"] = q
    return await try_ask_via_api_docs(q, it, cfg, mes)


def _assistant_result(
    reply: str,
    *,
    note: str | None = None,
    data_source: str = "assistant",
) -> dict[str, Any]:
    return {
        "reply": reply,
        "chart": None,
        "table": None,
        "note": note,
        "title": "",
        "data_source": data_source,
    }


def unconfigured_reply(cfg: dict[str, Any] | None) -> dict[str, Any]:
    n = count_imported_endpoints(cfg)
    lines = [
        "还没有接通业务数据源，无法回答这条查数问题。",
        "",
        "请在 WorkBuddy「设置 → MES 连接」填写业务系统地址并保存，再试一次。",
        "当前不会用内置演示数字冒充业务结果。",
    ]
    if n > 0:
        lines.extend(
            [
                "",
                f"配置中心已导入 {n} 个带路径的接口；接通地址后，会按你的问题匹配只读 GET 再调用。",
            ]
        )
    else:
        lines.extend(
            [
                "",
                "也可在配置中心导入 OpenAPI / 接口文档，接通后按意图匹配只读接口。",
            ]
        )
    lines.extend(
        [
            "",
            "若本机联调需要演示表，请在配置中将 mes.allow_demo_fallback 设为 true（仅调试）。",
        ]
    )
    return _assistant_result("\n".join(lines), note="未配置业务数据源", data_source="unconfigured")


def mes_failed_reply(detail: str, *, allow_demo: bool) -> dict[str, Any]:
    tip = str(detail or "未知错误").strip()[:500]
    lines = [
        "已配置业务连接，但这次查询没有成功。",
        "",
        f"原因：{tip}",
        "",
        "请检查地址、账号与网络后重试。",
    ]
    if not allow_demo:
        lines.append("未开启演示回退，因此没有改用内置假数据。")
    return _assistant_result("\n".join(lines), note=f"MES 查询失败：{tip}", data_source="mes_error")


def mark_demo(result: dict[str, Any], *, reason: str = "") -> dict[str, Any]:
    """给演示结果打标，避免被当成真库。"""
    out = dict(result or {})
    out["data_source"] = "demo"
    note = str(out.get("note") or "").strip()
    tag = "演示数据（非业务库）"
    if reason:
        tag = f"{tag}：{reason}"
    out["note"] = f"{note} {tag}".strip() if note else tag
    reply = str(out.get("reply") or "").strip()
    if reply and "演示数据" not in reply:
        out["reply"] = reply + "\n\n（以上为内置演示数据，不是你的业务库。）"
    return out


async def resolve_ask_query(intent: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    """执行查数：导入接口匹配 → MES 硬指标 →（可选）demo → 诚实失败。"""
    from . import blas_env  # noqa: F401
    from .analyzer import analyze
    from .ask_api_route import (
        list_queryable_endpoints,
        no_match_reply,
        try_ask_via_api_docs,
    )
    from .demo_data import get_demo_store
    from .mes_analyzer import analyze_mes
    from .mes_client import MesError
    from .mes_profile import cfg_for_ask

    from .auth.data_access import gate_before_fetch

    # 按工作区命中对接卡；未带工作区且当前编辑卡地址为空、仅一张卡已接通时用那张
    try:
        ws = ""
        if isinstance(intent, dict):
            ws = str(intent.get("workspace") or intent.get("cwd") or "").strip()
        cfg = cfg_for_ask(cfg, ws or None)
    except Exception:
        pass

    mes = cfg.get("mes") if isinstance(cfg.get("mes"), dict) else {}
    base = mes_base_url(mes)
    demo_ok = allow_demo_fallback(mes)
    question = _question_from_intent(intent)
    early = gate_before_fetch(question, cfg)
    if early is not None:
        return early
    queryable = list_queryable_endpoints(cfg)

    if base:
        # 1) 已导入文档：高分才自动调只读 GET
        if queryable:
            api_hit = await try_ask_via_api_docs(question, intent, cfg, mes)
            if api_hit is not None:
                return api_hit

        metric = str(intent.get("metric") or "").strip()
        # 无硬编码指标：不再硬调经典 MES 路径（避免保养计划等落到错误口径）
        if not metric:
            if queryable:
                return no_match_reply(question, cfg, intent)
            return _assistant_result(
                "暂时无法映射到具体查询指标。请换个问法，或确认配置中心已导入对应只读接口。",
                note="无 metric 且未匹配导入接口",
                data_source="unmatched",
            )

        # 2) 回退：原有硬编码制造指标路径（兼容已配好的经典 MES）
        try:
            result = await analyze_mes(intent, mes)
            out = dict(result or {})
            out["data_source"] = "mes"
            return out
        except MesError as e:
            if demo_ok:
                store = get_demo_store()
                return mark_demo(analyze(store, intent), reason=f"MES 失败后回退（{e}）")
            # 有导入接口但匹配不够分、硬指标也失败 → 给候选，避免瞎调
            if queryable:
                return no_match_reply(question, cfg, intent)
            return mes_failed_reply(str(e), allow_demo=False)
        except Exception as e:  # noqa: BLE001
            detail = f"{type(e).__name__}: {e}"
            if demo_ok:
                store = get_demo_store()
                return mark_demo(analyze(store, intent), reason=f"MES 异常后回退（{detail}）")
            if queryable:
                return no_match_reply(question, cfg, intent)
            return mes_failed_reply(detail, allow_demo=False)

    if demo_ok:
        store = get_demo_store()
        return mark_demo(analyze(store, intent), reason="未配置 base_url，已显式开启演示回退")

    return unconfigured_reply(cfg)


def special_reply_for_ask(
    kind: str,
    default_reply: str,
    cfg: dict[str, Any] | None,
) -> str:
    """问候/帮助：无数据源时提示先配连接；有导入接口时附带示例问法。"""
    root = cfg if isinstance(cfg, dict) else {}
    mes = root.get("mes") if isinstance(root.get("mes"), dict) else {}
    reply = default_reply
    if kind in {"help", "unknown", "greeting"}:
        if not mes_base_url(mes) and not allow_demo_fallback(mes):
            extra = (
                "\n\n提示：查业务数前请先在设置里配置 MES 连接；"
                "未配置时不会返回演示数字。"
            )
            if extra.strip() not in reply:
                reply = reply + extra
        try:
            from .ask_api_route import ask_example_lines

            examples = ask_example_lines(root, limit=4)
        except Exception:
            examples = []
        if examples:
            block = "\n\n根据已导入接口，还可以问：\n" + "\n".join(f"• {e}" for e in examples)
            if "根据已导入接口" not in reply:
                reply = reply + block
    return reply
