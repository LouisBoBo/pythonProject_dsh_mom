# -*- coding: utf-8 -*-
"""get_job 必须解包 {ok, job:{status,…}}，否则流水线轮询永远看不到终态。"""
from __future__ import annotations

import os
import sys
import unittest
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class NormalizeChatBaseTests(unittest.TestCase):
    def test_legacy_18788_remaps_to_18791(self):
        from app.dev_pipeline import cursor_coding_client as cc

        base, note = cc.normalize_chat_base("http://127.0.0.1:18788")
        self.assertEqual(base, "http://127.0.0.1:18791")
        self.assertIn("18788", note)

    def test_empty_defaults(self):
        from app.dev_pipeline import cursor_coding_client as cc

        base, note = cc.normalize_chat_base("")
        self.assertEqual(base, cc.DEFAULT_BASE)
        self.assertEqual(note, "")

    def test_probe_rejects_unknown_cursor_chat_route(self):
        from app.dev_pipeline import cursor_coding_client as cc

        def fake_http(method, url, body=None, timeout=60.0):
            if url.endswith("/api/config"):
                return {"ok": True, "config": {"cursorKeyConfigured": True, "port": 18788}}
            if "pending-latest" in url:
                return {
                    "ok": False,
                    "http_status": 404,
                    "detail": "未知路径 GET /api/cursor-chat/pending-latest",
                }
            return {"ok": False, "detail": "unexpected " + url}

        with mock.patch.object(cc, "_http_json", side_effect=fake_http):
            # 即使传入旧口，normalize 后仍打 18791；此处用 DEFAULT 模拟「服务不是 chat」
            out = cc.probe("http://127.0.0.1:18791")
        self.assertFalse(out.get("ok"))
        self.assertTrue(out.get("wrong_service"))
        self.assertIn("不是对话写码", str(out.get("detail") or ""))


class GetJobUnwrapTests(unittest.TestCase):
    def test_unwraps_nested_job_status_and_files(self):
        from app.dev_pipeline import cursor_coding_client as cc

        payload = {
            "ok": True,
            "job": {
                "id": "cch-test-1",
                "status": "succeeded",
                "changed_files": ["src/a.py", "src/b.py"],
                "synced_files": ["src/a.py", "src/b.py"],
                "detail": "ok",
            },
        }
        with mock.patch.object(cc, "_http_json", return_value=payload):
            job = cc.get_job("http://127.0.0.1:18791", "cch-test-1")
        self.assertEqual(job.get("status"), "succeeded")
        self.assertEqual(job.get("changed_files"), ["src/a.py", "src/b.py"])
        self.assertEqual(job.get("id"), "cch-test-1")
        # 不得把外层包装原样返回（外层无 status）
        self.assertNotIn("job", job)

    def test_flat_job_body_still_works(self):
        from app.dev_pipeline import cursor_coding_client as cc

        payload = {
            "ok": True,
            "id": "cch-flat",
            "status": "running",
            "changed_files": [],
        }
        with mock.patch.object(cc, "_http_json", return_value=payload):
            job = cc.get_job("http://127.0.0.1:18791", "cch-flat")
        self.assertEqual(job.get("status"), "running")
        self.assertEqual(job.get("id"), "cch-flat")

    def test_fills_id_when_nested_omits_it(self):
        from app.dev_pipeline import cursor_coding_client as cc

        payload = {"ok": True, "job": {"status": "failed", "detail": "boom"}}
        with mock.patch.object(cc, "_http_json", return_value=payload):
            job = cc.get_job("http://127.0.0.1:18791", "cch-missing-id")
        self.assertEqual(job.get("id"), "cch-missing-id")
        self.assertEqual(job.get("status"), "failed")

    def test_ok_false_raises(self):
        from app.dev_pipeline import cursor_coding_client as cc

        with mock.patch.object(
            cc, "_http_json", return_value={"ok": False, "detail": "任务不存在"}
        ):
            with self.assertRaises(RuntimeError) as ctx:
                cc.get_job("http://127.0.0.1:18791", "missing")
        self.assertIn("任务不存在", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
