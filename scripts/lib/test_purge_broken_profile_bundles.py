#!/usr/bin/env python3
"""purge_broken_profile_bundles 单测。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from purge_broken_profile_bundles import purge_broken_profile_bundles


class PurgeBrokenProfileBundlesTest(unittest.TestCase):
    def test_strips_missing_optional_bundle(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {"dshmarket": "1.0.0"},
                        "dsh": {
                            "profile": {
                                "bundles": [
                                    "@deepseek-ai/dsh-base",
                                    "@zhongruan/dsh-knowledge",
                                    "dshmarket",
                                ]
                            }
                        },
                    }
                ),
                encoding="utf-8",
            )
            # 只装 dshmarket 完整；base 也按核心保留（残缺会 fatal）
            nm_m = profile / "node_modules" / "dshmarket"
            nm_m.mkdir(parents=True)
            (nm_m / "package.json").write_text(
                json.dumps(
                    {
                        "name": "dshmarket",
                        "main": "index.js",
                        "dsh": {"client": {"platform": "web"}},
                        "exports": {".": "./index.js", "./client": "./client/client.js"},
                    }
                ),
                encoding="utf-8",
            )
            (nm_m / "index.js").write_text("export {}\n", encoding="utf-8")
            (nm_m / "client").mkdir()
            (nm_m / "client" / "client.js").write_text("export {}\n", encoding="utf-8")

            nm_base = profile / "node_modules" / "@deepseek-ai" / "dsh-base"
            nm_base.mkdir(parents=True)
            (nm_base / "package.json").write_text(
                '{"name":"@deepseek-ai/dsh-base","main":"index.js"}\n',
                encoding="utf-8",
            )
            (nm_base / "index.js").write_text("export {}\n", encoding="utf-8")

            report = purge_broken_profile_bundles(profile, fix=True)
            self.assertTrue(report["ok"])
            self.assertTrue(report["fixed"])
            self.assertTrue(any("dsh-knowledge" in x for x in report["removed"]))
            pkg = json.loads((profile / "package.json").read_text(encoding="utf-8"))
            bundles = pkg["dsh"]["profile"]["bundles"]
            self.assertNotIn("@zhongruan/dsh-knowledge", bundles)
            self.assertIn("dshmarket", bundles)
            self.assertIn("@deepseek-ai/dsh-base", bundles)

    def test_strips_when_client_js_missing(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            spec = "@zhongruan/demo-plugin"
            (profile / "package.json").write_text(
                json.dumps({"dsh": {"profile": {"bundles": [spec]}}}),
                encoding="utf-8",
            )
            nm = profile / "node_modules" / "@zhongruan" / "demo-plugin"
            nm.mkdir(parents=True)
            (nm / "package.json").write_text(
                json.dumps(
                    {
                        "name": spec,
                        "main": "lib/index.js",
                        "exports": {".": "./lib/index.js", "./client": "./lib/client.js"},
                        "dsh": {"client": {"platform": "web"}},
                    }
                ),
                encoding="utf-8",
            )
            (nm / "lib").mkdir()
            (nm / "lib" / "index.js").write_text("export {}\n", encoding="utf-8")
            # 故意不写 client.js
            report = purge_broken_profile_bundles(profile, fix=True)
            self.assertTrue(report["ok"])
            self.assertTrue(report["fixed"])
            pkg = json.loads((profile / "package.json").read_text(encoding="utf-8"))
            self.assertNotIn(spec, pkg["dsh"]["profile"]["bundles"])


if __name__ == "__main__":
    unittest.main()
