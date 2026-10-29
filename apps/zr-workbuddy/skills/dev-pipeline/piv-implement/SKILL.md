---
name: piv-implement
description: 步骤5·写码。对照 Cole piv-implement；执行器为本机 Cursor 写码插件 :18788。
---

# 写代码（改编自 Cole · piv-implement）

## 何时用
- 一体化第 **5** 步；计划已锁定

## 输入
- PRD + plan + workspace  
- 配置：`cursor_coding` 基址 / Key（本机插件）

## 做什么（完整过程）
1. 组装 requirement（**范围契约（违反则失败）** + 场景化交付 + 需求 + PRD + 计划）  
2. 调用本机 Cursor 写码插件 `:18788`：确认单 → 开工 → 等 Job  
3. 回收 `job_id`、变更文件列表、失败原因（若有）  
4. auto_run 时本步真实改盘；非 auto 时可为 HITL「写码已完成」交接  

## 禁止
- 禁止改 `@zhongruan/dsh-cursor-coding` 源码（分仓铁律）  
- 禁止用空 Job / 假成功冒充写码完成  
- 禁止跳过插件 Key 校验  
- 勿用形态多选卡打断；按场景与仓库惯例实现，不强行凑齐全栈  


## PASS / FAIL
| | 条件 |
|---|---|
| **PASS** | 写码 Job 成功结束（或显式无代码变更） |
| **FAIL** | 插件未起 / Key 缺失 / Job 失败或超时 |

## 用户在时间线看到什么
- **Skill**：`piv-implement · 写代码 · Cursor 插件`  
- **处理过程**：工程目录、确认单、Job 状态流、变更文件  
- **详细结果**：job_id、成功/失败判定说明  

## 工具
- 引擎 `cursor_coding_client` → 插件 HTTP；镜像过程进 pipeline，不改写码卡 UI
