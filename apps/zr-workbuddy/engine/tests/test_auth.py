"""本机账号：种子用户、JWT、active 会话、用量 user_id。"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class AuthModuleTests(unittest.TestCase):
    def setUp(self):
        self._tmpdir = tempfile.TemporaryDirectory()
        from app.auth import paths as auth_paths
        from app.usage import store as usage_store

        self._auth_paths = auth_paths
        self._usage_store = usage_store
        auth_paths.set_data_dir(self._tmpdir.name)
        usage_store.set_data_dir(os.path.join(self._tmpdir.name, "usage"))

    def tearDown(self):
        self._auth_paths.set_data_dir(None)
        self._usage_store.set_data_dir(None)
        self._tmpdir.cleanup()

    def test_seed_and_login_password(self):
        from app.auth.users import ensure_seed_users, public_user, verify_password

        ensure_seed_users()
        ensure_seed_users()  # idempotent
        u = verify_password("hebo", "hebo123")
        self.assertIsNotNone(u)
        self.assertEqual(u["id"], "u_hebo")
        self.assertEqual(public_user(u)["role"], "user")
        self.assertIsNone(verify_password("hebo", "wrong"))
        admin = verify_password("admin", "admin123")
        self.assertEqual(admin["role"], "admin")

    def test_jwt_roundtrip(self):
        from app.auth.tokens import issue_token, verify_token

        tok, exp = issue_token(user_id="u_hebo", username="hebo", role="user", ttl_sec=3600)
        self.assertGreater(exp, 0)
        claims = verify_token(tok)
        self.assertEqual(claims["id"], "u_hebo")
        self.assertEqual(claims["username"], "hebo")
        self.assertIsNone(verify_token(tok[:-2] + "xx"))

    def test_login_me_logout_api(self):
        from fastapi.testclient import TestClient

        from app.auth.users import ensure_seed_users
        from app.main import app

        ensure_seed_users()
        with TestClient(app) as client:
            bad = client.post("/api/auth/login", json={"username": "hebo", "password": "x"})
            self.assertEqual(bad.status_code, 401)
            ok = client.post("/api/auth/login", json={"username": "hebo", "password": "hebo123"})
            self.assertEqual(ok.status_code, 200)
            body = ok.json()
            self.assertTrue(body.get("ok"))
            self.assertTrue(body.get("token"))
            me = client.get(
                "/api/auth/me",
                headers={"Authorization": "Bearer " + body["token"]},
            )
            self.assertTrue(me.json().get("authenticated"))
            self.assertEqual(me.json()["user"]["username"], "hebo")
            out = client.post("/api/auth/logout")
            self.assertTrue(out.json().get("ok"))
            # 登出后用量须登录
            usage = client.get("/api/usage/summary?days=1")
            self.assertEqual(usage.status_code, 401)
            docs = client.get("/openapi.json")
            self.assertEqual(docs.status_code, 200)

    def test_backfill_and_filter_by_user(self):
        from app.usage.store import append_event, backfill_orphan_user_id, summarize

        append_event(
            source="llm",
            lane="chat",
            provider="t",
            model="m",
            tokens={
                "prompt_tokens": 1,
                "completion_tokens": 1,
                "total_tokens": 2,
                "quality": "provider",
            },
        )
        # 无登录时 user_id 为空
        n = backfill_orphan_user_id(default_user_id="u_hebo")
        self.assertGreaterEqual(n, 1)
        self.assertEqual(backfill_orphan_user_id(default_user_id="u_hebo"), 0)  # idempotent
        hebo = summarize(days=7, user_id="u_hebo")
        admin = summarize(days=7, user_id="u_admin")
        self.assertEqual(hebo["llm"]["tokens"], 2)
        self.assertEqual(admin["llm"]["tokens"], 0)

    def test_active_and_append_user_id(self):
        from app.auth.active import clear_active, get_active_user, set_active
        from app.auth.users import ensure_seed_users, public_user, verify_password
        from app.usage.store import append_event

        ensure_seed_users()
        u = public_user(verify_password("hebo", "hebo123"))
        set_active(u, exp=2_000_000_000)
        self.assertEqual(get_active_user()["id"], "u_hebo")
        evt = append_event(
            source="llm",
            lane="chat",
            provider="test",
            model="m",
            tokens={
                "prompt_tokens": 1,
                "completion_tokens": 2,
                "total_tokens": 3,
                "quality": "provider",
            },
        )
        self.assertIsNotNone(evt)
        self.assertEqual(evt["user_id"], "u_hebo")
        clear_active()
        evt2 = append_event(
            source="llm",
            lane="chat",
            provider="test",
            model="m",
            tokens={
                "prompt_tokens": 1,
                "completion_tokens": 1,
                "total_tokens": 2,
                "quality": "provider",
            },
        )
        self.assertEqual(evt2.get("user_id") or "", "")

    def test_usage_requires_bearer_not_active_only(self):
        """active.json 不得单独打开用量 HTTP（防跨账号读）。"""
        from fastapi.testclient import TestClient

        from app.auth.active import set_active
        from app.auth.users import ensure_seed_users, public_user, verify_password
        from app.main import app

        ensure_seed_users()
        u = public_user(verify_password("hebo", "hebo123"))
        set_active(u, exp=2_000_000_000)
        with TestClient(app) as client:
            denied = client.get("/api/usage/summary?days=1")
            self.assertEqual(denied.status_code, 401)
            login = client.post(
                "/api/auth/login",
                json={"username": "hebo", "password": "hebo123"},
            )
            ok = client.get(
                "/api/usage/summary?days=1",
                headers={"Authorization": "Bearer " + login.json()["token"]},
            )
            self.assertEqual(ok.status_code, 200)

    def test_disabled_user_jwt_rejected_and_change_password(self):
        from fastapi.testclient import TestClient

        from app.auth.users import ensure_seed_users, set_user_disabled
        from app.main import app

        ensure_seed_users()
        with TestClient(app) as client:
            login = client.post(
                "/api/auth/login",
                json={"username": "hebo", "password": "hebo123"},
            )
            token = login.json()["token"]
            ch = client.post(
                "/api/auth/change-password",
                json={
                    "username": "hebo",
                    "old_password": "hebo123",
                    "new_password": "hebo12345",
                },
            )
            self.assertEqual(ch.status_code, 200)
            self.assertFalse(ch.json()["user"].get("must_change_password"))
            bad = client.post(
                "/api/auth/login",
                json={"username": "hebo", "password": "hebo123"},
            )
            self.assertEqual(bad.status_code, 401)
            self.assertTrue(set_user_disabled("u_hebo", True))
            denied = client.get(
                "/api/usage/summary?days=1",
                headers={"Authorization": "Bearer " + token},
            )
            self.assertEqual(denied.status_code, 401)

    def test_admin_users_crud_and_last_admin_guard(self):
        from fastapi.testclient import TestClient

        from app.auth.users import ensure_seed_users
        from app.main import app

        ensure_seed_users()
        with TestClient(app) as client:
            hebo = client.post(
                "/api/auth/login",
                json={"username": "hebo", "password": "hebo123"},
            )
            denied = client.get(
                "/api/auth/users",
                headers={"Authorization": "Bearer " + hebo.json()["token"]},
            )
            self.assertEqual(denied.status_code, 403)

            admin = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "admin123"},
            )
            ah = {"Authorization": "Bearer " + admin.json()["token"]}
            listed = client.get("/api/auth/users", headers=ah)
            self.assertEqual(listed.status_code, 200)
            self.assertGreaterEqual(len(listed.json().get("users") or []), 2)

            created = client.post(
                "/api/auth/users",
                headers=ah,
                json={
                    "username": "zhangsan",
                    "password": "zhangsan1",
                    "display_name": "张三",
                    "role": "user",
                },
            )
            self.assertEqual(created.status_code, 200)
            uid = created.json()["user"]["id"]
            self.assertEqual(uid, "u_zhangsan")
            self.assertTrue(created.json()["user"].get("must_change_password"))
            self.assertNotIn("password", created.json()["user"])
            self.assertNotIn("password_hash", created.json()["user"])

            patched = client.patch(
                f"/api/auth/users/{uid}",
                headers=ah,
                json={"role": "admin", "display_name": "张三管"},
            )
            self.assertEqual(patched.status_code, 200)
            self.assertEqual(patched.json()["user"]["role"], "admin")

            reset = client.post(
                f"/api/auth/users/{uid}/reset-password",
                headers=ah,
                json={"password": "newpass12"},
            )
            self.assertEqual(reset.status_code, 200)
            login_new = client.post(
                "/api/auth/login",
                json={"username": "zhangsan", "password": "newpass12"},
            )
            self.assertEqual(login_new.status_code, 200)

            disabled = client.post(f"/api/auth/users/{uid}/disable", headers=ah)
            self.assertEqual(disabled.status_code, 200)
            bad_login = client.post(
                "/api/auth/login",
                json={"username": "zhangsan", "password": "newpass12"},
            )
            self.assertEqual(bad_login.status_code, 401)

            # 停用 hebo 后仍可；停用唯一剩余 admin 须失败
            client.post("/api/auth/users/u_hebo/disable", headers=ah)
            last = client.post("/api/auth/users/u_admin/disable", headers=ah)
            self.assertEqual(last.status_code, 409)
            self.assertEqual(last.json().get("code"), "last_admin")

            demote = client.patch(
                "/api/auth/users/u_admin",
                headers=ah,
                json={"role": "user"},
            )
            self.assertEqual(demote.status_code, 409)

    def test_create_user_library_guards(self):
        from app.auth.users import UsersError, create_user, ensure_seed_users, set_user_disabled

        ensure_seed_users()
        with self.assertRaises(UsersError):
            create_user("hebo", "password1")
        with self.assertRaises(UsersError):
            create_user("1bad", "password1")
        with self.assertRaises(UsersError):
            set_user_disabled("u_admin", True)
        self.assertTrue(set_user_disabled("u_hebo", True))
        with self.assertRaises(UsersError):
            set_user_disabled("u_admin", True)

    def test_user_capabilities_default_on_and_gate(self):
        from fastapi.testclient import TestClient

        from app.auth import reset_current_user, set_active, set_current_user
        from app.auth.capabilities import deny_if_user_blocked, user_allows_feature
        from app.auth.users import (
            admin_public_user,
            ensure_seed_users,
            find_user_by_id,
            public_user,
            set_user_capabilities,
            verify_password,
        )
        from app.main import app
        from app import plugins_store

        ensure_seed_users()
        hebo = verify_password("hebo", "hebo123")
        # 默认全开：无 disabled_caps / 空列表都不拦
        self.assertTrue(user_allows_feature(hebo, "code-commit"))
        self.assertTrue(user_allows_feature({"id": "x", "disabled_caps": None}, "code-commit"))
        self.assertTrue(user_allows_feature({"id": "x", "disabled_caps": []}, "code-commit"))
        self.assertTrue(user_allows_feature(None, "code-commit"))
        self.assertTrue(user_allows_feature(hebo, "not-a-feature"))
        # 无执行人上下文：不拦（防误伤）
        self.assertIsNone(deny_if_user_blocked("code-commit", capability="人触发提交"))

        pub = admin_public_user(hebo)
        self.assertTrue(pub["capabilities"].get("code-deploy"))
        self.assertTrue(pub["capabilities"].get("mes-ask"))
        self.assertTrue(pub["capabilities"].get("code-commit"))

        set_user_capabilities("u_hebo", caps={"code-commit": False, "mes-ask": True})
        row = find_user_by_id("u_hebo")
        self.assertIn("code-commit", row.get("disabled_caps") or [])
        # 仅 active、无 ContextVar：不拦（避免误用别人的 active）
        set_active(public_user(row), exp=2_000_000_000)
        self.assertIsNone(deny_if_user_blocked("code-commit", capability="人触发提交"))
        # 绑定当前执行人后才拦
        tok = set_current_user(public_user(row))
        try:
            denied = deny_if_user_blocked("code-commit", capability="人触发提交")
            self.assertIsNotNone(denied)
            self.assertEqual(denied.get("source"), "user_capability")
            self.assertIn("没有「人触发提交」能力", denied.get("detail") or "")
            self.assertIn("联系管理员开通", denied.get("detail") or "")
            self.assertIn("无法自行开通", denied.get("detail") or "")
            self.assertNotIn("人员和角色", denied.get("detail") or "")
            self.assertIsNone(deny_if_user_blocked("mes-ask", capability="问数"))
            if plugins_store.is_enabled("code-commit"):
                blocked = plugins_store.require_enabled("code-commit", capability="人触发提交")
                self.assertIsNotNone(blocked)
                self.assertEqual(blocked.get("source"), "user_capability")
        finally:
            reset_current_user(tok)

        with TestClient(app) as client:
            admin = client.post(
                "/api/auth/login",
                json={"username": "admin", "password": "admin123"},
            )
            ah = {"Authorization": "Bearer " + admin.json()["token"]}
            put = client.put(
                "/api/auth/users/u_hebo/capabilities",
                headers=ah,
                json={"caps": {"code-commit": False}},
            )
            self.assertEqual(put.status_code, 200)
            self.assertFalse(put.json()["user"]["capabilities"].get("code-commit"))
            self.assertTrue(put.json()["user"]["capabilities"].get("code-review"))

            # Bearer=hebo 调提交接口应被人员能力拦住（全局插件仍启用时）
            hebo_login = client.post(
                "/api/auth/login",
                json={"username": "hebo", "password": "hebo123"},
            )
            hh = {"Authorization": "Bearer " + hebo_login.json()["token"]}
            if plugins_store.is_enabled("code-commit"):
                start = client.post(
                    "/api/code-commit/check",
                    headers={**hh, "Content-Type": "application/json"},
                    json={"workspace": "."},
                )
                body = start.json()
                self.assertFalse(body.get("ok"))
                self.assertEqual(body.get("source"), "user_capability")
                self.assertIn("没有", body.get("detail") or body.get("reply") or "")

    def test_coding_capability_means_dialog_coding(self):
        from app.auth import reset_current_user, set_current_user
        from app.auth.capabilities import (
            CODING_CAPABILITY_ID,
            catalog,
            coding_allowed_status,
            deny_if_coding_blocked,
        )
        from app.auth.users import (
            ensure_seed_users,
            find_user_by_id,
            public_user,
            set_user_capabilities,
            verify_password,
        )

        ensure_seed_users()
        labels = {c["id"]: c["label"] for c in catalog()}
        self.assertEqual(CODING_CAPABILITY_ID, "code-dev")
        self.assertIn("对话写码", labels.get("code-dev") or "")

        set_user_capabilities("u_hebo", caps={"code-dev": False})
        row = find_user_by_id("u_hebo")
        self.assertIsNone(deny_if_coding_blocked())  # 无执行人放行
        tok = set_current_user(public_user(row))
        try:
            denied = deny_if_coding_blocked()
            self.assertIsNotNone(denied)
            self.assertEqual(denied.get("source"), "user_capability")
            st = coding_allowed_status()
            self.assertTrue(st.get("ok"))
            self.assertFalse(st.get("allowed"))
        finally:
            reset_current_user(tok)
        # 恢复默认，避免污染其它用例
        set_user_capabilities("u_hebo", caps={"code-dev": True})
        verify_password("hebo", "hebo123")


if __name__ == "__main__":
    unittest.main()
