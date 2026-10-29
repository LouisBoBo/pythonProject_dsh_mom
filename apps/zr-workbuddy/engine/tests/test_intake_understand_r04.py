# -*- coding: utf-8 -*-
"""步骤2 需求理解：需求表附图不得被低库存提示词样例盖掉。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

# 智谱曾把提示词样例抄进「页面标题」，再被本地模板焊成低库存
VISION_R04_POLLUTED = """
### 页面定位
- 页面标题：（界面主标题原文，如「低库存预警」）：未见
- 菜单/导航路径：生产管理菜单新增此需求
- 页面类型：列表页

### 表格（若有）
- 表头列名（从左到右）：编码、项目、本项、生产·交付达成
- 可见示例行：
  - 编码：R04
  - 项目：生产管理
  - 本项：销售订单在库内，无建单与发货页，超发无校验
  - 生产·交付达成：P0

### 标注与改动暗示
- 附图附加文字：① 销售订单列表与新建；② 登记发货数量与时间；③ 校验不超剩余可发，发满关单
- 红框/箭头：位于「编码」列和「项目」列之间
"""


class IntakeUnderstandR04Tests(unittest.TestCase):
    def test_compose_from_polluted_vision_is_sales_order_not_low_stock(self) -> None:
        from app.dev_pipeline.intake_normalize import (
            compose_implementable_brief,
            looks_like_hardcoded_low_stock_template,
            normalize_intake,
        )

        brief = compose_implementable_brief(VISION_R04_POLLUTED)
        self.assertTrue(brief, brief)
        self.assertIn("销售订单", brief)
        self.assertIn("发货", brief)
        self.assertIn("生产管理", brief)
        self.assertFalse(looks_like_hardcoded_low_stock_template(brief), brief)
        self.assertNotIn("低库存预警页（已有页面）按截图改表", brief)

        norm = normalize_intake(text="（附图需求，详见识图结果）", vision_text=VISION_R04_POLLUTED)
        core = str(norm.get("core") or "")
        self.assertIn("销售订单", core)
        self.assertIn("生产管理", core)
        self.assertFalse(looks_like_hardcoded_low_stock_template(core), core)

    def test_r04_menu_anchor_production_not_warehouse(self) -> None:
        from app.code_dev.brief import CodeDevBrief, infer_target
        from app.dev_pipeline.requirement_scope import build_prd_scope, extract_menu_anchor
        from app.dev_pipeline.vision_surface import parse_vision_surface

        surf = parse_vision_surface(VISION_R04_POLLUTED)
        self.assertIn("生产管理", str(surf.get("menu_path") or ""))

        from app.dev_pipeline.intake_normalize import compose_implementable_brief

        brief = compose_implementable_brief(VISION_R04_POLLUTED)
        self.assertEqual(extract_menu_anchor(brief), "生产管理")
        scope = build_prd_scope(
            message=brief,
            scenario_id="full_feature",
            vision_surface=surf,
        )
        self.assertEqual(scope.get("target_menu"), "生产管理")

        hints = infer_target(CodeDevBrief(original_goal=brief))
        self.assertEqual(hints.get("module"), "生产管理")
        # 任意项目：模块路径已泛化为 **/views/** 等，禁止再断言钉死 production/
        paths = hints.get("expected_paths") or []
        self.assertTrue(any("views" in p for p in paths), hints)
        self.assertFalse(
            any("frontend/src/views/production/" in p for p in paths),
            "不得再钉死某一家 ERP 的 production/ 目录",
        )

    def test_step2_rebuilds_when_core_is_low_stock_template(self) -> None:
        from app.dev_pipeline.steps import run_step

        epic = {
            "artifacts": {
                "raw_intake": {
                    "vision_text": VISION_R04_POLLUTED,
                    "requirement_core": "低库存预警页（已有页面）按截图改表；按图中红框与批注改表",
                }
            },
            "requirement_core": "低库存预警页（已有页面）按截图改表；按图中红框与批注改表",
            "message": "低库存预警页（已有页面）按截图改表",
            "workspace": "",
        }
        receipt = run_step(
            "run-r04-understand",
            "2",
            message=str(epic["message"]),
            workspace="",
            epic=epic,
            run={},
        )
        self.assertEqual(receipt.get("status"), "pass", receipt)
        summary = str(receipt.get("summary") or "")
        self.assertIn("销售订单", summary + str(epic.get("requirement_core") or ""))
        self.assertNotIn("低库存预警页（已有页面）按截图改表", summary)
        prd = (epic.get("artifacts") or {}).get("prd") or {}
        self.assertIn("销售订单", str(prd.get("goal") or "") + str(prd.get("goal_one_liner") or ""))


if __name__ == "__main__":
    unittest.main()
