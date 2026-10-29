"""Run 级 SSE 事件广播（内存；进程内）。"""
from __future__ import annotations

import queue
import threading
from typing import Any

_lock = threading.Lock()
_subs: dict[str, list[queue.Queue[dict[str, Any]]]] = {}


def subscribe(run_id: str) -> queue.Queue[dict[str, Any]]:
    q: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=512)
    with _lock:
        _subs.setdefault(run_id, []).append(q)
    return q


def unsubscribe(run_id: str, q: queue.Queue[dict[str, Any]]) -> None:
    with _lock:
        lst = _subs.get(run_id) or []
        _subs[run_id] = [x for x in lst if x is not q]
        if not _subs[run_id]:
            _subs.pop(run_id, None)


def publish(run_id: str, event: dict[str, Any]) -> None:
    with _lock:
        targets = list(_subs.get(run_id) or [])
    for q in targets:
        try:
            q.put_nowait(event)
        except queue.Full:
            pass
