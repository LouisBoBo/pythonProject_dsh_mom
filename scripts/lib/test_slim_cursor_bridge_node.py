"""cursor-sdk 自带 node.exe：内嵌 Node 不可用时必须留着。"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from slim_cursor_bridge_node import (  # noqa: E402
    bridge_help_ok,
    install_bridge_launchers,
    node_satisfies,
    parse_node_version,
    remove_private_node,
    slim_cursor_bridge_node,
)


class SlimCursorBridgeNodeTests(unittest.TestCase):
    def test_version_gate(self):
        self.assertEqual(parse_node_version("22.23.1\n"), (22, 23))
        self.assertTrue(node_satisfies((22, 13)))
        self.assertTrue(node_satisfies((24, 5)))
        self.assertFalse(node_satisfies((22, 12)))
        self.assertIsNone(parse_node_version(""))

    def test_launcher_points_at_runtime_node(self):
        with tempfile.TemporaryDirectory() as td:
            bin_dir = Path(td) / "bin"
            bin_dir.mkdir()
            (bin_dir / "node.exe").write_bytes(b"private-node")
            install_bridge_launchers(bin_dir)
            cmd = (bin_dir / "cursor-sdk-bridge.cmd").read_bytes()
            self.assertIn(b"node\\bin\\node.exe", cmd)
            self.assertIn(b"cursor-sdk-bridge.js", cmd)
            self.assertNotIn(b"%~dp0node.exe", cmd)
            freed = remove_private_node(bin_dir)
            self.assertEqual(freed, len(b"private-node"))
            self.assertFalse((bin_dir / "node.exe").exists())
            self.assertTrue((bin_dir / "cursor-sdk-bridge.cmd").is_file())

    def test_keeps_private_node_when_bundled_node_cannot_run(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            node = root / "node" / "bin" / "node.exe"
            node.parent.mkdir(parents=True)
            node.write_text("not-a-real-node", encoding="utf-8")
            bridge = (
                root
                / "python"
                / "Lib"
                / "site-packages"
                / "cursor_sdk"
                / "_vendor"
                / "bridge"
            )
            binf = bridge / "bin"
            binf.mkdir(parents=True)
            (binf / "node.exe").write_bytes(b"KEEP")
            (bridge / "dist" / "bin").mkdir(parents=True)
            (bridge / "dist" / "bin" / "cursor-sdk-bridge.js").write_text(
                "console.log('no')\n", encoding="utf-8"
            )
            ok, msg = slim_cursor_bridge_node(root)
            self.assertFalse(ok)
            self.assertIn("保留", msg)
            self.assertEqual((binf / "node.exe").read_bytes(), b"KEEP")

    def test_staged_bridge_help_on_bundled_node(self):
        root = Path(__file__).resolve().parents[2]
        node = root / "desktop" / "runtime" / "node" / "bin" / "node.exe"
        js = (
            root
            / "desktop"
            / "runtime"
            / "python"
            / "Lib"
            / "site-packages"
            / "cursor_sdk"
            / "_vendor"
            / "bridge"
            / "dist"
            / "bin"
            / "cursor-sdk-bridge.js"
        )
        if not node.is_file() or not js.is_file():
            self.skipTest("本机还没有打好的 desktop/runtime")
        self.assertTrue(bridge_help_ok(node, js))


if __name__ == "__main__":
    unittest.main()
