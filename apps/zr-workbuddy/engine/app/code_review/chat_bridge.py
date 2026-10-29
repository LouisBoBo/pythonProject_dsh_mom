"""面板 chat 对接本机审码：对话出确认卡，点确认后再直读审码。

对齐 simplified CodeReviewSourcePickCard HITL：说「审核代码」先出选目录卡，
不自动开跑；确认走 POST /api/code-review/run（本仓无 Bridge / 无 Git 克隆）。
"""
from __future__ import annotations

from typing import Any

from .. import plugins_store
from ..code_dev.intent import extract_workspace_path
from .config import availability, get_config
from .intent import extract_focus, extract_scope, is_code_review_question
from .ops import FEATURE_ID, run_review_async


def _base(**extra: Any) -> dict[str, Any]:
    out = {
        "ok": True,
        "thinking": "",
        "reply": "",
        "chart": None,
        "table": None,
        "note": None,
        "source": "code_review",
        "data_source": "code_review",
        "intent": {"type": "code_review", "metric": "pick", "dim": None, "chart": None},
        "report_id": None,
        "findings": None,
        "code_review_ui": None,
    }
    out.update(extra)
    return out


def _suggestions(*, current: str = "", cfg_default: str = "") -> list[dict[str, str]]:
    """当前工作区优先；审码/写码配置与上次提交仅作兜底芯片。"""
    from ..pick_workspace import build_pick_suggestions

    extras: list[tuple[str, str]] = []
    try:
        from ..code_dev.config import get_config as get_code_dev_config

        extras.append((get_code_dev_config().default_workspace, "写码常用"))
    except Exception:  # noqa: BLE001
        pass
    try:
        from ..code_commit.ops import default_data_dir
        from ..code_commit.store import latest_done_workspace

        extras.append((latest_done_workspace(default_data_dir()) or "", "上次提交"))
    except Exception:  # noqa: BLE001
        pass
    return build_pick_suggestions(
        current_workspace=current,
        lane_default=cfg_default,
        lane_label="审码常用",
        extras=extras,
    )


def build_pick_ui(
    *,
    workspace: str = "",
    scope: str = "",
    focus: str = "",
) -> dict[str, Any]:
    from ..pick_workspace import resolve_pick_workspace

    cfg = get_config()
    hint = (workspace or "").strip()
    ws = resolve_pick_workspace(hint, cfg.default_workspace or "")
    return {
        "kind": "pick",
        "status": "pending",
        "workspace": ws,
        "scope": (scope or "").strip(),
        "focus": (focus or "").strip(),
        "suggestions": _suggestions(current=hint, cfg_default=cfg.default_workspace or ""),
        "hint": "选择目录 · 下一步勾选文件",
        "summary": "请确认要审核的本机工程",
        "desc": "先选目录，再勾选要审的文件（也可默认抽样）。",
    }


async def handle_chat_code_review(text: str) -> dict[str, Any]:
    """用户说「审核代码」：返回选目录确认卡；不在聊天路径自动 run。"""
    raw = (text or "").strip()
    if not plugins_store.is_enabled(FEATURE_ID):
        hint = plugins_store.disabled_hint(FEATURE_ID, capability="本机目录审码")
        return _base(
            reply=hint,
            note="code-review 未启用",
            source="disabled",
            intent={"type": "code_review", "metric": "disabled", "dim": None, "chart": None},
        )

    cfg = get_config()
    avail = availability()
    if not avail.get("ok"):
        return _base(
            thinking="审码依赖 LLM，正在检查就绪状态。",
            reply=f"本机审码尚未就绪：{avail.get('detail') or '请检查 LLM 配置'}",
            note=avail.get("detail"),
        )

    ws = extract_workspace_path(raw) or ""
    scope = extract_scope(raw)
    focus = extract_focus(raw)
    ui = build_pick_ui(workspace=ws, scope=scope, focus=focus)

    return _base(
        thinking="已识别审码意图，请在确认卡中选择本机工程目录后再开始。",
        reply=(
            "已识别为**本机代码审查**（直读磁盘源码）。\n\n"
            "请在下方确认卡中：① 浏览/填写**目录** → ② 点「下一步：选文件」勾选 → ③ 开始审核。"
        ),
        note="等待确认目录",
        intent={"type": "code_review", "metric": "pick", "dim": None, "chart": None},
        code_review_ui=ui,
    )


async def confirm_and_run(
    *,
    local_path: str,
    scope: str = "",
    focus: str = "",
    files: list[str] | None = None,
) -> dict[str, Any]:
    """确认卡点「开始审核」：直读 + LLM（与 /api/code-review/run 同源）。"""
    return await run_review_async(
        local_path=local_path or "",
        scope=scope or "",
        files=files,
        focus=focus or "",
        persist=True,
    )


__all__ = [
    "handle_chat_code_review",
    "is_code_review_question",
    "build_pick_ui",
    "confirm_and_run",
]
