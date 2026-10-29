#!/usr/bin/env python3
"""检查已装 npm 包的入口文件是否真实存在。

换机后 pnpm 常装到残包（zod@3.25.0 无 dist、exports 指向不存在的文件），
package.json 在、import 一跑就 ERR_MODULE_NOT_FOUND。启动前必须把这种洞拦掉。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

# 声明了这些包时，除 package.json / exports 外还必须有的相对路径
EXTRA_FILES: Dict[str, Tuple[str, ...]] = {
    "dshmarket": ("client/client.js",),
    "@cursor/sdk": ("dist/esm/index.js",),
    "zod": ("dist/esm/index.js",),
    "@deepseek-ai/dsh-tools": ("package.json",),
}


def _as_rel(value: str) -> str:
    text = (value or "").strip().replace("\\", "/")
    while text.startswith("./"):
        text = text[2:]
    return text.lstrip("/")


def _from_export_map(node: Any) -> str:
    if isinstance(node, str):
        return _as_rel(node)
    if not isinstance(node, dict):
        return ""
    for key in ("import", "default", "require", "node", "browser"):
        nested = node.get(key)
        found = _from_export_map(nested)
        if found:
            return found
    return ""


def package_entry_rel(data: Dict[str, Any]) -> str:
    """从 package.json 推出应存在的主入口相对路径。"""
    exports = data.get("exports")
    if isinstance(exports, str):
        return _as_rel(exports)
    if isinstance(exports, dict):
        for key in (".", "import", "default", "require"):
            found = _from_export_map(exports.get(key))
            if found:
                return found
        found = _from_export_map(exports)
        if found:
            return found
    for field in ("module", "main"):
        raw = data.get(field)
        if isinstance(raw, str) and raw.strip():
            return _as_rel(raw)
    return ""


def pkg_dir(node_modules: Path, spec: str) -> Path:
    parts = [p for p in spec.replace("\\", "/").split("/") if p and p != "."]
    return node_modules.joinpath(*parts)


def check_pkg_dir(
    directory: Path,
    *,
    extra: Sequence[str] = (),
) -> Dict[str, Any]:
    """检查单个包目录：package.json + 入口 + extra 文件。"""
    directory = Path(directory)
    report: Dict[str, Any] = {
        "path": str(directory),
        "ok": False,
        "entry": "",
        "missing": [],
        "detail": "",
    }
    pj = directory / "package.json"
    if not pj.is_file():
        report["missing"] = ["package.json"]
        report["detail"] = f"缺少 {pj}"
        return report
    try:
        data = json.loads(pj.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        report["detail"] = f"package.json 无法解析: {exc}"
        report["missing"] = ["package.json"]
        return report
    if not isinstance(data, dict):
        report["detail"] = "package.json 不是对象"
        report["missing"] = ["package.json"]
        return report

    missing: List[str] = []
    entry = package_entry_rel(data)
    report["entry"] = entry
    if entry:
        target = directory.joinpath(*entry.split("/"))
        if not target.is_file():
            missing.append(entry)
    for rel in extra:
        rel_n = _as_rel(rel)
        if not rel_n or rel_n == entry:
            continue
        if not directory.joinpath(*rel_n.split("/")).is_file():
            missing.append(rel_n)
    report["missing"] = missing
    if missing:
        report["detail"] = "缺文件: " + ", ".join(missing)
        return report
    report["ok"] = True
    report["detail"] = f"入口就绪 {entry or 'package.json'}"
    return report


def declared_packages(profile: Path) -> List[str]:
    pj = Path(profile) / "package.json"
    if not pj.is_file():
        return []
    try:
        data = json.loads(pj.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    deps = data.get("dependencies") or {}
    if not isinstance(deps, dict):
        return []
    return [str(k) for k in deps.keys() if str(k).strip()]


def scan_profile(
    profile: Path,
    *,
    extra_files: Optional[Dict[str, Sequence[str]]] = None,
    only: Optional[Iterable[str]] = None,
) -> List[Dict[str, Any]]:
    """扫描 profile 已声明依赖的入口完整性。"""
    profile = Path(profile)
    nm = profile / "node_modules"
    extras = extra_files if extra_files is not None else EXTRA_FILES
    names = list(only) if only is not None else declared_packages(profile)
    rows: List[Dict[str, Any]] = []
    seen = set()
    for spec in names:
        if spec in seen:
            continue
        seen.add(spec)
        extra = tuple(extras.get(spec) or ())
        row = check_pkg_dir(pkg_dir(nm, spec), extra=extra)
        row["spec"] = spec
        rows.append(row)
    return rows


def critical_failures(rows: Sequence[Dict[str, Any]], *, critical: Sequence[str]) -> List[Dict[str, Any]]:
    want = set(critical)
    return [r for r in rows if r.get("spec") in want and not r.get("ok")]
