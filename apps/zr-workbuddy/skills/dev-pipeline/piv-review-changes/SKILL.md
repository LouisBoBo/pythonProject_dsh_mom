---
name: piv-review-changes
description: 步骤7·复核。一体化只审本次写码变更文件；聊天审码卡仍全量抽样（另一条分支）。
---

# 复核 · 审码（改编自 Cole · piv-review-changes）

## 何时用
- 一体化第 **7** 步；验证已通过

## 输入
- `workspace`
- Epic `artifacts.implement.changed_files`（第 5 步写码 Job 回写）

## 做什么（完整过程）
1. 从写码产物读取变更文件列表  
2. **只审这些文件**（调用审码引擎时传 `files=`）  
3. 无变更文件 → 诚实跳过，**不**退回全仓  
4. 有 Blocker → 本步 FAIL  

## 与「聊天审码卡」的分工（勿混）
| 入口 | 范围 |
|------|------|
| 一体化步骤 7（本 skill） | **仅本次改动** |
| `mes_code_review_*` / 聊天审码卡 | **全仓按优先级抽样**（原逻辑保留） |

## 禁止
- 禁止一体化步骤因缺文件列表而默默全仓审  
- 禁止改聊天审码卡默认 `files=None` 行为  
- 禁止自动 git commit  

## 失败闭环（auto_run）
- Blocker / 审码未过 → 写入 `review_fail_evidence` → **打回步骤 5 写码**（requirement 含审码意见）→ 自动再跑 6、7  
- 轮次上限：`config.yaml · dev_pipeline.max_fix_rounds`（默认 3）  
- 用尽轮次后：停在步骤 5 待人工改码并确认  

## PASS / FAIL
| | 条件 |
|---|---|
| **PASS** | 改动文件审完且无 Blocker；或无改动而跳过 |
| **FAIL** | 审码失败或存在 Blocker |
