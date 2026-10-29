"""数据访问：采购单价与员工工资。普通问数不进入这道门。"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock, patch

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class DataAccessTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        from app.auth import paths as auth_paths

        self._auth_paths = auth_paths
        auth_paths.set_data_dir(self._tmpdir.name)

    def tearDown(self):
        self._auth_paths.set_data_dir(None)
        self._tmpdir.cleanup()

    def test_member_default_off_admin_always_on(self):
        from app.auth.data_access import effective_data_access, normalize_data_access
        from app.auth.users import admin_public_user, ensure_seed_users, find_user_by_id

        ensure_seed_users()
        blank = normalize_data_access(None)
        self.assertFalse(blank["purchase_unit_price"])
        self.assertFalse(blank["employee_salary"])
        hebo = find_user_by_id("u_hebo")
        self.assertFalse(effective_data_access(hebo)["employee_salary"])
        admin = find_user_by_id("u_admin")
        self.assertTrue(effective_data_access(admin)["purchase_unit_price"])
        pub = admin_public_user(hebo)
        self.assertFalse(pub["data_access"]["employee_salary"])
        self.assertTrue(admin_public_user(admin)["data_access"]["employee_salary"])

    def test_output_question_is_not_sensitive(self):
        from app.auth.data_access import gate_before_fetch, targets_price_only, targets_salary

        cfg = {"sensitive_data": {}}
        self.assertIsNone(gate_before_fetch("今日产量多少", cfg))
        self.assertIsNone(gate_before_fetch("查采购单的品名和数量", cfg))
        self.assertFalse(targets_salary("今日完工工单"))
        self.assertFalse(targets_salary("应发邮件"))
        self.assertFalse(targets_price_only("查采购单"))
        self.assertFalse(targets_price_only("什么价"))
        self.assertTrue(targets_price_only("物料采购单价是多少"))
        self.assertFalse(targets_price_only("查采购单里的采购单价"))

    def test_must_include_does_not_guess_unconfigured_fields(self):
        """fields 空 = 未接入：名单展示不得硬猜 salary / purchase_price。"""
        from app.ask_api_route import _must_include_columns

        rows = [
            {
                "employee_no": "E1",
                "employee_name": "甲",
                "salary": 6800,
                "purchase_price": 0.1,
            }
        ]
        empty = {
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": []},
                "purchase_unit_price": {"path": "", "fields": []},
            }
        }
        self.assertEqual(_must_include_columns("员工列表", {}, rows, empty), [])
        self.assertEqual(_must_include_columns("物料采购列表", {}, rows, empty), [])
        configured = {
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": ["salary"]},
                "purchase_unit_price": {"path": "", "fields": ["purchase_price"]},
            }
        }
        self.assertEqual(
            _must_include_columns("员工列表", {}, rows, configured), ["salary"]
        )
        self.assertEqual(
            _must_include_columns("物料采购单价", {}, rows, configured),
            ["purchase_price"],
        )

    def test_unconfigured_salary_does_not_guess(self):
        from app.auth.data_access import gate_before_fetch

        hit = gate_before_fetch("本月员工工资", {"sensitive_data": {}})
        self.assertIsNotNone(hit)
        self.assertIn("尚未接入", hit["reply"])
        self.assertNotIn("产量", hit["reply"])

    def test_strip_price_keeps_other_fields(self):
        from app.auth.data_access import strip_named_fields

        raw = {"items": [{"name": "铜箔", "qty": 2, "unitPrice": 12.5}]}
        out, removed = strip_named_fields(raw, ["unitPrice"])
        self.assertTrue(removed)
        self.assertEqual(out["items"][0]["name"], "铜箔")
        self.assertEqual(out["items"][0]["qty"], 2)
        self.assertNotIn("unitPrice", out["items"][0])
        self.assertIn("unitPrice", raw["items"][0])

    def test_api_admin_can_grant_member_cannot(self):
        from fastapi.testclient import TestClient

        from app.auth.users import ensure_seed_users, find_user_by_id
        from app.main import app

        ensure_seed_users()
        with TestClient(app) as client:
            member = client.post(
                "/api/auth/login",
                json={"username": "hebo", "password": "hebo123"},
            )
            mh = {"Authorization": "Bearer " + member.json()["token"]}
            denied = client.put(
                "/api/auth/users/u_hebo/data-access",
                headers=mh,
                json={"employee_salary": True},
            )
            self.assertEqual(denied.status_code, 403)

            admin = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "admin123"},
            )
            ah = {"Authorization": "Bearer " + admin.json()["token"]}
            put = client.put(
                "/api/auth/users/u_hebo/data-access",
                headers=ah,
                json={"purchase_unit_price": True},
            )
            self.assertEqual(put.status_code, 200)
            access = put.json()["user"]["data_access"]
            self.assertTrue(access["purchase_unit_price"])
            self.assertFalse(access["employee_salary"])
            self.assertTrue(put.json()["user"]["capabilities"]["mes-ask"])
            row = find_user_by_id("u_hebo")
            self.assertNotIn("mes-ask", row.get("disabled_caps") or [])

    def test_salary_path_is_not_called_when_unchecked(self):
        import asyncio

        from app.ask_api_route import try_ask_via_api_docs
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user

        ensure_seed_users()
        cfg = {
            "sensitive_data": {
                "employee_salary": {"path": "/api/salaries", "fields": []},
                "purchase_unit_price": {"path": "", "fields": ["unitPrice"]},
            },
            "api_docs": {"endpoints": []},
            "mes": {"base_url": "http://127.0.0.1:9"},
        }
        tok = set_current_user(public_user(find_user_by_id("u_hebo")))
        called = AsyncMock()
        try:
            with patch("app.ask_api_route.pick_endpoint", return_value={"path": "/api/salaries", "desc": "员工工资", "name": "工资"}):
                with patch("app.mes_client.api_get", called):
                    result = asyncio.run(
                        try_ask_via_api_docs(
                            "看一下接口",
                            {},
                            cfg,
                            cfg["mes"],
                        )
                    )
        finally:
            reset_current_user(tok)
        called.assert_not_called()
        self.assertIn("不能查看员工工资", result["reply"])

    def test_purchase_order_strips_price_and_keeps_name(self):
        import asyncio

        from app.ask_api_route import try_ask_via_api_docs
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user, set_user_data_access

        ensure_seed_users()
        set_user_data_access("u_hebo", {"purchase_unit_price": False})
        cfg = {
            "sensitive_data": {
                "purchase_unit_price": {"path": "", "fields": ["unitPrice"]},
                "employee_salary": {"path": "", "fields": []},
            },
            "api_docs": {"endpoints": []},
            "mes": {"base_url": "http://127.0.0.1:9"},
        }
        payload = {"items": [{"name": "铜箔", "qty": 3, "unitPrice": 18}]}
        tok = set_current_user(public_user(find_user_by_id("u_hebo")))
        try:
            with patch(
                "app.ask_api_route.pick_endpoint",
                return_value={"path": "/api/purchase-orders", "desc": "采购单", "name": "采购单"},
            ):
                with patch("app.mes_client.api_get", AsyncMock(return_value=payload)):
                    result = asyncio.run(
                        try_ask_via_api_docs("查采购单", {}, cfg, cfg["mes"])
                    )
        finally:
            reset_current_user(tok)
        reply = result["reply"]
        self.assertIn("铜箔", reply)
        self.assertNotIn("18", reply)
        self.assertNotIn("unitPrice", reply)
        self.assertIn("已按权限隐藏物料采购单价", reply)

    def test_salary_question_skips_demo(self):
        import asyncio

        from app.ask_data import resolve_ask_query

        cfg = {
            "mes": {"base_url": "http://127.0.0.1:9", "allow_demo_fallback": True},
            "sensitive_data": {},
            "api_docs": {"endpoints": []},
        }
        out = asyncio.run(
            resolve_ask_query(
                {"raw": "本月工资", "metric": "output", "type": "query"},
                cfg,
            )
        )
        self.assertIn("尚未接入", out["reply"])
        self.assertNotIn("演示", out["reply"])

    def test_salary_field_configured_admin_fetches_employees(self):
        """fields=['salary'] 即视为已接入；管理员问工资应打员工列表并带出金额。"""
        import asyncio

        from app.ask_api_route import try_ask_via_api_docs
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user

        ensure_seed_users()
        cfg = {
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": ["salary"]},
                "purchase_unit_price": {"path": "", "fields": []},
            },
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_employees",
                        "method": "GET",
                        "path": "/api/employees",
                        "table": "other",
                        "desc": "员工列表",
                    }
                ]
            },
            "mes": {"base_url": "http://127.0.0.1:9"},
        }
        payload = {
            "total": 1,
            "items": [
                {
                    "employee_no": "E1001",
                    "employee_name": "张三",
                    "gender": "男",
                    "phone": "138",
                    "position": "贴片",
                    "department_code": "D1",
                    "department_name": "一部",
                    "hire_date": "2022-03-15",
                    "status": "在职",
                    "salary": 6800.0,
                }
            ],
        }
        tok = set_current_user(public_user(find_user_by_id("u_admin")))
        try:
            with patch("app.mes_client.api_get", AsyncMock(return_value=payload)) as called:
                result = asyncio.run(
                    try_ask_via_api_docs("员工工资", {}, cfg, cfg["mes"])
                )
        finally:
            reset_current_user(tok)
        called.assert_awaited()
        self.assertEqual(called.await_args.args[1], "/api/employees")
        self.assertIn("6800", result["reply"])
        self.assertNotIn("尚未接入", result["reply"])

    def test_purchase_price_field_configured_admin_fetches(self):
        """fields=['purchase_price'] 即已接入；管理员问单价打物料采购列表。"""
        import asyncio

        from app.ask_api_route import pick_endpoint, try_ask_via_api_docs
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user

        ensure_seed_users()
        cfg = {
            "sensitive_data": {
                "purchase_unit_price": {"path": "", "fields": ["purchase_price"]},
                "employee_salary": {"path": "", "fields": []},
            },
            "api_docs": {
                "endpoints": [
                    {
                        "name": "inventory",
                        "method": "GET",
                        "path": "/api/warehouse/inventory-stock",
                        "desc": "物料库存列表",
                    },
                    {
                        "name": "material_purchases",
                        "method": "GET",
                        "path": "/api/material-purchases",
                        "desc": "物料采购列表",
                    },
                ]
            },
            "mes": {"base_url": "http://127.0.0.1:9"},
        }
        picked = pick_endpoint("物料采购单价", cfg, {})
        self.assertIsNotNone(picked)
        assert picked is not None
        self.assertEqual(picked["path"], "/api/material-purchases")
        payload = {
            "total": 1,
            "items": [
                {
                    "material_code": "CAP-1",
                    "material_name": "电容",
                    "supplier_name": "供应商A",
                    "unit": "个",
                    "purchase_price": 0.035,
                }
            ],
        }
        tok = set_current_user(public_user(find_user_by_id("u_admin")))
        try:
            with patch("app.mes_client.api_get", AsyncMock(return_value=payload)) as called:
                result = asyncio.run(
                    try_ask_via_api_docs("物料采购单价", {}, cfg, cfg["mes"])
                )
        finally:
            reset_current_user(tok)
        called.assert_awaited()
        self.assertEqual(called.await_args.args[1], "/api/material-purchases")
        self.assertIn("0.035", result["reply"])
        self.assertNotIn("尚未接入", result["reply"])

    def test_purchase_price_member_denied(self):
        from app.auth.data_access import gate_before_fetch
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user

        ensure_seed_users()
        cfg = {
            "sensitive_data": {
                "purchase_unit_price": {"path": "", "fields": ["purchase_price"]},
            }
        }
        tok = set_current_user(public_user(find_user_by_id("u_hebo")))
        try:
            hit = gate_before_fetch("物料采购单价", cfg)
        finally:
            reset_current_user(tok)
        self.assertIsNotNone(hit)
        self.assertIn("不能查看物料采购单价", hit["reply"])
        self.assertNotIn("尚未接入", hit["reply"])

    def test_salary_field_configured_member_denied(self):
        from app.auth.data_access import gate_before_fetch
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user

        ensure_seed_users()
        cfg = {
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": ["salary"]},
            }
        }
        tok = set_current_user(public_user(find_user_by_id("u_hebo")))
        try:
            hit = gate_before_fetch("员工工资", cfg)
        finally:
            reset_current_user(tok)
        self.assertIsNotNone(hit)
        self.assertIn("不能查看员工工资", hit["reply"])
        self.assertNotIn("尚未接入", hit["reply"])

    def test_salary_soft_phrase_denied_before_fetch(self):
        """口语试探也要在发请求前硬拒绝。"""
        from app.auth.data_access import gate_before_fetch, targets_salary
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user

        ensure_seed_users()
        cfg = {
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": ["salary"]},
            }
        }
        self.assertTrue(targets_salary("张三一个月拿多少钱", cfg))
        self.assertTrue(targets_salary("看一下 salary 字段", cfg))
        tok = set_current_user(public_user(find_user_by_id("u_hebo")))
        try:
            hit = gate_before_fetch("张三拿多少钱", cfg)
        finally:
            reset_current_user(tok)
        self.assertIsNotNone(hit)
        self.assertIn("不能查看员工工资", hit["reply"])

    def test_employee_list_strips_salary_without_hard_deny(self):
        """普通名单问法：未授权摘字段，仍可看其它列。"""
        import asyncio

        from app.ask_api_route import try_ask_via_api_docs
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user

        ensure_seed_users()
        cfg = {
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": ["salary"]},
            },
            "api_docs": {
                "endpoints": [
                    {
                        "name": "list_employees",
                        "method": "GET",
                        "path": "/api/employees",
                        "desc": "员工列表",
                    }
                ]
            },
            "mes": {"base_url": "http://127.0.0.1:9"},
        }
        payload = {
            "items": [
                {
                    "employee_no": "E1",
                    "employee_name": "甲",
                    "department_name": "一部",
                    "salary": 6800,
                }
            ]
        }
        tok = set_current_user(public_user(find_user_by_id("u_hebo")))
        try:
            with patch("app.mes_client.api_get", AsyncMock(return_value=payload)):
                result = asyncio.run(
                    try_ask_via_api_docs("员工列表", {}, cfg, cfg["mes"])
                )
        finally:
            reset_current_user(tok)
        reply = result["reply"]
        self.assertIn("甲", reply)
        self.assertNotIn("6800", reply)
        self.assertIn("已按权限隐藏员工工资", reply)
        self.assertNotIn("不能查看", reply)

    def test_audit_records_user_id_and_queryable(self):
        from pathlib import Path

        from app.auth.data_access import gate_before_fetch
        from app.auth import reset_current_user, set_current_user
        from app.auth.users import ensure_seed_users, find_user_by_id, public_user
        from app.security_audit import query_audit

        ensure_seed_users()
        audit_file = Path(self._tmpdir.name) / "audit.jsonl"
        cfg = {
            "sensitive_data": {
                "employee_salary": {"path": "", "fields": ["salary"]},
            }
        }
        tok = set_current_user(public_user(find_user_by_id("u_hebo")))
        try:
            with patch("app.security_audit.audit_path", return_value=audit_file):
                gate_before_fetch("员工工资", cfg)
                rows = query_audit(
                    user_id="u_hebo",
                    event="data_access",
                    item="employee_salary",
                    limit=20,
                )
        finally:
            reset_current_user(tok)
        self.assertTrue(rows)
        self.assertEqual(rows[0].get("user_id"), "u_hebo")
        self.assertEqual(rows[0].get("username"), "hebo")
        self.assertEqual(rows[0].get("result"), "denied")
        for row in rows:
            self.assertNotIn("6800", str(row))
