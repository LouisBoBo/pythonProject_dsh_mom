"""内嵌 Python 依赖戳记。

桌面冷启动会跑 ensure_runtime。若每次都新开进程 import numpy/pandas，
杀毒扫描下要多等好几秒。打包时依赖已经验证过，就在解释器前缀写一份戳记；
requirements 未变则跳过重复导入。解释器或依赖被换掉后戳记对不上，仍走完整检查。
"""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Sequence

MODULES_STAMP_NAME = ".workbuddy-py-modules.stamp"
RUNTIME_STAMP_NAME = ".workbuddy-py-runtime.stamp"


def requirements_hash(req: Path) -> str:
    data = Path(req).read_bytes()
    return hashlib.sha256(data).hexdigest()


def python_prefix(exe: str) -> Path:
    """python.exe 在前缀根，或在 bin/ Scripts/ 下。"""
    path = Path(exe).resolve()
    if path.parent.name.lower() in {"bin", "scripts"}:
        return path.parent.parent
    return path.parent


def modules_stamp_text(req_hash: str, modules: Sequence[str]) -> str:
    mods = ",".join(modules)
    return f"req={req_hash}\nmodules={mods}\n"


def runtime_stamp_text(cpython: str, req_hash: str, slim_rev: str) -> str:
    return f"cpython={cpython}\nreq={req_hash}\nslim={slim_rev}\n"


def _norm(text: str) -> str:
    return text.replace("\r\n", "\n").strip() + "\n"


def write_modules_stamp(prefix: Path, req: Path, modules: Sequence[str]) -> Path:
    body = modules_stamp_text(requirements_hash(req), modules)
    dest = Path(prefix) / MODULES_STAMP_NAME
    dest.write_text(body, encoding="utf-8", newline="\n")
    return dest


def modules_stamp_covers(exe: str, req: Path, modules: Sequence[str]) -> bool:
    req_path = Path(req)
    if not req_path.is_file() or not exe:
        return False
    stamp = python_prefix(exe) / MODULES_STAMP_NAME
    if not stamp.is_file():
        return False
    try:
        have = _norm(stamp.read_text(encoding="utf-8"))
        want = _norm(modules_stamp_text(requirements_hash(req_path), modules))
    except OSError:
        return False
    return have == want
