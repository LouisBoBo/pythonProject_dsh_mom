#!/usr/bin/env python3
"""自检 WorkBuddy 聊天壳：3081 + ~/.dsh + mes-bridge + 工作区非空。"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WB_PORT = int(os.environ.get("WORKBUDDY_WEB_PORT", "3081"))
OFF_PORT = int(os.environ.get("OFFICIAL_WEB_PORT", "3080"))
DSH_HOME = Path(os.environ.get("DSH_HOME", Path.home() / ".dsh")).expanduser()
PROFILE = DSH_HOME / "profiles" / "web"
LOG = ROOT / "tmp" / f"host-web-{WB_PORT}.log"


def workspace_count(home: Path) -> int:
    ws = home / "storages" / "workspace.json"
    if not ws.is_file():
        return 0
    data = json.loads(ws.read_text(encoding="utf-8"))
    return len((data.get("global") or {}).get("workspaceIds") or [])


def profile_has_bridge() -> bool:
    pkg = PROFILE / "package.json"
    if not pkg.is_file():
        return False
    deps = (json.loads(pkg.read_text(encoding="utf-8")).get("dependencies") or {})
    return any("dsh-mes-bridge" in k for k in deps)


def log_has_bridge() -> bool:
    if not LOG.is_file():
        return False
    return "[mes-bridge]" in LOG.read_text(encoding="utf-8", errors="replace")


def http_ok(port: int) -> bool:
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=4) as r:
            return 200 <= r.status < 400
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def main() -> int:
    ok = True
    print(f"=== WorkBuddy 自检 (:{WB_PORT} / DSH_HOME={DSH_HOME}) ===")

    if not profile_has_bridge():
        print(f"FAIL: {PROFILE}/package.json 未安装 @dsh-external/dsh-mes-bridge", file=sys.stderr)
        ok = False
    else:
        print("OK: profile 已接线 mes-bridge")

    try:
        sys.path.insert(0, str(ROOT / "scripts" / "lib"))
        from ensure_runtime import check_runtime, print_report

        report = check_runtime(do_fix=False, profile=PROFILE, dsh_home=DSH_HOME)
        print_report(report)
        if not report.ok:
            print("FAIL: 运行时依赖门禁未通过（新机缺包 / zod dist / dsh-tools 等）", file=sys.stderr)
            ok = False
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: 无法检查运行时依赖：{type(exc).__name__}", file=sys.stderr)
        ok = False

    n = workspace_count(DSH_HOME)
    if n < 1:
        print(f"FAIL: {DSH_HOME}/storages/workspace.json 工作区为空（会像全新官方壳）", file=sys.stderr)
        ok = False
    else:
        print(f"OK: 工作区数量 {n}")

    if not http_ok(WB_PORT):
        print(f"FAIL: http://127.0.0.1:{WB_PORT}/ 不可达", file=sys.stderr)
        ok = False
    else:
        print(f"OK: :{WB_PORT} HTTP 可达")

    if not log_has_bridge():
        print(f"FAIL: 日志未见 [mes-bridge] → {LOG}", file=sys.stderr)
        ok = False
    else:
        print(f"OK: 日志已加载 mes-bridge ({LOG.name})")

    engine_ok = False
    engine_port = int(os.environ.get("APP_ENGINE_PORT") or 8000)
    try:
        sys.path.insert(0, str(ROOT / "scripts" / "lib"))
        from read_runtime import read_runtime

        engine_port = int(read_runtime(str(ROOT / "apps" / "zr-workbuddy" / "engine")).get("port") or engine_port)
    except Exception:  # noqa: BLE001
        pass
    engine_base = f"http://127.0.0.1:{engine_port}"
    try:
        with urllib.request.urlopen(f"{engine_base}/api/runtime", timeout=4) as r:
            body = json.loads(r.read().decode("utf-8", errors="replace") or "{}")
        if body.get("ok") and body.get("tools_ready") is False:
            print("FAIL: 引擎 /api/runtime tools_ready=false（工具模块导入失败，换机常见 POSIX 假定）", file=sys.stderr)
            ok = False
        elif body.get("ok"):
            print(f"OK: 引擎 {engine_base}/api/runtime tools_ready")
            engine_ok = True
        else:
            print("FAIL: 引擎 /api/runtime 非 ok", file=sys.stderr)
            ok = False
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: 引擎 {engine_base}/api/runtime 不可达（{type(exc).__name__}）", file=sys.stderr)
        ok = False

    if engine_ok:
        try:
            req = urllib.request.Request(
                f"{engine_base}/api/cli",
                data=json.dumps({"cmd": "code-review-status", "args": []}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                cli_status = r.status
                cli = json.loads(r.read().decode("utf-8", errors="replace") or "{}")
            if cli_status != 200 or not cli.get("ok"):
                print("FAIL: 审码 CLI 未就绪（工具调用仍会 500）", file=sys.stderr)
                ok = False
            else:
                print("OK: 审码 CLI code-review-status")
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
            print(f"FAIL: 审码 CLI 调用失败（{type(exc).__name__}）", file=sys.stderr)
            ok = False

    if http_ok(OFF_PORT) and log_has_bridge():
        off_log = ROOT / "tmp" / f"host-web-{OFF_PORT}.log"
        if off_log.is_file() and "[mes-bridge]" in off_log.read_text(encoding="utf-8", errors="replace"):
            print(f"WARN: :{OFF_PORT} 也在跑 mes-bridge，请 scripts/host.sh fix-ports", file=sys.stderr)

    if ok:
        print(f"通过 → 请开 http://127.0.0.1:{WB_PORT} ，设置里应有「WorkBuddy」页")
        return 0
    print("未通过 → scripts/host.sh fix-ports", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
