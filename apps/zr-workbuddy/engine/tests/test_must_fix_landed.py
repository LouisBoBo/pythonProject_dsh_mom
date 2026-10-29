# -*- coding: utf-8 -*-
"""高危 must_fix 落盘验收：防写码假成功空转复核。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class MustFixLandedTests(unittest.TestCase):
    def test_extract_new_params_from_real_findings(self) -> None:
        from app.dev_pipeline.fix_loop import (
            extract_must_fix_file,
            extract_must_fix_new_params,
        )

        a = (
            "🔴 高危 — 审批状态筛选参数缺失｜文件：backend/app/routers/reports.py:520｜"
            "修复：在列表与导出接口新增 approval_status 参数，取值限定 pending/approved/rejected"
        )
        b = (
            "🔴 高危 — 合计口径｜文件：backend/app/routers/reports.py:560｜"
            "修复：默认仅统计 approved；如需全量合计提供显式参数 include_unapproved=true"
        )
        self.assertEqual(extract_must_fix_file(a), "backend/app/routers/reports.py")
        self.assertEqual(extract_must_fix_new_params(a), ["approval_status"])
        self.assertEqual(extract_must_fix_new_params(b), ["include_unapproved"])

    def test_response_field_assignment_does_not_count(self) -> None:
        from app.dev_pipeline.fix_loop import audit_must_fix_landed

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p = root / "backend/app/routers/reports.py"
            p.parent.mkdir(parents=True)
            p.write_text(
                "def list_x(...):\n"
                "    return Item(approval_status=_approval_label(row.approval_status))\n"
                "    return Item(approval_status=\"汇总\")\n",
                encoding="utf-8",
            )
            items = [
                "🔴 高危 — x｜文件：backend/app/routers/reports.py:10｜"
                "修复：新增 approval_status 参数并在过滤器中使用",
            ]
            out = audit_must_fix_landed(str(root), items)
            self.assertFalse(out.get("ok"), out)
            self.assertTrue(any("approval_status" in v for v in out.get("violations") or []))

    def test_query_param_counts_as_landed(self) -> None:
        from app.dev_pipeline.fix_loop import audit_must_fix_landed

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p = root / "backend/app/routers/reports.py"
            p.parent.mkdir(parents=True)
            p.write_text(
                "def list_employee_work_hours_report(\n"
                "    approval_status: str | None = Query(None),\n"
                "    include_unapproved: bool = Query(False),\n"
                "):\n"
                "    ...\n",
                encoding="utf-8",
            )
            items = [
                "🔴 高危 — a｜文件：backend/app/routers/reports.py:1｜"
                "修复：新增 approval_status 参数",
                "🔴 高危 — b｜文件：backend/app/routers/reports.py:2｜"
                "修复：提供显式参数 include_unapproved=true",
            ]
            out = audit_must_fix_landed(str(root), items)
            self.assertTrue(out.get("ok"), out)
            self.assertEqual(out.get("checked"), 2)

    def test_judge_rejects_unaddressed_on_fix_round(self) -> None:
        from app.dev_pipeline.implement_gate import judge_implement_result

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p = root / "backend/app/routers/reports.py"
            p.parent.mkdir(parents=True)
            p.write_text(
                "def foo():\n    return dict(approval_status=\"汇总\")\n",
                encoding="utf-8",
            )
            verdict = judge_implement_result(
                job_out={
                    "ok": True,
                    "job_id": "ccj-x",
                    "changed_files": ["backend/app/routers/reports.py"],
                    "summary": "写码完成",
                },
                scope={"max_files": 20, "must_include_paths": [], "forbid_paths": []},
                workspace=str(root),
                fix_mandate={
                    "round": 2,
                    "must_fix": [
                        "🔴 高危 — 缺参｜文件：backend/app/routers/reports.py:10｜"
                        "修复：新增 approval_status 参数",
                    ],
                    "files": ["backend/app/routers/reports.py"],
                },
            )
            self.assertFalse(verdict.get("ok"), verdict)
            self.assertEqual(verdict.get("reason"), "must_fix_unaddressed")
            self.assertEqual(verdict.get("class"), "retry_delivery")

    def test_vue_finding_checks_frontend_and_hint_py(self) -> None:
        """审码常把「文件：」写成 .vue，但修复要求后端加参——不得对 Vue 验 Query。"""
        from app.dev_pipeline.fix_loop import audit_must_fix_landed

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            vue = root / "frontend/src/views/reports/EmployeeWorkHoursReportView.vue"
            py = root / "backend/app/routers/reports.py"
            vue.parent.mkdir(parents=True)
            py.parent.mkdir(parents=True)
            vue.write_text(
                "const queryParams = { approvalStatus: '' }\n",
                encoding="utf-8",
            )
            py.write_text(
                "def list_x(approval_status: str | None = Query(None)):\n    pass\n",
                encoding="utf-8",
            )
            items = [
                "🔴 高危 — 筛选｜文件：frontend/src/views/reports/EmployeeWorkHoursReportView.vue:318｜"
                "修复：前端 queryParams 补 approvalStatus；后端在 list/export 接口增加 approval_status 参数",
            ]
            out = audit_must_fix_landed(
                str(root),
                items,
                hint_files=[
                    "frontend/src/views/reports/EmployeeWorkHoursReportView.vue",
                    "backend/app/routers/reports.py",
                ],
            )
            self.assertTrue(out.get("ok"), out)

            # 后端未加参 → 仍应失败（验的是 py，不是对 vue 报 Query）
            py.write_text("def list_x():\n    return dict(approval_status='汇总')\n", encoding="utf-8")
            bad = audit_must_fix_landed(
                str(root),
                items,
                hint_files=["backend/app/routers/reports.py"],
            )
            self.assertFalse(bad.get("ok"), bad)
            self.assertTrue(
                any("reports.py" in v and "approval_status" in v for v in bad.get("violations") or []),
                bad,
            )
            self.assertFalse(
                any("Query 或形参注解" in v and ".vue" in v for v in bad.get("violations") or []),
                bad,
            )

    def test_non_param_must_fix_skipped(self) -> None:
        from app.dev_pipeline.fix_loop import audit_must_fix_landed

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            p = root / "backend/app/routers/x.py"
            p.parent.mkdir(parents=True)
            p.write_text("x = 1\n", encoding="utf-8")
            items = [
                "🔴 高危 — 硬编码｜文件：backend/app/routers/x.py:1｜"
                "修复：删除接口层硬编码伪造业务数据，改走入库/seed",
            ]
            out = audit_must_fix_landed(str(root), items)
            self.assertTrue(out.get("ok"), out)
            self.assertEqual(out.get("checked"), 0)

    def test_brief_includes_landing_checklist(self) -> None:
        from app.dev_pipeline.implement_gate import build_stable_implement_requirement

        epic = {
            "requirement_core": "工时报表",
            "artifacts": {
                "implement_fix_mandate": {
                    "round": 2,
                    "must_fix": [
                        "🔴 高危 — a｜文件：backend/app/routers/reports.py:520｜"
                        "修复：新增 approval_status 参数",
                    ],
                    "files": ["backend/app/routers/reports.py"],
                    "source": "review",
                },
                "prd": {"goal": "工时报表", "scope": {}},
            },
        }
        req = build_stable_implement_requirement(message="工时", epic=epic)
        self.assertIn("落盘验收口令", req)
        self.assertIn("approval_status", req)
        self.assertIn("上轮写码未消高危", req)

    def test_read_ws_file_rejects_path_traversal(self) -> None:
        from app.dev_pipeline.fix_loop import (
            _read_ws_file,
            audit_must_fix_landed,
            extract_must_fix_file,
        )

        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "ws"
            root.mkdir()
            secret = Path(td) / "secret.py"
            secret.write_text(
                "def f(leak_param: str = Query(None)):\n    pass\n",
                encoding="utf-8",
            )
            (root / "ok.py").write_text("x: int = 1\n", encoding="utf-8")
            text, err = _read_ws_file(root, "../secret.py")
            self.assertIsNone(text)
            self.assertTrue("非法" in err or "越界" in err, err)
            # lstrip("./") 旧写法会把 ../secret.py 误剥成 secret.py；须整段丢弃
            self.assertEqual(
                extract_must_fix_file(
                    "文件：../secret.py:1｜修复：新增 leak_param 参数"
                ),
                "",
            )
            items = [
                "🔴 高危 — x｜文件：../secret.py:1｜修复：新增 leak_param 参数",
            ]
            out = audit_must_fix_landed(str(root), items)
            # 无可机检安全相对路径 → 跳过，且绝不能因读到仓外文件而 ok
            self.assertTrue(out.get("ok"), out)
            self.assertEqual(out.get("checked"), 0)
            # 直接读仓外必须失败
            leaked, _ = _read_ws_file(root, str(secret))
            self.assertIsNone(leaked)

if __name__ == "__main__":
    unittest.main()
