# -*- coding: utf-8 -*-
"""§7 P0：提交按画像/磁盘托管分流 — Git / SVN / 无远端仅本地。"""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


def _git_init(root: Path, branch: str = "feature/demo") -> None:
    subprocess.run(
        ["git", "init", "-b", branch],
        cwd=root,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.email", "t@example.com"],
        cwd=root,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "t"],
        cwd=root,
        check=True,
        capture_output=True,
    )


def _mark_project(root: Path) -> None:
    (root / "package.json").write_text('{"name":"t"}\n', encoding="utf-8")


class ResolveCommitVcsTests(unittest.TestCase):
    def test_profile_kind_when_matches_disk(self):
        from app.code_commit.vcs import resolve_commit_vcs

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".svn").mkdir()
            got = resolve_commit_vcs(
                root,
                profile={"vcs": {"kind": "svn", "remote": "https://svn.example/r"}},
            )
            self.assertEqual(got.get("kind"), "svn")
            self.assertEqual(got.get("source"), "profile")

    def test_disk_wins_on_profile_conflict(self):
        from app.code_commit.vcs import resolve_commit_vcs

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _git_init(root)
            # 画像误标 svn，磁盘只有 git → 信磁盘
            got = resolve_commit_vcs(root, profile={"vcs": {"kind": "svn"}})
            self.assertEqual(got.get("kind"), "git")
            self.assertEqual(got.get("source"), "disk")

    def test_disk_fallback_git_svn_none(self):
        from app.code_commit.vcs import resolve_commit_vcs

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.assertEqual(resolve_commit_vcs(root).get("kind"), "none")
            (root / ".svn").mkdir()
            self.assertEqual(resolve_commit_vcs(root).get("kind"), "svn")
            _git_init(root)
            self.assertEqual(resolve_commit_vcs(root).get("kind"), "git")


class CheckPathVcsTests(unittest.TestCase):
    def test_svn_workspace_ok(self):
        from app.code_commit.ops import check_path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _mark_project(root)
            (root / ".svn").mkdir()
            out = check_path(str(root))
            self.assertTrue(out.get("ok"), out)
            self.assertEqual(out.get("vcs_kind"), "svn")

    def test_no_vcs_fails_clearly(self):
        from app.code_commit.ops import check_path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _mark_project(root)
            out = check_path(str(root))
            self.assertFalse(out.get("ok"))
            detail = out.get("detail") or out.get("reply") or ""
            self.assertTrue(
                "Git" in detail or "SVN" in detail or "托管" in detail,
                out,
            )


class GitNoRemoteLocalOnlyTests(unittest.TestCase):
    def test_prepare_disables_push_without_remote(self):
        from app.code_commit.ops import prepare

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _mark_project(root)
            _git_init(root)
            (root / "a.py").write_text("print(1)\n", encoding="utf-8")
            subprocess.run(
                ["git", "add", "a.py", "package.json"],
                cwd=root,
                check=True,
                capture_output=True,
            )
            subprocess.run(
                ["git", "commit", "-m", "init"],
                cwd=root,
                check=True,
                capture_output=True,
            )
            (root / "b.py").write_text("print(2)\n", encoding="utf-8")
            out = prepare(str(root), files=["b.py"], work_branch="feature/demo")
            self.assertTrue(out.get("ok"), out)
            self.assertFalse(out.get("default_push"))
            self.assertTrue(
                out.get("local_only")
                or "未推送" in (out.get("push_note") or out.get("reply") or "")
            )

    def test_commit_push_without_remote_is_local_success(self):
        from app.code_commit.git_ops import commit_synced_files

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _git_init(root)
            (root / "a.py").write_text("print(1)\n", encoding="utf-8")
            subprocess.run(["git", "add", "a.py"], cwd=root, check=True, capture_output=True)
            subprocess.run(
                ["git", "commit", "-m", "init"],
                cwd=root,
                check=True,
                capture_output=True,
            )
            (root / "b.py").write_text("print(2)\n", encoding="utf-8")
            out = commit_synced_files(
                root,
                ["b.py"],
                message="更新 b.py 单测",
                work_branch="feature/demo",
                push=True,
            )
            self.assertTrue(out.get("ok"), out)
            push = out.get("push") or {}
            self.assertTrue(push.get("ok"), push)
            self.assertTrue(push.get("skipped") or push.get("local_only"), push)
            note = str(push.get("error") or push.get("message") or out.get("message") or "")
            self.assertTrue("未推送" in note or "无远端" in note or "本地" in note, note)


class SvnCommitPathTests(unittest.TestCase):
    def test_prepare_svn_lists_dirty_without_branch(self):
        from app.code_commit import ops

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _mark_project(root)
            (root / ".svn").mkdir()
            (root / "x.py").write_text("x=1\n", encoding="utf-8")
            with mock.patch(
                "app.code_commit.ops.filter_pending_commit_files_for_vcs",
                return_value={
                    "pending_files": ["x.py"],
                    "scope_note": "svn",
                    "pending_source": "svn_dirty",
                },
            ):
                out = ops.prepare(str(root), files=["x.py"])
            self.assertTrue(out.get("ok"), out)
            self.assertEqual(out.get("vcs_kind"), "svn")
            self.assertIn("x.py", out.get("pending_files") or [])
            self.assertFalse(out.get("need_user_branch"))

    def test_confirm_dispatches_svn_commit(self):
        from app.code_commit import ops

        job = {
            "id": "job-svn-1",
            "status": "awaiting_commit",
            "workspace": "/tmp/ws",
            "files": ["a.py"],
            "work_branch": "",
            "default_push": False,
            "draft_message": "修复登录校验",
            "vcs_kind": "svn",
            "gate": {"can_commit": True},
            "findings": [],
        }
        with mock.patch("app.code_commit.ops.load_job", return_value=job), mock.patch(
            "app.code_commit.ops.claim_job_for_commit", return_value=True
        ), mock.patch(
            "app.code_commit.ops.run_commit_review_gate",
            return_value={"can_commit": True, "findings": [], "summary": "ok"},
        ), mock.patch(
            "app.code_commit.ops.commit_svn_files",
            return_value={
                "ok": True,
                "skipped": False,
                "error": "",
                "revision": "42",
                "files": ["a.py"],
                "message": "已 svn commit（r42）",
            },
        ) as svn_commit, mock.patch(
            "app.code_commit.ops.update_job"
        ):
            out = ops.confirm("job-svn-1", message="修复登录校验", push=False)
        self.assertTrue(out.get("ok"), out)
        svn_commit.assert_called_once()
        blob = (out.get("reply") or "") + str(out.get("commit_result") or "")
        self.assertIn("svn", blob.lower())


if __name__ == "__main__":
    unittest.main()
