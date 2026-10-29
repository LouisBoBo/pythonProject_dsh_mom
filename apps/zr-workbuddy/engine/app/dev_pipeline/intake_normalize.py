"""需求原文清洗：剥离 runtime/记忆库/沙箱政策注入，产出可实施的 PRD 步骤卡。"""
from __future__ import annotations

import re
from typing import Any

# 宿主 / Agent 误把系统提示当「用户原话」时的特征（大小写不敏感）
_RUNTIME_MARKERS = (
    "current runtime context",
    "this snapshot supersedes",
    "[记忆库]",
    "来自 dsh-mneme",
    "memory_get",
    "<system-reminder>",
    "<available_skills>",
    "a skill is a reusable set of task-specific instructions",
    # DSH 沙箱 / 审批策略注入（贴图需求事故：整段被当成 PRD）
    "current dsh file policy",
    "dsh file policy",
    "workspace-write",
    "danger-full-access",
    "approval policy: ask",
    "approval policy:",
    "operations that require approval may ask",
    "without an available answerer",
    "the request fails closed",
    "any available operation enforced by the dsh file sandbox",
    "platform temporary areas may also be writable",
    # 记忆库 / 知识库协议整段注入（2026-10-08：偏好 dump 冒充需求 → 全流程假绿）
    "knowledge bases mounted",
    "knowledge-first retrieval protocol",
    "knowledge-first retrieval",
    "consult mounted knowledge",
    "routing metadata only",
)

_DEV_NOISE_PREFIXES = (
    "[preference]",
    "[summary]",
    "禁止使用 ask_user_question",
    "偏好诡异恐怖童话",
)

# 行首偏好/摘要子弹（允许前面有「- 」「* 」；MULTILINE 才能扫全文每一行）
_PREF_SUMMARY_LINE_RE = re.compile(
    r"^\s*[-*•]?\s*\[(preference|summary)\]",
    re.IGNORECASE | re.MULTILINE,
)

_PRODUCT_CHANGE_VERBS = (
    "删除",
    "删掉",
    "去掉",
    "移除",
    "隐藏",
    "下线",
    "新增",
    "增加",
    "添加",
    "修改",
    "修复",
    "改成",
    "改为",
    "实现",
    "接入",
    "展示",
    "显示",
    "加列",
    "加字段",
    "加一列",
    "补齐",
    "恢复",
)

# 识图/模型套话：无业务可实施内容
_BOILERPLATE_MARKERS = (
    "以上是根据截图中可见内容整理出的结构化需求草稿",
    "如有其他细节或要求，请随时补充",
    "根据截图中可见内容整理",
    "结构化需求草稿",
    "请随时补充",
    "待澄清问题",
)

_PLACEHOLDER_MESSAGES = frozenset(
    {
        "",
        "（附图需求，详见识图结果）",
        "(附图需求，详见识图结果)",
        "（请补充需求描述）",
    }
)


def looks_like_runtime_injection(text: str) -> bool:
    low = (text or "").lower()
    if any(m in low for m in _RUNTIME_MARKERS):
        return True
    raw = text or ""
    if "[记忆库]" in raw:
        return True
    return looks_like_memory_preference_dump(raw)


def looks_like_memory_preference_dump(text: str) -> bool:
    """记忆库偏好/[summary]/知识库协议整段，不得当作用户产品需求。"""
    t = text or ""
    if not t.strip():
        return False
    low = t.lower()
    if any(
        m in low
        for m in (
            "knowledge bases mounted",
            "knowledge-first retrieval",
            "consult mounted knowledge",
            "routing metadata only",
            "dsh-mneme",
        )
    ):
        return True
    if "[记忆库]" in t:
        return True
    pref_n = len(_PREF_SUMMARY_LINE_RE.findall(t))
    if pref_n >= 2:
        return True
    # 单条长 preference 且夹带流水线工具名 = 偏好 dump，不是产品改动
    if pref_n >= 1 and any(
        k in t for k in ("mes_dev_pipeline_begin", "ask_user_question", "过程流卡", "一体化流程")
    ):
        return True
    head = t.lstrip()[:80]
    if head.startswith("[preference]") or head.startswith("- [preference]"):
        return True
    return False


def looks_like_pipeline_meta_not_product(text: str) -> bool:
    """「怎么用流水线」类元需求：可实施关键词碰巧命中也不能当产品 PRD。"""
    t = (text or "").strip()
    if not t:
        return False
    if looks_like_memory_preference_dump(t) and not _has_concrete_product_change(t):
        return True
    meta_keys = (
        "mes_dev_pipeline_begin",
        "ask_user_question",
        "zr_cursor_begin",
        "zr_cchat_begin",
        "过程流卡",
        "需求→上线",
        "一体化流程",
    )
    meta_hits = sum(1 for k in meta_keys if k in t)
    if meta_hits >= 2 and not _has_concrete_product_change(t):
        return True
    if "[preference]" in t and "mes_dev_pipeline" in t and not _has_concrete_product_change(t):
        return True
    return False


def _has_concrete_product_change(text: str) -> bool:
    """是否含可落地的产品改动动词（非「如报表中心」举例）。"""
    t = text or ""
    if not any(v in t for v in _PRODUCT_CHANGE_VERBS):
        return False
    # 偏好文案里的「开发类（如报表中心）需求」不算具体改动
    t2 = re.sub(r"[（(]如[^）)]{0,40}[）)]", "", t)
    t2 = re.sub(r"例如[^，。；;\n]{0,40}", "", t2)
    return any(v in t2 for v in _PRODUCT_CHANGE_VERBS)


def looks_like_sandbox_policy(text: str) -> bool:
    """专指 DSH file sandbox / Approval policy 类系统句（非用户产品需求）。"""
    low = (text or "").lower()
    return any(
        m in low
        for m in (
            "current dsh file policy",
            "dsh file policy",
            "workspace-write",
            "approval policy: ask",
            "dsh file sandbox",
            "the request fails closed",
        )
    )


def looks_like_requirement_boilerplate(text: str) -> bool:
    """套话 / 占位：不能当作可实施需求写进步骤卡或交给写码。"""
    t = (text or "").strip()
    if not t or t in _PLACEHOLDER_MESSAGES:
        return True
    if looks_like_sandbox_policy(t) or looks_like_runtime_injection(t):
        return True
    hit = sum(1 for m in _BOILERPLATE_MARKERS if m in t)
    # 去掉套话后几乎没有业务字
    stripped = t
    for m in _BOILERPLATE_MARKERS:
        stripped = stripped.replace(m, "")
    stripped = re.sub(r"[#*\-·\s，。、：:；;（）()【】\[\]]+", "", stripped)
    if hit >= 1 and len(stripped) < 8:
        return True
    if hit >= 2 and len(stripped) < 24:
        return True
    if t.startswith("以上是根据截图") or t.startswith("以下是根据截图"):
        return True
    # 整段只有「结构化需求草稿」标题类
    if re.fullmatch(r"(###?\s*)?结构化需求草稿", t):
        return True
    return False


def is_placeholder_requirement(text: str) -> bool:
    return looks_like_requirement_boilerplate(text)


def is_implementable_requirement(text: str) -> bool:
    """步骤卡 / 写码可用：非套话，且含可落地的业务动作或对象。"""
    t = (text or "").strip()
    if not t or looks_like_requirement_boilerplate(t):
        return False
    # 流水线偏好 / 记忆库 dump ≠ 产品改动（即使含「报表中心」字样）
    if looks_like_pipeline_meta_not_product(t):
        return False
    # 页面元数据堆砌 ≠ 可实施改动
    try:
        from .prd_llm import looks_like_page_meta_dump

        if looks_like_page_meta_dump(t):
            return False
    except Exception:
        pass
    action_keys = (
        "增加",
        "新增",
        "添加",
        "修改",
        "删除",
        "修复",
        "实现",
        "展示",
        "显示",
        "调用",
        "接入",
        "配置",
        "菜单",
        "页面",
        "接口",
        "路由",
        "筛选",
        "列表",
        "报表",
        "收藏",
        "预警",
        "发货",
        "建单",
        "关单",
        "订单",
        "校验",
        "登记",
        "api/",
        "/api",
    )
    return any(k in t.lower() if k.startswith("/") or k == "api/" else k in t for k in action_keys)


def normalize_intake(*, text: str = "", vision_text: str = "") -> dict[str, Any]:
    """从宿主注入的 message + 识图结果提炼「可实施需求核心」。

    硬规则：沙箱/runtime/套话不得压过识图业务正文；步骤卡禁止浮夸套话。
    有附图时：用户短句（红框/加列）必须与识图页面锚定合并，禁止只凭关键词改错页。
    """
    from .vision_surface import merge_user_intent_with_vision, parse_vision_surface

    raw = _cut_knowledge_protocol((text or "").strip())
    # 去掉 【附图:vimg-…】 噪声，保留真实意图
    raw_for_core = re.sub(r"【附图:vimg-[a-zA-Z0-9_-]+】", "", raw).strip()
    vision = _strip_vision_boilerplate_tail((vision_text or "").strip())
    if vision and looks_like_sandbox_policy(vision) and looks_like_runtime_injection(vision):
        vision = ""
    core = ""
    source = "user_text"
    notes: list[str] = []
    surface: dict[str, Any] = parse_vision_surface(vision) if vision else {}

    junk_text = (
        not raw_for_core
        or looks_like_requirement_boilerplate(raw_for_core)
        or looks_like_runtime_injection(raw_for_core)
        or looks_like_memory_preference_dump(raw_for_core)
        or looks_like_sandbox_policy(raw_for_core)
        or looks_like_pipeline_meta_not_product(raw_for_core)
        or is_placeholder_requirement(raw_for_core)
    )

    if junk_text:
        if (
            looks_like_runtime_injection(raw)
            or looks_like_sandbox_policy(raw)
            or looks_like_memory_preference_dump(raw)
        ):
            notes.append("已剥离宿主 runtime / 沙箱政策 / 记忆库偏好注入")
        if looks_like_requirement_boilerplate(raw_for_core) and raw_for_core:
            notes.append("已丢弃套话/占位原文")
        extracted = _extract_task_from_mneme(raw) if raw else ""
        if (
            extracted
            and not looks_like_sandbox_policy(extracted)
            and not looks_like_requirement_boilerplate(extracted)
            and not looks_like_pipeline_meta_not_product(extracted)
            and is_implementable_requirement(extracted)
        ):
            core = extracted
            source = "memory_summary"
        elif vision:
            core = compose_implementable_brief(vision, user_text=_strip_injection_blocks(raw_for_core))
            source = "vision"
            notes.append("原文无效或套话，已改用识图可实施摘要")
        else:
            core = _strip_injection_blocks(raw_for_core)
            if (
                looks_like_sandbox_policy(core)
                or looks_like_runtime_injection(core)
                or looks_like_requirement_boilerplate(core)
                or looks_like_pipeline_meta_not_product(core)
                or not is_implementable_requirement(core)
            ):
                core = ""
            source = "stripped_text"
    else:
        core = raw_for_core

    # 有识图且原文仍不可实施 → 强制用识图业务摘要
    if vision and (
        not is_implementable_requirement(core)
        or looks_like_requirement_boilerplate(core)
        or looks_like_sandbox_policy(core)
        or looks_like_runtime_injection(core)
    ):
        vline = compose_implementable_brief(vision, user_text=raw_for_core)
        if vline and is_implementable_requirement(vline):
            core = vline
            source = "vision_fallback" if source != "vision" else "vision"
            notes.append("原文不可实施，已用识图可实施摘要作为需求核心")

    # 关键：有识图则与界面锚定合并（短句「红框加列」必须带上页面标题/表头）
    if vision:
        merged = merge_user_intent_with_vision(
            core or raw_for_core, vision, surface=surface
        )
        surface = merged.get("surface") if isinstance(merged.get("surface"), dict) else surface
        mcore = str(merged.get("core") or "").strip()
        if mcore:
            if mcore != core:
                notes.extend(list(merged.get("notes") or []))
            core = mcore
            src = str(merged.get("source") or "")
            if src.startswith("user_plus") or src == "vision":
                source = src

    core = _clean_whitespace(core)[:2000]
    if (
        looks_like_sandbox_policy(core)
        or looks_like_requirement_boilerplate(core)
        or looks_like_pipeline_meta_not_product(core)
    ):
        core = ""
        notes.append("清洗后仍像套话/沙箱政策/流水线偏好，已清空以免污染 PRD")
    one = to_one_liner(core)
    return {
        "core": core,
        "one_liner": one,
        "source": source,
        "was_sanitized": bool(raw) and raw[:120] != core[: min(120, len(core) or 1)],
        "notes": notes,
        "implementable": is_implementable_requirement(core),
        "vision_surface": surface,
    }


def resolve_requirement_core(epic: dict[str, Any] | None, message: str = "") -> str:
    epic = epic if isinstance(epic, dict) else {}
    arts = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
    raw = arts.get("raw_intake") if isinstance(arts.get("raw_intake"), dict) else {}
    vision = str(raw.get("vision_text") or "")

    for candidate in (
        str(epic.get("requirement_core") or "").strip(),
        str(raw.get("requirement_core") or "").strip(),
        str(message or "").strip(),
    ):
        if candidate and is_implementable_requirement(candidate):
            epic["requirement_core"] = candidate
            return candidate

    norm = normalize_intake(
        text=str(message or raw.get("text") or epic.get("message") or ""),
        vision_text=vision,
    )
    core = str(norm.get("core") or "").strip()
    if core:
        epic["requirement_core"] = core
    return core or ""


def compose_implementable_brief(vision_or_text: str, user_text: str = "") -> str:
    """把识图/原文压成一条可交给写码的实施摘要（无套话）。

    user_text：用户原话（优先取列名/改动意图）；禁止只靠页面元数据堆砌。
    """
    v = _strip_prompt_example_leakage(
        _strip_vision_boilerplate_tail(vision_or_text or "")
    )
    if not v or looks_like_sandbox_policy(v):
        # 仅有用户原话也可压一条
        u = (user_text or "").strip()
        if u and is_implementable_requirement(u) and not looks_like_requirement_boilerplate(u):
            return u[:800]
        return ""
    extracted = _extract_task_from_vision(v, user_text=user_text)
    if (
        extracted
        and is_implementable_requirement(extracted)
        and not looks_like_hardcoded_low_stock_template(extracted)
    ):
        return extracted
    # 从结构化 bullet 拼装
    bullets = _collect_action_bullets(v)
    if bullets:
        joined = "；".join(bullets[:6])[:800]
        if not looks_like_hardcoded_low_stock_template(joined):
            return joined
    para = _first_meaningful_paragraph(v)
    if para and is_implementable_requirement(para):
        return para[:800]
    # 短识图整段可实施时直接采用（如「界面有停机报表按钮」）
    compact = _clean_whitespace(v)
    if (
        compact
        and len(compact) <= 800
        and is_implementable_requirement(compact)
        and not looks_like_hardcoded_low_stock_template(compact)
    ):
        return compact
    return ""


def build_prd_user_card(
    *,
    core: str,
    scenario: dict[str, Any],
    scope: dict[str, Any],
    in_scope: list[str],
) -> dict[str, Any]:
    """步骤卡三问：要做什么 / 怎么干 / 干成啥 —— 必须可实施、禁套话。"""
    clean_core = (core or "").strip()
    if looks_like_requirement_boilerplate(clean_core):
        clean_core = ""
    one = to_one_liner(clean_core)
    # 「要做什么」优先【改动】意图，避免与摘要整段锚定文案重复堆叠
    what = one or clean_core
    if "【改动】" in clean_core:
        m = re.search(r"【改动】([^\n【]+)", clean_core)
        if m:
            leaf = _clean_whitespace(m.group(1))
            leaf = re.split(r"[。；;]须改|禁止改其它", leaf, maxsplit=1)[0].strip("。；; ")
            if leaf:
                what = leaf[:320]
    elif clean_core and "；" in clean_core:
        what = clean_core[:320]
    label = str(scenario.get("scenario_label") or "自适应")
    sid = str(scenario.get("scenario_id") or "adaptive")
    delivery = str(scenario.get("delivery") or "").strip()
    how = _how_for_requirement(clean_core, sid, delivery)
    done: list[str] = []
    for item in in_scope[:8]:
        t = str(item or "").strip()
        if not t or looks_like_requirement_boilerplate(t):
            continue
        if t not in done:
            done.append(t)
    if not done and what and not looks_like_requirement_boilerplate(what):
        for part in re.split(r"[；;]", what):
            p = part.strip()
            if len(p) >= 4 and p not in done:
                done.append(p)
    max_f = scope.get("max_files")
    if max_f:
        done.append(f"改动不超过 {max_f} 个文件，不做无关重构")
    done.append("步骤 6 验证命令通过")

    return {
        "one_liner": one if not looks_like_requirement_boilerplate(one) else (what[:160] or "（需求待补）"),
        "what": what or "（需求待补：请补充可实施的产品改动）",
        "how": how,
        "done_when": done,
        "scenario_label": label,
        "scenario_id": sid,
    }


def prd_result_lines(card: dict[str, Any], *, prd_rev: str) -> list[str]:
    done = card.get("done_when") if isinstance(card.get("done_when"), list) else []
    # 步骤卡只展示业务验收前几条，避免被「验证命令」淹没
    biz = [str(x) for x in done if "验证命令" not in str(x) and "改动不超过" not in str(x)]
    show = biz[:5] or [str(x) for x in done[:5]]
    return [
        f"【要做什么】{card.get('what') or '（待补充）'}",
        f"【怎么干】{card.get('how') or '—'}",
        "【干成啥】" + "；".join(show),
        f"【场景】{card.get('scenario_label')}（{card.get('scenario_id')}）· {prd_rev}",
    ]


def build_user_acceptance(in_scope: list[str], core: str) -> list[str]:
    out: list[str] = []
    for item in in_scope[:8]:
        t = str(item or "").strip()
        if t and not looks_like_requirement_boilerplate(t):
            out.append(t)
    if not out and core and not looks_like_requirement_boilerplate(core):
        for part in re.split(r"[；;]", core):
            p = part.strip()
            if len(p) >= 4:
                out.append(p[:240])
            if len(out) >= 6:
                break
    if not any("验证" in x for x in out):
        out.append("步骤 6 验证命令全部通过")
    return out


def to_one_liner(text: str, *, max_len: int = 160) -> str:
    t = _clean_whitespace(text)
    if not t or looks_like_requirement_boilerplate(t):
        return ""
    # 已锚定：摘要只取【改动】叶句，避免与「要做什么」整段重复
    if "【改动】" in t:
        m = re.search(r"【改动】([^\n【]+)", t)
        if m:
            leaf = _clean_whitespace(m.group(1))
            # 去掉门禁套话尾巴
            leaf = re.split(r"[。；;]须改|禁止改其它", leaf, maxsplit=1)[0].strip("。；; ")
            if leaf and is_implementable_requirement(leaf):
                if len(leaf) > max_len:
                    leaf = leaf[: max_len - 1] + "…"
                return leaf
    # 优先取第一个可实施分句
    for sep in ("；", ";", "。", "\n"):
        if sep in t:
            head = t.split(sep, 1)[0].strip()
            if is_implementable_requirement(head) and "【界面锚定】" not in head:
                t = head + ("。" if sep == "。" else "")
                break
    if len(t) > max_len:
        t = t[: max_len - 1] + "…"
    return t


def _how_for_requirement(core: str, sid: str, delivery: str) -> str:
    """按真实需求写「怎么干」，避免空泛套话。"""
    c = core or ""
    bits: list[str] = []
    if any(k in c for k in ("菜单", "侧栏", "导航")):
        bits.append("在对应菜单下挂入口")
    if any(k in c for k in ("页面", "页", "列表", "预警", "收藏夹")):
        bits.append("落地可访问页面与主路径交互")
    if "/api" in c.lower() or "接口" in c:
        bits.append("对接已有或规划中的接口（含筛选/分页）")
    if any(k in c for k in ("路由", "route")):
        bits.append("注册路由使页面可达")
    if "标红" in c or "缺口" in c:
        bits.append("按缺口规则展示并标红，空数据给空状态")
    if bits:
        return "；".join(bits)[:300]
    hints = {
        "enhance_existing": "在现有页面/接口上增量改，沿用当前入口",
        "frontend_ui": "只改前端页面与交互，不扩无关后端",
        "backend_api": "只改后端接口与数据逻辑",
        "bugfix": "定位根因，最小改动修复并回归",
        "full_feature": "按仓库惯例补齐菜单、路由、页面、接口",
        "config_only": "只改配置、文案或菜单项",
        "placeholder": "先落菜单+路由+可点占位页",
        "adaptive": "按仓库同类功能做最小必要改动",
    }
    base = hints.get(sid) or delivery or "按仓库同类功能做最小必要改动"
    return base[:300]


def _how_for_scenario(sid: str, delivery: str) -> str:
    return _how_for_requirement("", sid, delivery)


def _extract_task_from_mneme(text: str) -> str:
    """从记忆库 summary 里抠产品改动；跳过 preference / 流水线元需求。"""
    t = _cut_knowledge_protocol(text or "")
    patterns = [
        r"当前活跃主线是[^：]+：(.+?)(?=工作区为|另一条线是|〔已截断|$)",
        r"用户又要求(.+?)(?=工作区|另一条|〔|$)",
        r"报表中心「[^」]+」[^。]*。?",
        # 「- [summary] …：<产品改动>」
        r"(?m)^\s*[-*•]?\s*\[summary\][^：\n]*[：:](.+)$",
    ]
    for pat in patterns:
        m = re.search(pat, t, re.S)
        if not m:
            continue
        chunk = (m.group(1) if m.lastindex else m.group(0)).strip()
        chunk = re.sub(r"\s+", " ", chunk)
        if looks_like_pipeline_meta_not_product(chunk):
            continue
        if (
            len(chunk) >= 12
            and not looks_like_sandbox_policy(chunk)
            and not looks_like_requirement_boilerplate(chunk)
            and _has_concrete_product_change(chunk)
        ):
            return chunk[:800]
    # 逐行：summary 里带删除/新增等动词的才收
    for ln in t.splitlines():
        s = ln.strip()
        if not _PREF_SUMMARY_LINE_RE.match(s):
            continue
        if s.lower().find("[preference]") >= 0 or "[preference]" in s:
            continue
        body = re.sub(r"^\s*[-*•]?\s*\[summary\][^：:]*[：:]\s*", "", s, flags=re.I).strip()
        body = re.sub(r"\s+", " ", body)
        if (
            len(body) >= 12
            and _has_concrete_product_change(body)
            and not looks_like_pipeline_meta_not_product(body)
        ):
            return body[:800]
    return ""


def _cut_knowledge_protocol(text: str) -> str:
    """截断 Knowledge bases / retrieval protocol 之后的整段宿主注入。"""
    t = text or ""
    if not t:
        return ""
    low = t.lower()
    cut_at = -1
    for marker in (
        "knowledge bases mounted",
        "knowledge-first retrieval protocol",
        "knowledge-first retrieval",
    ):
        i = low.find(marker)
        if i >= 0 and (cut_at < 0 or i < cut_at):
            cut_at = i
    if cut_at >= 0:
        t = t[:cut_at]
    return t.strip()


def _strip_vision_boilerplate_tail(vision: str) -> str:
    """去掉首尾套话行；禁止用「以上是…」从文首吞掉整篇识图。"""
    v = vision or ""
    # 仅删文末套话（\Z=全文结束，避免 MULTILINE 误删正文）
    v = re.sub(r"\n+\s*以上是根据截图[\s\S]*\Z", "", v)
    v = re.sub(r"\n+\s*以下是根据截图[\s\S]*\Z", "", v)
    v = re.sub(r"\n+#{0,4}\s*待澄清问题[\s\S]*\Z", "", v)
    # 文首纯套话行逐行剥掉
    lines = v.splitlines()
    while lines and (
        looks_like_requirement_boilerplate(lines[0].strip())
        or not lines[0].strip()
        or lines[0].strip() in ("### 结构化需求草稿", "## 结构化需求草稿", "结构化需求草稿")
    ):
        # 标题「结构化需求草稿」可剥；有业务词的行保留
        head = lines[0].strip()
        if head.startswith("#") and "结构化需求草稿" in head and "低库存" not in head:
            lines.pop(0)
            continue
        if looks_like_requirement_boilerplate(head) or not head:
            lines.pop(0)
            continue
        break
    return "\n".join(lines).strip()


def _collect_action_bullets(text: str) -> list[str]:
    out: list[str] = []
    for ln in (text or "").splitlines():
        s = ln.strip()
        if not s.startswith(("-", "*", "•")):
            continue
        s = s.lstrip("-*• ").strip()
        s = re.sub(r"^\*\*([^*]+)\*\*[：:]\s*", r"\1：", s)
        s = _clean_whitespace(s)
        if len(s) < 4 or looks_like_requirement_boilerplate(s):
            continue
        # 页面结构字段不是改动动作
        if re.match(
            r"^(页面标题|菜单/导航路径|页面类型|筛选项|按钮|表头列名|可见示例行|分页/合计文案)[：:]",
            s,
        ):
            continue
        if not is_implementable_requirement(s) and not any(
            k in s for k in ("缺口", "空状态", "分页", "标红", "安全库存", "现存量")
        ):
            continue
        if s not in out:
            out.append(s[:200])
        if len(out) >= 8:
            break
    return out


def _strip_prompt_example_leakage(vision: str) -> str:
    """去掉模型把提示词样例抄进正文的污染（如「界面主标题原文，如『低库存预警』」）。"""
    lines: list[str] = []
    for ln in (vision or "").splitlines():
        s = ln.strip()
        if not s:
            lines.append(ln)
            continue
        if any(
            k in s
            for k in (
                "界面主标题原文",
                "如「低库存",
                "如\"低库存",
                "例如「低库存",
                "禁止套用任何示例业务",
                "禁止自行写成低库存",
            )
        ):
            # 整行是样例污染则丢；若后面还有真标题则只剥前缀
            cleaned = re.sub(
                r"[（(]?界面主标题原文[^）)]*[）)]?",
                "",
                s,
            )
            cleaned = re.sub(r"如[「\"“]低库存预警[」\"”]", "", cleaned)
            cleaned = cleaned.strip(" ：:（）()-")
            if cleaned and cleaned not in ("未见", "页面标题"):
                lines.append(cleaned)
            continue
        lines.append(ln)
    return "\n".join(lines)


def _looks_like_real_low_stock_ui(vision: str) -> bool:
    """真·低库存业务页（非提示词样例、非需求跟踪表）。"""
    v = vision or ""
    if "inventory-low-stock" in v.lower() or "/api/inventory-low-stock" in v:
        return True
    # 页面标题行必须是真实标题，不能是「如『低库存…』」
    if re.search(r"页面标题[：:]\s*低库存预警\b", v):
        return True
    # 业务表头组合：现存量+安全库存+缺口 同时出现才算
    hits = sum(1 for k in ("现存量", "安全库存", "缺口", "物料编码") if k in v)
    return hits >= 3 and "低库存" in v


def _extract_labeled_block(vision: str, labels: tuple[str, ...]) -> str:
    for lab in labels:
        m = re.search(
            rf"{re.escape(lab)}\s*[：:]\s*(.+?)(?=\n\s*[-*]|\n#|\n###|\Z)",
            vision,
            flags=re.S,
        )
        if m:
            t = _clean_whitespace(m.group(1))
            if t and t not in ("未见", "无"):
                return t[:600]
    return ""


def _extract_numbered_items(text: str) -> list[str]:
    out: list[str] = []
    # 按圆圈数字 / 1. 2. 切开
    parts = re.split(r"(?=①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩)|(?=[1-9]\s*[.、）)])", text or "")
    for p in parts:
        t = _clean_whitespace(p)
        t = re.sub(r"^[①②③④⑤⑥⑦⑧⑨⑩]\s*", "", t)
        t = re.sub(r"^[1-9]\s*[.、）)]\s*", "", t)
        t = t.strip("；;，,。 ")
        if len(t) >= 4 and t not in out and not looks_like_requirement_boilerplate(t):
            out.append(t[:200])
        if len(out) >= 8:
            break
    if not out:
        for m in re.finditer(
            r"[①②③④⑤⑥⑦⑧⑨⑩]\s*([^①②③④⑤⑥⑦⑧⑨⑩\n]{4,120})",
            text or "",
        ):
            t = _clean_whitespace(m.group(1)).strip("；;，,。 ")
            if t and t not in out:
                out.append(t[:200])
    return out


def _extract_requirements_matrix_task(vision: str) -> str:
    """从需求跟踪表识图抽可实施摘要（R04 / 功能要求 / 本项）。"""
    from .vision_surface import looks_like_requirements_matrix

    v = vision or ""
    if not looks_like_requirements_matrix(v):
        # 弱信号：有功能要求编号但列名不全
        if not (
            ("功能要求" in v or "本项" in v)
            and any(k in v for k in ("①", "②", "销售订单", "发货", "R04", "R0"))
        ):
            return ""

    code = ""
    m_code = re.search(r"\b(R\d{2})\b", v)
    if m_code:
        code = m_code.group(1)

    problem = _extract_labeled_block(
        v, ("本项/现状问题", "本项", "现状问题", "当前问题", "问题")
    )
    funcs_raw = _extract_labeled_block(
        v, ("功能要求", "功能需求", "实现内容", "附图附加文字")
    )
    accept_raw = _extract_labeled_block(v, ("验收标准", "验收", "预期结果"))

    # 附加文字整段也可能直接带 ①②③
    if not funcs_raw:
        for pat in (
            r"附图附加文字[：:]\s*([^\n]+)",
            r"按图中批注[：:]([^\n]+)",
        ):
            m = re.search(pat, v)
            if m:
                funcs_raw = _clean_whitespace(m.group(1))
                break

    func_items = _extract_numbered_items(funcs_raw) if funcs_raw else []
    if not func_items and funcs_raw:
        func_items = [funcs_raw[:240]]
    # 全文扫 ①②③（模型有时不放在「功能要求」标签下）
    if len(func_items) < 2:
        more = _extract_numbered_items(v)
        for x in more:
            if x not in func_items and any(
                k in x
                for k in ("订单", "发货", "列表", "新建", "校验", "关单", "登记", "页面")
            ):
                func_items.append(x)
            if len(func_items) >= 6:
                break

    accept_items = _extract_numbered_items(accept_raw) if accept_raw else []

    from .requirement_scope import extract_menu_anchor

    # 只认原文/识图已出现的菜单名；禁止再硬猜「生产管理 / 仓储管理」
    menu = extract_menu_anchor(v)

    bits: list[str] = []
    if code:
        bits.append(f"【{code}】")
    if menu:
        bits.append(f"菜单：{menu}（必须挂此侧栏，禁止改挂）")
    if problem and "低库存" not in problem:
        bits.append(problem[:160])
    if func_items:
        bits.append("功能：" + "；".join(f"{i+1}.{x}" for i, x in enumerate(func_items[:5])))
    elif funcs_raw and "低库存" not in funcs_raw:
        bits.append(funcs_raw[:240])
    if accept_items:
        bits.append("验收：" + "；".join(accept_items[:4]))

    out = _clean_whitespace(" ".join(bits))
    if out and is_implementable_requirement(out):
        return out[:800]
    return ""


def looks_like_hardcoded_low_stock_template(text: str) -> bool:
    """步骤卡被焊成低库存套模板（与用户附图无关）时的识别。"""
    t = text or ""
    return (
        "低库存预警页（已有页面）按截图改表" in t
        or (
            t.startswith("低库存预警页")
            and "按截图改表" in t
            and "销售订单" not in t
            and "发货" not in t
        )
    )


def _extract_new_column_name(blob: str) -> str:
    """从用户原话/识图抽取「新增××列」的列名；位置描述不当作列名。"""
    t = blob or ""
    m = re.search(
        r"(?:增加|新增|加上|加入|加(?!班))[「\"“']?([^」\"”'\n，。；;]{2,24})[」\"”']?(?:列|字段)",
        t,
    )
    if not m:
        return ""
    name = m.group(1).strip().strip("「」\"“”' ")
    if not name or len(name) > 24:
        return ""
    if re.search(r"第\s*\d+\s*列", name) or "之间" in name or "区域" in name:
        return ""
    if name in ("一", "一列", "字段", "列"):
        return ""
    # 「删除加班工时」等不得抽成新列名
    before = t[max(0, m.start() - 8) : m.start()]
    if any(k in before for k in ("删除", "移除", "去掉", "隐藏")):
        return ""
    return name


def _extract_between_columns_task(vision: str, user_text: str = "") -> str:
    """红框落在两列表头之间 → 按位置推断「新增一列」，列名优先用户原话，其次图上批注。

    禁止：因表头里出现「班别」就套成「班别筛选 / 按需展示明细列」。
    禁止：把「位于第7列和第8列之间」当列名。
    禁止：把「加班工时位于第9列和第10列之间」这种圈中现有列误判成插列（应删/改该列）。
    """
    from .vision_surface import (
        _is_position_only_overlay,
        extract_overlay_change_phrases,
        highlighted_existing_column,
        parse_vision_surface,
    )

    v = vision or ""
    user = (user_text or "").strip()
    # 行级标注只看「标注与改动暗示」段，禁止因「可见示例行」表样板误杀加列
    mark_blob = v
    m_sec = re.search(r"###\s*标注与改动暗示([\s\S]{0,1200})", v)
    if m_sec:
        mark_blob = m_sec.group(1)
    row_level = any(
        k in mark_blob
        for k in ("新增一条", "增加一条", "圈住一行", "该行记录", "删除红框处记录")
    ) and not any(
        k in mark_blob for k in ("新增一列", "增加一列", "加一列", "新增列", "增加列", "第")
    )
    if row_level and "列之间" not in mark_blob and not re.search(r"第\s*\d+\s*列", mark_blob):
        return ""

    surf = parse_vision_surface(v)
    page = str(surf.get("page_title") or "").strip() or "本页"
    cols = [str(c) for c in (surf.get("table_columns") or []) if str(c).strip()]

    # 圈中现有列（删列）优先于「两列之间插列」
    circled = highlighted_existing_column(f"{user}\n{v}", cols)
    explicit_add = bool(
        re.search(
            r"(?:增加|新增|插入|加(?!班)).{0,12}(?:一列|列|字段)",
            f"{user}\n{mark_blob}",
        )
        or ("空白" in mark_blob and "列" in mark_blob)
    )
    if circled and not explicit_add:
        return f"{page}：删除「{circled}」列（红框圈中该列；非两列之间新增）"[:400]

    overlays = extract_overlay_change_phrases(v)
    overlays = [
        p
        for p in overlays
        if p
        and not re.search(r"(合计|Total|导出|page)", p, re.I)
        and len(p) >= 4
        and not _is_position_only_overlay(p)
    ]

    # 列名：用户原话 > 识图正文「新增××列」> 有效批注
    explicit_col = _extract_new_column_name(user) or _extract_new_column_name(v)
    if not explicit_col:
        for p in overlays:
            name = _extract_new_column_name(p)
            if name:
                explicit_col = name
                break

    left = right = ""
    m_idx = re.search(r"第\s*(\d+)\s*列.*?第\s*(\d+)\s*列.*?之间", v)
    # 若已是「列名位于第N…之间」圈列形态，不再当插列位置
    if circled:
        m_idx = None
    if m_idx:
        i, j = int(m_idx.group(1)), int(m_idx.group(2))
        if cols and 1 <= i <= len(cols):
            left = cols[i - 1]
        else:
            left = f"第{i}列"
        if cols and 1 <= j <= len(cols):
            right = cols[j - 1]
        else:
            right = f"第{j}列"
    else:
        m_name = re.search(
            r"(?:位于|在)[「\"“']([^」\"”']{1,20})[」\"”'].{0,12}[「\"“']([^」\"”']{1,20})[」\"”'].{0,8}之间",
            v,
        )
        if m_name:
            left, right = m_name.group(1).strip(), m_name.group(2).strip()

    # 用户原话已写清加列但识图没「之间」——仍可出摘要
    if not (left and right) and not explicit_col:
        return ""
    if left and right:
        if explicit_col:
            return (
                f"{page}：在「{left}」与「{right}」之间新增「{explicit_col}」列"
                f"（位置以红框/标注为准）"
            )[:400]
        hint = "列名以用户原话/图上批注为准，禁止改成筛选条件或其它列"
        if user and user not in (
            "（附图需求，详见识图结果）",
            "(附图需求，详见识图结果)",
        ):
            hint = f"列名以用户原话为准：{user[:80]}"
        return f"{page}：在「{left}」与「{right}」之间新增一列（{hint}）"[:400]
    if explicit_col:
        return f"{page}：新增「{explicit_col}」列（位置以图中红框/标注为准）"[:400]
    return ""


def _extract_task_from_vision(vision: str, user_text: str = "") -> str:
    """从识图正文提炼可实施需求。禁止用提示词样例/页面字段硬模板盖掉图中真意图。"""
    v0 = _strip_vision_boilerplate_tail(vision or "")
    v = _strip_prompt_example_leakage(v0)
    if looks_like_sandbox_policy(v):
        return ""

    # 0) 用户原话已写清加列：直接与识图位置合并
    user = (user_text or "").strip()
    if user and _extract_new_column_name(user):
        between_u = _extract_between_columns_task(v, user_text=user)
        if between_u:
            return between_u
        # 无位置信息时至少保留用户原话（可实施）
        if is_implementable_requirement(user):
            page_m = re.search(r"页面标题[：:]\s*([^\n]+)", v)
            page = (page_m.group(1).strip() if page_m else "") or ""
            col = _extract_new_column_name(user)
            if page and col:
                return f"{page}：新增「{col}」列（{user[:120]}）"[:400]
            return user[:400]

    # 1) 需求跟踪表优先（R04 / 功能要求 / 销售订单…）
    matrix = _extract_requirements_matrix_task(v)
    if matrix:
        return matrix

    # 2) 红框夹在两列之间 / 批注「新增xxx列」——灵活抽取，禁止写死「班别筛选」类模板
    between = _extract_between_columns_task(v, user_text=user)
    if between:
        return between

    # 3) 仅当正文明确写「新增/增加班别筛选」时才保留班别句（表头出现「班别」不算）
    if re.search(r"(?:新增|增加|加).{0,12}班别.{0,10}筛", v) or (
        "查询条件" in v and re.search(r"(?:新增|增加|加).{0,8}班别", v)
    ):
        m = re.search(
            r"[^。\n]{0,20}(?:新增|增加|加)[^。\n]{0,20}班别[^。\n]{0,40}",
            v,
        )
        if m:
            page_m = re.search(r"页面标题[：:]\s*([^\n]+)", v)
            page = (page_m.group(1).strip() if page_m else "") or "员工工时报表"
            return f"{page}：{m.group(0).strip()}"[:400]

    # 4) 仅当图面真是低库存业务页时，才走低库存增强；意图来自批注，不写死「按截图改表」
    if _looks_like_real_low_stock_ui(v):
        from .vision_surface import extract_overlay_change_phrases

        overlays = extract_overlay_change_phrases(v)
        col_m = re.search(
            r"(?:增加|新增|加)[「\"“']?([^」\"”'\n，。；;]{2,24})[」\"”']?(?:列|字段)",
            v,
        )
        bits: list[str] = ["低库存预警页"]
        if overlays:
            bits.append(overlays[0][:120])
        elif col_m:
            bits.append(f"增加「{col_m.group(1).strip()}」列（位置以红框/标注为准）")
        elif any(k in v for k in ("红框", "加一列", "加字段", "入库时间", "入库数量")):
            bits.append("按图中红框与批注改表（列名以批注原文为准）")
        else:
            bits.append("按截图可见表头与操作完善页面")
        if "/api/inventory-low-stock" in v or "inventory-low-stock" in v.lower():
            bits.append("同步 /api/inventory-low-stock 相关字段")
        return "；".join(bits)[:400]

    if "收藏夹" in v and "低库存" not in v:
        bits = ["实现收藏夹页面（非占位）"]
        if "顶栏" in v or "收藏当前" in v:
            bits.append("顶栏可收藏/取消收藏当前页")
        if "去重" in v or "上限" in v or "账号" in v:
            bits.append("同路径去重、上限与账号隔离")
        return "；".join(bits)[:400]

    for pat in (
        r"(收藏夹[^。\n]{4,80})",
        r"(功能要求[：:][^\n]{4,200})",
        r"(需求描述[：:][^\n]{4,200})",
        r"(本项[：:][^\n]{4,200})",
    ):
        m = re.search(pat, v)
        if m:
            got = _clean_whitespace(m.group(1))[:400]
            if is_implementable_requirement(got) and not looks_like_hardcoded_low_stock_template(
                got
            ):
                return got
    bullets = _collect_action_bullets(v)
    if bullets:
        return "；".join(bullets[:5])[:400]
    m = re.search(r"####\s*1[.)][^\n]*\n([\s\S]{0,500})", v)
    if m:
        block_lines = _collect_action_bullets(m.group(1))
        if block_lines:
            return "；".join(block_lines[:4])[:400]
    return ""


def _strip_injection_blocks(text: str) -> str:
    lines: list[str] = []
    for ln in _cut_knowledge_protocol(text or "").splitlines():
        s = ln.strip()
        if not s:
            continue
        low = s.lower()
        if any(m in low for m in _RUNTIME_MARKERS):
            continue
        if s.startswith("[记忆库]") or "dsh-mneme" in low:
            continue
        if "<system-reminder>" in low or "</system-reminder>" in low:
            continue
        if "<available_skills>" in low or "</available_skills>" in low:
            continue
        if _PREF_SUMMARY_LINE_RE.match(s):
            # preference 整行丢；summary 若含具体产品改动则保留正文
            if "[preference]" in s.lower() or "[preference]" in s:
                continue
            body = re.sub(
                r"^\s*[-*•]?\s*\[summary\][^：:]*[：:]\s*",
                "",
                s,
                flags=re.I,
            ).strip()
            if body and _has_concrete_product_change(body) and not looks_like_pipeline_meta_not_product(
                body
            ):
                lines.append(body)
            continue
        if any(s.startswith(p) for p in _DEV_NOISE_PREFIXES):
            continue
        if looks_like_requirement_boilerplate(s):
            continue
        if looks_like_pipeline_meta_not_product(s):
            continue
        lines.append(s)
    return _clean_whitespace("\n".join(lines))


def _first_meaningful_paragraph(text: str) -> str:
    if looks_like_sandbox_policy(text):
        return ""
    for block in re.split(r"\n{2,}", text):
        b = _clean_whitespace(block)
        if looks_like_sandbox_policy(b) or looks_like_requirement_boilerplate(b):
            continue
        if b.startswith("#"):
            continue
        if len(b) >= 20 and is_implementable_requirement(b):
            return b[:800]
    extracted = _extract_task_from_vision(text)
    if extracted:
        return extracted
    return ""


def _clean_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


# 兼容旧名
_looks_like_vision_boilerplate = looks_like_requirement_boilerplate
