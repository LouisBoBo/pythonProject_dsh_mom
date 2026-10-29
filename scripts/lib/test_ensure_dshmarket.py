#!/usr/bin/env python3
"""ensure_dshmarket 单测：第一次 profile 必须登记并验收落地。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ensure_dshmarket import (
    MARKET_PKG,
    MARKET_VERSION,
    ensure_dshmarket,
    package_installed,
    profile_ready,
)


class EnsureDshmarketTests(unittest.TestCase):
    def test_fresh_profile_registers_dep_and_bundle(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "name": "dsh-profile-web",
                        "dependencies": {},
                        "dsh": {
                            "profile": {
                                "bundles": [
                                    "@deepseek-ai/dsh-base",
                                    "@deepseek-ai/dsh-web-app",
                                ]
                            }
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            result = ensure_dshmarket(profile)
            self.assertTrue(result["need_install"])
            self.assertFalse(result["ready"])
            self.assertEqual(result["pkg"], MARKET_PKG)
            pkg = json.loads((profile / "package.json").read_text(encoding="utf-8"))
            self.assertEqual(pkg["dependencies"][MARKET_PKG], MARKET_VERSION)
            self.assertIn(MARKET_PKG, pkg["dsh"]["profile"]["bundles"])
            ok, msg = profile_ready(profile)
            self.assertFalse(ok)
            self.assertIn("client.js", msg)

    def test_ready_when_client_landed(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            nm = profile / "node_modules" / MARKET_PKG
            (nm / "client").mkdir(parents=True)
            (nm / "package.json").write_text(f'{{"name":"{MARKET_PKG}"}}\n', encoding="utf-8")
            (nm / "client" / "client.js").write_text("export default {}\n", encoding="utf-8")
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {MARKET_PKG: MARKET_VERSION},
                        "dsh": {"profile": {"bundles": [MARKET_PKG]}},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertTrue(package_installed(profile))
            result = ensure_dshmarket(profile)
            self.assertTrue(result["ready"])
            self.assertFalse(result["need_install"])
            ok, _ = profile_ready(profile)
            self.assertTrue(ok)

    def test_stale_installed_version_needs_reinstall(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            nm = profile / "node_modules" / MARKET_PKG
            (nm / "client").mkdir(parents=True)
            (nm / "package.json").write_text(
                json.dumps({"name": MARKET_PKG, "version": "1.34.0"}) + "\n",
                encoding="utf-8",
            )
            (nm / "client" / "client.js").write_text("export default {}\n", encoding="utf-8")
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {MARKET_PKG: "1.34.0"},
                        "dsh": {"profile": {"bundles": [MARKET_PKG]}},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertFalse(package_installed(profile))
            result = ensure_dshmarket(profile)
            self.assertTrue(result["need_install"])
            self.assertFalse(result["ready"])
            pkg = json.loads((profile / "package.json").read_text(encoding="utf-8"))
            self.assertEqual(pkg["dependencies"][MARKET_PKG], MARKET_VERSION)
