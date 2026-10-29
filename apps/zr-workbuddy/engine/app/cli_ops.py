"""与 engine_cli / HTTP /api/cli 共用的命令实现。"""

from __future__ import annotations

from .config_store import load_config
from .health import check_net, llm_ready
from .nl_engine import llm_chat, parse_question
from . import plugins_store

# 查数落库路径见 ask_data（默认禁止演示库冒充业务结果）。
# analyzer / demo_data 含 pandas：仅在 ask_data 内延迟导入。

# feature id ↔ 能力：面板 chat / CLI / Agent 工具必须共用同一启停门闸
FEATURE_ASK = "mes-ask"
FEATURE_CONFIG = "mes-config"
FEATURE_PCB = "mes-pcb"
FEATURE_CODE_DEV = "code-dev"
FEATURE_CODE_REVIEW = "code-review"
FEATURE_CODE_COMMIT = "code-commit"
FEATURE_CODE_DEPLOY = "code-deploy"
FEATURE_DEV_PIPELINE = "dev-pipeline"
FEATURE_VISION = "vision"


def _ask_disabled_chat_response() -> dict:
    hint = plugins_store.disabled_hint(FEATURE_ASK, capability="MES 自然语言查数")
    return {
        "ok": True,
        "reply": hint,
        "thinking": "",
        "chart": None,
        "table": None,
        "note": "mes-ask 未启用",
        "source": "disabled",
        "data_source": "assistant",
        "intent": {"type": "disabled", "metric": "", "dim": None, "chart": None},
    }


async def chat_stream(text: str, *, code_dev_brief: dict | None = None):
    """流式聊天事件生成器（供 /api/chat/stream）。
    yield dict：status|thinking|reply|meta|error|done
    """
    text = (text or "").strip()
    if not text:
        yield {"type": "error", "detail": "问题不能为空"}
        return

    from .pcb_expert import feature_enabled, is_pcb_question, pcb_ask_stream
    from .code_dev import handle_chat_code_dev, is_code_dev_question
    from .code_review import handle_chat_code_review, is_code_review_question
    from .code_commit import (
        handle_chat_code_commit,
        handle_chat_fix_from_gate,
        is_code_commit_question,
        is_fix_from_gate_question,
    )
    from .code_deploy import handle_chat_code_deploy, is_code_deploy_question
    def _emit_code_deploy(out: dict):
        thinking = out.get("thinking") or ""
        events = []
        if thinking:
            events.append({"type": "thinking", "text": thinking})
        if out.get("reply"):
            events.append({"type": "reply", "delta": out["reply"]})
        events.append(
            {
                "type": "done",
                "ok": bool(out.get("ok", True)),
                "reply": out.get("reply") or "",
                "thinking": thinking,
                "chart": None,
                "table": None,
                "note": out.get("note"),
                "source": out.get("source") or "code_deploy",
                "data_source": out.get("data_source") or "code_deploy",
                "intent": out.get("intent") or {"type": "code_deploy", "metric": "", "dim": None, "chart": None},
                "job_id": out.get("job_id"),
                "code_deploy_ui": out.get("code_deploy_ui"),
            }
        )
        return events
    def _emit_code_commit(out: dict):
        thinking = out.get("thinking") or ""
        events = []
        if thinking:
            events.append({"type": "thinking", "text": thinking})
        if out.get("reply"):
            events.append({"type": "reply", "delta": out["reply"]})
        events.append(
            {
                "type": "done",
                "ok": bool(out.get("ok", True)),
                "reply": out.get("reply") or "",
                "thinking": thinking,
                "chart": None,
                "table": None,
                "note": out.get("note"),
                "source": out.get("source") or "code_commit",
                "data_source": out.get("data_source") or "code_commit",
                "intent": out.get("intent") or {"type": "code_commit", "metric": "", "dim": None, "chart": None},
                "job_id": out.get("job_id"),
                "findings": out.get("findings"),
                "code_commit_ui": out.get("code_commit_ui"),
                "code_dev_ui": out.get("code_dev_ui"),
                "code_dev_brief": out.get("code_dev_brief"),
            }
        )
        return events

    def _emit_code_review(out: dict):
        thinking = out.get("thinking") or ""
        events = []
        if thinking:
            events.append({"type": "thinking", "text": thinking})
        if out.get("reply"):
            events.append({"type": "reply", "delta": out["reply"]})
        events.append(
            {
                "type": "done",
                "ok": bool(out.get("ok", True)),
                "reply": out.get("reply") or "",
                "thinking": thinking,
                "chart": None,
                "table": None,
                "note": out.get("note"),
                "source": out.get("source") or "code_review",
                "data_source": out.get("data_source") or "code_review",
                "intent": out.get("intent") or {"type": "code_review", "metric": "", "dim": None, "chart": None},
                "report_id": out.get("report_id"),
                "findings": out.get("findings"),
                "code_review_ui": out.get("code_review_ui"),
            }
        )
        return events

    def _emit_code_dev(out: dict):
        """统一写码结果事件（含 code_dev_ui，禁止丢卡）。"""
        thinking = out.get("thinking") or ""
        events = []
        if thinking:
            events.append({"type": "thinking", "text": thinking})
        if out.get("reply"):
            events.append({"type": "reply", "delta": out["reply"]})
        intent = out.get("intent") or {"type": "code_dev", "metric": "", "dim": None, "chart": None}
        note = out.get("note")
        ui = out.get("code_dev_ui")
        events.append(
            {
                "type": "done",
                "ok": True,
                "reply": out.get("reply") or "",
                "thinking": thinking,
                "chart": None,
                "table": None,
                "note": note,
                "source": out.get("source") or "code_dev",
                "data_source": out.get("data_source") or "code_dev",
                "intent": intent,
                "job_id": out.get("job_id"),
                "code_dev_ui": ui,
                "code_dev_brief": out.get("code_dev_brief"),
            }
        )
        return events

    # 按插件增量部署：优先于提交/写码（对齐 simplified）
    if is_code_deploy_question(text):
        if plugins_store.is_enabled(FEATURE_CODE_DEPLOY):
            yield {"type": "status", "detail": "正在分析要部署的插件单元…"}
        out = await handle_chat_code_deploy(text)
        for ev in _emit_code_deploy(out):
            yield ev
        return

    # 门禁阻断 → 写码修复闭环（先于「提交代码」选目录）
    if is_fix_from_gate_question(text):
        if plugins_store.is_enabled(FEATURE_CODE_COMMIT):
            yield {"type": "status", "detail": "正在根据提交门禁整理修复确认卡…"}
        out = await handle_chat_fix_from_gate(text)
        # 有写码确认卡时按写码事件透传，保证面板挂 code_dev_ui
        if out.get("code_dev_ui"):
            for ev in _emit_code_dev(out):
                yield ev
        else:
            for ev in _emit_code_commit(out):
                yield ev
        return

    # 人触发提交：先于审码/写码（「提交代码」勿误入审码）
    if is_code_commit_question(text):
        if plugins_store.is_enabled(FEATURE_CODE_COMMIT):
            yield {"type": "status", "detail": "请选择要提交的本机 Git 工程…"}
        out = await handle_chat_code_commit(text)
        for ev in _emit_code_commit(out):
            yield ev
        return

    # 本机审码：先识别意图；未启用则明确提示，禁止落入写码/MES（停插件后 LLM 易把「审核代码」误判成写码）
    if is_code_review_question(text):
        if plugins_store.is_enabled(FEATURE_CODE_REVIEW):
            yield {"type": "status", "detail": "请选择要审核的本机工程目录…"}
        out = await handle_chat_code_review(text)
        for ev in _emit_code_review(out):
            yield ev
        return

    # 写码意图：未启用同样先提示，不落入查数/LLM 二次分流
    if is_code_dev_question(text):
        if plugins_store.is_enabled(FEATURE_CODE_DEV):
            yield {"type": "status", "detail": "正在梳理写码需求…"}
        out = await handle_chat_code_dev(text, client_brief=code_dev_brief)
        for ev in _emit_code_dev(out):
            yield ev
        return

    if is_pcb_question(text) and feature_enabled():
        async for ev in pcb_ask_stream(text):
            if ev.get("type") == "done" and ev.get("ok"):
                yield {
                    **ev,
                    "data_source": "pcb_expert",
                    "intent": {"type": "pcb_chat", "metric": "", "dim": None, "chart": None},
                    "chart": None,
                    "table": None,
                }
            else:
                yield ev
        return

    # PCB 问题但 feature 已停用：明确提示（不误走 MES 查数、也不偷偷调专家）
    if is_pcb_question(text) and not feature_enabled():
        from .pcb_expert import disabled_hint

        hint = disabled_hint()
        yield {"type": "reply", "delta": hint}
        yield {
            "type": "done",
            "ok": True,
            "reply": hint,
            "thinking": "",
            "source": "disabled",
            "data_source": "pcb_expert",
            "intent": {"type": "pcb_chat", "metric": "", "dim": None, "chart": None},
            "note": "mes-pcb 未启用",
            "chart": None,
            "table": None,
        }
        return

    # MES 查数：须 mes-ask 已启用（与 Agent 工具 mes_ask 同一真相源）
    if not plugins_store.is_enabled(FEATURE_ASK):
        out = _ask_disabled_chat_response()
        yield {"type": "reply", "delta": out["reply"]}
        yield {
            "type": "done",
            "ok": True,
            "reply": out["reply"],
            "thinking": "",
            "chart": None,
            "table": None,
            "note": out.get("note"),
            "source": "disabled",
            "data_source": out.get("data_source"),
            "intent": out.get("intent"),
        }
        return

    # MES 查数：先提示再一次性返回完整结果（规则/分析路径不便 token 流）
    # 注意：LLM 可能中途判成写码 → chat() 返回 code_dev，必须透传 code_dev_ui
    yield {"type": "status", "detail": "正在查询与分析…"}
    out = await chat(text)
    if not out.get("ok"):
        yield {"type": "error", "detail": out.get("detail") or "查询失败"}
        return
    if (
        out.get("code_deploy_ui")
        or out.get("source") == "code_deploy"
        or (out.get("intent") or {}).get("type") == "code_deploy"
    ):
        for ev in _emit_code_deploy(out):
            yield ev
        return
    if (
        out.get("code_dev_ui")
        or out.get("source") == "code_dev"
        or (out.get("intent") or {}).get("type") == "code_dev"
    ):
        for ev in _emit_code_dev(out):
            yield ev
        return
    if out.get("thinking"):
        yield {"type": "thinking", "text": out["thinking"]}
    if out.get("reply"):
        yield {"type": "reply", "delta": out["reply"]}
    yield {
        "type": "done",
        "ok": True,
        "reply": out.get("reply") or "",
        "thinking": out.get("thinking") or "",
        "chart": out.get("chart"),
        "table": out.get("table"),
        "note": out.get("note"),
        "source": out.get("source"),
        "data_source": out.get("data_source"),
        "intent": out.get("intent"),
        "llm_tried": out.get("llm_tried"),
        "llm_error": out.get("llm_error"),
        "code_dev_ui": out.get("code_dev_ui"),
    }


async def chat(
    text: str,
    *,
    code_dev_brief: dict | None = None,
    ask_context: str = "",
    workspace: str = "",
) -> dict:
    text = (text or "").strip()
    if not text:
        return {"ok": False, "detail": "问题不能为空"}

    from .code_dev import handle_chat_code_dev, is_code_dev_question
    from .code_review import handle_chat_code_review, is_code_review_question
    from .code_commit import (
        handle_chat_code_commit,
        handle_chat_fix_from_gate,
        is_code_commit_question,
        is_fix_from_gate_question,
    )
    from .code_deploy import handle_chat_code_deploy, is_code_deploy_question
    from .pcb_expert import chat_response, is_pcb_question, pcb_ask

    # 部署优先于提交 / 审码 / 写码
    if is_code_deploy_question(text):
        return await handle_chat_code_deploy(text)

    # 提交 / 审码 / 写码：意图命中即入对应 handler（handler 内处理未启用提示），禁止再走 LLM 误分流
    if is_fix_from_gate_question(text):
        return await handle_chat_fix_from_gate(text)

    if is_code_commit_question(text):
        return await handle_chat_code_commit(text)

    if is_code_review_question(text):
        return await handle_chat_code_review(text)

    if is_code_dev_question(text):
        return await handle_chat_code_dev(text, client_brief=code_dev_brief)

    # PCB 工艺问题：仅当 mes-pcb feature 已启用才走专家（热插拔真相源 = plugins.json）
    if is_pcb_question(text):
        return chat_response(await pcb_ask(text))

    # MES 自然语言查数：须 mes-ask 已启用（面板与 Agent 同源）
    if not plugins_store.is_enabled(FEATURE_ASK):
        return _ask_disabled_chat_response()

    cfg = load_config()
    ask_ws = str(workspace or "").strip()
    try:
        from .mes_profile import cfg_for_ask

        cfg = cfg_for_ask(cfg, ask_ws or None)
    except Exception:
        pass
    intent = parse_question(text)
    ask_ctx = str(ask_context or "").strip()
    if ask_ctx and isinstance(intent, dict):
        intent["context"] = ask_ctx
    if ask_ws and isinstance(intent, dict):
        intent["workspace"] = ask_ws
    source = "rule"
    llm_tried = False
    llm_error = None
    from .llm_config import resolve_llm_cfg
    from .ask_data import (
        docs_query_intent,
        resolve_ask_query,
        special_reply_for_ask,
        try_imported_api_answer,
    )
    from .ask_api_route import list_queryable_endpoints, looks_like_imported_query

    def _with_ask_context(it: dict | None) -> dict:
        base = dict(it) if isinstance(it, dict) else docs_query_intent(text)
        if ask_ctx:
            base["context"] = ask_ctx
        if ask_ws:
            base["workspace"] = ask_ws
        if not str(base.get("raw") or "").strip():
            base["raw"] = text
        return base

    def _pack_ask_result(result: dict, *, src: str, intent_obj: dict | None = None) -> dict:
        it = intent_obj if isinstance(intent_obj, dict) else {}
        return {
            "ok": True,
            "reply": result.get("reply") or "",
            "chart": result.get("chart"),
            "table": result.get("table"),
            "note": result.get("note"),
            "title": result.get("title"),
            "source": src,
            "data_source": str(result.get("data_source") or "assistant"),
            "llm_tried": llm_tried,
            "llm_error": llm_error,
            "matched_endpoint": result.get("matched_endpoint"),
            "intent": {
                "metric": it.get("metric", ""),
                "dim": it.get("dim"),
                "type": it.get("type") or "list",
                "chart": it.get("chart"),
                "range_desc": it.get("range_desc"),
                "filters": it.get("filters") or {},
            },
        }

    # 规则未认硬指标，但与已导入接口词面贴近 → 直接当查数，少让 LLM 判成闲聊
    skip_llm_for_api = False
    if intent.get("type") == "unknown":
        soft = _with_ask_context(docs_query_intent(text))
        if looks_like_imported_query(text, cfg, intent=soft):
            intent = soft
            source = "api_hint"
            skip_llm_for_api = True

    llm_cfg = resolve_llm_cfg(cfg)
    if llm_ready(cfg) and not skip_llm_for_api:
        llm_tried = True
        mes_block = cfg.get("mes") if isinstance(cfg.get("mes"), dict) else {}
        mes_connected = bool(str(mes_block.get("base_url") or "").strip())
        allow_demo = bool(mes_block.get("allow_demo_fallback"))
        if mes_connected:
            context = "数据源：MES 实时（已按工作区或唯一已接通的对接卡连接业务系统）。查数必须 kind=query，禁止声称业务数据源未接通。"
        elif allow_demo:
            context = "数据源：演示数据（当前对接卡未连接 MES，且已开启演示回退）"
        else:
            context = "数据源：当前这条问数所用对接卡还没有业务地址。不要编造数字，也不要把「正在编辑的空卡」说成整个产品都没配 MES。"
        eps = list_queryable_endpoints(cfg)
        if eps:
            bits = []
            for ep in eps[:30]:
                label = str(ep.get("desc") or ep.get("name") or "").strip() or str(ep.get("path") or "")
                bits.append(f"{label}（GET {ep.get('path')}）")
            context += (
                "\n已导入可查询只读接口（摘录，共 "
                + str(len(eps))
                + " 个 GET）："
                + "；".join(bits)
                + "。用户问到上述业务时必须 kind=query，禁止说不在可查范围/请到 EAM。"
            )
        try:
            from .intent_triage import append_ask_hint

            context = append_ask_hint(context, ask_ws)
        except Exception:
            pass
        r = await llm_chat(text, llm_cfg, context)
        if r and r.get("kind") == "code_deploy":
            return await handle_chat_code_deploy(text)
        if r and r.get("kind") == "code_dev":
            return await handle_chat_code_dev(text, client_brief=code_dev_brief)
        if r and r.get("kind") == "query" and r.get("intent"):
            intent = _with_ask_context(r["intent"])
            source = "llm"
        elif r and r.get("kind") == "chat":
            # LLM 可能误判「保养计划」等为边界闲聊：先试导入接口，命中则出数
            soft = _with_ask_context(docs_query_intent(text))
            api_hit = await try_imported_api_answer(text, cfg, intent=soft)
            if api_hit is not None:
                return _pack_ask_result(api_hit, src="api_docs", intent_obj=soft)
            return {"ok": True, "reply": r["reply"], "chart": None, "table": None,
                    "note": None, "source": "llm", "data_source": "assistant",
                    "intent": {"type": "chat", "metric": "", "dim": None, "chart": None}}
        else:
            provider = (llm_cfg.get("provider") or "deepseek").lower()
            llm_error = ("LLM 未连通（DeepSeek API 需要外网）→ 已用规则引擎"
                         if provider == "deepseek" and not check_net()
                         else "LLM 未返回有效意图 → 已用规则引擎")

    queryable = list_queryable_endpoints(cfg)
    special = {
        "greeting": "👋 你好！我是江西中软工作助手。\n想知道什么？比如：「今天完工工单数量」「最近7天各产线产量对比」。",
        "thanks": "不客气！还有想问的随时找我 😊",
        "help": "我是江西中软工作助手，可帮你查生产数据：产量/良率/不良率/OEE/缺陷/工单（完工、在制、总数），支持趋势/对比/排名/占比/原因分析。也可以问概念，如「OEE是什么」。",
        "unknown": "😅 没完全理解你的问题。可以这样问我：\n• 今天完工工单数量\n• 今天正在生产的工单有多少个\n• 最近7天各产线产量对比\n• 分析8月30号良率过低的原因",
    }
    if queryable:
        # 有导入接口时，帮助/未知少绑死制造指标，示例交给 special_reply_for_ask 附加
        special["greeting"] = (
            "👋 你好！我是江西中软工作助手。\n"
            "可以直接问已导入业务接口相关的数据，例如保养计划、工单列表等。"
        )
        special["help"] = (
            "我是江西中软工作助手：可按配置中心里已导入的只读接口查业务数据；"
            "经典制造指标（产量/良率/OEE/工单等）在仍接通对应系统时也可问。也可以问概念。"
        )
        special["unknown"] = (
            "😅 没完全理解你的问题。可以换个说法，或按已导入接口的业务名称来问。"
        )
    if intent.get("type") in special:
        # 规则引擎 unknown：同样优先导入接口（如保养计划不在硬编码词表）
        if intent.get("type") == "unknown":
            soft = _with_ask_context(docs_query_intent(text))
            api_hit = await try_imported_api_answer(text, cfg, intent=soft)
            if api_hit is not None:
                return _pack_ask_result(api_hit, src="api_docs", intent_obj=soft)
        reply = special_reply_for_ask(str(intent.get("type") or ""), special[intent["type"]], cfg)
        return {"ok": True, "reply": reply, "chart": None,
                "table": None, "note": None, "source": source,
                "data_source": "assistant",
                "intent": {"type": intent["type"], "metric": "", "dim": None, "chart": None}}

    intent = _with_ask_context(intent)
    result = await resolve_ask_query(intent, cfg)
    data_source = str(result.get("data_source") or "assistant")

    return {
        "ok": True,
        "reply": result.get("reply") or "",
        "chart": result.get("chart"),
        "table": result.get("table"),
        "note": result.get("note"),
        "title": result.get("title"),
        "source": source,
        "data_source": data_source,
        "llm_tried": llm_tried,
        "llm_error": llm_error,
        "matched_endpoint": result.get("matched_endpoint"),
        "intent": {"metric": intent.get("metric"), "dim": intent.get("dim"), "type": intent.get("type"),
                   "chart": intent.get("chart"), "range_desc": intent.get("range_desc"),
                   "filters": intent.get("filters")},
    }


async def run_async(cmd: str, rest: list[str]) -> dict:
    if cmd == "ask":
        blocked = plugins_store.require_enabled(FEATURE_ASK, capability="MES 自然语言查数")
        if blocked:
            # 与面板一致：可读提示；Agent resultRender 用 detail/reply
            hint = blocked["detail"]
            return {
                "ok": True,
                "reply": hint,
                "thinking": "",
                "chart": None,
                "table": None,
                "note": blocked.get("note"),
                "source": "disabled",
                "data_source": "assistant",
                "detail": hint,
            }
        ask_context = ""
        ask_workspace = ""
        q_parts: list[str] = []
        i = 0
        while i < len(rest):
            if rest[i] == "--ask-context" and i + 1 < len(rest):
                ask_context = str(rest[i + 1] or "").strip()
                i += 2
                continue
            if str(rest[i] or "").startswith("workspace="):
                ask_workspace = str(rest[i] or "")[len("workspace=") :].strip()
                i += 1
                continue
            q_parts.append(rest[i])
            i += 1
        out = await chat(
            " ".join(q_parts) if q_parts else "",
            ask_context=ask_context,
            workspace=ask_workspace,
        )
        if not out.get("ok"):
            return {"ok": False, "detail": out.get("detail") or "问题为空"}
        return out
    if cmd == "pcb-ask":
        from .pcb_expert import pcb_ask
        return await pcb_ask(" ".join(rest) if rest else "")
    if cmd == "status":
        blocked = plugins_store.require_enabled(FEATURE_CONFIG, capability="MES / LLM 连接状态")
        if blocked:
            return blocked
        from .status_info import build_status
        return build_status(include_demo=False)
    if cmd in ("coding-allowed", "auth-coding-allowed"):
        from .auth.capabilities import coding_allowed_status

        return coding_allowed_status()
    if cmd in ("recover-db-sync", "cursor-chat-recover-db"):
        from .cursor_chat_recover import recover_cchat_db_sync_fail

        jid = rest[0] if rest else ""
        return recover_cchat_db_sync_fail(jid)
    if cmd == "config-test-mes":
        blocked = plugins_store.require_enabled(FEATURE_CONFIG, capability="MES 连接测试")
        if blocked:
            return blocked
        from .mes_client import probe_connection
        cfg = load_config()
        return await probe_connection(cfg.get("mes") or {})
    if cmd == "config-test-llm":
        blocked = plugins_store.require_enabled(FEATURE_CONFIG, capability="LLM 连接测试")
        if blocked:
            return blocked
        cfg = load_config()
        from .llm_config import resolve_llm_cfg

        llm = resolve_llm_cfg(cfg)
        provider = (llm.get("provider") or "deepseek").lower()
        if provider == "none":
            return {"ok": False, "detail": "LLM 未配置（请在配置中心选择提供方并填写 Key/模型）"}
        if provider == "ollama" and not (llm.get("model") or "").strip():
            return {"ok": False, "detail": "Ollama 未配置模型名"}
        if provider in ("deepseek", "openai_compat") and not (llm.get("api_key") or "").strip():
            return {"ok": False, "detail": "请先填写 API Key"}
        if provider == "openai_compat" and not (llm.get("model") or "").strip():
            return {"ok": False, "detail": "通用模型配置须填写模型名"}
        try:
            r = await llm_chat("你好", llm, "环境：连接测试", lane="config_test")
            return {"ok": r is not None,
                    "detail": f"LLM 引擎可用（{provider} / {llm.get('model')}）"
                    if r else "LLM 调用失败（未返回有效响应）"}
        except Exception as e:
            return {"ok": False, "detail": f"LLM 调用异常：{type(e).__name__}: {e}"}
    if cmd == "plugins-list":
        return plugins_store.snapshot()
    if cmd == "plugins-enable":
        fid = rest[0] if rest else ""
        return plugins_store.enable(fid)
    if cmd == "plugins-disable":
        fid = rest[0] if rest else ""
        return plugins_store.disable(fid)
    if cmd == "code-dev-status":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEV, capability="本机 Cursor 写码")
        if blocked:
            return blocked
        from .code_dev import status as code_dev_status
        return code_dev_status()
    if cmd == "code-dev-pick":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEV, capability="本机 Cursor 写码")
        if blocked:
            return blocked
        from .code_dev import build_pick_ui
        from .code_dev.config import availability as code_dev_availability
        from .code_dev.config import get_config as code_dev_get_config
        cfg = code_dev_get_config()
        avail = code_dev_availability()
        if not cfg.enabled:
            return {
                "ok": False,
                "detail": "写码车道未开启（配置中心 → 写码车道）",
                "note": "code_dev.disabled",
            }
        if not avail.get("ok"):
            return {"ok": False, "detail": avail.get("detail") or "写码车道未就绪"}
        hint = ""
        req = ""
        sid = ""
        for arg in rest:
            if arg.startswith("workspace="):
                hint = arg.split("=", 1)[1]
            elif arg.startswith("requirement=") or arg.startswith("message="):
                req = arg.split("=", 1)[1]
            elif arg.startswith("session=") or arg.startswith("dsh_session_id="):
                sid = arg.split("=", 1)[1]
            elif arg.startswith("/") and not hint:
                hint = arg
        # 会话已开「需求→上线」时禁止出 Cursor 写码确认卡（由 feature 改走 pipeline）
        if sid.strip():
            try:
                from .dev_pipeline.session_mode import get_integrated

                if get_integrated(sid).get("integrated_flow_enabled"):
                    return {
                        "ok": False,
                        "detail": (
                            "本会话已开启「需求→上线」，禁止打开 Cursor 写码确认卡。"
                            "请用 mes_dev_pipeline_begin（或由写码工具自动改走过程流）。"
                        ),
                        "coding_mode": "integrated",
                        "redirect_tool": "mes_dev_pipeline_begin",
                        "code_dev_ui": None,
                    }
            except Exception:
                pass
        ui = build_pick_ui(workspace=hint, requirement=req)
        return {
            "ok": True,
            "reply": "请选择本机工程并填写写码需求，确认后才会启动 Cursor。",
            "code_dev_ui": ui,
            "suggestions": ui.get("suggestions") or [],
            "workspace": ui.get("workspace") or "",
            "source": "code_dev",
        }
    if cmd == "code-dev-discuss":
        # 需求讨论：返回 options/propose；不启动 Job
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEV, capability="本机 Cursor 写码")
        if blocked:
            return blocked
        from .code_dev.chat_bridge import handle_chat_code_dev
        hint = ""
        msg = ""
        for arg in rest:
            if arg.startswith("workspace="):
                hint = arg.split("=", 1)[1]
            elif arg.startswith("message=") or arg.startswith("requirement="):
                msg = arg.split("=", 1)[1]
            elif arg.startswith("/") and not hint:
                hint = arg
            elif not msg:
                msg = arg
            else:
                msg = (msg + " " + arg).strip()
        if not msg:
            return {"ok": False, "detail": "用法: code-dev-discuss message=<诉求> [workspace=路径]"}
        text = msg
        if hint and hint not in msg and not msg.startswith("【写码需求选项已确认】"):
            text = f"在 {hint} 开发：{msg}"
        return await handle_chat_code_dev(text, client_brief=None)
    if cmd == "code-dev-check":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEV, capability="本机 Cursor 写码")
        if blocked:
            return blocked
        from .code_dev import check_workspace
        return check_workspace(" ".join(rest) if rest else "")
    if cmd == "code-dev-start":
        # 企业硬门禁：禁止无 nonce 直开 Cursor Job；统一走确认卡 / code-dev-confirm
        return {
            "ok": False,
            "detail": "code-dev-start 已关闭：请在确认卡点击确认（HITL nonce → code-dev-confirm）",
            "code": "hitl_start_disabled",
            "reply": "未确认，未启动写码。请使用主聊天写码确认卡。",
        }
    if cmd == "code-dev-job":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEV, capability="本机 Cursor 写码")
        if blocked:
            return blocked
        from .code_dev import get_job as code_dev_get_job
        return code_dev_get_job(rest[0] if rest else "")
    if cmd == "code-dev-cancel":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEV, capability="本机 Cursor 写码")
        if blocked:
            return blocked
        from .code_dev import cancel as code_dev_cancel
        return code_dev_cancel(rest[0] if rest else "")
    if cmd == "code-dev-confirm":
        # 确认卡点「开始」后调用；args: <workspace> <requirement…> [nonce=…]
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEV, capability="本机 Cursor 写码")
        if blocked:
            return blocked
        from .code_dev.chat_bridge import confirm_and_start
        from .hitl import ACTION_DEV, require_confirm_nonce
        from .hitl.tokens import normalize_payload_hash

        if not rest:
            return {
                "ok": False,
                "detail": "用法: code-dev-confirm <workspace绝对路径> <需求> nonce=<HITL>",
            }
        nonce = ""
        parts: list[str] = []
        for a in rest:
            if a.startswith("nonce="):
                nonce = a[6:]
            else:
                parts.append(a)
        if not parts:
            return {"ok": False, "detail": "缺少 workspace"}
        req = " ".join(parts[1:]).strip()
        gate = require_confirm_nonce(
            nonce=nonce,
            action=ACTION_DEV,
            workspace=parts[0],
            payload_hash=normalize_payload_hash(req),
        )
        if not gate.get("ok"):
            return gate
        return confirm_and_start(workspace=parts[0], requirement=req)
    if cmd == "code-review-status":
        blocked = plugins_store.require_enabled(FEATURE_CODE_REVIEW, capability="本机目录审码")
        if blocked:
            return blocked
        from .code_review import status as code_review_status
        return code_review_status()
    if cmd == "code-review-pick":
        blocked = plugins_store.require_enabled(FEATURE_CODE_REVIEW, capability="本机目录审码")
        if blocked:
            return blocked
        from .code_review import build_pick_ui
        from .code_review.config import availability as code_review_availability
        from .code_review.config import get_config as code_review_get_config
        cfg = code_review_get_config()
        avail = code_review_availability()
        if not cfg.enabled:
            return {
                "ok": False,
                "detail": "审码车道未开启（配置中心）",
                "note": "code_review.disabled",
            }
        if not avail.get("ok"):
            return {"ok": False, "detail": avail.get("detail") or "审码车道未就绪"}
        hint = ""
        scope = ""
        focus = ""
        for arg in rest:
            if arg.startswith("workspace=") or arg.startswith("local_path="):
                hint = arg.split("=", 1)[1]
            elif arg.startswith("scope="):
                scope = arg[6:]
            elif arg.startswith("focus="):
                focus = arg[6:]
            elif arg.startswith("/") and not hint:
                hint = arg
        ui = build_pick_ui(workspace=hint, scope=scope, focus=focus)
        return {
            "ok": True,
            "reply": "请选择要审核的本机工程目录。",
            "code_review_ui": ui,
            "suggestions": ui.get("suggestions") or [],
            "workspace": ui.get("workspace") or "",
            "scope": ui.get("scope") or "",
            "focus": ui.get("focus") or "",
            "source": "code_review",
        }
    if cmd == "code-review-check":
        blocked = plugins_store.require_enabled(FEATURE_CODE_REVIEW, capability="本机目录审码")
        if blocked:
            return blocked
        from .code_review import check_path as code_review_check
        return code_review_check(" ".join(rest) if rest else "")
    if cmd == "code-review-list":
        blocked = plugins_store.require_enabled(FEATURE_CODE_REVIEW, capability="本机目录审码")
        if blocked:
            return blocked
        from .code_review.ops import list_files as code_review_list
        path = rest[0] if rest else ""
        scope = ""
        if len(rest) >= 2 and rest[1].startswith("scope="):
            scope = rest[1][6:]
        return code_review_list(path, scope=scope)
    if cmd == "code-review-run":
        blocked = plugins_store.require_enabled(FEATURE_CODE_REVIEW, capability="本机目录审码")
        if blocked:
            return blocked
        from .code_review.config import get_config as code_review_get_config
        from .code_review.ops import _parse_files_arg, run_review_async
        from .hitl import gate_review_path

        if not rest:
            return {
                "ok": False,
                "detail": "用法: code-review-run <local_path> [scope=] [focus=] [files=] [path_ticket=]",
            }
        local_path = rest[0]
        scope = ""
        focus = ""
        files_raw = ""
        path_ticket = ""
        for arg in rest[1:]:
            if arg.startswith("scope="):
                scope = arg[6:]
            elif arg.startswith("focus="):
                focus = arg[6:]
            elif arg.startswith("files="):
                files_raw = arg[6:]
            elif arg.startswith("path_ticket="):
                path_ticket = arg[12:]
        cfg = code_review_get_config()
        gate = gate_review_path(
            local_path=local_path,
            path_ticket=path_ticket,
            allow_agent_absolute_path=cfg.allow_agent_absolute_path,
        )
        if not gate.get("ok"):
            return gate
        # run_async 已在事件循环内；禁止调同步 run_review()（其内部 asyncio.run 会炸）
        return await run_review_async(
            local_path=local_path,
            scope=scope,
            files=_parse_files_arg(files_raw),
            focus=focus,
        )
    if cmd == "code-review-report":
        blocked = plugins_store.require_enabled(FEATURE_CODE_REVIEW, capability="本机目录审码")
        if blocked:
            return blocked
        from .code_review import get_report as code_review_report
        rid = rest[0] if rest else ""
        return code_review_report(rid)

    if cmd == "code-commit-status":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import status as code_commit_status
        return code_commit_status()
    if cmd == "code-commit-pick":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            # 人员能力关掉时仍返回 denied 工具卡，避免主聊天再弹出可点的选目录表单
            if blocked.get("source") == "user_capability":
                msg = str(blocked.get("detail") or blocked.get("reply") or "")
                out = dict(blocked)
                out["code_commit_ui"] = {
                    "kind": "denied",
                    "message": msg,
                    "capability_label": blocked.get("capability_label") or "提交",
                    "hint": "无提交能力",
                    "summary": "当前账号没有提交能力",
                    "desc": "该项能力已由管理员关闭，无法提交代码。",
                }
                return out
            return blocked
        from .code_commit import build_pick_ui
        from .code_commit.config import availability as code_commit_availability
        from .code_commit.config import get_config as code_commit_get_config
        cfg = code_commit_get_config()
        avail = code_commit_availability()
        if not cfg.enabled:
            return {
                "ok": False,
                "detail": "提交车道未开启（配置中心第 7 步）",
                "note": "code_commit.disabled",
            }
        if not avail.get("ok"):
            return {"ok": False, "detail": avail.get("detail") or "提交车道未就绪"}
        hint = ""
        for arg in rest:
            if arg.startswith("workspace="):
                hint = arg[10:]
            elif arg.startswith("/") and not hint:
                hint = arg
        ui = build_pick_ui(workspace=hint)
        return {
            "ok": True,
            "reply": "请选择要提交的本机 Git 工程目录，再开始门禁。",
            "code_commit_ui": ui,
            "suggestions": ui.get("suggestions") or [],
            "workspace": ui.get("workspace") or "",
            "work_branch": ui.get("work_branch") or "",
            "source": "code_commit",
        }
    if cmd == "code-commit-check":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import check_path as code_commit_check
        return code_commit_check(" ".join(rest) if rest else "")
    if cmd == "code-commit-prepare":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import prepare as code_commit_prepare
        workspace = rest[0] if rest else ""
        work_branch = ""
        for arg in rest[1:]:
            if arg.startswith("work_branch="):
                work_branch = arg[12:]
        return code_commit_prepare(workspace, work_branch=work_branch)
    if cmd == "code-commit-start":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import start_gate as code_commit_start
        if not rest:
            return {
                "ok": False,
                "detail": "用法: code-commit-start <workspace绝对路径> [work_branch=分支名]",
            }
        work_branch = ""
        for arg in rest[1:]:
            if arg.startswith("work_branch="):
                work_branch = arg[12:]
        return code_commit_start(rest[0], work_branch=work_branch)
    if cmd == "code-commit-confirm":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import confirm as code_commit_confirm
        from .hitl import ACTION_COMMIT, require_confirm_nonce

        # args: <job_id> [message=…] [push=true|false] [decision=approve|reject] [nonce=…]
        if not rest:
            return {
                "ok": False,
                "detail": "用法: code-commit-confirm <job_id> [message=…] [push=true] [decision=approve] nonce=<HITL>",
            }
        job_id = rest[0]
        message = ""
        push = None
        decision = "approve"
        nonce = ""
        for arg in rest[1:]:
            if arg.startswith("message="):
                message = arg[8:]
            elif arg.startswith("push="):
                push = arg[5:].lower() in {"1", "true", "yes", "y"}
            elif arg.startswith("decision="):
                decision = arg[9:]
            elif arg.startswith("nonce="):
                nonce = arg[6:]
            elif not message and not arg.startswith(("push=", "decision=", "nonce=")):
                message = arg
        gate = require_confirm_nonce(nonce=nonce, action=ACTION_COMMIT, job_id=job_id)
        if not gate.get("ok"):
            return gate
        return code_commit_confirm(job_id, message=message, push=push, decision=decision)
    if cmd == "code-commit-job":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import get_job as code_commit_get_job
        return code_commit_get_job(rest[0] if rest else "")
    if cmd == "code-commit-latest-blocked":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import latest_blocked as code_commit_latest_blocked
        workspace = ""
        job_id = ""
        for arg in rest:
            if arg.startswith("workspace="):
                workspace = arg[10:]
            elif arg.startswith("job_id="):
                job_id = arg[7:]
            elif arg.startswith("cc-") and not job_id:
                job_id = arg
            elif not workspace and arg.startswith("/"):
                workspace = arg
        return code_commit_latest_blocked(workspace=workspace, job_id=job_id)
    if cmd == "code-commit-prepare-fix":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import prepare_fix_from_gate as code_commit_prepare_fix
        workspace = ""
        job_id = ""
        for arg in rest:
            if arg.startswith("workspace="):
                workspace = arg[10:]
            elif arg.startswith("job_id="):
                job_id = arg[7:]
            elif arg.startswith("cc-") and not job_id:
                job_id = arg
            elif not workspace and arg.startswith("/"):
                workspace = arg
        return code_commit_prepare_fix(workspace=workspace, job_id=job_id)
    if cmd == "code-commit-push-retry":
        blocked = plugins_store.require_enabled(FEATURE_CODE_COMMIT, capability="人触发提交")
        if blocked:
            return blocked
        from .code_commit import push_retry as code_commit_push_retry
        return code_commit_push_retry(rest[0] if rest else "")
    if cmd == "code-deploy-status":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEPLOY, capability="按插件增量部署")
        if blocked:
            return blocked
        from .code_deploy import status as code_deploy_status
        return code_deploy_status()
    if cmd == "code-deploy-prepare":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEPLOY, capability="按插件增量部署")
        if blocked:
            return blocked
        from .code_deploy import prepare as code_deploy_prepare
        workspace = ""
        env = ""
        base_ref = ""
        mode = "auto"
        unit_ids: list[str] = []
        i = 0
        while i < len(rest):
            a = rest[i]
            if a == "--env" and i + 1 < len(rest):
                env = rest[i + 1]
                i += 2
                continue
            if a == "--base" and i + 1 < len(rest):
                base_ref = rest[i + 1]
                i += 2
                continue
            if a == "--mode" and i + 1 < len(rest):
                mode = rest[i + 1]
                i += 2
                continue
            if a == "--unit" and i + 1 < len(rest):
                unit_ids.append(rest[i + 1])
                i += 2
                continue
            if not workspace and not a.startswith("-"):
                workspace = a
            i += 1
        return code_deploy_prepare(
            workspace,
            env=env,
            base_ref=base_ref,
            unit_ids=unit_ids or None,
            mode=mode,
        )
    if cmd == "code-deploy-confirm":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEPLOY, capability="按插件增量部署")
        if blocked:
            return blocked
        from .code_deploy import confirm as code_deploy_confirm
        from .hitl import ACTION_DEPLOY, require_confirm_nonce

        job_id = rest[0] if rest else ""
        decision = "approve"
        mode = ""
        unit_ids = []
        nonce = ""
        i = 1
        while i < len(rest):
            a = rest[i]
            if a == "--decision" and i + 1 < len(rest):
                decision = rest[i + 1]
                i += 2
                continue
            if a == "--mode" and i + 1 < len(rest):
                mode = rest[i + 1]
                i += 2
                continue
            if a == "--unit" and i + 1 < len(rest):
                unit_ids.append(rest[i + 1])
                i += 2
                continue
            if a.startswith("nonce="):
                nonce = a[6:]
                i += 1
                continue
            if a == "--nonce" and i + 1 < len(rest):
                nonce = rest[i + 1]
                i += 2
                continue
            i += 1
        gate = require_confirm_nonce(nonce=nonce, action=ACTION_DEPLOY, job_id=job_id)
        if not gate.get("ok"):
            return gate
        return code_deploy_confirm(
            job_id,
            decision=decision,
            unit_ids=unit_ids or None,
            mode=mode or None,
        )
    if cmd == "code-deploy-job":
        blocked = plugins_store.require_enabled(FEATURE_CODE_DEPLOY, capability="按插件增量部署")
        if blocked:
            return blocked
        from .code_deploy import get_job as code_deploy_get_job
        return code_deploy_get_job(rest[0] if rest else "")
    if cmd == "usage-summary":
        from .auth import get_active_user
        from .usage import summarize

        days = 7
        if rest:
            try:
                days = int(rest[0])
            except (TypeError, ValueError):
                days = 7
        active = get_active_user()
        uid = str((active or {}).get("id") or "").strip()
        if not uid:
            return {"ok": False, "detail": "请先登录后查看用量（用量跟账号，不跟设备）"}
        return summarize(days=days, user_id=uid)
    if cmd == "space-list":
        from .auth import get_active_user
        from .space import list_sessions

        active = get_active_user()
        uid = str((active or {}).get("id") or "").strip()
        if not uid:
            return {"ok": False, "detail": "请先登录后查看我的空间"}
        rows = list_sessions(user_id=uid, limit=50)
        return {"ok": True, "sessions": rows}
    if cmd == "space-purge":
        from .auth import get_active_user
        from .space import purge_expired

        active = get_active_user()
        uid = str((active or {}).get("id") or "").strip()
        if not uid:
            return {"ok": False, "detail": "请先登录"}
        dry = "dry" in rest or "dry_run" in rest
        return purge_expired(user_id=uid, dry_run=dry)
    if cmd == "project-profile-get" or cmd == "project-profile-ensure":
        ws = ""
        force = False
        for arg in rest:
            if arg.startswith("workspace="):
                ws = arg.split("=", 1)[1].strip()
            elif arg == "force":
                force = True
        from .project_profile import ensure as ensure_project_profile
        from .project_profile import get_profile

        if cmd == "project-profile-get":
            return get_profile(ws)
        return ensure_project_profile(ws, force=force)
    if cmd == "dev-pipeline-status":
        blocked = plugins_store.require_enabled(
            FEATURE_DEV_PIPELINE, capability="需求到上线一体化"
        )
        if blocked:
            return blocked
        from .dev_pipeline import status as dev_pipeline_status

        sid = ""
        for arg in rest:
            if arg.startswith("session=") or arg.startswith("dsh_session_id="):
                sid = arg.split("=", 1)[1]
        return dev_pipeline_status(dsh_session_id=sid)
    if cmd == "dev-pipeline-set-integrated":
        blocked = plugins_store.require_enabled(
            FEATURE_DEV_PIPELINE, capability="需求到上线一体化"
        )
        if blocked:
            return blocked
        from .dev_pipeline import set_session_integrated_flow

        sid = rest[0] if rest else ""
        en = False
        for arg in rest[1:]:
            if arg in ("1", "true", "on", "enabled"):
                en = True
            elif arg.startswith("enabled="):
                en = arg.split("=", 1)[1].lower() in ("1", "true", "on", "yes")
        return set_session_integrated_flow(dsh_session_id=sid, enabled=en)
    if cmd == "dev-pipeline-begin":
        blocked = plugins_store.require_enabled(
            FEATURE_DEV_PIPELINE, capability="需求到上线一体化"
        )
        if blocked:
            return blocked
        from .auth import get_active_user
        from .dev_pipeline import begin_run as dev_pipeline_begin

        msg = ""
        ws = ""
        sid = ""
        image_ids: list[str] = []
        for arg in rest:
            if arg.startswith("message=") or arg.startswith("requirement="):
                msg = arg.split("=", 1)[1]
            elif arg.startswith("workspace="):
                ws = arg.split("=", 1)[1]
            elif arg.startswith("session=") or arg.startswith("dsh_session_id="):
                sid = arg.split("=", 1)[1]
            elif arg.startswith("image_ids="):
                raw_ids = arg.split("=", 1)[1]
                image_ids = [x.strip() for x in raw_ids.split(",") if x.strip()]
            elif arg.startswith("images="):
                raw_ids = arg.split("=", 1)[1]
                image_ids = [x.strip() for x in raw_ids.split(",") if x.strip()]
        active = get_active_user() or {}
        uid = str(active.get("id") or "").strip()
        return dev_pipeline_begin(
            message=msg,
            workspace=ws,
            user_id=uid,
            dsh_session_id=sid,
            image_ids=image_ids,
        )
    if cmd == "vision-status":
        from .vision import get_status

        return get_status()
    if cmd == "vision-understand":
        from .vision import understand

        prompt = ""
        purpose = ""
        ids: list[str] = []
        for arg in rest:
            if arg.startswith("prompt="):
                prompt = arg.split("=", 1)[1]
            elif arg.startswith("purpose="):
                purpose = arg.split("=", 1)[1]
            elif arg.startswith("image_ids=") or arg.startswith("images="):
                ids = [x.strip() for x in arg.split("=", 1)[1].split(",") if x.strip()]
            elif arg.startswith("vimg-"):
                ids.append(arg.strip())
        return understand(ids, prompt=prompt, purpose=purpose or "general")
    if cmd == "dev-pipeline-run":
        blocked = plugins_store.require_enabled(
            FEATURE_DEV_PIPELINE, capability="需求到上线一体化"
        )
        if blocked:
            return blocked
        from .dev_pipeline import get_run as dev_pipeline_get_run

        rid = rest[0] if rest else ""
        return dev_pipeline_get_run(rid)
    if cmd == "dev-pipeline-advance":
        blocked = plugins_store.require_enabled(
            FEATURE_DEV_PIPELINE, capability="需求到上线一体化"
        )
        if blocked:
            return blocked
        from .dev_pipeline import advance_run as dev_pipeline_advance

        rid = rest[0] if rest else ""
        step = ""
        for arg in rest[1:]:
            if arg.startswith("step="):
                step = arg.split("=", 1)[1]
        return dev_pipeline_advance(rid, step_id=step)
    if cmd == "dev-pipeline-confirm-step":
        blocked = plugins_store.require_enabled(
            FEATURE_DEV_PIPELINE, capability="需求到上线一体化"
        )
        if blocked:
            return blocked
        from .dev_pipeline import confirm_step as dev_pipeline_confirm_step

        rid = rest[0] if rest else ""
        sid = ""
        decision = "pass"
        cursor_job_id = ""
        no_code_change = False
        note = ""
        for arg in rest[1:]:
            if arg.startswith("step="):
                sid = arg.split("=", 1)[1]
            elif arg.startswith("decision="):
                decision = arg.split("=", 1)[1]
            elif arg.startswith("cursor_job_id="):
                cursor_job_id = arg.split("=", 1)[1]
            elif arg == "no_code_change=1" or arg == "no_code_change=true":
                no_code_change = True
            elif arg.startswith("note="):
                note = arg.split("=", 1)[1]
        return dev_pipeline_confirm_step(
            rid,
            step_id=sid,
            decision=decision,
            cursor_job_id=cursor_job_id,
            no_code_change=no_code_change,
            note=note,
        )
    if cmd == "dev-pipeline-cancel":
        blocked = plugins_store.require_enabled(
            FEATURE_DEV_PIPELINE, capability="需求到上线一体化"
        )
        if blocked:
            return blocked
        from .dev_pipeline import cancel_run as dev_pipeline_cancel

        rid = rest[0] if rest else ""
        reason = ""
        for arg in rest[1:]:
            if arg.startswith("reason="):
                reason = arg.split("=", 1)[1]
        return dev_pipeline_cancel(rid, reason=reason)
    if cmd in ("workbuddy-manual-cite", "wb-manual-cite", "user-manual-cite"):
        from .builtin_manual import cite as workbuddy_manual_cite

        q = " ".join(rest).strip()
        return workbuddy_manual_cite(q)
    if cmd in ("workbuddy-manual-status", "wb-manual-status"):
        from .builtin_manual import status_payload as workbuddy_manual_status

        return workbuddy_manual_status()
    if cmd in ("company-knowledge-cite", "ck-cite"):
        # 不绑 9 项功能开关；共享库召回按当前登录人权限过滤。
        # 只认请求 ContextVar（Bearer 中间件，或 /api/cli 入口已显式绑定）。
        # 此处不再二次读 active.json，避免与 capabilities.resolve_actor_user_id 口径分叉；
        # 多用户公网时 active 仍是「最后 touch 的人」——须靠登录后 touch + api_cli 绑定。
        from .auth import current_user_id
        from .auth.users import find_user_by_id, user_is_active
        from .company_knowledge import cite as company_knowledge_cite

        q = " ".join(rest).strip()
        user_row = None
        uid = (current_user_id() or "").strip()
        if uid:
            live = find_user_by_id(uid)
            if user_is_active(live):
                user_row = live
        return await company_knowledge_cite(q, user_row=user_row)
    if cmd in ("company-knowledge-status", "ck-status"):
        # 与 HTTP /status 一致：未绑定登录人时不泄露 configured
        from .auth import current_user_id
        from .auth.users import find_user_by_id, public_user, user_is_active
        from .company_knowledge import status_payload

        role = ""
        reveal = False
        uid = (current_user_id() or "").strip()
        if uid:
            live = find_user_by_id(uid)
            if user_is_active(live):
                role = str((public_user(live) or {}).get("role") or "")
                reveal = True
        return status_payload(role=role, reveal_config=reveal)
    return {"ok": False, "detail": f"未知命令: {cmd}"}
