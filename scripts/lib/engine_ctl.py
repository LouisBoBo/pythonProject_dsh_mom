#!/usr/bin/env python3
"""跨平台引擎启停：不依赖 bash / lsof / curl / fcntl。

Mac 上 scripts/engine.sh 曾用 lsof+kill；Windows Git Bash 没有 lsof，
Node 侧 mes-runtime 再 spawn bash engine.sh，换机后引擎「看起来没挂」
或根本拉不起来，工具全 500。

本文件是唯一实现。engine.sh 只做薄封装。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

from ensure_runtime import check_runtime, print_report
from find_python import ENGINE_MODULES, find_python, require_python
from read_runtime import read_runtime

ROOT = Path(__file__).resolve().parents[2]
DAEMONIZE = Path(__file__).resolve().parent / "daemonize.py"


def resolve_app_name(name: str) -> str:
    n = (name or "").strip()
    if n in {"mes-analytics", "mes_analytics"}:
        return "zr-workbuddy"
    return n or "zr-workbuddy"


def engine_dir(app: str) -> Path:
    return ROOT / "apps" / app / "engine"


def _runtime(app: str, port_override: Optional[int] = None) -> Dict[str, Any]:
    eng = engine_dir(app)
    rt = read_runtime(str(eng))
    if port_override:
        rt["port"] = int(port_override)
    preferred = str(rt.get("python") or "")
    # 禁止误用 PATH 上其它工程 .venv（只有 uvicorn、没有 numpy）起引擎。
    py = find_python(
        preferred=preferred,
        need_uvicorn=True,
        need_modules=ENGINE_MODULES,
        skip_foreign_venv=True,
        allow_under=ROOT,
    ) or find_python(
        preferred=preferred,
        need_uvicorn=True,
        need_modules=ENGINE_MODULES,
    )
    if py:
        rt["python"] = py
    return rt


def _urls(rt: Dict[str, Any]) -> str:
    return f"http://{rt['host']}:{rt['port']}"


def health_payload(rt: Dict[str, Any], timeout: float = 1.5) -> Optional[dict]:
    url = f"{_urls(rt)}/api/runtime"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            if resp.status != 200:
                return None
            raw = resp.read().decode("utf-8", errors="replace")
            data = json.loads(raw)
            return data if isinstance(data, dict) else None
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, ValueError):
        return None


def health_ok(rt: Dict[str, Any]) -> bool:
    data = health_payload(rt)
    return bool(data and data.get("ok") is True)


def port_open(host: str, port: int) -> bool:
    import socket

    sock = socket.socket()
    sock.settimeout(0.4)
    try:
        sock.connect((host, int(port)))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def _pid_file(app: str) -> Path:
    return engine_dir(app) / "data" / "engine.pid"


def _log_file(app: str) -> Path:
    return engine_dir(app) / "data" / "engine.log"


def _read_pid(app: str) -> Optional[int]:
    path = _pid_file(app)
    if not path.is_file():
        return None
    try:
        raw = path.read_text(encoding="utf-8").strip().splitlines()
        return int(raw[0]) if raw else None
    except (OSError, ValueError):
        return None


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        try:
            import ctypes

            SYNCHRONIZE = 0x00100000
            handle = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, pid)
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:  # noqa: BLE001
            return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _stop_pid(pid: int) -> None:
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            check=False,
        )
        return
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass


def sync_bridge_client(app: str, host: str, port: int) -> None:
    client = ROOT / "apps" / app / "plugins" / "mes-bridge" / "lib" / "client.js"
    if not client.is_file():
        alt = ROOT / "apps" / app / "plugins" / f"{app}-bridge" / "lib" / "client.js"
        client = alt if alt.is_file() else client
    if not client.is_file():
        return
    text = client.read_text(encoding="utf-8")
    block = (
        "/*RUNTIME_BEGIN*/\n"
        f'window.__APP_ENGINE__ = {{ host: "{host}", port: {port} }};\n'
        "/*RUNTIME_END*/"
    )
    text2, n = re.subn(
        r"/\*RUNTIME_BEGIN\*/.*?/\*RUNTIME_END\*/",
        block,
        text,
        count=1,
        flags=re.S,
    )
    if n:
        client.write_text(text2, encoding="utf-8")
        print(f"已同步 bridge 面板地址 → {host}:{port}")


def do_status(app: str, rt: Dict[str, Any]) -> int:
    pid = _read_pid(app)
    alive = _pid_alive(pid) if pid else False
    if health_ok(rt):
        shown = pid if alive else "?"
        print(f"引擎运行中 PID={shown} → {_urls(rt)} （/api/runtime OK）")
        payload = health_payload(rt) or {}
        if payload.get("tools_ready") is False:
            print("警告: tools_ready=false，工具调用可能仍 500。见引擎日志 boot_check。")
            return 1
        return 0
    if port_open(str(rt["host"]), int(rt["port"])):
        print(f"端口 {rt['port']} 有进程，但 /api/runtime 未就绪")
        return 1
    print(f"引擎未在监听 :{rt['port']}")
    return 1


def do_stop(app: str, rt: Dict[str, Any]) -> int:
    if port_open(str(rt["host"]), int(rt["port"])) and not health_ok(rt):
        print(
            f"拒绝停止：端口 {rt['port']} 被其它服务占用（/api/runtime 不是本引擎）。",
            file=sys.stderr,
        )
        return 1
    pid = _read_pid(app)
    if pid and _pid_alive(pid):
        print(f"停止本应用引擎 PID={pid} (:{rt['port']})…")
        _stop_pid(pid)
        for _ in range(15):
            time.sleep(0.3)
            if not _pid_alive(pid):
                break
        if _pid_alive(pid):
            _stop_pid(pid)
    elif health_ok(rt):
        print(f"端口 :{rt['port']} 仍在响应，但 pid 文件无效；请手工结束占用进程")
        return 1
    else:
        print(f"引擎未在监听 :{rt['port']}（或监听者非本应用）")
    try:
        _pid_file(app).unlink(missing_ok=True)
    except OSError:
        pass
    return 0


def _start_bg(app: str, rt: Dict[str, Any]) -> int:
    py = require_python(
        preferred=str(rt.get("python") or ""),
        need_uvicorn=True,
        need_modules=ENGINE_MODULES,
        skip_foreign_venv=True,
        allow_under=ROOT,
    )
    eng = engine_dir(app)
    log = _log_file(app)
    pidf = _pid_file(app)
    log.parent.mkdir(parents=True, exist_ok=True)
    print(f"后台启动 {app} 引擎（守护）→ {_urls(rt)} （日志 {log}）")
    subprocess.run(
        [
            py,
            str(DAEMONIZE),
            "--cwd",
            str(eng),
            "--log",
            str(log),
            "--pid",
            str(pidf),
            "--",
            py,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            str(rt["host"]),
            "--port",
            str(rt["port"]),
        ],
        check=False,
    )
    for _ in range(30):
        time.sleep(1)
        if health_ok(rt):
            pid = _read_pid(app) or "?"
            print(f"引擎就绪 PID={pid}")
            return 0
    print(f"启动超时，见 {log}", file=sys.stderr)
    return 1


def _runtime_gate() -> int:
    report = check_runtime(do_fix=True, engine_only=True)
    print_report(report)
    if not report.ok:
        print("LOCKED：运行时依赖未就绪，拒绝启动引擎", file=sys.stderr)
        return 1
    return 0


def do_ensure(app: str, rt: Dict[str, Any]) -> int:
    sync_bridge_client(app, str(rt["host"]), int(rt["port"]))
    if health_ok(rt):
        print(f"引擎已就绪 → {_urls(rt)}")
        return 0
    if port_open(str(rt["host"]), int(rt["port"])):
        print(
            f"拒绝启动：端口 {rt['port']} 已被其它服务占用。请改 runtime.yaml，勿抢占。",
            file=sys.stderr,
        )
        return 1
    if _runtime_gate() != 0:
        return 1
    return _start_bg(app, rt)


def do_restart(app: str, rt: Dict[str, Any]) -> int:
    do_stop(app, rt)
    time.sleep(0.4)
    return do_ensure(app, rt)


def do_start_fg(app: str, rt: Dict[str, Any]) -> int:
    sync_bridge_client(app, str(rt["host"]), int(rt["port"]))
    if health_ok(rt):
        print(f"引擎已就绪 → {_urls(rt)}")
        return 0
    if port_open(str(rt["host"]), int(rt["port"])):
        print(
            f"拒绝启动：端口 {rt['port']} 已被其它服务占用。请改 runtime.yaml，勿抢占。",
            file=sys.stderr,
        )
        return 1
    if _runtime_gate() != 0:
        return 1
    py = require_python(
        preferred=str(rt.get("python") or ""),
        need_uvicorn=True,
        need_modules=ENGINE_MODULES,
        skip_foreign_venv=True,
        allow_under=ROOT,
    )
    eng = engine_dir(app)
    print(f"启动 {app} 引擎（前台）→ {_urls(rt)}")
    os.chdir(eng)
    os.execv(py, [py, "-m", "uvicorn", "app.main:app", "--host", str(rt["host"]), "--port", str(rt["port"])])
    return 1


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="WorkBuddy 引擎启停（跨平台）")
    ap.add_argument("app")
    ap.add_argument("cmd", choices=["status", "ensure", "start", "stop", "restart"])
    ap.add_argument("-d", "--detach", action="store_true")
    ap.add_argument("--port", type=int, default=0)
    args = ap.parse_args(argv)
    app = resolve_app_name(args.app)
    eng = engine_dir(app)
    if not eng.is_dir():
        print(f"找不到引擎: {eng}", file=sys.stderr)
        return 1
    rt = _runtime(app, args.port or None)
    cmd = args.cmd
    if cmd == "status":
        return do_status(app, rt)
    if cmd == "stop":
        return do_stop(app, rt)
    if cmd == "ensure":
        return do_ensure(app, rt)
    if cmd == "restart":
        return do_restart(app, rt)
    if cmd == "start":
        if args.detach:
            return do_ensure(app, rt)
        return do_start_fg(app, rt)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
