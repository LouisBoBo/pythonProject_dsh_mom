# -*- coding: utf-8 -*-
import unittest

from upload_desktop_feed import parse_artifact_version, pick_versions_to_delete, validate_remote_dir


class UploadDesktopFeedTests(unittest.TestCase):
    def test_parse_artifact_version(self) -> None:
        self.assertEqual(parse_artifact_version("MOM-0.2.65.exe"), "0.2.65")
        self.assertEqual(parse_artifact_version("MOM-0.2.65.zip"), "0.2.65")
        self.assertEqual(parse_artifact_version("Mom-x-0.2.40.exe"), "0.2.40")
        self.assertEqual(parse_artifact_version("Mom-x-0.2.39.zip"), "0.2.39")
        self.assertEqual(parse_artifact_version("ZR WorkBuddy-0.2.40.exe"), "0.2.40")
        self.assertIsNone(parse_artifact_version("latest-windows.json"))
        self.assertIsNone(parse_artifact_version("index.html"))

    def test_pick_versions_to_delete_keep_2(self) -> None:
        names = [
            "Mom-x-0.2.38.exe",
            "Mom-x-0.2.39.exe",
            "Mom-x-0.2.40.exe",
            "latest-windows.json",
            "Mom-x-0.2.38.exe.blockmap",
        ]
        doomed = pick_versions_to_delete(names, keep=2)
        self.assertIn("Mom-x-0.2.38.exe", doomed)
        self.assertIn("Mom-x-0.2.38.exe.blockmap", doomed)
        self.assertNotIn("Mom-x-0.2.39.exe", doomed)
        self.assertNotIn("Mom-x-0.2.40.exe", doomed)
        self.assertNotIn("latest-windows.json", doomed)

    def test_pick_versions_mixed_legacy(self) -> None:
        names = ["ZR WorkBuddy-0.2.39.exe", "Mom-x-0.2.40.exe"]
        doomed = pick_versions_to_delete(names, keep=1)
        self.assertEqual(doomed, ["ZR WorkBuddy-0.2.39.exe", "ZR WorkBuddy-0.2.39.exe.blockmap"])

    def test_validate_remote_dir_rejects_injection(self) -> None:
        with self.assertRaises(SystemExit):
            validate_remote_dir("/tmp/x; rm -rf /")
        with self.assertRaises(SystemExit):
            validate_remote_dir("../etc")
        with self.assertRaises(SystemExit):
            validate_remote_dir("/www/../../etc")
        with self.assertRaises(SystemExit):
            validate_remote_dir("relative/path")


if __name__ == "__main__":
    unittest.main()
