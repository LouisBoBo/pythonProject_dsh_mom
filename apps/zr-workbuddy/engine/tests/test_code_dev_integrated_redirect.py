# -*- coding: utf-8 -*-
"""绿开关开启时 code-dev-pick 不得出 Cursor 确认卡。"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class CodeDevIntegratedRedirectTests(unittest.TestCase):
    def test_pick_blocked_when_session_integrated(self) -> None:
        from app import cli_ops
        from app import plugins_store
        from app.dev_pipeline.session_mode import set_integrated

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            sid = "session-test-integrated-redirect"
            with mock.patch(
                "app.dev_pipeline.store.default_data_dir",
                return_value=data,
            ):
                set_integrated(sid, True, data_dir=data)
                with mock.patch.object(plugins_store, "require_enabled", return_value=None):
                    with mock.patch(
                        "app.code_dev.config.get_config",
                        return_value=mock.Mock(enabled=True),
                    ):
                        with mock.patch(
                            "app.code_dev.config.availability",
                            return_value={"ok": True},
                        ):
                            out = asyncio.run(
                                cli_ops.run_async(
                                    "code-dev-pick",
                                    [
                                        "session=" + sid,
                                        "requirement=销售订单删除下单时间",
                                    ],
                                )
                            )
        self.assertFalse(out.get("ok"), out)
        self.assertEqual(out.get("coding_mode"), "integrated")
        self.assertEqual(out.get("redirect_tool"), "mes_dev_pipeline_begin")
        self.assertFalse(out.get("code_dev_ui"))


if __name__ == "__main__":
    unittest.main()
