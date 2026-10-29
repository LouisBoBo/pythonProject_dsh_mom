"""选目录建议：当前工作区优先，配置 default 仅作兜底芯片。"""
from __future__ import annotations

import unittest


class TestPickWorkspaceSuggestions(unittest.TestCase):
    def test_current_workspace_first_then_lane_default(self):
        from app.pick_workspace import build_pick_suggestions

        rows = build_pick_suggestions(
            current_workspace=r"D:\proj\active",
            lane_default=r"D:\proj\old-default",
            lane_label="审码常用",
        )
        self.assertEqual(
            rows,
            [
                {"path": r"D:\proj\active", "label": "当前工作区"},
                {"path": r"D:\proj\old-default", "label": "审码常用"},
            ],
        )

    def test_dedupe_keeps_current_label(self):
        from app.pick_workspace import build_pick_suggestions

        same = r"/Users/me/app"
        rows = build_pick_suggestions(
            current_workspace=same,
            lane_default=same,
            lane_label="写码常用",
            extras=[(same, "上次提交")],
        )
        self.assertEqual(rows, [{"path": same, "label": "当前工作区"}])

    def test_empty_current_keeps_config_fallback(self):
        from app.pick_workspace import build_pick_suggestions

        rows = build_pick_suggestions(
            current_workspace="",
            lane_default=r"/tmp/lane",
            lane_label="提交常用",
            extras=[(r"/tmp/dev", "写码常用")],
        )
        self.assertEqual(
            rows,
            [
                {"path": r"/tmp/lane", "label": "提交常用"},
                {"path": r"/tmp/dev", "label": "写码常用"},
            ],
        )

    def test_resolve_prefers_explicit_then_fallback(self):
        from app.pick_workspace import resolve_pick_workspace

        self.assertEqual(
            resolve_pick_workspace("", r"D:\a", r"D:\b"),
            r"D:\a",
        )
        self.assertEqual(resolve_pick_workspace("", "", ""), "")


if __name__ == "__main__":
    unittest.main()
