# -*- coding: utf-8 -*-
"""把《用户操作手册》预置进知识库插件的本机「默认知识库」。

- 打开应用 / ensure_runtime / ensure_dsh_knowledge 时自动写入，无需用户上传。
- 落点：~$DSH_HOME/knowledge/knowledge.sqlite（base id=default）。
- 免挂载召回由引擎 builtin_manual + feature / systemPrompt 负责；本脚本只管入库可见。
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import sys
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ENTRY_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479"
BASE_ID = "default"
TITLE = "江西中软工作助手 · 用户操作手册"
TAGS = ["workbuddy-builtin", "user-manual", "procedure"]
DOC_TYPE = "procedure"


def knowledge_document_path(entry_id: str, title: str) -> str:
    """对齐 dsh-knowledge `documents/path.js` knowledgeDocumentPath。"""
    stem = unicodedata.normalize("NFKC", (title or "").strip())
    stem = re.sub(r'[<>:"/\\|?*\x00-\x1f]+', "-", stem)
    stem = re.sub(r"\s+", "-", stem)
    stem = re.sub(r"^-+|-+$", "", stem)[:72] or "untitled"
    suffix = re.sub(r"[^a-zA-Z0-9]", "", entry_id)[:8] or "document"
    return f"{stem}--{suffix}.md"


# 与插件按标题生成的托管文件名一致（标题含「·」时路径里会保留）
REL_PATH = knowledge_document_path(ENTRY_ID, TITLE)
SOURCE = {
    "kind": "imported-file",
    "filename": "用户操作手册.md",
    "mediaType": "text/markdown",
    "workbuddyBuiltin": True,
}

_HERE = Path(__file__).resolve().parent
_REPO = _HERE.parents[1]


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def repo_root() -> Path:
    env = (os.environ.get("WORKBUDDY_ROOT") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    return _REPO


def resolve_manual_source(root: Path | None = None) -> Path | None:
    """优先打包路径，其次文档知识库路径。"""
    root = root or repo_root()
    candidates = [
        root / "apps" / "zr-workbuddy" / "config" / "builtin-knowledge" / "用户操作手册.md",
        root / "Framework" / "docs" / "产品与口径" / "用户操作手册.md",
    ]
    for p in candidates:
        if p.is_file():
            return p
    return None


def resolve_dsh_home(profile: Path | None = None) -> Path:
    env = (os.environ.get("DSH_HOME") or "").strip()
    if env:
        return Path(env).expanduser().resolve()
    if profile is not None:
        profile = profile.expanduser().resolve()
        if profile.parent.name == "profiles":
            return profile.parent.parent
        return profile.parent
    return (Path.home() / ".dsh").resolve()


def knowledge_sqlite(dsh_home: Path) -> Path:
    return dsh_home / "knowledge" / "knowledge.sqlite"


def _split_title_body(raw: str) -> tuple[str, str]:
    text = (raw or "").replace("\r\n", "\n").strip()
    if not text:
        raise ValueError("用户操作手册为空")
    lines = text.split("\n")
    title = TITLE
    body_lines = lines
    if lines and lines[0].lstrip().startswith("#"):
        heading = re.sub(r"^#+\s*", "", lines[0]).strip()
        if heading:
            title = heading[:200]
        body_lines = lines[1:]
        while body_lines and not body_lines[0].strip():
            body_lines = body_lines[1:]
    body = "\n".join(body_lines).strip()
    if not body:
        body = text
    if len(body) > 50000:
        raise ValueError(f"用户操作手册正文过长（{len(body)} > 50000），无法写入知识库条目上限")
    if len(title) > 200:
        title = title[:200]
    return title, body


def _entry_content_hash(title: str, body: str) -> str:
    payload = {
        "knowledgeBaseId": BASE_ID,
        "title": title.lower(),
        "body": body.lower(),
        "type": DOC_TYPE,
        "tags": sorted({t.strip().lower() for t in TAGS if t.strip()}),
        "scope": {"kind": "global"},
    }
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def _normalize_lf(text: str) -> str:
    return (text or "").replace("\r\n", "\n").replace("\r", "\n")


def _markdown_heading(title: str) -> str:
    return re.sub(r"[\r\n]+", " ", title).replace("#", "").strip()


def _doc_content(title: str, body: str) -> str:
    """knowledge_documents.content 投影正文（无 front matter，与插件 renderEntryContent 一致）。"""
    return f"# {_markdown_heading(title)}\n\n{body.strip()}\n"


def _render_managed_markdown(title: str, body: str, *, tags: list[str]) -> str:
    """磁盘托管 Markdown：必须带 YAML front matter，否则插件 listDocuments/sync 会抛 INTERNAL。

    对齐 @zhongruan/dsh-knowledge `renderKnowledgeMarkdown` 字段（lineWidth:0 的常见形态）。
    """
    # tags 空列表时 yaml 常用 []；非空用块序列，对齐插件 stringify
    if tags:
        tags_block = "\n".join(f"  - {t}" for t in tags)
        tags_yaml = f"tags:\n{tags_block}"
    else:
        tags_yaml = "tags: []"
    fm = (
        f"id: {ENTRY_ID}\n"
        f"type: {DOC_TYPE}\n"
        f"{tags_yaml}\n"
        f"scope:\n"
        f"  kind: global\n"
        f"confidence: 0.95\n"
        f"status: active\n"
        f"documentState: open\n"
    )
    md = (
        f"---\n{fm}---\n\n"
        f"# {_markdown_heading(title)}\n\n"
        f"{body.strip()}\n"
    )
    return _normalize_lf(md)


def _doc_file_hash(content: str) -> str:
    """与插件 markdownHash 一致：先归一换行再 sha256。"""
    return hashlib.sha256(_normalize_lf(content).encode("utf-8")).hexdigest()


def _projection_needs_repair(path: Path) -> bool:
    if not path.is_file():
        return True
    try:
        head = path.read_text(encoding="utf-8")[:64]
    except OSError:
        return True
    return not _normalize_lf(head).startswith("---\n")

def _connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=30)
    conn.execute("PRAGMA busy_timeout=30000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _ensure_default_base(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT id FROM knowledge_bases WHERE id=?", (BASE_ID,)).fetchone()
    if row:
        return
    ts = _now_iso()
    cols = [r[1] for r in conn.execute("PRAGMA table_info(knowledge_bases)")]
    if "group_name" in cols:
        conn.execute(
            """
            INSERT INTO knowledge_bases(
              id,name,description,default_tags_json,extraction_instructions,status,
              created_at,updated_at,writeback_provider,writeback_model,writeback_policy,group_name
            ) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,'conservative','')
            """,
            (
                BASE_ID,
                "默认知识库",
                "",
                "[]",
                "仅收录可跨会话复用、且与当前挂载范围相关的知识。",
                "active",
                ts,
                ts,
            ),
        )
    else:
        conn.execute(
            """
            INSERT INTO knowledge_bases(
              id,name,description,default_tags_json,extraction_instructions,status,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?)
            """,
            (
                BASE_ID,
                "默认知识库",
                "",
                "[]",
                "仅收录可跨会话复用、且与当前挂载范围相关的知识。",
                "active",
                ts,
                ts,
            ),
        )


def _write_projection(
    dsh_home: Path,
    managed_markdown: str,
    *,
    rel_path: str,
) -> str | None:
    """写入带 YAML front matter 的托管文档；失败不挡入库。"""
    try:
        base_dir = dsh_home / "knowledge" / "documents" / f"base-{BASE_ID}"
        base_dir.mkdir(parents=True, exist_ok=True)
        path = base_dir / rel_path
        with path.open("w", encoding="utf-8", newline="\n") as fh:
            fh.write(_normalize_lf(managed_markdown))
        # 清掉旧种子用过的错误文件名（缺「·」等），避免双文件同 id 干扰 sync
        legacy = base_dir / "江西中软工作助手-用户操作手册--f47ac10b.md"
        if legacy.resolve() != path.resolve() and legacy.is_file():
            try:
                legacy.unlink()
            except OSError:
                pass
        return str(path)
    except OSError:
        return None


def _copy_builtin_file(dsh_home: Path, src: Path) -> Path:
    dest_dir = dsh_home / "knowledge" / "builtin"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / "用户操作手册.md"
    dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
    return dest


def upsert_manual_into_sqlite(
    db_path: Path,
    *,
    title: str,
    body: str,
    dsh_home: Path | None = None,
) -> dict[str, Any]:
    if not db_path.is_file():
        return {"ok": False, "skipped": True, "detail": f"尚无知识库库文件：{db_path}（首次打开知识库插件后会自动再建）"}

    tags = sorted({t.strip().lower() for t in TAGS if t.strip()})
    tags_json = json.dumps(tags, ensure_ascii=False)
    source_json = json.dumps(SOURCE, ensure_ascii=False)
    content_hash = _entry_content_hash(title, body)
    rel_path = knowledge_document_path(ENTRY_ID, title)
    # DB 正文投影无 FM；磁盘托管文件必须有 FM（插件 sync/listDocuments 硬要求）
    content = _normalize_lf(_doc_content(title, body))
    managed_markdown = _render_managed_markdown(title, body, tags=tags)
    projected_hash = _doc_file_hash(managed_markdown)
    ts = _now_iso()
    proj_path = (
        (dsh_home / "knowledge" / "documents" / f"base-{BASE_ID}" / rel_path)
        if dsh_home is not None
        else None
    )

    conn = _connect(db_path)
    try:
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        need = {"knowledge_bases", "knowledge_entries", "knowledge_documents", "knowledge_fts", "knowledge_versions"}
        if not need.issubset(tables):
            return {
                "ok": False,
                "skipped": True,
                "detail": "知识库库表未就绪（请先成功启动一次带知识库插件的聊天壳）",
            }

        _ensure_default_base(conn)
        existing = conn.execute(
            "SELECT id, content_hash, version FROM knowledge_entries WHERE id=?",
            (ENTRY_ID,),
        ).fetchone()

        if existing and str(existing[1] or "") == content_hash:
            # 条目未变：仍须修好坏投影（缺 front matter 会导致整库 API 500）
            repaired = False
            if dsh_home is not None:
                need_file = proj_path is None or _projection_needs_repair(proj_path)
                if need_file:
                    repaired = True
                _write_projection(dsh_home, managed_markdown, rel_path=rel_path)
            doc_row = conn.execute(
                "SELECT content_hash, rel_path FROM knowledge_documents WHERE id=?",
                (ENTRY_ID,),
            ).fetchone()
            if (
                not doc_row
                or str(doc_row[0] or "") != projected_hash
                or str(doc_row[1] or "") != rel_path
            ):
                conn.execute(
                    """
                    UPDATE knowledge_documents SET
                      content=?, content_hash=?, title=?, rel_path=?,
                      document_state='open', updated_at=?
                    WHERE id=?
                    """,
                    (content, projected_hash, title, rel_path, ts, ENTRY_ID),
                )
                conn.commit()
                repaired = True
            return {
                "ok": True,
                "changed": False,
                "repaired_projection": repaired,
                "entry_id": ENTRY_ID,
                "rel_path": rel_path,
                "detail": (
                    "用户操作手册已在默认知识库且内容一致；已修复磁盘投影 front matter"
                    if repaired
                    else "用户操作手册已在默认知识库且内容一致"
                ),
            }

        version = 1
        if existing:
            version = int(existing[2] or 1) + 1
            conn.execute(
                """
                UPDATE knowledge_entries SET
                  knowledge_base_id=?, title=?, body=?, type=?, tags_json=?,
                  scope_kind='global', scope_id=NULL, confidence=0.95, status='active',
                  document_state='open', finalized_at=NULL, finalization_note=NULL,
                  version=?, content_hash=?, source_json=?, updated_at=?
                WHERE id=?
                """,
                (
                    BASE_ID,
                    title,
                    body,
                    DOC_TYPE,
                    tags_json,
                    version,
                    content_hash,
                    source_json,
                    ts,
                    ENTRY_ID,
                ),
            )
            change_kind = "update"
        else:
            # 若同 rel_path 残留旧 id，先清掉，避免 UNIQUE(knowledge_base_id, rel_path)
            old_doc = conn.execute(
                "SELECT id FROM knowledge_documents WHERE knowledge_base_id=? AND rel_path=?",
                (BASE_ID, rel_path),
            ).fetchone()
            if old_doc and str(old_doc[0]) != ENTRY_ID:
                oid = str(old_doc[0])
                conn.execute("DELETE FROM knowledge_fts WHERE knowledge_id=?", (oid,))
                conn.execute("DELETE FROM knowledge_versions WHERE knowledge_id=?", (oid,))
                conn.execute("DELETE FROM knowledge_documents WHERE id=?", (oid,))
                conn.execute("DELETE FROM knowledge_entries WHERE id=?", (oid,))
            conn.execute(
                """
                INSERT INTO knowledge_entries(
                  id,knowledge_base_id,title,body,type,tags_json,scope_kind,scope_id,confidence,status,
                  document_state,finalized_at,finalization_note,version,content_hash,source_json,created_at,updated_at
                ) VALUES(?,?,?,?,?,?, 'global', NULL, 0.95, 'active', 'open', NULL, NULL, ?, ?, ?, ?, ?)
                """,
                (
                    ENTRY_ID,
                    BASE_ID,
                    title,
                    body,
                    DOC_TYPE,
                    tags_json,
                    version,
                    content_hash,
                    source_json,
                    ts,
                    ts,
                ),
            )
            change_kind = "create"

        conn.execute("DELETE FROM knowledge_fts WHERE knowledge_id=?", (ENTRY_ID,))
        conn.execute(
            "INSERT INTO knowledge_fts(knowledge_id,title,body,tags) VALUES(?,?,?,?)",
            (ENTRY_ID, title, body, " ".join(tags)),
        )

        snapshot = {
            "knowledgeBaseId": BASE_ID,
            "title": title,
            "body": body,
            "type": DOC_TYPE,
            "tags": tags,
            "scope": {"kind": "global"},
            "confidence": 0.95,
            "source": SOURCE,
            "status": "active",
            "documentState": "open",
        }
        conn.execute(
            """
            INSERT INTO knowledge_versions(id,knowledge_id,version,snapshot_json,change_kind,created_at)
            VALUES(?,?,?,?,?,?)
            """,
            (str(uuid.uuid4()), ENTRY_ID, version, json.dumps(snapshot, ensure_ascii=False), change_kind, ts),
        )

        conn.execute(
            """
            INSERT INTO knowledge_documents(
              id,knowledge_base_id,rel_path,title,content,entry_count,content_hash,
              document_state,finalized_at,finalization_note,created_at,updated_at
            ) VALUES(?,?,?,?,?,1,?,?,NULL,NULL,?,?)
            ON CONFLICT(id) DO UPDATE SET
              knowledge_base_id=excluded.knowledge_base_id,
              rel_path=excluded.rel_path,
              title=excluded.title,
              content=excluded.content,
              entry_count=excluded.entry_count,
              content_hash=excluded.content_hash,
              document_state=excluded.document_state,
              finalized_at=excluded.finalized_at,
              finalization_note=excluded.finalization_note,
              updated_at=excluded.updated_at
            """,
            (
                ENTRY_ID,
                BASE_ID,
                rel_path,
                title,
                content,
                projected_hash,
                "open",
                ts,
                ts,
            ),
        )
        conn.commit()
    except sqlite3.Error as exc:
        conn.rollback()
        return {"ok": False, "detail": f"写入知识库失败: {type(exc).__name__}: {exc}"}
    finally:
        conn.close()

    proj = None
    if dsh_home is not None:
        proj = _write_projection(dsh_home, managed_markdown, rel_path=rel_path)
    return {
        "ok": True,
        "changed": True,
        "entry_id": ENTRY_ID,
        "rel_path": rel_path,
        "projection": proj,
        "detail": "已写入本机默认知识库：用户操作手册",
    }


def ensure_local_user_manual(
    *,
    profile: Path | None = None,
    root: Path | None = None,
    dsh_home: Path | None = None,
    do_fix: bool = True,
) -> dict[str, Any]:
    root = root or repo_root()
    src = resolve_manual_source(root)
    if src is None:
        return {
            "ok": False,
            "detail": "找不到用户操作手册源文件（apps/.../builtin-knowledge 或 Framework/docs）",
        }
    title, body = _split_title_body(src.read_text(encoding="utf-8"))
    home = dsh_home or resolve_dsh_home(profile)
    home.mkdir(parents=True, exist_ok=True)
    builtin_copy = _copy_builtin_file(home, src) if do_fix else home / "knowledge" / "builtin" / "用户操作手册.md"
    db_path = knowledge_sqlite(home)
    if not do_fix:
        return {
            "ok": db_path.is_file(),
            "detail": f"源={src}；库={db_path}；builtin={builtin_copy}",
            "source": str(src),
            "db": str(db_path),
        }
    result = upsert_manual_into_sqlite(db_path, title=title, body=body, dsh_home=home)
    result["source"] = str(src)
    result["builtin_copy"] = str(builtin_copy)
    result["db"] = str(db_path)
    if result.get("skipped") and not result.get("ok"):
        # 库尚未创建：至少落盘 builtin 副本，引擎免挂载仍可读
        result["ok"] = True
        result["pending_db"] = True
        result["detail"] = (
            str(result.get("detail") or "")
            + "；已写入 knowledge/builtin/用户操作手册.md，知识库首次启动后再入库"
        )
    return result


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description="预置用户操作手册到本机默认知识库")
    ap.add_argument("--profile", type=Path, default=None, help="~/.dsh/profiles/web")
    ap.add_argument("--root", type=Path, default=None)
    ap.add_argument("--fix", action="store_true", default=True)
    ap.add_argument("--check", action="store_true", help="只检查不写")
    args = ap.parse_args()
    res = ensure_local_user_manual(
        profile=args.profile,
        root=args.root,
        do_fix=not args.check,
    )
    print(json.dumps(res, ensure_ascii=False, indent=2))
    return 0 if res.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
