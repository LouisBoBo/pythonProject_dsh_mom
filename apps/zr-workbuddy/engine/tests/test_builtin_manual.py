# -*- coding: utf-8 -*-
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app import builtin_manual as bm


class BuiltinManualTests(unittest.TestCase):
    def test_cite_sections(self):
        text = (
            "# 手册\n\n"
            "## 登录\n\n打开应用后填账号密码登录。\n\n"
            "## 问数\n\n直接用中文问产量。\n"
        )
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "用户操作手册.md"
            p.write_text(text, encoding="utf-8")
            with mock.patch.object(bm, "resolve_manual_paths", return_value=[p]):
                out = bm.cite("怎么登录")
            self.assertTrue(out.get("ok"), out)
            self.assertIn("登录", out.get("reply") or "")
            self.assertFalse(out.get("mount_required"))

    def test_status_missing(self):
        with mock.patch.object(bm, "resolve_manual_paths", return_value=[Path("/no/such.md")]):
            with mock.patch.object(bm, "_dsh_home", return_value=Path(tempfile.mkdtemp())):
                st = bm.status_payload()
        self.assertFalse(st.get("ok"))


if __name__ == "__main__":
    unittest.main()
