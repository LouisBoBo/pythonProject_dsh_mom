#!/usr/bin/env python3
"""ensure_cursor_sdk_zod：缺 dist 的 zod 要能从 tarball 补齐。"""
from __future__ import annotations

import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ensure_cursor_sdk_zod import (
    ensure_cursor_sdk_zod,
    ensure_zod_pnpm_override,
    needed,
    zod_ready,
)


def _write_tarball(path: Path) -> None:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        def add(name: str, data: bytes) -> None:
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))

        add("package/package.json", b'{"name":"zod","version":"3.25.67"}\n')
        add("package/dist/esm/index.js", b"export const ok = true;\n")
    path.write_bytes(buf.getvalue())


class EnsureCursorSdkZodTests(unittest.TestCase):
    def test_skip_when_no_cursor(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps({"dependencies": {}, "dsh": {"profile": {"bundles": []}}}) + "\n",
                encoding="utf-8",
            )
            self.assertFalse(needed(profile))
            r = ensure_cursor_sdk_zod(profile, do_fix=True)
            self.assertTrue(r["ready"])
            self.assertIn("跳过", r["detail"])

    def test_needed_for_cursor_chat(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {"@zhongruan/dsh-cursor-chat": "0.1.5"},
                        "dsh": {"profile": {"bundles": ["@zhongruan/dsh-cursor-chat"]}},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertTrue(needed(profile))

    def test_pnpm_override_pinned(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            pkg_path = profile / "package.json"
            pkg_path.write_text(
                json.dumps(
                    {
                        "dependencies": {"@zhongruan/dsh-cursor-chat": "0.1.5"},
                        "dsh": {"profile": {"bundles": ["@zhongruan/dsh-cursor-chat"]}},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertTrue(ensure_zod_pnpm_override(profile))
            pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
            self.assertEqual(pkg["pnpm"]["overrides"]["zod"], "3.25.67")
            self.assertFalse(ensure_zod_pnpm_override(profile))

    def test_fix_incomplete_zod(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {"@zhongruan/dsh-cursor-coding": "^0.6.48"},
                        "dsh": {"profile": {"bundles": ["@zhongruan/dsh-cursor-coding"]}},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            sdk = profile / "node_modules" / "@cursor" / "sdk"
            sdk.mkdir(parents=True)
            (sdk / "package.json").write_text('{"name":"@cursor/sdk"}\n', encoding="utf-8")
            zod = profile / "node_modules" / "zod"
            zod.mkdir(parents=True)
            (zod / "package.json").write_text('{"name":"zod","version":"3.25.0"}\n', encoding="utf-8")
            (zod / "src").mkdir()
            self.assertFalse(zod_ready(profile))
            tgz = Path(td) / "zod-fake.tgz"
            _write_tarball(tgz)
            import os

            os.environ["WORKBUDDY_ZOD_TARBALL"] = str(tgz)
            try:
                r = ensure_cursor_sdk_zod(profile, do_fix=True)
            finally:
                os.environ.pop("WORKBUDDY_ZOD_TARBALL", None)
            self.assertTrue(r["ready"], r)
            self.assertTrue(zod_ready(profile))

    def test_force_repack_zod_3250_even_if_dist_present(self):
        """市场装回 3.25.0 时即使残留半截 dist 也强制换成钉选版。"""
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {"@zhongruan/dsh-cursor-chat": "0.1.5"},
                        "dsh": {"profile": {"bundles": ["@zhongruan/dsh-cursor-chat"]}},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            sdk = profile / "node_modules" / "@cursor" / "sdk"
            sdk.mkdir(parents=True)
            (sdk / "package.json").write_text('{"name":"@cursor/sdk"}\n', encoding="utf-8")
            zod = profile / "node_modules" / "zod"
            esm = zod / "dist" / "esm"
            esm.mkdir(parents=True)
            (zod / "package.json").write_text('{"name":"zod","version":"3.25.0"}\n', encoding="utf-8")
            (esm / "index.js").write_text("export const stale = true;\n", encoding="utf-8")
            self.assertTrue(zod_ready(profile))
            tgz = Path(td) / "zod-fake.tgz"
            _write_tarball(tgz)
            import os

            os.environ["WORKBUDDY_ZOD_TARBALL"] = str(tgz)
            try:
                r = ensure_cursor_sdk_zod(profile, do_fix=True)
            finally:
                os.environ.pop("WORKBUDDY_ZOD_TARBALL", None)
            self.assertTrue(r["ready"], r)
            self.assertTrue(r["fixed"], r)
            ver = json.loads((zod / "package.json").read_text(encoding="utf-8"))["version"]
            self.assertEqual(ver, "3.25.67")
            self.assertIn("ok = true", (esm / "index.js").read_text(encoding="utf-8"))

    def test_fix_without_npm_does_not_crash(self):
        with tempfile.TemporaryDirectory() as td:
            profile = Path(td)
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {"@zhongruan/dsh-cursor-coding": "^0.6.48"},
                        "dsh": {"profile": {"bundles": ["@zhongruan/dsh-cursor-coding"]}},
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            sdk = profile / "node_modules" / "@cursor" / "sdk"
            sdk.mkdir(parents=True)
            (sdk / "package.json").write_text('{"name":"@cursor/sdk"}\n', encoding="utf-8")
            import ensure_cursor_sdk_zod as mod

            # 无包内 tarball、下载也失败时，才落到 npm；此处断言 npm 不可用不会崩进程
            with unittest.mock.patch.object(mod, "_find_bundled_zod_tarball", return_value=None):
                with unittest.mock.patch.object(
                    mod, "_download_zod_tarball", side_effect=RuntimeError("offline")
                ):
                    with unittest.mock.patch.object(
                        mod, "_run_npm", side_effect=FileNotFoundError("找不到 npm")
                    ):
                        r = ensure_cursor_sdk_zod(profile, do_fix=True)
            self.assertFalse(r["ready"])
            self.assertTrue("npm" in r["detail"] or "失败" in r["detail"], r)

    def test_run_npm_prefers_node_cli(self):
        import ensure_cursor_sdk_zod as mod

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            node = root / "node.exe"
            node.write_text("", encoding="utf-8")
            cli = root / "node_modules" / "npm" / "bin" / "npm-cli.js"
            cli.parent.mkdir(parents=True)
            cli.write_text("console.log(1)\n", encoding="utf-8")
            out_dir = root / "out"
            out_dir.mkdir()
            seen = {}

            def fake_run(cmd, **kwargs):
                seen["cmd"] = list(cmd)
                seen["shell"] = bool(kwargs.get("shell"))
                (out_dir / "zod-3.25.67.tgz").write_bytes(b"x")

                class _P:
                    returncode = 0

                return _P()

            with unittest.mock.patch.object(mod, "_find_node", return_value=node):
                with unittest.mock.patch.object(mod, "_find_npm_cli", return_value=cli):
                    with unittest.mock.patch.object(mod.subprocess, "run", side_effect=fake_run):
                        packed = mod._npm_pack("3.25.67", out_dir)
            self.assertEqual(seen["cmd"][:3], [str(node), str(cli), "pack"])
            self.assertFalse(seen["shell"])
            self.assertTrue(packed.name.startswith("zod-"))


if __name__ == "__main__":
    unittest.main()
