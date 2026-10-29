#!/usr/bin/env python3
"""win_hide：Windows 子进程默认 CREATE_NO_WINDOW。"""
from __future__ import annotations

import os
import subprocess
import unittest

import win_hide


class WinHideTests(unittest.TestCase):
    def test_popen_kwargs(self):
        kw = win_hide.popen_kwargs()
        if os.name == "nt":
            self.assertEqual(kw.get("creationflags"), win_hide.CREATE_NO_WINDOW)
            self.assertIn("startupinfo", kw)
        else:
            self.assertEqual(kw, {})

    def test_merge_preserves_caller_flags(self):
        merged = win_hide.merge_kwargs({"creationflags": 0x200, "cwd": "x"})
        if os.name == "nt":
            self.assertEqual(merged["creationflags"] & win_hide.CREATE_NO_WINDOW, win_hide.CREATE_NO_WINDOW)
            self.assertEqual(merged["creationflags"] & 0x200, 0x200)
            self.assertIn("startupinfo", merged)
        self.assertEqual(merged["cwd"], "x")

    def test_merge_keeps_caller_startupinfo(self):
        sentinel = object()
        merged = win_hide.merge_kwargs({"startupinfo": sentinel})
        self.assertIs(merged["startupinfo"], sentinel)

    def test_install_is_idempotent(self):
        win_hide.install()
        first = subprocess.run
        win_hide.install()
        self.assertIs(subprocess.run, first)

    def test_popen_stays_a_class(self):
        win_hide.install()
        self.assertTrue(isinstance(subprocess.Popen, type))


if __name__ == "__main__":
    unittest.main()
