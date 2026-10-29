---
name: prime-codebase
description: 步骤3·只读扫库。对照 Cole prime-codebase；生成 context_pack，不改文件。
---

# 读库上下文 · Prime（改编自 Cole · prime-codebase）

## 何时用
- 一体化第 **3** 步；PRD 已冻结；用户已选（或配置了）工程目录

## 输入
- `workspace` 绝对路径（经路径门禁）
- PRD 摘要（用于相关文件提示）

## 做什么（完整过程）
1. 校验工程目录合法（禁止盘外/越权）  
2. 索引顶层目录与工程标记（package.json、pyproject 等）  
3. 摘录必读文件片段 → `context_pack`  
4. 记录风险提示（空目录、非 git 根等）  

## 禁止
- 禁止修改任何文件  
- 禁止扫盘外路径  

## PASS / FAIL
| | 条件 |
|---|---|
| **PASS** | 目录通过校验并生成 context_pack（可含风险说明） |
| **FAIL** | 目录无效；当前实现会带警告继续，便于你在时间线看见问题 |

## 用户在时间线看到什么
- **Skill**：`prime-codebase · 读库上下文 · Prime`  
- **处理过程**：扫描目录、顶层列表、必读路径、风险行  
- **详细结果**：摘要 + context_pack 落盘说明  

## 工具
- 引擎 `prime.build_context_pack`；不经 Agent Bash 扫盘
