"""引擎冒烟测试（标准库 unittest，不依赖 pytest / 外网）。"""

from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

from fastapi.testclient import TestClient

from app.health import llm_ready
from app.main import app
from app.nl_engine import parse_question


class SmokeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_runtime(self):
        r = self.client.get("/api/runtime")
        self.assertEqual(r.status_code, 200)
        data = r.json()
        self.assertTrue(data.get("ok"))
        self.assertIn("port", data)

    def test_status(self):
        r = self.client.get("/api/status")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json().get("ok"))

    def test_workbuddy_health_aliases(self):
        for path in ("/health", "/api/health", "/api/workbuddy/health"):
            r = self.client.get(path)
            self.assertEqual(r.status_code, 200, path)
            data = r.json()
            self.assertTrue(data.get("ok"), path)
            self.assertIn("ready", data)
            self.assertIn("dsh_web", data)
            self.assertIn("endpoints", data)
            self.assertEqual(data["endpoints"].get("chat_stream"), "/api/chat/stream")

    def test_cli_status(self):
        from unittest import mock

        from app import plugins_store

        # HTTP /api/cli status 受 mes-config 启停门闸；测试强制视为已启用
        with mock.patch.object(plugins_store, "is_enabled", return_value=True):
            r = self.client.post("/api/cli", json={"cmd": "status", "args": []})
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json().get("ok"))

    def test_wip_intent(self):
        intent = parse_question("今日再制品工单有多少个")
        self.assertEqual(intent.get("metric"), "in_progress_orders")

    def test_plugins_snapshot(self):
        from app import plugins_store
        snap = plugins_store.snapshot()
        self.assertTrue(snap.get("ok"))
        ids = {m["id"] for m in snap["available"]}
        self.assertIn("mes-ask", ids)
        self.assertIn("mes-pcb", ids)
        for m in snap["available"]:
            self.assertEqual(m.get("kind"), "feature")
            self.assertTrue(str(m.get("path") or "").startswith("features/"))
            # 系统性包不得出现在功能列表
            self.assertNotIn("bridge", m["id"])
            self.assertNotIn("runtime", m["id"])

    def test_plugins_http(self):
        r = self.client.get("/api/plugins")
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json().get("ok"))

    def test_llm_ready_none(self):
        self.assertFalse(llm_ready({"deepseek": {"provider": "none"}}))

    def test_llm_ready_openai_compat(self):
        self.assertFalse(
            llm_ready({"deepseek": {"provider": "openai_compat", "api_key": "sk-x", "model": ""}})
        )
        self.assertTrue(
            llm_ready(
                {"deepseek": {"provider": "openai_compat", "api_key": "sk-x", "model": "glm-4-flash"}}
            )
        )


if __name__ == "__main__":
    unittest.main()
