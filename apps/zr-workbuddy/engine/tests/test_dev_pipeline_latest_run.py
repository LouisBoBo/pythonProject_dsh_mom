# -*- coding: utf-8 -*-
"""本会话 latest-run API：历史过程流卡对齐引擎落盘。"""
from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class LatestRunTests(unittest.TestCase):
    def test_latest_run_returns_finished(self) -> None:
        from app.dev_pipeline import store as dp_store
        from app.dev_pipeline.service import get_latest_run

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            sid = "session-latest-done"
            run = {
                "run_id": "dpj-latest001",
                "dsh_session_id": sid,
                "status": "cancelled",
                "outcome": "cancelled",
                "current_step": "1",
                "created_at": int(time.time()) - 100,
                "updated_at": int(time.time()) - 50,
                "steps": [
                    {
                        "step_id": "1",
                        "title": "采集",
                        "status": "cancelled",
                        "summary": "已停止",
                    }
                ],
            }
            dp_store.save_run(data, run)
            with mock.patch(
                "app.dev_pipeline.store.default_data_dir", return_value=data
            ):
                out = get_latest_run(dsh_session_id=sid)
            self.assertTrue(out.get("ok"), out)
            self.assertIsNotNone(out.get("run"))
            self.assertEqual(out["run"]["run_id"], "dpj-latest001")
            ui = out.get("dev_pipeline_ui") or {}
            self.assertEqual(ui.get("status"), "cancelled")
            self.assertEqual(ui.get("dsh_session_id"), sid)
            self.assertIn("run_summary", ui)

    def test_latest_run_empty_session(self) -> None:
        from app.dev_pipeline.service import get_latest_run

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            with mock.patch(
                "app.dev_pipeline.store.default_data_dir", return_value=data
            ):
                out = get_latest_run(dsh_session_id="session-none")
            self.assertTrue(out.get("ok"), out)
            self.assertIsNone(out.get("run"))


if __name__ == "__main__":
    unittest.main()
