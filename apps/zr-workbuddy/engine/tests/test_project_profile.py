# -*- coding: utf-8 -*-
"""工作区项目画像：扫描、缓存、写码任务可引用。"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

_ENG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ENG not in sys.path:
    sys.path.insert(0, _ENG)


class ProjectProfileTests(unittest.TestCase):
    def setUp(self) -> None:
        self._ws = Path(_ENG) / "data" / "_test_project_profile_ws"
        if self._ws.exists():
            shutil.rmtree(self._ws)
        self._ws.mkdir(parents=True)
        (self._ws / "package.json").write_text(
            """{
  "dependencies": {"vue": "^3.4.0", "element-plus": "^2.0.0"},
  "devDependencies": {"vite": "^5.0.0"},
  "scripts": {"test": "vitest", "build": "vite build"}
}""",
            encoding="utf-8",
        )
        page = self._ws / "src" / "views" / "orders"
        page.mkdir(parents=True)
        (page / "List.vue").write_text("<template><div>orders</div></template>\n", encoding="utf-8")
        router = self._ws / "src" / "router"
        router.mkdir(parents=True)
        (router / "index.ts").write_text("export default []\n", encoding="utf-8")
        (self._ws / "README.md").write_text("订单前端。界面用 Element Plus。\n", encoding="utf-8")
        self._store = tempfile.mkdtemp(prefix="wb-profile-")
        os.environ["WORKBUDDY_PROJECT_PROFILE_DIR"] = self._store

    def tearDown(self) -> None:
        os.environ.pop("WORKBUDDY_PROJECT_PROFILE_DIR", None)
        shutil.rmtree(self._ws, ignore_errors=True)
        shutil.rmtree(self._store, ignore_errors=True)

    def test_ensure_scans_vue_workspace(self) -> None:
        from app.project_profile import ensure, format_for_agent, get_profile

        out = ensure(str(self._ws))
        self.assertTrue(out.get("ok"), out.get("detail"))
        self.assertFalse(out.get("cached"))
        profile = out["profile"]
        self.assertIn("Vue", profile["stack"]["frontend"])
        self.assertIn("Element Plus", profile["ui"]["style_libs"])
        self.assertIn("src/views", profile["layout"]["view_dirs"])
        self.assertTrue(any("List.vue" in p for p in profile["ui"]["sample_pages"]))
        self.assertTrue(any(c.get("cmd") == "npm test" for c in profile["validate_commands"]))
        text = format_for_agent(profile)
        self.assertIn("项目画像", text)
        self.assertIn("src/views", text)

        again = ensure(str(self._ws))
        self.assertTrue(again.get("cached"))
        loaded = get_profile(str(self._ws))
        self.assertTrue(loaded.get("ok"))

    def test_agent_text_keeps_page_dirs_when_summary_is_long(self) -> None:
        from app.project_profile.service import format_for_agent

        text = format_for_agent(
            {
                "summary_zh": "布局：frontend_only\n" + ("摘要" * 2000),
                "layout": {
                    "view_dirs": ["src/views"],
                    "router_files": ["src/router/index.ts"],
                },
                "conventions": {"readme_excerpt": "读我" * 800},
                "ui": {},
                "gaps": ["缺口"],
            }
        )
        self.assertIn("页面目录：src/views", text)
        self.assertIn("src/router/index.ts", text)
        self.assertNotIn("【工作区目录画像】", text)

    def test_reject_empty_path(self) -> None:
        from app.project_profile import ensure

        out = ensure("")
        self.assertFalse(out.get("ok"))
        self.assertIsNone(out.get("profile"))

    def test_ensure_scans_dotnet_web_csproj(self) -> None:
        """纯 .NET Web 插件仓：识别栈与 build，不误加 dotnet test。"""
        from app.project_profile import ensure, format_for_agent

        ws = Path(_ENG) / "data" / "_test_project_profile_dotnet"
        if ws.exists():
            shutil.rmtree(ws)
        ws.mkdir(parents=True)
        try:
            (ws / "Demo.Plugins.App.csproj").write_text(
                """<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
</Project>
""",
                encoding="utf-8",
            )
            (ws / "Demo.Plugins.App.sln").write_text("Microsoft Visual Studio Solution File\n", encoding="utf-8")
            (ws / "Program.cs").write_text("var builder = WebApplication.CreateBuilder(args);\n", encoding="utf-8")
            (ws / "Controllers").mkdir()
            (ws / "Controllers" / "HealthController.cs").write_text(
                "namespace Demo.Controllers;\npublic class HealthController {}\n",
                encoding="utf-8",
            )
            out = ensure(str(ws), force=True)
            self.assertTrue(out.get("ok"), out.get("detail"))
            profile = out["profile"]
            self.assertEqual(profile["layout"]["kind"], "dotnet_web")
            self.assertIn("C#", profile["languages"])
            self.assertIn(".NET", profile["stack"]["backend"])
            self.assertIn("ASP.NET Core", profile["stack"]["backend"])
            self.assertIn("Controllers", profile["layout"]["api_dirs"])
            self.assertTrue(any(c.get("name") == "dotnet-build" for c in profile["validate_commands"]))
            self.assertFalse(any(c.get("name") == "dotnet-test" for c in profile["validate_commands"]))
            self.assertEqual(profile["deploy"]["build_cmd"], "dotnet build --nologo -v q")
            text = format_for_agent(profile)
            self.assertIn("dotnet_web", text)
            self.assertIn("Controllers", text)
            self.assertNotIn("views/warehouse", text)
        finally:
            shutil.rmtree(ws, ignore_errors=True)

    def test_vue_profile_unchanged_when_no_csproj(self) -> None:
        """回归：无 csproj 的 Vue 仓仍走原来的前端识别。"""
        from app.project_profile import ensure

        out = ensure(str(self._ws), force=True)
        self.assertTrue(out.get("ok"), out.get("detail"))
        profile = out["profile"]
        self.assertIn("Vue", profile["stack"]["frontend"])
        self.assertNotEqual(profile["layout"]["kind"], "dotnet_web")
        self.assertTrue(any(c.get("cmd") == "npm test" for c in profile["validate_commands"]))

    def test_directory_portrait_on_ensure_and_second_level_refresh(self) -> None:
        """添加工作区后有目录层；第二层新目录会失效缓存。问数背景仍不带路径。"""
        from app.intent_triage import format_ask_hint
        from app.project_profile import ensure, format_for_agent

        (self._ws / "node_modules" / "left-pad").mkdir(parents=True)
        out = ensure(str(self._ws), force=True)
        self.assertTrue(out.get("ok"), out.get("detail"))
        roots = out["profile"]["directory"]["roots"]
        src = next(r for r in roots if r.get("path") == "src")
        self.assertEqual(src.get("role"), "源码")
        children = {c.get("name"): c for c in src.get("children") or []}
        self.assertEqual(children["views"].get("role"), "页面")
        self.assertIn("orders", children["views"].get("modules") or [])
        self.assertIn("router", children)
        self.assertFalse(any(r.get("name") == "node_modules" for r in roots))
        hint = format_ask_hint(out["profile"])
        self.assertNotIn("src/views", hint)
        self.assertNotIn("orders", hint)
        agent = format_for_agent(out["profile"])
        self.assertNotIn("【工作区目录画像】", agent)
        self.assertIn("src/views", agent)
        from app.project_profile import format_directory_block

        block = format_directory_block(out["profile"])
        self.assertIn("orders", block)
        self.assertNotIn(block, agent)

        self.assertTrue(ensure(str(self._ws)).get("cached"))
        (self._ws / "src" / "views" / "shipping").mkdir()
        shipped = ensure(str(self._ws))
        self.assertFalse(shipped.get("cached"))
        shipped_src = next(r for r in shipped["profile"]["directory"]["roots"] if r.get("path") == "src")
        shipped_views = next(c for c in shipped_src.get("children") or [] if c.get("name") == "views")
        self.assertIn("shipping", shipped_views.get("modules") or [])
        self.assertNotIn("【工作区目录画像】", format_for_agent(shipped["profile"]))
        self.assertTrue(ensure(str(self._ws)).get("cached"))
        for i in range(9):
            (self._ws / "src" / f"area{i}").mkdir()
        again = ensure(str(self._ws))
        self.assertFalse(again.get("cached"))
        names = [
            str(c.get("name") or "")
            for r in again["profile"]["directory"]["roots"]
            if r.get("path") == "src"
            for c in (r.get("children") or [])
        ]
        for i in range(9):
            self.assertIn(f"area{i}", names)
        from app.dev_pipeline.implement_gate import build_stable_implement_requirement

        req = build_stable_implement_requirement(
            message="把按钮改成蓝色 NEEDLE_ORDINARY",
            epic={"artifacts": {}},
            workspace=str(self._ws),
        )
        self.assertIn("NEEDLE_ORDINARY", req)
        self.assertIn("【工作区目录画像】", req)
        self.assertIn("orders", req)
        self.assertIn("shipping", req)
        (self._ws / "README.md").write_text("说明\n" + ("长" * 4000), encoding="utf-8")
        long_req = build_stable_implement_requirement(
            message="把按钮改成蓝色 NEEDLE_ORDINARY",
            epic={"artifacts": {}},
            workspace=str(self._ws),
        )
        self.assertIn("【工作区目录画像】", long_req)
        self.assertIn("orders", long_req)

    def test_directory_portrait_caps_top_level(self) -> None:
        from app.project_profile.scan import build_directory_portrait

        ws = Path(_ENG) / "data" / "_test_project_profile_dirs"
        if ws.exists():
            shutil.rmtree(ws)
        ws.mkdir(parents=True)
        try:
            for i in range(30):
                (ws / f"pkg{i:02d}").mkdir()
            portrait = build_directory_portrait(ws)
            self.assertLessEqual(len(portrait["roots"]), 24)
            self.assertTrue(portrait["truncated"])
            deep_ws = ws / "modcap"
            (deep_ws / "src" / "views").mkdir(parents=True)
            for i in range(20):
                (deep_ws / "src" / "views" / f"mod{i:02d}").mkdir()
            (deep_ws / "src" / "views" / "node_modules").mkdir()
            deep = build_directory_portrait(deep_ws)
            src = next(r for r in deep["roots"] if r.get("name") == "src")
            views = next(c for c in src.get("children") or [] if c.get("name") == "views")
            self.assertLessEqual(len(views.get("modules") or []), 8)
            self.assertTrue(views.get("modules_truncated"))
            self.assertNotIn("node_modules", views.get("modules") or [])
        finally:
            shutil.rmtree(ws, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
