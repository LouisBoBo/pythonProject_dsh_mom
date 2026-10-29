---
name: piv-validate
description: 步骤6·机器验证。对照 Cole piv-validate；只认命令 exit code，禁止嘴炮通过。
---

# 机器验证（改编自 Cole · piv-validate）

## 何时用
- 一体化第 **6** 步；写码步骤已结束

## 输入
- `workspace`、计划中的验证清单 / `validate_commands`

## 做什么（完整过程）
1. 校验工程目录；无效则诚实失败（不打回乱点写码）  
2. 在工程目录内逐条执行验证命令  
3. 记录每条 exit code 与摘要  
4. 总 PASS/FAIL；失败可按 `on_step_fail` 自动回第 5 步修  

## 禁止
- 禁止靠模型说「应该过了」判定 PASS  
- 禁止本步改业务代码  

## PASS / FAIL
| | 条件 |
|---|---|
| **PASS** | 全部命令 exit 0，或配置允许跳过且已标明原因 |
| **FAIL** | 任一条非 0，或工程目录无效 |

## 用户在时间线看到什么
- **Skill**：`piv-validate · 机器验证 · 只认 PASS/FAIL`  
- **处理过程**：每条命令与退出码  
- **详细结果**：总判定 + 对照「全部 exit 0」说明；失败时可见失败命令  

## 工具
- 引擎 `validate.run_validate_commands`
