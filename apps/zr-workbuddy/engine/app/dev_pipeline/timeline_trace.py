"""过程流轨迹：回退时保留完整访问序列（如 1…8 → 打回 → 5→6→…），
供过程流与底部轨道同源展示；禁止因打回而抹掉已走过的 6/7/8。

轮次按「单个步骤实际执行次数」计：写码第 2 轮不代表验证/复核也是第 2 轮。
"""
from __future__ import annotations

from typing import Any

from .ops import STEP_DEFS

_TITLE_BY = {s["id"]: s.get("title") or s["id"] for s in STEP_DEFS}


def ensure_trace(run: dict[str, Any]) -> None:
    if not isinstance(run.get("timeline_trace"), list):
        run["timeline_trace"] = []
    if not isinstance(run.get("step_attempts"), dict):
        run["step_attempts"] = {}
    if run.get("implement_attempt") is None:
        # 兼容旧字段：表示写码（步骤 5）轮次，不等于全局轮次
        run["implement_attempt"] = int(run.get("step_attempts", {}).get("5") or 1)


def _step_attempts(run: dict[str, Any]) -> dict[str, int]:
    ensure_trace(run)
    raw = run.get("step_attempts")
    if not isinstance(raw, dict):
        raw = {}
        run["step_attempts"] = raw
    out: dict[str, int] = {}
    for k, v in raw.items():
        try:
            out[str(k)] = max(0, int(v))
        except (TypeError, ValueError):
            continue
    run["step_attempts"] = out
    return out


def _bump_step_attempt(run: dict[str, Any], step_id: str) -> int:
    """本步第几次开跑（含首次）。仅递增该 step_id。"""
    sid = str(step_id or "").strip()
    attempts = _step_attempts(run)
    n = int(attempts.get(sid) or 0) + 1
    attempts[sid] = n
    if sid == "5":
        run["implement_attempt"] = n
    return n


def record_rollback(
    run: dict[str, Any],
    *,
    from_step: str,
    fix_round: int,
    reason: str = "",
) -> None:
    ensure_trace(run)
    fs = str(from_step or "").strip() or "?"
    attempts = _step_attempts(run)
    # 写码下一轮 = 步骤 5 已开跑次数 + 1（尚未 bump；真正开跑时再 +1）
    next_write_round = int(attempts.get("5") or 0) + 1
    label = (
        f"第 {fs} 步未通过 → 打回写码（写码将进入第 {next_write_round} 轮；"
        "验证/复核等步骤轮次各自独立）"
    )
    run["timeline_trace"].append(
        {
            "kind": "rollback",
            "seq": _next_seq(run),
            "from_step": fs,
            "fix_round": fix_round,
            "write_round_next": next_write_round,
            "label": label,
            "reason": (reason or "")[:300],
        }
    )
    # 禁止再抬全局 implement_attempt：否则 6/7 首次开跑也会被标成「第 2 轮」


def write_attempt_count(run: dict[str, Any]) -> int:
    """写码（步骤 5）已开跑次数（含进行中）。"""
    return int(_step_attempts(run).get("5") or 0)


def trace_step_running(
    run: dict[str, Any], step_id: str, *, bump: bool = True
) -> None:
    """记录步骤开跑。引擎中断续跑同一趟时 bump=False，禁止抬「第 N 轮」。"""
    ensure_trace(run)
    sid = str(step_id or "").strip()
    if bump:
        att = _bump_step_attempt(run, sid)
    else:
        att = int(_step_attempts(run).get(sid) or 0) or 1
        if sid == "5":
            run["implement_attempt"] = att
    title = _TITLE_BY.get(sid, sid)
    run["timeline_trace"].append(
        {
            "kind": "step",
            "seq": _next_seq(run),
            "step_id": sid,
            "implement_attempt": att,
            "title": title,
            "status": "running",
            "summary": "执行中…" if bump else "续跑中…",
            "receipt": None,
        }
    )


def trace_step_finished(run: dict[str, Any], step_id: str, receipt: dict[str, Any]) -> None:
    ensure_trace(run)
    sid = str(step_id or "").strip()
    trace = run["timeline_trace"]
    for i in range(len(trace) - 1, -1, -1):
        e = trace[i]
        if (
            e.get("kind") == "step"
            and str(e.get("step_id")) == sid
            and str(e.get("status")) == "running"
        ):
            st = str(receipt.get("status") or "fail")
            e["status"] = st
            e["summary"] = str(receipt.get("summary") or "")
            e["receipt"] = _slim_receipt(receipt)
            return
    # 兜底：补一条（轮次取本步已计次数，避免误用写码全局轮次）
    att = int(_step_attempts(run).get(sid) or 1)
    trace.append(
        {
            "kind": "step",
            "seq": _next_seq(run),
            "step_id": sid,
            "implement_attempt": att,
            "title": _TITLE_BY.get(sid, sid),
            "status": str(receipt.get("status") or "fail"),
            "summary": str(receipt.get("summary") or ""),
            "receipt": _slim_receipt(receipt),
        }
    )


def trace_cancel_open_steps(run: dict[str, Any], *, reason: str = "") -> None:
    """Run 取消时把仍标 running 的轨迹节点收口，避免 UI 一直「执行中」。"""
    ensure_trace(run)
    detail = (reason or "已停止").strip()[:300]
    for e in run["timeline_trace"]:
        if not isinstance(e, dict) or e.get("kind") != "step":
            continue
        if str(e.get("status") or "") != "running":
            continue
        e["status"] = "cancelled"
        e["summary"] = detail
        rec = e.get("receipt") if isinstance(e.get("receipt"), dict) else {}
        e["receipt"] = {
            **rec,
            "status": "cancelled",
            "summary": detail,
        }


def build_display_timeline(run: dict[str, Any]) -> list[dict[str, Any]]:
    """供 summary / 前端轨道：含 rollback 分隔与逐步节点。"""
    trace = run.get("timeline_trace")
    if not isinstance(trace, list) or not trace:
        return []
    out: list[dict[str, Any]] = []
    for e in trace:
        if not isinstance(e, dict):
            continue
        if e.get("kind") == "rollback":
            out.append(
                {
                    "kind": "rollback",
                    "seq": e.get("seq"),
                    "step_id": "rollback",
                    "title": str(e.get("label") or "打回写码"),
                    "status": "rollback",
                    "from_step": e.get("from_step"),
                    "fix_round": e.get("fix_round"),
                }
            )
            continue
        sid = str(e.get("step_id") or "")
        att = int(e.get("implement_attempt") or 1)
        cap = sid
        if att > 1:
            cap = f"{sid}·{att}"
        out.append(
            {
                "kind": "step",
                "seq": e.get("seq"),
                "step_id": sid,
                "display_step": cap,
                "implement_attempt": att,
                "title": str(e.get("title") or _TITLE_BY.get(sid, sid)),
                "status": str(e.get("status") or "pending"),
                "summary": str(e.get("summary") or ""),
                "duration_sec": _dur_from_receipt(e.get("receipt")),
                "duration_label": "",
            }
        )
    _terminal = frozenset(
        {"pass", "fail", "failed", "cancelled", "canceled", "rollback", "done"}
    )
    for row in out:
        if row.get("kind") == "step" and row.get("duration_sec") is not None:
            from .summary import _fmt_duration

            st = str(row.get("status") or "")
            row["duration_label"] = _fmt_duration(
                row["duration_sec"],
                min_display_sec=1 if st in _terminal else 0,
            )
    return out


def _next_seq(run: dict[str, Any]) -> int:
    trace = run.get("timeline_trace") or []
    if not trace:
        return 1
    mx = 0
    for e in trace:
        try:
            mx = max(mx, int(e.get("seq") or 0))
        except (TypeError, ValueError):
            pass
    return mx + 1


def _slim_receipt(receipt: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(receipt, dict):
        return {}
    ev = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    return {
        "step_id": receipt.get("step_id"),
        "status": receipt.get("status"),
        "summary": receipt.get("summary"),
        "result_detail": receipt.get("result_detail"),
        "skill_id": receipt.get("skill_id"),
        "skill_title": receipt.get("skill_title"),
        "duration_sec": receipt.get("duration_sec"),
        "artifacts": receipt.get("artifacts"),
        "evidence": {
            "process_log": ev.get("process_log"),
            "results": ev.get("results"),
            "skill": ev.get("skill"),
            "reason": ev.get("reason"),
            "detail": ev.get("detail"),
            "files": ev.get("files"),
        },
    }


def _dur_from_receipt(rec: Any) -> int | None:
    if not isinstance(rec, dict):
        return None
    try:
        d = rec.get("duration_sec")
        return int(d) if d is not None else None
    except (TypeError, ValueError):
        return None
