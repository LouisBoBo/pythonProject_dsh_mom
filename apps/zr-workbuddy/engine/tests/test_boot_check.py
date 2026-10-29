"""启动自检：工具模块必须可导入（不依赖 fcntl）。"""
from __future__ import annotations

import unittest


class BootCheckTests(unittest.TestCase):
    def test_tool_runtime_ok(self):
        from app.boot_check import check_tool_runtime

        out = check_tool_runtime()
        self.assertTrue(out.get("ok"), out)
        probes = out.get("probes") or {}
        self.assertEqual(probes.get("os_lock"), "ok")
        self.assertEqual(probes.get("plugins_store"), "ok")
        self.assertEqual(probes.get("usage_store"), "ok")
