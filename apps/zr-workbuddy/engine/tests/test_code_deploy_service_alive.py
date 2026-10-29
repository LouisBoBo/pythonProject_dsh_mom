"""部署硬约束：不得搞挂服务（快照 / 回滚 / 破窗开关）。"""
from __future__ import annotations

import os
import sys
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class DeployServiceAliveTests(unittest.TestCase):
    def test_must_keep_alive_default_on(self):
        from app.code_deploy import ssh_sync as m

        old = os.environ.pop("WORKBUDDY_ALLOW_DEAD_SERVICE_DEPLOY", None)
        try:
            self.assertTrue(m.must_keep_service_alive())
        finally:
            if old is not None:
                os.environ["WORKBUDDY_ALLOW_DEAD_SERVICE_DEPLOY"] = old

    def test_break_glass_env_disables(self):
        from app.code_deploy import ssh_sync as m

        old = os.environ.get("WORKBUDDY_ALLOW_DEAD_SERVICE_DEPLOY")
        os.environ["WORKBUDDY_ALLOW_DEAD_SERVICE_DEPLOY"] = "1"
        try:
            self.assertFalse(m.must_keep_service_alive())
        finally:
            if old is None:
                os.environ.pop("WORKBUDDY_ALLOW_DEAD_SERVICE_DEPLOY", None)
            else:
                os.environ["WORKBUDDY_ALLOW_DEAD_SERVICE_DEPLOY"] = old

    def test_restore_rejects_non_tmp_archive(self):
        from app.code_deploy import ssh_sync as m

        out = m._remote_restore_pre_deploy_snapshot(
            ["ssh"], "/www/wwwroot/x", "/etc/passwd", log=lambda _m: None
        )
        self.assertFalse(out.get("ok"))
        self.assertIn("无效快照", str(out.get("detail") or ""))

    def test_rollback_marks_deploy_fail_but_service_ok(self):
        from app.code_deploy import ssh_sync as m
        from app.code_deploy.config import CodeDeployConfig

        cfg = CodeDeployConfig(
            enabled=True,
            health_url="http://127.0.0.1:9/",
            entry_url="http://127.0.0.1:9/",
            remote_restart_cmd="systemctl restart zr-aicoding-api",
        )
        urec: dict = {"ok": False, "logs": [], "error": "探活 502"}
        snap = {"ok": True, "empty": False, "archive": "/tmp/wb-deploy-snap-test.tar.gz"}

        with mock.patch.object(
            m,
            "_remote_restore_pre_deploy_snapshot",
            return_value={"ok": True, "detail": "已回滚"},
        ), mock.patch.object(
            m, "_restart_and_verify_backend", return_value=True
        ):
            m._rollback_after_dead_service(
                ["ssh"],
                cfg=cfg,
                app="/www/wwwroot/x",
                backend=mock.Mock(),
                log=lambda _m: None,
                urec=urec,
                snap=snap,
                deploy_err="探活 502",
            )
        self.assertFalse(urec["ok"])
        self.assertEqual(urec.get("reason"), "service_down_rolled_back")
        self.assertTrue((urec.get("rollback") or {}).get("service_ok"))
        self.assertIn("已自动回滚", str(urec.get("error") or ""))


if __name__ == "__main__":
    unittest.main()
