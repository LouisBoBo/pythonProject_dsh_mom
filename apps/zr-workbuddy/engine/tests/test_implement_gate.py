# -*- coding: utf-8 -*-
"""写码健全门禁：分级判定 + 入库时间语义验收。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ImplementGateTests(unittest.TestCase):
    def test_extract_change_intent_from_anchor(self) -> None:
        from app.dev_pipeline.implement_gate import extract_change_intent

        core = (
            "【界面锚定】低库存预警 【现有表头】仓库、现存量 "
            "【改动】红框处增加确切的入库时间包含年月日时。插入位置：仓库列与现存量列之间；"
            "须改本页前端表格"
        )
        intent = extract_change_intent(core)
        self.assertIn("入库时间", intent)
        self.assertNotIn("【界面锚定】", intent)

    def test_judge_pass_with_user_column_label(self) -> None:
        from app.dev_pipeline.implement_gate import judge_implement_result

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            vue = root / "frontend/src/views/warehouse/LowStockAlertsView.vue"
            api = root / "backend/app/routers/inventory_low_stock.py"
            vue.parent.mkdir(parents=True)
            api.parent.mkdir(parents=True)
            vue.write_text(
                '<el-table-column prop="inbound_qty" label="物料入库数量" />\n',
                encoding="utf-8",
            )
            api.write_text("inbound_qty = 0\n", encoding="utf-8")
            scope = {
                "user_message_excerpt": "红框处新增物料入库数量",
                "page_title": "低库存预警",
                "max_files": 8,
                "must_include_paths": [
                    "frontend/src/views/warehouse/LowStockAlertsView.vue",
                    "backend/app/routers/inventory_low_stock.py",
                ],
                "forbid_paths": [
                    "frontend/src/views/warehouse/MaterialInboundListView.vue",
                ],
                "path_hints": [
                    "frontend/src/views/warehouse/LowStockAlertsView.vue",
                ],
            }
            verdict = judge_implement_result(
                job_out={
                    "ok": True,
                    "job_id": "ccj-test",
                    "changed_files": [
                        "frontend/src/views/warehouse/LowStockAlertsView.vue",
                        "backend/app/routers/inventory_low_stock.py",
                    ],
                    "summary": "写码完成",
                },
                scope=scope,
                workspace=str(root),
            )
            self.assertTrue(verdict.get("ok"), verdict)
            self.assertEqual(verdict.get("class"), "pass")
            self.assertEqual(verdict.get("reason"), "pass")

    def test_content_gap_not_scope_creep(self) -> None:
        from app.dev_pipeline.implement_gate import judge_implement_result

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            vue = root / "frontend/src/views/warehouse/LowStockAlertsView.vue"
            api = root / "backend/app/routers/inventory_low_stock.py"
            vue.parent.mkdir(parents=True)
            api.parent.mkdir(parents=True)
            vue.write_text('<el-table-column prop="quantity" label="现存量" />\n', encoding="utf-8")
            api.write_text("quantity: int\n", encoding="utf-8")
            scope = {
                "user_message_excerpt": "新增「物料入库数量」列",
                "page_title": "低库存预警",
                "max_files": 8,
                "must_include_paths": [
                    "frontend/src/views/warehouse/LowStockAlertsView.vue",
                    "backend/app/routers/inventory_low_stock.py",
                ],
                "forbid_paths": [],
                "path_hints": [],
            }
            verdict = judge_implement_result(
                job_out={
                    "ok": True,
                    "job_id": "ccj-x",
                    "changed_files": [
                        "frontend/src/views/warehouse/LowStockAlertsView.vue",
                        "backend/app/routers/inventory_low_stock.py",
                    ],
                },
                scope=scope,
                workspace=str(root),
            )
            self.assertFalse(verdict.get("ok"), verdict)
            self.assertEqual(verdict.get("reason"), "content_gap")
            self.assertEqual(verdict.get("class"), "retry_delivery")
            self.assertNotEqual(verdict.get("reason"), "scope_creep")

    def test_brief_puts_task_card_first(self) -> None:
        from app.dev_pipeline.implement_gate import build_stable_implement_requirement

        epic = {
            "requirement_core": "【界面锚定】低库存预警 【改动】红框处新增物料入库数量",
            "artifacts": {
                "prd": {
                    "goal": "【界面锚定】低库存预警 【改动】红框处新增物料入库数量",
                    "goal_one_liner": "新增物料入库数量",
                    "scope": {
                        "page_title": "低库存预警",
                        "must_include_paths": [
                            "frontend/src/views/warehouse/LowStockAlertsView.vue",
                        ],
                        "forbid_paths": [
                            "frontend/src/views/warehouse/MaterialInboundListView.vue",
                        ],
                        "in_scope": ["新增物料入库数量列"],
                        "max_files": 8,
                    },
                    "scenario": {"scenario_id": "enhance_existing", "scenario_label": "增强现页"},
                }
            },
        }
        req = build_stable_implement_requirement(
            message=str(epic["requirement_core"]),
            epic=epic,
        )
        self.assertTrue(req.startswith("【写码任务卡"), req[:80])
        self.assertIn("物料入库数量", req)
        self.assertIn("用户意图", req)
        self.assertNotIn("last_inbound_at", req)

    def test_plugin_network_is_infra_not_delivery(self) -> None:
        from app.dev_pipeline.implement_gate import (
            INFRA_RETRY_REASONS,
            judge_implement_result,
        )

        self.assertIn("plugin_network", INFRA_RETRY_REASONS)
        verdict = judge_implement_result(
            job_out={
                "ok": False,
                "job_id": "ccj-net",
                "reason": "plugin_network",
                "detail": "Network request failed (retryable=true)",
                "can_retry": True,
            },
            scope=None,
            workspace="",
        )
        self.assertFalse(verdict.get("ok"))
        self.assertEqual(verdict.get("class"), "retry_infra")
        self.assertEqual(verdict.get("reason"), "plugin_network")


if __name__ == "__main__":
    unittest.main()
