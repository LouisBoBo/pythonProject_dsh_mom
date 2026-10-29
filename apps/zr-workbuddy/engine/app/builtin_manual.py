# -*- coding: utf-8 -*-
"""本机预置《用户操作手册》：免挂载、全应用可召回。

真相源优先读 $DSH_HOME/knowledge/builtin/；其次仓库打包路径；
若已写入知识库 sqlite，也可按条目 id 直读（侧栏默认库同源）。
"""
from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path
from typing import Any

ENTRY_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
TITLE = "江西中软工作助手 · 用户操作手册"

_HELP_HINT = re.compile(
    r"(手册|怎么用|如何用|怎么操作|如何操作|用法|操作说明|使用说明|"
    r"登录|问数|写码|审码|提交|部署|资料库|用量|知识库|插件市场|"
    r"需求.?上线|普通写码|工作区|设置|MOM|Mom-x|WorkBuddy|工作助手)",
    re.I,
)


def _repo_root() -> Path:
    # engine/app/builtin_manual.py → apps/zr-workbuddy/engine/app → repo
    return Path(__file__).resolve().parents[4]


def _dsh_home() -> Path:
    env = (os.environ.get("DSH_HOME") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return (Path.home() / ".dsh").resolve()


def resolve_manual_paths() -> list[Path]:
    home = _dsh_home()
    root = _repo_root()
    return [
        home / "knowledge" / "builtin" / "用户操作手册.md",
        root / "apps" / "zr-workbuddy" / "config" / "builtin-knowledge" / "用户操作手册.md",
        root / "Framework" / "docs" / "产品与口径" / "用户操作手册.md",
    ]


def load_manual_text() -> tuple[str | None, str]:
    """返回 (正文, 来源说明)。"""
    # 1) 文件
    for p in resolve_manual_paths():
        try:
            if p.is_file():
                text = p.read_text(encoding="utf-8").strip()
                if text:
                    return text, str(p)
        except OSError:
            continue
    # 2) sqlite 默认库
    db = _dsh_home() / "knowledge" / "knowledge.sqlite"
    if db.is_file():
        try:
            uri = "file:" + db.resolve().as_posix() + "?mode=ro"
            conn = sqlite3.connect(uri, uri=True, timeout=5)
            try:
                row = conn.execute(
                    "SELECT title, body FROM knowledge_entries WHERE id=? AND status='active'",
                    (ENTRY_ID,),
                ).fetchone()
                if row:
                    title = str(row[0] or TITLE).strip()
                    body = str(row[1] or "").strip()
                    if body:
                        return f"# {title}\n\n{body}", f"sqlite:{db}"
            finally:
                conn.close()
        except sqlite3.Error:
            pass
    return None, ""


def _split_sections(text: str) -> list[tuple[str, str]]:
    lines = text.replace("\r\n", "\n").split("\n")
    sections: list[tuple[str, str]] = []
    cur_title = TITLE
    buf: list[str] = []
    for ln in lines:
        if ln.startswith("## "):
            if buf:
                sections.append((cur_title, "\n".join(buf).strip()))
            cur_title = ln[3:].strip() or cur_title
            buf = [ln]
        else:
            buf.append(ln)
    if buf:
        sections.append((cur_title, "\n".join(buf).strip()))
    return [(t, b) for t, b in sections if b]


def _score(section: str, query: str) -> int:
    q = (query or "").strip().lower()
    if not q:
        return 0
    s = section.lower()
    score = 0
    for tok in re.split(r"[\s,，。；;、/|]+", q):
        tok = tok.strip()
        if len(tok) < 2:
            continue
        if tok in s:
            score += 3 + min(len(tok), 8)
    if _HELP_HINT.search(query or "") and score == 0:
        score = 1
    return score


def cite(question: str, *, limit_chars: int = 6000) -> dict[str, Any]:
    q = (question or "").strip()
    text, source = load_manual_text()
    if not text:
        return {
            "ok": False,
            "code": "not_ready",
            "count": 0,
            "source": "workbuddy_manual",
            "reply": "本机用户操作手册尚未就绪。请重启应用或执行 ensure_runtime 后再试。",
            "detail": "manual_missing",
        }

    want_all = bool(re.search(r"(全文|整本|完整手册|全部内容)", q))
    sections = _split_sections(text)
    picked: list[str] = []
    if want_all or not q:
        picked = [text]
    else:
        ranked = sorted(
            (( _score(body, q), title, body) for title, body in sections),
            key=lambda x: (-x[0], x[1]),
        )
        useful = [b for sc, _t, b in ranked if sc > 0]
        if not useful:
            # 未命中段落时给目录 + 开头，避免空答
            toc = []
            for title, _body in sections[:24]:
                if title and title != TITLE:
                    toc.append(f"- {title}")
            head = text[:1800]
            picked = [
                "【用户操作手册 · 未精确命中段落，先给目录与开头】\n"
                + ("\n".join(toc) if toc else "")
                + "\n\n"
                + head
            ]
        else:
            picked = useful[:6]

    out = "\n\n----\n\n".join(picked).strip()
    cap = max(800, int(limit_chars or 6000))
    truncated = False
    if len(out) > cap:
        out = out[: cap - 1] + "…"
        truncated = True

    return {
        "ok": True,
        "code": "ok",
        "count": 1,
        "source": "workbuddy_manual",
        "title": TITLE,
        "path": source,
        "truncated": truncated,
        "mount_required": False,
        "reply": f"【本机默认知识库 · 用户操作手册 · 免挂载】\n{out}",
        "detail": "builtin_default_kb",
    }


def status_payload() -> dict[str, Any]:
    text, source = load_manual_text()
    db = _dsh_home() / "knowledge" / "knowledge.sqlite"
    in_db = False
    if db.is_file():
        try:
            uri = "file:" + db.resolve().as_posix() + "?mode=ro"
            conn = sqlite3.connect(uri, uri=True, timeout=5)
            try:
                row = conn.execute(
                    "SELECT 1 FROM knowledge_entries WHERE id=? AND status='active'",
                    (ENTRY_ID,),
                ).fetchone()
                in_db = bool(row)
            finally:
                conn.close()
        except sqlite3.Error:
            in_db = False
    return {
        "ok": bool(text),
        "title": TITLE,
        "entry_id": ENTRY_ID,
        "source": source,
        "in_default_kb": in_db,
        "mount_required": False,
        "chars": len(text or ""),
        "detail": "ready" if text else "missing",
    }


def ensure_seed_soft() -> dict[str, Any]:
    """引擎启动时软写入默认库；失败只记结果不抛。"""
    try:
        # scripts/lib 可能在桌面一体包旁路路径
        import sys

        root = _repo_root()
        lib = root / "scripts" / "lib"
        if lib.is_dir() and str(lib) not in sys.path:
            sys.path.insert(0, str(lib))
        from ensure_local_user_manual import ensure_local_user_manual  # type: ignore

        return ensure_local_user_manual(root=root, do_fix=True)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "detail": f"{type(exc).__name__}: {exc}"}
