"""Windows 上 os_lock 可导入、可加解锁（不测并发）。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest


class OsLockTests(unittest.TestCase):
    def test_lock_roundtrip(self):
        from app.os_lock import lock_ex, lock_un

        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "t.lock")
            with open(path, "a+", encoding="utf-8") as fh:
                lock_ex(fh)
                fh.write("x")
                fh.flush()
                lock_un(fh)
            self.assertTrue(os.path.isfile(path))

    def test_no_fcntl_import_on_windows(self):
        if sys.platform != "win32":
            self.skipTest("windows only")
        import app.plugins_store as ps

        self.assertFalse(hasattr(ps, "fcntl") and ps.fcntl is not None)
        from app import plugins_store

        self.assertTrue(callable(plugins_store.load_state))
