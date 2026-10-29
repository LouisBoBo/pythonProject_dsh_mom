"""跨平台文件锁。Unix 用 flock；Windows 用 msvcrt.locking。

审码 / 插件启停 / 用量账本在 Windows 上 import fcntl 会直接 500。
只替换锁实现，不改计量口径或业务语义。
"""
from __future__ import annotations

import os
import sys
from typing import IO, Any


def lock_ex(fh: IO[Any]) -> None:
    fd = fh.fileno()
    if sys.platform == "win32":
        import msvcrt

        # 空文件锁 1 字节会失败；补一行再锁。
        fh.seek(0, os.SEEK_END)
        if fh.tell() == 0:
            fh.write("\n")
            fh.flush()
        fh.seek(0)
        msvcrt.locking(fd, msvcrt.LK_LOCK, 1)
        return
    import fcntl

    fcntl.flock(fd, fcntl.LOCK_EX)


def lock_un(fh: IO[Any]) -> None:
    fd = fh.fileno()
    try:
        if sys.platform == "win32":
            import msvcrt

            fh.seek(0)
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
            return
        import fcntl

        fcntl.flock(fd, fcntl.LOCK_UN)
    except OSError:
        pass
