"""需求范围锁定与写码后审计。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)

from app.dev_pipeline.delivery_scope import infer_dev_scenario  # noqa: E402
from app.dev_pipeline.requirement_scope import (  # noqa: E402
    audit_implement_content,
    audit_implement_scope,
    build_prd_scope,
    extract_requested_labels,
    scope_contract_for_implement,
)


class RequirementScopeTests(unittest.TestCase):
    def test_scenario_enhance_for_shift_on_report(self) -> None:
        msg = "员工工时报表增加班别筛选，明细表也要显示班别列"
        sc = infer_dev_scenario(msg)
        self.assertEqual(sc.get("scenario_id"), "enhance_existing")

    def test_scenario_sales_order_is_full_feature_not_enhance(self) -> None:
        """「列表与新建」不得因「列表」二字被收成加列增强；默认路径不锁死仓储。"""
        msg = (
            "【R04】销售订单列表与新建；登记发货数量与时间；"
            "校验不超剩余可发，发满关单"
        )
        sc = infer_dev_scenario(msg)
        self.assertEqual(sc.get("scenario_id"), "full_feature", sc)
        scope = build_prd_scope(message=msg, scenario_id=str(sc.get("scenario_id")))
        files = [
            "frontend/src/views/production/SalesOrdersView.vue",
            "frontend/src/router/index.js",
            "frontend/src/layouts/AppLayout.vue",
            "frontend/src/api/salesOrders.js",
            "backend/app/main.py",
            "backend/app/routers/sales_orders.py",
        ]
        audit = audit_implement_scope(files, scope)
        self.assertTrue(audit.get("ok"), audit)

    def test_production_menu_rejects_warehouse_sales_pages(self) -> None:
        """用户写生产管理菜单时，销售订单页不得落在 views/warehouse/。"""
        from app.dev_pipeline.requirement_scope import extract_menu_anchor

        msg = (
            "生产管理菜单新增此需求。【R04】项目：生产管理。"
            "销售订单列表与新建；登记发货；校验不超剩余可发，发满关单"
        )
        self.assertEqual(extract_menu_anchor(msg), "生产管理")
        scope = build_prd_scope(message=msg, scenario_id="full_feature")
        self.assertEqual(scope.get("target_menu"), "生产管理")
        # 路径提示改为通用 glob，不再强制含 production 字样
        hints = scope.get("path_hints") or []
        self.assertTrue(hints, hints)
        self.assertFalse(
            any(
                h in ("**/warehouse*", "frontend/src/views/warehouse/")
                for h in hints
            ),
            hints,
        )
        contract = scope_contract_for_implement(scope)
        self.assertIn("生产管理", contract)

        bad = audit_implement_scope(
            [
                "frontend/src/views/warehouse/SalesOrdersView.vue",
                "frontend/src/router/index.js",
                "frontend/src/layouts/AppLayout.vue",
                "frontend/src/api/salesOrders.js",
                "backend/app/routers/sales_orders.py",
            ],
            scope,
        )
        self.assertFalse(bad.get("ok"), bad)
        self.assertTrue(
            any("生产管理" in v for v in bad.get("violations") or []),
            bad,
        )

        good = audit_implement_scope(
            [
                "frontend/src/views/production/SalesOrdersView.vue",
                "frontend/src/router/index.js",
                "frontend/src/layouts/AppLayout.vue",
                "frontend/src/api/salesOrders.js",
                "backend/app/routers/sales_orders.py",
            ],
            scope,
        )
        self.assertTrue(good.get("ok"), good)

    def test_scope_max_files_enhance(self) -> None:
        scope = build_prd_scope(message="工时报表加班别", scenario_id="enhance_existing")
        self.assertEqual(scope.get("max_files"), 8)
        self.assertIn("班别", scope_contract_for_implement(scope))

    def test_audit_rejects_bulk_api_refactor(self) -> None:
        scope = build_prd_scope(
            message="员工工时报表增加班别筛选",
            scenario_id="enhance_existing",
        )
        files = ["frontend/src/api/http.js"] + [
            f"frontend/src/api/module{i}.js" for i in range(20)
        ]
        files += [
            "frontend/src/views/reports/EmployeeWorkHoursReportView.vue",
            "backend/app/routers/reports.py",
        ]
        audit = audit_implement_scope(files, scope)
        self.assertFalse(audit.get("ok"))
        self.assertTrue(any("API" in v for v in audit.get("violations") or []))

    def test_audit_accepts_small_in_scope_change(self) -> None:
        scope = build_prd_scope(
            message="员工工时报表增加班别筛选",
            scenario_id="enhance_existing",
        )
        files = [
            "frontend/src/views/reports/EmployeeWorkHoursReportView.vue",
            "frontend/src/api/reports/employeeWorkHours.js",
            "backend/app/routers/reports.py",
        ]
        audit = audit_implement_scope(files, scope)
        self.assertTrue(audit.get("ok"))

    def test_extract_labels_real_column_add(self) -> None:
        labels = extract_requested_labels("红框处增加「物料入库时间」列")
        self.assertEqual(labels, ["物料入库时间"])

    def test_extract_labels_delete_overtime_not_add(self) -> None:
        """删除「加班工时」列不得误抽成要加「班工时…」→ content_gap 假红。"""
        msg = (
            "员工工时报表删除加班工时。"
            "在员工工时报表列表页中删除“加班工时”这一列，列表中不再展示加班工时数据"
        )
        labels = extract_requested_labels(msg)
        self.assertEqual(labels, [])
        # 真正加列仍可用
        self.assertEqual(
            extract_requested_labels("员工工时报表增加「安全库存」列"),
            ["安全库存"],
        )
        self.assertEqual(
            extract_requested_labels("在表头新增加班工时列"),
            ["加班工时"],
        )

    def test_extract_labels_ignores_req_matrix_and_forbid_boilerplate(self) -> None:
        """需求表截图 + 禁止句里的「物料入库」列表，不得当成缺列表头。"""
        msg = (
            "【界面锚定】（界面主标题原文，如「低库存预警（菜单：R04 管理） "
            "【现有表头】编码、项目、本项 【改动】按图中批注：① 销售订单列表与新建；"
            "② 登记发货数量与时间。插入位置以标注为准（红框/箭头/高亮/手写圈：位于“编码”列）；"
            "禁止改其它业务列表页（尤其勿把「物料入库」列表当成本页）。"
            "【图中标注】；箭头/高亮/手写圈：位于“编码”列和“项目”列之间"
        )
        labels = extract_requested_labels(msg)
        self.assertNotIn("物料入库", labels)
        self.assertFalse(any("箭头" in x or "高亮" in x for x in labels), labels)
        # 无「增加xxx列」则内容门禁应跳过
        audit = audit_implement_content(
            ["frontend/src/views/warehouse/LowStockAlertsView.vue"],
            {"user_message_excerpt": msg, "must_include_paths": []},
            workspace="",
        )
        self.assertTrue(audit.get("ok"), audit)


if __name__ == "__main__":
    unittest.main()
