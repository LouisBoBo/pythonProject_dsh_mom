; 安装向导一打开、点「安装」时立刻清掉上次残留（引擎 Python / 宿主 Node / 主程序 / 市场 serve）。
; 现行 productName / 安装包统一为 MOM（MOM.exe / MOM-x.y.z.exe）。
; 仍兼容杀旧映像：Mom-x.exe、江西中软.exe、ZR WorkBuddy.exe（升级旧机）。
; 禁止用 find.exe 子串匹配，以免把安装包 MOM-0.2.xx.exe / Mom-x-0.2.xx.exe 当成应用。
; 禁止按 python.exe 全名杀进程；跳过旧卸载器。
; UAC 提权内层也会跑 CHECK_APP_RUNNING：见 ensure_nsis_install_kill_hooks.py（打包前打补丁）。
; 解压：短路径 7z-out + robocopy（避免 CopyFiles 弹窗，也避免直接解压长路径丢文件白屏）。
; Python 与宿主 node_modules 在包内各是一个 zip，robocopy 之后由 tar 在最终目录展开一次。

; 若打包侧没算出 ESTIMATED_SIZE，禁止 ${GetSize} 扫整棵 Python/Host 树（可再卡数分钟）。
!ifndef ESTIMATED_SIZE
  !define ESTIMATED_SIZE 1200000
!endif

; 强制短安装目录（无空格），降低 MAX_PATH 风险；升级旧机也会写回新路径。
!macro preInit
  SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\MOM"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LOCALAPPDATA\Programs\MOM"
  !ifdef INSTALL_REGISTRY_KEY_2
    WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY_2}" InstallLocation "$LOCALAPPDATA\Programs\MOM"
    WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY_2}" InstallLocation "$LOCALAPPDATA\Programs\MOM"
  !endif
!macroend

!macro workbuddyKillInstallTree
  InitPluginsDir
  File /oname=$PLUGINSDIR\kill-install-tree.ps1 "${BUILD_RESOURCES_DIR}\kill-install-tree.ps1"
  FileOpen $R8 "$PLUGINSDIR\wb-instdir.txt" w
  FileWrite $R8 "$INSTDIR"
  FileClose $R8
  System::Call "kernel32::GetCurrentProcessId()i.r9"
  DetailPrint "Closing leftover processes under $INSTDIR"
  !ifdef APP_EXECUTABLE_FILENAME
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
    Pop $R0
  !endif
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "MOM.exe"'
  Pop $R0
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "Mom-x.exe"'
  Pop $R0
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "江西中软.exe"'
  Pop $R0
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "ZR WorkBuddy.exe"'
  Pop $R0
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "old-uninstaller.exe"'
  Pop $R0
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\kill-install-tree.ps1" -InstallDirFile "$PLUGINSDIR\wb-instdir.txt" -ExcludePid $9'
  Pop $R0
  !ifdef APP_EXECUTABLE_FILENAME
    nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
    Pop $R0
  !endif
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "MOM.exe"'
  Pop $R0
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "Mom-x.exe"'
  Pop $R0
  Sleep 1500
!macroend

; 解压前把旧主程序改名，避免 ERROR_SHARING_VIOLATION（杀进程后偶发仍锁）
!macro workbuddyStashAppExes
  DetailPrint "Stashing old app executables under $INSTDIR"
  !ifdef APP_EXECUTABLE_FILENAME
    Rename "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "$INSTDIR\${APP_EXECUTABLE_FILENAME}.preupdate"
    ClearErrors
  !endif
  Rename "$INSTDIR\MOM.exe" "$INSTDIR\MOM.exe.preupdate"
  ClearErrors
  Rename "$INSTDIR\Mom-x.exe" "$INSTDIR\Mom-x.exe.preupdate"
  ClearErrors
  Rename "$INSTDIR\ZR WorkBuddy.exe" "$INSTDIR\ZR WorkBuddy.exe.preupdate"
  ClearErrors
  Rename "$INSTDIR\江西中软.exe" "$INSTDIR\江西中软.exe.preupdate"
  ClearErrors
  ; 旧卸载器残留也挪开，避免占目录
  Rename "$INSTDIR\Uninstall ZR WorkBuddy.exe" "$INSTDIR\Uninstall ZR WorkBuddy.exe.preupdate"
  ClearErrors
  Rename "$INSTDIR\Uninstall MOM.exe" "$INSTDIR\Uninstall MOM.exe.preupdate"
  ClearErrors
  Rename "$INSTDIR\Uninstall Mom-x.exe" "$INSTDIR\Uninstall Mom-x.exe.preupdate"
  ClearErrors
!macroend

; 短路径解压产物 → INSTDIR（robocopy；失败再走 sync-install-tree.ps1 长路径拷贝）
!macro workbuddySyncAppTree
  DetailPrint "Syncing app files into $INSTDIR (robocopy)"
  nsExec::ExecToLog '"$SYSDIR\robocopy.exe" "$PLUGINSDIR\7z-out" "$INSTDIR" /E /IS /IT /R:2 /W:1 /NFL /NDL /NJH /NJS /NC /NS /NP'
  Pop $R0
  ; robocopy: 0-7 = success with bit flags；>=8 失败再走 PowerShell
  IntCmp $R0 8 SyncAppTreeFail SyncAppTreeDone SyncAppTreeFail
  SyncAppTreeFail:
    DetailPrint "robocopy exit=$R0, fallback PowerShell long-path sync"
    InitPluginsDir
    File /oname=$PLUGINSDIR\sync-install-tree.ps1 "${BUILD_RESOURCES_DIR}\sync-install-tree.ps1"
    FileOpen $R8 "$PLUGINSDIR\wb-sync-src.txt" w
    FileWrite $R8 "$PLUGINSDIR\7z-out"
    FileClose $R8
    FileOpen $R8 "$PLUGINSDIR\wb-sync-dst.txt" w
    FileWrite $R8 "$INSTDIR"
    FileClose $R8
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$PLUGINSDIR\sync-install-tree.ps1" -SrcDirFile "$PLUGINSDIR\wb-sync-src.txt" -DstDirFile "$PLUGINSDIR\wb-sync-dst.txt"'
    Pop $R0
  SyncAppTreeDone:
    ClearErrors
!macroend

; 安装程序把 zip 拷进最终目录后展开一次。失败则中止，避免装出没有 python.exe 的半成品。
!macro workbuddyExpandPackArchives
  StrCpy $R1 "$INSTDIR\resources\runtime\python.zip"
  IfFileExists "$R1" 0 wbExpandHost
  CreateDirectory "$INSTDIR\resources\runtime\python"
  DetailPrint "Expanding Python runtime"
  nsExec::ExecToLog '"$SYSDIR\tar.exe" -xf "$R1" -C "$INSTDIR\resources\runtime\python"'
  Pop $R0
  IntCmp $R0 0 0 wbExpandPyFail wbExpandPyFail
  IfFileExists "$INSTDIR\resources\runtime\python\python.exe" 0 wbExpandPyFail
  Delete "$R1"
  Goto wbExpandHost
  wbExpandPyFail:
    MessageBox MB_OK|MB_ICONSTOP "展开 Python 运行时失败。请重新安装。"
    Abort
  wbExpandHost:
  StrCpy $R1 "$INSTDIR\resources\host\node_modules.zip"
  IfFileExists "$R1" 0 wbExpandDone
  CreateDirectory "$INSTDIR\resources\host\node_modules"
  DetailPrint "Expanding host dependencies"
  nsExec::ExecToLog '"$SYSDIR\tar.exe" -xf "$R1" -C "$INSTDIR\resources\host\node_modules"'
  Pop $R0
  IntCmp $R0 0 0 wbExpandHostFail wbExpandHostFail
  IfFileExists "$INSTDIR\resources\host\node_modules\@deepseek-ai\dsh\package.json" 0 wbExpandHostFail
  Delete "$R1"
  Goto wbExpandDone
  wbExpandHostFail:
    MessageBox MB_OK|MB_ICONSTOP "展开宿主依赖失败。请重新安装。"
    Abort
  wbExpandDone:
!macroend

; 安装收尾：非提权、不等待地拉起后台预热。把 dsh web 冷启（~15s）挪到用户点图标之前，
; 首次打开可走宿主复用（目标 <10s，热态约 3s）。失败不 Abort。
!macro workbuddyPostInstallPrewarm
  DetailPrint "Prewarming MOM (background host)"
  !ifdef APP_EXECUTABLE_FILENAME
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "--workbuddy-background"
  !else
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\MOM.exe" "open" "--workbuddy-background"
  !endif
  ClearErrors
!macroend

!macro customInstall
  !insertmacro workbuddyExpandPackArchives
  !insertmacro workbuddyPostInstallPrewarm
!macroend

!macro customInit
  !insertmacro workbuddyKillInstallTree
!macroend

!macro customCheckAppRunning
  !insertmacro workbuddyKillInstallTree
  DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
  DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" UninstallString
  !ifdef UNINSTALL_REGISTRY_KEY_2
    DeleteRegValue SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY_2}" UninstallString
  !endif
!macroend
