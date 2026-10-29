"""LLM 分槽配置：各提供方互不混填。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

from app.llm_config import normalize_deepseek_block, resolve_llm_cfg


class LlmConfigTests(unittest.TestCase):
    def test_empty_by_provider_does_not_erase_legacy_flat(self):
        """DEFAULT 合并后的空 by_provider 不得盖掉 config.yaml 顶层 api_key。"""
        raw = {
            "provider": "deepseek",
            "api_key": "sk-test-legacy-flat",
            "base_url": "https://api.deepseek.com",
            "model": "DeepSeek-V4-Flash",
            "by_provider": {
                "deepseek": {"api_key": "", "base_url": "", "model": ""},
                "ollama": {"api_key": "", "base_url": "http://127.0.0.1:11434", "model": ""},
                "openai_compat": {"api_key": "", "base_url": "", "model": ""},
            },
        }
        ds = normalize_deepseek_block(raw)
        self.assertEqual(ds["by_provider"]["deepseek"]["api_key"], "sk-test-legacy-flat")
        self.assertEqual(ds["api_key"], "sk-test-legacy-flat")
        self.assertEqual(ds["by_provider"]["openai_compat"]["api_key"], "")

    def test_legacy_flat_only_migrates_active_provider(self):
        raw = {
            "provider": "deepseek",
            "api_key": "sk-ds",
            "base_url": "https://api.deepseek.com",
            "model": "DeepSeek-V4-Flash",
        }
        ds = normalize_deepseek_block(raw)
        self.assertEqual(ds["by_provider"]["deepseek"]["api_key"], "sk-ds")
        self.assertEqual(ds["by_provider"]["deepseek"]["model"], "DeepSeek-V4-Flash")
        self.assertEqual(ds["by_provider"]["openai_compat"]["api_key"], "")
        self.assertEqual(ds["by_provider"]["openai_compat"]["base_url"], "")
        self.assertEqual(ds["by_provider"]["openai_compat"]["model"], "")

    def test_resolve_uses_selected_provider_slot(self):
        cfg = {
            "deepseek": {
                "provider": "openai_compat",
                "by_provider": {
                    "deepseek": {
                        "api_key": "sk-ds",
                        "base_url": "https://api.deepseek.com",
                        "model": "deepseek-chat",
                    },
                    "openai_compat": {
                        "api_key": "sk-glm",
                        "base_url": "https://open.bigmodel.cn/api/paas/v4",
                        "model": "glm-4-flash",
                    },
                    "ollama": {"api_key": "", "base_url": "http://127.0.0.1:11434", "model": "qwen2.5:7b"},
                },
            }
        }
        llm = resolve_llm_cfg(cfg)
        self.assertEqual(llm["provider"], "openai_compat")
        self.assertEqual(llm["api_key"], "sk-glm")
        self.assertEqual(llm["model"], "glm-4-flash")


if __name__ == "__main__":
    unittest.main()
