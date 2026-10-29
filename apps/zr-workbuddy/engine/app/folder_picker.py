"""弹出本机原生「选择文件夹」对话框，返回绝对路径。

仅适用于引擎与浏览器同机（127.0.0.1）：对话框出现在运行引擎的那台机器上。
对齐 simplified-workbuddy apps/local_dev/folder_picker.py。

公网一体入口（浏览器在用户电脑、引擎在服务器）不得调用本对话框——
否则选到的是服务器磁盘，极易被当成「选本机」。
"""
from __future__ import annotations

import platform
import re
import subprocess
from typing import Any

_LOOPBACK_HOST_RE = re.compile(
    r"^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$",
    re.I,
)

REMOTE_ENGINE_NO_LOCAL_PICK = (
    "引擎跑在服务器上：无法打开你电脑上的选目录框。"
    "请在输入框粘贴服务器上的工程绝对路径；"
    "若要在你自己电脑上写码/审码/提交，请用桌面版或本机打开 WorkBuddy（127.0.0.1）。"
)


def _host_is_loopback(host: str) -> bool:
    h = (host or "").strip().lower()
    if not h:
        return False
    # X-Forwarded-Host 可能带端口或逗号列表
    h = h.split(",")[0].strip()
    if _LOOPBACK_HOST_RE.match(h):
        return True
    # 仅 hostname 部分
    name = h.split(":")[0].strip("[]")
    return name in {"localhost", "127.0.0.1", "::1"}


def _request_host_from_url(value: str) -> str:
    try:
        from urllib.parse import urlparse

        return str(urlparse(value).netloc or "")
    except Exception:  # noqa: BLE001
        return ""


def reject_remote_browser_pick(request: Any) -> dict[str, Any] | None:
    """浏览器经公网反代访问远端引擎时拒绝弹窗。返回错误体或 None（可继续本机选目录）。"""
    blocked = {
        "ok": False,
        "path": "",
        "code": "remote_engine_no_local_pick",
        "error": REMOTE_ENGINE_NO_LOCAL_PICK,
    }
    try:
        headers = getattr(request, "headers", None) or {}
        xf_host = str(headers.get("x-forwarded-host") or "").strip()
        if xf_host and not _host_is_loopback(xf_host):
            return blocked
        origin = str(headers.get("origin") or "").strip()
        if origin:
            host = _request_host_from_url(origin)
            if host and not _host_is_loopback(host):
                return blocked
        # 部分客户端只带 Referer（无 Origin）；与 Origin 同口径拒绝非回环
        referer = str(headers.get("referer") or "").strip()
        if referer:
            host = _request_host_from_url(referer)
            if host and not _host_is_loopback(host):
                return blocked
    except Exception:  # noqa: BLE001
        # 解析异常时宁可拒绝弹窗，避免公网误开服务器目录框
        return blocked
    return None


def pick_local_folder(*, prompt: str = "选择工程目录") -> dict[str, Any]:
    """阻塞直到用户选中或取消。返回 {ok, path, error}。"""
    system = platform.system()
    try:
        if system == "Darwin":
            return _pick_macos(prompt)
        if system == "Windows":
            return _pick_windows(prompt)
        return _pick_linux(prompt)
    except subprocess.TimeoutExpired:
        return {"ok": False, "path": "", "error": "选择超时，请重试"}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "path": "", "error": f"{type(e).__name__}: {e}"}


def _normalize_path(raw: str) -> str:
    p = (raw or "").strip().strip('"').strip("'")
    while len(p) > 1 and p.endswith(("/", "\\")):
        p = p[:-1]
    return p


def _pick_macos(prompt: str) -> dict[str, Any]:
    safe = (
        (prompt or "选择工程目录")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("\\", "\\\\")
        .replace('"', '\\"')
    )[:80]
    # 不要 tell Finder：未授予「自动化」时会报 -1743（一体包里必现）。
    # choose folder 走 Standard Additions，不控制 Finder。
    script = f'POSIX path of (choose folder with prompt "{safe}")'
    proc = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "").strip()
        if "User canceled" in err or "-128" in err or not err:
            return {"ok": False, "path": "", "error": "已取消选择"}
        if "-1743" in err or "Apple事件" in err or "Apple event" in err.lower():
            return {
                "ok": False,
                "path": "",
                "error": "系统拦截了选文件夹对话框，请手动粘贴本机目录路径",
            }
        return {"ok": False, "path": "", "error": err or "选文件夹失败"}
    path = _normalize_path(proc.stdout or "")
    if not path:
        return {"ok": False, "path": "", "error": "未返回路径"}
    return {"ok": True, "path": path, "error": ""}


def _pick_windows(prompt: str) -> dict[str, Any]:
    safe = (
        (prompt or "选择工程目录").replace("\r", " ").replace("\n", " ").replace("'", "''")
    )[:80]
    ps = (
        "Add-Type -AssemblyName System.Windows.Forms; "
        "$f = New-Object System.Windows.Forms.FolderBrowserDialog; "
        f"$f.Description = '{safe}'; "
        "$f.ShowNewFolderButton = $true; "
        "if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath } "
        "else { exit 2 }"
    )
    proc = subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    if proc.returncode == 2:
        return {"ok": False, "path": "", "error": "已取消选择"}
    if proc.returncode != 0:
        return {
            "ok": False,
            "path": "",
            "error": (proc.stderr or proc.stdout or "选文件夹失败").strip(),
        }
    path = _normalize_path(proc.stdout or "")
    if not path:
        return {"ok": False, "path": "", "error": "已取消选择"}
    return {"ok": True, "path": path, "error": ""}


def _pick_linux(prompt: str) -> dict[str, Any]:
    title = (prompt or "选择工程目录").replace("\r", " ").replace("\n", " ")[:80]
    for cmd in (
        ["zenity", "--file-selection", "--directory", f"--title={title}"],
        ["kdialog", "--getexistingdirectory", ".", title],
    ):
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
                check=False,
            )
        except FileNotFoundError:
            continue
        if proc.returncode != 0:
            return {"ok": False, "path": "", "error": "已取消选择"}
        path = _normalize_path(proc.stdout or "")
        if path:
            return {"ok": True, "path": path, "error": ""}
        return {"ok": False, "path": "", "error": "已取消选择"}
    return {
        "ok": False,
        "path": "",
        "error": "本机未找到 zenity/kdialog，请手动粘贴绝对路径",
    }
