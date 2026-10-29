# -*- coding: utf-8 -*-
"""§6 P1：审码跳过目录 / 附加规范跟画像。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ReviewSkipFromProfileTests(unittest.TestCase):
    def test_csharp_profile_skips_bin_obj(self):
        from app.code_review.profile_scope import resolve_skip_dir_names

        skips = resolve_skip_dir_names(
            {"languages": ["C#"], "layout": {"kind": "dotnet"}}
        )
        self.assertIn("bin", skips)
        self.assertIn("obj", skips)
        self.assertIn("node_modules", skips)  # 基线仍在

    def test_java_profile_skips_target(self):
        from app.code_review.profile_scope import resolve_skip_dir_names

        skips = resolve_skip_dir_names({"languages": ["Java"], "layout": {}})
        self.assertIn("target", skips)

    def test_explicit_review_skip_dirs_merged(self):
        from app.code_review.profile_scope import resolve_skip_dir_names

        skips = resolve_skip_dir_names(
            {
                "languages": ["TypeScript"],
                "review": {"skip_dirs": ["Pods", "DerivedData", "../evil", "/abs"]},
            }
        )
        self.assertIn("Pods", skips)
        self.assertIn("DerivedData", skips)
        self.assertNotIn("../evil", skips)
        self.assertNotIn("/abs", skips)

    def test_list_review_honors_extra_skip(self):
        from app.code_review.local_files import list_review_files

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "src").mkdir()
            (root / "src" / "a.py").write_text("x=1\n", encoding="utf-8")
            (root / "bin").mkdir()
            (root / "bin" / "Gen.cs").write_text("class X {}\n", encoding="utf-8")
            files = list_review_files(
                root,
                skip_dirs=frozenset({"bin", "node_modules", ".git"}),
            )
            paths = [f["path"] for f in files]
            self.assertIn("src/a.py", paths)
            self.assertTrue(all(not p.startswith("bin/") for p in paths), paths)


class ReviewAddonTests(unittest.TestCase):
    def test_addon_includes_conventions_not_replace_security(self):
        from app.code_review.profile_scope import build_project_review_addon

        text = build_project_review_addon(
            {
                "summary_zh": "布局：dotnet；语言：C#",
                "languages": ["C#"],
                "layout": {
                    "view_dirs": ["Views"],
                    "api_dirs": ["Controllers"],
                },
                "conventions": {
                    "readme_excerpt": "请使用 Controllers 分层，禁止把业务写进 Program.cs",
                    "agents_excerpt": "命名用 PascalCase",
                },
            }
        )
        self.assertIn("附加审查条款", text)
        self.assertIn("Controllers", text)
        self.assertIn("PascalCase", text)
        # 不得暗示可替代通用安全清单
        self.assertIn("不替代", text)

    def test_addon_appends_directory_portrait_outside_clip(self) -> None:
        from app.code_review.profile_scope import build_project_review_addon

        text = build_project_review_addon(
            {
                "summary_zh": "布局：frontend_only",
                "languages": ["Vue"],
                "layout": {},
                "conventions": {"readme_excerpt": "约" * 3000},
                "directory": {
                    "roots": [
                        {
                            "path": "src",
                            "name": "src",
                            "role": "源码",
                            "children": [
                                {
                                    "path": "src/modules",
                                    "name": "modules",
                                    "role": "",
                                    "modules": ["orders"],
                                }
                            ],
                        }
                    ]
                },
            }
        )
        self.assertIn("不替代", text)
        self.assertIn("【工作区目录画像】", text)
        self.assertIn("orders", text)

    def test_addon_empty_without_profile(self):
        from app.code_review.profile_scope import build_project_review_addon

        self.assertEqual(build_project_review_addon(None), "")
        self.assertEqual(build_project_review_addon({}), "")


if __name__ == "__main__":
    unittest.main()
