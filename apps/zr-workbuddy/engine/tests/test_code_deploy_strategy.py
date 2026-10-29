# -*- coding: utf-8 -*-
"""§8：部署策略可配置；识别失败禁止默认套 Vite+uvicorn。"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class DeployStrategyTests(unittest.TestCase):
    def test_unknown_repo_cannot_deploy(self):
        from app.code_deploy.deploy_strategy import resolve_deploy_strategy
        from app.code_deploy.units import list_catalog_units

        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "main.py").write_text("print(1)\n", encoding="utf-8")
            st = resolve_deploy_strategy(tmp)
            self.assertEqual(st.get("preset"), "unknown")
            self.assertFalse(st.get("can_deploy"))
            self.assertEqual(list_catalog_units(tmp), [])

    def test_vite_backend_detected(self):
        from app.code_deploy.deploy_strategy import resolve_deploy_strategy
        from app.code_deploy.units import list_catalog_units

        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "frontend").mkdir()
            Path(tmp, "frontend", "package.json").write_text("{}", encoding="utf-8")
            Path(tmp, "backend").mkdir()
            st = resolve_deploy_strategy(tmp)
            self.assertEqual(st.get("preset"), "vite_backend")
            self.assertTrue(st.get("can_deploy"))
            units = list_catalog_units(tmp)
            self.assertEqual([u.id for u in units], ["workspace"])

    def test_static_frontend_detected(self):
        from app.code_deploy.deploy_strategy import resolve_deploy_strategy
        from app.code_deploy.units import list_catalog_units

        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "frontend").mkdir()
            Path(tmp, "frontend", "package.json").write_text(
                json.dumps({"scripts": {"build": "vite build"}}),
                encoding="utf-8",
            )
            st = resolve_deploy_strategy(tmp)
            self.assertEqual(st.get("preset"), "static")
            self.assertTrue(st.get("can_deploy"))
            units = list_catalog_units(tmp)
            self.assertEqual([u.id for u in units], ["workspace:static"])
            self.assertEqual(units[0].action, "sync_static")

    def test_custom_requires_sync_paths(self):
        from app.code_deploy.deploy_strategy import resolve_deploy_strategy

        cfg = SimpleNamespace(
            deploy_preset="custom",
            build_cmd="",
            build_cwd="",
            sync_paths=[],
            dist_rel="",
            process_match="",
        )
        with tempfile.TemporaryDirectory() as tmp:
            st = resolve_deploy_strategy(tmp, cfg=cfg)
        self.assertFalse(st.get("can_deploy"))
        self.assertIn("sync_paths", str(st.get("detail") or ""))

    def test_custom_with_sync_paths_ok(self):
        from app.code_deploy.deploy_strategy import resolve_deploy_strategy
        from app.code_deploy.units import list_catalog_units

        cfg = SimpleNamespace(
            deploy_preset="custom",
            build_cmd="npm run build",
            build_cwd="web",
            sync_paths=["web/dist"],
            dist_rel="web/dist",
            process_match="",
        )
        with tempfile.TemporaryDirectory() as tmp:
            st = resolve_deploy_strategy(tmp, cfg=cfg)
            self.assertTrue(st.get("can_deploy"))
            self.assertEqual(st.get("preset"), "custom")
            units = list_catalog_units(tmp, cfg=cfg)
            self.assertEqual([u.id for u in units], ["workspace:custom"])

    def test_config_preset_overrides_detect(self):
        from app.code_deploy.deploy_strategy import resolve_deploy_strategy

        cfg = SimpleNamespace(
            deploy_preset="skip",  # invalid → unknown via norm? actually skip not in known
            build_cmd="",
            build_cwd="",
            sync_paths=[],
            dist_rel="",
            process_match="",
        )
        # use explicit static override on a bare repo
        cfg.deploy_preset = "static"
        with tempfile.TemporaryDirectory() as tmp:
            Path(tmp, "frontend").mkdir()
            Path(tmp, "frontend", "package.json").write_text(
                json.dumps({"scripts": {"build": "vite build"}}),
                encoding="utf-8",
            )
            st = resolve_deploy_strategy(tmp, cfg=cfg)
        self.assertEqual(st.get("preset"), "static")
        self.assertEqual(st.get("source"), "config")

    def test_probe_health_expect_status(self):
        from app.code_deploy.ssh_sync import probe_health
        from unittest import mock

        with mock.patch(
            "app.code_deploy.ssh_sync._http_get",
            return_value=(204, b""),
        ):
            with mock.patch(
                "app.code_deploy.ssh_sync._is_blocked_health_host",
                return_value=False,
            ):
                ok_range = probe_health("http://example.com/h", expect_status=0)
                exact = probe_health("http://example.com/h", expect_status=200)
                match = probe_health("http://example.com/h", expect_status=204)
        self.assertTrue(ok_range.get("ok"))
        self.assertFalse(exact.get("ok"))
        self.assertTrue(match.get("ok"))


if __name__ == "__main__":
    unittest.main()
