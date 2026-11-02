#!/usr/bin/env python3
"""build_runtime：Windows python.exe 在前缀根目录，不能只认 bin/python3。"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_ROOT = Path(__file__).resolve().parents[2]
_PY = _ROOT / "desktop" / "py"
if str(_PY) not in sys.path:
    sys.path.insert(0, str(_PY))

import build_runtime  # noqa: E402


class BuildRuntimeInterpreterTests(unittest.TestCase):
    def test_finds_windows_layout_python_exe(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "python"
            home.mkdir()
            exe = home / "python.exe"
            exe.write_text("", encoding="utf-8")
            found = build_runtime.find_interpreter(home)
            self.assertEqual(found, exe)
            self.assertEqual(build_runtime.python_home_of(found), home.resolve())

    def test_finds_unix_bin_python3(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td) / "python"
            (home / "bin").mkdir(parents=True)
            exe = home / "bin" / "python3"
            exe.write_text("", encoding="utf-8")
            found = build_runtime.find_interpreter(home)
            self.assertEqual(found, exe)
            self.assertEqual(build_runtime.python_home_of(found), home.resolve())

    def test_packaged_lib_scripts_exist(self):
        for name in build_runtime.PACKAGED_LIB_SCRIPTS:
            path = _ROOT / "scripts" / "lib" / name
            self.assertTrue(path.is_file(), name)
        self.assertIn("ensure_runtime.py", build_runtime.PACKAGED_LIB_SCRIPTS)
        self.assertIn("py_modules_stamp.py", build_runtime.PACKAGED_LIB_SCRIPTS)
        self.assertIn("win_hide.py", build_runtime.PACKAGED_LIB_SCRIPTS)


class BuildRuntimeVendorTests(unittest.TestCase):
    def test_existing_vendor_wins(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            vendor = repo / "vendor" / "@deepseek-ai" / "dsh-tools"
            vendor.mkdir(parents=True)
            self.assertEqual(build_runtime._resolve_vendor_tools(repo), vendor)

    def test_missing_vendor_falls_back_to_host(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            host = Path(td) / "host-tools"
            host.mkdir()
            (host / "package.json").write_text("{}", encoding="utf-8")
            with mock.patch("align_dsh_tools.find_host_tools", return_value=host):
                self.assertEqual(build_runtime._resolve_vendor_tools(repo), host)

    def test_missing_vendor_and_host_raises(self):
        with tempfile.TemporaryDirectory() as td:
            repo = Path(td)
            with mock.patch("align_dsh_tools.find_host_tools", return_value=None):
                with self.assertRaises(FileNotFoundError):
                    build_runtime._resolve_vendor_tools(repo)


if __name__ == "__main__":
    unittest.main()
