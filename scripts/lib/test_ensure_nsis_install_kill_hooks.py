# -*- coding: utf-8 -*-
from __future__ import annotations

import unittest

from ensure_nsis_install_kill_hooks import (
    MARKER_BEFORE_FILES,
    MARKER_SAFE,
    MARKER_SECTION,
    _has_live_copyfiles,
    patch_extract_app_package,
    patch_install_section,
)


class NsisKillHooksTests(unittest.TestCase):
    def test_patch_install_section_uac_and_before_files(self) -> None:
        sample = """
!else
  ${ifNot} ${UAC_IsInnerInstance}
    !insertmacro CHECK_APP_RUNNING
  ${endif}
!endif

SetOutPath $INSTDIR
!insertmacro installApplicationFiles
!insertmacro registryAddInstallInfo
"""
        out = patch_install_section(sample)
        self.assertIn(MARKER_SECTION, out)
        self.assertIn(MARKER_BEFORE_FILES, out)
        self.assertEqual(out.count("!insertmacro CHECK_APP_RUNNING"), 2)

    def test_patch_extract_safe_no_copyfiles(self) -> None:
        sample = """
!macro extractUsing7za FILE
  Push $OUTDIR
  CreateDirectory "$PLUGINSDIR\\7z-out"
  SetOutPath "$PLUGINSDIR\\7z-out"
  Nsis7z::Extract "${FILE}"
  Pop $R0
  SetOutPath $R0
  CopyFiles /SILENT "$PLUGINSDIR\\7z-out\\*" $OUTDIR
  IfErrors 0 DoneExtract7za
  MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDRETRY IDCANCEL AbortExtract7za
  DoneExtract7za:
!macroend
"""
        out = patch_extract_app_package(sample)
        self.assertIn(MARKER_SAFE, out)
        body = out.split("!macro extractUsing7za")[-1].split("!macroend")[0]
        self.assertFalse(_has_live_copyfiles(body))
        self.assertNotIn("appCannotBeClosed", body)
        self.assertIn("workbuddyStashAppExes", body)
        self.assertIn("workbuddySyncAppTree", body)
        self.assertIn("$PLUGINSDIR\\7z-out", body.replace("/", "\\"))
        self.assertGreater(
            body.rfind('SetOutPath "$INSTDIR"'),
            body.rfind("RMDir"),
        )

    def test_patch_upgrades_direct_extract_to_safe(self) -> None:
        sample = """
!macro extractUsing7za FILE
  ; workbuddy-nsis-kill: direct-extract
  SetOutPath "$INSTDIR"
  Nsis7z::Extract "${FILE}"
!macroend
"""
        out = patch_extract_app_package(sample)
        body = out.split("!macro extractUsing7za")[-1].split("!macroend")[0]
        self.assertIn(MARKER_SAFE, body)
        self.assertIn("7z-out", body)
        self.assertNotIn("appCannotBeClosed", body)
        self.assertGreater(body.rfind('SetOutPath "$INSTDIR"'), body.rfind("RMDir"))

    def test_patch_upgrades_safe_extract_that_leaves_outdir_in_temp(self) -> None:
        sample = """
!macro extractUsing7za FILE
  ; workbuddy-nsis-kill: safe-extract-robocopy
  SetOutPath "$PLUGINSDIR\\7z-out"
  Nsis7z::Extract "${FILE}"
  !insertmacro workbuddySyncAppTree
  RMDir /r "$PLUGINSDIR\\7z-out"
  ClearErrors
!macroend
"""
        out = patch_extract_app_package(sample)
        body = out.split("!macro extractUsing7za")[-1].split("!macroend")[0]
        self.assertGreater(body.rfind('SetOutPath "$INSTDIR"'), body.rfind("RMDir"))


if __name__ == "__main__":
    unittest.main()
