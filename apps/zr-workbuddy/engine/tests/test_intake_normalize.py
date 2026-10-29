"""需求清洗与 PRD 步骤卡文案。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

from app.dev_pipeline.delivery_scope import infer_dev_scenario  # noqa: E402
from app.dev_pipeline.intake_normalize import (  # noqa: E402
    build_prd_user_card,
    is_implementable_requirement,
    looks_like_memory_preference_dump,
    looks_like_pipeline_meta_not_product,
    looks_like_runtime_injection,
    looks_like_sandbox_policy,
    normalize_intake,
    prd_result_lines,
)

SAMPLE = """Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

[记忆库] 来自 dsh-mneme 的跨会话记忆：
- [summary] 记忆库总览（重要性 5）：当前活跃主线是 MES 开发：报表中心「员工工时报表」按原版形态恢复后，用户又要求在页面查询条件区新增「班别」筛选项（白班/晚班）——页面已存在 shiftType 班别字段，本次属新增筛选。工作区为 /Users/hebo/Desktop/中软项目/pythonProject_zr_aicoding，已通过 mes_dev_pipeline_begin 启动「需求→上线」一体化流程。
- [preference] 开发需求走流水线偏好（重要性 5）：使用 mes_dev_pipeline_begin 启动一体化流程。
"""

SANDBOX = (
    "Current DSH file policy: workspace-write. Any available operation enforced by the DSH "
    "file sandbox may modify files under the session workspace: "
    '"D:\\\\AICodes\\\\ZR_AI_Coding\\\\pythonProject_zr_aicoding". '
    "Some platform temporary areas may also be writable. Approval policy: ask. "
    "Operations that require approval may ask through the configured answerers; "
    "without an available answerer, the request fails closed."
)

VISION_FAVORITES = """
1) 界面与元素
- 收藏夹仍是占位页，常用菜单无法固定入口
- 顶栏可收藏当前页；列表可查看与取消
2) 字段与数据
- 同路径去重；上限 30；刷新保留；账号隔离
"""


class IntakeNormalizeTests(unittest.TestCase):
    def test_strips_runtime_and_extracts_task(self) -> None:
        norm = normalize_intake(text=SAMPLE, vision_text="")
        self.assertTrue(norm.get("was_sanitized"))
        core = str(norm.get("core") or "")
        self.assertIn("班别", core)
        self.assertNotIn("Current runtime context", core)
        self.assertNotIn("偏好诡异", core)

    def test_scenario_not_tooling_for_pipeline_flow(self) -> None:
        norm = normalize_intake(text=SAMPLE, vision_text="")
        sc = infer_dev_scenario(str(norm.get("core") or ""))
        self.assertEqual(sc.get("scenario_id"), "enhance_existing")

    def test_prd_card_three_questions(self) -> None:
        norm = normalize_intake(text=SAMPLE, vision_text="")
        core = str(norm.get("core") or "")
        sc = infer_dev_scenario(core)
        from app.dev_pipeline.requirement_scope import build_prd_scope, extract_in_scope_items

        scope = build_prd_scope(message=core, scenario_id=str(sc.get("scenario_id")))
        card = build_prd_user_card(
            core=core,
            scenario=sc,
            scope=scope,
            in_scope=extract_in_scope_items(core),
        )
        lines = prd_result_lines(card, prd_rev="prd_test")
        self.assertTrue(any("【要做什么】" in ln for ln in lines))
        self.assertTrue(any("【怎么干】" in ln for ln in lines))
        self.assertTrue(any("【干成啥】" in ln for ln in lines))
        self.assertNotIn("Current runtime", "\n".join(lines))

    def test_strips_skill_catalog_system_reminder(self) -> None:
        junk = (
            "<system-reminder> A skill is a reusable set of task-specific instructions. "
            "The following skills are available in this session: <available_skills> "
            "- `writing-plans`: 当你有规格说明时使用 </available_skills></system-reminder>"
        )
        norm = normalize_intake(text=junk, vision_text="")
        self.assertTrue(norm.get("was_sanitized") or looks_like_runtime_injection(junk))
        core = str(norm.get("core") or "")
        self.assertNotIn("available_skills", core.lower())
        self.assertNotIn("system-reminder", core.lower())
        self.assertLess(len(core), 80)

    def test_sandbox_policy_detected(self) -> None:
        self.assertTrue(looks_like_sandbox_policy(SANDBOX))
        self.assertTrue(looks_like_runtime_injection(SANDBOX))

    def test_paste_image_prefers_vision_over_sandbox_policy(self) -> None:
        """事故回归：Agent 把 file policy 当 message，必须改用识图收藏夹需求。"""
        norm = normalize_intake(text=SANDBOX, vision_text=VISION_FAVORITES)
        core = str(norm.get("core") or "")
        self.assertIn("收藏夹", core)
        self.assertNotIn("file policy", core.lower())
        self.assertNotIn("workspace-write", core.lower())
        self.assertTrue(str(norm.get("source") or "").startswith("vision"))

    def test_sandbox_alone_yields_empty_core(self) -> None:
        norm = normalize_intake(text=SANDBOX, vision_text="")
        self.assertFalse(str(norm.get("core") or "").strip())

    def test_work_hours_between_columns_not_shift_filter_template(self) -> None:
        """表头含「班别」+ 红框夹在两列之间 ≠ 写死「班别筛选/按需展示明细列」。"""
        from app.dev_pipeline.intake_normalize import compose_implementable_brief

        vision = """
### 页面定位
- 页面标题：员工工时报表
### 表格
- 表头列名（从左到右完整列出）：员工、工号、部门、项目、任务、日期、班别、工时、加班工时、审批/状态
### 标注与改动暗示
- 附图附加文字：员工工时报表在红框处新增产出工时列
- 红框/箭头/高亮：位于第7列和第8列之间的区域
"""
        brief = compose_implementable_brief(vision)
        self.assertIn("产出工时", brief, brief)
        self.assertIn("班别", brief, brief)
        self.assertIn("工时", brief, brief)
        self.assertNotIn("含查询筛选", brief, brief)
        self.assertNotIn("按需展示明细列", brief, brief)

        norm = normalize_intake(text="（附图需求，详见识图结果）", vision_text=vision)
        core = str(norm.get("core") or "")
        one = str(norm.get("one_liner") or "")
        self.assertIn("产出工时", core + one, core)
        self.assertNotIn("含查询筛选，按需展示明细列", one, one)

    def test_visible_sample_rows_do_not_block_between_columns(self) -> None:
        """「可见示例行」是识图表样板，不得当成行级标注而丢掉加列意图。"""
        from app.dev_pipeline.intake_normalize import compose_implementable_brief
        from app.dev_pipeline.prd_llm import looks_like_page_meta_dump

        vision = """
### 页面定位
- 页面标题：员工工时报表
- 菜单/导航路径：明细列表
- 页面类型：列表页
### 筛选与操作
- 筛选项：无
### 表格
- 表头列名（从左到右完整列出）：员工、工号、部门、项目、任务、日期、班别、工时、加班工时、审批/状态
- 可见示例行（最多 3 行）
  - 张三、E1001、生产一部、PCB-A量产项目、贴片工序、2026-09-27、白班、8.0、1.0、已通过
- 分页/合计文案：Total 12, 10/page, 工时合计 92.0 加班合计 6.0
### 标注与改动暗示
- 附图附加文字：位于第7列和第8列之间的区域被红色方框标注
- 红框/箭头/高亮：位于第7列和第8列之间的区域被红色方框标注
"""
        brief = compose_implementable_brief(vision)
        self.assertTrue(brief, brief)
        self.assertIn("班别", brief, brief)
        self.assertIn("工时", brief, brief)
        self.assertIn("新增", brief, brief)
        self.assertFalse(looks_like_page_meta_dump(brief), brief)
        self.assertNotIn("筛选项：无", brief, brief)
        # 位置批注不得冒充列名
        self.assertNotIn("位于第7列", brief, brief)

    def test_user_original_words_drive_column_name(self) -> None:
        """用户原话必须进摘要：红框处新增产出工时列 → 列名产出工时，位置在班别与工时之间。"""
        from app.dev_pipeline.intake_normalize import compose_implementable_brief
        from app.dev_pipeline.prd_llm import looks_like_page_meta_dump

        vision = """
### 页面定位
- 页面标题：员工工时报表
- 菜单/导航路径：明细列表
- 页面类型：列表页
### 筛选与操作
- 筛选项：无
### 表格
- 表头列名（从左到右完整列出）：员工、工号、部门、项目、任务、日期、班别、工时、加班工时、审批/状态
### 标注与改动暗示
- 附图附加文字：位于第7列和第8列之间的区域被红色方框标注
"""
        user = "员工工时报表在红框处新增产出工时列"
        brief = compose_implementable_brief(vision, user_text=user)
        self.assertIn("产出工时", brief, brief)
        self.assertIn("班别", brief, brief)
        self.assertIn("工时", brief, brief)
        self.assertIn("新增", brief, brief)
        self.assertNotIn("筛选项：无", brief, brief)
        self.assertFalse(looks_like_page_meta_dump(brief), brief)

        dump = (
            "页面标题：员工工时报表；菜单/导航路径：明细列表；页面类型：列表页；"
            "筛选项：无；分页/合计文案：Total 12"
        )
        self.assertTrue(looks_like_page_meta_dump(dump))

    def test_page_meta_dump_not_implementable(self) -> None:
        from app.dev_pipeline.intake_normalize import is_implementable_requirement
        from app.dev_pipeline.prd_llm import looks_like_page_meta_dump

        dump = (
            "页面标题：员工工时报表；菜单/导航路径：明细列表；页面类型：列表页；"
            "筛选项：无；分页/合计文案：Total 12"
        )
        self.assertTrue(looks_like_page_meta_dump(dump))
        self.assertFalse(is_implementable_requirement(dump))

    def test_explicit_shift_filter_still_kept(self) -> None:
        """正文明确写新增班别筛选时仍可识别（不是表头误伤）。"""
        from app.dev_pipeline.intake_normalize import compose_implementable_brief

        vision = """
- 页面标题：员工工时报表
- 表头：员工、工号、班别、工时
- 改动：在查询条件区新增班别筛选（白班/晚班）
"""
        brief = compose_implementable_brief(vision)
        self.assertIn("班别", brief)
        self.assertIn("筛", brief)

    def test_preference_dump_alone_not_product_requirement(self) -> None:
        """事故回归：仅记忆库 preference + Knowledge protocol → 不得当产品需求 pass。"""
        junk = (
            "- [preference] 开发需求走流水线偏好与澄清约定（重要性 5）：用户提出开发类"
            "（如报表中心）需求时，使用 mes_dev_pipeline_begin 启动「需求→上线」一体化流程，"
            "进度在输入框上方的过程流卡/pipeline 时间线卡中查看；写码仅在步骤 5 用 zr_cursor_begin。"
            "禁止使用 ask_user_question（Cursor 澄清选择题）。\n"
            "- [preference] MES 报表取数与出图约定（重要性 4）：数据取自 zr_esc_mes_query。\n"
            "Knowledge bases mounted for this session (routing metadata only; "
            "no document body is included): Knowledge-first retrieval protocol: "
            "1. For the user's projects, consult mounted knowledge before searching."
        )
        self.assertTrue(looks_like_memory_preference_dump(junk))
        self.assertTrue(looks_like_pipeline_meta_not_product(junk))
        self.assertFalse(is_implementable_requirement(junk))
        norm = normalize_intake(text=junk, vision_text="")
        core = str(norm.get("core") or "")
        self.assertFalse(core.strip(), core)
        self.assertFalse(norm.get("implementable"))

    def test_real_delete_menu_still_implementable(self) -> None:
        """真需求不得被误杀。"""
        msg = "报表中心菜单删除PCB生产运营分析报表"
        self.assertFalse(looks_like_memory_preference_dump(msg))
        self.assertFalse(looks_like_pipeline_meta_not_product(msg))
        self.assertTrue(is_implementable_requirement(msg))
        norm = normalize_intake(text=msg, vision_text="")
        self.assertIn("PCB", str(norm.get("core") or ""))
        self.assertIn("删除", str(norm.get("core") or ""))


if __name__ == "__main__":
    unittest.main()
