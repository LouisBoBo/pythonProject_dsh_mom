#!/usr/bin/env python3
"""merge_company_dsh_market 纯函数单测（不访问网络）。"""
from __future__ import annotations

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import merge_company_dsh_market as mcm  # noqa: E402
from merge_company_dsh_market import (  # noqa: E402
    catalog_usable,
    merge_catalogs,
    overlay_seed_plugins,
    parse_pid,
    plugin_identity,
    should_refresh_official,
    spawn_background,
    stop_pid_file,
    OFFICIAL_TTL_S,
    OFFICIAL_FAIL_BACKOFF_S,
)


def _plug(name: str, **extra):
    row = {
        "name": name,
        "owner": "中软",
        "url": f"https://example.test/{name}",
        "category": "tools",
        "description": {"zh": name, "en": name},
        "npm": name,
        "install": f"dsh plugin add {name}",
        "added": "2026-09-11",
    }
    row.update(extra)
    return row


class MergeCatalogsTest(unittest.TestCase):
    def test_company_plugins_first_and_deduped(self):
        company = {
            "name": "company-dsh-plugins",
            "categories": {"tools": {"zh": "工具与能力", "en": "Tools"}},
            "plugins": [_plug("@zhongruan/a"), _plug("@zhongruan/b")],
        }
        official = {
            "categories": {
                "tools": {"zh": "工具", "en": "Tools"},
                "theme": {"zh": "主题", "en": "Themes"},
            },
            "plugins": [
                _plug("popular", downloads=9000, stars=100),
                _plug("@zhongruan/a", downloads=1),  # 不得盖住公司同名包
                _plug("other", downloads=10, stars=2),
            ],
        }
        merged = merge_catalogs(company, official)
        names = [p["name"] for p in merged["plugins"]]
        self.assertEqual(names[:2], ["@zhongruan/a", "@zhongruan/b"])
        self.assertIn("popular", names)
        self.assertIn("other", names)
        self.assertEqual(names.count("@zhongruan/a"), 1)
        self.assertGreater(merged["plugins"][0]["downloads"], 9000)
        self.assertGreater(merged["plugins"][0]["downloads"], merged["plugins"][1]["downloads"])
        self.assertIn("zhongruan", merged["plugins"][0]["category"])
        self.assertEqual(merged["workbuddy_merge"]["company_count"], 2)
        self.assertEqual(merged["workbuddy_merge"]["official_count"], 2)
        self.assertIn("zhongruan", merged["categories"])
        self.assertIn("theme", merged["categories"])

    def test_official_missing_still_has_company(self):
        company = {"plugins": [_plug("@zhongruan/a"), _plug("@zhongruan/b")]}
        merged = merge_catalogs(company, None)
        self.assertEqual(len(merged["plugins"]), 2)
        self.assertEqual(merged["plugins"][0]["name"], "@zhongruan/a")
        self.assertEqual(merged["workbuddy_merge"]["official_count"], 0)

    def test_empty_official_dict_ignored(self):
        company = {"plugins": [_plug("@zhongruan/a")]}
        merged = merge_catalogs(company, {"plugins": []})
        self.assertEqual([p["name"] for p in merged["plugins"]], ["@zhongruan/a"])

    def test_catalog_usable(self):
        self.assertFalse(catalog_usable(None))
        self.assertFalse(catalog_usable({"plugins": []}))
        self.assertTrue(catalog_usable({"plugins": [_plug("x")]}))

    def test_plugin_identity_prefers_npm(self):
        self.assertEqual(plugin_identity({"name": "A", "npm": "@scope/a"}), "@scope/a")
        self.assertEqual(plugin_identity({"name": "A"}), "a")

    def test_overlay_seed_fills_missing_only(self):
        company = {
            "name": "remote",
            "updated": "2026-09-11",
            "plugins": [_plug("@zhongruan/a"), _plug("@zhongruan/b")],
            "categories": {"tools": {"zh": "工具", "en": "Tools"}},
        }
        seed = {
            "plugins": [
                _plug("@zhongruan/a", version="9.9.9"),  # 已有，不覆盖
                _plug("@zhongruan/dsh-knowledge", version="0.1.0"),
            ],
            "categories": {"tools": {"zh": "工具与能力", "en": "Tools"}},
        }
        out = overlay_seed_plugins(company, seed)
        names = [p["name"] for p in out["plugins"]]
        self.assertEqual(names, ["@zhongruan/a", "@zhongruan/b", "@zhongruan/dsh-knowledge"])
        self.assertNotEqual(out["plugins"][0].get("version"), "9.9.9")
        self.assertEqual(out["count"], 3)


class TtlTest(unittest.TestCase):
    def test_skip_within_success_ttl(self):
        now = 2_000_000
        meta = {"official_ok_at": now - 3600, "official_last_attempt_at": now - 3600}
        self.assertFalse(should_refresh_official(meta, now))

    def test_refresh_after_one_day(self):
        now = 2_000_000
        meta = {
            "official_ok_at": now - OFFICIAL_TTL_S - 1,
            "official_last_attempt_at": now - OFFICIAL_TTL_S - 1,
        }
        self.assertTrue(should_refresh_official(meta, now))

    def test_backoff_after_failure(self):
        now = 2_000_000
        meta = {
            "official_ok_at": 0,
            "official_last_attempt_at": now - OFFICIAL_FAIL_BACKOFF_S + 10,
        }
        self.assertFalse(should_refresh_official(meta, now))


class SpawnPidTest(unittest.TestCase):
    def test_parse_pid(self):
        self.assertEqual(parse_pid("12\n"), 12)
        self.assertEqual(parse_pid("  7 extra"), 7)
        self.assertEqual(parse_pid(""), 0)
        self.assertEqual(parse_pid("nope"), 0)

    def test_spawn_writes_pid_and_stop_kills(self):
        import os
        import tempfile
        import time

        td = Path(tempfile.mkdtemp(prefix="wb-merge-pid-"))
        pid_path = td / "httpd.pid"
        log_path = td / "httpd.log"
        spawn_background(
            [sys.executable, "-c", "import time; time.sleep(30)"],
            log_path,
            pid_path,
        )
        self.assertTrue(pid_path.is_file())
        pid = parse_pid(pid_path.read_text(encoding="utf-8"))
        self.assertGreater(pid, 0)
        stop_pid_file(pid_path)
        self.assertFalse(pid_path.is_file())
        deadline = time.time() + 5
        alive = True
        while time.time() < deadline:
            alive = False
            try:
                if os.name == "nt":
                    import ctypes

                    kernel32 = ctypes.windll.kernel32
                    handle = kernel32.OpenProcess(0x1000, False, pid)
                    if handle:
                        code = ctypes.c_ulong()
                        kernel32.GetExitCodeProcess(handle, ctypes.byref(code))
                        kernel32.CloseHandle(handle)
                        alive = code.value == 259
                else:
                    # POSIX：被测进程是本测试的子进程，SIGTERM 后会成僵尸，
                    # os.kill(pid, 0) 对僵尸仍判活；先 poll 收割再判。
                    for p in list(mcm._BG_CHILDREN):
                        p.poll()
                    os.kill(pid, 0)
                    alive = True
            except OSError:
                alive = False
            if not alive:
                break
            time.sleep(0.2)
        self.assertFalse(alive, "background merge helper must die after stop_pid_file")


if __name__ == "__main__":
    unittest.main()
