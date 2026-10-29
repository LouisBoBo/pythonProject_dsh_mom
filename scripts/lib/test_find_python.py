#!/usr/bin/env python3
"""find_python：Windows 候选含 python.exe；能解析当前解释器。"""
from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from find_python import find_python, iter_candidates  # noqa: E402


class FindPythonTests(unittest.TestCase):
    def test_finds_running_interpreter(self):
        found = find_python()
        self.assertTrue(found)
        self.assertTrue(os.path.isfile(found), found)

    def test_windows_candidates_include_python_exe(self):
        cands = iter_candidates()
        self.assertIn("python", cands)
        self.assertIn("python3", cands)
        if sys.platform == "win32":
            self.assertTrue(
                any(c.lower().endswith("python.exe") or c == "python" for c in cands),
                cands,
            )
            self.assertIn("py", cands)
        else:
            self.assertTrue(any("/usr/local/bin/python3" in c or "homebrew" in c for c in cands) or "python3" in cands)

    def test_one_process_accepts_stdlib_and_rejects_missing(self):
        found = find_python(preferred=sys.executable, need_modules=["json", "pathlib"])
        self.assertTrue(found)
        self.assertTrue(os.path.isfile(found), found)
        missing = find_python(preferred=sys.executable, need_modules=["__definitely_missing_wb__"])
        self.assertIsNone(missing)


if __name__ == "__main__":
    unittest.main()
