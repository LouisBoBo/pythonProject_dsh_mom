"""把 WorkBuddy 配置中心的 DeepSeek Key 同步到 DSH 聊天凭据。

DSH 聊天（deepseek-official）只读 $DSH_HOME/.credentials.yaml 的
DEEPSEEK_API_KEY（或启动环境变量）。引擎审码 / 意图读 config.yaml。
产品约定：只要在 WorkBuddy 配了可用 Key，聊天壳就应能用。

不把密钥打进日志。失败不得阻断配置保存。
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

REF_NAME = "DEEPSEEK_API_KEY"
_PLACEHOLDER_RE = re.compile(
    r"^(sk-x+|your[_-]?api[_-]?key|changeme|todo|none|null|undefined)$",
    re.IGNORECASE,
)


def _unquote(raw: str) -> str:
    s = raw.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        inner = s[1:-1]
        if s[0] == '"':
            inner = inner.replace('\\"', '"').replace("\\\\", "\\")
        return inner
    if " #" in s:
        s = s.split(" #", 1)[0].rstrip()
    return s.strip()


def _quote_yaml_scalar(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def is_usable_key(value: Optional[str]) -> bool:
    if value is None:
        return False
    s = str(value).strip()
    if not s:
        return False
    if set(s) <= set("*•·xX"):
        return False
    if s.startswith("<") and s.endswith(">"):
        return False
    if _PLACEHOLDER_RE.match(s):
        return False
    return True


def key_from_config_dict(cfg: Any) -> str:
    if not isinstance(cfg, dict):
        return ""
    from .llm_config import resolve_llm_cfg

    llm = resolve_llm_cfg(cfg if isinstance(cfg, dict) else {})
    if (llm.get("provider") or "deepseek").lower() != "deepseek":
        return ""
    return str(llm.get("api_key") or "").strip()


def read_deepseek_api_key(config_path: Path) -> str:
    if not config_path.is_file():
        return ""
    text = config_path.read_text(encoding="utf-8")
    try:
        import yaml

        data = yaml.safe_load(text) or {}
        return key_from_config_dict(data)
    except Exception:
        pass
    in_block = False
    for line in text.splitlines():
        if re.match(r"^deepseek:\s*$", line):
            in_block = True
            continue
        if in_block:
            if line and not line[:1].isspace() and not line.startswith("#"):
                break
            m = re.match(r"^[ \t]+api_key:\s*(.*)$", line)
            if m:
                return _unquote(m.group(1))
    return ""


def load_credential_refs(path: Path) -> Dict[str, str]:
    if not path.is_file():
        return {}
    refs: Dict[str, str] = {}
    in_refs = False
    for line in path.read_text(encoding="utf-8").splitlines():
        if re.match(r"^refs:\s*$", line):
            in_refs = True
            continue
        if in_refs:
            if line and not line[:1].isspace() and not line.startswith("#"):
                in_refs = False
                continue
            m = re.match(r"^[ \t]+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", line)
            if m:
                refs[m.group(1)] = _unquote(m.group(2))
    return refs


def dump_credential_refs(path: Path, refs: Dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["version: 1", "", "refs:"]
    for key in sorted(refs):
        lines.append(f"  {key}: {_quote_yaml_scalar(refs[key])}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def _home_key(path: Path) -> str:
    try:
        return str(path.expanduser().resolve())
    except OSError:
        return str(path.expanduser())


def resolve_dsh_homes(extra_home: Optional[Path] = None) -> List[Path]:
    """DSH_HOME（桌面隔离家目录）+ 本机 ~/.dsh（开发壳 :3081）。"""
    seen = set()
    out: List[Path] = []

    def add(raw: Optional[Path]) -> None:
        if raw is None:
            return
        p = Path(raw)
        if not str(p).strip():
            return
        p = p.expanduser()
        k = _home_key(p)
        if k in seen:
            return
        seen.add(k)
        out.append(p)

    add(extra_home)
    env = (os.environ.get("DSH_HOME") or "").strip()
    if env:
        add(Path(env))
    add(Path.home() / ".dsh")
    return out


def sync_key_to_home(api_key: str, dsh_home: Path) -> Dict[str, Any]:
    cred_path = Path(dsh_home).expanduser() / ".credentials.yaml"
    if not is_usable_key(api_key):
        return {
            "action": "skip",
            "path": str(cred_path),
            "key_len": 0,
            "reason": "WorkBuddy 无可用 deepseek.api_key",
        }
    want = api_key.strip()
    refs = load_credential_refs(cred_path)
    existing = str(refs.get(REF_NAME) or "").strip()
    if existing == want:
        return {
            "action": "keep",
            "path": str(cred_path),
            "key_len": len(want),
            "reason": "DSH 凭据已与 WorkBuddy Key 一致",
        }
    had = is_usable_key(existing)
    refs[REF_NAME] = want
    dump_credential_refs(cred_path, refs)
    return {
        "action": "update" if had else "seed",
        "path": str(cred_path),
        "key_len": len(want),
        "reason": "已将 WorkBuddy DeepSeek Key 写入 DSH 聊天凭据",
    }


def sync_workbuddy_deepseek_key(
    api_key: str,
    *,
    homes: Optional[Iterable[Path]] = None,
    extra_home: Optional[Path] = None,
) -> Dict[str, Any]:
    targets = list(homes) if homes is not None else resolve_dsh_homes(extra_home)
    results = [sync_key_to_home(api_key, home) for home in targets]
    actions = {r["action"] for r in results}
    if "update" in actions or "seed" in actions:
        summary = "sync"
    elif "keep" in actions:
        summary = "keep"
    else:
        summary = "skip"
    return {
        "action": summary,
        "key_len": max((r.get("key_len") or 0) for r in results) if results else 0,
        "homes": results,
    }


def sync_from_config_file(
    config_path: Path,
    *,
    extra_home: Optional[Path] = None,
    homes: Optional[Iterable[Path]] = None,
) -> Dict[str, Any]:
    return sync_workbuddy_deepseek_key(
        read_deepseek_api_key(config_path),
        homes=homes,
        extra_home=extra_home,
    )
