"""调用 OpenAI 兼容视觉 chat/completions（智谱 glm-4v 等）。"""
from __future__ import annotations

from typing import Any

import httpx

from .config import chat_completions_url, get_vision_config


def _record_usage(raw: dict[str, Any], *, model: str, ok: bool) -> None:
    try:
        from ..usage import append_event, from_openai_usage

        append_event(
            source="llm",
            lane="vision",
            provider="vision",
            model=model or "",
            tokens=from_openai_usage(raw.get("usage") if isinstance(raw, dict) else None),
            ok=ok,
            job_id="",
        )
    except Exception:
        pass


def chat_vision(
    *,
    prompt: str,
    image_data_urls: list[str],
    timeout_sec: float = 90.0,
    max_tokens: int = 1024,
) -> dict[str, Any]:
    cfg = get_vision_config()
    if not cfg.get("configured"):
        return {
            "ok": False,
            "detail": "未配置视觉模型：请在配置中心填写 vision.api_key / base_url / model（智谱）",
        }
    urls = [u for u in (image_data_urls or []) if str(u).startswith("data:image/")]
    if not urls:
        return {"ok": False, "detail": "没有可用的图片"}
    text = (prompt or "").strip() or "请用中文描述图片内容。"
    content: list[dict[str, Any]] = [{"type": "text", "text": text}]
    for u in urls:
        content.append({"type": "image_url", "image_url": {"url": u}})
    model = str(cfg["model"])
    url = chat_completions_url(str(cfg["base_url"]))
    headers = {
        "Authorization": "Bearer " + str(cfg["api_key"]),
        "Content-Type": "application/json",
    }
    # 智谱 glm-4v：max_tokens 上限 1024（超限会 HTTP 400 code=1210）
    tok = max(1, min(1024, int(max_tokens or 1024)))
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": content}],
        "max_tokens": tok,
        "temperature": 0.2,
    }
    try:
        with httpx.Client(timeout=timeout_sec) as client:
            r = client.post(url, headers=headers, json=payload)
            if r.status_code >= 400:
                _record_usage({}, model=model, ok=False)
                return {
                    "ok": False,
                    "detail": f"视觉接口 HTTP {r.status_code}：{(r.text or '')[:400]}",
                    "model": model,
                }
            body = r.json()
    except Exception as e:
        _record_usage({}, model=model, ok=False)
        return {"ok": False, "detail": f"视觉请求失败：{type(e).__name__}: {e}", "model": model}

    _record_usage(body if isinstance(body, dict) else {}, model=model, ok=True)
    try:
        msg = ((body.get("choices") or [{}])[0] or {}).get("message") or {}
        text_out = str(msg.get("content") or "").strip()
    except Exception:
        text_out = ""
    if not text_out:
        return {"ok": False, "detail": "视觉模型返回空内容", "model": model, "raw": body}
    return {
        "ok": True,
        "text": text_out,
        "model": model,
        "usage": (body.get("usage") if isinstance(body, dict) else None),
    }
