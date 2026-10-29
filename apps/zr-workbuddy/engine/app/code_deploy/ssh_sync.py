"""本机 SSH + rsync：仅同步选定部署单元。"""
from __future__ import annotations

import fnmatch
import ipaddress
import json
import os
import re
import shlex
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Callable
import ssl
from urllib.error import HTTPError
from urllib.parse import urlparse
from urllib.request import HTTPSHandler, HTTPRedirectHandler, Request, build_opener

from .config import CodeDeployConfig, validate_remote_restart_cmd, validate_ssh_settings
from .deploy_strategy import resolve_deploy_strategy
from .excludes import FORCE_EXCLUDE, resolve_exclude_patterns
from .units import DeployUnit, is_vite_backend_layout

# 硬约束：部署不得把线上服务搞挂。破窗仅本机调试，禁止写进发版默认。
_ALLOW_DEAD_SERVICE_DEPLOY = "WORKBUDDY_ALLOW_DEAD_SERVICE_DEPLOY"

_REL_OK = re.compile(r"^[A-Za-z0-9_./\-]+$")
_UNIT_NAME_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,80}\.service$")
_SUPERVISOR_NAME_OK = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$")
_MAX_HTTP_BODY = 2_000_000
_BACKEND_KEEP = (
    ".venv",
    "venv",
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "*.db-journal",
    "*.db-wal",
    "*.db-shm",
    "uploads",
    "storage",
    ".env",
    ".env.*",
)
# 兼容旧测试；真相源见 excludes.FORCE_EXCLUDE（含 node_modules）
_FORCE_EXCLUDE = FORCE_EXCLUDE
_EXCLUDE_PAT_OK = re.compile(r"^[A-Za-z0-9_.*?\[\]\-./]+$")
_REMOTE_ABS_OK = re.compile(r"^/[A-Za-z0-9_./\-]+$")
_HOST_OK_LOOSE = re.compile(r"^[A-Za-z0-9._\-]+$")
_USER_OK_LOOSE = re.compile(r"^[A-Za-z0-9._\-]+$")
_SENSITIVE_FILE_NAMES = frozenset(
    {
        ".env",
        "config.yaml",
        "erp.db",
        "app.db",
        "database.db",
        "zr.db",
    }
)
_SENSITIVE_FILE_SUFFIXES = frozenset({".db", ".sqlite", ".sqlite3", ".pem", ".key"})
_ROUTER_PREFIX_RE = re.compile(
    r"APIRouter\s*\((?:[^)]*?prefix\s*=\s*[\"']([^\"']+)[\"'])"
)
_ROUTER_ROUTE_RE = re.compile(
    r"@router\.(?:get|post|put|patch|delete)\(\s*[\"']([^\"']+)[\"']"
)
_APP_ROUTE_RE = re.compile(
    r"@app\.(?:get|post|put|patch|delete)\(\s*[\"']([^\"']+)[\"']"
)
_CREATE_NO_WINDOW = 0x08000000


def _win_run_kwargs() -> dict[str, Any]:
    import os

    if os.name != "nt":
        return {}
    return {"creationflags": _CREATE_NO_WINDOW}


def _git_usr_bins() -> list[Path]:
    import os

    out: list[Path] = []
    for base in (
        os.environ.get("ProgramFiles", r"C:\Program Files"),
        os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        os.environ.get("LOCALAPPDATA", ""),
    ):
        if not base:
            continue
        for rel in (
            Path("Git") / "usr" / "bin",
            Path("Git") / "bin",
            Path("Programs") / "Git" / "usr" / "bin",
        ):
            p = Path(base) / rel
            if p.is_dir():
                out.append(p)
    return out


def _find_bin(*names: str) -> str:
    """解析 ssh/rsync/scp/tar；Windows 补 OpenSSH 与 Git usr\\bin。"""
    import os

    for name in names:
        found = shutil.which(name)
        if found:
            return found
    if os.name == "nt":
        extras: list[Path] = [
            Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "OpenSSH",
            *_git_usr_bins(),
        ]
        for folder in extras:
            for name in names:
                for cand in (folder / name, folder / f"{name}.exe"):
                    if cand.is_file():
                        return str(cand)
    return ""


def _remote_abs_ok(path: str) -> bool:
    """远端同步目标：绝对路径、无 ..、非过浅系统根。"""
    app = (path or "").strip().rstrip("/")
    if not app or not _REMOTE_ABS_OK.match(app) or ".." in app:
        return False
    if app in {"/", "/home", "/root", "/www", "/var", "/opt", "/Users", "/tmp"}:
        return False
    return True


def _run(cmd: list[str], *, timeout: int = 120, cwd: str | None = None) -> tuple[int, str, str]:
    if not cmd:
        return 1, "", "空命令"
    exe0 = str(cmd[0])
    try:
        kwargs: dict[str, Any] = {
            "capture_output": True,
            "text": True,
            "encoding": "utf-8",
            "errors": "replace",
            "timeout": timeout,
            "cwd": cwd,
            **_win_run_kwargs(),
        }
        # 禁止 shell=True：部署参数含路径，避免注入；npm 走 node+npm-cli.js
        p = subprocess.run(cmd, **kwargs)
        return p.returncode, p.stdout or "", p.stderr or ""
    except FileNotFoundError as e:
        return (
            1,
            "",
            f"找不到可执行文件 {exe0!r}（{e}）。"
            "Windows 请安装 Git for Windows（ssh）与 rsync，或把它们加入 PATH。",
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        msg = str(e)
        if "WinError 2" in msg or "找不到" in msg:
            return (
                1,
                "",
                f"{msg}（命令: {exe0}）。请确认本机 PATH 有 ssh/rsync/npm。",
            )
        return 1, "", msg


def _npm_argv() -> list[str]:
    """可直接 subprocess 的 npm（Windows 必须 node + npm-cli.js，禁止 npm.cmd）。"""
    import os

    if os.name == "nt":
        node = _find_bin("node.exe", "node")
        if node:
            nd = Path(node).resolve().parent
            for cli in (
                nd / "node_modules" / "npm" / "bin" / "npm-cli.js",
                nd.parent / "lib" / "node_modules" / "npm" / "bin" / "npm-cli.js",
            ):
                if cli.is_file():
                    return [node, str(cli)]
            npm_which = shutil.which("npm.cmd") or shutil.which("npm")
            if npm_which:
                cli2 = Path(npm_which).parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
                if cli2.is_file():
                    return [node, str(cli2)]
        return []
    found = shutil.which("npm") or shutil.which("npm.exe")
    if found:
        return [found]
    home = Path.home()
    matches = sorted(home.glob(".nvm/versions/node/v*/bin/npm"), reverse=True)
    for cand in matches:
        if cand.is_file():
            return [str(cand)]
    return []


def _which_npm() -> str:
    argv = _npm_argv()
    return argv[0] if argv else ""


def collect_local_api_paths(backend: Path | str) -> list[str]:
    """从本机 backend 源码收集 FastAPI 路径，用于部署后核对远端是否已加载新路由。"""
    root = Path(backend)
    app_dir = root / "app" if (root / "app").is_dir() else root
    found: list[str] = []
    seen: set[str] = set()
    if not app_dir.is_dir():
        return []
    for py in sorted(app_dir.rglob("*.py")):
        if any(part in {".venv", "venv", "__pycache__", "tests"} for part in py.parts):
            continue
        try:
            text = py.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        prefixes = _ROUTER_PREFIX_RE.findall(text)
        prefix = prefixes[0].rstrip("/") if prefixes else ""
        for rel in _ROUTER_ROUTE_RE.findall(text):
            rel_n = (rel or "").strip()
            if not rel_n:
                continue
            full = f"{prefix}/{rel_n.lstrip('/')}" if prefix else rel_n
            if not full.startswith("/"):
                full = "/" + full
            full = re.sub(r"/{2,}", "/", full)
            if full not in seen:
                seen.add(full)
                found.append(full)
        for rel in _APP_ROUTE_RE.findall(text):
            rel_n = (rel or "").strip()
            if not rel_n.startswith("/"):
                continue
            if rel_n not in seen:
                seen.add(rel_n)
                found.append(rel_n)
    return found


def parse_discovered_services(stdout: str) -> tuple[list[str], list[str]]:
    """解析远端探测输出：UNIT:foo.service / SUPERVISOR:name。"""
    units: list[str] = []
    supers: list[str] = []
    seen_u: set[str] = set()
    seen_s: set[str] = set()
    for raw in (stdout or "").splitlines():
        line = raw.strip()
        if line.startswith("UNIT:"):
            name = line[5:].strip()
            if _UNIT_NAME_OK.match(name) and name not in seen_u:
                seen_u.add(name)
                units.append(name)
        elif line.startswith("SUPERVISOR:"):
            name = line[11:].strip()
            if _SUPERVISOR_NAME_OK.match(name) and name not in seen_s:
                seen_s.add(name)
                supers.append(name)
    return units, supers


def entry_join(entry: str, path: str) -> str:
    base = (entry or "").strip().rstrip("/")
    p = path if path.startswith("/") else "/" + path
    return base + p if base else ""


def _app_path_safe_for_discover(app: str) -> bool:
    parts = [p for p in Path(app).parts if p not in {"/", ""}]
    return len(parts) >= 3


class _NoRedirect(HTTPRedirectHandler):
    """禁止跟随跳转，避免 health/openapi 被 302 到回环/元数据。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


def _http_get(url: str, *, timeout: int = 8) -> tuple[int, bytes]:
    # 预发入口常用自签证书（如 8093）；探活只验可达，不挡部署。
    handlers: list[Any] = [_NoRedirect]
    if (url or "").strip().lower().startswith("https://"):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        handlers.append(HTTPSHandler(context=ctx))
    opener = build_opener(*handlers)
    req = Request(url, method="GET")
    try:
        with opener.open(req, timeout=timeout) as resp:
            code = int(getattr(resp, "status", None) or resp.getcode() or 0)
            raw = resp.read(_MAX_HTTP_BODY + 1)
    except HTTPError as e:
        raw = e.read(_MAX_HTTP_BODY + 1) if getattr(e, "fp", None) else b""
        code = int(e.code or 0)
    if len(raw) > _MAX_HTTP_BODY:
        raise ValueError("响应体过大")
    return code, raw


def _fetch_json(url: str, *, timeout: int = 8) -> dict[str, Any] | None:
    u = (url or "").strip()
    if not u.startswith(("http://", "https://")):
        return None
    try:
        parsed = urlparse(u)
    except Exception:  # noqa: BLE001
        return None
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    if _is_blocked_health_host(parsed.hostname):
        return None
    try:
        code, raw = _http_get(u, timeout=timeout)
        if not (200 <= code < 300):
            return None
        data = json.loads(raw.decode("utf-8", errors="replace"))
        return data if isinstance(data, dict) else None
    except Exception:  # noqa: BLE001
        return None


def _discover_backend_services_cmd(app: str) -> str:
    # 必须匹配 "$APP/"，避免 /www/wwwroot/zr 误配 zr-aicoding
    return (
        "APP=" + shlex.quote(app) + "\n"
        "for f in /etc/systemd/system/*.service; do\n"
        "  [ -f \"$f\" ] || continue\n"
        "  if grep -qF \"$APP/\" \"$f\"; then echo \"UNIT:$(basename \"$f\")\"; fi\n"
        "done\n"
        "for d in /etc/supervisor/conf.d /etc/supervisord.d; do\n"
        "  [ -d \"$d\" ] || continue\n"
        "  for f in \"$d\"/*; do\n"
        "    [ -f \"$f\" ] || continue\n"
        "    if grep -qF \"$APP/\" \"$f\"; then\n"
        "      n=$(grep -E '^\\[program:' \"$f\" | head -1 | sed 's/\\[program://;s/\\]//')\n"
        "      [ -n \"$n\" ] && echo \"SUPERVISOR:$n\"\n"
        "    fi\n"
        "  done\n"
        "done\n"
        "echo DISCOVER_DONE\n"
    )


def _install_remote_backend_deps(
    ssh: list[str],
    app: str,
    log: Callable[[str], None],
    urec: dict[str, Any],
) -> bool:
    """在远端 backend/.venv 里按 requirements.txt 安装（有 venv 才执行）。"""
    remote = (
        "APP=" + shlex.quote(app) + "\n"
        "REQ=\"$APP/backend/requirements.txt\"\n"
        "PIP=\"$APP/backend/.venv/bin/pip\"\n"
        "if [ ! -f \"$REQ\" ]; then echo pip_skip_no_req; exit 0; fi\n"
        "if [ ! -x \"$PIP\" ]; then echo pip_skip_no_venv; exit 0; fi\n"
        "\"$PIP\" install -r \"$REQ\" -q && echo pip_ok\n"
    )
    log("远端安装 backend 依赖 …")
    urec["logs"].append("pip install -r backend/requirements.txt")
    code, out, err = _run(ssh + [f"bash -lc {shlex.quote(remote)}"], timeout=180)
    token = (out or "").strip().splitlines()[-1] if (out or "").strip() else ""
    if code != 0 or token not in {"pip_ok", "pip_skip_no_req", "pip_skip_no_venv"}:
        urec["ok"] = False
        urec["error"] = (err or out or "远端 pip install 失败")[:400]
        urec["logs"].append(urec["error"])
        return False
    urec["logs"].append(token)
    return True


def must_keep_service_alive() -> bool:
    """部署后服务必须仍可探活；默认强制。仅破窗 env=1 可关（禁止发版默认）。"""
    return os.environ.get(_ALLOW_DEAD_SERVICE_DEPLOY, "").strip() != "1"


def _entry_api_health_url(cfg: CodeDeployConfig) -> str:
    if hasattr(cfg, "resolve_entry_url"):
        entry = cfg.resolve_entry_url()
    else:
        entry = (getattr(cfg, "entry_url", None) or cfg.health_url or "").strip()
    return entry_join(entry, "/api/health")


def _wait_api_health(cfg: CodeDeployConfig, *, rounds: int = 30) -> dict[str, Any]:
    api_health = _entry_api_health_url(cfg)
    if not api_health:
        return {"ok": False, "detail": "未配置 health_url/entry_url，无法验收服务存活"}
    last: dict[str, Any] = {}
    for _ in range(max(1, rounds)):
        last = probe_health(
            api_health,
            timeout=min(4, int(cfg.health_timeout_sec or 8)),
            expect_status=int(getattr(cfg, "health_expect_status", 0) or 0),
        )
        if last.get("ok"):
            return last
        time.sleep(2)
    return last if last else {"ok": False, "detail": "探活无结果"}


def sanitize_snapshot_rels(rels: list[str] | None) -> list[str]:
    """仅保留安全的相对路径，供快照/回滚使用。"""
    out: list[str] = []
    seen: set[str] = set()
    for raw in rels or []:
        r = str(raw or "").replace("\\", "/").strip()
        # 只剥「./」前缀；禁止 lstrip('./')（会把 ../evil、/abs 误剥成相对路径）
        while r.startswith("./"):
            r = r[2:]
        if not r or r.startswith("/") or r.startswith("~"):
            continue
        if ".." in r.split("/"):
            continue
        if not _REL_OK.match(r):
            continue
        if r in seen:
            continue
        seen.add(r)
        out.append(r)
    return out[:24]


def _build_snapshot_script(app: str, rels: list[str]) -> str:
    """按实际同步目录打快照（不再写死 frontend/dist + backend）。"""
    safe = sanitize_snapshot_rels(rels)
    parts: list[str] = [
        "set -e",
        f"APP={shlex.quote(app)}",
        "ARCH=/tmp/wb-deploy-snap-$(date +%Y%m%d%H%M%S).tar.gz",
        "TMP=$(mktemp -d)",
        "trap 'rm -rf \"$TMP\"' EXIT",
        "n=0",
    ]
    for rel in safe:
        q = shlex.quote(rel)
        # 路径名做成安全成员名
        member = rel.replace("/", "__")
        qm = shlex.quote(member)
        parts.append(
            f"if [ -e \"$APP\"/{q} ]; then\n"
            f"  tar -C \"$APP\" "
            f"--exclude='*/.venv' --exclude='*/venv' --exclude='*/node_modules' "
            f"--exclude='*/.env' --exclude='*/.env.*' "
            f"--exclude='*.db' --exclude='*.sqlite' --exclude='*.sqlite3' "
            f"-czf \"$TMP\"/{qm}.tgz {q}\n"
            f"  n=$((n+1))\n"
            f"fi"
        )
    parts.extend(
        [
            'if [ "$n" -eq 0 ]; then echo SNAP_EMPTY; exit 0; fi',
            'printf "%s\\n" ' + " ".join(shlex.quote(r) for r in safe) + ' > "$TMP/rels.txt"',
            'tar -C "$TMP" -czf "$ARCH" .',
            'echo SNAP_OK:"$ARCH"',
        ]
    )
    return "\n".join(parts)


def _build_restore_script(app: str, archive: str) -> str:
    """按快照内 rels.txt 回滚；dist 类全量替换，其它保留 .venv/.env/*.db。"""
    return (
        "set -e\n"
        f"APP={shlex.quote(app)}\n"
        f"ARCH={shlex.quote(archive)}\n"
        "TMP=$(mktemp -d)\n"
        "trap 'rm -rf \"$TMP\"' EXIT\n"
        "tar -xzf \"$ARCH\" -C \"$TMP\"\n"
        "RELS_FILE=\"$TMP/rels.txt\"\n"
        "if [ ! -f \"$RELS_FILE\" ]; then\n"
        "  # 兼容旧快照：backend + frontend/dist\n"
        "  echo backend > \"$RELS_FILE\"\n"
        "  echo frontend/dist >> \"$RELS_FILE\"\n"
        "fi\n"
        "while IFS= read -r rel || [ -n \"$rel\" ]; do\n"
        "  [ -z \"$rel\" ] && continue\n"
        "  case \"$rel\" in\n"
        "    *..*|/*) echo BAD_REL; exit 1 ;;\n"
        "  esac\n"
        "  member=$(echo \"$rel\" | sed 's#/#__#g')\n"
        "  TGZ=\"$TMP/${member}.tgz\"\n"
        "  # 旧 vite 快照文件名\n"
        "  if [ ! -f \"$TGZ\" ] && [ \"$rel\" = backend ]; then TGZ=\"$TMP/backend.tgz\"; fi\n"
        "  if [ ! -f \"$TGZ\" ] && [ \"$rel\" = frontend/dist ]; then TGZ=\"$TMP/dist.tgz\"; fi\n"
        "  [ -f \"$TGZ\" ] || continue\n"
        "  BT=$(mktemp -d)\n"
        "  tar -xzf \"$TGZ\" -C \"$BT\"\n"
        "  case \"$rel\" in\n"
        "    */dist|dist)\n"
        "      parent=$(dirname \"$APP/$rel\")\n"
        "      mkdir -p \"$parent\"\n"
        "      rm -rf \"$APP/$rel\"\n"
        "      mkdir -p \"$APP/$rel\"\n"
        "      if [ -d \"$BT/$rel\" ]; then cp -a \"$BT/$rel/.\" \"$APP/$rel/\"; "
        "elif [ -d \"$BT/frontend/dist\" ] && [ \"$rel\" = frontend/dist ]; then "
        "cp -a \"$BT/frontend/dist/.\" \"$APP/$rel/\"; fi\n"
        "      ;;\n"
        "    *)\n"
        "      mkdir -p \"$APP/$rel\"\n"
        "      if command -v rsync >/dev/null 2>&1; then\n"
        "        rsync -a --delete "
        "--exclude='.venv' --exclude='venv' --exclude='node_modules' "
        "--exclude='.env' --exclude='.env.*' "
        "--exclude='*.db' --exclude='*.sqlite' --exclude='*.sqlite3' "
        "--exclude='uploads' --exclude='storage' "
        "\"$BT/$rel/\" \"$APP/$rel/\"\n"
        "      else\n"
        "        find \"$APP/$rel\" -mindepth 1 -maxdepth 1 "
        "! -name '.venv' ! -name 'venv' ! -name 'node_modules' ! -name '.env' "
        "! -name 'uploads' ! -name 'storage' ! -name '*.db' -exec rm -rf {} +\n"
        "        cp -a \"$BT/$rel/.\" \"$APP/$rel/\" 2>/dev/null || true\n"
        "      fi\n"
        "      ;;\n"
        "  esac\n"
        "  rm -rf \"$BT\"\n"
        "done < \"$RELS_FILE\"\n"
        "echo RESTORE_OK\n"
    )


def _remote_pre_deploy_snapshot(
    ssh: list[str],
    app: str,
    log: Callable[[str], None],
    *,
    rels: list[str] | None = None,
) -> dict[str, Any]:
    """覆盖前按实际同步目录打快照（不含 .venv/.env/db/node_modules）。"""
    paths = sanitize_snapshot_rels(rels) or ["backend", "frontend/dist"]
    remote = _build_snapshot_script(app, paths)
    log(f"部署前快照远端目录：{', '.join(paths)} …")
    code, out, err = _run(ssh + [f"bash -lc {shlex.quote(remote)}"], timeout=180)
    text = (out or "").strip()
    if "SNAP_EMPTY" in text:
        return {"ok": True, "empty": True, "archive": "", "detail": "远端无可快照内容", "rels": paths}
    if code != 0 or "SNAP_OK:" not in text:
        return {
            "ok": False,
            "empty": False,
            "archive": "",
            "detail": (err or out or "快照失败")[:300],
            "rels": paths,
        }
    path = ""
    for line in text.splitlines():
        if line.startswith("SNAP_OK:"):
            path = line.split(":", 1)[1].strip().strip('"')
    return {
        "ok": True,
        "empty": False,
        "archive": path,
        "detail": f"快照 {path}",
        "rels": paths,
    }


def _remote_restore_pre_deploy_snapshot(
    ssh: list[str],
    app: str,
    archive: str,
    log: Callable[[str], None],
) -> dict[str, Any]:
    """用部署前快照按 rels 回滚（兼容旧 vite backend+dist 快照）。"""
    if not archive or not str(archive).startswith("/tmp/wb-deploy-snap-"):
        return {"ok": False, "detail": "无效快照路径，拒绝回滚"}
    remote = _build_restore_script(app, archive)
    log(f"探活失败，回滚远端到部署前快照 {archive} …")
    code, out, err = _run(ssh + [f"bash -lc {shlex.quote(remote)}"], timeout=240)
    if code != 0 or "RESTORE_OK" not in (out or ""):
        return {"ok": False, "detail": (err or out or "回滚失败")[:300]}
    return {"ok": True, "detail": "已回滚到部署前快照"}


def _remote_api_hint(ssh: list[str], cfg: CodeDeployConfig) -> str:
    """探活失败时读远端 systemd 状态（短、无密钥）。"""
    cmd = str(getattr(cfg, "remote_restart_cmd", "") or "").strip()
    unit = ""
    m = re.match(r"^systemctl restart ([A-Za-z0-9][A-Za-z0-9_.:@-]{0,80})(?:\.service)?$", cmd)
    if m:
        unit = m.group(1)
        if not unit.endswith(".service"):
            unit = unit + ".service"
    if not unit or not _UNIT_NAME_OK.match(unit):
        return ""
    remote = (
        f"systemctl is-active {shlex.quote(unit)} 2>/dev/null; "
        f"journalctl -u {shlex.quote(unit)} -n 8 --no-pager -o cat 2>/dev/null | tail -8"
    )
    _code, out, err = _run(ssh + [f"bash -lc {shlex.quote(remote)}"], timeout=25)
    text = (out or err or "").strip().replace("\n", " | ")
    return text[:180]


def _restart_and_verify_backend(
    ssh: list[str],
    *,
    cfg: CodeDeployConfig,
    app: str,
    backend: Path,
    log: Callable[[str], None],
    urec: dict[str, Any],
) -> bool:
    """同步后必须让远端 API 进程加载新代码；仅 rsync 不够（uvicorn 无 --reload）。"""
    custom = str(getattr(cfg, "remote_restart_cmd", "") or "").strip()
    if custom:
        cmd_err = validate_remote_restart_cmd(custom)
        if cmd_err:
            urec["ok"] = False
            urec["error"] = cmd_err
            urec["logs"].append(cmd_err)
            return False
        log("执行配置的远端重启命令 …")
        urec["logs"].append("remote_restart_cmd")
        c3, o3, e3 = _run(ssh + [f"bash -lc {shlex.quote(custom)}"], timeout=120)
        if c3 != 0:
            urec["ok"] = False
            urec["error"] = (e3 or o3 or "远端重启失败")[:400]
            urec["logs"].append(urec["error"])
            return False
        urec["logs"].append("remote restart ok")
        time.sleep(3)
    else:
        if not _app_path_safe_for_discover(app):
            urec["ok"] = False
            urec["error"] = (
                "后端已同步，但远端目录过浅，无法自动匹配 systemd。"
                "请在设置填写「远端重启命令」，例如 systemctl restart zr-aicoding-api"
            )
            urec["logs"].append(urec["error"])
            return False
        log("探测并重启远端 API 进程 …")
        urec["logs"].append("discover systemd/supervisor")
        c0, o0, e0 = _run(
            ssh + [f"bash -lc {shlex.quote(_discover_backend_services_cmd(app))}"],
            timeout=40,
        )
        if c0 != 0 or "DISCOVER_DONE" not in (o0 or ""):
            urec["ok"] = False
            urec["error"] = (e0 or o0 or "探测远端 API 服务失败")[:400]
            urec["logs"].append(urec["error"])
            return False
        units, supers = parse_discovered_services(o0 or "")
        if len(units) > 3:
            urec["ok"] = False
            urec["error"] = (
                f"匹配到过多 systemd 服务（{len(units)}），已中止以免误重启。"
                "请在设置填写明确的「远端重启命令」"
            )
            urec["logs"].append(urec["error"])
            return False
        if units:
            for unit in units:
                log(f"systemctl restart {unit} …")
                urec["logs"].append(f"systemctl restart {unit}")
                c1, o1, e1 = _run(
                    ssh + [f"bash -lc {shlex.quote('systemctl restart ' + shlex.quote(unit))}"],
                    timeout=60,
                )
                if c1 != 0:
                    urec["ok"] = False
                    urec["error"] = (e1 or o1 or f"重启 {unit} 失败")[:400]
                    urec["logs"].append(urec["error"])
                    return False
            urec["logs"].append("remote restart ok")
        elif supers:
            for name in supers[:3]:
                log(f"supervisorctl restart {name} …")
                urec["logs"].append(f"supervisorctl restart {name}")
                c1, o1, e1 = _run(
                    ssh
                    + [
                        f"bash -lc {shlex.quote('supervisorctl restart ' + shlex.quote(name))}"
                    ],
                    timeout=60,
                )
                if c1 != 0:
                    urec["ok"] = False
                    urec["error"] = (e1 or o1 or f"重启 supervisor {name} 失败")[:400]
                    urec["logs"].append(urec["error"])
                    return False
            urec["logs"].append("remote restart ok")
        else:
            # 无 systemd/supervisor：仅当配置了 process_match 才按进程重启；禁止默认假设 uvicorn
            match = str(getattr(cfg, "process_match", "") or "").strip()
            if not re.fullmatch(r"[A-Za-z0-9_./-]{1,64}", match or ""):
                urec["ok"] = False
                urec["error"] = (
                    "后端文件已同步，但找不到匹配该目录的 systemd/supervisor 服务，"
                    "且未配置可用的 remote_restart_cmd / process_match。"
                    "禁止默认假设 uvicorn。请在设置填写「远端重启命令」"
                    "或 process_match（进程命令行子串）。"
                )
                urec["logs"].append(urec["error"])
                return False
            log(f"未匹配到 systemd/supervisor，按 process_match={match} 重启 …")
            urec["logs"].append(f"fallback restart by process_match={match}")
            fallback = (
                "APP=" + shlex.quote(app) + "\n"
                "BE=\"$APP/backend\"\n"
                "MATCH=" + shlex.quote(match) + "\n"
                "pids=$(ps -eo pid=,args= | awk -v be=\"$BE\" -v m=\"$MATCH\" "
                "'index($0, be) && index($0, m) {print $1}')\n"
                "if [ -z \"$pids\" ]; then\n"
                "  for p in /proc/[0-9]*; do\n"
                "    c=$(readlink \"$p/cwd\" 2>/dev/null) || continue\n"
                "    case \"$c\" in \"$APP\"|\"$APP\"/*|\"$BE\"|\"$BE\"/*)\n"
                "      tr '\\0' ' ' < \"$p/cmdline\" 2>/dev/null | grep -F -q -- \"$MATCH\" || continue\n"
                "      pids=\"$pids ${p#/proc/}\"\n"
                "      ;;\n"
                "    esac\n"
                "  done\n"
                "fi\n"
                "pids=$(echo $pids | xargs)\n"
                "if [ -z \"$pids\" ]; then\n"
                "  echo NO_PROC\n"
                "  exit 0\n"
                "fi\n"
                "echo PIDS:$pids\n"
                "kill $pids 2>/dev/null || true\n"
                "sleep 1\n"
                "alive=\n"
                "for p in $pids; do kill -0 $p 2>/dev/null && alive=\"$alive $p\"; done\n"
                "if [ -n \"$alive\" ]; then kill -9 $alive 2>/dev/null || true; fi\n"
                "echo KILLED_OK\n"
            )
            c_fb, o_fb, e_fb = _run(
                ssh + [f"bash -lc {shlex.quote(fallback)}"],
                timeout=60,
            )
            if "NO_PROC" in (o_fb or ""):
                urec["ok"] = False
                urec["error"] = (
                    "后端文件已同步，但按 process_match 找不到运行中的进程。"
                    "请检查 process_match 或改用 remote_restart_cmd。"
                )
                urec["logs"].append(urec["error"])
                return False
            if c_fb != 0 or "KILLED_OK" not in (o_fb or ""):
                urec["ok"] = False
                urec["error"] = (e_fb or o_fb or "按进程重启失败")[:400]
                urec["logs"].append(urec["error"])
                return False
            urec["logs"].append("process_match restart ok")
            time.sleep(2)

    entry = ""
    if hasattr(cfg, "resolve_entry_url"):
        entry = cfg.resolve_entry_url()
    else:
        entry = (getattr(cfg, "entry_url", None) or cfg.health_url or "").strip()
    api_health = entry_join(entry, "/api/health")
    if not api_health:
        if must_keep_service_alive():
            urec["ok"] = False
            urec["error"] = (
                "硬约束：未配置 health_url/entry_url，无法验收服务存活，拒绝认为部署成功。"
            )
            urec["logs"].append(urec["error"])
            urec["reason"] = "service_alive_no_health_url"
            return False
        urec["logs"].append("skip api health（未配置入口）")
        return True
    log(f"探活 API {api_health} …")
    last = _wait_api_health(cfg, rounds=30)
    if not last.get("ok"):
        hint = _remote_api_hint(ssh, cfg)
        urec["ok"] = False
        urec["error"] = (
            "已重启 API，但 /api/health 未就绪："
            + str(last.get("detail") or last.get("status") or "timeout")[:160]
            + "。多为进程还在起来或启动失败。"
            + (f" 远端：{hint}" if hint else "")
        )[:400]
        urec["logs"].append(urec["error"])
        urec["reason"] = "service_down_after_deploy"
        return False
    urec["logs"].append("api health ok")

    openapi_url = entry_join(entry, "/openapi.json")
    local_paths = [
        p
        for p in collect_local_api_paths(backend)
        if p.startswith("/api/") and p.count("/") >= 2
    ][:40]
    if openapi_url and local_paths:
        spec = None
        for _ in range(8):
            spec = _fetch_json(openapi_url, timeout=8)
            if spec and isinstance(spec.get("paths"), dict):
                break
            time.sleep(1)
        if spec and isinstance(spec.get("paths"), dict):
            remote_paths = {str(x) for x in spec["paths"].keys()}
            missing = [p for p in local_paths if p not in remote_paths]
            if missing:
                urec["ok"] = False
                urec["error"] = (
                    "远端 API 仍未加载新路由（典型原因：进程没真正重启）。缺："
                    + "、".join(missing[:5])
                )
                urec["logs"].append(urec["error"])
                return False
            urec["logs"].append("openapi routes ok")
        else:
            urec["ok"] = False
            urec["error"] = (
                "无法读取远端 /openapi.json，不能确认 API 已加载新路由。"
                "请检查 nginx 是否反代了 /openapi.json 与 /api/"
            )
            urec["logs"].append(urec["error"])
            return False

    smoke_paths = (
        "/api/reports/employee-work-hours?page=1&page_size=1",
        "/api/reports/employee-work-hours?shift_type=day&page=1&page_size=1",
    )
    for rel in smoke_paths:
        smoke_url = entry_join(entry, rel)
        if not smoke_url:
            continue
        log(f"业务探活 {smoke_url} …")
        try:
            code, _raw = _http_get(smoke_url, timeout=min(8, int(cfg.health_timeout_sec or 8)))
        except HTTPError as e:
            code = int(e.code)
        except Exception as e:  # noqa: BLE001
            urec["ok"] = False
            urec["error"] = f"业务探活失败 {rel}：{e}"[:300]
            urec["logs"].append(urec["error"])
            return False
        if int(code) >= 500:
            urec["ok"] = False
            urec["error"] = (
                f"业务 API 返回 {code}（{rel}）。"
                "入口 HTML 200 不代表接口可用；请查远端 API 日志。"
            )
            urec["logs"].append(urec["error"])
            return False
        urec["logs"].append(f"smoke {rel} → HTTP {code}")
    return True


def _rollback_after_dead_service(
    ssh: list[str],
    *,
    cfg: CodeDeployConfig,
    app: str,
    backend: Path,
    log: Callable[[str], None],
    urec: dict[str, Any],
    snap: dict[str, Any],
    deploy_err: str,
) -> None:
    """探活失败后回滚快照并再探活；写清 urec（部署仍算失败，但服务应恢复）。"""
    urec["reason"] = "service_down_after_deploy"
    archive = str(snap.get("archive") or "")
    if snap.get("empty") or not archive:
        urec["ok"] = False
        urec["error"] = (
            f"{deploy_err} "
            "硬约束：服务已不可用且无可用快照可回滚，需运维介入。"
        )[:400]
        urec["logs"].append(urec["error"])
        urec["rollback"] = {"ok": False, "detail": "无快照"}
        return
    restored = _remote_restore_pre_deploy_snapshot(ssh, app, archive, log)
    urec["logs"].append(restored.get("detail") or "rollback")
    if not restored.get("ok"):
        urec["ok"] = False
        urec["error"] = (
            f"{deploy_err} "
            f"硬约束：自动回滚失败（{restored.get('detail')}），服务可能仍挂，需运维介入。"
        )[:400]
        urec["logs"].append(urec["error"])
        urec["rollback"] = restored
        return
    # 清掉上一轮失败标记，让重启探活重写
    urec.pop("error", None)
    urec["ok"] = True
    if not _restart_and_verify_backend(
        ssh, cfg=cfg, app=app, backend=backend, log=log, urec=urec
    ):
        urec["ok"] = False
        urec["error"] = (
            f"{deploy_err} "
            "已回滚文件但服务仍不可用："
            + str(urec.get("error") or "探活失败")
        )[:400]
        urec["logs"].append(urec["error"])
        urec["rollback"] = {
            "ok": True,
            "service_ok": False,
            "detail": restored.get("detail"),
        }
        urec["reason"] = "service_down_after_deploy"
        return
    urec["ok"] = False  # 本次发版仍失败
    urec["error"] = (
        "硬约束：新版本导致服务不可用，已自动回滚到部署前版本并恢复探活。"
        f" 原错误：{deploy_err}"
    )[:400]
    urec["logs"].append(urec["error"])
    urec["rollback"] = {
        "ok": True,
        "service_ok": True,
        "detail": restored.get("detail"),
    }
    urec["reason"] = "service_down_rolled_back"


def _ssh_base(key: Path, port: int, user: str, host: str) -> list[str]:
    ssh = _find_bin("ssh.exe", "ssh")
    if not ssh:
        # 留给 _run 报清晰错误
        ssh = "ssh"
    return [
        ssh,
        "-i",
        str(key),
        "-p",
        str(port),
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=15",
        f"{user}@{host}",
    ]


def _rsync_ssh(key: Path, port: int) -> str:
    ssh = _find_bin("ssh.exe", "ssh") or "ssh"
    return (
        f"{shlex.quote(ssh)} -i {shlex.quote(str(key))} -p {port} "
        f"-o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15"
    )


def _is_sensitive_local_file(path: Path) -> bool:
    name = path.name
    if name in _SENSITIVE_FILE_NAMES or name.startswith(".env."):
        return True
    if path.suffix.lower() in _SENSITIVE_FILE_SUFFIXES:
        return True
    if name.startswith("id_rsa") or name.startswith("id_ed25519"):
        return True
    return False


def _preflight_sync_tools() -> str:
    """部署前检查本机工具；返回空字符串表示通过。"""
    if not _find_bin("ssh.exe", "ssh"):
        return (
            "本机找不到 ssh.exe。请安装 Git for Windows 或 Windows OpenSSH 客户端，"
            "并确认引擎进程 PATH 能找到它。"
        )
    if not _find_bin("rsync.exe", "rsync"):
        if not _find_bin("scp.exe", "scp"):
            return (
                "本机找不到 rsync，也找不到 scp。"
                "无 rsync 时用 Python 打包 + scp 同步；请安装 OpenSSH 或 Git 的 scp。"
            )
    return ""


def _ssh_key_port_from_argv(ssh: list[str]) -> tuple[str, int]:
    """从 `_ssh_base` 参数列表解析 -i / -p（给 scp 复用）。"""
    key = ""
    port = 22
    i = 0
    while i < len(ssh):
        tok = str(ssh[i])
        if tok == "-i" and i + 1 < len(ssh):
            key = str(ssh[i + 1])
            i += 2
            continue
        if tok == "-p" and i + 1 < len(ssh):
            try:
                port = int(ssh[i + 1])
            except ValueError:
                pass
            i += 2
            continue
        i += 1
    return key, port


def _collect_tar_exclude_pats(
    excludes: list[str],
    extra_excludes: list[str] | None,
) -> list[str]:
    force_pats = [p for p in _FORCE_EXCLUDE if _EXCLUDE_PAT_OK.match(p)]
    extra_pats = [
        str(p).strip()
        for p in (extra_excludes or [])
        if str(p).strip() and _EXCLUDE_PAT_OK.match(str(p).strip())
    ]
    pats: list[str] = []
    flat = list(excludes or [])
    i = 0
    while i < len(flat):
        if flat[i] == "--exclude" and i + 1 < len(flat):
            pats.append(flat[i + 1])
            i += 2
            continue
        i += 1
    for pat in extra_pats + force_pats + ["erp.db", "app.db"]:
        if pat and pat not in pats and _EXCLUDE_PAT_OK.match(pat):
            pats.append(pat)
    return pats


def _remote_overlay_prep(remote_abs: str) -> str:
    """局部清理远端目录：保留 venv/db/.env，禁止整目录 rm -rf。"""
    keep_names = {
        ".venv",
        "venv",
        "uploads",
        "storage",
        "data",
        ".env",
        "app.db",
        "database.db",
        "zr.db",
        "erp.db",
    }
    keep_clause = " ".join(f"! -name {shlex.quote(n)}" for n in sorted(keep_names))
    keep_clause += (
        " ! -name '*.db' ! -name '*.sqlite' ! -name '*.sqlite3' "
        "! -name '*.db-wal' ! -name '*.db-shm' ! -name '*.db-journal'"
    )
    return (
        f"mkdir -p -- {shlex.quote(remote_abs)} && "
        f"find {shlex.quote(remote_abs)} -mindepth 1 -maxdepth 1 {keep_clause} "
        f"-exec rm -rf {{}} +"
    )


def _tar_rel_excluded(rel: str, pats: list[str]) -> bool:
    """是否应按 exclude glob 跳过该相对路径（对齐 GNU tar --exclude 的常用语义）。"""
    rel_n = (rel or "").replace("\\", "/").strip()
    while rel_n.startswith("./"):
        rel_n = rel_n[2:]
    rel_n = rel_n.lstrip("/")
    if not rel_n:
        return False
    name = rel_n.rsplit("/", 1)[-1]
    parts = [p for p in rel_n.split("/") if p]
    for raw in pats or []:
        p = str(raw or "").replace("\\", "/").strip()
        if not p:
            continue
        if fnmatch.fnmatch(rel_n, p) or fnmatch.fnmatch(name, p):
            return True
        if p.startswith("**/"):
            rest = p[3:]
            if rest and (fnmatch.fnmatch(rel_n, rest) or fnmatch.fnmatch(name, rest)):
                return True
            if rest:
                for i in range(len(parts)):
                    if fnmatch.fnmatch("/".join(parts[i:]), rest):
                        return True
        if "/" not in p.rstrip("/") and any(fnmatch.fnmatch(part, p) for part in parts):
            return True
    return False


def _write_local_tar_archive(src: Path, archive: Path, exclude_pats: list[str]) -> str:
    """本机用 Python tarfile 打包。禁止把 ``C:\\`` 路径交给 Git GNU tar。

    Git ``usr\\bin\\tar.exe`` 会把 ``C:`` 当成远端主机，报
    ``Cannot connect to C: resolve failed``。
    """
    import tarfile

    src = src.resolve()
    if not src.is_dir():
        return f"源目录不存在：{src}"
    try:
        with tarfile.open(archive, "w") as tf:
            for dirpath, dirnames, filenames in os.walk(src, followlinks=False):
                rel_dir = os.path.relpath(dirpath, src).replace("\\", "/")
                if rel_dir == ".":
                    rel_dir = ""
                keep: list[str] = []
                for d in dirnames:
                    rel = f"{rel_dir}/{d}" if rel_dir else d
                    if ".." in rel.replace("\\", "/").split("/") or _tar_rel_excluded(
                        rel, exclude_pats
                    ):
                        continue
                    keep.append(d)
                dirnames[:] = keep
                for fn in filenames:
                    rel = f"{rel_dir}/{fn}" if rel_dir else fn
                    if ".." in rel.replace("\\", "/").split("/") or _tar_rel_excluded(
                        rel, exclude_pats
                    ):
                        continue
                    full = Path(dirpath) / fn
                    try:
                        if full.is_symlink() or not full.is_file():
                            continue
                    except OSError:
                        continue
                    if _is_sensitive_local_file(full):
                        continue
                    try:
                        tf.add(str(full), arcname=rel.replace("\\", "/"), recursive=False)
                    except OSError:
                        continue
    except (OSError, tarfile.TarError) as e:
        return f"本机打包失败：{e}"
    return ""


def _tar_archive_members_safe(archive: Path) -> str:
    """上传前校验归档成员，拒绝绝对路径 / .. 穿越 / 危险链接（防 tar slip）。

    返回空字符串表示通过；否则为拒绝原因。
    """
    import tarfile

    try:
        with tarfile.open(archive, "r:*") as tf:
            for m in tf.getmembers():
                name = (m.name or "").replace("\\", "/")
                # 只剥「./」前缀，禁止 str.lstrip("./")（会把 ../x 误剥成 x）
                while name.startswith("./"):
                    name = name[2:]
                if not name or name == ".":
                    continue
                if name.startswith("/") or name.startswith("~"):
                    return f"归档含绝对路径：{name[:80]}"
                parts = [p for p in name.split("/") if p not in ("", ".")]
                if any(p == ".." for p in parts):
                    return f"归档含路径穿越：{name[:80]}"
                if m.issym() or m.islnk():
                    link = (m.linkname or "").replace("\\", "/")
                    if (
                        not link
                        or link.startswith("/")
                        or link.startswith("~")
                        or any(p == ".." for p in link.split("/") if p)
                    ):
                        return f"归档含危险链接：{name[:80]} → {link[:80]}"
    except tarfile.TarError as e:
        return f"归档无法校验：{e}"
    except OSError as e:
        return f"归档无法读取：{e}"
    return ""


def _push_dir_via_tar_scp(
    local: Path,
    *,
    remote_abs: str,
    user: str,
    host: str,
    ssh: list[str],
    exclude_pats: list[str] | None = None,
    tar_ex: list[str] | None = None,
) -> tuple[int, str, str]:
    """无 rsync 时的可靠同步：本机 Python tarfile 落盘 → scp → 远端解压。

    禁止 Windows `tar.exe -cf - | ssh tar -xf -` 管道：System32 tar 常报
    ``tar.exe: Write error``（管道被对端提前关闭 / bsdtar 写 stdout 失败）。
    禁止本机 Git GNU tar ``-cf C:\\...``：会把盘符当成主机，报
    ``Cannot connect to C: resolve failed``。
    """
    import tempfile
    import uuid

    scp = _find_bin("scp.exe", "scp")
    if not scp:
        return (
            1,
            "",
            "本机找不到 scp。无 rsync 时需要 OpenSSH/Git 的 scp 做归档中转同步。",
        )
    key, port = _ssh_key_port_from_argv(ssh)
    if not key or not Path(key).is_file():
        return 1, "", "无法解析有效的 SSH 私钥路径，无法 scp 上传归档"
    if not (1 <= int(port) <= 65535):
        return 1, "", f"SSH 端口非法：{port}"

    pats = list(exclude_pats or [])
    if not pats and tar_ex:
        i = 0
        while i < len(tar_ex):
            if tar_ex[i] == "--exclude" and i + 1 < len(tar_ex):
                pats.append(str(tar_ex[i + 1]))
                i += 2
                continue
            i += 1

    remote_prep = _remote_overlay_prep(remote_abs)
    c0, o0, e0 = _run(ssh + [remote_prep], timeout=120)
    if c0 != 0:
        return c0, o0, e0 or "远端清空目标目录失败"

    stamp = uuid.uuid4().hex[:12]
    remote_arch = f"/tmp/wb-push-{stamp}.tar"
    local_arch = ""
    try:
        fd, local_arch = tempfile.mkstemp(prefix="wb-push-", suffix=".tar")
        os.close(fd)
        pack_err = _write_local_tar_archive(Path(local), Path(local_arch), pats)
        if pack_err:
            return 1, "", pack_err

        unsafe = _tar_archive_members_safe(Path(local_arch))
        if unsafe:
            return 1, "", f"拒绝上传不安全归档：{unsafe}"

        scp_cmd = [
            scp,
            "-i",
            key,
            "-P",
            str(port),
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ConnectTimeout=15",
            local_arch,
            f"{user}@{host}:{remote_arch}",
        ]
        c2, o2, e2 = _run(scp_cmd, timeout=300)
        if c2 != 0:
            return c2, o2, (e2 or o2 or "scp 上传归档失败")[:400]

        extract_cmd = (
            f"tar -xf {shlex.quote(remote_arch)} -C {shlex.quote(remote_abs)}; "
            f"ec=$?; rm -f -- {shlex.quote(remote_arch)}; exit $ec"
        )
        c3, o3, e3 = _run(ssh + [extract_cmd], timeout=300)
        if c3 != 0:
            return c3, o3, (e3 or o3 or "远端 tar 解压失败")[:400]
        return 0, o3 or "", ""
    except (OSError, subprocess.TimeoutExpired) as e:
        return 1, "", f"tar+scp 同步失败：{e}"
    finally:
        if local_arch:
            try:
                Path(local_arch).unlink(missing_ok=True)
            except OSError:
                pass
        # 失败时也尽量清远端临时包，避免 /tmp 堆积
        _run(ssh + [f"rm -f -- {shlex.quote(remote_arch)}"], timeout=30)


def _push_dir(
    local: Path,
    *,
    remote_abs: str,
    user: str,
    host: str,
    rsh: str,
    ssh: list[str],
    excludes: list[str],
    extra_excludes: list[str] | None = None,
) -> tuple[int, str, str]:
    """优先 rsync；无 rsync 时用 Python tarfile 落盘 + scp（保留 venv/db/.env）。"""
    if not _remote_abs_ok(remote_abs):
        return 1, "", f"拒绝同步到非法远端路径：{remote_abs!r}"
    if not _HOST_OK_LOOSE.match(host or "") or not _USER_OK_LOOSE.match(user or ""):
        return 1, "", "SSH user/host 非法"

    force_pats = [p for p in _FORCE_EXCLUDE if _EXCLUDE_PAT_OK.match(p)]
    extra_pats = [
        str(p).strip()
        for p in (extra_excludes or [])
        if str(p).strip() and _EXCLUDE_PAT_OK.match(str(p).strip())
    ]

    rsync = _find_bin("rsync.exe", "rsync")
    if rsync:
        cmd = [rsync, "-az", "--delete", "-e", rsh, *excludes]
        for pat in extra_pats + force_pats:
            cmd.extend(["--exclude", pat])
        cmd.extend([f"{local}/", f"{user}@{host}:{remote_abs}/"])
        return _run(cmd, timeout=300)

    pats = _collect_tar_exclude_pats(excludes, extra_excludes)
    return _push_dir_via_tar_scp(
        local,
        remote_abs=remote_abs,
        user=user,
        host=host,
        ssh=ssh,
        exclude_pats=pats,
    )


def _exclude_args(
    cfg: CodeDeployConfig, *, profile: dict[str, Any] | None = None
) -> list[str]:
    out: list[str] = []
    for pat in resolve_exclude_patterns(cfg, profile=profile):
        p = str(pat).strip()
        if p and _EXCLUDE_PAT_OK.match(p):
            out.extend(["--exclude", p])
    return out


def _safe_local_path(root: Path, rel: str) -> Path | None:
    """相对路径必须落在 workspace 内，拒绝绝对路径与 .. 逃逸。"""
    r = (rel or "").replace("\\", "/").strip()
    if not r or r.startswith("/") or r.startswith("~") or ".." in r.split("/"):
        return None
    if not _REL_OK.match(r):
        return None
    local = (root / r).resolve()
    try:
        local.relative_to(root.resolve())
    except ValueError:
        return None
    return local


def probe_remote_app(cfg: CodeDeployConfig) -> dict[str, Any]:
    """探测远端 ssh_app_path：是否存在、是否像空目录（影响强制全量）。"""
    errs = validate_ssh_settings(cfg)
    if errs:
        return {"ok": False, "empty": None, "error": errs[0]}
    key = Path(cfg.ssh_key_path).expanduser().resolve()
    app = (cfg.ssh_app_path or "").rstrip("/")
    ssh = _ssh_base(key, int(cfg.ssh_port), cfg.ssh_user, cfg.ssh_host)
    remote = (
        f"p={shlex.quote(app)}; "
        f"if [ ! -e \"$p\" ]; then echo missing; "
        f"elif [ -z \"$(ls -A \"$p\" 2>/dev/null)\" ]; then echo empty; "
        f"else echo ready; fi"
    )
    code, out, err = _run(ssh + [remote], timeout=40)
    token = (out or "").strip().splitlines()[-1] if (out or "").strip() else ""
    if code != 0:
        return {"ok": False, "empty": None, "error": (err or out or "SSH 探测失败")[:200]}
    if token in {"missing", "empty"}:
        return {"ok": True, "empty": True, "state": token, "error": ""}
    if token == "ready":
        return {"ok": True, "empty": False, "state": "ready", "error": ""}
    return {"ok": False, "empty": None, "error": f"远端探测未知输出：{token!r}"}


def _npm_build_error_detail(stdout: str, stderr: str, *, limit: int = 800) -> str:
    """从 npm/vite 输出里抽出可读失败原因（优先 error/ERROR 行）。"""
    combined = "\n".join(
        part for part in ((stderr or "").strip(), (stdout or "").strip()) if part
    )
    if not combined:
        return "npm run build 失败（无 stdout/stderr；常见：本机缺依赖、Vite 语法错误、或 npm 未正确落到 node+npm-cli.js）"
    lines = [ln.strip() for ln in combined.splitlines() if ln.strip()]
    hot = [
        ln
        for ln in lines
        if re.search(r"(error|ERROR|failed|FAILED|SyntaxError|ENOENT|ERR!)", ln)
    ]
    pick = hot[-12:] if hot else lines[-16:]
    text = "\n".join(pick) if pick else combined
    text = text.strip()
    if len(text) > limit:
        text = "…" + text[-(limit - 1) :]
    return text or "npm run build 失败"


# 编译/依赖真错误：重试无意义
_NPM_BUILD_HARD_FAIL_RE = re.compile(
    r"SyntaxError|TypeError|ReferenceError|"
    r"Module not found|Cannot find module|Could not resolve|"
    r"FAILED to resolve|Rollup failed to resolve|"
    r"\[vite\].*error|error during build|"
    r"TS\d{4}:|"
    r"npm ERR! code E\d+|ERESOLVE|peer dep",
    re.I,
)
# Windows Node/libuv 管道收尾、瞬时 IO：可重试
_NPM_BUILD_TRANSIENT_RE = re.compile(
    r"UV_HANDLE_CLOSING|Assertion failed:|"
    r"EPIPE|ECONNRESET|ECONNABORTED|EBUSY|EMFILE|ENFILE|"
    r"broken pipe|管道|errno\s*-4047|"
    r"FATAL ERROR|out of memory|heap out of memory",
    re.I,
)


def is_transient_npm_build_failure(code: int, stdout: str, stderr: str) -> bool:
    """判定 npm run build 是否值得自动重试（瞬时崩溃 vs 源码/依赖错误）。"""
    blob = f"{stdout or ''}\n{stderr or ''}"
    if _NPM_BUILD_HARD_FAIL_RE.search(blob):
        return False
    if _NPM_BUILD_TRANSIENT_RE.search(blob):
        return True
    # 无输出的非 0：常见于 libuv 断言直接 abort、管道未刷出
    if int(code or 0) != 0 and not blob.strip():
        return True
    return False


def _run_npm_build(
    npm_argv: list[str],
    frontend: Path,
    *,
    timeout: int = 420,
    max_attempts: int = 3,
    log: Callable[[str], None] | None = None,
) -> tuple[int, str, str, int]:
    """本机 npm run build：stdout/stderr 落临时文件，规避 Windows 管道收尾崩溃；瞬时失败最多重试。

    返回 (exit_code, stdout, stderr, attempts_used)。
    """
    import tempfile
    import time

    attempts = max(1, min(3, int(max_attempts or 3)))
    last_code, last_out, last_err = 1, "", "npm run build 未执行"
    used = 0
    for attempt in range(1, attempts + 1):
        used = attempt
        if attempt > 1:
            if log:
                log(f"npm run build 瞬时失败，自动重试 {attempt}/{attempts} …")
            time.sleep(min(1.2 * (attempt - 1), 3.5))
        with tempfile.TemporaryDirectory(prefix="wb-npm-build-") as td:
            out_p = Path(td) / "stdout.txt"
            err_p = Path(td) / "stderr.txt"
            try:
                with open(out_p, "wb") as fo, open(err_p, "wb") as fe:
                    p = subprocess.run(
                        [*npm_argv, "run", "build"],
                        stdin=subprocess.DEVNULL,
                        stdout=fo,
                        stderr=fe,
                        timeout=timeout,
                        cwd=str(frontend),
                        **_win_run_kwargs(),
                    )
                last_code = int(p.returncode or 0)
            except FileNotFoundError as e:
                last_code, last_out, last_err = 1, "", str(e)
                break
            except subprocess.TimeoutExpired:
                last_code, last_out, last_err = 1, "", f"npm run build 超时（>{timeout}s）"
                # 超时也可再试一轮
                if attempt < attempts:
                    continue
                break
            except OSError as e:
                last_code, last_out, last_err = 1, "", str(e)
                if is_transient_npm_build_failure(last_code, last_out, last_err) and attempt < attempts:
                    continue
                break
            try:
                last_out = out_p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                last_out = ""
            try:
                last_err = err_p.read_text(encoding="utf-8", errors="replace")
            except OSError:
                last_err = ""
        if last_code == 0:
            return 0, last_out, last_err, used
        if not is_transient_npm_build_failure(last_code, last_out, last_err):
            break
    return last_code, last_out, last_err, used


def _validate_simple_build_cmd(build_cmd: str) -> str:
    """空=ok；非空禁止管道/重定向/换行。"""
    s = (build_cmd or "").strip()
    if not s:
        return ""
    if any(ch in s for ch in ("\n", "\r", "|", ";", "&", "`", "$(", ">", "<")):
        return "build_cmd 含非法字符（禁止管道/重定向/换行）"
    if len(s) > 200:
        return "build_cmd 过长"
    return ""


def _run_remote_build(
    ssh: list[str],
    *,
    app: str,
    build_cwd: str,
    build_cmd: str,
    log: Callable[[str], None],
    urec: dict[str, Any],
) -> bool:
    err = _validate_simple_build_cmd(build_cmd)
    if err:
        urec["ok"] = False
        urec["error"] = err
        return False
    cwd = (build_cwd or ".").replace("\\", "/").strip()
    while cwd.startswith("./"):
        cwd = cwd[2:]
    cwd = cwd or "."
    if cwd != "." and (
        cwd.startswith("/")
        or cwd.startswith("~")
        or ".." in cwd.split("/")
        or not _REL_OK.match(cwd)
    ):
        urec["ok"] = False
        urec["error"] = f"非法 build_cwd：{build_cwd}"
        return False
    remote_dir = app if cwd == "." else f"{app}/{cwd}"
    remote = f"cd {shlex.quote(remote_dir)} && {build_cmd}"
    log(f"远端构建（{cwd}）：{build_cmd} …")
    urec["logs"].append(f"remote build: {build_cmd}")
    c, o, e = _run(ssh + [f"bash -lc {shlex.quote(remote)}"], timeout=600)
    if c != 0:
        urec["ok"] = False
        urec["error"] = (e or o or "远端构建失败")[:800]
        urec["logs"].append(urec["error"])
        return False
    return True


def _sync_vite_backend_layout(
    root: Path,
    *,
    cfg: CodeDeployConfig,
    user: str,
    host: str,
    app: str,
    rsh: str,
    ssh: list[str],
    excludes: list[str],
    log: Callable[[str], None],
) -> dict[str, Any]:
    """Vite+backend：本机或远端构建后同步；快照按实际同步目录。"""
    urec: dict[str, Any] = {"id": "workspace", "ok": True, "logs": []}
    strategy = resolve_deploy_strategy(root, cfg=cfg)
    build_where = str(strategy.get("build_where") or "local")
    frontend = root / "frontend"
    backend = root / "backend"

    snap: dict[str, Any] = {"ok": True, "empty": True, "archive": ""}
    if must_keep_service_alive():
        snap = _remote_pre_deploy_snapshot(
            ssh, app, log, rels=["backend", "frontend/dist"]
        )
        urec["logs"].append(snap.get("detail") or "pre-deploy snapshot")
        if not snap.get("ok"):
            urec["ok"] = False
            urec["error"] = (
                "硬约束：部署前快照失败，拒绝覆盖远端（避免搞挂后无法回滚）："
                + str(snap.get("detail") or "")
            )[:400]
            urec["logs"].append(urec["error"])
            urec["reason"] = "pre_deploy_snapshot_failed"
            return urec

    mkdir_cmd = (
        f"mkdir -p -- {shlex.quote(app + '/frontend/dist')} "
        f"{shlex.quote(app + '/backend')} {shlex.quote(app + '/frontend')}"
    )
    _run(ssh + [mkdir_cmd], timeout=40)

    if build_where == "remote":
        log("远端构建模式：同步 frontend 源码 …")
        c_fe, o_fe, e_fe = _push_dir(
            frontend,
            remote_abs=f"{app}/frontend",
            user=user,
            host=host,
            rsh=rsh,
            ssh=ssh,
            excludes=excludes,
        )
        if c_fe != 0:
            urec["ok"] = False
            urec["error"] = (e_fe or o_fe or "同步 frontend 失败")[:400]
            return urec
        log("同步 backend → 远端 …")
        c2, o2, e2 = _push_dir(
            backend,
            remote_abs=f"{app}/backend",
            user=user,
            host=host,
            rsh=rsh,
            ssh=ssh,
            excludes=excludes,
            extra_excludes=list(_BACKEND_KEEP),
        )
        if c2 != 0:
            urec["ok"] = False
            urec["error"] = (e2 or o2 or "同步 backend 失败")[:400]
            return urec
        if not _run_remote_build(
            ssh,
            app=app,
            build_cwd=str(strategy.get("build_cwd") or "frontend"),
            build_cmd=str(strategy.get("build_cmd") or "npm run build"),
            log=log,
            urec=urec,
        ):
            return urec
    else:
        npm_argv = _npm_argv()
        if not npm_argv:
            urec["ok"] = False
            urec["error"] = "本机找不到 npm，无法构建前端 dist（或改 build_where=remote）"
            urec["logs"].append(urec["error"])
            return urec
        log("本机构建前端 npm run build …")
        urec["logs"].append("npm run build")
        c0, o0, e0, build_attempts = _run_npm_build(
            npm_argv, frontend, timeout=420, max_attempts=3, log=log
        )
        if build_attempts > 1:
            urec["logs"].append(f"npm build attempts={build_attempts}")
        if c0 != 0:
            urec["ok"] = False
            detail = _npm_build_error_detail(o0, e0)
            urec["error"] = detail[:800]
            urec["logs"].append(detail[:800])
            urec["reason"] = (
                "npm_build_transient_exhausted"
                if is_transient_npm_build_failure(c0, o0, e0)
                else "npm_build_failed"
            )
            log(f"npm run build 失败：{detail[:240]}")
            return urec
        dist = frontend / "dist"
        if not dist.is_dir():
            urec["ok"] = False
            urec["error"] = "构建完成但没有 frontend/dist，无法更新预发页面"
            urec["logs"].append(urec["error"])
            return urec
        log("同步 frontend/dist → 远端 …")
        urec["logs"].append("sync frontend/dist")
        c1, o1, e1 = _push_dir(
            dist,
            remote_abs=f"{app}/frontend/dist",
            user=user,
            host=host,
            rsh=rsh,
            ssh=ssh,
            excludes=[],
        )
        if c1 != 0:
            urec["ok"] = False
            urec["error"] = (e1 or o1 or "同步 frontend/dist 失败")[:400]
            urec["logs"].append(urec["error"])
            return urec
        log("同步 backend → 远端 …")
        urec["logs"].append("sync backend")
        c2, o2, e2 = _push_dir(
            backend,
            remote_abs=f"{app}/backend",
            user=user,
            host=host,
            rsh=rsh,
            ssh=ssh,
            excludes=excludes,
            extra_excludes=list(_BACKEND_KEEP),
        )
        if c2 != 0:
            urec["ok"] = False
            urec["error"] = (e2 or o2 or "同步 backend 失败")[:400]
            urec["logs"].append(urec["error"])
            return urec

    if not _install_remote_backend_deps(ssh, app, log, urec):
        return urec
    if not _restart_and_verify_backend(
        ssh, cfg=cfg, app=app, backend=backend, log=log, urec=urec
    ):
        if must_keep_service_alive():
            deploy_err = str(urec.get("error") or "探活失败")
            _rollback_after_dead_service(
                ssh,
                cfg=cfg,
                app=app,
                backend=backend,
                log=log,
                urec=urec,
                snap=snap,
                deploy_err=deploy_err,
            )
        return urec
    return urec


def _sync_static_layout(
    root: Path,
    *,
    cfg: CodeDeployConfig,
    user: str,
    host: str,
    app: str,
    rsh: str,
    ssh: list[str],
    excludes: list[str],
    log: Callable[[str], None],
) -> dict[str, Any]:
    """纯静态：本机或远端构建 dist；快照按 dist 目录；探活失败回滚。"""
    urec: dict[str, Any] = {"id": "workspace:static", "ok": True, "logs": []}
    strategy = resolve_deploy_strategy(root, cfg=cfg)
    build_where = str(strategy.get("build_where") or "local")
    build_cwd = str(strategy.get("build_cwd") or "frontend").strip() or "frontend"
    dist_rel = str(strategy.get("dist_rel") or f"{build_cwd}/dist").strip().replace("\\", "/")
    cwd_path = root / build_cwd if build_cwd not in (".", "") else root
    if not cwd_path.is_dir():
        urec["ok"] = False
        urec["error"] = f"构建目录不存在：{build_cwd}"
        return urec

    snap: dict[str, Any] = {"ok": True, "empty": True, "archive": ""}
    if must_keep_service_alive():
        snap = _remote_pre_deploy_snapshot(ssh, app, log, rels=[dist_rel])
        urec["logs"].append(snap.get("detail") or "pre-deploy snapshot")
        if not snap.get("ok"):
            urec["ok"] = False
            urec["error"] = (
                "硬约束：部署前快照失败，拒绝覆盖远端："
                + str(snap.get("detail") or "")
            )[:400]
            urec["reason"] = "pre_deploy_snapshot_failed"
            return urec

    _run(ssh + [f"mkdir -p -- {shlex.quote(app + '/' + dist_rel)} {shlex.quote(app + '/' + build_cwd)}"], timeout=40)

    if build_where == "remote":
        log(f"远端构建模式：同步源码 {build_cwd} …")
        c_src, o_src, e_src = _push_dir(
            cwd_path,
            remote_abs=f"{app}/{build_cwd}" if build_cwd not in (".", "") else app,
            user=user,
            host=host,
            rsh=rsh,
            ssh=ssh,
            excludes=excludes,
        )
        if c_src != 0:
            urec["ok"] = False
            urec["error"] = (e_src or o_src or "同步源码失败")[:400]
            return urec
        if not _run_remote_build(
            ssh,
            app=app,
            build_cwd=build_cwd,
            build_cmd=str(strategy.get("build_cmd") or "npm run build"),
            log=log,
            urec=urec,
        ):
            return urec
    else:
        npm_argv = _npm_argv()
        if not npm_argv:
            urec["ok"] = False
            urec["error"] = "本机找不到 npm，无法构建静态产物（或改 build_where=remote）"
            return urec
        log(f"本机构建静态产物（cwd={build_cwd}）…")
        urec["logs"].append(f"npm run build @ {build_cwd}")
        c0, o0, e0, _attempts = _run_npm_build(
            npm_argv, cwd_path, timeout=420, max_attempts=3, log=log
        )
        if c0 != 0:
            urec["ok"] = False
            urec["error"] = _npm_build_error_detail(o0, e0)[:800]
            return urec
        dist = root / dist_rel
        if not dist.is_dir():
            urec["ok"] = False
            urec["error"] = f"构建完成但没有 {dist_rel}"
            return urec
        log(f"同步 {dist_rel} → 远端 …")
        c1, o1, e1 = _push_dir(
            dist,
            remote_abs=f"{app}/{dist_rel}",
            user=user,
            host=host,
            rsh=rsh,
            ssh=ssh,
            excludes=excludes,
        )
        if c1 != 0:
            urec["ok"] = False
            urec["error"] = (e1 or o1 or "同步 dist 失败")[:400]
            return urec

    custom = str(getattr(cfg, "remote_restart_cmd", "") or "").strip()
    if custom:
        cmd_err = validate_remote_restart_cmd(custom)
        if cmd_err:
            urec["ok"] = False
            urec["error"] = cmd_err
            return urec
        log("执行配置的远端重启命令 …")
        c3, o3, e3 = _run(ssh + [f"bash -lc {shlex.quote(custom)}"], timeout=120)
        if c3 != 0:
            urec["ok"] = False
            urec["error"] = (e3 or o3 or "远端重启失败")[:400]
            return urec
    else:
        urec["logs"].append("静态部署：未配置 remote_restart_cmd，仅同步产物")

    entry = cfg.resolve_entry_url() if hasattr(cfg, "resolve_entry_url") else (cfg.health_url or "")
    if must_keep_service_alive():
        if not entry:
            urec["ok"] = False
            urec["error"] = "硬约束：未配置 health_url/entry_url，无法验收服务存活"
            return urec
        health = probe_health(
            entry,
            timeout=cfg.health_timeout_sec,
            expect_status=int(getattr(cfg, "health_expect_status", 0) or 0),
        )
        if not health.get("ok"):
            deploy_err = f"探活失败：{health.get('detail') or health.get('status')}"
            urec["reason"] = "service_down_after_deploy"
            archive = str(snap.get("archive") or "")
            if snap.get("empty") or not archive:
                urec["ok"] = False
                urec["error"] = f"{deploy_err} 且无可用快照可回滚"[:400]
                return urec
            restored = _remote_restore_pre_deploy_snapshot(ssh, app, archive, log)
            urec["logs"].append(restored.get("detail") or "rollback")
            urec["ok"] = False  # 发版仍失败
            urec["error"] = (
                f"{deploy_err}；已尝试回滚"
                + ("并恢复" if restored.get("ok") else f"（回滚失败：{restored.get('detail')}）")
            )[:400]
            urec["rollback"] = restored
            return urec
        urec["logs"].append("entry health ok")
    return urec


def _sync_custom_layout(
    root: Path,
    *,
    cfg: CodeDeployConfig,
    user: str,
    host: str,
    app: str,
    rsh: str,
    ssh: list[str],
    excludes: list[str],
    log: Callable[[str], None],
) -> dict[str, Any]:
    """自定义：按 build_cmd / sync_paths / remote_restart_cmd；快照按同步目录。"""
    urec: dict[str, Any] = {"id": "workspace:custom", "ok": True, "logs": []}
    strategy = resolve_deploy_strategy(root, cfg=cfg)
    build_where = str(strategy.get("build_where") or "local")
    build_cmd = str(strategy.get("build_cmd") or "").strip()
    build_cwd = str(strategy.get("build_cwd") or ".").strip() or "."
    sync_paths = [str(x) for x in (strategy.get("sync_paths") or []) if str(x).strip()]
    if not sync_paths:
        urec["ok"] = False
        urec["error"] = "自定义部署缺少 sync_paths"
        return urec

    snap_rels = sanitize_snapshot_rels(sync_paths)
    snap: dict[str, Any] = {"ok": True, "empty": True, "archive": ""}
    if must_keep_service_alive() and snap_rels:
        snap = _remote_pre_deploy_snapshot(ssh, app, log, rels=snap_rels)
        urec["logs"].append(snap.get("detail") or "pre-deploy snapshot")
        if not snap.get("ok"):
            urec["ok"] = False
            urec["error"] = (
                "硬约束：部署前快照失败，拒绝覆盖远端："
                + str(snap.get("detail") or "")
            )[:400]
            urec["reason"] = "pre_deploy_snapshot_failed"
            return urec

    if build_where != "remote" and build_cmd:
        cwd_path = root if build_cwd in (".", "") else root / build_cwd
        if not cwd_path.is_dir():
            urec["ok"] = False
            urec["error"] = f"构建目录不存在：{build_cwd}"
            return urec
        verr = _validate_simple_build_cmd(build_cmd)
        if verr:
            urec["ok"] = False
            urec["error"] = verr
            return urec
        log(f"本机执行构建：{build_cmd} …")
        urec["logs"].append(f"build: {build_cmd}")
        try:
            proc = subprocess.run(
                build_cmd,
                shell=True,
                cwd=str(cwd_path),
                capture_output=True,
                text=True,
                timeout=600,
                env={**os.environ, "CI": "1"},
            )
        except Exception as e:  # noqa: BLE001
            urec["ok"] = False
            urec["error"] = f"构建失败：{e}"
            return urec
        if int(proc.returncode) != 0:
            urec["ok"] = False
            urec["error"] = ((proc.stderr or "") + "\n" + (proc.stdout or ""))[:800] or "构建失败"
            return urec

    for rel in sync_paths:
        rel_n = rel.replace("\\", "/").strip()
        while rel_n.startswith("./"):
            rel_n = rel_n[2:]
        if (
            not rel_n
            or rel_n.startswith("/")
            or rel_n.startswith("~")
            or ".." in rel_n.split("/")
            or not _REL_OK.match(rel_n)
        ):
            urec["ok"] = False
            urec["error"] = f"非法 sync_paths：{rel}"
            return urec
        local = root / rel_n
        if not local.exists():
            urec["ok"] = False
            urec["error"] = f"本地路径不存在：{rel_n}"
            return urec
        remote_abs = f"{app}/{rel_n}"
        _run(ssh + [f"mkdir -p -- {shlex.quote(str(Path(remote_abs).parent.as_posix()) if local.is_file() else remote_abs)}"], timeout=40)
        log(f"同步 {rel_n} → 远端 …")
        urec["logs"].append(f"sync {rel_n}")
        if local.is_dir():
            c1, o1, e1 = _push_dir(
                local,
                remote_abs=remote_abs,
                user=user,
                host=host,
                rsh=rsh,
                ssh=ssh,
                excludes=excludes,
            )
        else:
            rsync = _find_bin("rsync.exe", "rsync")
            remote_target = f"{user}@{host}:{remote_abs}"
            if rsync:
                c1, o1, e1 = _run(
                    [rsync, "-az", "-e", rsh, *excludes, str(local), remote_target],
                    timeout=300,
                )
            else:
                scp = _find_bin("scp.exe", "scp") or "scp"
                c1, o1, e1 = _run(
                    [
                        scp,
                        "-i",
                        str(Path(cfg.ssh_key_path).expanduser()),
                        "-P",
                        str(cfg.ssh_port),
                        "-o",
                        "BatchMode=yes",
                        "-o",
                        "StrictHostKeyChecking=accept-new",
                        str(local),
                        remote_target,
                    ],
                    timeout=300,
                )
        if c1 != 0:
            urec["ok"] = False
            urec["error"] = (e1 or o1 or f"同步 {rel_n} 失败")[:400]
            return urec

    if build_where == "remote" and build_cmd:
        if not _run_remote_build(
            ssh,
            app=app,
            build_cwd=build_cwd,
            build_cmd=build_cmd,
            log=log,
            urec=urec,
        ):
            return urec

    custom = str(getattr(cfg, "remote_restart_cmd", "") or "").strip()
    if custom:
        cmd_err = validate_remote_restart_cmd(custom)
        if cmd_err:
            urec["ok"] = False
            urec["error"] = cmd_err
            return urec
        log("执行配置的远端重启命令 …")
        c3, o3, e3 = _run(ssh + [f"bash -lc {shlex.quote(custom)}"], timeout=120)
        if c3 != 0:
            urec["ok"] = False
            urec["error"] = (e3 or o3 or "远端重启失败")[:400]
            return urec
    elif str(getattr(cfg, "process_match", "") or "").strip():
        # 复用 vite 路径的重启探测（带 process_match）
        backend = root / "backend"
        if not backend.is_dir():
            backend = root
        if not _restart_and_verify_backend(
            ssh, cfg=cfg, app=app, backend=backend, log=log, urec=urec
        ):
            return urec
    else:
        urec["logs"].append("自定义部署：未配置重启，仅同步文件")

    entry = cfg.resolve_entry_url() if hasattr(cfg, "resolve_entry_url") else (cfg.health_url or "")
    if must_keep_service_alive():
        if not entry:
            urec["ok"] = False
            urec["error"] = "硬约束：未配置 health_url/entry_url，无法验收服务存活"
            return urec
        health = probe_health(
            entry,
            timeout=cfg.health_timeout_sec,
            expect_status=int(getattr(cfg, "health_expect_status", 0) or 0),
        )
        if not health.get("ok"):
            deploy_err = f"探活失败：{health.get('detail') or health.get('status')}"
            urec["reason"] = "service_down_after_deploy"
            archive = str(snap.get("archive") or "")
            if snap.get("empty") or not archive:
                urec["ok"] = False
                urec["error"] = f"{deploy_err} 且无可用快照可回滚"[:400]
                return urec
            restored = _remote_restore_pre_deploy_snapshot(ssh, app, archive, log)
            urec["logs"].append(restored.get("detail") or "rollback")
            urec["ok"] = False
            urec["error"] = (
                f"{deploy_err}；已尝试回滚"
                + ("并恢复" if restored.get("ok") else f"（回滚失败：{restored.get('detail')}）")
            )[:400]
            urec["rollback"] = restored
            return urec
        urec["logs"].append("entry health ok")
    return urec


def deploy_units_ssh(
    workspace: Path | str,
    units: list[DeployUnit],
    cfg: CodeDeployConfig,
    *,
    log: Callable[[str], None] | None = None,
    meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """按单元 rsync 到远端 ssh_app_path；按需重启引擎/DSH。

    成功后在远端写入 last_deploy_receipt.json，便于服务器核对「本次实际同步了什么」。
    """
    def _log(msg: str) -> None:
        if log:
            log(msg)

    errs = validate_ssh_settings(cfg)
    if errs:
        return {"ok": False, "error": errs[0], "results": []}
    if not units:
        return {"ok": False, "error": "未选择任何部署单元", "results": []}

    root = Path(workspace).expanduser().resolve()
    if not root.is_dir():
        return {"ok": False, "error": "工作区不存在", "results": []}
    key = Path(cfg.ssh_key_path).expanduser().resolve()
    app = cfg.ssh_app_path.rstrip("/")
    if not _remote_abs_ok(app):
        return {"ok": False, "error": f"拒绝部署到非法远端路径：{app!r}", "results": []}
    user, host, port = cfg.ssh_user, cfg.ssh_host, int(cfg.ssh_port)
    tool_err = _preflight_sync_tools()
    if tool_err:
        return {"ok": False, "error": tool_err, "results": []}
    ssh = _ssh_base(key, port, user, host)
    rsh = _rsync_ssh(key, port)
    profile: dict[str, Any] | None = None
    try:
        from ..project_profile import load_cached

        profile = load_cached(str(root))
    except Exception:  # noqa: BLE001
        profile = None
    excludes = _exclude_args(cfg, profile=profile)
    results: list[dict[str, Any]] = []

    _log("SSH 登录探测 …")
    code, out, err = _run(ssh + ["echo ssh_ok"], timeout=40)
    if code != 0 or "ssh_ok" not in (out or ""):
        return {"ok": False, "error": f"SSH 失败：{(err or out or '').strip()[:300]}", "results": []}

    need_engine = False
    need_bridge = False

    for unit in units:
        urec: dict[str, Any] = {"id": unit.id, "ok": True, "logs": []}
        if unit.id == "workspace" and not is_vite_backend_layout(root):
            urec["ok"] = False
            urec["error"] = (
                "非 Vite+backend 布局禁止整仓 workspace 默认同步。"
                "请设置 deploy_preset=static|custom|vite_backend 并配置同步路径。"
            )
            results.append(urec)
            return {
                "ok": False,
                "error": f"单元 {unit.id} 失败：{urec.get('error')}",
                "results": results,
            }
        if unit.id == "workspace" and is_vite_backend_layout(root):
            urec = _sync_vite_backend_layout(
                root,
                cfg=cfg,
                user=user,
                host=host,
                app=app,
                rsh=rsh,
                ssh=ssh,
                excludes=excludes,
                log=_log,
            )
            results.append(urec)
            if not urec["ok"]:
                return {
                    "ok": False,
                    "error": f"单元 {unit.id} 失败：{urec.get('error')}",
                    "results": results,
                }
            continue
        if unit.id == "workspace:static" or unit.action == "sync_static":
            urec = _sync_static_layout(
                root,
                cfg=cfg,
                user=user,
                host=host,
                app=app,
                rsh=rsh,
                ssh=ssh,
                excludes=excludes,
                log=_log,
            )
            results.append(urec)
            if not urec["ok"]:
                return {
                    "ok": False,
                    "error": f"单元 {unit.id} 失败：{urec.get('error')}",
                    "results": results,
                }
            continue
        if unit.id == "workspace:custom" or unit.action == "sync_custom":
            urec = _sync_custom_layout(
                root,
                cfg=cfg,
                user=user,
                host=host,
                app=app,
                rsh=rsh,
                ssh=ssh,
                excludes=excludes,
                log=_log,
            )
            results.append(urec)
            if not urec["ok"]:
                return {
                    "ok": False,
                    "error": f"单元 {unit.id} 失败：{urec.get('error')}",
                    "results": results,
                }
            continue
        for rel in unit.local_rels:
            local = _safe_local_path(root, rel)
            if local is None:
                urec["ok"] = False
                urec["error"] = f"非法本地相对路径：{rel}"
                urec["logs"].append(urec["error"])
                break
            if not local.exists():
                urec["ok"] = False
                urec["error"] = f"本地路径不存在：{rel}"
                urec["logs"].append(urec["error"])
                break
            if local.is_file() and _is_sensitive_local_file(local):
                urec["ok"] = False
                urec["error"] = f"拒绝同步敏感文件：{rel}"
                urec["logs"].append(urec["error"])
                break
            remote_parent = f"{app}/{Path(rel).parent.as_posix()}".rstrip("/")
            if Path(rel).parent.as_posix() in (".", ""):
                remote_parent = app
            remote_target = f"{user}@{host}:{app}/{rel}"
            if local.is_dir():
                remote_target = f"{user}@{host}:{app}/{rel}/"
            _log(f"同步 {rel} → 远端 …")
            urec["logs"].append(f"sync {rel}")
            mkdir_target = remote_parent if local.is_file() else f"{app}/{rel}"
            mkdir_cmd = f"mkdir -p -- {shlex.quote(mkdir_target)}"
            _run(ssh + [mkdir_cmd], timeout=40)
            if local.is_dir():
                c2, o2, e2 = _push_dir(
                    local,
                    remote_abs=f"{app}/{rel}",
                    user=user,
                    host=host,
                    rsh=rsh,
                    ssh=ssh,
                    excludes=excludes,
                )
            else:
                rsync = _find_bin("rsync.exe", "rsync")
                if rsync:
                    cmd = [rsync, "-az", "-e", rsh, *excludes, str(local), remote_target]
                    c2, o2, e2 = _run(cmd, timeout=300)
                else:
                    scp = _find_bin("scp.exe", "scp") or "scp"
                    cmd = [
                        scp,
                        "-i",
                        str(key),
                        "-P",
                        str(port),
                        "-o",
                        "BatchMode=yes",
                        "-o",
                        "StrictHostKeyChecking=accept-new",
                        str(local),
                        remote_target,
                    ]
                    c2, o2, e2 = _run(cmd, timeout=300)
            if c2 != 0:
                urec["ok"] = False
                urec["error"] = (e2 or o2 or "同步失败")[:400]
                urec["logs"].append(urec["error"])
                break
        if urec["ok"]:
            if unit.action == "sync_engine_restart":
                need_engine = True
            elif unit.action in {"sync_bridge", "sync_bridge_reinstall"}:
                # 默认仅同步；auto_restart_bridge=true 才重启远端宿主
                if getattr(cfg, "auto_restart_bridge", False):
                    need_bridge = True
                else:
                    urec["logs"].append(
                        "已同步 bridge；默认不重启远端宿主（auto_restart_bridge=false）"
                    )
                    urec["action_effective"] = "sync_bridge"
        results.append(urec)
        if not urec["ok"]:
            return {"ok": False, "error": f"单元 {unit.id} 失败：{urec.get('error')}", "results": results}

    unified = bool(getattr(cfg, "unified_product", True))
    want_engine_runtime = need_engine or unified
    prep: dict[str, Any] = {"ok": True, "port": None, "logs": []}
    if want_engine_runtime:
        # 远端运行时隔离：专用端口 + venv，禁止抢占/误杀已有服务
        prep = _ensure_remote_engine_runtime(ssh, app, cfg, log=_log)
        if not prep.get("ok"):
            return {
                "ok": False,
                "error": prep.get("error") or "远端运行时准备失败",
                "results": results,
                "engine_restart": False,
            }
        results.append({"id": "_remote_runtime", "ok": True, "logs": prep.get("logs") or []})
    else:
        _log("非一体部署且无引擎单元，跳过远端 WorkBuddy 引擎准备")

    engine_restarted = False
    engine_ensured = False

    # 引擎收尾：有 engine 单元则 restart；一体部署时无变更也 ensure 保活
    if need_engine and getattr(cfg, "auto_restart_engine", True):
        remote = f"cd {shlex.quote(app)} && scripts/engine.sh zr-workbuddy restart"
        _log(f"远端重启本应用引擎（端口 {prep.get('port')}）…")
        c3, o3, e3 = _run(ssh + [f"bash -lc {shlex.quote(remote)}"], timeout=240)
        if c3 != 0:
            return {
                "ok": False,
                "error": f"引擎重启失败：{(e3 or o3)[:400]}",
                "results": results,
                "engine_restart": False,
            }
        engine_restarted = True
        results.append({"id": "_engine_restart", "ok": True, "logs": ["engine restart ok"]})
    elif need_engine:
        _log("已同步引擎文件；按配置跳过远端引擎重启（auto_restart_engine=false）")
        results.append({"id": "_engine_restart", "ok": True, "logs": ["skipped by config"]})
    elif unified and getattr(cfg, "auto_restart_engine", True):
        remote = f"cd {shlex.quote(app)} && scripts/engine.sh zr-workbuddy ensure"
        _log(f"一体部署：确保远端引擎在跑（端口 {prep.get('port')}）…")
        c3, o3, e3 = _run(ssh + [f"bash -lc {shlex.quote(remote)}"], timeout=240)
        if c3 != 0:
            return {
                "ok": False,
                "error": f"引擎 ensure 失败：{(e3 or o3)[:400]}",
                "results": results,
                "engine_restart": False,
            }
        engine_ensured = True
        results.append({"id": "_engine_ensure", "ok": True, "logs": ["engine ensure ok"]})

    # 聊天壳收尾：一体部署每次确保；或 bridge 单元且 auto_restart_bridge
    want_host = unified or (
        need_bridge and getattr(cfg, "auto_restart_bridge", False)
    )
    force_host_restart = bool(
        need_bridge and getattr(cfg, "auto_restart_bridge", False)
    )
    bridge_restarted = False
    host_up = False
    if want_host:
        host_res = _ensure_remote_host_web(
            ssh,
            app,
            cfg,
            force_restart=force_host_restart,
            also_reinstall_bridge=bool(need_bridge and getattr(cfg, "auto_restart_bridge", False)),
            log=_log,
        )
        results.append(host_res)
        if not host_res.get("ok") and host_res.get("hard_fail"):
            return {
                "ok": False,
                "error": host_res.get("error") or "远端聊天壳收尾失败",
                "results": results,
                "bridge_restart": False,
                "host_up": False,
            }
        bridge_restarted = bool(host_res.get("bridge_restart"))
        host_up = bool(host_res.get("host_up"))
        if host_res.get("warning"):
            _log(str(host_res.get("warning")))
    elif need_bridge:
        _log("已同步 bridge 文件；按配置跳过远端宿主重启（auto_restart_bridge=false）")
        results.append({"id": "_bridge_restart", "ok": True, "logs": ["skipped by config"]})

    entry = ""
    if hasattr(cfg, "resolve_entry_url"):
        entry = cfg.resolve_entry_url()
    else:
        entry = (getattr(cfg, "entry_url", None) or cfg.health_url or "").strip()
    health: dict[str, Any] | None = None
    if entry:
        health = probe_health(
            entry,
            timeout=cfg.health_timeout_sec,
            expect_status=int(getattr(cfg, "health_expect_status", 0) or 0),
        )
        _log(f"入口探活 {entry} → {health}")

    receipt = _write_remote_deploy_receipt(
        ssh,
        app,
        units=units,
        results=results,
        cfg=cfg,
        meta=meta or {},
        engine_restart=engine_restarted or engine_ensured,
        bridge_restart=bridge_restarted,
        remote_engine_port=prep.get("port"),
        health=health if isinstance(health, dict) else None,
        log=_log,
    )
    if receipt.get("ok"):
        results.append({"id": "_receipt", "ok": True, "logs": [receipt.get("path") or "receipt ok"]})
    else:
        # 回执失败不回滚已同步文件，但标进结果便于排查
        results.append(
            {
                "id": "_receipt",
                "ok": False,
                "logs": [receipt.get("error") or "receipt failed"],
            }
        )

    return {
        "ok": True,
        "error": "",
        "results": results,
        "engine_restart": engine_restarted,
        "engine_ensure": engine_ensured,
        "bridge_restart": bridge_restarted,
        "host_up": host_up,
        "unified_product": unified,
        "health": health,
        "entry_url": entry,
        "units": [u.id for u in units],
        "remote_engine_port": prep.get("port"),
        "remote_host_port": int(getattr(cfg, "remote_host_port", 3080) or 3080),
        "remote_receipt_path": receipt.get("path") or "",
        "remote_receipt_ok": bool(receipt.get("ok")),
    }


def _ensure_remote_host_web(
    ssh: list[str],
    app: str,
    cfg: CodeDeployConfig,
    *,
    force_restart: bool = False,
    also_reinstall_bridge: bool = False,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """一体收尾：确保远端聊天壳（dsh web）在跑；无 profile 时软跳过。"""

    def _log(msg: str) -> None:
        if log:
            log(msg)

    host_port = int(getattr(cfg, "remote_host_port", 3080) or 3080)
    logs: list[str] = []
    # 二次保险：远端没有完整 DSH profile 时不 install（避免半残 .dsh）
    prof_check = (
        "test -f \"$HOME/.dsh/profiles/web/package.json\" "
        "&& echo dsh_ok || echo dsh_missing"
    )
    _c_p, o_p, _e_p = _run(ssh + [prof_check], timeout=30)
    if "dsh_ok" not in (o_p or ""):
        warn = (
            "远端无 ~/.dsh/profiles/web/package.json，已跳过聊天壳启动；"
            "业务文件已同步。请在服务器安装 dsh 并用 scripts/host.sh wire 接线后再部署。"
        )
        _log(warn)
        return {
            "id": "_host_web",
            "ok": True,
            "hard_fail": False,
            "host_up": False,
            "bridge_restart": False,
            "logs": ["skipped: no remote DSH profile", warn],
            "warning": warn,
        }

    if also_reinstall_bridge:
        remote_install = (
            f"cd {shlex.quote(app)} && "
            "scripts/plugin.sh --app zr-workbuddy install bridge"
        )
        _log("远端重装 bridge …")
        c4, o4, e4 = _run(ssh + [f"bash -lc {shlex.quote(remote_install)}"], timeout=300)
        if c4 != 0:
            return {
                "id": "_host_web",
                "ok": False,
                "hard_fail": True,
                "host_up": False,
                "bridge_restart": False,
                "error": f"bridge 重装失败：{(e4 or o4)[:300]}",
                "logs": logs,
            }
        logs.append("bridge install ok")

    listen_check = (
        f"pid=$(lsof -tiTCP:{host_port} -sTCP:LISTEN 2>/dev/null | head -1); "
        f"if [ -n \"$pid\" ]; then echo up:$pid; else echo down; fi"
    )
    _c_l, o_l, _e_l = _run(ssh + [listen_check], timeout=30)
    token = (o_l or "").strip().splitlines()[-1] if (o_l or "").strip() else ""
    already_up = token.startswith("up:")
    if already_up and not force_restart:
        _log(f"远端聊天壳已在监听 :{host_port}，跳过重启")
        return {
            "id": "_host_web",
            "ok": True,
            "hard_fail": False,
            "host_up": True,
            "bridge_restart": False,
            "logs": logs + [f"already listening :{host_port}"],
        }

    remote_restart = (
        f"cd {shlex.quote(app)} && "
        f"DSH_WEB_PORT={host_port} nohup scripts/restart-dsh.sh "
        ">/tmp/zr-workbuddy-dsh-restart.log 2>&1 & "
        "echo dsh_restart_started"
    )
    _log(f"远端后台启动/重启聊天壳（:{host_port}）…")
    c5, o5, e5 = _run(ssh + [f"bash -lc {shlex.quote(remote_restart)}"], timeout=60)
    if c5 != 0 or "dsh_restart_started" not in (o5 or ""):
        return {
            "id": "_host_web",
            "ok": False,
            "hard_fail": True,
            "host_up": False,
            "bridge_restart": False,
            "error": (
                "启动远端聊天壳失败："
                f"{(e5 or o5)[:300]}；可 SSH 查看 /tmp/zr-workbuddy-dsh-restart.log"
            ),
            "logs": logs,
        }
    logs.append("host restart started (background)")
    return {
        "id": "_host_web",
        "ok": True,
        "hard_fail": False,
        "host_up": True,
        "bridge_restart": bool(also_reinstall_bridge or force_restart),
        "logs": logs,
    }


def _write_remote_deploy_receipt(
    ssh: list[str],
    app: str,
    *,
    units: list[DeployUnit],
    results: list[dict[str, Any]],
    cfg: CodeDeployConfig,
    meta: dict[str, Any],
    engine_restart: bool,
    bridge_restart: bool,
    remote_engine_port: Any,
    health: dict[str, Any] | None,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """在远端落下本次实际同步回执（服务器可 cat 核对）。"""
    import json
    from datetime import datetime, timezone

    def _log(msg: str) -> None:
        if log:
            log(msg)

    synced_rels: list[str] = []
    unit_rows: list[dict[str, Any]] = []
    for u in units:
        rels = list(u.local_rels)
        synced_rels.extend(rels)
        unit_rows.append(
            {
                "id": u.id,
                "kind": u.kind,
                "action": u.action,
                "local_rels": rels,
            }
        )
    # 去重保序
    seen: set[str] = set()
    rels_unique: list[str] = []
    for r in synced_rels:
        if r not in seen:
            seen.add(r)
            rels_unique.append(r)

    mode = str(meta.get("mode") or "").strip() or "unknown"
    receipt = {
        "ok": True,
        "written_at": datetime.now(timezone.utc).isoformat(),
        "job_id": meta.get("job_id") or "",
        "env": meta.get("env") or cfg.default_env,
        "mode": mode,
        "mode_label": "全量" if mode == "full" else ("增量" if mode == "incremental" else mode),
        "head_sha": meta.get("head_sha") or "",
        "ssh_host": cfg.ssh_host,
        "ssh_app_path": app,
        "unit_ids": [u.id for u in units],
        "units": unit_rows,
        "synced_rels": rels_unique,
        "engine_restart": engine_restart,
        "bridge_restart": bridge_restart,
        "remote_engine_port": remote_engine_port,
        "unified_product": bool(getattr(cfg, "unified_product", True)),
        "entry_url": (
            cfg.resolve_entry_url()
            if hasattr(cfg, "resolve_entry_url")
            else (cfg.health_url or "").strip()
        ),
        "health_url": (
            cfg.resolve_entry_url()
            if hasattr(cfg, "resolve_entry_url")
            else (cfg.health_url or "").strip()
        ),
        "health": health,
        "rsync_results": [
            {"id": r.get("id"), "ok": r.get("ok"), "logs": (r.get("logs") or [])[:8]}
            for r in results
            if isinstance(r, dict) and not str(r.get("id") or "").startswith("_")
        ],
        "note": "本文件由 code-deploy 在远端写入；unit_ids/synced_rels 即本次实际 rsync 范围。",
    }
    unit_ids = {u.id for u in units}
    if "workspace" in unit_ids and "engine" not in unit_ids and "bridge" not in unit_ids:
        rel_path = ".workbuddy-deploy/last_deploy_receipt.json"
        remote_dir = f"{app.rstrip('/')}/.workbuddy-deploy"
    else:
        rel_path = "apps/zr-workbuddy/engine/data/code_deploy/last_deploy_receipt.json"
        remote_dir = f"{app.rstrip('/')}/apps/zr-workbuddy/engine/data/code_deploy"
    remote_path = f"{app.rstrip('/')}/{rel_path}"
    body = json.dumps(receipt, ensure_ascii=False, indent=2)
    _log(f"写入远端部署回执 → {remote_path}")

    # 本机写临时文件再 scp，避免 ssh python -c 引号被踩碎
    import tempfile

    key = Path(cfg.ssh_key_path).expanduser().resolve()
    user, host, port = cfg.ssh_user, cfg.ssh_host, int(cfg.ssh_port)
    tmp = ""
    c2, o2, e2 = 1, "", "scp 未执行"
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", suffix=".json", delete=False
        ) as tf:
            tf.write(body)
            tmp = tf.name
        mkdir_c, _, mkdir_e = _run(
            ssh + [f"mkdir -p -- {shlex.quote(remote_dir)}"], timeout=30
        )
        if mkdir_c != 0:
            return {"ok": False, "error": f"建目录失败：{(mkdir_e or '')[:200]}", "path": remote_path}
        scp_bin = _find_bin("scp.exe", "scp") or "scp"
        scp = [
            scp_bin,
            "-i",
            str(key),
            "-P",
            str(port),
            "-o",
            "BatchMode=yes",
            "-o",
            "StrictHostKeyChecking=accept-new",
            "-o",
            "ConnectTimeout=15",
            tmp,
            f"{user}@{host}:{remote_path}",
        ]
        c2, o2, e2 = _run(scp, timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        return {"ok": False, "error": str(e), "path": remote_path}
    finally:
        if tmp:
            try:
                Path(tmp).unlink(missing_ok=True)
            except OSError:
                pass
    if c2 != 0:
        return {
            "ok": False,
            "error": ((e2 or o2 or "scp 回执失败")[:300]),
            "path": remote_path,
        }
    return {"ok": True, "path": remote_path, "error": ""}



def _resolve_remote_port(cfg: CodeDeployConfig) -> int:
    """远端引擎监听端口：只认 remote_engine_port，绝不从 health_url 偷端口。

    health_url / entry_url 常为公网 nginx（如 :8093），与引擎回环不是同一端口；
    若用 URL 覆盖，会误判「nginx 占用引擎端口」并拒绝部署。
    """
    default = 8095
    port = int(getattr(cfg, "remote_engine_port", None) or default)
    # 保留口 / 公网反代口 / 旧项目引擎口：禁止当作本应用引擎监听
    if port in {80, 443, 22, 3306, 8000, 8009, 8091, 8092, 8093, 888, 8888}:
        return default
    if port < 1 or port > 65535:
        return default
    return port


def _ensure_remote_engine_runtime(
    ssh: list[str],
    app: str,
    cfg: CodeDeployConfig,
    *,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """在远端准备独立 runtime.yaml + venv；不触碰其它项目目录与端口。"""

    def _log(msg: str) -> None:
        if log:
            log(msg)

    port = _resolve_remote_port(cfg)
    logs: list[str] = []
    eng = f"{app.rstrip('/')}/apps/zr-workbuddy/engine"
    venv_py = f"{eng}/.venv/bin/python"
    req = f"{eng}/requirements.txt"
    runtime = f"{eng}/config/runtime.yaml"

    # 保留已有 trusted_origins（公网登录 Origin）；并按 entry_url 补一条，避免部署冲掉后无法登录
    # 只扫 trusted_origins: 段，禁止把 yaml 里其它 http(s) 列表项误收进 CORS 白名单
    preserve_origins: list[str] = []
    read_old = f"test -f {shlex.quote(runtime)} && cat {shlex.quote(runtime)} || true"
    _c_old, o_old, _e_old = _run(ssh + [read_old], timeout=20)
    old_txt = o_old or ""
    in_trusted = False
    for line in old_txt.splitlines():
        if re.match(r"^trusted_origins:\s*$", line):
            in_trusted = True
            continue
        if in_trusted:
            if re.match(r"^\S", line):
                in_trusted = False
                continue
            m = re.match(r"^\s+-\s+(\S+)\s*$", line)
            if not m:
                continue
            item = m.group(1).strip().strip("'\"")
            if item.startswith(("http://", "https://")) and item not in preserve_origins:
                preserve_origins.append(item)
    entry = ""
    if hasattr(cfg, "resolve_entry_url"):
        entry = (cfg.resolve_entry_url() or "").strip()
    else:
        entry = (getattr(cfg, "entry_url", None) or getattr(cfg, "health_url", None) or "").strip()
    if entry.startswith(("http://", "https://")):
        try:
            u = urlparse(entry)
            if u.scheme and u.netloc:
                origin = f"{u.scheme}://{u.netloc}".rstrip("/")
                if origin not in preserve_origins:
                    preserve_origins.append(origin)
        except Exception:  # noqa: BLE001
            pass
    origins_yaml = ""
    if preserve_origins:
        origins_yaml = "trusted_origins:\n" + "".join(f"  - {o}\n" for o in preserve_origins)
    runtime_body = (
        "# 远端专用（由 code-deploy 生成，勿与本机 8000 混用）\n"
        "# trusted_origins：公网入口 Origin，部署时保留/按 entry_url 补齐\n"
        "server:\n"
        "  host: 127.0.0.1\n"
        f"  port: {port}\n"
        f"python: {eng}/.venv/bin/python\n"
        f"{origins_yaml}"
    )
    write_rt = (
        f"mkdir -p {shlex.quote(eng + '/config')} {shlex.quote(eng + '/data')} && "
        f"cat > {shlex.quote(runtime)} <<'EOF'\n{runtime_body}EOF"
    )
    _log(f"写入远端 runtime.yaml → 127.0.0.1:{port}")
    c1, o1, e1 = _run(ssh + [write_rt], timeout=40)
    if c1 != 0:
        return {"ok": False, "error": f"写 runtime 失败：{(e1 or o1)[:200]}", "logs": logs}
    logs.append(f"runtime port={port}")

    precheck = (
        f"pid=$(lsof -tiTCP:{port} -sTCP:LISTEN 2>/dev/null | head -1); "
        f"if [ -n \"$pid\" ]; then cmd=$(ps -p \"$pid\" -o args= 2>/dev/null || true); "
        f"case \"$cmd\" in *\"{eng}\"*|*\"/apps/zr-workbuddy/engine\"*) echo ours ;; "
        f"*) echo foreign:$pid:$cmd ;; esac; else echo free; fi"
    )
    c2, o2, _e2 = _run(ssh + [precheck], timeout=40)
    token = (o2 or "").strip().splitlines()[-1] if (o2 or "").strip() else ""
    if token.startswith("foreign:"):
        return {
            "ok": False,
            "error": (
                f"远端端口 {port} 已被其它服务占用（{token}）。"
                "请改 code_deploy.remote_engine_port / health_url，禁止抢占。"
            ),
            "logs": logs,
        }
    logs.append(f"port precheck={token or 'unknown'}")

    setup = (
        f"set -e; "
        f"if [ ! -x {shlex.quote(venv_py)} ]; then "
        f"python3 -m venv {shlex.quote(eng + '/.venv')}; fi; "
        f"{shlex.quote(venv_py)} -m pip install -q -U pip; "
        f"if [ -f {shlex.quote(req)} ]; then "
        f"{shlex.quote(venv_py)} -m pip install -q -r {shlex.quote(req)}; fi; "
        f"{shlex.quote(venv_py)} -c 'import fastapi,uvicorn'"
    )
    _log("远端准备独立 .venv 并安装依赖 …")
    c3, o3, e3 = _run(ssh + [f"bash -lc {shlex.quote(setup)}"], timeout=600)
    if c3 != 0:
        return {
            "ok": False,
            "error": f"远端 venv/依赖失败：{(e3 or o3)[:400]}",
            "logs": logs,
        }
    logs.append("venv ok")
    return {"ok": True, "port": port, "logs": logs, "error": ""}


def _is_blocked_health_host(host: str) -> bool:
    h = (host or "").strip().lower().rstrip(".")
    if not h:
        return True
    if h in {"localhost", "metadata.google.internal"}:
        return True
    if h.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(h)
    except ValueError:
        return False
    return bool(
        ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_unspecified
    )


def probe_health(
    url: str, *, timeout: int = 8, expect_status: int = 0
) -> dict[str, Any]:
    u = (url or "").strip()
    if not u.startswith(("http://", "https://")):
        return {"ok": False, "detail": "health_url 须为 http(s)"}
    try:
        parsed = urlparse(u)
    except Exception:  # noqa: BLE001
        return {"ok": False, "detail": "health_url 无法解析", "url": u}
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return {"ok": False, "detail": "health_url 非法", "url": u}
    if _is_blocked_health_host(parsed.hostname):
        return {"ok": False, "detail": "health_url 禁止指向本机/链路本地/元数据地址", "url": u}
    try:
        code, _raw = _http_get(u, timeout=timeout)
        status = int(code)
        if expect_status and int(expect_status) > 0:
            ok = status == int(expect_status)
        else:
            ok = 200 <= status < 400
        return {"ok": ok, "status": status, "url": u, "expect_status": int(expect_status or 0)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "detail": str(e)[:200], "url": u}
