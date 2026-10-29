#!/usr/bin/env python3
"""写 sidecar yaml + 持久化 WORKBUDDY_CONFIG_YAML（正斜杠）。

ESC / dsh-automations 若设了 WORKBUDDY_CONFIG_YAML 则只读该文件。
历史上 sidecar 只含 mes:，导致飞书 App ID/Secret 明明在 config.yaml
却被误报「未配置飞书」。现同步写入 automations / vision 必要键。
DeepSeek Key 不进 sidecar（走 .credentials.yaml），减少密钥副本。
安全：YAML 双引号转义；.env 路径消毒；sidecar 尽量 0o600。
stdout 只打路径（一行），便于 shell 捕获；详情进 stderr。
"""
from __future__ import annotations

import argparse
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from native_path import native_path  # noqa: E402

BLOCK_BEGIN = "# --- workbuddy-mes-config ---"
BLOCK_END = "# --- /workbuddy-mes-config ---"
_BLOCK_RE = re.compile(
    rf"(?ms)^{re.escape(BLOCK_BEGIN)}.*?^{re.escape(BLOCK_END)}\s*",
)
# .env 单行值：禁止空白/换行/#/=，避免注入其它变量
_SAFE_PATH = re.compile(r"^[A-Za-z]:/[^\s#=\x00-\x1f]+$|^/[^\s#=\x00-\x1f]+$")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def dsh_home() -> Path:
    env = (os.environ.get("DSH_HOME") or "").strip()
    if env:
        return Path(native_path(env))
    return Path(os.environ.get("USERPROFILE") or os.path.expanduser("~")) / ".dsh"


def _yaml_dq(s: str) -> str:
    """始终双引号，防密码中的 : # \\n 破坏 YAML / 注入键。"""
    t = str(s).replace("\r", "").replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{t}"'


def _yaml_bool(v: Any, default: bool = False) -> str:
    if v is None:
        return "true" if default else "false"
    if isinstance(v, bool):
        return "true" if v else "false"
    s = str(v).strip().lower()
    if s in ("1", "true", "yes", "on"):
        return "true"
    if s in ("0", "false", "no", "off"):
        return "false"
    return "true" if default else "false"


def _safe_fwd_path(p: Path | str) -> str:
    fwd = str(p).replace("\\", "/").strip()
    if not _SAFE_PATH.match(fwd):
        raise RuntimeError(f"拒绝写入不安全的 WORKBUDDY_CONFIG_YAML 路径: {fwd!r}")
    return fwd


def load_full_config(repo: Path) -> dict[str, Any]:
    cfg_path = (
        Path(native_path(str(repo)))
        / "apps"
        / "zr-workbuddy"
        / "engine"
        / "config"
        / "config.yaml"
    )
    try:
        import yaml

        raw = yaml.safe_load(cfg_path.read_text(encoding="utf-8")) or {}
    except Exception as exc:
        raise RuntimeError(f"读配置失败 {cfg_path}: {exc}") from exc
    if not isinstance(raw, dict):
        raise RuntimeError("config.yaml 不是对象")
    return raw


def load_mes_from_config(repo: Path) -> dict:
    raw = load_full_config(repo)
    mes = raw.get("mes") if isinstance(raw, dict) else None
    if not isinstance(mes, dict):
        raise RuntimeError("config.yaml 无 mes 段")
    return mes


def write_sidecar(
    home: Path,
    mes: dict,
    *,
    automations: dict | None = None,
    vision: dict | None = None,
    deepseek: dict | None = None,
) -> Path:
    user = str(mes.get("username") or "").strip()
    base = str(mes.get("base_url") or "").strip().rstrip("/")
    pwd = str(mes.get("password") or "")
    ent = str(mes.get("enterprise_code") or "江西中软").strip() or "江西中软"
    if not base:
        raise RuntimeError("mes.base_url 为空")
    if not user:
        raise RuntimeError("mes.username 为空")
    auto = automations if isinstance(automations, dict) else {}
    vis = vision if isinstance(vision, dict) else {}
    _ = deepseek  # 兼容旧调用；密钥不写入 sidecar
    lines = [
        "# WorkBuddy sidecar for WORKBUDDY_CONFIG_YAML（LF）",
        "# 含 mes + automations + vision（DeepSeek Key 不进此文件）",
        "mes:",
        f"  base_url: {_yaml_dq(base)}",
        f"  username: {_yaml_dq(user)}",
        f"  password: {_yaml_dq(pwd)}",
        f"  enterprise_code: {_yaml_dq(ent)}",
        "automations:",
        f"  wecom_webhook_key: {_yaml_dq(str(auto.get('wecom_webhook_key') or ''))}",
        f"  wecom_push_enabled: {_yaml_bool(auto.get('wecom_push_enabled'), False)}",
        f"  wecom_push_dry_run: {_yaml_bool(auto.get('wecom_push_dry_run'), False)}",
        f"  feishu_app_id: {_yaml_dq(str(auto.get('feishu_app_id') or '').strip())}",
        f"  feishu_app_secret: {_yaml_dq(str(auto.get('feishu_app_secret') or ''))}",
        f"  feishu_bitable_enabled: {_yaml_bool(auto.get('feishu_bitable_enabled'), False)}",
        f"  feishu_bitable_dry_run: {_yaml_bool(auto.get('feishu_bitable_dry_run'), False)}",
        "vision:",
        f"  api_key: {_yaml_dq(str(vis.get('api_key') or ''))}",
        f"  base_url: {_yaml_dq(str(vis.get('base_url') or '').rstrip('/'))}",
        f"  model: {_yaml_dq(str(vis.get('model') or ''))}",
        # deepseek Key 不进 sidecar：聊天凭据另有 .credentials.yaml；
        # sidecar 只给 ESC/自动化读 mes+飞书等，避免多写一份高敏密钥。
        "",
    ]
    dest = home / "workbuddy-mes.yaml"
    home.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    try:
        os.chmod(dest, stat.S_IRUSR | stat.S_IWUSR)  # 0o600
    except OSError:
        pass
    return dest


def upsert_env(env_path: Path, cfg_fwd: str) -> str:
    cfg_fwd = _safe_fwd_path(cfg_fwd)
    env_path.parent.mkdir(parents=True, exist_ok=True)
    block = (
        f"{BLOCK_BEGIN}\n"
        f"# ESC/自动化 sidecar（mes+飞书等）；正斜杠；勿手删\n"
        f"WORKBUDDY_CONFIG_YAML={cfg_fwd}\n"
        f"{BLOCK_END}\n"
    )
    text = env_path.read_text(encoding="utf-8") if env_path.is_file() else ""
    if _BLOCK_RE.search(text):
        new_text = _BLOCK_RE.sub(block, text)
        note = "updated"
    else:
        new_text = text.rstrip() + ("\n\n" if text.strip() else "") + block
        note = "inserted"
    if new_text != text:
        env_path.write_text(
            new_text if new_text.endswith("\n") else new_text + "\n", encoding="utf-8"
        )
    return note


def config_yaml_fwd(repo: Path | None = None) -> str:
    """兼容旧调用：现改为 sidecar 路径。"""
    home = dsh_home()
    root = repo or repo_root()
    raw = load_full_config(root)
    mes = raw.get("mes")
    if not isinstance(mes, dict):
        raise RuntimeError("config.yaml 无 mes 段")
    side = write_sidecar(
        home,
        mes,
        automations=raw.get("automations") if isinstance(raw.get("automations"), dict) else {},
        vision=raw.get("vision") if isinstance(raw.get("vision"), dict) else {},
        deepseek=raw.get("deepseek") if isinstance(raw.get("deepseek"), dict) else {},
    )
    return _safe_fwd_path(side.resolve())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dsh-home", type=Path, default=None)
    ap.add_argument("--repo", type=Path, default=None)
    ap.add_argument(
        "--print-only",
        action="store_true",
        help="stdout 只打路径；仍刷新 sidecar；不写 .env（宿主仍会再跑一次非 print 写 .env）",
    )
    ap.add_argument(
        "--no-env",
        action="store_true",
        help="只写 sidecar，不改 .env",
    )
    args = ap.parse_args()
    repo = Path(native_path(str(args.repo))) if args.repo else repo_root()
    home = dsh_home()
    if args.dsh_home and str(args.dsh_home).strip():
        home = Path(native_path(str(args.dsh_home)))

    try:
        raw = load_full_config(repo)
        mes = raw.get("mes")
        if not isinstance(mes, dict):
            raise RuntimeError("config.yaml 无 mes 段")
        side = write_sidecar(
            home,
            mes,
            automations=raw.get("automations") if isinstance(raw.get("automations"), dict) else {},
            vision=raw.get("vision") if isinstance(raw.get("vision"), dict) else {},
            deepseek=raw.get("deepseek") if isinstance(raw.get("deepseek"), dict) else {},
        )
        cfg_fwd = _safe_fwd_path(side.resolve())
    except RuntimeError as exc:
        print(f"SKIP {exc}", file=sys.stderr)
        return 0

    if not args.print_only and not args.no_env:
        note = upsert_env(home / ".env", cfg_fwd)
        feishu_on = bool(
            str((raw.get("automations") or {}).get("feishu_app_id") or "").strip()
        )
        print(
            f"OK {note} sidecar={side} user={mes.get('username')!r} "
            f"base={str(mes.get('base_url') or '').rstrip('/')!r} "
            f"feishu_app_id={'set' if feishu_on else 'empty'}",
            file=sys.stderr,
        )
    os.environ["WORKBUDDY_CONFIG_YAML"] = cfg_fwd
    # stdout 永远只有路径一行，供 shell 捕获
    print(cfg_fwd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
