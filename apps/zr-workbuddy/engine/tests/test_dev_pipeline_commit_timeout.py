# -*- coding: utf-8 -*-
"""一体化第 8 步：提交墙钟超时软跳过，不拖死流水线。"""
from __future__ import annotations

import os
import sys
import time
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class CommitTimeoutSoftSkipTests(unittest.TestCase):
    def test_run_commit_soft_skips_after_wall_clock(self) -> None:
        from app.dev_pipeline.lane_exec import run_commit

        def _slow_gate(_ws: str):
            time.sleep(3.0)
            return {"ok": False, "can_commit": False, "detail": "不应等到这里"}

        logs: list[str] = []
        with mock.patch("app.code_commit.ops.start_gate", side_effect=_slow_gate):
            out = run_commit(
                workspace=r"d:\fake\ws",
                message="测超时",
                log=logs.append,
                max_attempts=3,
                timeout_sec=1,
            )
        self.assertTrue(out.get("ok"), out)
        self.assertTrue(out.get("skipped"), out)
        self.assertTrue(out.get("can_manual_retry"), out)
        self.assertEqual(out.get("reason"), "commit_timeout_soft_skip")
        self.assertIn("跳过", str(out.get("summary") or ""))
        self.assertIn("手动", str(out.get("summary") or ""))

    def test_config_default_commit_timeout_is_60(self) -> None:
        from app.dev_pipeline.config import get_config

        self.assertEqual(int(get_config().get("commit_timeout_sec") or 0), 60)


if __name__ == "__main__":
    unittest.main()
