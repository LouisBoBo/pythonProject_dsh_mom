"""写码通道：对话写码为唯一入口（无回退）。"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest import mock


def _write(path: str, obj: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f)


class CodingMutexTests(unittest.TestCase):
    def test_set_dsh_cursor_moves_between_bundles(self):
        from app import coding_mutex

        with tempfile.TemporaryDirectory() as td:
            pkg = os.path.join(td, "package.json")
            _write(
                pkg,
                {
                    "dependencies": {coding_mutex.DSH_CURSOR_PKG: "link:./x"},
                    "dsh": {
                        "profile": {
                            "bundles": ["dshmarket", coding_mutex.DSH_CURSOR_PKG],
                            "disabledBundles": [],
                        }
                    },
                },
            )
            with mock.patch.object(coding_mutex, "_profile_manifests", lambda: [pkg]):
                self.assertTrue(coding_mutex.is_dsh_cursor_enabled())
                out = coding_mutex.set_dsh_cursor_enabled(False)
                self.assertTrue(out.get("ok"))
                self.assertEqual(out.get("updated"), [pkg])
                data = json.loads(open(pkg, encoding="utf-8").read())
                self.assertNotIn(coding_mutex.DSH_CURSOR_PKG, data["dsh"]["profile"]["bundles"])
                self.assertIn(coding_mutex.DSH_CURSOR_PKG, data["dsh"]["profile"]["disabledBundles"])
                self.assertFalse(coding_mutex.is_dsh_cursor_enabled())
                coding_mutex.set_dsh_cursor_enabled(True)
                data = json.loads(open(pkg, encoding="utf-8").read())
                self.assertIn(coding_mutex.DSH_CURSOR_PKG, data["dsh"]["profile"]["bundles"])
                self.assertNotIn(coding_mutex.DSH_CURSOR_PKG, data["dsh"]["profile"]["disabledBundles"])

    def test_reconcile_disables_legacy_when_chat_on(self):
        from app import coding_mutex
        from app import plugins_store

        with tempfile.TemporaryDirectory() as td:
            feat = os.path.join(td, "features", "code-dev")
            data = os.path.join(td, "engine", "data")
            os.makedirs(feat)
            open(os.path.join(feat, "index.js"), "w", encoding="utf-8").write("//")
            os.makedirs(data)
            state = os.path.join(data, "plugins.json")
            _write(state, {"enabled": ["code-dev", "mes-ask"]})
            pkg = os.path.join(td, "package.json")
            _write(
                pkg,
                {
                    "dependencies": {
                        coding_mutex.DSH_CHAT_PKG: "1",
                        coding_mutex.DSH_CURSOR_PKG: "1",
                    },
                    "dsh": {
                        "profile": {
                            "bundles": [
                                coding_mutex.DSH_CHAT_PKG,
                                coding_mutex.DSH_CURSOR_PKG,
                            ],
                            "disabledBundles": [],
                        }
                    },
                },
            )
            with mock.patch.object(plugins_store, "_FEATURES_DIR", os.path.join(td, "features")), mock.patch.object(
                plugins_store, "_STATE_PATH", state
            ), mock.patch.object(plugins_store, "_LOCK_PATH", state + ".lock"), mock.patch.object(
                coding_mutex, "_profile_manifests", lambda: [pkg]
            ):
                out = coding_mutex.reconcile()
                self.assertIn("disabled-code-dev", str(out.get("mutex") or ""))
                self.assertIn("disabled-legacy-cursor-coding", str(out.get("mutex") or ""))
                self.assertFalse(out.get("workbuddy"))
                self.assertTrue(out.get("dsh_cursor_chat"))
                self.assertFalse(out.get("dsh_cursor"))
                self.assertEqual(out.get("begin"), coding_mutex.CHAT_BEGIN)
                self.assertNotIn("code-dev", json.loads(open(state, encoding="utf-8").read())["enabled"])

    def test_coding_begin_chat_only_no_fallback(self):
        from app import coding_mutex

        self.assertEqual(
            coding_mutex.coding_begin(workbuddy_on=True, dsh_on=True, chat_on=True),
            coding_mutex.CHAT_BEGIN,
        )
        # 未开对话写码：即使旧通道全开也不得回退
        self.assertEqual(
            coding_mutex.coding_begin(workbuddy_on=True, dsh_on=True, chat_on=False),
            "",
        )
        self.assertEqual(
            coding_mutex.coding_begin(workbuddy_on=False, dsh_on=True, chat_on=False),
            "",
        )
        self.assertEqual(
            coding_mutex.coding_begin(workbuddy_on=False, dsh_on=False, chat_on=False),
            "",
        )

    def test_enable_code_dev_turns_off_dsh_bundle(self):
        from app import coding_mutex
        from app import plugins_store

        with tempfile.TemporaryDirectory() as td:
            feat = os.path.join(td, "features", "code-dev")
            os.makedirs(feat)
            open(os.path.join(feat, "index.js"), "w", encoding="utf-8").write("//")
            data = os.path.join(td, "engine", "data")
            os.makedirs(data)
            state = os.path.join(data, "plugins.json")
            _write(state, {"enabled": []})
            pkg = os.path.join(td, "package.json")
            _write(
                pkg,
                {
                    "dependencies": {coding_mutex.DSH_CURSOR_PKG: "1"},
                    "dsh": {"profile": {"bundles": [coding_mutex.DSH_CURSOR_PKG], "disabledBundles": []}},
                },
            )
            with mock.patch.object(plugins_store, "_FEATURES_DIR", os.path.join(td, "features")), mock.patch.object(
                plugins_store, "_STATE_PATH", state
            ), mock.patch.object(plugins_store, "_LOCK_PATH", state + ".lock"), mock.patch.object(
                coding_mutex, "_profile_manifests", lambda: [pkg]
            ):
                r = plugins_store.enable("code-dev")
                self.assertTrue(r.get("ok"))
                self.assertIn("code-dev", r.get("enabled") or [])
                data = json.loads(open(pkg, encoding="utf-8").read())
                self.assertNotIn(coding_mutex.DSH_CURSOR_PKG, data["dsh"]["profile"]["bundles"])
                self.assertIn(coding_mutex.DSH_CURSOR_PKG, data["dsh"]["profile"]["disabledBundles"])


if __name__ == "__main__":
    unittest.main()
