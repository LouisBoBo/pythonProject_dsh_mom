---
name: piv-plan-implementation
description: 步骤4·规划实现。按场景写验证清单与建议改动面，不强行全栈。
---

# 规划实现 · validation-first（改编自 Cole · piv-plan-implementation）

## 何时用
- 一体化第 **4** 步；Prime context_pack 已有

## 输入
- PRD-lite（含 `scenario` / `delivery`）、`context_pack`、用户原话

## 做什么（完整过程）
1. 沿用步骤 2 场景；补齐该场景的建议改动面与验证项  
2. 给出待改路径提示 `files_hint`（来自读库）  
3. 冻结 `plan_rev`  

## 原则
- **需要的面做全，不需要的不强行加**（修 bug 不必凑菜单；只后端不必凑页面）  
- 开跑后优先实现；勿用形态多选卡打断  

## PASS / FAIL
| | 条件 |
|---|---|
| **PASS** | 计划含版本号、场景化 delivery、验证清单至少一条 |
| **FAIL** | 无法形成任何可执行验证项 |
