"""code_deploy：按插件单元映射单测（不 SSH）。"""
from __future__ import annotations

import os
import sys
import unittest

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class CodeDeployUnitTests(unittest.TestCase):
    def test_decode_git_quoted_chinese_path(self):
        from app.code_deploy.diff_map import _decode_git_path

        raw = (
            '"docs/\\345\\212\\237\\350\\203\\275\\345\\256\\236\\347\\216\\260/'
            'P1-\\350\\207\\252\\345\\212\\250.md"'
        )
        out = _decode_git_path(raw)
        self.assertEqual(out, "docs/功能实现/P1-自动.md")
        self.assertNotIn("345/212", out)
        self.assertEqual(_decode_git_path("apps/zr-workbuddy/engine/app/main.py"), "apps/zr-workbuddy/engine/app/main.py")
        self.assertEqual(_decode_git_path('"../etc/passwd"'), "")
        self.assertEqual(_decode_git_path("a/\0/b"), "")

    def test_map_only_changed_features(self):
        from app.code_deploy.units import map_paths_to_units

        paths = [
            "apps/zr-workbuddy/features/code-commit/index.js",
            "apps/zr-workbuddy/features/code-dev/manifest.json",
            "docs/功能实现/P0-2.md",
        ]
        units = map_paths_to_units(paths)
        ids = [u.id for u in units]
        self.assertEqual(ids, ["feature:code-commit", "feature:code-dev"])
        self.assertTrue(all(u.action == "sync_feature" for u in units))

    def test_engine_and_bridge_ranked_last(self):
        from app.code_deploy.units import map_paths_to_units

        paths = [
            "apps/zr-workbuddy/plugins/mes-bridge/lib/client.js",
            "apps/zr-workbuddy/features/mes-ask/index.js",
            "apps/zr-workbuddy/engine/app/main.py",
        ]
        ids = [u.id for u in map_paths_to_units(paths)]
        self.assertEqual(ids, ["feature:mes-ask", "engine", "bridge"])

    def test_filter_units_by_ids(self):
        from app.code_deploy.units import filter_units_by_ids, map_paths_to_units

        units = map_paths_to_units(
            [
                "apps/zr-workbuddy/features/code-commit/index.js",
                "apps/zr-workbuddy/features/code-dev/index.js",
                "apps/zr-workbuddy/engine/app/cli_ops.py",
            ]
        )
        picked = filter_units_by_ids(units, ["feature:code-commit", "feature:code-dev"])
        self.assertEqual([u.id for u in picked], ["feature:code-commit", "feature:code-dev"])

    def test_intent(self):
        from app.code_deploy.intent import is_code_deploy_question

        self.assertTrue(is_code_deploy_question("部署到预发"))
        self.assertTrue(is_code_deploy_question("发布到 staging"))
        self.assertTrue(is_code_deploy_question("部署上线"))
        self.assertTrue(is_code_deploy_question("增量部署"))
        self.assertTrue(is_code_deploy_question("帮我部署上线"))
        self.assertFalse(is_code_deploy_question("提交代码"))
        self.assertFalse(is_code_deploy_question("部署工单进度"))

    def test_list_catalog_units(self):
        from pathlib import Path

        from app.code_deploy.units import list_catalog_units

        root = Path(_ENG).resolve().parents[2]  # repo root
        units = list_catalog_units(root)
        ids = [u.id for u in units]
        self.assertIn("feature:code-deploy", ids)
        self.assertIn("engine", ids)
        self.assertIn("bridge", ids)
        self.assertIn("scripts", ids)
        self.assertNotIn("workspace", ids)

    def test_generic_repo_catalog_is_empty_until_configured(self):
        """无法识别的仓库不得默认 workspace/Vite 单元。"""
        import tempfile
        from pathlib import Path

        from app.code_deploy.units import list_catalog_units, map_paths_to_units

        td = tempfile.mkdtemp()
        Path(td, "main.py").write_text("print(1)\n", encoding="utf-8")
        Path(td, "scripts").mkdir()
        Path(td, "scripts", "run.sh").write_text("echo ok\n", encoding="utf-8")
        units = list_catalog_units(td)
        self.assertEqual(units, [])
        mapped = map_paths_to_units(["main.py", "scripts/run.sh"], workspace=td)
        self.assertEqual(mapped, [])

    def test_vite_backend_layout(self):
        import tempfile
        from pathlib import Path

        from app.code_deploy.units import is_vite_backend_layout, list_catalog_units

        td = tempfile.mkdtemp()
        Path(td, "frontend").mkdir()
        Path(td, "frontend", "package.json").write_text("{}", encoding="utf-8")
        Path(td, "backend").mkdir()
        self.assertTrue(is_vite_backend_layout(td))
        units = list_catalog_units(td)
        self.assertEqual([u.id for u in units], ["workspace"])
        self.assertEqual(units[0].action, "sync_build_restart")

    def test_collect_local_api_paths_and_discover_parse(self):
        import tempfile
        from pathlib import Path

        from app.code_deploy.ssh_sync import (
            collect_local_api_paths,
            entry_join,
            parse_discovered_services,
        )

        td = tempfile.mkdtemp()
        app = Path(td, "app")
        app.mkdir()
        (app / "routers").mkdir()
        (app / "routers" / "quality.py").write_text(
            'router = APIRouter(prefix="/api/quality", tags=["quality"])\n'
            '@router.get("/inspection-records")\n'
            "def list_records():\n"
            "    return {}\n",
            encoding="utf-8",
        )
        (app / "main.py").write_text(
            '@app.get("/api/health")\n'
            "def health():\n"
            "    return {\"ok\": True}\n",
            encoding="utf-8",
        )
        paths = collect_local_api_paths(td)
        self.assertIn("/api/quality/inspection-records", paths)
        self.assertIn("/api/health", paths)

        units, supers = parse_discovered_services(
            "UNIT:zr-aicoding-api.service\n"
            "UNIT:../../evil.service\n"
            "SUPERVISOR:pcb-graphrag\n"
            "DISCOVER_DONE\n"
        )
        self.assertEqual(units, ["zr-aicoding-api.service"])
        self.assertEqual(supers, ["pcb-graphrag"])
        self.assertEqual(
            entry_join("http://175.178.238.31:8090/", "/api/health"),
            "http://175.178.238.31:8090/api/health",
        )

    def test_remote_restart_cmd_allowlist(self):
        from app.code_deploy.config import validate_remote_restart_cmd

        self.assertEqual(validate_remote_restart_cmd(""), "")
        self.assertEqual(validate_remote_restart_cmd("systemctl restart zr-aicoding-api"), "")
        self.assertEqual(
            validate_remote_restart_cmd("systemctl restart zr-aicoding-api.service"), ""
        )
        self.assertTrue(validate_remote_restart_cmd("systemctl restart foo; rm -rf /"))
        self.assertTrue(validate_remote_restart_cmd("bash -lc 'id'"))
        self.assertTrue(validate_remote_restart_cmd("systemctl restart foo\nreboot"))

    def test_discover_cmd_requires_path_slash(self):
        from app.code_deploy.ssh_sync import _discover_backend_services_cmd

        cmd = _discover_backend_services_cmd("/www/wwwroot/zr-aicoding")
        self.assertIn('"$APP/"', cmd)
        self.assertNotIn('"$APP"', cmd.replace('"$APP/"', ""))

    def test_normalize_mode_first_full(self):
        from app.code_deploy.ops import _normalize_mode

        self.assertEqual(_normalize_mode("auto", first_deploy=True), "full")
        self.assertEqual(_normalize_mode("auto", first_deploy=False), "incremental")
        self.assertEqual(_normalize_mode("full", first_deploy=False), "full")

    def test_policy_first_forces_full(self):
        from app.code_deploy.policy import decide_deploy_mode

        d = decide_deploy_mode(
            last_sha="",
            base_resolved=False,
            paths=[],
            units=[],
        )
        self.assertTrue(d.force_full)
        self.assertEqual(d.mode, "full")
        self.assertFalse(d.allow_upgrade_to_full)
        self.assertFalse(d.recommend_full)

    def test_policy_feature_only_incremental(self):
        from app.code_deploy.policy import decide_deploy_mode
        from app.code_deploy.units import build_unit

        units = [build_unit("feature:code-dev"), build_unit("feature:code-commit")]
        d = decide_deploy_mode(
            last_sha="abc123",
            base_resolved=True,
            paths=[
                "apps/zr-workbuddy/features/code-dev/index.js",
                "apps/zr-workbuddy/features/code-commit/index.js",
            ],
            units=units,
        )
        self.assertEqual(d.mode, "incremental")
        self.assertFalse(d.force_full)
        self.assertTrue(d.allow_upgrade_to_full)

    def test_policy_scripts_force_full(self):
        from app.code_deploy.policy import decide_deploy_mode
        from app.code_deploy.units import build_unit

        units = [build_unit("scripts"), build_unit("engine")]
        d = decide_deploy_mode(
            last_sha="abc123",
            base_resolved=True,
            paths=["scripts/engine.sh", "apps/zr-workbuddy/engine/app/main.py"],
            units=units,
        )
        self.assertTrue(d.force_full)
        self.assertEqual(d.mode, "full")

    def test_policy_binary_no_soft_recommend(self):
        """变更面较大也不再出现「建议全量」中间态，仍为增量（可升级）。"""
        from app.code_deploy.policy import decide_deploy_mode
        from app.code_deploy.units import build_unit

        units = [
            build_unit("feature:a"),
            build_unit("feature:b"),
            build_unit("feature:c"),
            build_unit("engine"),
        ]
        # 4 个单元 < 强制阈值 6 → 增量
        d = decide_deploy_mode(
            last_sha="abc123",
            base_resolved=True,
            paths=["apps/zr-workbuddy/features/a/index.js"],
            units=units,
        )
        self.assertEqual(d.mode, "incremental")
        self.assertFalse(d.force_full)
        self.assertFalse(d.recommend_full)

    def test_policy_override_blocked_when_forced(self):
        from app.code_deploy.policy import apply_user_mode_override, decide_deploy_mode

        d = decide_deploy_mode(last_sha="", base_resolved=False, paths=[], units=[])
        out = apply_user_mode_override(d, "incremental")
        self.assertEqual(out.mode, "full")
        self.assertTrue(out.force_full)

    def test_policy_requirements_not_force_full(self):
        """依赖变更走 engine 单元，不应锁死全仓全量。"""
        from app.code_deploy.policy import decide_deploy_mode
        from app.code_deploy.units import build_unit

        units = [build_unit("engine")]
        d = decide_deploy_mode(
            last_sha="abc123",
            base_resolved=True,
            paths=["apps/zr-workbuddy/engine/requirements.txt"],
            units=units,
            dirty_paths=["apps/zr-workbuddy/engine/requirements.txt"],
        )
        self.assertFalse(d.force_full)
        self.assertEqual(d.mode, "incremental")

    def test_engine_config_example_maps_incremental(self):
        """config.example.yaml 归 engine 单元，不再因未映射强制全量。"""
        from app.code_deploy.policy import decide_deploy_mode
        from app.code_deploy.units import build_unit, map_paths_to_units, path_to_unit_id

        rel = "apps/zr-workbuddy/engine/config/config.example.yaml"
        self.assertEqual(path_to_unit_id(rel), "engine")
        self.assertIsNone(
            path_to_unit_id("apps/zr-workbuddy/engine/config/config.yaml")
        )
        units = map_paths_to_units([rel])
        self.assertEqual([u.id for u in units], ["engine"])
        d = decide_deploy_mode(
            last_sha="abc123",
            base_resolved=True,
            paths=[rel],
            units=units,
        )
        self.assertFalse(d.force_full)
        self.assertEqual(d.mode, "incremental")
        eng = build_unit("engine")
        assert eng is not None
        self.assertIn("apps/zr-workbuddy/engine/config", eng.local_rels)

    def test_policy_engine_bridge_incremental(self):
        from app.code_deploy.policy import decide_deploy_mode
        from app.code_deploy.units import build_unit

        units = [build_unit("engine"), build_unit("bridge")]
        d = decide_deploy_mode(
            last_sha="abc123",
            base_resolved=True,
            paths=[
                "apps/zr-workbuddy/engine/app/main.py",
                "apps/zr-workbuddy/plugins/mes-bridge/lib/client.js",
            ],
            units=units,
        )
        self.assertFalse(d.force_full)
        self.assertEqual(d.mode, "incremental")

    def test_execution_plan_matches_mode(self):
        from app.code_deploy.policy import resolve_confirm_mode, resolve_execution_plan

        full = [{"id": "engine"}, {"id": "bridge"}, {"id": "scripts"}]
        incr = [{"id": "engine"}]
        p_full = resolve_execution_plan(
            mode="full", force_full=True, units_full=full, units_incremental=incr
        )
        self.assertEqual(p_full["mode"], "full")
        self.assertEqual(p_full["unit_ids"], ["engine", "bridge", "scripts"])
        self.assertTrue(p_full["locked"])

        p_incr = resolve_execution_plan(
            mode="incremental", force_full=False, units_full=full, units_incremental=incr
        )
        self.assertEqual(p_incr["mode"], "incremental")
        self.assertEqual(p_incr["unit_ids"], ["engine"])
        self.assertFalse(p_incr["locked"])

        m, err = resolve_confirm_mode(
            job_mode="full", force_full=True, requested_mode="incremental"
        )
        self.assertEqual(m, "full")
        self.assertTrue(err)

        m2, err2 = resolve_confirm_mode(
            job_mode="incremental", force_full=False, requested_mode="full"
        )
        self.assertEqual(m2, "full")
        self.assertFalse(err2)

    def test_filter_unchanged_dirty_paths(self):
        import tempfile
        from pathlib import Path

        from app.code_deploy.diff_map import (
            file_content_fingerprint,
            filter_unchanged_dirty_paths,
        )

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            f = root / "apps" / "zr-workbuddy" / "engine" / "requirements.txt"
            f.parent.mkdir(parents=True)
            f.write_text("fastapi>=0.110\n", encoding="utf-8")
            rel = "apps/zr-workbuddy/engine/requirements.txt"
            fp = file_content_fingerprint(root, rel)
            keep, skipped = filter_unchanged_dirty_paths(root, [rel], {rel: fp})
            self.assertEqual(keep, [])
            self.assertEqual(skipped, [rel])
            keep2, skipped2 = filter_unchanged_dirty_paths(root, [rel], {rel: "other"})
            self.assertEqual(keep2, [rel])
            self.assertEqual(skipped2, [])

    def test_safe_local_path_blocks_escape(self):
        from pathlib import Path

        from app.code_deploy.ssh_sync import _safe_local_path

        root = Path(_ENG).resolve().parents[2]
        self.assertIsNotNone(_safe_local_path(root, "apps/zr-workbuddy/engine/app"))
        self.assertIsNone(_safe_local_path(root, "/etc/passwd"))
        self.assertIsNone(_safe_local_path(root, "../README.md"))

    def test_health_blocks_loopback(self):
        from app.code_deploy.ssh_sync import probe_health

        self.assertFalse(probe_health("http://127.0.0.1:9/").get("ok"))
        self.assertFalse(probe_health("http://localhost/").get("ok"))

    def test_remote_port_ignores_health_url(self):
        """health_url 公网反代口不得覆盖引擎 remote_engine_port。"""
        from app.code_deploy.config import CodeDeployConfig
        from app.code_deploy.ssh_sync import _resolve_remote_port

        cfg = CodeDeployConfig(
            enabled=True,
            health_url="http://203.0.113.10:8093/",
            remote_engine_port=8095,
        )
        self.assertEqual(_resolve_remote_port(cfg), 8095)
        cfg2 = CodeDeployConfig(enabled=True, health_url="", remote_engine_port=8093)
        self.assertEqual(_resolve_remote_port(cfg2), 8095)  # 8093 视为公网入口保留口
        cfg3 = CodeDeployConfig(enabled=True, remote_engine_port=8091)
        self.assertEqual(_resolve_remote_port(cfg3), 8095)  # 旧项目口回落默认

    def test_entry_url_prefers_over_health(self):
        from app.code_deploy.config import CodeDeployConfig

        cfg = CodeDeployConfig(
            entry_url="http://product.example/",
            health_url="http://old.example/",
        )
        self.assertEqual(cfg.resolve_entry_url(), "http://product.example/")
        cfg2 = CodeDeployConfig(entry_url="", health_url="http://only.example/")
        self.assertEqual(cfg2.resolve_entry_url(), "http://only.example/")

    def test_unified_product_default_true(self):
        from app.code_deploy.config import CodeDeployConfig

        cfg = CodeDeployConfig()
        self.assertTrue(cfg.unified_product)
        self.assertTrue(cfg.auto_restart_bridge)
        self.assertEqual(cfg.remote_host_port, 3080)
        self.assertEqual(cfg.remote_engine_port, 8095)

    def test_ssh_key_path_allows_windows_drive(self):
        """Windows 盘符冒号不得被判为非法（曾导致 status 恒失败）。"""
        import tempfile
        from pathlib import Path

        from app.code_deploy.config import CodeDeployConfig, validate_ssh_settings

        home = Path.home()
        with tempfile.NamedTemporaryFile(
            prefix="wb_test_key_", dir=home / ".ssh" if (home / ".ssh").is_dir() else home, delete=False
        ) as tf:
            key_path = Path(tf.name)
        try:
            # 伪造盘符风格路径字符串校验：正则先过；文件存在用真实临时文件测 HOME 约束
            win_style = str(key_path).replace("\\", "/")
            cfg = CodeDeployConfig(
                ssh_host="175.178.238.31",
                ssh_user="root",
                ssh_key_path=win_style,
                ssh_app_path="/www/wwwroot/zr-aicoding",
            )
            errs = validate_ssh_settings(cfg)
            self.assertFalse(
                any("ssh_key_path 非法" in e for e in errs),
                msg=f"unexpected errs={errs}",
            )
            # 明确带 C:/ 的形态不得被正则拒绝（文件可能不存在，只断言不含「非法」字样若路径规范）
            cfg2 = CodeDeployConfig(
                ssh_host="127.0.0.1",
                ssh_user="root",
                ssh_key_path="C:/Users/Yu/.ssh/id_ed25519_workbuddy",
                ssh_app_path="/www/wwwroot/zr-aicoding",
            )
            errs2 = validate_ssh_settings(cfg2)
            self.assertNotIn("ssh_key_path 非法", errs2)
        finally:
            try:
                key_path.unlink(missing_ok=True)
            except OSError:
                pass

    def test_remote_abs_ok_rejects_shallow_and_dotdot(self):
        from app.code_deploy.ssh_sync import _remote_abs_ok

        self.assertTrue(_remote_abs_ok("/www/wwwroot/zr-aicoding"))
        self.assertTrue(_remote_abs_ok("/www/wwwroot/zr-aicoding/backend"))
        self.assertFalse(_remote_abs_ok("/www"))
        self.assertFalse(_remote_abs_ok("/tmp"))
        self.assertFalse(_remote_abs_ok("/www/../etc"))
        self.assertFalse(_remote_abs_ok("relative/path"))
        self.assertFalse(_remote_abs_ok("/www/wwwroot/evil;rm"))

    def test_validate_ssh_rejects_tmp_root(self):
        from app.code_deploy.config import CodeDeployConfig, validate_ssh_settings

        cfg = CodeDeployConfig(
            enabled=True,
            ssh_host="example.com",
            ssh_user="deploy",
            ssh_key_path="~/.ssh/id_ed25519",
            ssh_app_path="/tmp",
        )
        errs = validate_ssh_settings(cfg)
        self.assertTrue(any("过浅" in e or "非法" in e for e in errs))

    def test_force_exclude_covers_secrets(self):
        from app.code_deploy.ssh_sync import _FORCE_EXCLUDE

        for must in (".env", ".venv", "*.db", "config.yaml", "*.pem", "node_modules"):
            self.assertIn(must, _FORCE_EXCLUDE)

    def test_sensitive_local_file_guard(self):
        from pathlib import Path

        from app.code_deploy.ssh_sync import _is_sensitive_local_file

        self.assertTrue(_is_sensitive_local_file(Path("/x/.env")))
        self.assertTrue(_is_sensitive_local_file(Path("/x/erp.db")))
        self.assertTrue(_is_sensitive_local_file(Path("/x/id_ed25519")))
        self.assertFalse(_is_sensitive_local_file(Path("/x/main.py")))

    def test_ssh_key_port_from_argv(self):
        from app.code_deploy.ssh_sync import _ssh_key_port_from_argv

        key, port = _ssh_key_port_from_argv(
            [
                "ssh",
                "-i",
                r"C:\Users\x\.ssh\id_ed25519",
                "-p",
                "22",
                "-o",
                "BatchMode=yes",
                "deploy@host",
            ]
        )
        self.assertEqual(key, r"C:\Users\x\.ssh\id_ed25519")
        self.assertEqual(port, 22)

    def test_tar_archive_members_safe_rejects_traversal(self):
        """tar+scp 上传前须拦 .. / 绝对路径成员（防远端解压逃逸）。"""
        import io
        import tarfile
        import tempfile
        from pathlib import Path

        from app.code_deploy.ssh_sync import _tar_archive_members_safe

        with tempfile.TemporaryDirectory() as td:
            arch = Path(td) / "evil.tar"
            with tarfile.open(arch, "w") as tf:
                info = tarfile.TarInfo(name="../evil.txt")
                data = b"x"
                info.size = len(data)
                tf.addfile(info, io.BytesIO(data))
            msg = _tar_archive_members_safe(arch)
            self.assertTrue(msg, "应拒绝含 .. 的成员")
            self.assertIn("穿越", msg)

            arch2 = Path(td) / "ok.tar"
            with tarfile.open(arch2, "w") as tf:
                info = tarfile.TarInfo(name="./app/main.py")
                data = b"print(1)\n"
                info.size = len(data)
                tf.addfile(info, io.BytesIO(data))
            self.assertEqual(_tar_archive_members_safe(arch2), "")

    def test_ssh_key_path_rejects_dotdot(self):
        from app.code_deploy.config import CodeDeployConfig, validate_ssh_settings

        cfg = CodeDeployConfig(
            enabled=True,
            ssh_host="example.com",
            ssh_user="deploy",
            ssh_key_path=r"C:\Users\x\..\..\Windows\system.ini",
            ssh_app_path="/www/wwwroot/zr-aicoding",
        )
        errs = validate_ssh_settings(cfg)
        self.assertTrue(any("ssh_key_path" in e for e in errs), errs)

    def test_push_dir_without_rsync_uses_tar_file_scp_not_pipe(self):
        """回归 cd-8e13…：无 rsync 时禁止 tar|ssh 管道（Windows Write error）。

        本机打包走 Python tarfile，禁止把 C:\\ 路径交给 Git GNU tar
        （Cannot connect to C: resolve failed）。
        """
        import tempfile
        import unittest.mock as mock
        from pathlib import Path

        from app.code_deploy import ssh_sync as mod

        with tempfile.TemporaryDirectory() as td:
            local = Path(td) / "dist"
            local.mkdir()
            (local / "index.html").write_text("ok", encoding="utf-8")
            key = Path(td) / "id_ed25519"
            key.write_text("dummy", encoding="utf-8")
            ssh = [
                "ssh",
                "-i",
                str(key),
                "-p",
                "22",
                "-o",
                "BatchMode=yes",
                "deploy@example.com",
            ]
            runs: list[list[str]] = []

            def fake_find(*names: str) -> str:
                n0 = names[0] if names else ""
                if n0.startswith("rsync"):
                    return ""
                if n0.startswith("tar"):
                    return "tar.exe"
                if n0.startswith("scp"):
                    return "scp.exe"
                if n0.startswith("ssh"):
                    return "ssh.exe"
                return ""

            def fake_run(cmd, *, timeout=120, cwd=None):  # noqa: ANN001
                runs.append(list(cmd))
                return 0, "", ""

            with mock.patch.object(mod, "_find_bin", side_effect=fake_find), mock.patch.object(
                mod, "_run", side_effect=fake_run
            ):
                code, _out, err = mod._push_dir(
                    local,
                    remote_abs="/www/wwwroot/zr-aicoding/frontend/dist",
                    user="deploy",
                    host="example.com",
                    rsh="ssh",
                    ssh=ssh,
                    excludes=[],
                )
            self.assertEqual(code, 0, err)
            local_gnu_tar = [
                c
                for c in runs
                if c and "tar" in str(c[0]).lower() and ("-cf" in c or str(c[0]).endswith("tar.exe"))
            ]
            self.assertFalse(local_gnu_tar, runs)
            self.assertTrue(any(c and "scp" in str(c[0]).lower() for c in runs), runs)
            self.assertTrue(
                any(
                    len(c) >= 2 and "tar -xf" in str(c[-1]) and "/tmp/wb-push-" in str(c[-1])
                    for c in runs
                ),
                runs,
            )

    def test_write_local_tar_skips_venv_and_does_not_invoke_gnu_tar(self):
        """Windows GNU tar 会把 C:\\ 当主机；本机打包必须走 Python tarfile。"""
        import tarfile
        import tempfile
        import unittest.mock as mock
        from pathlib import Path

        from app.code_deploy import ssh_sync as mod

        with tempfile.TemporaryDirectory() as td:
            root = Path(td) / "app"
            root.mkdir()
            (root / "main.py").write_text("print(1)\n", encoding="utf-8")
            (root / ".venv").mkdir()
            (root / ".venv" / "lib.py").write_text("no", encoding="utf-8")
            (root / "erp.db").write_text("x", encoding="utf-8")
            nested = root / "cfg"
            nested.mkdir()
            (nested / "deploy.local.yaml").write_text("secret", encoding="utf-8")
            arch = Path(td) / "out.tar"
            with mock.patch.object(mod, "_run") as fake_run:
                err = mod._write_local_tar_archive(
                    root,
                    arch,
                    [".venv", "*.db", "**/deploy.local.yaml"],
                )
                fake_run.assert_not_called()
            self.assertEqual(err, "")
            with tarfile.open(arch, "r") as tf:
                names = [n.replace("\\", "/") for n in tf.getnames()]
            self.assertTrue(any(n.endswith("main.py") for n in names), names)
            self.assertFalse(any(".venv" in n.split("/") for n in names), names)
            self.assertFalse(any(n.endswith("erp.db") for n in names), names)
            self.assertFalse(any(n.endswith("deploy.local.yaml") for n in names), names)

    def test_tar_rel_excluded_matches_common_force_pats(self):
        from app.code_deploy.ssh_sync import _tar_rel_excluded

        pats = [".venv", "*.db", "**/deploy.local.yaml", "dist/*.map"]
        self.assertTrue(_tar_rel_excluded(".venv", pats))
        self.assertTrue(_tar_rel_excluded("backend/.venv", pats))
        self.assertTrue(_tar_rel_excluded("app.db", pats))
        self.assertTrue(_tar_rel_excluded("data/app.db", pats))
        self.assertTrue(_tar_rel_excluded(".workbuddy/deploy.local.yaml", pats))
        self.assertTrue(_tar_rel_excluded("dist/chunk.map", pats))
        self.assertFalse(_tar_rel_excluded("main.py", pats))
        self.assertFalse(_tar_rel_excluded("frontend/dist/index.html", pats))


if __name__ == "__main__":
    unittest.main()
