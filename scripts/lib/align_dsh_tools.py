#!/usr/bin/env python3
"""把 vendor / DSH profile 里的 dsh-tools 对齐到宿主同一 realpath。

双实例 → TOOL_RUNTIME_SCHEDULER 的 Symbol() 不相等
→ ctx.tools[宿主Symbol] 为 undefined → reading 'prepare'。

Windows 全球 npm 布局是：
  %APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools
旧脚本只找 unix 的 ../lib/node_modules，在 Windows 上会「找不到宿主」并跳过，
profile 里市场插件再装一份副本后聊天就会红条。

Windows 目录链接用 junction（mklink /J，无需管理员）；禁止 rm -rf junction，
否则会顺着链接删掉宿主包。
"""
from __future__ import annotations

import argparse
import errno
import json
import os
import shutil
import stat
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable, List, Optional

from win_hide import popen_kwargs

PKG = "@deepseek-ai/dsh-tools"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def host_candidates(dsh_bin: Optional[Path], home: Path) -> List[Path]:
    out: List[Path] = []
    if dsh_bin is not None:
        raw = Path(dsh_bin).expanduser()
        try:
            bin_dir = raw.resolve().parent
        except OSError:
            bin_dir = raw.parent
        # dsh.cmd / dsh.ps1 与 node_modules 同级（Windows AppData/Roaming/npm）
        out.append(bin_dir / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules" / "@deepseek-ai" / "dsh-tools")
        if bin_dir.name.lower() == "bin":
            prefix = bin_dir.parent
            out.append(prefix / "lib" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules" / "@deepseek-ai" / "dsh-tools")
        out.append(bin_dir.parent / "lib" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules" / "@deepseek-ai" / "dsh-tools")
    home = home.expanduser()
    out.append(home / ".nvm" / "versions" / "node" / "v22.23.1" / "lib" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules" / "@deepseek-ai" / "dsh-tools")
    appdata = os.environ.get("APPDATA") or str(home / "AppData" / "Roaming")
    out.append(Path(appdata) / "npm" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules" / "@deepseek-ai" / "dsh-tools")
    # 去重保序
    seen = set()
    uniq: List[Path] = []
    for p in out:
        k = str(p)
        if k in seen:
            continue
        seen.add(k)
        uniq.append(p)
    return uniq


def which_dsh() -> Optional[Path]:
    for name in ("dsh.cmd", "dsh.exe", "dsh"):
        found = shutil.which(name)
        if found:
            return Path(found)
    env_bin = os.environ.get("DSH_BIN") or os.environ.get("WORKBUDDY_DSH_BIN") or ""
    if env_bin and Path(env_bin).is_file():
        return Path(env_bin)
    return None


def find_host_tools(dsh_bin: Optional[Path] = None, home: Optional[Path] = None) -> Optional[Path]:
    env_tools = os.environ.get("WORKBUDDY_HOST_DSH_TOOLS") or ""
    if env_tools:
        p = Path(env_tools)
        if (p / "package.json").is_file():
            return p
    host_root = os.environ.get("WORKBUDDY_HOST_ROOT") or ""
    if host_root:
        cand = (
            Path(host_root)
            / "node_modules"
            / "@deepseek-ai"
            / "dsh"
            / "node_modules"
            / "@deepseek-ai"
            / "dsh-tools"
        )
        if (cand / "package.json").is_file():
            return cand
    home = home or Path.home()
    dsh_bin = dsh_bin if dsh_bin is not None else which_dsh()
    for cand in host_candidates(dsh_bin, home):
        if (cand / "package.json").is_file():
            return cand
    return None


def _is_reparse(path: Path) -> bool:
    if path.is_symlink():
        return True
    try:
        st = path.lstat()
        attrs = getattr(st, "st_file_attributes", 0)
        return bool(attrs & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except OSError:
        return False


def _pkg_ver(path: Path) -> str:
    pj = path / "package.json"
    try:
        if pj.is_file():
            return str(json.loads(pj.read_text(encoding="utf-8")).get("version") or "?")
    except Exception:
        return "?"
    return "?"


def realpath(path: Path) -> str:
    try:
        if path.exists() or path.is_symlink() or _is_reparse(path):
            return str(path.resolve())
    except OSError:
        pass
    return ""


def _is_busy_oserror(exc: BaseException) -> bool:
    if not isinstance(exc, OSError):
        return False
    if exc.errno in {errno.EACCES, errno.EPERM, errno.EBUSY, errno.ENOTEMPTY}:
        return True
    winerr = getattr(exc, "winerror", None)
    # 5=ACCESS_DENIED, 32=SHARING_VIOLATION, 33=LOCK_VIOLATION
    return winerr in {5, 32, 33}


def remove_link_or_move(path: Path) -> Optional[Path]:
    """去掉将要覆盖的目录。junction 只用 rmdir，绝不 recursive 删除。

    Windows 上实体树 rename 常因杀毒/残留进程 EPERM；必须重试 + 唯一 bak 名 +
    rmtree 兜底，禁止一次 rename 失败就让启动整窗挂掉。
    """
    if not (path.exists() or path.is_symlink() or _is_reparse(path)):
        return None
    if _is_reparse(path) or path.is_symlink():
        if path.is_dir() and not path.is_symlink():
            path.rmdir()
        elif path.is_symlink() and path.is_dir():
            path.rmdir() if os.name == "nt" else path.unlink()
        else:
            try:
                path.unlink()
            except OSError:
                path.rmdir()
        return None

    last_err: Optional[BaseException] = None
    for i in range(8):
        bak = Path(f"{path}.bak-copy-{int(time.time() * 1000)}-{i}")
        try:
            path.rename(bak)
            try:
                shutil.rmtree(bak, ignore_errors=True)
            except Exception:
                pass
            return bak if bak.exists() else None
        except OSError as exc:
            last_err = exc
            if not _is_busy_oserror(exc):
                raise
            time.sleep(0.12 * (i + 1))

    for i in range(6):
        try:
            shutil.rmtree(path)
            return None
        except OSError as exc:
            last_err = exc
            if not _is_busy_oserror(exc):
                raise
            time.sleep(0.15 * (i + 1))

    if path.exists() or _is_reparse(path):
        raise RuntimeError(
            f"无法腾出目录以对接宿主（文件被占用）: {path}"
            + (f" ({last_err})" if last_err else "")
        )
    return None


def link_dir(link: Path, target: Path) -> None:
    link.parent.mkdir(parents=True, exist_ok=True)
    target = target.resolve()
    if os.name == "nt":
        r = subprocess.run(
            ["cmd.exe", "/c", "mklink", "/J", str(link), str(target)],
            capture_output=True,
            text=True,
            encoding="oem",
            errors="replace",
            **popen_kwargs(),
        )
        if r.returncode != 0:
            raise RuntimeError((r.stderr or r.stdout or "mklink failed").strip())
        return
    os.symlink(str(target), str(link), target_is_directory=True)


def align_one(label: str, path: Path, host: Path, *, do_fix: bool, create_missing: bool = False) -> dict:
    exists = path.exists() or path.is_symlink() or _is_reparse(path)
    result = {
        "label": label,
        "path": str(path),
        "exists": bool(exists),
        "ok": True,
        "fixed": False,
        "detail": "",
    }
    if not exists:
        # 新检出不含 vendor/@deepseek-ai/dsh-tools（仓库只认软链）；--fix 时按宿主现建
        if not (do_fix and create_missing):
            result["detail"] = "不存在（跳过）"
            return result
        h_real = realpath(host)
        try:
            link_dir(path, host)
        except Exception as exc:  # noqa: BLE001 — 门禁要把原因回给启动方，不抛栈
            result["ok"] = False
            result["detail"] = f"缺失且建链失败: {type(exc).__name__}: {exc}"
            return result
        p_real = realpath(path)
        result["exists"] = True
        result["real"] = p_real
        result["host_real"] = h_real
        result["ok"] = bool(p_real and h_real and os.path.normcase(p_real) == os.path.normcase(h_real))
        result["fixed"] = result["ok"]
        result["detail"] = "缺失，已按宿主建链" if result["ok"] else "缺失建链后仍不一致"
        return result
    h_real = realpath(host)
    p_real = realpath(path)
    result["real"] = p_real
    result["host_real"] = h_real
    result["ver"] = _pkg_ver(path)
    if p_real and h_real and os.path.normcase(p_real) == os.path.normcase(h_real):
        result["detail"] = "realpath 一致"
        return result
    result["ok"] = False
    result["detail"] = "realpath 不一致"
    if not do_fix:
        return result
    remove_link_or_move(path)
    link_dir(path, host)
    p_real = realpath(path)
    result["real"] = p_real
    if p_real and h_real and os.path.normcase(p_real) == os.path.normcase(h_real):
        result["ok"] = True
        result["fixed"] = True
        result["detail"] = "已链接到宿主"
        return result
    result["detail"] = "修复后仍不一致"
    result["ok"] = False
    return result


def iter_nested_tools(profile_nm: Path, skip: Path) -> Iterable[Path]:
    if not profile_nm.is_dir():
        return
    skip_res = str(skip.resolve()) if (skip.exists() or _is_reparse(skip)) else str(skip)
    for dirpath, dirnames, _files in os.walk(profile_nm):
        # Windows 会跟随 junction；禁止走进已对齐的宿主包
        for name in list(dirnames):
            child = Path(dirpath) / name
            if _is_reparse(child):
                dirnames.remove(name)
        p = Path(dirpath)
        if p.name == "dsh-tools" and p.parent.name == "@deepseek-ai":
            try:
                if os.path.normcase(str(p.resolve())) == os.path.normcase(skip_res):
                    continue
            except OSError:
                if os.path.normcase(str(p)) == os.path.normcase(str(skip)):
                    continue
            yield p


def align_all(
    *,
    repo_root: Optional[Path] = None,
    profile_dir: Optional[Path] = None,
    host: Optional[Path] = None,
    do_fix: bool = False,
    require: bool = False,
) -> dict:
    repo_root = repo_root or _repo_root()
    home = Path.home()
    profile_dir = profile_dir or Path(
        os.environ.get("DSH_PROFILE_DIR") or (home / ".dsh" / "profiles" / os.environ.get("DSH_PROFILE", "web"))
    )
    if host is not None:
        host = Path(host)
        if not (host / "package.json").is_file():
            host = None
    else:
        host = find_host_tools()
    report = {"host": str(host) if host else "", "items": [], "ok": True}
    if host is None:
        report["ok"] = not require
        report["detail"] = "未找到宿主 dsh-tools"
        return report
    vendor = repo_root / "vendor" / "@deepseek-ai" / "dsh-tools"
    profile_tools = profile_dir / "node_modules" / "@deepseek-ai" / "dsh-tools"
    items = [
        align_one("vendor", vendor, host, do_fix=do_fix, create_missing=True),
        align_one("profile", profile_tools, host, do_fix=do_fix, create_missing=True),
    ]
    for nest in iter_nested_tools(profile_dir / "node_modules", profile_tools):
        items.append(align_one("nested", nest, host, do_fix=do_fix))
    report["items"] = items
    report["ok"] = all(i["ok"] for i in items)
    return report


def _print_report(report: dict) -> None:
    host = report.get("host") or ""
    if not host:
        print("⚠️ 未找到宿主 @deepseek-ai/dsh-tools")
        if report.get("detail"):
            print(report["detail"])
        return
    print(f"host   {PKG} real={realpath(Path(host))}")
    print()
    for item in report.get("items") or []:
        mark = "✅" if item.get("ok") else "❌"
        print(f"{mark} {item.get('label')}: {item.get('detail')}")
        print(f"       path={item.get('path')}")
        if item.get("real"):
            print(f"       real={item.get('real')}")
        print()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Align dsh-tools to host realpath")
    parser.add_argument("--fix", action="store_true")
    parser.add_argument("--require", action="store_true", help="找不到宿主或未对齐则失败")
    parser.add_argument("--host-tools", type=Path, default=None)
    parser.add_argument("--profile-dir", type=Path, default=None)
    args = parser.parse_args(argv)
    report = align_all(
        do_fix=args.fix,
        require=args.require,
        host=args.host_tools,
        profile_dir=args.profile_dir,
    )
    _print_report(report)
    if not report.get("host"):
        if args.require:
            print("LOCKED：第一次安装必须找到宿主 dsh-tools，否则工具会 reading prepare", file=sys.stderr)
            return 1
        return 0
    if report.get("ok"):
        return 0
    if not args.fix:
        print("修复: python scripts/lib/align_dsh_tools.py --fix --require")
        print("然后: scripts/host.sh restart-web")
    print("LOCKED：dsh-tools 未与宿主同源，聊天调工具会 reading prepare", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
