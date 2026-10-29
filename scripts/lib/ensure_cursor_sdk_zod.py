#!/usr/bin/env python3
"""修好 DSH Cursor 写码依赖：@cursor/sdk 要 import zod/dist/esm/index.js。

zod@3.25.0 的 npm 包只有 src、没有 dist（官方误发）。pnpm 会把这个空包
装进 profile，zr_cursor_begin 沙箱一拷完就 ERR_MODULE_NOT_FOUND。

本脚本不改 @zhongruan/dsh-cursor-coding 源码；只补 profile 里的 zod dist。
已知带 dist 的 3.25 线：3.25.67（仍满足 ^3.25.0）。
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional, Sequence

# 凡依赖 @cursor/sdk 的公司写码类插件（市场更新常把 zod@3.25.0 残包装回）
CURSOR_PKGS = (
    "@zhongruan/dsh-cursor-coding",
    "@zhongruan/dsh-cursor-chat",
)
ZOD_REPAIR_VERSION = os.environ.get("WORKBUDDY_ZOD_REPAIR_VERSION", "3.25.67").strip() or "3.25.67"


def _profile_wants_cursor(profile: Path) -> bool:
    pkg_path = profile / "package.json"
    if not pkg_path.is_file():
        return False
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    deps = pkg.get("dependencies") or {}
    bundles = list(((pkg.get("dsh") or {}).get("profile") or {}).get("bundles") or [])
    return any(p in deps or p in bundles for p in CURSOR_PKGS)


def sdk_present(profile: Path) -> bool:
    return (profile / "node_modules" / "@cursor" / "sdk" / "package.json").is_file()


def zod_esm(profile: Path) -> Path:
    return profile / "node_modules" / "zod" / "dist" / "esm" / "index.js"


def zod_ready(profile: Path) -> bool:
    return zod_esm(profile).is_file()


def needed(profile: Path) -> bool:
    """装了写码插件或 @cursor/sdk 才需要完整 zod。"""
    return _profile_wants_cursor(profile) or sdk_present(profile)


def _safe_tar_members(tf: tarfile.TarFile) -> list[tarfile.TarInfo]:
    """拒绝绝对路径 / .. 逃逸，避免恶意 tarball 写出 staging 外。"""
    out: list[tarfile.TarInfo] = []
    for m in tf.getmembers():
        name = str(m.name or "").replace("\\", "/")
        if not name or name.startswith("/") or name.startswith("../") or "/../" in f"/{name}/":
            raise RuntimeError(f"拒绝不安全的 tar 成员：{m.name!r}")
        if m.issym() or m.islnk():
            raise RuntimeError(f"拒绝 tar 链接成员：{m.name!r}")
        out.append(m)
    return out


def _extract_tarball(tgz: Path, dest_zod: Path) -> None:
    with tarfile.open(tgz, "r:gz") as tf:
        staging = dest_zod.parent / ".zod-extract-tmp"
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        staging.mkdir(parents=True, exist_ok=True)
        members = _safe_tar_members(tf)
        # Python 3.12+ 支持 filter=；旧版走成员白名单后 extract
        try:
            tf.extractall(staging, members=members, filter="data")  # type: ignore[call-arg]
        except TypeError:
            tf.extractall(staging, members=members)
        pkg = staging / "package"
        if not (pkg / "dist" / "esm" / "index.js").is_file():
            shutil.rmtree(staging, ignore_errors=True)
            raise RuntimeError(f"{tgz.name} 仍无 dist/esm/index.js")
        if dest_zod.exists():
            shutil.rmtree(dest_zod)
        shutil.move(str(pkg), str(dest_zod))
        shutil.rmtree(staging, ignore_errors=True)


def _find_node() -> Optional[Path]:
    envn = (os.environ.get("WORKBUDDY_HOST_NODE") or "").strip()
    if envn and Path(envn).is_file():
        return Path(envn)
    for name in ("node.exe", "node"):
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def _find_npm_cli(node: Optional[Path] = None) -> Optional[Path]:
    """npm.cmd 不能直接 CreateProcess；优先走 node + npm-cli.js。"""
    cands = []
    if node is not None:
        nd = node.resolve().parent
        cands.extend(
            [
                nd / "node_modules" / "npm" / "bin" / "npm-cli.js",
                nd.parent / "lib" / "node_modules" / "npm" / "bin" / "npm-cli.js",
            ]
        )
    for name in ("npm.cmd", "npm.exe", "npm"):
        found = shutil.which(name)
        if found:
            cands.append(Path(found).parent / "node_modules" / "npm" / "bin" / "npm-cli.js")
    seen = set()
    for cand in cands:
        key = str(cand)
        if key in seen:
            continue
        seen.add(key)
        if cand.is_file():
            return cand
    return None


def _find_npm() -> Optional[Path]:
    for name in ("npm.cmd", "npm.exe", "npm"):
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def _run_npm(argv: Sequence[str], cwd: Path) -> None:
    """Windows 上 `npm` 是 .cmd，无 shell 会 WinError 2；路径空格也必须可跑。"""
    node = _find_node()
    cli = _find_npm_cli(node)
    timeout = 60
    if node is not None and cli is not None:
        subprocess.run(
            [str(node), str(cli), *argv],
            cwd=str(cwd),
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return
    npm = _find_npm()
    if npm is None:
        raise FileNotFoundError("找不到 npm（无法 pack zod dist）。请安装 Node ≥22 并加入 PATH。")
    cmd = [str(npm), *argv]
    if os.name == "nt" and npm.suffix.lower() in {".cmd", ".bat"}:
        subprocess.run(
            subprocess.list2cmdline(cmd),
            cwd=str(cwd),
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=True,
        )
        return
    subprocess.run(
        cmd,
        cwd=str(cwd),
        check=True,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def _npm_pack(version: str, out_dir: Path) -> Path:
    _run_npm(["pack", f"zod@{version}", "--silent"], out_dir)
    matches = sorted(out_dir.glob("zod-*.tgz"))
    if not matches:
        raise RuntimeError(f"npm pack zod@{version} 未产出 tgz")
    return matches[-1]


def _download_zod_tarball(version: str, dest_tgz: Path) -> None:
    """不经 npm.cmd（Agent/WSL/无 PATH 时常挂死），直拉 registry tarball。"""
    urls = [
        f"https://registry.npmjs.org/zod/-/zod-{version}.tgz",
        # 部分环境只能走公司 npm 镜像（若配置了）
        os.environ.get("WORKBUDDY_ZOD_TARBALL_URL", "").strip(),
    ]
    last_err: Exception | None = None
    for url in urls:
        if not url:
            continue
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "WorkBuddy-zod-repair/1.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                dest_tgz.write_bytes(resp.read())
            if dest_tgz.stat().st_size < 1024:
                raise RuntimeError(f"tarball 过小: {dest_tgz.stat().st_size}")
            return
        except (OSError, urllib.error.URLError, TimeoutError, RuntimeError) as exc:
            last_err = exc
            continue
    raise RuntimeError(f"下载 zod@{version} 失败: {last_err}")


def _find_bundled_zod_tarball() -> Optional[Path]:
    """一体包 / 仓内 vendor 钉选的 zod-*.tgz（优先于联网下载）。"""
    env_tb = (os.environ.get("WORKBUDDY_ZOD_TARBALL") or "").strip()
    if env_tb:
        p = Path(env_tb).expanduser()
        if p.is_file():
            return p
    cands: list[Path] = []
    app_root = (os.environ.get("WORKBUDDY_APP_ROOT") or "").strip()
    if app_root:
        cands.append(Path(app_root) / "vendor" / "zod" / f"zod-{ZOD_REPAIR_VERSION}.tgz")
        cands.append(Path(app_root) / "vendor" / "zod")
    # scripts/lib → repo root
    repo = Path(__file__).resolve().parents[2]
    cands.append(repo / "vendor" / "zod" / f"zod-{ZOD_REPAIR_VERSION}.tgz")
    cands.append(repo / "vendor" / "zod")
    for c in cands:
        if c.is_file() and c.suffix == ".tgz":
            return c
        if c.is_dir():
            matches = sorted(c.glob("zod-*.tgz"))
            if matches:
                return matches[-1]
    return None


def repair_zod(profile: Path, *, tarball: Optional[Path] = None) -> str:
    nm = profile / "node_modules"
    nm.mkdir(parents=True, exist_ok=True)
    dest = nm / "zod"
    tb = Path(tarball).expanduser() if tarball else _find_bundled_zod_tarball()
    if tb is not None and tb.is_file():
        _extract_tarball(tb, dest)
        return f"已从 tarball 写入 zod dist → {dest}（{tb.name}）"
    with tempfile.TemporaryDirectory(prefix="wb-zod-") as td:
        td_path = Path(td)
        packed = td_path / f"zod-{ZOD_REPAIR_VERSION}.tgz"
        try:
            _download_zod_tarball(ZOD_REPAIR_VERSION, packed)
        except (OSError, RuntimeError):
            # 回退 npm pack（本机有 Node 时）
            packed = _npm_pack(ZOD_REPAIR_VERSION, td_path)
        _extract_tarball(packed, dest)
    return f"已安装 zod@{ZOD_REPAIR_VERSION}（含 dist）→ {dest}"


def ensure_zod_pnpm_override(profile: Path) -> bool:
    """把 profile package.json 的 pnpm.overrides.zod 钉到带 dist 的版本。

    插件市场更新常再装回官方 zod@3.25.0（无 dist）→ 热重启宿主崩。
    覆盖声明可让后续 pnpm 解析落到可启动版本。
    """
    pkg_path = profile / "package.json"
    if not pkg_path.is_file():
        return False
    try:
        pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(pkg, dict):
        return False
    pnpm = pkg.get("pnpm")
    if not isinstance(pnpm, dict):
        pnpm = {}
    overrides = pnpm.get("overrides")
    if not isinstance(overrides, dict):
        overrides = {}
    want = str(ZOD_REPAIR_VERSION)
    if str(overrides.get("zod") or "").strip() == want:
        return False
    overrides["zod"] = want
    pnpm["overrides"] = overrides
    pkg["pnpm"] = pnpm
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return True


def _zod_pkg_version(profile: Path) -> str:
    pj = profile / "node_modules" / "zod" / "package.json"
    if not pj.is_file():
        return ""
    try:
        return str(json.loads(pj.read_text(encoding="utf-8")).get("version") or "").strip()
    except (OSError, json.JSONDecodeError, TypeError):
        return ""


def ensure_cursor_sdk_zod(profile: Path, *, do_fix: bool = False) -> dict:
    """保证写码可用的 zod dist；市场装回 3.25.0 残包时必须能再次修。

    顺序：钉 overrides → 若缺 dist（或仍是已知残包 3.25.0）则从 vendor/registry 换上带 dist 版本。
    """
    profile = profile.expanduser().resolve()
    report = {
        "profile": str(profile),
        "needed": needed(profile),
        "ready": True,
        "detail": "跳过：未装 DSH Cursor 写码 / @cursor/sdk",
        "fixed": False,
        "override_pinned": False,
    }
    if not report["needed"]:
        return report
    if do_fix:
        try:
            report["override_pinned"] = ensure_zod_pnpm_override(profile)
        except OSError:
            report["override_pinned"] = False
    ver = _zod_pkg_version(profile)
    # 3.25.0 官方残包：即使偶发有半截 dist 也不信任，do_fix 时强制换成钉选版
    force_repack = do_fix and ver == "3.25.0"
    if zod_ready(profile) and not force_repack:
        detail = "zod dist/esm 已就绪"
        if ver:
            detail += f"（{ver}）"
        if report["override_pinned"]:
            detail += f"；已钉 pnpm.overrides.zod={ZOD_REPAIR_VERSION}"
        report["detail"] = detail
        return report
    report["ready"] = False
    report["detail"] = (
        f"缺少 {zod_esm(profile)}（zod@3.25.0 无 dist 会导致写码/热重启失败）"
        if not force_repack
        else f"检测到 zod@{ver} 残包线，强制换成 {ZOD_REPAIR_VERSION}"
    )
    if not do_fix:
        return report
    try:
        report["detail"] = repair_zod(profile)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, RuntimeError, tarfile.TarError) as exc:
        report["ready"] = False
        report["fixed"] = False
        report["detail"] = f"补齐 zod dist 失败: {type(exc).__name__}: {exc}"
        return report
    report["ready"] = zod_ready(profile)
    report["fixed"] = True
    if report["override_pinned"]:
        report["detail"] += f"；已钉 pnpm.overrides.zod={ZOD_REPAIR_VERSION}"
    if not report["ready"]:
        report["detail"] += "；补齐后仍无 dist/esm"
    return report


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Ensure profile zod has dist for @cursor/sdk")
    ap.add_argument("profile", nargs="?", default="")
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--require", action="store_true")
    args = ap.parse_args(argv)
    home = Path(os.environ.get("DSH_HOME") or (Path.home() / ".dsh")).expanduser()
    profile = Path(args.profile).expanduser() if args.profile else home / "profiles" / "web"
    report = ensure_cursor_sdk_zod(profile, do_fix=args.fix)
    print(report["detail"])
    if args.require and report["needed"] and not report["ready"]:
        print("LOCKED：DSH Cursor 写码依赖 zod dist 缺失，zr_cursor_begin 会失败", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
