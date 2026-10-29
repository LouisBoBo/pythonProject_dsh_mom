# -*- coding: utf-8 -*-
"""dev-pipeline 终态总结正文。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ClosingNarrativeTests(unittest.TestCase):
    def test_success_closing_has_conclusion_highlights_verify(self):
        from app.dev_pipeline.summary import build_run_summary

        run = {
            "run_id": "dpj-close-ok",
            "status": "done",
            "outcome": "success",
            "current_step": "10",
            "workspace": r"d:\demo\app",
            "requirement_core": "库存低水位告警页",
            "created_at": 1000,
            "updated_at": 1300,
            "steps": [
                {
                    "step_id": str(i),
                    "title": "t" + str(i),
                    "status": "pass",
                    "summary": "ok-" + str(i),
                    "receipt": {
                        "status": "pass",
                        "finished_at": 1000 + i * 10,
                        "evidence": {
                            "changed_files": ["frontend/src/A.vue"]
                            if i == 5
                            else []
                        },
                        "artifacts": {
                            "changed_files": ["frontend/src/A.vue"]
                            if i == 5
                            else []
                        },
                    },
                }
                for i in range(1, 11)
            ],
        }
        run["steps"][4]["summary"] = "写码完成（cch-1，变更 1 项）"
        run["steps"][5]["summary"] = "自动验证通过"
        run["steps"][9]["summary"] = "部署完成"
        rs = build_run_summary(run)
        closing = rs.get("closing") or {}
        self.assertTrue(closing.get("conclusion"))
        self.assertIn("全部完成", closing["conclusion"])
        self.assertTrue(closing.get("highlights"))
        self.assertTrue(closing.get("verify"))
        self.assertIn("frontend/src/A.vue", " ".join(closing["highlights"]))
        self.assertIn("如何验证", closing.get("body") or "")

    def test_running_has_no_closing(self):
        from app.dev_pipeline.summary import build_run_summary

        run = {
            "run_id": "dpj-live",
            "status": "running",
            "current_step": "3",
            "created_at": 1000,
            "steps": [
                {"step_id": "1", "status": "pass", "title": "a"},
                {"step_id": "2", "status": "pass", "title": "b"},
                {"step_id": "3", "status": "running", "title": "c"},
            ],
        }
        rs = build_run_summary(run)
        self.assertIsNone(rs.get("closing"))


if __name__ == "__main__":
    unittest.main()
