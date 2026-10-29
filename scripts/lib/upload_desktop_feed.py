#!/usr/bin/env python3
"""桌面一体包发版上传：打包成功后 scp 到公司服务器，并只保留最近 2 个版本安装包。

权威约定：`.cursor/rules/workbuddy-desktop-feed-upload.mdc`
远端目录默认：/www/wwwroot/workbuddy-desktop/（HTTP：http://175.178.238.31/workbuddy-desktop/）

凭据（密钥路径）只进 gitignore/svn:ignore 的 desktop-upload.env，禁止写进仓库。
"""
from __future__ import annotations

import os
import re
import shlex
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Tuple

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = ROOT / "apps" / "zr-workbuddy" / "config" / "desktop-upload.env"

DEFAULT_HOST = "175.178.238.31"
DEFAULT_USER = "root"
DEFAULT_PORT = 22
DEFAULT_REMOTE_DIR = "/www/wwwroot/workbuddy-desktop"
DEFAULT_FEED_BASE = "http://175.178.238.31/workbuddy-desktop/"
DEFAULT_KEEP = 2

# 现行 MOM；仍识别 Mom-x / ZR WorkBuddy，远端 prune 才能把历史包算进「最多 2 个版本」
ARTIFACT_RE = re.compile(
    r"^(?:Mom-x|ZR WorkBuddy|MOM)-(\d+\.\d+\.\d+)\.(exe|zip)$", re.IGNORECASE
)
DESKTOP_PRODUCT = "MOM"
_VERSION_RE = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
# 远端目录只许绝对路径 + 安全字符，禁止拼进 ssh 远端脚本时注入
_REMOTE_DIR_RE = re.compile(r"^/[A-Za-z0-9._/-]+$")


def validate_remote_dir(remote: str) -> str:
    """校验并规范化 WORKBUDDY_DESKTOP_REMOTE_DIR，拒绝 shell 元字符与路径穿越。"""
    r = str(remote or "").strip().replace("\\", "/").rstrip("/")
    if not r.startswith("/"):
        die(f"远端目录必须是绝对路径: {remote!r}")
    if "//" in r or "/../" in f"{r}/" or r.endswith("/..") or ".." in r.split("/"):
        die(f"远端目录禁止路径穿越: {remote!r}")
    if not _REMOTE_DIR_RE.match(r):
        die(f"远端目录含非法字符（仅允许字母数字 . _ / -）: {remote!r}")
    return r


def _log(msg: str) -> None:
    print(f"\033[1;34m[desktop-upload]\033[0m {msg}", flush=True)


def _err(msg: str) -> None:
    print(f"\033[1;31m[desktop-upload]\033[0m {msg}", flush=True)


def die(msg: str) -> None:
    _err(msg)
    raise SystemExit(1)


def load_dotenv(path: Path) -> dict:
    """极简 KEY=VALUE；# 注释；不覆盖已有环境变量。"""
    out: dict = {}
    if not path.is_file():
        return out
    # utf-8-sig：发版机常见记事本/BOM，否则首键变成 \ufeffWORKBUDDY_… 读不到
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k = k.strip().lstrip("\ufeff")
        v = v.strip().strip("'").strip('"')
        if k and k not in os.environ:
            out[k] = v
    return out


def apply_env_file() -> None:
    for k, v in load_dotenv(ENV_FILE).items():
        os.environ.setdefault(k, v)


def version_tuple(v: str) -> Tuple[int, int, int]:
    m = _VERSION_RE.match(str(v or "").strip())
    if not m:
        return (0, 0, 0)
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def parse_artifact_version(name: str) -> Optional[str]:
    m = ARTIFACT_RE.match(str(name or "").strip())
    return m.group(1) if m else None


def pick_versions_to_delete(names: Iterable[str], *, keep: int = DEFAULT_KEEP) -> List[str]:
    """按 semver 保留最高 keep 个版本的安装包；其余 exe/zip（及同名 .blockmap）列入删除。"""
    keep_n = max(1, int(keep))
    by_ver: dict = {}
    for name in names:
        n = str(name or "").strip()
        if not n or n.endswith("/"):
            continue
        ver = parse_artifact_version(n)
        if not ver:
            continue
        by_ver.setdefault(ver, []).append(n)
    ranked = sorted(by_ver.keys(), key=version_tuple, reverse=True)
    keep_set = set(ranked[:keep_n])
    doomed: List[str] = []
    for ver, files in by_ver.items():
        if ver in keep_set:
            continue
        for f in files:
            doomed.append(f)
            doomed.append(f + ".blockmap")
    # 去重保序
    seen = set()
    out: List[str] = []
    for f in doomed:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out


def _load_code_deploy_ssh() -> dict:
    """回退读引擎 config.yaml 的 code_deploy.ssh_*（项目约定：密钥路径只进该文件）。"""
    cfg_path = ROOT / "apps" / "zr-workbuddy" / "engine" / "config" / "config.yaml"
    if not cfg_path.is_file():
        return {}
    try:
        import yaml
    except ImportError:
        return {}
    try:
        raw = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}
    cd = raw.get("code_deploy") if isinstance(raw, dict) else None
    if not isinstance(cd, dict):
        return {}
    out: dict = {}
    if str(cd.get("ssh_host") or "").strip():
        out["host"] = str(cd.get("ssh_host")).strip()
    if str(cd.get("ssh_user") or "").strip():
        out["user"] = str(cd.get("ssh_user")).strip()
    try:
        port = int(cd.get("ssh_port") or 0)
        if port > 0:
            out["port"] = port
    except (TypeError, ValueError):
        pass
    if str(cd.get("ssh_key_path") or "").strip():
        out["key"] = str(cd.get("ssh_key_path")).strip()
    return out


def upload_cfg() -> dict:
    apply_env_file()
    from_cd = _load_code_deploy_ssh()
    # 优先级：环境变量 / desktop-upload.env > config.yaml code_deploy > 默认
    # 远端目录固定 workbuddy-desktop（勿用 ssh_app_path，那是业务部署目录）
    host = (os.environ.get("WORKBUDDY_DESKTOP_SSH_HOST") or from_cd.get("host") or DEFAULT_HOST).strip()
    user = (os.environ.get("WORKBUDDY_DESKTOP_SSH_USER") or from_cd.get("user") or DEFAULT_USER).strip()
    port = int(os.environ.get("WORKBUDDY_DESKTOP_SSH_PORT") or from_cd.get("port") or DEFAULT_PORT)
    key = (os.environ.get("WORKBUDDY_DESKTOP_SSH_KEY") or from_cd.get("key") or "").strip()
    remote = validate_remote_dir(
        os.environ.get("WORKBUDDY_DESKTOP_REMOTE_DIR") or DEFAULT_REMOTE_DIR
    )
    feed_base = (os.environ.get("WORKBUDDY_UPDATE_FEED_BASE") or DEFAULT_FEED_BASE).strip()
    if not feed_base.endswith("/"):
        feed_base += "/"
    keep = int(os.environ.get("WORKBUDDY_DESKTOP_KEEP_VERSIONS") or DEFAULT_KEEP)
    # user/host 进 ssh 目标串：拒绝空白与注入分隔符
    if not user or any(c in user for c in " \t\r\n@\"'\\"):
        die(f"非法 SSH 用户名: {user!r}")
    if not host or any(c in host for c in " \t\r\n/\\\"'"):
        die(f"非法 SSH 主机: {host!r}")
    if port < 1 or port > 65535:
        die(f"非法 SSH 端口: {port}")
    return {
        "host": host,
        "user": user,
        "port": port,
        "key": key,
        "remote": remote,
        "feed_base": feed_base,
        "keep": keep,
    }


def _ssh_base(cfg: dict) -> List[str]:
    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=15",
        "-p",
        str(cfg["port"]),
    ]
    if cfg["key"]:
        cmd.extend(["-i", cfg["key"]])
    cmd.append(f"{cfg['user']}@{cfg['host']}")
    return cmd


def _scp_base(cfg: dict) -> List[str]:
    cmd = [
        "scp",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=15",
        "-P",
        str(cfg["port"]),
    ]
    if cfg["key"]:
        cmd.extend(["-i", cfg["key"]])
    return cmd


def _run(cmd: Sequence[str], *, timeout: int) -> Tuple[int, str, str]:
    try:
        p = subprocess.run(
            list(cmd),
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=False,
        )
        return p.returncode, p.stdout or "", p.stderr or ""
    except FileNotFoundError:
        return 127, "", f"找不到命令: {cmd[0]}（Windows 需 OpenSSH 客户端）"
    except subprocess.TimeoutExpired:
        return 124, "", f"超时（{timeout}s）: {' '.join(cmd[:4])}…"


def require_tools_and_key(cfg: dict) -> None:
    if not shutil.which("ssh") or not shutil.which("scp"):
        die("本机未找到 ssh/scp。请安装 OpenSSH 客户端后重试。")
    key = cfg["key"]
    if not key:
        die(
            "未配置 SSH 私钥路径。"
            "请任选其一：\n"
            f"  1) {ENV_FILE.name} 里填 WORKBUDDY_DESKTOP_SSH_KEY=私钥路径\n"
            "  2) engine/config/config.yaml → code_deploy.ssh_key_path（与部署共用）\n"
            "破窗仅调试：WORKBUDDY_DESKTOP_SKIP_UPLOAD=1（禁止发版默认）。"
        )
    kp = Path(key).expanduser()
    if not kp.is_file():
        die(f"SSH 私钥不存在: {kp}")


def remote_list(cfg: dict) -> List[str]:
    remote_q = shlex.quote(cfg["remote"])
    code, out, err = _run(
        _ssh_base(cfg) + [f"ls -1 {remote_q}"],
        timeout=60,
    )
    if code != 0:
        die(f"无法列出远端目录 {cfg['remote']}: {(err or out).strip()[:400]}")
    return [ln.strip() for ln in out.splitlines() if ln.strip()]


def remote_rm(cfg: dict, names: Sequence[str]) -> None:
    if not names:
        return
    # 只删纯文件名，拒绝路径与 shell 元字符
    safe: List[str] = []
    for n in names:
        n = str(n).strip()
        if not n or "/" in n or "\\" in n or ".." in n or n.startswith("-"):
            continue
        if not re.match(r"^[A-Za-z0-9._ +()-]+$", n):
            continue
        safe.append(n)
    if not safe:
        return
    # Windows OpenSSH 远端参数有长度上限：一次塞几十个「ZR WorkBuddy-…」会静默失败（空 stderr）。
    # 分批删；存在才删，缺文件不失败。
    remote_q = shlex.quote(cfg["remote"])
    batch_size = 8
    for i in range(0, len(safe), batch_size):
        chunk = safe[i : i + batch_size]
        quoted = " ".join(shlex.quote(n) for n in chunk)
        script = (
            f"cd {remote_q} && for f in {quoted}; do "
            f'[ -e "$f" ] && rm -f -- "$f"; done; true'
        )
        code, out, err = _run(_ssh_base(cfg) + [script], timeout=120)
        if code != 0:
            detail = (err or out or "").strip() or f"(无输出, exit={code}, batch={i // batch_size + 1}, n={len(chunk)})"
            die(f"远端清理失败: {detail[:500]}")


def scp_put(cfg: dict, local: Path, remote_name: str) -> None:
    if "/" in remote_name or "\\" in remote_name or ".." in remote_name:
        die(f"非法远端文件名: {remote_name}")
    dest = f"{cfg['user']}@{cfg['host']}:{cfg['remote']}/{remote_name}"
    # 大安装包：超时放宽到 2h
    timeout = 7200 if local.suffix.lower() in {".exe", ".zip", ".dmg"} else 180
    _log(f"上传 {local.name} → {dest}（{local.stat().st_size} bytes）")
    code, out, err = _run(_scp_base(cfg) + [str(local), dest], timeout=timeout)
    if code != 0:
        die(f"scp 失败 {local.name}: {(err or out).strip()[:500]}")


def http_ok(url: str, *, expect_bytes: int = 0, max_read: int = 65536) -> None:
    """探测 URL 可达。默认最多读 max_read 字节，禁止把整包 exe 拉进内存。"""
    try:
        req = urllib.request.Request(url, method="GET", headers={"User-Agent": "workbuddy-desktop-upload/1"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            code = getattr(resp, "status", None) or resp.getcode()
            data = resp.read(max(1, int(max_read)))
        if code != 200:
            die(f"上传后探测失败 HTTP {code}: {url}")
        need = min(64, expect_bytes) if expect_bytes else 0
        if need and len(data) < need:
            die(f"上传后探测内容过短: {url} len={len(data)}")
        _log(f"线上可达: {url}（读到 {len(data)} bytes）")
    except urllib.error.HTTPError as e:
        die(f"上传后探测 HTTP {e.code}: {url}")
    except Exception as exc:  # noqa: BLE001
        die(f"上传后探测失败: {url}（{exc}）")


def resolve_local_artifacts(target: str, version: str, release_dir: Path) -> Tuple[Path, Path]:
    plat = "windows" if target == "win" else "macos" if target == "mac" else ""
    if not plat:
        die(f"不支持的上传平台 target={target}")
    feed = release_dir / f"latest-{plat}.json"
    if not feed.is_file():
        die(f"缺少更新清单: {feed}")
    if target == "win":
        art = release_dir / f"{DESKTOP_PRODUCT}-{version}.exe"
    else:
        art = release_dir / f"{DESKTOP_PRODUCT}-{version}.zip"
    if not art.is_file():
        die(f"缺少安装包: {art}")
    min_bytes = int(os.environ.get("WORKBUDDY_UPDATE_MIN_BYTES") or str(50 * 1024 * 1024))
    if art.stat().st_size < min_bytes:
        die(f"安装包过小拒绝上传: {art.name} = {art.stat().st_size} bytes")
    return art, feed


def upload_and_prune(target: str, version: str, release_dir: Path) -> None:
    """打包成功后的强制步骤：上传安装包 + 清单，远端只留最近 keep 个版本。"""
    if (os.environ.get("WORKBUDDY_DESKTOP_SKIP_UPLOAD") or "").strip() in {"1", "true", "yes", "on"}:
        _err("已设置 WORKBUDDY_DESKTOP_SKIP_UPLOAD：跳过上传（仅本机调试，禁止发版默认）")
        return

    cfg = upload_cfg()
    require_tools_and_key(cfg)
    art, feed = resolve_local_artifacts(target, version, release_dir)

    # 确保远端目录存在（路径已 validate_remote_dir；再 quote 一层）
    code, out, err = _run(
        _ssh_base(cfg) + [f"mkdir -p {shlex.quote(cfg['remote'])}"],
        timeout=60,
    )
    if code != 0:
        die(f"无法创建远端目录: {(err or out).strip()[:400]}")

    scp_put(cfg, art, art.name)
    scp_put(cfg, feed, feed.name)

    existing = remote_list(cfg)
    doomed = pick_versions_to_delete(existing, keep=cfg["keep"])
    # 刚上传的当前版本绝不能删
    doomed = [n for n in doomed if parse_artifact_version(n) != version and not n.startswith("latest-")]
    if doomed:
        _log(f"远端清理旧版本（保留最近 {cfg['keep']} 个）: {', '.join(doomed)}")
        remote_rm(cfg, doomed)
    else:
        _log(f"远端无需清理（已 ≤{cfg['keep']} 个版本）")

    plat = "windows" if target == "win" else "macos"
    http_ok(cfg["feed_base"] + f"latest-{plat}.json", expect_bytes=32)
    # 安装包：优先 HEAD；失败再短 GET（最多读 1KB），禁止整包下载
    url = cfg["feed_base"] + art.name.replace(" ", "%20")
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "workbuddy-desktop-upload/1"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            code = getattr(resp, "status", None) or resp.getcode()
        if code == 200:
            _log(f"线上安装包可达: {url}")
        else:
            http_ok(url, expect_bytes=1, max_read=1024)
    except Exception:
        http_ok(url, expect_bytes=1, max_read=1024)

    _log(f"发版上传完成：{art.name} + {feed.name} → {cfg['feed_base']}")


def main(argv: Optional[Sequence[str]] = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(description="上传桌面更新清单与安装包（保留最近 2 版）")
    ap.add_argument("--target", choices=["win", "mac"], required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument(
        "--release-dir",
        default=str(ROOT / "desktop" / "release"),
        help="本机 release 目录",
    )
    args = ap.parse_args(list(argv) if argv is not None else None)
    upload_and_prune(args.target, args.version, Path(args.release_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
