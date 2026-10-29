#!/usr/bin/env python3
"""WorkBuddy 预装 @zhongruan/dsh-knowledge：allowBuilds + cordis 关回写 + profile 接线。

版本策略（换思路 · 2026-09-27）：
  - 公司 npm latest → 解压到 $DSH_HOME/workbuddy-packs/dsh-knowledge（WorkBuddy 托管）
  - profile dependencies 用 link:../../workbuddy-packs/dsh-knowledge
  - node_modules 做 junction/symlink 指向该目录
  - **不再**把 registry 版号写进 package.json / 与 pnpm 抢锁
    （此前直装 node_modules 后，宿主启动 pnpm 总会按旧锁打回 1.0.4）

环境变量：
  WORKBUDDY_KB_PKG / WORKBUDDY_KB_VERSION / ZHONGRUAN_NPM_REGISTRY
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

_LIB = Path(__file__).resolve().parent
if str(_LIB) not in sys.path:
    sys.path.insert(0, str(_LIB))

from align_dsh_tools import link_dir, remove_link_or_move  # noqa: E402


def _assert_safe_npm_name(name: str) -> None:
    """禁止路径穿越式包名（防 tarball 落盘逃出目标目录）。"""
    n = str(name or "").strip()
    if not n or ".." in n or "\\" in n or "\x00" in n or n.startswith("/"):
        raise RuntimeError(f"非法 npm 包名: {name!r}")
    if n.startswith("@"):
        if not re.match(r"^@[A-Za-z0-9._~+-]+/[A-Za-z0-9._~+-]+$", n):
            raise RuntimeError(f"非法 scoped 包名: {name!r}")
    elif not re.match(r"^[A-Za-z0-9._~+-]+$", n):
        raise RuntimeError(f"非法 npm 包名: {name!r}")


def _safe_extract_tar(tf: tarfile.TarFile, dest: Path) -> None:
    """解压到 dest；拒绝绝对路径 / .. 成员（防恶意 tarball）。"""
    dest = dest.resolve()
    dest.mkdir(parents=True, exist_ok=True)
    # Python 3.12+ filter='data'；旧版手工校验成员名
    try:
        tf.extractall(dest, filter="data")  # type: ignore[call-arg]
        return
    except TypeError:
        pass
    for m in tf.getmembers():
        name = str(m.name or "").replace("\\", "/")
        if not name or name.startswith("/") or ".." in name.split("/"):
            raise RuntimeError(f"tarball 含非法路径成员: {m.name!r}")
        if m.issym() or m.islnk():
            # 跳过链接成员，避免链接逃逸
            continue
        target = (dest / name).resolve()
        try:
            target.relative_to(dest)
        except ValueError as exc:
            raise RuntimeError(f"tarball 成员逃出解压目录: {m.name!r}") from exc
    # 仍不提取 symlink/hardlink
    members = [m for m in tf.getmembers() if not m.issym() and not m.islnk()]
    tf.extractall(dest, members=members)


KB_PKG = os.environ.get("WORKBUDDY_KB_PKG", "@zhongruan/dsh-knowledge").strip() or "@zhongruan/dsh-knowledge"
KB_ID = "knowledge"
COMPANY_NPM = os.environ.get(
    "ZHONGRUAN_NPM_REGISTRY", "http://175.178.238.31/dsh-plugins/npm"
).rstrip("/")
KB_VERSION = "latest"
PACK_DIRNAME = "dsh-knowledge"
LINK_REL = "../../workbuddy-packs/dsh-knowledge"


def _env_kb_pin() -> str:
    return os.environ.get("WORKBUDDY_KB_VERSION", "").strip()


LEGACY_KB_PKGS = (
    "@lemoncat7/dsh-knowledge",
    "dsh-knowledge-base",
)

ALLOW_BUILDS = {
    "esbuild": True,
    "onnxruntime-node": True,
    "protobufjs": True,
    "sharp": True,
    "tesseract.js": False,
}

# pnpm 11：新发版未满 minimumReleaseAge 时装/卸会 ERR_PNPM_RESOLUTION_POLICY_VIOLATIONS_UNHANDLED
# （DSH 卸包未接回调）。公司市场包必须进 exclude，避免「卸一个插件 → 宿主整页挂」。
RELEASE_AGE_EXCLUDE = (
    "dshmarket",
    "@zhongruan/*",
)

# 托管知识库 ESM 硬依赖；pnpm prune / 卸其它插件后易丢 junction → :3081 崩
KB_PEER_DEPS = (
    "@deepseek-ai/schemastery",
    "@deepseek-ai/cordis",
    "@deepseek-ai/cosmokit",
    "mammoth",
    "marked",
    "pdfjs-dist",
    "yaml",
)
# 缺任意一项拒绝启动（与 schemastery 同级）
KB_PEER_REQUIRED = (
    "@deepseek-ai/schemastery",
    "mammoth",
    "marked",
    "pdfjs-dist",
    "yaml",
)

KNOWLEDGE_CONFIG_BLOCK = f"""# --- {KB_ID} (WorkBuddy 预装知识库；默认关回写) ---
- id: {KB_ID}
  name: '{KB_PKG}'
  config:
    backend: local
    databasePath: !!js dshHomePath('knowledge/knowledge.sqlite')
    connectionPath: !!js dshHomePath('knowledge/connection.json')
    exposeApi: false
    exposeWeb: true
    extractionEnabled: false
    workbuddyCompanyCite: true
"""

_KNOWLEDGE_BLOCK_RE = re.compile(
    rf"(?ms)^(?:# --- {re.escape(KB_ID)}[^\n]*\n)*- id:\s*{KB_ID}\s*\n"
    rf"(?:  name:\s*[^\n]+\n)?  config:\s*\n(?:    [^\n]+\n)*"
)


def _knowledge_config_ok(src: str) -> bool:
    matches = list(_KNOWLEDGE_BLOCK_RE.finditer(src))
    if len(matches) != 1:
        return False
    block = matches[0].group(0)
    return (
        re.search(rf"(?m)^\s+name:\s*['\"]?{re.escape(KB_PKG)}['\"]?\s*$", block) is not None
        and "databasePath:" in block
        and "connectionPath:" in block
        and re.search(r"(?m)^\s+extractionEnabled:\s*false\s*$", block) is not None
        and re.search(r"(?m)^\s+workbuddyCompanyCite:\s*true\s*$", block) is not None
    )


def _ensure_allow_builds(workspace: Path) -> str:
    notes: list[str] = []
    if not workspace.is_file():
        text = (
            "packages:\n  - .\n\n"
            "nodeLinker: hoisted\n"
            "autoInstallPeers: false\n"
            "allowBuilds:\n"
        )
        for k, v in ALLOW_BUILDS.items():
            text += f"  {k}: {'true' if v else 'false'}\n"
        text += "\nminimumReleaseAgeExclude:\n"
        for item in RELEASE_AGE_EXCLUDE:
            # @scope/* 必须加引号，否则 pnpm 解析 workspace YAML 报 bad indentation
            text += f"  - '{item}'\n"
        workspace.write_text(text, encoding="utf-8")
        notes.append("已创建 pnpm-workspace.yaml（含 allowBuilds + releaseAgeExclude）")
        return "；".join(notes)

    src = workspace.read_text(encoding="utf-8")
    if re.search(r"(?m)^allowBuilds:\s*$", src):
        missing = []
        for key, val in ALLOW_BUILDS.items():
            if re.search(rf"(?m)^\s+{re.escape(key)}\s*:", src):
                continue
            missing.append((key, val))
        if not missing:
            notes.append("allowBuilds 已齐全")
        else:
            lines = src.splitlines(keepends=True)
            out: list[str] = []
            inserted = False
            for line in lines:
                out.append(line)
                if not inserted and re.match(r"^allowBuilds:\s*$", line):
                    for key, val in missing:
                        out.append(f"  {key}: {'true' if val else 'false'}\n")
                    inserted = True
            workspace.write_text("".join(out), encoding="utf-8")
            notes.append(f"已补 allowBuilds: {', '.join(k for k, _ in missing)}")
            src = workspace.read_text(encoding="utf-8")
    else:
        block = "allowBuilds:\n" + "".join(
            f"  {k}: {'true' if v else 'false'}\n" for k, v in ALLOW_BUILDS.items()
        )
        workspace.write_text(src.rstrip() + "\n\n" + block, encoding="utf-8")
        notes.append("已追加 allowBuilds 块")
        src = workspace.read_text(encoding="utf-8")

    notes.append(_ensure_release_age_exclude(workspace))
    return "；".join(notes)


def _ensure_release_age_exclude(workspace: Path) -> str:
    """保证 company 包装卸不踩 pnpm 11 resolution-policy 未处理回调。"""
    if not workspace.is_file():
        return "无 pnpm-workspace.yaml，跳过 releaseAgeExclude"
    src = workspace.read_text(encoding="utf-8")
    def _yaml_exclude_item(item: str) -> str:
        return f"'{item}'" if item.startswith("@") or "*" in item else item

    if not re.search(r"(?m)^minimumReleaseAgeExclude:\s*$", src):
        block = "minimumReleaseAgeExclude:\n" + "".join(
            f"  - {_yaml_exclude_item(x)}\n" for x in RELEASE_AGE_EXCLUDE
        )
        workspace.write_text(src.rstrip() + "\n\n" + block, encoding="utf-8")
        return "已追加 minimumReleaseAgeExclude（@zhongruan/* + dshmarket）"

    missing = [x for x in RELEASE_AGE_EXCLUDE if x not in src]
    # @zhongruan/* 可能被写成单包条目；只要有通配或我们写入的行即可
    if "@zhongruan/*" not in src and not re.search(r"(?m)^\s+-\s+'?@zhongruan/", src):
        missing.append("@zhongruan/*")
    missing = list(dict.fromkeys(missing))
    # 已有未加引号的 @zhongruan/* 时就地改引号，避免 pnpm add 再炸
    if re.search(r"(?m)^\s+-\s+@zhongruan/\*\s*$", src):
        src2 = re.sub(r"(?m)^(\s+-\s+)@zhongruan/\*\s*$", r"\1'@zhongruan/*'", src)
        if src2 != src:
            workspace.write_text(src2, encoding="utf-8")
            src = src2
            notes_quote = "已为 @zhongruan/* 补 YAML 引号"
        else:
            notes_quote = ""
    else:
        notes_quote = ""
    if not missing:
        return notes_quote or "minimumReleaseAgeExclude 已含公司包"
    lines = src.splitlines(keepends=True)
    out: list[str] = []
    inserted = False
    for line in lines:
        out.append(line)
        if not inserted and re.match(r"^minimumReleaseAgeExclude:\s*$", line):
            for item in missing:
                out.append(f"  - {_yaml_exclude_item(item)}\n")
            inserted = True
    workspace.write_text("".join(out), encoding="utf-8")
    msg = f"已补 minimumReleaseAgeExclude: {', '.join(missing)}"
    return f"{notes_quote}；{msg}" if notes_quote else msg


def _knowledge_block_preserve_company_api(existing: str, template: str) -> str:
    """升级/补齐 knowledge 块时保留中央库 exposeApi + apiToken（禁止默默关掉公司共享旁路）。"""
    out = template
    if re.search(r"(?m)^\s+exposeApi:\s*true\s*$", existing):
        out = re.sub(r"(?m)^(\s+exposeApi:\s*)false(\s*)$", r"\1true\2", out, count=1)
    m_tok = re.search(r'(?m)^\s+apiToken:\s*("([^"]*)"|\'([^\']*)\'|(\S+))\s*$', existing)
    if m_tok:
        raw = m_tok.group(1).strip()
        if "apiToken:" not in out:
            out = re.sub(
                r"(?m)^(\s+exposeApi:\s*\S+\s*)$",
                rf"\1\n    apiToken: {raw}",
                out,
                count=1,
            )
        else:
            out = re.sub(r"(?m)^(\s+apiToken:\s*).*$", rf"\1{raw}", out, count=1)
    m_pref = re.search(r"(?m)^\s+apiPrefix:\s*(\S+)\s*$", existing)
    if m_pref:
        pref = m_pref.group(1).strip()
        if "apiPrefix:" not in out:
            out = re.sub(
                r"(?m)^(\s+apiToken:\s*.*\s*)$",
                rf"\1\n    apiPrefix: {pref}",
                out,
                count=1,
            )
            if "apiPrefix:" not in out:
                out = re.sub(
                    r"(?m)^(\s+exposeApi:\s*\S+\s*)$",
                    rf"\1\n    apiPrefix: {pref}",
                    out,
                    count=1,
                )
        else:
            out = re.sub(r"(?m)^(\s+apiPrefix:\s*).*$", rf"\1{pref}", out, count=1)
    return out


def _ensure_cordis_patch(patch: Path) -> str:
    if not patch.is_file():
        return f"跳过 cordis：缺少 {patch}"

    src = patch.read_text(encoding="utf-8")
    block = KNOWLEDGE_CONFIG_BLOCK.rstrip() + "\n"

    if _knowledge_config_ok(src):
        return "knowledge 配置已就绪（含 name/databasePath，关回写）"

    matches = list(_KNOWLEDGE_BLOCK_RE.finditer(src))
    if matches:
        preserved = _knowledge_block_preserve_company_api(matches[0].group(0), block)
        new_src = _KNOWLEDGE_BLOCK_RE.sub("", src)
        new_src = re.sub(r"\n{3,}", "\n\n", new_src).rstrip() + "\n\n" + preserved
        patch.write_text(new_src if new_src.endswith("\n") else new_src + "\n", encoding="utf-8")
        return "已修复 knowledge 配置（去重并补齐 name/databasePath；保留公司 exposeApi/token）"

    stripped = src.rstrip() + "\n"
    if re.search(r"(?m)^\[\]\s*$", stripped):
        stripped = re.sub(r"(?m)^\[\]\s*$", block.rstrip(), stripped)
    else:
        stripped = stripped.rstrip() + "\n\n" + block

    patch.write_text(stripped if stripped.endswith("\n") else stripped + "\n", encoding="utf-8")
    return "已写入 knowledge.extractionEnabled: false"


def dsh_home_of(profile: Path) -> Path:
    """profiles/web → ~/.dsh"""
    profile = profile.expanduser().resolve()
    if profile.parent.name == "profiles":
        return profile.parent.parent
    return profile.parent


def pack_dir(profile: Path) -> Path:
    return dsh_home_of(profile) / "workbuddy-packs" / PACK_DIRNAME


def link_dep_spec() -> str:
    return f"link:{LINK_REL}"


def _node_modules_pkg_json(profile: Path, pkg_name: str) -> Path:
    return profile.joinpath("node_modules", *pkg_name.split("/"))


def _fetch_npm_meta() -> dict:
    meta_url = f"{COMPANY_NPM}/@zhongruan%2Fdsh-knowledge"
    req = urllib.request.Request(meta_url, headers={"User-Agent": "WorkBuddy-kb-ensure/1.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return json.loads(resp.read().decode("utf-8"))


def resolve_kb_version(*, pin: str | None = None) -> str:
    explicit = (pin if pin is not None else _env_kb_pin()).strip()
    if explicit and explicit != "latest":
        return explicit
    try:
        meta = _fetch_npm_meta()
        latest = str((meta.get("dist-tags") or {}).get("latest") or "").strip()
        if latest:
            return latest
    except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError, ValueError):
        pass
    if explicit == "latest":
        return "latest"
    raise RuntimeError(f"无法解析 {KB_PKG} 目标版本（设 WORKBUDDY_KB_VERSION 或检查公司 npm）")


def dep_spec_tracking() -> str:
    return link_dep_spec()


def dep_spec_for(_want: str) -> str:
    return link_dep_spec()


def package_installed(profile: Path, pkg_name: str | None = None) -> bool:
    name = pkg_name or KB_PKG
    if name == KB_PKG:
        return (pack_dir(profile) / "package.json").is_file() or _node_modules_pkg_json(
            profile, name
        ).is_file()
    return _node_modules_pkg_json(profile, name).is_file()


def installed_version(profile: Path, pkg_name: str | None = None) -> str | None:
    name = pkg_name or KB_PKG
    candidates = []
    if name == KB_PKG:
        candidates.append(pack_dir(profile) / "package.json")
    candidates.append(_node_modules_pkg_json(profile, name))
    for pj in candidates:
        if not pj.is_file():
            continue
        try:
            ver = json.loads(pj.read_text(encoding="utf-8")).get("version")
        except (OSError, json.JSONDecodeError):
            continue
        if ver:
            return str(ver).strip()
    return None


def _parse_ver(text: str) -> tuple[int, ...]:
    nums = re.findall(r"\d+", str(text).split("-", 1)[0])
    return tuple(int(x) for x in nums[:4]) if nums else (0,)


def version_older(have: str, want: str) -> bool:
    return _parse_ver(have) < _parse_ver(want)


def _npm_dist_for(version: str) -> tuple[str, str, str]:
    meta = _fetch_npm_meta()
    vers = meta.get("versions") or {}
    want = (version or "").strip()
    if want not in vers:
        want = str((meta.get("dist-tags") or {}).get("latest") or want)
    dist = (vers.get(want) or {}).get("dist") or {}
    tarball = str(dist.get("tarball") or "")
    integrity = str(dist.get("integrity") or "")
    if not tarball:
        raise RuntimeError(f"公司 npm 无 {KB_PKG}@{want} tarball")
    return want, tarball, integrity


def materialize_pack(profile: Path, *, version: str | None = None) -> tuple[str, str]:
    """下载 tarball 到 workbuddy-packs（返回 want, note）。"""
    want, tarball, _integrity = _npm_dist_for((version or "").strip() or resolve_kb_version())
    dest = pack_dir(profile)
    with tempfile.TemporaryDirectory(prefix="wb-kb-") as td:
        tgz = Path(td) / f"dsh-knowledge-{want}.tgz"
        with urllib.request.urlopen(
            urllib.request.Request(tarball, headers={"User-Agent": "WorkBuddy-kb-ensure/1.0"}),
            timeout=120,
        ) as resp:
            tgz.write_bytes(resp.read())
        staging = Path(td) / "pkg"
        staging.mkdir()
        with tarfile.open(tgz, "r:gz") as tf:
            _safe_extract_tar(tf, staging)
        pkg = staging / "package"
        if not (pkg / "package.json").is_file():
            raise RuntimeError("tarball 结构异常")
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            shutil.rmtree(dest)
        shutil.move(str(pkg), str(dest))
    return want, f"已落地托管包 {KB_PKG}@{want} → {dest}"


def _peer_search_roots(profile: Path) -> list[Path]:
    """peer 候选：profile → 全局 dsh 发行版（Node realpath 后找不到 profile 树）。"""
    roots = [profile / "node_modules"]
    try:
        import shutil as _sh

        dsh_bin = _sh.which("dsh") or _sh.which("dsh.cmd")
        if dsh_bin:
            # .../npm/dsh.cmd → .../npm/node_modules/@deepseek-ai/dsh/node_modules
            npm_root = Path(dsh_bin).resolve().parent
            for cand in (
                npm_root / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules",
                npm_root.parent / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules",
            ):
                if cand.is_dir() and cand not in roots:
                    roots.append(cand)
    except OSError:
        pass
    # 常见 Windows 全局路径兜底
    roaming = Path(os.environ.get("APPDATA", "")) / "npm" / "node_modules" / "@deepseek-ai" / "dsh" / "node_modules"
    if roaming.is_dir() and roaming not in roots:
        roots.append(roaming)
    return roots


def _resolve_peer_src(name: str, roots: list[Path]) -> Path | None:
    for root in roots:
        src = root.joinpath(*name.split("/"))
        if _peer_pkg_ok(src):
            return src
    return None


def _force_remove_path(path: Path) -> None:
    """去掉目录/junction/坏环（exists() 对自环可能为 False，仍须 rmdir）。"""
    try:
        remove_link_or_move(path)
    except OSError:
        pass
    if not (path.exists() or path.is_symlink() or _path_is_reparse(path)):
        # Windows：自环 junction 上 exists/is_symlink 常假，仍占名
        try:
            path.rmdir()
        except OSError:
            pass
        try:
            path.unlink(missing_ok=True)  # type: ignore[call-arg]
        except TypeError:
            try:
                if path.is_symlink():
                    path.unlink()
            except OSError:
                pass
        except OSError:
            pass
    if path.exists() or path.is_symlink() or _path_is_reparse(path):
        # 最后一招：cmd rmdir（只删 junction 本身）
        try:
            import subprocess

            subprocess.run(
                ["cmd.exe", "/c", "rmdir", str(path)],
                capture_output=True,
                text=True,
                encoding="oem",
                errors="replace",
                timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired):
            pass


def _path_is_reparse(path: Path) -> bool:
    try:
        if path.is_symlink():
            return True
        st = path.lstat()
        attrs = getattr(st, "st_file_attributes", 0)
        import stat as _stat

        return bool(attrs & _stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except OSError:
        return False


def _is_under(child: Path, root: Path) -> bool:
    try:
        child.resolve().relative_to(root.resolve())
        return True
    except (OSError, ValueError):
        return False


def _pkg_dep_names(pkg_dir: Path) -> list[str]:
    pj = pkg_dir / "package.json"
    if not pj.is_file():
        return []
    try:
        deps = json.loads(pj.read_text(encoding="utf-8")).get("dependencies") or {}
    except (OSError, json.JSONDecodeError, TypeError):
        return []
    return [str(n) for n in deps.keys()]


def _mammoth_missing_runtime_deps(mammoth: Path) -> list[str]:
    """mammoth 直接依赖 + 一层传递依赖必须在 mammoth/node_modules 内。

    托管包在 profile 外面，Node 不会向上找到 profile/node_modules。
    只接 underscore 时，base64-js / lop→option 等仍会让聊天壳加载知识库时退出。
    """
    pj = mammoth / "package.json"
    if not pj.is_file():
        return []
    try:
        deps = json.loads(pj.read_text(encoding="utf-8")).get("dependencies") or {}
    except (OSError, json.JSONDecodeError, TypeError):
        return ["package.json"]
    missing: list[str] = []
    seen: set[str] = set()
    for name in deps:
        key = str(name)
        dest = mammoth.joinpath("node_modules", *key.split("/"))
        if not (dest / "package.json").is_file():
            if key not in seen:
                missing.append(key)
                seen.add(key)
            continue
        # 一层传递：lop→option、jszip→pako 等
        for child in _pkg_dep_names(dest):
            if child in seen:
                continue
            child_dest = mammoth.joinpath("node_modules", *child.split("/"))
            if not (child_dest / "package.json").is_file():
                missing.append(child)
                seen.add(child)
            else:
                seen.add(child)
    return missing


def _npmjs_meta_url(name: str) -> str:
    """registry.npmjs.org 元数据 URL（支持 @scope/name）。"""
    if name.startswith("@"):
        scope, _, pkg = name.partition("/")
        if not scope or not pkg:
            raise RuntimeError(f"非法 scoped 包名: {name}")
        return f"https://registry.npmjs.org/{scope}%2F{pkg}"
    return f"https://registry.npmjs.org/{name}"


def _materialize_npm_package(name: str, dest: Path) -> str:
    """从 npmjs 拉包到 dest（只解压，不跑 npm install）。

    供 mammoth 传递依赖（含 @xmldom/xmldom）离线补齐；避免 scoped 被裸名兜底拒绝。
    """
    _assert_safe_npm_name(name)
    # dest 必须落在调用方给定目录内（mammoth/node_modules/...）
    meta_url = _npmjs_meta_url(name)
    with urllib.request.urlopen(
        urllib.request.Request(meta_url, headers={"User-Agent": "WorkBuddy-kb-peer/1.0"}),
        timeout=60,
    ) as resp:
        meta = json.loads(resp.read().decode("utf-8"))
    latest = str((meta.get("dist-tags") or {}).get("latest") or "")
    dist = ((meta.get("versions") or {}).get(latest) or {}).get("dist") or {}
    tarball = str(dist.get("tarball") or "")
    if not tarball:
        raise RuntimeError(f"npmjs 无 {name}@{latest} tarball")
    if not tarball.startswith("https://registry.npmjs.org/"):
        raise RuntimeError(f"拒绝非 npmjs 官方 tarball: {tarball[:80]}")
    safe = name.replace("/", "-").replace("@", "")
    with tempfile.TemporaryDirectory(prefix="wb-dep-") as td:
        tgz = Path(td) / f"{safe}.tgz"
        with urllib.request.urlopen(
            urllib.request.Request(tarball, headers={"User-Agent": "WorkBuddy-kb-peer/1.0"}),
            timeout=120,
        ) as resp:
            tgz.write_bytes(resp.read())
        staging = Path(td) / "pkg"
        staging.mkdir()
        with tarfile.open(tgz, "r:gz") as tf:
            _safe_extract_tar(tf, staging)
        pkg = staging / "package"
        if not (pkg / "package.json").is_file():
            raise RuntimeError(f"{name} tarball 结构异常")
        dest.parent.mkdir(parents=True, exist_ok=True)
        _force_remove_path(dest)
        if dest.exists() or dest.is_symlink() or _path_is_reparse(dest):
            raise RuntimeError(f"无法清掉旧路径以写入 {dest}")
        shutil.move(str(pkg), str(dest))
    return f"已从 npmjs 落地 {name}@{latest}"


def _fill_mammoth_transitive_deps(mammoth: Path, *, profile: Path) -> list[str]:
    """把 mammoth 直接依赖及其传递依赖平铺进 mammoth/node_modules（Node 才能解析）。"""
    notes: list[str] = []
    profile_nm = profile / "node_modules"
    flat = mammoth / "node_modules"
    pending: list[str] = list(_pkg_dep_names(mammoth))
    seen: set[str] = set()
    while pending:
        name = pending.pop(0)
        if not name or name in seen:
            continue
        seen.add(name)
        dest = flat.joinpath(*name.split("/"))
        if not (dest / "package.json").is_file():
            src = profile_nm.joinpath(*name.split("/"))
            dest.parent.mkdir(parents=True, exist_ok=True)
            if (src / "package.json").is_file():
                if dest.exists() or dest.is_symlink() or _path_is_reparse(dest):
                    _force_remove_path(dest)
                try:
                    link_dir(dest, src)
                    notes.append(f"接线 {name}")
                except OSError as exc:
                    notes.append(f"{name}(link:{type(exc).__name__})")
                    continue
            else:
                try:
                    notes.append(_materialize_npm_package(name, dest))
                except (OSError, urllib.error.URLError, TimeoutError, RuntimeError, tarfile.TarError) as exc:
                    notes.append(f"{name}({type(exc).__name__})")
                    continue
        if (dest / "package.json").is_file():
            for child in _pkg_dep_names(dest):
                if child not in seen:
                    pending.append(child)
    return notes


def _link_mammoth_runtime_deps(profile: Path, mammoth: Path) -> str:
    """补齐 mammoth/node_modules：直接依赖 + 传递依赖（优先 profile，缺则 npmjs）。"""
    missing_before = _mammoth_missing_runtime_deps(mammoth)
    notes = _fill_mammoth_transitive_deps(mammoth, profile=profile)
    missing_after = _mammoth_missing_runtime_deps(mammoth)
    parts: list[str] = []
    if missing_before and not missing_after:
        parts.append("mammoth 依赖已补齐")
    if notes:
        # 日志过长时只保留末尾若干条
        tail = notes if len(notes) <= 12 else notes[:4] + ["…"] + notes[-6:]
        parts.append("；".join(tail))
    if missing_after:
        parts.append("mammoth 仍缺 " + ", ".join(missing_after))
    return "；".join(parts)


def _peer_pkg_ok(path: Path) -> bool:
    """有效包：有 package.json，可解析；mammoth 还要能加载其 dependencies。"""
    try:
        if not (path / "package.json").is_file():
            return False
        # 解析失败（自环）不算就绪
        path.resolve()
    except OSError:
        return False
    # 仅对「我们从 npmjs 实装的裸名包」查传递依赖；scoped/@deepseek-ai junction 靠宿主树解析
    if path.name == "mammoth" and _mammoth_missing_runtime_deps(path):
        return False
    return True


def _run_npm(argv: list[str], cwd: Path, *, timeout: int = 180) -> None:
    """Windows 安全调用 npm（node + npm-cli.js / shell=True）。"""
    import shutil as _sh
    from win_hide import popen_kwargs

    node = _sh.which("node") or _sh.which("node.exe")
    npm_cli = None
    if node:
        nd = Path(node).resolve().parent
        for cand in (
            nd / "node_modules" / "npm" / "bin" / "npm-cli.js",
            nd.parent / "lib" / "node_modules" / "npm" / "bin" / "npm-cli.js",
        ):
            if cand.is_file():
                npm_cli = cand
                break
    kw = {"cwd": str(cwd), "check": True, "capture_output": True, "text": True, "timeout": timeout}
    kw.update(popen_kwargs())
    if node and npm_cli:
        subprocess.run([node, str(npm_cli), *argv], **kw)
        return
    npm = _sh.which("npm.cmd") or _sh.which("npm")
    if not npm:
        raise FileNotFoundError("找不到 npm，无法安装知识库 peer 依赖")
    if os.name == "nt" and str(npm).lower().endswith((".cmd", ".bat")):
        subprocess.run(subprocess.list2cmdline([npm, *argv]), shell=True, **kw)
        return
    subprocess.run([npm, *argv], **kw)


def _materialize_bare_dep_from_npmjs(name: str, dest: Path) -> str:
    """从 registry.npmjs.org 拉纯 npm 依赖进托管包（含其 dependencies，防 mammoth 缺 underscore）。"""
    import subprocess

    _assert_safe_npm_name(name)
    if name.startswith("@"):
        raise RuntimeError(f"scoped 包请走公司仓，不走 npmjs 兜底: {name}")
    meta_url = f"https://registry.npmjs.org/{name}"
    with urllib.request.urlopen(
        urllib.request.Request(meta_url, headers={"User-Agent": "WorkBuddy-kb-peer/1.0"}),
        timeout=60,
    ) as resp:
        meta = json.loads(resp.read().decode("utf-8"))
    latest = str((meta.get("dist-tags") or {}).get("latest") or "")
    dist = ((meta.get("versions") or {}).get(latest) or {}).get("dist") or {}
    tarball = str(dist.get("tarball") or "")
    if not tarball:
        raise RuntimeError(f"npmjs 无 {name}@{latest} tarball")
    if not tarball.startswith("https://registry.npmjs.org/"):
        raise RuntimeError(f"拒绝非 npmjs 官方 tarball: {tarball[:80]}")
    with tempfile.TemporaryDirectory(prefix="wb-peer-") as td:
        tgz = Path(td) / f"{name}.tgz"
        with urllib.request.urlopen(
            urllib.request.Request(tarball, headers={"User-Agent": "WorkBuddy-kb-peer/1.0"}),
            timeout=120,
        ) as resp:
            tgz.write_bytes(resp.read())
        staging = Path(td) / "pkg"
        staging.mkdir()
        with tarfile.open(tgz, "r:gz") as tf:
            _safe_extract_tar(tf, staging)
        pkg = staging / "package"
        if not (pkg / "package.json").is_file():
            raise RuntimeError(f"{name} tarball 结构异常")
        dest.parent.mkdir(parents=True, exist_ok=True)
        _force_remove_path(dest)
        if dest.exists() or dest.is_symlink() or _path_is_reparse(dest):
            raise RuntimeError(f"无法清掉旧路径以写入 {dest}")
        shutil.move(str(pkg), str(dest))
    # mammoth 依赖多，Windows 上 npm install 常失败，且失败后残缺树会拒启聊天壳。
    # 只落盘包体；传递依赖由 _link_mammoth_runtime_deps 平铺补齐（不依赖 npm）。
    if name == "mammoth":
        return f"已从 npmjs 落地 {name}@{latest}（deps 由平铺补齐）"
    # 其它裸名 peer（marked/pdfjs）：通常无/少依赖；npm 失败且无 dependencies 可接受
    try:
        deps = json.loads((dest / "package.json").read_text(encoding="utf-8")).get("dependencies") or {}
    except (OSError, json.JSONDecodeError, TypeError):
        deps = {}
    if not deps:
        return f"已从 npmjs 补齐 {name}@{latest}"
    try:
        _run_npm(
            ["install", "--omit=dev", "--ignore-scripts", "--no-package-lock", "--no-fund", "--no-audit"],
            dest,
            timeout=180,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError) as exc:
        raise RuntimeError(f"{name} 已落盘但安装其 dependencies 失败: {exc}") from exc
    if not (dest / "node_modules").is_dir():
        raise RuntimeError(f"{name} dependencies 未装入 node_modules")
    return f"已从 npmjs 补齐 {name}@{latest}（含 deps）"


def wire_pack_deps(profile: Path) -> str:
    """在托管包内为 dependencies/peers 建 junction，并提升到 profile/node_modules。

    link:/junction 后 Node ESM 按真实路径解析；pnpm 卸其它插件 prune 掉 hoist
    后，若只留坏 junction → 宿主崩、:3081 未监听。故：
      1) pack/node_modules/<peer> 必须有效（裸名必查包优先实文件，禁止 pack↔profile 自环）
      2) profile/node_modules/<peer> 再 hoist 一份（只允许 profile → pack）
    """
    pack = pack_dir(profile)
    if not (pack / "package.json").is_file():
        return "跳过 peer 接线：托管包不存在"

    # 先拆 pack↔profile 自环（两边互相 JUNCTION → mammoth 解析失败、假 OK）
    for name in KB_PEER_REQUIRED:
        pack_peer = pack.joinpath("node_modules", *name.split("/"))
        prof_peer = profile.joinpath("node_modules", *name.split("/"))
        if _path_is_reparse(pack_peer) and _path_is_reparse(prof_peer):
            _force_remove_path(prof_peer)
            _force_remove_path(pack_peer)
        elif not _peer_pkg_ok(pack_peer) and (_path_is_reparse(pack_peer) or _path_is_reparse(prof_peer)):
            _force_remove_path(prof_peer)
            _force_remove_path(pack_peer)

    roots = _peer_search_roots(profile)
    pack_nm = pack / "node_modules"
    profile_nm = profile / "node_modules"
    # 裸名必查：不要从 profile 取源（与 hoist 易成自环）；只认全局 dsh / 已实装 pack
    try:
        safe_roots = [
            r for r in roots if not profile_nm.is_dir() or r.resolve() != profile_nm.resolve()
        ]
    except OSError:
        safe_roots = list(roots)
    if pack_nm.is_dir() and pack_nm not in safe_roots:
        safe_roots = [pack_nm, *safe_roots]

    linked: list[str] = []
    missing: list[str] = []
    notes_fetch: list[str] = []
    for name in KB_PEER_DEPS:
        dest = pack.joinpath("node_modules", *name.split("/"))
        prefer_real = name in KB_PEER_REQUIRED and not name.startswith("@")
        use_roots = safe_roots if prefer_real else roots
        src = _resolve_peer_src(name, use_roots)
        if src is not None:
            try:
                if src.resolve() == dest.resolve():
                    src = _resolve_peer_src(name, [r for r in use_roots if r != pack_nm])
            except OSError:
                src = None
            if src is not None and prefer_real and profile_nm.is_dir():
                try:
                    if _is_under(src, profile_nm):
                        src = None
                except OSError:
                    src = None
        if src is None and _peer_pkg_ok(dest):
            linked.append(name)
            continue
        if src is None:
            if prefer_real:
                # mammoth 已在磁盘：禁止 wipe+npm，只补传递依赖（防启动反复炸）
                if name == "mammoth" and (dest / "package.json").is_file():
                    fix_note = _link_mammoth_runtime_deps(profile, dest)
                    if _peer_pkg_ok(dest):
                        notes_fetch.append(fix_note or "mammoth 依赖已修复")
                        linked.append(name)
                        continue
                try:
                    notes_fetch.append(_materialize_bare_dep_from_npmjs(name, dest))
                    if name == "mammoth":
                        notes_fetch.append(_link_mammoth_runtime_deps(profile, dest) or "")
                    if _peer_pkg_ok(dest):
                        linked.append(name)
                        continue
                    missing.append(f"{name}(deps-incomplete)")
                    continue
                except (OSError, urllib.error.URLError, TimeoutError, RuntimeError, tarfile.TarError) as exc:
                    missing.append(f"{name}({type(exc).__name__})")
                    continue
            missing.append(name)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            if dest.exists() and dest.resolve() == src.resolve() and _peer_pkg_ok(dest):
                linked.append(name)
                continue
        except OSError:
            pass
        _force_remove_path(dest)
        link_dir(dest, src)
        if not _peer_pkg_ok(dest):
            missing.append(f"{name}(bad-link)")
            continue
        linked.append(name)

    hoist_notes = _hoist_peers_to_profile(profile, pack)
    mammoth_note = ""
    mammoth_dir = pack / "node_modules" / "mammoth"
    if (mammoth_dir / "package.json").is_file():
        mammoth_note = _link_mammoth_runtime_deps(profile, mammoth_dir)
    note = f"已为托管包接线依赖 {len(linked)}/{len(KB_PEER_DEPS)}"
    if missing:
        note += f"；缺: {', '.join(missing)}"
    if notes_fetch:
        note += f"；{'；'.join(notes_fetch)}"
    if hoist_notes:
        note += f"；{hoist_notes}"
    if mammoth_note:
        note += f"；{mammoth_note}"
    still_bad = [n for n in KB_PEER_REQUIRED if not _peer_pkg_ok(pack.joinpath("node_modules", *n.split("/")))]
    if still_bad:
        raise RuntimeError(
            "知识库硬依赖未齐，拒绝接线: "
            + ", ".join(still_bad)
            + f"。详情: {note}"
        )
    return note


def _hoist_peers_to_profile(profile: Path, pack: Path) -> str:
    """把关键 peer 再 junction 到 profile/node_modules（只允许 profile → pack）。"""
    n = 0
    for name in KB_PEER_REQUIRED:
        src = pack.joinpath("node_modules", *name.split("/"))
        if not _peer_pkg_ok(src):
            continue
        dest = profile.joinpath("node_modules", *name.split("/"))
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            if _peer_pkg_ok(dest) and dest.resolve() == src.resolve():
                n += 1
                continue
        except OSError:
            pass
        _force_remove_path(dest)
        try:
            if _path_is_reparse(src) and _is_under(src.resolve(), profile / "node_modules"):
                continue
        except OSError:
            continue
        link_dir(dest, src)
        if _peer_pkg_ok(dest):
            n += 1
    return f"profile hoist {n}/{len(KB_PEER_REQUIRED)}" if n else ""


def assert_kb_peers_ready(profile: Path) -> None:
    """启动前门禁：必查 peer 在托管包内可解析。"""
    pack = pack_dir(profile)
    bad: list[str] = []
    for name in KB_PEER_REQUIRED:
        peer = pack.joinpath("node_modules", *name.split("/"))
        if not _peer_pkg_ok(peer):
            bad.append(name)
    if bad:
        raise RuntimeError(
            "知识库硬依赖未齐（pnpm 装/卸其它插件后常见），拒绝启动: "
            + ", ".join(bad)
            + f"。请重跑: python scripts/lib/ensure_dsh_knowledge.py --fix {profile}"
        )


def repair_kb_peers(profile: Path) -> str:
    """只修托管包 peer（尤其 mammoth 传递依赖），不访问公司 npm、不重拉知识包。

    供 ensure_runtime 在整段 ensure_dsh_knowledge 失败后做最后一次抢救，避免误拒启。
    """
    profile = profile.expanduser().resolve()
    pack = pack_dir(profile)
    if not (pack / "package.json").is_file():
        raise RuntimeError(f"托管包不存在: {pack}")
    notes: list[str] = []
    mammoth = pack / "node_modules" / "mammoth"
    if (mammoth / "package.json").is_file():
        note = _link_mammoth_runtime_deps(profile, mammoth)
        if note:
            notes.append(note)
    elif not _peer_pkg_ok(mammoth):
        # 包体都没有时只能从 npmjs 落地再补 deps
        notes.append(_materialize_bare_dep_from_npmjs("mammoth", mammoth))
        notes.append(_link_mammoth_runtime_deps(profile, mammoth) or "")
    hoist = _hoist_peers_to_profile(profile, pack)
    if hoist:
        notes.append(hoist)
    assert_kb_peers_ready(profile)
    return "；".join(n for n in notes if n) or "peer 已就绪"


def wire_link_into_profile(profile: Path) -> str:
    """package.json → link:；node_modules junction；lock importer → link:；pack 内 peer 接线。"""
    pack = pack_dir(profile)
    if not (pack / "package.json").is_file():
        raise RuntimeError(f"托管包不存在: {pack}")

    notes: list[str] = []
    notes.append(wire_pack_deps(profile))

    # node_modules junction
    nm = profile / "node_modules" / "@zhongruan" / "dsh-knowledge"
    nm.parent.mkdir(parents=True, exist_ok=True)
    remove_link_or_move(nm)
    link_dir(nm, pack)
    notes.append(f"已链接 node_modules → {pack}")

    # package.json
    pkg_path = profile / "package.json"
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    deps = pkg.setdefault("dependencies", {})
    dsh = pkg.setdefault("dsh", {})
    prof = dsh.setdefault("profile", {})
    bundles = prof.get("bundles")
    if not isinstance(bundles, list):
        bundles = []
        prof["bundles"] = bundles

    for legacy in LEGACY_KB_PKGS:
        if legacy in deps:
            del deps[legacy]
            notes.append(f"已从 dependencies 移除 {legacy}")
        if legacy in bundles:
            bundles[:] = [b for b in bundles if b != legacy]
            notes.append(f"已从 bundles 移除 {legacy}")

    link = link_dep_spec()
    # 始终写死 link:（禁止 ^1.0.4 残留；pnpm 启动会按 package.json+lock 回写）
    if deps.get(KB_PKG) != link:
        notes.append(f"dependencies {KB_PKG} → {link}")
    deps[KB_PKG] = link
    if KB_PKG not in bundles:
        bundles.append(KB_PKG)
        notes.append(f"已登记 bundles {KB_PKG}")
    prof["bundles"] = bundles
    pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # 写后立刻验收，防静默失败
    check_deps = json.loads(pkg_path.read_text(encoding="utf-8")).get("dependencies", {})
    if check_deps.get(KB_PKG) != link:
        raise RuntimeError(f"package.json 写入 link 失败: got {check_deps.get(KB_PKG)!r}")

    notes.append(patch_pnpm_lock_link(profile))
    return "；".join(notes)


def patch_pnpm_lock_link(profile: Path) -> str:
    """importer 改成 link:，避免 pnpm 再按 npm 版号覆盖。Windows 锁文件是 CRLF。"""
    lock = profile / "pnpm-lock.yaml"
    if not lock.is_file():
        return "无 pnpm-lock.yaml，跳过"
    text = lock.read_text(encoding="utf-8")
    orig = text
    link = link_dep_spec()
    # 必须 \r?\n：Windows pnpm-lock 是 CRLF，仅 \n 匹配失败会假报「已是 link」
    pat = re.compile(
        rf"('{re.escape(KB_PKG)}':\r?\n\s+specifier:\s*)[^\r\n]+(\r?\n\s+version:\s*)[^\r\n]+",
        re.MULTILINE,
    )
    text2, n = pat.subn(rf"\g<1>{link}\g<2>{link}", text, count=1)
    if n == 0:
        head = text[:4000]
        if f"'{KB_PKG}':" in head and f"specifier: {link}" in head:
            return f"pnpm-lock 已是 {link}"
        raise RuntimeError(
            "pnpm-lock 未改写（未找到 knowledge importer 或 CRLF/格式异常）；"
            "禁止带着 ^旧版锁启动，否则 pnpm 会打回旧包"
        )
    # Python 3.12 的 Path.write_text 无 newline=；用 open 强制 LF，避免 Windows CRLF 弄坏 pnpm-lock
    with lock.open("w", encoding="utf-8", newline="\n") as fh:
        fh.write(text2)
    # 验收：必须真写进去
    check = lock.read_text(encoding="utf-8")[:4000]
    if f"specifier: {link}" not in check:
        raise RuntimeError(f"pnpm-lock 改写后仍无 {link}")
    return f"已改写 pnpm-lock → {link}"


def _ensure_package_json_waiting(pkg_path: Path) -> tuple[str, bool]:
    """未装托管包时：踢 bundles，不写 registry 依赖。"""
    if not pkg_path.is_file():
        return f"跳过 package.json：缺少 {pkg_path}", False
    pkg = json.loads(pkg_path.read_text(encoding="utf-8"))
    dsh = pkg.setdefault("dsh", {})
    profile = dsh.setdefault("profile", {})
    bundles = profile.get("bundles")
    if not isinstance(bundles, list):
        bundles = []
        profile["bundles"] = bundles
    changed = False
    notes: list[str] = []
    if KB_PKG in bundles:
        bundles[:] = [b for b in bundles if b != KB_PKG]
        changed = True
        notes.append(f"已从 bundles 移除未装好的 {KB_PKG}（防整页卡死）")
    profile["bundles"] = bundles
    if changed:
        pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return "；".join(notes), True
    return f"等待托管安装 {KB_PKG}", False


def ensure_dsh_knowledge(profile: Path, *, do_fix: bool = False) -> dict:
    profile = profile.expanduser().resolve()
    notes: list[str] = []
    notes.append(_ensure_allow_builds(profile / "pnpm-workspace.yaml"))
    notes.append(_ensure_cordis_patch(profile / "cordis.patch.yml"))

    pin = _env_kb_pin()
    resolved_ok = True
    try:
        want = resolve_kb_version()
    except RuntimeError as exc:
        notes.append(str(exc))
        want = pin or "latest"
        resolved_ok = False

    pack = pack_dir(profile)
    have = installed_version(profile)
    installed = (pack / "package.json").is_file()
    need_upgrade = bool(want not in {"latest", ""} and (not have or have != want))

    if not installed:
        msg, _ = _ensure_package_json_waiting(profile / "package.json")
        notes.append(msg)
    notes.append(f"目标版本={want}（{'环境变量钉死' if pin else '公司 npm latest'}；托管 link 模式）")
    notes.append(f"托管目录={pack}")

    fixed = False
    if do_fix:
        try:
            # 版号已对齐则只接线（不 rmtree），避免启动窗口竞态；版号变化才重拉
            have_pack = None
            pj = pack / "package.json"
            if pj.is_file():
                try:
                    have_pack = str(json.loads(pj.read_text(encoding="utf-8")).get("version") or "")
                except (OSError, json.JSONDecodeError, TypeError):
                    have_pack = None
            if want not in {"latest", ""} and have_pack == want:
                notes.append(f"托管包已是 {want}，跳过重拉，仅接线 link/peer")
            elif (
                want not in {"latest", ""}
                and have_pack
                and not version_older(have_pack, want)
            ):
                # 本机已是更新版（如刚装 1.0.8 而市场仍 1.0.6）→ 禁止 ensure 降级冲掉
                notes.append(
                    f"托管包本机 {have_pack} ≥ 市场目标 {want}，保留本机不降级，仅接线 link/peer"
                )
                want = have_pack
            else:
                # 公司 npm 解析失败时 want 会落成 latest。本机托管包已在则禁止再下载
                # （下载失败会记「托管安装失败」并拒启；包在下载前不会被删，但启动已被拖死）。
                if not resolved_ok and have_pack:
                    notes.append(
                        f"未能解析公司 npm 版本，保留本机托管包 {have_pack}，仅接线 link/peer"
                    )
                    want = have_pack
                else:
                    w, note = materialize_pack(profile, version=None if want == "latest" else want)
                    want = w
                    notes.append(note)
            wire_note = wire_link_into_profile(profile)
            notes.append(wire_note)
            # 关键 peer 未接线 → 宿主必崩；拒绝「假成功」（含 mammoth 等，防卸其它插件 prune 后挂 :3081）
            # peer 失败必须抛出，禁止吞进 notes 后仍 OK（restart-web / ensure_runtime 靠此拒启）
            assert_kb_peers_ready(profile)
            fixed = True
            have = installed_version(profile)
            installed = (pack_dir(profile) / "package.json").is_file()
            need_upgrade = bool(want not in {"latest", ""} and (not have or have != want))
        except (OSError, urllib.error.URLError, TimeoutError, tarfile.TarError) as exc:
            notes.append(f"托管安装失败: {type(exc).__name__}: {exc}")
        except RuntimeError as exc:
            # peer / materialize 硬失败：记笔记并继续抛，供 --fix CLI / 门禁拒启
            notes.append(f"托管安装失败: {type(exc).__name__}: {exc}")
            raise

    # 知识库接线后：预置用户操作手册进本机默认库（免上传；库未建时只落 builtin 副本）
    try:
        from ensure_local_user_manual import ensure_local_user_manual

        manual = ensure_local_user_manual(profile=profile, do_fix=bool(do_fix))
        notes.append(str(manual.get("detail") or "用户操作手册预置已检查"))
        if manual.get("changed") or manual.get("pending_db"):
            fixed = True
    except Exception as exc:  # noqa: BLE001
        notes.append(f"用户操作手册预置跳过: {type(exc).__name__}: {exc}")

    return {
        "profile": str(profile),
        "pkg": KB_PKG,
        "version": want,
        "installed": installed,
        "installed_version": have,
        "need_install": not installed,
        "need_upgrade": need_upgrade,
        "fixed": fixed,
        "pack": str(pack),
        "notes": notes,
    }


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description=f"预装/升级 {KB_PKG}（托管 link，跟公司 npm latest）")
    ap.add_argument("profile", type=Path)
    ap.add_argument("--fix", action="store_true")
    args = ap.parse_args()
    try:
        result = ensure_dsh_knowledge(args.profile, do_fix=args.fix)
    except RuntimeError as exc:
        print(f"FAIL {KB_PKG}: {exc}")
        return 1
    for line in result["notes"]:
        print(line)
    ver = result.get("version") or "latest"
    failed = any("托管安装失败" in n for n in result["notes"])
    if failed:
        print(f"FAIL {KB_PKG}")
        return 1
    if result["need_install"]:
        print(f"NEED_INSTALL {KB_PKG} (pack)")
        return 1 if args.fix else 0
    if result["need_upgrade"]:
        print(f"NEED_UPGRADE {KB_PKG} (have {result.get('installed_version')} → want {ver})")
        return 1 if args.fix else 0
    print(f"OK {KB_PKG}@{result.get('installed_version') or ver} link→{result.get('pack')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
