"""dev-pipeline 配置（config.yaml · dev_pipeline）。"""
from __future__ import annotations

from typing import Any

from ..config_store import load_config
from .cursor_coding_client import normalize_chat_base


def get_config() -> dict[str, Any]:
    cfg = load_config() or {}
    block = cfg.get("dev_pipeline")
    if not isinstance(block, dict):
        block = {}
    commands = block.get("validate_commands")
    if not isinstance(commands, list):
        commands = []
    allow_skip = block.get("allow_skip_steps")
    if not isinstance(allow_skip, list):
        allow_skip = []
    chat_base, _remap = normalize_chat_base(
        str(block.get("cursor_coding_base") or "http://127.0.0.1:18791").strip()
    )
    return {
        "enabled": bool(block.get("enabled", True)),
        # 写码交付打回硬顶 3（配置写更大也夹到 3，禁止「多轮瞎改」）
        "max_fix_rounds": max(1, min(3, int(block.get("max_fix_rounds") or 3))),
        # 部署上线整趟（prepare+confirm）瞬时失败最多重试；硬顶 3
        "max_deploy_attempts": max(1, min(3, int(block.get("max_deploy_attempts") or 3))),
        "default_workspace": str(block.get("default_workspace") or "").strip(),
        # 步骤 9：auto | github | gitlab | gitee | skip（SVN 自动标不适用）
        "pr_provider": str(block.get("pr_provider") or "auto").strip().lower() or "auto",
        "validate_commands": commands,
        "validate_timeout_sec": max(5, int(block.get("validate_timeout_sec") or 600)),
        "on_step_fail": str(block.get("on_step_fail") or "auto_fix").strip(),
        "allow_skip_steps": [str(x) for x in allow_skip],
        # 每步回执展示停留秒数（逐步可见；软步骤宜短，默认 0.35s）
        "step_pace_sec": float(block.get("step_pace_sec") or 0.35),
        # True：begin 后 1→10 自动连跑，中间无 pipeline 确认按钮（写码走插件真 Job）
        "auto_run": bool(block.get("auto_run", True)),
        # 唯一入口 :18791；yaml 若仍写旧 :18788 会在此纠偏
        "cursor_coding_base": chat_base,
        "implement_timeout_sec": max(60, int(block.get("implement_timeout_sec") or 2700)),
        "implement_poll_sec": max(0.5, float(block.get("implement_poll_sec") or 2.0)),
        # 一体化第 8 步提交墙钟上限（秒）；超时软跳过继续 9/10，可稍后手动提交
        "commit_timeout_sec": max(15, min(180, int(block.get("commit_timeout_sec") or 60))),
    }
