#!/usr/bin/env python3
"""把命令放到新会话里后台跑，避免 Cursor/IDE 结束 shell 时把子进程带走。

用法:
  python3 scripts/lib/daemonize.py --cwd DIR --log FILE --pid FILE -- cmd [args...]
打印子进程 PID 到 stdout。
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from native_path import native_path  # noqa: E402


def strip_env_wrapper(
    cmd: Sequence[str], env: Dict[str, str]
) -> Tuple[List[str], Dict[str, str]]:
    """Unix `env KEY=val cmd` 在 Windows 上不是可执行文件。"""
    argv = [str(x) for x in cmd]
    if not argv:
        return argv, dict(env)
    name = Path(native_path(argv[0])).name.lower()
    if name not in {"env", "env.exe"}:
        return argv, dict(env)
    extra = dict(env)
    i = 1
    while i < len(argv):
        a = argv[i]
        if a == "--":
            i += 1
            break
        if "=" in a and not a.startswith("-"):
            k, _, v = a.partition("=")
            if k:
                extra[k] = v
            i += 1
            continue
        break
    return argv[i:], extra


def _node_bin_js_for_dsh_shim(shim: Path) -> Optional[Path]:
    bin_js = shim.parent / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
    return bin_js if bin_js.is_file() else None


def _which_node() -> Optional[str]:
    return shutil.which("node") or shutil.which("node.exe")


def win32_argv(cmd: Sequence[str]) -> List[str]:
    """CreateProcess 不能跑 shebang / 无后缀 npm shim；改成 node bin.js 或 cmd /c .cmd。"""
    argv = [str(x) for x in cmd]
    if os.name != "nt" or not argv:
        if argv:
            argv[0] = native_path(argv[0])
        return argv

    exe = Path(native_path(argv[0]))
    rest = argv[1:]
    name = exe.name.lower()
    suf = exe.suffix.lower()

    if name in {"dsh", "dsh.cmd", "dsh.ps1"}:
        bin_js = _node_bin_js_for_dsh_shim(exe)
        node = _which_node()
        if bin_js is not None and node:
            return [node, str(bin_js), *rest]

    if suf in {".cmd", ".bat"}:
        comspec = os.environ.get("COMSPEC") or "cmd.exe"
        return [comspec, "/c", str(exe), *rest]

    if suf in {".exe", ".com"}:
        return [str(exe), *rest]

    cmd_sib = exe.with_suffix(".cmd")
    if cmd_sib.is_file():
        bin_js = _node_bin_js_for_dsh_shim(cmd_sib)
        node = _which_node()
        if bin_js is not None and node:
            return [node, str(bin_js), *rest]
        comspec = os.environ.get("COMSPEC") or "cmd.exe"
        return [comspec, "/c", str(cmd_sib), *rest]

    try:
        head = exe.read_text(encoding="utf-8", errors="replace").splitlines()[:1]
    except OSError:
        head = []
    if head and head[0].startswith("#!") and "node" in head[0]:
        node = _which_node()
        if node:
            return [node, str(exe), *rest]

    return [str(exe), *rest]


def prepare_daemon_cmd(
    cmd: Sequence[str], env: Optional[Dict[str, str]] = None
) -> Tuple[List[str], Dict[str, str]]:
    merged = dict(os.environ if env is None else env)
    argv, merged = strip_env_wrapper(cmd, merged)
    if not argv:
        return argv, merged
    argv = win32_argv(argv)
    return argv, merged


def main() -> int:
    ap = argparse.ArgumentParser(description="Detached process launcher")
    ap.add_argument("--cwd", default=os.path.expanduser("~"))
    ap.add_argument("--log", required=True)
    ap.add_argument("--pid", required=True)
    ap.add_argument("cmd", nargs=argparse.REMAINDER)
    args = ap.parse_args()
    cmd = list(args.cmd)
    if cmd and cmd[0] == "--":
        cmd = cmd[1:]
    if not cmd:
        print("daemonize: missing command", file=sys.stderr)
        return 2

    argv, env = prepare_daemon_cmd(cmd, os.environ.copy())
    if not argv:
        print("daemonize: missing command after env unwrap", file=sys.stderr)
        return 2
    # 父 shell 若 activate 了其它工程 .venv，子进程用绝对路径 python 时仍可能被 VIRTUAL_ENV 干扰
    env.pop("VIRTUAL_ENV", None)
    env.pop("PYTHONHOME", None)

    log_path = Path(native_path(args.log)).expanduser()
    pid_path = Path(native_path(args.pid)).expanduser()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    pid_path.parent.mkdir(parents=True, exist_ok=True)

    cwd = native_path(args.cwd) or str(Path(args.cwd).expanduser())
    # 追加日志；子进程继承后父进程立即关闭 fd
    log_f = open(log_path, "ab", buffering=0)
    try:
        # start_new_session=True → 子进程 setsid，脱离控制终端与父进程组
        proc = subprocess.Popen(
            argv,
            cwd=cwd,
            stdin=subprocess.DEVNULL,
            stdout=log_f,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
            env=env,
        )
    finally:
        try:
            log_f.close()
        except OSError:
            pass

    pid_path.write_text(f"{proc.pid}\n", encoding="utf-8")
    print(proc.pid)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
