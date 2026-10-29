# -*- coding: utf-8 -*-
"""Cursor 写码配置：不依赖 :18788 插件进程。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock
import os
import sys

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class CursorCodingStoreTests(unittest.TestCase):
    def test_save_masks_key_and_keeps_file(self):
        from app import cursor_coding_store as store

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(store, "data_root", lambda: root), mock.patch.object(
                store, "_sync_engine_code_dev_key"
            ), mock.patch.object(store, "_sync_cursor_chat_key"):
                out = store.save_public(
                    {
                        "cursorApiKey": "crsr_test_abc",
                        "port": 18788,
                        "writeScopeText": "src/\napps/",
                    }
                )
                self.assertTrue(out.get("ok"))
                cfg = out.get("config") or {}
                self.assertTrue(cfg.get("cursorKeyConfigured"))
                blob = json.dumps(out, ensure_ascii=False)
                self.assertNotIn("crsr_test_abc", blob)
                on_disk = json.loads((root / "config.json").read_text(encoding="utf-8"))
                self.assertEqual(on_disk.get("cursorApiKey"), "crsr_test_abc")
                self.assertEqual(on_disk.get("writeScope"), ["src/", "apps/"])

                again = store.save_public({"cursorApiKey": "••••••••", "port": 18788})
                on_disk2 = json.loads((root / "config.json").read_text(encoding="utf-8"))
                self.assertEqual(on_disk2.get("cursorApiKey"), "crsr_test_abc")
                self.assertTrue((again.get("config") or {}).get("cursorKeyConfigured"))

    def test_public_config_without_file(self):
        from app import cursor_coding_store as store

        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(store, "data_root", lambda: Path(td)):
                cfg = store.public_config()
                self.assertFalse(cfg.get("cursorKeyConfigured"))
                self.assertEqual(cfg.get("port"), 18788)

    def test_sync_cursor_chat_migrates_off_automations_port(self):
        from app import cursor_coding_store as store

        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            chat_dir = home / ".zhongruan" / "cursor-chat"
            chat_dir.mkdir(parents=True)
            cfg_path = chat_dir / "config.json"
            cfg_path.write_text(
                json.dumps(
                    {
                        "cursorApiKey": "old",
                        "listen": "127.0.0.1",
                        "port": 18789,
                        "dataRoot": str(chat_dir),
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            with mock.patch.object(store.Path, "home", return_value=home):
                store._sync_cursor_chat_key("crsr_new_key", write_scope=["src/"], model="composer-2.5")
            on_disk = json.loads(cfg_path.read_text(encoding="utf-8"))
            self.assertEqual(on_disk.get("cursorApiKey"), "crsr_new_key")
            self.assertEqual(on_disk.get("port"), 18791)
            self.assertEqual(on_disk.get("listen"), "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
