#!/usr/bin/env python3
"""查 / 停本机 TCP 监听进程。macOS 用 lsof；Windows 用 netstat。不依赖 psutil。"""
from __future__ import annotations

import os
import re
import signal
import subprocess
import sys
from typing import Optional


def listening_pid(port: int) -> Optional[int]:
    port = int(port)
    if os.name == "nt":
        return _pid_netstat(port)
    pid = _pid_lsof(port)
    if pid:
        return pid
    return _pid_ss(port)


def _pid_lsof(port: int) -> Optional[int]:
    try:
        out = subprocess.check_output(
            ["lsof", f"-tiTCP:{port}", "-sTCP:LISTEN"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return None
    line = (out or "").strip().splitlines()
    try:
        return int(line[0]) if line else None
    except ValueError:
        return None


def _pid_ss(port: int) -> Optional[int]:
    try:
        out = subprocess.check_output(
            ["ss", "-lptn", f"sport = :{port}"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return None
    m = re.search(r"pid=(\d+)", out or "")
    return int(m.group(1)) if m else None


def _pid_netstat(port: int) -> Optional[int]:
    try:
        out = subprocess.check_output(
            ["netstat", "-ano", "-p", "tcp"],
            text=True,
            stderr=subprocess.DEVNULL,
            encoding="utf-8",
            errors="replace",
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return None
    # TCP    127.0.0.1:3081    0.0.0.0:0    LISTENING    16284
    pat = re.compile(
        rf"^\s*TCP\s+\S*:{port}\s+\S+\s+LISTENING\s+(\d+)\s*$",
        re.I | re.M,
    )
    m = pat.search(out or "")
    return int(m.group(1)) if m else None


def stop_pid(pid: int) -> None:
    pid = int(pid)
    if pid <= 0:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            check=False,
        )
        return
    try:
        os.killpg(os.getpgid(pid), signal.SIGTERM)
    except OSError:
        try:
            os.kill(pid, signal.SIGTERM)
        except OSError:
            pass


def stop_port(port: int) -> Optional[int]:
    pid = listening_pid(port)
    if pid:
        stop_pid(pid)
    return pid


def main(argv: Optional[list[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    stop = False
    if args and args[0] in {"--stop", "stop"}:
        stop = True
        args = args[1:]
    if not args or not str(args[0]).isdigit():
        print("用法: port_listen.py [--stop] <port>", file=sys.stderr)
        return 2
    port = int(args[0])
    if stop:
        pid = stop_port(port)
        if pid:
            print(pid)
        return 0
    pid = listening_pid(port)
    if pid:
        print(pid)
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
