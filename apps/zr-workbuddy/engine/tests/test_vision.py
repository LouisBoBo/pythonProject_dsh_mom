"""视觉识图独立引擎：校验 / 落盘 / 配置探测（不打真实 API）。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


def _png_1x1() -> bytes:
    # 最小合法 PNG
    import base64

    return base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )


class VisionEngineTests(unittest.TestCase):
    def test_validate_and_save_upload(self):
        from app.vision import media as vision_media
        from app.vision import store as vision_store

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vision_store.set_data_dir_override(root)
            try:
                raw = _png_1x1()
                check = vision_media.validate_bytes(raw, filename="a.png")
                self.assertTrue(check.get("ok"), check)
                out = vision_store.save_bytes(raw, filename="a.png", purpose="test")
                self.assertTrue(out.get("ok"), out)
                iid = out.get("image_id")
                self.assertTrue(str(iid).startswith("vimg-"))
                loaded = vision_store.load_image(str(iid))
                self.assertTrue(loaded.get("ok"), loaded)
                self.assertEqual(loaded.get("data"), raw)
            finally:
                vision_store.set_data_dir_override(None)

    def test_pending_consume(self):
        from app.vision import store as vision_store

        with tempfile.TemporaryDirectory() as tmp:
            vision_store.set_data_dir_override(Path(tmp))
            try:
                raw = _png_1x1()
                a = vision_store.save_bytes(raw, filename="a.png")
                b = vision_store.save_bytes(raw, filename="b.png")
                sid = "session-ut-vision"
                vision_store.append_pending(sid, [a["image_id"], b["image_id"]])
                listed = vision_store.list_pending(sid)
                self.assertEqual(len(listed.get("image_ids") or []), 2)
                consumed = vision_store.consume_pending(sid)
                self.assertEqual(len(consumed.get("image_ids") or []), 2)
                again = vision_store.list_pending(sid)
                self.assertEqual(again.get("image_ids") or [], [])
            finally:
                vision_store.set_data_dir_override(None)

    def test_understand_requires_config_or_images(self):
        from app.vision import understand

        out = understand([])
        self.assertFalse(out.get("ok"))

    def test_reject_non_image(self):
        from app.vision import media as vision_media

        bad = vision_media.validate_bytes(b"<html>nope</html>", filename="x.png")
        self.assertFalse(bad.get("ok"))

    def test_reject_path_outside_vision(self):
        from app.vision import service as vision_service

        out = vision_service.understand(["/etc/passwd"], purpose="general")
        self.assertFalse(out.get("ok"))
        self.assertIn("vision", str(out.get("detail") or ""))


if __name__ == "__main__":
    unittest.main()
