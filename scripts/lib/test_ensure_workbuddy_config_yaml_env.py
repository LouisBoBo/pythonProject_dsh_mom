#!/usr/bin/env python3
"""ensure_workbuddy_config_yaml_env 安全单测（无网络）。"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ensure_workbuddy_config_yaml_env import (
    _safe_fwd_path,
    _yaml_dq,
    upsert_env,
    write_sidecar,
)


class TestYamlQuote(unittest.TestCase):
    def test_quotes_specials(self):
        self.assertEqual(_yaml_dq('a:b#c"d\\e'), '"a:b#c\\"d\\\\e"')

    def test_strips_cr_and_escapes_nl(self):
        self.assertEqual(_yaml_dq("x\r\ny"), '"x\\ny"')


class TestSafePath(unittest.TestCase):
    def test_ok_windows(self):
        self.assertEqual(
            _safe_fwd_path(r"C:\Users\Yu\.dsh\workbuddy-mes.yaml"),
            "C:/Users/Yu/.dsh/workbuddy-mes.yaml",
        )

    def test_reject_newline(self):
        with self.assertRaises(RuntimeError):
            _safe_fwd_path("C:/evil\nOTHER=1")

    def test_reject_hash(self):
        with self.assertRaises(RuntimeError):
            _safe_fwd_path("C:/a#b")


class TestSidecar(unittest.TestCase):
    def test_write_quotes_password_with_colon(self):
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            dest = write_sidecar(
                home,
                {
                    "base_url": "http://127.0.0.1:8009",
                    "username": "u1",
                    "password": "p:ass#word\"x",
                    "enterprise_code": "江西中软",
                },
            )
            text = dest.read_text(encoding="utf-8")
            self.assertIn('password: "p:ass#word\\"x"', text)
            self.assertIn('enterprise_code: "江西中软"', text)
            # 解析后密码还原
            import yaml

            raw = yaml.safe_load(text)
            self.assertEqual(raw["mes"]["password"], 'p:ass#word"x')

    def test_sidecar_includes_feishu_automations(self):
        """WORKBUDDY_CONFIG_YAML 只读 sidecar：必须带上飞书键，避免误报未配置。"""
        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            dest = write_sidecar(
                home,
                {
                    "base_url": "http://127.0.0.1:8009",
                    "username": "u1",
                    "password": "p",
                    "enterprise_code": "江西中软",
                },
                automations={
                    "feishu_app_id": "cli_test_app",
                    "feishu_app_secret": "sec_test_secret",
                    "feishu_bitable_enabled": True,
                    "wecom_webhook_key": "wk-1",
                    "wecom_push_enabled": True,
                },
            )
            text = dest.read_text(encoding="utf-8")
            self.assertNotIn("\r\n", text)
            self.assertIn("automations:", text)
            self.assertIn('feishu_app_id: "cli_test_app"', text)
            self.assertIn('feishu_app_secret: "sec_test_secret"', text)
            # 模拟插件段解析
            import re

            m = re.search(r"^automations:\s*\n((?:[ \t]+.*\n?)*)", text, re.M)
            self.assertIsNotNone(m)
            block = m.group(1)
            self.assertIn("feishu_app_id", block)
            self.assertIn("feishu_app_secret", block)
            # DeepSeek Key 不得进 sidecar（防多副本泄漏）
            self.assertNotIn("deepseek:", text)
            self.assertNotIn("sk-", text)

    def test_upsert_env_block(self):
        with tempfile.TemporaryDirectory() as td:
            env = Path(td) / ".env"
            env.write_text("FOO=1\n", encoding="utf-8")
            note = upsert_env(env, "C:/Users/Yu/.dsh/workbuddy-mes.yaml")
            self.assertEqual(note, "inserted")
            t = env.read_text(encoding="utf-8")
            self.assertIn("WORKBUDDY_CONFIG_YAML=C:/Users/Yu/.dsh/workbuddy-mes.yaml", t)
            self.assertIn("# --- workbuddy-mes-config ---", t)
            note2 = upsert_env(env, "D:/AICodes/x/workbuddy-mes.yaml")
            self.assertEqual(note2, "updated")
            t2 = env.read_text(encoding="utf-8")
            self.assertEqual(t2.count("WORKBUDDY_CONFIG_YAML="), 1)
            self.assertIn("D:/AICodes/x/workbuddy-mes.yaml", t2)


if __name__ == "__main__":
    unittest.main()
