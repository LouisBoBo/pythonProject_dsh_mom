#!/usr/bin/env python3
"""桌面壳图标：从引擎 static/zr-logo.png 同步到 desktop/build/icon.png（electron-builder 转 ico/icns）。"""
from __future__ import annotations

import shutil
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE_CANDIDATES = (
    ROOT / "apps" / "zr-workbuddy" / "engine" / "app" / "static" / "zr-logo.png",
    ROOT / "desktop" / "tray-icon.png",
)
DEST_DIR = ROOT / "desktop" / "build"
DEST = DEST_DIR / "icon.png"
MIN_SIDE = 256


def _resolve_source() -> Path:
    for path in SOURCE_CANDIDATES:
        if path.is_file():
            return path
    listed = ", ".join(str(p) for p in SOURCE_CANDIDATES)
    raise FileNotFoundError(f"缺少 LOGO 源文件（尝试过: {listed}）")


def _png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        sig = f.read(8)
        if sig[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"不是 PNG: {path}")
        f.read(4)
        chunk = f.read(4)
        if chunk != b"IHDR":
            raise ValueError(f"PNG IHDR 异常: {path}")
        w, h = struct.unpack(">II", f.read(8))
        return int(w), int(h)


def ensure_desktop_icon(*, require: bool = False) -> Path:
    try:
        source = _resolve_source()
    except FileNotFoundError as exc:
        msg = str(exc)
        if require:
            raise SystemExit(msg) from exc
        print(f"[ensure-desktop-icon] 跳过: {msg}", file=sys.stderr)
        return DEST
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    w, h = _png_size(source)
    if min(w, h) < MIN_SIDE:
        msg = f"LOGO 过小 ({w}x{h})，桌面图标建议 ≥{MIN_SIDE}px: {source}"
        if require:
            raise SystemExit(msg)
        print(f"[ensure-desktop-icon] 警告: {msg}", file=sys.stderr)
    src_m = source.stat().st_mtime
    if DEST.is_file() and DEST.stat().st_mtime >= src_m and DEST.stat().st_size > 0:
        print(f"[ensure-desktop-icon] 已是最新: {DEST}")
        return DEST
    shutil.copy2(source, DEST)
    print(f"[ensure-desktop-icon] {source.name} → {DEST} ({w}x{h})")
    return DEST


def main(argv: list[str] | None = None) -> int:
    require = "--require" in (argv or sys.argv[1:])
    ensure_desktop_icon(require=require)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
