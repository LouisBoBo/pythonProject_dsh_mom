#!/usr/bin/env python3
"""ensure_company_knowledge：空缺合并、不覆盖、无密钥泄漏。"""
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import ensure_company_knowledge as eck


class MergeSectionTests(unittest.TestCase):
    def test_fills_empty_only(self):
        cur = {"base_url": "", "read_token": "keep-me-token-xxxxxxxxxxxxxxxx"}
        desired = {
            "base_url": "https://example.com",
            "read_token": "new-token-should-not-win-xxxxxxxxxxxx",
            "verify_ssl": False,
        }
        out, changed = eck.merge_into_section(cur, desired)
        self.assertEqual(out["base_url"], "https://example.com")
        self.assertEqual(out["read_token"], "keep-me-token-xxxxxxxxxxxxxxxx")
        self.assertEqual(out["verify_ssl"], False)
        self.assertIn("base_url", changed)
        self.assertNotIn("read_token", changed)

    def test_desired_section_defaults(self):
        d = eck.desired_section({})
        self.assertEqual(d["base_url"], eck.PRODUCT_DEFAULTS["base_url"])
        self.assertTrue(d["verify_ssl"])


class LoadSeedTests(unittest.TestCase):
    def test_load_seed_file(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "company-knowledge.env"
            p.write_text(
                "# comment\n"
                "COMPANY_KNOWLEDGE_BASE_URL=https://kb.example:8093\n"
                "COMPANY_KNOWLEDGE_READ_TOKEN=dshk_abcdefghijklmnopqrstuvwxyz012345\n"
                "COMPANY_KNOWLEDGE_VERIFY_SSL=false\n",
                encoding="utf-8",
            )
            seed = eck.load_seed_file(p)
            self.assertEqual(seed["base_url"], "https://kb.example:8093")
            self.assertGreaterEqual(len(seed["read_token"]), 24)
            self.assertIs(seed["verify_ssl"], False)

    def test_unconfigured_overwrites_default_verify_ssl(self):
        cur = {
            "base_url": "",
            "api_prefix": "/knowledge-api/v1",
            "read_token": "",
            "verify_ssl": True,  # DEFAULT_CONFIG
        }
        desired = {
            "base_url": "https://175.178.238.31:8093",
            "read_token": "dshk_abcdefghijklmnopqrstuvwxyz012345",
            "verify_ssl": False,
        }
        out, changed = eck.merge_into_section(cur, desired)
        self.assertIs(out["verify_ssl"], False)
        self.assertIn("verify_ssl", changed)

    def test_env_overrides_file(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "company-knowledge.env"
            p.write_text(
                "COMPANY_KNOWLEDGE_BASE_URL=https://from-file\n",
                encoding="utf-8",
            )
            with mock.patch.dict(
                os.environ,
                {"COMPANY_KNOWLEDGE_BASE_URL": "https://from-env"},
                clear=False,
            ):
                seed = eck.load_seed_file(p)
            self.assertEqual(seed["base_url"], "https://from-env")


class EnsureIntegrationTests(unittest.TestCase):
    def test_fix_writes_empty_config(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            cfg_dir = root / "apps" / "zr-workbuddy" / "engine" / "config"
            cfg_dir.mkdir(parents=True)
            cfg = cfg_dir / "config.yaml"
            cfg.write_text("mes:\n  base_url: http://127.0.0.1:9\n", encoding="utf-8")
            seed = root / "apps" / "zr-workbuddy" / "config" / "company-knowledge.env"
            seed.parent.mkdir(parents=True)
            seed.write_text(
                "COMPANY_KNOWLEDGE_BASE_URL=https://175.178.238.31:8093\n"
                "COMPANY_KNOWLEDGE_READ_TOKEN=dshk_TEST_READ_TOKEN_ABCDEFGHIJKL\n"
                "COMPANY_KNOWLEDGE_WRITE_TOKEN=dshk_TEST_WRITE_TOKEN_ABCDEFGHIJK\n"
                "COMPANY_KNOWLEDGE_VERIFY_SSL=false\n",
                encoding="utf-8",
            )
            # 指向临时仓根下的 engine（ensure 会 import 真 engine；config 路径显式传入）
            res = eck.ensure_company_knowledge(
                config_path=cfg,
                seed_path=seed,
                root=Path(__file__).resolve().parents[2],
                do_fix=True,
            )
            self.assertTrue(res["ok"])
            self.assertTrue(res["configured"])
            self.assertTrue(res["fixed"])
            text = cfg.read_text(encoding="utf-8")
            self.assertIn("company_knowledge:", text)
            self.assertIn("175.178.238.31", text)
            self.assertIn("dshk_TEST_READ_TOKEN", text)
            # 不覆盖第二次
            res2 = eck.ensure_company_knowledge(
                config_path=cfg,
                seed_path=seed,
                root=Path(__file__).resolve().parents[2],
                do_fix=True,
            )
            self.assertTrue(res2["configured"])
            self.assertFalse(res2["fixed"])

    def test_skip_env(self):
        with mock.patch.dict(os.environ, {"WORKBUDDY_SKIP_COMPANY_KNOWLEDGE": "1"}):
            res = eck.ensure_company_knowledge(do_fix=True)
        self.assertTrue(res["ok"])
        self.assertIn("跳过", res["detail"])


if __name__ == "__main__":
    unittest.main()
