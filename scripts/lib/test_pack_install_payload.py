"""pack_install_payload：未压缩 zip 可还原，目录未改则复用。"""
from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path

from pack_install_payload import ensure_stored_zip


class PackInstallPayloadTest(unittest.TestCase):
    def test_roundtrip_and_reuse(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            src = root / "python"
            (src / "Lib").mkdir(parents=True)
            (src / "python.exe").write_bytes(b"py")
            (src / "Lib" / "a.py").write_bytes(b"print(1)\n")
            dest = root / "pack" / "python.zip"
            self.assertEqual(ensure_stored_zip(src, dest), "packed")
            with zipfile.ZipFile(dest) as zf:
                self.assertEqual(zf.getinfo("python.exe").compress_type, zipfile.ZIP_STORED)
                self.assertEqual(sorted(zf.namelist()), ["Lib/a.py", "python.exe"])
            packed_mtime = dest.stat().st_mtime_ns
            self.assertEqual(ensure_stored_zip(src, dest), "reuse")
            self.assertEqual(dest.stat().st_mtime_ns, packed_mtime)
            (src / "Lib" / "a.py").write_bytes(b"print(2)\n")
            self.assertEqual(ensure_stored_zip(src, dest), "packed")
            with zipfile.ZipFile(dest) as zf:
                self.assertEqual(zf.read("Lib/a.py"), b"print(2)\n")


if __name__ == "__main__":
    unittest.main()
