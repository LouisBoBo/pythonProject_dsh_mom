"""视觉模型配置（只读 config.yaml · vision）。"""
from __future__ import annotations

from typing import Any

from ..config_store import load_config

# 智谱 OpenAI 兼容默认根（无 base_url 时兜底）
DEFAULT_ZHIPU_BASE = "https://open.bigmodel.cn/api/paas/v4"
DEFAULT_MODEL = "glm-4v-flash"


def get_vision_config() -> dict[str, Any]:
    cfg = load_config() or {}
    raw = cfg.get("vision") if isinstance(cfg.get("vision"), dict) else {}
    key = str(raw.get("api_key") or "").strip()
    base = str(raw.get("base_url") or "").strip().rstrip("/")
    model = str(raw.get("model") or "").strip()
    if key and not base:
        base = DEFAULT_ZHIPU_BASE
    if key and not model:
        model = DEFAULT_MODEL
    return {
        "api_key": key,
        "base_url": base,
        "model": model,
        "configured": bool(key and base and model),
    }


def chat_completions_url(base_url: str) -> str:
    base = (base_url or "").strip().rstrip("/")
    if base.endswith("/v1"):
        return base + "/chat/completions"
    if base.endswith("/paas/v4"):
        return base + "/chat/completions"
    return base + "/chat/completions"
