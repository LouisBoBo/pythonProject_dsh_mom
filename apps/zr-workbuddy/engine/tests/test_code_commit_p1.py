# -*- coding: utf-8 -*-
"""§7 P1：保护分支/远端/默认推送来自配置；门禁修复走对话写码。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ProtectedBranchesConfigTests(unittest.TestCase):
    def test_validate_branch_uses_config_list(self):
        from app.code_commit.git_ops import validate_branch_name

        with mock.patch(
            "app.code_commit.git_ops.get_protected_branches",
            return_value=frozenset({"release", "main"}),
        ):
            self.assertFalse(validate_branch_name("release")[0])
            self.assertFalse(validate_branch_name("team/release")[0])
            # master 不在本配置 → 允许（配置驱动）
            self.assertTrue(validate_branch_name("master")[0])
            self.assertTrue(validate_branch_name("feature/ok")[0])

    def test_config_reads_protected_remote_push(self):
        from app.code_commit import config as cc_cfg

        with mock.patch(
            "app.code_commit.config.load_config",
            return_value={
                "code_commit": {
                    "protected_branches": ["main", "release"],
                    "remote_name": "upstream",
                    "default_push": False,
                }
            },
        ):
            c = cc_cfg.get_config()
        self.assertEqual(c.remote_name, "upstream")
        self.assertFalse(c.default_push)
        self.assertIn("release", [x.lower() for x in c.protected_branches])
        self.assertIn("main", [x.lower() for x in c.protected_branches])


class GateFixCursorChatTests(unittest.TestCase):
    def test_prepare_fix_requires_chat_not_code_dev(self):
        from app.code_commit.ops import prepare_fix_from_gate
        from app.code_commit.store import save_job

        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            job = {
                "id": "cc-p1fix",
                "status": "blocked",
                "workspace": str(data / "proj"),
                "work_branch": "feature/fix",
                "findings": [
                    {
                        "severity": "P0",
                        "path": "a.py",
                        "message": "发现 eval",
                        "blocking": True,
                    }
                ],
                "files": ["a.py"],
            }
            (data / "proj").mkdir(parents=True, exist_ok=True)
            save_job(data, job)

            with mock.patch("app.code_commit.ops.default_data_dir", return_value=data):
                with mock.patch(
                    "app.coding_mutex.is_dsh_cursor_chat_enabled",
                    return_value=False,
                ):
                    with mock.patch(
                        "app.plugins_store.require_enabled",
                        return_value={"ok": False, "detail": "不应检查 code-dev"},
                    ) as req:
                        out = prepare_fix_from_gate(job_id="cc-p1fix")
            self.assertFalse(out.get("ok"), out)
            self.assertIn("对话写码", out.get("reply") or out.get("detail") or "")
            req.assert_not_called()

    def test_prepare_fix_hands_off_to_zr_cchat(self):
        from app.code_commit.ops import prepare_fix_from_gate
        from app.code_commit.store import save_job

        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            job = {
                "id": "cc-p1fix2",
                "status": "blocked",
                "workspace": str(data / "proj"),
                "work_branch": "feature/fix",
                "findings": [
                    {
                        "severity": "P0",
                        "path": "a.py",
                        "message": "发现 eval",
                        "blocking": True,
                    }
                ],
                "files": ["a.py"],
            }
            (data / "proj").mkdir(parents=True, exist_ok=True)
            save_job(data, job)

            with mock.patch("app.code_commit.ops.default_data_dir", return_value=data):
                with mock.patch(
                    "app.coding_mutex.is_dsh_cursor_chat_enabled",
                    return_value=True,
                ):
                    out = prepare_fix_from_gate(job_id="cc-p1fix2")
            self.assertTrue(out.get("ok"), out)
            self.assertEqual(out.get("coding_begin"), "zr_cchat_begin")
            self.assertIn("a.py", out.get("requirement") or "")
            # 禁止再走 code-dev 确认卡
            self.assertFalse(out.get("code_dev_ui"))
            self.assertEqual(out.get("intent", {}).get("type"), "cursor_chat")


if __name__ == "__main__":
    unittest.main()
