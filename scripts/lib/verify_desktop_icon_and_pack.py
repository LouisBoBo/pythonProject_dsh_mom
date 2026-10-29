#!/usr/bin/env python3
"""桌面图标门禁 + 可选整包（日志落盘 desktop/release/_verify_icon_pack.log）。"""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DESKTOP = ROOT / "desktop"
RELEASE = DESKTOP / "release"
LOG = RELEASE / "_verify_icon_pack.log"
LIB = Path(__file__).resolve().parent


def _log(line: str, fh) -> None:
    text = line.rstrip()
    print(text, flush=True)
    fh.write(text + "\n")
    fh.flush()


def _decode_output(raw: bytes | None) -> str:
    if not raw:
        return ""
    return raw.decode("utf-8", errors="replace")


def _run(cmd: list[str], *, cwd: Path, fh, env: dict | None = None) -> None:
    _log("+ " + " ".join(cmd), fh)
    # Windows 默认 text=True 会用 GBK 读子进程输出，node 打中文路径时会 UnicodeDecodeError
    merged = None
    if env:
        merged = {**os.environ, **env}
    p = subprocess.run(cmd, cwd=str(cwd), capture_output=True, timeout=7200, env=merged)
    stdout = _decode_output(p.stdout)
    stderr = _decode_output(p.stderr)
    if stdout:
        fh.write(stdout)
        if not stdout.endswith("\n"):
            fh.write("\n")
        print(stdout, end="" if stdout.endswith("\n") else "\n", flush=True)
    if stderr:
        fh.write(stderr)
        if not stderr.endswith("\n"):
            fh.write("\n")
        print(stderr, end="" if stderr.endswith("\n") else "\n", flush=True)
    fh.flush()
    if p.returncode != 0:
        raise SystemExit(p.returncode)


def main() -> int:
    RELEASE.mkdir(parents=True, exist_ok=True)
    argv = sys.argv[1:]
    do_pack = "--pack" in argv
    bump = "--no-bump" not in argv
    skip_upload = "--skip-upload" in argv

    with LOG.open("w", encoding="utf-8") as fh:
        _log(f"=== verify_desktop_icon_and_pack {datetime.now().isoformat()} ===", fh)
        py = sys.executable
        node = "node"

        if sys.platform == "win32":
            for im in ("MOM.exe", "Mom-x.exe", "江西中软.exe", "ZR WorkBuddy.exe"):
                subprocess.run(
                    ["taskkill", "/IM", im, "/F", "/T"],
                    capture_output=True,
                    timeout=60,
                )

        _run([py, str(LIB / "ensure_desktop_icon.py"), "--require"], cwd=ROOT, fh=fh)
        _run([node, str(DESKTOP / "tests" / "test_startup_contract.js")], cwd=DESKTOP, fh=fh)
        _run([node, str(DESKTOP / "tests" / "test_win_exe_icon.js")], cwd=DESKTOP, fh=fh)

        unpacked = RELEASE / "win-unpacked"
        if unpacked.is_dir():
            _log("现有 win-unpacked，试写图标…", fh)
            _run([node, str(DESKTOP / "scripts" / "apply-win-unpacked-icon.js")], cwd=DESKTOP, fh=fh)
        else:
            _log("无 win-unpacked，跳过 apply-win-unpacked-icon", fh)

        if do_pack:
            pack_cmd = [py, str(LIB / "package_desktop.py"), "win"]
            if not bump:
                pack_cmd.append("--no-bump")
            pack_env = {"WORKBUDDY_DESKTOP_SKIP_UPLOAD": "1"} if skip_upload else None
            if skip_upload:
                _log("（--skip-upload：仅本地安装包，不上传 feed）", fh)
            _run(pack_cmd, cwd=ROOT, fh=fh, env=pack_env)

        _log("=== OK ===", fh)
    print(f"日志: {LOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
