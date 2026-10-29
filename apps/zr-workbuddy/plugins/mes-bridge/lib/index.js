/**
 * mes-bridge —— 唯一常驻 Cordis 包（热插拔宿主）。
 *
 * Cordis 规范：ctx.plugin → Fiber；dispose 卸工具；inject 声明硬依赖。
 * 本应用约定：engine/data/plugins.json 为启停真相源；features/ 热插拔，面板壳常驻。
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { defineTool } from "@deepseek-ai/dsh-tools";
import * as runtime from "@dsh-external/mes-runtime";
import {
  appendFirstToolLog,
  buildHostTriageFromDisk,
  clearCodingAskDenyReason,
  codingMessageWithCachedDirectory,
  cwdFromSessions,
  formatDirectoryBlock,
  isDisposableHostUserSource,
  loadCachedProfile,
} from "./triage-pack.js";
import {
  codingToolHasImages,
  duplicateCodingConfirmBlock,
  findLatestChatJob,
  readChatJob,
} from "./coding-dup-guard.js";
import {
  enrichCodingExecImageLocate,
  rewriteCodingExecImages,
} from "./coding-image-localize.js";
import {
  enrichContinueExecHandoff,
  writableExecArguments,
} from "./coding-continue-handoff.js";
import { holdCodingToolResult } from "./coding-hold.js";
import { enrichCodingToolResultWithChatBody } from "./coding-chat-body.js";
import {
  applyRecoveredToolResult,
  recoverFailedChatJobIfNeeded,
} from "./coding-db-recover.js";
import { blockCodingIfZodBroken } from "./coding-zod-gate.js";
import {
  execCallId,
  scheduleCodingAutoConfirm,
  scheduleHostAutoStartClearCoding,
} from "./coding-auto-confirm.js";
import {
  adoptAndHoldCodingJob,
  findAdoptableCodingJob,
} from "./coding-adopt.js";
import {
  persistCodingWorkspace,
  resolveCodingWorkspace,
} from "./coding-workspace.js";
import {
  installSessionV4SourceShim,
  patchAgentInject,
} from "./session-v4-source.js";

export const name = "dsh-mes-bridge";
export const inject = ["tools"];

const DSH_CURSOR_PKG = "@zhongruan/dsh-cursor-coding";
const DSH_CURSOR_BEGIN = "zr_cursor_begin";
const DSH_CHAT_PKG = "@zhongruan/dsh-cursor-chat";
const DSH_CHAT_BEGIN = "zr_cchat_begin";
const WB_CODE_DEV = "code-dev";
const WB_BEGIN = "mes_code_dev_begin";
const WB_DEV_PIPELINE = "dev-pipeline";

/** 人员「写码」能力缓存：默认放行（防误伤）；关掉后拦对话写码 begin */
var codingCapCache = { at: 0, allowed: true, detail: "" };

function refreshCodingCapabilityCache() {
  return runtime
    .runEngine(["coding-allowed"], 4000)
    .then(function (out) {
      var allowed = !(out && out.ok === true && out.allowed === false);
      codingCapCache = {
        at: Date.now(),
        allowed: allowed,
        detail: String((out && (out.detail || out.reply)) || "").trim(),
      };
      return codingCapCache;
    })
    .catch(function () {
      // 探活失败不拦（与引擎 deny 无执行人放行一致）
      return codingCapCache;
    });
}

function codingCapabilityDeniedMessage() {
  return (
    codingCapCache.detail ||
    "当前账号没有「写码（Cursor 对话写码）」能力，无法使用。请联系管理员开通。"
  );
}

function dshHomeDirs() {
  const out = [];
  if (process.env.DSH_HOME) out.push(String(process.env.DSH_HOME));
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home) {
    out.push(path.join(home, ".dsh"));
    out.push(path.join(home, ".dsh-workbuddy"));
  }
  return [...new Set(out)];
}

function isDshBundleOn(pkgName) {
  const want = String(pkgName || "");
  if (!want) return false;
  for (const home of dshHomeDirs()) {
    const p = path.join(home, "profiles", "web", "package.json");
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      const bundles = (((data.dsh || {}).profile || {}).bundles || []).map(String);
      if (bundles.includes(want)) return true;
    } catch {
      /* 读不到该 profile 则跳过 */
    }
  }
  return false;
}

function isDshCursorBundleOn() {
  return isDshBundleOn(DSH_CURSOR_PKG);
}

function isDshCursorChatBundleOn() {
  return isDshBundleOn(DSH_CHAT_PKG);
}

function toolNameSet(ctx) {
  try {
    const schemas =
      ctx && ctx.tools && typeof ctx.tools.schemas === "function" ? ctx.tools.schemas() : [];
    return new Set((schemas || []).map((s) => s && s.name).filter(Boolean));
  } catch {
    return new Set();
  }
}

function codingBegin(ctx) {
  // 与 coding_mutex 一致：唯一写码入口 = 对话写码；禁止回退旧 coding / code-dev。
  const tools = toolNameSet(ctx);
  if (isDshCursorChatBundleOn() || tools.has(DSH_CHAT_BEGIN)) return DSH_CHAT_BEGIN;
  return "";
}

function bannedOtherWriteTools(_begin) {
  return "`" + WB_BEGIN + "` / `" + DSH_CURSOR_BEGIN + "` / 旧「本机写码」单卡";
}

function buildRouteTable(begin) {
  const writeTool = begin || DSH_CHAT_BEGIN;
  const installed = begin === DSH_CHAT_BEGIN;
  return [
    "## ZR-WorkBuddy 意图分流（强制 · 先看这张表）",
    "| 用户意图 | 本轮第一个工具 | 禁止误用 |",
    "| --- | --- | --- |",
    "| **输入框旁绿色「需求→上线」已开**（改代码/贴图/追问同走过程流） | `mes_dev_pipeline_begin` | **禁止** `" +
      writeTool +
      "` / 任何写码确认单卡 |",
    "| 改代码 / 改页面 / 改菜单 / 删除界面·页面·菜单（「需求→上线」**关闭**＝普通写码；**可贴图**） | `" +
      writeTool +
      "`（workspace=工程绝对路径；message=原话；有图填 images）" +
      (installed ? "" : " · **须已安装 Cursor 对话写码**") +
      " | 意图已够清晰时**立刻**本工具（不要先问卷）；**禁止** `mes_dev_pipeline_begin`；也禁止 " +
      bannedOtherWriteTools(begin) +
      "；**禁止回退**旧 `zr_cursor_*` / `mes_code_dev_*`。仅需求模糊、无法判断车道时才底座追问 |",
    "| 代码审核 / 审码 / code review / 看看改动 | `mes_code_review_begin` | 不是写码 begin、不是 git diff |",
    "| 提交代码 / git commit / push 本批 | `mes_code_commit_begin` | 不是 `mes_code_review_run`、不是 Bash git |",
    "| 部署 / 上线 / 预发 / 发布服务器（开关关闭时） | `mes_code_deploy_begin` | 不是 SSH/rsync 自部署 |",
    "| MES 查产量良率工单 | `mes_ask` | 不是写码 |",
    "| PCB 工艺问答 | `mes_pcb` | 不是 MES 查数 |",
    "| 工艺/制度/规划/口径/**计价规则**等知识问答 | **成员必须**先调 `mes_company_knowledge`；管理员可自动双源 | 工具 `ok=false` 时**禁止**用记忆/旧会话补价表或正文 |",
  ].join("\n");
}

function buildCodeDevPrompt(begin) {
  if (!begin) {
    return [
      "## 本机写码路由（唯一入口）",
      "当前未启用 **Cursor 对话写码**（`@zhongruan/dsh-cursor-chat` / `" +
        DSH_CHAT_BEGIN +
        "`）。",
      "用户要写码时：**禁止** Bash/Write 改盘，**禁止**回退 `" +
        WB_BEGIN +
        "` / `" +
        DSH_CURSOR_BEGIN +
        "`，禁止编造工具。",
      "请到设置 → 插件市场安装并启用「Cursor 对话写码」，再重试。",
    ].join("\n");
  }
  return [
    "## ZR-WorkBuddy 写码路由（强制 · 唯一入口）",
    "0. **若输入框旁绿色「需求→上线」已开：禁止调用 `" +
      begin +
      "`**，也禁止任何写码确认单卡；第一个工具必须是 `mes_dev_pipeline_begin`。",
    "当「需求→上线」**关闭**（界面显示「普通写码」）且用户要改代码、改页面、改菜单、挪菜单、加功能、做报表页、Cursor 写码、删除菜单子项时（**不是**审码/提交/部署）：",
    "0b. **唯一写码入口是 `" +
      DSH_CHAT_BEGIN +
      "`（Cursor 对话写码）**：像跟 Cursor 聊；可贴图。换任意工程目录均可，按当前工作区画像/原话灵活处理，禁止硬套某一家 ERP 目录。" +
      "若 message 内已有【工作区目录画像】：**必须遵守**其中的栈与目录提示；禁止套用其它仓库路径。无画像时仍可写，勿假造目录。",
    "0c. 参数：`workspace`=当前工程绝对路径（必填）、`message`=用户原话（必填）、有附图时填 `images`（优先 `vimg-…` id 或本机绝对路径；**禁止**只传 `http(s)://…/api/vision/images/…` —— 本地 Cursor SDK 不接受 URL 图，会直接失败）。桥接会尽量把 vimg/引擎附图 URL 转成可用形态。",
    "0d. **有附图：直接调 `" +
      DSH_CHAT_BEGIN +
      "`，不必先 `mes_vision_understand`**（对话写码自己多模态看图）。**禁止**因贴图改调 `mes_dev_pipeline_begin`。" +
      " **贴图→定位**：message 会带【贴图定位】时，写码须**先根据截图指出问题区域/控件/文案**，再做最小相关改动；禁止不看图整页重写。",
    "0e. **灵活**：原话已稳命中写码（改/删页面·菜单·功能等）→**立刻**调 `" +
      DSH_CHAT_BEGIN +
      "`（message=用户原话），**不要**先问卷；不要按固定「先问再写」顺序。",
    "0f. **仅当模糊**（对不上分流表，或同时像写码与查数/建单等）：底座追问只给车道级短选项；用户确认写码后，下一轮立刻 `" +
      DSH_CHAT_BEGIN +
      "`（message=原需求），禁止再问卷。",
    "1. **禁止回退** `" +
      WB_BEGIN +
      "` / `" +
      DSH_CURSOR_BEGIN +
      "` / 任何「本机写码 · 选目录」旧卡。",
    "2. **禁止**用 `run_code` / code-mode，以及 Bash / Grep / Glob / Read / Write / StrReplace 去扫或改用户工程来「完成写码」。",
    "3. **禁止**先长思考、先查 Vite/日志/HMR。",
    "4. **写码进度卡还在跑时：不要再调任何工具，不要写任何文字，不要思考出声。** 等当前 `zr_cchat_begin` / `zr_cchat_continue` 自己返回。返回且状态已是 succeeded / failed / cancelled 后，立刻 `zr_cchat_finish` 把 `chat_body` 写成结论。禁止用 Pwsh / Bash / Start-Sleep / sleep 空等。终态后禁止只复读「已同步 N 个文件」、禁止聊天留空、禁止同一原话再开续改确认卡。成功但未落盘不得说已经修好。禁止在 bridge/聊天里代跑测试或起 Vite。",
    "5. **续改只能由用户发起**：用户没说新修改点时，禁止自行 `zr_cchat_continue` / 再开确认卡。上一轮**失败**且用户仍要修同一问题时：**必须** `zr_cchat_continue`，且 **必须**带 `parent_job_id`=失败任务 id（系统也会补钉；会注入【系统续改交接】并禁再碰 *.db）；插件仍会出「续改确认」卡（HITL）——正文须说明「上一轮失败了、请点续改确认卡继续」。成功后禁止用同一原话再 continue。",
    "5b. **失败后优先 continue、勿无故 begin**：尤其 Network / `retryable=true` 失败，同句重试只用 continue；禁止为「再试一次」改调 `" +
      DSH_CHAT_BEGIN +
      "`。仅当用户明确要求重开/换工程，或提出与上一轮无关的新需求时才 begin。",
    "5c. **改动范围门禁（最小 diff）**：写码/续改须优先最小改动面；只改与本轮诉求相关的文件。" +
      "续改时若 message 含【系统续改交接】或已同步文件清单：**先对照清单**，禁止重做无关文件、禁止整页重写或顺手大重构；用户未点名时不要扩大范围。" +
      "（提示层门禁，非插件文件数硬限额。）",
    "6. **禁止编造确认卡**。需求已明确（新增/删除报表、页面、菜单、入口）时：**禁止** `ask_user_question`（含「入口位置」「新增范围」）；入口默认跟现有同类功能，结论里写清验收路径。只有主聊天出现对话写码工具卡才算已发出。",
    "7. `" +
      DSH_CHAT_BEGIN +
      "` / continue 若返回 pending_confirm / silent：回复留空或只写一句「上一轮未完成，请点续改确认卡继续」，等用户在卡上确认。**一旦工具返回已完成/失败结论**：必须把结论说给用户听，不要再问卷、不要再开第二张确认卡。",
    "8. **禁止**创建/修改/同步任何 `*.db` / `*.sqlite` / `erp.db`（库被本机后端占用时同步会 EPERM 整单失败）。表结构只改 migrate/源码，重启后端重建；库文件不是写码产物。",
    "8b. 若失败 detail 含 `Network request failed` / `retryable=true`：转告用户是**出网/写码云抖动**，本轮通常未改到工程；**禁止**说成「需求不清」或「已经改好了」。下一步：同句 `zr_cchat_continue` + `parent_job_id`，让用户点续改确认卡重试。",
    "9. 写码不会自动 git commit；提交用 `mes_code_commit_begin`；部署用 `mes_code_deploy_begin`。",
  ].join("\n");
}

const WORKBUDDY_CODE_REVIEW_PROMPT = [
  "## ZR-WorkBuddy 审码路由（强制）",
  "当用户说「审核代码 / 审码 / code review / 代码审核 / 看看改动有没有问题 / 帮我 review」时：",
  "1. **本轮第一个工具调用必须是 `mes_code_review_begin`**（不是 `mes_code_dev_begin`，不是 Bash / Grep / Read / git）。",
  "2. **禁止**用 Bash 执行 `git diff` / `git status` / `git log` / `git show` / `grep` / `rg` 扫仓代审；审码走引擎 `code-review` 车道 + 主聊天工具卡。",
  "3. **禁止**用 `mes_code_dev_begin` 处理纯审码诉求（不写码、不改菜单、不删文件）。",
  "4. 工具卡内：选目录 → 勾选文件 → 点「开始审核」；确认前禁止 `mes_code_review_run`。",
  "5. `mes_code_review_begin` 返回后回复留空或仅一句「请在上方审码工具卡操作」，禁止复述 diff 结论。",
  "6. 提交前门禁 findings 走 `mes_code_commit_begin`，**不要**用 `mes_code_review_run` 代替提交门禁。",
  "示例：「代码审核」→ 立刻 `mes_code_review_begin()`，不要先 ls / git status。",
].join("\n");

const WORKBUDDY_CODE_COMMIT_PROMPT = [
  "## ZR-WorkBuddy 提交路由（强制）",
  "当用户说「提交代码 / 帮我 commit / push / 提交本批 / 提交门禁」时：",
  "1. **本轮第一个工具调用必须是 `mes_code_commit_begin`**（不是 Bash git、不是 `mes_code_review_run`）。",
  "2. **禁止** Bash 执行 `git add` / `git commit` / `git push`；提交须经工具卡门禁 → 人确认。",
  "3. **禁止**用全量审码 `mes_code_review_run` 代替提交门禁 findings 列表。",
  "4. 工具卡内：选目录 → 勾选文件 → 跑门禁 → 确认后才 commit/push。",
  "5. `mes_code_commit_begin` 返回后回复留空，禁止口头代用户确认。",
  "示例：「提交代码」→ 立刻 `mes_code_commit_begin()`。",
].join("\n");

const WORKBUDDY_CODE_DEPLOY_PROMPT = [
  "## ZR-WorkBuddy 一体部署路由（强制）",
  "当用户要部署到预发/上线、自动化部署、发布到服务器时：",
  "1. **本轮只调用一次 `mes_code_deploy_begin`**，参数全部留空即可（默认 staging）。",
  "2. **禁止**传 env=production/prod；**禁止**再调 prepare/confirm；**禁止**失败后换参数重试出第二张卡。",
  "3. **禁止** Bash SSH/rsync/scp 自部署；出卡后回复留空，等用户点确认部署。",
  "示例：「部署上线」→ 立刻 `mes_code_deploy_begin()`。",
].join("\n");

const WORKBUDDY_DEV_PIPELINE_PROMPT_ON = [
  "## 本会话写码模式（强制 · 以输入框旁开关为准）",
  "**当前开关 = 需求→上线（已选）**。",
  "**禁止**先 `mes_dev_pipeline_status` / `mes_vision_understand` 再犹豫；**第一个工具直接** `mes_dev_pipeline_begin(message=用户原话)`（dsh_session_id 宿主自动注入）。",
  "用户消息里若含「【附图:vimg-…】」或「【已附图…】」，附图已在引擎 pending，begin 会自动合并识图；**禁止**再单独调 mes_vision_understand 当主入口。",
  "**禁止**把宿主沙箱提示（Current DSH file policy / Approval policy / workspace-write）当作 message 传给 begin；那是系统句不是需求。有贴图时 message 可写用户原话或省略，引擎会以识图为准。",
  "1. **禁止**开跑前用 `ask_user_question` /「新增范围」多选卡抢 UI；**第一个工具直接** `mes_dev_pipeline_begin(message=用户原话)`，过程只在时间线卡上展开。",
  "2. **场景由 pipeline 按需求推断（灵活）**：全栈新页 / 只前端 / 只后端 / 修 bug / 重构 / 既有增强 / 占位 / 配置 / 脚本CI / 自适应等。" +
    "需要的面做全，不需要的不强行凑菜单+路由+接口；用户原文可显式收窄或放大。",
  "3. 开跑后进度只看那一张过程流卡；**禁止用 advance 刷 UI**；**禁止**让用户去点「对话写码·确认」。",
  "3b. **用户追问/补充/贴新图**：仍调 `mes_dev_pipeline_begin(message=追问原话)` → 引擎**新开独立 Run**（结束旧过程流，不并账本），" +
    "但**同一会话须关联上一任务上下文**（工程目录/上一需求摘要已注入，禁止当空白新项目）。" +
    "**禁止**只调 `mes_dev_pipeline_advance`；**禁止**口头说「已并入同一过程流」。",
  "4. **禁止** `zr_cchat_begin` / `zr_cursor_begin` / `mes_code_dev_begin` / **任何「对话写码·确认」卡**。" +
    "第 5 步由引擎 auto_run 直连写码插件改盘（流水线代签 HITL），主聊天**绝不**再出写码确认框。" +
    "Agent 全程不得调用写码 begin；进度只看过程流时间线。",
  "5. **禁止**跳过 pipeline 直接 `mes_code_review_begin` / `mes_code_commit_begin` / `mes_code_deploy_begin`，除非时间线已到对应步且为 waiting_hitl。",
].join("\n");

/** 按输入框旁开关动态注入：关=普通写码禁 begin；开=一体化强制 begin */
function buildDevPipelineRoutePrompt(flowOn, begin) {
  const writeTool = begin || "当前已启用的写码 begin 工具";
  if (!flowOn) {
    const imgHint =
      begin === DSH_CHAT_BEGIN
        ? "有附图：直接 `" +
          writeTool +
          "`（images 传 vimg-… 或本机路径，勿传 http 附图 URL），不必先 mes_vision_understand；写码须先按截图定位问题区域再改。"
        : "有附图：先 `mes_vision_understand`，再 `" + writeTool + "`。";
    return [
      "## 本会话写码模式（强制 · 以输入框旁开关为准）",
      "**当前开关 = 普通写码**（未选绿色「需求→上线」）。",
      "**绝对禁止**调用 `mes_dev_pipeline_begin`，也禁止出「需求→上线」过程流卡 / 10 步时间线。",
      "用户要改代码 / 改页面 / 删除或新增界面·页面·菜单·报表：灵活判定，已稳命中写码则**立刻** `" +
        writeTool +
        "`（message=原话）。**禁止**先 `ask_user_question` 问入口位置/新增范围。" +
        imgHint,
      "写码进度卡还在跑时不要再调工具、不要写文字。进度卡已结束且没有更新的未终态任务：立刻 `zr_cchat_finish` 交 `chat_body` 结论。禁止 Pwsh/Start-Sleep 空等。失败后续改须 `zr_cchat_continue` + `parent_job_id`。Network / 空同步假成功优先同句 continue。遵守【工作区目录画像】；优先最小 diff。",
      "仅需求模糊（对不上或同时像多条车道）时：底座只问车道级短选项；确认写码后下一轮立刻 `" +
        writeTool +
        "`。绿色「需求→上线」开着时仍禁止开跑前问卷。",
      "不要因为贴了表格截图、说了「改一下 / 去掉配置 / 库存」就自行改走一体化。",
      "只有用户把输入框旁开关拨成绿色「需求→上线」后，才允许一体化。",
    ].join("\n");
  }
  return WORKBUDDY_DEV_PIPELINE_PROMPT_ON;
}

/** 磁盘写入类工具：禁止绕过 code-dev 沙箱+HITL 直接改用户工程 */
const DISK_WRITE_TOOLS = new Set([
  "Write",
  "write",
  "StrReplace",
  "str_replace",
  "Edit",
  "edit",
  "Delete",
  "delete",
  "ApplyPatch",
  "apply_patch",
  "MultiEdit",
  "multi_edit",
  "NotebookEdit",
  "notebook_edit",
]);

function bashLooksLikeDiskWrite(raw) {
  const s = String(raw || "");
  if (!s.trim()) return false;
  if (/(^|[\s;|&])(rm|mv|cp|install|tee|truncate|chmod|chown|ln)\b/i.test(s)) return true;
  if (/(^|[\s;|&])sed\s+(-[^\s]*i|--in-place)/i.test(s)) return true;
  if (/(^|[\s;|&])perl\s+(-[^\s]*i)/i.test(s)) return true;
  if (/(^|[^=])>{1,2}\s*\S/.test(s) && !/>&\s*\d/.test(s)) return true;
  if (/\b(git\s+(add|commit|push|checkout|reset|clean|rebase|merge)|npm\s+install|pnpm\s+i|yarn\s+add)\b/i.test(s))
    return true;
  return false;
}

/** Bash 读盘代审：禁止 git diff/status 等绕过 mes_code_review_begin */
function bashLooksLikeManualCodeReview(raw) {
  const s = String(raw || "");
  if (!s.trim()) return false;
  if (/\bgit\s+(diff|status|log|show|blame)\b/i.test(s)) return true;
  if (/\b(rg|grep|find)\b[\s\S]{0,120}\.(vue|tsx?|jsx?|py|go|java)\b/i.test(s)) return true;
  if (/\bls\b[\s\S]{0,80}(src|router|menu|views)/i.test(s)) return true;
  return false;
}

/** 用 shell 睡眠等写码 Job：主聊天回合不结束，界面一直 Deep diving */
function bashLooksLikeCodingWait(raw) {
  const s = String(raw || "");
  if (!s.trim()) return false;
  if (/\b(start-sleep|sleep)\b/i.test(s)) return true;
  if (/\btimeout\s+\/t\b/i.test(s)) return true;
  if (/wait\s+before\s+collect/i.test(s)) return true;
  return false;
}

/** Bash 自部署：禁止 ssh/rsync 绕过 mes_code_deploy_begin */
function bashLooksLikeManualDeploy(raw) {
  const s = String(raw || "");
  if (!s.trim()) return false;
  if (/\b(ssh|rsync|scp|sftp)\b/i.test(s)) return true;
  if (/\bansible-playbook\b/i.test(s)) return true;
  return false;
}

function toolExecPayload(exec) {
  if (!exec || typeof exec !== "object") return "";
  const parts = [];
  for (const k of ["args", "arguments", "input", "params", "command", "cmd", "code", "script"]) {
    const v = exec[k];
    if (v == null) continue;
    if (typeof v === "string") parts.push(v);
    else {
      try {
        parts.push(JSON.stringify(v));
      } catch {
        parts.push(String(v));
      }
    }
  }
  return parts.join("\n");
}


const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** plugins/mes-bridge/lib → apps/zr-workbuddy */
const APP_ROOT = path.join(__dirname, "..", "..", "..");
const ENGINE_DIR = path.join(APP_ROOT, "engine");
const FEATURES_DIR = path.join(APP_ROOT, "features");
const STATE_PATH = path.join(ENGINE_DIR, "data", "plugins.json");
const DP_SESSION_MODES = path.join(ENGINE_DIR, "data", "dev_pipeline", "session_modes");
const DP_RUNS_DIR = path.join(ENGINE_DIR, "data", "dev_pipeline", "runs");
const POLL_MS = 1200;

function execSessionId(exec) {
  try {
    const agent = exec && exec.agent;
    // 优先聊天 session.id（与 session_modes 文件名一致）；agent.id 常是 Agent 实例 id，对不上开关
    const sid =
      (agent && agent.session && agent.session.id) ||
      (agent && agent.sessionId) ||
      (exec && exec.sessionId) ||
      (agent && agent.id) ||
      "";
    return String(sid || "").trim();
  } catch {
    return "";
  }
}

function sessionModePath(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return "";
  const safe = sid.replace(/[^\w\-.:@+/]/g, "_").slice(0, 160);
  return path.join(DP_SESSION_MODES, safe + ".json");
}

function sessionModeFileExists(sessionId) {
  const fp = sessionModePath(sessionId);
  if (!fp) return false;
  try {
    return fs.existsSync(fp);
  } catch {
    return false;
  }
}

function readSessionIntegratedFlow(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid || !readEnabled().includes(WB_DEV_PIPELINE)) return false;
  const fp = sessionModePath(sid);
  let fileOn = null;
  try {
    const doc = JSON.parse(fs.readFileSync(fp, "utf8"));
    fileOn = !!doc.integrated_flow_enabled;
  } catch {
    fileOn = null; // 无文件 / 坏文件
  }
  if (fileOn === true) return true;
  // 与引擎 session_mode.get_integrated 对齐：进行中 Run → 视为开
  if (findLatestOpenPipelineRun(sid)) return true;
  // 旧一体化任务：无 session_modes 但有过过程流 Run（含已结束）→ 视为开，避免 UI 关着仍拦确认卡
  if (fileOn === null && findAnyPipelineRunForSession(sid)) return true;
  return false;
}

/** 本会话是否有过任何过程流 Run（含 done/failed），供旧任务开关对齐。 */
function findAnyPipelineRunForSession(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid || !fs.existsSync(DP_RUNS_DIR)) return null;
  let best = null;
  let files = [];
  try {
    files = fs.readdirSync(DP_RUNS_DIR);
  } catch {
    return null;
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const run = JSON.parse(fs.readFileSync(path.join(DP_RUNS_DIR, f), "utf8"));
      if (String(run.dsh_session_id || "") !== sid) continue;
      if (
        !best ||
        Number(run.updated_at || run.created_at || 0) >
          Number(best.updated_at || best.created_at || 0)
      ) {
        best = run;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

/** 聊天 session（session-… 或已有 session_modes 文件）。agent 实例 id 不是。 */
function isChatSessionId(id) {
  const s = String(id || "").trim();
  if (!s) return false;
  if (s.startsWith("session-") || s.startsWith("session_")) return true;
  return sessionModeFileExists(s);
}

/**
 * 解析会话 id：优先能对上开关文件的聊天 session。
 * exec 上经常只有 agent 实例 id；若它与 active 相同就提前返回，会把一体化开关读丢，
 * guard 放行 zr_cchat_begin，确认卡就会留下。
 */
function resolveIntegratedSessionId(exec) {
  const fromExec = execSessionId(exec);
  const active = String(activeDshSessionId || "").trim();
  if (fromExec && isChatSessionId(fromExec)) return fromExec;
  if (active && isChatSessionId(active)) return active;
  if (fromExec) return fromExec;
  return active;
}

function findPipelineRunForSession(sessionId, stepId, stepStatus) {
  const sid = String(sessionId || "").trim();
  if (!sid || !fs.existsSync(DP_RUNS_DIR)) return null;
  let best = null;
  let files = [];
  try {
    files = fs.readdirSync(DP_RUNS_DIR);
  } catch {
    return null;
  }
  const closed = new Set(["cancelled", "canceled", "done", "failed"]);
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const run = JSON.parse(fs.readFileSync(path.join(DP_RUNS_DIR, f), "utf8"));
      if (String(run.dsh_session_id || "") !== sid) continue;
      // 已结束的 Run 不得当作步骤交接（否则会误放行 zr_cursor_begin）
      if (closed.has(String(run.status || ""))) continue;
      if (stepId && String(run.current_step || "") !== String(stepId)) continue;
      if (stepStatus) {
        const st = (run.steps || []).find((s) => String(s.step_id) === String(stepId));
        if (!st || String(st.status) !== String(stepStatus)) continue;
      }
      if (
        !best ||
        Number(run.updated_at || run.created_at || 0) >
          Number(best.updated_at || best.created_at || 0)
      ) {
        best = run;
      }
    } catch {
      /* skip corrupt run file */
    }
  }
  return best;
}

function pipelineCodingHandoff(sessionId) {
  return findPipelineRunForSession(sessionId, "5", "waiting_hitl");
}

/** 是否为直接写码 begin / 续写工具（对话写码 / 旧 coding / code-dev） */
function isDirectCodingToolName(name) {
  const n = String(name || "");
  return (
    n === DSH_CHAT_BEGIN ||
    n.indexOf("zr_cchat_") === 0 ||
    n === DSH_CURSOR_BEGIN ||
    n.indexOf("zr_cursor_") === 0 ||
    n === WB_BEGIN ||
    n.indexOf("mes_code_dev_") === 0
  );
}

/**
 * 一体化开着（或该会话仍有进行中 Run）：拦写码 begin，避免确认卡。
 * 只认传入的 sid，不用「另一个会话的 active」误伤普通写码。
 */
function shouldSoftSkipPipelineCoding(sessionId, toolName) {
  if (!isDirectCodingToolName(toolName)) return false;
  const sid = String(sessionId || "").trim();
  if (!sid) return false;
  if (readSessionIntegratedFlow(sid)) return true;
  if (findLatestOpenPipelineRun(sid)) return true;
  return false;
}

function codingToolMessageFromExec(exec) {
  const args = (exec && exec.arguments) || {};
  const msg = String(args.message || args.text || args.prompt || "").trim();
  return msg;
}

const _OPEN_RUN_STATUS = new Set(["queued", "running", "paused", "cancelling"]);

function findLatestOpenPipelineRun(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid || !fs.existsSync(DP_RUNS_DIR)) return null;
  let best = null;
  let files = [];
  try {
    files = fs.readdirSync(DP_RUNS_DIR);
  } catch {
    return null;
  }
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    try {
      const run = JSON.parse(fs.readFileSync(path.join(DP_RUNS_DIR, f), "utf8"));
      if (String(run.dsh_session_id || "") !== sid) continue;
      if (!_OPEN_RUN_STATUS.has(String(run.status || ""))) continue;
      if (
        !best ||
        Number(run.updated_at || run.created_at || 0) >
          Number(best.updated_at || best.created_at || 0)
      ) {
        best = run;
      }
    } catch {
      /* skip */
    }
  }
  return best;
}

function extractUserMessageText(data) {
  const content = data && data.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map(function (b) {
        if (!b || b.type !== "text") return "";
        return String(b.text || "");
      })
      .join("\n")
      .trim();
  }
  if (content && typeof content.text === "string") return content.text.trim();
  return "";
}

function isRealUserMessageSource(source) {
  if (!source || typeof source !== "object") return true;
  return !isDisposableHostUserSource(source);
}

function looksLikePipelineCancelText(text) {
  const msg = String(text || "").trim();
  if (!msg || msg.length > 40) return false;
  return /^(暂停|取消|停止)(此)?(任务|流水线|跑)?[!！。.\s]*$/u.test(msg)
    || /^(pause|cancel|stop)(\s+(the\s+)?(task|pipeline|run))?[!！.\s]*$/i.test(msg);
}

/** 宿主 skill-catalog / system-reminder / 记忆库偏好等注入，禁止当成用户需求自动 begin */
function looksLikeHostInjectedNoise(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  if (/Time sampled while preparing turn\b/i.test(t)) return true;
  if (/<system-reminder>/i.test(t)) return true;
  if (/<\/?available_skills>/i.test(t)) return true;
  if (/A skill is a reusable set of task-specific instructions/i.test(t)) return true;
  if (/skill-catalog/i.test(t) && t.length > 200) return true;
  if (/Knowledge bases mounted/i.test(t)) return true;
  if (/Knowledge-first retrieval/i.test(t)) return true;
  // 整段几乎只有记忆库偏好、没有产品改动动词 → 禁止自动开跑
  const prefHits = (t.match(/^\s*[-*•]?\s*\[preference\]/gim) || []).length;
  const summaryHits = (t.match(/^\s*[-*•]?\s*\[summary\]/gim) || []).length;
  if (prefHits + summaryHits >= 2 && !/(删除|删掉|新增|增加|修改|修复|隐藏|下线)/.test(t)) {
    return true;
  }
  if (
    /^\s*-\s*\[preference\]/m.test(t) &&
    /mes_dev_pipeline_begin/.test(t) &&
    !/(删除|删掉|新增|增加|修改|修复|隐藏|下线)/.test(t)
  ) {
    return true;
  }
  return false;
}

/** 开跑前剥掉知识库协议尾巴，尽量留下用户真需求 */
function stripHostMemoryNoiseForBegin(text) {
  let t = String(text || "");
  const cut = t.search(/Knowledge bases mounted|Knowledge-first retrieval/i);
  if (cut >= 0) t = t.slice(0, cut);
  return t.trim();
}

async function maybeCancelIntegratedPipeline(sessionId, text) {
  const sid = String(sessionId || "").trim();
  const msg = String(text || "").trim();
  if (!sid || !looksLikePipelineCancelText(msg)) return false;
  if (!readEnabled().includes(WB_DEV_PIPELINE)) return false;
  const open = findLatestOpenPipelineRun(sid);
  if (!open || !open.run_id) return false;
  activeDshSessionId = sid;
  try {
    await runtime.runEngine([
      "dev-pipeline-cancel",
      String(open.run_id),
      "reason=用户输入：" + msg.slice(0, 20),
    ]);
    return true;
  } catch (e) {
    console.warn("[mes-bridge] 一体化取消失败", e && e.message ? e.message : e);
    return false;
  }
}

async function maybeAutoBeginIntegratedPipeline(sessionId, text) {
  const sid = String(sessionId || "").trim();
  const rawMsg = String(text || "").trim();
  const msg = stripHostMemoryNoiseForBegin(rawMsg);
  if (!sid || msg.length < 2) return;
  if (!readEnabled().includes(WB_DEV_PIPELINE)) return;
  if (!readSessionIntegratedFlow(sid)) {
    // 普通写码：绝不自动开一体化（开关以 session_modes 文件为准）
    return;
  }
  if (looksLikePipelineCancelText(msg)) return;
  if (looksLikeHostInjectedNoise(rawMsg) || looksLikeHostInjectedNoise(msg)) return;
  // 有进行中 Run 也要 begin：引擎对追问会结束旧 Run 并新开独立任务（勿在此提前 return）
  activeDshSessionId = sid;
  console.log(
    "[mes-bridge] 一体化自动 begin：session=" +
      sid.slice(0, 48) +
      " msgLen=" +
      msg.length,
  );
  try {
    await runtime.runEngine([
      "dev-pipeline-begin",
      "message=" + msg,
      "dsh_session_id=" + sid,
    ]);
  } catch (e) {
    console.warn("[mes-bridge] 一体化自动 begin 失败", e && e.message ? e.message : e);
  }
}

const INTEGRATED_CODING_TOOLS = new Set([
  "ask_user_question",
  "AskUserQuestion",
]);

function listFeatureIds() {
  if (!fs.existsSync(FEATURES_DIR)) return [];
  return fs
    .readdirSync(FEATURES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(FEATURES_DIR, d.name, "index.js")))
    .map((d) => d.name)
    .sort();
}

function readManifest(id) {
  const p = path.join(FEATURES_DIR, id, "manifest.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { id, name: id, purpose: "" };
  }
}

function featureMtime(id) {
  try {
    return fs.statSync(path.join(FEATURES_DIR, id, "index.js")).mtimeMs;
  } catch {
    return 0;
  }
}

/** 读可无锁（写方 atomic replace）；启停变更一律走 Python plugins_store（flock）。 */
function readEnabled() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
    if (Array.isArray(data.enabled)) return data.enabled.map(String);
  } catch {
    /* default: all */
  }
  return listFeatureIds();
}

function resolveBridgePython() {
  const cands = [
    runtime.PYTHON,
    process.env.APP_ENGINE_PYTHON,
    "python3",
    "python",
    process.platform === "win32" ? "py" : "",
    "/usr/local/bin/python3",
    "/Library/Frameworks/Python.framework/Versions/3.12/bin/python3",
    "/opt/homebrew/bin/python3",
  ].filter(Boolean);
  const seen = new Set();
  for (const c of cands) {
    const bin = String(c);
    if (seen.has(bin)) continue;
    seen.add(bin);
    try {
      const prefix = path.basename(bin).toLowerCase() === "py" ? ["-3"] : [];
      execFileSync(bin, [...prefix, "-c", "import sys; assert sys.version_info[:2] >= (3, 10)"], {
        encoding: "utf8",
        timeout: 4000,
        windowsHide: true,
      });
      return bin;
    } catch (e) {
      /* try next */
    }
  }
  throw new Error(
    "找不到可用的 Python 3.10+（plugins_store）。请安装 Python 3.10+，或在 runtime.yaml / APP_ENGINE_PYTHON 指定解释器。",
  );
}

function pluginsStore(op, idOrJson) {
  const args = ["-m", "app.plugins_store", op];
  if (idOrJson != null && idOrJson !== "") args.push(String(idOrJson));
  let bin;
  try {
    bin = resolveBridgePython();
  } catch (e) {
    throw new Error(String(e && e.message ? e.message : e));
  }
  try {
    const prefix = path.basename(String(bin)).toLowerCase() === "py" ? ["-3"] : [];
    const out = execFileSync(bin, [...prefix, ...args], {
      cwd: ENGINE_DIR,
      encoding: "utf8",
      timeout: 8000,
      windowsHide: true,
    });
    return JSON.parse(String(out).trim() || "{}");
  } catch (e) {
    const detail = String((e && (e.stderr || e.message)) || e).slice(0, 400);
    throw new Error("plugins_store 调用失败（python=" + bin + "）：" + detail);
  }
}

/** 宿主 Node 侧工具执行时的当前 DSH 会话（浏览器 __wbDshSessionId 此处不可用） */
let activeDshSessionId = "";

function noteActiveDshSessionId(exec) {
  try {
    patchAgentInject(exec && exec.agent);
  } catch {
    /* ignore */
  }
  const sid = execSessionId(exec);
  if (!sid) return;
  const prev = String(activeDshSessionId || "").trim();
  // 工具回调里的 agent 实例 id 不能覆盖已经记下的聊天 session。
  if (prev && isChatSessionId(prev) && !isChatSessionId(sid)) return;
  activeDshSessionId = sid;
}

function devPipelineArgsNeedSession(cmd, rest) {
  if (!cmd.startsWith("dev-pipeline-")) return false;
  return !rest.some(
    (r) => String(r).startsWith("dsh_session_id=") || String(r).startsWith("session="),
  );
}

export function apply(ctx) {
  const mesEngine = {
    ...runtime,
    defineTool,
    getActiveDshSessionId() {
      return activeDshSessionId || "";
    },
    async runEngine(args, timeoutMs) {
      const list = Array.isArray(args) ? args.map(String) : [];
      const cmd = String(list[0] || "").trim();
      if (!cmd) return { ok: false, detail: "命令为空" };
      const rest = list.slice(1);
      if (devPipelineArgsNeedSession(cmd, rest) && activeDshSessionId) {
        rest.push("dsh_session_id=" + activeDshSessionId);
      }
      return runtime.runEngine([cmd, ...rest], timeoutMs);
    },
  };
  ctx.provide("mesEngine", mesEngine);

  try {
    installSessionV4SourceShim(ctx, "dsh-mes-bridge");
  } catch (eV4) {
    console.warn("[mes-bridge] 会话 v4 source.kind 改写安装失败", eV4);
  }

  // 启动时拉一次人员写码能力（失败则保持默认放行）
  void refreshCodingCapabilityCache();
  try {
    if (typeof ctx.effect === "function") {
      const timer = setInterval(function () {
        void refreshCodingCapabilityCache();
      }, 60000);
      ctx.effect(function () {
        return function () {
          clearInterval(timer);
        };
      });
    }
  } catch (eCapTimer) {
    /* ignore */
  }

  let promptApi = null;
  let lastPromptKey = "";
  let lastPipelineModeKey = "";
  function refreshPipelineModePrompt(sessionId) {
    if (!promptApi) return;
    const begin = codingBegin(ctx);
    const flowOn = readSessionIntegratedFlow(sessionId || activeDshSessionId);
    const modeKey = (flowOn ? "on" : "off") + "|" + begin;
    if (modeKey === lastPipelineModeKey) return;
    lastPipelineModeKey = modeKey;
    promptApi.section({
      name: "workbuddy:dev-pipeline-route",
      order: 33,
      text: buildDevPipelineRoutePrompt(flowOn, begin),
    });
  }
  function refreshCodingPrompt() {
    if (!promptApi) return;
    const begin = codingBegin(ctx);
    const key =
      begin +
      "|" +
      (readEnabled().includes(WB_CODE_DEV) ? "1" : "0") +
      "|" +
      (isDshCursorChatBundleOn() ? "c" : "0") +
      "|" +
      (isDshCursorBundleOn() ? "1" : "0");
    if (key === lastPromptKey) return;
    lastPromptKey = key;
    promptApi.section({
      name: "workbuddy:route-table",
      order: 34,
      text: buildRouteTable(begin),
    });
    promptApi.section({
      name: "workbuddy:code-dev-route",
      order: 35,
      text: buildCodeDevPrompt(begin),
    });
  }
  const cwdBySession = new Map();
  const utteranceBySession = new Map();
  const firstToolLoggedBySession = new Map();
  function rememberSessionUtterance(sessionId, text) {
    const sid = String(sessionId || "").trim();
    const msg = String(text || "").trim();
    if (!sid || !msg) return;
    if (looksLikeHostInjectedNoise(msg)) return;
    if (utteranceBySession.size >= 40 && !utteranceBySession.has(sid)) {
      const oldest = utteranceBySession.keys().next().value;
      if (oldest) {
        utteranceBySession.delete(oldest);
        firstToolLoggedBySession.delete(oldest);
      }
    }
    utteranceBySession.set(sid, msg.slice(0, 400));
    firstToolLoggedBySession.delete(sid);
  }
  function noteFirstToolChoice(exec) {
    try {
      const name = String((exec && exec.name) || "");
      const sid =
        String(execSessionId(exec) || "").trim() ||
        String(activeDshSessionId || "").trim();
      if (!sid || firstToolLoggedBySession.has(sid)) return;
      const session = exec && exec.agent && exec.agent.session ? exec.agent.session : null;
      const ws = cwdForTriage(session);
      let hasDirectory = false;
      try {
        hasDirectory = !!formatDirectoryBlock(loadCachedProfile(ENGINE_DIR, ws));
      } catch (eDir) {
        hasDirectory = false;
      }
      const ok = appendFirstToolLog(ENGINE_DIR, {
        sessionId: sid,
        tool: name,
        utterance: utteranceBySession.get(sid) || "",
        workspace: ws,
        hasDirectory: hasDirectory,
      });
      if (ok) {
        firstToolLoggedBySession.set(sid, name);
        console.log(
          "[mes-bridge] 首工具 " +
            name +
            " sid=" +
            sid.slice(0, 48) +
            (hasDirectory ? " +目录画像" : ""),
        );
      }
    } catch (eLog) {
      /* 日志失败不影响工具执行 */
    }
  }
  function readSessionCwd(session) {
    let sessions = null;
    try {
      sessions = ctx.get && ctx.get("sessions");
    } catch (eSess) {
      sessions = null;
    }
    return cwdFromSessions(session, sessions);
  }
  function rememberSessionCwd(session) {
    let sid = "";
    try {
      if (session && session.id) sid = String(session.id);
    } catch (eSid) {
      sid = "";
    }
    if (!sid) return;
    const cwd = readSessionCwd(session);
    if (!cwd) return;
    if (cwdBySession.size >= 40 && !cwdBySession.has(sid)) {
      const oldest = cwdBySession.keys().next().value;
      if (oldest) cwdBySession.delete(oldest);
    }
    cwdBySession.set(sid, cwd);
    try {
      persistCodingWorkspace(cwd, sid);
    } catch {
      /* 落盘失败不影响本轮 */
    }
  }
  function cwdForTriage(session) {
    const live = readSessionCwd(session);
    if (live) {
      rememberSessionCwd(session);
      return live;
    }
    let sid = "";
    try {
      if (session && session.id) sid = String(session.id);
    } catch (eSid) {
      sid = "";
    }
    if (sid && cwdBySession.has(sid)) return String(cwdBySession.get(sid) || "");
    try {
      const resolved = resolveCodingWorkspace({ sessionId: sid, workspace: "" });
      if (resolved) {
        if (sid) cwdBySession.set(sid, resolved);
        return resolved;
      }
    } catch {
      /* 注册表回退失败则仍空 */
    }
    return "";
  }
  /**
   * 宿主已直开工时，模型后到的 begin/continue 挂接同一 Job，等到终态再交回。
   * 不调写码插件，避免第二张确认卡把控制权提前还给模型。
   */
  async function adoptExistingCodingTool(name, chatSid, message) {
    if (name !== DSH_CHAT_BEGIN && name !== "zr_cchat_continue") return null;
    const adopted = findAdoptableCodingJob({
      sessionId: chatSid,
      message: utteranceBySession.get(chatSid) || message,
      toolName: name,
    });
    if (!adopted) return null;
    console.log(
      "[mes-bridge] 写码挂接已有任务 job=" +
        String(adopted.id || "") +
        " status=" +
        String(adopted.status || "") +
        " sid=" +
        String(chatSid || "").slice(0, 48),
    );
    return adoptAndHoldCodingJob(adopted);
  }
  function attachCodingDirectoryPortrait(exec) {
    const name = String((exec && exec.name) || "");
    if (!isDirectCodingToolName(name)) return;
    const args = writableExecArguments(exec);
    if (!args || typeof args !== "object") return;
    let key = "";
    if (typeof args.message === "string") key = "message";
    else if (typeof args.text === "string") key = "text";
    else if (typeof args.prompt === "string") key = "prompt";
    if (!key) return;
    const session = exec.agent && exec.agent.session ? exec.agent.session : null;
    const nextMsg = codingMessageWithCachedDirectory({
      engineDir: ENGINE_DIR,
      workspace: cwdForTriage(session),
      message: args[key],
    });
    if (nextMsg && nextMsg !== args[key]) args[key] = nextMsg;
  }
  function triageTextForAgent(assembleCtx) {
    const agent = assembleCtx && (assembleCtx.agent || assembleCtx.scope);
    const session = agent && agent.session ? agent.session : null;
    let sid = "";
    try {
      if (session && session.id) sid = String(session.id);
    } catch (eSid) {
      sid = "";
    }
    return buildHostTriageFromDisk({
      engineDir: ENGINE_DIR,
      workspace: cwdForTriage(session),
      enabledIds: readEnabled(),
      utterance: sid ? utteranceBySession.get(sid) || "" : "",
      integrated: sid ? readSessionIntegratedFlow(sid) : false,
    });
  }

  // 写入系统提示：不依赖工作区是否加载 .dsh/skills（用户工程目录常无本仓 Skill）
  try {
    const sp = ctx.get && ctx.get("systemPrompt");
    if (sp && typeof sp.section === "function") {
      promptApi = sp;
      // 默认按「普通写码」注入；每条用户消息再按该会话开关刷新
      refreshPipelineModePrompt("");
      refreshCodingPrompt();
      sp.section({
        name: "workbuddy:intent-triage",
        order: 31,
        text: function (assembleCtx) {
          try {
            return triageTextForAgent(assembleCtx);
          } catch (eTriage) {
            try {
              return buildHostTriageFromDisk({
                engineDir: ENGINE_DIR,
                workspace: "",
                enabledIds: readEnabled(),
              });
            } catch (eEmpty) {
              return "";
            }
          }
        },
      });
      sp.section({
        name: "workbuddy:code-review-route",
        order: 36,
        text: WORKBUDDY_CODE_REVIEW_PROMPT,
      });
      sp.section({
        name: "workbuddy:code-commit-route",
        order: 37,
        text: WORKBUDDY_CODE_COMMIT_PROMPT,
      });
      sp.section({
        name: "workbuddy:code-deploy-route",
        order: 38,
        text: WORKBUDDY_CODE_DEPLOY_PROMPT,
      });
      sp.section({
        name: "workbuddy:company-knowledge-no-memory-bypass",
        order: 12,
        text: [
          "## 公司共享知识库（最高优先级 · 反记忆绕过）",
          "- 凡涉及公司工艺/制度/口径/**PCB计价/压合费/层数单价**等：以本轮 `mes_company_knowledge`（或管理员自动召回）**当场命中正文**为准。",
          "- 若工具返回 `ok=false`，或带 `block_memory_quote=true` / `assistant_must_say`：**只把 `assistant_must_say`（或 `reply`）原样告诉用户，然后停止**。",
          "- **禁止**输出任何元/㎡、层数单价表、PP 单价、铜箔加价等数字，除非它们出现在本轮工具命中的摘录正文里。",
          "- **禁止**使用旧会话里出现过的公司库全文来「补」答案（即使用户追问同一题）。",
          "- **禁止**写「此前检索留档 / 内部留档 / 历史记忆 / 供参考但未复核」来继续输出价表。",
        ].join("\n"),
      });
      sp.section({
        name: "workbuddy:company-knowledge-dual-recall",
        order: 39,
        text: [
          "## 知识库检索（按角色）",
          "- **公司共享库免挂载**：任意会话/项目均可召回，不要求挂载；侧栏有「公司共享」标识。",
          "- **管理员**：自动召回 / `knowledge_search` **同时**覆盖本机挂载 + 公司共享库；不够再调 `mes_company_knowledge`。",
          "- **普通成员**：自动召回只含本机挂载；查公司共享库必须调 `mes_company_knowledge`。",
          "- **禁止**因未挂载或只看本机库树就当成「公司库没有」。",
          "- 回答须区分出处：本机私用 vs 公司共享。",
          "- 工具失败时遵守上方「反记忆绕过」节：只转述 `assistant_must_say`，不补价表。",
        ].join("\n"),
      });
      sp.section({
        name: "workbuddy:user-manual-builtin",
        order: 40,
        text: [
          "## 用户操作手册（本机默认知识库 · 免挂载）",
          "- 打开应用即预置在本机「默认知识库」，**无需用户上传、无需挂载**，任意会话可用。",
          "- 用户问产品怎么用（登录、问数、写码/审码/提交/部署、资料库、用量、设置、需求到上线等）：**必须先调** `mes_workbuddy_manual`。",
          "- 侧栏知识库里也能看到同名文档；回答时注明出处为「本机用户操作手册」。",
          "- 不要要求用户去「项目与会话挂载」才能查这本手册。",
        ].join("\n"),
      });
      console.log(
        "[mes-bridge] 已注册 systemPrompt：route-table + mode-aware pipeline + code-dev/review/commit/deploy + company-knowledge + user-manual",
      );
    } else {
      console.warn("[mes-bridge] 无 systemPrompt 服务：写码路由硬约束未注入");
    }
  } catch (e) {
    console.warn("[mes-bridge] systemPrompt 注入失败", e);
  }

  // 启动时断言 TOOL_RUNTIME_SCHEDULER 可解析：profile 若另装了 dsh-tools，
  // agent-loop 会在任意工具（含 mes_code_dev_begin）上炸
  // Cannot read properties of undefined (reading 'prepare')。
  import("@deepseek-ai/dsh-tools")
    .then((toolsMod) => {
      const sym =
        toolsMod.TOOL_RUNTIME_SCHEDULER ||
        (toolsMod.default && toolsMod.default.TOOL_RUNTIME_SCHEDULER);
      const sched = sym && ctx.tools ? ctx.tools[sym] : null;
      if (!sched || typeof sched.prepare !== "function") {
        console.error(
          "[mes-bridge] FATAL: ctx.tools 缺少同源 TOOL_RUNTIME_SCHEDULER.prepare。" +
            "多为 ~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-tools 与宿主双实例。" +
            "请执行: scripts/check-vendor.sh --fix && scripts/plugin.sh --app zr-workbuddy install bridge --restart",
        );
      } else {
        console.log("[mes-bridge] TOOL_RUNTIME_SCHEDULER.prepare 可用");
      }
    })
    .catch((e) => {
      console.warn(
        "[mes-bridge] scheduler 健康检查跳过:",
        e && e.message ? e.message : e,
      );
    });

  // 硬防线：拒绝绕过 code-dev 的磁盘写入（run_code / Write / StrReplace / 危险 Bash）
  try {
    if (ctx.tools && typeof ctx.tools.guard === "function") {
      ctx.tools.guard((exec) => {
        noteActiveDshSessionId(exec);
        const name = String((exec && exec.name) || "");
        const lower = name.toLowerCase();
        const begin = codingBegin(ctx) || "当前已启用的写码 begin 工具";
        // 与 pre-execute 同一套 sid：优先已开一体化的 active / session.id
        const chatSid = resolveIntegratedSessionId(exec);
        const flowOn = readSessionIntegratedFlow(chatSid);
        const openRun = chatSid ? findLatestOpenPipelineRun(chatSid) : null;
        const askDeny = clearCodingAskDenyReason(
          name,
          utteranceBySession.get(chatSid) || codingToolMessageFromExec(exec),
          { integrated: flowOn },
        );
        if (askDeny) {
          console.log(
            "[mes-bridge] guard 拦截清晰写码上的问卷 sid=" +
              String(chatSid || "").slice(0, 48),
          );
          try {
            scheduleHostAutoStartClearCoding({
              sessionId: chatSid,
              utterance: utteranceBySession.get(chatSid) || codingToolMessageFromExec(exec),
              workspace: cwdBySession.get(chatSid) || cwdForTriage(exec && exec.agent && exec.agent.session),
              integrated: flowOn,
              latestJob: findLatestChatJob(chatSid),
            });
          } catch (eAskStart) {
            /* 直开工失败仍拒绝问卷 */
          }
          return askDeny;
        }

        // 人员能力：关掉「写码」= 禁止对话写码 / 旧写码 begin（缓存默认放行，防误伤）
        const isCodingChannelTool =
          name === DSH_CHAT_BEGIN ||
          name.indexOf("zr_cchat_") === 0 ||
          name === DSH_CURSOR_BEGIN ||
          name.indexOf("zr_cursor_") === 0 ||
          name === WB_BEGIN ||
          name.indexOf("mes_code_dev_") === 0;
        if (isCodingChannelTool && codingCapCache.allowed === false) {
          return codingCapabilityDeniedMessage();
        }
        // 缓存超过 45s 则后台刷新（不阻塞本轮）
        if (isCodingChannelTool && Date.now() - (codingCapCache.at || 0) > 45000) {
          void refreshCodingCapabilityCache();
        }

        // zod@3.25.0 残包：写码前先补 dist，避免沙箱就绪后立刻 ERR_MODULE_NOT_FOUND
        if (name === DSH_CHAT_BEGIN || name === "zr_cchat_continue") {
          try {
            const zodBlock = blockCodingIfZodBroken();
            if (zodBlock) {
              console.warn("[mes-bridge] guard 拦截：zod dist 未就绪");
              return zodBlock;
            }
          } catch (eZod) {
            // 禁止异常后放行：否则会空跑写码 Job 再爆 ERR_MODULE_NOT_FOUND
            console.warn("[mes-bridge] zod 门禁异常（拒绝写码）", eZod);
            return (
              "【写码环境未就绪 · zod】门禁检查异常，已拒绝开跑，避免空跑失败。" +
              (eZod && eZod.message ? " 细节：" + eZod.message : "")
            );
          }
        }

        // 已成功的同一原话禁止再出「续改确认」卡（根因：Agent 完成后又 begin/continue 同句）
        if (
          name === DSH_CHAT_BEGIN ||
          name === "zr_cchat_continue" ||
          name.indexOf("zr_cchat_") === 0
        ) {
          const dup = duplicateCodingConfirmBlock({
            toolName: name,
            message: codingToolMessageFromExec(exec),
            sessionId: chatSid,
            hasImages: codingToolHasImages(exec),
          });
          if (dup) {
            console.log(
              "[mes-bridge] guard 拦截重复续改确认 sid=" +
                String(chatSid || "").slice(0, 48),
            );
            return dup;
          }
        }

        // 硬门禁：普通写码会话禁止误开一体化（贴图也不例外）
        if (name === "mes_dev_pipeline_begin" && !flowOn) {
          return (
            "本会话输入框旁是「普通写码」（未开绿色「需求→上线」）。" +
            "禁止 mes_dev_pipeline_begin。" +
            (begin === DSH_CHAT_BEGIN
              ? "有附图：直接 " + begin + "（填 images），不必先识图。"
              : "请先安装并启用 Cursor 对话写码（" + DSH_CHAT_BEGIN + "），再写码。") +
            "不要因贴图改走需求→上线。"
          );
        }

        // 唯一入口：永远禁止旧本机写码 / 旧 zr_cursor_*（无回退；流水线第 5 步由引擎 HTTP 调对话写码）
        if (
          name === WB_BEGIN ||
          name.indexOf("mes_code_dev_") === 0 ||
          name === DSH_CURSOR_BEGIN ||
          name.indexOf("zr_cursor_") === 0
        ) {
          return (
            "写码唯一入口是 Cursor 对话写码 " +
            DSH_CHAT_BEGIN +
            "（workspace + message；有图填 images）。禁止回退 " +
            name +
            "。"
          );
        }

        if (flowOn || openRun) {
          if (name.indexOf("mes_dev_pipeline_") === 0) {
            // cancel / status / begin 等编排工具一律放行（begin 已在上方校验 flowOn）
            return undefined;
          }
          // 开跑期间禁止多选澄清卡抢 UI；场景由 pipeline 推断，不在此写死交付形态
          const isAskUser =
            lower === "ask_user_question" ||
            name === "AskUserQuestion" ||
            INTEGRATED_CODING_TOOLS.has(name) ||
            INTEGRATED_CODING_TOOLS.has(lower);
          if (isAskUser && flowOn) {
            return (
              "本会话已开启「需求→上线」一体化。请勿用 ask_user_question /「新增范围」多选卡打断。" +
              "场景与交付范围由 pipeline 按需求推断（全栈/前端/后端/修bug/重构等均可）；" +
              "直接看时间线卡继续。"
            );
          }
          const codingHandoff = pipelineCodingHandoff(chatSid);
          const isDirectCoding = isDirectCodingToolName(name);
          if (isDirectCoding && flowOn) {
            // guard 拦住执行（否则会真的创建 waiting pending）。
            // 确认表单的 toolview 在执行前就会画出来，藏卡在客户端只打 .cc-card。
            // 仅 begin 类触发自动开跑；续写/状态工具只拦不 begin，避免用工具参数污染需求。
            const isBegin =
              name === DSH_CHAT_BEGIN ||
              name === DSH_CURSOR_BEGIN ||
              name === WB_BEGIN;
            const msg = codingToolMessageFromExec(exec);
            if (isBegin && msg.length >= 2 && chatSid && !openRun) {
              void maybeAutoBeginIntegratedPipeline(chatSid, msg);
            }
            console.log(
              "[mes-bridge] guard 拦截 " +
                name +
                " sid=" +
                String(chatSid || "").slice(0, 48) +
                "（一体化：不出写码确认卡）",
            );
            return "pipeline_owns_coding";
          }
          if (isDirectCoding && !codingHandoff && !flowOn && openRun) {
            return (
              "本会话绿开关已关（普通写码），但仍有未结束的一体化 Run " +
              String(openRun.run_id || openRun.id || "") +
              "。请先 mes_dev_pipeline_cancel 结束旧任务，再用 " +
              begin +
              " 做普通写码（可贴图）。"
            );
          }
          const laneTools = {
            mes_code_review_begin: "7",
            mes_code_commit_begin: "8",
            mes_code_deploy_begin: "10",
          };
          if (flowOn && Object.prototype.hasOwnProperty.call(laneTools, name)) {
            const wantStep = laneTools[name];
            const run = findPipelineRunForSession(chatSid, wantStep, "waiting_hitl");
            if (!run) {
              return (
                "一体化流程未到步骤 " +
                wantStep +
                " 交接点，禁止直接 " +
                name +
                "。请先 mes_dev_pipeline_begin 或等待时间线推进到该步。"
              );
            }
          }
        }
        if (
          (name === DSH_CURSOR_BEGIN || name.indexOf("zr_cursor_") === 0) &&
          begin === DSH_CHAT_BEGIN
        ) {
          return (
            "已启用 Cursor 对话写码，请用 " + DSH_CHAT_BEGIN + "，不要用旧 " + name + "。"
          );
        }
        if (name === DSH_CURSOR_BEGIN || name.indexOf("zr_cursor_") === 0) {
          return (
            "写码唯一入口是 Cursor 对话写码 " + DSH_CHAT_BEGIN + "，禁止回退 " + name + "。"
          );
        }
        if (name === WB_BEGIN || name.indexOf("mes_code_dev_") === 0) {
          return (
            "写码唯一入口是 Cursor 对话写码 " + DSH_CHAT_BEGIN + "，禁止回退 " + name + "。"
          );
        }
        if (name === "run_code" || lower === "run_code") {
          return (
            "禁止使用 run_code。写码→" +
            begin +
            "；审码→mes_code_review_begin；" +
            "提交→mes_code_commit_begin；部署→mes_code_deploy_begin。"
          );
        }
        if (DISK_WRITE_TOOLS.has(name) || DISK_WRITE_TOOLS.has(lower)) {
          return (
            "禁止直接 " +
            name +
            " 改用户工程。写码/删菜单必须走 " +
            begin +
            "。"
          );
        }
        if (
          lower === "bash" ||
          lower === "shell" ||
          lower === "pwsh" ||
          lower === "powershell" ||
          lower === "run_terminal_cmd" ||
          lower === "terminal"
        ) {
          const payload = toolExecPayload(exec);
          if (bashLooksLikeCodingWait(payload)) {
            return (
              "禁止用 " +
              name +
              " 空等写码任务（Start-Sleep / sleep 会让主聊天一直 Deep diving）。" +
              "进度卡还在跑时不要再调工具、不要写文字；等 begin/continue 自己返回后再 zr_cchat_finish。"
            );
          }
          if (bashLooksLikeDiskWrite(payload)) {
            return (
              "禁止用 " +
              name +
              " 改盘（rm/mv/cp/重定向/git 写等）。请走 " +
              begin +
              "。"
            );
          }
          if (bashLooksLikeManualCodeReview(payload)) {
            return (
              "禁止用 " +
              name +
              " 扫仓/git diff 代审。用户要审码请只调 mes_code_review_begin，在审码工具卡内选目录并开始审核。"
            );
          }
          if (bashLooksLikeManualDeploy(payload)) {
            return (
              "禁止用 " +
              name +
              " 自部署（ssh/rsync/scp）。用户要部署请只调 mes_code_deploy_begin，在部署确认卡内点确认。"
            );
          }
        }
        return undefined;
      });
      console.log("[mes-bridge] 已注册 tools.guard：拒绝 run_code / 写盘工具 / 危险 Bash");
    }
  } catch (e) {
    console.warn("[mes-bridge] tools.guard 注册失败", e);
  }

  try {
    if (typeof ctx.on === "function") {
      // prepend：在写码插件创建 pending 确认单之前拦截，避免弹出确认卡
      ctx.on(
        "tools/pre-execute",
        async (exec, next) => {
          noteActiveDshSessionId(exec);
          noteFirstToolChoice(exec);
          const name = String((exec && exec.name) || "");
          const chatSid = resolveIntegratedSessionId(exec);
          const msg0 = codingToolMessageFromExec(exec);
          if (name === DSH_CHAT_BEGIN || name === "zr_cchat_continue") {
            try {
              const adoptedOut = await adoptExistingCodingTool(name, chatSid, msg0);
              if (adoptedOut) return adoptedOut;
            } catch (eAdoptPre) {
              console.warn("[mes-bridge] pre-execute 挂接已有写码任务异常", eAdoptPre);
            }
          }
          const askDenyPre = clearCodingAskDenyReason(
            name,
            utteranceBySession.get(chatSid) || msg0,
            { integrated: readSessionIntegratedFlow(chatSid) },
          );
          if (askDenyPre) {
            console.log(
              "[mes-bridge] pre-execute 拦截清晰写码上的问卷 sid=" +
                String(chatSid || "").slice(0, 48),
            );
            try {
              scheduleHostAutoStartClearCoding({
                sessionId: chatSid,
                utterance: utteranceBySession.get(chatSid) || msg0,
                workspace: cwdBySession.get(chatSid) || cwdForTriage(exec && exec.agent && exec.agent.session),
                integrated: readSessionIntegratedFlow(chatSid),
                latestJob: findLatestChatJob(chatSid),
              });
            } catch (eAskPre) {
              /* ignore */
            }
            return { kind: "deny", reason: askDenyPre };
          }
          // 须在插件创建 pending 确认单之前拦：已成功同句勿再出续改确认卡
          if (
            name === DSH_CHAT_BEGIN ||
            name === "zr_cchat_continue" ||
            name.indexOf("zr_cchat_") === 0
          ) {
          const dup = duplicateCodingConfirmBlock({
            toolName: name,
            message: msg0,
            sessionId: chatSid,
            hasImages: codingToolHasImages(exec),
          });
          if (dup) {
            console.log(
              "[mes-bridge] pre-execute 拦截重复续改确认 sid=" +
                String(chatSid || "").slice(0, 48),
            );
            return { kind: "deny", reason: dup };
          }
          }
          // 确认卡弹出前注入交接，使卡上诉求含【系统续改交接】/ Network 指引
          if (name === "zr_cchat_continue") {
            try {
              const hoPre = enrichContinueExecHandoff(exec, chatSid, {});
              if (hoPre.changed) {
                console.log(
                  "[mes-bridge] pre-execute 续改交接已注入 parent=" +
                    String(hoPre.parentId || "").slice(0, 40) +
                    " " +
                    hoPre.notes.slice(0, 4).join(","),
                );
              }
            } catch (eHoPre) {
              console.warn("[mes-bridge] pre-execute 续改交接异常", eHoPre);
            }
          }
          // Q0-3：begin/continue 确认前也钉目录画像（无画像不阻断）
          if (
            name === DSH_CHAT_BEGIN ||
            name === "zr_cchat_continue" ||
            name.indexOf("zr_cchat_") === 0
          ) {
            try {
              attachCodingDirectoryPortrait(exec);
            } catch (eDirPre) {
              /* 没有画像也照常写码 */
            }
            // Q1-2：仅 begin/continue 钉「先指区域再改」（勿污染 status 等其它 zr_cchat_*）
            if (name === DSH_CHAT_BEGIN || name === "zr_cchat_continue") {
              try {
                enrichCodingExecImageLocate(exec);
              } catch (eImgLoc) {
                /* 忽略 */
              }
            }
          }
          if (!shouldSoftSkipPipelineCoding(chatSid, name)) {
            if (name === DSH_CHAT_BEGIN || name === "zr_cchat_continue") {
              scheduleCodingAutoConfirm({
                callId: execCallId(exec),
                sessionId: chatSid || execSessionId(exec),
                requirement: msg0,
              });
            }
            return next();
          }
          const sid =
            chatSid || String(activeDshSessionId || "").trim() || execSessionId(exec);
          const isBegin =
            name === DSH_CHAT_BEGIN ||
            name === DSH_CURSOR_BEGIN ||
            name === WB_BEGIN;
          const msg = msg0;
          if (isBegin && msg.length >= 2 && sid && !findLatestOpenPipelineRun(sid)) {
            void maybeAutoBeginIntegratedPipeline(sid, msg);
          }
          console.log(
            "[mes-bridge] pre-execute 拦截 " +
              name +
              " sid=" +
              String(sid || "").slice(0, 48) +
              "（一体化：不出写码确认卡）",
          );
          return {
            kind: "deny",
            reason:
              "一体化写码由过程流编排，无需写码确认卡。请看上方时间线（或等待自动 begin）。",
          };
        },
        { prepend: true },
      );
      // 双保险：若 pre-execute 未拦到，execute 仍不调 next
      ctx.on(
        "tools/execute",
        async (exec, next) => {
          noteActiveDshSessionId(exec);
          noteFirstToolChoice(exec);
          const name = String((exec && exec.name) || "");
          const chatSid = resolveIntegratedSessionId(exec);
          if (
            name === DSH_CHAT_BEGIN ||
            name === "zr_cchat_continue" ||
            name.indexOf("zr_cchat_") === 0
          ) {
            if (name === DSH_CHAT_BEGIN || name === "zr_cchat_continue") {
              try {
                const zodBlock = blockCodingIfZodBroken();
                if (zodBlock) {
                  return {
                    ok: false,
                    error: { message: zodBlock },
                    content: [{ type: "text", text: zodBlock }],
                  };
                }
              } catch (eZodEx) {
                console.warn("[mes-bridge] execute zod 门禁异常（拒绝写码）", eZodEx);
                const msg =
                  "【写码环境未就绪 · zod】门禁检查异常，已拒绝开跑，避免空跑失败。" +
                  (eZodEx && eZodEx.message ? " 细节：" + eZodEx.message : "");
                return {
                  ok: false,
                  error: { message: msg },
                  content: [{ type: "text", text: msg }],
                };
              }
            }
            if (name === DSH_CHAT_BEGIN || name === "zr_cchat_continue") {
              try {
                const adoptedOut = await adoptExistingCodingTool(
                  name,
                  chatSid,
                  codingToolMessageFromExec(exec),
                );
                if (adoptedOut) return adoptedOut;
              } catch (eAdoptEx) {
                console.warn("[mes-bridge] execute 挂接已有写码任务异常", eAdoptEx);
              }
            }
            const dup = duplicateCodingConfirmBlock({
              toolName: name,
              message: codingToolMessageFromExec(exec),
              sessionId: chatSid,
              hasImages: codingToolHasImages(exec),
            });
            if (dup) {
              return {
                ok: false,
                error: { message: dup },
                content: [{ type: "text", text: dup }],
              };
            }
          }
          if (!shouldSoftSkipPipelineCoding(chatSid, name)) {
            try {
              attachCodingDirectoryPortrait(exec);
            } catch (eDir) {
              /* 没有画像也照常写码 */
            }
            // 本地 Cursor SDK 拒 URL 图：begin/continue 把 vimg / vision URL 转成 data URL
            if (name === DSH_CHAT_BEGIN || name === "zr_cchat_continue") {
              try {
                const imgFix = rewriteCodingExecImages(exec, ENGINE_DIR);
                if (imgFix.changed) {
                  console.log(
                    "[mes-bridge] 写码附图已本地化 " +
                      imgFix.notes.filter((n) => n.indexOf("localized:") === 0).join(","),
                  );
                } else if (imgFix.notes.length) {
                  console.warn(
                    "[mes-bridge] 写码附图本地化未完全成功 " + imgFix.notes.slice(0, 4).join(";"),
                  );
                }
                enrichCodingExecImageLocate(exec);
              } catch (eImg) {
                console.warn("[mes-bridge] 写码附图本地化异常", eImg);
              }
            }
            // 失败轮续改：补 changed_files 交接（剔 *.db）+ 必要时钉 parent_job_id
            if (name === "zr_cchat_continue") {
              try {
                const ho = enrichContinueExecHandoff(exec, chatSid, {});
                if (ho.changed) {
                  console.log(
                    "[mes-bridge] 续改交接已补强 parent=" +
                      String(ho.parentId || "").slice(0, 40) +
                      " " +
                      ho.notes.slice(0, 4).join(","),
                  );
                }
              } catch (eHo) {
                console.warn("[mes-bridge] 续改交接补强异常", eHo);
              }
            }
            // 已有写码任务还在跑时，finish 不再执行，避免插件把结论写进卡片下方。
            if (name === "zr_cchat_finish") {
              const busy = findLatestChatJob(chatSid);
              const busySt = String((busy && busy.status) || "").trim();
              const busyDone = new Set([
                "succeeded",
                "failed",
                "cancelled",
                "canceled",
                "blocked_no_runner",
                "pending_review",
              ]);
              if (busy && busy.id && !busyDone.has(busySt)) {
                try {
                  await holdCodingToolResult(
                    { job_id: String(busy.id), status: busySt || "running" },
                    {},
                  );
                } catch (eBusy) {
                  console.warn("[mes-bridge] 写码未结束，finish 已静默等待", eBusy);
                }
                const doneJob = readChatJob(String(busy.id));
                const st2 = String((doneJob && doneJob.status) || busySt || "").trim();
                if (!busyDone.has(st2)) {
                  return {
                    ok: true,
                    silent: true,
                    done: false,
                    job_id: String(busy.id),
                    status: st2 || "running",
                    chat_body: "",
                  };
                }
              }
            }
            // 正文结论：插件靠 chat_body；若 Job 已终态却未交付（conclusion_delivered=false），
            // 进度卡只剩「已同步 N」——这里用 Job 账本补全文进 chat_body（用户要的正文结论）。
            let out = await next();
            if (
              name === DSH_CHAT_BEGIN ||
              name === "zr_cchat_continue" ||
              name === "zr_cchat_wait"
            ) {
              try {
                const held = await holdCodingToolResult(out);
                if (held.changed) {
                  console.log(
                    "[mes-bridge] 写码工具已等到终态再交回 job=" +
                      String(held.jobId || "").slice(0, 40) +
                      " status=" +
                      String(held.status || ""),
                  );
                }
                out = held.result;
                let recoverId = String(held.jobId || "").trim();
                if (!recoverId) {
                  try {
                    const m = JSON.stringify(out || "").match(/\b(cch-[0-9a-z-]+)\b/i);
                    recoverId = m ? m[1] : "";
                  } catch (eId) {
                    recoverId = "";
                  }
                }
                if (recoverId) {
                  try {
                    const rec = await recoverFailedChatJobIfNeeded(recoverId);
                    if (rec && rec.ok && (rec.changed_files || []).length) {
                      console.log(
                        "[mes-bridge] db EPERM 已回收源码 job=" +
                          recoverId +
                          " n=" +
                          rec.changed_files.length,
                      );
                      out = applyRecoveredToolResult(out, rec);
                    }
                  } catch (eRec) {
                    console.warn("[mes-bridge] db EPERM 回收异常", eRec);
                  }
                }
              } catch (eHold) {
                console.warn("[mes-bridge] 写码终态等待异常，按插件原返回继续", eHold);
              }
            }
            if (
              name === DSH_CHAT_BEGIN ||
              name === "zr_cchat_continue" ||
              name === "zr_cchat_finish" ||
              name === "zr_cchat_wait"
            ) {
              try {
                const enriched = enrichCodingToolResultWithChatBody(out);
                if (enriched.changed) {
                  console.log(
                    "[mes-bridge] 已补强正文结论 chat_body job=" +
                      String(enriched.jobId || "").slice(0, 40),
                  );
                  return enriched.result;
                }
              } catch (eBody) {
                console.warn("[mes-bridge] 正文结论补强异常", eBody);
              }
            }
            return out;
          }
          const sid =
            chatSid || String(activeDshSessionId || "").trim() || execSessionId(exec);
          const isBegin =
            name === DSH_CHAT_BEGIN ||
            name === DSH_CURSOR_BEGIN ||
            name === WB_BEGIN;
          const msg = codingToolMessageFromExec(exec);
          if (isBegin && msg.length >= 2 && sid && !findLatestOpenPipelineRun(sid)) {
            void maybeAutoBeginIntegratedPipeline(sid, msg);
          }
          console.log(
            "[mes-bridge] execute 静默跳过 " + name + "（避免写码确认卡）",
          );
          return {
            isError: true,
            error: { message: "pipeline_owns_coding" },
            content: [
              {
                type: "text",
                text: "一体化写码由过程流编排，无需写码确认卡。请看上方时间线。",
              },
            ],
          };
        },
        { prepend: true },
      );
      ctx.on("session/event", function (session, event) {
        try {
          patchAgentInject(session && session.agent);
        } catch {
          /* ignore */
        }
        if (!event || event.type !== "user/message") return;
        var data = event.data || {};
        if (!isRealUserMessageSource(data.source)) return;
        var sid = session && session.id;
        var text = extractUserMessageText(data);
        // 每条真用户消息：按该会话输入框旁开关刷新「普通写码 / 需求→上线」提示
        try {
          if (sid) activeDshSessionId = String(sid);
          refreshPipelineModePrompt(sid);
          refreshCodingPrompt();
          rememberSessionCwd(session);
          rememberSessionUtterance(sid, text);
        } catch (ePrompt) {}
        void (async function () {
          if (await maybeCancelIntegratedPipeline(sid, text)) return;
          await maybeAutoBeginIntegratedPipeline(sid, text);
          if (readSessionIntegratedFlow(sid)) return;
          try {
            const startOpts = () => ({
              sessionId: sid,
              utterance: text,
              workspace: cwdForTriage(session),
              integrated: false,
              latestJob: findLatestChatJob(sid),
            });
            const first = scheduleHostAutoStartClearCoding(startOpts());
            if (first && typeof first.then === "function") {
              first.then(function (out) {
                if (!out || out.detail !== "no-workspace") return;
                setTimeout(function () {
                  try {
                    rememberSessionCwd(session);
                    scheduleHostAutoStartClearCoding(startOpts());
                  } catch (eRetry) {
                    /* ignore */
                  }
                }, 400);
              });
            }
          } catch (eHostStart) {
            /* ignore */
          }
        })();
      });
      console.log(
        "[mes-bridge] 已注册 tools/execute 一体化写码静默跳过 + session/event：按开关刷新提示 + 原话分诊 + 自动 begin / 输入暂停取消",
      );
    }
  } catch (ePre) {
    console.warn("[mes-bridge] tools/pre-execute 会话注入失败", ePre);
  }

  runtime
    .ensureEngineHttp()
    .then((ok) => {
      console.log(
        ok
          ? "[mes-bridge] 引擎 HTTP 就绪"
          : "[mes-bridge] 引擎未就绪，可 scripts/engine.sh zr-workbuddy ensure",
      );
    })
    .catch(() => {});

  /** @type {Map<string, { dispose: () => Promise<void> }>} */
  const fibers = new Map();
  /** @type {Map<string, number>} id → 加载时 index.js mtimeMs */
  const loadedMtime = new Map();
  /** @type {Map<string, string>} id → 最近一次加载失败原因 */
  const loadErrors = new Map();
  let syncing = false;
  let syncDirty = false;
  let lastKey = "";
  let featureReloadCount = 0;

  async function unload(id) {
    const f = fibers.get(id);
    if (!f) {
      loadErrors.delete(id);
      loadedMtime.delete(id);
      return;
    }
    try {
      await f.dispose();
    } catch (e) {
      console.warn("[mes-bridge] dispose 失败", id, e);
    }
    fibers.delete(id);
    loadedMtime.delete(id);
    loadErrors.delete(id);
    console.log("[mes-bridge] 已停用 feature:", id);
  }

  async function load(id) {
    const file = path.join(FEATURES_DIR, id, "index.js");
    if (!fs.existsSync(file)) {
      const msg = "feature 目录或 index.js 不存在";
      loadErrors.set(id, msg);
      console.warn("[mes-bridge]", id, msg);
      return false;
    }
    try {
      // ?t= 强制新加载；旧 ESM 模块对象可能仍留在内存（可接受的小泄漏）
      const url = pathToFileURL(file).href + "?t=" + Date.now();
      const mod = await import(url);
      featureReloadCount += 1;
      if (featureReloadCount === 40 || featureReloadCount === 80) {
        console.warn(
          "[mes-bridge] feature 热重载已累计 " +
            featureReloadCount +
            " 次（ESM 模块对象可能残留）。开发态建议适时重启 DSH 回收内存。",
        );
      }
      // 必须收成普通对象再交给 Cordis：部分运行时对 Module Namespace 的
      // `typeof apply === "function"` 检测会失败（报 received object）。
      const plugin = {
        name: mod.name,
        inject: mod.inject,
        apply: mod.apply,
      };
      if (mod.Config) plugin.Config = mod.Config;
      if (typeof plugin.apply !== "function") {
        throw new Error('feature 未导出 apply 函数（收到 ' + typeof plugin.apply + '）');
      }
      const fiberLike = ctx.plugin(plugin);
      const fiber = typeof fiberLike?.then === "function" ? await fiberLike : fiberLike;
      if (!fiber || typeof fiber.dispose !== "function") {
        const msg = "未返回可 dispose 的 fiber";
        loadErrors.set(id, msg);
        console.warn("[mes-bridge]", id, msg);
        return false;
      }
      fibers.set(id, fiber);
      loadedMtime.set(id, featureMtime(id));
      loadErrors.delete(id);
      console.log("[mes-bridge] 已启用 feature:", id);
      return true;
    } catch (e) {
      const msg = String(e && e.message ? e.message : e).slice(0, 300);
      loadErrors.set(id, msg);
      console.warn("[mes-bridge] 加载失败（不影响同轮其它 feature）:", id, msg);
      return false;
    }
  }

  async function sync() {
    if (syncing) {
      syncDirty = true;
      return;
    }
    syncing = true;
    try {
      do {
        syncDirty = false;
        try {
          const mx = pluginsStore("coding-mutex");
          if (mx && mx.mutex === "disabled-code-dev") {
            console.log(
              "[mes-bridge] 写码互斥：对话写码/旧 Cursor 写码已启用，已自动停用 WorkBuddy code-dev",
            );
          }
        } catch (e) {
          console.warn("[mes-bridge] coding-mutex 失败", e && e.message ? e.message : e);
        }
        const available = new Set(listFeatureIds());
        const target = readEnabled().filter((id) => available.has(id));
        const key = [...target].sort().join(",") + "|" + [...loadErrors.keys()].sort().join(",");

        for (const id of [...fibers.keys()]) {
          if (!target.includes(id)) {
            try {
              await unload(id);
            } catch (e) {
              console.warn("[mes-bridge] unload 异常", id, e);
            }
          }
        }
        for (const id of target) {
          const mt = featureMtime(id);
          if (fibers.has(id)) {
            // 已加载但源文件变更 → Cordis dispose 后重新 ctx.plugin（热重载）
            if (mt && loadedMtime.get(id) === mt) continue;
            try {
              await unload(id);
            } catch (e) {
              console.warn("[mes-bridge] 重载前 unload 异常", id, e);
            }
          }
          try {
            await load(id);
          } catch (e) {
            const msg = String(e && e.message ? e.message : e).slice(0, 300);
            loadErrors.set(id, msg);
            console.warn("[mes-bridge] sync 单项异常:", id, msg);
          }
        }
        for (const id of [...loadErrors.keys()]) {
          if (!target.includes(id)) loadErrors.delete(id);
        }
        if (key !== lastKey) {
          lastKey = key;
          const failed = [...loadErrors.keys()];
          console.log(
            "[mes-bridge] features 同步 →",
            target.join(", ") || "(无)",
            failed.length ? `; 失败: ${failed.join(", ")}` : "",
          );
        }
        refreshCodingPrompt();
      } while (syncDirty);
    } catch (e) {
      console.warn("[mes-bridge] sync 外层失败:", e);
    } finally {
      syncing = false;
      if (syncDirty) {
        syncDirty = false;
        sync().catch(() => {});
      }
    }
  }

  function featureStatus(fid) {
    const enabled = readEnabled().includes(fid);
    const loaded = fibers.has(fid);
    const err = loadErrors.get(fid);
    let live = "idle";
    if (loaded) live = "loaded";
    else if (err) live = "error";
    return {
      id: fid,
      enabled,
      loaded,
      live,
      error: err || null,
      ...(readManifest(fid) || {}),
    };
  }

  ctx.tools.register(
    defineTool({
      name: "mes_plugin",
      description:
        "MES 功能热插拔：action=list|enable|disable|reload；id 为 feature 目录名（如 mes-ask）。" +
        "启停写 engine/data/plugins.json（真相源），无需重启 DSH。" +
        "改 feature 源码后可用 reload，或等 bridge 按 mtime 自动重载。",
      parameters: {
        action: { type: "string", required: true, description: "list | enable | disable | reload" },
        id: { type: "string", description: "feature id（enable/disable/reload 时必填）" },
      },
      output: {
        schema: { type: "object", additionalProperties: true },
        render: runtime.resultRender,
      },
      timeoutMs: 20000,
      async execute(args) {
        const action = String(args.action || "").trim();
        const id = String(args.id || "").trim();
        if (action === "list") {
          const rows = listFeatureIds().map(featureStatus);
          return {
            ok: true,
            reply: rows
              .map((r) => {
                const on = r.enabled ? "enabled" : "disabled";
                const err = r.error ? ` ERR=${r.error}` : "";
                return `- ${r.id}: ${on}/${r.live}${err} — ${r.purpose || r.name || ""}`;
              })
              .join("\n"),
            available: listFeatureIds(),
            enabled: readEnabled(),
            loaded: [...fibers.keys()],
            errors: Object.fromEntries(loadErrors),
            features: rows,
          };
        }
        if (action === "reload") {
          if (!id) return { ok: false, detail: "需要 id" };
          if (!listFeatureIds().includes(id)) return { ok: false, detail: `未知 feature: ${id}` };
          if (!readEnabled().includes(id)) {
            return { ok: false, detail: `${id} 未启用；请先 enable` };
          }
          await unload(id);
          await load(id);
          const st = featureStatus(id);
          return {
            ok: !st.error,
            detail: st.error ? `重载失败: ${st.error}` : `已重载 ${id}`,
            feature: st,
          };
        }
        if (action === "enable" || action === "disable") {
          if (!id) return { ok: false, detail: "需要 id" };
          const avail = new Set(listFeatureIds());
          if (action === "enable" && !avail.has(id)) {
            return { ok: false, detail: `未知 feature: ${id}` };
          }
          // 单一写路径：plugins_store（flock），不二次 runEngine 改同一文件
          let written;
          try {
            written = pluginsStore(action, id);
          } catch (e) {
            return { ok: false, detail: `写入 plugins.json 失败: ${String(e.message || e).slice(0, 200)}` };
          }
          if (written && written.ok === false) {
            return written;
          }
          await sync();
          const st = featureStatus(id);
          return {
            ok: !st.error,
            detail: st.error
              ? `已写入启停，但加载失败: ${st.error}`
              : action === "enable"
                ? `已启用 ${id}`
                : `已停用 ${id}`,
            enabled: readEnabled(),
            feature: st,
          };
        }
        return { ok: false, detail: "action 须为 list|enable|disable|reload" };
      },
    }),
  );

  const timer = setInterval(() => {
    sync().catch(() => {});
  }, POLL_MS);
  if (typeof timer.unref === "function") timer.unref();

  const watchers = [];
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    watchers.push(
      fs.watch(path.dirname(STATE_PATH), { persistent: false }, (_e, filename) => {
        if (!filename || String(filename).includes("plugins.json")) sync().catch(() => {});
      }),
    );
  } catch {
    /* poll only */
  }
  try {
    if (fs.existsSync(FEATURES_DIR)) {
      watchers.push(
        fs.watch(FEATURES_DIR, { persistent: false }, () => {
          sync().catch(() => {});
        }),
      );
    }
  } catch {
    /* poll mtime */
  }

  ctx.effect(() => () => {
    clearInterval(timer);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    return Promise.all([...fibers.keys()].map((id) => unload(id)));
  });

  sync().catch(() => {});
}
