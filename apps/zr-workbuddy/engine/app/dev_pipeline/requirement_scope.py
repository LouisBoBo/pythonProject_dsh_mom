"""需求范围锁定：从用户原话提炼 in-scope / 禁止项，写码后审计变更面。"""
from __future__ import annotations

import fnmatch
import re
from typing import Any

_DEFAULT_FORBIDDEN: tuple[str, ...] = (
    "禁止重构、抽取公共模块、批量 rename、全仓格式化",
    "禁止修改用户未提及的业务模块或页面",
    "禁止顺带批量改 frontend/src/api/*（除非用户明确要求改 API 层或 http 封装）",
    "禁止「顺手优化」、扩大交付面；只交付用户原话与验收项",
    "禁止把功能挂到用户未指定的其它侧栏菜单",
)

# 常见侧栏名（仅作匹配加速；不得当作默认挂载目标）
_KNOWN_MENUS: tuple[str, ...] = (
    "生产管理",
    "仓储管理",
    "仓库管理",
    "品质管理",
    "质量管理",
    "设备管理",
    "看板管理",
    "考勤管理",
    "报表中心",
    "消息中心",
    "系统设置",
    "收藏夹",
)

_BAD_MENU_CANDIDATES: frozenset[str] = frozenset(
    {
        "未见",
        "未知",
        "无",
        "其它",
        "其他",
        "功能要求",
        "验收标准",
        "本项",
        "现状问题",
        "编码",
        "优先级",
        "业务目标",
        "列表页",
        "表单",
        "看板",
        "弹窗",
        "管理",
        "项目",
        "模块",
        "菜单",
        "侧栏",
        "导航",
    }
)

_MENU_VERB_PREFIX = re.compile(
    r"^(?:打开|进入|点击|选择|查看|前往|切换到|切到|去)"
)


def clean_menu_candidate(raw: str) -> str:
    """清洗「菜单：xxx」类抽取结果；空/套话返回空串。"""
    c = (raw or "").strip().strip("「」\"“”' ：:·•-")
    if not c:
        return ""
    c = re.split(r"\s*[/／>|→]\s*", c, maxsplit=1)[0].strip()
    c = re.sub(r"(?:菜单|侧栏|导航|模块)$", "", c).strip()
    c = _MENU_VERB_PREFIX.sub("", c).strip()
    if len(c) < 2 or len(c) > 24:
        return ""
    if c in _BAD_MENU_CANDIDATES:
        return ""
    if any(b == c or c.startswith(b + "：") or c.startswith(b + ":") for b in _BAD_MENU_CANDIDATES):
        return ""
    if not re.fullmatch(r"[\u4e00-\u9fffA-Za-z0-9_\-·]{2,24}", c):
        return ""
    return c


# 兼容旧内部名
_clean_menu_candidate = clean_menu_candidate


def extract_menu_anchor(text: str) -> str:
    """从用户原文/识图抽出要挂的侧栏菜单名。

    只认原文出现的名称；禁止默认猜「仓储管理 / 生产管理」。
    """
    t = text or ""
    if not t.strip():
        return ""
    # 1) 通用强信号（任意项目菜单名）
    for pat in (
        r"(?:菜单|侧栏|模块|项目)\s*[：:]\s*[「\"“']?([^」\"”'\n，,；;]{2,24})",
        r"(?:挂到|加到|放到|新增到|加在)\s*[「\"“']?([^」\"”'\n，,；;]{2,24}?)(?:菜单|侧栏|下)",
        # 须带「在/到/于」，避免「打开系统设置菜单」整段被吞
        r"(?:在|到|于)([\u4e00-\u9fffA-Za-z0-9_\-]{2,12})菜单(?:下|中|里|新增|增加|加入|挂)",
        # 「客户运营菜单新增」类：仅认后接新增/挂等动作
        r"([\u4e00-\u9fffA-Za-z0-9_\-]{2,12})菜单(?:新增|增加|加入|挂)",
    ):
        m = re.search(pat, t)
        if m:
            cand = clean_menu_candidate(m.group(1))
            if cand:
                return cand
    # 2) 已知名加速（仍须原文出现，不当默认）
    for menu in _KNOWN_MENUS:
        if f"{menu}菜单" in t:
            return menu
        if re.search(rf"(?:挂到|加到|放到|新增到|加在)\s*{re.escape(menu)}", t):
            return menu
        if re.search(
            rf"(?:菜单|模块|项目|侧栏)\s*[：:]\s*{re.escape(menu)}",
            t,
        ):
            return menu
    for menu in _KNOWN_MENUS:
        if menu in t:
            return menu
    return ""


def menu_path_hints(menu: str) -> list[str]:
    """仅作软提示；不再钉死某一家 ERP 的 views 子目录。"""
    m = str(menu or "").strip()
    if not m:
        return []
    return ["**/views/**", "**/layouts/**", "**/router*"]


def menu_forbid_cross_hang(menu: str) -> list[str]:
    """用户指定菜单后，禁止挂到未点名的其它菜单（文案级，不写死路径）。"""
    m = str(menu or "").strip()
    if not m:
        return []
    return [f"禁止将本需求页面挂到用户未指定的其它侧栏菜单（用户锚定：{m}）"]

_MAX_FILES_BY_SCENARIO: dict[str, int] = {
    "enhance_existing": 8,
    "bugfix": 6,
    "config_only": 4,
    "frontend_ui": 6,
    "backend_api": 6,
    "placeholder": 6,
    "tooling": 12,
    "full_feature": 22,
    "refactor": 40,
    "adaptive": 10,
}


def extract_in_scope_items(message: str) -> list[str]:
    """从原话提炼可验收条目（规则，不调用 LLM）。套话一律丢弃。"""
    from .intake_normalize import looks_like_requirement_boilerplate

    msg = (message or "").strip()
    if not msg or looks_like_requirement_boilerplate(msg):
        return []
    items: list[str] = []
    for line in re.split(r"[\n；;]+", msg):
        t = line.strip().strip("-•* ")
        if len(t) < 4:
            continue
        if looks_like_requirement_boilerplate(t):
            continue
        if any(k in t for k in ("不要", "禁止", "别改", "无关", "待澄清")):
            continue
        items.append(t[:240])
    if items:
        return items[:12]
    if len(msg) <= 400:
        return [msg]
    return [msg[:400] + ("…" if len(msg) > 400 else "")]


def infer_path_hints(message: str) -> list[str]:
    """路径提示（供计划与审计，非死锁）。只给通用 glob，不钉 MES 文件名。"""
    msg = (message or "").lower()
    hints: list[str] = []
    if any(k in message for k in ("报表", "列表", "页面", "表格", "表头", "加列", "字段")):
        hints.extend(["**/views/**", "**/*.vue", "**/*.tsx", "**/*.jsx"])
    if any(k in msg for k in ("api", "接口", "router", "路由", "后端")):
        hints.extend(["**/api/**", "**/routers/**", "**/controllers/**"])
    menu_only = extract_menu_anchor(message)
    if menu_only:
        for h in menu_path_hints(menu_only):
            if h not in hints:
                hints.append(h)
    if any(k in msg for k in ("筛选", "过滤", "查询条件")):
        hints.append("**/*filter*")
    if any(k in msg for k in ("表格", "列", "字段", "column")):
        hints.append("**/*.vue")
    return list(dict.fromkeys(hints))


def build_prd_scope(
    *,
    message: str,
    scenario_id: str,
    vision_surface: dict[str, Any] | None = None,
    workspace: str = "",
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    sid = (scenario_id or "adaptive").strip()
    in_scope = extract_in_scope_items(message)
    from .vision_surface import resolve_page_anchors

    surf = vision_surface if isinstance(vision_surface, dict) else {}
    # 若表层尚无工程检索结果，用工作区再解析一次
    anchors = resolve_page_anchors(
        page_title=str(surf.get("page_title") or ""),
        vision_text=str(surf.get("raw_excerpt") or ""),
        user_text=message or "",
        workspace=workspace,
        profile=profile,
    )
    path_hints = list(surf.get("path_hints") or []) or list(anchors.get("path_hints") or [])
    for h in infer_path_hints(message):
        if h not in path_hints:
            path_hints.append(h)
    must = list(surf.get("must_include_paths") or []) or list(
        anchors.get("must_include_paths") or []
    )
    forbid = list(surf.get("forbid_paths") or []) or list(anchors.get("forbid_paths") or [])
    need_confirm = bool(surf.get("need_user_path_confirm")) or bool(
        anchors.get("need_user_path_confirm")
    )
    if must:
        need_confirm = False
        for p in must:
            if p not in path_hints:
                path_hints.insert(0, p)
    target_menu = extract_menu_anchor(
        "\n".join(
            [
                message or "",
                str(surf.get("menu_path") or ""),
                str(surf.get("raw_excerpt") or "")[:2000],
            ]
        )
    )
    if target_menu:
        for h in menu_path_hints(target_menu):
            if h not in path_hints:
                path_hints.insert(0, h)
    forbidden = list(_DEFAULT_FORBIDDEN)
    for line in menu_forbid_cross_hang(target_menu):
        if line not in forbidden:
            forbidden.append(line)
    if need_confirm and str(surf.get("page_title") or anchors.get("page_title") or "").strip():
        forbidden.append(
            "工程未定位到与识图页面标题匹配的文件：禁止猜测其它项目路径；须先向用户确认要改的文件"
        )
    return {
        "in_scope": in_scope,
        "forbidden": forbidden,
        "max_files": int(_MAX_FILES_BY_SCENARIO.get(sid, 10)),
        "path_hints": path_hints,
        "must_include_paths": must,
        "forbid_paths": forbid,
        "page_title": str(surf.get("page_title") or anchors.get("page_title") or ""),
        "target_menu": target_menu,
        "need_user_path_confirm": need_confirm,
        "user_message_excerpt": (message or "")[:800],
        "scenario_id": sid,
    }


def scope_contract_for_implement(scope: dict[str, Any] | None) -> str:
    sc = scope if isinstance(scope, dict) else {}
    lines = [
        "【范围契约 · 必须遵守（违反则 Run 判失败并打回写码）】",
        "- 只实现下列「范围内」条目；用户未提到的功能、模块、重构一律不做。",
    ]
    for i, item in enumerate(sc.get("in_scope") or [], 1):
        lines.append(f"  {i}. {item}")
    if not sc.get("in_scope"):
        lines.append("  （以【用户需求】原文为准，不得扩大）")
    target_menu = str(sc.get("target_menu") or "").strip()
    if target_menu:
        lines.append(
            f"- 【菜单锚定 · 不可曲解】必须挂到侧栏「{target_menu}」；"
            "页面目录、路由、layout 菜单项与此一致；禁止改挂到其它菜单。"
        )
    lines.append(f"- 变更文件数上限：{sc.get('max_files') or 10}（不含 lock/日志）")
    lines.append("- 禁止项：")
    for f in sc.get("forbidden") or _DEFAULT_FORBIDDEN:
        lines.append(f"  · {f}")
    must = sc.get("must_include_paths") or []
    if must:
        lines.append("- 必须改动的文件（识图/页面锚定，漏改或改错页 = 失败）：")
        for p in must[:8]:
            lines.append(f"  · {p}")
    forbid = sc.get("forbid_paths") or []
    if forbid:
        lines.append("- 禁止改动（易与需求关键词混淆的页面）：")
        for p in forbid[:8]:
            lines.append(f"  · {p}")
    hints = sc.get("path_hints") or []
    if hints:
        lines.append("- 建议只动相关路径（超出需有明确理由并在说明中写出）：")
        for h in hints[:8]:
            lines.append(f"  · {h}")
    if sc.get("page_title"):
        lines.append(f"- 界面锚定页面标题：{sc.get('page_title')}")
    lines.append(
        "- 若认为必须超范围改动：停止扩面，仅在 Job 说明里列出假设；"
        "默认应最小 diff 完成需求。"
    )
    return "\n".join(lines)


def _user_asked_api_refactor(message: str) -> bool:
    msg = (message or "").lower()
    return any(
        k in msg
        for k in (
            "重构",
            "抽取",
            "http.js",
            "authfetch",
            "公共",
            "统一 api",
            "封装 fetch",
            "api 层",
        )
    )


def _path_matches_hint(path: str, hint: str) -> bool:
    p = path.replace("\\", "/").lstrip("./")
    h = hint.replace("\\", "/")
    if "**" in h or "*" in h:
        return fnmatch.fnmatch(p, h) or fnmatch.fnmatch(p, h.lstrip("/"))
    return h in p or p.endswith(h)


def _count_hint_matched(files: list[str], hints: list[str]) -> int:
    if not hints:
        return len(files)
    n = 0
    for f in files:
        if any(_path_matches_hint(f, h) for h in hints):
            n += 1
    return n


def audit_implement_scope(
    changed_files: list[str],
    scope: dict[str, Any] | None,
) -> dict[str, Any]:
    """写码完成后审计：变更面是否超出需求范围。"""
    sc = scope if isinstance(scope, dict) else {}
    files = _normalize_files(changed_files)
    n = len(files)
    max_files = int(sc.get("max_files") or 10)
    msg = str(sc.get("user_message_excerpt") or "")
    violations: list[str] = []

    if n == 0:
        return {
            "ok": False,
            "file_count": 0,
            "violations": ["写码未产生任何变更文件（空变更视为交付失败）"],
            "detail": "无变更文件：写码未落盘，禁止当作成功",
            "max_files": max_files,
        }

    if n > max_files:
        violations.append(f"变更 {n} 个文件，超过本需求上限 {max_files}")

    api_js = [
        f
        for f in files
        if f.startswith("frontend/src/api/") and f.endswith(".js")
    ]
    if len(api_js) >= 5 and not _user_asked_api_refactor(msg):
        if "frontend/src/api/http.js" in files or len(api_js) >= 8:
            violations.append(
                f"检测到批量改动 API 层（{len(api_js)} 个 frontend/src/api/*.js），"
                "用户未要求重构或抽取 http"
            )

    hints = sc.get("path_hints") if isinstance(sc.get("path_hints"), list) else []
    must = sc.get("must_include_paths") if isinstance(sc.get("must_include_paths"), list) else []
    # 无页面硬锚定且无路径提示时：不做「无关文件占比」误杀（需求表→新模块常见）
    if hints and n >= 4 and must:
        matched = _count_hint_matched(files, [str(h) for h in hints])
        unrelated = n - matched
        if unrelated > max(2, n // 2):
            violations.append(
                f"约 {unrelated}/{n} 个变更文件与需求路径提示无关，疑似扩大改动面"
            )
    elif hints and n >= 4 and not must:
        matched = _count_hint_matched(files, [str(h) for h in hints])
        # 软约束：过半对得上即可；全栈新页常改 router/layout/main
        if matched == 0 and n >= 6:
            violations.append(
                f"变更 {n} 个文件均未命中路径提示，疑似改错模块"
            )

    for req_path in must:
        rp = str(req_path or "").replace("\\", "/").strip()
        if not rp:
            continue
        if not any(
            _path_matches_hint(f, rp)
            or f.endswith(rp.split("/")[-1])
            or _work_hour_view_alias(f, rp)
            for f in files
        ):
            violations.append(f"未改动识图锚定文件：{rp}")

    forbid = sc.get("forbid_paths") if isinstance(sc.get("forbid_paths"), list) else []
    for f in files:
        for bad in forbid:
            bp = str(bad or "").replace("\\", "/").strip()
            if not bp:
                continue
            if _path_matches_hint(f, bp) or f.endswith(bp.split("/")[-1]):
                title = str(sc.get("page_title") or "识图页")
                violations.append(
                    f"误改禁止路径 {f}（需求锚定页面是「{title}」，勿改其它列表页）"
                )
                break

    # 菜单锚定：用户点名菜单后，变更文件名不得明显落入其它菜单关键词目录（软检查）
    target_menu = str(sc.get("target_menu") or "").strip()
    if target_menu and files:
        other_menu_dirs = {
            "生产管理": ("warehouse", "仓储"),
            "仓储管理": ("production", "生产"),
            "仓库管理": ("production", "生产"),
        }
        bad_bits = other_menu_dirs.get(target_menu) or ()
        if bad_bits:
            wrong = [
                f
                for f in files
                if any(b in f.replace("\\", "/").lower() for b in bad_bits)
                and "/views/" in f.replace("\\", "/").lower()
            ]
            if wrong:
                violations.append(
                    f"菜单锚定「{target_menu}」，但变更落在疑似其它模块目录：{wrong[0]}（请核对）"
                )

    detail = "；".join(violations) if violations else f"变更 {n} 个文件，在范围内"
    return {
        "ok": not violations,
        "file_count": n,
        "violations": violations,
        "detail": detail,
        "max_files": max_files,
    }


def _is_junk_requested_label(t: str) -> bool:
    """标注垃圾 / 禁止句 / 功能描述 ≠ 要加的表头名。"""
    s = (t or "").strip()
    if not s or len(s) < 2:
        return True
    if s in ("一列", "字段", "列", "按截图改表", "本页前端表格", "列表"):
        return True
    # 残缺截取（如误把「加班工时」这一列 拆成 班工时”这一）
    if "这一" in s or "”" in s or "“" in s or "「" in s or "」" in s:
        return True
    # 识图批注位置、禁止改它页等，绝不能当「缺列」打回
    junk_keys = (
        "箭头",
        "高亮",
        "手写圈",
        "红框",
        "位于",
        "批注",
        "插入位置",
        "当成本页",
        "禁止",
        "必须改",
        "frontend/",
        "backend/",
        "登记发货",
        "校验不",
        "发满关单",
        "列表与新",
    )
    if any(k in s for k in junk_keys):
        return True
    if s.startswith("；") or s.startswith("①") or s.startswith("②"):
        return True
    return False


# 「加」须用 (?!班)：否则「删除加班工时这一列」会把「加班…列」误判成「要加列」→ content_gap 假红。
_ADD_COL_VERB = r"(?:增加|新增|加上|加入|加(?!班))"


def extract_requested_labels(message: str) -> list[str]:
    """从用户意图抽出要加的列/字段中文名（不预设业务词）。

    只认「增加/新增/加/红框处…列|字段」；不认删除列、现有表头复述、禁止句里的列表名、
    图中箭头批注。避免「加班工时」等词被 content_gap 误打回三轮。
    """
    msg = message or ""
    out: list[str] = []
    # (?!表) 防止「」列表 被当成 「」列
    for pat in (
        rf"(?:红框处)?{_ADD_COL_VERB}[「\"“']([^」\"”']{{2,24}})[」\"”'](?:列|字段)(?!表)",
        rf"{_ADD_COL_VERB}([^\n「\"“'，。；;]{{2,24}})(?:列|字段)(?!表)",
        rf"红框处{_ADD_COL_VERB}([^\n，。；;]{{2,40}})",
    ):
        for m in re.finditer(pat, msg):
            # 删除/移除语境下的「…列」不是加列（双保险）
            before = msg[max(0, m.start() - 12) : m.start()]
            if any(k in before for k in ("删除", "移除", "去掉", "隐藏", "取消显示")):
                continue
            t = m.group(1).strip().strip("-*· ")
            t = re.sub(r"^(确切的|精确的)", "", t)
            t = re.split(r"[（(含包含]", t, maxsplit=1)[0].strip()
            # 去掉引号与尾随「列/字段」（多轮，避免「xxx」列 → xxx」）
            for _ in range(3):
                t2 = t.strip("「」\"“”'").strip()
                t2 = re.sub(r"(?:列|字段)$", "", t2).strip()
                if t2 == t:
                    break
                t = t2
            if 2 <= len(t) <= 24 and t not in out and not _is_junk_requested_label(t):
                out.append(t)
    return out[:6]


def audit_implement_content(
    changed_files: list[str],
    scope: dict[str, Any] | None,
    *,
    workspace: str = "",
) -> dict[str, Any]:
    """内容门禁：仅当需求写清「要加的列名」时，核验前端是否出现该表头文案。

    不绑定 last_inbound_at 等固定英文字段；列名以用户意图为准。
    """
    from pathlib import Path

    sc = scope if isinstance(scope, dict) else {}
    msg = str(sc.get("user_message_excerpt") or "")
    must = sc.get("must_include_paths") if isinstance(sc.get("must_include_paths"), list) else []
    labels = extract_requested_labels(msg)
    if not labels:
        return {"ok": True, "violations": [], "detail": "无明确列名，跳过内容文案门禁"}

    root = Path(str(workspace or "").strip())
    if not root.is_dir():
        return {
            "ok": False,
            "violations": ["内容门禁：工程目录不可用，无法核验列是否落盘"],
            "detail": "workspace 无效",
        }

    def _read(rel: str) -> str:
        p = root.joinpath(*rel.replace("\\", "/").split("/"))
        if not p.is_file():
            return ""
        try:
            return p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""

    # 合并变更文件 + 锚定 vue
    candidates: list[str] = []
    for rel in _normalize_files(changed_files):
        if rel.endswith(".vue") or "View.vue" in rel:
            candidates.append(rel)
    for p in must:
        if str(p).endswith(".vue") and str(p) not in candidates:
            candidates.append(str(p).replace("\\", "/"))

    blob = ""
    checked: list[str] = []
    for rel in candidates:
        t = _read(rel)
        if t:
            checked.append(rel)
            blob += "\n" + t

    if not blob.strip():
        return {
            "ok": False,
            "violations": [f"未读到可核验的前端文件，无法确认是否落地：{' / '.join(labels)}"],
            "detail": "无前端落盘可读",
            "checked": checked,
            "labels": labels,
        }

    missing = [lb for lb in labels if lb not in blob]
    if missing:
        return {
            "ok": False,
            "violations": [
                f"需求要求落地「{lb}」，前端源码未见该表头/文案（以用户意图为准，勿擅自换成其它列）"
                for lb in missing
            ],
            "detail": "；".join(f"缺「{lb}」" for lb in missing),
            "checked": checked,
            "labels": labels,
        }
    return {
        "ok": True,
        "violations": [],
        "detail": "内容门禁通过：用户要求的列名已出现在前端",
        "checked": checked,
        "labels": labels,
    }


def _work_hour_view_alias(changed: str, required: str) -> bool:
    """EmployeeWorkHourReportView ↔ EmployeeWorkHoursReportView（工程里两种文件名都出现过）。"""
    c = (changed or "").replace("\\", "/")
    r = (required or "").replace("\\", "/")
    if "EmployeeWorkHour" not in r or not r.endswith(".vue"):
        return False
    return bool(
        re.search(r"EmployeeWorkHours?ReportView\.vue$", c)
        and "views/reports/" in c
    )


def _normalize_files(raw: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        rel = str(item or "").strip().replace("\\", "/")
        while rel.startswith("./"):
            rel = rel[2:]
        if not rel or rel.startswith("/") or ".." in rel.split("/"):
            continue
        if rel in seen:
            continue
        seen.add(rel)
        out.append(rel)
    return out
