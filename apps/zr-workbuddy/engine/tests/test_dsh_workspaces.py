"""DSH 侧栏工作区列表读取。"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


class DshWorkspacesTest(unittest.TestCase):
    def test_list_reads_ordered_paths(self) -> None:
        from app import dsh_workspaces

        with tempfile.TemporaryDirectory() as td:
            home = Path(td)
            storages = home / "storages"
            storages.mkdir(parents=True)
            (storages / "workspace.json").write_text(
                json.dumps(
                    {
                        "global": {"workspaceIds": ["a", "b"]},
                        "tables": {
                            "workspaces": {
                                "a": {"path": r"D:\proj\A", "title": "A厂"},
                                "b": {"path": r"D:\proj\B", "title": "B厂"},
                            }
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            with mock.patch.object(dsh_workspaces, "resolve_dsh_homes", return_value=[home]):
                items = dsh_workspaces.list_dsh_workspaces()
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "A厂")
        self.assertTrue("proj" in items[0]["path"].replace("\\", "/"))
        self.assertEqual(items[1]["title"], "B厂")


if __name__ == "__main__":
    unittest.main()
