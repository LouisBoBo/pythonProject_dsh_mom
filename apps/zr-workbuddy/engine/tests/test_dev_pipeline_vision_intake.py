"""dev-pipeline 步骤1：有附图时调用视觉；无图时与改前一致。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


def _png_1x1() -> bytes:
    import base64

    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )


class DevPipelineVisionIntakeTests(unittest.TestCase):
    def test_step1_text_only_unchanged(self):
        from app.dev_pipeline.steps import run_step

        epic: dict = {"artifacts": {}}
        receipt = run_step(
            "run-ut",
            "1",
            message="报表菜单新增停机报表",
            workspace="",
            epic=epic,
            run={},
        )
        self.assertEqual(receipt.get("status"), "pass")
        raw = (epic.get("artifacts") or {}).get("raw_intake") or {}
        self.assertEqual(raw.get("text"), "报表菜单新增停机报表")
        self.assertEqual(raw.get("image_ids") or [], [])
        self.assertFalse(raw.get("vision_text"))

    def test_step1_with_images_calls_vision(self):
        from app.dev_pipeline.steps import run_step
        from app.vision import store as vision_store

        with tempfile.TemporaryDirectory() as tmp:
            vision_store.set_data_dir_override(Path(tmp))
            try:
                saved = vision_store.save_bytes(_png_1x1(), filename="ui.png")
                iid = saved["image_id"]
                epic: dict = {"artifacts": {}, "intake_image_ids": [iid], "message": "看图"}
                fake = {
                    "ok": True,
                    "text": "界面有停机报表按钮",
                    "model": "glm-4v-flash",
                    "images": [],
                }
                with mock.patch(
                    "app.vision.service.understand_image_ids", return_value=fake
                ):
                    receipt = run_step(
                        "run-ut2",
                        "1",
                        message="看图",
                        workspace="",
                        epic=epic,
                        run={"intake_image_ids": [iid]},
                    )
                self.assertEqual(receipt.get("status"), "pass")
                raw = (epic.get("artifacts") or {}).get("raw_intake") or {}
                self.assertIn("停机报表", raw.get("vision_text") or "")
                self.assertIn("识图摘录", epic.get("message") or "")
            finally:
                vision_store.set_data_dir_override(None)

    def test_begin_accepts_image_only_message(self):
        from app.dev_pipeline import begin_run, set_session_integrated_flow
        import app.dev_pipeline.store as dp_store
        from app.vision import store as vision_store

        sid = f"session-img-{uuid.uuid4().hex[:8]}"
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            vision_store.set_data_dir_override(data)
            orig = dp_store.default_data_dir
            dp_store.default_data_dir = lambda: data  # type: ignore[method-assign]
            try:
                set_session_integrated_flow(dsh_session_id=sid, enabled=True)
                saved = vision_store.save_bytes(_png_1x1(), filename="x.png")
                vision_store.append_pending(sid, [saved["image_id"]])
                with mock.patch("app.dev_pipeline.service.start_background"):
                    out = begin_run(
                        message="",
                        dsh_session_id=sid,
                        workspace="",
                    )
                self.assertTrue(out.get("ok"), out)
                self.assertTrue(out.get("run_id"))
                # pending 已消费
                self.assertEqual(vision_store.list_pending(sid).get("image_ids"), [])
            finally:
                dp_store.default_data_dir = orig  # type: ignore[method-assign]
                vision_store.set_data_dir_override(None)

    def test_step1_sandbox_message_prefers_vision(self):
        from app.dev_pipeline.steps import run_step
        from app.vision import store as vision_store

        sandbox = (
            "Current DSH file policy: workspace-write. Approval policy: ask. "
            "The request fails closed."
        )
        with tempfile.TemporaryDirectory() as tmp:
            vision_store.set_data_dir_override(Path(tmp))
            try:
                saved = vision_store.save_bytes(_png_1x1(), filename="r01.png")
                iid = saved["image_id"]
                epic: dict = {
                    "artifacts": {},
                    "intake_image_ids": [iid],
                    "message": sandbox,
                }
                fake = {
                    "ok": True,
                    "text": "1) 界面与元素\n- 收藏夹仍是占位页，常用菜单无法固定入口",
                    "model": "glm-4v-flash",
                    "images": [],
                }
                with mock.patch(
                    "app.vision.service.understand_image_ids", return_value=fake
                ) as mocked:
                    receipt = run_step(
                        "run-sandbox-vision",
                        "1",
                        message=sandbox,
                        workspace="",
                        epic=epic,
                        run={"intake_image_ids": [iid]},
                    )
                    args, kwargs = mocked.call_args
                    prompt = kwargs.get("prompt")
                    if prompt is None and len(args) > 1:
                        prompt = args[1]
                    self.assertNotIn("workspace-write", str(prompt or "").lower())
                self.assertEqual(receipt.get("status"), "pass")
                core = (
                    ((epic.get("artifacts") or {}).get("raw_intake") or {}).get(
                        "requirement_core"
                    )
                    or epic.get("requirement_core")
                    or ""
                )
                self.assertIn("收藏夹", core)
                self.assertNotIn("file policy", (epic.get("message") or "").lower())
            finally:
                vision_store.set_data_dir_override(None)


if __name__ == "__main__":
    unittest.main()
