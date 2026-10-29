"""引擎启动时把工具链路用到的模块全部 import 一遍。

/api/runtime 探活为 200 不等于审码/插件启停能跑。
Windows 上 fcntl 等 POSIX 模块是懒加载，第一次工具调用才 HTTP 500。
这里在 startup 就暴露，避免「引擎看起来好了、功能全挂」。
不改用量口径。
"""
from __future__ import annotations

import os
import tempfile
from typing import Any, Dict, List, Tuple

_Probe = Tuple[str, str]


def _try(name: str, fn) -> _Probe:
    try:
        fn()
        return name, "ok"
    except Exception as exc:  # noqa: BLE001
        return name, f"{type(exc).__name__}: {exc}"


def _lock_roundtrip() -> None:
    from .os_lock import lock_ex, lock_un

    fd, path = tempfile.mkstemp(prefix="wb-lock-", suffix=".lock")
    os.close(fd)
    try:
        with open(path, "a+", encoding="utf-8") as fh:
            lock_ex(fh)
            lock_un(fh)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _plugins_store() -> None:
    from . import plugins_store

    plugins_store.load_state()


def _usage_store() -> None:
    from .usage import store as usage_store

    usage_store.events_path()


def _deploy_store() -> None:
    from .code_deploy import store as deploy_store

    _ = deploy_store.JOB_STATUSES


def _code_review() -> None:
    from . import code_review

    if not callable(getattr(code_review, "status", None)):
        raise RuntimeError("code_review.status 不可调用")


def check_tool_runtime() -> Dict[str, Any]:
    probes: List[_Probe] = [
        _try("os_lock", _lock_roundtrip),
        _try("plugins_store", _plugins_store),
        _try("usage_store", _usage_store),
        _try("code_deploy_store", _deploy_store),
        _try("code_review", _code_review),
    ]
    errors = [f"{n}: {msg}" for n, msg in probes if msg != "ok"]
    return {
        "ok": not errors,
        "probes": {n: msg for n, msg in probes},
        "errors": errors,
    }
