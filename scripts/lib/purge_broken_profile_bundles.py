#!/usr/bin/env python3
"""剔除 profile bundles 中「未装好 / 缺 client」的包，防止宿主整页 Failed to load plugins。

事故根因（2026-09-27）：
  bundles 挂了 @zhongruan/dsh-knowledge，但 node_modules 无包或 client.js 404
  → 浏览器白屏/卡死「HARNESS Failed to load plugins」。

策略：
  - 核心包（base / web-app / dshmarket / mes-bridge）残缺 → 只报错，不擅自踢（启动应失败）
  - 其它 bundles（尤其 @zhongruan/*）残缺 → 从 bundles 剔除并写回 package.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from npm_pkg_integrity import _as_rel, _from_export_map, check_pkg_dir, pkg_dir  # noqa: E402

# 残缺时禁止静默踢出（缺了应拒绝启动）
CRITICAL_BUNDLES = frozenset(
    {
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dshmarket",
        "@dsh-external/dsh-mes-bridge",
    }
)


def _load_pkg(profile: Path) -> Tuple[Optional[Dict[str, Any]], Path]:
    path = profile / "package.json"
    if not path.is_file():
        return None, path
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None, path
    if not isinstance(data, dict):
        return None, path
    return data, path


def _bundles(pkg: Dict[str, Any]) -> List[str]:
    dsh = pkg.get("dsh") if isinstance(pkg.get("dsh"), dict) else {}
    profile = dsh.get("profile") if isinstance(dsh.get("profile"), dict) else {}
    raw = profile.get("bundles")
    if not isinstance(raw, list):
        return []
    return [str(x) for x in raw if str(x).strip()]


def _set_bundles(pkg: Dict[str, Any], bundles: Sequence[str]) -> None:
    dsh = pkg.setdefault("dsh", {})
    if not isinstance(dsh, dict):
        pkg["dsh"] = {}
        dsh = pkg["dsh"]
    profile = dsh.setdefault("profile", {})
    if not isinstance(profile, dict):
        dsh["profile"] = {}
        profile = dsh["profile"]
    profile["bundles"] = list(bundles)


def client_files_ok(directory: Path, data: Dict[str, Any]) -> Tuple[bool, str]:
    dsh = data.get("dsh")
    if not isinstance(dsh, dict) or not dsh.get("client"):
        return True, "无 client"
    exports = data.get("exports")
    candidates: List[str] = []
    if isinstance(exports, dict):
        found = _from_export_map(exports.get("./client"))
        if found:
            candidates.append(found)
    candidates.extend(["client.js", "lib/client.js", "client/client.js"])
    seen = set()
    for rel in candidates:
        rel_n = _as_rel(rel)
        if not rel_n or rel_n in seen:
            continue
        seen.add(rel_n)
        if directory.joinpath(*rel_n.split("/")).is_file():
            return True, rel_n
    return False, "缺 client 入口（exports./client 或 client.js）"


def bundle_health(profile: Path, spec: str) -> Dict[str, Any]:
    """单个 bundle 是否可被宿主安全加载。"""
    directory = pkg_dir(profile / "node_modules", spec)
    row = check_pkg_dir(directory)
    out: Dict[str, Any] = {
        "spec": spec,
        "ok": False,
        "critical": spec in CRITICAL_BUNDLES,
        "detail": "",
        "path": str(directory),
    }
    if not row.get("ok"):
        out["detail"] = str(row.get("detail") or "包不完整")
        return out
    try:
        data = json.loads((directory / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        out["detail"] = f"package.json 无法解析: {exc}"
        return out
    if not isinstance(data, dict):
        out["detail"] = "package.json 不是对象"
        return out
    ok_client, client_detail = client_files_ok(directory, data)
    if not ok_client:
        out["detail"] = client_detail
        return out
    out["ok"] = True
    out["detail"] = f"就绪 ({client_detail if client_detail != '无 client' else row.get('detail')})"
    return out


def purge_broken_profile_bundles(
    profile: Path,
    *,
    fix: bool = True,
) -> Dict[str, Any]:
    """扫描 bundles：可选包残缺则踢出；核心包残缺则标记 fatal。"""
    profile = profile.expanduser().resolve()
    pkg, pkg_path = _load_pkg(profile)
    result: Dict[str, Any] = {
        "profile": str(profile),
        "ok": True,
        "fixed": False,
        "removed": [],
        "fatal": [],
        "checked": [],
        "notes": [],
    }
    if pkg is None:
        result["ok"] = False
        result["fatal"].append(f"缺少或无法解析 {pkg_path}")
        return result

    bundles = _bundles(pkg)
    if not bundles:
        result["notes"].append("bundles 为空，跳过")
        return result

    keep: List[str] = []
    removed: List[str] = []
    fatal: List[str] = []
    for spec in bundles:
        health = bundle_health(profile, spec)
        result["checked"].append(health)
        if health["ok"]:
            keep.append(spec)
            continue
        detail = f"{spec}: {health['detail']}"
        if health["critical"]:
            fatal.append(detail)
            keep.append(spec)  # 不踢核心包，留给上层拒绝启动
        else:
            removed.append(detail)

    if fatal:
        result["ok"] = False
        result["fatal"] = fatal
        result["notes"].append("核心 bundle 残缺，拒绝静默剔除")

    if removed:
        result["removed"] = removed
        if fix:
            _set_bundles(pkg, keep)
            pkg_path.write_text(
                json.dumps(pkg, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            result["fixed"] = True
            result["notes"].append(
                "已从 bundles 剔除残包（防整页 Failed to load plugins）: "
                + "; ".join(removed)
            )
        else:
            result["ok"] = False
            result["notes"].append("发现残包但未 --fix: " + "; ".join(removed))

    if not fatal and not removed:
        result["notes"].append(f"bundles 齐全（{len(bundles)}）")
    return result


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="剔除残缺 profile bundles，防宿主整页卡死")
    ap.add_argument("profile", type=Path, help="profile 目录（如 ~/.dsh/profiles/web）")
    ap.add_argument("--fix", action="store_true", help="自动从 bundles 踢出可选残包")
    ap.add_argument("--require", action="store_true", help="有 fatal/未修残包则 exit 1")
    args = ap.parse_args(list(argv) if argv is not None else None)
    report = purge_broken_profile_bundles(args.profile, fix=args.fix)
    for note in report.get("notes") or []:
        print(note)
    for item in report.get("removed") or []:
        print(f"REMOVED {item}")
    for item in report.get("fatal") or []:
        print(f"FATAL {item}", file=sys.stderr)
    if args.require and not report.get("ok"):
        print(
            "LOCKED：profile bundles 含不可加载包。先 --fix 踢可选残包，或重装核心包。",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
