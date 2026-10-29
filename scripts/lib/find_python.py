#!/usr/bin/env python3
"""跨平台找本机 Python。Windows 安装器提供的是 python.exe，没有 python3。

Mac 开发机 PATH 上是 python3；换到 Windows 后脚本/Node 仍写死 python3，
读 runtime、启引擎、bridge 调 plugins_store 会整条静默失败。
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

# WorkBuddy 引擎算数依赖；缺任何一个都不能拿来起引擎。
ENGINE_MODULES: tuple[str, ...] = (
    "fastapi",
    "uvicorn",
    "yaml",
    "httpx",
    "numpy",
    "pandas",
)


def _win_install_pythons() -> List[str]:
    out: List[str] = []
    local = os.environ.get("LOCALAPPDATA") or ""
    if local:
        root = Path(local) / "Programs" / "Python"
        if root.is_dir():
            for d in sorted(root.glob("Python3*"), reverse=True):
                exe = d / "python.exe"
                if exe.is_file():
                    out.append(str(exe))
    pf = os.environ.get("ProgramFiles") or r"C:\Program Files"
    for d in Path(pf).glob("Python3*"):
        exe = d / "python.exe"
        if exe.is_file():
            out.append(str(exe))
    return out


def _mac_framework_pythons() -> List[str]:
    return [
        "/usr/local/bin/python3",
        "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
        "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
        "/opt/homebrew/bin/python3",
    ]


def iter_candidates(preferred: Optional[str] = None) -> List[str]:
    raw: List[str] = []
    for item in (
        preferred,
        os.environ.get("APP_ENGINE_PYTHON"),
        "python3",
        "python",
        sys.executable,
    ):
        if item:
            raw.append(str(item))
    if sys.platform == "win32":
        raw.extend(_win_install_pythons())
        raw.append("py")
    else:
        raw.extend(_mac_framework_pythons())
        raw.append("python3.12")
    seen = set()
    out: List[str] = []
    for c in raw:
        k = c.strip()
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(k)
    return out


def _real_executable(bin_name: str) -> Optional[str]:
    """跑起来并打印 sys.executable；py 启动器要带 -3。"""
    if os.path.isfile(bin_name) and os.access(bin_name, os.X_OK):
        cmd = [bin_name]
    else:
        found = shutil.which(bin_name)
        if not found:
            return None
        cmd = [found]
    code = "import sys; print(sys.executable)"
    args = list(cmd)
    if Path(cmd[0]).name.lower() in {"py", "py.exe"}:
        args = [cmd[0], "-3"]
    try:
        proc = subprocess.run(
            args + ["-c", code],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    exe = (proc.stdout or "").strip().splitlines()
    return exe[-1] if exe else (cmd[0] if os.path.isfile(cmd[0]) else None)


def _can_import(exe: str, module: str) -> bool:
    ok, _ver = _probe_version_and_imports(exe, [module])
    return ok


def _resolve_exe(cand: str) -> Optional[str]:
    """已经是 python.exe 路径时不再多开一次进程。py 启动器仍要跑起来解析。"""
    name = Path(cand).name.lower()
    if os.path.isfile(cand) and name not in {"py", "py.exe"}:
        return str(Path(cand).resolve())
    return _real_executable(cand)


def _probe_version_and_imports(
    exe: str, modules: Sequence[str]
) -> tuple[bool, tuple[int, int]]:
    """一次进程里打印版本并导入全部模块。numpy/pandas 冷导入慢，不要拆成多次启动。"""
    mods: List[str] = []
    for module in modules:
        if not module.isidentifier():
            return False, (0, 0)
        mods.append(module)
    lines = [
        "import sys",
        "sys.stdout.write('%d.%d\\n' % sys.version_info[:2])",
        "sys.stdout.flush()",
    ]
    if mods:
        lines.append("import " + ", ".join(mods))
    try:
        proc = subprocess.run(
            [exe, "-c", "\n".join(lines)],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False, (0, 0)
    if proc.returncode != 0:
        return False, (0, 0)
    raw = (proc.stdout or "").strip().splitlines()
    if not raw:
        return False, (0, 0)
    try:
        major, minor = raw[0].split(".")[:2]
        return True, (int(major), int(minor))
    except ValueError:
        return False, (0, 0)


def _is_foreign_venv(exe: str, *, allow_under: Optional[Path] = None) -> bool:
    """别的工程 .venv（常见：MES 后端）有 uvicorn 但没有引擎 numpy，不能拿来起 WorkBuddy。"""
    try:
        resolved = Path(exe).resolve()
    except OSError:
        return False
    text = resolved.as_posix().lower()
    if ".venv/" not in text and "/venv/" not in text:
        return False
    if allow_under is not None:
        try:
            resolved.relative_to(allow_under.resolve())
            return False
        except ValueError:
            pass
    return True


def find_python(
    *,
    preferred: Optional[str] = None,
    need_uvicorn: bool = False,
    need_modules: Optional[Sequence[str]] = None,
    skip_foreign_venv: bool = False,
    allow_under: Optional[Path] = None,
    min_major: int = 3,
    min_minor: int = 10,
) -> Optional[str]:
    """返回可用解释器的真实路径；找不到则 None。"""
    modules = list(need_modules or ())
    if need_uvicorn and "uvicorn" not in modules:
        modules.append("uvicorn")
    for cand in iter_candidates(preferred):
        exe = _resolve_exe(cand)
        if not exe:
            continue
        if skip_foreign_venv and _is_foreign_venv(exe, allow_under=allow_under):
            continue
        ok, ver = _probe_version_and_imports(exe, modules)
        if not ok or ver < (min_major, min_minor):
            continue
        return exe
    return None


def require_python(
    *,
    preferred: Optional[str] = None,
    need_uvicorn: bool = False,
    need_modules: Optional[Sequence[str]] = None,
    skip_foreign_venv: bool = False,
    allow_under: Optional[Path] = None,
) -> str:
    found = find_python(
        preferred=preferred,
        need_uvicorn=need_uvicorn,
        need_modules=need_modules,
        skip_foreign_venv=skip_foreign_venv,
        allow_under=allow_under,
    )
    if not found:
        need = list(need_modules or ())
        if need_uvicorn and "uvicorn" not in need:
            need.insert(0, "uvicorn")
        extra = f"（需能 import {', '.join(need)}）" if need else ""
        raise SystemExit(
            "找不到可用的 Python 3.10+"
            + extra
            + "。请安装依赖：pip install -r apps/zr-workbuddy/engine/requirements.txt"
            + "，或设 APP_ENGINE_PYTHON 指向本机完整解释器（不要用其它工程的 .venv）。"
        )
    return found


def main(argv: Optional[Iterable[str]] = None) -> int:
    args = list(argv if argv is not None else sys.argv[1:])
    need = "--uvicorn" in args
    found = find_python(need_uvicorn=need)
    if not found:
        print("NOT_FOUND", file=sys.stderr)
        return 1
    print(found)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
