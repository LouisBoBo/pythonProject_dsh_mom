"""工程对接档案：迁移 / 解析 / 顶层镜像（P0 兼容）。"""
from __future__ import annotations

import os
import unittest
from copy import deepcopy


class MesProfileMigrateTest(unittest.TestCase):
    def test_empty_items_migrates_top_level_as_default_bundle(self) -> None:
        from app.mes_profile import ensure_mes_profiles

        cfg = {
            "mes": {"base_url": "http://mes-a.example", "username": "admin", "enterprise_code": "江西中软"},
            "api_docs": {
                "endpoints": [{"name": "产量", "method": "GET", "path": "/api/产量"}],
                "source_url": "http://docs.example/openapi.json",
            },
            "data_dictionary": {"work_orders": [{"mes_field": "工单号", "std_field": "work_order_no"}]},
            "code_dev": {"default_workspace": r"D:\proj\A"},
        }
        out, migrated = ensure_mes_profiles(cfg)
        self.assertTrue(migrated)
        mc = out["mes_connections"]
        self.assertEqual(mc["active_profile_id"], "default")
        self.assertEqual(len(mc["items"]), 1)
        item = mc["items"][0]
        self.assertEqual(item["id"], "default")
        self.assertEqual(item["mes"]["base_url"], "http://mes-a.example")
        self.assertEqual(item["api_docs"]["endpoints"][0]["path"], "/api/产量")
        self.assertEqual(item["api_docs"]["source_url"], "http://docs.example/openapi.json")
        self.assertEqual(item["data_dictionary"]["work_orders"][0]["std_field"], "work_order_no")
        self.assertTrue(any("proj" in str(p).replace("\\", "/") for p in item.get("workspace_roots") or []))

    def test_migrate_is_idempotent(self) -> None:
        from app.mes_profile import ensure_mes_profiles

        cfg = {
            "mes": {"base_url": "http://x"},
            "api_docs": {"endpoints": []},
            "data_dictionary": {},
        }
        once, m1 = ensure_mes_profiles(cfg)
        self.assertTrue(m1)
        twice, m2 = ensure_mes_profiles(once)
        self.assertFalse(m2)
        self.assertEqual(len(twice["mes_connections"]["items"]), 1)


class MesProfileResolveTest(unittest.TestCase):
    def _two_profiles(self) -> dict:
        return {
            "mes": {"base_url": "http://fallback"},
            "api_docs": {"endpoints": [{"path": "/fallback"}]},
            "data_dictionary": {},
            "mes_connections": {
                "active_profile_id": "default",
                "items": [
                    {
                        "id": "default",
                        "name": "默认",
                        "workspace_roots": [r"D:\proj\A"],
                        "mes": {"base_url": "http://a.example"},
                        "api_docs": {"endpoints": [{"path": "/a"}]},
                        "data_dictionary": {},
                    },
                    {
                        "id": "b",
                        "name": "B 厂",
                        "workspace_roots": [r"D:\proj\B"],
                        "mes": {"base_url": "http://b.example"},
                        "api_docs": {"endpoints": [{"path": "/b"}]},
                        "data_dictionary": {},
                    },
                ],
            },
        }

    def test_resolve_by_workspace_returns_matching_bundle(self) -> None:
        from app.mes_profile import resolve_mes_profile

        p = resolve_mes_profile(self._two_profiles(), workspace=r"D:\proj\B\subdir")
        self.assertEqual(p["id"], "b")
        self.assertEqual(p["mes"]["base_url"], "http://b.example")
        self.assertEqual(p["api_docs"]["endpoints"][0]["path"], "/b")

    def test_resolve_without_workspace_uses_active(self) -> None:
        from app.mes_profile import resolve_mes_profile

        p = resolve_mes_profile(self._two_profiles(), workspace=None)
        self.assertEqual(p["id"], "default")
        self.assertEqual(p["mes"]["base_url"], "http://a.example")

    def test_mirror_active_to_top_level(self) -> None:
        from app.mes_profile import ensure_mes_profiles, mirror_active_profile_to_top

        cfg = self._two_profiles()
        cfg["mes_connections"]["active_profile_id"] = "b"
        cfg, _ = ensure_mes_profiles(cfg)
        mirror_active_profile_to_top(cfg)
        self.assertEqual(cfg["mes"]["base_url"], "http://b.example")
        self.assertEqual(cfg["api_docs"]["endpoints"][0]["path"], "/b")

    def test_sync_top_into_active_keeps_other_profile_docs(self) -> None:
        from app.mes_profile import sync_top_level_into_active_profile

        cfg = self._two_profiles()
        cfg["mes"] = {"base_url": "http://a-updated"}
        cfg["api_docs"] = {"endpoints": [{"path": "/a2"}]}
        sync_top_level_into_active_profile(cfg)
        items = {i["id"]: i for i in cfg["mes_connections"]["items"]}
        self.assertEqual(items["default"]["mes"]["base_url"], "http://a-updated")
        self.assertEqual(items["default"]["api_docs"]["endpoints"][0]["path"], "/a2")
        self.assertEqual(items["b"]["api_docs"]["endpoints"][0]["path"], "/b")


class MesProfileCrudTest(unittest.TestCase):
    def test_select_preserves_other_docs_and_mirrors_top(self) -> None:
        from app.mes_profile import create_mes_profile, select_mes_profile

        cfg = {
            "mes": {"base_url": "http://a"},
            "api_docs": {"endpoints": [{"path": "/a"}]},
            "data_dictionary": {},
        }
        from app.mes_profile import ensure_mes_profiles, mirror_active_profile_to_top

        ensure_mes_profiles(cfg)
        mirror_active_profile_to_top(cfg)
        create_mes_profile(cfg, name="B", clone_from_active=False)
        # 给 B 写入独立文档
        b = next(i for i in cfg["mes_connections"]["items"] if i["id"] != "default")
        b["mes"] = {"base_url": "http://b"}
        b["api_docs"] = {"endpoints": [{"path": "/b"}]}
        select_mes_profile(cfg, b["id"])
        self.assertEqual(cfg["mes"]["base_url"], "http://b")
        self.assertEqual(cfg["api_docs"]["endpoints"][0]["path"], "/b")
        select_mes_profile(cfg, "default")
        self.assertEqual(cfg["mes"]["base_url"], "http://a")
        self.assertEqual(cfg["api_docs"]["endpoints"][0]["path"], "/a")

    def test_bind_workspace_conflict(self) -> None:
        from app.mes_profile import (
            bind_workspace_to_active,
            create_mes_profile,
            ensure_mes_profiles,
            select_mes_profile,
        )

        cfg = {"mes": {}, "api_docs": {}, "data_dictionary": {}}
        ensure_mes_profiles(cfg)
        bind_workspace_to_active(cfg, r"D:\proj\A")
        create_mes_profile(cfg, name="B")
        b = next(i for i in cfg["mes_connections"]["items"] if i["id"] != "default")
        select_mes_profile(cfg, b["id"])
        with self.assertRaises(ValueError):
            bind_workspace_to_active(cfg, r"D:\proj\A")

    def test_bind_rejects_shallow_root(self) -> None:
        from pathlib import Path

        from app.mes_profile import bind_workspace_to_active, ensure_mes_profiles

        cfg = {"mes": {}, "api_docs": {}, "data_dictionary": {}}
        ensure_mes_profiles(cfg)
        with self.assertRaises(ValueError):
            bind_workspace_to_active(cfg, str(Path.home()))
        if os.name == "nt":
            with self.assertRaises(ValueError):
                bind_workspace_to_active(cfg, "C:\\")


class MesProfileLoadSaveCompatTest(unittest.TestCase):
    def test_load_config_migrates_and_top_level_unchanged_for_readers(self) -> None:
        """现有读顶层 mes/api_docs 的路径：迁移后数值与迁移前一致。"""
        import tempfile
        from pathlib import Path
        from unittest import mock

        from app import config_store
        from app.mes_profile import ensure_mes_profiles

        sample = deepcopy(config_store.DEFAULT_CONFIG)
        sample["mes"]["base_url"] = "http://legacy-mes"
        sample["mes"]["username"] = "admin"
        sample["api_docs"]["endpoints"] = [{"name": "x", "method": "GET", "path": "/x"}]

        with tempfile.TemporaryDirectory() as tmp:
            cfg_path = Path(tmp) / "config.yaml"
            bak = Path(str(cfg_path) + ".bak")
            with mock.patch.object(config_store, "CONFIG_PATH", str(cfg_path)), mock.patch.object(
                config_store, "BACKUP_PATH", str(bak)
            ), mock.patch.object(config_store, "CONFIG_DIR", tmp), mock.patch.object(
                config_store, "_sync_dsh_chat_credential", lambda _c: None
            ), mock.patch.object(config_store, "_refresh_workbuddy_config_sidecar", lambda: None):
                config_store.save_config(sample, side_effects=False)
                loaded = config_store.load_config()
                self.assertEqual(loaded["mes"]["base_url"], "http://legacy-mes")
                self.assertEqual(loaded["api_docs"]["endpoints"][0]["path"], "/x")
                self.assertTrue(loaded.get("mes_connections", {}).get("items"))
                # 再 load 不重复增生档案
                loaded2 = config_store.load_config()
                self.assertEqual(len(loaded2["mes_connections"]["items"]), 1)

                # 旧 UI 只改顶层再保存：写入 active 档案，其它逻辑可读顶层
                loaded2["mes"]["base_url"] = "http://legacy-mes-2"
                loaded2["api_docs"]["endpoints"] = [{"name": "y", "method": "GET", "path": "/y"}]
                config_store.save_config(loaded2, side_effects=False)
                again = config_store.load_config()
                self.assertEqual(again["mes"]["base_url"], "http://legacy-mes-2")
                self.assertEqual(again["api_docs"]["endpoints"][0]["path"], "/y")
                item = again["mes_connections"]["items"][0]
                self.assertEqual(item["mes"]["base_url"], "http://legacy-mes-2")
                self.assertEqual(item["api_docs"]["endpoints"][0]["path"], "/y")


class MesProfileSecretMergeTest(unittest.TestCase):
    def test_merge_secrets_keeps_profile_passwords_when_masked(self) -> None:
        from app.config_store import MASK, merge_secrets

        saved = {
            "mes": {"base_url": "http://a", "password": "real_a", "token": "tok_a"},
            "api_docs": {},
            "data_dictionary": {},
            "mes_connections": {
                "active_profile_id": "default",
                "items": [
                    {
                        "id": "default",
                        "name": "A",
                        "workspace_roots": [],
                        "mes": {"base_url": "http://a", "password": "real_a", "token": "tok_a"},
                        "api_docs": {"source_password": "doc_a"},
                        "data_dictionary": {},
                    },
                    {
                        "id": "p1",
                        "name": "B",
                        "workspace_roots": [],
                        "mes": {"base_url": "http://b", "password": "real_b", "token": "tok_b"},
                        "api_docs": {},
                        "data_dictionary": {},
                    },
                ],
            },
        }
        incoming = {
            "mes": {"base_url": "http://a", "password": MASK, "token": MASK},
            "api_docs": {},
            "data_dictionary": {},
            "mes_connections": {
                "active_profile_id": "default",
                "items": [
                    {
                        "id": "default",
                        "name": "A",
                        "workspace_roots": [],
                        "mes": {"base_url": "http://a", "password": MASK, "token": MASK},
                        "api_docs": {"source_password": MASK},
                        "data_dictionary": {},
                    },
                    {
                        "id": "p1",
                        "name": "B",
                        "workspace_roots": [],
                        "mes": {"base_url": "http://b", "password": MASK, "token": MASK},
                        "api_docs": {},
                        "data_dictionary": {},
                    },
                ],
            },
        }
        out = merge_secrets(saved, incoming)
        items = {i["id"]: i for i in out["mes_connections"]["items"]}
        self.assertEqual(out["mes"]["password"], "real_a")
        self.assertEqual(items["default"]["mes"]["password"], "real_a")
        self.assertEqual(items["default"]["mes"]["token"], "tok_a")
        self.assertEqual(items["default"]["api_docs"]["source_password"], "doc_a")
        self.assertEqual(items["p1"]["mes"]["password"], "real_b")
        self.assertEqual(items["p1"]["mes"]["token"], "tok_b")


class MesProfileAskPickTest(unittest.TestCase):
    def test_empty_active_falls_back_to_only_configured_card(self) -> None:
        from app.mes_profile import cfg_for_ask

        cfg = {
            "mes": {"base_url": ""},
            "api_docs": {"endpoints": []},
            "data_dictionary": {},
            "mes_connections": {
                "active_profile_id": "p1",
                "items": [
                    {
                        "id": "default",
                        "name": "江西中软制造执行系统",
                        "workspace_roots": [r"D:\AICodes\ZR_AI_Coding\pythonProject_zr_aicoding"],
                        "mes": {"base_url": "http://127.0.0.1:8009"},
                        "api_docs": {"endpoints": [{"path": "/wo"}]},
                        "data_dictionary": {},
                    },
                    {
                        "id": "p1",
                        "name": "空卡",
                        "workspace_roots": [r"C:\Users\Yu\Desktop\dsh_test"],
                        "mes": {"base_url": ""},
                        "api_docs": {"endpoints": []},
                        "data_dictionary": {},
                    },
                ],
            },
        }
        picked = cfg_for_ask(cfg, None)
        self.assertEqual(picked["mes"]["base_url"], "http://127.0.0.1:8009")
        self.assertEqual(picked["api_docs"]["endpoints"][0]["path"], "/wo")
        # 显式工作区仍 1:1，空卡不会被唯一接通卡顶替
        bound_empty = cfg_for_ask(cfg, r"C:\Users\Yu\Desktop\dsh_test")
        self.assertEqual(bound_empty["mes"]["base_url"], "")
        bound_real = cfg_for_ask(cfg, r"D:\AICodes\ZR_AI_Coding\pythonProject_zr_aicoding\src")
        self.assertEqual(bound_real["mes"]["base_url"], "http://127.0.0.1:8009")


if __name__ == "__main__":
    unittest.main()
