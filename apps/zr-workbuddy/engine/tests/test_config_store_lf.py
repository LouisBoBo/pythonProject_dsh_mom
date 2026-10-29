"""config.yaml 必须用 LF 落盘，避免 DSH 插件 CRLF 段解析只读到第一行。"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock


class ConfigStoreLfTest(unittest.TestCase):
    def test_save_config_writes_lf_not_crlf(self) -> None:
        from app import config_store

        with tempfile.TemporaryDirectory() as tmp:
            cfg_path = Path(tmp) / "config.yaml"
            bak = Path(str(cfg_path) + ".bak")
            sample = {
                "automations": {
                    "wecom_webhook_key": "wk-test",
                    "wecom_push_enabled": True,
                    "feishu_app_id": "cli_test",
                    "feishu_app_secret": "sec-test",
                },
                "vision": {
                    "api_key": "vk-test",
                    "base_url": "https://example.invalid",
                    "model": "glm-4v-flash",
                },
            }
            with mock.patch.object(config_store, "CONFIG_PATH", str(cfg_path)), mock.patch.object(
                config_store, "BACKUP_PATH", str(bak)
            ), mock.patch.object(
                config_store, "CONFIG_DIR", tmp
            ), mock.patch.object(
                config_store, "_sync_dsh_chat_credential", lambda _c: None
            ):
                config_store.save_config(sample)
            raw = cfg_path.read_bytes()
            self.assertNotIn(b"\r\n", raw, "Windows 不得写出 CRLF")
            self.assertIn(b"feishu_app_id: cli_test\n", raw)
            self.assertIn(b"feishu_app_secret: sec-test\n", raw)
            text = raw.decode("utf-8")
            # 模拟 DSH 插件简易段解析（只认 LF）
            import re

            m = re.search(r"^automations:\s*\n((?:[ \t]+.*\n?)*)", text, re.M)
            self.assertIsNotNone(m)
            block = m.group(1)
            self.assertIn("feishu_app_id", block)
            self.assertIn("feishu_app_secret", block)


if __name__ == "__main__":
    unittest.main()
