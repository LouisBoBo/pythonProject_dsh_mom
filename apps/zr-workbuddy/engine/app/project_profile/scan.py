"""只读扫描工作区，生成项目画像。不调用模型，不改工程文件。"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import time
from pathlib import Path
from typing import Any

_SKIP_DIRS = frozenset(
    {
        "node_modules",
        ".git",
        ".svn",
        "dist",
        "build",
        "bin",
        "obj",
        ".vs",
        ".next",
        ".nuxt",
        ".venv",
        "venv",
        "__pycache__",
        "target",
        "coverage",
        ".idea",
        ".vscode",
        "vendor",
        ".cursor",
    }
)
_MAX_DEPTH = 5
_MAX_NODES = 4000

_FE_DEPS = (
    ("vue", "Vue"),
    ("react", "React"),
    ("next", "Next.js"),
    ("nuxt", "Nuxt"),
    ("@angular/core", "Angular"),
    ("svelte", "Svelte"),
    ("element-plus", "Element Plus"),
    ("ant-design-vue", "Ant Design Vue"),
    ("antd", "Ant Design"),
    ("@mui/material", "MUI"),
    ("tailwindcss", "Tailwind"),
    ("vite", "Vite"),
)
_BE_DEPS = (
    ("fastapi", "FastAPI"),
    ("flask", "Flask"),
    ("django", "Django"),
    ("express", "Express"),
    ("koa", "Koa"),
    ("@nestjs/core", "NestJS"),
)


def _stat_sig(path: Path) -> str:
    try:
        st = path.stat()
    except OSError:
        return ""
    return f"{path.name}:{st.st_size}:{st.st_mtime_ns}"


def input_fingerprint(root: Path) -> str:
    """顶层标记、前两层目录名，或源码类目录第三层目录名变化才重扫。不哈希文件内容。"""
    parts: list[str] = []
    try:
        names = sorted(p.name for p in root.iterdir() if p.name not in {".", ".."})
    except OSError:
        names = []
    parts.append("|".join(names))
    parts.append(_second_level_dir_sig(root))
    for rel in (
        "package.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "package-lock.json",
        "pyproject.toml",
        "requirements.txt",
        "pom.xml",
        "go.mod",
        "README.md",
        "AGENTS.md",
        "frontend/package.json",
        "backend/requirements.txt",
        "backend/pyproject.toml",
        "backend/package.json",
    ):
        parts.append(rel + "=" + _stat_sig(root / rel))
    # .NET：顶层 csproj / sln 变更应触发重扫（不递归，避免拖慢）
    try:
        for child in sorted(root.iterdir(), key=lambda p: p.name.lower()):
            if child.is_file() and child.suffix.lower() in {".csproj", ".sln"}:
                rel = child.name
                parts.append(rel + "=" + _stat_sig(child))
    except OSError:
        pass
    raw = "\n".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:20]


def _read_text(path: Path, limit: int = 200_000) -> str:
    try:
        if not path.is_file() or path.stat().st_size > limit:
            return ""
        # utf-8-sig：.NET 工程常见 BOM，避免 Sdk 解析失败
        return path.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return ""


def _list_top_dotnet_projects(root: Path) -> tuple[list[Path], list[Path]]:
    """只看工作区根：*.csproj / *.sln。不递归，避免误扫子模块。"""
    csprojs: list[Path] = []
    slns: list[Path] = []
    try:
        for child in root.iterdir():
            if not child.is_file():
                continue
            suf = child.suffix.lower()
            if suf == ".csproj":
                csprojs.append(child)
            elif suf == ".sln":
                slns.append(child)
    except OSError:
        return [], []
    return csprojs, slns


def _detect_dotnet(root: Path) -> dict[str, Any] | None:
    """识别 .NET / C# 工程。仅读根目录清单，不执行 dotnet。

    谨慎约定：
    - 有 *.csproj / *.sln 才认
    - 验证默认只用 `dotnet build`（轻量）；未见测试工程时不加 `dotnet test`
    - 不改已识别的前端布局（调用方负责优先级）
    """
    csprojs, slns = _list_top_dotnet_projects(root)
    if not csprojs and not slns:
        return None

    languages = {"C#"}
    backend: list[str] = [".NET"]
    is_web = False
    tfms: list[str] = []
    has_test_proj = False
    primary = csprojs[0] if csprojs else None

    for proj in csprojs:
        name_l = proj.name.lower()
        if name_l.endswith(".tests.csproj") or name_l.endswith(".test.csproj") or ".tests." in name_l:
            has_test_proj = True
        text = _read_text(proj, 120_000)
        low = text.lower()
        if "microsoft.net.sdk.web" in low:
            is_web = True
        if "aspnetcore" in low.replace(" ", "") or "microsoft.aspnetcore" in low:
            is_web = True
        for m in re.finditer(r"<TargetFrameworks?>([^<]+)</TargetFrameworks?>", text, re.I):
            for part in str(m.group(1) or "").split(";"):
                p = part.strip()
                if p and p not in tfms:
                    tfms.append(p)

    if is_web and "ASP.NET Core" not in backend:
        backend.append("ASP.NET Core")
    if tfms:
        # 只记前两个目标框架，避免脏字符串撑爆摘要
        for tfm in tfms[:2]:
            label = f"TFM {tfm}"
            if label not in backend:
                backend.append(label)

    layout = "dotnet_web" if is_web else "dotnet"
    validate: list[dict[str, str]] = [
        {"name": "dotnet-build", "cmd": "dotnet build --nologo -v q", "cwd": "."}
    ]
    if has_test_proj:
        validate.append({"name": "dotnet-test", "cmd": "dotnet test --nologo -v q", "cwd": "."})

    return {
        "languages": languages,
        "backend": backend,
        "layout": layout,
        "validate_commands": validate,
        "build_cmd": "dotnet build --nologo -v q",
        "build_cwd": ".",
        "csproj": [p.name for p in csprojs[:6]],
        "sln": [p.name for p in slns[:4]],
        "primary_csproj": primary.name if primary else "",
        "has_test_proj": has_test_proj,
    }


def _read_json(path: Path) -> dict[str, Any]:
    raw = _read_text(path, 400_000)
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


def _pkg_manager(directory: Path) -> str:
    if (directory / "pnpm-lock.yaml").is_file():
        return "pnpm"
    if (directory / "yarn.lock").is_file():
        return "yarn"
    if (directory / "package-lock.json").is_file():
        return "npm"
    if (directory / "package.json").is_file():
        return "npm"
    return ""


def _deps_of(pkg: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in ("dependencies", "devDependencies", "peerDependencies"):
        block = pkg.get(key)
        if isinstance(block, dict):
            out.update(block)
    return out


def _walk(root: Path):
    seen = 0
    stack: list[tuple[Path, int]] = [(root, 0)]
    while stack:
        cur, depth = stack.pop()
        if depth > _MAX_DEPTH or seen > _MAX_NODES:
            continue
        try:
            children = list(cur.iterdir())
        except OSError:
            continue
        for child in children:
            seen += 1
            if seen > _MAX_NODES:
                return
            name = child.name
            if name in _SKIP_DIRS or name.startswith("."):
                if name in {".git", ".svn"} and depth == 0:
                    yield child, depth
                continue
            yield child, depth
            try:
                if child.is_dir() and depth < _MAX_DEPTH:
                    stack.append((child, depth + 1))
            except OSError:
                continue


def _git_remote(root: Path) -> str:
    if not (root / ".git").exists():
        return ""
    kwargs: dict[str, Any] = {
        "cwd": str(root),
        "capture_output": True,
        "text": True,
        "timeout": 4,
        "stdin": subprocess.DEVNULL,
    }
    if os.name == "nt":
        kwargs["creationflags"] = 0x08000000
    try:
        proc = subprocess.run(["git", "remote", "get-url", "origin"], **kwargs)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if proc.returncode != 0:
        return ""
    return (proc.stdout or "").strip()[:300]


def _excerpt(path: Path, limit: int) -> str:
    text = _read_text(path, limit * 4)
    text = text.strip()
    if len(text) > limit:
        return text[:limit] + "…"
    return text


_DIR_ROLES = {
    "src": "源码",
    "source": "源码",
    "lib": "源码",
    "frontend": "前端",
    "client": "前端",
    "web": "前端",
    "backend": "后端",
    "server": "后端",
    "api": "接口",
    "apis": "接口",
    "controllers": "接口",
    "controller": "接口",
    "routes": "路由",
    "router": "路由",
    "views": "页面",
    "pages": "页面",
    "screens": "页面",
    "components": "组件",
    "layouts": "布局",
    "tests": "测试",
    "test": "测试",
    "__tests__": "测试",
    "docs": "文档",
    "doc": "文档",
    "scripts": "脚本",
    "public": "静态资源",
    "static": "静态资源",
    "assets": "静态资源",
    "config": "配置",
    "configs": "配置",
}
_EXPAND_DIRS = frozenset(
    {"src", "source", "lib", "frontend", "backend", "app", "apps", "server", "client", "web"}
)
_MAX_DIR_ROOTS = 24
_MAX_DIR_CHILDREN = 12
_MAX_DIR_MODULES = 8
_MAX_FINGERPRINT_DIRS = 200


def _dir_role(name: str) -> str:
    return _DIR_ROLES.get(str(name or "").lower(), "")


def _skip_dir_name(name: str) -> bool:
    return (not name) or name in _SKIP_DIRS or name.startswith(".")


def _second_level_dir_sig(root: Path) -> str:
    """前两层目录名，以及源码/前后端下的第三层目录名。新建业务目录会换指纹；不读文件修改时间。"""
    found: list[str] = []

    def _push(token: str) -> bool:
        found.append(token)
        return len(found) >= _MAX_FINGERPRINT_DIRS

    try:
        tops = sorted(
            (p for p in root.iterdir() if p.is_dir() and not _skip_dir_name(p.name)),
            key=lambda p: p.name.lower(),
        )
    except OSError:
        return ""
    for top in tops:
        if _push(top.name):
            break
        try:
            subs = sorted(
                (p for p in top.iterdir() if p.is_dir() and not _skip_dir_name(p.name)),
                key=lambda p: p.name.lower(),
            )
        except OSError:
            continue
        expand = top.name.lower() in _EXPAND_DIRS
        for sub in subs:
            if _push(top.name + "/" + sub.name):
                break
            if not expand:
                continue
            try:
                grands = sorted(
                    (p for p in sub.iterdir() if p.is_dir() and not _skip_dir_name(p.name)),
                    key=lambda p: p.name.lower(),
                )
            except OSError:
                continue
            for grand in grands:
                if _push(top.name + "/" + sub.name + "/" + grand.name):
                    break
            if len(found) >= _MAX_FINGERPRINT_DIRS:
                break
        if len(found) >= _MAX_FINGERPRINT_DIRS:
            break
    return "|".join(found)


def _module_names(directory: Path) -> tuple[list[str], bool]:
    """只收目录名，给宿主判断用户说的模块。不读文件。"""
    try:
        names = sorted(
            (p.name for p in directory.iterdir() if p.is_dir() and not _skip_dir_name(p.name)),
            key=lambda n: n.lower(),
        )
    except OSError:
        return [], False
    truncated = len(names) > _MAX_DIR_MODULES
    return names[:_MAX_DIR_MODULES], truncated


def _child_dirs(directory: Path, parent_rel: str) -> tuple[list[dict[str, Any]], bool]:
    rows: list[dict[str, Any]] = []
    try:
        children = sorted(
            (p for p in directory.iterdir() if p.is_dir() and not _skip_dir_name(p.name)),
            key=lambda p: p.name.lower(),
        )
    except OSError:
        return rows, False
    truncated = len(children) > _MAX_DIR_CHILDREN
    for child in children[:_MAX_DIR_CHILDREN]:
        rel = f"{parent_rel}/{child.name}" if parent_rel else child.name
        row: dict[str, Any] = {"path": rel, "name": child.name, "role": _dir_role(child.name)}
        modules, modules_truncated = _module_names(child)
        if modules:
            row["modules"] = modules
        if modules_truncated:
            row["modules_truncated"] = True
        rows.append(row)
    return rows, truncated


def build_directory_portrait(root: Path) -> dict[str, Any]:
    """顶层目录 + 源码/前后端再展开一层，其下再记模块目录名。不读文件内容。"""
    roots: list[dict[str, Any]] = []
    truncated = False
    try:
        tops = sorted(
            (p for p in root.iterdir() if p.is_dir() and not _skip_dir_name(p.name)),
            key=lambda p: p.name.lower(),
        )
    except OSError:
        return {"roots": [], "truncated": False}
    if len(tops) > _MAX_DIR_ROOTS:
        truncated = True
        tops = tops[:_MAX_DIR_ROOTS]
    for top in tops:
        rel = top.name
        children: list[dict[str, Any]] = []
        children_truncated = False
        if top.name.lower() in _EXPAND_DIRS:
            children, children_truncated = _child_dirs(top, rel)
        row: dict[str, Any] = {
            "path": rel,
            "name": top.name,
            "role": _dir_role(top.name),
            "children": children,
        }
        if children_truncated:
            row["children_truncated"] = True
        roots.append(row)
    return {"roots": roots, "truncated": truncated}


def _safe_directory_portrait(root: Path) -> dict[str, Any]:
    """目录层失败时留空，不让整份画像扫描失败。"""
    try:
        portrait = build_directory_portrait(root)
    except OSError:
        return {"roots": [], "truncated": False}
    if not isinstance(portrait, dict):
        return {"roots": [], "truncated": False}
    roots = portrait.get("roots")
    if not isinstance(roots, list):
        return {"roots": [], "truncated": False}
    return {"roots": roots, "truncated": bool(portrait.get("truncated"))}


def _review_skip_dirs(*, languages: list[str], layout: str) -> list[str]:
    """审码额外跳过目录（写入画像 review.skip_dirs）。"""
    try:
        from ..code_review.profile_scope import skip_dirs_for_languages

        return skip_dirs_for_languages(languages, layout)
    except Exception:  # noqa: BLE001
        return []


def scan_workspace(root: Path) -> dict[str, Any]:
    root = root.resolve()
    languages: set[str] = set()
    suffix_count: dict[str, int] = {}
    view_dirs: list[str] = []
    api_dirs: list[str] = []
    router_files: list[str] = []
    menu_files: list[str] = []
    entry_files: list[str] = []
    sample_pages: list[str] = []
    has_git = (root / ".git").exists()
    has_svn = (root / ".svn").is_dir()

    entry_names = {
        "main.py",
        "app.py",
        "manage.py",
        "server.js",
        "server.ts",
        "main.go",
        "Program.cs",
    }

    for child, depth in _walk(root):
        rel = child.relative_to(root).as_posix()
        try:
            is_dir = child.is_dir()
        except OSError:
            continue
        if is_dir:
            low = child.name.lower()
            if low in {"views", "pages", "screens"} and len(view_dirs) < 6:
                view_dirs.append(rel)
            if low in {"api", "routers", "controllers", "routes"} and len(api_dirs) < 6:
                api_dirs.append(rel)
            continue
        suf = child.suffix.lower()
        if suf:
            suffix_count[suf] = suffix_count.get(suf, 0) + 1
        if child.name in entry_names and len(entry_files) < 8:
            entry_files.append(rel)
        parts = [p.lower() for p in rel.split("/")]
        if suf in {".js", ".ts", ".jsx", ".tsx"} and any(p in {"router", "routes"} for p in parts[:-1]) and len(router_files) < 8:
            router_files.append(rel)
        low_name = child.name.lower()
        if any(k in low_name for k in ("menu", "sidebar", "reportfeatures", "navconfig")) and len(menu_files) < 8:
            menu_files.append(rel)
        if (
            suf in {".vue", ".tsx", ".jsx"}
            and any(p in {"views", "pages", "screens"} for p in parts[:-1])
            and len(sample_pages) < 3
        ):
            sample_pages.append(rel)

    lang_map = {
        ".py": "Python",
        ".js": "JavaScript",
        ".jsx": "JavaScript",
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".vue": "Vue",
        ".go": "Go",
        ".java": "Java",
        ".kt": "Kotlin",
        ".cs": "C#",
        ".rs": "Rust",
        ".php": "PHP",
        ".rb": "Ruby",
    }
    for suf, _n in sorted(suffix_count.items(), key=lambda kv: -kv[1]):
        name = lang_map.get(suf)
        if name and name not in languages:
            languages.add(name)

    pkg_paths = [root / "package.json"]
    fe_root = ""
    be_root = ""
    if (root / "frontend" / "package.json").is_file():
        fe_root = "frontend"
        pkg_paths.append(root / "frontend" / "package.json")
    if (root / "backend").is_dir():
        be_root = "backend"
    frontend_stack: list[str] = []
    backend_stack: list[str] = []
    test_runners: list[str] = []
    scripts_by_dir: list[tuple[str, dict[str, Any], str]] = []
    for pkg_path in pkg_paths:
        pkg = _read_json(pkg_path)
        if not pkg:
            continue
        rel_dir = "." if pkg_path.parent == root else pkg_path.parent.relative_to(root).as_posix()
        deps = _deps_of(pkg)
        for key, label in _FE_DEPS:
            if key in deps and label not in frontend_stack:
                frontend_stack.append(label)
        for key, label in _BE_DEPS:
            if key in deps and label not in backend_stack:
                backend_stack.append(label)
        scripts = pkg.get("scripts") if isinstance(pkg.get("scripts"), dict) else {}
        pm = _pkg_manager(pkg_path.parent)
        scripts_by_dir.append((rel_dir, scripts, pm))
        if "vitest" in deps or "jest" in deps:
            test_runners.append("vitest" if "vitest" in deps else "jest")

    req_files = [root / "requirements.txt", root / "pyproject.toml"]
    if be_root:
        req_files.append(root / be_root / "requirements.txt")
    if any(p.is_file() for p in req_files):
        req = "".join(_read_text(p) for p in req_files)
        low = req.lower()
        if "fastapi" in low and "FastAPI" not in backend_stack:
            backend_stack.append("FastAPI")
        if "flask" in low and "Flask" not in backend_stack:
            backend_stack.append("Flask")
        if "django" in low and "Django" not in backend_stack:
            backend_stack.append("Django")
    if (root / "pom.xml").is_file():
        backend_stack.append("Maven")
        languages.add("Java")
    if (root / "go.mod").is_file():
        backend_stack.append("Go module")
        languages.add("Go")
    if (root / "pytest.ini").is_file() or "pytest" in _read_text(root / "pyproject.toml").lower():
        test_runners.append("pytest")

    # .NET：仅在尚未判成前端/双端布局时参与（避免 Vue+csproj 混仓被盖掉）
    dotnet = _detect_dotnet(root)
    if dotnet:
        languages |= set(dotnet.get("languages") or [])
        for label in dotnet.get("backend") or []:
            if label not in backend_stack:
                backend_stack.append(label)

    layout = "unknown"
    if (root / "apps" / "zr-workbuddy" / "engine").is_dir():
        layout = "workbuddy"
    elif fe_root and be_root:
        layout = "vite_backend" if "Vite" in frontend_stack or (root / fe_root / "vite.config.ts").is_file() or (root / fe_root / "vite.config.js").is_file() else "frontend_backend"
    elif "Next.js" in frontend_stack:
        layout = "next"
    elif "Nuxt" in frontend_stack:
        layout = "nuxt"
    elif frontend_stack and not backend_stack:
        layout = "frontend_only"
    elif (root / "pom.xml").is_file():
        layout = "java_maven"
    elif (root / "go.mod").is_file():
        layout = "go"
    elif dotnet and not frontend_stack:
        # 纯 .NET：勿在已有前端栈时抢布局（混仓交给 mixed）
        layout = str(dotnet.get("layout") or "dotnet")
    elif frontend_stack and backend_stack:
        layout = "mixed"
    elif backend_stack or "Python" in languages:
        layout = "python_app"
    elif (root / "docker-compose.yml").is_file() or (root / "docker-compose.yaml").is_file():
        layout = "docker"

    validate_commands: list[dict[str, str]] = []
    for rel_dir, scripts, pm in scripts_by_dir:
        runner = pm or "npm"
        if "test" in scripts:
            validate_commands.append(
                {"name": f"{runner}-test", "cmd": f"{runner} test", "cwd": rel_dir}
            )
        elif "lint" in scripts:
            validate_commands.append(
                {"name": f"{runner}-lint", "cmd": f"{runner} run lint", "cwd": rel_dir}
            )
    if "pytest" in test_runners:
        cwd = be_root or "."
        validate_commands.append({"name": "pytest", "cmd": "python -m pytest -q", "cwd": cwd})
    if (root / "pom.xml").is_file():
        validate_commands.append({"name": "mvn-test", "cmd": "mvn -q test", "cwd": "."})
    if (root / "go.mod").is_file():
        validate_commands.append({"name": "go-test", "cmd": "go test ./...", "cwd": "."})
    # 仅当还没有 Node/pytest 等验证项时，才补 .NET build（避免混仓重复跑）
    if dotnet and not validate_commands:
        for cmd in dotnet.get("validate_commands") or []:
            if isinstance(cmd, dict) and cmd.get("cmd"):
                validate_commands.append(cmd)

    build_cmd = ""
    build_cwd = fe_root or "."
    for rel_dir, scripts, pm in scripts_by_dir:
        if "build" in scripts and (rel_dir == fe_root or not build_cmd):
            build_cmd = f"{pm or 'npm'} run build"
            build_cwd = rel_dir
    if not build_cmd and dotnet:
        build_cmd = str(dotnet.get("build_cmd") or "")
        build_cwd = str(dotnet.get("build_cwd") or ".")

    gaps: list[str] = []
    if layout == "unknown":
        gaps.append("未能判断部署布局，需在配置里指定如何构建与同步")
    elif layout == "mixed":
        gaps.append("同时识别到前端与后端线索，请确认主交付面后再部署；勿默认套单一布局")
    elif layout in {"dotnet", "dotnet_web"}:
        gaps.append("已识别为 .NET 工程；远端如何部署/重启仍需在配置中确认，勿默认套前端 dist 同步")
    if not validate_commands:
        gaps.append("未发现测试或 lint 脚本，验证步不会自动跑真实用例")
    elif dotnet and not (dotnet.get("has_test_proj")) and any(
        str(c.get("name") or "") == "dotnet-build" for c in validate_commands
    ):
        gaps.append("未见独立测试工程：验证暂用 dotnet build，未自动跑 dotnet test")
    if frontend_stack and not router_files and not view_dirs:
        gaps.append("识别到前端框架，但没有找到路由或页面目录")
    if not (root / "README.md").is_file():
        gaps.append("没有 README，规范只能从代码抽样")
    if not has_git and not has_svn:
        gaps.append("不是 Git / SVN 工作副本，提交与开 PR 需要另配托管")

    vcs_kind = "git" if has_git else "svn" if has_svn else "none"
    summary = _summary_zh(
        layout=layout,
        languages=sorted(languages),
        frontend_stack=frontend_stack,
        backend_stack=backend_stack,
        view_dirs=view_dirs,
        router_files=router_files,
        menu_files=menu_files,
        vcs_kind=vcs_kind,
        validate_commands=validate_commands,
        entry_files=entry_files,
        api_dirs=api_dirs,
        dotnet_projects=(dotnet or {}).get("csproj") if dotnet else None,
    )
    layout_extra: dict[str, Any] = {
        "kind": layout,
        "frontend_root": fe_root,
        "backend_root": be_root,
        "router_files": router_files,
        "view_dirs": view_dirs,
        "api_dirs": api_dirs,
        "menu_files": menu_files,
        "entry_files": entry_files,
    }
    if dotnet:
        layout_extra["dotnet_csproj"] = list(dotnet.get("csproj") or [])
        layout_extra["dotnet_sln"] = list(dotnet.get("sln") or [])

    return {
        "version": 1,
        "workspace": str(root),
        "scanned_at": int(time.time()),
        "fingerprint": input_fingerprint(root),
        "vcs": {"kind": vcs_kind, "remote": _git_remote(root) if has_git else ""},
        "languages": sorted(languages),
        "stack": {
            "frontend": frontend_stack,
            "backend": backend_stack,
            "test": list(dict.fromkeys(test_runners)),
        },
        "layout": layout_extra,
        "validate_commands": validate_commands[:6],
        "deploy": {
            "preset": layout if layout in {
                "workbuddy",
                "vite_backend",
                "frontend_backend",
                "frontend_only",
                "next",
                "nuxt",
                "java_maven",
                "go",
                "dotnet",
                "dotnet_web",
                "python_app",
                "docker",
                "mixed",
                "unknown",
            } else "unknown",
            "build_cwd": build_cwd if build_cmd else "",
            "build_cmd": build_cmd,
            "sync_hint": (
                ["apps/zr-workbuddy"]
                if layout == "workbuddy"
                else ["frontend/dist", "backend"]
                if layout in {"vite_backend", "frontend_backend"}
                else [f"{fe_root or '.'}/dist"]
                if layout in {"frontend_only", "next", "nuxt"} and (build_cmd or fe_root)
                else []
            ),
            "exclude_patterns": [
                "node_modules",
                ".venv",
                "venv",
                ".env",
                ".env.*",
                "*.db",
                "*.sqlite",
                "*.sqlite3",
                ".git",
                "__pycache__",
            ],
        },
        "ui": {
            "sample_pages": sample_pages,
            "style_libs": [x for x in frontend_stack if x in {"Element Plus", "Ant Design Vue", "Ant Design", "MUI", "Tailwind"}],
        },
        "conventions": {
            "readme_excerpt": _excerpt(root / "README.md", 1200),
            "agents_excerpt": _excerpt(root / "AGENTS.md", 800),
        },
        "review": {
            # 审码跳过目录：基线外按语言/布局推断（引擎会再与 SKIP_DIR_NAMES 合并）
            "skip_dirs": _review_skip_dirs(
                languages=sorted(languages),
                layout=layout,
            ),
        },
        "code_suffixes": [s for s, _n in sorted(suffix_count.items(), key=lambda kv: -kv[1])[:12]],
        "gaps": gaps,
        "summary_zh": summary,
        "directory": _safe_directory_portrait(root),
    }


def _summary_zh(
    *,
    layout: str,
    languages: list[str],
    frontend_stack: list[str],
    backend_stack: list[str],
    view_dirs: list[str],
    router_files: list[str],
    menu_files: list[str],
    vcs_kind: str,
    validate_commands: list[dict[str, str]],
    entry_files: list[str] | None = None,
    api_dirs: list[str] | None = None,
    dotnet_projects: list[str] | None = None,
) -> str:
    lines = [
        f"布局：{layout}",
        "语言：" + ("、".join(languages) if languages else "未识别"),
        "前端：" + ("、".join(frontend_stack) if frontend_stack else "未识别"),
        "后端：" + ("、".join(backend_stack) if backend_stack else "未识别"),
        "托管：" + {"git": "Git", "svn": "SVN", "none": "无"}.get(vcs_kind, vcs_kind),
    ]
    if dotnet_projects:
        lines.append("工程文件：" + "、".join(dotnet_projects[:4]))
    if entry_files:
        lines.append("入口：" + "、".join(entry_files[:4]))
    if api_dirs:
        lines.append("接口目录：" + "、".join(api_dirs[:4]))
    if view_dirs:
        lines.append("页面目录：" + "、".join(view_dirs[:4]))
    if router_files:
        lines.append("路由：" + "、".join(router_files[:4]))
    if menu_files:
        lines.append("菜单/导航文件：" + "、".join(menu_files[:4]))
    if validate_commands:
        lines.append(
            "验证："
            + "；".join(f"{c.get('cwd') or '.'} → {c.get('cmd')}" for c in validate_commands[:4])
        )
    if layout in {"dotnet", "dotnet_web"}:
        lines.append("改接口时优先 Controllers / Program.cs 与现有插件约定；不要套用其它仓库的前端页面目录。")
    else:
        lines.append("改页面、挂菜单、写接口时以以上路径为准，不要套用其它仓库的目录。")
    return "\n".join(lines)
