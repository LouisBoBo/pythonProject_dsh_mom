# -*- coding: utf-8 -*-
"""问数：按导入 api_docs 匹配只读接口。"""
from __future__ import annotations

import asyncio
import os
import sys
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


_SAMPLE_ENDPOINTS = [
    {
        "name": "list_work_orders",
        "method": "GET",
        "path": "/api/v1/work-orders",
        "table": "work_orders",
        "desc": "工单列表（分页）",
    },
    {
        "name": "get_work_order",
        "method": "GET",
        "path": "/api/v1/work-orders/{id}",
        "table": "work_orders",
        "desc": "工单详情",
    },
    {
        "name": "create_work_order",
        "method": "POST",
        "path": "/api/v1/work-orders",
        "table": "work_orders",
        "desc": "新建工单",
    },
    {
        "name": "get_oee_kpi",
        "method": "GET",
        "path": "/api/v1/reports/oee",
        "table": "equipment_events",
        "desc": "设备 OEE 报表",
    },
    {
        "name": "login",
        "method": "POST",
        "path": "/api/v1/auth/login",
        "table": "",
        "desc": "登录",
    },
    {
        "name": "work_order_options",
        "method": "GET",
        "path": "/api/v1/work-orders/options",
        "table": "work_orders",
        "desc": "工单状态下拉选项",
    },
]


class AskApiRouteUnitTests(unittest.TestCase):
    def test_list_queryable_excludes_write_auth_path_params(self) -> None:
        from app.ask_api_route import list_queryable_endpoints

        cfg = {"api_docs": {"endpoints": _SAMPLE_ENDPOINTS}}
        paths = {ep["path"] for ep in list_queryable_endpoints(cfg)}
        self.assertIn("/api/v1/work-orders", paths)
        self.assertIn("/api/v1/reports/oee", paths)
        self.assertIn("/api/v1/work-orders/options", paths)
        self.assertNotIn("/api/v1/work-orders/{id}", paths)
        self.assertNotIn("/api/v1/auth/login", paths)

    def test_pick_work_orders_over_options(self) -> None:
        from app.ask_api_route import pick_endpoint

        cfg = {"api_docs": {"endpoints": _SAMPLE_ENDPOINTS}}
        intent = {
            "metric": "in_progress_orders",
            "metric_name": "在制工单数",
            "raw": "今日在制品工单有多少",
        }
        picked = pick_endpoint(intent["raw"], cfg, intent)
        self.assertIsNotNone(picked)
        assert picked is not None
        self.assertEqual(picked["path"], "/api/v1/work-orders")
        self.assertGreaterEqual(float(picked["score"]), 6.0)

    def test_pick_oee(self) -> None:
        from app.ask_api_route import pick_endpoint

        cfg = {"api_docs": {"endpoints": _SAMPLE_ENDPOINTS}}
        intent = {"metric": "oee", "metric_name": "OEE", "raw": "查一下今天 OEE"}
        picked = pick_endpoint(intent["raw"], cfg, intent)
        self.assertIsNotNone(picked)
        assert picked is not None
        self.assertEqual(picked["path"], "/api/v1/reports/oee")

    def test_weak_overlap_no_auto_pick(self) -> None:
        from app.ask_api_route import pick_endpoint

        cfg = {"api_docs": {"endpoints": _SAMPLE_ENDPOINTS}}
        picked = pick_endpoint("今天天气怎么样", cfg, {"metric": "", "raw": "今天天气怎么样"})
        self.assertIsNone(picked)

    def test_format_list_payload(self) -> None:
        from app.ask_api_route import format_api_result

        ep = {"path": "/api/v1/work-orders", "desc": "工单列表", "name": "list", "score": 12}
        data = {
            "total": 2,
            "items": [
                {"id": 1, "code": "WO-1", "status": "in_progress"},
                {"id": 2, "code": "WO-2", "status": "completed"},
            ],
        }
        out = format_api_result(data, endpoint=ep, question="工单")
        self.assertEqual(out["data_source"], "api_docs")
        self.assertIsInstance(out.get("table"), list)
        self.assertTrue(out["table"])
        self.assertIn("label", out["table"][0])
        self.assertIn("value", out["table"][0])
        self.assertIn("工单列表", out.get("reply") or "")
        self.assertNotIsInstance(out.get("table"), dict)

    def test_payload_shapes_flexible(self) -> None:
        """不同项目常见包装：data.list / result.records / root 数组 / 嵌套对象。"""
        from app.ask_api_route import _choose_columns, _rows_from_payload, format_api_result

        rows = _rows_from_payload(
            {"code": 0, "data": {"list": [{"planName": "月保", "status": "on"}], "totalCount": 1}}
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["planName"], "月保")

        rows2 = _rows_from_payload({"result": {"records": [{"title": "A"}, {"title": "B"}]}})
        self.assertEqual(len(rows2), 2)

        rows3 = _rows_from_payload([{"name": "x"}, {"name": "y"}])
        self.assertEqual(len(rows3), 2)

        nested = [
            {
                "id": 9,
                "name": "CNC月度保养",
                "equipment": {"code": "EQ-1", "name": "1号CNC"},
                "token": "secret",
            }
        ]
        cols = _choose_columns(nested)
        self.assertIn("name", cols)
        self.assertTrue(any(c.startswith("equipment_") for c in cols))
        self.assertNotIn("token", cols)

        out = format_api_result(
            {"success": True, "data": {"rows": nested, "total": 1}},
            endpoint={"path": "/api/x", "desc": "计划", "score": 12},
            question="保养",
        )
        self.assertEqual(out["data_source"], "api_docs")
        self.assertIsInstance(out["table"], list)
        # 无字典时表头保持接口字段；有 name 则出现在摘要中
        self.assertTrue(any("CNC月度保养" in (r.get("label") + r.get("value")) for r in out["table"]))
        self.assertNotIn("secret", out.get("reply") or "")
        self.assertIn("| name |", out.get("reply") or "")

    def test_dict_header_labels_cautious(self) -> None:
        """数据字典只改无歧义中文表头；单元格原值；泛字段/枚举 desc 不动。"""
        from app.ask_api_route import build_field_label_map, format_api_result

        cfg = {
            "data_dictionary": {
                "work_orders": [
                    {"mes_field": "order_no", "std_field": "work_order_no", "type": "文本", "desc": "工单号"},
                    {
                        "mes_field": "status",
                        "std_field": "status",
                        "type": "文本",
                        "desc": "pending / in_progress / completed",
                    },
                    {"mes_field": "assignee", "std_field": "assignee", "type": "文本", "desc": "负责人"},
                ],
                "equipment_events": [
                    {"mes_field": "name", "std_field": "name", "type": "文本", "desc": "设备名称"},
                    {"mes_field": "equipment_code", "std_field": "equipment_code", "type": "文本", "desc": "设备编码"},
                ],
            }
        }
        labels = build_field_label_map(cfg)
        self.assertEqual(labels.get("order_no"), "工单号")
        self.assertEqual(labels.get("work_order_no"), "工单号")
        self.assertEqual(labels.get("assignee"), "负责人")
        self.assertEqual(labels.get("equipment_code"), "设备编码")
        self.assertNotIn("status", labels)  # 枚举说明不当表头
        self.assertNotIn("name", labels)  # 泛字段跳过，避免计划名被标成设备名称

        # 默认样例写法：mes 中文 + std 英文
        cfg2 = {
            "data_dictionary": {
                "work_orders": [
                    {"mes_field": "工单号", "std_field": "work_order_no", "type": "文本", "desc": ""},
                ]
            }
        }
        self.assertEqual(build_field_label_map(cfg2).get("work_order_no"), "工单号")

        # 同键不同中文 → 全局歧义跳过；有 table 作用域则用该组
        cfg3 = {
            "data_dictionary": {
                "work_orders": [
                    {"mes_field": "production_line", "std_field": "line_name", "desc": "产线名称"}
                ],
                "quality_records": [
                    {"mes_field": "production_line", "std_field": "line_name", "desc": "产线"}
                ],
            }
        }
        self.assertNotIn("production_line", build_field_label_map(cfg3))
        self.assertEqual(
            build_field_label_map(cfg3, table="work_orders").get("production_line"),
            "产线名称",
        )
        self.assertEqual(
            build_field_label_map(cfg3, table="quality_records").get("production_line"),
            "产线",
        )

        ep = {"path": "/api/v1/maintenance/orders", "desc": "保养工单", "score": 14, "table": "work_orders"}
        data = {
            "total": 1,
            "items": [
                {
                    "order_no": "MO-1",
                    "assignee": "张三",
                    "status": "pending",
                    "name": "月度保养",
                    "equipment_code": "EQ-9",
                    "production_line": "A线",
                }
            ],
        }
        out = format_api_result(
            data,
            endpoint=ep,
            question="保养工单",
            cfg={
                "data_dictionary": {
                    "work_orders": list(cfg["data_dictionary"]["work_orders"])
                    + list(cfg3["data_dictionary"]["work_orders"]),
                    "equipment_events": cfg["data_dictionary"]["equipment_events"],
                    "quality_records": cfg3["data_dictionary"]["quality_records"],
                }
            },
        )
        reply = out.get("reply") or ""
        self.assertIn("| 工单号 |", reply)
        self.assertIn("| 负责人 |", reply)
        self.assertIn("| 设备编码 |", reply)
        self.assertIn("| 产线名称 |", reply)  # table=work_orders 作用域
        self.assertIn("| status |", reply)  # 未改
        self.assertIn("| name |", reply)  # 未改成设备名称
        self.assertIn("pending", reply)  # 单元格原值
        self.assertIn("月度保养", reply)
        self.assertNotIn("设备名称", reply)

    def test_ask_example_lines_from_imported(self) -> None:
        from app.ask_api_route import ask_example_lines
        from app.ask_data import special_reply_for_ask

        cfg = {
            "mes": {"base_url": "http://127.0.0.1:9"},
            "api_docs": {
                "endpoints": [
                    {"name": "a", "method": "GET", "path": "/api/work-orders", "table": "work_orders", "desc": "查询生产工单列表"},
                    {"name": "b", "method": "GET", "path": "/api/equipment-maintenance/plans", "table": "equipment_events", "desc": "查询保养计划列表"},
                    {"name": "c", "method": "POST", "path": "/api/work-orders", "table": "work_orders", "desc": "新建生产工单"},
                ]
            },
        }
        lines = ask_example_lines(cfg, limit=4)
        self.assertEqual(lines[0], "查询生产工单列表")
        self.assertIn("查询保养计划列表", lines)
        self.assertTrue(all("新建" not in x for x in lines))

        help_text = special_reply_for_ask("help", "基础帮助。", cfg)
        self.assertIn("根据已导入接口", help_text)
        self.assertIn("查询生产工单列表", help_text)

    def test_looks_like_imported_and_count_first(self) -> None:
        from app.ask_api_route import format_api_result, looks_like_imported_query
        from app.ask_data import docs_query_intent

        cfg = {
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_plans",
                        "method": "GET",
                        "path": "/api/equipment-maintenance/plans",
                        "table": "other",
                        "desc": "查询保养计划列表",
                    },
                    {
                        "name": "wo",
                        "method": "GET",
                        "path": "/api/work-orders",
                        "table": "work_orders",
                        "desc": "查询生产工单列表",
                    },
                ]
            }
        }
        hit = looks_like_imported_query("查询设备保养计划", cfg, intent=docs_query_intent("查询设备保养计划"))
        self.assertIsNotNone(hit)
        assert hit is not None
        self.assertEqual(hit["path"], "/api/equipment-maintenance/plans")
        self.assertIsNone(looks_like_imported_query("今天天气怎么样", cfg))

        intent = docs_query_intent("保养计划有多少个")
        self.assertEqual(intent.get("type"), "single")
        out = format_api_result(
            {"total": 3, "items": [{"name": "A"}, {"name": "B"}, {"name": "C"}]},
            endpoint={"path": "/api/equipment-maintenance/plans", "desc": "查询保养计划列表", "score": 14},
            question="保养计划有多少个",
            intent=intent,
        )
        reply = out.get("reply") or ""
        self.assertTrue(reply.startswith("「查询保养计划列表」共 3 条。"))
        self.assertIn("| name |", reply)

    def test_status_from_dictionary_enum_not_hardcoded(self) -> None:
        """在制品→字典别名「生产中」；待开工不进明细；展示跟字典走。"""
        from app.ask_api_route import build_query_params, format_api_result

        cfg = {
            "data_dictionary": {
                "work_orders": [
                    {
                        "mes_field": "status",
                        "std_field": "status",
                        "desc": "pending=待开工 / in_progress=生产中|在制|在制品|再制品 / completed=已完成",
                    }
                ]
            }
        }
        p = build_query_params(
            {"raw": "今日在制品工单明细"},
            "/api/reports/wip",
            question="今日在制品工单明细",
            cfg=cfg,
            table="work_orders",
        )
        self.assertEqual(p.get("status"), "in_progress")

        out = format_api_result(
            {
                "total": 3,
                "items": [
                    {"order_no": "WO-1", "status": "pending"},
                    {"order_no": "WO-2", "status": "in_progress"},
                    {"order_no": "WO-3", "status": "生产中"},
                ],
            },
            endpoint={
                "path": "/api/reports/wip",
                "desc": "在制品报表",
                "table": "work_orders",
                "score": 12,
            },
            question="今日在制品工单明细",
            cfg=cfg,
            intent={"type": "list", "raw": "今日在制品工单明细", "metric_name": "在制工单数"},
        )
        reply = out.get("reply") or ""
        self.assertIn("WO-2", reply)
        self.assertIn("WO-3", reply)
        self.assertNotIn("WO-1", reply)
        self.assertNotIn("待开工", reply)
        self.assertIn("生产中", reply)
        self.assertIn("共 2 条", reply)


class AskApiRouteResolveTests(unittest.TestCase):
    def test_resolve_prefers_api_docs(self) -> None:
        from app.ask_data import resolve_ask_query

        intent = {
            "metric": "in_progress_orders",
            "dim": None,
            "type": "list",
            "chart": "bar",
            "direction": "desc",
            "date_from": None,
            "date_to": None,
            "range_desc": "今天",
            "granularity": "day",
            "filters": {},
            "metric_name": "在制工单数",
            "dim_name": "",
            "raw": "今日在制品工单明细",
        }
        cfg = {
            "mes": {"base_url": "http://127.0.0.1:9", "allow_demo_fallback": False},
            "api_docs": {"endpoints": _SAMPLE_ENDPOINTS},
        }

        async def _fake_get(_mes, path, params=None):
            self.assertEqual(path, "/api/v1/work-orders")
            return {"total": 1, "items": [{"id": 9, "code": "WO-9", "status": "in_progress"}]}

        with mock.patch("app.mes_client.api_get", side_effect=_fake_get):
            with mock.patch("app.mes_analyzer.analyze_mes") as mes_mock:
                out = asyncio.run(resolve_ask_query(intent, cfg))
                mes_mock.assert_not_called()
        self.assertEqual(out.get("data_source"), "api_docs")
        self.assertEqual((out.get("matched_endpoint") or {}).get("path"), "/api/v1/work-orders")
        self.assertIn("工单列表", out.get("reply") or "")

    def test_resolve_falls_back_to_mes_when_no_match(self) -> None:
        from app.ask_data import resolve_ask_query

        intent = {
            "metric": "work_orders_total",
            "metric_name": "工单总数",
            "raw": "xyzzy_no_overlap_12345",
            "type": "single",
            "filters": {},
        }
        cfg = {
            "mes": {"base_url": "http://127.0.0.1:9", "allow_demo_fallback": False},
            "api_docs": {
                "endpoints": [
                    {
                        "name": "get_inventory",
                        "method": "GET",
                        "path": "/api/v1/inventory/balance",
                        "table": "inventory",
                        "desc": "库存结余",
                    }
                ]
            },
        }

        async def _mes(_intent, _mes_cfg):
            return {"reply": "硬指标结果", "chart": None, "table": None, "note": "mes", "title": "t"}

        with mock.patch("app.mes_analyzer.analyze_mes", side_effect=_mes):
            out = asyncio.run(resolve_ask_query(intent, cfg))
        self.assertEqual(out.get("data_source"), "mes")
        self.assertIn("硬指标", out.get("reply") or "")

    def test_no_match_when_mes_also_fails(self) -> None:
        from app.ask_data import resolve_ask_query
        from app.mes_client import MesError

        intent = {
            "metric": "work_orders_total",
            "metric_name": "工单总数",
            "raw": "查库存结余金额",
            "type": "single",
            "filters": {},
        }
        # 描述弱相关、刻意压低分：只有 inventory path，问题含「库存」应能匹配；
        # 本用例改为完全无关 path，验证 no_match
        cfg = {
            "mes": {"base_url": "http://127.0.0.1:9", "allow_demo_fallback": False},
            "api_docs": {
                "endpoints": [
                    {
                        "name": "ping",
                        "method": "GET",
                        "path": "/api/v1/system/ping",
                        "table": "",
                        "desc": "健康检查",
                    }
                ]
            },
        }

        async def _boom(*_a, **_k):
            raise MesError("拒绝连接")

        with mock.patch("app.mes_analyzer.analyze_mes", side_effect=_boom):
            out = asyncio.run(resolve_ask_query(intent, cfg))
        self.assertEqual(out.get("data_source"), "api_docs_unmatched")
        self.assertIn("没有在已导入", out.get("reply") or "")

    def test_maintenance_plan_matches_imported_get(self) -> None:
        from app.ask_api_route import pick_endpoint
        from app.ask_data import docs_query_intent, try_imported_api_answer

        cfg = {
            "mes": {"base_url": "http://127.0.0.1:9", "allow_demo_fallback": False},
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_plans",
                        "method": "GET",
                        "path": "/api/equipment-maintenance/plans",
                        "table": "other",
                        "desc": "查询保养计划列表",
                    },
                    {
                        "name": "create_plan",
                        "method": "POST",
                        "path": "/api/equipment-maintenance/plans",
                        "table": "other",
                        "desc": "新建保养计划",
                    },
                ]
            },
        }
        q = "查询设备保养计划"
        picked = pick_endpoint(q, cfg, docs_query_intent(q))
        self.assertIsNotNone(picked)
        assert picked is not None
        self.assertEqual(picked["path"], "/api/equipment-maintenance/plans")

        async def _fake_get(_mes, path, params=None):
            self.assertEqual(path, "/api/equipment-maintenance/plans")
            return {
                "total": 2,
                "items": [
                    {"name": "CNC月度保养", "cycle": "每1月", "status": "enabled"},
                    {"name": "CNC周保养", "cycle": "每1周", "status": "enabled"},
                ],
            }

        with mock.patch("app.mes_client.api_get", side_effect=_fake_get):
            out = asyncio.run(try_imported_api_answer(q, cfg))
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out.get("data_source"), "api_docs")
        self.assertIn("保养", out.get("reply") or "")
        self.assertIsInstance(out.get("table"), list)
        self.assertTrue(all(isinstance(r, dict) and "label" in r for r in out["table"]))

    def test_chat_kind_still_hits_api_docs(self) -> None:
        """LLM 误判为 chat 时，仍应优先走导入接口（回归「不在可查范围」）。"""
        from app import cli_ops

        cfg = {
            "mes": {"base_url": "http://127.0.0.1:9", "allow_demo_fallback": False},
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_plans",
                        "method": "GET",
                        "path": "/api/equipment-maintenance/plans",
                        "table": "other",
                        "desc": "查询保养计划列表",
                    }
                ]
            },
            "deepseek": {"provider": "none"},
        }

        async def _fake_get(_mes, path, params=None):
            return {"total": 1, "items": [{"name": "CNC月度保养"}]}

        async def _fake_llm(*_a, **_k):
            return {
                "kind": "chat",
                "reply": "设备保养计划不在可查范围内——我目前接入的是 MES 生产数据。",
            }

        with mock.patch("app.cli_ops.load_config", return_value=cfg):
            with mock.patch("app.cli_ops.plugins_store.is_enabled", return_value=True):
                with mock.patch("app.cli_ops.llm_ready", return_value=True):
                    with mock.patch("app.cli_ops.llm_chat", side_effect=_fake_llm):
                        with mock.patch("app.mes_client.api_get", side_effect=_fake_get):
                            out = asyncio.run(cli_ops.chat("查询设备保养计划"))
        self.assertEqual(out.get("data_source"), "api_docs")
        self.assertNotIn("不在可查范围", out.get("reply") or "")
        self.assertIn("保养", out.get("reply") or "")

    def test_soft_intent_allows_empty_metric(self) -> None:
        from app.nl_engine import _intent_from_obj

        intent = _intent_from_obj({"type": "list", "chart": "bar", "days": 30, "filters": {}}, "查询设备保养计划")
        self.assertIsNotNone(intent)
        assert intent is not None
        self.assertEqual(intent.get("metric"), "")
        self.assertEqual(intent.get("type"), "list")
        self.assertIn("保养", intent.get("raw") or "")

    def test_completed_work_orders_not_maintenance(self) -> None:
        """「今日完工工单」不得误选保养工单列表。"""
        from app.ask_api_route import clear_route_memory, pick_endpoint
        from app.ask_data import docs_query_intent

        clear_route_memory()
        cfg = {
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_wo",
                        "method": "GET",
                        "path": "/api/work-orders",
                        "table": "work_orders",
                        "desc": "查询工单列表",
                    },
                    {
                        "name": "list_maint",
                        "method": "GET",
                        "path": "/api/equipment-maintenance/orders",
                        "table": "equipment_events",
                        "desc": "查询保养工单列表",
                    },
                ]
            },
            "data_dictionary": {
                "work_orders": [
                    {
                        "mes_field": "status",
                        "std_field": "status",
                        "desc": "pending=待开工 / completed=已完成|完工",
                    },
                    {"mes_field": "end_date", "std_field": "end_date", "type": "时间", "desc": "计划结束"},
                ]
            },
        }
        q = "查询今日完工工单数量"
        intent = docs_query_intent(q)
        picked = pick_endpoint(q, cfg, intent)
        self.assertIsNotNone(picked)
        assert picked is not None
        self.assertEqual(picked["path"], "/api/work-orders")
        self.assertNotIn("maintenance", picked["path"])

    def test_status_filter_strict_zero_and_date(self) -> None:
        from datetime import date

        from app.ask_api_route import clear_route_memory, format_api_result

        clear_route_memory()
        cfg = {
            "data_dictionary": {
                "work_orders": [
                    {
                        "mes_field": "status",
                        "std_field": "status",
                        "desc": "pending=待开工 / completed=已完成|完工",
                    },
                    {"mes_field": "end_date", "std_field": "end_date", "type": "时间", "desc": "计划结束"},
                ]
            }
        }
        today = date(2026, 9, 29)
        out = format_api_result(
            {
                "total": 3,
                "items": [
                    {"order_no": "A", "status": "completed", "end_date": "2026-09-29"},
                    {"order_no": "B", "status": "completed", "end_date": "2026-09-28"},
                    {"order_no": "C", "status": "pending", "end_date": "2026-09-29"},
                ],
            },
            endpoint={
                "path": "/api/work-orders",
                "desc": "查询工单列表",
                "table": "work_orders",
                "score": 16,
            },
            question="今日完工工单数量",
            cfg=cfg,
            intent={
                "type": "single",
                "raw": "今日完工工单数量",
                "date_from": today,
                "date_to": today,
            },
        )
        reply = out.get("reply") or ""
        self.assertIn("共 1 条", reply)
        self.assertIn("A", reply)
        self.assertNotIn("B", reply)
        self.assertNotIn("C", reply)

    def test_route_memory_and_context_sticky(self) -> None:
        from app.ask_api_route import (
            clear_route_memory,
            pick_endpoint,
            remember_ask_route,
        )

        clear_route_memory()
        cfg = {
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_wo",
                        "method": "GET",
                        "path": "/api/work-orders",
                        "table": "work_orders",
                        "desc": "查询工单列表",
                    },
                    {
                        "name": "list_maint",
                        "method": "GET",
                        "path": "/api/equipment-maintenance/orders",
                        "table": "equipment_events",
                        "desc": "查询保养工单列表",
                    },
                ]
            }
        }
        remember_ask_route(
            "今日在制品工单明细",
            {"path": "/api/work-orders", "table": "work_orders", "desc": "查询工单列表"},
            {"raw": "今日在制品工单明细"},
        )
        # 模糊追问 + context：应粘住生产工单
        q = "那完工的有多少"
        intent = {
            "raw": q,
            "type": "single",
            "context": "上文查的是生产工单 GET /api/work-orders，不是保养",
        }
        picked = pick_endpoint(q, cfg, intent)
        self.assertIsNotNone(picked)
        assert picked is not None
        self.assertEqual(picked["path"], "/api/work-orders")

    def test_employee_roster_not_stolen_by_work_order_context(self) -> None:
        """刚查过工单后问员工，不得再落到 /api/work-orders。"""
        from app.ask_api_route import clear_route_memory, pick_endpoint, remember_ask_route

        clear_route_memory()
        cfg = {
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_wo",
                        "method": "GET",
                        "path": "/api/work-orders",
                        "table": "work_orders",
                        "desc": "查询生产工单列表",
                    },
                    {
                        "name": "list_employees",
                        "method": "GET",
                        "path": "/api/employees",
                        "table": "other",
                        "desc": "员工列表",
                    },
                    {
                        "name": "list_hours",
                        "method": "GET",
                        "path": "/api/reports/employee-work-hours",
                        "table": "work_orders",
                        "desc": "员工工时报表",
                    },
                ]
            }
        }
        remember_ask_route(
            "查一下工单列表",
            {"path": "/api/work-orders", "table": "work_orders", "desc": "查询生产工单列表"},
            {},
        )
        intent = {
            "context": "刚才查了生产工单 WO-AN-202610 GET /api/work-orders",
        }
        for q in ("员工列表", "查一下员工", "员工有哪些", "人员列表"):
            picked = pick_endpoint(q, cfg, intent)
            self.assertIsNotNone(picked, q)
            assert picked is not None
            self.assertEqual(picked["path"], "/api/employees", q)

        hours = pick_endpoint("员工工时报表", cfg, intent)
        self.assertIsNotNone(hours)
        assert hours is not None
        self.assertEqual(hours["path"], "/api/reports/employee-work-hours")

    def test_employee_roster_not_stolen_by_maintenance_list(self) -> None:
        """保养工单记忆/同「列表」词面，不得抢走员工名单。"""
        from app.ask_api_route import clear_route_memory, pick_endpoint, remember_ask_route

        clear_route_memory()
        cfg = {
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_maint",
                        "method": "GET",
                        "path": "/api/equipment-maintenance/orders",
                        "table": "equipment_events",
                        "desc": "查询保养工单列表",
                    },
                    {
                        "name": "list_devices",
                        "method": "GET",
                        "path": "/api/devices",
                        "table": "equipment_events",
                        "desc": "查询点检设备列表",
                    },
                    {
                        "name": "list_employees",
                        "method": "GET",
                        "path": "/api/employees",
                        "table": "other",
                        "desc": "员工列表",
                    },
                ]
            }
        }
        remember_ask_route(
            "查询设备保养工单",
            {
                "path": "/api/equipment-maintenance/orders",
                "table": "equipment_events",
                "desc": "查询保养工单列表",
            },
            {},
        )
        for q in ("查询员工列表", "员工列表", "人员列表"):
            picked = pick_endpoint(q, cfg, {})
            self.assertIsNotNone(picked, q)
            assert picked is not None
            self.assertEqual(picked["path"], "/api/employees", q)

    def test_employee_roster_without_catalog_does_not_pick_maintenance(self) -> None:
        """接口清单未导入 /api/employees 时：宁可不调，也不要误调保养列表。"""
        from app.ask_api_route import clear_route_memory, pick_endpoint, remember_ask_route

        clear_route_memory()
        cfg = {
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_maint",
                        "method": "GET",
                        "path": "/api/equipment-maintenance/orders",
                        "table": "equipment_events",
                        "desc": "查询保养工单列表",
                    },
                    {
                        "name": "list_hours",
                        "method": "GET",
                        "path": "/api/reports/employee-work-hours",
                        "table": "work_orders",
                        "desc": "员工工时报表",
                    },
                ]
            }
        }
        remember_ask_route(
            "查询保养工单列表",
            {
                "path": "/api/equipment-maintenance/orders",
                "table": "equipment_events",
                "desc": "查询保养工单列表",
            },
            {},
        )
        picked = pick_endpoint("查询员工列表", cfg, {})
        self.assertIsNone(picked)

    def test_employee_list_not_zeroed_by_soft_today_intent(self) -> None:
        """软意图不得再默认「今天」，否则员工列表按入职日会被滤成 0 条。"""
        from datetime import date

        from app.ask_api_route import clear_route_memory, format_api_result
        from app.ask_data import docs_query_intent

        clear_route_memory()
        soft = docs_query_intent("员工列表")
        self.assertIsNone(soft.get("date_from"))
        self.assertIsNone(soft.get("date_to"))
        self.assertEqual(soft.get("range_desc") or "", "")

        today_q = docs_query_intent("查询今日完工工单数量")
        self.assertEqual(today_q.get("date_from"), date.today())
        self.assertEqual(today_q.get("range_desc"), "今天")

        ep = {
            "name": "list_employees",
            "method": "GET",
            "path": "/api/employees",
            "table": "other",
            "desc": "员工列表",
            "score": 20,
        }
        payload = {
            "total": 2,
            "items": [
                {
                    "employee_no": "E1",
                    "employee_name": "甲",
                    "hire_date": "2022-03-15",
                    "status": "在职",
                },
                {
                    "employee_no": "E2",
                    "employee_name": "乙",
                    "hire_date": "2021-08-01",
                    "status": "在职",
                },
            ],
        }
        # 即便旧客户端仍传入「今天」，名单问法也不应按入职日清空
        stale = dict(soft)
        stale["date_from"] = date.today()
        stale["date_to"] = date.today()
        stale["range_desc"] = "今天"
        out = format_api_result(payload, endpoint=ep, question="员工列表", intent=stale)
        reply = out.get("reply") or ""
        self.assertIn("共 2 条", reply)
        self.assertIn("甲", reply)
        self.assertNotIn("共 0 条", reply)

    def test_employee_salary_routes_to_employees_and_keeps_salary_col(self) -> None:
        """工资嵌在员工列表字段：路由到 /api/employees，展示不被 8 列上限挤掉。"""
        from app.ask_api_route import clear_route_memory, format_api_result, pick_endpoint

        clear_route_memory()
        cfg = {
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_work_orders",
                        "method": "GET",
                        "path": "/api/work-orders",
                        "table": "work_orders",
                        "desc": "生产工单列表",
                    },
                    {
                        "name": "employee_hours",
                        "method": "GET",
                        "path": "/api/reports/employee-work-hours",
                        "table": "other",
                        "desc": "员工工时报表",
                    },
                    {
                        "name": "list_employees",
                        "method": "GET",
                        "path": "/api/employees",
                        "table": "other",
                        "desc": "员工列表",
                    },
                ]
            },
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": ["salary"]},
            },
        }
        for q in ("员工工资", "查一下薪资", "本月员工薪酬"):
            picked = pick_endpoint(q, cfg, {})
            self.assertIsNotNone(picked, q)
            assert picked is not None
            self.assertEqual(picked["path"], "/api/employees", q)

        # 9 个业务列时默认 limit=8 会挤掉末尾 salary；问工资必须保住
        wide = {
            "items": [
                {
                    "employee_no": "E1",
                    "employee_name": "甲",
                    "gender": "男",
                    "phone": "1",
                    "position": "操作员",
                    "department_code": "D1",
                    "department_name": "一部",
                    "hire_date": "2022-01-01",
                    "status": "在职",
                    "salary": 6800.0,
                }
            ]
        }
        ep = {
            "path": "/api/employees",
            "desc": "员工列表",
            "name": "list_employees",
            "score": 20,
        }
        out = format_api_result(
            wide,
            endpoint=ep,
            question="员工工资",
            cfg=cfg,
            intent={},
        )
        reply = out.get("reply") or ""
        self.assertIn("6800", reply)
        self.assertIn("salary", reply.lower() + reply)


if __name__ == "__main__":
    unittest.main()
