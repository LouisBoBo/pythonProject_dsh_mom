#!/usr/bin/env python3
"""目录联接：macOS/Linux symlink，Windows junction。给 plugin.sh 的 ~/.dsh/link 用。"""
from __future__ import annotations

import sys
from pathlib import Path

from align_dsh_tools import link_dir, realpath, remove_link_or_move
from native_path import native_path


def ensure_dir_link(link: Path, target: Path) -> str:
    link = Path(native_path(link))
    target = Path(native_path(target)).resolve()
    link.parent.mkdir(parents=True, exist_ok=True)
    cur = realpath(link)
    want = realpath(target) or str(target)
    if cur and want and cur.replace("\\", "/").lower() == want.replace("\\", "/").lower():
        return f"ok {link} → {target}"
    if cur:
        remove_link_or_move(link)
    elif link.exists() or link.is_symlink():
        remove_link_or_move(link)
    link_dir(link, target)
    return f"linked {link} → {target}"


def main() -> int:
    if len(sys.argv) < 3:
        print("用法: link_path.py <link> <target>", file=sys.stderr)
        return 2
    print(ensure_dir_link(Path(sys.argv[1]), Path(sys.argv[2])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
