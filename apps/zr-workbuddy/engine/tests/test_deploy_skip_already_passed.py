# -*- coding: utf-8 -*-
"""本 Run 部署已成功时禁止再开第二轮部署。"""
from __future__ import annotations

import os
import sys
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class DeploySkipAlreadyPassedTests(unittest.TestCase):
    def test_step10_skips_when_trace_already_pass(self) -> None:
        from app.dev_pipeline import steps as steps_mod

        run = {
            "run_id": "dpj-skip-redeploy",
            "steps": [
                {"step_id": "7", "status": "pass"},
                {"step_id": "8", "status": "pass"},
                {"step_id": "9", "status": "pass"},
                {"step_id": "10", "status": "pending"},
            ],
            "timeline_trace": [
                {
                    "kind": "step",
                    "step_id": "10",
                    "status": "pass",
                    "summary": "**增量部署完成** · 入口探活通过",
                    "receipt": {
                        "artifacts": {"deploy_job_id": "cd-ok-1"},
                    },
                }
            ],
        }
        epic: dict = {"artifacts": {}}
        with mock.patch.object(steps_mod.dp_config, "get_config", return_value={"auto_run": True}):
            with mock.patch("app.dev_pipeline.lane_exec.run_deploy") as rd:
                out = steps_mod.run_step(
                    "dpj-skip-redeploy",
                    "10",
                    message="x",
                    workspace=r"D:\tmp\proj",
                    epic=epic,
                    run=run,
                )
        self.assertEqual(out.get("status"), "pass", out)
        self.assertIn("跳过重复部署", str(out.get("summary") or ""))
        self.assertFalse(rd.called)


if __name__ == "__main__":
    unittest.main()
