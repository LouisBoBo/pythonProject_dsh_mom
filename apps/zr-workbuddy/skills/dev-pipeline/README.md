# 需求→上线 · 步骤 Skills

对照 [Cole Medin 33 skills](https://github.com/coleam00/skills) 与本仓方案 §8 / §11。

运行时用户可见文案以引擎 `engine/app/dev_pipeline/skill_catalog.py` 为准；本目录供人读 / Agent 加载。

## 时间线每一格你会看到

| 区块 | 含义 |
|------|------|
| **Skill** 标签 | 本步专业技能名（Cole 改编或本仓自写） |
| **这一步在干什么** | 白话说明流程边界（会做 / 不会做写在过程横幅） |
| **处理过程** | 逐步日志：开始 → 中间动作 → 落盘/调用结果 |
| **结果** | 一句话摘要 |
| **详细结果** | 状态 + 摘要 + PASS/FAIL 判定说明 + 额外证据行 |

## 十步对照表

| 步 | Skill | 来源 | 用户可见要点 |
|----|-------|------|----------------|
| 1 | [req-intake-multimodal](./req-intake-multimodal/SKILL.md) | 本仓自写（Cole 无） | 原文落盘，不改代码 |
| 2 | [plan-create-prd](./plan-create-prd/SKILL.md) | Cole 改编 | 目标/验收/非目标，不定技术 |
| 3 | [prime-codebase](./prime-codebase/SKILL.md) | Cole 改编 | 只读扫库 → context_pack |
| 4 | [piv-plan-implementation](./piv-plan-implementation/SKILL.md) | Cole 改编 | 先验证清单再路径 |
| 5 | [piv-implement](./piv-implement/SKILL.md) | Cole 改编 | Cursor 插件 `:18788` 真实改盘 |
| 6 | [piv-validate](./piv-validate/SKILL.md) | Cole 改编 | 只认命令 exit code |
| 7 | [piv-review-changes](./piv-review-changes/SKILL.md) | Cole 改编 | 审码车道，Blocker 阻断 |
| 8 | [piv-commit](./piv-commit/SKILL.md) | Cole 改编 | 提交车道 + 门禁 |
| 9 | [piv-create-pr](./piv-create-pr/SKILL.md) | Cole 改编 | `gh pr create`，不伪造 |
| 10 | [piv-deploy](./piv-deploy/SKILL.md) | 本仓自写（Cole 无） | 部署车道 + 探活 |

## 正确性

Skill 是说明书；**是否完成**只看引擎账本该步 `status=pass` 与 Receipt，不以 Agent 口头为准。
