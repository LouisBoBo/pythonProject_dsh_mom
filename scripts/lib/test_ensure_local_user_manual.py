# -*- coding: utf-8 -*-
"""ensure_local_user_manual 单测。"""
from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

import ensure_local_user_manual as elm


def _make_db(path: Path) -> None:
    conn = sqlite3.connect(str(path))
    conn.executescript(
        """
        CREATE TABLE knowledge_bases (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          default_tags_json TEXT NOT NULL,
          extraction_instructions TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          writeback_provider TEXT,
          writeback_model TEXT,
          writeback_policy TEXT,
          group_name TEXT
        );
        INSERT INTO knowledge_bases(
          id,name,description,default_tags_json,extraction_instructions,status,
          created_at,updated_at,writeback_policy,group_name
        ) VALUES(
          'default','默认知识库','','[]','x','active','t','t','conservative',''
        );
        CREATE TABLE knowledge_entries (
          id TEXT PRIMARY KEY,
          knowledge_base_id TEXT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          type TEXT NOT NULL,
          tags_json TEXT NOT NULL,
          scope_kind TEXT NOT NULL,
          scope_id TEXT,
          confidence REAL NOT NULL,
          status TEXT NOT NULL,
          document_state TEXT,
          finalized_at TEXT,
          finalization_note TEXT,
          version INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          source_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE knowledge_documents (
          id TEXT PRIMARY KEY,
          knowledge_base_id TEXT NOT NULL,
          rel_path TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          entry_count INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          document_state TEXT,
          finalized_at TEXT,
          finalization_note TEXT,
          UNIQUE(knowledge_base_id, rel_path)
        );
        CREATE VIRTUAL TABLE knowledge_fts USING fts5(
          knowledge_id UNINDEXED, title, body, tags,
          tokenize = 'unicode61 remove_diacritics 2'
        );
        CREATE TABLE knowledge_versions (
          id TEXT PRIMARY KEY,
          knowledge_id TEXT NOT NULL,
          version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          change_kind TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


class EnsureLocalUserManualTests(unittest.TestCase):
    def test_upsert_and_idempotent(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src_dir = root / "apps" / "zr-workbuddy" / "config" / "builtin-knowledge"
            src_dir.mkdir(parents=True)
            src = src_dir / "用户操作手册.md"
            src.write_text(
                "# 江西中软工作助手 · 用户操作手册\n\n## 登录\n\n打开应用后登录。\n",
                encoding="utf-8",
            )
            dsh = root / "dsh-home"
            db = dsh / "knowledge" / "knowledge.sqlite"
            db.parent.mkdir(parents=True)
            _make_db(db)

            r1 = elm.ensure_local_user_manual(root=root, dsh_home=dsh, do_fix=True)
            self.assertTrue(r1.get("ok"), r1)
            self.assertTrue(r1.get("changed"), r1)
            self.assertTrue((dsh / "knowledge" / "builtin" / "用户操作手册.md").is_file())

            conn = sqlite3.connect(str(db))
            row = conn.execute(
                "SELECT title, body, knowledge_base_id FROM knowledge_entries WHERE id=?",
                (elm.ENTRY_ID,),
            ).fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[2], "default")
            self.assertIn("登录", row[1])
            doc = conn.execute(
                "SELECT rel_path FROM knowledge_documents WHERE id=?",
                (elm.ENTRY_ID,),
            ).fetchone()
            expected_rel = elm.knowledge_document_path(elm.ENTRY_ID, row[0])
            self.assertEqual(doc[0], expected_rel)
            fts = conn.execute(
                "SELECT count(*) FROM knowledge_fts WHERE knowledge_id=?",
                (elm.ENTRY_ID,),
            ).fetchone()[0]
            self.assertEqual(fts, 1)
            conn.close()

            proj = (
                dsh
                / "knowledge"
                / "documents"
                / "base-default"
                / expected_rel
            )
            self.assertTrue(proj.is_file(), "磁盘投影应存在")
            head = proj.read_text(encoding="utf-8")
            self.assertTrue(head.startswith("---\n"), "投影必须带 YAML front matter")
            self.assertIn(f"id: {elm.ENTRY_ID}", head)
            self.assertIn("documentState: open", head)

            # 模拟旧种子：无 front matter → 幂等路径应修复
            proj.write_text("# 坏投影\n\n正文\n", encoding="utf-8")
            r2 = elm.ensure_local_user_manual(root=root, dsh_home=dsh, do_fix=True)
            self.assertTrue(r2.get("ok"), r2)
            self.assertFalse(r2.get("changed"), r2)
            self.assertTrue(r2.get("repaired_projection"), r2)
            fixed = proj.read_text(encoding="utf-8")
            self.assertTrue(fixed.startswith("---\n"), fixed[:80])

            src.write_text(
                "# 江西中软工作助手 · 用户操作手册\n\n## 登录\n\n打开应用后登录。\n\n## 问数\n\n直接问产量。\n",
                encoding="utf-8",
            )
            r3 = elm.ensure_local_user_manual(root=root, dsh_home=dsh, do_fix=True)
            self.assertTrue(r3.get("ok"), r3)
            self.assertTrue(r3.get("changed"), r3)
            conn = sqlite3.connect(str(db))
            body = conn.execute(
                "SELECT body FROM knowledge_entries WHERE id=?",
                (elm.ENTRY_ID,),
            ).fetchone()[0]
            conn.close()
            self.assertIn("问数", body)

    def test_pending_when_db_missing(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src_dir = root / "apps" / "zr-workbuddy" / "config" / "builtin-knowledge"
            src_dir.mkdir(parents=True)
            (src_dir / "用户操作手册.md").write_text("# T\n\nbody\n", encoding="utf-8")
            dsh = root / "dsh-home"
            r = elm.ensure_local_user_manual(root=root, dsh_home=dsh, do_fix=True)
            self.assertTrue(r.get("ok"), r)
            self.assertTrue(r.get("pending_db"), r)
            self.assertTrue((dsh / "knowledge" / "builtin" / "用户操作手册.md").is_file())


if __name__ == "__main__":
    unittest.main()
