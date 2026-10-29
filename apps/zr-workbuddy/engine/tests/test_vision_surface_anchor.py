# -*- coding: utf-8 -*-
"""识图界面锚定：短句+全图不得改错页。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

VISION_LOW_STOCK_TABLE = """
### 页面定位
- 页面标题：低库存预警
- 菜单/导航路径：仓储管理 / 低库存预警
- 页面类型：列表页

### 筛选与操作
- 筛选项：仓库（占位仓库名称）、关键词（物料编码 / 名称）
- 按钮：搜索、重置

### 表格（若有）
- 表头列名（从左到右）：物料编码、物料名称、仓库、现存量、安全库存、缺口、单位、更新时间
- 可见示例行：LED-5050-W / 白光 LED 5050
- 分页/合计文案：共 3 条低库存记录

### 标注与改动暗示
- 红框：位于「仓库」列与「现存量」列之间的空白处，意图为增加一列
"""


class VisionSurfaceAnchorTests(unittest.TestCase):
    def test_relative_edit_merges_page_and_columns(self) -> None:
        from app.dev_pipeline.intake_normalize import normalize_intake

        norm = normalize_intake(
            text="红框处增加物料入库时间 【附图:vimg-87414a97cc4dea3e】",
            vision_text=VISION_LOW_STOCK_TABLE,
        )
        core = str(norm.get("core") or "")
        self.assertIn("低库存预警", core)
        self.assertIn("物料入库时间", core)
        # 无工作区时不得写死某一家 MES 的 vue 路径
        self.assertNotIn("LowStockAlertsView.vue", core)
        self.assertNotIn("MaterialInboundListView.vue", core)
        self.assertTrue(
            "路径待确认" in core or "禁止改其它业务列表页" in core,
            core,
        )
        surf = norm.get("vision_surface") or {}
        self.assertEqual(surf.get("page_title"), "低库存预警")
        self.assertIn("现存量", surf.get("table_columns") or [])
        self.assertEqual(surf.get("must_include_paths") or [], [])

    def test_locate_page_in_workspace(self) -> None:
        """有工作区时按标题检索文件，禁止依赖硬编码锚点表。"""
        import tempfile
        from pathlib import Path

        from app.dev_pipeline.page_locate import locate_page_files
        from app.dev_pipeline.vision_surface import resolve_page_anchors

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            vue = root / "frontend" / "src" / "views" / "LowStockAlertsView.vue"
            vue.parent.mkdir(parents=True, exist_ok=True)
            vue.write_text(
                "<template><h1>低库存预警</h1></template>\n",
                encoding="utf-8",
            )
            other = root / "frontend" / "src" / "views" / "MaterialInboundListView.vue"
            other.write_text(
                "<template><h1>物料入库</h1></template>\n",
                encoding="utf-8",
            )
            profile = {
                "workspace": str(root),
                "layout": {"view_dirs": ["frontend/src/views"]},
                "ui": {"sample_pages": ["frontend/src/views/LowStockAlertsView.vue"]},
            }
            found = locate_page_files(
                "低库存预警", workspace=str(root), profile=profile
            )
            self.assertTrue(any("LowStockAlerts" in p for p in found), found)
            self.assertFalse(any("MaterialInbound" in p for p in found), found)
            anc = resolve_page_anchors(
                page_title="低库存预警",
                vision_text=VISION_LOW_STOCK_TABLE,
                workspace=str(root),
                profile=profile,
            )
            self.assertTrue(anc.get("must_include_paths"), anc)
            self.assertFalse(anc.get("need_user_path_confirm"), anc)

    def test_audit_with_located_must_paths(self) -> None:
        from app.dev_pipeline.requirement_scope import audit_implement_scope, build_prd_scope

        scope = build_prd_scope(
            message="红框处增加物料入库时间【界面锚定】低库存预警",
            scenario_id="enhance_existing",
            vision_surface={
                "page_title": "低库存预警",
                "must_include_paths": [
                    "frontend/src/views/LowStockAlertsView.vue",
                ],
                "forbid_paths": [],
                "path_hints": ["frontend/src/views/LowStockAlertsView.vue"],
            },
        )
        bad = audit_implement_scope(
            ["frontend/src/views/OtherPage.vue"],
            scope,
        )
        self.assertFalse(bad.get("ok"), bad)
        good = audit_implement_scope(
            ["frontend/src/views/LowStockAlertsView.vue"],
            scope,
        )
        self.assertTrue(good.get("ok"), good)

    def test_prompt_requires_full_headers(self) -> None:
        from app.vision.service import REQ_INTAKE_PROMPT

        self.assertIn("表头列名", REQ_INTAKE_PROMPT)
        self.assertIn("页面标题", REQ_INTAKE_PROMPT)
        self.assertIn("红框", REQ_INTAKE_PROMPT)
        self.assertIn("禁止写「请随时补充」", REQ_INTAKE_PROMPT)
        self.assertIn("附图附加文字", REQ_INTAKE_PROMPT)
        # 禁止再把低库存写进提示词样例（会污染识图）
        self.assertNotIn("如「低库存预警」", REQ_INTAKE_PROMPT)
        self.assertIn("需求跟踪表", REQ_INTAKE_PROMPT)
        self.assertIn("功能要求", REQ_INTAKE_PROMPT)
        # §4 P1：采集提示词不得默认假设制造业侧栏名
        self.assertIn("禁止假设或默认写成「生产管理」「仓储管理」", REQ_INTAKE_PROMPT)
        self.assertIn("禁止默认「生产管理 / 仓储管理」", REQ_INTAKE_PROMPT)

    def test_second_normalize_does_not_nest_anchor(self) -> None:
        from app.dev_pipeline.intake_normalize import normalize_intake

        n1 = normalize_intake(
            text="红框处增加物料入库时间",
            vision_text=VISION_LOW_STOCK_TABLE,
        )
        core1 = str(n1.get("core") or "")
        n2 = normalize_intake(text=core1, vision_text=VISION_LOW_STOCK_TABLE)
        core2 = str(n2.get("core") or "")
        self.assertEqual(core1.count("【界面锚定】"), 1)
        self.assertEqual(core2.count("【界面锚定】"), 1, core2)
        self.assertEqual(core2.count("【改动】"), 1, core2)
        self.assertIn("物料入库时间", core2)

    def test_placeholder_uses_overlay_not_default_column(self) -> None:
        """占位原文时只采用图上批注，禁止默认猜「入库时间」。"""
        from app.dev_pipeline.intake_normalize import normalize_intake

        vision = (
            VISION_LOW_STOCK_TABLE
            + "\n- 附图附加文字：预警界面红框处新增物料入库数量\n"
            + "- 红框：位于物料入库时间与现存量之间，意图为增加一列\n"
        )
        n = normalize_intake(text="（附图需求，详见识图结果）", vision_text=vision)
        core = str(n.get("core") or "")
        self.assertIn("入库数量", core, core)
        self.assertNotIn("增加「入库时间」列", core)
        self.assertLessEqual(core.count("【界面锚定】"), 1)

    def test_row_mark_does_not_force_column_insert(self) -> None:
        """识图误写成「两列之间」但意图不是加列时，不得写死插入位置。"""
        from app.dev_pipeline.intake_normalize import normalize_intake

        vision = """
### 页面定位
- 页面标题：员工工时报表
- 菜单/导航路径：生产管理 / 员工工时报表
- 页面类型：列表页
### 表格（若有）
- 表头列名（从左到右）：员工、工号、部门、项目、任务、日期、班别、工时、加班工时、审批/状态
- 可见示例行：李四 / E1002 / 生产一部
### 标注与改动暗示
- 附图附加文字：新增一条李四夜班工时
- 红框/箭头/高亮：位于「员工」列和「部门」列之间
"""
        n = normalize_intake(
            text="按图红框处新增一条夜班工时记录",
            vision_text=vision,
        )
        core = str(n.get("core") or "")
        self.assertIn("员工工时报表", core)
        self.assertNotIn("插入位置以标注为准", core)
        self.assertNotIn("插入位置以图中红框", core)

    def test_true_column_insert_keeps_insert_hint(self) -> None:
        """明确「增加一列」时仍可提示插入位置。"""
        from app.dev_pipeline.intake_normalize import normalize_intake

        n = normalize_intake(
            text="红框处增加物料入库时间",
            vision_text=VISION_LOW_STOCK_TABLE,
        )
        core = str(n.get("core") or "")
        self.assertIn("插入位置", core)

    def test_requirements_matrix_not_anchored_to_low_stock(self) -> None:
        """R04 需求表截图不得钉 LowStock / 物料入库路径。"""
        from app.dev_pipeline.vision_surface import (
            looks_like_requirements_matrix,
            parse_vision_surface,
            resolve_page_anchors,
        )

        vision = """
### 页面定位
- 页面标题：（界面主标题原文，如「低库存预警」）：未见
- 菜单/导航路径：R04 管理
### 表格
- 表头列名：编码、项目、本项、生产·交付达成
- 可见示例行：编码：R04；项目：管理；本项：销售订单在库内，无建单与发货页
### 标注
- 附图附加文字：① 销售订单列表与新建；② 登记发货数量与时间；③ 校验不超发，发满关单
"""
        self.assertTrue(looks_like_requirements_matrix(vision))
        surf = parse_vision_surface(vision)
        self.assertEqual(surf.get("page_title") or "", "")
        self.assertEqual(surf.get("must_include_paths") or [], [])
        anc = resolve_page_anchors(
            page_title=str(surf.get("page_title") or ""),
            vision_text=vision,
            user_text="",
        )
        self.assertEqual(anc.get("must_include_paths") or [], [])
        self.assertFalse(
            any("LowStock" in p for p in (anc.get("must_include_paths") or []))
        )

    def test_content_audit_follows_user_label(self) -> None:
        """内容门禁按用户写出的列名核验，不绑死入库时间。"""
        import tempfile
        from pathlib import Path

        from app.dev_pipeline.requirement_scope import audit_implement_content

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            vue = root / "frontend/src/views/warehouse/LowStockAlertsView.vue"
            vue.parent.mkdir(parents=True)
            vue.write_text(
                '<el-table-column prop="last_inbound_qty" label="物料入库数量" width="120" />\n',
                encoding="utf-8",
            )
            scope = {
                "user_message_excerpt": "红框处新增物料入库数量",
                "page_title": "低库存预警",
                "must_include_paths": [
                    "frontend/src/views/warehouse/LowStockAlertsView.vue",
                ],
            }
            out = audit_implement_content(
                ["frontend/src/views/warehouse/LowStockAlertsView.vue"],
                scope,
                workspace=str(root),
            )
            self.assertTrue(out.get("ok"), out)
            # 需求是数量时，只有时间列应判失败
            vue.write_text(
                '<el-table-column prop="last_inbound_at" label="入库时间" />\n',
                encoding="utf-8",
            )
            bad = audit_implement_content(
                ["frontend/src/views/warehouse/LowStockAlertsView.vue"],
                scope,
                workspace=str(root),
            )
            self.assertFalse(bad.get("ok"), bad)

    def test_redbox_on_overtime_is_delete_not_insert(self) -> None:
        """红框圈「加班工时」列（识图写成位于第9/10列之间）= 删列，不是插列。"""
        from app.dev_pipeline.intake_normalize import normalize_intake

        vision = """
### 页面定位
- 页面标题：员工工时报表
- 菜单/导航路径：未见
- 页面类型：列表页
### 表格
- 表头列名（从左到右完整列出）：日期、工号、员工姓名、所属部门、项目名称、任务名称、班别、工时数、加班工时、审批
### 标注与改动暗示
- 附图附加文字：未见
- 红框/箭头/高亮：加班工时位于第9列和第10列之间
"""
        norm = normalize_intake(
            text="（附图需求，详见识图结果）",
            vision_text=vision,
        )
        core = str(norm.get("core") or "")
        self.assertIn("删除", core, core)
        self.assertIn("加班工时", core)
        self.assertNotIn("新增一列", core)
        self.assertIn("员工工时报表", core)
        # 无工作区：不钉死 EmployeeWorkHourReportView.vue
        self.assertNotIn("EmployeeWorkHourReportView.vue", core)
        surf = norm.get("vision_surface") or {}
        self.assertEqual(surf.get("must_include_paths") or [], [])

    def test_forbid_boilerplate_does_not_anchor_inbound(self) -> None:
        """无工作区时不得凭硬表钉路径；有标题即可，must 为空。"""
        from app.dev_pipeline.requirement_scope import build_prd_scope
        from app.dev_pipeline.vision_surface import resolve_page_anchors

        msg = (
            "【界面锚定】员工工时报表 【改动】删除加班工时列。"
            "禁止改其它业务列表页（勿把入库列表页误当成锚定页）。"
        )
        anc = resolve_page_anchors(
            page_title="员工工时报表",
            vision_text="",
            user_text=msg,
        )
        self.assertEqual(anc.get("must_include_paths") or [], [])
        self.assertTrue(anc.get("need_user_path_confirm"), anc)
        scope = build_prd_scope(
            message=msg,
            scenario_id="enhance_existing",
            vision_surface={
                "page_title": "员工工时报表",
                "must_include_paths": [],
                "forbid_paths": [],
            },
        )
        self.assertEqual(scope.get("must_include_paths") or [], [])
        self.assertFalse(
            any("MaterialInbound" in p for p in (scope.get("must_include_paths") or [])),
            scope,
        )


if __name__ == "__main__":
    unittest.main()
