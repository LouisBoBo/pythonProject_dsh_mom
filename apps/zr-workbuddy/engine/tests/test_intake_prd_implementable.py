"""步骤 1/2：步骤卡必须是可实施真实需求，禁止套话占位。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

VISION_LOW_STOCK = """
### 结构化需求草稿

#### 1. 界面与元素
- **低库存接口**：已存在，但菜单无预警页，库管需手工对账。
- **仓储管理菜单**：
  - 增加「低库存预警」页。
  - 调用 `/api/inventory-low-stock` 筛选分页。
  - 缺口降序并标红。

#### 2. 字段与数据
- **预警列表截图**：
  - 缺口 = 安全库存 - 现存量。
  - 无数据空状态。

#### 3. 用户流程
- 用户通过调用 `/api/inventory-low-stock` 获取低库存预警信息。

以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。
"""


class ImplementablePrdTests(unittest.TestCase):
    def test_normalize_strips_trailing_boilerplate(self) -> None:
        from app.dev_pipeline.intake_normalize import (
            looks_like_requirement_boilerplate,
            normalize_intake,
        )

        norm = normalize_intake(text="", vision_text=VISION_LOW_STOCK)
        core = str(norm.get("core") or "")
        self.assertIn("低库存预警", core)
        self.assertIn("/api/inventory-low-stock", core)
        self.assertFalse(looks_like_requirement_boilerplate(core))
        self.assertNotIn("请随时补充", core)
        self.assertNotIn("结构化需求草稿", core)

    def test_prd_card_is_actionable_not_fluff(self) -> None:
        from app.dev_pipeline.delivery_scope import infer_dev_scenario
        from app.dev_pipeline.intake_normalize import (
            build_prd_user_card,
            normalize_intake,
            prd_result_lines,
        )
        from app.dev_pipeline.requirement_scope import build_prd_scope, extract_in_scope_items

        core = str(normalize_intake(text="", vision_text=VISION_LOW_STOCK).get("core") or "")
        sc = infer_dev_scenario(core)
        scope = build_prd_scope(message=core, scenario_id=str(sc.get("scenario_id")))
        in_scope = extract_in_scope_items(core)
        card = build_prd_user_card(core=core, scenario=sc, scope=scope, in_scope=in_scope)
        lines = "\n".join(prd_result_lines(card, prd_rev="prd_ut"))
        self.assertIn("低库存", card.get("what") or "")
        self.assertIn("低库存", lines)
        self.assertNotIn("请随时补充", lines)
        self.assertNotIn("结构化需求草稿", lines)
        # 怎么干必须落到菜单/页面/接口，不能只剩空话
        how = str(card.get("how") or "")
        self.assertTrue(
            any(k in how for k in ("菜单", "页面", "接口", "路由", "仓储")),
            how,
        )
        done = card.get("done_when") or []
        self.assertTrue(any("低库存" in str(x) for x in done))
        self.assertFalse(any("请随时补充" in str(x) for x in done))

    def test_step2_fails_on_boilerplate_goal(self) -> None:
        from app.dev_pipeline.steps import run_step

        epic = {
            "artifacts": {
                "raw_intake": {
                    "text": "",
                    "vision_text": "",
                    "requirement_core": "以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。",
                }
            },
            "requirement_core": "以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。",
            "message": "以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。",
        }
        rec = run_step(
            "dpj-boilerplate-prd",
            "2",
            message=epic["message"],
            workspace="",
            epic=epic,
            run={"steps": [{"step_id": "1", "status": "pass"}]},
        )
        self.assertEqual(rec.get("status"), "fail", rec)
        self.assertIn("可实施", str(rec.get("summary") or ""))

    def test_step2_rebuilds_from_vision_when_core_is_boilerplate(self) -> None:
        from app.dev_pipeline.steps import run_step

        epic = {
            "artifacts": {
                "raw_intake": {
                    "text": "",
                    "vision_text": VISION_LOW_STOCK,
                    "requirement_core": "以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。",
                }
            },
            "requirement_core": "以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。",
            "message": "以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。",
        }
        rec = run_step(
            "dpj-rebuild-prd",
            "2",
            message=epic["message"],
            workspace="",
            epic=epic,
            run={"steps": [{"step_id": "1", "status": "pass"}]},
        )
        self.assertEqual(rec.get("status"), "pass", rec)
        prd = (epic.get("artifacts") or {}).get("prd") or {}
        self.assertIn("低库存", str(prd.get("goal") or ""))
        card = prd.get("user_card") or {}
        self.assertIn("低库存", str(card.get("what") or ""))
        self.assertNotIn("请随时补充", str(card.get("what") or ""))


if __name__ == "__main__":
    unittest.main()
