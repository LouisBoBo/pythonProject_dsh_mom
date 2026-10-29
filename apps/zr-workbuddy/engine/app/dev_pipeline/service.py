"""dev-pipeline 对外服务。"""
from __future__ import annotations

import time
from typing import Any

from . import config as dp_config
from .ops import FEATURE_ID, STEP_DEFS
from .runner import (
    _apply_cancelled,
    _init_steps_state,
    is_runner_alive,
    start_background,
)
from . import store as dp_store
from .session_mode import get_integrated, set_integrated
from .summary import build_run_summary


def _session_integrated(dsh_session_id: str) -> bool:
    sid = (dsh_session_id or "").strip()
    if not sid:
        return False
    return bool(get_integrated(sid).get("integrated_flow_enabled"))


def _begin_agent_ack(
    run_id: str,
    *,
    reused: bool = False,
    independent: bool = False,
    prior_run_id: str = "",
) -> str:
    """给 Agent 的一行确认：禁止把「空工具输出」当成失败而连调 begin / 让用户自查。"""
    rid = (run_id or "").strip() or "?"
    prior = (prior_run_id or "").strip()
    if independent:
        head = "已为追问新开独立过程流"
    elif reused:
        head = "已挂接进行中的需求→上线过程流卡"
    else:
        head = "已启动需求→上线"
    if prior:
        head += f"（关联本会话上一任务 {prior}）"
    return (
        f"{head}（run_id={rid}）。"
        "进度只在对话框过程流卡更新；"
        + (
            "独立任务，账本不并入旧 Run；但仍沿用本会话工程目录与上一需求上下文，禁止当空白新项目；"
            if independent or prior
            else "本轮勿重复 begin；"
        )
        + "禁止让用户检查绿开关或转写截图；勿再口头复述整张需求表；"
        "禁止让用户去点「对话写码·确认」。"
    )


def _session_context_from_prior(prior: dict[str, Any] | None) -> dict[str, Any] | None:
    """从上一 Run 抽会话关联上下文（独立任务用，不并账本）。"""
    if not prior or not isinstance(prior, dict):
        return None
    rid = str(prior.get("run_id") or "").strip()
    if not rid:
        return None
    msg = str(prior.get("message") or "").strip()
    if len(msg) > 800:
        msg = msg[:800] + "…"
    return {
        "prior_run_id": rid,
        "prior_epic_id": str(prior.get("epic_id") or "").strip() or None,
        "prior_message": msg,
        "prior_workspace": str(prior.get("workspace") or "").strip() or None,
        "prior_status": str(prior.get("status") or "").strip() or None,
        "prior_outcome": str(prior.get("outcome") or "").strip() or None,
        "prior_current_step": str(prior.get("current_step") or "").strip() or None,
    }


def _ids_list(raw: Any) -> list[str]:
    out: list[str] = []
    for x in list(raw or []):
        s = str(x or "").strip()
        if s and s not in out:
            out.append(s)
    return out


def _is_new_followup_content(
    *,
    old_msg: str,
    new_msg: str,
    old_ids: list[str],
    new_ids: list[str],
) -> bool:
    """相对当前 Run 是否为新的追问/附图 → 应新开独立任务（不并入旧 Run）。"""
    for i in new_ids:
        if i and i not in old_ids:
            return True
    n = (new_msg or "").strip()
    o = (old_msg or "").strip()
    if not n:
        return False
    if n == o:
        return False
    if o and n in o:
        return False
    return len(n) >= 4


def _lane_default_workspace() -> str:
    """与四车道共用工程目录：用户常只在写码/审码配置里填过路径。"""
    try:
        from ..config_store import load_config

        cfg = load_config() or {}
    except Exception:
        return ""
    for key in ("code_dev", "code_review", "code_commit"):
        block = cfg.get(key)
        if not isinstance(block, dict):
            continue
        ws = str(block.get("default_workspace") or "").strip()
        if ws:
            return ws
    return ""


def resolve_workspace(
    *candidates: str,
    run: dict[str, Any] | None = None,
    epic: dict[str, Any] | None = None,
) -> str:
    """解析工程目录：显式 → 账本 → **写码/四车道共用配置** → 兼容旧 dev_pipeline.default_workspace。

    真相源优先 `code_dev.default_workspace`（及审码/提交同名字段），避免与
    `dev_pipeline.default_workspace` 两处各写各的。
    """
    for raw in candidates:
        ws = str(raw or "").strip()
        if ws:
            return ws
    if run is not None:
        ws = str(run.get("workspace") or "").strip()
        if ws:
            return ws
    if epic is not None:
        ws = str(epic.get("workspace") or "").strip()
        if ws:
            return ws
    # 单处真相：四车道写码配置
    ws = _lane_default_workspace()
    if ws:
        return ws
    # 兼容旧配置（仅当写码等车道都未填时）
    return str(dp_config.get_config().get("default_workspace") or "").strip()


def status(*, dsh_session_id: str = "") -> dict[str, Any]:
    cfg = dp_config.get_config()
    sid = (dsh_session_id or "").strip()
    flow_on = _session_integrated(sid) if sid else False
    missing_sid = not sid
    return {
        "ok": True,
        "feature": FEATURE_ID,
        "enabled": cfg.get("enabled", True),
        "dsh_session_id": sid or None,
        "integrated_flow_enabled": flow_on,
        **(
            {
                "detail": "缺少 dsh_session_id，无法读取本会话开关（宿主应自动注入当前会话 id）",
                "coding_mode": "lane",
            }
            if missing_sid
            else {}
        ),
        "integrated_flow_scope": "session",
        "coding_mode": "integrated" if flow_on else "lane",
        "steps": [s["id"] + " " + s["title"] for s in STEP_DEFS],
        "p1_auto": ["1", "2", "3", "4", "5(暂停 HITL)", "确认写码后 6→7…"],
        "validate_commands": len(cfg.get("validate_commands") or []),
    }


def set_session_integrated_flow(*, dsh_session_id: str, enabled: bool) -> dict[str, Any]:
    cfg = dp_config.get_config()
    if not cfg.get("enabled", True):
        return {"ok": False, "detail": "dev-pipeline 未启用（功能插件 dev-pipeline）"}
    out = set_integrated(dsh_session_id, enabled)
    # 关掉「需求→上线」= 回到普通写码：自动停掉本会话未结束的一体化 Run，避免卡死在旧过程流
    if out.get("ok") and not enabled:
        sid = (dsh_session_id or "").strip()
        data_dir = dp_store.default_data_dir()
        open_run = dp_store.find_open_run_for_session(data_dir, sid) if sid else None
        if open_run and open_run.get("run_id"):
            cancelled = cancel_run(
                str(open_run["run_id"]),
                reason="用户关闭「需求→上线」开关，改回普通写码",
            )
            out["cancelled_open_run"] = cancelled.get("run_id") or open_run.get("run_id")
            out["cancelled_ok"] = bool(cancelled.get("ok"))
    return out


def _reap_orphan_run(data_dir, run: dict[str, Any]) -> dict[str, Any]:
    """引擎重启后后台线程已死：优先自动续跑，避免「引擎中断」假取消。"""
    if not run:
        return run
    st = str(run.get("status") or "")
    if st not in ("running", "queued"):
        return run
    rid = str(run.get("run_id") or "")
    if not rid:
        return run
    if is_runner_alive(rid):
        return run
    # 刚创建的 Run 线程可能尚未登记：给 3s 宽限
    age = int(time.time()) - int(run.get("updated_at") or run.get("created_at") or 0)
    if age < 3:
        return run
    resumes = int(run.get("engine_resume_count") or 0)
    # 放宽：开发/运维重启引擎常见；有步骤进展会清零。满 8 次才放弃。
    max_resumes = 8
    if resumes >= max_resumes:
        steps = list(run.get("steps") or _init_steps_state())
        cur = str(run.get("current_step") or "")
        last_sum = ""
        for row in steps:
            if str(row.get("step_id")) == cur:
                last_sum = str(row.get("summary") or "")
                break
        reason = (
            f"引擎中断续跑已达上限（{max_resumes} 次），流程停止。"
            + (f" 末次步骤摘要：{last_sum}" if last_sum else " 请重新发需求开跑。")
        )
        _apply_cancelled(
            data_dir,
            rid,
            run,
            steps,
            cur=cur,
            reason=reason[:400],
        )
        return dp_store.load_run(data_dir, rid) or run
    # 重置当前「执行中」步骤，后台续跑
    steps = list(run.get("steps") or _init_steps_state())
    cur = str(run.get("current_step") or "")
    for st_row in steps:
        if str(st_row.get("step_id") or "") == cur and str(st_row.get("status") or "") == "running":
            st_row["status"] = "pending"
            st_row["summary"] = "引擎中断后自动续跑本步…"
            break
    run["steps"] = steps
    run["status"] = "running"
    run["engine_resume_count"] = resumes + 1
    # 续跑同一步：不抬写码「第 N 轮」（与交付打回 ≤3 轮解耦）
    if cur:
        run["resume_pending_step"] = cur
    run["cancel_requested"] = False
    if run.get("cancel_reason") and "后台线程已中断" in str(run.get("cancel_reason")):
        run.pop("cancel_reason", None)
    run["updated_at"] = int(time.time())
    dp_store.save_run(data_dir, run)
    start_background(data_dir, rid, mode="resume")
    return dp_store.load_run(data_dir, rid) or run


def cancel_run(run_id: str, *, reason: str = "") -> dict[str, Any]:
    """停止进行中的一体化 Run（可被卡片按钮 / 输入「暂停」「取消」触发）。"""
    data_dir = dp_store.default_data_dir()
    rid = (run_id or "").strip()
    run = dp_store.load_run(data_dir, rid)
    if not run:
        return {"ok": False, "detail": "run 不存在"}
    st = str(run.get("status") or "")
    if st in ("done", "failed", "cancelled", "canceled"):
        return {
            "ok": True,
            "already_finished": True,
            "run_id": rid,
            "dev_pipeline_ui": _build_ui(run),
        }
    detail = (reason or "用户已停止任务").strip()
    run["cancel_requested"] = True
    run["cancel_reason"] = detail
    dp_store.save_run(data_dir, run)
    # 线程已死：立刻落终态；线程仍在：循环下一检查点会收敛
    if not is_runner_alive(rid):
        steps = list(run.get("steps") or _init_steps_state())
        _apply_cancelled(
            data_dir,
            rid,
            run,
            steps,
            cur=str(run.get("current_step") or ""),
            reason=detail,
        )
    else:
        # 先让 UI 感知「正在停止」
        run["status"] = "cancelling"
        dp_store.save_run(data_dir, run)
        from .events import publish

        publish(
            rid,
            {
                "type": "run",
                "phase": "cancelling",
                "current_step": run.get("current_step"),
                "ts": int(time.time()),
            },
        )
        # 短等线程收敛；超时再强制落盘
        for _ in range(20):
            time.sleep(0.15)
            if not is_runner_alive(rid):
                break
        fresh = dp_store.load_run(data_dir, rid) or run
        if str(fresh.get("status") or "") not in ("cancelled", "canceled"):
            steps = list(fresh.get("steps") or _init_steps_state())
            _apply_cancelled(
                data_dir,
                rid,
                fresh,
                steps,
                cur=str(fresh.get("current_step") or ""),
                reason=detail,
            )
    out = dp_store.load_run(data_dir, rid) or run
    return {
        "ok": True,
        "run_id": rid,
        "status": out.get("status"),
        "reply": "",
        "dev_pipeline_ui": _build_ui(out),
    }


def get_active_run(*, dsh_session_id: str) -> dict[str, Any]:
    """本会话进行中的 Run（供聊天 UI 挂时间线，不依赖 Agent 调 begin）。"""
    sid = (dsh_session_id or "").strip()
    if not sid:
        return {"ok": False, "detail": "缺少 sessionId", "run": None}
    data_dir = dp_store.default_data_dir()
    run = dp_store.find_open_run_for_session(data_dir, sid)
    if not run:
        return {
            "ok": True,
            "dsh_session_id": sid,
            "run": None,
            "dev_pipeline_ui": None,
        }
    rid = str(run.get("run_id") or "")
    fresh = _reap_orphan_run(data_dir, dp_store.load_run(data_dir, rid) or run)
    # 孤儿已取消则不再当作 active
    if str(fresh.get("status") or "") in ("cancelled", "canceled", "done", "failed"):
        return {
            "ok": True,
            "dsh_session_id": sid,
            "run": None,
            "dev_pipeline_ui": _build_ui(fresh),
            "reaped_orphan": True,
        }
    if not fresh.get("run_summary"):
        fresh["run_summary"] = build_run_summary(fresh)
    return {
        "ok": True,
        "dsh_session_id": sid,
        "run": fresh,
        "dev_pipeline_ui": _build_ui(fresh),
    }


def get_latest_run(*, dsh_session_id: str) -> dict[str, Any]:
    """本会话最近一条 Run（含已结束），供历史过程流卡/开关对齐引擎真相源。"""
    sid = (dsh_session_id or "").strip()
    if not sid:
        return {"ok": False, "detail": "缺少 sessionId", "run": None}
    data_dir = dp_store.default_data_dir()
    run = dp_store.find_latest_run_for_session(data_dir, sid)
    if not run:
        return {
            "ok": True,
            "dsh_session_id": sid,
            "run": None,
            "dev_pipeline_ui": None,
        }
    rid = str(run.get("run_id") or "")
    fresh = dp_store.load_run(data_dir, rid) or run
    if str(fresh.get("status") or "") in ("running", "queued"):
        fresh = _reap_orphan_run(data_dir, fresh)
    if not fresh.get("run_summary"):
        fresh["run_summary"] = build_run_summary(fresh)
    return {
        "ok": True,
        "dsh_session_id": sid,
        "run": fresh,
        "dev_pipeline_ui": _build_ui(fresh),
    }


def _build_ui(run: dict[str, Any]) -> dict[str, Any]:
    # 每次组装 UI 重算摘要（时长 / 时间线状态随步骤推进刷新）
    summary = build_run_summary(run)
    run["run_summary"] = summary
    return {
        "kind": "timeline",
        "run_id": run.get("run_id"),
        "epic_id": run.get("epic_id"),
        "dsh_session_id": run.get("dsh_session_id") or "",
        "status": run.get("status"),
        "outcome": run.get("outcome"),
        "current_step": run.get("current_step"),
        "steps": run.get("steps") or [],
        "message": run.get("message") or "",
        "workspace": run.get("workspace") or "",
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "run_summary": summary,
        "fix_round": int(run.get("fix_round") or 0),
        "timeline_trace": run.get("timeline_trace") or [],
        "implement_attempt": int(run.get("implement_attempt") or 1),
    }


def begin_run(
    *,
    message: str,
    workspace: str = "",
    user_id: str = "",
    dsh_session_id: str = "",
    images: list | None = None,
    image_ids: list | None = None,
) -> dict[str, Any]:
    cfg = dp_config.get_config()
    if not cfg.get("enabled", True):
        return {"ok": False, "detail": "dev-pipeline 未启用（config.yaml · dev_pipeline.enabled）"}
    sid = (dsh_session_id or "").strip()
    if not _session_integrated(sid):
        return {
            "ok": False,
            "detail": "本会话未开启一体化：请在当前对话顶栏打开「需求→上线」开关（仅本会话）；日常写码请用 mes_code_dev_begin。",
            "coding_mode": "lane",
            "dsh_session_id": sid or None,
        }
    msg = (message or "").strip()
    # 宿主 skill-catalog / runtime / 沙箱政策注入不得当成需求开跑
    if msg:
        from .intake_normalize import (
            looks_like_memory_preference_dump,
            looks_like_pipeline_meta_not_product,
            looks_like_runtime_injection,
            looks_like_sandbox_policy,
            normalize_intake,
        )

        if (
            looks_like_runtime_injection(msg)
            or looks_like_sandbox_policy(msg)
            or looks_like_memory_preference_dump(msg)
            or looks_like_pipeline_meta_not_product(msg)
        ):
            norm = normalize_intake(text=msg)
            core = str(norm.get("core") or "").strip()
            if (
                len(core) < 8
                or looks_like_runtime_injection(core)
                or looks_like_sandbox_policy(core)
                or looks_like_pipeline_meta_not_product(core)
            ):
                # 尚可能有附图：先不清退，等合并 image_ids 后再判
                msg = ""
            else:
                msg = core
    # 显式传入 + 会话 pending 附图（粘贴上传）一并带入；无图时行为与改前一致
    intake_ids: list[str] = []
    for x in list(image_ids or []):
        s = str(x or "").strip()
        if s and s not in intake_ids:
            intake_ids.append(s)
    for x in list(images or []):
        if isinstance(x, dict):
            s = str(x.get("image_id") or x.get("id") or "").strip()
        else:
            s = str(x or "").strip()
        if s.startswith("vimg-") and s not in intake_ids:
            intake_ids.append(s)
    # 正文里的 【附图:vimg-…】 / markdown 图片链也算
    try:
        import re as _re

        for m in _re.finditer(r"vimg-[a-zA-Z0-9_-]+", message or ""):
            s = m.group(0)
            if s not in intake_ids:
                intake_ids.append(s)
    except Exception:
        pass
    if sid:
        try:
            from ..vision import store as vision_store

            pend = vision_store.consume_pending(sid)
            for s in list(pend.get("image_ids") or []):
                if s and s not in intake_ids:
                    intake_ids.append(s)
        except Exception:
            pass
    intake_ids = intake_ids[:6]
    if not msg and not intake_ids:
        return {
            "ok": False,
            "detail": (
                "请提供真实需求描述或至少一张附图。"
                "若只看到 Current DSH file policy / Approval policy，那是宿主沙箱提示，不是需求。"
            ),
        }
    if not msg and intake_ids:
        msg = "（附图需求，详见识图结果）"
    # 有图但正文仍是政策噪音：强制走附图主路径，避免 PRD 锁政策文
    elif intake_ids and msg:
        from .intake_normalize import looks_like_runtime_injection, looks_like_sandbox_policy

        if looks_like_runtime_injection(msg) or looks_like_sandbox_policy(msg):
            msg = "（附图需求，详见识图结果）"
    ws = resolve_workspace(workspace)
    data_dir = dp_store.default_data_dir()
    superseded_for_followup = False
    prior_for_context: dict[str, Any] | None = None
    existing = dp_store.find_open_run_for_session(data_dir, sid)
    if existing:
        rid = str(existing.get("run_id") or "")
        run = _reap_orphan_run(data_dir, dp_store.load_run(data_dir, rid) or existing)
        # 孤儿已清掉则可开新跑；仍活着则复用
        if str(run.get("status") or "") in ("cancelled", "canceled", "done", "failed"):
            existing = None
        else:
            # 旧 Run 账本空目录时补绑（本轮传入 / 写码配置），避免卡在确认写码
            if ws and not str(run.get("workspace") or "").strip():
                run["workspace"] = ws
                epic_fix = dp_store.load_epic(data_dir, str(run.get("epic_id") or "")) or {}
                if epic_fix and not str(epic_fix.get("workspace") or "").strip():
                    epic_fix["workspace"] = ws
                    dp_store.save_epic(data_dir, epic_fix)
                dp_store.save_run(data_dir, run)
            old_ids = _ids_list(
                run.get("intake_image_ids")
                or (
                    (dp_store.load_epic(data_dir, str(run.get("epic_id") or "")) or {}).get(
                        "intake_image_ids"
                    )
                )
            )
            # 追问 = 独立任务：结束旧 Run，再新建 epic/run（绝不并入旧账本）
            if _is_new_followup_content(
                old_msg=str(run.get("message") or ""),
                new_msg=msg,
                old_ids=old_ids,
                new_ids=list(intake_ids),
            ):
                prior_for_context = dict(run)
                cancel_run(
                    rid,
                    reason="用户追问已新开独立任务，结束旧过程流",
                )
                superseded_for_followup = True
                existing = None
            else:
                if not run.get("run_summary"):
                    run["run_summary"] = build_run_summary(run)
                if sid:
                    try:
                        set_integrated(sid, True, data_dir=data_dir)
                    except Exception:
                        pass
                ui = _build_ui(run)
                return {
                    "ok": True,
                    "reply": _begin_agent_ack(rid, reused=True),
                    "run_id": rid,
                    "epic_id": run.get("epic_id"),
                    "dev_pipeline_ui": ui,
                    "reused_open_run": True,
                }
    # 无进行中 Run 时：仍取本会话最近一条（含已完成）做上下文关联
    if prior_for_context is None and sid:
        prior_for_context = dp_store.find_latest_run_for_session(data_dir, sid)
    session_ctx = _session_context_from_prior(prior_for_context)
    # 独立追问沿用上一任务工程目录（同会话关联性）
    if session_ctx and not ws:
        ws = resolve_workspace(
            str(session_ctx.get("prior_workspace") or ""),
            workspace,
        )
    epic_id = dp_store.new_epic_id()
    run_id = dp_store.new_run_id()
    now = int(time.time())
    epic: dict[str, Any] = {
        "epic_id": epic_id,
        "message": msg,
        "workspace": ws,
        "user_id": user_id,
        "created_at": now,
        "runs": [run_id],
        "intake_image_ids": list(intake_ids),
    }
    run: dict[str, Any] = {
        "run_id": run_id,
        "epic_id": epic_id,
        "message": msg,
        "workspace": ws,
        "user_id": user_id,
        "dsh_session_id": sid,
        "status": "queued",
        "outcome": None,
        "current_step": "1",
        "steps": _init_steps_state(),
        "fix_round": 0,
        "implement_attempt": 1,
        "timeline_trace": [],
        "created_at": now,
        "intake_image_ids": list(intake_ids),
    }
    if session_ctx:
        epic["session_context"] = dict(session_ctx)
        run["session_context"] = dict(session_ctx)
        run["prior_run_id"] = session_ctx.get("prior_run_id")
        epic.setdefault("artifacts", {})["session_context"] = dict(session_ctx)
    dp_store.save_epic(data_dir, epic)
    dp_store.save_run(data_dir, run)
    # 开跑即固化会话开关，避免冷启后模式文件缺失/为假而开关关着、时间线还在
    if sid:
        try:
            set_integrated(sid, True, data_dir=data_dir)
        except Exception:
            pass
    start_background(data_dir, run_id, mode="begin")
    run = dp_store.load_run(data_dir, run_id) or run
    ui = _build_ui(run)
    prior_rid = str((session_ctx or {}).get("prior_run_id") or "")
    return {
        "ok": True,
        "reply": _begin_agent_ack(
            run_id,
            reused=False,
            independent=superseded_for_followup,
            prior_run_id=prior_rid,
        ),
        "run_id": run_id,
        "epic_id": epic_id,
        "dev_pipeline_ui": ui,
        "independent_followup": superseded_for_followup,
        "prior_run_id": prior_rid or None,
    }


def get_run(run_id: str) -> dict[str, Any]:
    data_dir = dp_store.default_data_dir()
    run = dp_store.load_run(data_dir, run_id)
    if not run:
        return {"ok": False, "detail": "run 不存在"}
    run = _reap_orphan_run(data_dir, run)
    if not run.get("run_summary"):
        run["run_summary"] = build_run_summary(run)
    return {"ok": True, "run": run, "dev_pipeline_ui": _build_ui(run)}


def _mark_step_pass(steps: list[dict[str, Any]], step_id: str, summary: str) -> None:
    for st in steps:
        if st.get("step_id") == step_id:
            st["status"] = "pass"
            if summary:
                st["summary"] = summary
            break


def confirm_step(
    run_id: str,
    *,
    step_id: str,
    decision: str = "pass",
    cursor_job_id: str = "",
    no_code_change: bool = False,
    note: str = "",
    workspace: str = "",
) -> dict[str, Any]:
    """HITL 确认（步骤 5/7/8/9/10）；不调用四车道 begin，仅推进账本。"""
    data_dir = dp_store.default_data_dir()
    run = dp_store.load_run(data_dir, run_id)
    if not run:
        return {"ok": False, "detail": "run 不存在"}
    sid = (step_id or "").strip()
    if sid not in ("5", "7", "8", "9", "10"):
        return {"ok": False, "detail": "P1 仅支持确认步骤 5/7/8/9/10"}
    dec = (decision or "pass").strip().lower()
    steps: list[dict[str, Any]] = run.get("steps") or _init_steps_state()
    cur_st = next((s for s in steps if s.get("step_id") == sid), None)
    if not cur_st:
        return {"ok": False, "detail": "步骤不存在"}
    if str(cur_st.get("status")) not in ("waiting_hitl", "waiting_user"):
        return {
            "ok": False,
            "detail": f"步骤 {sid} 当前为 {cur_st.get('status')}，不可确认",
        }

    epic_id = str(run.get("epic_id") or "")
    epic = dp_store.load_epic(data_dir, epic_id) or {}

    if dec != "pass":
        cur_st["status"] = "fail"
        cur_st["summary"] = note or "用户拒绝本步"
        run["steps"] = steps
        run["status"] = "failed"
        run["outcome"] = "failed"
        run["current_step"] = sid
        run["run_summary"] = build_run_summary(run)
        dp_store.save_run(data_dir, run)
        return {"ok": True, "dev_pipeline_ui": _build_ui(run)}

    if sid == "5":
        from ..code_dev.workspace import validate_workspace

        # 顶栏已选工作区 / 写码配置均可兜底；勿只认空的 dev_pipeline.default_workspace
        ws = resolve_workspace(workspace, run=run, epic=epic)
        check = validate_workspace(ws)
        if not check.get("ok"):
            return {
                "ok": False,
                "detail": (
                    "尚未绑定有效工程目录，无法进入验证："
                    + str(check.get("error") or "本地目录不能为空")
                    + "。请确认顶栏已选工程目录，或在写码配置 / "
                    "config.yaml · code_dev.default_workspace（或 "
                    "dev_pipeline.default_workspace）填好绝对路径后再确认写码。"
                ),
                "dev_pipeline_ui": _build_ui(run),
            }
        # 确认时补写 workspace，避免账本仍为空（含本次从配置/顶栏兜底拿到的路径）
        bound = str(check.get("path") or ws).strip()
        if bound:
            run["workspace"] = bound
            epic["workspace"] = bound
        epic.setdefault("artifacts", {})["implement"] = {
            "cursor_job_id": (cursor_job_id or "").strip(),
            "no_code_change": bool(no_code_change),
            "note": (note or "").strip(),
            "confirmed_at": int(time.time()),
        }
        dp_store.save_epic(data_dir, epic)
        _mark_step_pass(steps, "5", note or "写码已确认完成")
        run["steps"] = steps
        run["current_step"] = "5"
        run["status"] = "queued"
        dp_store.save_run(data_dir, run)
        start_background(data_dir, run_id, mode="post_implement")
    else:
        _mark_step_pass(steps, sid, note or f"步骤 {sid} 已确认")
        run["steps"] = steps
        run["current_step"] = sid
        run["status"] = "queued"
        dp_store.save_run(data_dir, run)
        start_background(data_dir, run_id, mode="lane_continue")

    run = dp_store.load_run(data_dir, run_id) or run
    return {"ok": True, "dev_pipeline_ui": _build_ui(run)}


def advance_run(run_id: str, *, step_id: str = "", workspace: str = "") -> dict[str, Any]:
    """重试当前步或指定步（机器步）；HITL 步请用 confirm_step。"""
    data_dir = dp_store.default_data_dir()
    run = dp_store.load_run(data_dir, run_id)
    if not run:
        return {"ok": False, "detail": "run 不存在"}
    if step_id:
        run["current_step"] = step_id
    cur = str(run.get("current_step") or "1")
    if cur in ("5", "7", "8", "9", "10"):
        st = next((s for s in (run.get("steps") or []) if s.get("step_id") == cur), None)
        if st and str(st.get("status")) in ("waiting_hitl", "waiting_user"):
            return {
                "ok": False,
                "detail": f"步骤 {cur} 需 HITL 确认（mes_dev_pipeline_confirm_step），不可 advance 重跑",
            }
    # 重试前补工程目录：账本空则吃顶栏/配置兜底
    epic_id = str(run.get("epic_id") or "")
    epic = dp_store.load_epic(data_dir, epic_id) or {}
    ws = resolve_workspace(workspace, run=run, epic=epic)
    if ws and not str(run.get("workspace") or "").strip():
        run["workspace"] = ws
        if epic and not str(epic.get("workspace") or "").strip():
            epic["workspace"] = ws
            dp_store.save_epic(data_dir, epic)
    run["status"] = "queued"
    dp_store.save_run(data_dir, run)
    start_background(data_dir, run_id, mode="retry")
    run = dp_store.load_run(data_dir, run_id) or run
    return {
        "ok": True,
        "reply": f"已继续过程流（run_id={run_id}）。若有新需求/附图请改调 mes_dev_pipeline_begin 新开独立任务，勿反复 advance。",
        "run_id": run_id,
        "dev_pipeline_ui": _build_ui(run),
    }
