"""单步执行（auto_run：1～10 真实连跑；否则 5/7～10 仍 HITL）。"""
from __future__ import annotations

import re
import time
from typing import Any

from . import config as dp_config
from .events import publish
from .preconditions import check as precond_check
from .prime import build_context_pack
from .skill_catalog import format_result_detail, skill_banner, skill_for
from .validate import run_validate_commands
from .store import default_data_dir, load_run


def _log(run_id: str, step_id: str, message: str, *, bucket: list[str] | None = None) -> None:
    msg = str(message or "").strip()
    if not msg:
        return
    if bucket is not None:
        bucket.append(msg)
    publish(
        run_id,
        {
            "type": "log",
            "step_id": step_id,
            "phase": "log",
            "message": msg,
            "ts": int(time.time()),
        },
    )


def _receipt(
    run_id: str,
    step_id: str,
    *,
    status: str,
    summary: str,
    artifacts: dict[str, Any] | None = None,
    started_at: int,
    evidence: dict[str, Any] | None = None,
    process_log: list[str] | None = None,
    result_lines: list[str] | None = None,
) -> dict[str, Any]:
    finished_at = int(time.time())
    sk = skill_for(step_id)
    ev = dict(evidence or {})
    if process_log:
        ev["process_log"] = list(process_log)
    result_detail = format_result_detail(
        step_id=step_id,
        status=status,
        summary=summary,
        extra_lines=result_lines,
    )
    ev["result_detail"] = result_detail
    ev["skill"] = {
        "id": sk.get("id"),
        "title_zh": sk.get("title_zh"),
        "source": sk.get("source"),
        "cole_ref": sk.get("cole_ref"),
        "flow_brief": sk.get("flow_brief"),
    }
    rec = {
        "step_id": step_id,
        "status": status,
        "summary": summary,
        "result_detail": result_detail,
        "skill_id": sk.get("id"),
        "skill_title": sk.get("title_zh"),
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_sec": max(0, finished_at - int(started_at or finished_at)),
        "artifacts": artifacts or {},
        "evidence": ev,
    }
    publish(
        run_id,
        {
            "type": "receipt",
            "step_id": step_id,
            "phase": "receipt",
            "receipt": rec,
            "ts": finished_at,
        },
    )
    return rec


def run_step(
    run_id: str,
    step_id: str,
    *,
    message: str,
    workspace: str,
    epic: dict[str, Any],
    run: dict[str, Any] | None = None,
) -> dict[str, Any]:
    started = int(time.time())
    process_log: list[str] = []
    publish(
        run_id,
        {
            "type": "step",
            "step_id": step_id,
            "phase": "running",
            "ts": started,
        },
    )
    run_doc = run or {}
    gate = precond_check(step_id, epic=epic, run=run_doc)
    if not gate.get("ok"):
        return _receipt(
            run_id,
            step_id,
            status="fail",
            summary=str(gate.get("detail") or "前置条件未满足"),
            started_at=started,
            process_log=process_log,
        )

    msg = (message or "").strip()
    from .intake_normalize import normalize_intake, resolve_requirement_core

    req_core = resolve_requirement_core(epic, msg)
    if req_core:
        msg = req_core
    ws = (workspace or epic.get("workspace") or run_doc.get("workspace") or "").strip()

    def _skill_open() -> None:
        for line in skill_banner(step_id):
            _log(run_id, step_id, line, bucket=process_log)

    if step_id == "1":
        _skill_open()
        _log(run_id, step_id, "开始：采集用户需求原文", bucket=process_log)
        _log(run_id, step_id, f"需求字数：{len(msg)}", bucket=process_log)
        if ws:
            _log(run_id, step_id, f"工作区提示：{ws}", bucket=process_log)
        # 同会话独立追问：挂上上一任务摘要，理解/写码不得当成空白新项目
        session_ctx = (
            epic.get("session_context")
            if isinstance(epic.get("session_context"), dict)
            else None
        ) or (
            run_doc.get("session_context")
            if isinstance(run_doc.get("session_context"), dict)
            else None
        )
        if session_ctx:
            prior_rid = str(session_ctx.get("prior_run_id") or "").strip()
            prior_msg = str(session_ctx.get("prior_message") or "").strip()
            _log(
                run_id,
                step_id,
                f"同会话关联上一任务：{prior_rid or '（无 id）'}",
                bucket=process_log,
            )
            if prior_msg:
                _log(
                    run_id,
                    step_id,
                    f"上一需求摘要：{prior_msg[:240]}",
                    bucket=process_log,
                )
            epic.setdefault("artifacts", {})["session_context"] = dict(session_ctx)

        image_ids: list[str] = []
        for src in (
            epic.get("intake_image_ids"),
            run_doc.get("intake_image_ids"),
        ):
            for x in list(src or []):
                s = str(x or "").strip()
                if s and s not in image_ids:
                    image_ids.append(s)
        image_ids = image_ids[:6]

        vision_text = ""
        vision_meta: dict[str, Any] = {}
        if image_ids:
            _log(
                run_id,
                step_id,
                f"附图：{len(image_ids)} 张，调用视觉识图…",
                bucket=process_log,
            )
            try:
                from ..vision.service import REQ_INTAKE_PROMPT, understand_image_ids
                from .intake_normalize import (
                    is_placeholder_requirement,
                    looks_like_runtime_injection,
                    looks_like_sandbox_policy,
                )

                prompt = REQ_INTAKE_PROMPT
                # 禁止把沙箱政策文塞进识图 prompt，否则模型会复读政策而非读图
                user_extra = (msg or "").strip()
                if session_ctx and session_ctx.get("prior_message"):
                    user_extra = (
                        "【同会话上一需求】"
                        + str(session_ctx.get("prior_message") or "")[:400]
                        + "\n【本轮追问/新需求】"
                        + user_extra
                    ).strip()
                if (
                    user_extra
                    and not is_placeholder_requirement(user_extra)
                    and not looks_like_runtime_injection(user_extra)
                    and not looks_like_sandbox_policy(user_extra)
                ):
                    prompt = REQ_INTAKE_PROMPT + "\n\n用户附加文字：\n" + user_extra[:2000]
                vout = understand_image_ids(
                    image_ids, prompt=prompt, purpose="req_intake"
                )
                if vout.get("ok"):
                    vision_text = str(vout.get("text") or "").strip()
                    if looks_like_sandbox_policy(vision_text):
                        vision_meta = {
                            "ok": False,
                            "detail": "识图结果疑似被沙箱政策污染，已丢弃",
                            "image_count": len(image_ids),
                        }
                        vision_text = ""
                        _log(
                            run_id,
                            step_id,
                            "识图结果无效（像 DSH file policy），已丢弃",
                            bucket=process_log,
                        )
                    else:
                        vision_meta = {
                            "ok": True,
                            "model": vout.get("model") or "",
                            "image_count": len(image_ids),
                        }
                        _log(
                            run_id,
                            step_id,
                            f"识图完成（模型 {vision_meta.get('model') or '—'}，"
                            f"{len(vision_text)} 字）",
                            bucket=process_log,
                        )
                else:
                    vision_meta = {
                        "ok": False,
                        "detail": str(vout.get("detail") or "识图失败"),
                        "image_count": len(image_ids),
                    }
                    _log(
                        run_id,
                        step_id,
                        f"识图失败：{vision_meta['detail']}",
                        bucket=process_log,
                    )
            except Exception as e:
                vision_meta = {
                    "ok": False,
                    "detail": f"{type(e).__name__}: {e}",
                    "image_count": len(image_ids),
                }
                _log(
                    run_id,
                    step_id,
                    f"识图异常：{vision_meta['detail']}",
                    bucket=process_log,
                )

        if not msg and not vision_text:
            return _receipt(
                run_id,
                step_id,
                status="fail",
                summary="需求为空且识图无结果",
                started_at=started,
                process_log=process_log,
                result_lines=[str(vision_meta.get("detail") or "请补充文字或检查视觉模型配置")],
            )

        raw = {
            "text": msg[:8000],
            "has_workspace_hint": bool(ws),
            "captured_at": started,
            "image_ids": list(image_ids),
            "vision_text": (vision_text[:12000] if vision_text else ""),
            "vision": vision_meta,
        }
        from .intake_normalize import is_implementable_requirement

        norm = normalize_intake(text=(message or msg or "").strip(), vision_text=vision_text)
        vision_surface = (
            norm.get("vision_surface")
            if isinstance(norm.get("vision_surface"), dict)
            else {}
        )
        raw["requirement_core"] = norm.get("core") or ""
        raw["vision_surface"] = vision_surface
        raw["normalize"] = {
            "source": norm.get("source"),
            "one_liner": norm.get("one_liner"),
            "was_sanitized": norm.get("was_sanitized"),
            "notes": norm.get("notes"),
            "implementable": norm.get("implementable"),
        }
        epic.setdefault("artifacts", {})["raw_intake"] = raw
        core = str(norm.get("core") or "").strip()
        if not core and not vision_text:
            return _receipt(
                run_id,
                step_id,
                status="fail",
                summary="需求清洗后为空（疑似沙箱政策注入且无有效识图）",
                started_at=started,
                process_log=process_log,
                result_lines=[
                    "原文像 DSH file policy / runtime 注入，且识图无可用正文。",
                    "请重新粘贴需求截图，或用中文写清产品需求后再开跑。",
                ],
            )
        if not is_implementable_requirement(core):
            return _receipt(
                run_id,
                step_id,
                status="fail",
                summary="需求采集失败：未得到可实施的真实需求（疑似套话/占位）",
                started_at=started,
                process_log=process_log,
                evidence={"reason": "requirement_not_implementable"},
                result_lines=[
                    f"清洗结果：{(core[:160] + '…') if len(core) > 160 else (core or '（空）')}",
                    f"识图字数：{len(vision_text)}",
                    "步骤卡需要菜单/页面/接口等可落地描述，禁止「请随时补充」类套话。",
                ],
            )
        if core:
            epic["requirement_core"] = core
            epic["message"] = core
            if vision_text and str(norm.get("source") or "").startswith("vision"):
                epic["message"] = core + "\n\n【识图摘录】\n" + vision_text[:4000]
            elif vision_text and vision_text not in core:
                epic["message"] = core + "\n\n【识图摘录】\n" + vision_text[:4000]
            if isinstance(run_doc, dict):
                run_doc["message"] = epic["message"]
                run_doc["requirement_core"] = core
        elif vision_text:
            epic["message"] = vision_text[:8000]
            epic["requirement_core"] = vision_text[:2000]
            if isinstance(run_doc, dict):
                run_doc["message"] = epic["message"]
                run_doc["requirement_core"] = epic["requirement_core"]

        if norm.get("was_sanitized"):
            _log(
                run_id,
                step_id,
                f"需求清洗：{'; '.join(norm.get('notes') or []) or '已去掉 runtime/记忆库噪音'}",
                bucket=process_log,
            )
        if norm.get("one_liner"):
            _log(run_id, step_id, f"需求摘要：{norm.get('one_liner')}", bucket=process_log)

        preview_src = (
            (vision_text[:200] if vision_text else "")
            or norm.get("one_liner")
            or msg
        )
        preview = (
            (preview_src[:120] + ("…" if len(preview_src) > 120 else ""))
            if preview_src
            else "（空）"
        )
        _log(run_id, step_id, f"需求预览：{preview}", bucket=process_log)
        _log(run_id, step_id, "结果：需求已写入 Epic 账本 raw_intake", bucket=process_log)
        summary_bits = [
            f"已采集需求（{len(core or vision_text or msg)} 字）",
        ]
        if image_ids:
            summary_bits.append(f"附图 {len(image_ids)} 张")
            if vision_text:
                summary_bits.append("识图成功")
            elif vision_meta.get("ok") is False:
                summary_bits.append("识图失败（已保留原文）")
        if ws:
            summary_bits.append(f"工程提示 {ws}")
        if norm.get("source"):
            summary_bits.append(f"来源 {norm.get('source')}")
        return _receipt(
            run_id,
            step_id,
            status="pass",
            summary="；".join(summary_bits),
            artifacts={
                "raw_intake": True,
                "chars": len(core or vision_text or msg),
                "workspace_hint": ws or "",
                "image_count": len(image_ids),
                "vision_ok": bool(vision_text),
                "normalize_source": norm.get("source"),
            },
            started_at=started,
            process_log=process_log,
            result_lines=[
                f"需求核心：{(core[:120] + ('…' if len(core) > 120 else '')) if core else '（空）'}",
                f"原文预览：{(msg[:80] + ('…' if len(msg) > 80 else '')) if msg else '（空）'}",
                f"识图预览：{(vision_text[:120] + ('…' if len(vision_text) > 120 else '')) if vision_text else '（无）'}",
                f"工程目录提示：{ws or '（本步未绑定，后续步骤会再解析）'}",
                "账本字段：artifacts.raw_intake",
            ],
        )

    if step_id == "2":
        from .delivery_scope import infer_dev_scenario
        from .intake_normalize import (
            build_prd_user_card,
            build_user_acceptance,
            compose_implementable_brief,
            is_implementable_requirement,
            looks_like_hardcoded_low_stock_template,
            looks_like_memory_preference_dump,
            looks_like_pipeline_meta_not_product,
            looks_like_requirement_boilerplate,
            looks_like_runtime_injection,
            normalize_intake,
            prd_result_lines,
            to_one_liner,
        )
        from .requirement_scope import build_prd_scope, extract_in_scope_items

        _skill_open()
        _log(run_id, step_id, "开始：整理可实施 PRD（要做什么 / 怎么干 / 干成啥）", bucket=process_log)
        arts = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
        raw_in = arts.get("raw_intake") if isinstance(arts.get("raw_intake"), dict) else {}
        vision_text = str(raw_in.get("vision_text") or "").strip()
        # 用户原话：必须进步骤卡 / LLM；记忆库偏好 dump 不得当原话
        user_raw = ""
        if isinstance(raw_in, dict):
            user_raw = str(raw_in.get("text") or raw_in.get("message") or "").strip()
        if not user_raw:
            user_raw = str(msg or "").strip()
        # 占位「附图需求」不当原话
        if user_raw in ("（附图需求，详见识图结果）", "附图需求", "见附图", "见截图"):
            user_raw = ""
        # 优先用步骤 1 已清洗的 requirement_core；脏原文只作二次清洗输入
        cleaned_core = ""
        if isinstance(raw_in, dict):
            cleaned_core = str(raw_in.get("requirement_core") or "").strip()
        if not cleaned_core:
            cleaned_core = str(epic.get("requirement_core") or "").strip()
        user_for_llm = cleaned_core
        if (
            user_raw
            and not looks_like_memory_preference_dump(user_raw)
            and not looks_like_runtime_injection(user_raw)
            and not looks_like_pipeline_meta_not_product(user_raw)
        ):
            user_for_llm = user_raw
        elif user_raw and (
            looks_like_memory_preference_dump(user_raw)
            or looks_like_runtime_injection(user_raw)
            or looks_like_pipeline_meta_not_product(user_raw)
        ):
            re_norm = normalize_intake(text=user_raw, vision_text=vision_text)
            re_core = str(re_norm.get("core") or "").strip()
            if re_core and is_implementable_requirement(re_core):
                user_for_llm = re_core
                cleaned_core = cleaned_core or re_core
                _log(
                    run_id,
                    step_id,
                    "已剥离记忆库/偏好注入，改用清洗后的需求核心进 PRD",
                    bucket=process_log,
                )
            else:
                # 保持 cleaned_core（勿把脏原文当 PRD）；user_for_llm 已在上方初始化
                user_for_llm = cleaned_core
                _log(
                    run_id,
                    step_id,
                    "原文为记忆库/流水线偏好注入，已禁止当作用户原话",
                    bucket=process_log,
                )
        # 同会话上一任务：在定稿 user_for_llm 后再注入（独立 Run 仍保持关联）
        _sctx = (
            arts.get("session_context")
            if isinstance(arts.get("session_context"), dict)
            else None
        ) or (
            epic.get("session_context")
            if isinstance(epic.get("session_context"), dict)
            else None
        )
        if _sctx and _sctx.get("prior_message") and (user_for_llm or user_raw):
            _pm = str(_sctx.get("prior_message") or "").strip()[:400]
            _pr = str(_sctx.get("prior_run_id") or "").strip()
            _leaf = (user_for_llm or user_raw).strip()
            if _leaf and "【同会话上一任务" not in _leaf:
                user_for_llm = (
                    f"【同会话上一任务{_pr and (' ' + _pr) or ''}】{_pm}\n"
                    f"【本轮独立需求】{_leaf}"
                ).strip()
                _log(
                    run_id,
                    step_id,
                    f"PRD 已注入同会话上一任务上下文（{_pr or '无 id'}）",
                    bucket=process_log,
                )

        core = cleaned_core or str(epic.get("requirement_core") or msg or "").strip()
        if looks_like_pipeline_meta_not_product(core) or looks_like_memory_preference_dump(core):
            core = ""

        # 套话 / 不可实施 / 偏好元需求 / 低库存硬模板 → 强制重提
        need_rebuild = (
            not is_implementable_requirement(core)
            or looks_like_requirement_boilerplate(core)
            or looks_like_pipeline_meta_not_product(core)
            or looks_like_hardcoded_low_stock_template(core)
        )
        try:
            from .prd_llm import looks_like_page_meta_dump

            if looks_like_page_meta_dump(core):
                need_rebuild = True
        except Exception:
            pass
        if vision_text and looks_like_hardcoded_low_stock_template(core):
            from .vision_surface import looks_like_requirements_matrix

            if looks_like_requirements_matrix(vision_text) or any(
                k in vision_text
                for k in ("销售订单", "功能要求", "本项", "发货", "R04")
            ):
                need_rebuild = True
                _log(
                    run_id,
                    step_id,
                    "检测到低库存硬模板与附图意图不符，按识图真实条目重提…",
                    bucket=process_log,
                )

        if need_rebuild:
            _log(
                run_id,
                step_id,
                "需求核心像套话、硬模板或不可实施，尝试从识图重提…",
                bucket=process_log,
            )
            rebuilt = ""
            if vision_text or user_for_llm:
                rebuilt = compose_implementable_brief(
                    vision_text or user_for_llm, user_text=user_for_llm
                )
                if (
                    not rebuilt
                    or looks_like_hardcoded_low_stock_template(rebuilt)
                    or looks_like_pipeline_meta_not_product(rebuilt)
                ):
                    rebuilt = str(
                        normalize_intake(text=user_raw or user_for_llm, vision_text=vision_text).get(
                            "core"
                        )
                        or ""
                    )
            if (
                rebuilt
                and is_implementable_requirement(rebuilt)
                and not looks_like_hardcoded_low_stock_template(rebuilt)
                and not looks_like_pipeline_meta_not_product(rebuilt)
            ):
                core = rebuilt
                epic["requirement_core"] = core
                epic["message"] = core + (
                    ("\n\n【识图摘录】\n" + vision_text[:4000]) if vision_text else ""
                )
                if isinstance(run_doc, dict):
                    run_doc["requirement_core"] = core
                    run_doc["message"] = epic["message"]
                _log(run_id, step_id, f"已重提可实施需求：{to_one_liner(core) or core[:120]}", bucket=process_log)
            elif looks_like_hardcoded_low_stock_template(core):
                return _receipt(
                    run_id,
                    step_id,
                    status="fail",
                    summary="需求整理失败：未从图中识别到真实需求（疑似提示词样例污染）",
                    started_at=started,
                    process_log=process_log,
                    evidence={"reason": "vision_intent_mismatch"},
                    result_lines=[
                        "禁止把「低库存预警页按截图改表」等模板当成用户需求。",
                        "请确认附图为需求表或业务页，或补充中文需求后再开跑。",
                    ],
                )
            elif (
                not is_implementable_requirement(core)
                or looks_like_pipeline_meta_not_product(core)
            ):
                return _receipt(
                    run_id,
                    step_id,
                    status="fail",
                    summary="需求整理失败：缺少可实施的产品需求（疑似记忆库偏好/套话污染）",
                    started_at=started,
                    process_log=process_log,
                    evidence={"reason": "requirement_not_implementable"},
                    result_lines=[
                        f"当前核心：{(core[:160] + '…') if len(core) > 160 else (core or '（空）')}",
                        "要求：写清菜单/页面/接口等可落地改动（如「报表中心删除某某菜单」）。",
                        "禁止把「用 mes_dev_pipeline_begin」「ask_user_question」等流水线偏好当成需求。",
                        "请用中文重写产品需求后再开跑（勿粘贴记忆库/偏好全文）。",
                    ],
                )

        # LLM：用户原话 + 识图重组织「要做什么」（强制带原话，禁止页面元数据冒充需求）
        llm_card = None
        try:
            from .prd_llm import looks_like_page_meta_dump, reorganize_requirement_with_llm

            if user_for_llm or vision_text or looks_like_page_meta_dump(core):
                _log(
                    run_id,
                    step_id,
                    "按用户原话+识图让 LLM 重组织「要做什么」…",
                    bucket=process_log,
                )
                llm_card = reorganize_requirement_with_llm(
                    user_text=user_for_llm,
                    vision_text=vision_text,
                    rule_brief=core,
                )
        except Exception as e:  # noqa: BLE001
            _log(
                run_id,
                step_id,
                f"LLM 重组织跳过：{type(e).__name__}",
                bucket=process_log,
            )
            llm_card = None
        if isinstance(llm_card, dict) and (llm_card.get("what") or llm_card.get("one_liner")):
            leaf = str(llm_card.get("what") or llm_card.get("one_liner") or "").strip()
            if (
                looks_like_pipeline_meta_not_product(leaf)
                or looks_like_memory_preference_dump(leaf)
                or not is_implementable_requirement(leaf)
            ):
                _log(
                    run_id,
                    step_id,
                    "LLM 结果疑似记忆库偏好/不可实施，已丢弃，保留规则核心",
                    bucket=process_log,
                )
                llm_card = None
            else:
                _log(
                    run_id,
                    step_id,
                    f"LLM 已按用户原话重组织：{(leaf[:120] + '…') if len(leaf) > 120 else leaf}",
                    bucket=process_log,
                )
                if llm_card.get("user_quote"):
                    _log(
                        run_id,
                        step_id,
                        f"引用原话/批注：{str(llm_card.get('user_quote'))[:160]}",
                        bucket=process_log,
                    )
                from .vision_surface import merge_user_intent_with_vision, parse_vision_surface

                if vision_text:
                    merged_llm = merge_user_intent_with_vision(
                        leaf, vision_text, surface=parse_vision_surface(vision_text)
                    )
                    mcore = str(merged_llm.get("core") or "").strip()
                    if mcore and not looks_like_pipeline_meta_not_product(mcore):
                        core = mcore
                        if isinstance(merged_llm.get("surface"), dict) and isinstance(raw_in, dict):
                            raw_in["vision_surface"] = merged_llm["surface"]
                            arts["raw_intake"] = raw_in
                else:
                    core = leaf
                epic["requirement_core"] = core
                if isinstance(run_doc, dict):
                    run_doc["requirement_core"] = core

        # LLM 可能把提示词样例焊回「低库存」：若识图已是另一套需求，强制用规则 brief 覆盖
        if vision_text and looks_like_hardcoded_low_stock_template(core):
            from .vision_surface import looks_like_requirements_matrix

            if looks_like_requirements_matrix(vision_text) or any(
                k in vision_text for k in ("销售订单", "功能要求", "本项", "发货", "R04")
            ):
                pinned = compose_implementable_brief(vision_text, user_text=user_raw)
                if (
                    pinned
                    and is_implementable_requirement(pinned)
                    and not looks_like_hardcoded_low_stock_template(pinned)
                ):
                    core = pinned
                    epic["requirement_core"] = core
                    if isinstance(run_doc, dict):
                        run_doc["requirement_core"] = core
                    _log(
                        run_id,
                        step_id,
                        f"已剔除低库存硬模板，按识图重钉：{to_one_liner(core) or core[:120]}",
                        bucket=process_log,
                    )
                    # 步骤卡也不要用污染后的 LLM what
                    if isinstance(llm_card, dict):
                        llm_card = {
                            **llm_card,
                            "what": core[:500],
                            "one_liner": to_one_liner(core) or core[:160],
                        }

        # 规则回退也要钉用户原话（LLM 失败时；禁止钉偏好 dump）
        if user_for_llm and user_for_llm not in (core or ""):
            from .prd_llm import looks_like_page_meta_dump as _md

            if _md(core) or not is_implementable_requirement(core):
                pinned = compose_implementable_brief(
                    vision_text or user_for_llm, user_text=user_for_llm
                )
                if (
                    pinned
                    and is_implementable_requirement(pinned)
                    and not looks_like_pipeline_meta_not_product(pinned)
                ):
                    core = pinned
                    epic["requirement_core"] = core
                    if isinstance(run_doc, dict):
                        run_doc["requirement_core"] = core
                    _log(
                        run_id,
                        step_id,
                        f"已用用户原话钉住需求：{to_one_liner(core) or core[:120]}",
                        bucket=process_log,
                    )
        # 有识图：已锚定则只刷新 surface / 去重，禁止再次套娃 merge
        if vision_text and not (isinstance(llm_card, dict) and (llm_card.get("what") or llm_card.get("one_liner"))):
            from .vision_surface import (
                merge_user_intent_with_vision,
                parse_vision_surface,
            )

            if "【界面锚定】" in core and "【改动】" in core:
                merged = merge_user_intent_with_vision(
                    core, vision_text, surface=parse_vision_surface(vision_text)
                )
                mcore = str(merged.get("core") or core).strip()
                if mcore and is_implementable_requirement(mcore):
                    core = mcore
                    epic["requirement_core"] = core
                vs = (
                    merged.get("surface")
                    if isinstance(merged.get("surface"), dict)
                    else parse_vision_surface(vision_text)
                )
            else:
                from .intake_normalize import normalize_intake as _norm2

                n2 = _norm2(text=core, vision_text=vision_text)
                if n2.get("core") and is_implementable_requirement(str(n2.get("core"))):
                    core = str(n2.get("core") or core)
                    epic["requirement_core"] = core
                vs = (
                    n2.get("vision_surface")
                    if isinstance(n2.get("vision_surface"), dict)
                    else {}
                )
            if vs:
                raw_in = arts.get("raw_intake") if isinstance(arts.get("raw_intake"), dict) else {}
                raw_in = dict(raw_in)
                raw_in["vision_surface"] = vs
                arts["raw_intake"] = raw_in
                epic.setdefault("artifacts", {})["raw_intake"] = raw_in

        scenario = infer_dev_scenario(core)
        delivery = str(scenario.get("delivery") or "")
        sid = str(scenario.get("scenario_id") or "adaptive")
        vscope = {}
        raw_in2 = (
            (epic.get("artifacts") or {}).get("raw_intake")
            if isinstance(epic.get("artifacts"), dict)
            else {}
        )
        if isinstance(raw_in2, dict) and isinstance(raw_in2.get("vision_surface"), dict):
            vscope = raw_in2["vision_surface"]
        prof = None
        if ws:
            try:
                from ..project_profile import ensure as ensure_project_profile

                got = ensure_project_profile(ws)
                if isinstance(got, dict) and isinstance(got.get("profile"), dict):
                    prof = got["profile"]
            except Exception:  # noqa: BLE001
                prof = None
            # 用工作区再解析识图路径（无硬锚点表）
            if vscope and isinstance(vscope, dict):
                from .vision_surface import resolve_page_anchors

                re_anch = resolve_page_anchors(
                    page_title=str(vscope.get("page_title") or ""),
                    vision_text=str(vscope.get("raw_excerpt") or ""),
                    user_text=core or "",
                    workspace=ws,
                    profile=prof,
                )
                vscope = dict(vscope)
                vscope["must_include_paths"] = list(re_anch.get("must_include_paths") or [])
                vscope["forbid_paths"] = list(re_anch.get("forbid_paths") or [])
                vscope["path_hints"] = list(re_anch.get("path_hints") or []) or list(
                    vscope.get("path_hints") or []
                )
                vscope["need_user_path_confirm"] = bool(re_anch.get("need_user_path_confirm"))
                if isinstance(raw_in2, dict):
                    raw_in2 = dict(raw_in2)
                    raw_in2["vision_surface"] = vscope
                    epic.setdefault("artifacts", {})["raw_intake"] = raw_in2
        scope = build_prd_scope(
            message=core,
            scenario_id=sid,
            vision_surface=vscope,
            workspace=ws,
            profile=prof,
        )
        in_scope = extract_in_scope_items(core)
        if not in_scope:
            in_scope = [p for p in re.split(r"[；;]", core) if len(p.strip()) >= 4][:8]
        card = build_prd_user_card(
            core=core,
            scenario=scenario,
            scope=scope,
            in_scope=in_scope,
        )
        # LLM 重组织结果覆盖步骤卡「要做什么/怎么干/干成啥」
        if isinstance(llm_card, dict) and (llm_card.get("what") or llm_card.get("one_liner")):
            if llm_card.get("what"):
                card["what"] = str(llm_card["what"])[:500]
            if llm_card.get("one_liner"):
                card["one_liner"] = str(llm_card["one_liner"])[:160]
            if llm_card.get("how"):
                card["how"] = str(llm_card["how"])[:400]
            if isinstance(llm_card.get("done_when"), list) and llm_card["done_when"]:
                card["done_when"] = [str(x) for x in llm_card["done_when"] if str(x).strip()][:8]
                max_f = scope.get("max_files")
                if max_f and not any("改动不超过" in str(x) for x in card["done_when"]):
                    card["done_when"].append(f"改动不超过 {max_f} 个文件，不做无关重构")
                if not any("验证命令" in str(x) for x in card["done_when"]):
                    card["done_when"].append("步骤 6 验证命令通过")
            # 范围内以 LLM 验收为主，避免再塞页面元数据
            in_scope = [str(x) for x in (llm_card.get("done_when") or []) if str(x).strip()][:8] or in_scope
            if llm_card.get("user_quote") and str(llm_card["user_quote"]) not in "\n".join(in_scope):
                in_scope = [str(llm_card["user_quote"])] + in_scope
                in_scope = in_scope[:8]
        # 硬钉用户原话进步骤卡（禁止钉记忆库偏好 / 页面元数据 / 低库存硬模板）
        pin_src = user_for_llm or ""
        pin_ok = bool(pin_src) and not looks_like_requirement_boilerplate(pin_src)
        if pin_ok and looks_like_hardcoded_low_stock_template(pin_src):
            pin_ok = False
        if pin_ok and (
            looks_like_memory_preference_dump(pin_src)
            or looks_like_pipeline_meta_not_product(pin_src)
            or looks_like_runtime_injection(pin_src)
        ):
            pin_ok = False
        try:
            from .prd_llm import looks_like_page_meta_dump as _md_pin

            if pin_ok and _md_pin(pin_src):
                pin_ok = False
        except Exception:
            pass
        if pin_ok and len(pin_src) <= 400:
            card["user_quote"] = pin_src[:240]
            what_now = str(card.get("what") or "")
            if pin_src not in what_now:
                card["what"] = f"【用户原话】{pin_src}。{what_now}".strip("。")[:500]
            if pin_src not in "\n".join(in_scope):
                in_scope = [f"用户原话：{pin_src[:120]}"] + list(in_scope)
                in_scope = in_scope[:8]
                card["done_when"] = [
                    x for x in (card.get("done_when") or []) if str(x).strip()
                ]
                if not any(pin_src[:40] in str(x) for x in card["done_when"]):
                    card["done_when"] = [pin_src[:200]] + list(card["done_when"])
                    card["done_when"] = card["done_when"][:8]
        from .prd_llm import looks_like_page_meta_dump as _meta_dump

        what_now = str(card.get("what") or "")
        if (
            looks_like_requirement_boilerplate(what_now)
            or _meta_dump(what_now)
            or looks_like_pipeline_meta_not_product(what_now)
            or looks_like_pipeline_meta_not_product(core)
            or not is_implementable_requirement(core)
        ):
            return _receipt(
                run_id,
                step_id,
                status="fail",
                summary="需求整理失败：步骤卡不是可实施的产品需求（已阻止进入写码）",
                started_at=started,
                process_log=process_log,
                evidence={"reason": "requirement_not_implementable"},
                result_lines=[
                    "步骤卡必须给出清晰可实施的产品改动（含用户原话/图上批注），",
                    "禁止把页面元数据、记忆库偏好、流水线工具说明当成「要做什么」。",
                    f"当前核心：{(core[:160] + '…') if len(core) > 160 else (core or '（空）')}",
                ],
            )
        prd = {
            "goal": core[:2000],
            "goal_one_liner": card.get("one_liner") or to_one_liner(core),
            "user_card": card,
            "delivery": delivery,
            "scenario": {
                "scenario_id": scenario.get("scenario_id"),
                "scenario_label": scenario.get("scenario_label"),
                "confidence": scenario.get("confidence"),
                "reason": scenario.get("reason"),
            },
            "scope": scope,
            "acceptance": build_user_acceptance(in_scope, core),
            "non_goals": [
                "不借机做无关大重构",
                "不把单一场景模板套死到所有需求上",
                "不批量改 frontend/src/api/* 或抽取公共 http（除非用户明确要求）",
            ],
            "rev": f"prd_{started}",
        }
        # scope.in_scope 与步骤卡对齐（禁止把套话写进范围契约）
        scope["in_scope"] = list(in_scope)[:12]
        scope["user_message_excerpt"] = core[:800]
        prd["scope"] = scope
        epic.setdefault("artifacts", {})["prd"] = prd
        epic["prd_rev"] = prd["rev"]
        epic["requirement_core"] = core
        _log(run_id, step_id, f"要做什么：{card.get('what')}", bucket=process_log)
        _log(run_id, step_id, f"怎么干：{card.get('how')}", bucket=process_log)
        _log(
            run_id,
            step_id,
            f"场景：{scenario.get('scenario_label')}（{scenario.get('scenario_id')}，"
            f"置信={scenario.get('confidence')}）",
            bucket=process_log,
        )
        _log(run_id, step_id, f"推断：{scenario.get('reason')}", bucket=process_log)
        _log(run_id, step_id, f"交付范围：{delivery}", bucket=process_log)
        for i, a in enumerate(card.get("done_when") or [], 1):
            _log(run_id, step_id, f"干成啥[{i}]：{a}", bucket=process_log)
        for i, a in enumerate(prd["non_goals"], 1):
            _log(run_id, step_id, f"非目标[{i}]：{a}", bucket=process_log)
        for i, a in enumerate(in_scope, 1):
            _log(run_id, step_id, f"范围内[{i}]：{a[:200]}", bucket=process_log)
        _log(
            run_id,
            step_id,
            f"变更上限：{scope.get('max_files')} 个文件",
            bucket=process_log,
        )
        _log(run_id, step_id, f"结果：PRD 版本 {prd['rev']} 已冻结", bucket=process_log)
        return _receipt(
            run_id,
            step_id,
            status="pass",
            summary=f"需求已锁定：{card.get('one_liner') or prd['goal_one_liner']}",
            artifacts={
                "prd_rev": prd["rev"],
                "acceptance_count": len(prd["acceptance"]),
                "delivery": delivery,
                "scenario_id": scenario.get("scenario_id"),
            },
            started_at=started,
            process_log=process_log,
            result_lines=prd_result_lines(card, prd_rev=prd["rev"]),
        )

    if step_id == "3":
        _skill_open()
        _log(run_id, step_id, "开始：Prime 只读扫描工程上下文", bucket=process_log)
        if ws:
            _log(run_id, step_id, f"扫描目录：{ws}", bucket=process_log)
        else:
            _log(run_id, step_id, "未绑定 workspace，将落盘空 context_pack", bucket=process_log)
        pack = build_context_pack(ws)
        epic.setdefault("artifacts", {})["context_pack"] = pack
        epic["context_rev"] = pack.get("rev") or f"ctx_{started}"
        if ws:
            epic["workspace"] = pack.get("workspace") or ws
        n_read = len(pack.get("must_read") or [])
        dirs = pack.get("top_level_dirs") or []
        if isinstance(dirs, list) and dirs:
            _log(run_id, step_id, "顶层目录：" + ", ".join(str(x) for x in dirs[:12]), bucket=process_log)
        for item in (pack.get("must_read") or [])[:8]:
            if isinstance(item, dict) and item.get("path"):
                _log(run_id, step_id, f"必读：{item.get('path')}", bucket=process_log)
        for risk in (pack.get("risks") or [])[:6]:
            _log(run_id, step_id, f"风险：{risk}", bucket=process_log)
        if pack.get("workspace_ok"):
            summary = f"已索引 workspace（{n_read} 个必读片段）"
            status = "pass"
            _log(run_id, step_id, f"结果：{summary}", bucket=process_log)
        else:
            summary = pack.get("workspace_error") or "workspace 无效，已落盘空 context_pack"
            status = "pass"
            _log(run_id, step_id, f"结果：{summary}", bucket=process_log)
        return _receipt(
            run_id,
            step_id,
            status=status,
            summary=summary,
            artifacts={"context_rev": epic["context_rev"], "files": n_read},
            started_at=started,
            evidence={"risks": pack.get("risks") or []},
            process_log=process_log,
            result_lines=[
                f"目录：{pack.get('workspace') or ws or '（空）'}",
                f"校验：{'通过' if pack.get('workspace_ok') else '未通过'}",
                f"必读片段：{n_read} 个",
                ("风险：" + "；".join(str(x) for x in (pack.get('risks') or [])[:5]))
                if pack.get("risks")
                else "风险：无",
                f"版本：{epic['context_rev']}",
            ],
        )

    if step_id == "4":
        from .delivery_scope import resolve_scenario_from_prd

        _skill_open()
        _log(run_id, step_id, "开始：编写实现计划与验证清单", bucket=process_log)
        ctx = epic.get("artifacts", {}).get("context_pack") or {}
        prd_art = epic.get("artifacts", {}).get("prd") or {}
        scenario = resolve_scenario_from_prd(
            message=msg or str(prd_art.get("goal") or ""),
            prd=prd_art if isinstance(prd_art, dict) else {},
        )
        delivery = str(prd_art.get("delivery") or scenario.get("delivery") or "").strip()
        must_touch = list(scenario.get("must_touch") or [])
        validation = list(scenario.get("validation") or [])
        hints: list[str] = []
        for item in ctx.get("must_read") or []:
            if isinstance(item, dict) and item.get("path"):
                hints.append(str(item["path"]))
        for d in (ctx.get("top_level_dirs") or [])[:8]:
            hints.append(str(d))
        prd_scope = prd_art.get("scope") if isinstance(prd_art.get("scope"), dict) else {}
        path_hints = list(prd_scope.get("path_hints") or [])
        if path_hints:
            hints = path_hints + hints
        prd_for_plan = epic.get("artifacts", {}).get("prd") or {}
        plan_problem = (
            str(prd_for_plan.get("goal_one_liner") or "").strip()
            or msg[:1500]
            or str(prd_for_plan.get("goal") or "")[:1500]
        )
        plan = {
            "problem": plan_problem,
            "delivery": delivery,
            "scenario": {
                "scenario_id": scenario.get("scenario_id"),
                "scenario_label": scenario.get("scenario_label"),
                "confidence": scenario.get("confidence"),
                "reason": scenario.get("reason"),
            },
            "scope": prd_scope,
            "must_touch": must_touch,
            "validation": validation,
            "files_hint": ", ".join(hints[:12]) if hints else "（Prime 未给出路径，请写码前再确认）",
            "rev": f"plan_{started}",
        }
        epic.setdefault("artifacts", {})["plan"] = plan
        epic["plan_rev"] = plan["rev"]
        if ws:
            epic["workspace"] = ws
        _log(run_id, step_id, f"问题：{(plan['problem'] or '')[:200]}", bucket=process_log)
        _log(
            run_id,
            step_id,
            f"场景：{scenario.get('scenario_label')}（{scenario.get('scenario_id')}）",
            bucket=process_log,
        )
        _log(run_id, step_id, f"交付范围：{delivery}", bucket=process_log)
        for i, t in enumerate(must_touch, 1):
            _log(run_id, step_id, f"建议改动面[{i}]：{t}", bucket=process_log)
        for i, v in enumerate(validation, 1):
            _log(run_id, step_id, f"验证项[{i}]：{v}", bucket=process_log)
        _log(run_id, step_id, f"路径提示：{plan['files_hint'][:300]}", bucket=process_log)
        _log(run_id, step_id, f"结果：计划版本 {plan['rev']} 已锁定", bucket=process_log)
        return _receipt(
            run_id,
            step_id,
            status="pass",
            summary=(
                f"实现计划已锁定（{plan['rev']}，场景 {scenario.get('scenario_label')}，"
                f"验证 {len(validation)} 项）"
            ),
            artifacts={
                "plan_rev": plan["rev"],
                "validation_count": len(validation),
                "delivery": delivery,
                "scenario_id": scenario.get("scenario_id"),
            },
            started_at=started,
            process_log=process_log,
            result_lines=[
                f"问题：{(plan['problem'] or '')[:400]}",
                f"场景：{scenario.get('scenario_label')}（{scenario.get('scenario_id')}）",
                f"交付范围：{delivery}",
                "建议改动面：" + ("；".join(must_touch) if must_touch else "（自适应）"),
                "验证清单：" + "；".join(validation),
                f"路径提示：{plan['files_hint'][:400]}",
                f"版本：{plan['rev']}",
            ],
        )

    if step_id == "5":
        from .implement import build_implement_requirement, run_implement
        from .implement_gate import (
            INFRA_RETRY_REASONS,
            judge_implement_result,
            preflight_implement,
            store_delivery_fail_mandate,
        )

        _skill_open()

        cfg = dp_config.get_config()
        if not cfg.get("auto_run", True):
            _log(run_id, step_id, "开始：交接 Cursor 写码（需人工确认写码完成）", bucket=process_log)
            _log(
                run_id,
                step_id,
                "请在 Cursor 写码插件完成改盘后，于本步点「写码已完成，继续验证」",
                bucket=process_log,
            )
            return _receipt(
                run_id,
                step_id,
                status="waiting_hitl",
                summary="请在 Cursor 写码插件完成实现后，在时间线确认「写码完成」",
                artifacts={"handoff": "cursor-chat-plugin"},
                started_at=started,
                process_log=process_log,
            )

        # —— 健全机制：预检 → 任务卡 → Job → 分级判定 ——
        _log(run_id, step_id, "写码预检：sidecar / Key / 工程目录…", bucket=process_log)
        pf = preflight_implement(workspace=str(ws or ""))
        for n in pf.get("notes") or []:
            _log(run_id, step_id, str(n), bucket=process_log)
        if not pf.get("ok"):
            return _receipt(
                run_id,
                step_id,
                status="fail",
                summary=f"写码预检未通过：{pf.get('detail') or pf.get('reason')}",
                artifacts={"implement": "preflight_fail"},
                started_at=started,
                evidence={
                    "reason": str(pf.get("reason") or "preflight_fail"),
                    "detail": str(pf.get("detail") or ""),
                },
                process_log=process_log,
                result_lines=[
                    f"预检原因：{pf.get('reason')}",
                    f"详情：{pf.get('detail') or '—'}",
                    "判定：基建未就绪，未开写码 Job（避免空跑）",
                    f"工程：{ws}",
                ],
            )

        # 打回写码前洗净 must_fix（防旧引擎账本污染任务卡）
        try:
            from .fix_loop import refresh_implement_fix_mandate

            refresh_implement_fix_mandate(epic)
        except Exception:  # noqa: BLE001
            pass
        req = build_implement_requirement(message=msg, epic=epic, workspace=str(ws or ""))
        arts = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
        mandate = arts.get("implement_fix_mandate")
        if isinstance(mandate, dict) and mandate.get("must_fix"):
            rnd = mandate.get("round") or "—"
            _log(
                run_id,
                step_id,
                f"已注入第 {rnd} 轮精准修复清单（来源 {mandate.get('source') or '—'}）",
                bucket=process_log,
            )
            for i, item in enumerate(list(mandate.get("must_fix") or [])[:8], 1):
                _log(run_id, step_id, f"须修[{i}]：{str(item)[:220]}", bucket=process_log)
        _log(run_id, step_id, "开始：真实调用 Cursor 写码插件改盘", bucket=process_log)
        _log(run_id, step_id, f"工程目录：{ws or '（空）'}", bucket=process_log)
        head = (req.splitlines()[0] if req else "")[:120]
        if head:
            _log(run_id, step_id, f"任务卡：{head}", bucket=process_log)

        def _impl_cancelled() -> bool:
            r = load_run(default_data_dir(), run_id) or {}
            if r.get("cancel_requested"):
                return True
            return str(r.get("status") or "") in (
                "cancelled",
                "canceled",
                "cancelling",
            )

        arts_impl = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
        prev_impl = (
            arts_impl.get("implement") if isinstance(arts_impl.get("implement"), dict) else {}
        )
        resume_jid = str(prev_impl.get("cursor_job_id") or "").strip()
        # 仅引擎中断续跑（engine_resume_count>0）时跟已有 Job；交付打回另开新单
        use_resume = bool(
            resume_jid
            and int((run or {}).get("engine_resume_count") or 0) > 0
            and str((run or {}).get("current_step") or "") == "5"
        )

        def _on_job_started(jid: str) -> None:
            j = str(jid or "").strip()
            if not j:
                return
            epic.setdefault("artifacts", {})
            prev = epic["artifacts"].get("implement")
            if not isinstance(prev, dict):
                prev = {}
            epic["artifacts"]["implement"] = {**prev, "cursor_job_id": j}

        out = run_implement(
            workspace=ws,
            requirement=req,
            log=lambda m: _log(run_id, step_id, m, bucket=process_log),
            is_cancelled=_impl_cancelled,
            on_job_started=_on_job_started,
            resume_job_id=resume_jid if use_resume else "",
        )
        if (
            not out.get("ok")
            and str(out.get("reason") or "") in INFRA_RETRY_REASONS
            and out.get("can_retry")
            and not _impl_cancelled()
        ):
            from .implement import _ensure_cursor_sidecar

            _log(
                run_id,
                step_id,
                f"写码基建失败（{out.get('reason')}），自愈 sidecar 后整趟重试一趟（不计交付轮次）…",
                bucket=process_log,
            )
            _ensure_cursor_sidecar("http://127.0.0.1:18791")
            time.sleep(1.2)
            out = run_implement(
                workspace=ws,
                requirement=req,
                log=lambda m: _log(run_id, step_id, m, bucket=process_log),
                is_cancelled=_impl_cancelled,
                on_job_started=_on_job_started,
                resume_job_id="",
            )

        prd_art = epic.get("artifacts", {}).get("prd") or {}
        plan_art = epic.get("artifacts", {}).get("plan") or {}
        scope = (
            plan_art.get("scope")
            if isinstance(plan_art.get("scope"), dict)
            else prd_art.get("scope")
        )
        fix_mandate = (
            arts_impl.get("implement_fix_mandate")
            if isinstance(arts_impl.get("implement_fix_mandate"), dict)
            else None
        )
        # 任务卡拼完后可能已 refresh mandate；以当前 epic 为准
        arts_now = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
        if isinstance(arts_now.get("implement_fix_mandate"), dict):
            fix_mandate = arts_now.get("implement_fix_mandate")
        verdict = judge_implement_result(
            job_out=out,
            scope=scope if isinstance(scope, dict) else None,
            workspace=str(ws or ""),
            fix_mandate=fix_mandate if isinstance(fix_mandate, dict) else None,
        )
        fl = list(verdict.get("changed_files") or [])
        epic.setdefault("artifacts", {})["implement"] = {
            "cursor_job_id": out.get("job_id") or "",
            "changed_files": fl,
            "auto": True,
            "gate": {
                "class": verdict.get("class"),
                "reason": verdict.get("reason"),
                "summary": verdict.get("summary"),
            },
            "scope_audit": (verdict.get("evidence") or {}).get("scope_audit"),
            "content_audit": (verdict.get("evidence") or {}).get("content_audit"),
        }
        _log(
            run_id,
            step_id,
            f"写码门禁判定：{verdict.get('class')} / {verdict.get('reason')}",
            bucket=process_log,
        )

        if verdict.get("ok"):
            ev = verdict.get("evidence") if isinstance(verdict.get("evidence"), dict) else {}
            sa = ev.get("scope_audit") if isinstance(ev.get("scope_audit"), dict) else {}
            return _receipt(
                run_id,
                step_id,
                status="pass",
                summary=str(verdict.get("summary") or "写码完成"),
                artifacts={"cursor_job_id": out.get("job_id") or "", "implement": "pass"},
                started_at=started,
                evidence={
                    "job_id": out.get("job_id"),
                    "changed_files": fl,
                    "gate": verdict.get("class"),
                    "scope_audit": sa,
                },
                process_log=process_log,
                result_lines=[
                    f"Job：{out.get('job_id') or '—'}",
                    f"变更文件数：{len(fl)}",
                    f"门禁：{verdict.get('class')} · {sa.get('detail') or '通过'}",
                    ("变更：" + "、".join(str(x) for x in fl[:12])) if fl else "变更：—",
                    f"工程：{ws}",
                ],
            )

        v_class = str(verdict.get("class") or "")
        v_reason = str(verdict.get("reason") or "implement_fail")
        if v_class == "retry_delivery":
            store_delivery_fail_mandate(epic, verdict, round_no=0)
        retry_hint = ""
        if v_class == "retry_delivery":
            retry_hint = f"闭环：将按「{v_reason}」打回写码（最多 3 轮）"
        elif v_class == "retry_infra":
            retry_hint = "基建类失败：请确认 :18791 对话写码服务后重试本步"
        return _receipt(
            run_id,
            step_id,
            status="fail",
            summary=str(verdict.get("summary") or "写码失败")[:400],
            artifacts={"implement": v_reason},
            started_at=started,
            evidence={
                "reason": v_reason,
                "gate_class": v_class,
                "job_id": out.get("job_id"),
                "changed_files": fl,
                "violations": verdict.get("violations") or [],
                "mandate_items": verdict.get("mandate_items") or [],
                "detail": str(out.get("detail") or "")[:800],
            },
            process_log=process_log,
            result_lines=[
                x
                for x in [
                    f"门禁分级：{v_class}",
                    f"原因：{v_reason}",
                    f"详情：{str(verdict.get('summary') or '—')[:400]}",
                    retry_hint,
                    f"工程：{ws or '（空）'}",
                ]
                if x
            ],
        )

    if step_id == "6":
        _skill_open()
        _log(run_id, step_id, "开始：执行 validate_commands", bucket=process_log)
        if not ws:
            _log(run_id, step_id, "未绑定工程目录（workspace 为空）", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="waiting_user",
                summary="未绑定工程目录，无法验证。请在 begin 传入 workspace，或在 config.yaml · dev_pipeline.default_workspace 配置后重试本步。",
                artifacts={"validate": "need_workspace"},
                started_at=started,
                evidence={"reason": "no_workspace", "results": []},
                process_log=process_log,
            )
        out = run_validate_commands(ws)
        epic.setdefault("artifacts", {})["validate_last"] = out
        results = out.get("results") or []
        for row in results:
            if not isinstance(row, dict):
                continue
            line = f"{row.get('name')}: exit {row.get('exit_code')}"
            _log(run_id, step_id, line, bucket=process_log)
        reason = str(out.get("reason") or "")
        if reason in ("no_workspace", "bad_workspace"):
            _log(run_id, step_id, f"结果：工程目录无效 — {out.get('summary')}", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="waiting_user",
                summary=str(out.get("summary") or "工程目录无效，无法验证"),
                artifacts={"validate": "need_workspace"},
                started_at=started,
                evidence={"reason": reason, "results": results},
                process_log=process_log,
            )
        if out.get("unverified") or out.get("skipped"):
            _log(run_id, step_id, "结果：未验证（无探测项，不假绿）", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="skipped",
                summary=str(out.get("summary") or "未验证"),
                artifacts={"validate": "unverified", "auto_defaults": False},
                started_at=started,
                evidence={
                    "reason": str(out.get("reason") or "validate_unverified"),
                    "results": results,
                },
                process_log=process_log,
                result_lines=[
                    f"判定：{out.get('summary') or '未验证'}",
                    f"工程：{ws}",
                    "建议在 config.yaml 或仓库内配置真实 validate_commands / 测试脚本",
                ],
            )
        if out.get("ok"):
            _log(run_id, step_id, "结果：验证通过", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="pass",
                summary=str(out.get("summary") or "验证通过"),
                artifacts={"validate": "pass"},
                started_at=started,
                evidence={"results": results},
                process_log=process_log,
                result_lines=[
                    "判定：全部通过",
                    f"工程：{ws}",
                ]
                + [
                    f"· {r.get('name')}: exit {r.get('exit_code')}"
                    for r in results
                    if isinstance(r, dict)
                ][:12],
            )
        _log(run_id, step_id, "结果：验证失败", bucket=process_log)
        return _receipt(
            run_id,
            step_id,
            status="fail",
            summary=str(out.get("summary") or "验证失败"),
            artifacts={"validate": "fail"},
            started_at=started,
            evidence={"reason": "cmd_fail", "results": results},
            process_log=process_log,
            result_lines=[
                "判定：失败",
                f"工程：{ws}",
            ]
            + [
                f"· {r.get('name')}: exit {r.get('exit_code')}"
                for r in results
                if isinstance(r, dict)
            ][:12],
        )

    if step_id == "7":
        from .lane_exec import collect_pipeline_changed_files, run_review

        _skill_open()

        if not dp_config.get_config().get("auto_run", True):
            _log(run_id, step_id, "开始：交接审码车道", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="waiting_hitl",
                summary="等待复核：使用 mes_code_review_begin（不自动调用，避免污染原审码卡）",
                artifacts={"handoff": "mes_code_review_begin"},
                started_at=started,
                process_log=process_log,
            )
        _log(run_id, step_id, "开始：真实审码（code-review · 仅本次改动）", bucket=process_log)
        changed = collect_pipeline_changed_files(epic)
        if changed:
            _log(
                run_id,
                step_id,
                f"改动文件来自写码产物（{len(changed)}）：" + "、".join(changed[:15]),
                bucket=process_log,
            )
        else:
            _log(
                run_id,
                step_id,
                "写码产物无 changed_files：硬失败停机（禁止跳过复核继续提交/部署）",
                bucket=process_log,
            )
        out = run_review(
            workspace=ws,
            message=msg,
            files=changed,
            log=lambda m: _log(run_id, step_id, m, bucket=process_log),
        )
        if out.get("ok"):
            if out.get("skipped") or not (out.get("files") or changed):
                # 双保险：任何「空审通过」一律改 fail，防止旧逻辑/旁路假绿
                return _receipt(
                    run_id,
                    step_id,
                    status="fail",
                    summary="无可用改动文件，复核硬门禁失败，已停止后续流程",
                    artifacts={"review": "fail", "changed_only": True},
                    started_at=started,
                    evidence={
                        "reason": "no_changed_files",
                        "files": [],
                        "detail": "空变更不得通过复核",
                    },
                    process_log=process_log,
                    result_lines=[
                        "原因：no_changed_files",
                        "说明：写码未产出可审文件，禁止继续提交/开PR/部署",
                    ],
                )
            epic.setdefault("artifacts", {})["review"] = {
                "report_id": out.get("report_id") or "",
                "auto": True,
                "changed_only": True,
                "files": out.get("files") or changed,
                "skipped": False,
            }
            report_body = str(out.get("report_body") or "").strip()
            ev_review: dict[str, Any] = {}
            if report_body:
                ev_review["report_body"] = report_body[:12000]
            raw_out = out.get("raw") if isinstance(out.get("raw"), dict) else {}
            findings = raw_out.get("findings") if isinstance(raw_out.get("findings"), list) else []
            if findings:
                ev_review["findings"] = findings[:80]
            return _receipt(
                run_id,
                step_id,
                status="pass",
                summary=str(out.get("summary") or "审码完成"),
                artifacts={
                    "report_id": out.get("report_id") or "",
                    "changed_only": True,
                    "file_count": len(out.get("files") or changed),
                    "skipped": False,
                    "high_count": int(raw_out.get("high_count") or 0),
                    "medium_count": int(raw_out.get("medium_count") or 0),
                    "low_count": int(raw_out.get("low_count") or 0),
                },
                started_at=started,
                evidence=ev_review or None,
                process_log=process_log,
                result_lines=[
                    f"报告 ID：{out.get('report_id') or '—'}",
                    f"范围：仅本次改动（{len(out.get('files') or changed)} 个文件）",
                    f"文件：{'、'.join((out.get('files') or changed)[:12]) or '（无）'}",
                ],
            )
        return _receipt(
            run_id,
            step_id,
            status="fail",
            summary=str(out.get("detail") or out.get("summary") or "审码失败"),
            artifacts={"review": "fail", "changed_only": True},
            started_at=started,
            evidence={
                "reason": out.get("reason") or "review_fail",
                "files": out.get("files") or changed,
                "report_id": out.get("report_id") or "",
                "detail": str(out.get("detail") or "")[:2000],
                "report_body": str(out.get("report_body") or "")[:12000],
                # 结构化 findings 必须进 evidence，供打回写码 must_fix（勿只靠正文抽取）
                "findings": (
                    (out.get("raw") or {}).get("findings")
                    if isinstance(out.get("raw"), dict)
                    and isinstance((out.get("raw") or {}).get("findings"), list)
                    else []
                )[:80]
                or (
                    out.get("gate_findings")
                    if isinstance(out.get("gate_findings"), list)
                    else []
                )[:80],
                "gate_findings": out.get("gate_findings")
                if isinstance(out.get("gate_findings"), list)
                else [],
                "raw": out.get("raw") if isinstance(out.get("raw"), dict) else {},
            },
            process_log=process_log,
            result_lines=[
                f"原因：{out.get('reason') or '—'}",
                f"说明：{out.get('detail') or '—'}",
                f"拟审文件：{'、'.join((out.get('files') or changed)[:12]) or '（无）'}",
                "打回写码：下一轮 requirement 将携带【必须逐条修复】清单（最多 3 轮）",
            ],
        )

    if step_id == "8":
        from .lane_exec import collect_pipeline_changed_files, run_commit

        _skill_open()

        if not dp_config.get_config().get("auto_run", True):
            _log(run_id, step_id, "开始：交接提交车道", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="waiting_hitl",
                summary="等待提交：使用 mes_code_commit_begin",
                artifacts={"handoff": "mes_code_commit_begin"},
                started_at=started,
                process_log=process_log,
            )
        commit_limit = int(dp_config.get_config().get("commit_timeout_sec") or 60)
        _log(
            run_id,
            step_id,
            f"开始：真实提交（code-commit，墙钟≤{commit_limit}s；超时软跳过可稍后手动提交）",
            bucket=process_log,
        )
        pipeline_files = collect_pipeline_changed_files(epic)
        if not pipeline_files:
            _log(
                run_id,
                step_id,
                "写码产物无 changed_files：禁止提交（避免推送无关脏文件）",
                bucket=process_log,
            )
            return _receipt(
                run_id,
                step_id,
                status="fail",
                summary="无流水线变更文件，提交硬门禁失败，已停止",
                artifacts={"commit": "no_changed_files"},
                started_at=started,
                evidence={
                    "reason": "no_changed_files",
                    "files": [],
                    "detail": "implement.changed_files 为空，禁止提交工作区其它脏文件",
                },
                process_log=process_log,
                result_lines=[
                    "原因：no_changed_files",
                    "说明：本轮写码无增量文件，不得把仓库其它未跟踪改动推上远端",
                ],
            )
        commit_msg = msg or str((epic.get("artifacts") or {}).get("prd", {}).get("goal") or "")
        out = run_commit(
            workspace=ws,
            message=commit_msg,
            log=lambda m: _log(run_id, step_id, m, bucket=process_log),
            max_attempts=3,
            timeout_sec=commit_limit,
        )
        if out.get("ok"):
            epic.setdefault("artifacts", {})["commit"] = {
                "job_id": out.get("job_id") or "",
                "skipped": bool(out.get("skipped")),
                "can_manual_retry": bool(out.get("can_manual_retry")),
                "auto": True,
                "attempts": out.get("attempts"),
            }
            return _receipt(
                run_id,
                step_id,
                status="pass",
                summary=str(out.get("summary") or "提交完成"),
                artifacts={
                    "commit_job_id": out.get("job_id") or "",
                    "skipped": bool(out.get("skipped")),
                    "can_manual_retry": bool(out.get("can_manual_retry")),
                    "attempts": out.get("attempts"),
                },
                started_at=started,
                process_log=process_log,
                evidence={
                    "reason": out.get("reason") or "",
                    "can_manual_retry": bool(out.get("can_manual_retry")),
                },
                result_lines=[
                    f"提交 Job：{out.get('job_id') or '—'}",
                    f"自动尝试：{out.get('attempts') or 1} 次",
                    f"是否跳过：{'是' if out.get('skipped') else '否'}"
                    + ("（可稍后手动重试）" if out.get("can_manual_retry") else ""),
                    f"摘要：{str(out.get('summary') or '')[:400]}",
                ],
            )
        # 门禁阻断 / 重试耗尽：fail → runner 打回写码补救（全自动闭环）
        detail = str(out.get("detail") or out.get("summary") or "提交失败")
        return _receipt(
            run_id,
            step_id,
            status="fail",
            summary=detail[:400],
            artifacts={
                "commit": "blocked",
                "commit_job_id": out.get("job_id") or "",
                "can_manual_retry": True,
                "attempts": out.get("attempts"),
            },
            started_at=started,
            evidence={
                "reason": out.get("reason") or "commit_fail",
                "can_manual_retry": True,
                "detail": detail[:2000],
                "gate_findings": out.get("gate_findings")
                if isinstance(out.get("gate_findings"), list)
                else [],
                "raw": out.get("raw") if isinstance(out.get("raw"), dict) else {},
            },
            process_log=process_log,
            result_lines=[
                "判定：提交未通过 → 打回写码补救后重跑 5→6→7→8",
                f"原因：{out.get('reason') or '—'}",
                f"说明：{detail[:400]}",
                f"自动尝试：{out.get('attempts') or 1} 次",
            ],
        )

    if step_id == "9":
        from .lane_exec import run_pr

        _skill_open()

        if not dp_config.get_config().get("auto_run", True):
            _log(run_id, step_id, "开始：开 PR（人工确认）", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="waiting_hitl",
                summary="等待开 PR：可先人工开 PR 后确认",
                artifacts={"handoff": "pr-pending"},
                started_at=started,
                process_log=process_log,
            )
        _log(run_id, step_id, "开始：按托管类型开 PR/MR（或标不适用）", bucket=process_log)
        out = run_pr(
            workspace=ws,
            message=msg,
            log=lambda m: _log(run_id, step_id, m, bucket=process_log),
        )
        if out.get("ok"):
            epic.setdefault("artifacts", {})["pr"] = {
                "pr_url": out.get("pr_url") or "",
                "skipped": bool(out.get("skipped")),
                "not_applicable": bool(out.get("not_applicable")),
                "provider": out.get("provider") or "",
                "auto": True,
            }
            st = "skipped" if (out.get("skipped") or out.get("not_applicable")) else "pass"
            return _receipt(
                run_id,
                step_id,
                status=st,
                summary=str(out.get("summary") or "开 PR 完成"),
                artifacts={
                    "pr_url": out.get("pr_url") or "",
                    "skipped": bool(out.get("skipped")),
                    "provider": out.get("provider") or "",
                },
                started_at=started,
                process_log=process_log,
                result_lines=[
                    f"托管：{out.get('provider') or '—'}",
                    f"PR：{out.get('pr_url') or ('（已跳过/不适用）' if out.get('skipped') else '—')}",
                    f"摘要：{str(out.get('summary') or '')[:400]}",
                ],
            )
        return _receipt(
            run_id,
            step_id,
            status="fail",
            summary=str(out.get("detail") or "开 PR 失败"),
            artifacts={"pr": "fail"},
            started_at=started,
            process_log=process_log,
            result_lines=[f"说明：{out.get('detail') or '—'}"],
        )

    if step_id == "10":
        from .lane_exec import run_deploy

        _skill_open()

        if not dp_config.get_config().get("auto_run", True):
            _log(run_id, step_id, "开始：交接部署车道", bucket=process_log)
            return _receipt(
                run_id,
                step_id,
                status="waiting_hitl",
                summary="等待部署：使用 mes_code_deploy_begin 或引擎部署入口",
                artifacts={"handoff": "mes_code_deploy_begin"},
                started_at=started,
                process_log=process_log,
            )
        # 本 Run 已部署成功过：禁止再开第二趟（引擎续跑/advance 误触发时直接复用成功）
        prev_pass = None
        for e in list((run or {}).get("timeline_trace") or []):
            if (
                isinstance(e, dict)
                and str(e.get("step_id") or "") == "10"
                and str(e.get("status") or "") == "pass"
            ):
                prev_pass = e
        if prev_pass:
            prev_sum = str(prev_pass.get("summary") or "部署已成功").strip()
            _log(
                run_id,
                step_id,
                "本 Run 部署已成功，跳过重复部署",
                bucket=process_log,
            )
            return _receipt(
                run_id,
                step_id,
                status="pass",
                summary=f"已跳过重复部署（沿用上次成功）：{prev_sum[:280]}",
                artifacts={
                    "deploy_skipped": True,
                    "deploy_job_id": str(
                        ((prev_pass.get("receipt") or {}).get("artifacts") or {}).get(
                            "deploy_job_id"
                        )
                        or ""
                    ),
                },
                started_at=started,
                evidence={"reason": "already_deployed_this_run", "skipped": True},
                process_log=process_log,
                result_lines=["判定：本 Run 已有部署成功记录，不再二次部署"],
            )
        _log(run_id, step_id, "开始：真实部署（code-deploy）", bucket=process_log)
        out = run_deploy(
            workspace=ws,
            log=lambda m: _log(run_id, step_id, m, bucket=process_log),
        )
        attempts = int(out.get("attempts") or 1)
        if out.get("ok"):
            epic.setdefault("artifacts", {})["deploy"] = {
                "job_id": out.get("job_id") or "",
                "auto": True,
                "attempts": attempts,
            }
            return _receipt(
                run_id,
                step_id,
                status="pass",
                summary=str(out.get("summary") or "部署完成"),
                artifacts={"deploy_job_id": out.get("job_id") or ""},
                started_at=started,
                evidence={"attempts": attempts, "job_id": out.get("job_id")},
                process_log=process_log,
                result_lines=[
                    f"部署 Job：{out.get('job_id') or '—'}",
                    f"尝试次数：{attempts}",
                    f"摘要：{str(out.get('summary') or '')[:400]}",
                ],
            )
        return _receipt(
            run_id,
            step_id,
            status="fail",
            summary=str(out.get("detail") or "部署失败"),
            artifacts={"deploy": "fail"},
            started_at=started,
            evidence={
                "reason": str(out.get("reason") or "deploy_fail"),
                "attempts": attempts,
                "job_id": out.get("job_id") or "",
                "detail": str(out.get("detail") or "")[:800],
            },
            process_log=process_log,
            result_lines=[
                f"说明：{out.get('detail') or '—'}",
                f"尝试次数：{attempts}",
            ],
        )

    return _receipt(
        run_id,
        step_id,
        status="pending",
        summary="未知步骤",
        started_at=started,
        process_log=process_log,
    )
