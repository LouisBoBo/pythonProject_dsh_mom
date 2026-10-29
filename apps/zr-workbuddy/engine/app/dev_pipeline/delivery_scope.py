"""按需求推断开发场景与交付范围（灵活适配，不写死单一形态）。"""
from __future__ import annotations

import re
from typing import Any


# 多种开发场景模板：规划/写码按推断选用，可随原文显式缩小或放大
SCENARIOS: dict[str, dict[str, Any]] = {
    "full_feature": {
        "label": "新功能全栈页",
        "delivery": (
            "菜单 + 路由 + 完整页面 + 后端接口"
            "（查询/列表/表单/分页/导出等按同类页面惯例补齐）"
        ),
        "must_touch": [
            "菜单/导航（入口可见）",
            "路由注册（页面可达）",
            "页面/组件（完整主路径）",
            "后端接口（与页面配套）",
        ],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "菜单与路由可达",
            "页面主路径可操作；接口可调通",
        ],
    },
    "frontend_ui": {
        "label": "前端/界面调整",
        "delivery": "前端页面或组件调整（按需动路由；无新接口需求则不扩后端）",
        "must_touch": ["相关页面/组件", "必要时样式与文案"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "受影响界面主路径手测或单测",
        ],
    },
    "backend_api": {
        "label": "后端/接口/算数",
        "delivery": "后端接口或引擎算数（无新菜单/页时不强行加前端）",
        "must_touch": ["接口或算数逻辑", "必要时契约/校验与测试"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "相关接口或单测可跑通",
        ],
    },
    "bugfix": {
        "label": "缺陷修复",
        "delivery": "定位并修复缺陷；改动面贴齐根因，不扩无关功能",
        "must_touch": ["缺陷相关代码路径", "必要的回归验证"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "复现路径已修通或相关单测通过",
        ],
    },
    "refactor": {
        "label": "重构/治理",
        "delivery": "重构或代码治理；行为保持等价，不借机加需求",
        "must_touch": ["重构目标模块", "必要时补齐/调整测试"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "原有行为回归通过",
        ],
    },
    "enhance_existing": {
        "label": "既有能力增强",
        "delivery": "在已有页面/接口上增强（字段、筛选、权限、性能等），沿用现有入口",
        "must_touch": ["既有页面或接口的增量改动", "必要时菜单文案/权限点"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "增强点可验收；原主路径不回归",
        ],
    },
    "config_only": {
        "label": "配置/文案/菜单项",
        "delivery": "配置、文案或菜单项调整（不扩路由/页面/接口，除非原文要求）",
        "must_touch": ["配置或文案或菜单相关文件"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "配置/文案/菜单变更可见",
        ],
    },
    "placeholder": {
        "label": "占位落地",
        "delivery": "菜单 + 路由 + 占位页（页面内容后续再补）",
        "must_touch": ["菜单/导航", "路由", "占位页面"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "菜单可点、路由可达",
        ],
    },
    "tooling": {
        "label": "脚本/工具/CI",
        "delivery": "脚本、工具链或 CI/CD 改动（不按业务页全栈模板）",
        "must_touch": ["相关脚本或流水线配置"],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "脚本/流水线关键命令可执行",
        ],
    },
    "adaptive": {
        "label": "按仓库惯例自适应",
        "delivery": (
            "按需求与仓库现有模式最小必要改动："
            "该加菜单/路由/页/接口则加，不需要的不强行凑齐"
        ),
        "must_touch": [
            "与需求直接相关的代码路径（以 Prime 读库结果为准）",
            "沿用同类功能既有分层与命名",
        ],
        "validation": [
            "config.yaml · dev_pipeline.validate_commands",
            "需求描述的主路径可验收",
        ],
    },
}


def infer_dev_scenario(message: str) -> dict[str, Any]:
    """从用户原话推断场景；不确定时走 adaptive，不强行全栈。"""
    msg = (message or "").strip()
    if not msg:
        return _pack("adaptive", confidence="low", reason="需求为空，按自适应最小改动")

    # 显式缩小/指定（优先级最高）
    if any(k in msg for k in ("只要菜单", "仅菜单", "只加菜单")):
        return _pack("config_only", confidence="high", reason="原文只要菜单/配置级改动")
    if any(k in msg for k in ("只要占位", "占位页", "先占位")):
        return _pack("placeholder", confidence="high", reason="原文要求占位落地")
    if any(
        k in msg
        for k in (
            "不要接口",
            "先不要后端",
            "纯前端",
            "只改前端",
            "只改 UI",
            "只改样式",
            "改样式",
            "改颜色",
            "按钮颜色",
            "样式调整",
            "UI 调整",
            "界面微调",
        )
    ):
        return _pack("frontend_ui", confidence="high", reason="原文偏向前端/UI")
    # 轻量 UI 措辞（无「修/bug」时）
    if any(k in msg for k in ("颜色", "样式", "字体", "间距", "按钮", "图标")) and not any(
        k in msg for k in ("接口", "API", "报表", "菜单", "路由")
    ):
        return _pack("frontend_ui", confidence="med", reason="原文像界面微调")
    if any(k in msg for k in ("只要接口", "只改后端", "只改 API", "只加接口", "引擎命令", "cli")):
        return _pack("backend_api", confidence="high", reason="原文偏向后端/接口")

    # 缺陷 / 重构 / 工具
    if any(k in msg for k in ("修复", "bug", "Bug", "缺陷", "报错", "异常", "修一下", "fix")):
        return _pack("bugfix", confidence="high", reason="原文像缺陷修复")
    if any(k in msg for k in ("重构", "治理", "清理死代码", "rename", "抽取")):
        return _pack("refactor", confidence="med", reason="原文像重构/治理")
    _pipeline_product = (
        "一体化",
        "需求→上线",
        "mes_dev_pipeline",
        "过程流",
        "dev_pipeline",
        "dev-pipeline",
    )
    if any(k in msg for k in ("CI", "cron", "github actions", "打包脚本", "Jenkins", "GitLab")):
        return _pack("tooling", confidence="med", reason="原文像脚本/CI")
    if "脚本" in msg and any(k in msg for k in (".sh", "Makefile", "actions/", "workflow")):
        return _pack("tooling", confidence="med", reason="原文像脚本/CI")
    if "流水线" in msg and not any(x in msg for x in _pipeline_product):
        if any(x in msg for x in ("CI", "部署流水线", "发布流水线", "jenkins", "gitlab")):
            return _pack("tooling", confidence="med", reason="原文像 CI/部署流水线")

    # 新业务能力（需求表 / 销售订单发货等）优先全栈，勿被「列表」二字误判成加列
    if any(k in msg for k in ("销售订单", "发货", "超发", "建单", "关单")) and any(
        k in msg for k in ("列表与新建", "列表与新", "新建", "登记发货", "可发", "发满")
    ):
        return _pack(
            "full_feature",
            confidence="high",
            reason="销售订单/发货类新能力：列表+新建+发货主路径，按全栈页规划",
        )
    if re.search(r"\bR\d{2}\b", msg) and any(
        k in msg for k in ("功能要求", "验收", "本项", "需求跟踪", "附图需求")
    ):
        return _pack(
            "full_feature",
            confidence="high",
            reason="需求跟踪表条目：按全栈交付，禁止收成既有页加列",
        )

    # 菜单下新业务页（增加「xxx」页 / 预警页；勿把「新增「班别」筛选」误判成全栈新页）
    if re.search(
        r"(增加|新增)[「\"“][^」\"”]{1,40}[」\"”]\s*页|预警页|新页面|新建页",
        msg,
    ) and any(k in msg for k in ("菜单", "路由", "/api", "接口", "仓储", "页面")):
        return _pack(
            "full_feature",
            confidence="high",
            reason="原文要求在菜单下新增业务页（含接口/列表主路径）",
        )
    if any(k in msg for k in ("低库存", "库存预警")) and any(
        k in msg for k in ("页", "菜单", "接口", "/api")
    ):
        return _pack(
            "full_feature",
            confidence="high",
            reason="低库存预警：菜单入口 + 页面 + 接口主路径",
        )

    # 既有页/报表上的增量（优先于「新全栈页」）
    # 注意：禁止裸「列」——会误命中「列表」
    incremental_keys = (
        "加一列",
        "加筛选",
        "加班别",
        "班别",
        "加字段",
        "增加字段",
        "筛选",
        "过滤",
        "导出",
        "一列",
        "加列",
        "表头",
        "按钮",
        "文案",
    )
    existing_surface = ("报表", "列表", "页面", "视图", "明细", "汇总")
    if any(k in msg for k in existing_surface) and any(k in msg for k in incremental_keys):
        if not any(
            k in msg
            for k in (
                "新页面",
                "新模块",
                "从零",
                "新建页",
                "做一个新",
                "列表与新建",
                "列表与新",
                "销售订单",
            )
        ):
            return _pack(
                "enhance_existing",
                confidence="high",
                reason="在既有报表/页面上做增量（筛选/列/字段等），禁止扩大成全栈新页",
            )

    # 既有增强 vs 新全栈页
    enhance_keys = ("增加字段", "加一列", "加筛选", "加导出", "加上权限", "优化", "性能", "支持")
    new_page_keys = ("新增页面", "新页面", "新模块", "新菜单", "做一个", "做一页", "加一个报表", "报表")
    if any(k in msg for k in ("报表", "列表页", "管理页", "中心", "看板")) and any(
        k in msg for k in ("新增", "增加", "加一个", "加上", "做", "开发", "实现")
    ):
        return _pack("full_feature", confidence="med", reason="像新报表/管理页，按全栈页规划")
    if any(k in msg for k in new_page_keys):
        return _pack("full_feature", confidence="med", reason="像新页面/模块")
    if any(k in msg for k in enhance_keys) and not any(k in msg for k in ("新页面", "新模块")):
        return _pack("enhance_existing", confidence="med", reason="像在既有能力上增强")

    if any(k in msg for k in ("接口", "API", "api", "/api/", "FastAPI", "引擎")) and not any(
        k in msg for k in ("页面", "菜单", "前端", "UI")
    ):
        return _pack("backend_api", confidence="med", reason="主要提接口/引擎，少提前端")

    if any(k in msg for k in ("文案", "翻译", "配置项", "开关", "feature flag")):
        return _pack("config_only", confidence="med", reason="像配置/文案")

    return _pack(
        "adaptive",
        confidence="low",
        reason="未命中强特征：按仓库惯例自适应，最小必要改动，不强行凑齐全栈",
    )


def _pack(scenario_id: str, *, confidence: str, reason: str) -> dict[str, Any]:
    base = SCENARIOS.get(scenario_id) or SCENARIOS["adaptive"]
    return {
        "scenario_id": scenario_id,
        "scenario_label": base["label"],
        "delivery": base["delivery"],
        "must_touch": list(base["must_touch"]),
        "validation": list(base["validation"]),
        "confidence": confidence,
        "reason": reason,
    }


def resolve_scenario_from_prd(*, message: str, prd: dict[str, Any] | None) -> dict[str, Any]:
    """优先沿用 PRD 已选场景模板；否则重新推断。"""
    prd = prd if isinstance(prd, dict) else {}
    stored = prd.get("scenario") if isinstance(prd.get("scenario"), dict) else None
    sid = str((stored or {}).get("scenario_id") or "").strip()
    if sid and sid in SCENARIOS:
        base = SCENARIOS[sid]
        return {
            "scenario_id": sid,
            "scenario_label": str((stored or {}).get("scenario_label") or base["label"]),
            "delivery": str(prd.get("delivery") or base["delivery"]),
            "must_touch": list(base["must_touch"]),
            "validation": list(base["validation"]),
            "confidence": str((stored or {}).get("confidence") or "med"),
            "reason": str((stored or {}).get("reason") or ""),
        }
    return infer_dev_scenario(message or str(prd.get("goal") or ""))


def delivery_guidance_for_implement(scenario: dict[str, Any] | None) -> str:
    """写进 Cursor requirement 的灵活指引（非死锁全栈）。"""
    sc = scenario if isinstance(scenario, dict) else {}
    sid = str(sc.get("scenario_id") or "adaptive")
    label = str(sc.get("scenario_label") or "按仓库惯例自适应")
    delivery = str(sc.get("delivery") or SCENARIOS["adaptive"]["delivery"])
    reason = str(sc.get("reason") or "")
    must = sc.get("must_touch") if isinstance(sc.get("must_touch"), list) else []
    lines = [
        "【开发场景（推断 · 可按原文与仓库调整）】",
        f"- 场景：{label}（{sid}）",
        f"- 交付范围：{delivery}",
    ]
    if reason:
        lines.append(f"- 推断依据：{reason}")
    if must:
        lines.append("- 建议改动面：")
        for m in must[:8]:
            lines.append(f"  · {m}")
    lines.extend(
        [
            "- 原则：贴齐需求与仓库现有模式；需要的面做全，不需要的不强行加菜单/路由/接口。",
            "- **精准范围**：只改用户原话与 PRD 范围内条目；未提及的模块、重构、公共抽取一律禁止。",
            "- 开跑后优先直接实现；勿用「做成哪种形态」多选卡打断流水线。"
            " 仅当需求关键歧义且无法从原文/仓库推断时，在实现说明里写清假设后继续。",
        ]
    )
    return "\n".join(lines)
