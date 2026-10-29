"""从识图正文抽取界面结构（页面/表头/标注），供需求合并与写码门禁。

落文件：在当前工作区按标题检索（page_locate），禁止写死某一家 MES 的 vue/router 表。
检索不到则只带标题/表头，并标 need_user_path_confirm，由用户确认路径。
"""
from __future__ import annotations

import re
from typing import Any


def looks_like_relative_ui_edit(text: str) -> bool:
    """短句依赖截图上下文：红框/此处/加列等。"""
    t = text or ""
    return any(
        k in t
        for k in (
            "红框",
            "此处",
            "这里",
            "该处",
            "图中",
            "截图",
            "加一列",
            "加列",
            "增加列",
            "加字段",
            "增加字段",
            "中间加",
            "后面加",
            "前面加",
        )
    )


def parse_vision_surface(
    vision_text: str,
    *,
    workspace: str = "",
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """规则抽取识图中的页面/表头/标注（不二次调模型）；路径靠工程检索。"""
    v = vision_text or ""
    page_title = _pick_page_title(v)
    columns = _pick_table_columns(v)
    filters = _pick_labeled_items(
        v,
        (
            "筛选",
            "过滤",
            "搜索",
            "仓库",
            "关键词",
            "查询条件",
        ),
    )
    buttons = _pick_labeled_items(v, ("按钮", "搜索", "重置", "提交", "导出"))
    marks = _pick_marks(v)
    sample_rows = _pick_sample_codes(v)
    menu_path = _pick_menu_path(v)
    anchors = resolve_page_anchors(
        page_title=page_title,
        vision_text=v,
        user_text="",
        workspace=workspace,
        profile=profile,
    )
    return {
        "page_title": page_title,
        "menu_path": menu_path,
        "table_columns": columns,
        "filters": filters[:12],
        "buttons": buttons[:12],
        "marks": marks,
        "sample_codes": sample_rows[:8],
        "must_include_paths": list(anchors.get("must_include_paths") or []),
        "forbid_paths": list(anchors.get("forbid_paths") or []),
        "path_hints": list(anchors.get("path_hints") or []),
        "need_user_path_confirm": bool(anchors.get("need_user_path_confirm")),
        "raw_excerpt": v[:2000],
    }


def looks_like_requirements_matrix(text: str) -> bool:
    """需求跟踪表 / PRD 行截图（非业务列表页）——禁止锚到低库存等既有页。"""
    t = text or ""
    if not t.strip():
        return False
    # 典型列：编码 R04、项目、本项、功能要求 / 验收
    matrix_cols = sum(
        1
        for k in ("编码", "项目", "本项", "功能要求", "验收标准", "优先级", "业务目标")
        if k in t
    )
    if matrix_cols >= 3:
        return True
    if re.search(r"\bR\d{2}\b", t) and any(k in t for k in ("功能要求", "验收", "本项", "P0")):
        return True
    if "销售订单" in t and any(k in t for k in ("发货", "超发", "关单", "建单")):
        return True
    return False


def resolve_page_anchors(
    *,
    page_title: str = "",
    vision_text: str = "",
    user_text: str = "",
    workspace: str = "",
    profile: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """按标题在工作区检索文件；无工作区或未命中则不强钉路径。"""
    title = (page_title or "").strip()
    blob = f"{title}\n{vision_text}\n{user_text}"
    # 需求表截图：不得把表里「样例页面名」当成要改的业务页
    if looks_like_requirements_matrix(blob) and not any(
        k in (user_text or "") for k in ("低库存", "库存预警", "物料入库", "工时")
    ):
        return {
            "must_include_paths": [],
            "forbid_paths": [],
            "path_hints": [],
            "need_user_path_confirm": False,
            "page_title": title,
        }

    from .page_locate import locate_page_files

    must = locate_page_files(title, workspace=workspace, profile=profile, limit=6)
    hints = list(must)
    if isinstance(profile, dict):
        layout = profile.get("layout") if isinstance(profile.get("layout"), dict) else {}
        for d in layout.get("view_dirs") or []:
            s = str(d or "").strip().replace("\\", "/")
            if s and s not in hints:
                hints.append(s.rstrip("/") + "/**")
        for d in layout.get("api_dirs") or []:
            s = str(d or "").strip().replace("\\", "/")
            if s and s not in hints:
                hints.append(s.rstrip("/") + "/**")
    need_confirm = bool(title) and not must
    return {
        "must_include_paths": must,
        "forbid_paths": [],
        "path_hints": hints,
        "need_user_path_confirm": need_confirm,
        "page_title": title,
    }


def _dedupe_anchored_core(text: str) -> str:
    """去掉二次 merge 造成的【界面锚定】…【改动】套娃，保留叶级改动意图。"""
    t = (text or "").strip()
    if t.count("【界面锚定】") < 2 and t.count("【改动】") < 2:
        return t
    page_m = re.search(r"【界面锚定】([^【\n]+)", t)
    cols_m = re.search(r"【现有表头】([^【\n]+)", t)
    leaf = t
    # 取最后一个不以【界面锚定】开头的【改动】正文
    parts = re.split(r"【改动】", t)
    for part in reversed(parts[1:]):
        p = part.strip()
        if not p or p.startswith("【界面锚定】"):
            # 嵌套块：继续剥
            nested = re.split(r"【改动】", p)
            if len(nested) > 1:
                cand = nested[-1].strip()
                if cand and not cand.startswith("【界面锚定】"):
                    leaf = cand
                    break
            continue
        leaf = p
        break
    # 去掉叶级后多余的锚定/必须改尾巴里的重复句，保留到第一句「须改」或文件门禁前的意图
    leaf = re.sub(r"^【界面锚定】[^【]*", "", leaf).strip()
    leaf = re.sub(r"^【现有表头】[^【]*", "", leaf).strip()
    leaf = leaf.strip("。；; \n")
    if not leaf:
        leaf = "按截图标注改界面"
    page = (page_m.group(1).strip() if page_m else "").strip()
    cols = (cols_m.group(1).strip() if cols_m else "").strip()
    bits = []
    if page:
        bits.append(f"【界面锚定】{page}")
    if cols:
        bits.append(f"【现有表头】{cols}")
    bits.append(f"【改动】{leaf}")
    # 保留首次出现的必须/禁止改文件
    for key in ("【必须改文件】", "【禁止改文件】", "【图中标注】"):
        m = re.search(re.escape(key) + r"([^【\n]+)", t)
        if m:
            bits.append(key + m.group(1).strip())
    return "\n".join(bits)[:2000]


def _is_position_only_overlay(text: str) -> bool:
    """仅描述红框/列序号位置，不含「新增××列」类改动名。"""
    t = (text or "").strip()
    if not t:
        return True
    if re.search(r"(?:增加|新增|加).{0,16}(?:列|字段)", t):
        return False
    if re.search(r"第\s*\d+\s*列", t) and ("之间" in t or "区域" in t or "方框" in t or "红框" in t):
        return True
    if re.search(r"(红色方框|红框).{0,12}标注", t) and "列" not in t.replace("列之间", ""):
        return True
    return False


def extract_overlay_change_phrases(vision: str) -> list[str]:
    """从图上批注/附加文字抽出改动短语（不猜字段名）。"""
    v = vision or ""
    out: list[str] = []
    for pat in (
        r"附图附加文字[：:]\s*[「\"“]?([^」\"”\n]{4,80})",
        r"(?:增加|新增|加)[「\"“']?([^」\"”'\n，。；;]{2,24})[」\"”']?(?:列|字段)",
        r"红框处(?:增加|新增|加)([^\n，。；;]{2,40})",
        r"预警界面红框处([^\n]{4,60})",
    ):
        for m in re.finditer(pat, v):
            t = (m.group(1) if m.lastindex else m.group(0)).strip().strip("-*· ")
            if 2 <= len(t) <= 60 and t not in out and not _is_position_only_overlay(t):
                out.append(t)
    return out[:6]


def enrich_intent_from_vision_overlay(
    vision: str, surf: dict[str, Any], intent: str
) -> str:
    """仅在用户短句空泛时，用图上批注补全意图；禁止默认成某一固定列名。"""
    base = (intent or "").strip()
    # 用户已写清要加什么 → 原样尊重
    if base and any(
        k in base
        for k in (
            "数量",
            "时间",
            "状态",
            "列",
            "字段",
            "增加",
            "新增",
            "加",
        )
    ) and not re.fullmatch(r".*按截图.*改表.*", base):
        # 「按截图改表」太空，允许用批注补；其它有动作词的保留
        if "按截图" not in base and "已有页面" not in base:
            return base

    phrases = extract_overlay_change_phrases(vision)
    marks = [str(m) for m in (surf.get("marks") or []) if str(m).strip()]
    # 标注里若已写「增加「xxx」列」也收入
    for m in marks:
        phrases.extend(extract_overlay_change_phrases(m))
    # 去重保序
    seen: set[str] = set()
    uniq: list[str] = []
    for p in phrases:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    if not uniq:
        return base

    # 批注优先；用户空泛句可被替换/并入
    overlay = uniq[0]
    if not base or "按截图" in base or "已有页面" in base:
        return f"按图中批注：{overlay}"[:240]
    if overlay not in base:
        return f"{base}；图中批注：{overlay}"[:240]
    return base


def merge_user_intent_with_vision(
    user_text: str,
    vision_text: str,
    *,
    surface: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """用户短句 + 识图界面锚定 → 可实施需求核心。

    返回 {core, surface, notes, source}。
    """
    user = (user_text or "").strip()
    vision = (vision_text or "").strip()
    surf = surface if isinstance(surface, dict) else parse_vision_surface(vision)
    notes: list[str] = []
    page = str(surf.get("page_title") or "").strip()
    cols = [str(c) for c in (surf.get("table_columns") or []) if str(c).strip()]
    marks = [str(m) for m in (surf.get("marks") or []) if str(m).strip()]

    # 无识图：原样
    if not vision:
        return {
            "core": user,
            "surface": surf,
            "notes": notes,
            "source": "user_text",
        }

    # 已锚定：禁止再套一层【界面锚定】【改动】；仅去重，不擅自改用户改动意图
    if "【界面锚定】" in user and "【改动】" in user:
        core = _dedupe_anchored_core(user)
        notes.append("已锚定需求，跳过重复合并（保留用户改动意图）")
        return {
            "core": core[:2000],
            "surface": surf,
            "notes": notes,
            "source": "user_plus_vision",
        }

    relative = looks_like_relative_ui_edit(user) or (
        bool(user)
        and len(user) < 80
        and not any(k in user for k in ("页", "菜单", "接口", "/api", "路由"))
    )
    # 「按截图改表」类空泛摘要：按相对改动处理，便于用图上批注补意图（不猜列名）
    if (not relative) and page and ("按截图" in user or "已有页面" in user):
        relative = True

    if relative and page:
        notes.append("用户短句依赖截图：已锚定识图页面，禁止只按关键词改错页")
        col_line = "、".join(cols[:12]) if cols else "（识图表头未解析到，以实现时页面现有列为准）"
        mark_line = "；".join(marks[:4]) if marks else ""
        intent = user or "按截图标注改界面"
        intent = enrich_intent_from_vision_overlay(vision, surf, intent)
        # 仅当意图明确是「加列」时才写插入位置；红框圈行/示例不得写成插入列
        insert_hint = ""
        if _looks_like_column_insert(intent, marks, vision):
            for m in marks:
                if "之间" in m:
                    insert_hint = f"插入位置以标注为准（{m[:40]}）；"
                    break
            if not insert_hint:
                insert_hint = "插入位置以图中红框/标注为准；"
        bits = [
            f"【界面锚定】{page}"
            + (f"（菜单：{surf.get('menu_path')}）" if surf.get("menu_path") else ""),
            f"【现有表头】{col_line}",
            f"【改动】{intent}。{insert_hint}须改本页前端表格 + 对应列表接口字段；"
            "禁止改其它业务列表页（勿把其它列表页误当成锚定页）。"
            "列名/字段以用户意图与图上批注为准，禁止擅自换成其它列。",
        ]
        if mark_line:
            bits.append(f"【图中标注】{mark_line}")
        if surf.get("must_include_paths"):
            bits.append(
                "【必须改文件】" + "、".join(str(x) for x in surf["must_include_paths"][:6])
            )
        elif surf.get("need_user_path_confirm"):
            bits.append(
                "【路径待确认】工程内未自动定位到与该页面标题匹配的文件；"
                "请用户指出要改的页面/路由文件，禁止猜测其它仓库的目录习惯。"
            )
        if surf.get("forbid_paths"):
            bits.append(
                "【禁止改文件】" + "、".join(str(x) for x in surf["forbid_paths"][:6])
            )
        core = "\n".join(bits)[:2000]
        return {
            "core": core,
            "surface": surf,
            "notes": notes,
            "source": "user_plus_vision",
        }

    # 非相对短句：仍把页面锚定拼进需求，避免写码丢上下文
    if page and page not in user:
        notes.append("已将识图页面标题并入需求核心")
        extra = f"【界面锚定】{page}"
        if cols:
            extra += "；现有表头：" + "、".join(cols[:10])
        if surf.get("must_include_paths"):
            extra += "；必须改：" + "、".join(surf["must_include_paths"][:4])
        core = (user + "\n" + extra).strip()[:2000] if user else extra
        return {
            "core": core or user,
            "surface": surf,
            "notes": notes,
            "source": "user_plus_vision" if user else "vision",
        }

    return {
        "core": user,
        "surface": surf,
        "notes": notes,
        "source": "user_text",
    }


def format_vision_surface_for_implement(surface: dict[str, Any] | None) -> str:
    if not isinstance(surface, dict) or not surface:
        return ""
    lines = ["【识图界面结构 · 写码必须遵守】"]
    if surface.get("page_title"):
        lines.append(f"- 页面：{surface['page_title']}")
    if surface.get("menu_path"):
        lines.append(f"- 菜单：{surface['menu_path']}")
    cols = surface.get("table_columns") or []
    if cols:
        lines.append("- 现有表头：" + "、".join(str(c) for c in cols[:12]))
    if surface.get("must_include_paths"):
        lines.append("- 工程检索命中（优先改）：" + "、".join(str(p) for p in surface["must_include_paths"][:8]))
    elif surface.get("need_user_path_confirm") or surface.get("page_title"):
        lines.append(
            "- 路径：未在当前工作区自动定位到匹配文件；须先向用户确认页面/路由路径，禁止套用其它项目目录"
        )
    if surface.get("forbid_paths"):
        lines.append("- 禁止改：" + "、".join(str(p) for p in surface["forbid_paths"][:8]))
    marks = surface.get("marks") or []
    if marks:
        lines.append("- 标注：" + "；".join(str(m) for m in marks[:6]))
    return "\n".join(lines)[:1800]


def _is_prompt_boilerplate_title(t: str) -> bool:
    """模型把提示词样例抄进「页面标题」时丢弃（如「如『低库存预警』」）。"""
    s = (t or "").strip()
    if not s:
        return True
    if any(
        k in s
        for k in (
            "界面主标题原文",
            "如「",
            "例如",
            "未见",
            "侧栏或面包屑",
            "可见路径",
        )
    ):
        return True
    if s.startswith("（") or s.startswith("("):
        return True
    return False


def _pick_page_title(v: str) -> str:
    # 需求跟踪表截图：没有业务列表页标题
    if looks_like_requirements_matrix(v):
        return ""
    for pat in (
        r"页面标题[：:]\s*[「\"“]?([^」\"”\n]{2,40})",
        r"标题[：:]\s*[「\"“]?([^」\"”\n]{2,40})",
        r"\*\*[「\"“]?([^」\"”*]{2,40}预警[^」\"”*]{0,20})[」\"”]?\*\*",
        r"[「\"“]([^」\"”]{2,30}预警)[」\"”]",
    ):
        m = re.search(pat, v)
        if m:
            t = m.group(1).strip().strip("-* ")
            if _is_prompt_boilerplate_title(t):
                continue
            if 2 <= len(t) <= 40:
                return t
    # 行首常见标题
    for line in v.splitlines():
        s = line.strip().lstrip("#*- ").strip()
        if _is_prompt_boilerplate_title(s):
            continue
        if s in ("低库存预警", "物料入库", "收藏夹"):
            return s
        if "低库存预警" in s and len(s) <= 24:
            return "低库存预警"
    return ""


def _pick_table_columns(v: str) -> list[str]:
    cols: list[str] = []
    # 显式「表头/列」列表
    for pat in (
        r"(?:表头|列名|字段|表格列|现有列)[^\n]{0,20}[：:]([^\n]+)",
        r"(?:从左到右|列顺序)[^\n]{0,10}[：:]([^\n]+)",
    ):
        m = re.search(pat, v)
        if m:
            for part in re.split(r"[、,，|/｜]", m.group(1)):
                t = part.strip().strip("-*· ")
                if 1 < len(t) <= 20 and t not in cols:
                    cols.append(t)
    known = (
        "物料编码",
        "物料名称",
        "仓库",
        "现存量",
        "安全库存",
        "缺口",
        "单位",
        "更新时间",
        "入库时间",
        "物料入库时间",
        "入库单号",
        "入库数量",
        "入库日期",
        "经办人",
        "状态",
        "规格型号",
        "库位",
    )
    if not cols:
        for k in known:
            if k in v and k not in cols:
                # 避免「入库时间」误命中「物料入库时间」需求句时打乱顺序——仍收录
                cols.append(k)
    # 低库存页常见顺序纠偏
    if "低库存" in v or "缺口" in v:
        prefer = [
            "物料编码",
            "物料名称",
            "仓库",
            "现存量",
            "安全库存",
            "缺口",
            "单位",
            "更新时间",
        ]
        ordered = [c for c in prefer if c in cols or c in v]
        for c in cols:
            if c not in ordered:
                ordered.append(c)
        cols = ordered
    return cols[:20]


def _pick_labeled_items(v: str, keys: tuple[str, ...]) -> list[str]:
    out: list[str] = []
    for line in v.splitlines():
        s = line.strip()
        if not any(k in s for k in keys):
            continue
        t = re.sub(r"^[-*•\d.)、\s]+", "", s)
        if 2 < len(t) <= 80 and t not in out:
            out.append(t)
    return out


def highlighted_existing_column(vision: str, columns: list[str] | None) -> str:
    """识图把「红框圈中某列表头」写成「X位于第N列和第M列之间」时，返回被圈中的现有列名。

    此形态是删列/改列，不是两列之间插新列。例：加班工时位于第9列和第10列之间。
    """
    cols = [str(c).strip() for c in (columns or []) if str(c).strip()]
    if not cols:
        return ""
    blob = vision or ""
    # 「加班工时位于第9列和第10列之间」
    for m in re.finditer(
        r"([一-龥A-Za-z0-9_/\-]{2,20})位于第\s*\d+\s*列.{0,24}第\s*\d+\s*列.{0,8}之间",
        blob,
    ):
        name = m.group(1).strip()
        name = re.sub(r"^(?:红框|箭头|高亮|/|：|:)+", "", name).strip()
        if name in cols:
            return name
    # 用户/批注明确删除某列
    for m in re.finditer(
        r"(?:删除|移除|去掉|隐藏)[「\"“']?([^」\"”'\n，。；;]{2,20})[」\"”']?(?:列|字段)?",
        blob,
    ):
        name = m.group(1).strip().strip("「」\"“”'")
        name = re.sub(r"(?:列|字段)$", "", name).strip()
        if name in cols:
            return name
    return ""


def _looks_like_column_insert(
    intent: str, marks: list[str], vision: str
) -> bool:
    """是否明确要在表头加列。仅「之间」不够（圈行/圈列也会被识图写成两列之间）。"""
    intent_s = str(intent or "")
    blob = "\n".join(
        [intent_s, str(vision or "")] + [str(m) for m in (marks or [])]
    )
    # 删列 / 圈中现有列 → 绝不当插列
    if any(k in blob for k in ("删除列", "移除列", "去掉列", "删除「", "删除\"")):
        return False
    if re.search(r"(?:删除|移除|去掉).{0,12}列", blob):
        return False
    cols_guess: list[str] = []
    mcols = re.search(r"表头列名[^\n]{0,20}[：:]([^\n]+)", vision or "")
    if mcols:
        cols_guess = [
            c.strip()
            for c in re.split(r"[、,，/|]", mcols.group(1))
            if c.strip() and len(c.strip()) <= 20
        ]
    hl = highlighted_existing_column(blob, cols_guess)
    if hl and not any(
        k in blob
        for k in (
            "增加一列",
            "新增一列",
            "插入一列",
            "加一列",
            "插入列",
            "增加列",
            "新增列",
            "加列",
            "空白",
        )
    ):
        return False
    if any(
        k in blob
        for k in (
            "增加一列",
            "新增一列",
            "插入一列",
            "加一列",
            "插入列",
            "增加列",
            "新增列",
            "加列",
        )
    ):
        return True
    # 「新增一条/圈住一行」是行级标注，不要因识图写了「两列之间」就当成加列
    if any(
        k in blob
        for k in ("一条", "一行", "示例行", "数据行", "该行", "此行")
    ) and not any(k in blob for k in ("一列", "加列", "增加列", "新增列")):
        return False
    if "之间" not in blob:
        return False
    if "空白" in blob and "列" in blob:
        return True
    if any(k in intent_s for k in ("列", "字段")) and any(
        k in intent_s for k in ("增加", "新增", "加一", "插入")
    ):
        return True
    # 「第N列和第M列之间」且无「X列名位于…之间」圈列语义 → 表头插列
    if re.search(r"第\s*\d+\s*列.*?第\s*\d+\s*列.*?之间", blob) and not hl:
        if not any(
            k in blob for k in ("一条", "一行", "示例行", "数据行", "该行", "此行")
        ):
            return True
    # 「增加xxx时间/数量」类加列口语，且图上有「之间」
    if re.search(r"(增加|新增|加(?!班)).{0,16}(时间|数量|状态|日期|字段)", intent_s):
        return True
    return False


def _pick_marks(v: str) -> list[str]:
    out: list[str] = []
    for pat in (
        r"红框[^。\n]{0,60}",
        r"标注[^。\n]{0,60}",
        r"高亮[^。\n]{0,40}",
        r"箭头[^。\n]{0,40}",
    ):
        for m in re.finditer(pat, v):
            t = m.group(0).strip()
            if t and t not in out:
                out.append(t)
    return out[:8]


def _pick_sample_codes(v: str) -> list[str]:
    return list(dict.fromkeys(re.findall(r"\b[A-Z]{2,}[-_][A-Z0-9-]{2,}\b", v)))[:8]


def _pick_menu_path(v: str) -> str:
    from .requirement_scope import clean_menu_candidate, extract_menu_anchor

    # 用户原文/需求表「项目」列优先：只锚定菜单名，禁止拼接假页面路径
    # （页面名应由识图/原话给出，不在此发明「某菜单 / 某页」）
    anchored = extract_menu_anchor(v)
    if anchored:
        return anchored
    m = re.search(r"(?:菜单|导航)(?:路径)?[^\n]{0,10}[：:]([^\n]{2,40})", v)
    if m:
        raw = m.group(1).strip()
        if raw in ("未见", "未知", "无", "-", "—"):
            return ""
        # 只取路径首段作为菜单锚定；不因制造业白名单才认
        first = clean_menu_candidate(raw)
        if first:
            return first
        via = extract_menu_anchor("菜单：" + raw)
        if via:
            return via
    return ""
