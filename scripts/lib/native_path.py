"""把 Git Bash / MSYS 路径转成当前 Python 能打开的本机路径。

Mac: /Users/... 原样。
Windows Git Bash: /d/AICodes/... → D:\\AICodes\\...
"""
from __future__ import annotations

import os
import re
from typing import Union

_PathLike = Union[str, os.PathLike[str]]

_MSYS = re.compile(r"^/([a-zA-Z])(/.*)?$")


def native_path(path: _PathLike) -> str:
    s = os.path.expanduser(str(path or ""))
    if not s:
        return s
    if os.name == "nt":
        unix = s.replace("\\", "/")
        m = _MSYS.match(unix)
        if m:
            rest = (m.group(2) or "").replace("/", "\\")
            return f"{m.group(1).upper()}:{rest}"
    return s
