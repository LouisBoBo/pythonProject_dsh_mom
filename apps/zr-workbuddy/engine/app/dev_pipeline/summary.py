"""Run Summary（P1：可机器校验的 outcome + 时间线节点）。"""
from __future__ import annotations

import time
from typing import Any

from .ops import STEP_DEFS
from .timeline_trace import build_display_timeline


def _step_by_id(run: dict[str, Any], step_id: str) -> dict[str, Any]:
    for s in run.get("steps") or []:
        if str((s or {}).get("step_id") or "") == str(step_id):
            return s if isinstance(s, dict) else {}
    return {}


def _step_summary(run: dict[str, Any], step_id: str) -> str:
    st = _step_by_id(run, step_id)
    return str(st.get("summary") or "").strip()


def _changed_files_from_run(run: dict[str, Any], *, limit: int = 8) -> list[str]:
    st = _step_by_id(run, "5")
    rec = st.get("receipt") if isinstance(st.get("receipt"), dict) else {}
    ev = rec.get("evidence") if isinstance(rec.get("evidence"), dict) else {}
    arts = rec.get("artifacts") if isinstance(rec.get("artifacts"), dict) else {}
    impl = arts.get("implement") if isinstance(arts.get("implement"), dict) else {}
    raw = ev.get("changed_files") or arts.get("changed_files") or impl.get("changed_files") or []
    if not isinstance(raw, list):
        raw = []
    out: list[str] = []
    for x in raw:
        s = str(x or "").strip().replace("\\", "/")
        if s and s not in out:
            out.append(s)
        if len(out) >= limit:
            break
    return out


def build_closing_narrative(run: dict[str, Any], *, outcome: str | None, title: str) -> dict[str, Any] | None:
    """流程终态后的总结正文：结论 / 关键成果 / 如何验证（给过程流卡底部渲染）。"""
    status = str(run.get("status") or "")
    terminal = status in ("done", "failed", "cancelled", "canceled") or outcome in (
        "success",
        "failed",
        "cancelled",
    )
    if not terminal:
        return None

    rid = str(run.get("run_id") or "").strip()
    ws = str(run.get("workspace") or "").strip()
    files = _changed_files_from_run(run)
    s5 = _step_summary(run, "5")
    s6 = _step_summary(run, "6")
    s7 = _step_summary(run, "7")
    s8 = _step_summary(run, "8")
    s10 = _step_summary(run, "10")
    core = str(run.get("requirement_core") or "").strip()

    highlights: list[str] = []
    verify: list[str] = []

    if outcome == "success":
        conclusion = (
            f"需求→上线已全部完成（{title}）"
            + (f"。run_id={rid}" if rid else "")
            + "。"
        )
        if core:
            highlights.append("需求：" + (core[:120] + ("…" if len(core) > 120 else "")))
        if s5:
            highlights.append("写码：" + s5[:160])
        if files:
            highlights.append(
                "改动文件（" + str(len(files)) + "）：" + "、".join(files[:5])
                + ("…" if len(files) > 5 else "")
            )
        if s7:
            highlights.append("复核：" + s7[:140])
        if s8:
            highlights.append("提交：" + s8[:140])
        if s10:
            highlights.append("部署：" + s10[:160])
        if not highlights:
            highlights.append("10 步均已通过，详见上方时间线各节点结果。")

        if files:
            verify.append("在工程目录核对改动文件是否符合预期：" + "、".join(files[:5]))
        if ws:
            verify.append("打开工程目录确认：" + ws)
        if s6:
            verify.append("验证结论：" + s6[:160])
        else:
            verify.append("按时间线「验证」步骤摘要做一次本地冒烟。")
        if s10 and ("http://" in s10 or "https://" in s10 or "部署" in s10):
            verify.append("按部署摘要打开入口页做一次页面验收。")
        verify.append("需要追问或修边角：在本会话直接说明，可再开「需求→上线」或普通写码。")
    elif outcome == "cancelled" or status in ("cancelled", "canceled"):
        conclusion = f"流程已停止（{title}）" + (f"。run_id={rid}" if rid else "") + "。"
        cur = str(run.get("current_step") or "").strip()
        if cur:
            highlights.append(f"停在步骤 {cur}：" + (_step_summary(run, cur) or "用户取消或中断"))
        if files:
            highlights.append("已产生改动文件：" + "、".join(files[:5]))
        verify.append("确认是否保留当前改动；需要继续时重新开跑「需求→上线」。")
    else:
        conclusion = f"流程未完成（{title}）" + (f"。run_id={rid}" if rid else "") + "。"
        failed = [
            str(s.get("step_id"))
            for s in (run.get("steps") or [])
            if str(s.get("status") or "") in ("fail", "failed")
        ]
        if failed:
            sid = failed[-1]
            highlights.append(
                f"失败步骤 {sid}：" + (_step_summary(run, sid) or "见时间线节点详情")
            )
        if files:
            highlights.append("已改文件（供排查）：" + "、".join(files[:5]))
        verify.append("根据失败步骤摘要修复后，重新开跑或从停住的步骤继续。")
        if ws:
            verify.append("工程目录：" + ws)

    body_lines = [conclusion, ""]
    if highlights:
        body_lines.append("关键成果：")
        for h in highlights[:8]:
            body_lines.append("· " + h)
        body_lines.append("")
    if verify:
        body_lines.append("如何验证：")
        for v in verify[:6]:
            body_lines.append("· " + v)

    return {
        "conclusion": conclusion,
        "highlights": highlights[:8],
        "verify": verify[:6],
        "body": "\n".join(body_lines).strip(),
    }


def _fmt_duration(sec: int | float | None, *, min_display_sec: int = 0) -> str:
    try:
        n = int(sec or 0)
    except (TypeError, ValueError):
        n = 0
    if n < 0:
        n = 0
    if min_display_sec and n < min_display_sec:
        n = min_display_sec
    if n < 60:
        return f"{n} 秒"
    m, s = divmod(n, 60)
    if m < 60:
        return f"{m} 分 {s} 秒" if s else f"{m} 分"
    h, m = divmod(m, 60)
    return f"{h} 小时 {m} 分"


def build_run_summary(run: dict[str, Any]) -> dict[str, Any]:
    steps = run.get("steps") or []
    by_id = {str(s.get("step_id")): s for s in steps}
    required = [s["id"] for s in STEP_DEFS]
    title_by = {s["id"]: s.get("title") or s["id"] for s in STEP_DEFS}
    passed: list[str] = []
    blocked: list[str] = []
    failed: list[str] = []
    waiting: list[str] = []
    trace_timeline = build_display_timeline(run)
    timeline: list[dict[str, Any]] = []
    for sid in required:
        st_row = by_id.get(sid) or {}
        st = str(st_row.get("status") or "pending")
        rec = st_row.get("receipt") if isinstance(st_row.get("receipt"), dict) else {}
        dur = rec.get("duration_sec")
        if dur is None and st_row.get("duration_sec") is not None:
            dur = st_row.get("duration_sec")
        try:
            dur_i = int(dur) if dur is not None else None
        except (TypeError, ValueError):
            dur_i = None
        timeline.append(
            {
                "step_id": sid,
                "title": str(st_row.get("title") or title_by.get(sid) or sid),
                "status": st,
                "duration_sec": dur_i,
                "duration_label": (
                    _fmt_duration(
                        dur_i,
                        min_display_sec=1
                        if st in ("pass", "fail", "failed", "cancelled", "canceled", "rollback", "done")
                        else 0,
                    )
                    if dur_i is not None
                    else ""
                ),
            }
        )
        if st == "pass":
            passed.append(sid)
        elif st in ("fail", "failed"):
            failed.append(sid)
        elif st in ("waiting_hitl", "waiting_user"):
            waiting.append(sid)
        elif st == "skipped":
            passed.append(sid)
        elif st not in ("pending", "running"):
            blocked.append(sid)

    outcome = run.get("outcome")
    status = str(run.get("status") or "")
    if status in ("cancelled", "canceled"):
        outcome = "cancelled"
    elif outcome is None:
        if status == "done" and len(passed) == len(required):
            outcome = "success"
        elif failed:
            outcome = "failed"
        elif waiting or status == "paused":
            outcome = "partial"
        else:
            outcome = "partial" if passed else None

    title = "进行中"
    tone = "info"
    cancel_reason = str(run.get("cancel_reason") or "").strip()
    if outcome == "cancelled" or status in ("cancelled", "canceled"):
        # 引擎重启孤儿收割 ≠ 用户点停；标题勿一律写「用户取消」
        if "引擎重启" in cancel_reason or "后台线程已中断" in cancel_reason:
            title = "已停止 · 引擎中断"
        elif cancel_reason and "用户" not in cancel_reason[:8]:
            title = "已停止 · " + cancel_reason[:24]
        else:
            title = "已停止 · 用户取消"
        tone = "warn"
    elif status == "cancelling":
        title = "正在停止…"
        tone = "warn"
    elif outcome == "success":
        title = "全流程完成"
        tone = "ok"
    elif outcome == "failed":
        title = "Run 失败"
        tone = "error"
    elif status == "running":
        title = f"进行中 · 步骤 {run.get('current_step') or '—'}"
        tone = "info"
    elif outcome == "partial" and waiting == ["6"]:
        title = "已停在第 6 步 · 请配置验证命令/工程目录后重试"
        tone = "warn"
    elif outcome == "partial" and waiting == ["5"]:
        title = "进行中 · 待确认写码（步骤 5）"
        tone = "info"
    elif outcome == "partial" and waiting == ["8"]:
        title = "已停在第 8 步 · 提交未通过（可重试）"
        tone = "warn"
    elif outcome == "partial":
        title = "进行中 · 待确认后续步骤"
        tone = "info"

    started_at = int(run.get("created_at") or 0)
    finished_at = 0
    if status in ("done", "failed", "cancelled", "canceled") or outcome in (
        "success",
        "failed",
        "cancelled",
    ):
        # 取各步最晚 finished_at，否则用当前时间快照
        latest = 0
        for s in steps:
            rec = s.get("receipt") if isinstance(s.get("receipt"), dict) else {}
            try:
                latest = max(latest, int(rec.get("finished_at") or 0))
            except (TypeError, ValueError):
                pass
        finished_at = latest or int(run.get("updated_at") or time.time())
    now = int(time.time())
    end_ts = finished_at or now
    duration_sec = max(0, end_ts - started_at) if started_at else 0

    lines: list[str] = []
    if passed:
        lines.append(f"已完成步骤：{', '.join(passed)}")
    if waiting:
        lines.append(f"待确认/待车道：{', '.join(waiting)}")
    if failed:
        lines.append(f"失败步骤：{', '.join(failed)}")
    cur = str(run.get("current_step") or "")
    if cur:
        lines.append(f"当前停在步骤 {cur}")
    if duration_sec:
        lines.append(f"总用时：{_fmt_duration(duration_sec)}")

    fix_round = int(run.get("fix_round") or 0)
    if fix_round:
        lines.append(f"写码↔验证↔复核修复轮次：{fix_round}")

    live = status in ("running", "queued", "paused", "cancelling") or (
        outcome in (None, "partial")
        and status not in ("done", "failed", "cancelled", "canceled")
    )

    # 有访问轨迹时：轨道与过程流同源，按时间顺序保留回退前后节点（1…8→打回→5…）
    # 禁止再用「标准 1～10 + pending 过滤」把已走过的 6/7/8 抹掉。
    if trace_timeline:
        timeline_live = [
            row
            for row in trace_timeline
            if row.get("kind") == "rollback"
            or str(row.get("status") or "") not in ("", "pending", "queued")
        ]
        timeline_for_legacy = timeline_live
    else:
        timeline_live = [
            row
            for row in timeline
            if str(row.get("status") or "") not in ("", "pending", "queued")
        ]
        timeline_for_legacy = timeline_live

    return {
        "title": title,
        "tone": tone,
        "outcome": outcome,
        "status": status,
        "live": live,
        "lines": lines,
        "passed_steps": passed,
        "waiting_steps": waiting,
        "failed_steps": failed,
        "current_step": cur,
        "started_at": started_at or None,
        "finished_at": finished_at or None,
        "duration_sec": duration_sec,
        "duration_label": _fmt_duration(duration_sec),
        # 轨道：已发生访问序列（含回退后重跑的步骤；可 >10，前端横滑）
        "timeline": timeline_for_legacy,
        "timeline_flat": timeline_live,
        "timeline_all": timeline,
        "timeline_trace_display": trace_timeline,
        "done_count": len(passed),
        "total_count": len(required),
        "trace_node_count": len(timeline_live) if timeline_live else len(trace_timeline or []),
        "fix_round": fix_round,
        "closing": build_closing_narrative(run, outcome=outcome, title=title),
    }
