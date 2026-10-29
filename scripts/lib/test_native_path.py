#!/usr/bin/env python3
"""native_path：MSYS /d/foo → D:\\foo；Unix 原样。"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from native_path import native_path  # noqa: E402


class NativePathTests(unittest.TestCase):
    def test_unix_unchanged_on_posix(self):
        if os.name == "nt":
            self.skipTest("posix")
        self.assertEqual(native_path("/Users/hebo/proj"), "/Users/hebo/proj")

    def test_msys_drive_on_windows(self):
        if os.name != "nt":
            self.skipTest("windows")
        self.assertEqual(native_path("/d/AICodes/DSH_WorkBuddy"), r"D:\AICodes\DSH_WorkBuddy")
        self.assertEqual(native_path("/c/Users/Yu/.dsh"), r"C:\Users\Yu\.dsh")

    def test_already_windows_path(self):
        if os.name != "nt":
            self.skipTest("windows")
        self.assertEqual(native_path(r"D:\AICodes\x"), r"D:\AICodes\x")


if __name__ == "__main__":
    unittest.main()
