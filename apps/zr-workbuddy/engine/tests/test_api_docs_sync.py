"""接口文档地址记住与再拉：失败保留清单，不改数据权限，问数不拉取。"""

from __future__ import annotations

import copy
import inspect
import os
import sys
import tempfile
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


def _cfg():
    return {
        "sensitive_data": {
            "purchase_unit_price": {"path": "/api/price", "fields": ["unitPrice"]},
            "employee_salary": {"path": "", "fields": ["salary"]},
        },
        "api_docs": {
            "source_url": "http://10.0.0.8/openapi.json",
            "sync_interval_sec": 3600,
            "endpoints": [{"name": "工单", "method": "GET", "path": "/api/orders", "desc": "旧"}],
            "query_bindings": {"今日产量": "/api/orders"},
            "raw_docs": "keep",
        },
    }


class ApiDocsSyncTests(unittest.TestCase):
    def test_url_commit_remembers_address_file_commit_stops_it(self):
        from app.api_docs_sync import apply_commit

        docs = {"endpoints": [], "source_url": "", "raw_docs": "x"}
        apply_commit(
            docs,
            [{"method": "GET", "path": "/api/orders"}],
            source_url="http://10.0.0.8/docs",
            clear_source=False,
        )
        self.assertEqual(docs["source_url"], "http://10.0.0.8/docs")
        self.assertEqual(docs["raw_docs"], "x")

        apply_commit(
            docs,
            [{"method": "GET", "path": "/api/local"}],
            source_url=None,
            clear_source=True,
        )
        self.assertEqual(docs["source_url"], "")
        self.assertEqual(docs["endpoints"][0]["path"], "/api/local")

    def test_clear_endpoints_forgets_address(self):
        from app.api_docs_sync import apply_commit

        docs = {
            "source_url": "http://10.0.0.8/openapi.json",
            "source_username": "admin",
            "source_password": "secret-pass",
            "endpoints": [{"path": "/a"}],
        }
        apply_commit(docs, [], source_url="http://10.0.0.8/openapi.json", clear_source=False)
        self.assertEqual(docs["source_url"], "")
        self.assertEqual(docs["source_username"], "")
        self.assertEqual(docs["source_password"], "")
        self.assertEqual(docs["endpoints"], [])

    def test_remember_source_keeps_masked_password_and_catalog(self):
        from app.config_store import MASK
        from app.api_docs_sync import remember_source, resolve_source_password

        docs = {
            "source_url": "",
            "source_password": "secret-pass",
            "endpoints": [{"path": "/api/orders"}],
        }
        remember_source(
            docs,
            url="http://10.0.0.8/docs",
            username="admin",
            password=MASK,
        )
        self.assertEqual(docs["source_url"], "http://10.0.0.8/docs")
        self.assertEqual(docs["source_username"], "admin")
        self.assertEqual(docs["source_password"], "secret-pass")
        self.assertEqual(docs["endpoints"][0]["path"], "/api/orders")
        self.assertEqual(resolve_source_password("secret-pass", MASK), "secret-pass")
        self.assertEqual(resolve_source_password("secret-pass", "new-pass"), "new-pass")

    def test_refresh_keeps_the_typed_url(self):
        from app.api_docs_sync import apply_refresh

        cfg = _cfg()
        cfg["api_docs"]["source_url"] = "http://10.0.0.8/docs"
        cfg["api_docs"]["source_username"] = "admin"
        cfg["api_docs"]["source_password"] = "secret-pass"
        apply_refresh(
            cfg,
            [{"name": "采购", "method": "GET", "path": "/api/purchase", "desc": "新"}],
            fetched_url="http://10.0.0.8/openapi.json",
            started_url="http://10.0.0.8/docs",
        )
        self.assertEqual(cfg["api_docs"]["source_url"], "http://10.0.0.8/docs")
        self.assertEqual(cfg["api_docs"]["source_password"], "secret-pass")

    def test_public_view_does_not_include_password(self):
        from app.api_docs_sync import public_sync_view, set_status_path

        cfg = _cfg()
        cfg["api_docs"]["source_password"] = "secret-pass"
        cfg["api_docs"]["source_username"] = "admin"
        tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        tmp.close()
        try:
            set_status_path(tmp.name)
            view = public_sync_view(cfg)
            self.assertEqual(view["source_username"], "admin")
            self.assertNotIn("secret-pass", str(view))
            self.assertNotIn("source_password", view)
        finally:
            set_status_path(None)
            os.remove(tmp.name)

    def test_refresh_replaces_only_endpoints(self):
        from app.api_docs_sync import apply_refresh

        cfg = _cfg()
        sensitive = copy.deepcopy(cfg["sensitive_data"])
        action, detail = apply_refresh(
            cfg,
            [{"name": "采购", "method": "GET", "path": "/api/purchase", "desc": "新"}],
            fetched_url="http://10.0.0.8/openapi.json",
            started_url="http://10.0.0.8/openapi.json",
        )
        self.assertEqual(action, "replaced")
        self.assertEqual(detail, "")
        self.assertEqual(cfg["api_docs"]["endpoints"][0]["path"], "/api/purchase")
        self.assertNotIn("query_bindings", cfg["api_docs"])
        self.assertEqual(cfg["api_docs"]["raw_docs"], "keep")
        self.assertEqual(cfg["sensitive_data"], sensitive)

    def test_failed_parse_keeps_previous_list(self):
        from app.api_docs_sync import apply_refresh

        cfg = _cfg()
        before = copy.deepcopy(cfg)
        action, detail = apply_refresh(
            cfg,
            [],
            fetched_url="http://10.0.0.8/openapi.json",
            started_url="http://10.0.0.8/openapi.json",
        )
        self.assertEqual(action, "rejected")
        self.assertIn("保留上一份", detail)
        self.assertEqual(cfg, before)

    def test_source_changed_during_fetch_is_discarded(self):
        from app.api_docs_sync import apply_refresh

        cfg = _cfg()
        cfg["api_docs"]["source_url"] = "http://10.0.0.9/openapi.json"
        before = copy.deepcopy(cfg["api_docs"]["endpoints"])
        action, _detail = apply_refresh(
            cfg,
            [{"method": "GET", "path": "/api/new", "name": "新", "desc": ""}],
            fetched_url="http://10.0.0.8/openapi.json",
            started_url="http://10.0.0.8/openapi.json",
        )
        self.assertEqual(action, "source_gone")
        self.assertEqual(cfg["api_docs"]["endpoints"], before)

    def test_unchanged_keeps_bindings(self):
        from app.api_docs_sync import apply_refresh

        cfg = _cfg()
        action, _detail = apply_refresh(
            cfg,
            [{"name": "工单", "method": "GET", "path": "/api/orders", "desc": "旧"}],
            fetched_url="http://10.0.0.8/openapi.json",
            started_url="http://10.0.0.8/openapi.json",
        )
        self.assertEqual(action, "unchanged")
        self.assertIn("query_bindings", cfg["api_docs"])

    def test_interval_and_mes_auth_stay_narrow(self):
        from app.api_docs_sync import clamp_interval, mes_auth_for

        self.assertEqual(clamp_interval(10), 300)
        self.assertEqual(clamp_interval(3600), 3600)
        self.assertEqual(clamp_interval(10**9), 86400)
        self.assertEqual(clamp_interval("nope"), 86400)
        mes = {
            "auth_type": "password",
            "username": "u",
            "password": "p",
            "base_url": "http://10.0.0.8/api",
        }
        self.assertEqual(mes_auth_for("http://10.0.0.8/openapi.json", mes), ("u", "p"))
        self.assertEqual(mes_auth_for("http://10.0.0.9/openapi.json", mes), ("", ""))
        token = dict(mes, auth_type="token")
        self.assertEqual(mes_auth_for("http://10.0.0.8/openapi.json", token), ("", ""))

    def test_status_roundtrip_has_no_secret(self):
        from app.api_docs_sync import note_error, note_ok, public_sync_view, set_status_path

        tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        tmp.close()
        try:
            set_status_path(tmp.name)
            note_error("http://user:secret@10.0.0.8/openapi.json 超时")
            view = public_sync_view(_cfg())
            self.assertNotIn("secret", view["last_error"])
            self.assertTrue(view["last_error_at"])
            note_ok(3)
            view = public_sync_view(_cfg())
            self.assertEqual(view["last_error"], "")
            self.assertEqual(view["last_count"], 3)
            self.assertNotIn("password", view)
        finally:
            set_status_path(None)
            os.remove(tmp.name)

    def test_ask_does_not_fetch_the_document(self):
        import app.ask_api_route as route
        import app.ask_data as ask

        src = inspect.getsource(route) + inspect.getsource(ask)
        self.assertNotIn("refresh_saved", src)
        self.assertNotIn("fetch_openapi", src)
        self.assertNotIn("api_docs_sync", src)

    def test_sync_route_is_registered(self):
        from app.main import app

        paths = {getattr(route, "path", "") for route in app.routes}
        self.assertIn("/api/config/import/swagger/sync", paths)

    def test_empty_form_does_not_override_saved(self):
        from app.api_docs_sync import form_overrides_saved
        from app.config_store import MASK

        self.assertFalse(form_overrides_saved(url="", username="", password=""))
        self.assertFalse(form_overrides_saved(url="", username="", password=MASK))
        self.assertTrue(form_overrides_saved(url="http://10.0.0.8/docs", username="", password=""))
        self.assertTrue(form_overrides_saved(url="", username="admin", password=""))

    def test_ensure_docs_creds_from_mes_only_fills_empty(self):
        from app.api_docs_sync import ensure_docs_creds_from_mes

        cfg = {
            "mes": {
                "auth_type": "password",
                "username": "admin",
                "password": "admin123",
                "base_url": "http://127.0.0.1:8009",
            },
            "api_docs": {
                "source_url": "http://127.0.0.1:8009/docs",
                "source_username": "",
                "source_password": "",
            },
        }
        self.assertTrue(ensure_docs_creds_from_mes(cfg))
        self.assertEqual(cfg["api_docs"]["source_username"], "admin")
        self.assertEqual(cfg["api_docs"]["source_password"], "admin123")
        cfg["api_docs"]["source_username"] = "kept"
        cfg["api_docs"]["source_password"] = "kept-pass"
        self.assertFalse(ensure_docs_creds_from_mes(cfg))
        self.assertEqual(cfg["api_docs"]["source_username"], "kept")

    def test_empty_form_sync_does_not_wipe_username(self):
        import asyncio
        from unittest.mock import AsyncMock, patch

        from app.api_docs_sync import refresh_saved_async

        cfg = {
            "mes": {},
            "api_docs": {
                "source_url": "http://10.0.0.8/docs",
                "source_username": "admin",
                "source_password": "secret-pass",
                "endpoints": [
                    {"name": "工单", "method": "GET", "path": "/api/orders", "desc": "旧"}
                ],
            },
        }
        parsed = {
            "ok": True,
            "endpoints": [
                {"name": "工单", "method": "GET", "path": "/api/orders", "desc": "旧"}
            ],
        }

        def fake_update(mutator, side_effects=True):
            mutator(cfg)
            return cfg

        with patch("app.config_store.load_config", return_value=cfg):
            with patch("app.config_store.update_config", side_effect=fake_update):
                with patch(
                    "app.api_docs_sync.fetch_openapi",
                    new=AsyncMock(
                        return_value=(
                            '{"openapi":"3.0.0","paths":{}}',
                            "http://10.0.0.8/docs",
                        )
                    ),
                ):
                    with patch("app.api_docs_sync.parse_api_doc", return_value=parsed):
                        with patch("app.api_docs_sync.note_ok"):
                            out = asyncio.run(
                                refresh_saved_async(
                                    url="", username="", password="", from_form=True
                                )
                            )
        self.assertTrue(out.get("ok"))
        self.assertEqual(cfg["api_docs"]["source_username"], "admin")
        self.assertEqual(cfg["api_docs"]["source_password"], "secret-pass")

    def test_sync_due_respects_daily_interval(self):
        from app.api_docs_sync import is_sync_due, note_error, note_ok, set_status_path

        cfg = {
            "api_docs": {
                "source_url": "http://10.0.0.8/docs",
                "sync_interval_sec": 86400,
            }
        }
        tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        tmp.close()
        try:
            set_status_path(tmp.name)
            self.assertTrue(is_sync_due(cfg))
            note_ok(10)
            self.assertFalse(is_sync_due(cfg))
            # 失败也计入冷却，避免每次打开 MES 连接都重试拖慢界面
            note_error("超时")
            self.assertFalse(is_sync_due(cfg))
        finally:
            set_status_path(None)
            os.remove(tmp.name)


if __name__ == "__main__":
    unittest.main()
