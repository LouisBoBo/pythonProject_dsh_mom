# -*- coding: utf-8 -*-
"""步骤 6 验证：画像优先；探不到标「未验证」，禁止轻量假绿。"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ValidateUnverifiedTests(unittest.TestCase):
    def test_empty_repo_is_unverified_not_fake_pass(self):
        from app.dev_pipeline.validate import run_validate_commands

        with tempfile.TemporaryDirectory() as tmp:
            # 空目录：无 package / py / pom / go / git
            with mock.patch(
                "app.dev_pipeline.validate.get_config",
                return_value={"validate_commands": [], "validate_timeout_sec": 30},
            ):
                out = run_validate_commands(tmp)
        self.assertTrue(out.get("unverified") or out.get("skipped"), out)
        self.assertIn("未验证", str(out.get("summary") or ""))
        # 不得再报「轻量通过」
        self.assertNotIn("轻量通过", str(out.get("summary") or ""))

    def test_auto_detects_frontend_package_scripts(self):
        from app.dev_pipeline.validate import _auto_validate_commands

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fe = root / "frontend"
            fe.mkdir()
            (fe / "package.json").write_text(
                json.dumps({"scripts": {"lint": "eslint ."}}),
                encoding="utf-8",
            )
            cmds = _auto_validate_commands(root)
        names = [c.get("name") for c in cmds]
        self.assertIn("frontend-npm-lint", names)

    def test_step6_unverified_is_skipped_not_pass(self):
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.steps import run_step

        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp)
            orig = dp_cfg.get_config

            def _cfg():
                c = dict(orig())
                c["validate_commands"] = []
                return c

            dp_cfg.get_config = _cfg  # type: ignore[method-assign]
            try:
                with mock.patch(
                    "app.dev_pipeline.validate.ensure_project_profile",
                    create=True,
                ):
                    # force no profile cmds via patching ensure inside validate
                    with mock.patch(
                        "app.project_profile.ensure",
                        return_value={"ok": True, "profile": {"validate_commands": []}},
                    ):
                        rec = run_step(
                            "dpj-test-unverified",
                            "6",
                            message="x",
                            workspace=str(ws),
                            epic={"artifacts": {}},
                            run={
                                "workspace": str(ws),
                                "steps": [
                                    {"step_id": "5", "status": "pass"},
                                    {"step_id": "6", "status": "pending"},
                                ],
                            },
                        )
                self.assertEqual(rec.get("status"), "skipped", rec)
                self.assertIn("未验证", str(rec.get("summary") or ""))
            finally:
                dp_cfg.get_config = orig  # type: ignore[method-assign]


class MenuPathGenericTests(unittest.TestCase):
    def test_pick_menu_path_does_not_invent_warehouse_page(self):
        from app.dev_pipeline.vision_surface import _pick_menu_path

        # 用户未写菜单名时：不要默认猜「仓储管理 / 低库存预警」
        self.assertEqual(_pick_menu_path("做一个低库存预警页面"), "")
        # 用户写了菜单才锚定菜单本身，不拼接假页面名
        out = _pick_menu_path("在仓储管理菜单下新增低库存预警")
        self.assertEqual(out, "仓储管理")

    def test_pick_menu_path_accepts_any_project_label(self):
        from app.dev_pipeline.vision_surface import _pick_menu_path

        self.assertEqual(
            _pick_menu_path("- 菜单/导航路径：财务中心 / 发票列表"),
            "财务中心",
        )
        self.assertEqual(_pick_menu_path("- 菜单/导航路径：未见"), "")


class MenuAnchorGenericTests(unittest.TestCase):
    def test_extract_menu_anchor_any_project(self):
        from app.dev_pipeline.requirement_scope import extract_menu_anchor

        self.assertEqual(extract_menu_anchor("菜单：客户运营"), "客户运营")
        self.assertEqual(extract_menu_anchor("在客户运营菜单下新增账单页"), "客户运营")
        self.assertEqual(extract_menu_anchor("客户运营菜单新增账单页"), "客户运营")
        self.assertEqual(extract_menu_anchor("做一个报表页面"), "")
        self.assertEqual(extract_menu_anchor("在仓储管理菜单下新增低库存预警"), "仓储管理")
        # 禁止把「打开系统设置菜单」整段当菜单名
        self.assertEqual(extract_menu_anchor("打开系统设置菜单看看"), "系统设置")
        self.assertNotEqual(extract_menu_anchor("打开财务中心菜单"), "打开财务中心")
        self.assertEqual(extract_menu_anchor("打开财务中心菜单"), "")

    def test_intake_prompt_forbids_default_menus(self):
        from app.dev_pipeline.prd_llm import _SYSTEM
        from app.vision.service import REQ_INTAKE_PROMPT

        self.assertIn("禁止假设或默认写成「生产管理」「仓储管理」", REQ_INTAKE_PROMPT)
        self.assertIn("禁止默认假设为「生产管理」「仓储管理」", _SYSTEM)


if __name__ == "__main__":
    unittest.main()
