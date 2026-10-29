"""本机 Cursor 对话写码 HTTP 客户端（只调 :18791，不改插件）。

产品定稿：唯一写码入口 = @zhongruan/dsh-cursor-chat。
模块名保留 cursor_coding_client 以免大面积改 import；路径已切 /api/cursor-chat/*。
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

DEFAULT_BASE = "http://127.0.0.1:18791"
# 旧 @zhongruan/dsh-cursor-coding 默认口；误配会导致 /api/cursor-chat/* 未知路径
LEGACY_CODING_PORT = 18788
CHAT_PORT = 18791
HITL_CONFIRM_ACTION = "cursor-chat.confirm"
API_PREFIX = "/api/cursor-chat"


def normalize_chat_base(base: str = "") -> tuple[str, str]:
    """解析写码 HTTP 基址；旧口 :18788 强制改到对话写码 :18791。

    返回 (base, note)；note 非空表示发生了纠偏（供日志）。
    """
    raw = (base or "").strip().rstrip("/")
    if not raw:
        return DEFAULT_BASE, ""
    # 显式旧口 / 仅端口写错
    try:
        u = urllib.parse.urlparse(raw if "://" in raw else f"http://{raw}")
    except Exception:
        return DEFAULT_BASE, f"无效 base={base!r}，已回落 {DEFAULT_BASE}"
    host = (u.hostname or "").lower()
    port = u.port
    if host in {"127.0.0.1", "localhost", "::1"} and port == LEGACY_CODING_PORT:
        return DEFAULT_BASE, (
            f"配置仍指向旧写码口 :{LEGACY_CODING_PORT}，已改用对话写码 {DEFAULT_BASE}"
        )
    if host in {"127.0.0.1", "localhost", "::1"} and (port is None or port == CHAT_PORT):
        # 统一成规范 URL，避免多余 path
        return DEFAULT_BASE, ""
    # 非本机地址保留（企业代理调试）；仍去掉尾斜杠
    if u.scheme and u.netloc:
        return f"{u.scheme}://{u.netloc}", ""
    return DEFAULT_BASE, f"无法解析 base={base!r}，已回落 {DEFAULT_BASE}"


def _http_json(
    method: str,
    url: str,
    body: dict[str, Any] | None = None,
    *,
    timeout: float = 60.0,
) -> dict[str, Any]:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method=method.upper(),
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            if not raw.strip():
                return {"ok": True}
            out = json.loads(raw)
            return out if isinstance(out, dict) else {"ok": True, "data": out}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw.strip() else {}
        except json.JSONDecodeError:
            parsed = {"detail": raw[:500]}
        if not isinstance(parsed, dict):
            parsed = {"detail": str(parsed)}
        parsed.setdefault("ok", False)
        parsed.setdefault("http_status", e.code)
        return parsed
    except Exception as e:
        return {"ok": False, "detail": str(e)}


def probe(base: str = DEFAULT_BASE) -> dict[str, Any]:
    """探活：/api/config + 对话写码路由存在（防误打旧 :18788）。"""
    base, note = normalize_chat_base(base)
    out = _http_json("GET", f"{base.rstrip('/')}/api/config", timeout=5.0)
    if out.get("ok") is False and "http_status" not in out and "detail" in out:
        detail = str(out.get("detail") or "插件不可达")
        if note:
            detail = f"{detail}；{note}"
        return {"ok": False, "detail": detail, "base": base}
    cfg = out.get("config") if isinstance(out.get("config"), dict) else out
    key_ok = bool(cfg.get("cursorKeyConfigured") or cfg.get("cursor_key_configured"))
    if out.get("ok") is False and out.get("http_status"):
        detail = str(out.get("detail") or f"HTTP {out.get('http_status')}")
        if note:
            detail = f"{detail}；{note}"
        return {"ok": False, "detail": detail, "base": base, **out}
    if out.get("ok") is False:
        detail = str(out.get("detail") or "配置读取失败")
        if note:
            detail = f"{detail}；{note}"
        return {"ok": False, "detail": detail, "base": base, **out}

    # 旧 coding 也有 /api/config + Key，必须再验 /api/cursor-chat/* 是否认识
    route = _http_json(
        "GET",
        f"{base.rstrip('/')}{API_PREFIX}/pending-latest?workspace=/",
        timeout=5.0,
    )
    detail_r = str(route.get("detail") or "")
    if route.get("http_status") == 404 or "未知路径" in detail_r:
        return {
            "ok": False,
            "detail": (
                f"{base} 不是对话写码服务（无 {API_PREFIX} 路由）。"
                f"请确认 :{CHAT_PORT} 已装 @zhongruan/dsh-cursor-chat，"
                f"且 config.yaml · dev_pipeline.cursor_coding_base={DEFAULT_BASE}"
            ),
            "base": base,
            "cursor_key_configured": key_ok,
            "wrong_service": True,
        }

    result = {
        "ok": True,
        "cursor_key_configured": key_ok,
        "port": cfg.get("port") or CHAT_PORT,
        "listen": cfg.get("listen"),
        "base": base,
    }
    if note:
        result["remap_note"] = note
    return result


def create_pending(
    base: str,
    *,
    workspace: str,
    requirement: str,
    session_id: str = "",
) -> dict[str, Any]:
    base, _note = normalize_chat_base(base)
    body: dict[str, Any] = {
        "workspace": workspace,
        "requirement": requirement,
    }
    if session_id:
        body["session_id"] = session_id
    out = _http_json("POST", f"{base.rstrip('/')}{API_PREFIX}/pending", body, timeout=30.0)
    if not out.get("ok"):
        detail = str(out.get("detail") or "pending 失败")
        if "未知路径" in detail:
            detail = (
                f"{detail}（目标 {base} 无 {API_PREFIX} 路由；"
                f"请用对话写码 {DEFAULT_BASE}，勿用旧口 :{LEGACY_CODING_PORT}）"
            )
        raise RuntimeError(detail)
    return out


def issue_confirm_nonce(base: str, *, confirm_token: str) -> dict[str, Any]:
    base, _note = normalize_chat_base(base)
    out = _http_json(
        "POST",
        f"{base.rstrip('/')}/api/hitl/issue",
        {"action": HITL_CONFIRM_ACTION, "confirm_token": confirm_token},
        timeout=30.0,
    )
    if not out.get("ok"):
        raise RuntimeError(out.get("detail") or "hitl issue 失败")
    return out


def confirm_start(base: str, *, confirm_token: str, nonce: str) -> dict[str, Any]:
    base, _note = normalize_chat_base(base)
    out = _http_json(
        "POST",
        f"{base.rstrip('/')}{API_PREFIX}/confirm",
        {"confirm_token": confirm_token, "nonce": nonce},
        timeout=60.0,
    )
    if not out.get("ok"):
        raise RuntimeError(out.get("detail") or "confirm 失败")
    return out


def get_job(base: str, job_id: str) -> dict[str, Any]:
    """读取 Job 终态字段。

    对话写码 / 旧写码 HTTP 均为 ``{ok, job:{status, changed_files, …}}``。
    必须解包嵌套 ``job``，否则轮询端 ``job.get("status")`` 恒为空，
    成功 Job 会被当成「还在跑」一直等到用户取消（见 cch-20260930-084615-4b18）。
    """
    base, _note = normalize_chat_base(base)
    out = _http_json(
        "GET",
        f"{base.rstrip('/')}{API_PREFIX}/jobs/{urllib.parse.quote(job_id, safe='')}",
        timeout=30.0,
    )
    if out.get("ok") is False:
        raise RuntimeError(out.get("detail") or "读 Job 失败")
    nested = out.get("job")
    if isinstance(nested, dict):
        job = dict(nested)
        if not str(job.get("id") or "").strip() and job_id:
            job["id"] = job_id
        return job
    return out
