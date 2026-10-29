# -*- coding: utf-8 -*-
"""有进行中的一体化 Run 时，会话开关应读为开（并回写落盘）。"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class SessionModeHealTests(unittest.TestCase):
    def test_mode_path_rejects_traversal(self) -> None:
        from app.dev_pipeline.session_mode import _mode_path, set_integrated

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            modes = data / "dev_pipeline" / "session_modes"
            fp = _mode_path(data, "../../evil-session")
            self.assertTrue(str(fp).startswith(str(modes.resolve())))
            self.assertEqual(fp.parent.resolve(), modes.resolve())
            out = set_integrated("../../evil-session", True, data_dir=data)
            self.assertTrue(out.get("ok"), out)
            self.assertTrue(fp.is_file())
            self.assertFalse((data / "evil-session.json").exists())

    def test_open_run_heals_missing_mode(self) -> None:
        from app.dev_pipeline import store as dp_store
        from app.dev_pipeline.session_mode import get_integrated

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            sid = "session-heal-missing"
            run = {
                "run_id": "dpj-heal001",
                "dsh_session_id": sid,
                "status": "queued",
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
                "steps": [],
            }
            dp_store.save_run(data, run)
            out = get_integrated(sid, data_dir=data)
            self.assertTrue(out.get("ok"), out)
            self.assertTrue(out.get("integrated_flow_enabled"), out)
            mode = data / "dev_pipeline" / "session_modes" / f"{sid}.json"
            self.assertTrue(mode.is_file())
            doc = json.loads(mode.read_text(encoding="utf-8"))
            self.assertTrue(doc.get("integrated_flow_enabled"))

    def test_open_run_heals_false_mode(self) -> None:
        from app.dev_pipeline import store as dp_store
        from app.dev_pipeline.session_mode import get_integrated, set_integrated

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            sid = "session-heal-false"
            set_integrated(sid, False, data_dir=data)
            run = {
                "run_id": "dpj-heal002",
                "dsh_session_id": sid,
                "status": "running",
                "created_at": int(time.time()),
                "updated_at": int(time.time()),
                "steps": [],
            }
            dp_store.save_run(data, run)
            out = get_integrated(sid, data_dir=data)
            self.assertTrue(out.get("integrated_flow_enabled"), out)

    def test_done_run_heals_missing_mode_old_task(self) -> None:
        """旧一体化任务：Run 已结束且无 session_modes 文件时，开关仍应恢复为开。"""
        from app.dev_pipeline import store as dp_store
        from app.dev_pipeline.session_mode import get_integrated

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            sid = "session-heal-done-old"
            run = {
                "run_id": "dpj-heal003",
                "dsh_session_id": sid,
                "status": "done",
                "created_at": int(time.time()) - 100,
                "updated_at": int(time.time()) - 50,
                "steps": [],
            }
            dp_store.save_run(data, run)
            out = get_integrated(sid, data_dir=data)
            self.assertTrue(out.get("ok"), out)
            self.assertTrue(out.get("integrated_flow_enabled"), out)
            self.assertTrue(out.get("healed_from_latest_run"), out)

    def test_explicit_false_keeps_off_when_run_done(self) -> None:
        """用户在旧任务结束后主动关掉：文件为 false 且无进行中 Run → 保持关。"""
        from app.dev_pipeline import store as dp_store
        from app.dev_pipeline.session_mode import get_integrated, set_integrated

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            sid = "session-heal-keep-off"
            set_integrated(sid, False, data_dir=data)
            run = {
                "run_id": "dpj-heal004",
                "dsh_session_id": sid,
                "status": "done",
                "created_at": int(time.time()) - 100,
                "updated_at": int(time.time()) - 50,
                "steps": [],
            }
            dp_store.save_run(data, run)
            out = get_integrated(sid, data_dir=data)
            self.assertFalse(out.get("integrated_flow_enabled"), out)

    def test_force_ordinary_reset_heals_when_has_run(self) -> None:
        """历史 force_ordinary 误伤：有过程流 Run 的会话应恢复为开。"""
        from app.dev_pipeline import store as dp_store
        from app.dev_pipeline.session_mode import get_integrated
        from app.dev_pipeline import session_mode as sm

        with tempfile.TemporaryDirectory() as td:
            data = Path(td)
            sid = "session-heal-force-ordinary"
            fp = sm._mode_path(data, sid)
            fp.parent.mkdir(parents=True, exist_ok=True)
            fp.write_text(
                json.dumps(
                    {
                        "session_id": sid,
                        "integrated_flow_enabled": False,
                        "updated_at": int(time.time()),
                        "reset_reason": "force_ordinary_coding_route_to_zr_cchat",
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            run = {
                "run_id": "dpj-heal005",
                "dsh_session_id": sid,
                "status": "done",
                "created_at": int(time.time()) - 100,
                "updated_at": int(time.time()) - 50,
                "steps": [],
            }
            dp_store.save_run(data, run)
            out = get_integrated(sid, data_dir=data)
            self.assertTrue(out.get("integrated_flow_enabled"), out)
            self.assertTrue(out.get("healed_from_force_ordinary_reset"), out)


if __name__ == "__main__":
    unittest.main()
