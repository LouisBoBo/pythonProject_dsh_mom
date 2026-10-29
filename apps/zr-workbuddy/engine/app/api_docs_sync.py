"""记住 OpenAPI 来源地址，启动后与定时再拉。

只替换 api_docs.endpoints。失败保留上一份。
不问数时拉取，也不改 sensitive_data / 人员数据权限。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import sys
import threading
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .config_store import MASK, update_config
from .importers import parse_api_doc
from .openapi_fetch import fetch_openapi

log = logging.getLogger("uvicorn.error")

DEFAULT_INTERVAL_SEC = 24 * 3600
MIN_INTERVAL_SEC = 300
MAX_INTERVAL_SEC = 24 * 3600
_FIRST_DELAY_SEC = 20

_status_path_override: str | None = None
_refresh_lock = threading.Lock()
_started = False
_stop = threading.Event()


def set_status_path(path: str | None) -> None:
    global _status_path_override
    _status_path_override = path


def status_path() -> Path:
    if _status_path_override:
        return Path(_status_path_override)
    root = Path(__file__).resolve().parents[1]
    return root / "data" / "api_docs_sync.json"


def clamp_interval(raw: Any) -> int:
    try:
        n = int(raw)
    except (TypeError, ValueError):
        n = DEFAULT_INTERVAL_SEC
    if n < MIN_INTERVAL_SEC:
        return MIN_INTERVAL_SEC
    if n > MAX_INTERVAL_SEC:
        return MAX_INTERVAL_SEC
    return n


def _now_text() -> str:
    return datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d %H:%M")


def read_status() -> dict:
    path = status_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def write_status(data: dict) -> None:
    path = status_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def note_ok(count: int) -> None:
    st = read_status()
    st["last_ok_at"] = _now_text()
    st["last_error"] = ""
    st["last_count"] = int(count)
    write_status(st)


def note_error(message: str) -> None:
    st = read_status()
    st["last_error_at"] = _now_text()
    st["last_error"] = _clip(message)
    write_status(st)


def _clip(message: str) -> str:
    text = re.sub(r"://[^/\s:]+:[^/\s@]+@", "://", str(message or ""))
    text = " ".join(text.split())
    if len(text) > 180:
        return text[:180] + "…"
    return text


def _parse_status_ts(text: str) -> datetime | None:
    raw = str(text or "").strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, "%Y-%m-%d %H:%M").replace(
            tzinfo=ZoneInfo("Asia/Shanghai")
        )
    except ValueError:
        return None


def is_sync_due(cfg: dict | None) -> bool:
    """打开页是否该再同步：距「上次尝试」（成功或失败）已满间隔才到期。

    只看 last_ok 会在失败后每次切页都重试，把界面拖慢；成功/失败都计入冷却。
    无地址 → 不同步；从未尝试过 → 到期。
    """
    root = cfg if isinstance(cfg, dict) else {}
    docs = root.get("api_docs") if isinstance(root.get("api_docs"), dict) else {}
    url = str(docs.get("source_url") or "").strip()
    if not url:
        return False
    st = read_status()
    last_ok = _parse_status_ts(str(st.get("last_ok_at") or ""))
    last_err = _parse_status_ts(str(st.get("last_error_at") or ""))
    candidates = [t for t in (last_ok, last_err) if t is not None]
    if not candidates:
        return True
    last = max(candidates)
    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    wait = clamp_interval(docs.get("sync_interval_sec"))
    return (now - last).total_seconds() >= float(wait)


def public_sync_view(cfg: dict) -> dict:
    docs = cfg.get("api_docs") if isinstance(cfg.get("api_docs"), dict) else {}
    st = read_status()
    url = str(docs.get("source_url") or "").strip()
    try:
        count = int(st.get("last_count") or 0)
    except (TypeError, ValueError):
        count = 0
    return {
        "source_url": url,
        "source_username": str(docs.get("source_username") or ""),
        "enabled": bool(url),
        "interval_sec": clamp_interval(docs.get("sync_interval_sec")),
        "due": is_sync_due(cfg),
        "last_ok_at": str(st.get("last_ok_at") or ""),
        "last_error_at": str(st.get("last_error_at") or ""),
        "last_error": str(st.get("last_error") or ""),
        "last_count": count,
    }


def remember_source(docs: dict, *, url: str, username: str, password: str | None) -> None:
    """记住文档地址和 Basic 账号。密码为打码值时保留原密码。不改接口清单。"""
    raw = str(url or "").strip()
    if not raw.startswith(("http://", "https://")):
        raise ValueError("文档地址需以 http:// 或 https:// 开头")
    docs["source_url"] = raw
    docs["source_username"] = str(username or "").strip()
    if password is None or password == MASK:
        return
    docs["source_password"] = str(password)


def resolve_source_password(stored: str, incoming: str) -> str:
    """界面回传打码值时用已保存的密码，避免把圆点当成新密码。"""
    if incoming == MASK:
        return str(stored or "")
    return str(incoming or "")


def stored_basic_auth(docs: dict | None) -> tuple[str, str]:
    block = docs if isinstance(docs, dict) else {}
    user = str(block.get("source_username") or "").strip()
    password = str(block.get("source_password") or "")
    if user and password:
        return user, password
    return "", ""


def apply_commit(docs: dict, endpoints: list, *, source_url: str | None, clear_source: bool) -> None:
    """写入清单。上传、粘贴或清空时忘掉 URL 账号，停止自动拉取。"""
    docs["endpoints"] = endpoints
    docs.pop("query_bindings", None)
    if clear_source or not endpoints:
        docs["source_url"] = ""
        docs["source_username"] = ""
        docs["source_password"] = ""
        return
    if source_url is None:
        return
    url = str(source_url).strip()
    if not url:
        return
    if not url.startswith(("http://", "https://")):
        raise ValueError("文档地址需以 http:// 或 https:// 开头")
    docs["source_url"] = url


def _endpoint_key(ep: dict) -> tuple:
    return (
        str(ep.get("method") or "").upper(),
        str(ep.get("path") or ""),
        str(ep.get("name") or ""),
        str(ep.get("desc") or ""),
    )


def accept_parsed(endpoints: Any) -> str | None:
    if not isinstance(endpoints, list) or not endpoints:
        return "解析结果为空，已保留上一份接口清单"
    for ep in endpoints:
        if not isinstance(ep, dict) or not str(ep.get("path") or "").strip():
            return "解析结果缺少路径，已保留上一份接口清单"
    return None


def apply_refresh(
    cfg: dict,
    endpoints: list,
    *,
    fetched_url: str,
    started_url: str = "",
) -> tuple[str, str]:
    """成功才替换 endpoints。不改 sensitive_data。

    started_url 是这次拉取开始时的地址。拉取期间若改成了别的地址，丢弃结果。
    """
    docs = cfg.get("api_docs")
    if not isinstance(docs, dict):
        return "source_gone", ""
    saved = str(docs.get("source_url") or "").strip()
    if not saved:
        return "source_gone", ""
    started = str(started_url or "").strip()
    fetched = str(fetched_url or "").strip()
    if started and saved not in (started, fetched):
        return "source_gone", ""
    bad = accept_parsed(endpoints)
    if bad:
        return "rejected", bad
    old = list(docs.get("endpoints") or [])
    changed = [_endpoint_key(ep) for ep in old if isinstance(ep, dict)] != [
        _endpoint_key(ep) for ep in endpoints
    ]
    if changed:
        docs["endpoints"] = list(endpoints)
        docs.pop("query_bindings", None)
        return "replaced", ""
    return "unchanged", ""


def _host(url: str) -> str:
    try:
        from urllib.parse import urlparse

        return (urlparse(url).hostname or "").strip().lower()
    except Exception:
        return ""


def mes_auth_for(url: str, mes: dict | None) -> tuple[str, str]:
    """仅当文档主机与 MES Base URL 相同、且认证方式是账号密码时，才带上 MES 账号。"""
    block = mes if isinstance(mes, dict) else {}
    if str(block.get("auth_type") or "password").strip() not in ("password", ""):
        return "", ""
    user = str(block.get("username") or "").strip()
    password = str(block.get("password") or "")
    base = str(block.get("base_url") or "").strip()
    if not user or not password or not base:
        return "", ""
    if _host(url) and _host(url) == _host(base):
        return user, password
    return "", ""


def _retry_with_mes(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TimeoutException):
        return False
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (401, 403)
    if isinstance(exc, ValueError) and "无法从" in str(exc):
        return True
    return False


def _persist_refresh(endpoints: list, fetched_url: str, started_url: str) -> tuple[str, str, int]:
    box: dict[str, Any] = {"action": "", "detail": "", "count": 0}

    def mut(cfg: dict) -> bool:
        action, detail = apply_refresh(
            cfg,
            endpoints,
            fetched_url=fetched_url,
            started_url=started_url,
        )
        box["action"] = action
        box["detail"] = detail
        docs = cfg.get("api_docs") if isinstance(cfg.get("api_docs"), dict) else {}
        box["count"] = len(docs.get("endpoints") or [])
        return action in ("replaced", "retargeted")

    update_config(mut, side_effects=False)
    return str(box["action"]), str(box["detail"]), int(box["count"])


async def _pull(url: str, mes: dict) -> tuple[str, str]:
    try:
        return await fetch_openapi(url, "", "")
    except Exception as exc:  # noqa: BLE001
        user, password = mes_auth_for(url, mes)
        if not user or not _retry_with_mes(exc):
            raise
        return await fetch_openapi(url, user, password)


def save_remembered_source(url: str, username: str, password: str) -> None:
    """解析成功后记住地址和账号，不改接口清单。"""

    def mut(cfg: dict) -> bool:
        docs = cfg.get("api_docs")
        if not isinstance(docs, dict):
            docs = {}
            cfg["api_docs"] = docs
        remember_source(
            docs,
            url=url,
            username=username,
            password="" if not str(username or "").strip() else password,
        )
        return True

    update_config(mut, side_effects=False)


def _persist_manual(endpoints: list, url: str, username: str, password: str) -> tuple[str, str, int]:
    box: dict[str, Any] = {"action": "", "detail": "", "count": 0}

    def mut(cfg: dict) -> bool:
        docs = cfg.get("api_docs")
        if not isinstance(docs, dict):
            docs = {}
            cfg["api_docs"] = docs
        bad = accept_parsed(endpoints)
        if bad:
            box["action"] = "rejected"
            box["detail"] = bad
            box["count"] = len(docs.get("endpoints") or [])
            return False
        remember_source(
            docs,
            url=url,
            username=username,
            password="" if not str(username or "").strip() else password,
        )
        old = [ep for ep in (docs.get("endpoints") or []) if isinstance(ep, dict)]
        changed = [_endpoint_key(ep) for ep in old] != [_endpoint_key(ep) for ep in endpoints]
        if changed:
            docs["endpoints"] = list(endpoints)
            docs.pop("query_bindings", None)
        box["action"] = "replaced" if changed else "unchanged"
        box["count"] = len(docs.get("endpoints") or [])
        return True

    update_config(mut, side_effects=False)
    return str(box["action"]), str(box["detail"]), int(box["count"])


def form_overrides_saved(*, url: str, username: str, password: str) -> bool:
    """表单是否带了要覆盖已记住来源的字段。全空 = 打开页/定时同步，只用已存凭证。"""
    if str(url or "").strip():
        return True
    if str(username or "").strip():
        return True
    pwd = str(password or "")
    return bool(pwd) and pwd != MASK


def ensure_docs_creds_from_mes(cfg: dict) -> bool:
    """文档账号被误清空时，若与 MES 同主机则用 MES 账号补回（只补空，不覆盖已有）。"""
    docs = cfg.get("api_docs") if isinstance(cfg.get("api_docs"), dict) else None
    mes = cfg.get("mes") if isinstance(cfg.get("mes"), dict) else None
    if not docs:
        return False
    url = str(docs.get("source_url") or "").strip()
    if not url or str(docs.get("source_username") or "").strip():
        return False
    user, password = mes_auth_for(url, mes)
    if not user or not password:
        return False
    docs["source_username"] = user
    docs["source_password"] = password
    return True


async def refresh_saved_async(
    *,
    url: str = "",
    username: str = "",
    password: str = "",
    from_form: bool = False,
) -> dict:
    from .config_store import load_config, update_config

    # 打开页同步曾用空账号 + from_form 把记住的用户名写空；尽量从 MES 同主机补回
    update_config(ensure_docs_creds_from_mes, side_effects=False)
    cfg = load_config()

    docs = cfg.get("api_docs") if isinstance(cfg.get("api_docs"), dict) else {}
    mes = cfg.get("mes") if isinstance(cfg.get("mes"), dict) else {}
    stored_url = str(docs.get("source_url") or "").strip()
    stored_user, stored_pass = stored_basic_auth(docs)
    # 表单未带账号时禁止走「覆盖记住」路径，避免把已存用户名/密码写成空
    use_form = bool(from_form) and form_overrides_saved(
        url=url, username=username, password=password
    )
    if use_form:
        use_url = str(url or "").strip() or stored_url
        use_user = str(username or "").strip() or stored_user
        use_pass = resolve_source_password(
            str(docs.get("source_password") or "") or stored_pass,
            str(password or ""),
        )
        if not use_user:
            use_pass = ""
    else:
        use_url = stored_url
        use_user, use_pass = stored_user, stored_pass
    if not use_url:
        return {"ok": True, "skipped": True, "detail": "还没有记住文档地址。请先在「从 URL」里解析一次。"}
    try:
        if use_user:
            content, _src = await fetch_openapi(use_url, use_user, use_pass)
        else:
            content, _src = await _pull(use_url, mes)
        parsed = parse_api_doc("url", content)
    except Exception as exc:  # noqa: BLE001
        detail = "同步失败，已保留上一份接口清单：" + _clip(str(exc) or type(exc).__name__)
        note_error(detail)
        log.warning("接口文档同步失败，已保留上一份")
        return {"ok": False, "kept": True, "detail": detail}
    endpoints = parsed.get("endpoints") if isinstance(parsed, dict) else None
    if use_form and str(username or "").strip():
        # 仅当表单明确带了用户名时才回写账号；密码可打码沿用
        action, detail, count = _persist_manual(
            list(endpoints or []), use_url, use_user, password
        )
    else:
        action, detail, count = _persist_refresh(list(endpoints or []), use_url, use_url)
    if action == "rejected":
        note_error(detail)
        log.warning("接口文档同步未替换清单：%s", detail)
        return {"ok": False, "kept": True, "detail": detail}
    if action == "source_gone":
        return {"ok": True, "skipped": True, "detail": "文档地址已清除，未替换清单"}
    note_ok(count)
    if action == "replaced":
        log.info("接口文档已更新，共 %s 个", count)
        detail = f"已同步，共 {count} 个接口"
    else:
        detail = f"文档无变化，仍是 {count} 个接口"
    # 回填展示用用户名（密码仍走 mask_config 打码）
    cfg2 = load_config()
    docs2 = cfg2.get("api_docs") if isinstance(cfg2.get("api_docs"), dict) else {}
    shown_user = str((docs2 or {}).get("source_username") or use_user or "")
    return {
        "ok": True,
        "action": action,
        "count": count,
        "detail": detail,
        "source_url": use_url,
        "source_username": shown_user,
    }


def refresh_saved_blocking(**kwargs) -> dict:
    if not _refresh_lock.acquire(blocking=False):
        return {"ok": True, "skipped": True, "detail": "同步已在进行"}
    try:
        return asyncio.run(refresh_saved_async(**kwargs))
    finally:
        _refresh_lock.release()


def _loop() -> None:
    if _stop.wait(_FIRST_DELAY_SEC):
        return
    while not _stop.is_set():
        try:
            refresh_saved_blocking()
        except Exception:  # noqa: BLE001
            log.warning("接口文档自动同步异常，已保留上一份")
        try:
            from .config_store import load_config

            docs = load_config().get("api_docs") or {}
            wait = clamp_interval(docs.get("sync_interval_sec") if isinstance(docs, dict) else None)
        except Exception:
            wait = DEFAULT_INTERVAL_SEC
        if _stop.wait(wait):
            return


def start_background_sync() -> None:
    """引擎启动后拉一次，之后按间隔。无已保存地址时什么都不做。"""
    global _started
    if os.environ.get("WORKBUDDY_API_DOCS_SYNC", "1").strip() == "0":
        return
    # 单测进程会拉起引擎；不要在测试里去拉真实文档或改本机配置。
    if "unittest" in sys.modules:
        return
    if _started:
        return
    _started = True
    threading.Thread(target=_loop, name="api-docs-sync", daemon=True).start()
    log.info("接口文档自动同步已启动（仅在已记住地址时拉取）")
