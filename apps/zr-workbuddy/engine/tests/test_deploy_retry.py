# -*- coding: utf-8 -*-
"""部署瞬时失败重试：npm build 管道崩溃 + 整趟 deploy 最多 3 次。"""
from __future__ import annotations

import os
import sys
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class NpmBuildTransientTests(unittest.TestCase):
    def test_uv_handle_closing_is_transient(self) -> None:
        from app.code_deploy.ssh_sync import is_transient_npm_build_failure

        err = "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\\win\\async.c, line 94"
        self.assertTrue(is_transient_npm_build_failure(1, "", err))
        self.assertTrue(is_transient_npm_build_failure(3221225477, "", ""))

    def test_syntax_error_not_transient(self) -> None:
        from app.code_deploy.ssh_sync import is_transient_npm_build_failure

        err = "error during build:\nSyntaxError: Unexpected token"
        self.assertFalse(is_transient_npm_build_failure(1, "", err))
        self.assertFalse(
            is_transient_npm_build_failure(1, "", "[vite]: Rollup failed to resolve import")
        )

    def test_run_npm_build_retries_transient(self) -> None:
        import tempfile
        from pathlib import Path

        from app.code_deploy import ssh_sync as mod

        calls = {"n": 0}

        def fake_run(cmd, **kwargs):
            calls["n"] += 1
            stdout = kwargs.get("stdout")
            stderr = kwargs.get("stderr")
            if calls["n"] < 3:
                if stderr:
                    stderr.write(
                        b"Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), "
                        b"file src\\win\\async.c, line 94\n"
                    )
                return mock.Mock(returncode=1)
            if stdout:
                stdout.write(b"built\n")
            return mock.Mock(returncode=0)

        with tempfile.TemporaryDirectory() as td:
            fe = Path(td) / "frontend"
            fe.mkdir()
            logs: list[str] = []
            with mock.patch.object(mod.subprocess, "run", side_effect=fake_run):
                code, out, err, used = mod._run_npm_build(
                    ["node", "npm-cli.js"],
                    fe,
                    timeout=30,
                    max_attempts=3,
                    log=logs.append,
                )
            self.assertEqual(code, 0)
            self.assertEqual(used, 3)
            self.assertEqual(calls["n"], 3)
            self.assertTrue(any("重试" in x for x in logs))


class DeployAttemptTests(unittest.TestCase):
    def test_retryable_classifier(self) -> None:
        from app.dev_pipeline.lane_exec import _is_retryable_deploy_failure

        self.assertTrue(
            _is_retryable_deploy_failure(
                "单元 workspace 失败：Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
            )
        )
        self.assertTrue(_is_retryable_deploy_failure("探活 502，已回滚"))
        self.assertFalse(_is_retryable_deploy_failure("workspace 为空，无法部署"))
        self.assertFalse(
            _is_retryable_deploy_failure("error during build:\nSyntaxError: bad")
        )
        # 硬约束回滚成功文案含「恢复探活」，禁止当成瞬时再推坏包
        self.assertFalse(
            _is_retryable_deploy_failure(
                "硬约束：新版本导致服务不可用，已自动回滚到部署前版本并恢复探活。"
                " 原错误：探活失败"
            )
        )
        self.assertFalse(
            _is_retryable_deploy_failure(
                "探活失败 硬约束：自动回滚失败（ssh error），服务可能仍挂，需运维介入。"
            )
        )

    def test_run_deploy_retries_then_succeeds(self) -> None:
        from app.dev_pipeline import lane_exec as le

        n = {"prep": 0, "confirm": 0}

        def prep(ws, mode="auto"):
            n["prep"] += 1
            return {"ok": True, "can_deploy": True, "job_id": f"cd-try-{n['prep']}"}

        def confirm(job_id, decision="approve"):
            n["confirm"] += 1
            if n["confirm"] < 2:
                return {
                    "ok": False,
                    "detail": "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)",
                }
            return {"ok": True, "reply": "部署完成", "deploy_result": {"ok": True}}

        with mock.patch("app.dev_pipeline.config.get_config", return_value={"max_deploy_attempts": 3}):
            with mock.patch("app.code_deploy.ops.prepare", side_effect=prep):
                with mock.patch("app.code_deploy.ops.confirm", side_effect=confirm):
                    out = le.run_deploy(workspace=r"D:\tmp\proj", log=None)
        self.assertTrue(out.get("ok"), out)
        self.assertEqual(out.get("attempts"), 2)
        self.assertEqual(n["confirm"], 2)

    def test_run_deploy_hard_fail_no_retry(self) -> None:
        from app.dev_pipeline import lane_exec as le

        n = {"confirm": 0}

        def prep(ws, mode="auto"):
            return {"ok": True, "can_deploy": True, "job_id": "cd-x"}

        def confirm(job_id, decision="approve"):
            n["confirm"] += 1
            return {
                "ok": False,
                "detail": "error during build:\nSyntaxError: Unexpected token",
            }

        with mock.patch("app.dev_pipeline.config.get_config", return_value={"max_deploy_attempts": 3}):
            with mock.patch("app.code_deploy.ops.prepare", side_effect=prep):
                with mock.patch("app.code_deploy.ops.confirm", side_effect=confirm):
                    out = le.run_deploy(workspace=r"D:\tmp\proj", log=None)
        self.assertFalse(out.get("ok"), out)
        self.assertEqual(n["confirm"], 1)
        self.assertEqual(out.get("attempts"), 1)

    def test_max_deploy_attempts_hard_capped(self) -> None:
        from app.dev_pipeline import config as dp_cfg

        with mock.patch(
            "app.dev_pipeline.config.load_config",
            return_value={"dev_pipeline": {"max_deploy_attempts": 99}},
        ):
            self.assertEqual(dp_cfg.get_config()["max_deploy_attempts"], 3)

    def test_zero_unit_incremental_is_success(self) -> None:
        """已有部署基线且增量 0 单元：算跳过成功，不是假失败。"""
        from app.dev_pipeline import lane_exec as le

        def prep(ws, mode="auto"):
            return {
                "ok": True,
                "can_deploy": False,
                "job_id": "cd-empty",
                "mode": "incremental",
                "first_deploy": False,
                "last_deploy_sha": "abc123",
                "execution": {"unit_ids": []},
                "reply": "请点上方确认卡（增量 · staging · 0 个单元）。",
                "detail": "请点上方确认卡（增量 · staging · 0 个单元）。",
            }

        with mock.patch("app.dev_pipeline.config.get_config", return_value={"max_deploy_attempts": 3}):
            with mock.patch("app.code_deploy.ops.prepare", side_effect=prep):
                with mock.patch("app.code_deploy.ops.confirm") as conf:
                    out = le.run_deploy(workspace=r"D:\tmp\proj", log=None)
        self.assertTrue(out.get("ok"), out)
        self.assertTrue(out.get("skipped"), out)
        self.assertEqual(out.get("reason"), "nothing_to_deploy")
        self.assertFalse(conf.called)


if __name__ == "__main__":
    unittest.main()
