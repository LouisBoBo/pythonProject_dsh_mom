import unittest

from app.dev_pipeline.timeline_trace import (
    build_display_timeline,
    record_rollback,
    trace_step_finished,
    trace_step_running,
)


class TimelineTraceTest(unittest.TestCase):
    def test_trace_shows_retry_sequence_for_stream_and_rail(self):
        """过程流与轨道同源：保留 1…7→5→6→7 访问序列。"""
        run = {"implement_attempt": 1, "timeline_trace": []}
        for sid in ("1", "2", "3", "4", "5", "6", "7"):
            trace_step_running(run, sid)
            trace_step_finished(
                run,
                sid,
                {
                    "step_id": sid,
                    "status": "fail" if sid == "7" else "pass",
                    "summary": "x",
                },
            )
        record_rollback(run, from_step="7", fix_round=1, reason="blocker")
        for sid in ("5", "6", "7"):
            trace_step_running(run, sid)
            trace_step_finished(
                run,
                sid,
                {"step_id": sid, "status": "running" if sid == "7" else "pass"},
            )
        tl = build_display_timeline(run)
        steps = [x for x in tl if x.get("kind") == "step"]
        rollbacks = [x for x in tl if x.get("kind") == "rollback"]
        self.assertEqual(len(rollbacks), 1)
        self.assertEqual([s["step_id"] for s in steps[:7]], list("1234567"))
        self.assertEqual([s["step_id"] for s in steps[7:]], ["5", "6", "7"])
        # 5/6/7 此前都跑过一轮，重跑后各自为第 2 轮
        self.assertEqual(steps[7]["implement_attempt"], 2)  # 写码
        self.assertEqual(steps[8]["implement_attempt"], 2)  # 验证
        self.assertEqual(steps[9]["implement_attempt"], 2)  # 复核
        self.assertIn("写码将进入第 2 轮", rollbacks[0]["title"])
        self.assertNotIn("将重跑 5→6→7", rollbacks[0]["title"])

    def test_only_write_retry_keeps_later_steps_at_round_one(self):
        """仅写码失败打回：写码第 2 轮，验证/复核仍是各自第 1 轮。"""
        run = {"timeline_trace": []}
        for sid in ("1", "2", "3", "4", "5"):
            trace_step_running(run, sid)
            trace_step_finished(
                run,
                sid,
                {
                    "step_id": sid,
                    "status": "fail" if sid == "5" else "pass",
                    "summary": "empty",
                },
            )
        record_rollback(run, from_step="5", fix_round=1, reason="no_changed_files")
        for sid in ("5", "6", "7"):
            trace_step_running(run, sid)
            trace_step_finished(
                run, sid, {"step_id": sid, "status": "pass", "summary": "ok"}
            )
        tl = build_display_timeline(run)
        steps = [x for x in tl if x.get("kind") == "step"]
        by_visit = [(s["step_id"], s["implement_attempt"]) for s in steps]
        self.assertEqual(by_visit[:5], [("1", 1), ("2", 1), ("3", 1), ("4", 1), ("5", 1)])
        self.assertEqual(by_visit[5:], [("5", 2), ("6", 1), ("7", 1)])
        roll = [x for x in tl if x.get("kind") == "rollback"][0]
        self.assertIn("写码将进入第 2 轮", roll["title"])
        self.assertIn("各自独立", roll["title"])

    def test_run_summary_rail_keeps_history_then_appends_retry(self):
        """第 8 步打回写码：轨道保留 1…8，再接新的第 5 步（不删 6/7/8）。"""
        from app.dev_pipeline.summary import build_run_summary

        run = {
            "run_id": "dpj-rail",
            "status": "running",
            "current_step": "5",
            "fix_round": 1,
            "implement_attempt": 2,
            "created_at": 1750000000,
            "steps": [
                {
                    "step_id": str(i),
                    "title": "t" + str(i),
                    "status": "pass"
                    if i < 5
                    else ("running" if i == 5 else "pending"),
                }
                for i in range(1, 11)
            ],
            "timeline_trace": [],
        }
        for sid in ("1", "2", "3", "4", "5", "6", "7", "8"):
            trace_step_running(run, sid)
            trace_step_finished(
                run,
                sid,
                {
                    "step_id": sid,
                    "status": "fail" if sid == "8" else "pass",
                    "summary": "x",
                },
            )
        record_rollback(run, from_step="8", fix_round=1, reason="gate_block")
        trace_step_running(run, "5")
        rs = build_run_summary(run)
        rail = rs.get("timeline_flat") or rs.get("timeline") or []
        step_ids = [
            str(x.get("step_id"))
            for x in rail
            if x.get("kind") != "rollback" and x.get("status") != "rollback"
        ]
        # 前 8 步历史仍在
        self.assertEqual(step_ids[:8], list("12345678"), step_ids)
        # 打回后在末尾再接写码
        self.assertEqual(step_ids[8:], ["5"], step_ids)
        self.assertEqual(step_ids.count("5"), 2, step_ids)
        for sid in ("6", "7", "8"):
            self.assertIn(sid, step_ids)
        rollbacks = [
            x
            for x in rail
            if x.get("kind") == "rollback" or x.get("status") == "rollback"
        ]
        self.assertEqual(len(rollbacks), 1)
        self.assertGreaterEqual(len(rs.get("timeline_trace_display") or []), 9)

    def test_resume_same_step_does_not_bump_write_round(self):
        """引擎续跑同一步：不抬写码第 N 轮。"""
        run = {"implement_attempt": 1, "timeline_trace": [], "step_attempts": {}}
        trace_step_running(run, "5", bump=True)
        self.assertEqual(run["implement_attempt"], 1)
        trace_step_running(run, "5", bump=False)
        self.assertEqual(run["implement_attempt"], 1)
        self.assertEqual(run["step_attempts"].get("5"), 1)
        trace_step_running(run, "5", bump=True)
        self.assertEqual(run["implement_attempt"], 2)


if __name__ == "__main__":
    unittest.main()
