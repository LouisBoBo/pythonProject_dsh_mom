#!/usr/bin/env python3
"""打印 profile 内知识库磁盘版本；与公司 npm latest 不一致则 exit 1。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from ensure_dsh_knowledge import installed_version, resolve_kb_version  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("profile", type=Path)
    args = ap.parse_args()
    profile = args.profile.expanduser().resolve()
    have = installed_version(profile)
    try:
        want = resolve_kb_version()
    except RuntimeError as exc:
        print(f"知识库验收: have={have} want=? ({exc})")
        return 0 if have else 1
    print(f"知识库磁盘版本验收: have={have} want={want}")
    if have != want:
        print(f"FAIL: 磁盘 {have} != npm latest {want}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
