"""进入步骤前的硬门禁（不过则不 running）。"""
from __future__ import annotations

from typing import Any


def check(step_id: str, *, epic: dict[str, Any], run: dict[str, Any]) -> dict[str, Any]:
    """返回 {ok, detail}。"""
    arts = epic.get("artifacts") or {}
    steps = {s.get("step_id"): s for s in (run.get("steps") or [])}

    def prev_pass(sid: str) -> bool:
        st = steps.get(sid) or {}
        return str(st.get("status") or "") in ("pass", "skipped")

    if step_id == "2":
        if arts.get("raw_intake"):
            return {"ok": True, "detail": ""}
        return {"ok": False, "detail": "步骤 1 未产出 raw_intake"}

    if step_id == "3":
        if prev_pass("2") or arts.get("prd"):
            return {"ok": True, "detail": ""}
        return {"ok": False, "detail": "步骤 2 未完成"}

    if step_id == "4":
        if not prev_pass("3") and not arts.get("context_pack"):
            return {"ok": False, "detail": "步骤 3 未完成"}
        ws = (epic.get("workspace") or run.get("workspace") or "").strip()
        if not ws:
            return {"ok": True, "detail": "workspace 未绑定，计划将不含路径细节"}
        return {"ok": True, "detail": ""}

    if step_id == "5":
        plan = arts.get("plan") or {}
        if not plan.get("rev") and not epic.get("plan_rev"):
            return {"ok": False, "detail": "步骤 4 未锁定 plan_rev"}
        return {"ok": True, "detail": ""}

    if step_id == "6":
        st5 = str((steps.get("5") or {}).get("status") or "")
        if st5 not in ("pass", "skipped"):
            return {"ok": False, "detail": "步骤 5 尚未确认完成（写码 HITL）"}
        impl = arts.get("implement") or {}
        if not impl.get("cursor_job_id") and not impl.get("no_code_change"):
            return {
                "ok": True,
                "detail": "未记录 cursor_job_id；允许继续验证（建议在确认写码时填写）",
            }
        return {"ok": True, "detail": ""}

    if step_id == "7":
        if not prev_pass("6"):
            return {"ok": False, "detail": "步骤 6 验证未通过"}
        return {"ok": True, "detail": ""}

    if step_id == "8":
        if not prev_pass("7"):
            return {"ok": False, "detail": "步骤 7 复核未完成"}
        return {"ok": True, "detail": ""}

    if step_id == "9":
        if not prev_pass("8"):
            return {"ok": False, "detail": "步骤 8 提交未完成"}
        return {"ok": True, "detail": ""}

    if step_id == "10":
        if not prev_pass("9"):
            return {"ok": False, "detail": "步骤 9 开 PR 未完成"}
        return {"ok": True, "detail": ""}

    return {"ok": True, "detail": ""}
