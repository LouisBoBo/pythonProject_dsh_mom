FEATURE_ID = "dev-pipeline"

STEP_DEFS: list[dict[str, str]] = [
    {"id": "1", "key": "intake", "title": "需求采集", "skill": "req-intake-multimodal"},
    {"id": "2", "key": "prd", "title": "需求理解", "skill": "plan-create-prd"},
    {"id": "3", "key": "prime", "title": "读库上下文", "skill": "prime-codebase"},
    {"id": "4", "key": "plan", "title": "规划实现", "skill": "piv-plan-implementation"},
    {"id": "5", "key": "implement", "title": "写代码（Cursor 插件）", "skill": "piv-implement"},
    {"id": "6", "key": "validate", "title": "验证", "skill": "piv-validate"},
    {"id": "7", "key": "review", "title": "复核", "skill": "piv-review-changes"},
    {"id": "8", "key": "commit", "title": "提交", "skill": "piv-commit"},
    {"id": "9", "key": "pr", "title": "开 PR", "skill": "piv-create-pr"},
    {"id": "10", "key": "deploy", "title": "部署上线", "skill": "piv-deploy"},
]

# P1：自动软步骤至写码 HITL（含 Prime）；auto_run=false 时 begin 只用这段
P1_SOFT_SEQUENCE = ("1", "2", "3", "4", "5")

# 写码确认后继续
P1_POST_IMPLEMENT = ("6",)

# 验证通过后依次交接四车道（每步 HITL，不自动调 mes_code_*）
P1_LANE_HANDOFF = ("7", "8", "9", "10")

# auto_run=true：一次 begin 跑完整条（真实写码/验证/审/提交/PR/部署）
P1_FULL_AUTO_SEQUENCE = ("1", "2", "3", "4", "5", "6", "7", "8", "9", "10")

# 兼容旧引用
P0_SEQUENCE = P1_SOFT_SEQUENCE
