# -*- coding: utf-8 -*-
"""SVN 提交最小实现：状态探测 + 指定文件 commit（不另造鉴权）。"""
from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

_REL_OK = re.compile(r"^[A-Za-z0-9_./\-]+$")


def _run_svn(cwd: Path, *args: str, timeout: int = 120) -> tuple[int, str, str]:
    try:
        kwargs: dict[str, Any] = {
            "cwd": str(cwd),
            "capture_output": True,
            "text": True,
            "timeout": timeout,
            "encoding": "utf-8",
            "errors": "replace",
        }
        if os.name == "nt":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        proc = subprocess.run(["svn", *args], **kwargs)
    except FileNotFoundError:
        return 127, "", "本机未安装 svn 命令行"
    except subprocess.TimeoutExpired:
        return 124, "", "svn 超时"
    except OSError as e:
        return 1, "", str(e)
    return int(proc.returncode), (proc.stdout or ""), (proc.stderr or "")


def _norm_rel(rel: str) -> str:
    r = str(rel or "").replace("\\", "/").strip()
    while r.startswith("./"):
        r = r[2:]
    r = r.lstrip("/")
    if not r or ".." in r.split("/") or r.startswith("~"):
        return ""
    if not _REL_OK.match(r):
        return ""
    return r


def inspect_svn_repo(workspace: Path | str) -> dict[str, Any]:
    root = Path(workspace).expanduser().resolve()
    if not root.is_dir():
        return {"is_svn": False, "reason": "目录不存在"}
    if not (root / ".svn").is_dir():
        return {"is_svn": False, "reason": "不是 SVN 工作副本"}
    code, out, err = _run_svn(root, "info", "--show-item", "url")
    url = (out or "").strip()
    if code != 0 or not url:
        # 旧版 svn 无 --show-item
        code2, out2, err2 = _run_svn(root, "info")
        url = ""
        for line in (out2 or "").splitlines():
            if line.lower().startswith("url:"):
                url = line.split(":", 1)[1].strip()
                break
        if not url and code != 0 and code2 != 0:
            return {
                "is_svn": True,
                "has_remote": False,
                "url": "",
                "reason": (err or err2 or "svn info 失败")[:200],
            }
    return {
        "is_svn": True,
        "has_remote": bool(url),
        "url": url[:400],
        "reason": "",
    }


def list_svn_dirty_files(workspace: Path | str) -> set[str]:
    """svn status 可提交路径（含未版本控 ? / A / M 等）。"""
    root = Path(workspace).expanduser().resolve()
    code, out, _ = _run_svn(root, "status", "-q")
    # -q 会漏未版本控；再补一次完整 status
    code2, out2, _ = _run_svn(root, "status")
    text = (out2 if code2 == 0 else out) or ""
    if code != 0 and code2 != 0:
        return set()
    dirty: set[str] = set()
    for line in text.splitlines():
        if len(line) < 2:
            continue
        # 状态列后路径；跳过外部/冲突标记行的复杂解析，取末尾路径段
        path = line[8:].strip() if len(line) > 8 and line[0] in "ACDMR?!I~L" else ""
        if not path and line[0] in "ACDMR?!":
            parts = line[1:].strip().split(None, 1)
            path = parts[-1] if parts else ""
        rel = _norm_rel(path)
        if rel:
            dirty.add(rel)
    return dirty


def file_has_svn_pending_change(root: Path, rel: str) -> bool:
    norm = _norm_rel(rel)
    if not norm:
        return False
    return norm in list_svn_dirty_files(root)


def filter_pending_svn_files(
    workspace: Path | str,
    synced_files: list[str],
) -> dict[str, Any]:
    """与 git filter 同口径：业务可提交 ∩ SVN dirty，并并入其它脏文件。"""
    from .git_ops import _is_business_source, is_commit_noise_path  # noqa: PLC2701

    root = Path(workspace).expanduser().resolve()
    synced = [_norm_rel(str(p)) for p in (synced_files or []) if str(p).strip()]
    synced = [p for p in dict.fromkeys(synced) if p and not is_commit_noise_path(p)]
    dirty_all = list_svn_dirty_files(root)
    dirty_clean = {p for p in dirty_all if not is_commit_noise_path(p)}
    dirty_business = sorted(p for p in dirty_clean if _is_business_source(p))

    pending: list[str] = []
    seen: set[str] = set()
    for rel in synced:
        if not _is_business_source(rel):
            continue
        try:
            if not (root / rel).is_file():
                continue
        except OSError:
            continue
        # 同步池文件存在即纳入（含尚未 svn add）
        if rel not in seen:
            pending.append(rel)
            seen.add(rel)

    for rel in dirty_business:
        if rel in seen:
            continue
        try:
            if not (root / rel).is_file():
                continue
        except OSError:
            continue
        pending.append(rel)
        seen.add(rel)
        if len(pending) >= 80:
            break

    return {
        "pending_files": pending,
        "scope_note": "SVN 工作副本待提交",
        "pending_source": "svn_dirty",
    }


def commit_svn_files(
    workspace: Path | str,
    synced_files: list[str],
    *,
    message: str,
) -> dict[str, Any]:
    """对指定相对路径 svn add（如需）后 commit。成功即已达远端仓库（若有 URL）。"""
    from .git_ops import validate_chinese_commit_message

    root = Path(workspace).expanduser().resolve()
    info = inspect_svn_repo(root)
    if not info.get("is_svn"):
        return {
            "ok": False,
            "skipped": True,
            "error": info.get("reason") or "不是 SVN 工作副本",
            "revision": "",
            "files": [],
        }

    ok_msg, err_msg = validate_chinese_commit_message(message)
    if not ok_msg:
        return {"ok": False, "skipped": False, "error": err_msg, "revision": "", "files": []}

    rels: list[str] = []
    for p in synced_files or []:
        rel = _norm_rel(str(p))
        if not rel:
            continue
        abs_path = (root / rel).resolve()
        try:
            abs_path.relative_to(root)
        except ValueError:
            continue
        if abs_path.is_file():
            rels.append(rel)
    rels = list(dict.fromkeys(rels))
    if not rels:
        return {
            "ok": False,
            "skipped": True,
            "error": "没有可提交的文件",
            "revision": "",
            "files": [],
        }

    # 未版本控先 add
    for rel in rels:
        _run_svn(root, "add", "--force", "--", rel)

    code, out, err = _run_svn(root, "commit", "-m", message, "--", *rels, timeout=300)
    if code != 0:
        return {
            "ok": False,
            "skipped": False,
            "error": (err or out or "svn commit 失败")[:800],
            "revision": "",
            "files": rels,
        }

    rev = ""
    text = (out or "") + "\n" + (err or "")
    m = re.search(r"(?:Committed revision|提交的版本|revision)\s*(\d+)", text, re.I)
    if m:
        rev = m.group(1)
    note = f"已 svn commit" + (f"（r{rev}）" if rev else "")
    if info.get("has_remote"):
        note += "，已提交到仓库。"
    else:
        note += "（工作副本无 URL，请确认是否已关联远端）。"
    return {
        "ok": True,
        "skipped": False,
        "error": "",
        "revision": rev,
        "files": rels,
        "message": note,
        "vcs_kind": "svn",
        "push": {
            "ok": True,
            "skipped": True,
            "local_only": False,
            "message": "SVN commit 即写入仓库，无单独 push",
        },
    }
