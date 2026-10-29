#!/usr/bin/env python3
"""ensure_dsh_core_bundles 单测。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ensure_dsh_core_bundles import ensure_dsh_core_bundles, find_source


class EnsureDshCoreBundlesTest(unittest.TestCase):
    def test_links_missing_core_from_source(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            src_root = root / "profiles" / "node_modules" / "@deepseek-ai"
            for name in ("dsh-base", "dsh-web-app"):
                d = src_root / name
                d.mkdir(parents=True)
                (d / "package.json").write_text(
                    f'{{"name":"@deepseek-ai/{name}","version":"0.1.1-rc.2"}}\n',
                    encoding="utf-8",
                )
            with patch("ensure_dsh_core_bundles.which_dsh", return_value=None):
                r = ensure_dsh_core_bundles(profile, do_fix=True)
            self.assertTrue(r["ok"], r["notes"])
            self.assertTrue(r["fixed"])
            for name in ("dsh-base", "dsh-web-app"):
                pj = profile / "node_modules" / "@deepseek-ai" / name / "package.json"
                self.assertTrue(pj.is_file(), name)
                self.assertEqual(
                    json.loads(pj.read_text(encoding="utf-8"))["version"],
                    "0.1.1-rc.2",
                )

    def test_find_source_uses_bundled_host_root(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            src = (
                root
                / "host"
                / "node_modules"
                / "@deepseek-ai"
                / "dsh"
                / "node_modules"
                / "@deepseek-ai"
                / "dsh-base"
            )
            src.mkdir(parents=True)
            (src / "package.json").write_text('{"name":"@deepseek-ai/dsh-base"}\n', encoding="utf-8")
            with patch.dict("os.environ", {"WORKBUDDY_HOST_ROOT": str(root / "host")}, clear=False), \
                patch("ensure_dsh_core_bundles.which_dsh", return_value=None):
                found = find_source(profile, "@deepseek-ai/dsh-base")
            self.assertEqual(found, src)

    def test_find_source_prefers_profiles_hoist(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            src = root / "profiles" / "node_modules" / "@deepseek-ai" / "dsh-base"
            src.mkdir(parents=True)
            (src / "package.json").write_text('{"name":"@deepseek-ai/dsh-base"}\n', encoding="utf-8")
            with patch("ensure_dsh_core_bundles.which_dsh", return_value=None):
                found = find_source(profile, "@deepseek-ai/dsh-base")
            self.assertEqual(found, src)

    def test_upgrades_stale_core_version(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            old = profile / "node_modules" / "@deepseek-ai" / "dsh-web-app"
            old.mkdir(parents=True)
            (old / "package.json").write_text(
                '{"name":"@deepseek-ai/dsh-web-app","version":"0.1.1-rc.2"}\n',
                encoding="utf-8",
            )
            src = root / "profiles" / "node_modules" / "@deepseek-ai" / "dsh-web-app"
            src.mkdir(parents=True)
            (src / "package.json").write_text(
                '{"name":"@deepseek-ai/dsh-web-app","version":"0.2.1-rc.2"}\n',
                encoding="utf-8",
            )
            base_src = root / "profiles" / "node_modules" / "@deepseek-ai" / "dsh-base"
            base_src.mkdir(parents=True)
            (base_src / "package.json").write_text(
                '{"name":"@deepseek-ai/dsh-base","version":"0.2.1-rc.2"}\n',
                encoding="utf-8",
            )
            with patch("ensure_dsh_core_bundles.which_dsh", return_value=None):
                r = ensure_dsh_core_bundles(profile, do_fix=True)
            self.assertTrue(r["ok"], r["notes"])
            self.assertTrue(r["fixed"])
            ver = json.loads(
                (profile / "node_modules" / "@deepseek-ai" / "dsh-web-app" / "package.json").read_text(
                    encoding="utf-8"
                )
            )["version"]
            self.assertEqual(ver, "0.2.1-rc.2")


if __name__ == "__main__":
    unittest.main()
