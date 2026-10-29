"""部署同步排除项：强制底线 + 配置 + 画像；禁止只认 erp.db。"""
from __future__ import annotations

from typing import Any

# 即使配置清空也必须排除（运行态 / 密钥 / 依赖目录 / 库文件）
FORCE_EXCLUDE: tuple[str, ...] = (
    ".venv",
    "venv",
    "node_modules",
    ".env",
    ".env.*",
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "*.db-wal",
    "*.db-shm",
    "*.db-journal",
    "config.yaml",
    "*.pem",
    "id_rsa*",
    "id_ed25519*",
    "*.key",
    # 本机私钥路径等；禁止随工程同步到远端
    ".workbuddy/deploy.local.yaml",
    "**/deploy.local.yaml",
    "*.local.yaml",
)

# 画像未声明时的通用默认（任意项目）
DEFAULT_PROFILE_EXCLUDES: tuple[str, ...] = (
    "node_modules",
    ".git",
    "__pycache__",
    ".pytest_cache",
    "dist/*.map",
    "coverage",
    ".DS_Store",
)


def _clean_pat(p: str) -> str:
    s = str(p or "").strip().replace("\\", "/")
    if not s or ".." in s.split("/"):
        return ""
    # 只允许简单 glob，避免注入
    allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.*?[]-./")
    if any(ch not in allowed for ch in s):
        return ""
    return s


def resolve_exclude_patterns(
    cfg: Any | None = None,
    *,
    profile: dict[str, Any] | None = None,
) -> list[str]:
    """合并强制排除 + 配置 rsync_excludes + 画像 deploy.exclude_patterns。"""
    seen: set[str] = set()
    out: list[str] = []

    def add(pat: str) -> None:
        p = _clean_pat(pat)
        if not p or p in seen:
            return
        seen.add(p)
        out.append(p)

    for p in FORCE_EXCLUDE:
        add(p)

    raw_cfg = []
    if cfg is not None:
        raw_cfg = getattr(cfg, "rsync_excludes", None) or []
    if isinstance(raw_cfg, list):
        for p in raw_cfg:
            add(str(p))

    prof_pats: list[str] = []
    if isinstance(profile, dict):
        dep = profile.get("deploy") if isinstance(profile.get("deploy"), dict) else {}
        ep = dep.get("exclude_patterns") if isinstance(dep, dict) else None
        if isinstance(ep, list) and ep:
            prof_pats = [str(x) for x in ep]
    if not prof_pats:
        prof_pats = list(DEFAULT_PROFILE_EXCLUDES)
    for p in prof_pats:
        add(p)

    return out
