"""引擎状态快照 —— /api/status 与 CLI status 共用。"""

from __future__ import annotations

from typing import Any, Dict

from .config_store import load_config
from .health import check_net, llm_ready


def build_status(*, include_demo: bool = True) -> Dict[str, Any]:
    cfg = load_config()
    from .llm_config import resolve_llm_cfg
    from .mes_profile import ensure_mes_profiles

    llm = resolve_llm_cfg(cfg)
    ensure_mes_profiles(cfg)
    mes = cfg.get("mes") or {}
    profiles = []
    any_url = False
    mc = cfg.get("mes_connections") if isinstance(cfg.get("mes_connections"), dict) else {}
    for it in mc.get("items") or []:
        if not isinstance(it, dict):
            continue
        block = it.get("mes") if isinstance(it.get("mes"), dict) else {}
        url = str(block.get("base_url") or "").strip()
        if url:
            any_url = True
        roots = it.get("workspace_roots") if isinstance(it.get("workspace_roots"), list) else []
        docs = it.get("api_docs") if isinstance(it.get("api_docs"), dict) else {}
        eps = docs.get("endpoints") if isinstance(docs.get("endpoints"), list) else []
        profiles.append(
            {
                "id": str(it.get("id") or ""),
                "name": str(it.get("name") or ""),
                "base_url": url,
                "configured": bool(url),
                "workspace_roots": [str(r) for r in roots if str(r or "").strip()],
                "docs": len(eps),
            }
        )
    provider = (llm.get("provider") or "deepseek").lower()
    configured = llm_ready(cfg)
    hint = (
        "本地 Ollama"
        if provider == "ollama" and configured
        else "DeepSeek API"
        if provider == "deepseek" and configured
        else "通用 OpenAI 兼容"
        if provider == "openai_compat" and configured
        else "未配置"
    )
    active_url = str(mes.get("base_url") or "").strip()
    try:
        from .mes_profile import cfg_for_ask

        ask_cfg = cfg_for_ask(cfg, None)
        ask_url = str(((ask_cfg.get("mes") or {}) if isinstance(ask_cfg.get("mes"), dict) else {}).get("base_url") or "").strip()
    except Exception:
        ask_url = active_url
    out: Dict[str, Any] = {
        "ok": True,
        "network": check_net(),
        "llm": {
            "configured": configured,
            "provider": provider,
            "model": llm.get("model") or "",
            "hint": hint,
        },
        "mes": {
            "configured": bool(ask_url) or any_url,
            "base_url": ask_url,
            "editing_base_url": active_url,
            "active_profile_id": str(mc.get("active_profile_id") or ""),
            "profiles": profiles,
            "note": (
                "问数按工作区命中对接卡；未带工作区且只有一张卡已接通时用该卡，不以正在编辑的空卡为准。"
                if any_url and not active_url
                else ""
            ),
        },
        "config_ready": bool(ask_url) or any_url,
    }
    if include_demo:
        # 延迟导入：demo_data → pandas/numpy；缺依赖时不得让整页 /api/status 500
        try:
            from .demo_data import get_demo_store

            out["demo"] = get_demo_store().summary()
        except ImportError as exc:
            out["demo"] = {
                "ok": False,
                "detail": f"演示数据不可用（{exc.name or type(exc).__name__}）",
            }
    return out
