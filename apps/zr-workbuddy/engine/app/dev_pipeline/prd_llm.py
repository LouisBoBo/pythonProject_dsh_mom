"""步骤 2：用 LLM 结合用户原话 + 识图，重组织可实施 PRD 摘要。

规则抽取只作参考；最终「要做什么」必须能追溯用户原话/图上批注，
禁止把页面标题/菜单/筛选项/分页文案当成改动本身。
"""
from __future__ import annotations

import json
import re
from typing import Any


_SYSTEM = """你是 WorkBuddy 需求理解助手。根据「用户原话」与「识图摘录」重组织成可实施需求。

硬规则：
1. 必须优先尊重用户原话；无原话时尊重图上附加文字/批注原文。
2. 禁止把页面元数据当成改动：页面标题、菜单路径、页面类型、筛选项、分页/合计文案不是「要做什么」。
3. 若红框在两列表头之间，改动是「在这两列之间新增一列」；列名以用户原话或图上附加文字为准，禁止擅自换成其它列名。
4. 禁止编造用户没写的功能；禁止套低库存/入库等示例模板。
5. 侧栏/模块名只取用户原话或识图中已出现的原文；禁止默认假设为「生产管理」「仓储管理」或其它未出现的菜单。
6. 输出严格 JSON（不要 markdown 围栏），字段：
{"one_liner":"一句话改动","what":"要做什么","how":"怎么干","done_when":["验收1","验收2"],"user_quote":"引用的用户原话或图上批注原文"}
"""


def looks_like_page_meta_dump(text: str) -> bool:
    """把识图页面结构当需求核心的典型失败形态。"""
    t = (text or "").strip()
    if not t:
        return False
    meta_hits = sum(
        1
        for k in (
            "页面标题：",
            "菜单/导航路径：",
            "页面类型：",
            "筛选项：",
            "分页/合计文案：",
        )
        if k in t
    )
    has_change = any(
        k in t
        for k in (
            "新增",
            "增加",
            "删除",
            "修改",
            "加列",
            "加一列",
            "字段",
            "红框",
            "【改动】",
        )
    )
    return meta_hits >= 2 and not has_change


def _sync_await(coro: Any, *, timeout: float = 90) -> Any:
    import asyncio
    import concurrent.futures

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result(timeout=timeout)


def _load_llm_cfg() -> dict[str, Any] | None:
    try:
        from ..config_store import load_config
        from ..llm_config import resolve_llm_cfg

        llm = resolve_llm_cfg(load_config())
        provider = (llm.get("provider") or "deepseek").lower()
        if provider == "none":
            return None
        if provider in ("deepseek", "openai_compat") and not (llm.get("api_key") or "").strip():
            return None
        return llm
    except Exception:
        return None


def _parse_json_obj(raw: str) -> dict[str, Any] | None:
    s = (raw or "").strip()
    if not s:
        return None
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    try:
        obj = json.loads(s)
        return obj if isinstance(obj, dict) else None
    except Exception:
        m = re.search(r"\{[\s\S]*\}", s)
        if not m:
            return None
        try:
            obj = json.loads(m.group(0))
            return obj if isinstance(obj, dict) else None
        except Exception:
            return None


def reorganize_requirement_with_llm(
    *,
    user_text: str = "",
    vision_text: str = "",
    rule_brief: str = "",
) -> dict[str, Any] | None:
    """LLM 重组织需求。失败返回 None（调用方回退规则结果）。"""
    user = (user_text or "").strip()
    vision = (vision_text or "").strip()
    brief = (rule_brief or "").strip()
    if not user and not vision:
        return None
    # 占位原文不当作用户原话
    if user in ("（附图需求，详见识图结果）", "附图需求", "见附图", "见截图"):
        user = ""
    # 记忆库偏好 / 流水线元需求不得钉进 what（事故：整段 preference 冒充需求）
    try:
        from .intake_normalize import (
            looks_like_memory_preference_dump,
            looks_like_pipeline_meta_not_product,
            looks_like_runtime_injection,
        )

        if user and (
            looks_like_memory_preference_dump(user)
            or looks_like_pipeline_meta_not_product(user)
            or looks_like_runtime_injection(user)
        ):
            user = ""
        if brief and (
            looks_like_memory_preference_dump(brief)
            or looks_like_pipeline_meta_not_product(brief)
        ):
            brief = ""
    except Exception:
        pass
    if not user and not vision and not brief:
        return None
    llm = _load_llm_cfg()
    if not llm:
        return None

    payload = (
        f"【用户原话】\n{(user or '（用户未另附文字，请以图上附加文字/红框为准）')}\n\n"
        f"【识图摘录】\n{(vision[:4500] or '（无）')}\n\n"
        f"【规则初稿（可推翻，勿照抄页面元数据；禁止把流水线偏好当需求）】\n{(brief[:800] or '（无）')}\n"
    )
    try:
        from ..nl_engine import llm_freeform

        raw = _sync_await(
            llm_freeform(
                _SYSTEM,
                payload,
                llm,
                max_tokens=1200,
                timeout=60,
                temperature=0.2,
                lane="dev_pipeline_prd",
            ),
            timeout=75,
        )
    except Exception:
        return None
    obj = _parse_json_obj(str(raw or ""))
    if not obj:
        return None
    one = str(obj.get("one_liner") or "").strip()
    what = str(obj.get("what") or "").strip()
    how = str(obj.get("how") or "").strip()
    quote = str(obj.get("user_quote") or "").strip()
    done = obj.get("done_when") if isinstance(obj.get("done_when"), list) else []
    done_when = [str(x).strip() for x in done if str(x).strip()][:8]
    if not what and not one:
        return None
    if looks_like_page_meta_dump(what or one):
        return None
    try:
        from .intake_normalize import (
            is_implementable_requirement,
            looks_like_pipeline_meta_not_product,
        )

        if looks_like_pipeline_meta_not_product(what or one) or not is_implementable_requirement(
            what or one
        ):
            return None
    except Exception:
        pass
    # 把用户原话钉进 what，避免再次丢掉（user 已在入口剔除偏好 dump）
    if user and user not in (what or "") and user not in (one or "") and len(user) <= 400:
        what = f"{user}。{what or one}".strip("。")[:500]
        if user not in one:
            one = user[:160]
    elif quote and quote not in (what or "") and len(quote) >= 4:
        if quote not in (what or ""):
            what = f"{quote}。{what or one}".strip("。")[:500]
    return {
        "one_liner": (one or what)[:160],
        "what": (what or one)[:500],
        "how": how[:400] or "改本页前端表格列 + 对应列表接口字段；位置以红框/标注为准",
        "done_when": done_when
        or [
            (what or one)[:200],
            "本页表格与列表接口字段对齐",
            "步骤 6 验证命令通过",
        ],
        "user_quote": quote[:240],
        "source": "llm_reorganize",
    }
