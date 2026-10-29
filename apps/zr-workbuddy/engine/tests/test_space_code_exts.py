# -*- coding: utf-8 -*-
"""§13 P1：资料库入库扩展名跟画像语言；仍跳过密钥与库文件。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ResolveCodeExtsTests(unittest.TestCase):
    def test_base_includes_cs_java_kt(self):
        from app.space.code_exts import resolve_code_file_exts

        exts = resolve_code_file_exts(None)
        self.assertIn("cs", exts)
        self.assertIn("java", exts)
        self.assertIn("kt", exts)
        self.assertIn("py", exts)

    def test_profile_languages_add_dart_scala(self):
        from app.space.code_exts import resolve_code_file_exts

        exts = resolve_code_file_exts(
            {"languages": ["Dart", "Scala"], "code_suffixes": [".fs"]}
        )
        self.assertIn("dart", exts)
        self.assertIn("scala", exts)
        self.assertIn("fs", exts)

    def test_blocked_db_and_secrets_never_allowed(self):
        from app.space.code_exts import is_blocked_code_ext, resolve_code_file_exts

        exts = resolve_code_file_exts({"code_suffixes": [".db", ".sqlite", ".pem", ".cs"]})
        self.assertNotIn("db", exts)
        self.assertNotIn("sqlite", exts)
        self.assertNotIn("pem", exts)
        self.assertIn("cs", exts)
        self.assertTrue(is_blocked_code_ext("db"))
        self.assertTrue(is_blocked_code_ext("sqlite3"))


class IngestExtGateTests(unittest.TestCase):
    def test_ingestible_rel_gate(self):
        from app.space.code_exts import is_ingestible_code_rel, resolve_code_file_exts

        allowed = resolve_code_file_exts({"languages": ["C#"]})
        self.assertTrue(is_ingestible_code_rel("Controllers/Home.cs", allowed_exts=allowed))
        self.assertFalse(is_ingestible_code_rel("data/erp.db", allowed_exts=allowed))
        self.assertFalse(is_ingestible_code_rel(".env", allowed_exts=allowed))
        self.assertFalse(is_ingestible_code_rel("config.yaml", allowed_exts=allowed))
        self.assertFalse(is_ingestible_code_rel("secrets/id_rsa", allowed_exts=allowed))


if __name__ == "__main__":
    unittest.main()
