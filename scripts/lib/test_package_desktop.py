#!/usr/bin/env python3
"""package_desktop：本机 OS 自动选 win/mac；禁止交叉打包。"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

import package_desktop

_ROOT = Path(__file__).resolve().parents[2]


class PackageDesktopTests(unittest.TestCase):
    def test_detect_matches_this_os(self):
        target = package_desktop.detect_pack_target("")
        if sys.platform == "win32":
            self.assertEqual(target, "win")
        elif sys.platform == "darwin":
            self.assertEqual(target, "mac")
        elif sys.platform.startswith("linux"):
            self.assertEqual(target, "linux")

    def test_cross_pack_refused(self):
        native = package_desktop.current_pack_os()
        other = "linux" if native != "linux" else "win"
        env = {k: v for k, v in os.environ.items() if k not in {"PACK_TARGET", "FORCE_CROSS", "EB_TARGET"}}
        with mock.patch.dict(os.environ, env, clear=True):
            with self.assertRaises(SystemExit):
                package_desktop.detect_pack_target(other)

    def test_node_archive_win_is_zip(self):
        name, is_zip = package_desktop.node_archive("win", "x64")
        self.assertTrue(is_zip)
        self.assertIn("win-x64", name)
        self.assertTrue(name.endswith(".zip"))
        self.assertNotIn("darwin", name)

    def test_node_archive_mac_is_tarball(self):
        name, is_zip = package_desktop.node_archive("mac", "arm64")
        self.assertFalse(is_zip)
        self.assertIn("darwin-arm64", name)
        self.assertTrue(name.endswith(".tar.gz"))

    def test_electron_builder_args(self):
        self.assertEqual(package_desktop.electron_builder_args("win"), ["--win"])
        self.assertEqual(package_desktop.electron_builder_args("mac"), ["--mac"])

    def test_win_nsis_and_zip_configured(self):
        pkg = json.loads((_ROOT / "desktop" / "package.json").read_text(encoding="utf-8"))
        win = pkg["build"]["win"]["target"]
        self.assertIn("nsis", win)
        self.assertIn("zip", win)
        mac = pkg["build"]["mac"]["target"]
        self.assertIn("dir", mac)
        self.assertIn("zip", mac)

    def test_nsis_compress_level_defaults_faster_than_max(self):
        env = {k: v for k, v in os.environ.items() if k != "ELECTRON_BUILDER_COMPRESSION_LEVEL"}
        with mock.patch.dict(os.environ, env, clear=True):
            self.assertEqual(package_desktop.nsis_compress_level(), "5")
        with mock.patch.dict(os.environ, {"ELECTRON_BUILDER_COMPRESSION_LEVEL": "3"}):
            self.assertEqual(package_desktop.nsis_compress_level(), "3")

    def test_bump_version_str(self):
        # 打包即自抬安装包版本号（用户只看这个号）
        self.assertEqual(package_desktop.bump_version_str("0.2.26", "patch"), "0.2.27")
        self.assertEqual(package_desktop.bump_version_str("0.2.26", "minor"), "0.3.0")
        self.assertEqual(package_desktop.bump_version_str("0.2.26", "major"), "1.0.0")
        self.assertEqual(package_desktop.bump_version_str("0.2.99", "patch"), "0.2.100")
        with self.assertRaises(ValueError):
            package_desktop.bump_version_str("0.2", "patch")
        with self.assertRaises(ValueError):
            package_desktop.bump_version_str("", "patch")
        with self.assertRaises(ValueError):
            package_desktop.bump_version_str("0.2.26", "beta")

    def test_bump_desktop_version_writes_back(self):
        written = []
        with mock.patch.object(package_desktop, "desktop_version", return_value="0.2.26"), \
            mock.patch.object(
                package_desktop, "_write_desktop_version", side_effect=lambda v: written.append(v)
            ):
            self.assertEqual(package_desktop.bump_desktop_version("patch"), "0.2.27")
        self.assertEqual(written, ["0.2.27"])

    def test_set_desktop_version_validates(self):
        written = []
        with mock.patch.object(package_desktop, "desktop_version", return_value="0.2.26"), \
            mock.patch.object(
                package_desktop, "_write_desktop_version", side_effect=lambda v: written.append(v)
            ):
            self.assertEqual(package_desktop.set_desktop_version("v0.3.0"), "0.3.0")
            with self.assertRaises(SystemExit):
                package_desktop.set_desktop_version("0.3")
        self.assertEqual(written, ["0.3.0"])


class BuildRuntimeScriptsTests(unittest.TestCase):
    """PACKAGED_LIB_SCRIPTS 必须闭合：入包脚本顶层 import 的 scripts/lib 兄弟模块也要入包。

    事故（2026-09-22，0.2.27）：win_hide.py 未入包，而 ensure_runtime /
    align_dsh_tools / merge_company_dsh_market 顶层 from win_hide import …
    → 一体包每次启动 ensureRuntimeDeps 直接 ModuleNotFoundError，启动失败。
    """

    @staticmethod
    def _load_build_runtime():
        spec = importlib.util.spec_from_file_location(
            "build_runtime", _ROOT / "desktop" / "py" / "build_runtime.py"
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_packaged_lib_scripts_close_over_local_imports(self):
        br = self._load_build_runtime()
        lib = _ROOT / "scripts" / "lib"
        local_modules = {p.stem for p in lib.glob("*.py")}
        packaged = set(br.PACKAGED_LIB_SCRIPTS)
        missing = {}
        for name in sorted(packaged):
            src = lib / name
            self.assertTrue(src.is_file(), f"PACKAGED_LIB_SCRIPTS 指向不存在的文件: {name}")
            for m in re.finditer(
                r"^(?:from|import)\s+([a-z_][a-z0-9_]*)",
                src.read_text(encoding="utf-8"),
                re.M,
            ):
                mod = m.group(1)
                if mod in local_modules and f"{mod}.py" not in packaged:
                    missing.setdefault(name, set()).add(mod)
        self.assertEqual(missing, {}, f"入包脚本依赖了未入包的兄弟模块: {missing}")


if __name__ == "__main__":
    unittest.main()
