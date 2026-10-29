#!/usr/bin/env python3
"""ensure_cursor_coding_sidecar 单测（不依赖真实 :18788 进程时可 mock）。"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

import ensure_cursor_coding_sidecar as ecs


class EnsureCursorCodingSidecarTest(unittest.TestCase):
    def test_sidecar_base_default(self) -> None:
        with mock.patch.object(ecs, "_port_from_config", return_value=18788):
            self.assertEqual(ecs.sidecar_base(), "http://127.0.0.1:18788")

    def test_ensure_already_up(self) -> None:
        with mock.patch.object(
            ecs,
            "probe",
            return_value={"ok": True, "base": "http://127.0.0.1:18788", "detail": "ok"},
        ):
            out = ecs.ensure_cursor_coding_sidecar(fix=True)
        self.assertTrue(out["ok"])
        self.assertFalse(out["fixed"])

    def test_ensure_missing_pkg(self) -> None:
        with mock.patch.object(ecs, "probe", return_value={"ok": False, "detail": "down"}):
            with mock.patch.object(ecs, "find_pkg_dir", return_value=None):
                out = ecs.ensure_cursor_coding_sidecar(fix=True)
        self.assertFalse(out["ok"])
        self.assertIn("未找到", out["detail"])

    def test_ensure_spawns_when_down(self) -> None:
        calls = {"n": 0}

        def fake_probe(_base=None, timeout=2.5):  # noqa: ARG001
            calls["n"] += 1
            if calls["n"] == 1:
                return {"ok": False, "detail": "down"}
            return {"ok": True, "base": "http://127.0.0.1:18788", "detail": "up"}

        with tempfile.TemporaryDirectory() as td:
            pkg = Path(td) / "pkg"
            (pkg / "lib").mkdir(parents=True)
            (pkg / "lib" / "server.js").write_text("// stub\n", encoding="utf-8")
            with mock.patch.object(ecs, "probe", side_effect=fake_probe):
                with mock.patch.object(ecs, "find_pkg_dir", return_value=pkg):
                    with mock.patch.object(ecs, "_spawn_inplace", return_value=4242):
                        out = ecs.ensure_cursor_coding_sidecar(fix=True, wait_sec=2.0)
        self.assertTrue(out["ok"])
        self.assertTrue(out["fixed"])
        self.assertEqual(out.get("pid"), 4242)


if __name__ == "__main__":
    unittest.main()
