# -*- coding: utf-8 -*-
"""资料库全屏预览不得用 inline display:flex 盖掉 hidden（否则登录页被白屏挡住）。"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

HTML = Path(__file__).resolve().parents[1] / "app" / "static" / "index.html"


class SpaceFsHiddenTests(unittest.TestCase):
    def test_hidden_beats_flex_overlay(self):
        html = HTML.read_text(encoding="utf-8")
        self.assertRegex(
            html,
            r"\[hidden\]\s*\{\s*display:\s*none\s*!important",
            "必须有 [hidden] { display: none !important }，否则 UA 的 hidden 会被 inline flex 盖掉",
        )
        m = re.search(r"<div id=\"spaceFs\"[^>]*>", html)
        self.assertIsNotNone(m, "缺少 #spaceFs")
        tag = m.group(0)
        self.assertIn("hidden", tag)
        self.assertIsNone(
            re.search(r'style="[^"]*display\s*:\s*flex', tag),
            "spaceFs 的 style 里不能写 display:flex（会盖掉 hidden，启动只剩「下载 .md」）",
        )


if __name__ == "__main__":
    unittest.main()
