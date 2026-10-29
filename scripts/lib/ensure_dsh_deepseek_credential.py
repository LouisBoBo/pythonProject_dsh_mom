#!/usr/bin/env python3
"""CLI：把引擎 config.yaml 的 DeepSeek Key 同步到 DSH 聊天凭据。

实现在 engine/app/dsh_chat_credential.py。WorkBuddy 配置是真相源：
引擎已有可用 Key 时写入/覆盖 $DSH_HOME 与 ~/.dsh 的 DEEPSEEK_API_KEY。
绝不把密钥打印到 stdout/stderr。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ENGINE = Path(__file__).resolve().parents[2] / "apps" / "zr-workbuddy" / "engine"
if str(_ENGINE) not in sys.path:
    sys.path.insert(0, str(_ENGINE))

from app.dsh_chat_credential import sync_from_config_file  # noqa: E402


def ensure_dsh_deepseek_credential(config_path: Path, dsh_home: Path):
    """兼容旧调用：按 WorkBuddy Key 同步到指定 DSH_HOME（及默认家目录）。"""
    result = sync_from_config_file(Path(config_path), extra_home=Path(dsh_home))
    homes = result.get("homes") or []
    picked = None
    want = str(Path(dsh_home).expanduser())
    for row in homes:
        if str(row.get("path") or "").startswith(want):
            picked = row
            break
    if picked is None:
        picked = {
            "action": result.get("action") or "skip",
            "path": str(Path(dsh_home).expanduser() / ".credentials.yaml"),
            "key_len": result.get("key_len") or 0,
            "reason": "无同步目标",
        }
    return picked


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sync DSH DeepSeek credential from WorkBuddy config")
    parser.add_argument(
        "--config",
        type=Path,
        default=_repo_root() / "apps" / "zr-workbuddy" / "engine" / "config" / "config.yaml",
    )
    parser.add_argument(
        "--dsh-home",
        type=Path,
        default=None,
    )
    args = parser.parse_args(argv)
    extra = args.dsh_home
    if extra is None:
        import os

        extra = Path(os.environ.get("DSH_HOME") or (Path.home() / ".dsh"))
    result = sync_from_config_file(args.config, extra_home=extra)
    print(f"{result['action']}: WorkBuddy → DSH 聊天凭据 (len={result['key_len']})")
    for row in result.get("homes") or []:
        print(f"  {row['action']}: {row['reason']} (len={row['key_len']})")
        print(f"  path: {row['path']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
