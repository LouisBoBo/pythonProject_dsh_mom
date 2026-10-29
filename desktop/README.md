# 桌面安装包（宿主一体）

默认产出：**内嵌 Host（dsh web）+ 内嵌引擎**。安装后在设置 / WorkBuddy 配置中心填 Key 即可用，不依赖本机另装 `dsh`。

打包脚本会**自动判断当前系统**：

| 本机 | 主产物 | 可选 |
|------|--------|------|
| **Windows** | `desktop/release/ZR WorkBuddy-*.exe`（NSIS 安装程序） | 同目录 zip / `win-unpacked` |
| **macOS** | `desktop/release/ZR WorkBuddy-*.zip`（解压出 `.app`） | `MAKE_DMG=1` 再打拖拽盘 |

**禁止交叉打包**（内嵌 Python / Node 必须与本机一致）。在 Windows 上打包就是 Windows 安装包；在 Mac 上打包就是 Mac 包。

## 打包

**正式发版请先读并照做**：[桌面打包发版流程与规则.md](../Framework/docs/宿主与运维排障/desktop-packaging-release.md)（检查清单、`-NoBump`、上传验收、常见坑）。Windows 推荐：

```powershell
powershell -NoProfile -File tmp\_package_desktop.ps1          # 抬 patch
powershell -NoProfile -File tmp\_package_desktop.ps1 -NoBump # 同号重打
```

**打包即自动抬安装包版本号**（`desktop/package.json`，默认 patch：0.2.26→0.2.27；用户「检查更新」只看这个号）：

```bash
# 自动按本机 OS 选用 NSIS 或 Mac zip
python scripts/lib/package_desktop.py
# 等价：
./scripts/package-desktop.sh          # macOS / Git Bash
scripts\package-desktop.cmd           # Windows cmd

# 版本档位：--bump minor / --bump major；指定版本：--set-version 0.3.0
# 重打同版本调试：--no-bump（--preflight / --skip-builder 本就不抬版本）

# 只检查本机能不能打（不下载、不构建）
python scripts/lib/package_desktop.py --preflight

# 已有 runtime 缓存时
SKIP_RUNTIME=1 SKIP_HOST=1 SKIP_NODE=1 SKIP_MARKET=1 SKIP_PNPM=1 python scripts/lib/package_desktop.py

# 仅 macOS：额外打 DMG
MAKE_DMG=1 DMG_FORMAT=ULFO python scripts/lib/package_desktop.py
```

产物：

- **Windows**：运行 `ZR WorkBuddy-*.exe` 安装（可改目录、生成桌面快捷方式）。未签名：SmartScreen 选「仍要运行」。
- **macOS**：解压 zip → 把 **ZR WorkBuddy.app** 拖进「应用程序」。未签名：第一次请 **右键 → 打开**。

Windows 安装程序会解压内嵌 Python + Host。打包时已裁掉 tests / source map / markdown，7z 默认压缩等级 5（不再用 9），安装应在一两分钟量级，而不是十几分钟。若要更小安装包：`ELECTRON_BUILDER_COMPRESSION_LEVEL=9`。

**启动不弹黑框（0.2.23+）**  
Windows 启动自检 / 接线不再弹出控制台窗口（`python.exe` / `cmd` 默认隐藏）。

**应用内升级（0.2.27+）**  
账号菜单「检查更新」可在线升级：拉取更新清单 → 全量下载安装包（sha256 校验）→ 人点「安装并退出」→ 自动拉起安装向导。清单与安装包放公司服务器 `http://175.178.238.31/workbuddy-desktop/`（与插件市场同服、**另起路径**，勿放 `dsh-plugins/`）。**打包成功会自动 scp 上传**（`upload_desktop_feed.py`），远端最多保留 2 个版本；须先配置 `apps/zr-workbuddy/config/desktop-upload.env`（见 `.example`）。更新说明用 `WORKBUDDY_UPDATE_NOTES="…"` 传入。用户只看安装包版本号（`desktop/package.json` 的 version）。无清单 / 网络不可达 / 无更大版本 → 显示「当前已是最新版本（v安装包号）」；清单格式异常仍报失败。方案与验收：`docs/功能实现/桌面应用版本升级方案.md`。规则：`.cursor/rules/workbuddy-desktop-feed-upload.mdc`。

**升级前先结束残留进程（0.2.26+）**  
根因是市场目录 `serve` 在 `ensure` 结束后仍作为孤儿 Python 占着安装目录。现在会写 `httpd.pid`，应用退出必杀；安装向导再按路径 + pid 文件清一次，并等待文件锁释放。**禁止** WMI 扫全机，**禁止** `taskkill /IM python.exe`。不会误杀安装包 `ZR WorkBuddy-0.2.xx.exe`、Cursor 或本机 Python。并跳过旧卸载器。不必再点「无法关闭 → 重试」。

**升级不要再被旧进程卡住（0.2.22+）**  
一体包会在退出时、以及 NSIS 覆盖安装前，按**安装目录路径**关掉引擎 Python / 宿主 Node / 市场目录服务 / 主程序（不会按 `python.exe` 全名误杀 Cursor 或本机 Python）。**0.2.24+** 升级时不再调用旧卸载器（旧版会把 `ZR WorkBuddy-0.2.xx.exe` 误判成应用未关闭）。请关干净当前窗口后再跑新安装包；不必手工 taskkill。

**为何 Mac 曾经打很久还不成功**
1. electron-builder 内置 dmg = UDRW + zlib，对 ~1GB 一体包极慢且易失败  
2. 脚本里再 `ditto` 一遍 1.1G 纯浪费时间  
3. 把 `Applications` 快捷方式放进 `-srcfolder` 会偶发跟进整盘程序目录 → 假死（现改为挂载后再加链接）  
4. 多次强杀 `hdiutil` 后，本机 `diskimages-helper` 会卡死（连 1KB 测试镜像也挂）→ 需 `killall diskimages-helper` 或重启后再 `MAKE_DMG=1`

前置：本机已 `npm i -g @deepseek-ai/dsh`（默认整包拷进安装包；约 +280MB）。  
也可用 `HOST_FROM_GLOBAL=0` 改走 `npm install`（更慢）。`DSH_NPM_VERSION` 仅在该模式下生效（见 `scripts/lib/package_desktop.py`）。

## 安装后

1. 启动 ZR WorkBuddy
   - **Windows**：开始菜单 / 桌面快捷方式
   - **macOS**：打开 dmg 或 Applications 里的 **ZR WorkBuddy.app**
2. 进入聊天壳后到 **设置 → WorkBuddy / 配置中心**：填 DeepSeek API Key（保存后同步给聊天壳，不必再去「设置 → 模型」另填一份）
3. **设置 → 插件市场**：公司插件在最前，后面是 DSH 社区插件（内嵌 `dshmarket` + `pnpm`，不必本机 sudo 装 pnpm）
4. 自有写码/审码/提交功能在 **WorkBuddy / 引擎功能插件页**，不要用插件市场当这条通道

## 配置会不会丢

WorkBuddy 的 Key / MES / SSH / 工作区写在本机：

- macOS：`~/Library/Application Support/zr-workbuddy-desktop/persist/`
- Windows：`%APPDATA%\zr-workbuddy-desktop\persist\`

升级安装包会刷新内嵌代码，但会把这份配置拷回去。  
**用户后来在引擎「功能插件」页装上的 WorkBuddy 功能**（安装包里没有的 `features/<id>`）也会进 `persist/user-features/`，升级后自动填回。出厂打进安装包的功能以新包为准。  
**不要删** 上述 `zr-workbuddy-desktop` 目录，否则等于清数据重装。

## 说明

- 密钥不进安装包
- 一体包用隔离 `DSH_HOME`（在 userData 下），不复用本机 `~/.dsh`
- 端口：桌面壳默认引擎 **:18000**、聊天壳 **:13080**；浏览器开发壳用 **:3081**（`scripts/host.sh`），勿混开以免以为「会话丢了」
- 未做 Apple 公证 / Windows 代码签名
