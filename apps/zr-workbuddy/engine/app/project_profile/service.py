"""确保工作区有一份最新项目画像。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from ..code_dev.workspace import validate_workspace
from .scan import input_fingerprint, scan_workspace
from . import store


def format_for_agent(profile: dict[str, Any] | None) -> str:
    """写进写码任务的短说明。"""
    if not isinstance(profile, dict):
        return ""
    summary = str(profile.get("summary_zh") or "").strip()
    if not summary:
        return ""
    ui = profile.get("ui") if isinstance(profile.get("ui"), dict) else {}
    samples = [str(x) for x in (ui.get("sample_pages") or []) if str(x).strip()]
    styles = [str(x) for x in (ui.get("style_libs") or []) if str(x).strip()]
    layout = profile.get("layout") if isinstance(profile.get("layout"), dict) else {}
    api_dirs = [str(x) for x in (layout.get("api_dirs") or []) if str(x).strip()]
    entries = [str(x) for x in (layout.get("entry_files") or []) if str(x).strip()]
    view_dirs = [str(x) for x in (layout.get("view_dirs") or []) if str(x).strip()]
    router_files = [str(x) for x in (layout.get("router_files") or []) if str(x).strip()]
    menu_files = [str(x) for x in (layout.get("menu_files") or []) if str(x).strip()]
    conv = profile.get("conventions") if isinstance(profile.get("conventions"), dict) else {}
    readme = str(conv.get("readme_excerpt") or "").strip()
    lines = ["【项目画像 · 当前工作区，优先于任何其它仓库的目录习惯】", summary]
    if styles:
        lines.append("界面库：" + "、".join(styles))
    if view_dirs:
        lines.append("页面目录：" + "、".join(view_dirs[:6]))
    if router_files:
        lines.append("路由文件：" + "、".join(router_files[:4]) + "（新页面须能在此注册/被引用）")
    if menu_files:
        lines.append(
            "菜单/导航注册文件："
            + "、".join(menu_files[:4])
            + "（验收看这些文件，不要假设 reportFeatures.js）"
        )
    if samples:
        lines.append("请先对照这些现有页面的结构与风格再改：" + "、".join(samples[:3]))
    elif api_dirs or entries:
        bits = []
        if entries:
            bits.append("入口 " + "、".join(entries[:3]))
        if api_dirs:
            bits.append("接口目录 " + "、".join(api_dirs[:3]))
        lines.append("请先对照现有工程结构再改：" + "；".join(bits))
    if view_dirs or router_files or menu_files:
        lines.append("禁止套用其它 MES/ERP 仓库的 views/warehouse、reportFeatures 等路径习惯。")
    else:
        lines.append("禁止套用其它仓库的目录习惯；以本工程画像与现有分层为准。")
    if readme:
        lines.append("README 摘录：\n" + readme[:600])
    gaps = [str(x) for x in (profile.get("gaps") or []) if str(x).strip()]
    if gaps:
        lines.append("画像缺口：" + "；".join(gaps[:4]))
    pinned: list[str] = []
    if view_dirs:
        pinned.append("页面目录：" + "、".join(view_dirs[:6]))
    if router_files:
        pinned.append("路由文件：" + "、".join(router_files[:4]) + "（新页面须能在此注册/被引用）")
    if menu_files:
        pinned.append(
            "菜单/导航注册文件："
            + "、".join(menu_files[:4])
            + "（验收看这些文件，不要假设 reportFeatures.js）"
        )
    text = "\n".join(lines)
    pin = "\n".join(pinned).strip()
    if not pin or len(text) <= 2800:
        return text[:2800]
    kept = [line for line in lines if line not in pinned]
    room = 2800 - len(pin) - 1
    if room < 1:
        return pin[:2800]
    head = "\n".join(kept)[:room].rstrip()
    if not head:
        return pin
    return head + "\n" + pin


def format_directory_block(profile: dict[str, Any] | None) -> str:
    """已扫描的目录全文。写码任务和审码附加条款在截断之后附上，不放进 2800 字短说明。"""
    if not isinstance(profile, dict):
        return ""
    block = profile.get("directory") if isinstance(profile.get("directory"), dict) else {}
    roots = block.get("roots") if isinstance(block.get("roots"), list) else []
    lines = ["【工作区目录画像】"]
    wrote = False
    for row in roots:
        if not isinstance(row, dict):
            continue
        name = str(row.get("path") or row.get("name") or "").strip()
        if not name:
            continue
        wrote = True
        role = str(row.get("role") or "").strip()
        lines.append(name + (f"（{role}）" if role else ""))
        children = row.get("children") if isinstance(row.get("children"), list) else []
        for child in children:
            if not isinstance(child, dict):
                continue
            cname = str(child.get("path") or child.get("name") or "").strip()
            if not cname:
                continue
            crole = str(child.get("role") or "").strip()
            lines.append("  " + cname + (f"（{crole}）" if crole else ""))
            modules = child.get("modules") if isinstance(child.get("modules"), list) else []
            shown = [str(name).strip() for name in modules if str(name).strip()]
            if shown:
                lines.append("    " + "、".join(shown))
            if child.get("modules_truncated"):
                lines.append("    更深目录超过上限，其余未收入")
        if row.get("children_truncated"):
            lines.append("  子目录超过扫描上限，其余未收入")
    if not wrote:
        return ""
    if block.get("truncated"):
        lines.append("顶层目录超过扫描上限，其余未收入")
    return "\n".join(lines)


def load_cached(workspace: str) -> dict[str, Any] | None:
    return store.load(workspace)


def get_profile(workspace: str) -> dict[str, Any]:
    check = validate_workspace(workspace or "")
    if not check.get("ok"):
        return {"ok": False, "detail": check.get("error") or "工作区无效"}
    path = str(check.get("path") or "")
    cached = store.load(path)
    if not cached:
        return {"ok": False, "detail": "该工作区还没有项目画像", "workspace": path}
    return {"ok": True, "cached": True, "profile": cached}


def ensure(workspace: str, *, force: bool = False) -> dict[str, Any]:
    """工作区合法则扫描或复用缓存。失败不抛到调用方。"""
    check = validate_workspace(workspace or "")
    if not check.get("ok"):
        return {"ok": False, "detail": check.get("error") or "工作区无效", "profile": None}
    root = Path(str(check.get("path") or ""))
    path = str(root)
    finger = ""
    try:
        finger = input_fingerprint(root)
    except OSError:
        finger = ""
    cached = store.load(path)
    if (
        not force
        and cached
        and finger
        and str(cached.get("fingerprint") or "") == finger
        and str(cached.get("workspace") or "") == path
    ):
        return {"ok": True, "cached": True, "profile": cached}
    try:
        profile = scan_workspace(root)
    except OSError as exc:
        return {"ok": False, "detail": f"扫描失败：{exc}", "profile": cached}
    profile["workspace"] = path
    if finger:
        profile["fingerprint"] = finger
    store.save(profile)
    return {"ok": True, "cached": False, "profile": profile}
