# 商用模型与 Cursor SDK 分工（定稿说明）

> **状态**：2026-09-24 研讨落盘，与当前实现对齐。  
> **代码锚点**：`engine/app/llm_config.py`、`engine/app/code_dev/cursor_agent.py`、`plugins/mes-bridge/client-src/settings.js`（配置中心 · 商用模型）。  
> **相关**：[P0-1-本机写码功能实现.md](../功能实现/P0-1-本机写码功能实现.md)、[AI-Coding接入Cursor-体验逼近方案.md](../功能实现/AI-Coding接入Cursor-体验逼近方案.md)、[DSH-LLM用量计量插件-开发指导.md](../功能实现/DSH-LLM用量计量插件-开发指导.md)、`.cursor/rules/workbuddy-first-ready.mdc`（DeepSeek Key 与聊天可用）。

---

## 1. 一句话结论

| 能力 | 用什么 | 配什么 Key |
|------|--------|------------|
| **DSH 聊天壳 · 模型下拉** | DSH `llm/stream` + 引擎 **商用模型**（DeepSeek / Ollama / 通用 OpenAI 兼容） | **DeepSeek Key**（`config.yaml` → 同步 DSH 凭据）；**不是** Cursor Key |
| **本机写码 / 沙箱改盘 / 删除定位** | **`cursor_sdk` Local `Agent.create`** | **Cursor API Key**（`code_dev.cursor_api_key`） |
| **讨论卡、审码、查数、PCB 问答** | 引擎 **`llm_freeform` / `llm_chat`**（OpenAI 兼容 HTTP） | 商用模型 Key（同上） |

**不能**指望：在 WorkBuddy 配好 Cursor Key 后，聊天输入框旁的「模型」下拉自动变成 Cursor IDE 里的 Grok / Composer 列表。

**可以**指望：在 **Cursor SDK 链路**（写码等）里配 Key 后，**选择模型**（含 `auto`），后续可扩展「拉账号可用模型列表」下拉。

---

## 2. 配置中心 · 商用模型（LLM 意图引擎）

### 2.1 提供方（三选一，已去掉「不使用 LLM」）

| `provider` | 界面文案 | 用途 |
|------------|----------|------|
| `deepseek` | DeepSeek API | 默认；Key 保存后 **同步** 到本机 DSH 聊天凭据（`DEEPSEEK_API_KEY`） |
| `ollama` | Ollama 本地 | 本机 Ollama；无需 API Key 字段 |
| `openai_compat` | 通用模型配置 | 任意 OpenAI 兼容 Base URL + Key + 模型名；**不同步** DSH DeepSeek 凭据 |

### 2.2 分槽存储（禁止混填）

配置节仍叫 `deepseek`（历史字段名），但内含 **`by_provider`** 分槽：

- `deepseek` / `ollama` / `openai_compat` 各有一套 `api_key`、`base_url`、`model`。
- 切换提供方时，界面只展示 **当前 provider 对应分槽**；未保存过的「通用模型」分槽应为空，不得显示 DeepSeek 已填内容。
- 磁盘上若仍是 legacy「仅顶层 `api_key`」，加载时 **只回填当前 provider**，不被默认模板里的空 `by_provider` 盖掉。

实现：`engine/app/llm_config.py`（`normalize_deepseek_block`、`resolve_llm_cfg`、`prepare_deepseek_for_save`）。

### 2.3 API Key 界面语义

- **已保存**：输入框留空 + 文案「当前已配置（已脱敏，留空保存不修改）」；占位符「已配置，留空保存则保持不变」。
- **未保存**：占位符「未配置，请粘贴 … Key 后保存」；**不要**用 `sk-...` 这类易误解占位。
- 仅 **`provider=deepseek`** 时，`dsh_chat_credential` 才把 Key 写入 DSH；`openai_compat` 的 Key **不得**覆盖聊天 DeepSeek 凭据。

---

## 3. 三条模型管道（对照 IDE）

```text
┌─────────────────────────────────────────────────────────────┐
│ WorkBuddy 聊天（模型: DeepSeek-V4-Flash、推理等级…）         │
│   DSH 宿主 llm/stream → 商用模型 HTTP                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ 写码车道 / code_dev                                          │
│   engine → cursor_sdk Local Agent（sandbox cwd）             │
│   model: code_dev.model（如 composer-2.5 / auto）            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Cursor IDE 桌面（Grok / Composer、额度百分比…）                │
│   Cursor 客户端内部；与 WorkBuddy 配置无自动同步              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Cursor SDK · 模型与 Auto

- Python：`model="auto"`；TypeScript：`model: { id: "auto" }` —— 由 **Cursor 服务端**按账号选模型（与 IDE「Auto」同类，**不保证**每次与 IDE 手选型号一致）。
- WorkBuddy：`code_dev.model` 设为 `auto` 并保存即可传入 `Agent.create`。
- 若主模型 **不是** `auto`，且指定模型 **额度用尽**，`cursor_agent.py` 会 **再试 `model=auto`** 一次。
- 列表能力（可选产品增强）：SDK 提供 `Cursor.models.list()` / Cloud 侧 `listCloudModels`；下拉是 **「API 账号可用模型」**，不是 IDE UI 的 1:1 克隆。

Local 与 Cloud 可用模型集合可能不同；写码主路径是 **Local**。

---

## 5. 现有功能 · 谁在用 Cursor SDK

### 5.1 已用 Cursor SDK（引擎内）

| 功能 | 路径 | 说明 |
|------|------|------|
| 本机写码（主路径） | `code_dev/service.py` → `run_cursor_local_agent` | 沙箱内改码 |
| 删除 · `cursor_plan` | 同上 | Cursor **只读定位**，引擎规则删文件 |
| 删除 · `cursor_full` | 同上 | Cursor 在沙箱内改盘 |
| 删除 · `engine_first` | 引擎规则 | **故意不调** Cursor |

配置：`code_dev.enabled`、`cursor_api_key`、`model`、`cursor_timeout_sec` 等。

### 5.2 与 Cursor 相关、但不在引擎 SDK 内

| 能力 | 说明 |
|------|------|
| **Cursor 写码（配置页）** | `~/.zhongruan/cursor-coding`；可选 **:18788** 边车；Key 与 `code_dev` 同步 |
| **远端审码** | **:18787** 独立服务 / DSH 生态插件；WorkBuddy 只做配置与健康探测 |
| **DSH 聊天模型** | 见 §1；与 Cursor Key 无关 |

### 5.3 当前用引擎 LLM（DeepSeek 等），非 Cursor SDK

| 功能 | 实现 | 是否建议改 Cursor SDK |
|------|------|------------------------|
| 写码需求讨论（选项卡 / 确认卡） | `code_dev/discuss.py` → `llm_freeform` | **低～中**：建议保持 DeepSeek（轻、快）；**执行**仍用 Cursor |
| 本机目录审码 | `code_review/review.py` 分批 `llm_freeform` + Skill | **中～高**：可与写码共用 Cursor Key；需重做批处理、流式、用量 lane |
| 提交批审 Skill | `code_commit/skill_review.py` | **中**：类似审码；保留正则降级 |
| 聊天 / MES 查数意图 | `nl_engine.llm_chat`、`cli_ops.chat` | **不建议** |
| PCB 专家 | `pcb_expert.py` | **不建议**（领域问答） |
| 自动化部署 | SSH / 构建 | **无 LLM** |

### 5.4 基本保持现状

- `mes-ask`、MES 查数、出图、演示数据  
- `code-deploy`、`mes-config`、插件启停、用量页  
- **视觉模型**（`vision` 配置节）：OpenAI 兼容多模态 API，不走 Cursor SDK  

---

## 6. 产品优先级（若继续演进）

| 优先级 | 方向 |
|--------|------|
| **P0（已有）** | 写码执行深化：模型列表、`auto`、额度 fallback |
| **P1（可选）** | 本机审码与写码 **共用 Cursor Key**（Local Agent + 现有 Skill） |
| **P2（可选）** | Cloud Agent：远端仓 / CI 一次性审码或 PR 辅助（需单独立项） |
| **不建议** | 聊天壳下拉同步 Cursor 模型；MES/PCB/discuss 全换 Cursor |

---

## 7. 对外口径（怎么跟用户说）

- 「聊天里换模型」= **WorkBuddy 配置中心 · 商用模型**，和 Cursor 账号里的模型 **不是同一套菜单**。  
- 「写代码谁改盘」= **Cursor**（本机 SDK）；「聊需求、出选项卡」= **DeepSeek 等商用模型**（不占 Cursor 写码额度）。  
- 装好 WorkBuddy 后 **必须能聊、能调工具**：靠 **DeepSeek Key** 与统一门禁（见 first-ready 规则），**不能**改成「必须先配 Cursor 才能聊天」。

---

## 8. 验收自检（改相关代码后）

```bash
# 在 apps/zr-workbuddy/engine 目录：
python -m unittest tests.test_llm_config tests.test_dsh_chat_credential -v

node scripts/build-mes-bridge-client.mjs --check
scripts/engine.sh zr-workbuddy restart
```

- 配置中心：DeepSeek / 通用模型 **分槽不混填**；DeepSeek Key **已配置**状态文案正确。  
- `provider=openai_compat` 保存后 **不**覆盖 DSH `DEEPSEEK_API_KEY`。  
- 写码：`code_dev.model=auto` 可启动；指定模型额度不足时可见 **fallback auto** 状态文案（若有）。
