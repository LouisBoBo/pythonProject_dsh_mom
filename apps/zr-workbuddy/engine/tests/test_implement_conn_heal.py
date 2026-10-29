"""写码轮询：连拒识别 + 自愈重试。"""
from __future__ import annotations

import os
import sys
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ImplementConnHealTests(unittest.TestCase):
    def test_win_10054_and_10061_are_conn_errors(self):
        from app.dev_pipeline.implement import is_conn_refused, is_transient_conn_err

        win54 = "<urlopen error [WinError 10054] 远程主机强迫关闭了一个现有的连接。>"
        win61 = "<urlopen error [WinError 10061] 由于目标计算机积极拒绝，无法连接。>"
        self.assertTrue(is_conn_refused(win54))
        self.assertTrue(is_conn_refused(win61))
        self.assertTrue(is_transient_conn_err(win54))

    def test_poll_heals_sidecar_then_succeeds(self):
        from app.dev_pipeline import implement as impl

        calls = {"get": 0}

        def fake_get(_base, _jid):
            calls["get"] += 1
            if calls["get"] == 1:
                raise OSError(
                    "<urlopen error [WinError 10054] 远程主机强迫关闭了一个现有的连接。>"
                )
            return {"status": "succeeded", "changed_files": ["a.py"]}

        with mock.patch.object(impl, "_ensure_cursor_sidecar", return_value={"ok": True, "fixed": True, "detail": "up"}), mock.patch.object(
            impl.cc, "probe", return_value={"ok": True, "cursor_key_configured": True}
        ), mock.patch.object(
            impl.cc, "create_pending", return_value={"confirm_token": "t"}
        ), mock.patch.object(
            impl.cc, "issue_confirm_nonce", return_value={"nonce": "n"}
        ), mock.patch.object(
            impl.cc, "confirm_start", return_value={"job_id": "ccj-1"}
        ), mock.patch.object(impl.cc, "get_job", side_effect=fake_get), mock.patch.object(
            impl.time, "sleep", return_value=None
        ):
            out = impl.run_implement(
                workspace=r"d:\tmp\ws",
                requirement="做收藏夹",
                log=lambda _m: None,
            )
        self.assertTrue(out.get("ok"), out)
        self.assertEqual(out.get("job_id"), "ccj-1")
        self.assertGreaterEqual(calls["get"], 2)


if __name__ == "__main__":
    unittest.main()
