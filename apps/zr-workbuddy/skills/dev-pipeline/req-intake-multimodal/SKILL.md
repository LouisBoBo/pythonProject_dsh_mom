---
name: req-intake-multimodal
description: 步骤1·多模态需求采集。文字+贴图；识图走独立 vision 引擎（智谱）。Cole 33 无同名，本仓自写。
---

# 多模态需求采集（WorkBuddy 自写）

> Cole 33 中无同名 skill，按《需求到上线一体化方案》§8 定制。

## 何时用
- 一体化流水线第 **1** 步
- 用户发需求文字和/或贴图（「需求→上线」开启时贴图自动进引擎 pending）

## 输入
- 用户原话 `message`（可空，仅附图时引擎占位）
- 可选：会话 pending / `image_ids`（`engine/data/vision`）
- 可选：工程目录提示 `workspace`

## 做什么（完整过程）
1. 写入过程横幅：Skill 名、来源、会做/不会做  
2. 统计需求字数；有附图则调用**独立视觉引擎**识图  
3. 原文 + 识图结果写入 Epic `artifacts.raw_intake`  
4. 产出回执：摘要 + 详细结果（PASS 判定说明）

## 禁止
- 禁止本步改代码、跑测试、提交 Git  
- 禁止用「模型总结」冒充用户原话而不落盘原文  

## PASS / FAIL
| | 条件 |
|---|---|
| **PASS** | 至少一条非空需求文字，或识图成功写出有效描述 |
| **FAIL** | 需求为空且无可解析附件 / 识图失败且无文字 |

## 用户在时间线看到什么
- **Skill**：`req-intake-multimodal · 多模态需求采集`
- **这一步在干什么**：收成原始需求账本（含识图），不改代码  
- **处理过程**：字数、附图、识图、落盘确认  
- **结果 / 详细结果**：状态 pass + raw_intake / 识图预览  

## 工具
- 编排：`mes_dev_pipeline_begin`（引擎自动跑本步；Agent 勿重复 begin）
- 独立复用：`mes_vision_understand` · `/api/vision/*`
