# -*- coding: utf-8 -*-
"""§8 P1：排除项来自画像/配置；快照按实际同步目录；构建本机/远端可配。"""
from __future__ import annotations

import os
import sys
import unittest
from types import SimpleNamespace
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ExcludeResolveTests(unittest.TestCase):
    def test_force_and_profile_excludes_merged(self):
        from app.code_deploy.excludes import resolve_exclude_patterns

        cfg = SimpleNamespace(
            rsync_excludes=["*.log", "tmp/"],
        )
        profile = {
            "deploy": {
                "exclude_patterns": ["node_modules", "*.db", "uploads/"],
            }
        }
        pats = resolve_exclude_patterns(cfg, profile=profile)
        # 强制项始终在
        self.assertIn(".env", pats)
        self.assertIn("node_modules", pats)
        self.assertIn("*.db", pats)
        self.assertIn("*.log", pats)
        self.assertIn("uploads/", pats)
        # 不得只认 erp.db 一个库名
        self.assertTrue(any(p in ("*.db", "*.sqlite", "*.sqlite3") for p in pats))

    def test_default_profile_excludes_without_config(self):
        from app.code_deploy.excludes import resolve_exclude_patterns

        pats = resolve_exclude_patterns(SimpleNamespace(rsync_excludes=[]), profile=None)
        self.assertIn("node_modules", pats)
        self.assertIn(".env", pats)


class SnapshotRelsTests(unittest.TestCase):
    def test_sanitize_sync_rels(self):
        from app.code_deploy.ssh_sync import sanitize_snapshot_rels

        self.assertEqual(
            sanitize_snapshot_rels(["frontend/dist", "backend", "../evil", "/abs", ""]),
            ["frontend/dist", "backend"],
        )

    def test_snapshot_script_uses_given_rels_not_hardcoded_vite(self):
        from app.code_deploy.ssh_sync import _build_snapshot_script

        script = _build_snapshot_script("/www/app", ["web/dist", "api"])
        self.assertIn("web/dist", script)
        self.assertIn("api", script)
        self.assertNotIn("frontend/dist", script)  # 不得写死 Vite 路径
        self.assertIn("node_modules", script)  # 排除


class BuildWhereTests(unittest.TestCase):
    def test_build_where_defaults_local(self):
        from app.code_deploy.config import CodeDeployConfig

        c = CodeDeployConfig()
        self.assertEqual(getattr(c, "build_where", "local"), "local")

    def test_resolve_strategy_carries_build_where(self):
        from app.code_deploy.deploy_strategy import resolve_deploy_strategy

        cfg = SimpleNamespace(
            deploy_preset="static",
            build_cmd="npm run build",
            build_cwd="frontend",
            sync_paths=[],
            dist_rel="frontend/dist",
            process_match="",
            build_where="remote",
        )
        with mock.patch(
            "app.code_deploy.deploy_strategy.is_static_frontend_layout",
            return_value=True,
        ):
            st = resolve_deploy_strategy("/tmp/x", cfg=cfg)
        self.assertEqual(st.get("build_where"), "remote")

    def test_remote_build_rejects_parent_cwd(self):
        from app.code_deploy.ssh_sync import _run_remote_build

        urec: dict = {"ok": True, "logs": []}
        ok = _run_remote_build(
            ["ssh"],
            app="/www/app",
            build_cwd="../evil",
            build_cmd="npm run build",
            log=lambda _m: None,
            urec=urec,
        )
        self.assertFalse(ok)
        self.assertIn("非法", urec.get("error") or "")


class ExcludeArgsWireTests(unittest.TestCase):
    def test_exclude_args_merges_profile_and_force_db_globs(self):
        from app.code_deploy.ssh_sync import _exclude_args

        cfg = SimpleNamespace(rsync_excludes=["*.log"])
        profile = {"deploy": {"exclude_patterns": ["uploads/"]}}
        args = _exclude_args(cfg, profile=profile)
        # --exclude PAT 成对
        self.assertEqual(args.count("--exclude"), len(args) // 2)
        pats = [args[i + 1] for i in range(0, len(args), 2)]
        self.assertIn("*.db", pats)
        self.assertNotIn("erp.db", pats)  # 不得只认单一库名
        self.assertIn("uploads/", pats)
        self.assertIn("*.log", pats)
        self.assertIn("node_modules", pats)


if __name__ == "__main__":
    unittest.main()
