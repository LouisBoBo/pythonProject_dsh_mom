# 桌面打包发版流程与规则（照做即可）

> **定稿日**：2026-10-20（在 10-14 基础上同步：安装载荷 zip、原生库裁剪、冷启快开 / 后台环境、登录静默校验、产物名 MOM）。  
> **适用**：Windows 本机打 NSIS + 强制上传；Mac 另机同类执行。  
> **权威脚本**：`scripts/lib/package_desktop.py`、`scripts/lib/upload_desktop_feed.py`、`scripts/lib/pack_install_payload.py`、`scripts/lib/prune_pack_junk.py`、`desktop/py/build_runtime.py`。  
> **LOCKED**：`.cursor/rules/workbuddy-desktop-feed-upload.mdc`、公司市场门禁、第一次可用、公网 8093 知识契约（侧栏版本与 exposeApi）、桌面冷/热启动契约。  
> **升级产品方案**（检查更新 UI）：`功能实现/桌面应用版本升级方案.md` —— 本文只管**发版怎么打成功** + **打进包的启动/知识库/桌面壳规范**。  
> **同文副本**：`desktop-packaging-release.md`（内容须与本文一致；改一处须拷到另一处）。

---

## 0. 为什么「SVN 一拉就打包折腾」

打包本身依赖**本机脏状态**，SVN **不**同步这些东西：

| 本机残留 / 约定 | SVN 里有没有 | 冷机 / 清缓存后会怎样 |
|-----------------|--------------|------------------------|
| `desktop/node_modules/`（含 electron、rcedit） | 无（gitignore） | 必须重新 `npm install`；若未走国内镜像会超时 |
| `desktop/runtime/_cache/`（cpython tarball 等） | 无 | 会重新下 Python 运行时（慢，但可过） |
| `apps/.../config/desktop-upload.env` | 无（密钥） | 无则上传失败 = 发版失败 |
| `apps/.../config/company-knowledge.env` | 无（token） | **中软正式包必配**；缺则软告警可打，但安装后无公司共享库 |
| PowerShell 包装脚本里的中文注释 | 临时 `tmp/` | PS 5.1 无 BOM 时全角括号可把 `param()` 解析炸 |

因此：**代码合并成功 ≠ 本机打包环境就绪**。每次正式发版按下面清单走，不要「盲跑一次看报错」。

---

## 1. 发版前检查清单（强制）

在仓库根 `D:\AICodes\DSH_WorkBuddy`：

1. **SVN 工作副本干净到你敢发**  
   - 该提交的已提交；冲突已**手合并**（禁止默认 `theirs-full` / `mine-full`）。  
   - 发版不需要把 `desktop/node_modules`、`desktop/runtime` 提交进库。

2. **上传凭据**（缺一不可）  
   - 复制并填写：`apps/zr-workbuddy/config/desktop-upload.env`（见同目录 `.example`）  
   - 或引擎 `config.yaml` → `code_deploy.ssh_key_path` 可用（脚本会回退读取）  
   - 私钥本机存在、能 `ssh` 到发版机。

3. **公司市场**  
   - 不需要手工操作；`package_desktop` 内会跑 seed + merge + verify。  
   - 失败即停：不要破窗 `WORKBUDDY_ALLOW_OFFICIAL_MARKET=1` 写进发版默认。

4. **公司共享知识库种子（中软正式包强制）**  
   - 路径：`apps/zr-workbuddy/config/company-knowledge.env`（gitignore；见 `.example`）。  
   - 必填：`COMPANY_KNOWLEDGE_BASE_URL`、`COMPANY_KNOWLEDGE_READ_TOKEN`（≥24）；写库再填 `WRITE_TOKEN`。  
   - 现网自签：`COMPANY_KNOWLEDGE_VERIFY_SSL=false`。  
   - 打包门禁：`assert_company_knowledge_packaging` —— **缺文件只软告警继续打**；有文件则 token/URL 不合法会硬失败。  
   - **中软对内发版**：无种子 = 装完侧栏无公司共享库，**不算产品完整**；必须配好再打。  
   - 安装后由 `ensure_company_knowledge` 合并进 `engine/config/config.yaml`（只填空缺，不覆盖已有非空）。

5. **包内门禁脚本清单未砍**  
   - `desktop/py/build_runtime.py` → `PACKAGED_LIB_SCRIPTS` 必须含知识库/启动相关脚本（见 §3.1）。  
   - 漏打 → 桌面弹「启动失败」`ModuleNotFoundError`，或知识库 peer 无法抢救。

6. **本机工具**  
   - `py -3`、Node ≥22、全局 `@deepseek-ai/dsh`（默认从全局拷 Host）。  
   - OpenSSH 客户端（`ssh` / `scp`）。

7. **关桌面壳**  
   - 打包写 exe 图标前脚本会 `taskkill`「江西中软」；仍建议先托盘退出，少抢文件锁。

---

## 2. 标准发版命令（Windows · 唯一推荐）

在**本机 PowerShell**（不要用 Agent 终端跑全量打包；不要用会进 WSL 的 `bash scripts/...`）：

### 2.1 正式抬版本（默认 patch）

```powershell
cd D:\AICodes\DSH_WorkBuddy
powershell -NoProfile -File tmp\_package_desktop.ps1
```

- 会把 `desktop/package.json` 抬一档（如 0.2.44 → 0.2.45）。  
- 日志：`tmp\_package_desktop.out`。  
- 成功标志：末尾 `EXIT=0`，且有「发版上传完成」或等价上传成功日志。

### 2.2 同号重打（上次已抬版本但未打成 / 只修打包脚本）

```powershell
cd D:\AICodes\DSH_WorkBuddy
powershell -NoProfile -File tmp\_package_desktop.ps1 -NoBump
```

**规则**：版本号已抬、安装包/上传未成功 → **必须 `-NoBump`**，禁止连抬两次。

### 2.3 仅补传 / 清理（包已在 `desktop/release/`）

```powershell
cd D:\AICodes\DSH_WorkBuddy
powershell -NoProfile -File tmp\_upload_desktop_only.ps1
# 或显式：
# powershell -NoProfile -File tmp\_upload_desktop_only.ps1 -Version 0.2.45 -Target win
```

等价 Python：

```powershell
py -3 scripts\lib\upload_desktop_feed.py --target win --version 0.2.45
```

### 2.4 包装脚本约定（防 PS 假死）

- `tmp\_package_desktop.ps1` / `tmp\_upload_desktop_only.ps1`：`param(...)` **紧跟** `#Requires`，注释用英文，**不要**在 `param` 前写含全角 `（）` 的中文行（Windows PowerShell 5.1 + UTF-8 无 BOM 会解析炸）。  
- `$ErrorActionPreference = "Continue"`：Python 写 stderr 时不要 `Stop`，否则管道会假退出。  
- 长任务只在本机终端跑；Agent 只读 `tmp\_*.out` 验收。

---

## 3. 流水线阶段（心里要有数）

```text
预检（市场 + 知识库种子校验/软告警）
  → build mes-bridge client
  → build_runtime（内嵌 Python / engine / features / PACKAGED_LIB_SCRIPTS + py_modules_stamp）
  → 内嵌 Node / Host / dshmarket / pnpm
  → 裁剪 runtime（prune_pack_junk + 未用厂商 SDK + 非启动原生库）
  → 瘦 cursor-sdk 自带 Node（有内嵌 Node 时）
  → 打安装载荷 zip（python.zip + host-node_modules.zip，ZIP_STORED）
  → 语法与桌面单测（不含 rcedit 门禁）
  → ensure 桌面图标 + NSIS 杀进程/短路径钩子
  → 【设 ELECTRON 国内镜像】desktop npm install
  → Windows：test_win_exe_icon（依赖刚装好的 rcedit）
  → electron-builder --dir → 写 exe 图标 → nsis+zip
      （extraResources：runtime/python.zip、host/node_modules.zip 等）
  → 写 latest-windows.json
  → scp 安装包 + 清单 → 分批清理远端旧版（keep=2）
  → HTTP 探活清单（安装包只 HEAD / 短读，禁止整包 GET）
```

关键约定（已写进脚本，勿再改回）：

1. **图标 / rcedit 门禁必须在「带镜像的 npm install」之后**  
   - 禁止在语法检查阶段全量或「只装 rcedit」触发 `electron` postinstall 直连 GitHub。  
2. **Electron 二进制只走国内镜像**  
   - 环境变量 `ELECTRON_MIRROR` / `ELECTRON_BUILDER_BINARIES_MIRROR`（默认 npmmirror）。  
   - 落盘 `desktop/.npmrc`（同镜像）；勿再设 `npm_config_electron_*`（新 npm 只刷 Unknown config 警告）。  
3. **残缺 `desktop/node_modules/electron` 会先删再装**（防上次超时留下半包）。  
4. **远端清理分批（每批 ≤8 文件）**  
   - Windows OpenSSH 一次塞太多带空格的 `MOM-…` 会静默失败。  
5. **上传后探活禁止 `resp.read()` 整包 exe**（最多读数 KB）。  
6. **`PACKAGED_LIB_SCRIPTS` 与知识库启动契约**（§3.1）——漏打或改弱 = 下次安装必炸；须含 `py_modules_stamp.py`。  
7. **桌面壳 PATH / 侧栏 / 功能开关 / relink / 离线更新 / zod**（§3.2）——0.2.48 及更早未齐；正式包必须带齐 I～P。  
8. **安装载荷 zip + 原生裁剪 + 冷启快开**（§3.3）——0.2.66+；漏 zip / 回退整树 extraResources / 主路径再堵 `ensure_runtime` = 安装或冷启回退。

### 3.1 包内启动与知识库契约（后续打包硬规范）

> 目标：**装上就能开聊天壳（产品入口仍是本机壳端口约定）**，知识库不拖死启动；中软正式包还要能开公司共享库。

| # | 规范 | 说明 |
|---|------|------|
| A | **门禁脚本必须打进包** | `build_runtime.PACKAGED_LIB_SCRIPTS` 至少保留：`ensure_runtime.py`、`ensure_dsh_knowledge.py`、`ensure_company_knowledge.py`、`ensure_dsh_core_bundles.py`、`purge_broken_profile_bundles.py`、`win_hide.py`、以及 ensure_runtime 顶层 import 的 cursor/zod/market 相关脚本。**禁止**为「瘦包」删掉其中任一项。 |
| B | **知识库 peer 不依赖 Windows `npm install` 擦树** | `ensure_dsh_knowledge`：mammoth **已有 `package.json` 时禁止 wipe + npm**；缺依赖用 profile / npmjs **平铺**进 `mammoth/node_modules`（含一层传递，如 `lop→option`）。 |
| C | **启动抢救优先于整段重拉** | `ensure_runtime._probe_knowledge_peers`：整段 ensure 失败或公司 npm 抖动时，先 `repair_kb_peers`（只修 peer、不重拉托管包）；**本机 peer 已齐则不得因「升级笔记失败」拒启**。 |
| D | **托管包版号** | 本机包 ≥ 市场目标 → **禁止降级冲掉**；公司 npm 解析失败且本机已有包 → **只接线**。 |
| E | **核心 bundles** | 启动前 `ensure_dsh_core_bundles` 从内嵌 Host 接回 `dsh-base` / `dsh-web-app` 等；残包走 `purge_broken_profile_bundles`，避免「Failed to load plugins」整页白屏。 |
| F | **公司共享库种子必须进包** | 中软正式包：发版机必须有合法 `company-knowledge.env`。`build_runtime` 须拷进 `runtime/app/apps/zr-workbuddy/config/`（与 seed/market env 同列）；**禁止**只在打包机校验、却不写入安装树。安装后 `ensure_company_knowledge` 再合并进 `config.yaml`。 |
| G | **产品入口** | 桌面默认聊天壳走约定端口（快捷方式 / `WORKBUDDY_DESKTOP_DSH_PORT`）；**不要**把引擎页当成用户入口写进发版说明。 |
| H | **单测门禁（改知识/ensure 脚本后）** | 本机：`py -3 -m unittest test_ensure_dsh_knowledge test_ensure_company_knowledge`（在 `scripts/lib`）；过了再打包。 |

**禁止借口（打包/改脚本时）：**

- ❌ 从 `PACKAGED_LIB_SCRIPTS` 去掉 `ensure_dsh_knowledge` / `win_hide`「反正本机有」——全新安装会 `ModuleNotFoundError`。  
- ❌ 恢复 mammoth「缺依赖就 `npm install` 整树」——Windows 上常擦成残树 → 拒启。  
- ❌ peer 未齐仍当启动成功、或 ensure 失败直接拒启却不先 `repair_kb_peers`。  
- ❌ 中软正式包不带 `company-knowledge.env` 却宣称「知识库功能已交付」。  
- ❌ 用 `ensure` 模板 `exposeApi: false` 冲掉中央机已有知识 API 配置（公网/一体部署场景；桌面种子合并策略同样只填空缺）。

### 3.2 包内桌面壳契约（2026-10-14）

> **0.2.48 及更早未齐本节（尤其 N/O/P）。** 源码已在仓库；下一档正式包打进去后，已装用户须升级/重装才换到新壳。改仓库不会改掉已装的旧 asar。  
> **P 强化（同日）**：仅补 dist 不够——须认 `dsh-cursor-chat`、钉 `pnpm.overrides.zod`，否则市场热更新仍可把残包装回并触发 `replacement never came up`。

| # | 规范 | 说明 |
|---|------|------|
| I | **Windows 环境 PATH 只保留一把钥匙** | `desktop/lib/win-path.js` 的 `assignPath`。`desktop/main.js` 写宿主工具链和引擎进程环境必须走它。`desktop/package.json` 的 `files` 含 `lib/**`，下一包进 asar。禁止再写 `env.PATH = 短目录 + 旧 PATH`：`{...process.env}` 在 Windows 上键名是 `Path`，再赋 `PATH` 会两键并存，子进程只留下短的那份，`powershell.exe` 变成 ENOENT。插件市场重启助手用 powershell 拉起宿主，界面就显示「启动失败：[dsh-market] helper exiting (code 0)」。 |
| J | **发版前跑 PATH 单测** | `node desktop/tests/test_win_path.js`，以及 `node --check desktop/lib/win-path.js`、`node --check desktop/main.js`。 |
| K | **bridge 调 Python 必须藏控制台** | `plugins/mes-bridge/lib/index.js` 里探测 Python、以及 `plugins_store` 的 `execFileSync` 必须带 `windowsHide: true`。否则桌面宿主约每秒拉一次 coding-mutex，本机不停闪黑框。随 `build_runtime` 拷进安装树。 |
| L | **侧栏只打标记，不搬节点** | 流水线会重建 `mes-bridge` client；重建失败会沿用仓库现有 `lib/client.js`。发版前确认该文件含 `markSidebarRootForPluginOrder`、不含 `installSidebarPluginDock`。插件热更新后左侧会话列表仍在。 |
| M | **「需求到上线一体化」功能开关包内默认开** | 打进包的 `engine/data/plugins.json` 的 `enabled` 必须含 `dev-pipeline`。输入框旁「需求→上线」是会话勾选，默认仍关。 |
| N | **dsh-tools 对接不得因 EPERM 整窗失败** | `desktop/lib/relink-dir.js`：对接宿主时重试、唯一 bak 名、`rm` 兜底；禁止单次 `renameSync` 失败就弹「启动失败」。发版前门禁：`node desktop/tests/test_relink_dir.js`。`align_dsh_tools.py` 同步加固。 |
| O | **市场更新占文件锁 → 桌面离线更新** | Windows 上宿主占着 `node_modules` 时，dshmarket 会报「请完全退出 DSH 后再更新」（**不改 dshmarket**）。下一包托盘「离线更新插件」：`taskkill` 级停宿主 → `desktop/lib/offline-plugin-update.js` 跑 pnpm → **立刻** `ensure_cursor_sdk_zod --fix` → 再起宿主。门禁：`test_offline_plugin_update.js`。托盘退出不够时须结束进程树，否则仍 EPERM。 |
| P | **写码 / 对话写码 zod dist 必须可离线补齐 + 防市场回退** | `@cursor/sdk` 要 `zod/dist/esm/index.js`。官方 `zod@3.25.0` 无 dist；pnpm / 插件市场更新 `@zhongruan/dsh-cursor-coding` **或** `@zhongruan/dsh-cursor-chat` 常再装回残包。后果不止写码红条：市场**热重启**直接 `spawn dsh web`（**不**经桌面 `ensureRuntimeDeps`）→ 宿主秒退 → 界面「启动失败：[dsh-market] the replacement never came up」。`build_runtime` 必须打入 `vendor/zod/zod-3.25.67.tgz`；`ensure_cursor_sdk_zod`：① 识别上述两插件 + 已装 `@cursor/sdk`；② `--fix` 时用 tarball 补 dist，并钉 profile `package.json` → `pnpm.overrides.zod=3.25.67`；③ 优先 `WORKBUDDY_ZOD_TARBALL` / `WORKBUDDY_APP_ROOT/vendor/zod` / 仓内 vendor，禁止只靠联网 npm。桌面冷启 `ensureRuntimeDeps`、托盘离线更新收尾都必须跑 `--fix`。发版抽查：`win-unpacked/.../vendor/zod/zod-3.25.67.tgz`；`PACKAGED_LIB_SCRIPTS` 含 `ensure_cursor_sdk_zod.py`。单测：`py -3 -m unittest test_ensure_cursor_sdk_zod`（在 `scripts/lib`）。 |

**已装用户升级：** 刷新 runtime-app 时，`restoreEngineUserState` 用 `%APPDATA%\zr-workbuddy-desktop\persist\plugins.json` 整文件盖回引擎目录。旧名单里没有 `dev-pipeline` 时，包内默认会被盖掉，界面仍提示功能插件已停用。发版脚本不要改会话勾选的默认。

**禁止借口（打包/改壳时）：**

- ❌ 市场横幅写 `helper exiting (code 0)` 就当宿主崩溃——先确认是不是 `powershell.exe` ENOENT。  
- ❌ 市场横幅写 `the replacement never came up` 就去改 dshmarket——先查桌面 profile 是否又装回无 dist 的 zod（§3.2 P）；**不改** DSH 插件源码。  
- ❌ 为修市场去改 dshmarket 源码（分仓不改 DSH 插件；修在桌面 `assignPath` / 离线更新 / zod ensure）。  
- ❌ 侧栏再 `appendChild` 搬走宿主节点。  
- ❌ 从包内 `plugins.json` 去掉 `dev-pipeline`，或把会话「需求→上线」改成默认勾上。  
- ❌ 对接 dsh-tools 再写回单次 `renameSync` / 固定 `.bak-copy` 且无重试（升级后实体树被占用会整窗挂）。  
- ❌ 离线/市场更新插件后不跑 `ensure_cursor_sdk_zod`，或从包内去掉 `vendor/zod/*.tgz`「反正能联网」。  
- ❌ `ensure_cursor_sdk_zod` 只认 `dsh-cursor-coding`、忽略 `dsh-cursor-chat` / 已装 `@cursor/sdk`。

### 3.3 安装载荷 / 裁剪 / 冷启快开（2026-10-20）

> **目标**：安装包体积可控、安装时只展开一次大目录；**聊天壳尽快可见**，引擎与完整 `ensure_runtime` 放到开窗后后台；二次启动复用宿主可到约 2～3s。  
> **产品名 / 产物**：`desktop/package.json` → `productName` / `artifactName` = **MOM**（`MOM-<ver>.exe`）。userData 目录仍是 `zr-workbuddy-desktop`（勿为改展示名丢配置）。

| # | 规范 | 说明 |
|---|------|------|
| Q | **安装载荷 zip（ZIP_STORED）** | `pack_install_archives`：`runtime/pack/python.zip`、`runtime/pack/host-node_modules.zip`。`desktop/package.json` `extraResources` 映射为 `runtime/python.zip`、`host/node_modules.zip`。**禁止**再把整棵 `runtime/python` / `host/node_modules` 当默认 extraResources 打进包（体积与安装时间回退）。门禁：缺源目录 / 未生成 zip → `package_desktop` 失败。单测：`py -3 -m unittest test_pack_install_payload`（在 `scripts/lib`）。 |
| R | **安装时展开、冷启跳过** | NSIS `customInstall` / 桌面 `expand-pack.js`：安装（或首次发现 zip）时展开；stamp 命中则冷启不再整树拷。`desktop/lib/boot-deps-stamp.js` 与 Python `.workbuddy-py-modules.stamp`（`py_modules_stamp.py` 必须在 `PACKAGED_LIB_SCRIPTS`）对齐后可跳过阻塞式 `ensure_runtime`。 |
| S | **裁剪非启动原生 / 未用 SDK** | `prune_staged_runtime`：`prune_pack_junk`、`prune_embedded_python_extras`、`prune_dsh_unused_provider_sdks`、`prune_dsh_deferred_native_runtimes`（LibreOffice / sherpa 等延后原生）。**禁止**为「完整」把已裁项加回默认包导致体积暴涨。问数/写码主路径不得依赖被裁项。 |
| T | **冷启主路径：先壳后环境** | `desktop/main.js`：splash → wire → 起宿主 → `loadURL` 进界面；**完整** `ensureRuntimeDeps` / 市场 Python `ensure` 默认**后台**。stamp 命中可并行预热引擎；stamp 未命中开窗后再补依赖启引擎。客户端 `fetchEngineApi`、桌面 `mes-runtime.ensureEngineHttp` 在引擎未齐时等待重试，**禁止**立刻失败打断问数/写码。分段日志：`%APPDATA%\zr-workbuddy-desktop\boot-trace.log`。 |
| U | **托盘退出保活宿主** | `killChildren({ keepBackend: true })`：优雅退出保留宿主+引擎（`detached` spawn + `host.pid` / `host.port` / `host.entry-url`）。下次启动 `tryReuseBundledHost` 命中则跳过 ~12s `dsh web` 冷启。任务管理器强杀可能导致无法复用——验收「再开秒开」须走托盘退出。 |
| U2 | **安装结束预热（首次打开目标 <10s）** | NSIS `workbuddyPostInstallPrewarm`：展开 zip 后以**非提权** `ExecShellAsUser` 拉起 `MOM.exe --workbuddy-background`（不等待、失败不 Abort）。装完向导停留期间宿主已在冷启；用户点图标走 `second-instance` → `showMainWindow`（须能 await 同一 `bootPromise` 并在后台模式结束后主动开窗）。开机 Run 键同样预热。 |
| V | **登录：需登则直接全屏表单** | mes-bridge：无会话首帧出登录页；有会话静默 `/api/auth/me`；失效直接出登录表单。**禁止**启动挡板「检查登录状态…」「登录已失效，请重新登录」及底部无关说明文案。打包前须 `build:client`（流水线已跑；改 `client-src` 后抽查 `lib/client.js`）。 |
| W | **公司市场 ensure 不挡壳** | 启动可复用已在听的 merge serve；否则先公司目录开壳，Python `merge_company_dsh_market ensure` **后台**补齐。**禁止**主路径双次 `ensure`（曾白烧数秒）。LOCKED：空 `DSHM_REGISTRY_URL` 仍不得掉回官方。 |

**禁止借口（§3.3）：**

- ❌ 去掉 zip、改回整树 python/host 进 extraResources「省得安装展开」。  
- ❌ 主路径再 `await ensureRuntimeDeps` 全量后再 `loadURL`。  
- ❌ 托盘退出又杀光宿主/引擎，却宣传「再开秒开」。  
- ❌ 启动登录再弹检查中/失效提示，或跳过 `build:client` 把旧挡板打进包。

---

## 4. 成功判定（全部满足才算发版成功）

| # | 检查 | 期望 |
|---|------|------|
| 1 | `tmp\_package_desktop.out` 末尾 | `EXIT=0` |
| 2 | 本机产物 | `desktop/release/MOM-<ver>.exe`（及 zip 可选） |
| 3 | 本机清单 | `desktop/release/latest-windows.json` 的 `version` = `<ver>` |
| 4 | 线上清单 | `http://175.178.238.31/workbuddy-desktop/latest-windows.json` → 200，version 对齐 |
| 5 | 线上安装包 | 同目录下对应 exe → 200，Content-Length 与本地接近 |
| 6 | 上传日志 | 含发版上传完成；清理失败则整次仍算失败（须修后补跑上传脚本） |
| 7 | 包内脚本（抽查） | `resources/runtime/app/scripts/lib/` 含 `ensure_dsh_knowledge.py`、`ensure_runtime.py`、`ensure_company_knowledge.py`、`ensure_cursor_sdk_zod.py`、`py_modules_stamp.py`、`win_hide.py` |
| 8 | 中软正式包种子 | 打包日志无「READ_TOKEN 过短」硬失败；**且** `win-unpacked/.../apps/zr-workbuddy/config/company-knowledge.env` 存在（抽查） |
| 9 | 写码 zod 种子 | `win-unpacked/.../runtime/app/vendor/zod/zod-3.25.67.tgz` 存在（§3.2 P） |
| 10 | 打包日志 §3.2 | 含桌面壳契约校验通过（dev-pipeline / 侧栏 / windowsHide）；语法门禁跑过 `test_win_path` / `test_relink_dir` / `test_offline_plugin_update` |
| 11 | 安装载荷 zip（§3.3 Q） | `win-unpacked/resources/runtime/python.zip` 与 `host/node_modules.zip` 存在；打包日志含「安装载荷 …zip」 |
| 12 | 冷启分段（§3.3 T） | 安装后冷启：`boot-trace.log` 有 `real ui loaded`；二次托盘退出再开宜见 `host reused` / `real ui loaded (host reuse)` |

破窗（仅本机调试，禁止写进默认 / CI）：

- `WORKBUDDY_DESKTOP_SKIP_UPLOAD=1` 或 `--skip-upload` → **不算已上线**。  
- `WORKBUDDY_SKIP_COMPANY_KNOWLEDGE=1` → 跳过公司库合并（调试用；正式包禁止默认）。

### 4.1 安装后冒烟（发版验收加做；不算上传替代）

托盘退出后冷启 **MOM**：

1. 无「启动失败」弹窗；能进聊天壳（产品入口，勿指引擎页）。  
2. 资料库 / 知识侧栏可开；若打了公司种子：登录后管理员可见**公司共享知识库**（非仅默认库）。  
3. 若 peer 曾残缺：启动日志允许出现「已抢救 peer」，但进程须起来且壳可聊。  
4. 设置 → 插件市场可打开；在应用内重启宿主后，不出现「helper exiting (code 0)」。  
5. 更新插件后，左侧会话列表仍在。  
6. 聊天过程不闪控制台黑框。  
7. 「需求到上线一体化」功能开关为开。输入框旁「需求→上线」仍须用户自己勾。  
8. 托盘有「离线更新插件（占文件锁时）」；更新公司写码 / 对话写码插件后，写码不再报缺 `zod/dist/esm`。  
9. 冷启后随便开一轮写码（或看 profile `node_modules/zod/dist/esm/index.js` 存在）。  
10. 市场内更新 `@zhongruan/dsh-cursor-chat`（或 coding）后：若出现 `the replacement never came up`，**托盘退出 → 冷启**须能进壳；profile 应有 `zod` dist，且 `package.json` 含 `pnpm.overrides.zod=3.25.67`（§3.2 P）。勿把热重启失败当成「只能重装整机」。  
11. **登录**：无会话 → 直接全屏登录表单（无「检查登录状态」类提示）；已登录 → 静默进壳。  
12. **冷启体感**（§3.3）：首次冷启可看 `boot-trace.log` 的 `real ui loaded`；**托盘退出再开**宜明显快于首次（日志宜有 `host reused`）。勿用任务管理器强杀来验收「再开」。

第 4～10 条从**含完整 §3.2（含 N/O/P）的安装包**起算；第 11～12 条从**含 §3.3 的安装包**起算。0.2.48 冷启不能用来验收离线更新与 zod 离线补齐。

---

## 5. 故障速查（2026-10-13 实踩）

| 现象 | 根因 | 正确处理 |
|------|------|----------|
| `Cannot find module 'rcedit'` | 语法门禁早于 npm install；本机无 `desktop/node_modules` | 已改：门禁挪到镜像 npm install 后；冷机正常 |
| `npm install rcedit` 仍拉 electron → `ETIMEDOUT` / `ECONNRESET` | 在项目目录装任何包都会跑 package.json 的 electron postinstall，且当时未设镜像 | 禁止语法阶段 npm；builder 阶段设镜像 + `.npmrc` |
| 知识库「未找到 env」后 PowerShell 立刻回提示符 | 软告警走 stderr + `$ErrorActionPreference=Stop` 掐管道 | 软告警改 stdout；包装脚本用 Continue |
| 打包 OK、exe 已 scp，却 `远端清理失败:`（空详情） | 一次 SSH 删除文件名过多超长 | 分批删除；失败后**只跑** `_upload_desktop_only.ps1` |
| 补传脚本 `param` 解析炸 | `param` 前中文注释含全角括号 + UTF-8 无 BOM | `param` 紧贴 `#Requires`，注释英文或放在 param 后 |
| 上传「卡住很久」 | 探活对 exe 做了整包 GET | 已改为 HEAD / 短读；勿在 Agent 里跑大上传 |
| `company-knowledge.env` 缺失 | 无 token | 脚本可继续打（软告警）；**中软正式包须配齐后重打**，否则无公司共享库 |
| 启动弹 `ModuleNotFoundError: ensure_cursor_chat_*` / `win_hide` | `PACKAGED_LIB_SCRIPTS` 漏打；或 runtime-app 仍是旧拷贝 | 补清单后重打；本机急救可把仓内 `scripts/lib` 同步进 `%APPDATA%\…\runtime-app\scripts\lib` |
| 启动失败 / 壳起不来，日志含 mammoth / `base64-js` / `option` | peer 残缺或曾被 `npm install` 擦树 | 包内须带新版 `ensure_dsh_knowledge`（平铺补齐 + `repair_kb_peers`）；禁止再改回 wipe+npm |
| 能启动但侧栏无公司共享 / `configured:false`（已登录） | 未打种子或未合并进 `config.yaml` | 检查种子 + `ensure_company_knowledge`；匿名探测故意不暴露 configured |
| 侧栏文档成 `[object Object]` | 插件 `limit=200` 与引擎校验过严 | 引擎 entries 须放宽到 ≥200（业务代码已收口；发版勿回退） |
| 普通成员看不到共享库列表 | entries 曾仅管理员 | 成员只读 + ACL；发版带上对应引擎改动 |
| 设置 → 插件市场「启动失败：[dsh-market] helper exiting (code 0)」 | Windows 上 `Path` 与 `PATH` 两键并存，短 PATH 胜出，`powershell.exe` ENOENT | 下一包必须含 `assignPath`（§3.2 I/J）。code 0 是助手进程退出日志，先查 ENOENT |
| 设置 → 插件市场「启动失败：[dsh-market] the replacement never came up」 | 市场热重启拉起的替换进程秒退；常见：刚更新 cursor-chat/coding 后 profile 被装回无 dist 的 `zod@3.25.0`（热重启**不**跑 `ensureRuntimeDeps`）。日志：`%TEMP%\dsh-market-restart-*.err.log` 含 `exited with code` / 空 out | **不改 dshmarket**。下一包须含强化后的 §3.2 P（识别 chat、钉 `pnpm.overrides.zod`）。急救：托盘退出 → `WORKBUDDY_ZOD_TARBALL=<仓内或包内 tgz> py -3 scripts\lib\ensure_cursor_sdk_zod.py %APPDATA%\zr-workbuddy-desktop\dsh-home\profiles\web --fix --require` → 冷启。勿与 ENOENT 那条混治 |
| 桌面不停闪黑框 | `mes-bridge` 轮询 `plugins_store` 时 `execFileSync` 未带 `windowsHide` | 下一包必须含 §3.2 K |
| 插件更新后左侧空白 | 侧栏把宿主节点搬走，热更新 `removeChild` 失败后槽位让位 | 下一包的 `lib/client.js` 只打标记（§3.2 L） |
| 「需求到上线一体化」提示功能插件已停用 | 包内默认已开，但用户 `persist\plugins.json` 整文件盖回，旧名单没有 `dev-pipeline` | 包内 `enabled` 必须含该 id（§3.2 M）；已装用户把 persist 与 runtime-app 两份名单补上。会话勾选默认仍关 |
| 启动失败 `EPERM … rename … dsh-tools → dsh-tools.bak-copy` | 升级后包内是实体目录，对接宿主时 rename 被占用；旧逻辑一次失败就退出 | 下一包必须含 `relink-dir`（§3.2 N）。本机急救：托盘退出后把 runtime-app / profile 下该目录接成指向宿主的 junction |
| 插件市场「更新未生效…运行中的 DSH 占用着它的文件」 | 宿主 Node 打开了插件目录，pnpm 无法 rename 替换 | **不改 dshmarket**。下一包用托盘「离线更新插件」（§3.2 O）。急救：`taskkill /F /IM 江西中软.exe` 后跑 `tmp\_offline_update_cursor_chat.ps1`（或同等离线 pnpm），再开应用 |
| 写码 `ERR_MODULE_NOT_FOUND` … `zod/dist/esm/index.js` | pnpm/市场装回无 dist 的 `zod@3.25.0`；`@cursor/sdk` 要 dist | 与上一行「replacement never came up」同根因（§3.2 P）。包内必须有 `vendor/zod/zod-3.25.67.tgz` + `ensure_cursor_sdk_zod`。急救命令同上 |
| 安装包体积陡增 / 安装很慢 | 漏 `pack_install_archives` 或 extraResources 又打整树 python/host | 按 §3.3 Q：只打 zip；抽查 `resources/runtime/python.zip` |
| 冷启仍卡十几秒在「检查依赖」 | 主路径又 `await` 全量 `ensure_runtime` / 双次市场 ensure | 按 §3.3 T/W；读 `boot-trace.log` 分段 |
| 托盘退出再开仍要等宿主冷启 | 未 `detached` / 退出仍杀后端，或任务管理器强杀 | 按 §3.3 U；验收须托盘退出 |
| 启动闪「检查登录状态」或多余登录提示 | 旧 `client.js` 未 `build:client` | 按 §3.3 V；流水线已重建 client，改 login 后确认 bundle |

---

## 6. SVN 与发版的关系（勿混）

1. **先合并代码，再打包**；打包产物与 `node_modules` / `runtime` **不进 SVN**。  
2. 发版相关**应入库**的改动：`package_desktop.py`、`upload_desktop_feed.py`、`pack_install_payload.py`、`prune_pack_junk.py`、`desktop/.npmrc`、`desktop/package.json` 版本号与 `extraResources`、`desktop/lib/*`（含 `expand-pack.js` / `boot-deps-stamp.js`）、`desktop/main.js`、`ensure_cursor_sdk_zod.py`、`py_modules_stamp.py`、`vendor/zod/zod-3.25.67.tgz`、`mes-bridge` 客户端与 `lib/index.js`、本文与规则。这些进仓库之后，还要重打安装包才会进用户机器。  
3. **不要**为「下次好打」把密钥、`company-knowledge.env` 真 token、SSH 私钥提交进库。  
4. 冲突处理永远合并，禁止图省事 `theirs-full`（见 `workbuddy-svn-merge.mdc`）。

---

## 7. Agent / 同事协作红线

- ❌ 在 Cursor Agent 终端跑全量 `package_desktop` / 大 `npm install` / 无超时 scp（易假死）。  
- ❌ 对用户指引混提引擎端口；产品验收仍是安装后的桌面壳（MOM）。  
- ❌ 把「本机 release 有 exe」当成发版成功（必须上传成功）。  
- ❌ 版本已 bump 失败后再 bump。  
- ❌ 砍 `PACKAGED_LIB_SCRIPTS`、恢复 mammoth `npm install` 擦树、跳过 `repair_kb_peers`。  
- ❌ 中软正式包不配 `company-knowledge.env` 却写「知识库已交付」。  
- ❌ 宿主或引擎环境再手写 `env.PATH =` 拼接；侧栏再搬 DOM；包内 `plugins.json` 去掉 `dev-pipeline`。  
- ❌ 从包内砍掉 `vendor/zod/*.tgz` 或 `ensure_cursor_sdk_zod`；离线更新插件后不补 zod。  
- ❌ 去掉安装载荷 zip / 主路径再堵全量 ensure / 优雅退出杀光宿主却宣称秒开（§3.3）。  
- ✅ 用户本机跑包装脚本；Agent 读 `tmp\_*.out` 与线上清单验收。  
- ✅ 失败停在上传/清理时：修脚本后只补传，不重打 runtime。  
- ✅ 改 ensure / 知识库 / zod / pack_install 脚本后先跑对应单测，再打包。

---

## 8. 一页纸口令（复制即用）

```powershell
cd D:\AICodes\DSH_WorkBuddy

# 0. 中软正式包：确认公司知识库种子存在（gitignore，勿提交 token）
#    apps\zr-workbuddy\config\company-knowledge.env

# 0b. 改过 ensure/知识库/zod 脚本时先单测
Set-Location scripts\lib
py -3 -m unittest test_ensure_dsh_knowledge test_ensure_company_knowledge test_ensure_cursor_sdk_zod -q
Set-Location ..\..

# 0c. 桌面壳 PATH / relink / 离线更新 / 启动契约（§3.2）；改过 main.js / lib 时必跑
node desktop\tests\test_win_path.js
node desktop\tests\test_relink_dir.js
node desktop\tests\test_offline_plugin_update.js
node desktop\tests\test_startup_contract.js
node --check desktop\lib\win-path.js
node --check desktop\lib\relink-dir.js
node --check desktop\lib\offline-plugin-update.js
node --check desktop\lib\expand-pack.js
node --check desktop\lib\boot-deps-stamp.js
node --check desktop\main.js
# 确认写码 zod 种子在仓内（build_runtime 会拷进安装树）
Test-Path vendor\zod\zod-3.25.67.tgz

# 0d. 安装载荷 zip / 裁剪相关（§3.3）；改过 pack_install / prune 时必跑
Set-Location scripts\lib
py -3 -m unittest test_pack_install_payload -q
Set-Location ..\..

# A. 正式发版（抬 patch）
powershell -NoProfile -File tmp\_package_desktop.ps1

# B. 同号重打
powershell -NoProfile -File tmp\_package_desktop.ps1 -NoBump

# C. 只上传/清理（包已打好）
powershell -NoProfile -File tmp\_upload_desktop_only.ps1

# D. 验收线上清单
Invoke-WebRequest http://175.178.238.31/workbuddy-desktop/latest-windows.json -UseBasicParsing |
  Select-Object -ExpandProperty Content
```

看 `tmp\_package_desktop.out` / `tmp\_upload_desktop_only.out` 末行 **`EXIT=0`**，且 D 的 `version` 与本次安装包一致 → 上传成功。  
再按 §4.1 冷启冒烟（能进壳、知识库/公司共享符合本次是否打种子）→ 本次发版结束。
