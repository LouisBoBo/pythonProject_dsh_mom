#!/usr/bin/env python3
"""align_dsh_tools：Windows npm 布局能找到宿主；realpath 对齐。"""
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from align_dsh_tools import align_all, align_one, find_host_tools, host_candidates, link_dir


class AlignDshToolsTests(unittest.TestCase):
    def test_windows_npm_layout_is_a_candidate(self):
        dsh = Path("C:/Users/Yu/AppData/Roaming/npm/dsh.cmd")
        home = Path("C:/Users/Yu")
        cands = [str(p).replace("\\", "/") for p in host_candidates(dsh, home)]
        self.assertTrue(
            any(
                p.endswith("AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools")
                for p in cands
            ),
            cands,
        )

    def test_unix_prefix_layout_is_a_candidate(self):
        dsh = Path("/home/u/.nvm/versions/node/v22.23.1/bin/dsh")
        home = Path("/home/u")
        cands = [str(p).replace("\\", "/") for p in host_candidates(dsh, home)]
        self.assertTrue(
            any(
                p.endswith("lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tools")
                for p in cands
            ),
            cands,
        )

    def test_align_identical_realpath_ok(self):
        with tempfile.TemporaryDirectory() as td:
            host = Path(td) / "host" / "dsh-tools"
            host.mkdir(parents=True)
            (host / "package.json").write_text('{"version":"0.0.0-test"}\n', encoding="utf-8")
            link = Path(td) / "link" / "dsh-tools"
            link.parent.mkdir(parents=True)
            if os.name == "nt":
                link_dir(link, host)
            else:
                os.symlink(str(host), str(link), target_is_directory=True)
            row = align_one("t", link, host, do_fix=False)
            self.assertTrue(row["ok"], row)

    def test_align_copy_is_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            host = Path(td) / "host" / "dsh-tools"
            copy = Path(td) / "copy" / "dsh-tools"
            host.mkdir(parents=True)
            copy.mkdir(parents=True)
            (host / "package.json").write_text('{"version":"1"}\n', encoding="utf-8")
            (copy / "package.json").write_text('{"version":"1"}\n', encoding="utf-8")
            row = align_one("t", copy, host, do_fix=False)
            self.assertFalse(row["ok"], row)

    def test_fix_replaces_copy_with_link(self):
        with tempfile.TemporaryDirectory() as td:
            host = Path(td) / "host" / "dsh-tools"
            copy = Path(td) / "profile" / "dsh-tools"
            host.mkdir(parents=True)
            copy.mkdir(parents=True)
            (host / "package.json").write_text('{"version":"1"}\n', encoding="utf-8")
            (copy / "package.json").write_text('{"version":"1"}\n', encoding="utf-8")
            (copy / "marker.txt").write_text("copy", encoding="utf-8")
            row = align_one("t", copy, host, do_fix=True)
            self.assertTrue(row["ok"], row)
            self.assertTrue(row["fixed"], row)
            self.assertEqual(copy.resolve(), host.resolve())
            # bak 可能已异步清掉；对齐成功且 copy 已是宿主 realpath 即可

    def test_fix_creates_missing_link(self):
        """新检出没有 vendor/@deepseek-ai/dsh-tools：--fix 必须按宿主建链。"""
        with tempfile.TemporaryDirectory() as td:
            host = Path(td) / "host" / "dsh-tools"
            host.mkdir(parents=True)
            (host / "package.json").write_text('{"version":"1"}\n', encoding="utf-8")
            link = Path(td) / "vendor" / "dsh-tools"
            row = align_one("vendor", link, host, do_fix=True, create_missing=True)
            self.assertTrue(link.exists(), row)
            self.assertTrue(row["ok"], row)
            self.assertTrue(row["fixed"], row)
            self.assertEqual(link.resolve(), host.resolve())

    def test_check_mode_still_skips_missing(self):
        with tempfile.TemporaryDirectory() as td:
            host = Path(td) / "host" / "dsh-tools"
            host.mkdir(parents=True)
            (host / "package.json").write_text('{"version":"1"}\n', encoding="utf-8")
            link = Path(td) / "vendor" / "dsh-tools"
            row = align_one("vendor", link, host, do_fix=False, create_missing=True)
            self.assertFalse(link.exists())
            self.assertTrue(row["ok"], row)
            self.assertIn("不存在", row["detail"])

    def test_require_fails_when_host_missing(self):
        with mock.patch("align_dsh_tools.find_host_tools", return_value=None):
            report = align_all(do_fix=False, require=True)
        self.assertFalse(report["ok"])
        skipped = align_all(do_fix=False, require=False, host=Path("/no/such/dsh-tools"))
        self.assertTrue(skipped["ok"])
        self.assertFalse(skipped.get("host"))


    def test_env_host_tools_wins(self):
        with tempfile.TemporaryDirectory() as td:
            tools = Path(td) / "dsh-tools"
            tools.mkdir()
            (tools / "package.json").write_text('{"name":"@deepseek-ai/dsh-tools"}\n', encoding="utf-8")
            with mock.patch.dict(os.environ, {"WORKBUDDY_HOST_DSH_TOOLS": str(tools)}, clear=False):
                found = find_host_tools()
            self.assertEqual(found, tools)

    # Windows mklink 语义：mock os.name=nt 后会走 WindowsPath，POSIX 上无法实例化，仅 win32 可跑
    @unittest.skipIf(os.name != "nt", "Windows mklink 语义仅 win32 可跑")
    def test_windows_mklink_quotes_spaces(self):
        seen = {}

        def fake_run(argv, **kwargs):
            seen["argv"] = argv
            seen["kwargs"] = kwargs

            class _P:
                returncode = 0
                stdout = ""
                stderr = ""

            return _P()

        with mock.patch("align_dsh_tools.subprocess.run", side_effect=fake_run):
            with mock.patch("align_dsh_tools.os.name", "nt"):
                link_dir(
                    Path(r"C:\Users\Yu\AppData\Local\Programs\ZR WorkBuddy\tools"),
                    Path(r"C:\host\dsh-tools"),
                )
        self.assertEqual(seen["argv"][:4], ["cmd.exe", "/c", "mklink", "/J"])
        self.assertTrue(any("ZR WorkBuddy" in str(a) for a in seen["argv"]))
        if os.name == "nt":
            self.assertEqual(seen["kwargs"].get("creationflags"), 0x08000000)


if __name__ == "__main__":
    unittest.main()
