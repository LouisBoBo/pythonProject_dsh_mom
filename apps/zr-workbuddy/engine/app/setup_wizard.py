"""首次启动向导状态（§14 P1）。

只问：模型 Key、工程目录；可选 MES Base URL、部署备注。
已配齐 Key+合法工程目录时静默标完成，不反复弹。
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from .config_store import load_config, merge_secrets, save_config

_STATE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data",
    "setup_wizard.json",
)


def _state_path() -> str:
    return _STATE_PATH


def load_wizard_state() -> dict[str, Any]:
    path = _state_path()
    try:
        with open(path, encoding="utf-8") as f:
            data = json.loads(f.read() or "{}")
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def save_wizard_state(state: dict[str, Any]) -> None:
    path = _state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    payload = dict(state or {})
    payload["updated_at"] = int(time.time())
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, path)


def _has_usable_key(cfg: dict[str, Any]) -> bool:
    ds = cfg.get("deepseek") if isinstance(cfg.get("deepseek"), dict) else {}
    key = str(ds.get("api_key") or "").strip()
    if not key or key.startswith("•") or key.lower() in ("your-key", "sk-xxx", "changeme"):
        return False
    return len(key) >= 8


def _has_usable_workspace(cfg: dict[str, Any]) -> bool:
    cd = cfg.get("code_dev") if isinstance(cfg.get("code_dev"), dict) else {}
    ws = str(cd.get("default_workspace") or "").strip()
    if not ws:
        return False
    try:
        return Path(ws).expanduser().resolve().is_dir()
    except OSError:
        return False


def setup_status(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    root = cfg if isinstance(cfg, dict) else load_config()
    st = load_wizard_state()
    has_key = _has_usable_key(root)
    has_ws = _has_usable_workspace(root)
    if st.get("completed"):
        return {
            "ok": True,
            "needs_wizard": False,
            "completed": True,
            "has_api_key": has_key,
            "has_workspace": has_ws,
            "auto_completed": bool(st.get("auto")),
        }
    if has_key and has_ws:
        save_wizard_state({"completed": True, "auto": True, "reason": "already_configured"})
        return {
            "ok": True,
            "needs_wizard": False,
            "completed": True,
            "has_api_key": True,
            "has_workspace": True,
            "auto_completed": True,
        }
    return {
        "ok": True,
        "needs_wizard": True,
        "completed": False,
        "has_api_key": has_key,
        "has_workspace": has_ws,
        "missing_key": not has_key,
        "missing_workspace": not has_ws,
        "hint": "请填写 DeepSeek Key 与要服务的工程目录；接口与部署可稍后在配置中心补。",
    }


def _normalize_mes_base_url(url: str) -> tuple[str, str]:
    """返回 (normalized_url_or_empty, error)。仅允许 http(s)，防任意 scheme 写入配置。"""
    u = (url or "").strip().rstrip("/")
    if not u:
        return "", ""
    if any(ch in u for ch in ("\n", "\r", "\x00", " ", "\\")):
        return "", "业务系统地址含非法字符"
    low = u.lower()
    if not (low.startswith("http://") or low.startswith("https://")):
        return "", "业务系统地址须以 http:// 或 https:// 开头"
    return u, ""


def complete_setup(
    *,
    api_key: str = "",
    workspace: str = "",
    mes_base_url: str = "",
    deploy_note: str = "",
    skip_optional: bool = True,
) -> dict[str, Any]:
    """写入配置并可选摸底画像。不要求一次填完可选字段。"""
    cfg = load_config()
    patch: dict[str, Any] = {}

    key = (api_key or "").strip()
    if key and not key.startswith("•"):
        patch.setdefault("deepseek", {})
        patch["deepseek"]["api_key"] = key

    ws = (workspace or "").strip()
    if ws:
        try:
            resolved = str(Path(ws).expanduser().resolve())
        except OSError:
            return {"ok": False, "detail": "工程目录路径无效"}
        if not Path(resolved).is_dir():
            return {"ok": False, "detail": "工程目录不存在或不是文件夹"}
        patch.setdefault("code_dev", {})
        patch["code_dev"]["default_workspace"] = resolved
        # 四车道共用默认目录：提交/审码/部署也认 code_dev.default_workspace
        ws = resolved

    mes_url, mes_err = _normalize_mes_base_url(mes_base_url)
    if mes_err:
        return {"ok": False, "detail": mes_err}
    if mes_url:
        patch.setdefault("mes", {})
        patch["mes"]["base_url"] = mes_url

    if patch:
        merged = merge_secrets(cfg, patch)
        save_config(merged)
        cfg = merged

    # 仍缺必填则拒绝标完成
    if not _has_usable_key(cfg):
        return {"ok": False, "detail": "请填写可用的 DeepSeek API Key"}
    if not _has_usable_workspace(cfg):
        return {"ok": False, "detail": "请填写存在的工程目录"}

    profile_out: dict[str, Any] = {"ok": False, "skipped": True}
    ws_final = str((cfg.get("code_dev") or {}).get("default_workspace") or "").strip()
    if ws_final:
        try:
            from .project_profile import ensure as ensure_profile

            profile_out = ensure_profile(ws_final, force=False)
        except Exception as e:  # noqa: BLE001
            profile_out = {"ok": False, "detail": f"{type(e).__name__}: {e}"}

    note = (deploy_note or "").strip()[:500]
    save_wizard_state(
        {
            "completed": True,
            "auto": False,
            "skip_optional": bool(skip_optional),
            "deploy_note": note,
            "workspace": ws_final,
        }
    )
    # save_config 已同步 DeepSeek Key → DSH 聊天凭据

    return {
        "ok": True,
        "needs_wizard": False,
        "completed": True,
        "workspace": ws_final,
        "profile": {
            "ok": bool(profile_out.get("ok")),
            "detail": str(profile_out.get("detail") or ""),
            "cached": bool(profile_out.get("cached")),
        },
        "detail": "向导已完成：Key 与工程目录已写入；画像摸底"
        + ("成功" if profile_out.get("ok") else "已跳过/失败（可稍后在配置中心重扫）"),
    }
