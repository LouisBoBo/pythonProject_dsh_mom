"""裁剪桌面一体包里不需要的测试/文档/source map/类型声明。

Windows NSIS 安装时间主要花在「解压 + 创建数万小文件」——每个文件都要创建 + 被杀毒实时扫描。
所以「减文件数」比「减体积」更能缩短安装时间。本模块只删「运行时绝不加载」的文件：
- 宿主 node_modules 的 tests / *.map / *.md / *.d.ts（dsh 跑编译后 .js，无 tsx/esbuild，.d.ts 从不执行）
- CPython site-packages 的 tests / *.pyc 等
不删除名为 test 的 npm 包目录（node_modules/test），也不删 numpy.testing 这类 testing/ 公共模块。
合规：保留 LICENSE/NOTICE/COPYING 等法律文件（许可证要求再分发附带声明），只删 CHANGELOG 类非法律文档。
"""

from __future__ import annotations

import os
import re
import stat
from pathlib import Path

SKIP_DIRS = {
    "tests",
    "__tests__",
    "__pycache__",
    ".pytest_cache",
    ".github",
    "example",
    "examples",
}

# 只在「被裁剪组件的根目录第一层」才删的目录。
# CPython 运行时的 include/（C 头文件）与 libs/（链接用 .lib）只在「编译 C 扩展」时才用；
# 运行时依赖都是预编译 wheel，且目标机没有编译器，删了不影响运行。
# 已核实 host/market/pnpm/app 根级没有同名目录，故只命中 python，不误伤。
ROOT_SKIP_DIRS = {"include", "libs"}

# doc/docs 通常是文档，但有些包把运行时代码放在里面
# （如 yaml 的 dist/doc/directives.js 被 compose/composer.js require，删了宿主 fatal load failure）。
# 所以 doc/docs 只删「纯文档」的；含 .js/.mjs/.cjs 的是运行时代码，必须保留。
DOC_DIRS = {"doc", "docs"}
SKIP_SUFFIXES = {".map", ".pyc", ".pyo"}
SKIP_NAMES = {".ds_store", "thumbs.db"}

# TypeScript 类型声明：Node 运行时从不加载（类型只在编译期用）。这是 host 文件数大头（约 8900 个）。
_DECL_SUFFIXES = (".d.ts", ".d.mts", ".d.cts")

# 发行说明/社区文档（非法律文件）。匹配「去扩展名后的主名」，且扩展名只能是文档类，
# 避免误伤 history.js 这类同名运行时代码。LICENSE/NOTICE/COPYING/PATENT 不在此列（合规保留）。
_DOC_STEMS = {
    "changelog",
    "changes",
    "history",
    "contributing",
    "code_of_conduct",
    "authors",
    "security",
    "backers",
    "sponsors",
}
_DOC_EXTS = {"", ".txt", ".rst", ".markdown"}  # .md 已被既有规则删除

# tsconfig.json / tsconfig.build.json / jsconfig.json 等「TS 编译配置」，运行时不用。
_TSCONFIG_RE = re.compile(r"^(tsconfig|jsconfig)([.\-].*)?\.json$")

# dsh 把多家 LLM 厂商 SDK 全打进嵌套 node_modules，但本应用只用 DeepSeek。
# 安全性（已逐一核实，见打包注释/复盘）：
#   1. pi-ai 的 provider 走 .lazy.js 动态 import——某厂商 SDK 只在「该厂商第一次真正发起请求」
#      时才加载（lazy.js 注释：The module loads on first stream call）。DeepSeek-only 场景下
#      这些厂商 SDK 永远不会被加载；即便误选该厂商，也只是该次 stream 报错，不拖垮宿主。
#   2. 依赖/引用分析：这些 SDK 树自包含——树外仅 @earendil-works/pi-ai 引用（懒加载）。
#   3. 只删 node_modules 里的 SDK 实体包；保留 pi-ai 的 provider 模块与 .lazy 包装器
#      （all.js 静态 import 它们），静态 import 图不破，宿主正常启动。
# 明确保留：openai（DeepSeek 经 openAICompletionsApi 用它，删了主功能就挂）；
#           @opentelemetry（被 dsh-session-telemetry-otel 引用，可能启动初始化，不勉强）。
# 官方壳把这些原生库留到 Office / 本地语音真正调用时再加载。
# WorkBuddy 聊天、问数、写码、审码、提交、部署不在启动时 require 它们。
# 只删平台二进制包，保留 libreoffice-kit / sherpa-onnx-node 的 JS 入口，避免宿主启动时模块图断裂。
DSH_DEFERRED_NATIVE_PACKAGES = (
    "@deepseek-ai/libreoffice-kit-win32-x64",
    "@deepseek-ai/libreoffice-kit-win32-arm64",
    "@deepseek-ai/libreoffice-kit-darwin-x64",
    "@deepseek-ai/libreoffice-kit-darwin-arm64",
    "@deepseek-ai/libreoffice-kit-wasm",
    "sherpa-onnx-win-x64",
    "sherpa-onnx-win-ia32",
    "sherpa-onnx-linux-x64",
    "sherpa-onnx-linux-arm64",
    "sherpa-onnx-darwin-x64",
    "sherpa-onnx-darwin-arm64",
)


DSH_UNUSED_PROVIDER_SDKS = (
    "@mistralai",    # Mistral
    "@anthropic-ai", # Anthropic
    "@aws-sdk",      # AWS Bedrock（含 @smithy/@aws-crypto 依赖树）
    "@smithy",
    "@aws-crypto",
)


def _rmtree(path: Path) -> None:
    def _onerror(func, p, _exc) -> None:  # type: ignore[no-untyped-def]
        try:
            os.chmod(p, stat.S_IWRITE)
            func(p)
        except OSError:
            pass

    if path.is_dir():
        import shutil

        shutil.rmtree(path, onerror=_onerror)
    elif path.is_file():
        try:
            path.unlink()
        except OSError:
            pass


def _count_files(root: Path) -> tuple[int, int]:
    n = 0
    b = 0
    if root.is_file():
        try:
            return 1, int(root.stat().st_size)
        except OSError:
            return 1, 0
    for dirpath, _dns, fns in os.walk(root):
        for name in fns:
            n += 1
            try:
                b += int((Path(dirpath) / name).stat().st_size)
            except OSError:
                pass
    return n, b


def _doc_dir_is_code(path: Path) -> bool:
    """doc/docs 里若含 .js/.mjs/.cjs，则是运行时代码（如 yaml 的 dist/doc），不能删。"""
    try:
        for _dp, _dn, fns in os.walk(path):
            for fn in fns:
                if Path(fn.lower()).suffix in {".js", ".mjs", ".cjs"}:
                    return True
    except OSError:
        pass
    return False


def _keep_builtin_manual(path: Path) -> bool:
    """预置用户手册必须进安装包。裁剪会删全部 .md，这里单独留下这份种子。"""
    if path.suffix.lower() != ".md":
        return False
    parts = [p.lower() for p in path.parts]
    return "config" in parts and "builtin-knowledge" in parts


def _drop_file(name: str) -> bool:
    low = name.lower()
    if low in SKIP_NAMES:
        return True
    # .d.ts/.d.mts/.d.cts 类型声明：运行时从不加载（host 文件数大头）。
    if low.endswith(_DECL_SUFFIXES):
        return True
    # TS 编译缓存。
    if low.endswith(".tsbuildinfo"):
        return True
    suf = Path(low).suffix
    if suf in SKIP_SUFFIXES:
        return True
    if low.endswith(".md"):
        return True
    # tsconfig/jsconfig 及其变体（TS 编译配置，运行时不用）。
    if suf == ".json" and _TSCONFIG_RE.match(low):
        return True
    # 非法律文档（CHANGELOG/HISTORY/CONTRIBUTING 等）；保留 LICENSE/NOTICE 等法律文件。
    if suf in _DOC_EXTS:
        stem = low[: -len(suf)] if suf else low
        if stem in _DOC_STEMS:
            return True
    return False


def prune_pack_junk(root: Path) -> tuple[int, int]:
    """删除 root 下测试目录、source map、markdown、类型声明、TS 配置、非法律文档等运行时无用文件。

    返回 (删除文件数, 释放字节)。只删「运行时绝不加载」的；保留运行时代码与 LICENSE/NOTICE 法律文件。
    """
    root = Path(root)
    if not root.is_dir():
        return 0, 0
    removed_n = 0
    removed_b = 0
    for dirpath, dirnames, filenames in os.walk(root, topdown=True):
        is_root = Path(dirpath) == root
        keep: list[str] = []
        for d in dirnames:
            low = d.lower()
            if (
                low in SKIP_DIRS
                or (is_root and low in ROOT_SKIP_DIRS)
                or (low in DOC_DIRS and not _doc_dir_is_code(Path(dirpath) / d))
            ):
                p = Path(dirpath) / d
                n, b = _count_files(p)
                _rmtree(p)
                removed_n += n
                removed_b += b
            else:
                keep.append(d)
        dirnames[:] = keep
        here = Path(dirpath)
        for name in filenames:
            p = here / name
            if _keep_builtin_manual(p):
                continue
            if not _drop_file(name):
                continue
            try:
                removed_b += int(p.stat().st_size)
            except OSError:
                pass
            try:
                p.unlink()
                removed_n += 1
            except OSError:
                pass
    return removed_n, removed_b


def _python_lib_dirs(python_root: Path) -> list[Path]:
    out: list[Path] = []
    lib = python_root / "Lib"
    if lib.is_dir():
        out.append(lib)
    base = python_root / "lib"
    if base.is_dir():
        out.extend(p for p in sorted(base.glob("python*")) if p.is_dir())
    return out


def prune_embedded_python_extras(python_root: Path) -> tuple[int, int]:
    """删内嵌 CPython 里桌面用不到的 Tcl/Tk、IDLE、ensurepip 轮子。

    问数仍依赖 numpy / pandas / matplotlib，这里不动它们，只删：
    - tcl、tkinter、idlelib、turtledemo（没有 GUI）
    - ensurepip（site-packages 里已有 pip，修复依赖不用这份轮子）
    - numpy/f2py（只在目标机编译 C 扩展时才用）
    - matplotlib 示例数据（出图不读 sample_data；字体目录保留）
    """
    root = Path(python_root)
    if not root.is_dir():
        return 0, 0
    targets = [root / "tcl"]
    for lib in _python_lib_dirs(root):
        for name in ("tkinter", "idlelib", "turtledemo", "ensurepip"):
            targets.append(lib / name)
        targets.append(lib / "site-packages" / "numpy" / "f2py")
        targets.append(lib / "site-packages" / "matplotlib" / "mpl-data" / "sample_data")
    removed_n = 0
    removed_b = 0
    for path in targets:
        if not path.exists():
            continue
        try:
            path.resolve().relative_to(root.resolve())
        except ValueError:
            continue
        n, b = _count_files(path)
        _rmtree(path)
        removed_n += n
        removed_b += b
    return removed_n, removed_b


def prune_dsh_unused_provider_sdks(host_root: Path) -> tuple[int, int]:
    """删除宿主内 dsh 嵌套 node_modules 里「懒加载且本应用永不用」的 LLM 厂商 SDK。

    只针对 host 组件；路径不存在则安全返回 (0, 0)。返回 (删除文件数, 释放字节)。
    保留 openai（DeepSeek 经它）与 @opentelemetry（dsh 遥测用）。详见 DSH_UNUSED_PROVIDER_SDKS 注释。
    """
    nm = Path(host_root) / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules"
    if not nm.is_dir():
        return 0, 0
    removed_n = 0
    removed_b = 0
    for name in DSH_UNUSED_PROVIDER_SDKS:
        p = nm / name
        if not p.is_dir():
            continue
        n, b = _count_files(p)
        _rmtree(p)
        removed_n += n
        removed_b += b
    return removed_n, removed_b


def _deferred_native_path(nm: Path, name: str) -> Path:
    if name.startswith("@deepseek-ai/"):
        return nm / "@deepseek-ai" / name.split("/", 1)[1]
    return nm / name


def prune_dsh_deferred_native_runtimes(host_root: Path) -> tuple[int, int]:
    """去掉宿主里不参与聊天启动的原生大包（LibreOffice 引擎、sherpa 语音模型）。"""
    nm = Path(host_root) / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules"
    if not nm.is_dir():
        return 0, 0
    removed_n = 0
    removed_b = 0
    for name in DSH_DEFERRED_NATIVE_PACKAGES:
        path = _deferred_native_path(nm, name)
        if not path.exists():
            continue
        try:
            path.resolve().relative_to(nm.resolve())
        except ValueError:
            continue
        n, b = _count_files(path)
        _rmtree(path)
        removed_n += n
        removed_b += b
    return removed_n, removed_b
