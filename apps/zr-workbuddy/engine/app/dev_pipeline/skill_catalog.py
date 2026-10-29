"""十步 Skill 目录（对标 Cole 33 skills；缺失则本仓自写）。

用户可见文案放在这里；引擎执行仍看 steps.py。
"""
from __future__ import annotations

from typing import Any

# Cole 仓库有：plan-create-prd / prime-codebase / piv-* ；
# 无：req-intake-multimodal、piv-deploy → 本仓定制。
STEP_SKILLS: dict[str, dict[str, Any]] = {
    "1": {
        "id": "req-intake-multimodal",
        "source": "workbuddy",  # Cole 无同名，本仓自写
        "title_zh": "多模态需求采集",
        "cole_ref": None,
        "flow_brief": (
            "这一步把你刚发的文字与贴图收成「原始需求账本」。"
            "贴图走引擎独立视觉识图（智谱）；不做实现、不改代码。"
        ),
        "does": [
            "记录需求原文与字数",
            "附图落盘并调用视觉识图",
            "记下当前工程目录提示",
            "写出 raw_intake 供后续步骤引用",
        ],
        "does_not": [
            "不写代码",
            "不跑测试",
            "不提交 Git",
            "不发明图上未出现的侧栏菜单名（禁止默认生产管理/仓储管理）",
        ],
        "pass_when": "至少有一条非空需求文字，或识图成功写出有效描述。",
        "fail_when": "需求为空且无可解析附件 / 识图失败且无文字。",
    },
    "2": {
        "id": "plan-create-prd",
        "source": "cole",
        "title_zh": "需求理解 · PRD-lite",
        "cole_ref": "plan-create-prd",
        "flow_brief": (
            "剥离宿主 runtime/记忆库噪音，把真实需求整理成三句话："
            "要做什么、怎么干、干成啥；并推断开发场景与变更上限。"
            "只依据用户原话与本次识图，禁止套某一家 ERP 菜单/目录模板。"
        ),
        "does": [
            "清洗需求原文（去掉 runtime / 记忆库偏好 / Knowledge protocol；流水线元需求不得当 PRD）",
            "输出【要做什么】【怎么干】【干成啥】给人看的 PRD 摘要",
            "推断开发场景、交付范围与变更文件上限",
            "冻结 prd_rev 版本号",
        ],
        "does_not": [
            "不把单一全栈/制造业模板套死所有需求",
            "不直接改仓库",
            "不发明用户未点名的菜单路径",
        ],
        "pass_when": "产出带版本号的 PRD-lite，且至少有一条验收标准。",
        "fail_when": "无法从输入提炼出任何可验收目标。",
    },
    "3": {
        "id": "prime-codebase",
        "source": "cole",
        "title_zh": "读库上下文 · Prime",
        "cole_ref": "prime-codebase",
        "flow_brief": (
            "优先读取当前工程的「项目画像」（布局、栈、页面目录、验证命令）；"
            "必要时只读扫描仓库顶层与关键配置。"
            "目的是站在**本仓库**现有结构上规划，禁止照搬 WorkBuddy 或某一家 ERP 的路径。"
        ),
        "does": [
            "校验工程目录合法",
            "读取/刷新项目画像",
            "索引顶层目录与工程标记",
            "摘录必读文件片段",
            "记录风险提示",
        ],
        "does_not": [
            "不修改任何文件",
            "不越权扫盘外路径",
            "不把别的项目目录结构写进本仓计划",
        ],
        "pass_when": "目录通过校验并生成 context_pack（可含风险说明）。",
        "fail_when": "目录无效且无法继续（当前实现会带警告继续，便于你看见问题）。",
    },
    "4": {
        "id": "piv-plan-implementation",
        "source": "cole",
        "title_zh": "规划实现 · validation-first",
        "cole_ref": "piv-plan-implementation",
        "flow_brief": (
            "按已推断场景写验证清单与建议改动面（该动菜单/路由/页/接口才动），"
            "路径提示只来自项目画像与读库结果，不强行凑齐全栈，不套 MES 硬目录。"
        ),
        "does": [
            "锁定问题描述与场景化交付范围",
            "按场景列出建议改动面（对照画像）",
            "列出机器可跑的验证项",
            "给出待改路径提示（通用 glob / 画像路径）",
            "冻结 plan_rev",
        ],
        "does_not": [
            "本步仍不写业务代码",
            "不套死单一交付模板",
            "不执行 git",
            "不写死 frontend/src/views/warehouse 一类外仓路径",
        ],
        "pass_when": "计划含版本号，且验证清单至少一条。",
        "fail_when": "无法形成任何可执行验证项。",
    },
    "5": {
        "id": "piv-implement",
        "source": "cole",
        "title_zh": "写代码 · Cursor 插件",
        "cole_ref": "piv-implement",
        "flow_brief": (
            "把 PRD + 计划 + 项目画像交给本机 Cursor **对话写码**真实改盘："
            "创建确认单 → 开工 → 等待 Job 结束 → 回收变更文件列表。"
            "写码范围以当前工作区为准，禁止按另一套 ERP 目录改盘。"
        ),
        "does": [
            "调用 :18791 对话写码插件",
            "附带项目画像与本次需求/识图结构",
            "跟踪 Job 状态",
            "记录 job_id 与变更文件",
        ],
        "does_not": [
            "不在本仓另造第二套写码内核",
            "不回退旧 coding :18788",
            "不跳过插件 Key 校验",
        ],
        "pass_when": "写码 Job 成功且 changed_files 非空；空变更一律失败并打回（最多 3 轮）。",
        "fail_when": "插件未起、Key 缺失、Job 失败或超时。",
    },
    "6": {
        "id": "piv-validate",
        "source": "cole",
        "title_zh": "机器验证 · 只认 PASS/FAIL",
        "cole_ref": "piv-validate",
        "flow_brief": (
            "在工程目录内按配置或项目画像跑验证命令，只看 exit code。"
            "失败不会假装通过；探测不到检查项标「未验证」并跳过，不假绿。"
            "可按策略自动回到第 5 步修。"
        ),
        "does": [
            "优先执行 config / 画像 validate_commands",
            "自动探测 frontend/backend、pom、go、pyproject 等",
            "记录每条命令的退出码与摘要",
        ],
        "does_not": [
            "不靠模型嘴炮说「应该过了」",
            "不在本步改业务代码",
            "不把「无探测项」当成通过",
        ],
        "pass_when": "全部命令 exit 0；探测到的默认检查全部通过。",
        "fail_when": "任一条命令非 0；失败则打回写码补救（最多 max_fix_rounds 轮）。无探测项 → skipped/未验证。",
    },
    "7": {
        "id": "piv-review-changes",
        "source": "cole",
        "title_zh": "复核 · 审码（仅本次改动）",
        "cole_ref": "piv-review-changes",
        "flow_brief": (
            "只审核第 5 步写码产出的变更文件；并通过与步骤 8 **同一套提交门禁**。"
            "有 Blocker / 门禁阻断则本步失败，打回写码（5）自动补救后重跑 6→7→8。"
        ),
        "does": [
            "读取写码变更文件列表",
            "只对这些文件跑 code-review",
            "对齐跑提交门禁（run_commit_review_gate）",
            "落盘 report_id",
        ],
        "does_not": ["不跑整仓全量抽样", "不自动 git commit", "不改聊天审码卡默认行为"],
        "pass_when": "审码无 Blocker，且提交门禁可提交。",
        "fail_when": "审码 Blocker 或提交门禁 P0/P1 阻断（自动打回写码补救）。",
    },
    "8": {
        "id": "piv-commit",
        "source": "cole",
        "title_zh": "提交 · Git commit/push",
        "cole_ref": "piv-commit",
        "flow_brief": (
            "走本仓提交车道：列待提交文件 → 门禁（与复核同标准）→ 中文说明 → commit/push。"
            "墙钟最多约 60 秒；超时则软跳过本步继续开 PR/部署，用户可稍后用提交车道手动再提。"
            "门禁 P0/P1 阻断仍打回写码补救（5→6→7→8），不硬闯。"
        ),
        "does": [
            "跑提交门禁",
            "压缩中文提交说明",
            "墙钟≤60s，超时软跳过可稍后手动提交",
            "门禁阻断打回写码补救",
        ],
        "does_not": ["不让模型直接敲 git", "门禁阻断时不允许硬提交", "超时不得拖死整条流水线"],
        "pass_when": "提交成功，或无变更/超时软跳过（可稍后手动提交）。",
        "fail_when": "门禁阻断 → 自动补救闭环（满轮则 Run 失败）。",
    },
    "9": {
        "id": "piv-create-pr",
        "source": "cole",
        "title_zh": "开 PR",
        "cole_ref": "piv-create-pr",
        "flow_brief": (
            "按工程远端托管开合并请求：GitHub→gh，GitLab→glab；"
            "Gitee 给手工说明；SVN 标「不适用」后仍可进部署。"
            "也可在 config.yaml · dev_pipeline.pr_provider=skip 整步跳过。"
        ),
        "does": [
            "识别 origin（github/gitlab/gitee）或 SVN",
            "调用 gh / glab（若已安装且已登录）",
            "回写 PR/MR URL 或诚实跳过说明",
        ],
        "does_not": ["不自动合并", "不伪造 PR 链接", "不对 SVN 硬跑 gh"],
        "pass_when": "拿到 PR/MR URL；或诚实跳过/不适用（无 CLI、Gitee 手工、SVN、配置 skip）。",
        "fail_when": "CLI 执行失败且不属于可跳过情形。",
    },
    "10": {
        "id": "piv-deploy",
        "source": "workbuddy",  # Cole 清单无 piv-deploy，本仓自写
        # 瞬时失败：本机 npm/libuv、SSH/同步抖动、探活空窗 → 最多自动重试 3 趟（max_deploy_attempts）
        "title_zh": "部署上线",
        "cole_ref": None,
        "flow_brief": (
            "走本仓一体部署车道：准备变更集 → 同步远端 → 探活。"
            "仅对配置了部署的工程有效；目录不对会诚实失败。"
        ),
        "does": ["prepare 部署计划", "执行同步/重启", "记录 deploy job_id"],
        "does_not": ["不在未配置环境上装成功", "不跳过探活标准（若配置要求）"],
        "pass_when": "部署 Job 成功且探活达标（按车道结果）。",
        "fail_when": "准备失败、同步失败或探活未过。",
    },
}


def skill_for(step_id: str) -> dict[str, Any]:
    sid = str(step_id or "").strip()
    base = dict(STEP_SKILLS.get(sid) or {})
    if not base:
        return {
            "id": f"step-{sid}",
            "source": "workbuddy",
            "title_zh": f"步骤 {sid}",
            "flow_brief": "",
            "does": [],
            "does_not": [],
            "pass_when": "",
            "fail_when": "",
        }
    return base


def skill_banner(step_id: str) -> list[str]:
    """写入过程日志开头的人读横幅。"""
    sk = skill_for(step_id)
    lines = [
        f"【Skill】{sk.get('id')} · {sk.get('title_zh')}",
        f"【来源】{'Cole skills 改编' if sk.get('source') == 'cole' else 'WorkBuddy 自写'}"
        + (f"（对照 {sk.get('cole_ref')}）" if sk.get("cole_ref") else ""),
        f"【这一步在干什么】{sk.get('flow_brief') or ''}",
    ]
    does = sk.get("does") or []
    if does:
        lines.append("【会做】" + "；".join(str(x) for x in does))
    does_not = sk.get("does_not") or []
    if does_not:
        lines.append("【不会做】" + "；".join(str(x) for x in does_not))
    return [ln for ln in lines if ln.strip()]


def format_result_detail(
    *,
    step_id: str,
    status: str,
    summary: str,
    extra_lines: list[str] | None = None,
) -> str:
    sk = skill_for(step_id)
    st = str(status or "")
    parts = [
        f"状态：{st}",
        f"摘要：{(summary or '').strip() or '（无）'}",
    ]
    if st in ("pass", "skipped"):
        parts.append(f"判定说明：{sk.get('pass_when') or '本步达成通过条件'}")
    elif st in ("fail", "failed"):
        parts.append(f"失败对照：{sk.get('fail_when') or '未满足通过条件'}")
    elif st in ("waiting_hitl", "waiting_user"):
        parts.append("当前停住：需要你处理或确认后才能继续。")
    for ln in extra_lines or []:
        s = str(ln or "").strip()
        if s:
            parts.append(s)
    return "\n".join(parts)
