#!/usr/bin/env python3
"""新机启动统一依赖门禁。

host.sh / plugin.sh / 桌面 / engine_ctl 启动前必须 --fix --require。
能自动修的修（pip、dsh-tools junction、zod dist、Key 同步）；修不了的拒绝启动。
不改用量口径，不改 DSH 插件源码。
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Sequence

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from win_hide import install as _hide_windows_console  # noqa: E402

_hide_windows_console()

from align_dsh_tools import align_all, find_host_tools  # noqa: E402
from ensure_cursor_chat_align import ensure_cursor_chat_align  # noqa: E402
from ensure_cursor_chat_sidecar import (  # noqa: E402
    PKG_NAME as CURSOR_CHAT_PKG,
    ensure_cursor_chat_sidecar,
    find_pkg_dir as find_cursor_chat_pkg,
)
from ensure_cursor_sdk_zod import ensure_cursor_sdk_zod  # noqa: E402
from ensure_company_knowledge import ensure_company_knowledge  # noqa: E402
from ensure_local_user_manual import ensure_local_user_manual  # noqa: E402
from ensure_dsh_deepseek_credential import ensure_dsh_deepseek_credential  # noqa: E402
from ensure_dshmarket import ensure_dshmarket, profile_ready as dshmarket_ready  # noqa: E402
from find_python import ENGINE_MODULES, _can_import, find_python  # noqa: E402
from py_modules_stamp import modules_stamp_covers  # noqa: E402
from npm_pkg_integrity import EXTRA_FILES, check_pkg_dir, pkg_dir, scan_profile  # noqa: E402
from ensure_dsh_knowledge import (  # noqa: E402
    assert_kb_peers_ready,
    ensure_dsh_knowledge,
    package_installed as kb_package_installed,
    repair_kb_peers,
)
from ensure_dsh_core_bundles import ensure_dsh_core_bundles  # noqa: E402
from purge_broken_profile_bundles import purge_broken_profile_bundles  # noqa: E402
from verify_company_dsh_market import _home_env_locked  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "apps" / "zr-workbuddy" / "engine"
ENGINE_REQ = ENGINE / "requirements.txt"
BRIDGE = ROOT / "apps" / "zr-workbuddy" / "plugins" / "mes-bridge"
CONFIG_YAML = ENGINE / "config" / "config.yaml"
# 与 ENGINE_MODULES 对齐：缺 numpy/pandas 时问数/状态会 ModuleNotFoundError
PY_MODULES = ENGINE_MODULES
CRITICAL_NPM = (
    "dshmarket",
    "@deepseek-ai/dsh-tools",
    "@dsh-external/dsh-mes-bridge",
    "@cursor/sdk",
    "zod",
    "@zhongruan/dsh-cursor-chat",
)
NODE_MIN_MAJOR = 22


@dataclass
class Probe:
    id: str
    required: bool
    ok: bool
    detail: str
    fixed: bool = False


@dataclass
class RuntimeReport:
    probes: List[Probe] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(p.ok for p in self.probes if p.required)

    def add(self, probe: Probe) -> Probe:
        self.probes.append(probe)
        return probe


def _dsh_home(explicit: Optional[Path] = None) -> Path:
    if explicit is not None:
        return Path(explicit).expanduser()
    return Path(os.environ.get("DSH_HOME") or (Path.home() / ".dsh")).expanduser()


def _profile(explicit: Optional[Path], home: Path) -> Path:
    if explicit is not None:
        return Path(explicit).expanduser()
    env_p = os.environ.get("DSH_PROFILE_DIR") or ""
    if env_p:
        return Path(env_p).expanduser()
    name = os.environ.get("DSH_PROFILE") or "web"
    p = Path(name)
    if p.is_absolute() or str(name).startswith("~"):
        return p.expanduser()
    return home / "profiles" / name


def _which_many(names: Sequence[str]) -> Optional[Path]:
    for name in names:
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def find_node() -> Optional[Path]:
    envn = os.environ.get("WORKBUDDY_HOST_NODE") or ""
    if envn and Path(envn).is_file():
        return Path(envn)
    found = _which_many(("node", "node.exe"))
    if found:
        return found
    home = Path.home()
    nvm = home / ".nvm" / "versions" / "node"
    if nvm.is_dir():
        for d in sorted(nvm.iterdir(), reverse=True):
            if not d.name.startswith("v"):
                continue
            for name in ("node.exe", "node"):
                cand = d / "bin" / name
                if cand.is_file():
                    return cand
    appdata = os.environ.get("APPDATA") or str(home / "AppData" / "Roaming")
    for cand in (
        Path(appdata) / "npm" / "node.exe",
        Path("/usr/local/bin/node"),
        Path("/opt/homebrew/bin/node"),
    ):
        if cand.is_file():
            return cand
    return None


def find_dsh() -> Optional[Path]:
    env_bin = os.environ.get("DSH_BIN") or os.environ.get("WORKBUDDY_DSH_BIN") or ""
    if env_bin and Path(env_bin).is_file():
        return Path(env_bin)
    found = _which_many(("dsh.cmd", "dsh.exe", "dsh"))
    if found is not None:
        if os.name == "nt" and found.suffix.lower() not in {".cmd", ".bat", ".exe"}:
            cmd = Path(str(found) + ".cmd")
            if cmd.is_file():
                return cmd
        return found
    home = Path.home()
    appdata = os.environ.get("APPDATA") or str(home / "AppData" / "Roaming")
    cands = [
        Path(appdata) / "npm" / "dsh.cmd",
        Path(appdata) / "npm" / "dsh",
        home / ".nvm" / "versions" / "node" / "v22.23.1" / "bin" / "dsh",
        home / ".nvm" / "versions" / "node" / "current" / "bin" / "dsh",
        Path("/usr/local/bin/dsh"),
    ]
    for cand in cands:
        if cand.is_file():
            return cand
    return None


def _node_major(node: Path) -> int:
    try:
        proc = subprocess.run(
            [str(node), "-p", "process.versions.node"],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return 0
    if proc.returncode != 0:
        return 0
    ver = (proc.stdout or "").strip().lstrip("v")
    try:
        return int(ver.split(".")[0])
    except ValueError:
        return 0


def _dsh_startable(dsh: Path) -> tuple[bool, str]:
    """Windows 不能 CreateProcess 无后缀 shebang；须有 .cmd 或 node+bin.js。"""
    suf = dsh.suffix.lower()
    if suf in {".cmd", ".bat", ".exe"}:
        return True, str(dsh)
    bin_js = dsh.parent / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
    node = find_node()
    if bin_js.is_file() and node is not None:
        return True, f"{dsh} → node {bin_js.name}"
    if os.name == "nt":
        cmd = Path(str(dsh) + ".cmd")
        if cmd.is_file():
            return True, str(cmd)
        return False, f"{dsh} 是 Unix shim，Windows 会 WinError 193；需要 dsh.cmd 或 node+bin.js"
    return True, str(dsh)


def _pip_install(py: str) -> tuple[bool, str]:
    if not ENGINE_REQ.is_file():
        return False, f"缺少 {ENGINE_REQ}"
    try:
        proc = subprocess.run(
            [py, "-m", "pip", "install", "-r", str(ENGINE_REQ)],
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"pip 安装失败: {type(exc).__name__}"
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip().splitlines()
        tail = err[-1] if err else f"exit {proc.returncode}"
        return False, f"pip install -r requirements.txt 失败: {tail}"
    return True, f"已安装 {ENGINE_REQ.name}"


def _probe_python(do_fix: bool) -> Probe:
    # 桌面冷启动：打包时已验证过的内嵌解释器不必再 import numpy/pandas。
    preferred = (os.environ.get("APP_ENGINE_PYTHON") or "").strip()
    if preferred and Path(preferred).is_file() and modules_stamp_covers(preferred, ENGINE_REQ, PY_MODULES):
        return Probe(
            "python",
            True,
            True,
            f"{preferred} + {', '.join(PY_MODULES)}（依赖戳记命中）",
        )
    # 优先：已带齐引擎依赖、且不是其它工程 .venv 的解释器
    py = find_python(
        need_modules=PY_MODULES,
        skip_foreign_venv=True,
        allow_under=ROOT,
        min_major=3,
        min_minor=10,
    ) or find_python(need_modules=PY_MODULES, min_major=3, min_minor=10)
    if py:
        return Probe("python", True, True, f"{py} + {', '.join(PY_MODULES)}")

    # 其次：系统/Framework Python（仍跳过外来 .venv），再 pip 装 requirements
    py = find_python(
        skip_foreign_venv=True,
        allow_under=ROOT,
        min_major=3,
        min_minor=10,
    ) or find_python(min_major=3, min_minor=10)
    if not py:
        return Probe(
            "python",
            True,
            False,
            "找不到 Python 3.10+。请安装并勾选 Add python.exe to PATH，或设 APP_ENGINE_PYTHON。",
        )
    missing = [m for m in PY_MODULES if not _can_import(py, m)]
    detail = f"{py} 缺模块: {', '.join(missing)}"
    if not do_fix:
        return Probe("python", True, False, detail + f"。修复: {py} -m pip install -r {ENGINE_REQ}")
    ok, msg = _pip_install(py)
    still = [m for m in PY_MODULES if not _can_import(py, m)]
    if ok and not still:
        return Probe("python", True, True, f"{py}；{msg}", fixed=True)
    return Probe(
        "python",
        True,
        False,
        f"{detail}；{msg}" + (f"；仍缺 {', '.join(still)}" if still else ""),
        fixed=True,
    )


def _probe_engine_boot() -> Probe:
    eng = str(ENGINE)
    if eng not in sys.path:
        sys.path.insert(0, eng)
    try:
        from app.boot_check import check_tool_runtime  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return Probe("engine_boot", True, False, f"无法导入 boot_check: {type(exc).__name__}: {exc}")
    result = check_tool_runtime()
    if result.get("ok"):
        return Probe("engine_boot", True, True, "os_lock / plugins_store / 审码模块可导入")
    errors = result.get("errors") or []
    return Probe("engine_boot", True, False, "；".join(str(x) for x in errors) or "boot_check 失败")


def _probe_credential(home: Path, do_fix: bool) -> Probe:
    if not CONFIG_YAML.is_file():
        return Probe("credential", False, True, f"尚无 {CONFIG_YAML.name}，保存 Key 后会自动同步")
    try:
        row = ensure_dsh_deepseek_credential(CONFIG_YAML, home) if do_fix else None
    except Exception as exc:  # noqa: BLE001
        return Probe("credential", False, True, f"Key 同步跳过: {type(exc).__name__}")
    if row is None:
        return Probe("credential", False, True, "未请求写入（检查模式）")
    action = str(row.get("action") or "skip")
    reason = str(row.get("reason") or "")
    return Probe("credential", False, True, f"{action}: {reason}".strip(": "), fixed=action in {"write", "overwrite"})


def _probe_company_knowledge(do_fix: bool) -> Probe:
    """公司共享知识库：种子 env 自动合并进 config.yaml（员工零手改）。

    未配置不挡启动（开发机可无中央库）；有种子且 fix 后仍缺 token 只告警。
    """
    try:
        res = ensure_company_knowledge(config_path=CONFIG_YAML, do_fix=do_fix)
    except Exception as exc:  # noqa: BLE001
        return Probe(
            "company_knowledge",
            False,
            True,
            f"合并跳过: {type(exc).__name__}: {exc}",
        )
    detail = str(res.get("detail") or "")
    if res.get("configured"):
        return Probe("company_knowledge", False, True, detail, fixed=bool(res.get("fixed")))
    # 未接入：告警级，不拒绝启动
    return Probe("company_knowledge", False, True, detail, fixed=bool(res.get("fixed")))


def _probe_local_user_manual(profile: Path, do_fix: bool) -> Probe:
    """本机默认知识库预置《用户操作手册》：打开即有，免上传。

    库文件尚未创建时只落 builtin 副本，不挡启动；知识库首次启动后再入库。
    """
    try:
        res = ensure_local_user_manual(profile=profile, do_fix=do_fix)
    except Exception as exc:  # noqa: BLE001
        return Probe(
            "local_user_manual",
            False,
            True,
            f"预置跳过: {type(exc).__name__}: {exc}",
        )
    detail = str(res.get("detail") or "")
    return Probe(
        "local_user_manual",
        False,
        True,
        detail,
        fixed=bool(res.get("changed") or res.get("pending_db")),
    )


def _probe_node() -> Probe:
    node = find_node()
    if node is None:
        return Probe("node", True, False, "找不到 Node。dsh 需要 Node 22+（不要用 Electron 的 20）。")
    major = _node_major(node)
    if major < NODE_MIN_MAJOR:
        return Probe("node", True, False, f"{node} 版本 {major} < {NODE_MIN_MAJOR}")
    return Probe("node", True, True, f"{node} v{major}")


def _probe_dsh() -> Probe:
    dsh = find_dsh()
    if dsh is None:
        return Probe("dsh", True, False, "PATH 无 dsh。请: npm i -g @deepseek-ai/dsh")
    ok, detail = _dsh_startable(dsh)
    return Probe("dsh", True, ok, detail)


def _probe_company_market(home: Path) -> Probe:
    ok, msg = _home_env_locked(home)
    return Probe("company_market", True, ok, msg)


def _try_pnpm_add(profile: Path, spec: str) -> str:
    pnpm = shutil.which("pnpm")
    if not pnpm:
        return "无 pnpm，无法自动装包"
    try:
        proc = subprocess.run(
            [pnpm, "add", spec],
            cwd=str(profile),
            capture_output=True,
            text=True,
            timeout=180,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"pnpm add 失败: {type(exc).__name__}"
    if proc.returncode != 0:
        return f"pnpm add {spec} exit {proc.returncode}"
    return f"已 pnpm add {spec}"


def _probe_dshmarket(profile: Path, do_fix: bool) -> Probe:
    if not (profile / "package.json").is_file():
        return Probe("dshmarket", True, False, f"缺少 {profile / 'package.json'}，请先初始化 profile 再 wire")
    notes = ensure_dshmarket(profile)
    ready, msg = dshmarket_ready(profile)
    fixed = False
    if not ready and do_fix and notes.get("need_install"):
        from ensure_dshmarket import MARKET_PKG, MARKET_VERSION

        extra = _try_pnpm_add(profile, f"{MARKET_PKG}@{MARKET_VERSION}")
        ready, msg = dshmarket_ready(profile)
        msg = f"{msg}；{extra}"
        fixed = True
    return Probe("dshmarket", True, ready, msg, fixed=fixed)


def _probe_dsh_tools(profile: Path, do_fix: bool) -> Probe:
    host = find_host_tools()
    report = align_all(do_fix=do_fix, require=True, profile_dir=profile, host=host)
    if not report.get("host"):
        return Probe("dsh_tools", True, False, "未找到宿主 dsh-tools（全球 npm 布局 / PATH 上的 dsh）")
    if report.get("ok"):
        return Probe("dsh_tools", True, True, f"已与宿主同源 {report.get('host')}", fixed=do_fix)
    bad = [i.get("detail") for i in (report.get("items") or []) if not i.get("ok")]
    return Probe("dsh_tools", True, False, "；".join(str(x) for x in bad) or "未对齐", fixed=do_fix)


def _probe_zod(profile: Path, do_fix: bool) -> Probe:
    try:
        report = ensure_cursor_sdk_zod(profile, do_fix=do_fix)
    except Exception as exc:  # noqa: BLE001 — 门禁不得把 traceback 抛给桌面启动
        return Probe("zod", True, False, f"补齐 zod dist 失败: {type(exc).__name__}: {exc}")
    needed = bool(report.get("needed"))
    ready = bool(report.get("ready"))
    detail = str(report.get("detail") or "")
    if not needed:
        return Probe("zod", False, True, detail)
    return Probe("zod", True, ready, detail, fixed=bool(report.get("fixed")))


def _probe_bridge_src() -> Probe:
    pj = BRIDGE / "package.json"
    idx = BRIDGE / "lib" / "index.js"
    if pj.is_file() and idx.is_file():
        return Probe("mes_bridge", True, True, str(BRIDGE))
    missing = [p.name for p in (pj, idx) if not p.is_file()]
    return Probe("mes_bridge", True, False, f"仓内 mes-bridge 缺 {', '.join(missing)}")


def _probe_cursor_chat_align(do_fix: bool) -> Probe:
    """对话写码与 coding 共用 Key；端口避开 automations:18789。"""
    res = ensure_cursor_chat_align(fix=do_fix)
    ok = bool(res.get("ok"))
    detail = str(res.get("detail") or "")
    # Key 未配 / 仍无效时不阻断整站启动（聊天壳可先开；写码在设置里补 Key）
    # 端口错乱（key_ready 已 true 但 ok 仍 false）仍算失败以便 --fix 修好
    if not res.get("key_ready"):
        return Probe(
            "cursor_chat_align",
            False,
            True,
            detail,
            fixed=bool(res.get("fixed")),
        )
    return Probe(
        "cursor_chat_align",
        True,
        ok,
        detail,
        fixed=bool(res.get("fixed")),
    )


def _probe_cursor_sidecar(home: Path, do_fix: bool) -> Probe:
    """唯一写码入口：已装对话写码时 :18791 sidecar 必须可探活（可自动拉起）。"""
    pkg = find_cursor_chat_pkg(home)
    if pkg is None:
        # 未装不挡整机启动；普通写码/流水线第 5 步会提示去装
        return Probe(
            "cursor_chat_sidecar",
            False,
            True,
            f"未安装 {CURSOR_CHAT_PKG}，跳过 sidecar（写码须先装对话写码，无回退旧包）",
        )
    res = ensure_cursor_chat_sidecar(fix=do_fix, require=False, home=home)
    ok = bool(res.get("ok"))
    detail = str(res.get("detail") or "")
    return Probe(
        "cursor_chat_sidecar",
        True,
        ok,
        detail,
        fixed=bool(res.get("fixed")),
    )


def _probe_knowledge_peers(profile: Path, do_fix: bool) -> Probe:
    """知识库 peer（mammoth 等）：pnpm 卸其它线上插件后易丢，缺则宿主崩。

    启动硬门禁：pack 在则必查 peer；缺 mammoth 等 → 拒绝启动（杜绝 :3081 白屏）。
    """
    fixed = False
    fix_detail = ""
    if do_fix:
        try:
            res = ensure_dsh_knowledge(profile, do_fix=True)
            fixed = bool(res.get("fixed"))
            notes = [str(n) for n in (res.get("notes") or [])]
            bad = [n for n in notes if "托管安装失败" in n or "拒绝启动" in n]
            if bad:
                fix_detail = "；".join(bad)
        except Exception as exc:  # noqa: BLE001 — 门禁汇总
            fix_detail = f"ensure_dsh_knowledge 失败: {type(exc).__name__}: {exc}"
        # 整段 ensure 失败或笔记报失败时：只修 peer（不重拉公司包），抢救启动
        if fix_detail and kb_package_installed(profile):
            try:
                repair_note = repair_kb_peers(profile)
                fixed = True
                fix_detail = f"{fix_detail}；已抢救 peer（{repair_note}）"
            except Exception as exc:  # noqa: BLE001
                fix_detail = f"{fix_detail}；peer 抢救失败: {type(exc).__name__}: {exc}"
    try:
        if not kb_package_installed(profile):
            if fix_detail:
                return Probe("knowledge_peers", True, False, fix_detail, fixed)
            return Probe("knowledge_peers", True, True, "知识库未装入 bundles，跳过 peer 门禁", fixed)
        assert_kb_peers_ready(profile)
        detail = "知识库硬依赖 peer 齐全"
        if fix_detail:
            # 升级/重拉失败但本机 peer 已齐：不得因此拒启（否则公司 npm 抖动即启动失败）
            detail = f"{detail}（沿用本机包；{fix_detail}）"
        return Probe("knowledge_peers", True, True, detail, fixed)
    except RuntimeError as exc:
        # 再抢救一次 mammoth 平铺依赖后复检
        if do_fix and kb_package_installed(profile):
            try:
                repair_note = repair_kb_peers(profile)
                assert_kb_peers_ready(profile)
                detail = f"知识库硬依赖 peer 齐全（抢救：{repair_note}）"
                if fix_detail:
                    detail = f"{detail}；此前：{fix_detail}"
                return Probe("knowledge_peers", True, True, detail, True)
            except Exception as repair_exc:  # noqa: BLE001
                detail = f"{exc}；抢救失败: {type(repair_exc).__name__}: {repair_exc}"
                if fix_detail:
                    detail = f"{fix_detail}；{detail}"
                return Probe("knowledge_peers", True, False, detail, fixed)
        detail = str(exc)
        if fix_detail:
            detail = f"{fix_detail}；{detail}"
        return Probe("knowledge_peers", True, False, detail, fixed)


def _probe_profile_bundles(profile: Path, do_fix: bool) -> Probe:
    """bundles 含未装好/缺 client 的可选包 → 整页 Failed to load plugins。启动前剔除。

    pnpm install 会剪掉只写在 bundles、不在 dependencies 里的 dsh-base / dsh-web-app。
    桌面启动走这条门禁，须在剔除前把核心包从内嵌宿主接回来。
    """
    core_notes: List[str] = []
    core_fixed = False
    if do_fix:
        core = ensure_dsh_core_bundles(profile, do_fix=True)
        core_fixed = bool(core.get("fixed"))
        core_notes = [str(n) for n in (core.get("notes") or []) if "已存在" not in str(n)]
    res = purge_broken_profile_bundles(profile, fix=do_fix)
    notes = list(res.get("notes") or [])
    removed = list(res.get("removed") or [])
    fatal = list(res.get("fatal") or [])
    detail_parts = core_notes + notes + ([f"剔除 {len(removed)} 个残包"] if removed and res.get("fixed") else [])
    if fatal:
        detail_parts.extend(fatal)
    detail = "；".join(detail_parts) if detail_parts else "bundles 可加载"
    return Probe(
        "profile_bundles",
        True,
        bool(res.get("ok")),
        detail,
        fixed=bool(res.get("fixed")) or core_fixed,
    )


def _probe_npm_entries(profile: Path) -> Probe:
    if not (profile / "package.json").is_file():
        return Probe("npm_entries", True, False, "profile 无 package.json")
    declared = scan_profile(profile)
    critical_present = []
    for spec in CRITICAL_NPM:
        row = next((r for r in declared if r.get("spec") == spec), None)
        if row is None:
            # 未声明的非强制（zod 由 _probe_zod 管）
            continue
        critical_present.append(row)
        if spec in EXTRA_FILES and not row.get("ok"):
            # 已在 extra 规则里
            pass
    # 也检查已装但入口残缺的关键包（即使 dependencies 漏登记）
    nm = profile / "node_modules"
    extra_rows = []
    for spec, extra in EXTRA_FILES.items():
        directory = pkg_dir(nm, spec)
        if not (directory / "package.json").is_file() and spec not in {r.get("spec") for r in critical_present}:
            continue
        row = check_pkg_dir(directory, extra=extra)
        row["spec"] = spec
        extra_rows.append(row)
    failed = [r for r in extra_rows if not r.get("ok")]
    # 已声明的 mes-bridge / dsh-tools 无 package.json
    for row in declared:
        spec = str(row.get("spec") or "")
        if spec in {"@dsh-external/dsh-mes-bridge", "@deepseek-ai/dsh-tools", "dshmarket"} and not row.get("ok"):
            if all(r.get("spec") != spec for r in failed):
                failed.append(row)
    if failed:
        bits = [f"{r.get('spec')}: {r.get('detail')}" for r in failed]
        return Probe("npm_entries", True, False, "；".join(bits))
    n = len(declared)
    return Probe("npm_entries", True, True, f"已检查 {n} 个声明依赖的入口文件")


def check_runtime(
    *,
    do_fix: bool = False,
    engine_only: bool = False,
    profile: Optional[Path] = None,
    dsh_home: Optional[Path] = None,
) -> RuntimeReport:
    home = _dsh_home(dsh_home)
    prof = _profile(profile, home)
    report = RuntimeReport()
    report.add(_probe_python(do_fix))
    report.add(_probe_engine_boot())
    report.add(_probe_credential(home, do_fix))
    report.add(_probe_company_knowledge(do_fix))
    report.add(_probe_local_user_manual(prof, do_fix))
    report.add(_probe_bridge_src())
    if engine_only:
        return report
    report.add(_probe_node())
    report.add(_probe_dsh())
    report.add(_probe_company_market(home))
    report.add(_probe_dshmarket(prof, do_fix))
    report.add(_probe_dsh_tools(prof, do_fix))
    report.add(_probe_zod(prof, do_fix))
    report.add(_probe_profile_bundles(prof, do_fix))
    report.add(_probe_knowledge_peers(prof, do_fix))
    report.add(_probe_npm_entries(prof))
    report.add(_probe_cursor_sidecar(home, do_fix))
    report.add(_probe_cursor_chat_align(do_fix))
    return report


def print_report(report: RuntimeReport) -> None:
    print("=== WorkBuddy 运行时依赖 ===")
    for p in report.probes:
        if p.ok:
            mark = "OK"
        elif p.required:
            mark = "FAIL"
        else:
            mark = "WARN"
        extra = " [已修]" if p.fixed else ""
        print(f"{mark} {p.id}{extra}: {p.detail}")
    if report.ok:
        print("运行时依赖: 通过")
    else:
        print("运行时依赖: 未通过（拒绝启动）", file=sys.stderr)


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="WorkBuddy 新机运行时依赖门禁")
    ap.add_argument("--fix", action="store_true", help="能修的自动修")
    ap.add_argument("--require", action="store_true", help="必查项失败则 exit 1")
    ap.add_argument("--engine", action="store_true", help="只查引擎 Python/boot/Key（engine_ctl）")
    ap.add_argument("--profile", type=Path, default=None)
    ap.add_argument("--dsh-home", type=Path, default=None)
    args = ap.parse_args(list(argv) if argv is not None else None)
    report = check_runtime(
        do_fix=args.fix,
        engine_only=args.engine,
        profile=args.profile,
        dsh_home=args.dsh_home,
    )
    print_report(report)
    if args.require and not report.ok:
        print(
            "LOCKED：新机依赖未就绪。修复: python scripts/lib/ensure_runtime.py --fix --require",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
