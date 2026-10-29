"""面板 chat 对接人触发提交：对话出选目录卡，确认后再门禁 / 提交。

对齐 code_review pick HITL：说「提交代码」先出选目录卡，
不自动跑门禁或 commit；确认走 POST /api/code-commit/start → confirm。
"""
from __future__ import annotations

from typing import Any

from .. import plugins_store
from .config import availability, get_config
from .intent import (
    extract_commit_workspace,
    extract_gate_job_id,
    is_code_commit_question,
    is_fix_from_gate_question,
)
from .ops import FEATURE_ID, prepare_fix_from_gate, preview_commit_branch


def _base(**extra: Any) -> dict[str, Any]:
    out = {
        "ok": True,
        "thinking": "",
        "reply": "",
        "chart": None,
        "table": None,
        "note": None,
        "source": "code_commit",
        "data_source": "code_commit",
        "intent": {"type": "code_commit", "metric": "pick", "dim": None, "chart": None},
        "job_id": None,
        "findings": None,
        "code_commit_ui": None,
    }
    out.update(extra)
    return out


def _last_commit_workspace() -> str:
    try:
        from .ops import default_data_dir
        from .store import latest_done_workspace

        return latest_done_workspace(default_data_dir()) or ""
    except Exception:  # noqa: BLE001
        return ""


def _suggestions(*, current: str = "", cfg_default: str = "") -> list[dict[str, str]]:
    """当前工作区优先；无当前时仍「上次提交 → 提交常用 → …」，避免打乱旧习惯。"""
    from ..pick_workspace import build_pick_suggestions

    extras: list[tuple[str, str]] = [
        (_last_commit_workspace(), "上次提交"),
        (cfg_default, "提交常用"),
    ]
    try:
        from ..code_dev.config import get_config as get_code_dev_config

        extras.append((get_code_dev_config().default_workspace, "写码常用"))
    except Exception:  # noqa: BLE001
        pass
    try:
        from ..code_review.config import get_config as get_code_review_config

        extras.append((get_code_review_config().default_workspace, "审码常用"))
    except Exception:  # noqa: BLE001
        pass
    return build_pick_suggestions(
        current_workspace=current,
        lane_default="",
        lane_label="提交常用",
        extras=extras,
    )


def build_pick_ui(*, workspace: str = "") -> dict[str, Any]:
    from ..pick_workspace import resolve_pick_workspace

    cfg = get_config()
    hint = (workspace or "").strip()
    last_ws = _last_commit_workspace()
    # 显式路径 → 上次提交 → 配置常用（宿主侧栏 cwd 由客户端芯片/预填覆盖）
    ws = resolve_pick_workspace(hint, last_ws, cfg.default_workspace or "")
    br = preview_commit_branch(ws)
    return {
        "kind": "pick",
        "status": "pending",
        "workspace": ws,
        "work_branch": br.get("work_branch") or "",
        "current_branch": br.get("current_branch") or "",
        "config_branch": br.get("config_branch") or "",
        "branch_source": br.get("branch_source") or "none",
        "need_user_branch": bool(br.get("need_user_branch")),
        "branch_hint": br.get("branch_hint") or "",
        "default_push": cfg.default_push,
        "suggestions": _suggestions(current=hint, cfg_default=cfg.default_workspace or ""),
        "hint": "选择目录 · 下一步勾选文件",
        "summary": "请确认要提交的本机 Git 工程",
        "desc": (
            "先选目录并勾选待提交文件，再跑门禁（仅阻断 P0/P1）；通过后需再确认才会 commit/push。"
            "提交分支默认用仓库当前分支；在保护分支或无分支时自动创建功能分支。"
            "模型不会执行 git。"
        ),
    }


async def handle_chat_code_commit(text: str) -> dict[str, Any]:
    """用户说「提交代码」：返回选目录确认卡；不在聊天路径自动 start/confirm。"""
    raw = (text or "").strip()
    if not plugins_store.is_enabled(FEATURE_ID):
        hint = plugins_store.disabled_hint(FEATURE_ID, capability="人触发提交")
        return _base(
            reply=hint,
            note="code-commit 未启用",
            source="disabled",
            intent={"type": "code_commit", "metric": "disabled", "dim": None, "chart": None},
        )

    cfg = get_config()
    avail = availability()
    if not avail.get("ok"):
        return _base(
            thinking="提交车道未就绪。",
            reply=f"提交车道尚未就绪：{avail.get('detail') or '请检查配置'}",
            note=avail.get("detail"),
        )

    ws = extract_commit_workspace(raw) or ""
    ui = build_pick_ui(workspace=ws)
    return _base(
        thinking="已识别提交意图，请在确认卡中选择本机 Git 工程后再开始门禁。",
        reply=(
            "已识别为**人触发提交**。\n\n"
            "请在下方确认卡中选择**本机 Git 工程目录**并核对**提交分支**"
            "（默认当前分支；保护分支/无分支时自动创建），再点「开始门禁审核」。\n"
            "门禁仅列出阻断/严重问题；通过后填写中文说明并确认，才会 commit"
            + ("并默认 push" if cfg.default_push else "")
            + "。**模型不会执行 git。**"
        ),
        note="等待确认目录与分支",
        intent={"type": "code_commit", "metric": "pick", "dim": None, "chart": None},
        code_commit_ui=ui,
    )


async def handle_chat_fix_from_gate(text: str) -> dict[str, Any]:
    """用户说「修复这些问题」：用最近阻断门禁生成写码确认卡（不自动开工）。"""
    raw = (text or "").strip()
    if not plugins_store.is_enabled(FEATURE_ID):
        hint = plugins_store.disabled_hint(FEATURE_ID, capability="人触发提交")
        return _base(
            reply=hint,
            note="code-commit 未启用",
            source="disabled",
            intent={"type": "code_commit", "metric": "disabled", "dim": None, "chart": None},
        )

    ws = extract_commit_workspace(raw) or ""
    jid = extract_gate_job_id(raw)
    out = prepare_fix_from_gate(workspace=ws, job_id=jid)
    if not out.get("ok"):
        return _base(
            thinking="查找最近提交门禁阻断任务。",
            reply=out.get("reply") or out.get("detail") or "无法准备修复",
            note=out.get("detail"),
            source=out.get("source") or "code_commit_fix",
            intent={"type": "cursor_chat", "metric": "gate_fix", "dim": None, "chart": None},
        )

    return {
        "ok": True,
        "thinking": out.get("thinking") or "",
        "reply": out.get("reply") or "",
        "chart": None,
        "table": None,
        "note": out.get("note"),
        "source": "code_commit_fix",
        "data_source": "code_commit",
        "intent": out.get("intent")
        or {"type": "cursor_chat", "metric": "gate_fix", "dim": "zr_cchat_begin", "chart": None},
        "job_id": out.get("job_id"),
        "findings": out.get("findings"),
        "workspace": out.get("workspace"),
        "requirement": out.get("requirement"),
        "coding_begin": out.get("coding_begin") or "zr_cchat_begin",
        "handoff": out.get("handoff") or "zr_cchat_begin",
        "code_commit_ui": None,
        # 不再返回 code_dev_ui，避免误开旧写码确认卡
        "code_dev_ui": None,
        "code_dev_brief": None,
    }


__all__ = [
    "handle_chat_code_commit",
    "handle_chat_fix_from_gate",
    "is_code_commit_question",
    "is_fix_from_gate_question",
    "build_pick_ui",
]
