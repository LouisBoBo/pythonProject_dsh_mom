"""引擎孤儿 Run 续跑上限与失败文案。"""
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


class OrphanResumeLimitTests(unittest.TestCase):
    def test_reap_allows_up_to_eight_then_cancels(self) -> None:
        from app.dev_pipeline import service as svc
        from app.dev_pipeline import store as dp_store

        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            run = {
                "run_id": "dpj-orphan-resume-ut",
                "status": "running",
                "current_step": "5",
                "engine_resume_count": 7,
                "updated_at": int(time.time()) - 30,
                "created_at": int(time.time()) - 60,
                "steps": [
                    {
                        "step_id": "5",
                        "status": "running",
                        "summary": "写码中",
                        "title": "写代码",
                    }
                ],
            }
            dp_store.save_run(data, run)
            aged = dict(dp_store.load_run(data, "dpj-orphan-resume-ut") or {})
            aged["updated_at"] = int(time.time()) - 30
            with mock.patch("app.dev_pipeline.service.is_runner_alive", return_value=False):
                with mock.patch("app.dev_pipeline.service.start_background") as start_bg:
                    out = svc._reap_orphan_run(data, aged)
                    self.assertTrue(start_bg.called, out)
                    self.assertEqual(out.get("status"), "running")
                    self.assertEqual(int(out.get("engine_resume_count") or 0), 8)

            run2 = dp_store.load_run(data, "dpj-orphan-resume-ut") or {}
            run2["status"] = "running"
            run2["engine_resume_count"] = 8
            for row in run2.get("steps") or []:
                if row.get("step_id") == "5":
                    row["status"] = "running"
            # save_run 会刷新 updated_at；传给 _reap 的副本须故意变旧以越过 3s 宽限
            dp_store.save_run(data, run2)
            aged = dict(dp_store.load_run(data, "dpj-orphan-resume-ut") or {})
            aged["updated_at"] = int(time.time()) - 30
            aged["engine_resume_count"] = 8
            aged["status"] = "running"
            with mock.patch("app.dev_pipeline.service.is_runner_alive", return_value=False):
                with mock.patch("app.dev_pipeline.service.start_background") as start_bg2:
                    out2 = svc._reap_orphan_run(data, aged)
                    self.assertEqual(out2.get("status"), "cancelled", out2)
                    reason = str(out2.get("cancel_reason") or "")
                    self.assertIn("上限（8 次）", reason)
                    self.assertNotIn("引擎多次中断后仍无法续跑", reason)
                    self.assertFalse(start_bg2.called)


if __name__ == "__main__":
    unittest.main()
