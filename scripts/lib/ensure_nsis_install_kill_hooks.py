# -*- coding: utf-8 -*-
"""NSIS 安装双目标补丁：

1) 避免 CopyFiles + appCannotBeClosed「无法关闭」弹窗
2) 避免直接解压到过长 INSTDIR 时 Windows MAX_PATH 静默丢文件 → 宿主白屏

做法：杀进程 → 挪开旧 exe → 7z 解到短路径 $PLUGINSDIR\\7z-out →
robocopy/PowerShell 同步到 $INSTDIR（长路径友好，无 MessageBox）。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

_LIB = Path(__file__).resolve().parent
ROOT = _LIB.parents[1]
DESKTOP = ROOT / "desktop"
NSIS = DESKTOP / "node_modules" / "app-builder-lib" / "templates" / "nsis"

MARKER_SECTION = "; workbuddy-nsis-kill: always-check-app-running"
MARKER_BEFORE_FILES = "; workbuddy-nsis-kill: before-installApplicationFiles"
MARKER_SAFE = "; workbuddy-nsis-kill: safe-extract-robocopy"
# 旧标记：曾用直接解压到 INSTDIR，会在长路径下丢文件
MARKER_DIRECT_OLD = "; workbuddy-nsis-kill: direct-extract"


def _die(msg: str) -> None:
    print(f"[ensure_nsis_install_kill_hooks] FAIL: {msg}", file=sys.stderr)
    raise SystemExit(1)


def _log(msg: str) -> None:
    print(f"[ensure_nsis_install_kill_hooks] {msg}", flush=True)


def patch_install_section(text: str) -> str:
    old_uac = """!else
  ${ifNot} ${UAC_IsInnerInstance}
    !insertmacro CHECK_APP_RUNNING
  ${endif}
!endif"""
    new_uac = f"""!else
  {MARKER_SECTION}
  ; UAC 提权后的内层进程也必须杀残留
  !insertmacro CHECK_APP_RUNNING
!endif"""
    if MARKER_SECTION not in text:
        if old_uac not in text:
            _die("installSection.nsh: 未找到 UAC 跳过 CHECK_APP_RUNNING 块")
        text = text.replace(old_uac, new_uac, 1)

    text = text.replace(
        "; workbuddy-nsis-kill: before-installApplicationFiles",
        MARKER_BEFORE_FILES,
    )
    if MARKER_BEFORE_FILES not in text:
        old_install = "!insertmacro installApplicationFiles"
        if old_install not in text:
            _die("installSection.nsh: 未找到 installApplicationFiles")
        text = text.replace(
            old_install,
            f"""{MARKER_BEFORE_FILES}
!insertmacro CHECK_APP_RUNNING
!insertmacro installApplicationFiles""",
            1,
        )
    return text


SAFE_EXTRACT_MACRO = f"""!macro extractUsing7za FILE
  {MARKER_SAFE}
  ; 短路径完整解压，再 robocopy 到 INSTDIR：
  ; - 不用整树复制指令（遇锁弹「无法关闭」）
  ; - 不直接 Nsis7z 到长 INSTDIR（MAX_PATH 静默丢文件 → 宿主白屏）
  !ifmacrodef workbuddyKillInstallTree
    !insertmacro workbuddyKillInstallTree
  !endif
  !ifmacrodef workbuddyStashAppExes
    !insertmacro workbuddyStashAppExes
  !endif
  RMDir /r "$PLUGINSDIR\\7z-out"
  CreateDirectory "$PLUGINSDIR\\7z-out"
  SetOutPath "$PLUGINSDIR\\7z-out"
  ClearErrors
  Nsis7z::Extract "${{FILE}}"
  ClearErrors
  !ifmacrodef workbuddySyncAppTree
    !insertmacro workbuddySyncAppTree
  !else
    ; 兜底：无自定义宏时仍尽量 robocopy，禁止弹「无法关闭」
    nsExec::ExecToLog '"$SYSDIR\\robocopy.exe" "$PLUGINSDIR\\7z-out" "$INSTDIR" /E /IS /IT /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP'
    Pop $R0
  !endif
  RMDir /r "$PLUGINSDIR\\7z-out"
  ; File /oname=Uninstall *.exe 写到当前 $OUTDIR。这里若不把输出目录改回 $INSTDIR，
  ; 卸载器会落在即将删除的 7z-out，注册表仍指向 $INSTDIR\\Uninstall *.exe，设置里卸载报找不到文件。
  SetOutPath "$INSTDIR"
  ClearErrors
!macroend
"""


def _extract_macro_body(text: str) -> str:
    return text.split("!macro extractUsing7za")[-1].split("!macroend")[0]


def _has_live_copyfiles(body: str) -> bool:
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(";"):
            continue
        if re.search(r"\bCopyFiles\b", stripped):
            return True
    return False


def _restores_instdir_outdir(body: str) -> bool:
    """解压结束后必须把 $OUTDIR 设回 $INSTDIR，且发生在清掉 7z-out 之后。"""
    norm = body.replace("/", "\\")
    marker = 'SetOutPath "$INSTDIR"'
    idx = norm.rfind(marker)
    if idx < 0:
        return False
    rmdir = norm.rfind("RMDir")
    return rmdir < 0 or idx > rmdir


def _is_safe_extract(body: str) -> bool:
    if MARKER_SAFE not in body:
        return False
    if _has_live_copyfiles(body) or "appCannotBeClosed" in body:
        return False
    norm = body.replace("/", "\\")
    if "$PLUGINSDIR\\7z-out" not in norm:
        return False
    if not _restores_instdir_outdir(body):
        return False
    return "workbuddySyncAppTree" in body or "robocopy" in body.lower()


def patch_extract_app_package(text: str) -> str:
    m = re.search(
        r"!macro extractUsing7za FILE\b.*?!macroend",
        text,
        flags=re.DOTALL,
    )
    if not m:
        _die("extractAppPackage.nsh: 未找到 extractUsing7za 宏")
    body_old = _extract_macro_body(m.group(0))
    if _is_safe_extract(body_old):
        return text
    text = text[: m.start()] + SAFE_EXTRACT_MACRO + text[m.end() :]
    body = _extract_macro_body(text)
    if _has_live_copyfiles(body):
        _die("extractAppPackage.nsh: 安全解压补丁后仍含 CopyFiles 指令")
    if "appCannotBeClosed" in body:
        _die("extractAppPackage.nsh: 仍含 appCannotBeClosed")
    if MARKER_SAFE not in text:
        _die("extractAppPackage.nsh: 缺少 safe-extract 标记")
    if "workbuddySyncAppTree" not in body and "robocopy" not in body.lower():
        _die("extractAppPackage.nsh: 缺少 robocopy/sync")
    # 禁止「只」直接解压到 $INSTDIR（无短路径 7z-out）
    if "$PLUGINSDIR\\7z-out" not in body.replace("/", "\\"):
        _die("extractAppPackage.nsh: 缺少短路径 7z-out")
    return text


def ensure(*, check_only: bool = False) -> None:
    sec = NSIS / "installSection.nsh"
    ext = NSIS / "include" / "extractAppPackage.nsh"
    if not sec.is_file():
        _die(f"缺少 {sec}（请先在 desktop/ npm install）")
    if not ext.is_file():
        _die(f"缺少 {ext}")

    sec_txt = sec.read_text(encoding="utf-8")
    ext_txt = ext.read_text(encoding="utf-8")
    sec_new = patch_install_section(sec_txt)
    ext_new = patch_extract_app_package(ext_txt)

    body = _extract_macro_body(ext_new)
    ok = (
        MARKER_SECTION in sec_new
        and MARKER_BEFORE_FILES in sec_new
        and MARKER_SAFE in ext_new
        and not _has_live_copyfiles(body)
        and "Nsis7z::Extract" in body
        and "workbuddyStashAppExes" in body
        and ("workbuddySyncAppTree" in body or "robocopy" in body.lower())
        and _restores_instdir_outdir(body)
        and "appCannotBeClosed" not in body
    )
    if not ok:
        _die("补丁校验失败")

    if check_only:
        if sec_txt != sec_new or ext_txt != ext_new:
            _die("NSIS 模板尚未打上安全解压钩子")
        _log("OK（已打补丁）")
        return

    if sec_txt != sec_new:
        sec.write_text(sec_new, encoding="utf-8")
        _log(f"已修补 {sec.relative_to(ROOT)}")
    else:
        _log(f"已是最新: {sec.name}")
    if ext_txt != ext_new:
        ext.write_text(ext_new, encoding="utf-8")
        _log(f"已修补 {ext.relative_to(ROOT)}")
    else:
        _log(f"已是最新: {ext.name}")
    _log("OK")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="只检查，不写入")
    args = ap.parse_args(argv)
    ensure(check_only=bool(args.check))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
