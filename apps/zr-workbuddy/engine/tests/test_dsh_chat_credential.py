"""WorkBuddy DeepSeek Key → DSH 聊天凭据。测试只写临时目录，禁止碰本机 ~/.dsh。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

from app.dsh_chat_credential import (
    REF_NAME,
    is_usable_key,
    key_from_config_dict,
    load_credential_refs,
    read_deepseek_api_key,
    sync_from_config_file,
    sync_workbuddy_deepseek_key,
)


class DshChatCredentialTests(unittest.TestCase):
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
            self.assertEqual(
                key_from_config_dict({"deepseek": {"api_key": "sk-engine-only-001"}}),
                "sk-engine-only-001",
            )

    def test_generic_provider_does_not_sync_key(self):
        self.assertEqual(
            key_from_config_dict(
                {
                    "deepseek": {
                        "provider": "openai_compat",
                        "api_key": "sk-other-vendor-001",
                        "model": "glm-4-flash",
                    }
                }
            ),
            "",
        )

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
            self.assertEqual(result["action"], "sync")
            row = result["homes"][0]
            self.assertEqual(row["action"], "seed")
            self.assertNotIn("sk-engine-seed-001", row["reason"])
            refs = load_credential_refs(dsh / ".credentials.yaml")
            self.assertEqual(refs[REF_NAME], "sk-engine-seed-001")

    def test_workbuddy_key_overwrites_stale_dsh_key(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            cfg = root / "config.yaml"
            dsh = root / "dsh-home"
            dsh.mkdir()
            cfg.write_text("deepseek:\n  api_key: sk-engine-new-001\n", encoding="utf-8")
            (dsh / ".credentials.yaml").write_text(
                'version: 1\n\nrefs:\n  DEEPSEEK_API_KEY: "sk-dsh-stale-001"\n',
                encoding="utf-8",
            )
            result = sync_from_config_file(cfg, homes=[dsh])
            self.assertEqual(result["homes"][0]["action"], "update")
            refs = load_credential_refs(dsh / ".credentials.yaml")
            self.assertEqual(refs[REF_NAME], "sk-engine-new-001")

    def test_keep_when_already_aligned(self):
        with tempfile.TemporaryDirectory() as td:
            dsh = Path(td) / "dsh-home"
            result = sync_workbuddy_deepseek_key("sk-same-001", homes=[dsh])
            self.assertEqual(result["homes"][0]["action"], "seed")
            again = sync_workbuddy_deepseek_key("sk-same-001", homes=[dsh])
            self.assertEqual(again["action"], "keep")
            self.assertEqual(again["homes"][0]["action"], "keep")

    def test_skip_when_engine_empty_does_not_wipe(self):
        with tempfile.TemporaryDirectory() as td:
            dsh = Path(td) / "dsh-home"
            dsh.mkdir()
            (dsh / ".credentials.yaml").write_text(
                'version: 1\n\nrefs:\n  DEEPSEEK_API_KEY: "sk-dsh-keep-001"\n',
                encoding="utf-8",
            )
            result = sync_workbuddy_deepseek_key("", homes=[dsh])
            self.assertEqual(result["action"], "skip")
            refs = load_credential_refs(dsh / ".credentials.yaml")
            self.assertEqual(refs[REF_NAME], "sk-dsh-keep-001")

    def test_save_config_triggers_sync(self):
        from app import config_store

        with tempfile.TemporaryDirectory() as td:
            tmp = Path(td)
            cfg_path = tmp / "config.yaml"
            with mock.patch.object(config_store, "CONFIG_DIR", str(tmp)), mock.patch.object(
                config_store, "CONFIG_PATH", str(cfg_path)
            ), mock.patch.object(config_store, "BACKUP_PATH", str(tmp / "config.yaml.bak")), mock.patch(
                "app.dsh_chat_credential.sync_workbuddy_deepseek_key"
            ) as sync_fn:
                config_store.save_config(
                    {"deepseek": {"provider": "deepseek", "api_key": "sk-save-001"}}
                )
            sync_fn.assert_called_once_with("sk-save-001")
            self.assertTrue(cfg_path.is_file())
