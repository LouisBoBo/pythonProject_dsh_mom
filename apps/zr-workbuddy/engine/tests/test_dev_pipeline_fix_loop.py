import tempfile
import unittest
from pathlib import Path
from unittest import mock

from app.dev_pipeline.fix_loop import (
    align_must_fix_for_delete_feature,
    extract_review_fix_items,
    format_upstream_fix_feedback,
    looks_like_delete_feature_requirement,
    retry_sequence_after_implement_fix,
    should_auto_retry_implement,
)
from app.dev_pipeline.implement import REFUSE_FAIL_AFTER, is_conn_refused
from app.dev_pipeline.store import save_epic, save_run


class DevPipelineFixLoopTest(unittest.TestCase):
    def test_delete_feature_must_fix_prefers_teardown(self):
        """删低库存预警：勿把「修并发」当成唯一打回，应置顶彻底拆除。"""
        self.assertTrue(
            looks_like_delete_feature_requirement("从仓储管理中删除低库存预警功能")
        )
        self.assertFalse(
            looks_like_delete_feature_requirement(
                "从员工工时报表删除加班工时列"
            )
        )
        items = align_must_fix_for_delete_feature(
            [
                "🔴 高危 — 登记发货存在并发非原子更新｜文件：backend/app/routers/inventory_low_stock.py:168｜修复：条件 UPDATE"
            ],
            requirement="从仓储管理中删除低库存预警功能",
            report_body="🟡 中危 — 删除功能不彻底：main.py 仍 include_router(inventory_low_stock.router)",
        )
        self.assertTrue(any("彻底删除" in x for x in items), items)
        self.assertFalse(
            any("条件 UPDATE" in x and "inventory_low_stock" in x for x in items),
            items,
        )

    def test_retry_sequence_tail(self):
        seq = ("1", "2", "3", "4", "5", "6", "7", "8", "9", "10")
        self.assertEqual(
            retry_sequence_after_implement_fix(seq),
            ("5", "6", "7", "8", "9", "10"),
        )

    def test_should_retry_review_blockers(self):
        self.assertTrue(
            should_auto_retry_implement(reason="review_blockers", fix_round=1)
        )
        self.assertTrue(
            should_auto_retry_implement(reason="review_blockers", fix_round=2)
        )
        self.assertFalse(
            should_auto_retry_implement(reason="review_blockers", fix_round=3)
        )

    def test_should_retry_no_changed_files_max_three(self):
        """空变更 = 写码失败：第 1/2 轮可自动重跑，第 3 轮起不再重试（满则停机）。"""
        self.assertTrue(
            should_auto_retry_implement(reason="no_changed_files", fix_round=1)
        )
        self.assertTrue(
            should_auto_retry_implement(reason="no_changed_files", fix_round=2)
        )
        self.assertFalse(
            should_auto_retry_implement(reason="no_changed_files", fix_round=3)
        )
        self.assertFalse(
            should_auto_retry_implement(reason="no_changed_files", fix_round=4)
        )

    def test_max_fix_rounds_hard_capped_at_three(self):
        """配置写再大也硬顶 3，禁止多轮瞎改。"""
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.fix_loop import max_fix_rounds

        orig = dp_cfg.get_config

        def _cfg():
            c = dict(orig())
            c["max_fix_rounds"] = 99
            return c

        dp_cfg.get_config = _cfg  # type: ignore[method-assign]
        try:
            self.assertEqual(max_fix_rounds(), 3)
        finally:
            dp_cfg.get_config = orig  # type: ignore[method-assign]

    def test_step5_non_delivery_fail_closes_run(self):
        """job_failed 等非交付原因：不得留下 running（否则孤儿续跑假抬轮次）。"""
        from app.dev_pipeline.runner import _fail_close_if_still_running

        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            run = {
                "run_id": "dpj-net-fail",
                "status": "running",
                "current_step": "5",
                "steps": [{"step_id": "5", "status": "fail"}],
            }
            save_run(data_dir, run)
            receipt = {
                "status": "fail",
                "summary": "Network request failed",
                "evidence": {"reason": "plugin_network"},
            }
            with mock.patch("app.dev_pipeline.runner._publish_snapshot"), mock.patch(
                "app.dev_pipeline.runner._publish_run_phase"
            ), mock.patch("app.dev_pipeline.runner._finalize_summary"):
                _fail_close_if_still_running(
                    data_dir, "dpj-net-fail", run, run["steps"], receipt
                )
            from app.dev_pipeline.store import load_run

            fresh = load_run(data_dir, "dpj-net-fail") or {}
            self.assertEqual(fresh.get("status"), "failed")
            self.assertEqual(fresh.get("outcome"), "failed")
            self.assertEqual(fresh.get("fail_reason"), "plugin_network")

    def test_extract_review_fix_items(self):
        body = "二、详细问题清单\n- Blocker: 缺少权限校验\n1. 未处理空指针"
        items = extract_review_fix_items(body, {})
        self.assertTrue(any("权限" in x for x in items))

    def test_extract_review_fix_items_high_risk_lines(self):
        """高危行必须进 must_fix，否则打回写码闭环断掉。"""
        body = (
            "一、总体评价\n"
            "🔴 高危问题：共 2 处，必须全部修复后方可合并。\n"
            "---\n"
            "二、详细问题清单（汇总后）\n"
            "🔴 高危 问题1 — MaterialInboundListView.vue 缺空值保护\n"
            "文件：frontend/src/views/warehouse/MaterialInboundListView.vue　位置：约第 10 行\n"
            "问题描述：缺少空值保护\n"
            "🔴 高危 问题2 — warehouse.py 未校验权限\n"
            "文件：backend/app/routers/warehouse.py　位置：约第 20 行\n"
        )
        items = extract_review_fix_items(body, {})
        # 概览行不得进清单（否则淹没真正要修的问题）
        self.assertFalse(any("共 2 处" in x for x in items), items)
        self.assertTrue(any("空值" in x or "MaterialInbound" in x for x in items), items)
        self.assertTrue(any("权限" in x or "warehouse" in x for x in items), items)
        # 应带上文件路径，方便写码定位
        self.assertTrue(any("MaterialInboundListView.vue" in x for x in items), items)

    def test_extract_prefers_structured_high_findings(self):
        """有结构化 findings 时优先用，且只收高危（低危不进 must_fix）。"""
        from app.dev_pipeline.fix_loop import extract_fix_items_from_findings

        findings = [
            {
                "file": "backend/app/routers/warehouse.py",
                "line": 470,
                "severity": "high",
                "title": "接口层硬编码伪造业务数据，污染统计口径",
                "fix_suggestion": "移除 _insert_lisi…，改走 seed/入库",
            },
            {
                "file": "frontend/src/views/warehouse/MaterialInboundListView.vue",
                "line": 150,
                "severity": "low",
                "title": "formatHours 对负数与超大值无处理",
            },
        ]
        items = extract_fix_items_from_findings(findings)
        self.assertEqual(len(items), 1, items)
        self.assertIn("硬编码", items[0])
        self.assertIn("warehouse.py", items[0])
        self.assertIn("seed", items[0].lower())
        self.assertFalse(any("formatHours" in x for x in items))

        # extract_review_fix_items 也应走结构化优先
        noisy_body = (
            "🔴 高危问题：共 1 处，必须全部修复后方可合并。\n"
            "❌ 审核不通过（存在高危问题，须全部修复后方可合并）\n"
        )
        items2 = extract_review_fix_items(noisy_body, {"findings": findings})
        self.assertEqual(len(items2), 1, items2)
        self.assertIn("硬编码", items2[0])

    def test_refresh_cleans_dirty_mandate_from_disk(self):
        """旧引擎写入的「共 N 处」脏清单，读时必须洗净再进任务卡。"""
        from app.dev_pipeline.fix_loop import refresh_implement_fix_mandate
        from app.dev_pipeline.implement_gate import build_stable_implement_requirement

        epic = {
            "requirement_core": "员工工时报表新增产出工时列",
            "artifacts": {
                "implement_fix_mandate": {
                    "round": 2,
                    "source": "review",
                    "must_fix": [
                        "🔴 高危问题：共 1 处，必须全部修复后方可合并。",
                        "🟡 中危问题：共 2 处，建议本次一并修复。",
                        "🔴 高危 问题1 — 列表接口硬编码插入演示假数据",
                        "❌ 审核不通过（存在高危问题，须全部修复后方可合并）",
                    ],
                    "files": ["backend/app/routers/warehouse.py"],
                },
                "review_fail_evidence": {
                    "round": 2,
                    "summary": "存在 1 处高危",
                    "must_fix": [
                        "🔴 高危问题：共 1 处，必须全部修复后方可合并。",
                        "🔴 高危 问题1 — 列表接口硬编码插入演示假数据",
                    ],
                    "gate_findings": [
                        {
                            "file": "backend/app/routers/warehouse.py",
                            "line": 330,
                            "severity": "critical",
                            "title": "列表接口硬编码插入演示假数据",
                            "fix_suggestion": "删除 _insert_lisi 假插行",
                        }
                    ],
                },
            },
        }
        m = refresh_implement_fix_mandate(epic)
        assert m is not None
        items = list(m.get("must_fix") or [])
        self.assertEqual(len(items), 1, items)
        self.assertIn("硬编码", items[0])
        self.assertFalse(any("共 1 处" in x for x in items), items)
        text = build_stable_implement_requirement(
            message="员工工时报表新增产出工时列", epic=epic
        )
        self.assertIn("精准修复", text)
        self.assertIn("硬编码", text)
        self.assertNotIn("共 1 处，必须全部修复", text)

    def test_store_review_fail_uses_high_severity(self):
        """severity=high 必须进 mandate（旧逻辑只认 P0/P1 会漏掉）。"""
        from app.dev_pipeline.fix_loop import store_review_fail_epic

        epic: dict = {"artifacts": {}}
        receipt = {
            "summary": "存在 1 处高危问题，审核不通过",
            "evidence": {
                "reason": "review_blockers",
                "files": ["backend/app/routers/warehouse.py"],
                "report_body": "🔴 高危问题：共 1 处，必须全部修复后方可合并。\n",
                "findings": [
                    {
                        "file": "backend/app/routers/warehouse.py",
                        "line": 470,
                        "severity": "high",
                        "title": "接口层硬编码伪造业务数据",
                        "fix_suggestion": "删除 _insert_lisi，改用 seed",
                    }
                ],
                "raw": {},
            },
        }
        store_review_fail_epic(epic, receipt, round_no=2)
        mandate = epic["artifacts"]["implement_fix_mandate"]
        self.assertEqual(mandate["round"], 2)
        self.assertTrue(any("硬编码" in x for x in mandate["must_fix"]), mandate)
        self.assertFalse(any("共 1 处" in x for x in mandate["must_fix"]), mandate)

    def test_fix_round_requirement_prioritizes_must_fix(self):
        """打回写码时任务卡主目标必须是逐条修复，不能再把原需求当唯一交付。"""
        from app.dev_pipeline.implement_gate import build_stable_implement_requirement

        epic = {
            "requirement_core": "员工工时报表李四新增一条加班",
            "artifacts": {
                "implement_fix_mandate": {
                    "round": 2,
                    "max_rounds": 3,
                    "source": "review",
                    "must_fix": [
                        "🔴 高危 问题1 — 接口层硬编码伪造业务数据",
                    ],
                    "files": ["backend/app/routers/warehouse.py"],
                },
                "review_fail_evidence": {
                    "round": 2,
                    "summary": "存在 1 处高危问题，审核不通过",
                    "must_fix": ["🔴 高危 问题1 — 接口层硬编码伪造业务数据"],
                    "files": ["backend/app/routers/warehouse.py"],
                    "report_body": "x",
                },
            },
        }
        text = build_stable_implement_requirement(
            message="员工工时报表李四新增一条加班",
            epic=epic,
        )
        self.assertIn("精准修复", text)
        self.assertIn("硬编码", text)
        self.assertIn("禁止", text)
        # 原需求只能作背景，不能再当「本步唯一交付目标」的改动句
        self.assertNotIn("- 改动：员工工时报表李四新增一条加班", text)
        self.assertIn("背景需求", text)
        self.assertIn("冲突裁决", text)

    def test_feedback_includes_review(self):
        arts = {
            "implement_fix_mandate": {"round": 2, "must_fix": ["缺少权限校验"]},
            "review_fail_evidence": {
                "round": 2,
                "summary": "2 个 Blocker",
                "detail": "缺少权限校验",
                "must_fix": ["缺少权限校验"],
                "files": ["src/a.py"],
            },
        }
        text = format_upstream_fix_feedback(arts)
        self.assertIn("复核未通过", text)
        self.assertIn("必须逐条修复", text)
        self.assertIn("src/a.py", text)
        self.assertIn("精准修复", text)

    def test_win_conn_refused_fails_after_three(self):
        self.assertEqual(REFUSE_FAIL_AFTER, 3)
        win = "<urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>"
        self.assertTrue(is_conn_refused(win))
        self.assertTrue(is_conn_refused("Connection refused"))
        self.assertFalse(is_conn_refused("timeout waiting for peer"))

    def test_step5_empty_change_retries_then_stops(self):
        """空变更：自动重跑写码；第 3 次失败后整条 Run 停机，不进验证/部署。"""
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.runner import _handle_step5_scope_fail

        orig = dp_cfg.get_config

        def _cfg():
            c = dict(orig())
            c["auto_run"] = True
            c["on_step_fail"] = "auto_fix"
            c["max_fix_rounds"] = 3
            return c

        dp_cfg.get_config = _cfg  # type: ignore[method-assign]
        try:
            with tempfile.TemporaryDirectory() as tmp:
                data_dir = Path(tmp)
                run = {
                    "run_id": "dpj-empty-retry",
                    "epic_id": "ep-empty-retry",
                    "status": "running",
                    "fix_round": 0,
                    "current_step": "5",
                    "steps": [
                        {"step_id": "5", "status": "fail", "summary": "", "receipt": None},
                        {"step_id": "6", "status": "pending"},
                        {"step_id": "7", "status": "pending"},
                        {"step_id": "8", "status": "pending"},
                    ],
                }
                epic = {"epic_id": "ep-empty-retry", "artifacts": {}}
                save_run(data_dir, run)
                save_epic(data_dir, epic)
                receipt = {
                    "status": "fail",
                    "summary": "写码未产生变更文件",
                    "evidence": {"reason": "no_changed_files"},
                }
                # 第 1、2 次失败 → 允许重试
                for expected_round in (1, 2):
                    run["fix_round"] = expected_round - 1
                    steps = run["steps"]
                    with mock.patch("app.dev_pipeline.runner._publish_snapshot"):
                        ok = _handle_step5_scope_fail(
                            data_dir, run, epic, receipt, steps
                        )
                    self.assertTrue(ok, f"round {expected_round} should retry")
                    self.assertEqual(run["fix_round"], expected_round)
                    self.assertEqual(run["status"], "running")
                    self.assertEqual(run["current_step"], "5")
                # 第 3 次失败 → 满轮停机
                run["fix_round"] = 2
                with mock.patch("app.dev_pipeline.runner._publish_snapshot"), mock.patch(
                    "app.dev_pipeline.runner._publish_run_phase"
                ), mock.patch("app.dev_pipeline.runner._finalize_summary"):
                    ok = _handle_step5_scope_fail(
                        data_dir, run, epic, receipt, run["steps"]
                    )
                self.assertFalse(ok)
                self.assertEqual(run["fix_round"], 3)
                self.assertEqual(run["status"], "failed")
                self.assertEqual(run.get("fail_reason"), "fix_rounds_exhausted")
                self.assertEqual(run.get("outcome"), "failed")
        finally:
            dp_cfg.get_config = orig  # type: ignore[method-assign]


if __name__ == "__main__":
    unittest.main()
