# -*- coding: utf-8 -*-
"""§9 P1：开 PR 按托管类型；默认工程目录只认写码配置一处。"""
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


class PrHostingTests(unittest.TestCase):
    def test_svn_is_not_applicable(self):
        from app.dev_pipeline.lane_exec import run_pr

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".svn").mkdir()
            out = run_pr(workspace=tmp, message="测")
        self.assertTrue(out.get("ok"), out)
        self.assertTrue(out.get("skipped") or out.get("not_applicable"), out)
        self.assertIn("SVN", str(out.get("summary") or ""))
        self.assertIn("不适用", str(out.get("summary") or ""))

    def test_gitee_skips_with_manual_hint(self):
        from app.dev_pipeline.lane_exec import run_pr

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".git").mkdir()
            with mock.patch(
                "app.dev_pipeline.lane_exec._git_remote_url",
                return_value="https://gitee.com/org/repo.git",
            ):
                out = run_pr(workspace=tmp, message="测")
        self.assertTrue(out.get("ok"), out)
        self.assertTrue(out.get("skipped"), out)
        text = str(out.get("summary") or "") + str(out.get("detail") or "")
        self.assertTrue("Gitee" in text or "gitee" in text.lower(), out)
        self.assertTrue("手工" in text or "手动" in text, out)

    def test_gitlab_no_glab_skips_with_hint(self):
        from app.dev_pipeline.lane_exec import run_pr

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".git").mkdir()
            with mock.patch(
                "app.dev_pipeline.lane_exec._git_remote_url",
                return_value="https://gitlab.com/group/proj.git",
            ):
                with mock.patch(
                    "app.dev_pipeline.lane_exec.subprocess.run",
                    side_effect=FileNotFoundError("glab"),
                ):
                    out = run_pr(workspace=tmp, message="测")
        self.assertTrue(out.get("ok"), out)
        self.assertTrue(out.get("skipped"), out)
        text = str(out.get("summary") or "")
        self.assertTrue("GitLab" in text or "glab" in text.lower(), out)

    def test_pr_provider_skip_config(self):
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.lane_exec import run_pr

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".git").mkdir()
            orig = dp_cfg.get_config

            def _cfg():
                c = dict(orig())
                c["pr_provider"] = "skip"
                return c

            dp_cfg.get_config = _cfg  # type: ignore[method-assign]
            try:
                out = run_pr(workspace=tmp, message="测")
            finally:
                dp_cfg.get_config = orig  # type: ignore[method-assign]
        self.assertTrue(out.get("ok") and out.get("skipped"), out)
        self.assertIn("配置", str(out.get("summary") or ""))

    def test_detect_provider_github(self):
        from app.dev_pipeline.lane_exec import detect_pr_hosting

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / ".git").mkdir()
            with mock.patch(
                "app.dev_pipeline.lane_exec._git_remote_url",
                return_value="git@github.com:org/repo.git",
            ):
                h = detect_pr_hosting(tmp)
        self.assertEqual(h.get("provider"), "github")


class WorkspaceUnifyTests(unittest.TestCase):
    def test_prefer_code_dev_over_dev_pipeline_default(self):
        """双配置并存时只认写码配置（code_dev），避免两处各写各的。"""
        from app.dev_pipeline import service as svc

        with mock.patch(
            "app.dev_pipeline.service._lane_default_workspace",
            return_value=r"D:\proj\from-code-dev",
        ):
            with mock.patch(
                "app.dev_pipeline.config.get_config",
                return_value={"default_workspace": r"D:\proj\from-pipeline"},
            ):
                got = svc.resolve_workspace("")
        self.assertEqual(got, r"D:\proj\from-code-dev")

    def test_legacy_pipeline_default_when_lanes_empty(self):
        from app.dev_pipeline import service as svc

        with mock.patch(
            "app.dev_pipeline.service._lane_default_workspace",
            return_value="",
        ):
            with mock.patch(
                "app.dev_pipeline.config.get_config",
                return_value={"default_workspace": r"D:\proj\legacy"},
            ):
                got = svc.resolve_workspace("")
        self.assertEqual(got, r"D:\proj\legacy")


if __name__ == "__main__":
    unittest.main()
