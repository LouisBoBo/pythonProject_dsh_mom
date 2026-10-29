"""查明细必须返回列表（最多 50 条），不能按产线汇总。"""

from __future__ import annotations

import os
import sys
import unittest
from datetime import date

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

from app.nl_engine import parse_question


def _wo_row(i: int, *, status: str = "in_progress", line: str = "SMT-1线") -> dict:
    return {
        "order_no": f"WO{i:03d}",
        "product_name": "控制器",
        "production_line": line,
        "plan_quantity": 100,
        "actual_quantity": 40,
        "status": status,
        "start_date": "2026-09-27",
    }


class DetailListIntentTests(unittest.TestCase):
    def test_wip_detail_is_list_not_summary(self):
        intent = parse_question("查今日在制品工单明细")
        self.assertEqual(intent["metric"], "in_progress_orders")
        self.assertEqual(intent["type"], "list")
        self.assertIsNone(intent["chart"])

    def test_count_question_stays_summary(self):
        intent = parse_question("今日再制品工单有多少个")
        self.assertEqual(intent["metric"], "in_progress_orders")
        self.assertEqual(intent["type"], "single")

    def test_llm_compare_overridden_when_asking_detail(self):
        from app.nl_engine import apply_detail_list_intent

        forced = apply_detail_list_intent(
            {
                "metric": "in_progress_orders",
                "dim": "line",
                "type": "compare",
                "chart": "bar",
                "raw": "查今日在制品工单明细",
            },
            "查今日在制品工单明细",
        )
        self.assertEqual(forced["type"], "list")
        self.assertIsNone(forced["chart"])


class DetailListFormatTests(unittest.TestCase):
    def test_caps_at_50_and_keeps_order_numbers(self):
        from app.detail_list import work_order_detail_result

        rows = [_wo_row(i) for i in range(80)]
        out = work_order_detail_result("今日在制工单明细", rows, total=80)
        self.assertEqual(len(out["table"]), 50)
        self.assertIsNone(out["chart"])
        self.assertIn("WO000", out["reply"])
        self.assertIn("WO049", out["reply"])
        self.assertNotIn("WO050", out["reply"])
        self.assertIn("80", out["reply"])
        self.assertIn("50", out["reply"])
        labels = [r["label"] for r in out["table"]]
        self.assertEqual(len(labels), len(set(labels)))
        self.assertTrue(all(str(r["label"]).startswith("WO") for r in out["table"]))

    def test_same_line_stays_separate_rows(self):
        from app.detail_list import work_order_detail_result

        rows = [_wo_row(1), _wo_row(2), _wo_row(3, line="测试线")]
        out = work_order_detail_result("今日在制工单明细", rows, total=3)
        self.assertEqual(len(out["table"]), 3)
        self.assertEqual([r["label"] for r in out["table"]], ["WO001", "WO002", "WO003"])
        self.assertIn("测试线", out["table"][2]["value"])


class MesDetailListTests(unittest.IsolatedAsyncioTestCase):
    async def test_mes_wip_detail_returns_orders_not_line_counts(self):
        from unittest import mock

        from app.mes_analyzer import analyze_mes

        rows = [_wo_row(i, line="SMT-1线" if i < 5 else "DIP线") for i in range(8)]

        async def fake_get(_cfg, path, params=None):
            self.assertEqual(path, "/api/work-orders")
            self.assertEqual((params or {}).get("status"), "in_progress")
            return {"items": rows, "total": 8}

        intent = parse_question("查今日在制品工单明细")
        with mock.patch("app.mes_analyzer.api_get", fake_get):
            out = await analyze_mes(intent, {"base_url": "http://mes.example"})
        self.assertEqual(len(out["table"]), 8)
        self.assertIsNone(out["chart"])
        self.assertTrue(all(str(r["label"]).startswith("WO") for r in out["table"]))
        self.assertNotIn("个", "".join(r["value"] for r in out["table"][:1]) or "x")


class DemoDetailListTests(unittest.TestCase):
    def test_demo_wip_detail_lists_orders(self):
        import pandas as pd

        from app.analyzer import analyze

        today = date.today().isoformat()
        wo = pd.DataFrame(
            [
                {
                    "work_order_no": f"WO{i}",
                    "date": today,
                    "line": "SMT-1线",
                    "shift": "白班",
                    "product": "控制器",
                    "planned_qty": 100,
                    "actual_qty": 40,
                    "status": "进行中",
                }
                for i in range(3)
            ]
        )
        empty_qc = pd.DataFrame(
            columns=["work_order_no", "date", "line", "product", "shift", "defect_qty", "sample_qty", "defect_type"]
        )
        empty_ev = pd.DataFrame(
            columns=["date", "line", "equipment", "event_type", "duration_min"]
        )

        class Store:
            pass

        store = Store()
        store.wo, store.qc, store.ev = wo, empty_qc, empty_ev
        out = analyze(store, parse_question("查今日在制品工单明细"))
        self.assertEqual(len(out["table"]), 3)
        self.assertIsNone(out["chart"])
        self.assertEqual([r["label"] for r in out["table"]], ["WO0", "WO1", "WO2"])


if __name__ == "__main__":
    unittest.main()
