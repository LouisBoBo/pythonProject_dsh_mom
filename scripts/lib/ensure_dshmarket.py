#!/usr/bin/env python3
"""WorkBuddy 预装社区包 dshmarket：设置里才会出现「插件市场」。

裸 `dsh web` 初始化的 profile 只有 dsh-base / dsh-web-app，没有 dshmarket。
第一次接线（host.sh wire / up / start-web / plugin.sh install bridge / 桌面包）
必须登记 dependencies + bundles，并装进 node_modules（client/client.js）。

环境变量（可选）：
  WORKBUDDY_MARKET_PKG      默认 dshmarket
  WORKBUDDY_MARKET_VERSION  默认 1.66.38（与 package_desktop.py MARKET_VER 对齐；须 peer 当前 DSH）
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

MARKET_PKG = os.environ.get("WORKBUDDY_MARKET_PKG", "dshmarket").strip() or "dshmarket"
MARKET_VERSION = os.environ.get("WORKBUDDY_MARKET_VERSION", "1.66.38").strip() or "1.66.38"


def _installed_pkg_json(profile: Path) -> Path:
    return profile / "node_modules" / MARKET_PKG / "package.json"


def installed_version(profile: Path) -> str:
    pkg_json = _installed_pkg_json(profile)
    if not pkg_json.is_file():
        return ""
    try:
        return str(json.loads(pkg_json.read_text(encoding="utf-8")).get("version") or "")
    except (OSError, json.JSONDecodeError):
        return ""


def version_matches(profile: Path) -> bool:
    """已落地但 package.json 没有 version 时不判失败（单测夹具）。有版本号则必须等于钉选。"""
    got = installed_version(profile)
    return not got or got == MARKET_VERSION


def package_installed(profile: Path) -> bool:
    pkg_json = _installed_pkg_json(profile)
    client = profile / "node_modules" / MARKET_PKG / "client" / "client.js"
    return pkg_json.is_file() and client.is_file() and version_matches(profile)


def profile_ready(profile: Path) -> tuple[bool, str]:
    """dependencies + bundles + 已落地 client.js 才算设置页能出「插件市场」。"""
    pkg_path = profile / "package.json"
    if not pkg_path.is_file():
        return False, f"缺少 {pkg_path}"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    deps = pkg.get("dependencies") or {}
    bundles = list(((pkg.get("dsh") or {}).get("profile") or {}).get("bundles") or [])
    if MARKET_PKG not in deps:
        return False, "package.json 未登记 dshmarket 依赖"
    if MARKET_PKG not in bundles:
        return False, "dsh.profile.bundles 未含 dshmarket"
    client = profile / "node_modules" / MARKET_PKG / "client" / "client.js"
    if not (_installed_pkg_json(profile).is_file() and client.is_file()):
        return False, "node_modules/dshmarket/client/client.js 不存在（设置里不会有插件市场）"
    if not version_matches(profile):
        got = installed_version(profile)
        return False, f"dshmarket 已落地 {got}，需要 {MARKET_VERSION}（与当前 DSH 对齐）"
    return True, f"dshmarket 已安装 {deps.get(MARKET_PKG)}"


def _ensure_package_json(pkg_path: Path) -> str:
    if not pkg_path.is_file():
        return f"跳过：缺少 {pkg_path}"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    deps = pkg.setdefault("dependencies", {})
    dsh = pkg.setdefault("dsh", {})
    profile = dsh.setdefault("profile", {})
    bundles = list(profile.get("bundles") or [])
    changed = False
    notes: list[str] = []
    want = MARKET_VERSION
    cur = deps.get(MARKET_PKG)
    if cur != want:
        deps[MARKET_PKG] = want
        changed = True
        if cur:
            notes.append(f"已把 {MARKET_PKG} 从 {cur} 调到 {want}")
        else:
            notes.append(f"已登记依赖 {MARKET_PKG}@{want}")
    if MARKET_PKG not in bundles:
        bundles.append(MARKET_PKG)
        changed = True
        notes.append(f"已登记 bundles {MARKET_PKG}")
    profile["bundles"] = bundles
    if changed:
        pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return "；".join(notes) if notes else f"已登记 {MARKET_PKG}"
    return f"{MARKET_PKG} 已在 dependencies/bundles"


def ensure_dshmarket(profile: Path) -> dict:
    profile = profile.expanduser().resolve()
    notes = [_ensure_package_json(profile / "package.json")]
    installed = package_installed(profile)
    ready, ready_msg = profile_ready(profile)
    notes.append(ready_msg)
    return {
        "profile": str(profile),
        "pkg": MARKET_PKG,
        "version": MARKET_VERSION,
        "installed": installed,
        "need_install": not installed,
        "ready": ready,
        "notes": notes,
    }


def main() -> int:
    args = [a for a in sys.argv[1:] if a]
    require = False
    paths: list[str] = []
    for a in args:
        if a in ("--require", "--check"):
            require = True
        elif a.startswith("-"):
            print(f"未知参数: {a}", file=sys.stderr)
            return 2
        else:
            paths.append(a)
    if len(paths) != 1:
        print(
            f"用法: ensure_dshmarket.py [--require] <profile-dir>\n"
            f"预装 {MARKET_PKG}@{MARKET_VERSION}（设置 → 插件市场）\n"
            f"--require：未落地 client.js 则 exit 1（wire/up/verify 硬门禁）",
            file=sys.stderr,
        )
        return 2
    profile = Path(paths[0]).expanduser().resolve()
    result = ensure_dshmarket(profile)
    for n in result["notes"]:
        print(n)
    if result["need_install"]:
        print(f"NEED_INSTALL {MARKET_PKG}@{MARKET_VERSION}")
    else:
        print(f"已安装 {MARKET_PKG}")
    if require and not result["ready"]:
        print(
            "LOCKED：第一次接线必须装上 dshmarket，否则 3081 设置里没有「插件市场」。",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
