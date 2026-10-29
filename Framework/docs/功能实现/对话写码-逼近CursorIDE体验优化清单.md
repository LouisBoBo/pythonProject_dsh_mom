# 对话写码 · 逼近 Cursor IDE 体验优化清单

> **状态**：本轮已收口（P0～P1 已做；P2-1 用户明确不做）  
> **下一波策略原文**：[对话写码-能用工具提升方案.md](./对话写码-能用工具提升方案.md)（A/B/C 完整表）  
> **下一波执行勾选**：[对话写码-能写好改好优化清单.md](./对话写码-能写好改好优化清单.md)  
> **冻结日**：2026-10-16  
> **产品入口**：http://127.0.0.1:3081  
> **写码入口**：唯一 `zr_cchat_*`（`@zhongruan/dsh-cursor-chat` · sidecar 常见 :18791）  
> **相关规则**：`.cursor/rules/workbuddy-coding-first-time-right.mdc` · `workbuddy-no-dsh-plugin.mdc` · `workbuddy-security-enterprise.mdc`  
> **对照方案**：[AI-Coding接入Cursor-体验逼近方案.md](./AI-Coding接入Cursor-体验逼近方案.md) · [P0-1-本机写码功能实现.md](./P0-1-本机写码功能实现.md)

## 0. 目标与硬边界

**目标**：在 WorkBuddy 聊天壳里，对话写码尽量接近 Cursor IDE / Composer——顺畅、少白跑、失败一眼懂、续改一轮尽量成；能应对用户常见写码诉求。

**硬边界（优化时一律不得削弱）**：

1. **不改** DSH 写码插件源码 / `~/.dsh/**/node_modules` / 市场 Bundle（缺口只告知用户去插件仓）。  
2. **不削弱 HITL**：确认卡仍是人确认开工；禁止 Agent `confirmed=true` 偷开工。  
3. **第一次就要做对**：先读最新 `cch-*.json` 的 `detail` / `changed_files` / `synced_files`，再改代码；禁止「先凑合下一轮再修」。  
4. **现有功能可用为前提**：每条落地后须跑相关单测；改 `client-src` 须 `build:client`；需要时本机 `restart-web` + 刷新 3081 冒烟。

**本仓可改范围**：`apps/zr-workbuddy/plugins/mes-bridge/`、`apps/zr-workbuddy/engine/`、本清单与规则文档。

---

## 1. 差距总表（Cursor IDE vs WorkBuddy）

| 维度 | Cursor IDE | WorkBuddy 现状 | 本清单对应 |
|------|------------|----------------|------------|
| 开工摩擦 | 说话即写 | 每次 begin/continue 确认卡 | 保留 HITL；只做说明更清楚 |
| 改盘模型 | 直接改工作区 | 沙箱 → 同步回工程 | 同步失败须回收源码 |
| 网络抖动 | IDE 内可重试体感 | `Network request failed` 整单 0 改动 | §2 P0-1 |
| `*.db` EPERM | 一般不当同步产物 | 曾整单空同步 | §2 已完成 + 回归 |
| 附图 | 本机文件 | 曾 http URL 致本地 SDK 挂 | §2 已完成 |
| 续改上下文 | 同会话连续 | 失败轮 `synced=0` 交接弱 | §2 已完成 |
| 失败说明 | 自然 | 易像「新开写码」 | §2 / P1-1 |
| 结论 | 短、可验 | 依赖提示词 | P2-1 |

```text
用户一句话
  → HITL 确认卡（保留）
  → 沙箱拷贝
  → Cursor Local SDK（出网失败 → P0-1）
  → 同步回工程（*.db EPERM → 已回收）
  → 进度卡 + 口语结论（P1/P2）
```

---

## 2. 逐条清单（做完勾选）

> 勾选约定：`- [ ]` 未做；`- [x]` 已做并验收。改状态时写上日期与简要证据（Job id / 单测名）。

### 2.0 已落地硬坑（基线，禁止回退）

- [x] **附图本地化**：`zr_cchat_*` 执行前把 `vimg` / `/api/vision/images/…` 转成 data URL（本地 SDK 拒 http URL）  
  - 实现：`mes-bridge/lib/coding-image-localize.js` + `index.js` execute 钩子  
  - 单测：`tests/test_coding_image_localize.js`  
  - 日期：2026-10-16

- [x] **\*.db EPERM 后从沙箱回收非 db 源码**  
  - 实现：`engine/app/dev_pipeline/implement.py`（`copy_code_files_from_sandbox`）· `engine/app/cursor_chat_recover.py` · `POST /api/cursor-chat/recover-db-sync` · 客户端 `installDbSyncFailAutoRecover`  
  - 单测：`engine/tests/test_implement_db_sync_recover.py`  
  - 日期：2026-10-16

- [x] **失败后续改确认卡说明**（不自动点确认、不削弱 HITL）  
  - 实现：`client-src/apply.js` → `installContinueConfirmClarify` + styles  
  - 日期：2026-10-16

- [x] **失败轮续改交接**：注入【系统续改交接】（`changed_files` 剔 \*.db）+ 谨慎钉 `parent_job_id`  
  - 实现：`mes-bridge/lib/coding-continue-handoff.js` + `index.js`  
  - 单测：`tests/test_coding_continue_handoff.js`  
  - 日期：2026-10-16

- [x] **成功同句禁止再弹续改确认** + IDE 风格失败/成功结论文案（含 URL 图 / EPERM / Agent missing）  
  - 实现：`mes-bridge/lib/coding-dup-guard.js`  
  - 单测：`tests/test_coding_dup_guard.js`  
  - 日期：2026-10-16

- [x] **仓内硬规则**：`.cursor/rules/workbuddy-coding-first-time-right.mdc`（alwaysApply）  
  - 日期：2026-10-16

### 2.1 P0 · 可靠性（优先逐条做）

- [x] **P0-1　网络失败「可感知 + 可重试」**  
  - **现象**：`Network request failed（retryable=true）`，`agent_id` 空、`changed/synced=0`（例：`cch-20261016-103549-4d38`）  
  - **本仓做**：  
    1. `formatFriendlyCodingCloseout` 识别 Network / retryable，口语说明「写码云网络抖动，非业务需求错」+「回继续走续改卡」  
    2. 客户端失败进度卡横幅区分 Network（与 db EPERM / URL 图并列，不混）  
    3. Agent 提示词：禁止把 network fail 说成需求不清或已改代码  
  - **不做**：改 DSH 插件 / Cursor SDK 重试策略  
  - **验收**：单测覆盖 Network closeout；人工：失败卡文案正确；成功写码路径无回归  
  - **完成证据**：`test_coding_dup_guard.js`「Network request failed…」；`installDbSyncFailAutoRecover` 内 Network 横幅（`ATTR=network`）；写码路由 `8b` + 普通写码模式段；未改 DSH 插件/SDK；`build:client` 已落地

- [x] **P0-2　硬坑回归门禁打包**  
  - **本仓做**：固定「改写码必跑」命令（Windows / 仓根可复制）：  
    ```powershell
    cd D:\AICodes\DSH_WorkBuddy
    node scripts/lib/run_coding_hard_pit_tests.mjs
    ```
    分项等价：  
    - mes-bridge：`npm --prefix apps/zr-workbuddy/plugins/mes-bridge run test:coding`  
      （或 `node --test apps/zr-workbuddy/plugins/mes-bridge/tests/test_coding_*.js`）  
    - engine（**须 cwd=engine**）：`py -3 -m unittest tests.test_implement_db_sync_recover -v`  
    - 快捷：`npm --prefix apps/zr-workbuddy/plugins/mes-bridge run test:coding-hard-pits`  
  - **约定**：改附图本地化 / dup-guard / 续改交接 / Network closeout / db 沙箱回收后，交付前必跑上述门禁；规则见 `.cursor/rules/workbuddy-coding-first-time-right.mdc` §5  
  - **验收**：文档命令可复制即跑；CI/本地约定写清  
  - **完成证据**：`scripts/lib/run_coding_hard_pit_tests.mjs`；`mes-bridge` scripts `test:coding`（显式三文件，避免壳通配坑）+ `test:coding-hard-pits`；规则 §5 已钉门禁；本机跑通 12 JS + 4 recover  


### 2.2 P1 · 续改与失败体验

- [x] **P1-1　失败进度卡四类一眼懂**  
  - 分类：Network · EPERM-db · URL 附图 · Agent missing（及其他）  
  - 实现落点：优先扩展现有 `installContinueConfirmClarify` / `installDbSyncFailAutoRecover` 旁的失败说明，避免新造第二套扫描器  
  - **验收**：四类文案不串；不自动点确认；composer 系统输入不受影响  
  - **完成证据**：`lib/coding-fail-kind.js` 统一分类+双卡文案；续改卡 `applyFailed` / 进度卡 `maybeRecover` 共用；`test_coding_fail_kind.js`；hard-pit 15+4 绿；`build:client` 已落地；未自动点确认、未改 composer

- [x] **P1-2　续改一轮成功率再收紧**  
  - Agent 提示：失败后续改必须带 `parent_job_id`；Network 失败优先同句 continue，勿无故 begin  
  - 核对交接与 recover 已启用（本机 restart-web 后冒烟）  
  - **验收**：失败 Job → continue 确认卡诉求含【系统续改交接】或 Network 指引；成功同句仍被 dup-guard 拦  
  - **完成证据**：提示词 5/5b/8b「必须 parent_job_id + Network 勿 begin」；`buildFailedParentHandoff` Network 交接；`pre-execute` 确认卡前注入交接；dup-guard Network 同句拦 begin；单测 Network 交接 + begin/continue；hard-pit 17+4 绿；HITL/插件未改

### 2.3 P2 · IDE 体感（结论）

- [ ] ~~**P2-1　终态结论更短更准**~~（**本轮不做** · 2026-10-16 用户明确跳过）  
  - 原范围：成功做了什么+怎么验；失败原因类+下一步一句  
  - 现有 closeout / 四类失败卡 / 提示词收尾已覆盖主路径；若以后要再收短结论文案，须用户再开此项

### 2.4 明确不做（未破窗）

- [ ] ~~削弱 / 取消写码 HITL 确认卡~~（需用户对话明确允许并先改安全规则）  
- [ ] ~~修改 `@zhongruan/dsh-cursor-chat` 同步层跳过 \*.db~~（插件仓事项，本仓只提现象）  
- [ ] ~~P2-1 终态结论再收短~~（见 §2.3；本轮用户跳过）

---

## 3. 每条落地作业标准（强制）

1. **只做当前一条**；合并无关重构一律禁止。  
2. **先证据**：读最近相关 `cch-*.json` 或复现步骤。  
3. **改完自检**：  
   - 写码相关：先跑 `node scripts/lib/run_coding_hard_pit_tests.mjs`（见 P0-2）  
   - 若改 `client-src`：`npm --prefix apps/zr-workbuddy/plugins/mes-bridge run build:client`  
   - 提示用户：`powershell -NoProfile -File scripts\restart-web.ps1`，刷新 **3081** 冒烟  
4. **勾选本清单**：把 `- [ ]` 改成 `- [x]`，写日期与证据。  
5. **下一条**：等本条验收通过再开下一条。

---

## 4. 建议执行顺序

1. P0-1 网络失败可感知可重试 ✅  
2. P0-2 回归门禁打包 ✅  
3. P1-1 失败卡四类一眼懂 ✅  
4. P1-2 续改一轮再收紧 ✅  
5. P2-1 结论文案 — **本轮跳过**（用户 2026-10-16）

**本轮收口**：2026-10-16 · P0-1～P1-2 已交付；P2-1 不做；§2.4 破窗项仍冻结。

---

## 5. 维护

- 新发现的写码硬坑：先补进 §2.0 或新开一条 P0/P1，再改代码。  
- 与 [AI-Coding接入Cursor-体验逼近方案.md](./AI-Coding接入Cursor-体验逼近方案.md) 长期目标对齐；本清单是 **2026-10 起可勾选的执行板**。  
- 索引：见 [docs/README.md](../README.md)「功能实现」表。
