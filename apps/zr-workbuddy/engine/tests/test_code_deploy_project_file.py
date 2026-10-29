# -*- coding: utf-8 -*-
"""项目内 .workbuddy/deploy.yaml：加载、禁密钥、优先于全局。"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ProjectDeployFileTests(unittest.TestCase):
    def test_find_root_prefers_workbuddy_dir(self) -> None:
        from app.code_deploy.project_file import find_deploy_root

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            nested = root / "src" / "app"
            nested.mkdir(parents=True)
            (root / ".workbuddy").mkdir()
            (root / ".workbuddy" / "deploy.yaml").write_text("version: 1\n", encoding="utf-8")
            self.assertEqual(find_deploy_root(str(nested)), root.resolve())

    def test_find_root_stops_at_vcs_does_not_climb_parent(self) -> None:
        """子仓无 .workbuddy 时不得吃到父目录的部署规则。"""
        from app.code_deploy.project_file import find_deploy_root, load_project_deploy_overlay

        with tempfile.TemporaryDirectory() as tmp:
            parent = Path(tmp)
            child = parent / "child_repo"
            child.mkdir()
            (parent / ".workbuddy").mkdir()
            (parent / ".workbuddy" / "deploy.yaml").write_text(
                "version: 1\nssh:\n  host: parent.bad\n  app_path: /www/parent\n",
                encoding="utf-8",
            )
            (child / ".git").mkdir()
            self.assertEqual(find_deploy_root(str(child)), child.resolve())
            self.assertEqual(load_project_deploy_overlay(str(child)), {})

    def test_reject_key_path_in_committed_yaml(self) -> None:
        from app.code_deploy.project_file import ProjectDeployError, load_project_deploy_overlay

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wb = root / ".workbuddy"
            wb.mkdir()
            (wb / "deploy.yaml").write_text(
                "version: 1\nssh:\n  host: h\n  key_path: /secret/key\n",
                encoding="utf-8",
            )
            with self.assertRaises(ProjectDeployError):
                load_project_deploy_overlay(str(root))

    def test_merge_project_over_base(self) -> None:
        from app.code_deploy.config import CodeDeployConfig, resolve_config_for_workspace

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wb = root / ".workbuddy"
            wb.mkdir()
            (wb / "deploy.yaml").write_text(
                "\n".join(
                    [
                        "version: 1",
                        "preset: vite_backend",
                        "unified_product: false",
                        "ssh:",
                        "  host: 10.0.0.9",
                        "  user: deploy",
                        "  port: 22",
                        "  app_path: /www/app",
                        "entry_url: http://10.0.0.9:8090/",
                        "remote_restart_cmd: systemctl restart app-api",
                        "auto_restart_engine: false",
                        "auto_restart_bridge: false",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            base = CodeDeployConfig(
                enabled=True,
                ssh_host="wrong.example",
                ssh_user="root",
                ssh_app_path="/www/wrong",
                entry_url="http://wrong/",
                ssh_key_path="C:/Users/x/.ssh/id_ed25519",
                unified_product=True,
            )
            cfg = resolve_config_for_workspace(str(root), cfg=base)
            self.assertEqual(cfg.ssh_host, "10.0.0.9")
            self.assertEqual(cfg.ssh_user, "deploy")
            self.assertEqual(cfg.ssh_app_path, "/www/app")
            self.assertEqual(cfg.entry_url, "http://10.0.0.9:8090/")
            self.assertEqual(cfg.health_url, "http://10.0.0.9:8090/")
            self.assertEqual(cfg.remote_restart_cmd, "systemctl restart app-api")
            self.assertFalse(cfg.unified_product)
            self.assertEqual(cfg.deploy_preset, "vite_backend")
            # 有项目规则时全局私钥无效；须写 deploy.local.yaml
            self.assertEqual(cfg.ssh_key_path, "")

    def test_local_yaml_may_set_key_path(self) -> None:
        from app.code_deploy.config import CodeDeployConfig, resolve_config_for_workspace

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wb = root / ".workbuddy"
            wb.mkdir()
            (wb / "deploy.yaml").write_text(
                "version: 1\nssh:\n  host: h1\n  app_path: /a\n",
                encoding="utf-8",
            )
            (wb / "deploy.local.yaml").write_text(
                "version: 1\nssh:\n  key_path: D:/keys/id_ed25519\n  host: h2\n",
                encoding="utf-8",
            )
            base = CodeDeployConfig(enabled=True, ssh_key_path="C:/old")
            cfg = resolve_config_for_workspace(str(root), cfg=base)
            self.assertEqual(cfg.ssh_host, "h2")
            self.assertEqual(cfg.ssh_key_path.replace("\\", "/"), "D:/keys/id_ed25519")

    def test_without_project_file_keeps_base(self) -> None:
        from app.code_deploy.config import CodeDeployConfig, resolve_config_for_workspace

        with tempfile.TemporaryDirectory() as tmp:
            base = CodeDeployConfig(
                enabled=True,
                ssh_host="keep.me",
                ssh_app_path="/www/keep",
            )
            cfg = resolve_config_for_workspace(tmp, cfg=base)
            self.assertEqual(cfg.ssh_host, "keep.me")
            self.assertEqual(cfg.ssh_app_path, "/www/keep")

    def test_availability_points_to_project_rules(self) -> None:
        """配置中心不再开车道；说明指向项目 yaml。"""
        from app.code_deploy.config import availability

        got = availability()
        self.assertTrue(got.get("ok"))
        self.assertTrue(got.get("project_rules"))
        self.assertIn("deploy.yaml", str(got.get("detail") or ""))

    def test_project_file_ignores_global_ssh_key(self) -> None:
        """有项目规则时，WorkBuddy 全局私钥不得顶替；须写 deploy.local.yaml。"""
        from app.code_deploy.config import CodeDeployConfig, resolve_config_for_workspace

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wb = root / ".workbuddy"
            wb.mkdir()
            (wb / "deploy.yaml").write_text(
                "version: 1\nssh:\n  host: h1\n  user: root\n  app_path: /www/app\n",
                encoding="utf-8",
            )
            base = CodeDeployConfig(
                enabled=False,
                ssh_key_path="C:/Users/x/.ssh/global_should_not_apply",
                ssh_host="global.bad",
                ssh_app_path="/www/wrong",
            )
            cfg = resolve_config_for_workspace(str(root), cfg=base)
            self.assertEqual(cfg.ssh_host, "h1")
            self.assertEqual(cfg.ssh_app_path, "/www/app")
            self.assertEqual(cfg.ssh_key_path, "")
            self.assertTrue(cfg.enabled)


if __name__ == "__main__":
    unittest.main()
