"""dev-pipeline Epic / Run 落盘。"""
from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any

_lock = threading.Lock()

_ENGINE_ROOT = Path(__file__).resolve().parents[2]


def default_data_dir() -> Path:
    return _ENGINE_ROOT / "data"


def pipeline_root(data_dir: Path | None = None) -> Path:
    d = (data_dir or default_data_dir()) / "dev_pipeline"
    d.mkdir(parents=True, exist_ok=True)
    (d / "epics").mkdir(parents=True, exist_ok=True)
    (d / "runs").mkdir(parents=True, exist_ok=True)
    return d


def new_epic_id() -> str:
    return f"ep-{time.strftime('%Y%m%d')}-{uuid.uuid4().hex[:10]}"


def new_run_id() -> str:
    return f"dpj-{uuid.uuid4().hex[:16]}"


def _epic_path(data_dir: Path, epic_id: str) -> Path:
    safe = "".join(c for c in epic_id if c.isalnum() or c in "-_")
    if safe != epic_id:
        raise ValueError("invalid epic_id")
    return pipeline_root(data_dir) / "epics" / f"{safe}.json"


def _run_path(data_dir: Path, run_id: str) -> Path:
    safe = "".join(c for c in run_id if c.isalnum() or c in "-_")
    if safe != run_id:
        raise ValueError("invalid run_id")
    return pipeline_root(data_dir) / "runs" / f"{safe}.json"


def save_epic(data_dir: Path, epic: dict[str, Any]) -> None:
    eid = str(epic.get("epic_id") or "").strip()
    if not eid:
        raise ValueError("epic_id required")
    epic["updated_at"] = int(time.time())
    path = _epic_path(data_dir, eid)
    with _lock:
        path.write_text(json.dumps(epic, ensure_ascii=False, indent=2), encoding="utf-8")


def load_epic(data_dir: Path, epic_id: str) -> dict[str, Any] | None:
    path = _epic_path(data_dir, epic_id)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_run(data_dir: Path, run: dict[str, Any]) -> None:
    rid = str(run.get("run_id") or "").strip()
    if not rid:
        raise ValueError("run_id required")
    run["updated_at"] = int(time.time())
    path = _run_path(data_dir, rid)
    with _lock:
        path.write_text(json.dumps(run, ensure_ascii=False, indent=2), encoding="utf-8")


_OPEN_RUN_STATUSES = frozenset({"queued", "running", "paused", "cancelling"})


def find_open_run_for_session(data_dir: Path, dsh_session_id: str) -> dict[str, Any] | None:
    """本会话尚未结束的 Run（queued/running/paused），用于幂等 begin。"""
    sid = (dsh_session_id or "").strip()
    if not sid:
        return None
    runs_dir = pipeline_root(data_dir) / "runs"
    if not runs_dir.is_dir():
        return None
    best: dict[str, Any] | None = None
    best_ts = -1
    for fp in runs_dir.glob("*.json"):
        try:
            run = json.loads(fp.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if str(run.get("dsh_session_id") or "") != sid:
            continue
        if str(run.get("status") or "") not in _OPEN_RUN_STATUSES:
            continue
        ts = int(run.get("updated_at") or run.get("created_at") or 0)
        if ts >= best_ts:
            best_ts = ts
            best = run
    return best


def find_latest_run_for_session(
    data_dir: Path, dsh_session_id: str, *, exclude_run_id: str = ""
) -> dict[str, Any] | None:
    """本会话最近一条 Run（含已结束），供独立追问任务挂上下文关联。"""
    sid = (dsh_session_id or "").strip()
    if not sid:
        return None
    skip = (exclude_run_id or "").strip()
    runs_dir = pipeline_root(data_dir) / "runs"
    if not runs_dir.is_dir():
        return None
    best: dict[str, Any] | None = None
    best_ts = -1
    for fp in runs_dir.glob("*.json"):
        try:
            run = json.loads(fp.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if str(run.get("dsh_session_id") or "") != sid:
            continue
        rid = str(run.get("run_id") or "")
        if skip and rid == skip:
            continue
        ts = int(run.get("updated_at") or run.get("created_at") or 0)
        if ts >= best_ts:
            best_ts = ts
            best = run
    return best


def load_run(data_dir: Path, run_id: str) -> dict[str, Any] | None:
    path = _run_path(data_dir, run_id)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
