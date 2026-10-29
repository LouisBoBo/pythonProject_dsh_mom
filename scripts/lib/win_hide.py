"""Windows 子进程不弹控制台（CREATE_NO_WINDOW）。

桌面启动会多次 spawn python.exe / cmd / node；缺这个标志就会闪一下终端。
"""
from __future__ import annotations

import os
import subprocess
from typing import Any, Dict

CREATE_NO_WINDOW = 0x08000000


def popen_kwargs() -> Dict[str, Any]:
    if os.name != "nt":
        return {}
    si = subprocess.STARTUPINFO()
    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    si.wShowWindow = 0
    return {"creationflags": CREATE_NO_WINDOW, "startupinfo": si}


def merge_kwargs(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    extra = popen_kwargs()
    if not extra:
        return dict(kwargs)
    out = dict(extra)
    out.update(kwargs)
    flags = int(extra.get("creationflags") or 0) | int(kwargs.get("creationflags") or 0)
    out["creationflags"] = flags | CREATE_NO_WINDOW
    if "startupinfo" not in kwargs:
        out["startupinfo"] = extra["startupinfo"]
    return out


def install() -> None:
    """对本进程后续 subprocess.run / Popen 一律隐藏控制台。"""
    if os.name != "nt":
        return
    if getattr(subprocess.run, "_workbuddy_win_hide", False):
        return

    orig_run = subprocess.run
    orig_popen = subprocess.Popen

    def run(*args, **kwargs):
        return orig_run(*args, **merge_kwargs(kwargs))

    class HiddenPopen(orig_popen):  # type: ignore[valid-type,misc]
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **merge_kwargs(kwargs))

    run._workbuddy_win_hide = True  # type: ignore[attr-defined]
    HiddenPopen._workbuddy_win_hide = True  # type: ignore[attr-defined]
    subprocess.run = run  # type: ignore[assignment]
    subprocess.Popen = HiddenPopen  # type: ignore[misc,assignment]
