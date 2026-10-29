"""裁掉安装包里不需要的测试/文档/source map（加快 Windows NSIS 解压）。"""

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

import prune_pack_junk


class PrunePackJunkTests(unittest.TestCase):
    def test_drops_tests_maps_md_keeps_runtime_and_npm_test_pkg(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pkg = root / "pkg"
            (pkg / "tests").mkdir(parents=True)
            (pkg / "tests" / "test_x.py").write_text("drop", encoding="utf-8")
            (pkg / "testing").mkdir()
            (pkg / "testing" / "api.py").write_text("keep-testing", encoding="utf-8")
            (pkg / "mod.py").write_text("keep-mod", encoding="utf-8")
            (pkg / "mod.py.map").write_text("drop-map", encoding="utf-8")
            (pkg / "README.md").write_text("drop-md", encoding="utf-8")
            npm_test = root / "node_modules" / "test"
            npm_test.mkdir(parents=True)
            (npm_test / "index.js").write_text("keep-npm-test", encoding="utf-8")
            n, b = prune_pack_junk.prune_pack_junk(root)
            self.assertGreater(n, 0)
            self.assertGreater(b, 0)
            self.assertFalse((pkg / "tests").exists())
            self.assertFalse((pkg / "mod.py.map").exists())
            self.assertFalse((pkg / "README.md").exists())
            self.assertEqual((pkg / "mod.py").read_text(encoding="utf-8"), "keep-mod")
            self.assertEqual((pkg / "testing" / "api.py").read_text(encoding="utf-8"), "keep-testing")
            self.assertEqual((npm_test / "index.js").read_text(encoding="utf-8"), "keep-npm-test")

    def test_drops_declarations_tsconfig_and_nonlegal_docs_keeps_license(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            pkg = root / "pkg"
            pkg.mkdir(parents=True)
            # 类型声明 / TS 配置 / 编译缓存：应删
            (pkg / "index.d.ts").write_text("drop", encoding="utf-8")
            (pkg / "index.d.mts").write_text("drop", encoding="utf-8")
            (pkg / "types.d.cts").write_text("drop", encoding="utf-8")
            (pkg / "tsconfig.json").write_text("drop", encoding="utf-8")
            (pkg / "tsconfig.build.json").write_text("drop", encoding="utf-8")
            (pkg / "jsconfig.json").write_text("drop", encoding="utf-8")
            (pkg / "pkg.tsbuildinfo").write_text("drop", encoding="utf-8")
            # 非法律文档：应删（含无扩展名与 .txt/.rst）
            (pkg / "CHANGELOG").write_text("drop", encoding="utf-8")
            (pkg / "changelog.txt").write_text("drop", encoding="utf-8")
            (pkg / "HISTORY.rst").write_text("drop", encoding="utf-8")
            (pkg / "CONTRIBUTING").write_text("drop", encoding="utf-8")
            # 法律文件：必须保留（合规）
            (pkg / "LICENSE").write_text("keep-license", encoding="utf-8")
            (pkg / "LICENSE.txt").write_text("keep-license-txt", encoding="utf-8")
            (pkg / "NOTICE").write_text("keep-notice", encoding="utf-8")
            (pkg / "COPYING").write_text("keep-copying", encoding="utf-8")
            # 运行时代码：必须保留（含同名但带 .js 的 history.js）
            (pkg / "index.js").write_text("keep-js", encoding="utf-8")
            (pkg / "history.js").write_text("keep-history-js", encoding="utf-8")
            (pkg / "package.json").write_text("keep-pkgjson", encoding="utf-8")
            (pkg / "config.json").write_text("keep-configjson", encoding="utf-8")

            prune_pack_junk.prune_pack_junk(root)

            for gone in ("index.d.ts", "index.d.mts", "types.d.cts", "tsconfig.json",
                         "tsconfig.build.json", "jsconfig.json", "pkg.tsbuildinfo",
                         "CHANGELOG", "changelog.txt", "HISTORY.rst", "CONTRIBUTING"):
                self.assertFalse((pkg / gone).exists(), f"{gone} 应被删除")
            for keep in ("LICENSE", "LICENSE.txt", "NOTICE", "COPYING",
                         "index.js", "history.js", "package.json", "config.json"):
                self.assertTrue((pkg / keep).exists(), f"{keep} 应保留")

    def test_root_include_libs_dropped_but_nested_kept(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            # 根级 include/libs（python 开发文件）：应删
            (root / "include").mkdir()
            (root / "include" / "Python.h").write_text("drop", encoding="utf-8")
            (root / "libs").mkdir()
            (root / "libs" / "python311.lib").write_text("drop", encoding="utf-8")
            # 嵌套的 include（某 npm 包内部）：必须保留
            nested = root / "node_modules" / "foo" / "include"
            nested.mkdir(parents=True)
            (nested / "api.h").write_text("keep-nested", encoding="utf-8")

            prune_pack_junk.prune_pack_junk(root)

            self.assertFalse((root / "include").exists())
            self.assertFalse((root / "libs").exists())
            self.assertEqual((nested / "api.h").read_text(encoding="utf-8"), "keep-nested")

    def test_prune_dsh_unused_provider_sdks(self):
        with tempfile.TemporaryDirectory() as td:
            nm = (
                Path(td) / "host" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules"
            )
            # 待删的厂商 SDK
            for pkg in ("@mistralai/mistralai", "@anthropic-ai/sdk", "@aws-sdk/client-bedrock-runtime",
                        "@smithy/core", "@aws-crypto/util"):
                d = nm / pkg
                d.mkdir(parents=True)
                (d / "index.js").write_text("drop", encoding="utf-8")
            # 必须保留：openai（DeepSeek 所用）、@opentelemetry（dsh 遥测）、pi-ai provider 模块
            keep_openai = nm / "openai"
            keep_openai.mkdir(parents=True)
            (keep_openai / "index.js").write_text("keep-openai", encoding="utf-8")
            keep_otel = nm / "@opentelemetry" / "api"
            keep_otel.mkdir(parents=True)
            (keep_otel / "index.js").write_text("keep-otel", encoding="utf-8")
            keep_piai = nm / "@earendil-works" / "pi-ai" / "dist" / "providers"
            keep_piai.mkdir(parents=True)
            (keep_piai / "mistral.js").write_text("keep-piai-provider", encoding="utf-8")

            n, b = prune_pack_junk.prune_dsh_unused_provider_sdks(Path(td) / "host")

            self.assertGreater(n, 0)
            for gone in ("@mistralai", "@anthropic-ai", "@aws-sdk", "@smithy", "@aws-crypto"):
                self.assertFalse((nm / gone).exists(), f"{gone} 应被删除")
            self.assertTrue((keep_openai / "index.js").exists(), "openai 必须保留（DeepSeek 用）")
            self.assertTrue((keep_otel / "index.js").exists(), "@opentelemetry 必须保留（dsh 遥测）")
            self.assertTrue((keep_piai / "mistral.js").exists(), "pi-ai provider 模块必须保留")

    def test_prune_deferred_native_keeps_js_entry(self):
        with tempfile.TemporaryDirectory() as td:
            nm = (
                Path(td) / "host" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules"
            )
            native = nm / "@deepseek-ai" / "libreoffice-kit-win32-x64"
            native.mkdir(parents=True)
            (native / "soffice.exe").write_bytes(b"x" * 32)
            js = nm / "@deepseek-ai" / "libreoffice-kit"
            js.mkdir(parents=True)
            (js / "package.json").write_text("{}", encoding="utf-8")
            speech = nm / "sherpa-onnx-win-x64"
            speech.mkdir(parents=True)
            (speech / "model.onnx").write_bytes(b"m" * 16)
            wrapper = nm / "sherpa-onnx-node"
            wrapper.mkdir(parents=True)
            (wrapper / "package.json").write_text("{}", encoding="utf-8")

            n, b = prune_pack_junk.prune_dsh_deferred_native_runtimes(Path(td) / "host")

            self.assertGreater(n, 0)
            self.assertGreater(b, 0)
            self.assertFalse(native.exists())
            self.assertFalse(speech.exists())
            self.assertTrue((js / "package.json").exists())
            self.assertTrue((wrapper / "package.json").exists())

    def test_prune_dsh_unused_provider_sdks_missing_host(self):
        n, b = prune_pack_junk.prune_dsh_unused_provider_sdks(
            Path(tempfile.gettempdir()) / "wb-no-such-host"
        )
        self.assertEqual((n, b), (0, 0))

    def test_keeps_builtin_user_manual_md(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            manual = (
                root
                / "apps"
                / "zr-workbuddy"
                / "config"
                / "builtin-knowledge"
                / "用户操作手册.md"
            )
            manual.parent.mkdir(parents=True)
            manual.write_text("keep-manual", encoding="utf-8")
            readme = root / "apps" / "zr-workbuddy" / "README.md"
            readme.write_text("drop-md", encoding="utf-8")
            n, _b = prune_pack_junk.prune_pack_junk(root)
            self.assertGreater(n, 0)
            self.assertEqual(manual.read_text(encoding="utf-8"), "keep-manual")
            self.assertFalse(readme.exists())

    def test_missing_root_is_zero(self):
        n, b = prune_pack_junk.prune_pack_junk(Path(tempfile.gettempdir()) / "wb-no-such-dir")
        self.assertEqual((n, b), (0, 0))

    def test_doc_dir_with_code_is_kept(self):
        """npm 包 dist/doc/ 可能是运行时代码（yaml 包 Document API），禁止误删。

        事故 2026-09-22：0.2.27 一体包 yaml/dist/doc 被当文档裁掉，
        宿主启动报 Cannot find module '../doc/directives.js'（fatal load failure）。
        """
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            yaml_doc = root / "node_modules" / "yaml" / "dist" / "doc"
            yaml_doc.mkdir(parents=True)
            (yaml_doc / "directives.js").write_text("keep-code", encoding="utf-8")
            (yaml_doc / "README.md").write_text("drop-md", encoding="utf-8")
            pure_docs = root / "node_modules" / "some-pkg" / "docs"
            pure_docs.mkdir(parents=True)
            (pure_docs / "guide.md").write_text("drop-guide", encoding="utf-8")
            (pure_docs / "logo.png").write_text("drop-png", encoding="utf-8")
            n, _b = prune_pack_junk.prune_pack_junk(root)
            self.assertGreater(n, 0)
            self.assertEqual(
                (yaml_doc / "directives.js").read_text(encoding="utf-8"), "keep-code"
            )
            self.assertFalse((yaml_doc / "README.md").exists())
            self.assertFalse(pure_docs.exists())


    def test_embedded_python_drops_tcl_keeps_matplotlib_fonts(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "tcl" / "tzdata").mkdir(parents=True)
            (root / "tcl" / "tzdata" / "GMT").write_text("drop", encoding="utf-8")
            lib = root / "Lib"
            (lib / "idlelib").mkdir(parents=True)
            (lib / "idlelib" / "idle.py").write_text("drop", encoding="utf-8")
            (lib / "tkinter").mkdir()
            (lib / "tkinter" / "__init__.py").write_text("drop", encoding="utf-8")
            fonts = lib / "site-packages" / "matplotlib" / "mpl-data" / "fonts"
            fonts.mkdir(parents=True)
            (fonts / "DejaVuSans.ttf").write_text("keep-font", encoding="utf-8")
            sample = lib / "site-packages" / "matplotlib" / "mpl-data" / "sample_data"
            sample.mkdir(parents=True)
            (sample / "demo.csv").write_text("drop", encoding="utf-8")
            f2py = lib / "site-packages" / "numpy" / "f2py"
            f2py.mkdir(parents=True)
            (f2py / "f2py2e.py").write_text("drop", encoding="utf-8")
            (lib / "site-packages" / "numpy" / "__init__.py").parent.mkdir(parents=True, exist_ok=True)
            (lib / "site-packages" / "numpy" / "__init__.py").write_text("keep-numpy", encoding="utf-8")
            n, b = prune_pack_junk.prune_embedded_python_extras(root)
            self.assertGreater(n, 0)
            self.assertGreater(b, 0)
            self.assertFalse((root / "tcl").exists())
            self.assertFalse((lib / "idlelib").exists())
            self.assertFalse((lib / "tkinter").exists())
            self.assertFalse(sample.exists())
            self.assertFalse(f2py.exists())
            self.assertEqual((fonts / "DejaVuSans.ttf").read_text(encoding="utf-8"), "keep-font")
            self.assertEqual(
                (lib / "site-packages" / "numpy" / "__init__.py").read_text(encoding="utf-8"),
                "keep-numpy",
            )


if __name__ == "__main__":
    unittest.main()
