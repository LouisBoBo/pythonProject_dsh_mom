#!/usr/bin/env python3
"""把公司共享知识库种子合并进引擎 config.yaml（傻瓜式接入）。

- 种子：apps/zr-workbuddy/config/company-knowledge.env（gitignore）
- 产品默认：base_url / api_prefix / kb / verify_ssl（与现网中央机对齐）
- 合并策略：只填 config.yaml 里空缺项，不覆盖已有非空值
- 接入点：ensure_runtime / 桌面启动 / 发版门禁（有种子文件）
- 破窗：WORKBUDDY_SKIP_COMPANY_KNOWLEDGE=1

密钥不打印到 stdout/stderr。
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

# 与现网中央机对齐的非密钥默认（无种子文件时仍可写入 URL，便于探活；token 仍靠种子）
PRODUCT_DEFAULTS: dict[str, Any] = {
    "base_url": "https://175.178.238.31:8093",
    "api_prefix": "/knowledge-api/v1",
    "knowledge_base_id": "default",
    "timeout_ms": 10000,
    # 默认校验证书；现网自签须在种子里显式 COMPANY_KNOWLEDGE_VERIFY_SSL=false
    "verify_ssl": True,
}

_ENV_KEYS = {
    "COMPANY_KNOWLEDGE_BASE_URL": "base_url",
    "COMPANY_KNOWLEDGE_API_PREFIX": "api_prefix",
    "COMPANY_KNOWLEDGE_KB_ID": "knowledge_base_id",
    "COMPANY_KNOWLEDGE_TIMEOUT_MS": "timeout_ms",
    "COMPANY_KNOWLEDGE_VERIFY_SSL": "verify_ssl",
    "COMPANY_KNOWLEDGE_READ_TOKEN": "read_token",
    "COMPANY_KNOWLEDGE_WRITE_TOKEN": "write_token",
    # 兼容 WORKBUDDY_ 前缀
    "WORKBUDDY_COMPANY_KNOWLEDGE_BASE_URL": "base_url",
    "WORKBUDDY_COMPANY_KNOWLEDGE_API_PREFIX": "api_prefix",
    "WORKBUDDY_COMPANY_KNOWLEDGE_KB_ID": "knowledge_base_id",
    "WORKBUDDY_COMPANY_KNOWLEDGE_TIMEOUT_MS": "timeout_ms",
    "WORKBUDDY_COMPANY_KNOWLEDGE_VERIFY_SSL": "verify_ssl",
    "WORKBUDDY_COMPANY_KNOWLEDGE_READ_TOKEN": "read_token",
    "WORKBUDDY_COMPANY_KNOWLEDGE_WRITE_TOKEN": "write_token",
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def default_seed_path(root: Path | None = None) -> Path:
    base = root or _repo_root()
    override = (os.environ.get("COMPANY_KNOWLEDGE_ENV") or "").strip()
    if override:
        return Path(override).expanduser()
    return base / "apps" / "zr-workbuddy" / "config" / "company-knowledge.env"


def default_config_path(root: Path | None = None) -> Path:
    base = root or _repo_root()
    return base / "apps" / "zr-workbuddy" / "engine" / "config" / "config.yaml"


def _parse_bool(raw: str) -> bool:
    return str(raw).strip().lower() in {"1", "true", "yes", "on"}


def _parse_value(field: str, raw: str) -> Any:
    s = str(raw).strip().strip('"').strip("'")
    if field == "verify_ssl":
        return _parse_bool(s)
    if field == "timeout_ms":
        try:
            return max(100, min(int(s), 120_000))
        except ValueError:
            return PRODUCT_DEFAULTS["timeout_ms"]
    return s


def load_seed_file(path: Path) -> dict[str, Any]:
    """读 KEY=VAL 种子；忽略注释与空行。不覆盖已在 os.environ 里的同名键。"""
    out: dict[str, Any] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        field = _ENV_KEYS.get(key)
        if not field:
            continue
        # 环境变量优先
        env_val = os.environ.get(key)
        raw = env_val if env_val is not None and str(env_val).strip() != "" else val
        if str(raw).strip() == "":
            continue
        out[field] = _parse_value(field, str(raw))
    # 仅 env、无文件行时也收一遍
    for env_key, field in _ENV_KEYS.items():
        if field in out:
            continue
        env_val = os.environ.get(env_key)
        if env_val is None or str(env_val).strip() == "":
            continue
        out[field] = _parse_value(field, str(env_val))
    return out


def desired_section(seed: dict[str, Any] | None = None) -> dict[str, Any]:
    """产品默认 ⊕ 种子/环境（种子覆盖默认）。"""
    merged = dict(PRODUCT_DEFAULTS)
    if seed:
        for k, v in seed.items():
            if v is None:
                continue
            if isinstance(v, str) and not v.strip():
                continue
            merged[k] = v
    return merged


def _is_empty(val: Any) -> bool:
    if val is None:
        return True
    if isinstance(val, str):
        return not val.strip()
    return False


def _has_read_token(sec: dict[str, Any]) -> bool:
    tok = str(sec.get("read_token") or "").strip()
    return len(tok) >= 24


def merge_into_section(current: dict[str, Any], desired: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """合并策略（傻瓜式）：

    - 尚未接入（无合格 read_token）：用种子/产品默认覆盖整段已知字段（含把
      DEFAULT_CONFIG 里的 verify_ssl:true 改成种子的 false）
    - 已接入：只填空缺，不覆盖本机已有非空值
    """
    out = dict(current) if isinstance(current, dict) else {}
    configured = _has_read_token(out)
    changed: list[str] = []
    for key, want in desired.items():
        if _is_empty(want):
            continue
        cur = out.get(key)
        if configured:
            if _is_empty(cur):
                out[key] = want
                changed.append(key)
        else:
            if cur != want:
                out[key] = want
                changed.append(key)
    return out, changed

def _engine_on_path(root: Path) -> None:
    eng = root / "apps" / "zr-workbuddy" / "engine"
    s = str(eng)
    if s not in sys.path:
        sys.path.insert(0, s)


def ensure_company_knowledge(
    *,
    config_path: Path | None = None,
    seed_path: Path | None = None,
    root: Path | None = None,
    do_fix: bool = True,
) -> dict[str, Any]:
    """合并公司知识库配置。返回 {ok, configured, fixed, filled, detail, seed_present}。"""
    if (os.environ.get("WORKBUDDY_SKIP_COMPANY_KNOWLEDGE") or "").strip() == "1":
        return {
            "ok": True,
            "configured": False,
            "fixed": False,
            "filled": [],
            "detail": "已跳过（WORKBUDDY_SKIP_COMPANY_KNOWLEDGE=1）",
            "seed_present": False,
        }

    base = root or _repo_root()
    cfg_path = Path(config_path or default_config_path(base))
    seed_p = Path(seed_path or default_seed_path(base))
    seed = load_seed_file(seed_p)
    desired = desired_section(seed)
    seed_present = seed_p.is_file()

    _engine_on_path(base)
    try:
        from app.config_store import load_config, update_config  # type: ignore
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "configured": False,
            "fixed": False,
            "filled": [],
            "detail": f"无法导入 config_store: {type(exc).__name__}",
            "seed_present": seed_present,
        }

    # 解析路径：桌面 persist 可能不在默认位置
    import app.config_store as cs  # type: ignore

    prev_path = str(getattr(cs, "CONFIG_PATH", "") or "")
    prev_dir = str(getattr(cs, "CONFIG_DIR", "") or "")
    prev_bak = str(getattr(cs, "BACKUP_PATH", "") or "")
    try:
        target = str(cfg_path.resolve())
        if Path(target) != Path(prev_path or target).resolve():
            cs.CONFIG_PATH = target
            cs.CONFIG_DIR = str(Path(target).parent)
            cs.BACKUP_PATH = target + ".bak"

        cfg = load_config()
        cur = cfg.get("company_knowledge") if isinstance(cfg.get("company_knowledge"), dict) else {}
        merged, filled = merge_into_section(cur, desired)

        if do_fix and filled:

            def _mut(c: dict[str, Any]) -> bool:
                c["company_knowledge"] = merged
                return True

            update_config(_mut, side_effects=False)
            fixed = True
        else:
            fixed = False

        from app.company_knowledge import is_configured  # type: ignore

        configured = is_configured({"company_knowledge": merged})
        if configured:
            detail = "公司共享知识库已接入" + (
                f"（补齐 {', '.join(filled)}）" if filled and fixed else ""
            )
        elif not seed_present and not str(desired.get("read_token") or "").strip():
            detail = (
                f"无种子 {seed_p.name}：已写入产品默认 URL，"
                "发版机放置 company-knowledge.env（含 READ_TOKEN）后自动合并"
            )
        else:
            detail = "种子缺少 read_token（≥24），公司库尚未可用"
        return {
            "ok": True,
            "configured": configured,
            "fixed": fixed,
            "filled": filled,
            "detail": detail,
            "seed_present": seed_present,
        }
    finally:
        if prev_path:
            cs.CONFIG_PATH = prev_path
            cs.CONFIG_DIR = prev_dir
            cs.BACKUP_PATH = prev_bak

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="合并公司共享知识库配置到 config.yaml")
    ap.add_argument("--fix", action="store_true", help="写入空缺项")
    ap.add_argument("--config", type=Path, default=None)
    ap.add_argument("--seed", type=Path, default=None)
    ap.add_argument("--require", action="store_true", help="未 configured 则 exit 1")
    args = ap.parse_args(argv)
    res = ensure_company_knowledge(
        config_path=args.config,
        seed_path=args.seed,
        do_fix=args.fix,
    )
    print(f"{'OK' if res['ok'] else 'FAIL'} company_knowledge: {res['detail']}")
    if args.require and not res.get("configured"):
        return 1
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
