"""WorkBuddy 对接探活 — ERP / 嵌入页常用 /api/workbuddy/health。"""

from __future__ import annotations

import os
import socket
import urllib.error
import urllib.request
from typing import Any, Dict, List, Tuple

from .config_store import load_config
from .health import llm_ready
from .runtime_conf import read_runtime


def _default_dsh_probe_ports() -> List[int]:
    """浏览器开发壳默认 :3081（与 scripts/host.sh、verify_workbuddy_web 一致）。

    桌面一体包 :13080 不在默认列表；若需多端口探测，设 WORKBUDDY_WEB_PORTS=3081,13080。
    单端口覆盖：WORKBUDDY_WEB_PORT=3081。
    """
    multi = (os.environ.get("WORKBUDDY_WEB_PORTS") or "").strip()
    if multi:
        raw = multi
    else:
        single = (os.environ.get("WORKBUDDY_WEB_PORT") or "3081").strip()
        raw = single
    out: List[int] = []
    for part in raw.split(","):
        p = part.strip()
        if p.isdigit():
            n = int(p)
            if 1 <= n <= 65535 and n not in out:
                out.append(n)
    return out or [3081]


def _http_root_ok(host: str, port: int, timeout: float = 0.6) -> bool:
    url = f"http://{host}:{port}/"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return 200 <= int(getattr(resp, "status", 200)) < 500
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        return False


def probe_dsh_web(host: str = "127.0.0.1") -> Dict[str, Any]:
    """探测本机 DSH 浏览器聊天壳（默认 :3081）。"""
    ports = _default_dsh_probe_ports()
    hits: List[Tuple[int, bool]] = []
    first_url = ""
    for port in ports:
        ok = _http_root_ok(host, port)
        hits.append((port, ok))
        if ok and not first_url:
            first_url = f"http://{host}:{port}/"
    connected = bool(first_url)
    preferred = ports[0] if ports else 3081
    return {
        "connected": connected,
        "url": first_url,
        "host": host,
        "preferred_port": preferred,
        "ports": [{"port": p, "ok": ok} for p, ok in hits],
        "hint": (
            "聊天壳已监听，可用 url 打开 WorkBuddy"
            if connected
            else "未检测到聊天壳；请 scripts/host.sh up 或 dsh web --port 3081（DSH_HOME=~/.dsh）"
        ),
    }


def build_workbuddy_health(*, app: Any, version: str) -> Dict[str, Any]:
    rt = read_runtime()
    boot = getattr(app.state, "boot_check", None) or {}
    tools_ready = bool(boot.get("ok"))
    cfg = load_config()
    llm_ok = llm_ready(cfg)
    host = str(rt.get("host") or "127.0.0.1")
    port = int(rt.get("port") or 0)
    dsh = probe_dsh_web(host if host in ("127.0.0.1", "localhost", "::1") else "127.0.0.1")
    ready = tools_ready and llm_ok
    engine_reachable = False
    if port > 0:
        try:
            with socket.create_connection((host if host != "localhost" else "127.0.0.1", port), timeout=0.4):
                engine_reachable = True
        except OSError:
            engine_reachable = False
    return {
        "ok": True,
        "ready": ready,
        "workbuddy_ready": ready and (dsh.get("connected") or engine_reachable),
        "tools_ready": tools_ready,
        "llm_ready": llm_ok,
        "version": version,
        "engine": {"host": host, "port": port, "reachable": engine_reachable},
        "dsh_web": dsh,
        "endpoints": {
            "runtime": "/api/runtime",
            "status": "/api/status",
            "chat_stream": "/api/chat/stream",
        },
    }
