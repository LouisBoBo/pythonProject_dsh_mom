# -*- coding: utf-8 -*-
"""问数数据源裁决：禁止演示库默认冒充业务结果。"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class AskDataTests(unittest.TestCase):
    def test_unconfigured_no_demo_numbers(self) -> None:
        from app.ask_data import resolve_ask_query

        intent = {
            "metric": "work_orders_total",
            "dim": None,
            "type": "single",
            "chart": "bar",
            "direction": "desc",
            "date_from": None,
            "date_to": None,
            "range_desc": "今天",
            "granularity": "day",
            "filters": {},
            "metric_name": "工单总数",
            "dim_name": "",
        }
        cfg = {"mes": {"base_url": "", "allow_demo_fallback": False}, "api_docs": {"endpoints": []}}
        out = asyncio.run(resolve_ask_query(intent, cfg))
        self.assertEqual(out.get("data_source"), "unconfigured")
        self.assertIsNone(out.get("chart"))
        self.assertIn("没有接通业务数据源", out.get("reply") or "")
        # 禁止出现像真查数的演示口径数字标题
        self.assertNotIn("演示数据", out.get("reply") or "")

    def test_explicit_demo_fallback_marked(self) -> None:
        from datetime import date

        from app.ask_data import resolve_ask_query

        today = date.today()
        intent = {
            "metric": "work_orders_total",
            "dim": None,
            "type": "single",
            "chart": "bar",
            "direction": "desc",
            "date_from": today,
            "date_to": today,
            "range_desc": "今天",
            "granularity": "day",
            "filters": {},
            "metric_name": "工单总数",
            "dim_name": "",
        }
        cfg = {"mes": {"base_url": "", "allow_demo_fallback": True}}
        out = asyncio.run(resolve_ask_query(intent, cfg))
        self.assertEqual(out.get("data_source"), "demo")
        self.assertIn("演示数据", out.get("note") or "")
        self.assertIn("演示数据", out.get("reply") or "")

    def test_mes_error_no_silent_demo(self) -> None:
        from app.ask_data import resolve_ask_query
        from app.mes_client import MesError

        intent = {
            "metric": "oee",
            "dim": None,
            "type": "single",
            "chart": "bar",
            "direction": "desc",
            "date_from": None,
            "date_to": None,
            "range_desc": "今天",
            "granularity": "day",
            "filters": {},
            "metric_name": "OEE",
            "dim_name": "",
        }
        cfg = {"mes": {"base_url": "http://127.0.0.1:9", "allow_demo_fallback": False}}

        async def _boom(*_a, **_k):
            raise MesError("拒绝连接")

        with mock.patch("app.mes_analyzer.analyze_mes", side_effect=_boom):
            out = asyncio.run(resolve_ask_query(intent, cfg))
        self.assertEqual(out.get("data_source"), "mes_error")
        self.assertIn("没有成功", out.get("reply") or "")
        self.assertIsNone(out.get("chart"))

    def test_imported_endpoint_count_in_hint(self) -> None:
        from app.ask_data import unconfigured_reply

        cfg = {
            "api_docs": {
                "endpoints": [
                    {"name": "a", "path": "/api/x"},
                    {"name": "b", "path": ""},
                    {"name": "c", "path": "/api/y"},
                ]
            }
        }
        out = unconfigured_reply(cfg)
        self.assertIn("2 个带路径的接口", out.get("reply") or "")

    def test_special_help_adds_hint_when_unconfigured(self) -> None:
        from app.ask_data import special_reply_for_ask

        text = special_reply_for_ask("help", "基础帮助", {"mes": {"base_url": ""}})
        self.assertIn("基础帮助", text)
        self.assertIn("MES 连接", text)
        text2 = special_reply_for_ask(
            "help", "基础帮助", {"mes": {"base_url": "http://127.0.0.1:9"}}
        )
        self.assertEqual(text2, "基础帮助")


if __name__ == "__main__":
    unittest.main()
