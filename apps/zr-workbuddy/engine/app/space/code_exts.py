# -*- coding: utf-8 -*-
"""资料库写码入库：扩展名白名单跟画像；密钥与库文件永不入库。"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

# 基线：常见 Web + 已覆盖的多语言（补上 .cs 等）
BASE_CODE_FILE_EXTS: frozenset[str] = frozenset(
    {
        "py",
        "js",
        "jsx",
        "ts",
        "tsx",
        "vue",
        "css",
        "scss",
        "less",
        "html",
        "htm",
        "json",
        "yaml",
        "yml",
        "toml",
        "md",
        "txt",
        "sh",
        "bash",
        "sql",
        "go",
        "rs",
        "java",
        "kt",
        "kts",
        "cs",
        "fs",
        "vb",
        "c",
        "cc",
        "cpp",
        "h",
        "hpp",
        "xml",
        "r",
        "rb",
        "php",
        "swift",
        "m",
        "mm",
        "dart",
        "scala",
        "gradle",
    }
)

# 即使画像/配置误加也永不入库
BLOCKED_CODE_EXTS: frozenset[str] = frozenset(
    {
        "db",
        "sqlite",
        "sqlite3",
        "db-wal",
        "db-shm",
        "db-journal",
        "pem",
        "key",
        "p12",
        "pfx",
        "keystore",
        "jks",
        "exe",
        "dll",
        "so",
        "dylib",
        "bin",
        "class",
        "jar",
        "war",
        "ear",
        "zip",
        "7z",
        "rar",
        "gz",
        "tgz",
        "png",
        "jpg",
        "jpeg",
        "gif",
        "webp",
        "ico",
        "pdf",
        "lock",
    }
)

_LANG_TO_EXTS: dict[str, tuple[str, ...]] = {
    "python": ("py",),
    "javascript": ("js", "jsx"),
    "typescript": ("ts", "tsx"),
    "vue": ("vue",),
    "java": ("java",),
    "kotlin": ("kt", "kts"),
    "c#": ("cs",),
    "csharp": ("cs",),
    "f#": ("fs",),
    "vb": ("vb",),
    "go": ("go",),
    "rust": ("rs",),
    "swift": ("swift",),
    "objective-c": ("m", "mm"),
    "dart": ("dart",),
    "flutter": ("dart",),
    "scala": ("scala",),
    "php": ("php",),
    "ruby": ("rb",),
    "c": ("c", "h"),
    "c++": ("cpp", "cc", "hpp", "h"),
    "sql": ("sql",),
}

_SECRET_NAME = re.compile(
    r"(^|[/\\])("
    r"\.env(\..+)?|"
    r"config\.ya?ml|"
    r".*\.pem|"
    r".*\.key|"
    r".*\.p12|"
    r".*\.pfx|"
    r".*\.keystore|"
    r"id_rsa|"
    r"id_dsa|"
    r"id_ed25519|"
    r".*credential.*|"
    r".*secret.*|"
    r".*api[_-]?key.*|"
    r"jwt_secret|"
    r"\.npmrc|"
    r"\.pypirc"
    r")$",
    re.I,
)

_EXT_TOKEN_OK = re.compile(r"^[a-z0-9]{1,16}$")


def normalize_ext(raw: str) -> str:
    s = str(raw or "").strip().lower()
    while s.startswith("."):
        s = s[1:]
    if not s or not _EXT_TOKEN_OK.match(s):
        return ""
    return s


def is_blocked_code_ext(ext: str) -> bool:
    e = normalize_ext(ext)
    return bool(e) and e in BLOCKED_CODE_EXTS


def is_secret_rel(rel: str) -> bool:
    r = str(rel or "").replace("\\", "/").strip()
    if not r:
        return True
    if _SECRET_NAME.search(r):
        return True
    # 无扩展名的敏感文件名
    name = r.rsplit("/", 1)[-1].lower()
    if name in {".env", "credentials", "secrets"}:
        return True
    return False


def exts_for_languages(languages: list[str] | None) -> set[str]:
    out: set[str] = set()
    for lang in languages or []:
        key = str(lang or "").strip().lower()
        for e in _LANG_TO_EXTS.get(key, ()):
            if e and e not in BLOCKED_CODE_EXTS:
                out.add(e)
    return out


def resolve_code_file_exts(profile: dict[str, Any] | None = None) -> frozenset[str]:
    """基线 + 画像 code_suffixes + 语言映射；永远剔除库文件/密钥类扩展名。"""
    names: set[str] = set(BASE_CODE_FILE_EXTS)
    if isinstance(profile, dict):
        for raw in profile.get("code_suffixes") or []:
            e = normalize_ext(str(raw))
            if e and e not in BLOCKED_CODE_EXTS:
                names.add(e)
        langs = [str(x) for x in (profile.get("languages") or []) if str(x).strip()]
        names |= exts_for_languages(langs)
    # 二次过滤
    names = {e for e in names if e and e not in BLOCKED_CODE_EXTS}
    return frozenset(names)


def load_cached_profile(workspace: str | None) -> dict[str, Any] | None:
    ws = str(workspace or "").strip()
    if not ws:
        return None
    try:
        from ..project_profile import load_cached

        return load_cached(str(Path(ws).expanduser().resolve()))
    except Exception:  # noqa: BLE001
        return None


def allowed_exts_for_workspace(workspace: str | None) -> frozenset[str]:
    return resolve_code_file_exts(load_cached_profile(workspace))


def is_ingestible_code_rel(
    rel: str,
    *,
    allowed_exts: frozenset[str] | None = None,
) -> bool:
    """相对路径是否可入库：非密钥、非库文件、扩展名在白名单。"""
    r = str(rel or "").replace("\\", "/").strip()
    if not r or ".." in r.split("/"):
        return False
    if is_secret_rel(r):
        return False
    ext = normalize_ext(Path(r).suffix)
    if not ext or is_blocked_code_ext(ext):
        return False
    allow = allowed_exts if allowed_exts is not None else BASE_CODE_FILE_EXTS
    return ext in allow
