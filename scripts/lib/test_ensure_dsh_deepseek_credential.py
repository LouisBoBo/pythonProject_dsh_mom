#!/usr/bin/env python3
"""ensure_dsh_deepseek_credential 单测：WorkBuddy Key 为真相源。只写临时目录。"""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

_ENGINE = Path(__file__).resolve().parents[2] / "apps" / "zr-workbuddy" / "engine"
if str(_ENGINE) not in sys.path:
    sys.path.insert(0, str(_ENGINE))

from app.dsh_chat_credential import (  # noqa: E402
    REF_NAME,
    is_usable_key,
    load_credential_refs,
    read_deepseek_api_key,
    sync_from_config_file,
)


class EnsureDshDeepseekCredentialTests(unittest.TestCase):
    def test_is_usable_key_rejects_placeholders(self):
        self.assertFalse(is_usable_key(""))
        self.assertFalse(is_usable_key("***"))
        self.assertFalse(is_usable_key("sk-xxx"))
        self.assertFalse(is_usable_key("<your-key>"))
        self.assertTrue(is_usable_key("sk-test-not-a-real-secret-001"))

    def test_read_only_deepseek_block(self):
        with tempfile.TemporaryDirectory() as td:
            cfg = Path(td) / "config.yaml"
            cfg.write_text(
                "vision:\n  api_key: sk-vision-should-ignore\ndeepseek:\n"
                "  provider: deepseek\n  api_key: sk-engine-only-001\n"
                "  model: DeepSeek-V4-Flash\n",
                encoding="utf-8",
            )
            self.assertEqual(read_deepseek_api_key(cfg), "sk-engine-only-001")

    def test_seed_when_dsh_missing(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            cfg = root / "config.yaml"
            dsh = root / "dsh-home"
            cfg.write_text(
                'deepseek:\n  api_key: "sk-engine-seed-001"\n',
                encoding="utf-8",
            )
            result = sync_from_config_file(cfg, homes=[dsh])
            self.assertEqual(result["homes"][0]["action"], "seed")
            self.assertNotIn("sk-engine-seed-001", result["homes"][0]["reason"])
            refs = load_credential_refs(dsh / ".credentials.yaml")
            self.assertEqual(refs[REF_NAME], "sk-engine-seed-001")

    def test_workbuddy_overwrites_existing_dsh_key(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            cfg = root / "config.yaml"
            dsh = root / "dsh-home"
            dsh.mkdir()
            cfg.write_text("deepseek:\n  api_key: sk-engine-new-001\n", encoding="utf-8")
            (dsh / ".credentials.yaml").write_text(
                'version: 1\n\nrefs:\n  DEEPSEEK_API_KEY: "sk-dsh-existing-001"\n',
                encoding="utf-8",
            )
            result = sync_from_config_file(cfg, homes=[dsh])
            self.assertEqual(result["homes"][0]["action"], "update")
            refs = load_credential_refs(dsh / ".credentials.yaml")
            self.assertEqual(refs[REF_NAME], "sk-engine-new-001")

    def test_skip_when_engine_empty(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            cfg = root / "config.yaml"
            dsh = root / "dsh-home"
            cfg.write_text("deepseek:\n  api_key: ''\n", encoding="utf-8")
            result = sync_from_config_file(cfg, homes=[dsh])
            self.assertEqual(result["action"], "skip")
            self.assertFalse((dsh / ".credentials.yaml").exists())
