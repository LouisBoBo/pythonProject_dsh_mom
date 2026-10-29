"""步骤 6：按计划 / 配置执行验证命令（只读 subprocess，不改四车道）。"""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

from ..code_dev.workspace import validate_workspace
from .config import get_config


def _redact(text: str, limit: int = 4000) -> str:
    s = (text or "").strip()
    if len(s) <= limit:
        return s
    return s[:limit] + "\n…（输出已截断）"


def _npm_scripts_cmds(root: Path, rel: str) -> list[dict[str, str]]:
    """从 package.json scripts 取 test / lint；rel 为空表示仓库根。"""
    pkg = root / "package.json" if not rel else root / rel / "package.json"
    if not pkg.is_file():
        return []
    try:
        scripts = (json.loads(pkg.read_text(encoding="utf-8")) or {}).get("scripts") or {}
    except Exception:
        return []
    if not isinstance(scripts, dict):
        return []
    prefix = f"{rel.replace(chr(92), '/')}-" if rel else ""
    cwd = rel.replace("\\", "/") if rel else "."
    out: list[dict[str, str]] = []
    if "test" in scripts:
        out.append(
            {
                "name": f"{prefix}npm-test",
                "cmd": "npm test --if-present",
                "cwd": cwd,
            }
        )
    elif "lint" in scripts:
        out.append(
            {
                "name": f"{prefix}npm-lint",
                "cmd": "npm run lint --if-present",
                "cwd": cwd,
            }
        )
    return out


def _auto_validate_commands(root: Path) -> list[dict[str, str]]:
    """未配置 validate_commands 时自动探测；探不到由调用方标「未验证」，禁止假绿。"""
    cmds: list[dict[str, str]] = []

    # Node：根 + 常见前后端子目录
    for rel in ("", "frontend", "client", "web", "backend", "server", "app"):
        cmds.extend(_npm_scripts_cmds(root, rel))

    # Python：pytest / compileall（根或 backend/src/app）
    pyproject = root / "pyproject.toml"
    pytest_ini = root / "pytest.ini"
    has_pytest = pytest_ini.is_file()
    if pyproject.is_file():
        try:
            low = pyproject.read_text(encoding="utf-8", errors="ignore").lower()
            if "pytest" in low:
                has_pytest = True
        except OSError:
            pass
    if has_pytest:
        be = "backend" if (root / "backend").is_dir() else "."
        cmds.append({"name": "pytest", "cmd": "python -m pytest -q", "cwd": be})
    else:
        for rel in ("", "src", "app", "backend", "server"):
            d = root if not rel else root / rel
            if not d.is_dir():
                continue
            try:
                has_py = any(d.glob("*.py")) or any(d.rglob("*.py"))
            except OSError:
                has_py = False
            if has_py:
                target = "." if not rel else rel.replace("\\", "/")
                cmds.append(
                    {
                        "name": f"py-compile-{rel or 'root'}",
                        "cmd": f"python -m compileall -q {target}",
                        "cwd": ".",
                    }
                )
                break

    if (root / "pom.xml").is_file():
        cmds.append({"name": "mvn-test", "cmd": "mvn -q test", "cwd": "."})
    if (root / "go.mod").is_file():
        cmds.append({"name": "go-test", "cmd": "go test ./...", "cwd": "."})

    if (root / ".git").is_file() or (root / ".git" / "HEAD").is_file():
        cmds.append({"name": "git-diff-check", "cmd": "git diff --check", "cwd": "."})

    seen: set[str] = set()
    out: list[dict[str, str]] = []
    for c in cmds:
        n = str(c.get("name") or "")
        if not n or n in seen:
            continue
        seen.add(n)
        out.append(c)
    return out[:6]


def run_validate_commands(
    workspace: str,
    *,
    timeout_sec: int | None = None,
) -> dict[str, Any]:
    """返回 {ok, results[], summary}；探不到检查项时 unverified，禁止轻量假绿。"""
    cfg = get_config()
    commands = cfg.get("validate_commands") or []
    if not isinstance(commands, list):
        commands = []
    check = validate_workspace(workspace or "")
    ws = str(check.get("path") or "").strip()
    if not check.get("ok"):
        err = str(check.get("error") or "workspace 无效，无法执行验证")
        reason = "no_workspace" if not (workspace or "").strip() else "bad_workspace"
        return {
            "ok": False,
            "reason": reason,
            "summary": err,
            "results": [],
        }
    root = Path(ws)
    used_auto = False
    used_profile = False
    if not commands:
        try:
            from ..project_profile import ensure as ensure_project_profile

            got = ensure_project_profile(ws)
            profile = got.get("profile") if isinstance(got, dict) else None
            profile_cmds = (profile or {}).get("validate_commands") if isinstance(profile, dict) else None
            if isinstance(profile_cmds, list) and profile_cmds:
                commands = profile_cmds
                used_profile = True
        except Exception:  # noqa: BLE001
            commands = []
    if not commands:
        commands = _auto_validate_commands(root)
        used_auto = bool(commands)
        if not commands:
            # 仓库无可探测检查：诚实标「未验证」，禁止当成通过
            return {
                "ok": False,
                "unverified": True,
                "skipped": True,
                "reason": "validate_unverified",
                "summary": "未配置 validate_commands 且无自动探测项，本步标为未验证（请在 config.yaml 或仓库内补齐测试/lint）",
                "results": [],
                "auto_defaults": False,
            }
    default_timeout = int(cfg.get("validate_timeout_sec") or 600)
    tout = max(5, int(timeout_sec or default_timeout))
    results: list[dict[str, Any]] = []
    all_ok = True
    for i, item in enumerate(commands):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or f"cmd_{i + 1}")
        cmd = str(item.get("cmd") or "").strip()
        if not cmd:
            continue
        cwd_rel = str(item.get("cwd") or item.get("cwd_relative") or "").strip()
        cwd = root
        if cwd_rel and cwd_rel not in (".", "./"):
            cand = (root / cwd_rel).resolve()
            try:
                cand.relative_to(root.resolve())
            except ValueError:
                results.append(
                    {
                        "name": name,
                        "cmd": cmd,
                        "exit_code": -1,
                        "ok": False,
                        "stderr": "cwd 越权",
                    }
                )
                all_ok = False
                continue
            cwd = cand
        started = time.time()
        try:
            proc = subprocess.run(
                cmd,
                shell=True,
                cwd=str(cwd),
                capture_output=True,
                text=True,
                timeout=tout,
                env={**os.environ, "CI": "1"},
            )
            code = int(proc.returncode)
            ok = code == 0
            if not ok:
                all_ok = False
            results.append(
                {
                    "name": name,
                    "cmd": cmd,
                    "cwd": str(cwd),
                    "exit_code": code,
                    "ok": ok,
                    "stdout": _redact(proc.stdout or ""),
                    "stderr": _redact(proc.stderr or ""),
                    "duration_sec": round(time.time() - started, 2),
                }
            )
        except subprocess.TimeoutExpired:
            all_ok = False
            results.append(
                {
                    "name": name,
                    "cmd": cmd,
                    "exit_code": -1,
                    "ok": False,
                    "stderr": f"超时（>{tout}s）",
                }
            )
        except OSError as e:
            all_ok = False
            results.append(
                {
                    "name": name,
                    "cmd": cmd,
                    "exit_code": -1,
                    "ok": False,
                    "stderr": str(e),
                }
            )

    if not results and commands:
        return {
            "ok": False,
            "summary": "validate_commands 未解析到可执行项",
            "results": [],
            "reason": "empty_commands",
        }
    summary = "全部通过" if all_ok else "存在失败命令"
    if used_profile and all_ok:
        summary = "自动验证通过（按当前工作区项目画像中的测试/lint 命令）"
    elif used_auto and all_ok:
        summary = "自动验证通过（未手写 validate_commands，已探测默认检查）"
    return {
        "ok": all_ok,
        "summary": summary,
        "results": results,
        "auto_defaults": used_auto,
        "used_profile": used_profile,
    }
