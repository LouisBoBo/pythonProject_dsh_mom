# -*- coding: utf-8 -*-
"""首次启动向导与工程说明。"""
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


class SetupWizardTests(unittest.TestCase):
    def test_status_needs_wizard_when_empty(self) -> None:
        from app.setup_wizard import setup_status

        with mock.patch("app.setup_wizard.load_wizard_state", return_value={}):
            s = setup_status(
                {"deepseek": {"api_key": ""}, "code_dev": {"default_workspace": ""}}
            )
        self.assertTrue(s.get("needs_wizard"))
        self.assertTrue(s.get("missing_key"))
        self.assertTrue(s.get("missing_workspace"))

    def test_complete_writes_workspace_and_marks_done(self) -> None:
        from app import setup_wizard as sw

        with tempfile.TemporaryDirectory() as td:
            state_path = os.path.join(td, "setup_wizard.json")
            cfg: dict = {
                "deepseek": {"api_key": ""},
                "code_dev": {"default_workspace": ""},
                "mes": {"base_url": ""},
            }
            saved: dict = {}

            def _save(c):
                saved.clear()
                saved.update(c)

            def _merge(old, patch):
                out = dict(old)
                for k, v in (patch or {}).items():
                    if isinstance(v, dict):
                        base = dict(out.get(k) or {})
                        base.update(v)
                        out[k] = base
                    else:
                        out[k] = v
                return out

            with mock.patch.object(sw, "_state_path", return_value=state_path), mock.patch.object(
                sw, "load_config", return_value=cfg
            ), mock.patch.object(sw, "save_config", side_effect=_save), mock.patch.object(
                sw, "merge_secrets", side_effect=_merge
            ), mock.patch(
                "app.project_profile.ensure",
                return_value={"ok": True, "cached": False},
            ):
                out = sw.complete_setup(
                    api_key="sk-testkey-abcdefgh",
                    workspace=td,
                    mes_base_url="http://127.0.0.1:9",
                )
                st = sw.load_wizard_state()
            self.assertTrue(out.get("ok"), out)
            self.assertFalse(out.get("needs_wizard"))
            self.assertEqual(saved.get("deepseek", {}).get("api_key"), "sk-testkey-abcdefgh")
            self.assertEqual(
                saved.get("code_dev", {}).get("default_workspace"),
                str(Path(td).resolve()),
            )
            self.assertTrue(st.get("completed"))

    def test_complete_rejects_non_http_mes_url(self) -> None:
        from app.setup_wizard import complete_setup

        out = complete_setup(
            api_key="sk-testkey-abcdefgh",
            workspace=".",
            mes_base_url="file:///etc/passwd",
        )
        self.assertFalse(out.get("ok"))
        self.assertIn("http", str(out.get("detail") or "").lower())


class ProjectNotesTests(unittest.TestCase):
    def test_notes_isolated_by_workspace(self) -> None:
        from app import project_notes as pn

        with tempfile.TemporaryDirectory() as td:
            a = os.path.join(td, "proj-a")
            b = os.path.join(td, "proj-b")
            os.makedirs(a)
            os.makedirs(b)
            root = Path(td) / "notes"
            with mock.patch.object(pn, "_root", return_value=root):
                self.assertTrue(pn.save_notes(a, "AAA 规范").get("ok"))
                self.assertTrue(pn.save_notes(b, "BBB 规范").get("ok"))
                ta = pn.load_notes(a).get("text") or ""
                tb = pn.load_notes(b).get("text") or ""
                self.assertIn("AAA", ta)
                self.assertNotIn("BBB", ta)
                self.assertIn("BBB", tb)
                brief = pn.format_for_coding(a)
                self.assertIn("【本工程说明", brief)
                self.assertIn("AAA", brief)
                self.assertNotIn("BBB", brief)


if __name__ == "__main__":
    unittest.main()
