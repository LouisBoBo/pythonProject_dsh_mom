"""后台推进 Run（P1：1→5 自动停 HITL；确认写码后 6；7～10 车道 HITL）。"""
from __future__ import annotations

import threading
import time
from typing import Any

from . import config as dp_config
from .fix_loop import (
    bump_fix_round,
    is_fix_round_exhausted,
    max_fix_rounds,
    reset_steps_for_implement_retry,
    retry_sequence_after_implement_fix,
    should_auto_retry_implement,
    store_commit_gate_fail_epic,
    store_review_fail_epic,
    store_validate_fail_mandate,
)
from .events import publish
from .ops import P1_FULL_AUTO_SEQUENCE, P1_LANE_HANDOFF, P1_POST_IMPLEMENT, P1_SOFT_SEQUENCE, STEP_DEFS
from .skill_catalog import skill_for
from .steps import run_step
from .store import load_epic, load_run, save_epic, save_run
from .summary import build_run_summary
from .timeline_trace import (
    record_rollback,
    trace_cancel_open_steps,
    trace_step_finished,
    trace_step_running,
    write_attempt_count,
)

# run_id → 后台线程（引擎重启后全部失效，用于识别孤儿 running）
_ACTIVE_THREADS: dict[str, threading.Thread] = {}
_ACTIVE_LOCK = threading.Lock()


def is_runner_alive(run_id: str) -> bool:
    rid = str(run_id or "").strip()
    if not rid:
        return False
    with _ACTIVE_LOCK:
        t = _ACTIVE_THREADS.get(rid)
    return bool(t and t.is_alive())


def _register_thread(run_id: str, t: threading.Thread) -> None:
    with _ACTIVE_LOCK:
        _ACTIVE_THREADS[str(run_id)] = t


def _unregister_thread(run_id: str) -> None:
    with _ACTIVE_LOCK:
        _ACTIVE_THREADS.pop(str(run_id), None)


def is_cancel_requested(data_dir, run_id: str) -> bool:
    run = load_run(data_dir, run_id)
    if not run:
        return True
    if run.get("cancel_requested"):
        return True
    return str(run.get("status") or "") in ("cancelled", "canceled")


def _init_steps_state() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in STEP_DEFS:
        sk = skill_for(s["id"])
        out.append(
            {
                "step_id": s["id"],
                "key": s["key"],
                "title": s["title"],
                "skill_id": sk.get("id") or s.get("skill") or "",
                "skill_title": sk.get("title_zh") or "",
                "flow_brief": sk.get("flow_brief") or "",
                "status": "pending",
                "summary": "",
                "receipt": None,
            }
        )
    return out


def _apply_receipt(steps: list[dict[str, Any]], receipt: dict[str, Any]) -> None:
    sid = str(receipt.get("step_id") or "")
    for st in steps:
        if st["step_id"] == sid:
            status = str(receipt.get("status") or "fail")
            st["status"] = status
            st["summary"] = str(receipt.get("summary") or "")
            st["receipt"] = receipt
            if receipt.get("skill_id"):
                st["skill_id"] = receipt.get("skill_id")
            if receipt.get("skill_title"):
                st["skill_title"] = receipt.get("skill_title")
            if receipt.get("result_detail"):
                st["result_detail"] = receipt.get("result_detail")
            arts = receipt.get("artifacts") if isinstance(receipt.get("artifacts"), dict) else {}
            if arts.get("can_manual_retry"):
                st["can_manual_retry"] = True
            break


def _publish_run_phase(run_id: str, run: dict[str, Any]) -> None:
    publish(
        run_id,
        {
            "type": "run",
            "phase": run.get("status"),
            "outcome": run.get("outcome"),
            "current_step": run.get("current_step"),
            "run_summary": run.get("run_summary"),
            "ts": int(time.time()),
        },
    )


def _finalize_summary(data_dir, run: dict[str, Any]) -> None:
    run["run_summary"] = build_run_summary(run)
    run["outcome"] = run["run_summary"].get("outcome")
    save_run(data_dir, run)


def _fail_run_fix_exhausted(
    data_dir,
    run: dict[str, Any],
    epic: dict[str, Any],
    steps: list[dict[str, Any]],
    *,
    fix_round: int,
    fail_step_id: str,
    fail_receipt: dict[str, Any],
    from_step: str,
) -> None:
    """打回次数用尽：整条 Run 失败（不再进入第 4 轮写码）。"""
    mx = max_fix_rounds()
    summary = (
        f"写码修复已进行 {fix_round} 轮（上限 {mx}），仍未通过第 {from_step} 步，流程失败。"
        f"末次原因：{fail_receipt.get('summary') or '—'}"
    )
    for st in steps:
        if st["step_id"] == fail_step_id:
            st["status"] = "fail"
            st["summary"] = str(fail_receipt.get("summary") or summary)
            st["receipt"] = fail_receipt
    run["steps"] = steps
    run["status"] = "failed"
    run["current_step"] = fail_step_id
    run["outcome"] = "failed"
    run["fail_reason"] = "fix_rounds_exhausted"
    rs = run.get("run_summary") if isinstance(run.get("run_summary"), dict) else {}
    if isinstance(rs, dict):
        rs["outcome"] = "failed"
        rs["headline"] = summary[:200]
    run["run_summary"] = rs
    save_epic(data_dir, epic)
    save_run(data_dir, run)
    _finalize_summary(data_dir, run)
    _publish_run_phase(run["run_id"], run)
    _publish_snapshot(run["run_id"], load_run(data_dir, run["run_id"]) or run)


def _pause_implement_for_manual_fix(
    data_dir,
    run: dict[str, Any],
    epic: dict[str, Any],
    steps: list[dict[str, Any]],
    *,
    fix_round: int,
    hitl_summary: str,
    fail_step_id: str,
    fail_receipt: dict[str, Any],
    log_line: str,
) -> None:
    for st in steps:
        if st["step_id"] == "5":
            st["status"] = "waiting_hitl"
            st["summary"] = hitl_summary
            old_rec = st.get("receipt") if isinstance(st.get("receipt"), dict) else {}
            pl = list(((old_rec.get("evidence") or {}).get("process_log") or []))
            pl.append(log_line)
            st["receipt"] = {
                **old_rec,
                "step_id": "5",
                "status": "waiting_hitl",
                "summary": st["summary"],
                "evidence": {
                    **(old_rec.get("evidence") or {}),
                    "process_log": pl,
                },
            }
        if st["step_id"] == fail_step_id:
            st["status"] = "fail"
            st["summary"] = str(fail_receipt.get("summary") or "未通过")
            st["receipt"] = fail_receipt
    run["steps"] = steps
    run["status"] = "paused"
    run["current_step"] = "5"
    run["outcome"] = "partial"
    save_epic(data_dir, epic)
    save_run(data_dir, run)
    _finalize_summary(data_dir, run)
    _publish_run_phase(run["run_id"], run)
    _publish_snapshot(run["run_id"], load_run(data_dir, run["run_id"]) or run)


def _fail_close_if_still_running(
    data_dir,
    run_id: str,
    run: dict[str, Any],
    steps: list[dict[str, Any]],
    receipt: dict[str, Any],
) -> None:
    """步骤失败且未进入打回/HITL 时：禁止留下 status=running（否则孤儿续跑假抬轮次）。"""
    fresh = load_run(data_dir, run_id) or run
    st = str(fresh.get("status") or "")
    if st not in ("running", "queued"):
        return
    fresh["steps"] = steps
    fresh["status"] = "failed"
    fresh["outcome"] = "failed"
    ev = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    reason = str(ev.get("reason") or receipt.get("result_detail") or "step_fail")
    fresh["fail_reason"] = reason[:120]
    save_run(data_dir, fresh)
    _finalize_summary(data_dir, fresh)
    _publish_run_phase(run_id, fresh)
    _publish_snapshot(run_id, load_run(data_dir, run_id) or fresh)


def _handle_step5_scope_fail(
    data_dir,
    run: dict[str, Any],
    epic: dict[str, Any],
    receipt: dict[str, Any],
    steps: list[dict[str, Any]],
) -> bool:
    """写码交付未达标（空变更 / 内容缺口 / 改错页 / 范围越界）→ 自动打回写码。"""
    from .implement_gate import DELIVERY_RETRY_REASONS, store_delivery_fail_mandate

    ev = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    reason = str(ev.get("reason") or "")
    if reason not in DELIVERY_RETRY_REASONS:
        return False
    fix_round = bump_fix_round(run)
    # 统一用门禁 verdict 写精准清单（避免 content_gap 被说成「超出范围」）
    verdict = {
        "reason": reason,
        "summary": str(receipt.get("summary") or ""),
        "violations": list(ev.get("violations") or []),
        "mandate_items": list(ev.get("mandate_items") or []),
        "changed_files": list(ev.get("changed_files") or []),
        "class": "retry_delivery",
    }
    if not verdict["mandate_items"]:
        if reason == "no_changed_files":
            verdict["mandate_items"] = [
                "必须真实改盘并产生非空 changed_files；空 Job 成功不算交付",
                "对照【写码任务卡】实现功能；禁止只回复说明而不落文件",
                "禁止创建/同步 *.db / erp.db",
            ]
        elif reason == "db_sync_blocked":
            verdict["mandate_items"] = [
                "禁止创建/修改/同步任何 *.db / *.sqlite / erp.db",
                "只改业务源码；若功能已实现只回传源码路径",
            ]
        elif reason == "content_gap":
            verdict["mandate_items"] = [
                "按用户意图补齐列/字段文案（勿擅自换成需求未写的列）",
                "不要扩大改动面",
            ]
        elif reason == "must_fix_unaddressed":
            verdict["mandate_items"] = [
                "高危 must_fix 入参未落盘：须在点名文件增加 Query/函数形参",
                "响应字段赋值不算完成；对照「修复：」逐条改签名与过滤逻辑",
            ]
        elif reason == "wrong_page":
            verdict["mandate_items"] = [
                "撤销禁止路径上的改动",
                "只改任务卡必须改文件",
            ]
        else:
            verdict["mandate_items"] = ["缩小变更面，仅保留需求相关 diff"]
    store_delivery_fail_mandate(epic, verdict, round_no=fix_round)
    fail_summary = str(receipt.get("summary") or f"写码未通过（{reason}）")
    for st in steps:
        if st["step_id"] == "5":
            st["status"] = "fail"
            st["summary"] = fail_summary
            st["receipt"] = receipt
    if should_auto_retry_implement(reason=reason, fix_round=fix_round):
        record_rollback(
            run,
            from_step="5",
            fix_round=fix_round,
            reason=fail_summary,
        )
        reset_steps_for_implement_retry(steps)
        run["steps"] = steps
        run["status"] = "running"
        run["current_step"] = "5"
        run["outcome"] = None
        run.pop("resume_pending_step", None)  # 交付打回 = 新一轮，不是引擎续跑
        save_epic(data_dir, epic)
        save_run(data_dir, run)
        _publish_snapshot(run["run_id"], run)
        return True
    if is_fix_round_exhausted(fix_round):
        record_rollback(
            run,
            from_step="5",
            fix_round=fix_round,
            reason=fail_summary,
        )
        _fail_run_fix_exhausted(
            data_dir,
            run,
            epic,
            steps,
            fix_round=fix_round,
            fail_step_id="5",
            fail_receipt=receipt,
            from_step="5",
        )
        return False
    record_rollback(
        run,
        from_step="5",
        fix_round=fix_round,
        reason=fail_summary,
    )
    _hitl_by_reason = {
        "no_changed_files": "请补真实 diff 后点「写码已完成，继续验证」。",
        "db_sync_blocked": "请去掉对 *.db 的改动、只留源码后点「写码已完成，继续验证」。",
        "content_gap": "请按任务卡补齐列/字段后点「写码已完成，继续验证」。",
        "must_fix_unaddressed": "请按高危「修复：」在点名文件增加入参/过滤后点「写码已完成，继续验证」。",
        "wrong_page": "请撤销错页改动、只改锚定页后点「写码已完成，继续验证」。",
        "scope_creep": "请撤销无关改动后点「写码已完成，继续验证」。",
    }
    _pause_implement_for_manual_fix(
        data_dir,
        run,
        epic,
        steps,
        fix_round=fix_round,
        fail_step_id="5",
        fail_receipt=receipt,
        hitl_summary=(
            f"写码未通过（第 {fix_round} 轮 · {reason}）。"
            + _hitl_by_reason.get(reason, "请修复后点「写码已完成，继续验证」。")
        ),
        log_line=f"写码失败回退：{fail_summary}",
    )
    return False


def _handle_step6_fail(
    data_dir,
    run: dict[str, Any],
    epic: dict[str, Any],
    receipt: dict[str, Any],
    steps: list[dict[str, Any]],
) -> bool:
    """验证失败。auto_run 下返回 True → 自动再打回写码并重跑 5→6→7…"""
    reason = str((receipt.get("evidence") or {}).get("reason") or "cmd_fail")
    if reason in ("no_workspace", "bad_workspace"):
        for st in steps:
            if st["step_id"] == "6":
                st["status"] = "waiting_user"
                st["summary"] = str(
                    receipt.get("summary")
                    or "未绑定有效工程目录，无法验证；配置 workspace 后请重试本步"
                )
                st["receipt"] = receipt
        run["steps"] = steps
        run["status"] = "paused"
        run["current_step"] = "6"
        run["outcome"] = "partial"
        save_epic(data_dir, epic)
        save_run(data_dir, run)
        _finalize_summary(data_dir, run)
        _publish_run_phase(run["run_id"], run)
        _publish_snapshot(run["run_id"], load_run(data_dir, run["run_id"]) or run)
        return False

    fix_round = bump_fix_round(run)
    store_validate_fail_mandate(epic, receipt, round_no=fix_round)

    for st in steps:
        if st["step_id"] == "6":
            st["status"] = "fail"
            st["summary"] = str(receipt.get("summary") or "验证失败")
            st["receipt"] = receipt

    if should_auto_retry_implement(reason=reason, fix_round=fix_round):
        record_rollback(
            run,
            from_step="6",
            fix_round=fix_round,
            reason=str(receipt.get("summary") or ""),
        )
        reset_steps_for_implement_retry(steps)
        run["steps"] = steps
        run["status"] = "running"
        run["current_step"] = "5"
        run["outcome"] = None
        run.pop("resume_pending_step", None)
        save_epic(data_dir, epic)
        save_run(data_dir, run)
        _publish_snapshot(run["run_id"], run)
        return True

    record_rollback(
        run,
        from_step="6",
        fix_round=fix_round,
        reason=str(receipt.get("summary") or "待人工修复"),
    )
    if is_fix_round_exhausted(fix_round):
        _fail_run_fix_exhausted(
            data_dir,
            run,
            epic,
            steps,
            fix_round=fix_round,
            fail_step_id="6",
            fail_receipt=receipt,
            from_step="6",
        )
        return False
    _pause_implement_for_manual_fix(
        data_dir,
        run,
        epic,
        steps,
        fix_round=fix_round,
        hitl_summary=(
            f"验证未通过（第 {fix_round} 轮）。请按第 6 步原因改代码后，"
            "点「写码已完成，继续验证」。"
        ),
        fail_step_id="6",
        fail_receipt=receipt,
        log_line=f"验证失败回退：{receipt.get('summary') or '存在失败命令'}",
    )
    return False


def _handle_step7_fail(
    data_dir,
    run: dict[str, Any],
    epic: dict[str, Any],
    receipt: dict[str, Any],
    steps: list[dict[str, Any]],
) -> bool:
    """复核失败。auto_run 下打回写码并重跑 5→6→7…（与验证失败同一闭环）。"""
    ev = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    reason = str(ev.get("reason") or "review_fail")
    fix_round = bump_fix_round(run)
    store_review_fail_epic(epic, receipt, round_no=fix_round)

    for st in steps:
        if st["step_id"] == "7":
            st["status"] = "fail"
            st["summary"] = str(receipt.get("summary") or "复核未通过")
            st["receipt"] = receipt

    if should_auto_retry_implement(reason=reason, fix_round=fix_round):
        record_rollback(
            run,
            from_step="7",
            fix_round=fix_round,
            reason=str(receipt.get("summary") or ""),
        )
        reset_steps_for_implement_retry(steps)
        run["steps"] = steps
        run["status"] = "running"
        run["current_step"] = "5"
        run["outcome"] = None
        run.pop("resume_pending_step", None)
        save_epic(data_dir, epic)
        save_run(data_dir, run)
        _publish_snapshot(run["run_id"], run)
        return True

    record_rollback(
        run,
        from_step="7",
        fix_round=fix_round,
        reason=str(receipt.get("summary") or "待人工修复"),
    )
    if is_fix_round_exhausted(fix_round):
        _fail_run_fix_exhausted(
            data_dir,
            run,
            epic,
            steps,
            fix_round=fix_round,
            fail_step_id="7",
            fail_receipt=receipt,
            from_step="7",
        )
        return False
    _pause_implement_for_manual_fix(
        data_dir,
        run,
        epic,
        steps,
        fix_round=fix_round,
        hitl_summary=(
            f"复核未通过（第 {fix_round} 轮）。请按第 7 步审码意见改代码后，"
            "点「写码已完成，继续验证」。"
        ),
        fail_step_id="7",
        fail_receipt=receipt,
        log_line=f"复核失败回退：{receipt.get('summary') or '存在阻断项'}",
    )
    return False


def _handle_step8_fail(
    data_dir,
    run: dict[str, Any],
    epic: dict[str, Any],
    receipt: dict[str, Any],
    steps: list[dict[str, Any]],
) -> bool:
    """提交门禁阻断。与复核同一闭环：打回写码 → 5→6→7→8。"""
    ev = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    reason = str(ev.get("reason") or "commit_gate_blockers")
    fix_round = bump_fix_round(run)
    store_commit_gate_fail_epic(epic, receipt, round_no=fix_round)

    for st in steps:
        if st["step_id"] == "8":
            st["status"] = "fail"
            st["summary"] = str(receipt.get("summary") or "提交未通过")
            st["receipt"] = receipt

    if should_auto_retry_implement(reason=reason, fix_round=fix_round):
        record_rollback(
            run,
            from_step="8",
            fix_round=fix_round,
            reason=str(receipt.get("summary") or ""),
        )
        reset_steps_for_implement_retry(steps)
        run["steps"] = steps
        run["status"] = "running"
        run["current_step"] = "5"
        run["outcome"] = None
        run.pop("resume_pending_step", None)
        save_epic(data_dir, epic)
        save_run(data_dir, run)
        _publish_snapshot(run["run_id"], run)
        return True

    record_rollback(
        run,
        from_step="8",
        fix_round=fix_round,
        reason=str(receipt.get("summary") or "待人工修复"),
    )
    if is_fix_round_exhausted(fix_round):
        _fail_run_fix_exhausted(
            data_dir,
            run,
            epic,
            steps,
            fix_round=fix_round,
            fail_step_id="8",
            fail_receipt=receipt,
            from_step="8",
        )
        return False
    _pause_implement_for_manual_fix(
        data_dir,
        run,
        epic,
        steps,
        fix_round=fix_round,
        hitl_summary=(
            f"提交门禁未通过（第 {fix_round} 轮）。请按阻断项改代码后，"
            "点「写码已完成，继续验证」。"
        ),
        fail_step_id="8",
        fail_receipt=receipt,
        log_line=f"提交失败回退：{receipt.get('summary') or '门禁阻断'}",
    )
    return False


def _mark_step_running(steps: list[dict[str, Any]], step_id: str) -> None:
    now = int(time.time())
    for st in steps:
        if st["step_id"] == step_id:
            st["status"] = "running"
            st["summary"] = "执行中…"
            # 供时间线徽标「执行中 · x 分」；重跑同一步时刷新起点
            st["started_at"] = now
            break


def _ui_snapshot(run: dict[str, Any]) -> dict[str, Any]:
    summary = run.get("run_summary") or build_run_summary(run)
    return {
        "kind": "timeline",
        "run_id": run.get("run_id"),
        "epic_id": run.get("epic_id"),
        "status": run.get("status"),
        "outcome": run.get("outcome"),
        "current_step": run.get("current_step"),
        "steps": run.get("steps") or [],
        "message": run.get("message") or "",
        "workspace": run.get("workspace") or "",
        "run_summary": summary,
        "fix_round": int(run.get("fix_round") or 0),
        "timeline_trace": run.get("timeline_trace") or [],
        "implement_attempt": int(run.get("implement_attempt") or 1),
    }


def _publish_snapshot(run_id: str, run: dict[str, Any]) -> None:
    publish(
        run_id,
        {
            "type": "snapshot",
            "run": run,
            "ui": _ui_snapshot(run),
            "ts": int(time.time()),
        },
    )


def _step_pace_sec() -> float:
    cfg = dp_config.get_config()
    try:
        return max(0.05, float(cfg.get("step_pace_sec") or 0.35))
    except (TypeError, ValueError):
        return 0.35


def _apply_cancelled(
    data_dir,
    run_id: str,
    run: dict[str, Any],
    steps: list[dict[str, Any]],
    *,
    cur: str = "",
    reason: str = "",
) -> None:
    detail = (reason or "用户已停止任务").strip()
    sid = str(cur or run.get("current_step") or "")
    active = (
        "running",
        "queued",
        "pending",
        "waiting_hitl",
        "waiting_user",
        "cancelling",
    )
    for st in steps:
        if str(st.get("step_id")) != sid:
            continue
        # 已取消也覆盖 summary，避免卡在「执行中…」
        if str(st.get("status") or "") in active or str(st.get("status") or "") in (
            "cancelled",
            "canceled",
        ):
            st["status"] = "cancelled"
            st["summary"] = detail
            break
    run["steps"] = steps
    run["status"] = "cancelled"
    run["outcome"] = "cancelled"
    run["cancel_reason"] = detail
    run["cancel_requested"] = True
    if sid:
        run["current_step"] = sid
    trace_cancel_open_steps(run, reason=detail)
    save_run(data_dir, run)
    _finalize_summary(data_dir, run)
    _publish_run_phase(run_id, run)
    _publish_snapshot(run_id, load_run(data_dir, run_id) or run)


def _run_steps(
    data_dir,
    run_id: str,
    sequence: tuple[str, ...],
) -> None:
    run = load_run(data_dir, run_id)
    if not run:
        return
    if is_cancel_requested(data_dir, run_id):
        steps = run.get("steps") or _init_steps_state()
        _apply_cancelled(
            data_dir,
            run_id,
            run,
            steps,
            cur=str(run.get("current_step") or ""),
            reason=str(run.get("cancel_reason") or "用户已停止任务"),
        )
        return
    epic_id = str(run.get("epic_id") or "")
    epic = load_epic(data_dir, epic_id) or {}
    steps: list[dict[str, Any]] = run.get("steps") or _init_steps_state()
    message = str(run.get("message") or epic.get("message") or "")
    workspace = str(run.get("workspace") or epic.get("workspace") or "")
    pace = _step_pace_sec()

    run["status"] = "running"
    run["steps"] = steps
    run["outcome"] = None
    save_run(data_dir, run)
    _publish_snapshot(run_id, run)

    stop_status = frozenset({"fail", "waiting_hitl", "waiting_user"})

    for cur in sequence:
        if is_cancel_requested(data_dir, run_id):
            run = load_run(data_dir, run_id) or run
            steps = run.get("steps") or steps
            _apply_cancelled(
                data_dir,
                run_id,
                run,
                steps,
                cur=cur,
                reason=str(run.get("cancel_reason") or "用户已停止任务"),
            )
            break

        # 引擎中断续跑：同一步不抬轮次；写码硬顶 3 轮，禁止开第 4 趟
        resume_sid = str(run.pop("resume_pending_step", "") or "").strip()
        bump_attempt = resume_sid != cur
        if cur == "5" and bump_attempt and write_attempt_count(run) >= max_fix_rounds():
            receipt = {
                "step_id": "5",
                "status": "fail",
                "summary": (
                    f"写码已达上限（最多 {max_fix_rounds()} 轮），停止继续改盘，"
                    "请重新发需求或人工补丁后开新 Run。"
                ),
                "evidence": {
                    "reason": "write_rounds_exhausted",
                    "gate_class": "fail_hard",
                    "implement_attempt": write_attempt_count(run),
                },
                "result_detail": "write_rounds_exhausted",
            }
            _mark_step_running(steps, cur)
            _apply_receipt(steps, receipt)
            trace_step_finished(run, cur, receipt)
            run["steps"] = steps
            run["current_step"] = cur
            run["status"] = "failed"
            run["outcome"] = "failed"
            run["fail_reason"] = "write_rounds_exhausted"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_run_phase(run_id, run)
            _publish_snapshot(run_id, load_run(data_dir, run_id) or run)
            break

        _mark_step_running(steps, cur)
        trace_step_running(run, cur, bump=bump_attempt)
        run["steps"] = steps
        run["current_step"] = cur
        run["status"] = "running"
        run["run_summary"] = build_run_summary(run)
        save_run(data_dir, run)
        _publish_snapshot(run_id, run)
        # 给前端一点时间展示「执行中」再跑本步（逐步可见，避免 1～4 瞬间堆完）
        time.sleep(min(0.2, pace * 0.5))
        if is_cancel_requested(data_dir, run_id):
            run = load_run(data_dir, run_id) or run
            steps = run.get("steps") or steps
            _apply_cancelled(
                data_dir,
                run_id,
                run,
                steps,
                cur=cur,
                reason=str(run.get("cancel_reason") or "用户已停止任务"),
            )
            break

        try:
            receipt = run_step(
                run_id,
                cur,
                message=message,
                workspace=workspace,
                epic=epic,
                run=run,
            )
        except Exception as e:
            err = f"步骤 {cur} 执行异常：{type(e).__name__}: {e}"
            receipt = {
                "step_id": cur,
                "status": "fail",
                "summary": err,
                "result_detail": err,
            }
        if is_cancel_requested(data_dir, run_id):
            run = load_run(data_dir, run_id) or run
            steps = run.get("steps") or steps
            _apply_receipt(steps, receipt)
            _apply_cancelled(
                data_dir,
                run_id,
                run,
                steps,
                cur=cur,
                reason=str(run.get("cancel_reason") or "用户已停止任务"),
            )
            break

        _apply_receipt(steps, receipt)
        trace_step_finished(run, cur, receipt)
        # 本步已有真实结果：引擎中断续跑计数清零，避免开发重启被误判「多次中断」
        st_rec = str(receipt.get("status") or "")
        if st_rec in (
            "pass",
            "fail",
            "failed",
            "skipped",
            "waiting_hitl",
            "waiting_user",
        ):
            run["engine_resume_count"] = 0
        save_epic(data_dir, epic)
        run["steps"] = steps
        run["current_step"] = cur
        status = str(receipt.get("status") or "fail")

        if cur == "5" and status == "fail":
            if _handle_step5_scope_fail(data_dir, run, epic, receipt, steps):
                _run_steps(data_dir, run_id, retry_sequence_after_implement_fix(sequence))
                return
            # 非交付打回（含 job_failed / 网络等）：必须收口，禁止 status 仍 running 被孤儿续跑抬轮次
            _fail_close_if_still_running(data_dir, run_id, run, steps, receipt)
            return

        if cur == "6" and status == "fail":
            if _handle_step6_fail(data_dir, run, epic, receipt, steps):
                _run_steps(data_dir, run_id, retry_sequence_after_implement_fix(sequence))
                return
            _fail_close_if_still_running(data_dir, run_id, run, steps, receipt)
            return

        if cur == "7" and status == "fail":
            if _handle_step7_fail(data_dir, run, epic, receipt, steps):
                _run_steps(data_dir, run_id, retry_sequence_after_implement_fix(sequence))
                return
            _fail_close_if_still_running(data_dir, run_id, run, steps, receipt)
            return

        if cur == "8" and status == "fail":
            if _handle_step8_fail(data_dir, run, epic, receipt, steps):
                _run_steps(data_dir, run_id, retry_sequence_after_implement_fix(sequence))
                return
            _fail_close_if_still_running(data_dir, run_id, run, steps, receipt)
            return

        if status in stop_status:
            run["status"] = "paused" if status != "fail" else "failed"
            if status in ("waiting_hitl", "waiting_user"):
                run["outcome"] = "partial"
            elif status == "fail":
                run["outcome"] = "failed"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_run_phase(run_id, run)
            _publish_snapshot(run_id, load_run(data_dir, run_id) or run)
            break

        if status not in ("pass", "skipped"):
            run["status"] = "failed"
            run["outcome"] = "failed"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_snapshot(run_id, load_run(data_dir, run_id) or run)
            break

        run["run_summary"] = build_run_summary(run)
        save_run(data_dir, run)
        _publish_snapshot(run_id, run)
        # 本步回执展示后再进下一步
        time.sleep(pace)
    else:
        run = load_run(data_dir, run_id) or run
        if is_cancel_requested(data_dir, run_id):
            steps = run.get("steps") or steps
            _apply_cancelled(
                data_dir,
                run_id,
                run,
                steps,
                cur=str(run.get("current_step") or ""),
                reason=str(run.get("cancel_reason") or "用户已停止任务"),
            )
        elif str(run.get("status")) == "running":
            run["status"] = "done"
            run["outcome"] = "success"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_run_phase(run_id, run)

    publish(
        run_id,
        {
            "type": "summary",
            "run": load_run(data_dir, run_id),
            "run_summary": (load_run(data_dir, run_id) or {}).get("run_summary"),
            "ts": int(time.time()),
        },
    )


def _run_loop(data_dir, run_id: str, *, mode: str = "begin") -> None:
    if mode == "begin":
        cfg = dp_config.get_config()
        seq = P1_FULL_AUTO_SEQUENCE if cfg.get("auto_run", True) else P1_SOFT_SEQUENCE
        _run_steps(data_dir, run_id, seq)
        return
    if mode == "resume":
        # 引擎重启后续跑：从当前步骤起，跳过此前已 pass 的步骤
        run = load_run(data_dir, run_id) or {}
        cfg = dp_config.get_config()
        seq = P1_FULL_AUTO_SEQUENCE if cfg.get("auto_run", True) else P1_SOFT_SEQUENCE
        cur = str(run.get("current_step") or "1")
        steps = run.get("steps") or []
        # 轨迹里部署已成功：即使当前步被孤儿续跑打回 pending，也不得再部署
        deploy_passed = any(
            isinstance(e, dict)
            and str(e.get("step_id") or "") == "10"
            and str(e.get("status") or "") == "pass"
            for e in (run.get("timeline_trace") or [])
        )
        if deploy_passed and cur in ("10", ""):
            run["status"] = "done"
            run["outcome"] = "success"
            run.pop("resume_pending_step", None)
            for st_row in steps:
                if str(st_row.get("step_id") or "") == "10":
                    st_row["status"] = "pass"
                    if not str(st_row.get("summary") or "").strip():
                        st_row["summary"] = "部署已成功（引擎续跑时跳过重复部署）"
            run["steps"] = steps
            run["current_step"] = "10"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_run_phase(run_id, run)
            return
        # 若当前步已 pass，从下一步开始
        cur_row = next((s for s in steps if str(s.get("step_id")) == cur), None)
        if cur_row and str(cur_row.get("status") or "") in ("pass", "skipped"):
            try:
                idx = seq.index(cur) + 1
            except ValueError:
                idx = 0
        else:
            try:
                idx = seq.index(cur)
            except ValueError:
                idx = 0
        rest = seq[idx:]
        # 续跑序列若仍含 10 但轨迹已成功：去掉 10，避免第二轮红点
        if deploy_passed:
            rest = tuple(x for x in rest if str(x) != "10")
        if not rest:
            run["status"] = "done"
            run["outcome"] = "success"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_run_phase(run_id, run)
            return
        _run_steps(data_dir, run_id, rest)
        return
    if mode == "post_implement":
        cfg = dp_config.get_config()
        if cfg.get("auto_run", True):
            # 自动模式下写码后继续 6→10
            _run_steps(data_dir, run_id, ("6",) + P1_LANE_HANDOFF)
        else:
            _run_steps(data_dir, run_id, P1_POST_IMPLEMENT + P1_LANE_HANDOFF[:1])
        return
    if mode == "lane_continue":
        run = load_run(data_dir, run_id) or {}
        cur = str(run.get("current_step") or "7")
        try:
            idx = P1_LANE_HANDOFF.index(cur)
        except ValueError:
            idx = 0
        rest = P1_LANE_HANDOFF[idx + 1 :]
        if not rest:
            run["status"] = "done"
            run["outcome"] = "success"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_run_phase(run_id, run)
            return
        # auto_run：一次把剩余车道跑完；否则只推下一步（仍需逐步 HITL 确认）
        if dp_config.get_config().get("auto_run", True):
            _run_steps(data_dir, run_id, rest)
        else:
            _run_steps(data_dir, run_id, rest[:1])
        return
    if mode == "retry":
        run = load_run(data_dir, run_id) or {}
        cur = str(run.get("current_step") or "1")
        steps = run.get("steps") or []
        # 部署已成功再点 advance：收口为 done，禁止第二轮红点
        if cur == "10" and any(
            isinstance(e, dict)
            and str(e.get("step_id") or "") == "10"
            and str(e.get("status") or "") == "pass"
            for e in (run.get("timeline_trace") or [])
        ):
            run["status"] = "done"
            run["outcome"] = "success"
            run["current_step"] = "10"
            save_run(data_dir, run)
            _finalize_summary(data_dir, run)
            _publish_run_phase(run_id, run)
            return
        this = next((s for s in steps if str(s.get("step_id")) == cur), None)
        arts = {}
        if isinstance(this, dict):
            rec = this.get("receipt") if isinstance(this.get("receipt"), dict) else {}
            arts = rec.get("artifacts") if isinstance(rec.get("artifacts"), dict) else {}
            if not arts.get("can_manual_retry"):
                ev = rec.get("evidence") if isinstance(rec.get("evidence"), dict) else {}
                if ev.get("can_manual_retry"):
                    arts = {**arts, "can_manual_retry": True}
        # 本步曾软跳过且后续已跑完：只重试本步，避免把 PR/部署再跑一遍
        try:
            cur_i = int(cur)
        except ValueError:
            cur_i = 0
        later_done = any(
            str(s.get("status")) in ("pass", "skipped")
            and str(s.get("step_id") or "").isdigit()
            and int(s.get("step_id")) > cur_i
            for s in steps
            if isinstance(s, dict)
        )
        if arts.get("can_manual_retry") and later_done:
            _run_steps(data_dir, run_id, (cur,))
            return
        if dp_config.get_config().get("auto_run", True):
            seq = P1_FULL_AUTO_SEQUENCE
            try:
                idx = seq.index(cur)
            except ValueError:
                idx = 0
            _run_steps(data_dir, run_id, seq[idx:])
        else:
            _run_steps(data_dir, run_id, (cur,))
        return
    _run_steps(data_dir, run_id, P1_SOFT_SEQUENCE)


def start_background(data_dir, run_id: str, *, mode: str = "begin") -> None:
    rid = str(run_id or "").strip()
    if not rid:
        return
    if is_runner_alive(rid):
        return

    def _wrapped() -> None:
        try:
            _run_loop(data_dir, rid, mode=mode)
        finally:
            _unregister_thread(rid)

    t = threading.Thread(
        target=_wrapped,
        name=f"dev-pipeline-{rid}-{mode}",
        daemon=True,
    )
    _register_thread(rid, t)
    t.start()


def resume_orphaned_runs_on_boot(data_dir=None) -> dict[str, Any]:
    """引擎启动时：续跑仍标 running/queued 且无线程的 Run；并尽量拉起写码 sidecar。"""
    from pathlib import Path

    from . import store as dp_store

    root = data_dir or dp_store.default_data_dir()
    resumed: list[str] = []
    skipped: list[str] = []
    # 写码 sidecar 预热（失败不挡启动）
    try:
        from .implement import _ensure_cursor_sidecar

        _ensure_cursor_sidecar("http://127.0.0.1:18791")
    except Exception:
        pass
    try:
        runs_dir = Path(root) / "runs"
        if not runs_dir.is_dir():
            return {"ok": True, "resumed": [], "skipped": []}
        for fp in sorted(runs_dir.glob("dpj-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)[
            :40
        ]:
            try:
                run = dp_store.load_run(root, fp.stem)
            except Exception:
                continue
            if not run:
                continue
            st = str(run.get("status") or "")
            if st not in ("running", "queued"):
                continue
            rid = str(run.get("run_id") or fp.stem)
            if is_runner_alive(rid):
                skipped.append(rid)
                continue
            fresh = _recover_via_service(root, run)
            if str((fresh or {}).get("status") or "") == "running" and is_runner_alive(rid):
                resumed.append(rid)
            else:
                skipped.append(rid)
    except Exception as e:
        return {"ok": False, "detail": str(e), "resumed": resumed, "skipped": skipped}
    return {"ok": True, "resumed": resumed, "skipped": skipped}


def _recover_via_service(data_dir, run: dict[str, Any]) -> dict[str, Any]:
    """避免 runner↔service 循环 import：内联与 service._reap_orphan_run 同语义。"""
    from . import store as dp_store

    rid = str(run.get("run_id") or "")
    resumes = int(run.get("engine_resume_count") or 0)
    if resumes >= 8:
        return run
    steps = list(run.get("steps") or _init_steps_state())
    cur = str(run.get("current_step") or "")
    for st_row in steps:
        if str(st_row.get("step_id") or "") == cur and str(st_row.get("status") or "") == "running":
            st_row["status"] = "pending"
            st_row["summary"] = "引擎启动后自动续跑本步…"
            break
    run["steps"] = steps
    run["status"] = "running"
    run["engine_resume_count"] = resumes + 1
    # 续跑同一步：不抬写码「第 N 轮」
    if cur:
        run["resume_pending_step"] = cur
    run["cancel_requested"] = False
    run["updated_at"] = int(time.time())
    dp_store.save_run(data_dir, run)
    start_background(data_dir, rid, mode="resume")
    return dp_store.load_run(data_dir, rid) or run