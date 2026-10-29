#!/usr/bin/env python3
"""npm_pkg_integrity：残包（无 dist / 无入口）必须能扫出来。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from npm_pkg_integrity import check_pkg_dir, package_entry_rel, scan_profile


class NpmPkgIntegrityTests(unittest.TestCase):
    def test_exports_import_path(self):
        rel = package_entry_rel(
            {"exports": {".": {"import": "./dist/esm/index.js", "require": "./dist/cjs/index.js"}}}
        )
        self.assertEqual(rel, "dist/esm/index.js")

    def test_missing_dist_fails(self):
        with tempfile.TemporaryDirectory() as td:
            pkg = Path(td) / "zod"
            pkg.mkdir()
            (pkg / "package.json").write_text(
                json.dumps({"name": "zod", "exports": {".": {"import": "./dist/esm/index.js"}}}),
                encoding="utf-8",
            )
            row = check_pkg_dir(pkg, extra=("dist/esm/index.js",))
            self.assertFalse(row["ok"])
            self.assertIn("dist/esm/index.js", row["missing"])

    def test_scan_profile_declared(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps({"dependencies": {"dshmarket": "1.34.0"}}),
                encoding="utf-8",
            )
            dm = profile / "node_modules" / "dshmarket"
            dm.mkdir(parents=True)
            (dm / "package.json").write_text('{"name":"dshmarket","main":"index.js"}\n', encoding="utf-8")
            (dm / "index.js").write_text("module.exports = {}\n", encoding="utf-8")
            (dm / "client").mkdir()
            (dm / "client" / "client.js").write_text("export {}\n", encoding="utf-8")
            rows = scan_profile(profile)
            self.assertEqual(len(rows), 1)
            self.assertTrue(rows[0]["ok"], rows[0])


if __name__ == "__main__":
    unittest.main()
