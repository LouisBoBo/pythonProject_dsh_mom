#!/usr/bin/env python3
"""daemonize：Windows 不能 CreateProcess 无后缀 npm shim / Unix env。"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import daemonize as dz  # noqa: E402


class StripEnvWrapperTests(unittest.TestCase):
    def test_passthrough(self):
        cmd, env = dz.strip_env_wrapper(["dsh", "web"], {"A": "1"})
        self.assertEqual(cmd, ["dsh", "web"])
        self.assertEqual(env["A"], "1")

    def test_unwrap_key_values(self):
        cmd, env = dz.strip_env_wrapper(
            ["env", "DSH_HOME=/tmp/.dsh", "FOO=bar", "dsh", "web", "--port", "3081"],
            {"PATH": "/bin"},
        )
        self.assertEqual(cmd, ["dsh", "web", "--port", "3081"])
        self.assertEqual(env["DSH_HOME"], "/tmp/.dsh")
        self.assertEqual(env["FOO"], "bar")
        self.assertEqual(env["PATH"], "/bin")


class Win32ArgvTests(unittest.TestCase):
    def test_posix_keeps_argv(self):
        if os.name == "nt":
            self.skipTest("posix")
        self.assertEqual(dz.win32_argv(["dsh", "web"]), ["dsh", "web"])

    def test_windows_dsh_shim_to_node_binjs(self):
        if os.name != "nt":
            self.skipTest("windows")
        npm = Path(os.environ.get("APPDATA") or "") / "npm"
        shim = npm / "dsh"
        bin_js = npm / "node_modules" / "@deepseek-ai" / "dsh" / "lib" / "bin.js"
        if not bin_js.is_file():
            self.skipTest("global dsh not installed")
        with mock.patch.object(dz, "_which_node", return_value=r"C:\nodejs\node.exe"):
            out = dz.win32_argv([str(shim), "web", "--port", "3081"])
        self.assertEqual(out[0], r"C:\nodejs\node.exe")
        self.assertEqual(Path(out[1]), bin_js)
        self.assertEqual(out[2:], ["web", "--port", "3081"])

    def test_windows_cmd_fallback(self):
        if os.name != "nt":
            self.skipTest("windows")
        out = dz.win32_argv([r"C:\npm\foo.cmd", "a"])
        self.assertEqual(out[0].lower(), os.environ.get("COMSPEC", "cmd.exe").lower())
        self.assertEqual(out[1], "/c")
        self.assertTrue(out[2].lower().endswith("foo.cmd"))
        self.assertEqual(out[3], "a")


if __name__ == "__main__":
    unittest.main()
