#!/usr/bin/env python3
"""ensure_dsh_knowledge 单测（托管 link 模式）。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ensure_dsh_knowledge import (
    KB_PKG,
    KB_PEER_REQUIRED,
    LEGACY_KB_PKGS,
    _ensure_release_age_exclude,
    assert_kb_peers_ready,
    ensure_dsh_knowledge,
    link_dep_spec,
    pack_dir,
    package_installed,
    wire_link_into_profile,
    wire_pack_deps,
)


class EnsureDshKnowledgeTest(unittest.TestCase):
    def test_fresh_profile_kicks_bundle_until_pack_ready(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {"@lemoncat7/dsh-knowledge": "2.9.6"},
                        "dsh": {"profile": {"bundles": ["@lemoncat7/dsh-knowledge", KB_PKG]}},
                    }
                ),
                encoding="utf-8",
            )
            (profile / "cordis.patch.yml").write_text(
                "- id: webserver\n  config:\n    host: 127.0.0.1\n",
                encoding="utf-8",
            )
            (profile / "pnpm-workspace.yaml").write_text(
                "packages:\n  - .\nallowBuilds:\n  esbuild: true\n",
                encoding="utf-8",
            )
            with patch("ensure_dsh_knowledge.resolve_kb_version", return_value="1.0.9"):
                r = ensure_dsh_knowledge(profile)
            self.assertTrue(r["need_install"])
            pkg = json.loads((profile / "package.json").read_text(encoding="utf-8"))
            self.assertNotIn(KB_PKG, pkg["dsh"]["profile"]["bundles"])

    def test_wire_link_sets_link_dep_and_junction(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            pack = root / "workbuddy-packs" / "dsh-knowledge"
            pack.mkdir(parents=True)
            (pack / "package.json").write_text(
                f'{{"name":"{KB_PKG}","version":"1.0.9"}}\n', encoding="utf-8"
            )
            # peer/deps stubs in profile
            for name in (
                "@deepseek-ai/schemastery",
                "@deepseek-ai/cordis",
                "@deepseek-ai/cosmokit",
                "mammoth",
                "marked",
                "pdfjs-dist",
                "yaml",
            ):
                d = profile.joinpath("node_modules", *name.split("/"))
                d.mkdir(parents=True)
                (d / "package.json").write_text(
                    f'{{"name":"{name}","version":"1.0.0"}}\n', encoding="utf-8"
                )
            (profile / "package.json").write_text(
                json.dumps(
                    {
                        "dependencies": {
                            KB_PKG: "^1.0.4",
                            "@lemoncat7/dsh-knowledge": "2.9.6",
                        },
                        "dsh": {"profile": {"bundles": [KB_PKG, "@lemoncat7/dsh-knowledge"]}},
                    }
                ),
                encoding="utf-8",
            )
            (profile / "pnpm-lock.yaml").write_text(
                "importers:\n  .:\n    dependencies:\n"
                f"      '{KB_PKG}':\n        specifier: ^1.0.4\n"
                "        version: 1.0.4(@deepseek-ai/cordis@4.0.2)\n",
                encoding="utf-8",
            )
            note = wire_link_into_profile(profile)
            self.assertIn("link:", note)
            pkg = json.loads((profile / "package.json").read_text(encoding="utf-8"))
            self.assertEqual(pkg["dependencies"][KB_PKG], link_dep_spec())
            for legacy in LEGACY_KB_PKGS:
                self.assertNotIn(legacy, pkg["dependencies"])
            nm_pj = profile / "node_modules" / "@zhongruan" / "dsh-knowledge" / "package.json"
            self.assertTrue(nm_pj.is_file())
            self.assertEqual(json.loads(nm_pj.read_text(encoding="utf-8"))["version"], "1.0.9")
            # pack 内应有 schemastery junction
            self.assertTrue(
                (pack / "node_modules" / "@deepseek-ai" / "schemastery" / "package.json").is_file()
            )
            self.assertIn("接线依赖", note)
            lock = (profile / "pnpm-lock.yaml").read_text(encoding="utf-8")
            self.assertIn(f"specifier: {link_dep_spec()}", lock)
            self.assertTrue(package_installed(profile))
            self.assertEqual(pack_dir(profile), pack)
            # pack + profile hoist：卸其它插件后仍能解析 mammoth
            self.assertTrue(
                (pack / "node_modules" / "mammoth" / "package.json").is_file()
            )
            self.assertTrue(
                (profile / "node_modules" / "mammoth" / "package.json").is_file()
            )
            assert_kb_peers_ready(profile)

    def test_release_age_exclude_covers_company_pkgs(self):
        with tempfile.TemporaryDirectory() as td:
            ws = Path(td) / "pnpm-workspace.yaml"
            ws.write_text(
                "packages:\n  - .\nallowBuilds:\n  esbuild: true\n",
                encoding="utf-8",
            )
            note = _ensure_release_age_exclude(ws)
            self.assertIn("minimumReleaseAgeExclude", note)
            text = ws.read_text(encoding="utf-8")
            self.assertIn("@zhongruan/*", text)
            self.assertIn("dshmarket", text)
            # 再跑一遍应幂等
            note2 = _ensure_release_age_exclude(ws)
            self.assertIn("已含", note2)

    def test_assert_kb_peers_ready_rejects_missing_mammoth(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            pack = root / "workbuddy-packs" / "dsh-knowledge"
            pack.mkdir(parents=True)
            (pack / "package.json").write_text(
                f'{{"name":"{KB_PKG}","version":"1.0.9"}}\n', encoding="utf-8"
            )
            # 只给 schemastery，缺 mammoth 等 → 必须拒绝启动
            sm = pack / "node_modules" / "@deepseek-ai" / "schemastery"
            sm.mkdir(parents=True)
            (sm / "package.json").write_text(
                '{"name":"@deepseek-ai/schemastery","version":"1.0.0"}\n',
                encoding="utf-8",
            )
            with self.assertRaises(RuntimeError) as ctx:
                assert_kb_peers_ready(profile)
            msg = str(ctx.exception)
            self.assertIn("mammoth", msg)
            self.assertIn("拒绝启动", msg)

    def test_wire_pack_deps_hoists_required_peers(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            pack = root / "workbuddy-packs" / "dsh-knowledge"
            pack.mkdir(parents=True)
            (pack / "package.json").write_text(
                f'{{"name":"{KB_PKG}","version":"1.0.9"}}\n', encoding="utf-8"
            )
            # 裸名必查 peer 须已在 pack（prefer_real 不从 profile 取源，避免自环；测 hoist 勿打网）
            for name in KB_PEER_REQUIRED:
                d = pack.joinpath("node_modules", *name.split("/"))
                d.mkdir(parents=True)
                # mammoth 无 dependencies → _peer_pkg_ok 不要求嵌套包
                (d / "package.json").write_text(
                    f'{{"name":"{name}","version":"1.0.0"}}\n', encoding="utf-8"
                )
            note = wire_pack_deps(profile)
            self.assertIn("接线依赖", note)
            for name in KB_PEER_REQUIRED:
                self.assertTrue(
                    pack.joinpath("node_modules", *name.split("/"), "package.json").is_file(),
                    msg=f"pack 缺 {name}",
                )
                self.assertTrue(
                    profile.joinpath("node_modules", *name.split("/"), "package.json").is_file(),
                    msg=f"profile 缺 hoist {name}",
                )
            assert_kb_peers_ready(profile)

    def test_mammoth_missing_runtime_deps_and_fill_from_profile(self):
        from ensure_dsh_knowledge import (
            _link_mammoth_runtime_deps,
            _mammoth_missing_runtime_deps,
            _peer_pkg_ok,
        )

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            mammoth = root / "mammoth"
            mammoth.mkdir(parents=True)
            (mammoth / "package.json").write_text(
                json.dumps(
                    {
                        "name": "mammoth",
                        "version": "1.0.0",
                        "dependencies": {
                            "underscore": "^1.13.1",
                            "base64-js": "^1.5.1",
                        },
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            self.assertEqual(
                set(_mammoth_missing_runtime_deps(mammoth)),
                {"underscore", "base64-js"},
            )
            self.assertFalse(_peer_pkg_ok(mammoth))
            for name in ("underscore", "base64-js"):
                d = profile.joinpath("node_modules", name)
                d.mkdir(parents=True)
                (d / "package.json").write_text(
                    f'{{"name":"{name}","version":"1.0.0"}}\n', encoding="utf-8"
                )
            note = _link_mammoth_runtime_deps(profile, mammoth)
            self.assertTrue(note)
            self.assertEqual(_mammoth_missing_runtime_deps(mammoth), [])
            self.assertTrue(_peer_pkg_ok(mammoth))

    def test_repair_kb_peers_repairs_mammoth_without_company_npm(self):
        from ensure_dsh_knowledge import repair_kb_peers

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            profile = root / "profiles" / "web"
            profile.mkdir(parents=True)
            pack = root / "workbuddy-packs" / "dsh-knowledge"
            pack.mkdir(parents=True)
            (pack / "package.json").write_text(
                f'{{"name":"{KB_PKG}","version":"1.0.9"}}\n', encoding="utf-8"
            )
            for name in KB_PEER_REQUIRED:
                d = pack.joinpath("node_modules", *name.split("/"))
                d.mkdir(parents=True)
                body = {"name": name, "version": "1.0.0"}
                if name == "mammoth":
                    body["dependencies"] = {"underscore": "^1.13.1"}
                (d / "package.json").write_text(json.dumps(body) + "\n", encoding="utf-8")
            und = profile / "node_modules" / "underscore"
            und.mkdir(parents=True)
            (und / "package.json").write_text(
                '{"name":"underscore","version":"1.13.1"}\n', encoding="utf-8"
            )
            note = repair_kb_peers(profile)
            self.assertTrue(note)
            assert_kb_peers_ready(profile)


if __name__ == "__main__":
    unittest.main()
