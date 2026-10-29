---
name: piv-create-pr
description: 步骤9·开 PR。对照 Cole piv-create-pr；本机 gh pr create，不伪造链接。
---

# 开 PR（改编自 Cole · piv-create-pr）

## 何时用
- 一体化第 **9** 步；提交已完成或已诚实跳过

## 输入
- `workspace`、分支状态、PR 标题/说明（可来自 PRD）

## 做什么（完整过程）
1. 检测本机 `gh` 是否可用  
2. `gh pr create` 写入标题与说明  
3. 回写 PR URL；无 gh / 无差异 / 已存在 → 诚实跳过并写明原因  

## 禁止
- 禁止自动合并 PR  
- 禁止伪造 PR 链接  

## PASS / FAIL
| | 条件 |
|---|---|
| **PASS** | 拿到 PR URL，或诚实跳过（无 gh / 无差异 / 已存在） |
| **FAIL** | gh 执行失败且不属于可跳过情形 |

## 用户在时间线看到什么
- **Skill**：`piv-create-pr · 开 PR`  
- **处理过程**：gh 调用日志、跳过原因或创建进度  
- **详细结果**：PR URL 或跳过说明  

## 工具
- 引擎调本机 `gh`；不经 Agent 手敲伪造
