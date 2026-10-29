"""企业级安全审计（P1）：旁路落盘，失败永不阻断业务。"""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

_lock = threading.Lock()
_MAX_LINE = 4000


def _data_root() -> Path:
    try:
        from .code_dev.service import default_data_dir

        return Path(default_data_dir())
    except Exception:
        return Path(__file__).resolve().parents[1] / "data"


def audit_path() -> Path:
    d = _data_root() / "security"
    d.mkdir(parents=True, exist_ok=True)
    return d / "audit.jsonl"


def append_audit(event: str, **fields: Any) -> None:
    """写入一条审计事件。任何异常静默吞掉。"""
    try:
        row: dict[str, Any] = {
            "ts": int(time.time()),
            "event": str(event or "").strip()[:80] or "unknown",
        }
        for k, v in fields.items():
            if v is None:
                continue
            key = str(k)[:64]
            if isinstance(v, (bool, int, float)):
                row[key] = v
            else:
                s = str(v)
                if len(s) > 500:
                    s = s[:500] + "…"
                row[key] = s
        line = json.dumps(row, ensure_ascii=False)
        if len(line) > _MAX_LINE:
            line = line[: _MAX_LINE - 1] + "…"
        path = audit_path()
        with _lock:
            with path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
    except Exception:
        return


def query_audit(
    *,
    user_id: str = "",
    username: str = "",
    event: str = "",
    item: str = "",
    limit: int = 100,
    scan_max: int = 5000,
) -> list[dict[str, Any]]:
    """按人/事件/项过滤审计（从文件尾部往前扫，最多 scan_max 行）。

    供管理员排查「谁被拒看了工资/单价」。正文不应含金额原文（写入侧约定）。
    """
    lim = max(1, min(int(limit or 100), 500))
    scan = max(lim, min(int(scan_max or 5000), 20000))
    uid = str(user_id or "").strip()
    uname = str(username or "").strip().lower()
    ev = str(event or "").strip()
    it = str(item or "").strip()
    path = audit_path()
    if not path.is_file():
        return []
    # 只读文件尾部，避免审计很大时整文件进内存
    max_bytes = min(2_000_000, max(64_000, scan * 400))
    try:
        with _lock:
            size = path.stat().st_size
            with path.open("rb") as f:
                if size > max_bytes:
                    f.seek(size - max_bytes)
                    f.readline()  # 丢弃可能截断的首行
                raw = f.read().decode("utf-8", errors="replace")
    except Exception:
        return []
    lines = [ln for ln in raw.splitlines() if ln.strip()]
    if len(lines) > scan:
        lines = lines[-scan:]
    out: list[dict[str, Any]] = []
    for ln in reversed(lines):
        try:
            row = json.loads(ln)
        except Exception:
            continue
        if not isinstance(row, dict):
            continue
        if uid and str(row.get("user_id") or "").strip() != uid:
            continue
        if uname and str(row.get("username") or "").strip().lower() != uname:
            continue
        if ev:
            ev_row = str(row.get("event") or "")
            if ev_row != ev and not ev_row.startswith(ev):
                continue
        if it and str(row.get("item") or "").strip() != it:
            continue
        out.append(row)
        if len(out) >= lim:
            break
    return out
