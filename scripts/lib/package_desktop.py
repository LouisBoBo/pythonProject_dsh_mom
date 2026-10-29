#!/usr/bin/env python3
"""跨平台桌面一体打包：按本机 OS 自动选用 Mac zip/dmg 或 Windows NSIS。

内嵌 Python / Node 必须与构建机一致，禁止交叉打包。
安装后用户只需在 WorkBuddy 配置中心填 Key（第一次安装即可用）。

用法:
  python scripts/lib/package_desktop.py
  python scripts/lib/package_desktop.py unified
  python scripts/lib/package_desktop.py engine
  python scripts/lib/package_desktop.py --preflight
  MAKE_DMG=1 python scripts/lib/package_desktop.py   # 仅 macOS
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from find_python import find_python  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
DESKTOP = ROOT / "desktop"
RUNTIME = DESKTOP / "runtime"
RELEASE = DESKTOP / "release"
# 与 desktop/package.json productName / artifactName 一致
DESKTOP_PRODUCT = "MOM"

NODE_RUNTIME_VER = os.environ.get("NODE_RUNTIME_VER") or "22.23.1"
DSH_NPM_VERSION = os.environ.get("DSH_NPM_VERSION") or "0.2.1-rc.2"
MARKET_VER = os.environ.get("MARKET_VER") or "1.66.38"
PNPM_VER = os.environ.get("PNPM_VER") or "11.7.0"

NODE_MIRROR = os.environ.get("NODE_DIST_URL") or os.environ.get("NODE_MIRROR") or ""
ELECTRON_MIRROR = os.environ.get("ELECTRON_MIRROR") or "https://npmmirror.com/mirrors/electron/"
ELECTRON_BUILDER_BINARIES_MIRROR = (
    os.environ.get("ELECTRON_BUILDER_BINARIES_MIRROR")
    or "https://npmmirror.com/mirrors/electron-builder-binaries/"
)


def apply_desktop_electron_download_env() -> None:
    """凡在 desktop/ 下 npm install / electron-builder，一律走国内镜像（禁止直连 GitHub）。

    只设 ELECTRON_*（@electron/get / electron-builder 认这些）。
    勿设 npm_config_electron_*：新版 npm 会当未知 config 刷屏警告，且不参与二进制下载。
    """
    os.environ["ELECTRON_MIRROR"] = ELECTRON_MIRROR
    os.environ["ELECTRON_BUILDER_BINARIES_MIRROR"] = ELECTRON_BUILDER_BINARIES_MIRROR
    # 清掉误设的 npm_config_*，避免 Unknown env config 警告
    for k in (
        "npm_config_electron_mirror",
        "npm_config_electron_builder_binaries_mirror",
        "npm_config_electron-mirror",
        "npm_config_electron-builder-binaries-mirror",
    ):
        os.environ.pop(k, None)


def ensure_desktop_npmrc() -> None:
    """落盘 desktop/.npmrc，避免手工 npm install 仍打 GitHub。"""
    npmrc = DESKTOP / ".npmrc"
    body = (
        f"electron_mirror={ELECTRON_MIRROR.rstrip('/')}/\n"
        f"electron_builder_binaries_mirror={ELECTRON_BUILDER_BINARIES_MIRROR.rstrip('/')}/\n"
    )
    if npmrc.is_file() and npmrc.read_text(encoding="utf-8") == body:
        return
    npmrc.write_text(body, encoding="utf-8")
    log(f"已写入 {npmrc.relative_to(ROOT)}（Electron 国内镜像）")


def log(msg: str) -> None:
    print(f"\033[1;34m[package-desktop]\033[0m {msg}", flush=True)


def err(msg: str) -> None:
    print(f"\033[1;31m[package-desktop]\033[0m {msg}", file=sys.stderr, flush=True)


def die(msg: str, code: int = 1) -> None:
    err(msg)
    raise SystemExit(code)


def nsis_compress_level() -> str:
    """NSIS 内嵌 7z 等级。electron-builder 对 7z 默认 mx=9，解压 4 万文件可要十几分钟。"""
    raw = (os.environ.get("ELECTRON_BUILDER_COMPRESSION_LEVEL") or "5").strip()
    return raw or "5"


def _env_flag(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip() in {"1", "true", "TRUE", "yes", "YES"}


def current_pack_os() -> str:
    sysname = platform.system().lower()
    if sysname == "darwin":
        return "mac"
    if sysname == "windows":
        return "win"
    if sysname == "linux":
        return "linux"
    die(f"暂不支持打包平台: {platform.system()}")
    raise AssertionError


def cpu_node_arch() -> str:
    override = (os.environ.get("NODE_RUNTIME_ARCH") or "").strip()
    if override:
        return override
    machine = platform.machine().lower()
    if machine in ("arm64", "aarch64"):
        return "arm64"
    return "x64"


def detect_pack_target(cli_target: str = "") -> str:
    """本机 OS 优先；PACK_TARGET / 旧参数 mac|win|linux 仅允许与本机一致。"""
    native = current_pack_os()
    wanted = (cli_target or os.environ.get("PACK_TARGET") or os.environ.get("EB_TARGET") or "").strip()
    if wanted in {"mac", "win", "linux"}:
        if wanted != native and not _env_flag("FORCE_CROSS"):
            die(
                f"禁止交叉打包：当前是 {native}，请求 {wanted}。"
                "内嵌 Python/Node 必须与本机一致，请在目标系统上打包。"
            )
        return wanted
    return native


def node_archive(target: str, arch: str) -> Tuple[str, bool]:
    """返回 (文件名, 是否 zip)。Windows 官方发行是 zip，Mac/Linux 是 tar.gz。"""
    ver = NODE_RUNTIME_VER
    if target == "win":
        return f"node-v{ver}-win-{arch}.zip", True
    if target == "mac":
        return f"node-v{ver}-darwin-{arch}.tar.gz", False
    return f"node-v{ver}-linux-{arch}.tar.gz", False


def electron_builder_args(target: str) -> List[str]:
    return [f"--{target}"]


def desktop_version() -> str:
    pkg = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))
    return str(pkg.get("version") or "0.0.0")


_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


def bump_version_str(old: str, part: str) -> str:
    """主.次.修 自抬一档；part ∈ patch/minor/major。用户只看安装包版本号（desktop/package.json）。"""
    m = _VERSION_RE.match(str(old or "").strip())
    if not m:
        raise ValueError(f"版本号非法: {old!r}（应为主.次.修，如 0.2.26）")
    major, minor, patch = (int(x) for x in m.groups())
    if part == "major":
        major, minor, patch = major + 1, 0, 0
    elif part == "minor":
        minor, patch = minor + 1, 0
    elif part == "patch":
        patch += 1
    else:
        raise ValueError(f"未知 bump 档位: {part!r}（patch|minor|major）")
    return f"{major}.{minor}.{patch}"


def _write_desktop_version(new: str) -> None:
    """只替换 version 行的值，不重排 JSON（保持手维护格式、SVN diff 最小）。"""
    pkg_path = DESKTOP / "package.json"
    text = pkg_path.read_text(encoding="utf-8")
    new_text, n = re.subn(r'("version"\s*:\s*")[^"]*(")', rf"\g<1>{new}\g<2>", text, count=1)
    if n != 1:
        die("desktop/package.json 未找到 version 字段")
    pkg_path.write_text(new_text, encoding="utf-8")


def bump_desktop_version(part: str) -> str:
    """打包即自抬 desktop/package.json 版本号；返回新版本。"""
    old = desktop_version()
    try:
        new = bump_version_str(old, part)
    except ValueError as e:
        die(str(e))
    _write_desktop_version(new)
    log(f"desktop/package.json 版本自抬: {old} → {new}")
    return new


def set_desktop_version(new: str) -> str:
    """--set-version 直接指定版本号（优先于自抬）；返回写入的版本。"""
    new = str(new or "").strip().lstrip("v")
    if not _VERSION_RE.match(new):
        die(f"--set-version 非法: {new!r}（应为主.次.修，如 0.3.0）")
    old = desktop_version()
    _write_desktop_version(new)
    log(f"desktop/package.json 版本指定: {old} → {new}")
    return new


def git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(ROOT),
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


def _which(names: Sequence[str]) -> Optional[str]:
    for name in names:
        found = shutil.which(name)
        if found:
            return found
    return None


def npm_bin() -> str:
    found = _which(("npm.cmd", "npm.exe", "npm"))
    if not found:
        die("缺少 npm。请先安装 Node ≥22 并加入 PATH。")
    return found


def npx_bin() -> str:
    found = _which(("npx.cmd", "npx.exe", "npx"))
    if not found:
        die("缺少 npx。请先安装 Node ≥22 并加入 PATH。")
    return found


def node_bin() -> str:
    found = _which(("node.exe", "node"))
    if not found:
        die("缺少 node。请先安装 Node ≥22。")
    return found


def python_bin() -> str:
    found = find_python(min_major=3, min_minor=10)
    if not found:
        die("找不到 Python 3.10+。Windows 请勾选 Add python.exe to PATH。")
    return found


def _win_argv(cmd: Sequence[str]) -> List[str]:
    """Windows 不能 CreateProcess .cmd/.bat，须经 cmd /c。"""
    argv = [str(c) for c in cmd]
    if os.name == "nt" and argv:
        low = argv[0].lower()
        if low.endswith(".cmd") or low.endswith(".bat"):
            return ["cmd", "/c", *argv]
    return argv


def stop_desktop_shell_for_pack() -> None:
    """打包前结束桌面壳，避免 release/win-unpacked 下 exe 被 rcedit/NSIS 占用。"""
    if os.name != "nt":
        return
    for im in (f"{DESKTOP_PRODUCT}.exe", "Mom-x.exe", "江西中软.exe", "ZR WorkBuddy.exe"):
        try:
            p = subprocess.run(
                ["taskkill", "/IM", im, "/F", "/T"],
                capture_output=True,
                text=True,
                timeout=45,
            )
            if p.returncode == 0:
                log(f"已结束桌面壳进程: {im}")
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass


def _run(cmd: Sequence[str], *, cwd: Optional[Path] = None, env: Optional[dict] = None) -> None:
    argv = _win_argv(cmd)
    log("+ " + " ".join(argv))
    merged = os.environ.copy()
    if env:
        merged.update(env)
    subprocess.check_call(argv, cwd=str(cwd) if cwd else None, env=merged)


def _run_capture(cmd: Sequence[str], *, cwd: Optional[Path] = None) -> str:
    return subprocess.check_output(_win_argv(cmd), cwd=str(cwd) if cwd else None, text=True)


def _chmod_exec(path: Path) -> None:
    if os.name == "nt" or not path.is_file():
        return
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _dir_mb_at_least(path: Path, mb: int) -> Tuple[bool, int]:
    total = 0
    threshold = mb * 1024 * 1024
    if not path.exists():
        return False, 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                continue
            if total >= threshold:
                return True, total // (1024 * 1024)
    return total >= threshold, total // (1024 * 1024)


def _copytree(src: Path, dst: Path) -> None:
    if dst.exists():
        shutil.rmtree(dst)
    if os.name == "nt":
        dst.mkdir(parents=True, exist_ok=True)
        # robocopy 更抗 MAX_PATH；退出码 0–7 都算成功
        proc = subprocess.run(
            [
                "robocopy",
                str(src),
                str(dst),
                "/E",
                "/NFL",
                "/NDL",
                "/NJH",
                "/NJS",
                "/NC",
                "/NS",
                "/NP",
            ],
            check=False,
        )
        if proc.returncode < 8:
            return
        shutil.rmtree(dst, ignore_errors=True)
    shutil.copytree(src, dst, symlinks=True)


def _read_pkg_version(pkg_json: Path) -> str:
    try:
        return str(json.loads(pkg_json.read_text(encoding="utf-8")).get("version") or "")
    except Exception:
        return ""


def bundled_python() -> Optional[Path]:
    home = RUNTIME / "python"
    for cand in (
        home / "python.exe",
        home / "Scripts" / "python.exe",
        home / "bin" / "python3",
        home / "bin" / "python",
    ):
        if cand.is_file():
            return cand
    return None


def bundled_node(target: str) -> Path:
    name = "node.exe" if target == "win" else "node"
    return RUNTIME / "node" / "bin" / name


def assert_engine_runtime() -> None:
    launcher_ok = (RUNTIME / "bin" / "workbuddy-engine").is_file() or (
        RUNTIME / "bin" / "workbuddy-engine.cmd"
    ).is_file()
    if not launcher_ok:
        die("缺少 workbuddy-engine（请去掉 SKIP_RUNTIME 重跑）")
    if not (RUNTIME / "python").is_dir():
        die("缺少 desktop/runtime/python")
    py = bundled_python()
    if py is None:
        die("内嵌 python 不可执行: desktop/runtime/python")
    try:
        _run([str(py), "-c", "import fastapi, uvicorn; print('py_ok')"])
    except subprocess.CalledProcessError:
        die("内嵌 python 无法 import fastapi/uvicorn。请去掉 SKIP_RUNTIME 重跑 build_runtime。")
    log(f"内嵌 python 校验通过: {py}")
    engine = RUNTIME / "app" / "apps" / "zr-workbuddy" / "engine"
    if not engine.is_dir():
        die("缺少 runtime app")
    if not (RUNTIME / "app" / "scripts" / "lib" / "read_runtime.py").is_file():
        die("runtime app 缺少 scripts/lib/read_runtime.py")
    if not (RUNTIME / "app" / "scripts" / "lib" / "ensure_runtime.py").is_file():
        die("runtime app 缺少 ensure_runtime.py（安装后门禁无法跑）")
    for mod in ("code_dev", "code_review", "code_commit", "code_deploy", "hitl"):
        init = engine / "app" / mod / "__init__.py"
        if not init.is_file():
            die(f"runtime 缺少引擎模块 {mod}")
    log("引擎能力模块校验通过: code_dev/review/commit/deploy/hitl")


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    log(f"下载 {url}")
    urllib.request.urlretrieve(url, dest)


def _download_first(urls: Sequence[str], dest: Path) -> None:
    last: Optional[BaseException] = None
    for url in urls:
        try:
            _download(url, dest)
            if dest.is_file() and dest.stat().st_size > 1000:
                return
        except Exception as exc:  # noqa: BLE001
            last = exc
            if dest.is_file():
                dest.unlink()
    die(f"下载失败: {dest.name} ({last})")


def _node_urls(filename: str) -> List[str]:
    ver = NODE_RUNTIME_VER
    urls = []
    if NODE_MIRROR:
        if NODE_MIRROR.endswith(filename) or NODE_MIRROR.endswith(".zip") or NODE_MIRROR.endswith(".tar.gz"):
            urls.append(NODE_MIRROR)
        else:
            base = NODE_MIRROR.rstrip("/")
            urls.append(f"{base}/v{ver}/{filename}")
    urls.append(f"https://npmmirror.com/mirrors/node/v{ver}/{filename}")
    urls.append(f"https://nodejs.org/dist/v{ver}/{filename}")
    # 去重保序
    seen = set()
    out: List[str] = []
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def stage_node_runtime(target: str, skip: bool) -> None:
    dest = bundled_node(target)
    if skip and dest.is_file():
        log(f"复用已有内嵌 Node: {dest}")
        return
    if dest.is_file():
        try:
            maj = int(
                _run_capture([str(dest), "-p", 'process.versions.node.split(".")[0]']).strip() or "0"
            )
            if maj >= 22:
                log(f"复用已有内嵌 Node v{maj}: {dest}")
                return
        except Exception:
            pass

    arch = cpu_node_arch()
    filename, is_zip = node_archive(target, arch)
    staged = RUNTIME / "node"
    if staged.exists():
        shutil.rmtree(staged)
    (staged / "bin").mkdir(parents=True)

    local_node = ""
    nvm = Path.home() / ".nvm" / "versions" / "node" / f"v{NODE_RUNTIME_VER}" / "bin" / (
        "node.exe" if target == "win" else "node"
    )
    if nvm.is_file():
        local_node = str(nvm)
    else:
        which = _which(("node.exe", "node"))
        if which:
            try:
                ver = _run_capture([which, "-p", "process.versions.node"]).strip()
                if ver == NODE_RUNTIME_VER:
                    local_node = which
            except Exception:
                local_node = ""
    if local_node:
        shutil.copy2(local_node, dest)
        _chmod_exec(dest)
        log(f"从本机拷贝 Node → {dest}")
        return

    cache = RUNTIME / "_cache"
    cache.mkdir(parents=True, exist_ok=True)
    archive = cache / filename
    if not archive.is_file():
        _download_first(_node_urls(filename), archive)

    tmp = Path(tempfile.mkdtemp(prefix="wb-node-"))
    try:
        if is_zip:
            with zipfile.ZipFile(archive) as zf:
                zf.extractall(tmp)
        else:
            with tarfile.open(archive, "r:gz") as tf:
                tf.extractall(tmp)
        extracted = None
        for cand in tmp.rglob("node.exe" if target == "win" else "node"):
            if cand.is_file() and cand.name in {"node", "node.exe"}:
                extracted = cand
                break
        if extracted is None:
            die(f"Node 归档里没有解释器: {archive}")
        shutil.copy2(extracted, dest)
        _chmod_exec(dest)
        # Windows zip 还带 npm.cmd，拷到 node 根，便于排障
        if target == "win":
            npm_src = extracted.parent / "npm.cmd"
            if npm_src.is_file():
                shutil.copy2(npm_src, staged / "npm.cmd")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    log(f"内嵌 Node 已就绪: {dest}")


def stage_host_from_npm_global() -> None:
    host = RUNTIME / "host"
    npm = npm_bin()
    try:
        g_root = _run_capture([npm, "root", "-g"]).strip()
    except subprocess.CalledProcessError:
        g_root = ""
    dsh_src = Path(g_root) / "@deepseek-ai" / "dsh" if g_root else None
    if dsh_src is None or not (dsh_src / "package.json").is_file():
        die(f"全局未安装 @deepseek-ai/dsh。请先: npm i -g @deepseek-ai/dsh@{DSH_NPM_VERSION}")
    ver = _read_pkg_version(dsh_src / "package.json")
    log(f"从全局整包拷贝 Host: @deepseek-ai/dsh@{ver}（含嵌套依赖）")
    if host.exists():
        shutil.rmtree(host)
    dest = host / "node_modules" / "@deepseek-ai" / "dsh"
    dest.parent.mkdir(parents=True)
    (host / "package.json").write_text(
        json.dumps(
            {
                "name": "zr-workbuddy-host-runtime",
                "private": True,
                "version": "0.2.0",
                "dependencies": {"@deepseek-ai/dsh": ver},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    _copytree(dsh_src, dest)
    ok, mb = _dir_mb_at_least(dest, 50)
    if not ok:
        die(f"Host 拷贝异常过小（{mb}M），请检查全局 dsh 安装")
    log(f"Host 已就绪（至少 {mb}M）")


def stage_host_from_npm_install() -> None:
    host = RUNTIME / "host"
    if host.exists():
        shutil.rmtree(host)
    host.mkdir(parents=True)
    (host / "package.json").write_text(
        json.dumps(
            {
                "name": "zr-workbuddy-host-runtime",
                "private": True,
                "version": "0.2.0",
                "dependencies": {"@deepseek-ai/dsh": DSH_NPM_VERSION},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    log(f"安装内嵌 Host CLI @deepseek-ai/dsh@{DSH_NPM_VERSION} → desktop/runtime/host/")
    _run([npm_bin(), "install", "--omit=dev", "--no-fund", "--no-audit", "--prefer-offline"], cwd=host)
    log("Host npm 安装完成")


def assert_host() -> None:
    bin_js = RUNTIME / "host" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
    if not bin_js.is_file():
        die("缺少内嵌 Host CLI（desktop/runtime/host/.../dsh/lib/bin.js）")


def stage_dshmarket(skip: bool) -> None:
    market = RUNTIME / "market"
    dest_pkg = market / "node_modules" / "dshmarket" / "package.json"
    dest_client = market / "node_modules" / "dshmarket" / "client" / "client.js"
    if skip and dest_pkg.is_file() and dest_client.is_file():
        log(f"复用已有 dshmarket: {_read_pkg_version(dest_pkg)}")
        return
    if market.exists():
        shutil.rmtree(market)
    market.mkdir(parents=True)
    (market / "package.json").write_text(
        json.dumps(
            {
                "name": "zr-workbuddy-market-runtime",
                "private": True,
                "version": "0.2.11",
                "dependencies": {"dshmarket": MARKET_VER},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    log(f"安装内嵌插件市场 dshmarket@{MARKET_VER} → desktop/runtime/market/")
    _run([npm_bin(), "install", "--omit=dev", "--no-fund", "--no-audit"], cwd=market)
    if not dest_pkg.is_file():
        die("缺少 dshmarket package.json")
    if not dest_client.is_file():
        die("缺少 dshmarket client.js")
    if not (market / "node_modules" / "dshmarket" / "cordis.patch.yml").is_file():
        die("缺少 dshmarket cordis.patch.yml")
    log("dshmarket 已就绪")


def stage_pnpm(skip: bool) -> None:
    pnpm = RUNTIME / "pnpm"
    dest = pnpm / "node_modules" / "pnpm" / "bin" / "pnpm.cjs"
    if skip and dest.is_file():
        log("复用已有 pnpm")
        return
    if pnpm.exists():
        shutil.rmtree(pnpm)
    pnpm.mkdir(parents=True)
    (pnpm / "package.json").write_text(
        json.dumps(
            {
                "name": "zr-workbuddy-pnpm-runtime",
                "private": True,
                "version": "0.2.13",
                "dependencies": {"pnpm": PNPM_VER},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    log(f"安装内嵌 pnpm@{PNPM_VER} → desktop/runtime/pnpm/")
    _run([npm_bin(), "install", "--omit=dev", "--no-fund", "--no-audit"], cwd=pnpm)
    if not dest.is_file():
        die("缺少 pnpm.cjs")
    log("pnpm 已就绪")


def assert_company_market_packaging() -> None:
    seed = ROOT / "apps" / "zr-workbuddy" / "config" / "company-dsh-plugins.seed.json"
    envf = ROOT / "apps" / "zr-workbuddy" / "config" / "company-dsh-market.env"
    merge = ROOT / "scripts" / "lib" / "merge_company_dsh_market.py"
    verify = ROOT / "scripts" / "lib" / "verify_company_dsh_market.py"
    for p in (seed, envf, merge, verify):
        if not p.is_file():
            die(f"打包失败：缺少 {p}")
    data = json.loads(seed.read_text(encoding="utf-8"))
    names = [
        str(x.get("npm") or x.get("name") or "")
        for x in (data.get("plugins") or [])
        if isinstance(x, dict)
    ]
    zr = [n for n in names if n.startswith("@zhongruan/")]
    if len(zr) < 1:
        die(f"打包失败：{seed} 无 @zhongruan 插件")
    log(f"公司插件 seed OK：{len(zr)} 个 @zhongruan/*")
    log("公司插件市场打包门禁通过（seed + merge + verify）")


def assert_company_knowledge_packaging() -> None:
    """桌面包知识库种子：有合格 env 则校验通过；无种子/token 仅告警放行。

    不改运行时业务：ensure_company_knowledge / 问数旁路仍只在有种子时合并接入。
    破窗意图：本机可不配公司库 token 仍能打桌面包并上传。
    """
    envf = ROOT / "apps" / "zr-workbuddy" / "config" / "company-knowledge.env"
    ensure = ROOT / "scripts" / "lib" / "ensure_company_knowledge.py"
    if not ensure.is_file():
        die(f"打包失败：缺少 {ensure}（代码缺失，与 token 无关）")
    if not envf.is_file():
        # 走 stdout：Windows PowerShell Stop + 2>&1 会把 stderr 当成致命 ErrorRecord 掐死管道
        log(
            "未找到 company-knowledge.env：本包不预置公司共享知识库"
            "（需要时复制 company-knowledge.env.example 并填 READ_TOKEN）。继续打包。"
        )
        return
    text = envf.read_text(encoding="utf-8-sig")
    read_tok = ""
    for line in text.splitlines():
        if line.startswith("COMPANY_KNOWLEDGE_READ_TOKEN="):
            read_tok = line.split("=", 1)[1].strip().strip('"').strip("'")
            break
    if len(read_tok) < 24:
        log(
            "company-knowledge.env 的 COMPANY_KNOWLEDGE_READ_TOKEN 过短或为空："
            "本包不预置公司共享知识库。继续打包。"
        )
        return
    if "COMPANY_KNOWLEDGE_BASE_URL=" not in text:
        log(
            "company-knowledge.env 缺少 COMPANY_KNOWLEDGE_BASE_URL："
            "本包不预置公司共享知识库。继续打包。"
        )
        return
    log("公司共享知识库打包门禁通过（seed env + ensure）")


def resources_root_for(target: str) -> Path:
    if target == "mac":
        return RELEASE / "mac" / f"{DESKTOP_PRODUCT}.app" / "Contents" / "Resources"
    if target == "win":
        return RELEASE / "win-unpacked" / "resources"
    return RELEASE / "linux-unpacked" / "resources"


def assert_bundle_first_ready(target: str) -> None:
    """安装包内必须自带：引擎 Python、Node≥22、Host、dshmarket、pnpm、ensure_runtime。"""
    res = resources_root_for(target)
    if not res.is_dir():
        die(f"缺少解包目录 {res}（electron-builder 失败）")
    checks = {
        "dshmarket client": res / "market" / "node_modules" / "dshmarket" / "client" / "client.js",
        "pnpm.cjs": res / "pnpm" / "bin" / "pnpm.cjs",
        "ensure_runtime.py": res / "runtime" / "app" / "scripts" / "lib" / "ensure_runtime.py",
        "run_engine.py": res / "runtime" / "app" / "desktop" / "py" / "run_engine.py",
    }
    host_ready = (res / "host" / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js").is_file() or (
        res / "host" / "node_modules.zip"
    ).is_file()
    if not host_ready:
        die("安装包缺少宿主 node_modules（目录或 node_modules.zip）")
    if target == "win":
        checks["node.exe"] = res / "runtime" / "node" / "bin" / "node.exe"
        checks["engine.cmd"] = res / "runtime" / "bin" / "workbuddy-engine.cmd"
        py_ok = (res / "runtime" / "python" / "python.exe").is_file() or (
            res / "runtime" / "python" / "Scripts" / "python.exe"
        ).is_file() or (res / "runtime" / "python.zip").is_file()
        if not py_ok:
            die("安装包缺少 Windows 内嵌 python.exe 或 python.zip")
    else:
        checks["node"] = res / "runtime" / "node" / "bin" / "node"
        checks["engine"] = res / "runtime" / "bin" / "workbuddy-engine"
        py_ok = (res / "runtime" / "python" / "bin" / "python3").is_file() or (
            res / "runtime" / "python.zip"
        ).is_file()
        if not py_ok:
            die("安装包缺少 python3 或 python.zip")
    missing = [label for label, path in checks.items() if not path.is_file()]
    if missing:
        die("安装包 first-ready 缺项: " + ", ".join(missing))
    # 发版机有合格公司知识库种子时，安装树必须真正带上（防只预检、build_runtime 漏拷）
    seed_src = ROOT / "apps" / "zr-workbuddy" / "config" / "company-knowledge.env"
    if seed_src.is_file():
        text = seed_src.read_text(encoding="utf-8-sig")
        read_tok = ""
        for line in text.splitlines():
            if line.startswith("COMPANY_KNOWLEDGE_READ_TOKEN="):
                read_tok = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
        if len(read_tok) >= 24 and "COMPANY_KNOWLEDGE_BASE_URL=" in text:
            packed = (
                res
                / "runtime"
                / "app"
                / "apps"
                / "zr-workbuddy"
                / "config"
                / "company-knowledge.env"
            )
            if not packed.is_file():
                die(
                    "安装包缺少 company-knowledge.env（发版机有合格种子但未打入 runtime；"
                    "检查 build_runtime 是否拷贝 apps/zr-workbuddy/config/company-knowledge.env）"
                )
            log("安装包已含公司共享知识库种子 company-knowledge.env")
    # §3.2 桌面壳契约：功能开关默认 / 侧栏不搬节点 / bridge 藏控制台
    app_root = res / "runtime" / "app" / "apps" / "zr-workbuddy"
    plugins_json = app_root / "engine" / "data" / "plugins.json"
    if not plugins_json.is_file():
        die(f"安装包缺少 {plugins_json}")
    try:
        enabled = json.loads(plugins_json.read_text(encoding="utf-8")).get("enabled") or []
    except Exception as exc:
        die(f"安装包 plugins.json 无法解析: {exc}")
    if "dev-pipeline" not in enabled:
        die(
            "安装包 engine/data/plugins.json 未默认启用 dev-pipeline"
            "（需求到上线一体化功能开关；见桌面打包规则 §3.2 M）"
        )
    bridge_client = app_root / "plugins" / "mes-bridge" / "lib" / "client.js"
    if not bridge_client.is_file():
        die(f"安装包缺少 mes-bridge client.js: {bridge_client}")
    client_text = bridge_client.read_text(encoding="utf-8", errors="ignore")
    if "markSidebarRootForPluginOrder" not in client_text:
        die("安装包 mes-bridge client.js 缺少 markSidebarRootForPluginOrder（侧栏契约 §3.2 L）")
    if "installSidebarPluginDock" in client_text:
        die("安装包 mes-bridge client.js 仍含 installSidebarPluginDock（禁止搬侧栏节点）")
    bridge_index = app_root / "plugins" / "mes-bridge" / "lib" / "index.js"
    if not bridge_index.is_file():
        die(f"安装包缺少 mes-bridge index.js: {bridge_index}")
    if "windowsHide: true" not in bridge_index.read_text(encoding="utf-8", errors="ignore"):
        die("安装包 mes-bridge index.js 缺少 windowsHide: true（防桌面闪黑框 §3.2 K）")
    log("安装包 §3.2 桌面壳契约校验通过（dev-pipeline / 侧栏 / windowsHide）")
    log(f"first-ready 产物校验通过: {res}")


def run_syntax_checks() -> None:
    node = node_bin()
    for rel in (
        "main.js",
        "preload.js",
        "lib/persist-user-features.js",
        "lib/persist-engine-data.js",
        "lib/self-update.js",
        "lib/win-path.js",
        "lib/relink-dir.js",
        "lib/offline-plugin-update.js",
    ):
        path = DESKTOP / rel
        _run([node, "--check", str(path)])
    test = DESKTOP / "tests" / "test_persist_user_features.js"
    if test.is_file():
        _run([node, str(test)])
    eng_data_test = DESKTOP / "tests" / "test_persist_engine_data.js"
    if eng_data_test.is_file():
        _run([node, str(eng_data_test)])
    kill_test = DESKTOP / "tests" / "test_kill_install_tree.js"
    if kill_test.is_file():
        _run([node, str(kill_test)])
    # 引擎地址解析：lib 版单测 + preload 内联副本防漂移比对（preload 沙箱不能 require lib）。
    argv_test = DESKTOP / "tests" / "test_read_engine_argv.js"
    if argv_test.is_file():
        _run([node, str(argv_test)])
    parity_test = DESKTOP / "tests" / "test_preload_engine_argv_parity.js"
    if parity_test.is_file():
        _run([node, str(parity_test)])
    update_test = DESKTOP / "tests" / "test_self_update.js"
    if update_test.is_file():
        _run([node, str(update_test)])
    startup_test = DESKTOP / "tests" / "test_startup_contract.js"
    if startup_test.is_file():
        _run([node, str(startup_test)])
    # Windows PATH 唯一键：市场重启助手依赖 powershell.exe（见桌面打包规则 §3.2）。
    win_path_test = DESKTOP / "tests" / "test_win_path.js"
    if win_path_test.is_file():
        _run([node, str(win_path_test)])
    # dsh-tools 对接：rename EPERM 不得拖垮启动（见 desktop/lib/relink-dir.js）。
    relink_test = DESKTOP / "tests" / "test_relink_dir.js"
    if relink_test.is_file():
        _run([node, str(relink_test)])
    offline_upd_test = DESKTOP / "tests" / "test_offline_plugin_update.js"
    if offline_upd_test.is_file():
        _run([node, str(offline_upd_test)])
    # test_win_exe_icon 依赖 rcedit：挪到 run_electron_builder 的 npm install（带镜像）之后，
    # 禁止在语法门禁阶段 npm install（会触发 electron postinstall 直连 GitHub 超时）。
    # 不依赖云：本机 mock feed 验收拉清单→比版本→拼 URL（服务器暂不可达时也能确认链路）
    chain_test = DESKTOP / "tests" / "test_update_chain_local.js"
    if chain_test.is_file() and (DESKTOP / "release" / "latest-windows.json").is_file():
        _run([node, str(chain_test)])
    elif chain_test.is_file() and (DESKTOP / "release" / "latest-macos.json").is_file():
        _run([node, str(chain_test)])


def run_win_exe_icon_gate() -> None:
    """Windows：npm install 之后、打 exe 之前，验收 rcedit + win-exe-icon 可加载。"""
    if os.name != "nt":
        return
    icon_test = DESKTOP / "tests" / "test_win_exe_icon.js"
    if not icon_test.is_file():
        return
    if not (DESKTOP / "node_modules" / "rcedit").is_dir():
        die(
            "desktop/node_modules/rcedit 缺失：desktop npm install 未装上 rcedit。"
            "请检查 desktop/package.json devDependencies 与网络后重试。"
        )
    _run([node_bin(), str(icon_test)])


def assert_builtin_user_manual_packaging() -> None:
    """裁剪会删全部 .md。预置手册必须在裁剪后仍留在 runtime，否则桌面默认知识库是空的。"""
    packed = (
        RUNTIME
        / "app"
        / "apps"
        / "zr-workbuddy"
        / "config"
        / "builtin-knowledge"
        / "用户操作手册.md"
    )
    if not packed.is_file():
        die(
            "安装包缺少预置用户手册 "
            "apps/zr-workbuddy/config/builtin-knowledge/用户操作手册.md。"
            "build_runtime 已拷入后被 prune_pack_junk 删掉时，桌面默认知识库会是空的。"
        )
    log("安装包已含预置用户手册 builtin-knowledge/用户操作手册.md")


def _slim_cursor_sdk_node() -> None:
    """cursor-sdk wheel 自带一份 Node。内嵌 Node 能拉起写码桥时去掉它。"""
    from slim_cursor_bridge_node import slim_cursor_bridge_node

    _ok, msg = slim_cursor_bridge_node(RUNTIME)
    log(msg)


def pack_install_archives() -> None:
    """Python 与宿主 node_modules 打成未压缩 zip，安装时只展开一次。"""
    from pack_install_payload import ensure_stored_zip

    pairs = (
        (RUNTIME / "python", RUNTIME / "pack" / "python.zip"),
        (RUNTIME / "host" / "node_modules", RUNTIME / "pack" / "host-node_modules.zip"),
    )
    for src, dest in pairs:
        if not src.is_dir():
            die(f"缺少 {src}，无法生成安装包 zip")
        how = ensure_stored_zip(src, dest)
        size = dest.stat().st_size / 1024 / 1024
        log(f"安装载荷 {dest.name}: {how} ({size:.1f} MB)")


def prune_staged_runtime() -> None:
    from prune_pack_junk import prune_dsh_unused_provider_sdks, prune_pack_junk

    for name in ("python", "host", "market", "pnpm", "app"):
        n, b = prune_pack_junk(RUNTIME / name)
        if n:
            log(f"裁剪 runtime/{name}: -{n} 文件 ({b / 1024 / 1024:.1f} MB)")
        if name == "python":
            from prune_pack_junk import prune_embedded_python_extras

            n, b = prune_embedded_python_extras(RUNTIME / name)
            if n:
                log(f"裁剪 runtime/python 无用标准库: -{n} 文件 ({b / 1024 / 1024:.1f} MB)")
    # P1：删除 host 里 dsh 嵌套的「懒加载且本应用永不用」的 LLM 厂商 SDK
    # （保留 openai=DeepSeek 所用、@opentelemetry=dsh 遥测）。详见 prune_pack_junk 注释。
    n, b = prune_dsh_unused_provider_sdks(RUNTIME / "host")
    if n:
        log(f"裁剪 runtime/host 未用厂商 SDK: -{n} 文件 ({b / 1024 / 1024:.1f} MB)")
    from prune_pack_junk import prune_dsh_deferred_native_runtimes

    n, b = prune_dsh_deferred_native_runtimes(RUNTIME / "host")
    if n:
        log(f"裁剪 runtime/host 非启动原生库: -{n} 文件 ({b / 1024 / 1024:.1f} MB)")


def rebuild_bridge_client() -> None:
    """打包前重建 mes-bridge 客户端 bundle（client-src → lib/client.js）。

    根因：只改 client-src 而没手动跑 build:client 时，lib/client.js 是旧的，
    打包就会把旧 UI 打进桌面包。这里在 build_runtime 复制 app 源码之前先重建，
    保证暂存区拿到的是与 client-src 同步的 bundle。重建失败不阻断打包（沿用现有 bundle）。
    """
    src_bundle = ROOT / "apps" / "zr-workbuddy" / "plugins" / "mes-bridge" / "lib" / "client.js"
    build_script = ROOT / "scripts" / "build-mes-bridge-client.mjs"
    if build_script.is_file():
        try:
            _run([node_bin(), str(build_script)], cwd=ROOT)
        except Exception as exc:  # 重建失败不阻断打包，沿用仓库现有 bundle
            err(f"警告: 重建 mes-bridge 客户端失败，沿用仓库现有 bundle：{exc}")
    if not src_bundle.is_file():
        die(f"缺少 mes-bridge 客户端 bundle {src_bundle}（请先 node scripts/build-mes-bridge-client.mjs）")


def apply_win_unpacked_icon() -> None:
    """Windows：在 NSIS/zip 之前给 win-unpacked 主 exe 写图标（不走 electron-builder afterPack / winCodeSign）。"""
    script = DESKTOP / "scripts" / "apply-win-unpacked-icon.js"
    if not script.is_file():
        die(f"缺少 {script}")
    log("写入 win-unpacked 应用图标（npm rcedit）")
    _run([node_bin(), str(script)], cwd=DESKTOP)


def _purge_broken_electron_for_reinstall() -> None:
    """上次失败可能留下残缺 electron/，postinstall 会反复 ECONNRESET。有残则先删再装。"""
    elec = DESKTOP / "node_modules" / "electron"
    if not elec.is_dir():
        return
    # 正常装完 Windows 应有 dist/electron.exe；缺则视为半残包
    exe = elec / "dist" / "electron.exe"
    marker = elec / "path.txt"
    ok = exe.is_file() or (marker.is_file() and marker.read_text(encoding="utf-8", errors="ignore").strip())
    if ok:
        return
    log("发现残缺 desktop/node_modules/electron，删除后按国内镜像重装")
    shutil.rmtree(elec, ignore_errors=True)


def run_electron_builder(target: str) -> None:
    apply_desktop_electron_download_env()
    ensure_desktop_npmrc()
    os.environ.setdefault("CSC_IDENTITY_AUTO_DISCOVERY", "false")
    os.environ["ELECTRON_BUILDER_COMPRESSION_LEVEL"] = nsis_compress_level()
    log(f"Electron 下载镜像: {ELECTRON_MIRROR}")
    log(
        f"7z 压缩等级 {os.environ['ELECTRON_BUILDER_COMPRESSION_LEVEL']}"
        "（安装解压；默认 5。要更小包可 ELECTRON_BUILDER_COMPRESSION_LEVEL=9）"
    )
    _purge_broken_electron_for_reinstall()
    _run([npm_bin(), "install", "--no-fund", "--no-audit"], cwd=DESKTOP)
    if target == "win" and os.name == "nt":
        run_win_exe_icon_gate()
        pre = "release/win-unpacked"
        log("electron-builder win --dir（先解包，再写图标，再打安装包）")
        _run([npx_bin(), "electron-builder", "--win", "--dir"], cwd=DESKTOP)
        apply_win_unpacked_icon()
        log("electron-builder win nsis+zip（--prepackaged，复用已写图标的解包目录）")
        _run(
            [npx_bin(), "electron-builder", "--win", "nsis", "zip", "--prepackaged", pre],
            cwd=DESKTOP,
        )
        return
    args = [npx_bin(), "electron-builder", *electron_builder_args(target)]
    log(f"electron-builder {target}（Mac=dir+zip；Windows=nsis+zip）")
    _run(args, cwd=DESKTOP)


def maybe_make_dmg(version: str) -> bool:
    if current_pack_os() != "mac":
        return False
    if not _env_flag("MAKE_DMG") and not (os.environ.get("SKIP_DMG", "1") == "0"):
        log("跳过 DMG（默认；主产物 zip）。需要时: MAKE_DMG=1")
        return False
    app_bundle = RELEASE / "mac" / f"{DESKTOP_PRODUCT}.app"
    dmg_out = RELEASE / f"{DESKTOP_PRODUCT}-{version}.dmg"
    script = ROOT / "scripts" / "lib" / "make_desktop_dmg.sh"
    if not app_bundle.is_dir() or not script.is_file():
        err("无法打 DMG：缺少 .app 或 make_desktop_dmg.sh")
        return False
    try:
        _run(["bash", str(script), str(app_bundle), str(dmg_out), f"{DESKTOP_PRODUCT} {version}"])
        return dmg_out.is_file()
    except subprocess.CalledProcessError:
        err("DMG 失败或超时。可用产物: zip / release/mac/*.app")
        return False


def write_build_info(mode: str, target: str, version: str, artifacts: str, note: str) -> None:
    RELEASE.mkdir(parents=True, exist_ok=True)
    payload = {
        "product": DESKTOP_PRODUCT,
        "version": version,
        "mode": mode,
        "git_commit": git_commit(),
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "platform": f"{platform.system()}-{platform.machine()}",
        "target": target,
        "artifacts": artifacts,
        "dmg_format": os.environ.get("DMG_FORMAT") or "ULFO",
        "note": note,
    }
    (RELEASE / "build-info.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def preflight(target: str) -> None:
    log(f"预检 target={target} arch={cpu_node_arch()}")
    apply_desktop_electron_download_env()
    ensure_desktop_npmrc()
    python_bin()
    node_bin()
    npm_bin()
    npx_bin()
    if not (DESKTOP / "package.json").is_file():
        die("缺少 desktop/package.json")
    pkg = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))
    build = pkg.get("build") or {}
    if target == "win":
        win = build.get("win") or {}
        targets = win.get("target") or []
        flat = []
        for item in targets:
            if isinstance(item, str):
                flat.append(item)
            elif isinstance(item, dict):
                flat.append(str(item.get("target") or ""))
        if "nsis" not in flat:
            die("desktop/package.json win.target 未含 nsis")
    if target == "mac":
        mac = build.get("mac") or {}
        targets = mac.get("target") or []
        if "zip" not in targets and "dir" not in targets:
            die("desktop/package.json mac.target 未含 dir/zip")
    assert_company_market_packaging()
    assert_company_knowledge_packaging()
    log("预检通过：可以按本机系统打包")


def _sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_update_feed(target: str, version: str) -> None:
    """打包后写 release/latest-<platform>.json（桌面壳在线升级清单）。

    方案：docs/功能实现/桌面应用版本升级方案.md
    - 与公司私有插件市场同一台服务器、另起路径 /workbuddy-desktop/（不共用 dsh-plugins/）
    - Windows / macOS 两台打包机各产各的清单，上传后无需合并
    - 清单只写纯文件名 + sha256 + size；下载 URL 由客户端按 feedBase 拼出
    """
    if target == "win":
        plat = "windows"
        # 必须按版本号匹配：release/ 里残留旧 exe 时 glob+next 会抓错，
        # 导致清单写新版本号却指向旧安装包（sha256 与旧文件一致，客户端照样装回旧版）。
        cands = [
            p
            for p in RELEASE.glob(f"*{version}*.exe")
            if "unins" not in p.name.lower()
        ]
    elif target == "mac":
        plat = "macos"
        cands = [RELEASE / f"{DESKTOP_PRODUCT}-{version}.zip"]
    else:
        return
    art = next((p for p in cands if p.is_file()), None)
    if art is None:
        err("未找到安装包产物，跳过更新清单（不影响本次打包）")
        return
    # NSIS 中断时常留下 ~100KB 空壳 exe；写进清单会导致客户端「发现更新」却下到坏包
    min_bytes = int(os.environ.get("WORKBUDDY_UPDATE_MIN_BYTES") or str(50 * 1024 * 1024))
    size = art.stat().st_size
    if size < min_bytes:
        die(
            f"安装包异常过小，拒绝写更新清单: {art.name} = {size} bytes "
            f"（阈值 {min_bytes}；多半是 electron-builder/NSIS 被中断留下的空壳）。"
            f"请删掉该文件后重新完整打包，再上传 exe + latest-{plat}.json。"
        )
    payload = {
        "product": DESKTOP_PRODUCT,
        "platform": plat,
        "version": version,
        "publishedAt": datetime.now().strftime("%Y-%m-%d"),
        "notes": os.environ.get("WORKBUDDY_UPDATE_NOTES") or "详见发版说明。",
        "artifact": {
            "file": art.name,
            "sha256": _sha256_file(art),
            "size": size,
        },
    }
    out = RELEASE / f"latest-{plat}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"更新清单: {out}（随安装包上传到 /workbuddy-desktop/，勿放 dsh-plugins/）")
    _warn_if_feed_not_published(plat, out)


def _warn_if_feed_not_published(plat: str, local_feed: Path) -> None:
    """写清单后轻探线上；真正强制上线在 upload_and_prune（打包收尾）。"""
    base = (os.environ.get("WORKBUDDY_UPDATE_FEED_BASE") or "http://175.178.238.31/workbuddy-desktop/").rstrip(
        "/"
    ) + "/"
    url = f"{base}latest-{plat}.json"
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "workbuddy-package-desktop/1"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            code = getattr(resp, "status", None) or resp.getcode()
            body = resp.read(256)
        if code != 200:
            log(f"线上清单暂不可达 HTTP {code}（即将自动上传）: {url}")
            return
        log(f"线上更新清单当前可达: {url}（{len(body)}+ bytes）；随后将覆盖为本版")
    except Exception as exc:  # noqa: BLE001
        log(f"线上清单暂不可达（即将自动上传）: {url}（{exc}）")


def package(
    mode: str,
    target: str,
    *,
    skip_builder: bool = False,
    bump: str = "patch",
    set_version: str = "",
) -> None:
    # 重新打包即自抬安装包版本号（用户只看这个号）；skip-builder / --no-bump 不抬
    if skip_builder:
        version = desktop_version()
        log(f"版本: {DESKTOP_PRODUCT} {version} (git {git_commit()}) mode={mode} target={target}（skip-builder：不抬版本号）")
    elif set_version:
        version = set_desktop_version(set_version)
        log(f"版本: {DESKTOP_PRODUCT} {version} (git {git_commit()}) mode={mode} target={target}（--set-version 指定）")
    elif bump:
        version = bump_desktop_version(bump)
        log(f"版本: {DESKTOP_PRODUCT} {version} (git {git_commit()}) mode={mode} target={target}（--bump {bump} 自抬）")
    else:
        version = desktop_version()
        log(f"版本: {DESKTOP_PRODUCT} {version} (git {git_commit()}) mode={mode} target={target}（--no-bump：不抬版本号）")
    log("提醒: 不会把 engine/config/config.yaml 真密钥打进包；用户安装后自行配置")
    preflight(target)

    rebuild_bridge_client()

    if not _env_flag("SKIP_RUNTIME"):
        log("构建内嵌引擎运行时 → desktop/runtime/")
        _run([python_bin(), str(ROOT / "desktop" / "py" / "build_runtime.py")])
    else:
        # SKIP_RUNTIME 只跳过 python/node 重建；app 源码（引擎/插件/客户端 bundle/logo）
        # 必须刷新，否则「浏览器已改、桌面包旧 UI」。
        log("SKIP_RUNTIME：跳过 python/node 重建，但仍刷新 app 源码（build_runtime --app-only）")
        _run([python_bin(), str(ROOT / "desktop" / "py" / "build_runtime.py"), "--app-only"])
    assert_engine_runtime()

    if mode == "unified":
        if not _env_flag("SKIP_NODE"):
            stage_node_runtime(target, skip=_env_flag("SKIP_NODE"))
        dest_node = bundled_node(target)
        if not dest_node.is_file():
            die(f"缺少 {dest_node}（宿主需要 Node≥22）")
        maj = int(_run_capture([str(dest_node), "-p", 'process.versions.node.split(".")[0]']).strip() or "0")
        if maj < 22:
            die(f"内嵌 Node 主版本 {maj} < 22")
        if not _env_flag("SKIP_HOST"):
            if os.environ.get("HOST_FROM_GLOBAL", "1") == "1":
                stage_host_from_npm_global()
            else:
                stage_host_from_npm_install()
        assert_host()
        stage_dshmarket(skip=_env_flag("SKIP_MARKET"))
        stage_pnpm(skip=_env_flag("SKIP_PNPM"))
    else:
        log("engine-only：不打 Host；安装后若无本机 dsh 则仅引擎页")
        host = RUNTIME / "host"
        host.mkdir(parents=True, exist_ok=True)
        (host / "node_modules").mkdir(exist_ok=True)
        pkg = host / "package.json"
        if not pkg.is_file():
            pkg.write_text(
                '{"name":"zr-workbuddy-host-placeholder","private":true}\n', encoding="utf-8"
            )
        (RUNTIME / "market" / "node_modules").mkdir(parents=True, exist_ok=True)
        pnpm_cjs = RUNTIME / "pnpm" / "node_modules" / "pnpm" / "bin" / "pnpm.cjs"
        pnpm_cjs.parent.mkdir(parents=True, exist_ok=True)
        if not pnpm_cjs.is_file():
            pnpm_cjs.write_text(
                'console.error("engine-only: no pnpm"); process.exit(1)\n', encoding="utf-8"
            )
    prune_staged_runtime()
    _slim_cursor_sdk_node()
    pack_install_archives()
    assert_builtin_user_manual_packaging()
    assert_company_market_packaging()
    assert_company_knowledge_packaging()

    run_syntax_checks()
    if skip_builder:
        log("SKIP_BUILDER=1：只准备 runtime，不跑 electron-builder")
        return
    log("同步桌面应用图标 → desktop/build/icon.png")
    _run([python_bin(), str(_LIB / "ensure_desktop_icon.py"), "--require"])
    if target == "win":
        log("NSIS：确保 UAC 杀进程 + 短路径解压/robocopy（防无法关闭与长路径白屏）")
        _run([python_bin(), str(_LIB / "ensure_nsis_install_kill_hooks.py")])
        stop_desktop_shell_for_pack()
        log("提示: 写 exe 图标前会结束桌面壳；失败时检查 release/win-unpacked 是否被占用")
    run_electron_builder(target)
    assert_bundle_first_ready(target)

    artifacts: List[str] = []
    zip_out = RELEASE / f"{DESKTOP_PRODUCT}-{version}.zip"
    if zip_out.is_file():
        artifacts.append("zip")
        log(f"zip: {zip_out}")
    dmg_ok = False
    if target == "mac":
        artifacts.append("dir")
        dmg_ok = maybe_make_dmg(version)
        if dmg_ok:
            artifacts.append("dmg")
    if target == "win":
        artifacts.append("dir")
        nsis = list(RELEASE.glob("*.exe"))
        nsis = [p for p in nsis if "unins" not in p.name.lower()]
        if not nsis:
            die("未找到 NSIS 安装包（*.exe）")
        artifacts.append("nsis")
        for p in nsis:
            log(f"NSIS: {p}")

    note = "宿主一体包；配置中心填写 Key 后即可聊、可调工具。"
    if mode != "unified":
        note = "仅引擎壳；完整聊天需本机 dsh 或改用 unified 打包"
    write_build_info(mode, target, version, ",".join(artifacts) or "dir", note)
    write_update_feed(target, version)
    # 打包成功 = 必须上线（清单 + 安装包）；失败则整次发版失败。破窗：WORKBUDDY_DESKTOP_SKIP_UPLOAD=1
    if not skip_builder and target in {"win", "mac"}:
        from upload_desktop_feed import upload_and_prune

        upload_and_prune(target, version, RELEASE)
    elif skip_builder:
        log("skip-builder：跳过自动上传（未打安装包）")
    log(f"完成。安装包目录: {RELEASE}")
    if target == "win":
        log("Windows 未签名：SmartScreen 可能提示，选「仍要运行」。")
        log("一体包：内嵌 Host + Node≥22 + 引擎；安装后在配置中心填 Key 即可用。")
    elif target == "mac":
        log("macOS 未签名：若拦截，请右键「打开」一次。")
        log("一体包：内嵌 Host + Node≥22 + 引擎；启动用内嵌 Node 跑 dsh（勿用 Electron Node 20）。")


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description="ZR WorkBuddy 跨平台桌面一体打包")
    ap.add_argument(
        "mode",
        nargs="?",
        default="unified",
        help="unified | engine | mac | win（mac/win 仅当与本机一致）",
    )
    ap.add_argument("--preflight", action="store_true", help="只检查本机能否打包，不构建")
    ap.add_argument("--skip-builder", action="store_true", help="只准备 runtime，不跑 electron-builder")
    ap.add_argument(
        "--bump",
        choices=["patch", "minor", "major"],
        default="patch",
        help="打包自动抬安装包版本号档位（默认 patch：0.2.26→0.2.27）",
    )
    ap.add_argument("--no-bump", action="store_true", help="本次打包不抬版本号（重打同版本调试用）")
    ap.add_argument("--set-version", default="", help="直接指定版本号（如 0.3.0；优先于 --bump）")
    ap.add_argument(
        "--skip-upload",
        action="store_true",
        help="跳过发版上传（等同 WORKBUDDY_DESKTOP_SKIP_UPLOAD=1；仅本机调试）",
    )
    return ap.parse_args(list(argv) if argv is not None else None)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    mode = args.mode
    cli_target = ""
    if mode in {"mac", "win", "linux"}:
        cli_target = mode
        mode = "unified"
    elif mode in {"unified", "host", "一体"}:
        mode = "unified"
    elif mode in {"engine", "engine-only", "simple"}:
        mode = "engine"
    else:
        die(f"未知参数: {mode}（unified | engine | mac | win）")
    target = detect_pack_target(cli_target)
    if args.preflight:
        preflight(target)
        return 0
    skip_builder = args.skip_builder or _env_flag("SKIP_BUILDER")
    if args.no_bump and args.set_version:
        die("--no-bump 与 --set-version 不能同时用")
    if args.skip_upload:
        os.environ["WORKBUDDY_DESKTOP_SKIP_UPLOAD"] = "1"
    package(
        mode,
        target,
        skip_builder=skip_builder,
        bump="" if args.no_bump else args.bump,
        set_version=args.set_version,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
