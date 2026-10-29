# Cursor SDK 能力清单

> 对象：`@cursor/sdk`（TypeScript，npm）与 `cursor-sdk`（Python，pip）。同一套 `Agent → Run` 模型，仅语法差异（camelCase / snake_case、默认 async / 默认 sync）。
> 权威文档：[TypeScript](https://cursor.com/docs/sdk/typescript) · [Python](https://cursor.com/docs/sdk/python) · [Changelog](https://cursor.com/docs/sdk/changelog)。
> 本清单是「能干什么」的明细，不是接入教程；接入看 `AI-Coding接入Cursor-体验逼近方案.md`。

## 0. 一句话定位

Cursor SDK 是 **Agent SDK**，不是模型推理 / Chat Completions API。它把 Cursor IDE 里那个能读仓库、调工具、跑命令、改文件的 Agent 拿出来给你用代码调。模型推理始终走 Cursor 托管，SDK 只决定 Agent 在哪跑、看到什么、能用什么工具。

---

## 1. 两种运行时

| 运行时 | 在哪跑 | 文件从哪来 | 适合 |
|---|---|---|---|
| **Local** | 调用方本机 Node 进程内 | 本机磁盘（`local.cwd`） | 开发脚本、已有 checkout 的 CI、本机写码沙箱 |
| **Cloud** | Cursor 托管 VM | 克隆你给的 repo（或空 VM） | 长任务、并行多 Agent、要开 PR 的自动化、调用方没有仓库 |

- 「Local」指 Agent 循环和文件访问在本机，**不是**模型在本机；两种模式下推理都走 Cursor 托管模型。
- 运行时由 `Agent.create` 传 `local` 还是 `cloud` 决定；**不显式传会被静默选 Local**（常见坑）。
- 同一个 `CURSOR_API_KEY` 两种模式都能用；Team Admin API key 暂不支持。
- Cloud Agent ID 以 `bc-` 开头，Local 以 `agent-` 开头；`Agent.resume` 按前缀自动选运行时。

### Cloud 专属

- **无 repo Agent**：`cloud: { repos: [] }` 或省略 `repos`，在空 VM 里跑（研究、总结、不碰代码的活）。需账号/团队开通；repo 限权 key 不能建。
- **会话环境变量** `cloud.envVars`：随 Agent 存活、加密落盘、Agent 删了就没了；变量名不能以 `CURSOR_` 开头。单轮临时变量用 `agent.send` 上的 `cloud.envVars`。
- **Agent 元数据** `cloud.metadata`：你自己的字符串标签，`Agent.get` / `Agent.list` 回显。
- **自动开 PR**：`autoCreatePR: true`；`openAsCursorGithubApp` 控制以谁身份开；`skipReviewerRequest` 抑制 reviewer 通知；`workOnCurrentBranch` 推到当前分支而非新分支。
- **自托管池**：`cloud.env` 可指 `{ type: "cloud" | "pool" | "machine" }`，路由到 Cursor 托管或你自托管的 worker。

---

## 2. 三种调用形态

| 形态 | 写法 | 适合 |
|---|---|---|
| **一次性** | `Agent.prompt(...)` | 跑完即走、无后续、无流式；GitHub Action 步骤 |
| **可续聊** | `Agent.create` → `agent.send` | 多轮、流式、要取消/状态监听；多数集成用这个 |
| **接回旧 Agent** | `Agent.resume(agentId)` | 跨进程续聊、webhook 续作、cron 接昨晚的活 |

- `Agent.prompt` 内部 create→send→dispose，**没有第二轮**；要续就用形态 2。
- `Agent.create` 每次都是新 Agent、新 `agentId`、空白上下文。要续同一对话，存下 `agent.agentId`，下次 `Agent.resume`。
- `Agent.resume`：运行时按 ID 前缀自动判；本地从检查点库加载，云端从服务器加载。**`model` 在 resume 时要再传**（不传则 undefined）。**内联 `mcpServers` 不随 resume 保存**，要再传；文件型 MCP（`.cursor/mcp.json` + `settingSources`）会自动留。

---

## 3. 内置工具集（Agent 能干的活）

Agent 能调这些内置工具，所以它不止「写代码」：

| 工具 | 能力 |
|---|---|
| `read` / `edit` / `write` | 读、改、写文件 |
| `glob` / `grep` / `ls` | 按名、按内容、按目录查文件 |
| `semSearch` | 语义搜索仓库 |
| `shell` | 跑终端命令（`engine.sh`、测试、`svn`、`npm`…） |
| `webSearch` / `webFetch` | 联网搜索、抓网页 |
| `task` | 开子 Agent（子任务） |
| `mcp` | 调 MCP 服务器工具（含你挂的 customTools） |

**限制工具集**（仅 Local）：

- `tools: [...]` 白名单，只给这些；`tools: []` 只能回文字，不能动手。
- `disallowedTools: [...]` 黑名单，去掉这些留其余；`disallowedTools: ["shell"]` = 只读不跑命令。
- 可用公共名（`"read"`）、能力组（`"shell"`、`"mcp"`）、或 proto 原名；未知名 `create`/`resume` 时抛 `ConfigurationError`。
- 禁 `mcp` 连 customTools 一起没；禁 `task` 则不能开子 Agent。
- 两者都不随 Agent 持久化，`resume` 要再传。
- **只读 Agent**：`tools: ["read", "grep", "glob", "ls"]`，只查不改。

---

## 4. 自定义工具 customTools（把你的函数挂给 Agent）

不另起 MCP 服务器，直接把你写的函数挂上去，Agent 当 MCP 工具调。

- 传在 `local.customTools`，SDK 注册成一个叫 `custom-user-tools` 的 MCP 服务器；Agent 走正常 MCP 路径发现和调用。
- **仅 Local**；Cloud 传了会抛 `ConfigurationError`。
- customTools 跳过交互审批，沙箱和 auto-review 运行里也能直接调；沙箱限制和 deny 规则仍生效。
- 能下到子 Agent（含嵌套）。
- `create` 时设 = 每轮都用；`send` 时设 = 仅这轮替换。

工具定义：`description`（给模型看何时调）、`inputSchema`（JSON Schema）、`outputSchema`、`annotations`（`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`，仅提示不强制）、`execute`（你的回调，在调用方进程里跑，能访问你代码能访问的一切）。

返回值：纯字符串 / 任意 JSON / 结构化信封（`content` 可混 text 和 base64 image，`isError` 报错，`structuredContent` 给模型解析）；`execute` 里 throw 也算工具错误回传给 Agent。

**本项目用法**：把 `mesEngine.runEngine` 那套后厨能力、用量账本查询、当前登录用户查询等包成 customTool，Agent 写码时能顺手调，不用自己去翻文件。

---

## 5. 子 Agent（task 工具）

- 在 `agents` 里定义子 Agent（`name` / `description` / `prompt` / 可选 `model`）；仓库里 `.cursor/agents/*.md` 也会被捡起来；内联定义覆盖同名文件定义。
- **嵌套**：子 Agent 能再开子 Agent，但有层数限制；子 Agent 拿到和父一样的子 Agent 执行器和 customTools。
- **后台子 Agent**（仅 Local）：结果作为同一 run 的后续 turn 回到父 Agent，不会被丢；`run.stream` 继续出事件，`run.wait` 等到最后一轮。
- 禁 `task` 工具 = 不能开子 Agent。

---

## 6. 对话模式 mode

- `"agent"`（默认）：直接动手改。
- `"plan"`：只探索和出方案，不改盘。
- `create` 时设首轮；`send` 时传则仅这轮切换，不传保持当前。

---

## 7. MCP 服务器

- 传输：HTTP（静态 `headers` 或 OAuth `auth`）或 stdio（`command`/`args`/`env`）。
- Local：本机能连的 stdio / HTTP 都行；OAuth 需要登录时 SDK 不会弹浏览器，只能复用 Cursor app 里已登录的。
- Cloud：HTTP 和 stdio 都支持（stdio 在 VM 里跑）；HTTP 敏感头由后端处理、对 VM 脱敏；stdio `env` 进 VM，当运行时密钥对待。
- **加载优先级**（Local，同名先匹配胜）：`send` 内联 > `create` 内联 > 插件（`settingSources` 含 `"plugins"`）> 项目 `.cursor/mcp.json`（含 `"project"`）> 用户 `~/.cursor/mcp.json`（含 `"user"`）。
- 不设 `settingSources`，只加载内联服务器。
- 内联服务器在 `send` 上是**全替换**不是合并；resume 不保存内联，要再传。
- **settingSources 放 `local` 里**，放顶层 TS 会报错、JS 静默无效；对 Cloud 无效（Cloud 恒读 project/team/plugins）。

---

## 8. 上下文与记忆（重点）

模型在两次补全间**不保留记忆**。SDK 提供的是两种不同东西：

### 8.1 同一 Agent 的对话续聊
- `agent.send` 多轮，或 `Agent.resume(agentId)` 跨进程续，能看到前面说过什么、改过什么。
- Local 存本机检查点库（默认 SQLite，可换 JSONL 或自定义）；Cloud 存服务器。
- 这份记忆**只属于这个 agentId**；新建 `Agent.create` 又是空白。
- 对话太长旧内容会被挤掉。

### 8.2 落盘的说明文件（跨任务共享）
- `settingSources` 打开后读磁盘上的规则 / 技能 / `AGENTS.md` / MCP 配置。
- `"project"`：仓库 `.cursor/rules`、`.cursor/skills`、`AGENTS.md`、`.cursor/mcp.json`。
- `"user"`：`~/.cursor/` 下的个人规则 / 技能 / MCP。
- Cloud 自动读克隆下来的项目规则和团队配置，不看 `settingSources`，也读不到本机 `~/.cursor`。
- **只存在某次 IDE 聊天里的内容，SDK 读不到**；要带走就写成文件。

### 8.3 本项目现状与建议
- 本项目 `cursor_agent.py` 里 `setting_sources: []`（故意关），每次 `Agent.create` 新建、不 resume → 每个任务都是空白 Agent + 新沙箱拷贝 + 现写任务说明。
- 想让 Agent「记住你怎么干活」：加一份按用户存的个人习惯文件，在 `build_prompt` 拼说明前读它拼进去。落点 `engine/app/code_dev/cursor_agent.py` 的 `build_prompt` + `engine/data/agent_memory/<user_id>.md`。
- 不要靠 `settingSources: ["user"]` 解决个人习惯：会把运行机器的个人配置带进客户代码。

---

## 9. 流式与结果

- `run.stream()`（TS，async iterable）/ `run.messages()`（Python）出 `SDKMessage` 事件。
- 更细粒度：`send` 传 `onDelta` / `onStep` 回调（token 级文字、工具参数流入、thinking delta、嵌套 task 更新、step 边界）；回调被 await，可施加背压。
- **`run.wait()` 几乎必调**：拿到终态 `RunResult`（`status` / `result` / `usage` / `git` 等）；不流式也要 `wait()`。
- 便利：`run.text()`（等 wait、返回最终文字）、`run.iter_text()`（流式文字块）。
- `run.conversation()`：结构化 `ConversationTurn[]`，用于渲染 / 持久化历史，不用订阅流。
- **steer `run.steer(text)`**：往正在跑的 turn 里插话，不等跑完；`complete_delivered` = 已吃进，`revert_to_followup` = 没吃进、改用 `agent.send` 发。前台子 Agent 在跑时也能 steer，子 Agent 转后台继续。
- `run.cancel()`：取消正在跑的；已结束的是 no-op；先 `run.supports("cancel")` 判断。
- `run.supports(op)` / `run.unsupportedReason(op)`：detached / rehydrated 的 run 可能不支持全部操作。

---

## 10. 用量与计费

- SDK 跑的计费、请求池、Privacy Mode 与 IDE / Cloud Agent 一致；花费进团队用量面板的 SDK 标签。
- 每轮 `RunResult.usage`：`inputTokens` / `outputTokens` / `cacheReadTokens` / `cacheWriteTokens` / `reasoningTokens`。
  - `reasoningTokens` 已含在 `outputTokens` 里，`totalTokens` 不再加（防双计）——与本项目用量口径一致。
- `Agent.getUsage()`：拉一个 Agent 的已计费用和美元成本（**仅 Cloud**）。本项目是 Local，不能当主路径；本项目用量走 `engine/app/usage` 的 `append_event` + `from_sdk_usage`。
- `requestId`：每轮平台生成的 UUID，串后端日志 / 分析 / 工单。

---

## 11. 沙箱 sandboxOptions（仅 Local）

- 默认 `enabled: false`：Agent 能读写 cwd、跑 shell、联网，无审批。
- 开启后约束每个 shell 调用和 shell 派生进程：
  - **文件**：写限 cwd / temp / `sandbox.json` 允许的路径；读不限工作区。
  - **shell**：平台沙箱（Linux bubblewrap、mac seatbelt、bundled `@cursor/sdk--` helper）；特权操作拒绝。
  - **网络**：默认拒绝出站；`.cursor/sandbox.json`（或 `~/.cursor/sandbox.json`）列允许主机。
- 主机不支持沙箱时 `ConfigurationError` 报缺依赖；关掉或改 Cloud。
- Cloud 恒在隔离 VM，`sandboxOptions` 不适用。

---

## 12. Auto-review（仅 Local）

- `local.autoReview: true`：本地工具调用走 Auto-review 分类器（IDE 同款），按安全和「调用是否匹配本轮意图」放行 / 拦截 shell / MCP / fetch。
- 无头运行没人审批，被拦的调用**直接拒**（不升级），Agent 拿到拦截原因可换路子。
- 需后端开启分类器；没开则回退默认行为。
- 用 `permissions.json` 的 `autoRun` 块引导分类器（与 IDE 同）。
- 是便利不是安全边界；严格控制要配 `sandboxOptions` 或 allowlist。
- Cloud 已在 VM，不适用。

---

## 13. 本地 Agent 存储库

- 本地 Agent 把元数据、对话检查点、run、run 事件落盘，让续聊和 `resume` 跨进程存活。
- 默认 on-disk SQLite（`node:sqlite`）；不可用时 `Agent.create` 抛 `ConfigurationError`，除非配 `JsonlLocalAgentStore` 或自定义。
- 三种后端：

| 库 | import | 用途 |
|---|---|---|
| `SqliteLocalAgentStore` | `@cursor/sdk/sqlite` | 默认，工作区状态根下 SQLite |
| `JsonlLocalAgentStore` | `@cursor/sdk` | NDJSON 文件，好检视 / 复制 / diff |
| 自定义 `LocalAgentStore` | 自己 | Redis / Postgres / 内存 / 托管库 |

- `JsonlLocalAgentStore` 写四个 NDJSON：`agents` / `runs` / `run_events` / `checkpoints`。
- 自定义：实现四个子存储（`agents` / `checkpoints` / `runs` / `runEvents`），各是小 CRUD；catalog 分页用 `cursor`/`nextCursor`，事件日志用 `afterOffset`/`nextOffset`。
- Cloud 存服务器，`local.store` 仅 Local。

---

## 14. 账号与平台读取

- `Cursor.auth.login()`：交互式浏览器登录，mint 用户 API key（默认 90 天）存 `~/.cursor/sdk/auth.json`；适合没预配 key 的交互宿主。可配 `openBrowser` / `onLoginUrl` / `signal` / `store` / `apiKeyName` / `apiKeyTtlMs`。
- `Cursor.auth.status()` / `Cursor.auth.logout()`。
- 凭据解析顺序：显式 `apiKey` > `CURSOR_API_KEY` > 存的登录；存的登录**不**读本地 Cursor app 安装，只存 SDK mint 的 key。
- `Cursor.me()`：当前用户（`userId` / `userEmail` / `apiKeyName`…）。
- `Cursor.models.list()`：可用模型 id、每模型 `params`（reasoning effort 等）、预设 `variants`；账号 / 团队相关。Router 是 `auto-smart`（Teams/Enterprise，Enterprise 需 admin 开）。
- `Cursor.configure()`：设 Local 默认（`store` / `useHttp1ForAgent` / `workspaceScanCacheTtlMs`），后续 `Agent.*` 调用沿用；单次调用字段覆盖默认，传 `null` 清默认。

---

## 15. 观察 / 管理已有 Agent

- `Agent.get(agentId)`：查 Agent 信息；`bc-` 前缀走 Cloud，否则 Local。
- `Agent.getRun(runId, { runtime, agentId })`：拿到 `Run` 句柄，可 `stream` / `wait` / `cancel`；只有 run id（日志 / webhook 来的）传 runId + runtime 提示，别和 agentId 混。
- `Agent.list({ runtime, cwd })`（Local 按 cwd 过滤）/ `Agent.listRuns(agentId)`。
- `Agent.archive(agentId)`：软删，transcript 仍可读；`Agent.delete(agentId)`：永久删，后续读 404。
- `Agent.cancelRun(runId, ...)`：取消 run。
- `agent.reload()`：重读文件系统配置（hooks、项目 MCP、子 Agent），不 dispose。
- SDK 建的 Cloud Agent 在默认列表里被过滤；Cursor Web / 客户端要看需点 Filter > Source > SDK。

---

## 16. Artifacts（产物下载）

- `agent.listArtifacts()`：列 Agent 工作区里的文件（`path` / `sizeBytes` / `updatedAt`）。
- `agent.downloadArtifact(path)`：下载内容。
- **runtime 相关**：Local SDK Agent 当前不返回 artifacts，`downloadArtifact` 会抛错；主要给 Cloud 用。

---

## 17. Hooks

- **仅文件型，无编程回调**；hooks 是项目策略边界，不是 per-run 旋钮。
- Local：仓库根 `.cursor/hooks.json`（`local.cwd`）或 `~/.cursor/hooks.json`（用户级）。
- Cloud：把 `.cursor/hooks.json` 和其脚本提交到 `cloud.repos` 的 repo；SDK 建的 Cloud Agent 自动加载项目 hooks；Enterprise 还跑团队 / 企业 hooks。
- 两个 SDK 都尊重 hooks，都不管理 hooks（配置看 [Hooks 文档](https://cursor.com/docs/hooks)）。

---

## 18. systemPrompt（替换系统提示，仅 Local）

- `Agent.create({ systemPrompt })`：替换 Cursor 内置主循环系统提示为你自己的文本。
- 模型失去 coding-assistant 身份 / 工具协议 / 沟通指引，需要你重述。
- 工具 schema、规则、技能仍加载；子 Agent 保留各自提示。
- **不随 Agent 持久化**，`resume` 要再传；Cloud 不支持（传了抛 `ConfigurationError`）；非空，纯空白抛错。

---

## 19. 资源管理（必做）

- 用完就 dispose：TS 用 `await using agent = await Agent.create(...)`；或 `try/finally` 里 `await agent[Symbol.asyncDispose]()`。`Agent.prompt` 自动 dispose。
- Python sync：`with Agent.create(...) as agent:`；或 `finally` 里 `agent.close()`；长跑靠默认 client 的进程收尾调 `close_default_client()`。
- Python async：嵌套两个 async context manager（`AsyncClient.launch_bridge` → `client.agents.create`）。
- 不 dispose 会泄漏子进程、打开的 DB、HTTP 连接。

---

## 20. 两个失败要分清

- 抛 `CursorAgentError` = run **没启动**（鉴权 / 配置 / 网络）；退出码 1。
- 返回 `result.status == "error"` = run **跑了但失败**；退出码 2。
- `error.isRetryable` / Python `is_retryable` + `retry_after`：后端说可重试才重试，别盲重试（Cloud 可能重复开 run）。

---

## 附：本项目接入现状

- 实现：`apps/zr-workbuddy/engine/app/code_dev/cursor_agent.py`，`Agent.create` → `agent.send` → `run.wait`，Local 沙箱 cwd。
- `setting_sources: []`（故意关，不把运行机个人配置带进客户代码）。
- 每次任务新建 Agent、不 resume → 无跨任务记忆；记忆方案见 §8.3。
- 用量走 `engine/app/usage`（`append_event` + `from_sdk_usage`），不走 Cloud-only 的 `agent.get_usage`。
- 接入方案与体验逼近：`AI-Coding接入Cursor-体验逼近方案.md`。



