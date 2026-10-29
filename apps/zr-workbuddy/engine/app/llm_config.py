"""LLM 配置：按提供方分槽（by_provider），避免 DeepSeek / 通用 / Ollama 混填。"""
from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

from .config_store import MASK

PROVIDERS = ("deepseek", "ollama", "openai_compat")


def default_slot(provider: str) -> Dict[str, str]:
    p = normalize_provider(provider)
    if p == "ollama":
        return {"api_key": "", "base_url": "http://127.0.0.1:11434", "model": ""}
    if p == "openai_compat":
        return {"api_key": "", "base_url": "", "model": ""}
    return {"api_key": "", "base_url": "https://api.deepseek.com", "model": "deepseek-chat"}


def default_by_provider() -> Dict[str, Dict[str, str]]:
    return {name: default_slot(name) for name in PROVIDERS}


def normalize_provider(raw: str | None) -> str:
    p = (raw or "deepseek").strip().lower()
    if p == "none":
        return "deepseek"
    if p not in PROVIDERS:
        return "deepseek"
    return p


def _slot_from_raw(raw: Any, provider: str) -> Dict[str, str]:
    slot = default_slot(provider)
    if not isinstance(raw, dict):
        return slot
    if raw.get("api_key") is not None:
        slot["api_key"] = str(raw.get("api_key") or "")
    if raw.get("base_url"):
        slot["base_url"] = str(raw.get("base_url") or "").strip()
    if raw.get("model") is not None:
        slot["model"] = str(raw.get("model") or "").strip()
    return slot


def normalize_deepseek_block(raw: Dict[str, Any] | None) -> Dict[str, Any]:
    """合并默认、分槽；legacy 扁平字段只迁入当前 provider。"""
    src = raw if isinstance(raw, dict) else {}
    provider = normalize_provider(src.get("provider"))
    by_in = src.get("by_provider")
    by: Dict[str, Dict[str, str]] = default_by_provider()

    flat = {
        "api_key": str(src.get("api_key") or ""),
        "base_url": str(src.get("base_url") or "").strip(),
        "model": str(src.get("model") or "").strip(),
    }

    if isinstance(by_in, dict):
        for name in PROVIDERS:
            by[name] = _slot_from_raw(by_in.get(name), name)
        # 默认模板 merge 会带入「空分槽」；磁盘若仍是 legacy 顶层字段，只回填当前 provider。
        if flat["api_key"] or flat["base_url"] or flat["model"]:
            active = by[provider]
            if not (active.get("api_key") or "").strip() and flat["api_key"]:
                active["api_key"] = flat["api_key"]
            if not (active.get("base_url") or "").strip() and flat["base_url"]:
                active["base_url"] = flat["base_url"]
            if not (active.get("model") or "").strip() and flat["model"]:
                active["model"] = flat["model"]
            by[provider] = active
    elif flat["api_key"] or flat["base_url"] or flat["model"]:
        by[provider] = _slot_from_raw(flat, provider)

    active = by[provider]
    return {
        "provider": provider,
        "by_provider": by,
        "api_key": active["api_key"],
        "base_url": active["base_url"],
        "model": active["model"],
    }


def resolve_llm_cfg(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """运行时使用的扁平 LLM 配置（当前选中的提供方）。"""
    ds = normalize_deepseek_block(cfg.get("deepseek"))
    return {
        "provider": ds["provider"],
        "api_key": ds["api_key"],
        "base_url": ds["base_url"],
        "model": ds["model"],
    }


def prepare_deepseek_for_save(incoming: Dict[str, Any] | None) -> Dict[str, Any]:
    """保存前：把界面顶层的 Key/URL/模型写回当前 provider 分槽。"""
    ds = normalize_deepseek_block(incoming)
    provider = ds["provider"]
    by = deepcopy(ds["by_provider"])
    by[provider] = {
        "api_key": str(ds.get("api_key") or ""),
        "base_url": str(ds.get("base_url") or "").strip(),
        "model": str(ds.get("model") or "").strip(),
    }
    active = by[provider]
    return {
        "provider": provider,
        "by_provider": by,
        "api_key": active["api_key"],
        "base_url": active["base_url"],
        "model": active["model"],
    }


def mask_deepseek_block(ds: Dict[str, Any]) -> Dict[str, Any]:
    out = deepcopy(normalize_deepseek_block(ds))
    by = out.get("by_provider") or {}
    for name in PROVIDERS:
        slot = by.get(name)
        if isinstance(slot, dict) and slot.get("api_key"):
            slot["api_key"] = MASK
    if out.get("api_key"):
        out["api_key"] = MASK
    return out


def merge_deepseek_secrets(saved: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    saved_n = normalize_deepseek_block(saved)
    incoming_n = normalize_deepseek_block(incoming)
    out = deepcopy(incoming_n)
    by_out = out["by_provider"]
    by_saved = saved_n["by_provider"]
    for name in PROVIDERS:
        inv_key = (by_out.get(name) or {}).get("api_key")
        if inv_key is None:
            continue
        if inv_key == MASK:
            by_out[name]["api_key"] = (by_saved.get(name) or {}).get("api_key") or ""
        else:
            by_out[name]["api_key"] = str(inv_key or "")
    provider = out["provider"]
    active = by_out[provider]
    out["api_key"] = active["api_key"]
    out["base_url"] = active["base_url"]
    out["model"] = active["model"]
    return out
