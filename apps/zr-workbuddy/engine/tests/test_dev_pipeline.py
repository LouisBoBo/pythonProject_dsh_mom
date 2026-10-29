"""dev-pipeline P0/P1：状态机与账本（不启真实 Cursor / git）。"""
from __future__ import annotations

import os
import sys
import tempfile
import time
import unittest
import uuid
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


def _sid(prefix: str = "ut") -> str:
    return f"session-{prefix}-{uuid.uuid4().hex[:10]}"


def _ensure_feature(enabled: bool = True) -> bool:
    """启停功能插件；返回调用前是否已启用（供 finally 还原）。"""
    from app import plugins_store

    before = plugins_store.is_enabled("dev-pipeline")
    if enabled:
        plugins_store.enable("dev-pipeline")
    else:
        plugins_store.disable("dev-pipeline")
    return before


def _restore_feature(was_enabled: bool) -> None:
    from app import plugins_store

    if was_enabled:
        plugins_store.enable("dev-pipeline")
    else:
        plugins_store.disable("dev-pipeline")


class DevPipelineTests(unittest.TestCase):
    def test_begin_blocked_when_session_integrated_off(self):
        from app import plugins_store
        from app.dev_pipeline import begin_run
        import app.dev_pipeline.store as dp_store

        sid = _sid("off")
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            orig = dp_store.default_data_dir
            dp_store.default_data_dir = lambda: data  # type: ignore[method-assign]
            was = _ensure_feature(True)
            try:
                out = begin_run(
                    message="试一体化",
                    workspace="/tmp/x",
                    dsh_session_id=sid,
                )
                self.assertFalse(out.get("ok"))
                self.assertIn("本会话未开启一体化", out.get("detail") or "")
            finally:
                dp_store.default_data_dir = orig  # type: ignore[method-assign]
                _restore_feature(was)

    def test_begin_p1_pauses_at_implement(self):
        from app.dev_pipeline import begin_run, get_run, set_session_integrated_flow
        from app.dev_pipeline.store import pipeline_root
        import app.dev_pipeline.config as dp_cfg
        import app.dev_pipeline.store as dp_store

        sid = _sid("begin")
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            ws = Path(_ENG) / f"_dp_ut_{uuid.uuid4().hex[:8]}"
            ws.mkdir(parents=True, exist_ok=True)
            (ws / "package.json").write_text('{"name":"demo"}', encoding="utf-8")
            orig = dp_store.default_data_dir
            orig_cfg = dp_cfg.get_config
            dp_store.default_data_dir = lambda: data  # type: ignore[method-assign]

            def _cfg():
                c = dict(orig_cfg())
                c["auto_run"] = False
                c["default_workspace"] = ""
                c["step_pace_sec"] = 0.4
                return c

            dp_cfg.get_config = _cfg  # type: ignore[method-assign]
            was = _ensure_feature(True)
            try:
                set_session_integrated_flow(dsh_session_id=sid, enabled=True)
                out = begin_run(
                    message="增加消息中心已读角标",
                    workspace=str(ws),
                    dsh_session_id=sid,
                )
                self.assertTrue(out.get("ok"), out)
                rid = out.get("run_id")
                self.assertTrue(rid)
                # 事故回归：空 reply 会被 Agent 当成失败 → 连调 begin / 让用户自查绿开关
                ack = str(out.get("reply") or "")
                self.assertIn(str(rid), ack)
                self.assertIn("禁止再次调用", ack)
                self.assertTrue(out.get("dev_pipeline_ui"))
                deadline = time.time() + 10.0
                run_doc = None
                while time.time() < deadline:
                    snap = get_run(rid)
                    if snap.get("ok"):
                        run_doc = snap.get("run") or {}
                        if run_doc.get("status") in ("paused", "failed", "done"):
                            break
                    time.sleep(0.15)
                self.assertIsNotNone(run_doc)
                self.assertEqual(run_doc.get("status"), "paused")
                self.assertEqual(run_doc.get("current_step"), "5")
                steps = {s["step_id"]: s["status"] for s in (run_doc.get("steps") or [])}
                self.assertEqual(steps.get("3"), "pass")
                self.assertEqual(steps.get("5"), "waiting_hitl")
                self.assertTrue(str(run_doc.get("workspace") or "").startswith(str(ws)))
                self.assertTrue((pipeline_root(data) / "epics").is_dir())
            finally:
                dp_store.default_data_dir = orig  # type: ignore[method-assign]
                dp_cfg.get_config = orig_cfg  # type: ignore[method-assign]
                _restore_feature(was)
                try:
                    import shutil

                    shutil.rmtree(ws, ignore_errors=True)
                except Exception:
                    pass

    def test_confirm_implement_runs_validate_and_stops_at_review(self):
        from app import plugins_store
        from app.dev_pipeline import (
            begin_run,
            confirm_step,
            get_run,
            set_session_integrated_flow,
        )
        import app.dev_pipeline.config as dp_cfg
        import app.dev_pipeline.store as dp_store

        sid = _sid("cfm5")
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            ws = Path(_ENG)
            orig_data = dp_store.default_data_dir
            orig_cfg = dp_cfg.get_config
            dp_store.default_data_dir = lambda: data  # type: ignore[method-assign]

            def _cfg():
                c = dict(orig_cfg())
                c["auto_run"] = False
                c["validate_commands"] = [{"name": "noop", "cmd": "true"}]
                c["default_workspace"] = ""
                return c

            dp_cfg.get_config = _cfg  # type: ignore[method-assign]
            was = _ensure_feature(True)
            try:
                set_session_integrated_flow(dsh_session_id=sid, enabled=True)
                out = begin_run(
                    message="小改动",
                    workspace=str(ws),
                    dsh_session_id=sid,
                )
                rid = out["run_id"]
                deadline = time.time() + 10.0
                while time.time() < deadline:
                    snap = get_run(rid)
                    run_doc = (snap.get("run") or {}) if snap.get("ok") else {}
                    if run_doc.get("current_step") == "5" and run_doc.get("status") == "paused":
                        break
                    time.sleep(0.1)
                cfm = confirm_step(rid, step_id="5", no_code_change=True, note="单测跳过写码")
                self.assertTrue(cfm.get("ok"), cfm)
                deadline = time.time() + 12.0
                run_doc = None
                while time.time() < deadline:
                    snap = get_run(rid)
                    if snap.get("ok"):
                        run_doc = snap.get("run") or {}
                        if run_doc.get("current_step") == "7" and run_doc.get("status") == "paused":
                            break
                    time.sleep(0.15)
                self.assertIsNotNone(run_doc)
                steps = {s["step_id"]: s["status"] for s in (run_doc.get("steps") or [])}
                self.assertEqual(steps.get("6"), "pass")
                self.assertEqual(steps.get("7"), "waiting_hitl")
            finally:
                dp_store.default_data_dir = orig_data  # type: ignore[method-assign]
                dp_cfg.get_config = orig_cfg  # type: ignore[method-assign]
                _restore_feature(was)

    def test_full_flow_confirm_lanes_to_done(self):
        """1→5 HITL → confirm5 →6/7 → confirm 7～10 → done。"""
        from app import plugins_store
        from app.dev_pipeline import (
            begin_run,
            confirm_step,
            get_run,
            set_session_integrated_flow,
        )
        import app.dev_pipeline.config as dp_cfg
        import app.dev_pipeline.store as dp_store

        sid = _sid("e2e")
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            # 工程目录须落在非敏感前缀下（/var/folders 会被 validate_workspace 拒绝）
            ws = Path(_ENG) / f"_dp_e2e_{uuid.uuid4().hex[:8]}"
            ws.mkdir(parents=True, exist_ok=True)
            (ws / "package.json").write_text('{"name":"dp-e2e"}', encoding="utf-8")
            orig_data = dp_store.default_data_dir
            orig_cfg = dp_cfg.get_config
            dp_store.default_data_dir = lambda: data  # type: ignore[method-assign]

            def _cfg():
                c = dict(orig_cfg())
                c["auto_run"] = False
                c["validate_commands"] = [{"name": "noop", "cmd": "true"}]
                c["default_workspace"] = str(ws)
                c["step_pace_sec"] = 0.4
                return c

            dp_cfg.get_config = _cfg  # type: ignore[method-assign]
            was = _ensure_feature(True)
            try:
                set_session_integrated_flow(dsh_session_id=sid, enabled=True)
                out = begin_run(
                    message="E2E 打通全流程",
                    workspace="",  # 依赖 default_workspace 兜底
                    dsh_session_id=sid,
                )
                self.assertTrue(out.get("ok"), out)
                rid = out["run_id"]

                def wait_step(step: str, status: str = "paused", timeout: float = 12.0):
                    deadline = time.time() + timeout
                    run_doc = None
                    while time.time() < deadline:
                        snap = get_run(rid)
                        run_doc = (snap.get("run") or {}) if snap.get("ok") else {}
                        st = next(
                            (s for s in (run_doc.get("steps") or []) if s.get("step_id") == step),
                            None,
                        )
                        if (
                            run_doc.get("status") == status
                            and st
                            and st.get("status") == "waiting_hitl"
                        ):
                            return run_doc
                        if run_doc.get("status") in ("failed", "done") and step == "10":
                            return run_doc
                        time.sleep(0.12)
                    self.fail(f"timeout waiting step {step}: {run_doc}")

                wait_step("5")
                self.assertTrue(
                    confirm_step(rid, step_id="5", note="写码完成").get("ok")
                )
                wait_step("7")
                for step in ("7", "8", "9"):
                    self.assertTrue(
                        confirm_step(rid, step_id=step, note=f"步骤{step}完成").get("ok"),
                        step,
                    )
                    if step != "9":
                        wait_step(str(int(step) + 1))
                wait_step("10")
                self.assertTrue(confirm_step(rid, step_id="10", note="部署完成").get("ok"))
                deadline = time.time() + 8.0
                run_doc = None
                while time.time() < deadline:
                    snap = get_run(rid)
                    run_doc = (snap.get("run") or {}) if snap.get("ok") else {}
                    if run_doc.get("status") == "done":
                        break
                    time.sleep(0.12)
                self.assertEqual(run_doc.get("status"), "done")
                self.assertEqual(run_doc.get("outcome"), "success")
                steps = {s["step_id"]: s["status"] for s in (run_doc.get("steps") or [])}
                for i in range(1, 11):
                    self.assertEqual(steps.get(str(i)), "pass", f"step {i}")
            finally:
                dp_store.default_data_dir = orig_data  # type: ignore[method-assign]
                dp_cfg.get_config = orig_cfg  # type: ignore[method-assign]
                _restore_feature(was)
                try:
                    import shutil

                    shutil.rmtree(ws, ignore_errors=True)
                except Exception:
                    pass

    def test_fail_does_not_mark_later_pass(self):
        from app.dev_pipeline.runner import _init_steps_state, _apply_receipt

        steps = _init_steps_state()
        _apply_receipt(
            steps,
            {
                "step_id": "2",
                "status": "fail",
                "summary": "x",
            },
        )
        m = {s["step_id"]: s["status"] for s in steps}
        self.assertEqual(m["2"], "fail")
        self.assertEqual(m["3"], "pending")

    def test_confirm_without_workspace_blocked(self):
        from app import plugins_store
        from app.dev_pipeline import (
            begin_run,
            confirm_step,
            get_run,
            set_session_integrated_flow,
        )
        import app.dev_pipeline.config as dp_cfg
        import app.dev_pipeline.service as svc
        import app.dev_pipeline.store as dp_store

        sid = _sid("nows")
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            orig = dp_store.default_data_dir
            orig_cfg = dp_cfg.get_config
            orig_lane = svc._lane_default_workspace
            dp_store.default_data_dir = lambda: data  # type: ignore[method-assign]
            svc._lane_default_workspace = lambda: ""  # type: ignore[method-assign]

            def _cfg():
                c = dict(orig_cfg())
                c["auto_run"] = False
                c["default_workspace"] = ""
                c["validate_commands"] = []
                return c

            dp_cfg.get_config = _cfg  # type: ignore[method-assign]
            was = _ensure_feature(True)
            try:
                set_session_integrated_flow(dsh_session_id=sid, enabled=True)
                out = begin_run(
                    message="无目录需求",
                    workspace="",
                    dsh_session_id=sid,
                )
                self.assertTrue(out.get("ok"), out)
                rid = out["run_id"]
                deadline = time.time() + 10.0
                while time.time() < deadline:
                    snap = get_run(rid)
                    run_doc = (snap.get("run") or {}) if snap.get("ok") else {}
                    if run_doc.get("current_step") == "5" and run_doc.get("status") == "paused":
                        break
                    time.sleep(0.1)
                cfm = confirm_step(rid, step_id="5", no_code_change=True)
                self.assertFalse(cfm.get("ok"))
                self.assertIn("工程目录", cfm.get("detail") or "")
                snap = get_run(rid)
                run_doc = snap.get("run") or {}
                self.assertEqual(run_doc.get("current_step"), "5")
                steps = {s["step_id"]: s["status"] for s in (run_doc.get("steps") or [])}
                self.assertEqual(steps.get("5"), "waiting_hitl")
                self.assertNotEqual(steps.get("6"), "fail")
            finally:
                dp_store.default_data_dir = orig  # type: ignore[method-assign]
                dp_cfg.get_config = orig_cfg  # type: ignore[method-assign]
                svc._lane_default_workspace = orig_lane  # type: ignore[method-assign]
                _restore_feature(was)

    def test_validate_empty_workspace_waiting_user_no_bounce(self):
        from app.dev_pipeline.steps import run_step

        epic: dict = {"artifacts": {"implement": {"no_code_change": True}}}
        run = {
            "steps": [
                {"step_id": "5", "status": "pass"},
                {"step_id": "6", "status": "pending"},
            ],
            "workspace": "",
        }
        rec = run_step("dpj-test", "6", message="x", workspace="", epic=epic, run=run)
        self.assertEqual(rec.get("status"), "waiting_user")
        self.assertEqual((rec.get("evidence") or {}).get("reason"), "no_workspace")

    def test_review_short_summary_prefers_risk_bands(self):
        from app.dev_pipeline.lane_exec import _review_short_summary

        raw = {
            "summary": "已按 Viprasol **本批次改动重审** 1 个文件。LLM 产出 2 条。",
            "findings": [
                {
                    "file": "a.py",
                    "line": 1,
                    "severity": "high",
                    "title": "SQL",
                    "description": "注入",
                },
                {
                    "file": "b.py",
                    "line": 2,
                    "severity": "medium",
                    "title": "HTTP请求规则",
                    "description": "违规",
                },
                {
                    "file": "c.py",
                    "line": 3,
                    "severity": "low",
                    "title": "命名",
                    "description": "风格",
                },
            ],
            "reply": (
                "代码审核汇总报告\n---\n一、总体评价\n"
                "🔴 高危问题：共 1 处，必须全部修复后方可合并。\n"
                "---\n二、详细问题清单\n"
            ),
        }
        short = _review_short_summary(raw)
        self.assertIn("高危问题", short)
        self.assertIn("中危问题", short)
        self.assertIn("低危问题", short)
        self.assertNotIn("本批次改动重审", short)
        self.assertNotIn("代码审核汇总报告", short)

    def test_validate_empty_config_uses_auto_defaults_not_stop(self):
        from app.dev_pipeline import config as dp_cfg
        from app.dev_pipeline.steps import run_step
        from app.dev_pipeline.validate import run_validate_commands

        with tempfile.TemporaryDirectory() as tmp:
            ws = Path(tmp)
            (ws / "hello.py").write_text("x = 1\n", encoding="utf-8")
            # 初始化真 git，便于 git-diff-check 探测
            import subprocess

            subprocess.run(
                ["git", "init"],
                cwd=str(ws),
                check=True,
                capture_output=True,
            )
            orig = dp_cfg.get_config

            def _cfg():
                c = dict(orig())
                c["validate_commands"] = []
                return c

            dp_cfg.get_config = _cfg  # type: ignore[method-assign]
            try:
                out = run_validate_commands(str(ws))
                self.assertTrue(out.get("ok") or out.get("results"), out)
                self.assertNotEqual(out.get("reason"), "no_validate_commands")
                epic: dict = {
                    "artifacts": {
                        "implement": {"changed_files": ["hello.py"], "auto": True},
                    }
                }
                run = {
                    "workspace": str(ws),
                    "steps": [
                        {"step_id": "5", "status": "pass"},
                        {"step_id": "6", "status": "pending"},
                    ],
                }
                rec = run_step(
                    "dpj-test-autoval",
                    "6",
                    message="x",
                    workspace=str(ws),
                    epic=epic,
                    run=run,
                )
                # 自动探测应真正跑命令并 pass（或轻量跳过仍 pass），不得 waiting_user 卡死
                self.assertEqual(rec.get("status"), "pass", rec)
            finally:
                dp_cfg.get_config = orig  # type: ignore[method-assign]

    def test_commit_gate_block_fail_fast_triggers_remediation(self):
        from app.dev_pipeline import lane_exec
        from app.dev_pipeline.fix_loop import (
            format_upstream_fix_feedback,
            retry_sequence_after_implement_fix,
            should_auto_retry_implement,
            store_commit_gate_fail_epic,
        )

        calls = {"n": 0}

        def _fake_gate(_ws):
            calls["n"] += 1
            return {
                "ok": True,
                "can_commit": False,
                "detail": "提交批审：2 条阻断、3 条警告 —— 禁止提交",
                "job_id": "cc-fake",
                "findings": [
                    {
                        "severity": "P0",
                        "path": "a.py",
                        "message": "危险 eval",
                        "blocking": True,
                    },
                    {
                        "severity": "P1",
                        "path": "b.py",
                        "message": "硬编码密钥",
                        "blocking": True,
                    },
                ],
            }

        import app.code_commit.ops as cc_ops

        orig_gate = cc_ops.start_gate
        orig_confirm = cc_ops.confirm
        cc_ops.start_gate = _fake_gate  # type: ignore[method-assign]
        cc_ops.confirm = lambda *a, **k: {"ok": False}  # type: ignore[method-assign]
        try:
            out = lane_exec.run_commit(workspace="/tmp/x", message="测", max_attempts=3)
            self.assertFalse(out.get("ok"), out)
            self.assertFalse(out.get("skipped"), out)
            self.assertEqual(out.get("reason"), "commit_gate_blockers")
            self.assertEqual(calls["n"], 1, "门禁阻断必须立即失败，禁止空转 3 次")
            self.assertIn("补救", out.get("summary") or "")
            self.assertNotIn("已跳过本步并继续", out.get("summary") or "")

            self.assertTrue(
                should_auto_retry_implement(reason="commit_gate_blockers", fix_round=1)
            )
            seq = retry_sequence_after_implement_fix(
                ("1", "2", "3", "4", "5", "6", "7", "8", "9", "10")
            )
            self.assertEqual(seq[:4], ("5", "6", "7", "8"))
            self.assertIn("9", seq)

            epic: dict = {"artifacts": {}}
            receipt = {
                "summary": out.get("summary"),
                "evidence": {
                    "reason": "commit_gate_blockers",
                    "detail": out.get("detail"),
                    "gate_findings": out.get("gate_findings"),
                    "raw": out.get("raw"),
                },
            }
            store_commit_gate_fail_epic(epic, receipt, round_no=1)
            fb = format_upstream_fix_feedback(epic["artifacts"])
            self.assertIn("危险 eval", fb)
            self.assertIn("硬编码密钥", fb)
        finally:
            cc_ops.start_gate = orig_gate  # type: ignore[method-assign]
            cc_ops.confirm = orig_confirm  # type: ignore[method-assign]


if __name__ == "__main__":
    unittest.main()
