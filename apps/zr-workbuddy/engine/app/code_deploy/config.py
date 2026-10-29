"""部署车道配置（读 engine config.yaml 的 code_deploy 节；对齐 simplified DEPLOY_*）。"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from ..config_store import load_config

# 私钥路径：Unix ~/.ssh/...；Windows C:/Users/.../.ssh/...（须允许盘符冒号）
_SSH_KEY_OK = re.compile(
    r"^(?:"
    r"[A-Za-z]:[/\\][A-Za-z0-9_./\\-]+|"  # Windows 绝对路径
    r"[A-Za-z0-9_./\-]+"  # Unix / 相对（~ 在校验前会被剥掉）
    r")$"
)
_HOST_OK = re.compile(r"^[A-Za-z0-9._\-]+$")
_USER_OK = re.compile(r"^[A-Za-z0-9._\-]+$")
_ABS_PATH_OK = re.compile(r"^/[A-Za-z0-9_./\-]+$")
_RESTART_CMD_OK = re.compile(
    r"^(?:systemctl restart [A-Za-z0-9][A-Za-z0-9_.:@-]{0,80}(?:\.service)?|"
    r"supervisorctl restart [A-Za-z0-9][A-Za-z0-9_-]{0,80}|"
    r"service [A-Za-z0-9][A-Za-z0-9_-]{0,80} restart)$"
)


@dataclass
class CodeDeployConfig:
    enabled: bool = False
    provider: str = "local_ssh"  # MVP 仅 local_ssh
    env_whitelist: list[str] = field(default_factory=lambda: ["staging"])
    allow_production: bool = False
    default_env: str = "staging"
    default_workspace: str = ""
    default_ref: str = "HEAD"
    ssh_host: str = ""
    ssh_user: str = ""
    ssh_port: int = 22
    ssh_key_path: str = ""
    ssh_app_path: str = ""  # 远端仓库根（与本仓布局一致）
    # 浏览器一体入口（nginx→聊天壳）；与 health_url 同义，优先 entry_url
    entry_url: str = ""
    health_url: str = ""
    health_timeout_sec: int = 8
    # 探活期望状态码；0=接受 2xx/3xx（默认）
    health_expect_status: int = 0
    # 部署策略：auto | workbuddy | vite_backend | static | custom
    deploy_preset: str = "auto"
    build_cmd: str = ""
    build_cwd: str = ""
    sync_paths: list[str] = field(default_factory=list)
    dist_rel: str = ""
    # 无 systemd 时按进程 cmdline 子串匹配（禁止默认假设 uvicorn）
    process_match: str = ""
    # 构建位置：local=本机构建再同步产物；remote=同步源码后在远端执行 build_cmd
    build_where: str = "local"
    # 远端引擎回环口：须避开旧项目占用（8091/8092）；公网入口另走 nginx，勿与本字段同端口
    remote_engine_port: int = 8095
    # 远端聊天壳端口（与本机 dsh web 默认一致）
    remote_host_port: int = 3080
    # 一体部署：一次确认 → 同步单元 → 收尾拉起引擎+聊天壳 → 入口探活
    unified_product: bool = True
    auto_restart_engine: bool = True
    # 与 get_config 一致：一体默认 true；非一体默认 false（可显式覆盖）
    auto_restart_bridge: bool = True
    remote_restart_cmd: str = ""
    rsync_excludes: list[str] = field(
        default_factory=lambda: [
            "__pycache__",
            ".venv",
            "venv",
            "*.pyc",
            ".pytest_cache",
            ".env",
            ".env.*",
            "config.yaml",
            "*.pem",
            "id_rsa*",
            "id_ed25519*",
            "*.key",
            ".DS_Store",
            "engine/data",
            "local_dev",
            "sandboxes",
            "node_modules",
            "host/node_modules",
            ".git",
        ]
    )

    def resolve_entry_url(self) -> str:
        """浏览器一体入口：entry_url 优先，否则 health_url。"""
        return (self.entry_url or self.health_url or "").strip()


def get_config() -> CodeDeployConfig:
    raw = load_config().get("code_deploy") or {}
    enabled = bool(raw.get("enabled", False))
    wl_raw = raw.get("env_whitelist") or ["staging"]
    if isinstance(wl_raw, str):
        whitelist = [x.strip().lower() for x in wl_raw.split(",") if x.strip()]
    else:
        whitelist = [str(x).strip().lower() for x in wl_raw if str(x).strip()]
    if not whitelist:
        whitelist = ["staging"]
    allow_prod = bool(raw.get("allow_production", False))
    if not allow_prod:
        whitelist = [e for e in whitelist if e not in {"prod", "production", "生产"}]
        if not whitelist:
            whitelist = ["staging"]
    excludes = raw.get("rsync_excludes")
    unified = bool(raw.get("unified_product", True))
    # 一体部署默认拉起聊天壳；显式写 false 才关闭
    if "auto_restart_bridge" in raw:
        restart_bridge = bool(raw.get("auto_restart_bridge"))
    else:
        restart_bridge = True if unified else False
    entry = str(raw.get("entry_url") or "").strip()
    health = str(raw.get("health_url") or "").strip()
    sync_raw = raw.get("sync_paths")
    sync_paths: list[str] = []
    if isinstance(sync_raw, list):
        sync_paths = [str(x).strip().replace("\\", "/") for x in sync_raw if str(x).strip()]
    try:
        expect_st = int(raw.get("health_expect_status") or 0)
    except (TypeError, ValueError):
        expect_st = 0
    cfg = CodeDeployConfig(
        enabled=enabled,
        provider=str(raw.get("provider") or "local_ssh").strip() or "local_ssh",
        env_whitelist=whitelist,
        allow_production=allow_prod,
        default_env=str(raw.get("default_env") or whitelist[0]).strip().lower() or "staging",
        default_workspace=str(raw.get("default_workspace") or "").strip(),
        default_ref=str(raw.get("default_ref") or "HEAD").strip() or "HEAD",
        ssh_host=str(raw.get("ssh_host") or "").strip(),
        ssh_user=str(raw.get("ssh_user") or "").strip(),
        ssh_port=max(1, min(int(raw.get("ssh_port") or 22), 65535)),
        ssh_key_path=str(raw.get("ssh_key_path") or "").strip(),
        ssh_app_path=str(raw.get("ssh_app_path") or "").strip(),
        entry_url=entry,
        health_url=health or entry,
        health_timeout_sec=max(2, min(int(raw.get("health_timeout_sec") or 8), 60)),
        health_expect_status=max(0, min(expect_st, 599)),
        deploy_preset=str(raw.get("deploy_preset") or "auto").strip().lower() or "auto",
        build_cmd=str(raw.get("build_cmd") or "").strip(),
        build_cwd=str(raw.get("build_cwd") or "").strip().replace("\\", "/"),
        sync_paths=sync_paths,
        dist_rel=str(raw.get("dist_rel") or "").strip().replace("\\", "/"),
        process_match=str(raw.get("process_match") or "").strip(),
        build_where=(
            "remote"
            if str(raw.get("build_where") or "local").strip().lower()
            in {"remote", "server", "远端"}
            else "local"
        ),
        remote_engine_port=max(1, min(int(raw.get("remote_engine_port") or 8095), 65535)),
        remote_host_port=max(1, min(int(raw.get("remote_host_port") or 3080), 65535)),
        unified_product=unified,
        auto_restart_engine=bool(raw.get("auto_restart_engine", True)),
        auto_restart_bridge=restart_bridge,
        remote_restart_cmd=str(raw.get("remote_restart_cmd") or "").strip(),
    )
    if isinstance(excludes, list) and excludes:
        cfg.rsync_excludes = [str(x).strip() for x in excludes if str(x).strip()]
    return cfg


def _apply_override_dict(cfg: CodeDeployConfig, ov: dict[str, Any]) -> CodeDeployConfig:
    """把 workspace_overrides / 项目 deploy.yaml 里允许的字段叠到 cfg（其它字段忽略）。"""
    kwargs: dict[str, Any] = {}
    for key in (
        "ssh_host",
        "ssh_user",
        "ssh_port",
        "ssh_key_path",
        "ssh_app_path",
        "remote_restart_cmd",
        "entry_url",
        "health_url",
        "remote_engine_port",
        "remote_host_port",
        "unified_product",
        "auto_restart_engine",
        "auto_restart_bridge",
        "deploy_preset",
        "build_cmd",
        "build_cwd",
        "dist_rel",
        "process_match",
        "health_expect_status",
        "health_timeout_sec",
        "build_where",
        "default_ref",
    ):
        if key not in ov or ov[key] is None:
            continue
        if key not in ("unified_product", "auto_restart_engine", "auto_restart_bridge") and str(
            ov[key]
        ).strip() == "":
            continue
        val = ov[key]
        if key in ("remote_engine_port", "remote_host_port", "ssh_port", "health_expect_status", "health_timeout_sec"):
            cap = 65535
            if key == "health_expect_status":
                cap = 599
            elif key == "health_timeout_sec":
                cap = 600
            kwargs[key] = max(0, min(int(val), cap))
        elif key in ("unified_product", "auto_restart_engine", "auto_restart_bridge"):
            kwargs[key] = bool(val)
        else:
            kwargs[key] = str(val).strip()
    if "sync_paths" in ov and isinstance(ov["sync_paths"], list):
        kwargs["sync_paths"] = [
            str(x).strip().replace("\\", "/") for x in ov["sync_paths"] if str(x).strip()
        ]
    if "rsync_excludes" in ov and isinstance(ov["rsync_excludes"], list):
        kwargs["rsync_excludes"] = [
            str(x).strip() for x in ov["rsync_excludes"] if str(x).strip()
        ]
    if "entry_url" in kwargs and "health_url" not in kwargs:
        kwargs["health_url"] = kwargs["entry_url"]
    return replace(cfg, **kwargs) if kwargs else cfg


def resolve_config_for_workspace(workspace: str, *, cfg: CodeDeployConfig | None = None) -> CodeDeployConfig:
    """按本机工程目录叠远端路径/重启命令。

    优先级：
    1. 项目 `.workbuddy/deploy.yaml`（+ optional deploy.local.yaml）
    2. config.yaml · workspace_overrides
    3. 内置 aicoding 启发式（无项目文件时）
    4. 原 cfg
    """
    base = cfg or get_config()
    ws = str(workspace or "").strip()
    if not ws:
        return base

    # 1) 项目内规则（有文件则优先；密钥非法则抛给调用方）
    try:
        from .project_file import load_project_deploy_overlay

        proj = load_project_deploy_overlay(ws)
    except Exception:
        raise
    if proj:
        # 有项目规则时：不再吃 WorkBuddy 配置中心里的 host/路径/私钥，
        # 避免「设置页兜底」让目标项目 yaml 失去意义。
        clean = {k: v for k, v in proj.items() if not str(k).startswith("_")}
        project_base = replace(
            base,
            enabled=True,
            ssh_host="",
            ssh_user="",
            ssh_port=22,
            ssh_key_path="",
            ssh_app_path="",
            entry_url="",
            health_url="",
            remote_restart_cmd="",
            default_workspace="",
        )
        return _apply_override_dict(project_base, clean)

    ws_norm = ws.replace("\\", "/").rstrip("/")
    ws_low = ws_norm.lower()
    name = Path(ws_norm).name.lower()

    raw = load_config().get("code_deploy") or {}
    overrides = raw.get("workspace_overrides")
    if isinstance(overrides, list):
        for item in overrides:
            if not isinstance(item, dict):
                continue
            match = str(item.get("match") or item.get("path_contains") or "").strip()
            if not match:
                continue
            mlow = match.lower()
            if mlow in ws_low or mlow == name:
                return _apply_override_dict(base, item)

    # 内置：本机 zr-aicoding / pythonProject_zr_aicoding → 预发 8090 + systemd
    # （仅当尚无项目文件时兜底；有 .workbuddy/deploy.yaml 时不会走到这里）
    if "zr_aicoding" in ws_low or "zr-aicoding" in ws_low or name in {
        "pythonproject_zr_aicoding",
        "zr-aicoding",
        "zr_aicoding",
    }:
        app = (base.ssh_app_path or "").lower()
        # 仅当界面仍指向 WorkBuddy / 未指到 aicoding 时自动纠正
        if "zr-aicoding" not in app and "zr_aicoding" not in app:
            return _apply_override_dict(
                base,
                {
                    "ssh_app_path": "/www/wwwroot/zr-aicoding",
                    "remote_restart_cmd": "systemctl restart zr-aicoding-api",
                    "entry_url": "http://175.178.238.31:8090/",
                    "health_url": "http://175.178.238.31:8090/",
                    # ERP 布局不是一体 WorkBuddy，避免乱重启 8095/3081
                    "unified_product": False,
                    "auto_restart_engine": False,
                    "auto_restart_bridge": False,
                },
            )
    return base


def validate_ssh_key_path(key_path: str) -> list[str]:
    """仅校验本机私钥路径（全局车道门禁；host/app_path 由项目 yaml 合并后再验）。"""
    errs: list[str] = []
    key = (key_path or "").strip()
    if not key or ".." in key.replace("\\", "/") or not _SSH_KEY_OK.match(key.replace("~", "")):
        errs.append("ssh_key_path 非法")
        return errs
    expanded = Path(key).expanduser()
    if not expanded.is_file():
        errs.append(f"私钥不存在：{expanded}")
        return errs
    home = Path.home().resolve()
    try:
        expanded.resolve().relative_to(home)
    except ValueError:
        errs.append("私钥须位于用户 HOME 下（如 ~/.ssh）")
    return errs


def availability() -> dict[str, Any]:
    """说明态：部署不以 WorkBuddy 配置中心为准。

    真实就绪在 prepare：读工作区 `.workbuddy/deploy.yaml` + `deploy.local.yaml` 后再验。
    """
    cfg = get_config()
    if cfg.provider != "local_ssh":
        return {
            "ok": False,
            "enabled": False,
            "detail": f"暂不支持 provider={cfg.provider}（MVP 仅 local_ssh）",
        }
    return {
        "ok": True,
        "enabled": True,
        "detail": (
            "部署规则在目标工程：请在工作区根配置 .workbuddy/deploy.yaml（可提交）"
            "与 deploy.local.yaml（本机私钥 ssh.key_path，勿提交）。"
            "配置中心不再开关部署。"
        ),
        "provider": cfg.provider,
        "project_rules": True,
        "unified_product": cfg.unified_product,
        "entry_url": cfg.resolve_entry_url(),
        "env_whitelist": list(cfg.env_whitelist),
        "default_env": cfg.default_env,
    }


def validate_ssh_settings(cfg: CodeDeployConfig) -> list[str]:
    """合并后配置的完整 SSH 校验（含项目 yaml 叠上的 host/app_path）。"""
    errs: list[str] = []
    if not _HOST_OK.match(cfg.ssh_host or ""):
        errs.append("ssh_host 非法（请检查项目 .workbuddy/deploy.yaml）")
    if not _USER_OK.match(cfg.ssh_user or ""):
        errs.append("ssh_user 非法（请检查项目 .workbuddy/deploy.yaml）")
    if not (cfg.ssh_key_path or "").strip():
        errs.append(
            "缺少本机私钥：请在工程 .workbuddy/deploy.local.yaml 写入 ssh.key_path"
            "（勿提交；须位于用户 HOME 下）"
        )
    else:
        errs.extend(validate_ssh_key_path(cfg.ssh_key_path))
    app = (cfg.ssh_app_path or "").strip().rstrip("/")
    if not app or not _ABS_PATH_OK.match(app) or ".." in app:
        errs.append("ssh_app_path 须为绝对路径且不含 ..（请检查项目 .workbuddy/deploy.yaml）")
    elif app in {"/", "/home", "/root", "/www", "/var", "/opt", "/Users", "/tmp"}:
        errs.append("ssh_app_path 过浅，拒绝部署到系统根目录")
    cmd_err = validate_remote_restart_cmd(getattr(cfg, "remote_restart_cmd", "") or "")
    if cmd_err:
        errs.append(cmd_err)
    return errs


def validate_remote_restart_cmd(cmd: str) -> str:
    """空=自动发现 systemd。非空仅允许单条重启命令，禁止管道/换行。"""
    s = (cmd or "").strip()
    if not s:
        return ""
    if "\n" in (cmd or "") or "\r" in (cmd or "") or len(s) > 180:
        return "remote_restart_cmd 过长或含换行"
    if not _RESTART_CMD_OK.match(s):
        return (
            "remote_restart_cmd 仅允许 systemctl restart <服务>、"
            "supervisorctl restart <名> 或 service <名> restart"
        )
    return ""
