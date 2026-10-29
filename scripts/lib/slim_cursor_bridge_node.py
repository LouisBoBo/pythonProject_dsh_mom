"""去掉 cursor-sdk 自带的那份 Node。

Python 包 cursor-sdk 的 wheel 在 _vendor/bridge/bin/ 里放了一个独立 node.exe
（当前约 85MB，Node 24），用来拉起写码桥。桌面一体包已经另有一份 Node ≥22
（runtime/node/bin）。@cursor/sdk 声明 engines.node >= 22.13，且桥的 --help
在内嵌 Node 22 上能加载成功时，安装包不必再带第二份 node.exe。

Node 版本不够或桥在内嵌 Node 上起不来时，保留 wheel 自带的 node.exe，写码不受影响。
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from win_hide import merge_kwargs  # noqa: E402

# 与 @cursor/sdk package.json engines.node 对齐；node:sqlite 也在这条线上。
MIN_NODE = (22, 13)

# %~dp0 自带结尾反斜杠。先剥掉再拼 \node\bin，避免 set "DIR=%DIR%\" 把引号吃掉。
_WIN_LAUNCHER = (
    "@echo off\r\n"
    "setlocal EnableExtensions\r\n"
    'set "HERE=%~dp0"\r\n'
    'set "DIR=%HERE%"\r\n'
    'set "DIR=%DIR:~0,-1%"\r\n'
    ":wb_find_node\r\n"
    'if exist "%DIR%\\node\\bin\\node.exe" goto :wb_found_node\r\n'
    'set "PREV=%DIR%"\r\n'
    'for %%I in ("%DIR%\\..") do set "DIR=%%~fI"\r\n'
    'if /I "%DIR%"=="%PREV%" goto :wb_no_node\r\n'
    "goto :wb_find_node\r\n"
    ":wb_found_node\r\n"
    '"%DIR%\\node\\bin\\node.exe" "%HERE%..\\dist\\bin\\cursor-sdk-bridge.js" %*\r\n'
    "exit /b %ERRORLEVEL%\r\n"
    ":wb_no_node\r\n"
    "echo cursor-sdk-bridge: runtime node\\bin\\node.exe not found 1>&2\r\n"
    "exit /b 1\r\n"
)

_POSIX_LAUNCHER = (
    "#!/bin/sh\n"
    'here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)\n'
    "dir=$here\n"
    'while [ -n "$dir" ] && [ "$dir" != "/" ]; do\n'
    '  if [ -x "$dir/node/bin/node" ]; then\n'
    '    exec "$dir/node/bin/node" "$here/../dist/bin/cursor-sdk-bridge.js" "$@"\n'
    "  fi\n"
    '  next=$(dirname "$dir")\n'
    '  if [ "$next" = "$dir" ]; then\n'
    "    break\n"
    "  fi\n"
    "  dir=$next\n"
    "done\n"
    'echo "cursor-sdk-bridge: runtime node/bin/node not found" >&2\n'
    "exit 1\n"
)


def parse_node_version(text: str) -> Optional[tuple[int, int]]:
    raw = (text or "").strip().splitlines()
    if not raw:
        return None
    parts = raw[-1].strip().split(".")
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]), int(parts[1])
    except ValueError:
        return None


def node_satisfies(version: tuple[int, int], minimum: tuple[int, int] = MIN_NODE) -> bool:
    return version >= minimum


def bridge_bin_dirs(python_root: Path) -> list[Path]:
    """Windows 是 Lib/site-packages；Unix standalone 是 lib/python3.x/site-packages。"""
    out: list[Path] = []
    lib = python_root / "Lib" / "site-packages" / "cursor_sdk" / "_vendor" / "bridge" / "bin"
    if lib.is_dir():
        out.append(lib)
    base = python_root / "lib"
    if base.is_dir():
        for sp in sorted(base.glob("python*/site-packages")):
            b = sp / "cursor_sdk" / "_vendor" / "bridge" / "bin"
            if b.is_dir():
                out.append(b)
    return out


def bundled_node_path(runtime: Path) -> Path:
    name = "node.exe" if os.name == "nt" else "node"
    return Path(runtime) / "node" / "bin" / name


def install_bridge_launchers(bin_dir: Path) -> None:
    """让桥去找一体包里的 runtime/node，不再调用同目录的 node.exe。"""
    bin_dir = Path(bin_dir)
    bin_dir.mkdir(parents=True, exist_ok=True)
    (bin_dir / "cursor-sdk-bridge.cmd").write_bytes(_WIN_LAUNCHER.encode("ascii"))
    sh = bin_dir / "cursor-sdk-bridge"
    sh.write_bytes(_POSIX_LAUNCHER.encode("ascii"))
    if os.name != "nt":
        mode = sh.stat().st_mode
        sh.chmod(mode | 0o755)


def remove_private_node(bin_dir: Path) -> int:
    """删除桥目录里的 node 可执行文件。返回释放的字节数。"""
    freed = 0
    for name in ("node.exe", "node"):
        path = Path(bin_dir) / name
        if not path.is_file():
            continue
        try:
            freed += int(path.stat().st_size)
        except OSError:
            pass
        path.unlink()
    return freed


def _read_node_version(node: Path) -> Optional[tuple[int, int]]:
    try:
        proc = subprocess.run(
            [str(node), "-p", "process.versions.node"],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
            **merge_kwargs({}),
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    return parse_node_version(proc.stdout or "")


def bridge_help_ok(node: Path, bridge_js: Path) -> bool:
    try:
        proc = subprocess.run(
            [str(node), str(bridge_js), "--help"],
            capture_output=True,
            timeout=30,
            check=False,
            **merge_kwargs({}),
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    if proc.returncode != 0:
        return False
    out = proc.stdout or b""
    return b"cursor-sdk-bridge" in out


def slim_cursor_bridge_node(runtime: Path) -> tuple[bool, str]:
    """成功去掉重复 node 时返回 (True, 说明)。保留原 node 时返回 (False, 原因)。"""
    runtime = Path(runtime)
    node = bundled_node_path(runtime)
    if not node.is_file():
        return False, "未找到内嵌 Node，保留 cursor-sdk 自带 node.exe"
    version = _read_node_version(node)
    if version is None or not node_satisfies(version):
        shown = ".".join(str(x) for x in version) if version else "未知"
        return False, f"内嵌 Node {shown} 不满足 >=22.13，保留 cursor-sdk 自带 node.exe"
    bins = bridge_bin_dirs(runtime / "python")
    if not bins:
        return False, "未找到 cursor_sdk bridge，跳过"
    js = bins[0].parent / "dist" / "bin" / "cursor-sdk-bridge.js"
    if not js.is_file():
        return False, "缺少 cursor-sdk-bridge.js，保留 cursor-sdk 自带 node.exe"
    if not bridge_help_ok(node, js):
        return False, "内嵌 Node 无法启动 cursor-sdk-bridge，保留自带 node.exe"
    freed = 0
    for bin_dir in bins:
        install_bridge_launchers(bin_dir)
        freed += remove_private_node(bin_dir)
    mb = freed / 1024 / 1024
    ver = f"{version[0]}.{version[1]}"
    return True, f"cursor-sdk 改用内嵌 Node {ver}，去掉重复 node.exe（{mb:.1f} MB）"
