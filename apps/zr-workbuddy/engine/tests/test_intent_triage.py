# -*- coding: utf-8 -*-
"""问数上下文里的工程背景：缺失则空，有画像也不改查数口径。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class IntentTriageTests(unittest.TestCase):
    def test_empty_profile_adds_nothing(self) -> None:
        from app.intent_triage import format_ask_hint

        self.assertEqual(format_ask_hint(None), "")
        self.assertEqual(format_ask_hint({}), "")
        self.assertEqual(format_ask_hint({"summary_zh": "  "}), "")

    def test_hint_is_background_only(self) -> None:
        from app.intent_triage import format_ask_hint

        profile = {
            "summary_zh": "\n".join(
                [
                    "布局：vite_backend",
                    "语言：JavaScript、Python",
                    "前端：Vue、Element Plus",
                    "后端：FastAPI",
                    "托管：Git",
                    "页面目录：src/views/warehouse",
                    "验证：. → npm test",
                ]
            )
        }
        text = format_ask_hint(profile)
        self.assertIn("布局：vite_backend", text)
        self.assertIn("前端：Vue、Element Plus", text)
        self.assertIn("不改变查数规则", text)
        self.assertNotIn("src/views/warehouse", text)
        self.assertNotIn("npm test", text)
        self.assertNotIn("mes_code_dev_begin", text)
        self.assertNotIn("kind=code_dev", text)
        self.assertLessEqual(len(text), 500)

    def test_missing_cache_keeps_ask_context(self) -> None:
        import tempfile

        from app.intent_triage import append_ask_hint

        os.environ["WORKBUDDY_PROJECT_PROFILE_DIR"] = tempfile.mkdtemp(prefix="wb-triage-")
        try:
            base = "数据源：MES 实时。查数必须 kind=query。"
            self.assertEqual(append_ask_hint(base, ""), base)
            self.assertEqual(append_ask_hint(base, r"D:\no\such\workspace"), base)
        finally:
            os.environ.pop("WORKBUDDY_PROJECT_PROFILE_DIR", None)
