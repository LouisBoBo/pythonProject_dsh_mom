"""本会话一体化开关（按 DSH sessionId 落盘，非 config 全局）。"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

from . import store as dp_store


def _safe_session_id(session_id: str) -> str:
    s = (session_id or "").strip()
    if not s:
        return ""
    # 禁止 / \ 与 ..，避免 session_modes 路径穿越写出仓外
    s = re.sub(r"[^\w\-.:@+]", "_", s)[:160]
    if ".." in s:
        s = s.replace("..", "_")
    return s


def _mode_path(data_dir: Path, session_id: str) -> Path:
    sid = _safe_session_id(session_id)
    root = dp_store.pipeline_root(data_dir) / "session_modes"
    fp = (root / f"{sid}.json").resolve()
    try:
        fp.relative_to(root.resolve())
    except ValueError:
        # 异常 sid 落回哈希名，永不写出 session_modes 外
        digest = re.sub(r"[^\w]", "_", sid)[:48] or "invalid"
        fp = (root / f"_bad_{digest}.json").resolve()
    return fp


def get_integrated(session_id: str, *, data_dir=None) -> dict[str, Any]:
    sid = _safe_session_id(session_id)
    if not sid:
        return {"ok": False, "integrated_flow_enabled": False, "detail": "缺少 sessionId"}
    root = dp_store.default_data_dir() if data_dir is None else data_dir
    fp = _mode_path(root, sid)
    enabled = False
    updated_at = None
    mode_file_exists = fp.is_file()
    reset_reason = ""
    if mode_file_exists:
        try:
            doc = json.loads(fp.read_text(encoding="utf-8"))
            enabled = bool(doc.get("integrated_flow_enabled"))
            updated_at = doc.get("updated_at")
            reset_reason = str(doc.get("reset_reason") or "").strip()
        except (OSError, json.JSONDecodeError):
            enabled = False
            mode_file_exists = False
    # 进行中的一体化 Run：开关必须为开（即使文件里被写成 false）
    if not enabled:
        try:
            open_run = dp_store.find_open_run_for_session(root, sid)
        except Exception:
            open_run = None
        if open_run:
            healed = set_integrated(sid, True, data_dir=root)
            return {
                "ok": True,
                "session_id": sid,
                "integrated_flow_enabled": True,
                "updated_at": healed.get("updated_at") or updated_at,
                "healed_from_open_run": True,
            }
    # 旧一体化任务：从未落盘 session_modes、但本会话已有过程流 Run（含已结束）
    if not enabled and not mode_file_exists:
        try:
            latest = dp_store.find_latest_run_for_session(root, sid)
        except Exception:
            latest = None
        if latest:
            healed = set_integrated(sid, True, data_dir=root)
            return {
                "ok": True,
                "session_id": sid,
                "integrated_flow_enabled": True,
                "updated_at": healed.get("updated_at") or updated_at,
                "healed_from_latest_run": True,
            }
    # 历史误伤：曾批量 reset_reason=force_ordinary… 把真一体化会话写成 false
    # 本会话若已有过程流 Run，恢复为开（用户之后可再手动关掉）
    if (
        not enabled
        and mode_file_exists
        and reset_reason == "force_ordinary_coding_route_to_zr_cchat"
    ):
        try:
            latest = dp_store.find_latest_run_for_session(root, sid)
        except Exception:
            latest = None
        if latest:
            healed = set_integrated(sid, True, data_dir=root)
            return {
                "ok": True,
                "session_id": sid,
                "integrated_flow_enabled": True,
                "updated_at": healed.get("updated_at") or updated_at,
                "healed_from_force_ordinary_reset": True,
            }
    return {
        "ok": True,
        "session_id": sid,
        "integrated_flow_enabled": enabled,
        "updated_at": updated_at,
    }


def set_integrated(session_id: str, enabled: bool, *, data_dir=None) -> dict[str, Any]:
    sid = _safe_session_id(session_id)
    if not sid:
        return {"ok": False, "detail": "缺少 sessionId"}
    root = dp_store.default_data_dir() if data_dir is None else data_dir
    fp = _mode_path(root, sid)
    fp.parent.mkdir(parents=True, exist_ok=True)
    doc = {
        "session_id": sid,
        "integrated_flow_enabled": bool(enabled),
        "updated_at": int(time.time()),
    }
    fp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, **doc}
