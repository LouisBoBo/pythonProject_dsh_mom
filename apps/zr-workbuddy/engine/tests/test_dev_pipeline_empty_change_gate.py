"""空变更不得绿过：写码 / 复核 / 范围审计硬门禁。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class EmptyChangeGateTests(unittest.TestCase):
    def test_run_review_empty_files_fails_hard(self) -> None:
        from app.dev_pipeline.lane_exec import run_review

        logs: list[str] = []
        out = run_review(
            workspace=r"D:\fake\ws",
            message="低库存预警",
            files=[],
            log=logs.append,
        )
        self.assertFalse(out.get("ok"), out)
        self.assertEqual(out.get("reason"), "no_changed_files")
        self.assertFalse(out.get("skipped"))
        self.assertIn("停止", str(out.get("summary") or out.get("detail") or ""))
        self.assertTrue(any("无可用改动" in x for x in logs))

    def test_audit_empty_files_not_ok(self) -> None:
        from app.dev_pipeline.requirement_scope import audit_implement_scope, build_prd_scope

        scope = build_prd_scope(
            message="仓储管理增加低库存预警页",
            scenario_id="new_page",
        )
        audit = audit_implement_scope([], scope)
        self.assertFalse(audit.get("ok"))
        self.assertEqual(audit.get("file_count"), 0)
        self.assertIn("无变更", str(audit.get("detail") or ""))

    def test_step7_empty_implement_fails_and_does_not_pass(self) -> None:
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.steps import run_step

        orig = dp_cfg.get_config

        def _cfg():
            c = dict(orig())
            c["auto_run"] = True
            return c

        dp_cfg.get_config = _cfg  # type: ignore[method-assign]
        try:
            epic = {
                "artifacts": {
                    "implement": {"changed_files": [], "auto": True},
                    "plan": {"rev": "plan_ut"},
                }
            }
            run = {
                "workspace": r"D:\fake\ws",
                "steps": [
                    {"step_id": "5", "status": "pass"},
                    {"step_id": "6", "status": "pass"},
                    {"step_id": "7", "status": "pending"},
                ],
            }
            rec = run_step(
                "dpj-empty-review",
                "7",
                message="低库存预警",
                workspace=r"D:\fake\ws",
                epic=epic,
                run=run,
            )
            self.assertEqual(rec.get("status"), "fail", rec)
            ev = rec.get("evidence") or {}
            self.assertEqual(ev.get("reason"), "no_changed_files")
            self.assertNotIn(rec.get("status"), ("pass", "skipped"))
        finally:
            dp_cfg.get_config = orig  # type: ignore[method-assign]

    def test_step5_empty_changed_files_fails(self) -> None:
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.steps import run_step

        orig = dp_cfg.get_config

        def _cfg():
            c = dict(orig())
            c["auto_run"] = True
            return c

        dp_cfg.get_config = _cfg  # type: ignore[method-assign]
        # 与插件真实口径对齐：succeeded + 空文件 → run_implement 已判失败
        fake_out = {
            "ok": False,
            "job_id": "ccj-empty",
            "changed_files": [],
            "summary": "写码失败（ccj-empty，变更 0 项）",
            "detail": "Cursor 未产生可同步文件变更",
            "reason": "no_changed_files",
            "can_retry": True,
        }
        try:
            with tempfile.TemporaryDirectory() as td:
                with mock.patch(
                    "app.dev_pipeline.implement_gate.preflight_implement",
                    return_value={"ok": True, "reason": "ready", "notes": []},
                ), mock.patch(
                    "app.dev_pipeline.implement.run_implement", return_value=fake_out
                ):
                    epic = {
                        "artifacts": {
                            "prd": {"goal": "低库存预警页", "scope": {"max_files": 10}},
                            "plan": {"rev": "plan_ut", "scope": {"max_files": 10}},
                        }
                    }
                    run = {
                        "workspace": td,
                        "steps": [
                            {"step_id": "4", "status": "pass"},
                            {"step_id": "5", "status": "pending"},
                        ],
                    }
                    rec = run_step(
                        "dpj-empty-impl",
                        "5",
                        message="仓储管理增加低库存预警",
                        workspace=td,
                        epic=epic,
                        run=run,
                    )
                self.assertEqual(rec.get("status"), "fail", rec)
                ev = rec.get("evidence") or {}
                self.assertEqual(ev.get("reason"), "no_changed_files")
                self.assertEqual(
                    (epic.get("artifacts") or {}).get("implement", {}).get("changed_files"),
                    [],
                )
        finally:
            dp_cfg.get_config = orig  # type: ignore[method-assign]

    def test_step8_refuses_commit_without_pipeline_files(self) -> None:
        """无写码产物时禁止提交，避免把无关脏文件推上远端。"""
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.steps import run_step

        orig = dp_cfg.get_config

        def _cfg():
            c = dict(orig())
            c["auto_run"] = True
            return c

        dp_cfg.get_config = _cfg  # type: ignore[method-assign]
        try:
            with mock.patch("app.dev_pipeline.lane_exec.run_commit") as m_commit:
                epic = {
                    "artifacts": {
                        "implement": {"changed_files": [], "auto": True},
                        "prd": {"goal": "低库存"},
                        "plan": {"rev": "plan_ut"},
                    }
                }
                run = {
                    "workspace": r"D:\fake\ws",
                    "steps": [
                        {"step_id": "7", "status": "pass"},
                        {"step_id": "8", "status": "pending"},
                    ],
                }
                rec = run_step(
                    "dpj-empty-commit",
                    "8",
                    message="低库存",
                    workspace=r"D:\fake\ws",
                    epic=epic,
                    run=run,
                )
                m_commit.assert_not_called()
            self.assertEqual(rec.get("status"), "fail", rec)
            ev = rec.get("evidence") or {}
            self.assertEqual(ev.get("reason"), "no_changed_files")
        finally:
            dp_cfg.get_config = orig  # type: ignore[method-assign]


class VisionLowStockIntakeTests(unittest.TestCase):
    def test_vision_boilerplate_not_used_as_core(self) -> None:
        from app.dev_pipeline.intake_normalize import normalize_intake

        vision = """
以上是根据截图中可见内容整理出的结构化需求草稿，如有其他细节或要求，请随时补充。

### 结构化需求草稿

#### 1. 界面与元素
- **低库存接口**：已存在，但菜单无预警页，库管需手工对账。
- **仓储管理菜单**：增加「低库存预警」页，调用 `/api/inventory-low-stock`。
"""
        norm = normalize_intake(text="", vision_text=vision)
        core = str(norm.get("core") or "")
        self.assertIn("低库存", core)
        self.assertNotIn("如有其他细节", core)
        self.assertNotIn("结构化需求草稿", core)


if __name__ == "__main__":
    unittest.main()
