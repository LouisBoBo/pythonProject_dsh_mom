#!/usr/bin/env python3
"""恢复 profile 核心包 @deepseek-ai/dsh-base / dsh-web-app。

事故：bundles 挂了核心包，但 web/node_modules 被 pnpm install 剪掉
（它们不在 package.json dependencies，只在 dsh.profile.bundles）。
purge_broken_profile_bundles 会 FATAL 拒绝启动。

策略：从宿主 dsh / profiles/node_modules 做 junction（Windows）或 symlink，
不擅自改 package.json dependencies（仍由 dsh 管理）。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import List, Optional, Sequence

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from align_dsh_tools import (  # noqa: E402
    link_dir,
    remove_link_or_move,
    which_dsh,
)

CORE_PKGS = (
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
)


def _nm_pkg(root: Path, name: str) -> Path:
    return root.joinpath("node_modules", *name.split("/"))


def _ok_pkg(path: Path) -> bool:
    return (path / "package.json").is_file()


def _host_dsh_root(dsh_bin: Optional[Path]) -> Optional[Path]:
    if dsh_bin is None:
        return None
    try:
        bin_dir = dsh_bin.resolve().parent
    except OSError:
        bin_dir = dsh_bin.parent
    # %APPDATA%/npm/dsh.cmd → npm/node_modules/@deepseek-ai/dsh
    cand = bin_dir / "node_modules" / "@deepseek-ai" / "dsh"
    if (cand / "package.json").is_file():
        return cand
    if bin_dir.name.lower() == "bin":
        cand = bin_dir.parent / "lib" / "node_modules" / "@deepseek-ai" / "dsh"
        if (cand / "package.json").is_file():
            return cand
    appdata = os.environ.get("APPDATA") or ""
    if appdata:
        cand = Path(appdata) / "npm" / "node_modules" / "@deepseek-ai" / "dsh"
        if (cand / "package.json").is_file():
            return cand
    return None


def source_candidates(profile: Path, name: str) -> List[Path]:
    """按优先级找一份完整核心包。"""
    out: List[Path] = []
    dsh_home = profile.parent.parent if profile.parent.name == "profiles" else profile.parent
    # 1) 同级 profiles/node_modules（历史 hoist）
    out.append(_nm_pkg(dsh_home / "profiles", name))
    # 2) 桌面一体包内嵌宿主（main.js 写入 WORKBUDDY_HOST_ROOT）
    host_root = os.environ.get("WORKBUDDY_HOST_ROOT") or ""
    if host_root:
        nest = Path(host_root) / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules"
        out.append(nest.joinpath(*name.split("/")))
    # 3) 宿主 dsh 嵌套依赖
    host = _host_dsh_root(which_dsh())
    if host is not None:
        out.append(host / "node_modules" / Path(*name.split("/")))
        out.append(_nm_pkg(host, name))
    # 3) 常见 AppData 路径
    appdata = os.environ.get("APPDATA") or ""
    if appdata:
        nest = Path(appdata) / "npm" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules"
        out.append(nest.joinpath(*name.split("/")))
    # 去重
    seen = set()
    uniq: List[Path] = []
    for p in out:
        k = str(p)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)
    return uniq


def find_source(profile: Path, name: str) -> Optional[Path]:
    for cand in source_candidates(profile, name):
        if _ok_pkg(cand):
            return cand
    return None


def ensure_one(profile: Path, name: str, *, do_fix: bool) -> dict:
    dest = _nm_pkg(profile, name)
    row = {
        "pkg": name,
        "dest": str(dest),
        "ok": _ok_pkg(dest),
        "source": None,
        "fixed": False,
        "note": "",
    }
    src = find_source(profile, name)
    if row["ok"]:
        have = _pkg_ver(dest)
        # 一体包宿主升级后，profile 里旧的 0.1.x 会挡住 0.2 宿主启动（webStartup 起不来）。
        if src is not None and _ok_pkg(src):
            want = _pkg_ver(src)
            if want != "?" and have != want:
                row["source"] = str(src)
                if not do_fix:
                    row["ok"] = False
                    row["note"] = f"版本过旧 {have}，宿主是 {want}"
                    return row
                dest.parent.mkdir(parents=True, exist_ok=True)
                remove_link_or_move(dest)
                link_dir(dest, src)
                row["ok"] = _ok_pkg(dest)
                row["fixed"] = row["ok"]
                row["note"] = (
                    f"已从 {have} 升到 {want} → {src}"
                    if row["ok"]
                    else f"升级后仍不可用: {dest}"
                )
                return row
        row["note"] = f"已存在 {have}"
        return row
    if src is None:
        row["note"] = "找不到完整源包（请先 npm i -g @deepseek-ai/dsh）"
        return row
    row["source"] = str(src)
    if not do_fix:
        row["note"] = f"缺失，可从 {src} 恢复"
        return row
    dest.parent.mkdir(parents=True, exist_ok=True)
    remove_link_or_move(dest)
    link_dir(dest, src)
    row["ok"] = _ok_pkg(dest)
    row["fixed"] = row["ok"]
    row["note"] = (
        f"已链接 → {src} ({_pkg_ver(src)})"
        if row["ok"]
        else f"链接后仍不可用: {dest}"
    )
    return row


def _pkg_ver(path: Path) -> str:
    try:
        return str(json.loads((path / "package.json").read_text(encoding="utf-8")).get("version") or "?")
    except (OSError, json.JSONDecodeError, TypeError):
        return "?"


def ensure_dsh_core_bundles(profile: Path, *, do_fix: bool = False) -> dict:
    profile = profile.expanduser().resolve()
    notes: List[str] = []
    rows = []
    for name in CORE_PKGS:
        row = ensure_one(profile, name, do_fix=do_fix)
        rows.append(row)
        notes.append(f"{name}: {row['note']}")
    ok = all(r["ok"] for r in rows)
    return {
        "profile": str(profile),
        "ok": ok,
        "fixed": any(r["fixed"] for r in rows),
        "rows": rows,
        "notes": notes,
    }


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="恢复 dsh-base / dsh-web-app 到 profile node_modules")
    ap.add_argument("profile", type=Path)
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--require", action="store_true")
    args = ap.parse_args(list(argv) if argv is not None else None)
    report = ensure_dsh_core_bundles(args.profile, do_fix=args.fix)
    for n in report["notes"]:
        print(n)
    if report["ok"]:
        print("OK dsh core bundles")
        return 0
    print("NEED_CORE_BUNDLES", file=sys.stderr)
    if args.require:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
