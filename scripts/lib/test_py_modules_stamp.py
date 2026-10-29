"""依赖戳记：requirements 变了必须失效，未变则命中。"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from py_modules_stamp import (  # noqa: E402
    modules_stamp_covers,
    requirements_hash,
    runtime_stamp_text,
    write_modules_stamp,
)


class PyModulesStampTests(unittest.TestCase):
    def test_roundtrip_and_invalidates_when_requirements_change(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            exe = root / "python.exe"
            exe.write_text("", encoding="utf-8")
            req = root / "requirements.txt"
            req.write_text("fastapi>=0.110\n", encoding="utf-8")
            mods = ["fastapi", "numpy"]
            write_modules_stamp(root, req, mods)
            self.assertTrue(modules_stamp_covers(str(exe), req, mods))
            req.write_text("fastapi>=0.111\n", encoding="utf-8")
            self.assertFalse(modules_stamp_covers(str(exe), req, mods))

    def test_runtime_stamp_tracks_cpython_and_slim_rev(self):
        digest = requirements_hash(Path(__file__))
        body = runtime_stamp_text("3.12.9", digest, "1")
        self.assertIn("cpython=3.12.9\n", body)
        self.assertIn(f"req={digest}\n", body)
        self.assertTrue(body.endswith("slim=1\n"))


if __name__ == "__main__":
    unittest.main()
