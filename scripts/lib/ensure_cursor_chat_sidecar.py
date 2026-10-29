#!/usr/bin/env python3
"""确保本机 Cursor 对话写码 sidecar（:18791）在听。

不改 @zhongruan/dsh-cursor-chat 源码：只探测健康，挂了就用已安装包的
server.js 以 CURSOR_CHAT_SERVER_MODE=inplace 拉起子进程。

供 ensure_runtime / 需求→上线步骤 5 写码前调用。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Optional

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from win_hide import CREATE_NO_WINDOW, install as _hide_windows_console  # noqa: E402

_hide_windows_console()

DEFAULT_PORT = 18791
PKG_NAME = "@zhongruan/dsh-cursor-chat"
SERVICE = "dsh-cursor-chat"


def _dsh_home(explicit: Optional[Path] = None) -> Path:
    if explicit is not None:
        return Path(explicit).expanduser()
    return Path(os.environ.get("DSH_HOME") or (Path.home() / ".dsh")).expanduser()


def _profile(home: Path) -> Path:
    return home / "profiles" / "web"


def find_pkg_dir(home: Optional[Path] = None) -> Optional[Path]:
    home = _dsh_home(home)
    cand = _profile(home) / "node_modules" / PKG_NAME
    if (cand / "lib" / "server.js").is_file():
        return cand.resolve()
    for p in (
        home / "profiles" / "web" / "node_modules" / PKG_NAME,
        Path.home() / ".dsh" / "profiles" / "web" / "node_modules" / PKG_NAME,
    ):
        if (p / "lib" / "server.js").is_file():
            return p.resolve()
    return None


def _port_from_config() -> int:
    cfg_path = Path.home() / ".zhongruan" / "cursor-chat" / "config.json"
    try:
        raw = json.loads(cfg_path.read_text(encoding="utf-8"))
        port = int(raw.get("port") or DEFAULT_PORT)
        return port if 1 <= port <= 65535 else DEFAULT_PORT
    except Exception:
        return DEFAULT_PORT


def sidecar_base(port: Optional[int] = None) -> str:
    p = int(port or _port_from_config() or DEFAULT_PORT)
    return f"http://127.0.0.1:{p}"


def probe(base: Optional[str] = None, *, timeout: float = 2.5) -> Dict[str, Any]:
    url = (base or sidecar_base()).rstrip("/") + "/health"
    try:
        req = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            body = json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        return {"ok": False, "detail": f"HTTP {e.code}", "base": base or sidecar_base()}
    except Exception as e:
        return {"ok": False, "detail": str(e), "base": base or sidecar_base()}
    if not isinstance(body, dict):
        return {"ok": False, "detail": "health 非 JSON 对象", "base": base or sidecar_base()}
    if body.get("service") != SERVICE and not body.get("ok"):
        return {
            "ok": False,
            "detail": f"非预期服务：{body.get('service') or body}",
            "base": base or sidecar_base(),
        }
    return {
        "ok": True,
        "base": body.get("listen") or (base or sidecar_base()),
        "cursor_key_ready": bool(body.get("cursorKeyReady") or (body.get("view") or {}).get("cursorKeyConfigured")),
        "detail": body.get("detail") or "sidecar 就绪",
    }


def _node_bin() -> str:
    from shutil import which

    return which("node") or "node"


def _spawn_inplace(pkg: Path, port: int, log_path: Path) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    script = (
        "import { startServer, getListenAddr } from './lib/server.js';\n"
        "const r = await startServer();\n"
        "console.log(JSON.stringify(r));\n"
        "if (!r.ok) process.exit(1);\n"
        "console.log('listening', getListenAddr());\n"
        "await new Promise(() => {});\n"
    )
    env = os.environ.copy()
    env["CURSOR_CHAT_SERVER_MODE"] = "inplace"
    env["CURSOR_CHAT_PORT"] = str(port)
    env.pop("CURSOR_CHAT_HOME", None)
    env.pop("CURSOR_CHAT_MOCK", None)

    logf = open(log_path, "a", encoding="utf-8")
    try:
        logf.write(f"\n--- ensure chat sidecar {time.strftime('%Y-%m-%d %H:%M:%S')} port={port} ---\n")
        logf.flush()
        kwargs: Dict[str, Any] = {
            "args": [_node_bin(), "--input-type=module", "-e", script],
            "cwd": str(pkg),
            "env": env,
            "stdout": logf,
            "stderr": subprocess.STDOUT,
            "stdin": subprocess.DEVNULL,
        }
        if os.name == "nt":
            kwargs["creationflags"] = CREATE_NO_WINDOW | getattr(
                subprocess, "CREATE_NEW_PROCESS_GROUP", 0
            )
            kwargs["start_new_session"] = True
        else:
            kwargs["start_new_session"] = True
        proc = subprocess.Popen(**kwargs)
        return int(proc.pid or 0)
    finally:
        try:
            logf.close()
        except Exception:
            pass


def ensure_cursor_chat_sidecar(
    *,
    fix: bool = True,
    require: bool = False,
    home: Optional[Path] = None,
    wait_sec: float = 12.0,
) -> Dict[str, Any]:
    """探测并在需要时拉起 :18791。返回 {ok, detail, fixed, ...}。"""
    port = _port_from_config()
    base = sidecar_base(port)
    hit = probe(base)
    if hit.get("ok"):
        return {
            "ok": True,
            "fixed": False,
            "base": hit.get("base") or base,
            "detail": hit.get("detail") or f"已就绪 {base}",
            "cursor_key_ready": hit.get("cursor_key_ready"),
        }

    if not fix:
        out = {
            "ok": False,
            "fixed": False,
            "base": base,
            "detail": f"对话写码 sidecar 未就绪（{base}）：{hit.get('detail')}",
        }
        if require:
            out["required_fail"] = True
        return out

    pkg = find_pkg_dir(home)
    if not pkg:
        out = {
            "ok": False,
            "fixed": False,
            "base": base,
            "detail": f"未找到已安装的 {PKG_NAME}（请先 host wire / 装插件）",
        }
        if require:
            out["required_fail"] = True
        return out

    log_path = Path(
        os.environ.get("WORKBUDDY_CURSOR_CHAT_LOG")
        or (Path.home() / ".zhongruan" / "cursor-chat" / "logs" / "sidecar-ensure.log")
    )
    try:
        pid = _spawn_inplace(pkg, port, log_path)
    except Exception as e:
        out = {
            "ok": False,
            "fixed": False,
            "base": base,
            "detail": f"拉起 sidecar 失败：{type(e).__name__}: {e}",
            "pkg": str(pkg),
        }
        if require:
            out["required_fail"] = True
        return out

    deadline = time.time() + max(2.0, float(wait_sec))
    last: Dict[str, Any] = {}
    while time.time() < deadline:
        time.sleep(0.35)
        last = probe(base)
        if last.get("ok"):
            return {
                "ok": True,
                "fixed": True,
                "base": last.get("base") or base,
                "detail": f"已拉起 sidecar {base}（pid≈{pid}）",
                "pid": pid,
                "pkg": str(pkg),
                "log": str(log_path),
                "cursor_key_ready": last.get("cursor_key_ready"),
            }

    out = {
        "ok": False,
        "fixed": False,
        "base": base,
        "detail": (
            f"已尝试拉起但仍不可达（{base}）：{last.get('detail') or hit.get('detail')}；"
            f"见日志 {log_path}"
        ),
        "pid": pid,
        "pkg": str(pkg),
        "log": str(log_path),
    }
    if require:
        out["required_fail"] = True
    return out


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="确保 Cursor 对话写码 sidecar :18791 就绪")
    ap.add_argument("--fix", action="store_true", help="未就绪时自动拉起（裸跑默认开启）")
    ap.add_argument("--require", action="store_true", help="失败则以非 0 退出")
    ap.add_argument("--no-fix", action="store_true", help="只探测、不拉起")
    ap.add_argument("--json", action="store_true", help="只打印 JSON")
    ap.add_argument("--dsh-home", default="", help="覆盖 DSH_HOME")
    args = ap.parse_args(argv)
    home = Path(args.dsh_home).expanduser() if args.dsh_home else None
    fix = not args.no_fix
    res = ensure_cursor_chat_sidecar(fix=fix, require=args.require, home=home)
    if args.json:
        print(json.dumps(res, ensure_ascii=False))
    else:
        status = "OK" if res.get("ok") else "FAIL"
        print(f"[{status}] {res.get('detail')}")
        if res.get("base"):
            print(f"  base: {res.get('base')}")
    if args.require and not res.get("ok"):
        return 1
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
