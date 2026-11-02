#!/usr/bin/env python3
"""构建桌面运行时：standalone CPython + venv + apps/zr-workbuddy（对齐 simplified）。

产出 desktop/runtime/
  python/   # venv
  app/      # 业务应用树
  bin/workbuddy-engine
"""
from __future__ import annotations

import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "desktop" / "runtime"
CACHE = OUT / "_cache"
STANDALONE_ROOT = OUT / "_cpython"
VENV = OUT / "python"
APP = OUT / "app"
BIN = OUT / "bin"

CPYTHON_TAG = "20250317"
CPYTHON_VERSION = "3.12.9"
# 裁剪规则变化时 +1，让已有 runtime 再走一次「可导入则裁剪」，不必整树 pip。
PYTHON_SLIM_REV = "1"
PACK_IMPORT = (
    "import fastapi, uvicorn, yaml, httpx, numpy, pandas, matplotlib, cursor_sdk; "
    "print('runtime_import_ok')"
)


def _on_rm_error(func, path, _excinfo) -> None:
    try:
        # 0o700：Windows 关键是 S_IWRITE（去只读）；POSIX 必须保留 r/x，
        # 否则 S_IWRITE(0o200) 会把目录改成 d-w-------，遍不进也删不掉。
        os.chmod(path, stat.S_IRUSR | stat.S_IWUSR | stat.S_IXUSR)
        # Python 3.12+ onexc 回调里 func 可能是 os.open（缺 flags 不能直接调），
        # 统一按文件/目录分别删，不依赖 func。
        if os.path.isdir(path):
            os.rmdir(path)
        else:
            os.remove(path)
    except OSError:
        pass


def _rmtree(path: Path) -> None:
    """Windows 上 shutil.rmtree 常因杀毒/句柄抢到 WinError 145，须重试。"""
    if not path.exists():
        return
    last: Exception | None = None
    for i in range(8):
        try:
            shutil.rmtree(path, onerror=_on_rm_error)
            if not path.exists():
                return
        except OSError as exc:
            last = exc
            time.sleep(0.3 * (i + 1))
    if os.name == "nt":
        subprocess.run(["cmd", "/c", "rmdir", "/s", "/q", str(path)], check=False)
        if not path.exists():
            return
    raise RuntimeError(f"无法删除 {path}: {last}")


def _log(msg: str) -> None:
    print(f"[build-runtime] {msg}", flush=True)


def _ensure_lib_path() -> None:
    lib = REPO / "scripts" / "lib"
    if str(lib) not in sys.path:
        sys.path.insert(0, str(lib))


def _req_file() -> Path:
    return REPO / "apps" / "zr-workbuddy" / "engine" / "requirements.txt"


def _resolve_vendor_tools(repo: Path = REPO) -> Path:
    """vendor dsh-tools 在仓库里只认软链；缺失时回退宿主，找不到就拒绝打包。"""
    vendor = repo / "vendor" / "@deepseek-ai" / "dsh-tools"
    if vendor.is_dir():
        return vendor
    _ensure_lib_path()
    from align_dsh_tools import find_host_tools

    host = find_host_tools()
    if host is None:
        raise FileNotFoundError(
            f"缺少 {vendor}，且未找到宿主 dsh-tools；先运行 scripts/check-vendor.sh --fix"
        )
    _log(f"缺少 {vendor}，改用宿主 dsh-tools: {host}")
    return host


def _prune_tree(root: Path, label: str) -> None:
    _ensure_lib_path()
    from prune_pack_junk import prune_pack_junk

    n, b = prune_pack_junk(root)
    if n:
        _log(f"裁剪 {label}: -{n} 文件 ({b / 1024 / 1024:.1f} MB)")


def _post_python_slim() -> None:
    """测试/文档 + 用不到的 Tcl/Tk。问数用的 numpy/pandas/matplotlib 保留。"""
    _prune_tree(VENV, "python")
    _ensure_lib_path()
    from prune_pack_junk import prune_embedded_python_extras

    n, b = prune_embedded_python_extras(VENV)
    if n:
        _log(f"裁剪内嵌 Python 无用标准库: -{n} 文件 ({b / 1024 / 1024:.1f} MB)")


def _runtime_stamp_body() -> str:
    _ensure_lib_path()
    from py_modules_stamp import requirements_hash, runtime_stamp_text

    return runtime_stamp_text(
        CPYTHON_VERSION,
        requirements_hash(_req_file()),
        PYTHON_SLIM_REV,
    )


def _write_stamps() -> None:
    _ensure_lib_path()
    from find_python import ENGINE_MODULES
    from py_modules_stamp import RUNTIME_STAMP_NAME, write_modules_stamp

    write_modules_stamp(VENV, _req_file(), ENGINE_MODULES)
    (VENV / RUNTIME_STAMP_NAME).write_text(_runtime_stamp_body(), encoding="utf-8", newline="\n")


def _imports_ok(py: Path) -> bool:
    try:
        proc = subprocess.run(
            [str(py), "-c", PACK_IMPORT],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()
        _log("依赖导入失败: " + (tail[-1] if tail else f"exit {proc.returncode}"))
        return False
    return True


def _try_reuse_python() -> bool:
    """依赖没变就不要删掉整棵 Python 再 pip。这是「每次打包都要很久」的主要原因。"""
    flag = os.environ.get("WORKBUDDY_REBUILD_PYTHON", "").strip().lower()
    if flag in {"1", "true", "yes", "on"}:
        _log("WORKBUDDY_REBUILD_PYTHON：强制重建内嵌 Python")
        return False
    try:
        py = find_interpreter(VENV)
    except FileNotFoundError:
        return False
    _ensure_lib_path()
    from py_modules_stamp import RUNTIME_STAMP_NAME

    stamp = VENV / RUNTIME_STAMP_NAME
    expected = _runtime_stamp_body()
    if stamp.is_file() and stamp.read_text(encoding="utf-8").replace("\r\n", "\n") == expected:
        _log("复用已有内嵌 Python（CPython / requirements / 裁剪版本未变，跳过解压与 pip）")
        return True
    if not _imports_ok(py):
        _log("已有内嵌 Python 但依赖不完整，将重新安装")
        return False
    _log("已有内嵌 Python 且依赖可导入，裁剪后跳过 pip")
    _post_python_slim()
    _write_stamps()
    return True


def _run(cmd: list[str], **kwargs) -> None:
    _log("+ " + " ".join(cmd))
    subprocess.check_call(cmd, **kwargs)


def _platform_triplet() -> tuple[str, str]:
    sysname = platform.system().lower()
    machine = platform.machine().lower()
    if sysname == "darwin":
        if machine in ("arm64", "aarch64"):
            return "aarch64-apple-darwin", "macOS Apple Silicon"
        return "x86_64-apple-darwin", "macOS Intel/Rosetta"
    if sysname == "windows":
        if machine in ("arm64", "aarch64"):
            return "aarch64-pc-windows-msvc", "Windows ARM64"
        return "x86_64-pc-windows-msvc", "Windows x64"
    if sysname == "linux":
        if machine in ("arm64", "aarch64"):
            return "aarch64-unknown-linux-gnu", "Linux ARM64"
        return "x86_64-unknown-linux-gnu", "Linux x64"
    raise RuntimeError(f"暂不支持打包平台: {sysname}/{machine}")


def iter_interpreter_candidates(home: Path):
    """python-build-standalone：Unix 在 bin/python3，Windows 多在前缀根目录 python.exe。"""
    names = ("python.exe", "python3.exe", "python3", "python")
    folders = (
        home,
        home / "bin",
        home / "Scripts",
        home / "python",
        home / "python" / "bin",
        home / "python" / "Scripts",
    )
    for folder in folders:
        for name in names:
            yield folder / name


def find_interpreter(home: Path) -> Path:
    for cand in iter_interpreter_candidates(home):
        if cand.is_file():
            return cand
    raise FileNotFoundError(f"未找到 python: {home}")


def python_home_of(exe: Path) -> Path:
    exe = exe.resolve()
    parent = exe.parent
    if parent.name.lower() in ("bin", "scripts"):
        return parent.parent
    return parent


PACKAGED_LIB_SCRIPTS = (
    "read_runtime.py",
    # win_hide：ensure_runtime / align_dsh_tools / merge_company_dsh_market 顶层 import，漏打即启动失败
    "win_hide.py",
    "merge_company_dsh_market.py",
    "ensure_runtime.py",
    # ensure_runtime 顶层 import；漏打即 ModuleNotFoundError，桌面弹「启动失败」（0.2.67）
    "py_modules_stamp.py",
    # ensure_runtime 顶层 import；漏打即 ModuleNotFoundError，桌面弹「启动失败」（0.2.45）
    "ensure_cursor_chat_align.py",
    "ensure_cursor_chat_sidecar.py",
    "purge_broken_profile_bundles.py",
    "ensure_dsh_core_bundles.py",
    "align_dsh_tools.py",
    "ensure_cursor_sdk_zod.py",
    "ensure_dsh_deepseek_credential.py",
    "ensure_company_knowledge.py",
    "ensure_local_user_manual.py",
    "ensure_dshmarket.py",
    "find_python.py",
    "npm_pkg_integrity.py",
    "verify_company_dsh_market.py",
    "ensure_dsh_knowledge.py",
    "ensure_dsh_llm_meter.py",
    "port_listen.py",
    "native_path.py",
    # win_hide 被 ensure_runtime / align_dsh_tools / merge_company_dsh_market import，
    # 漏打进包会让全新安装（runtime-app 重拷）报 ModuleNotFoundError: win_hide。
    "win_hide.py",
)


def _cpython_urls(tag: str, name: str) -> list[str]:
    github = (
        "https://github.com/astral-sh/python-build-standalone/releases/download/"
        f"{tag}/{name}"
    )
    extra = (os.environ.get("CPYTHON_DIST_URL") or "").strip()
    out = []
    if extra:
        out.append(extra)
    out.extend(
        [
            f"https://ghfast.top/{github}",
            f"https://ghproxy.net/{github}",
            f"https://mirror.ghproxy.com/{github}",
            github,
        ]
    )
    seen = set()
    uniq: list[str] = []
    for url in out:
        if url in seen:
            continue
        seen.add(url)
        uniq.append(url)
    return uniq


def _download_file(url: str, dest: Path, timeout: int = 45) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    if tmp.exists():
        tmp.unlink()
    curl = shutil.which("curl") or shutil.which("curl.exe")
    if curl:
        cmd = [
            curl,
            "-L",
            "--fail",
            "--retry",
            "2",
            "--connect-timeout",
            "20",
            "--max-time",
            str(max(timeout, 300)),
            "-A",
            "workbuddy-package-desktop/1.0",
            "-o",
            str(tmp),
            url,
        ]
        subprocess.check_call(cmd)
    else:
        req = urllib.request.Request(
            url, headers={"User-Agent": "workbuddy-package-desktop/1.0"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp, tmp.open("wb") as fh:
            while True:
                chunk = resp.read(1024 * 1024)
                if not chunk:
                    break
                fh.write(chunk)
    if not tmp.is_file() or tmp.stat().st_size < 1000:
        if tmp.exists():
            tmp.unlink()
        raise RuntimeError(f"下载结果过小: {url}")
    tmp.replace(dest)


def _download_first(urls: list[str], dest: Path) -> None:
    last: Exception | None = None
    for url in urls:
        try:
            _log(f"下载 {url}")
            _download_file(url, dest)
            return
        except Exception as exc:  # noqa: BLE001
            last = exc
            _log(f"失败，换源: {exc}")
            part = dest.with_suffix(dest.suffix + ".part")
            if part.exists():
                part.unlink()
            if dest.exists() and dest.stat().st_size < 1000:
                dest.unlink()
    raise RuntimeError(f"下载失败: {dest.name} ({last})")


def ensure_standalone_python() -> Path:
    triplet, label = _platform_triplet()
    _log(f"目标平台: {label} ({triplet})")
    name = f"cpython-{CPYTHON_VERSION}+{CPYTHON_TAG}-{triplet}-install_only.tar.gz"
    CACHE.mkdir(parents=True, exist_ok=True)
    tarball = CACHE / name
    if tarball.is_file() and tarball.stat().st_size > 1_000_000:
        _log(f"使用缓存 {tarball}")
    else:
        _download_first(_cpython_urls(CPYTHON_TAG, name), tarball)

    if STANDALONE_ROOT.exists():
        _rmtree(STANDALONE_ROOT)
    STANDALONE_ROOT.mkdir(parents=True, exist_ok=True)
    _log(f"解压 → {STANDALONE_ROOT}")
    with tarfile.open(tarball, "r:gz") as tf:
        tf.extractall(STANDALONE_ROOT)

    return find_interpreter(STANDALONE_ROOT)


def create_venv(standalone_py: Path) -> Path:
    """把 standalone CPython 整树拷进 runtime/python（解引用符号链接，保证可随包迁移）。

    不用 venv：venv 会把 home 写成构建机绝对路径，打进 .app 后 python 断链。
    """
    src_root = python_home_of(standalone_py)
    has_unix = (src_root / "bin").is_dir()
    has_win = (src_root / "python.exe").is_file() or (src_root / "Scripts").is_dir()
    if not has_unix and not has_win:
        raise FileNotFoundError(f"standalone 根目录异常: {src_root}")
    if VENV.exists():
        _rmtree(VENV)
    _log(f"复制可迁移 Python → {VENV}（from {src_root}）")
    shutil.copytree(src_root, VENV, symlinks=False)
    if os.name != "nt":
        py3 = VENV / "bin" / "python3"
        py_link = VENV / "bin" / "python"
        if py3.is_file() and not py_link.exists():
            py_link.symlink_to("python3")
    py = find_interpreter(VENV)
    real = py.resolve()
    try:
        real.relative_to(VENV.resolve())
    except ValueError as exc:
        raise RuntimeError(f"Python 未封闭在 runtime/python 内: {real}") from exc
    return py


def _pip_index_args() -> list[str]:
    index = (os.environ.get("PIP_INDEX_URL") or "https://pypi.tuna.tsinghua.edu.cn/simple").strip()
    host = "pypi.tuna.tsinghua.edu.cn"
    if "aliyun" in index:
        host = "mirrors.aliyun.com"
    elif "pypi.org" in index:
        host = "pypi.org"
    return [
        "-i",
        index,
        "--trusted-host",
        host,
        "--default-timeout",
        "60",
        "--prefer-binary",
    ]


def pip_install(venv_py: Path) -> None:
    req = _req_file()
    extra = _pip_index_args()
    _log(f"pip 源: {extra[1]}")
    _run([str(venv_py), "-m", "pip", "install", "-U", "pip", "wheel", *extra])
    _run([str(venv_py), "-m", "pip", "install", "-r", str(req), *extra])
    _run([str(venv_py), "-c", PACK_IMPORT])
    _post_python_slim()


def materialize_bridge_node_modules(app_root: Path) -> None:
    """打包时忽略了 plugins 下 node_modules；Node 解析 import 需要真实 node_modules。"""
    bridge = app_root / "apps" / "zr-workbuddy" / "plugins" / "mes-bridge"
    tools_src = app_root / "vendor" / "@deepseek-ai" / "dsh-tools"
    runtime_src = app_root / "apps" / "zr-workbuddy" / "plugins" / "mes-runtime"
    if not bridge.is_dir():
        raise FileNotFoundError(bridge)
    nm = bridge / "node_modules"
    tools_dst = nm / "@deepseek-ai" / "dsh-tools"
    runtime_dst = nm / "@dsh-external" / "mes-runtime"
    if tools_src.is_dir():
        if tools_dst.exists():
            _rmtree(tools_dst)
        tools_dst.parent.mkdir(parents=True, exist_ok=True)
        _copytree(tools_src, tools_dst)
        _log("物化 mes-bridge → @deepseek-ai/dsh-tools")
    else:
        _log(f"警告: 缺少 {tools_src}")
    if runtime_src.is_dir():
        runtime_dst.parent.mkdir(parents=True, exist_ok=True)
        if runtime_dst.exists() or runtime_dst.is_symlink():
            if runtime_dst.is_symlink() or not runtime_dst.is_dir():
                runtime_dst.unlink()
            else:
                _rmtree(runtime_dst)
        # Windows junction 是绝对路径，打进安装包会指到构建机。安装包里改成实拷。
        if os.name == "nt":
            _copytree(runtime_src, runtime_dst)
        else:
            os.symlink(os.path.join("..", "..", "..", "mes-runtime"), runtime_dst)
        _log("物化 mes-bridge → @dsh-external/mes-runtime")


_JUNK_NAMES = shutil.ignore_patterns(
    "__pycache__",
    "*.pyc",
    ".pytest_cache",
    "node_modules",
    ".venv",
    "venv",
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "config.yaml",
    "chat_log.jsonl",
    "engine.pid",
    "engine.log",
    "charts",
    ".mplcache",
    "local_dev",
    "sandboxes",
    "feature_quarantine",
    "feature_install_tmp",
    "_test_*",
    "_git_probe",
    "_empty_tpl",
)


def _ignore_copy(directory: str, names: list[str]) -> set[str]:
    """忽略缓存/密钥/运行时数据；不得按目录名丢掉 app/code_* 源码包。"""
    skipped = set(_JUNK_NAMES(directory, names))
    here = Path(directory)
    # engine/data 下除 plugins.json 外都是 Job/沙箱落盘，不进安装包
    if here.name == "data" and here.parent.name == "engine":
        skipped.update(n for n in names if n != "plugins.json")
    return skipped


def _copytree(src: Path, dst: Path) -> None:
    if dst.exists():
        _rmtree(dst)
    shutil.copytree(src, dst, ignore=_ignore_copy)


def _assert_workbuddy_capabilities(app_root: Path) -> None:
    """打包后必须仍有写码/审码/提交/部署算数与 features，禁止再静默丢模块。"""
    engine_app = app_root / "engine" / "app"
    for pkg in ("code_dev", "code_review", "code_commit", "code_deploy", "hitl"):
        init = engine_app / pkg / "__init__.py"
        if not init.is_file():
            raise FileNotFoundError(f"打包漏了引擎模块 {pkg}（{init}）")
    features = app_root / "features"
    for fid in (
        "code-dev",
        "code-review",
        "code-commit",
        "code-deploy",
        "mes-ask",
        "mes-config",
        "mes-pcb",
    ):
        manifest = features / fid / "manifest.json"
        index = features / fid / "index.js"
        if not manifest.is_file() or not index.is_file():
            raise FileNotFoundError(f"打包漏了 feature {fid}")
    _log("能力校验通过：code_dev/review/commit/deploy + 7 个 features")


def sync_app_sources() -> None:
    if APP.exists():
        _rmtree(APP)
    app_root = APP / "apps" / "zr-workbuddy"
    app_root.mkdir(parents=True)
    for name in ("engine", "plugins", "features"):
        src = REPO / "apps" / "zr-workbuddy" / name
        if not src.is_dir():
            raise FileNotFoundError(src)
        _log(f"复制 apps/zr-workbuddy/{name}")
        _copytree(src, app_root / name)

    # /api/about 读 apps/zr-workbuddy/VERSION；漏拷则一体包里恒为 0.0.0
    ver_src = REPO / "apps" / "zr-workbuddy" / "VERSION"
    if ver_src.is_file():
        shutil.copy2(ver_src, app_root / "VERSION")
        _log(f"复制 apps/zr-workbuddy/VERSION → {ver_src.read_text(encoding='utf-8').strip()}")
    else:
        _log("警告: 缺少 apps/zr-workbuddy/VERSION，一体包 /api/about 将回落 0.0.0")

    _prune_tree(app_root, "app")

    # 示例配置 → 安装包内模板（真密钥不进包）
    example = REPO / "apps" / "zr-workbuddy" / "engine" / "config" / "config.example.yaml"
    cfg_dir = app_root / "engine" / "config"
    cfg_dir.mkdir(parents=True, exist_ok=True)
    if example.is_file():
        shutil.copy2(example, cfg_dir / "config.example.yaml")
        # 首次可写副本名，运行时若无 config.yaml 由 main 复制
        shutil.copy2(example, cfg_dir / "config.yaml")

    # runtime.yaml 固定回环；端口由桌面壳注入环境覆盖时仍以文件为准，打包用高位口模板
    runtime = cfg_dir / "runtime.yaml"
    py_name = "python" if os.name == "nt" else "python3"
    runtime.write_text(
        "server:\n  host: 127.0.0.1\n  port: 18000\n"
        f"python: {py_name}\n",
        encoding="utf-8",
    )

    py_dst = APP / "desktop" / "py"
    py_dst.mkdir(parents=True)
    shutil.copy2(REPO / "desktop" / "py" / "run_engine.py", py_dst / "run_engine.py")

    # mes-runtime 经 REPO_ROOT/scripts/lib/read_runtime.py 读端口；一体包须自带
    scripts_lib = APP / "scripts" / "lib"
    scripts_lib.mkdir(parents=True)
    lib_src = REPO / "scripts" / "lib"
    for name in PACKAGED_LIB_SCRIPTS:
        src = lib_src / name
        if not src.is_file():
            raise FileNotFoundError(f"打包漏了启动门禁脚本 {src}")
        shutil.copy2(src, scripts_lib / name)
    _log(f"已打入 scripts/lib {len(PACKAGED_LIB_SCRIPTS)} 个门禁脚本")
    cfg_src = REPO / "apps" / "zr-workbuddy" / "config"
    cfg_dst = app_root / "config"
    cfg_dst.mkdir(parents=True, exist_ok=True)
    for name in (
        "company-dsh-plugins.seed.json",
        "company-dsh-market.env.example",
        "company-dsh-market.env",
        # 公司共享知识库种子：ensure_company_knowledge 启动时合并进 config.yaml。
        # 发版机有则必须打进包；缺文件时打包门禁仅软告警（中软正式包应配齐）。
        "company-knowledge.env.example",
        "company-knowledge.env",
    ):
        src = cfg_src / name
        if src.is_file():
            shutil.copy2(src, cfg_dst / name)
            _log(f"已打入 apps/zr-workbuddy/config/{name}")
    # 本机默认知识库预置手册（打开即有、免上传）
    builtin_src = cfg_src / "builtin-knowledge" / "用户操作手册.md"
    if builtin_src.is_file():
        builtin_dst = cfg_dst / "builtin-knowledge"
        builtin_dst.mkdir(parents=True, exist_ok=True)
        shutil.copy2(builtin_src, builtin_dst / "用户操作手册.md")
        _log("已打入 apps/zr-workbuddy/config/builtin-knowledge/用户操作手册.md")
    else:
        raise FileNotFoundError(f"打包漏了预置用户手册: {builtin_src}")

    # mes-bridge → link:../../../../vendor/@deepseek-ai/dsh-tools
    vendor_src = _resolve_vendor_tools()
    vendor_dst = APP / "vendor" / "@deepseek-ai" / "dsh-tools"
    vendor_dst.parent.mkdir(parents=True, exist_ok=True)
    _log("复制 vendor/@deepseek-ai/dsh-tools")
    _copytree(vendor_src, vendor_dst)

    # zod 修复 tarball：zod@3.25.0 官方误发（无 dist），干净机器上 ensure_cursor_sdk_zod
    # 需 npm pack 补 dist，但内嵌 Node 不带完整 npm。把已知良好的 zod tgz 打进包，
    # 运行时经 WORKBUDDY_ZOD_TARBALL 离线修复（见 desktop/main.js ensureRuntimeDeps）。
    zod_src = REPO / "vendor" / "zod"
    if zod_src.is_dir():
        zod_dst = APP / "vendor" / "zod"
        zod_dst.parent.mkdir(parents=True, exist_ok=True)
        _log("复制 vendor/zod（zod 离线修复 tarball）")
        _copytree(zod_src, zod_dst)
    else:
        _log(f"警告: 缺少 {zod_src}，干净机器 zod dist 修复将依赖运行时 npm")

    materialize_bridge_node_modules(APP)
    _assert_workbuddy_capabilities(app_root)

    ver = {
        "product": "ZR WorkBuddy",
        "desktop_version": _read_desktop_version(),
        "git_commit": _git_commit(),
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "python": CPYTHON_VERSION,
    }
    (APP / "version.json").write_text(
        json.dumps(ver, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    _log(f"版本清单 → {ver}")


def _read_desktop_version() -> str:
    pkg = REPO / "desktop" / "package.json"
    try:
        return str(json.loads(pkg.read_text(encoding="utf-8")).get("version") or "0.0.0")
    except Exception:
        return "0.0.0"


def _git_commit() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=str(REPO),
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return ""


def write_launchers() -> None:
    BIN.mkdir(parents=True, exist_ok=True)
    engine = BIN / ("workbuddy-engine.cmd" if os.name == "nt" else "workbuddy-engine")
    if os.name == "nt":
        engine.write_text(
            "@echo off\r\n"
            "set ROOT=%~dp0..\r\n"
            "set WORKBUDDY_ENGINE_DIR=%ROOT%\\app\\apps\\zr-workbuddy\\engine\r\n"
            "\"%ROOT%\\python\\Scripts\\python.exe\" \"%ROOT%\\app\\desktop\\py\\run_engine.py\" %*\r\n",
            encoding="utf-8",
        )
    else:
        engine.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            'ROOT="$(cd "$(dirname "$0")/.." && pwd)"\n'
            'export WORKBUDDY_ENGINE_DIR="$ROOT/app/apps/zr-workbuddy/engine"\n'
            'exec "$ROOT/python/bin/python3" "$ROOT/app/desktop/py/run_engine.py" "$@"\n',
            encoding="utf-8",
        )
        engine.chmod(engine.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    app_only = len(sys.argv) > 1 and sys.argv[1] in ("--app-only", "app", "sync-app")
    if not app_only:
        if not _try_reuse_python():
            standalone = ensure_standalone_python()
            venv_py = create_venv(standalone)
            pip_install(venv_py)
            _write_stamps()
    sync_app_sources()
    write_launchers()

    def _du(path: Path) -> str:
        try:
            return subprocess.check_output(["du", "-sh", str(path)], text=True).split()[0]
        except Exception:
            return "?"

    _log(f"完成 → {OUT}  python={_du(VENV)} app={_du(APP)}")
    _log("下一步: python scripts/lib/package_desktop.py  （自动按本机 OS 打 Mac zip 或 Windows NSIS）")


if __name__ == "__main__":
    main()
