"""项目画像落盘：一工程一份，按绝对路径索引。"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any


def data_dir() -> Path:
    override = (os.environ.get("WORKBUDDY_PROJECT_PROFILE_DIR") or "").strip()
    if override:
        p = Path(override)
    else:
        p = Path(__file__).resolve().parents[2] / "data" / "project_profiles"
    p.mkdir(parents=True, exist_ok=True)
    return p


def path_key(workspace: str) -> str:
    raw = os.path.normcase(os.path.normpath(workspace or ""))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _file(workspace: str) -> Path:
    return data_dir() / f"{path_key(workspace)}.json"


def load(workspace: str) -> dict[str, Any] | None:
    path = _file(workspace)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def save(profile: dict[str, Any]) -> None:
    ws = str(profile.get("workspace") or "").strip()
    if not ws:
        raise ValueError("profile.workspace 为空")
    path = _file(ws)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
