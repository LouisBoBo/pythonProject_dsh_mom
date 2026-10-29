#!/usr/bin/env python3
"""ensure_runtime：引擎子集不要求 dsh；残 profile 必查项失败。"""
from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import ensure_runtime


class EnsureRuntimeTests(unittest.TestCase):
    def test_engine_only_skips_host_probes(self):
        report = ensure_runtime.check_runtime(do_fix=False, engine_only=True)
        ids = [p.id for p in report.probes]
        self.assertIn("python", ids)
        self.assertIn("engine_boot", ids)
        self.assertIn("company_knowledge", ids)
        self.assertNotIn("dsh", ids)
        self.assertNotIn("dshmarket", ids)

    def test_missing_profile_fails_required(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "dsh-home"
            home.mkdir()
            profile = home / "profiles" / "web"
            profile.mkdir(parents=True)
            with mock.patch.object(ensure_runtime, "find_node", return_value=Path("/usr/bin/node")):
                with mock.patch.object(ensure_runtime, "_node_major", return_value=22):
                    with mock.patch.object(ensure_runtime, "find_dsh", return_value=None):
                        report = ensure_runtime.check_runtime(
                            do_fix=False,
                            engine_only=False,
                            profile=profile,
                            dsh_home=home,
                        )
            ids = {p.id: p for p in report.probes}
            self.assertFalse(ids["dsh"].ok)
            self.assertTrue(ids["dsh"].required)
            self.assertFalse(ids["dshmarket"].ok)
            self.assertFalse(report.ok)

    def test_npm_hole_fails(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "home"
            home.mkdir()
            (home / ".env").write_text(
                "# --- workbuddy-company-market ---\n"
                "DSHM_REGISTRY_URL=http://127.0.0.1:18732/\n"
                "# --- /workbuddy-company-market ---\n",
                encoding="utf-8",
            )
            profile = Path(td) / "profile"
            profile.mkdir()
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {
                            "dshmarket": "1.34.0",
                            "@zhongruan/dsh-cursor-chat": "0.1.1",
                        },
                        "dsh": {"profile": {"bundles": ["dshmarket", "@zhongruan/dsh-cursor-chat"]}},
                    }
                ),
                encoding="utf-8",
            )
            sdk = profile / "node_modules" / "@cursor" / "sdk"
            sdk.mkdir(parents=True)
            (sdk / "package.json").write_text(
                json.dumps({"name": "@cursor/sdk", "exports": {".": {"import": "./dist/esm/index.js"}}}),
                encoding="utf-8",
            )
            zod = profile / "node_modules" / "zod"
            zod.mkdir(parents=True)
            (zod / "package.json").write_text('{"name":"zod","version":"3.25.0"}\n', encoding="utf-8")
            fake_node = Path(td) / "node"
            fake_node.write_text("", encoding="utf-8")
            fake_dsh = Path(td) / "dsh.cmd"
            fake_dsh.write_text("", encoding="utf-8")
            with mock.patch.object(ensure_runtime, "find_node", return_value=fake_node):
                with mock.patch.object(ensure_runtime, "_node_major", return_value=22):
                    with mock.patch.object(ensure_runtime, "find_dsh", return_value=fake_dsh):
                        with mock.patch.object(ensure_runtime, "find_host_tools", return_value=None):
                            report = ensure_runtime.check_runtime(
                                do_fix=False,
                                profile=profile,
                                dsh_home=home,
                            )
            ids = {p.id: p for p in report.probes}
            self.assertFalse(ids["zod"].ok)
            self.assertFalse(ids["npm_entries"].ok)
            self.assertFalse(report.ok)

    def test_dsh_bin_env(self):
        with tempfile.TemporaryDirectory() as td:
            shim = Path(td) / "dsh.cmd"
            shim.write_text("@echo off\r\n", encoding="utf-8")
            with mock.patch.dict(os.environ, {"DSH_BIN": str(shim), "WORKBUDDY_DSH_BIN": str(shim)}):
                found = ensure_runtime.find_dsh()
            self.assertEqual(found, shim)

    def test_probe_zod_exception_is_fail_not_crash(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "dsh-home"
            home.mkdir()
            profile = home / "profiles" / "web"
            profile.mkdir(parents=True)
            (profile / "package.json").write_text("{}", encoding="utf-8")
            with mock.patch.object(
                ensure_runtime,
                "ensure_cursor_sdk_zod",
                side_effect=FileNotFoundError("npm"),
            ):
                probe = ensure_runtime._probe_zod(profile, do_fix=True)
            self.assertTrue(probe.required)
            self.assertFalse(probe.ok)
            self.assertIn("npm", probe.detail)

    def test_knowledge_peers_missing_mammoth_fails_required(self):
        """卸线上插件 prune 掉 mammoth 后，门禁必须 FAIL，禁止假通过。"""
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "dsh-home"
            home.mkdir()
            profile = home / "profiles" / "web"
            profile.mkdir(parents=True)
            # pack_dir(profile) = home/workbuddy-packs/dsh-knowledge
            pack = home / "workbuddy-packs" / "dsh-knowledge"
            pack.mkdir(parents=True)
            (pack / "package.json").write_text(
                '{"name":"@zhongruan/dsh-knowledge","version":"1.0.9"}\n',
                encoding="utf-8",
            )
            probe = ensure_runtime._probe_knowledge_peers(profile, do_fix=False)
            self.assertTrue(probe.required)
            self.assertFalse(probe.ok)
            self.assertIn("mammoth", probe.detail)

    def test_check_runtime_includes_knowledge_peers(self):
        report = ensure_runtime.check_runtime(do_fix=False, engine_only=True)
        self.assertNotIn("knowledge_peers", [p.id for p in report.probes])
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "dsh-home"
            home.mkdir()
            profile = home / "profiles" / "web"
            profile.mkdir(parents=True)
            with mock.patch.object(ensure_runtime, "find_node", return_value=Path("/usr/bin/node")):
                with mock.patch.object(ensure_runtime, "_node_major", return_value=22):
                    with mock.patch.object(ensure_runtime, "find_dsh", return_value=None):
                        report = ensure_runtime.check_runtime(
                            do_fix=False,
                            engine_only=False,
                            profile=profile,
                            dsh_home=home,
                        )
            self.assertIn("knowledge_peers", [p.id for p in report.probes])


if __name__ == "__main__":
    unittest.main()
