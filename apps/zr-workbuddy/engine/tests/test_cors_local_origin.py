"""桌面一体包登录：CORS 必须放行本机任意回环端口。

桌面引擎默认 :18000、宿主可能是 :13081+（findFreePort）。
白名单只写 3081/13080/8000 时，登录 OPTIONS 预检失败，浏览器显示 Failed to fetch。
"""

from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

from fastapi.testclient import TestClient

from app.main import app


def _preflight(client: TestClient, origin: str):
    return client.options(
        "/api/auth/login",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )


class CorsLocalOriginTests(unittest.TestCase):
    def test_preflight_allows_desktop_engine_and_shifted_host(self):
        with TestClient(app) as client:
            for origin in (
                "http://127.0.0.1:18000",
                "http://localhost:18000",
                "http://127.0.0.1:13081",
                "http://127.0.0.1:3081",
            ):
                r = _preflight(client, origin)
                self.assertEqual(r.status_code, 200, origin)
                self.assertEqual(
                    r.headers.get("access-control-allow-origin"),
                    origin,
                    origin,
                )

    def test_preflight_rejects_remote_origin(self):
        with TestClient(app) as client:
            r = _preflight(client, "http://evil.example")
            self.assertNotEqual(r.headers.get("access-control-allow-origin"), "http://evil.example")

    def test_login_post_echoes_desktop_origin(self):
        from app.auth.users import ensure_seed_users

        ensure_seed_users()
        origin = "http://127.0.0.1:18000"
        with TestClient(app) as client:
            r = client.post(
                "/api/auth/login",
                json={"username": "hebo", "password": "hebo123"},
                headers={"Origin": origin},
            )
            self.assertEqual(r.status_code, 200)
            self.assertTrue(r.json().get("ok"))
            self.assertEqual(r.headers.get("access-control-allow-origin"), origin)
