"""验证 / 复核失败 → 打回写码（5）→ 再验证（6）→ 再复核（7）闭环。"""
from __future__ import annotations

import re
from typing import Any

from .config import get_config


RETRY_CHAIN = ("5", "6", "7", "8")


def retry_sequence_after_implement_fix(original: tuple[str, ...]) -> tuple[str, ...]:
    """重跑写码→验证→复核→提交，并接上原序列中第 8 步之后（9～10）。"""
    tail = tuple(s for s in original if str(s).isdigit() and int(s) > 8)
    return RETRY_CHAIN + tail


def max_fix_rounds() -> int:
    """写码↔验证↔复核闭环最多打回次数（硬顶 3，满则流程失败）。"""
    return max(1, min(3, int(get_config().get("max_fix_rounds") or 3)))


def is_fix_round_exhausted(fix_round: int) -> bool:
    return int(fix_round or 0) >= max_fix_rounds()


def should_auto_retry_implement(*, reason: str, fix_round: int) -> bool:
    cfg = get_config()
    mode = str(cfg.get("on_step_fail") or "auto_fix").strip()
    if mode != "auto_fix":
        return False
    if not cfg.get("auto_run", True):
        return False
    if is_fix_round_exhausted(fix_round):
        return False
    return reason in _RETRYABLE_REASONS


_RETRYABLE_REASONS = frozenset(
    {
        "cmd_fail",
        "review_blockers",
        "review_fail",
        "scope_creep",
        "content_gap",
        "wrong_page",
        "must_fix_unaddressed",
        "no_changed_files",
        "db_sync_blocked",
        "commit_gate_blockers",
        "commit_retry_exhausted",
    }
)


def bump_fix_round(run: dict[str, Any]) -> int:
    n = int(run.get("fix_round") or 0) + 1
    run["fix_round"] = n
    return n


def reset_steps_for_implement_retry(steps: list[dict[str, Any]]) -> None:
    for st in steps:
        sid = str(st.get("step_id") or "")
        if sid in RETRY_CHAIN:
            st["status"] = "pending"
            if sid != "5":
                st["summary"] = ""
                st["receipt"] = None


def store_validate_fail_epic(epic: dict[str, Any], receipt: dict[str, Any], *, round_no: int) -> None:
    epic.setdefault("artifacts", {})["validate_fail_evidence"] = {
        "round": round_no,
        "summary": str(receipt.get("summary") or ""),
        "evidence": receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {},
    }


def store_scope_fail_epic(
    epic: dict[str, Any],
    audit: dict[str, Any],
    *,
    files: list[str] | None = None,
) -> None:
    epic.setdefault("artifacts", {})["scope_fail_evidence"] = {
        "detail": str(audit.get("detail") or ""),
        "violations": audit.get("violations") if isinstance(audit.get("violations"), list) else [],
        "file_count": audit.get("file_count"),
        "max_files": audit.get("max_files"),
        "files": list(files or [])[:40],
    }
    vios = audit.get("violations") if isinstance(audit.get("violations"), list) else []
    epic.setdefault("artifacts", {})["implement_fix_mandate"] = {
        "round": 0,
        "max_rounds": max_fix_rounds(),
        "must_fix": [str(v) for v in vios[:10]] or [str(audit.get("detail") or "缩小变更面")],
        "files": list(files or [])[:30],
        "source": "scope",
    }


# 审码报告「一、总体评价」概览 / 尾注：进 must_fix 会淹没真正问题
_OVERVIEW_NOISE_RE = re.compile(
    r"(高危|中危|低危)问题：共\s*\d+\s*处"
    r"|数量核对"
    r"|审核不通过"
    r"|有条件通过"
    r"|审核通过（无高危）"
    r"|本次审核共发现"
    r"|必须全部修复后方可合并"
    r"|建议本次一并修复"
    r"|建议在后续迭代"
)

# 真正问题标题：🔴 高危 问题1 — …
_ISSUE_TITLE_RE = re.compile(
    r"^[🔴🟡🟢❌]?\s*(高危|中危|低危|Blocker|P0|P1)\s*问题?\s*\d*\s*[—\-–]?\s*.+",
    re.I,
)

_BLOCKING_SEV = frozenset({"critical", "high", "p0", "blocker", "blocking"})
_MEDIUM_SEV = frozenset({"medium", "p1"})


def _sev_rank(sev: str) -> int:
    s = (sev or "").strip().lower()
    if s in _BLOCKING_SEV:
        return 0
    if s in _MEDIUM_SEV:
        return 1
    return 2


def _is_overview_noise(line: str) -> bool:
    s = (line or "").strip()
    if not s or len(s) < 6:
        return True
    if _OVERVIEW_NOISE_RE.search(s):
        # 「🔴 高危 问题1 — …」带具体标题，不是概览
        if re.search(r"问题\s*\d+\s*[—\-–]", s) and "共" not in s[:20]:
            return False
        return True
    if s.startswith("✅") and ("数量" in s or "核对" in s or "通过" in s):
        return True
    if s.startswith("❌") and "审核不通过" in s and "—" not in s and "问题" not in s[2:12]:
        return True
    return False


def _format_finding_fix_line(f: dict[str, Any]) -> str:
    """结构化 finding → 写码可执行的一行（含路径与修复建议）。"""
    sev = str(f.get("severity") or f.get("level") or "").strip().lower()
    band = {"critical": "高危", "high": "高危", "p0": "高危", "blocker": "高危",
            "medium": "中危", "p1": "中危", "low": "低危", "p2": "低危"}.get(sev, sev or "问题")
    path = str(f.get("file") or f.get("path") or "").strip()
    line_no = f.get("line")
    title = str(f.get("title") or f.get("message") or f.get("rule") or "").strip()
    fix = str(f.get("fix_suggestion") or f.get("suggestion") or "").strip()
    loc = path
    if path and line_no not in (None, "", 0):
        loc = f"{path}:{line_no}"
    head = f"🔴 {band}" if _sev_rank(sev) == 0 else f"🟡 {band}" if _sev_rank(sev) == 1 else f"· {band}"
    parts = [f"{head} — {title}" if title else head]
    if loc:
        parts.append(f"文件：{loc}")
    if fix:
        parts.append("修复：" + re.sub(r"\s+", " ", fix)[:280])
    return "｜".join(parts)[:500]


def extract_fix_items_from_findings(findings: list[Any] | None) -> list[str]:
    """优先用结构化 findings：有高危只收高危；无高危再收中危。低危不进 must_fix。"""
    rows = [f for f in (findings or []) if isinstance(f, dict)]
    if not rows:
        return []
    blocking = [f for f in rows if _sev_rank(str(f.get("severity") or "")) == 0]
    medium = [f for f in rows if _sev_rank(str(f.get("severity") or "")) == 1]
    # 复核不通过只因高危；打回写码必须先清高危，勿被低危淹没
    chosen = blocking or medium
    items: list[str] = []
    seen: set[str] = set()
    for f in chosen[:12]:
        line = _format_finding_fix_line(f)
        key = re.sub(r"\s+", " ", line).strip()
        if len(key) < 8 or key in seen:
            continue
        seen.add(key)
        items.append(line)
    return items


def extract_review_fix_items(report_body: str, raw: dict[str, Any] | None = None) -> list[str]:
    """从审码报告抽出须逐条修复的条目，供写码 requirement 使用。

    优先顺序：raw/evidence 结构化 findings → 正文「问题N —」标题行（附文件路径）。
    禁止把「共 N 处」概览、数量核对、审核结论行塞进 must_fix。
    """
    text = (report_body or "").strip()
    raw = raw if isinstance(raw, dict) else {}
    # 结构化优先（含 gate / code_review findings）
    for key in ("findings", "gate_findings"):
        structured = extract_fix_items_from_findings(raw.get(key) if isinstance(raw.get(key), list) else None)
        if structured:
            return structured[:15]

    if not text:
        text = str(raw.get("reply") or raw.get("detail") or "").strip()
    if not text:
        return []
    items: list[str] = []
    seen: set[str] = set()

    def _add(line: str) -> None:
        s = re.sub(r"\s+", " ", (line or "").strip())
        if len(s) < 6 or s in seen or _is_overview_noise(s):
            return
        seen.add(s)
        items.append(s[:500])

    lines = text.splitlines()
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        i += 1
        if not s or _is_overview_noise(s):
            continue
        # 问题标题行（高危/中危/低危 问题N — …）
        if _ISSUE_TITLE_RE.match(s) or (
            re.search(r"问题\s*\d+\s*[—\-–]", s)
            and any(k in s for k in ("高危", "中危", "Blocker", "P0", "🔴", "🟡"))
        ):
            chunk = s
            # 紧随的「文件：」并入同一条，方便写码定位
            if i < len(lines) and lines[i].strip().startswith("文件："):
                chunk = f"{chunk}｜{lines[i].strip()}"
                i += 1
            _add(chunk)
            continue
        if any(k in s for k in ("Blocker", "阻断", "P0", "【高】", "须修复")) and not _is_overview_noise(s):
            _add(s)
        elif re.match(r"^[-*•]\s+", s) and len(s) > 10 and not _is_overview_noise(s):
            _add(s.lstrip("-*• ").strip())
        elif re.match(r"^\d+[.)、]\s*", s) and not _is_overview_noise(s):
            _add(re.sub(r"^\d+[.)、]\s*", "", s))

    # 若仍空：只扫「二、详细问题清单」里的问题标题
    if not items:
        m = re.search(r"二、详细问题清单([\s\S]{0,5000})", text)
        if m:
            for ln in m.group(1).splitlines():
                s = ln.strip()
                if not s or _is_overview_noise(s):
                    continue
                if _ISSUE_TITLE_RE.match(s) or re.search(r"问题\s*\d+\s*[—\-–]", s):
                    _add(s)
                if len(items) >= 12:
                    break

    # 有高危标题时丢掉纯低危行，避免稀释
    high_items = [x for x in items if "高危" in x or "Blocker" in x or "P0" in x]
    if high_items:
        items = high_items

    bc = raw.get("blocker_count") or raw.get("high_count")
    if isinstance(bc, int) and bc > 0 and not items:
        _add(f"审码报告存在 {bc} 个高危问题，见报告正文逐条修复")
    return items[:15]


def sanitize_must_fix_list(
    items: list[Any] | None,
    *,
    findings: list[Any] | None = None,
) -> list[str]:
    """清洗 must_fix：优先结构化 findings；去掉「共 N 处」概览；有高危只保留高危。"""
    structured = extract_fix_items_from_findings(findings)
    if structured:
        return structured[:15]
    cleaned: list[str] = []
    seen: set[str] = set()
    for x in items or []:
        s = re.sub(r"\s+", " ", str(x or "").strip())
        if len(s) < 6 or _is_overview_noise(s) or s in seen:
            continue
        seen.add(s)
        cleaned.append(s[:500])
    high = [
        x
        for x in cleaned
        if any(k in x for k in ("高危", "critical", "P0", "Blocker", "阻断"))
        or x.startswith("[P0]")
        or x.startswith("[high]")
        or x.startswith("[critical]")
    ]
    return (high or cleaned)[:15]


def refresh_implement_fix_mandate(epic: dict[str, Any]) -> dict[str, Any] | None:
    """打回写码前刷新账本：旧引擎写下的脏 must_fix 也在读时洗净。"""
    if not isinstance(epic, dict):
        return None
    arts = epic.setdefault("artifacts", {})
    if not isinstance(arts, dict):
        return None
    mandate = arts.get("implement_fix_mandate")
    if not isinstance(mandate, dict):
        return None
    rf = arts.get("review_fail_evidence") if isinstance(arts.get("review_fail_evidence"), dict) else {}
    findings: list[Any] = []
    for src in (
        rf.get("gate_findings"),
        rf.get("findings"),
        mandate.get("findings"),
    ):
        if isinstance(src, list) and src:
            findings = list(src)
            break
    cleaned = sanitize_must_fix_list(mandate.get("must_fix"), findings=findings)
    if not cleaned and isinstance(rf, dict):
        cleaned = sanitize_must_fix_list(rf.get("must_fix"), findings=findings)
    req_blob = "\n".join(
        [
            str(epic.get("requirement_core") or ""),
            str(epic.get("message") or ""),
        ]
    )
    body = str(rf.get("report_body") or "") if isinstance(rf, dict) else ""
    cleaned = align_must_fix_for_delete_feature(
        cleaned, requirement=req_blob, report_body=body
    )
    if cleaned:
        mandate["must_fix"] = cleaned
        if isinstance(rf, dict):
            rf["must_fix"] = cleaned
            arts["review_fail_evidence"] = rf
        arts["implement_fix_mandate"] = mandate
    return mandate


def looks_like_delete_feature_requirement(text: str) -> bool:
    """用户要删功能/模块/入口（非整列 UI 微调）。"""
    t = text or ""
    # 「删除加班工时列 / 删除某字段」≠ 删整功能
    if re.search(r"删除.{0,16}(列|字段|表头)", t) and not re.search(
        r"删除.{0,24}(功能|模块|页面|菜单|入口|报表|预警)", t
    ):
        return False
    return bool(
        re.search(r"删除.{0,24}(功能|模块|页面|菜单|入口|报表|预警)", t)
        or re.search(
            r"从.{0,20}(中)?删除.{0,24}(功能|模块|页面|菜单|入口|报表|预警)", t
        )
        or re.search(r"移除.{0,24}(功能|模块|页面|菜单|入口|报表|预警)", t)
    )


def align_must_fix_for_delete_feature(
    must_fix: list[str] | None,
    *,
    requirement: str = "",
    report_body: str = "",
) -> list[str]:
    """删功能需求：优先「彻底拆除」，勿把「在待删文件里修并发」当成唯一打回口令。

    事故：删除低库存预警后，复核高危仍是「inventory_low_stock 并发超发」，
    写码第 3 轮去修原子更新，而 main.py 仍挂着路由 → 功能实际未删干净。
    """
    items = [str(x).strip() for x in (must_fix or []) if str(x).strip()]
    req = requirement or ""
    body = report_body or ""
    if not looks_like_delete_feature_requirement(req):
        return items[:15]

    blob = f"{req}\n{body}\n" + "\n".join(items)
    out: list[str] = []

    incomplete = any(
        k in blob
        for k in (
            "删除功能不彻底",
            "仍对外暴露",
            "仍 include_router",
            "路由未删除",
            "接口仍对外",
            "OpenAPI 仍保留",
        )
    )
    # 低库存预警删功能：置顶拆除清单
    if incomplete or (
        any(k in blob for k in ("低库存", "库存低水位", "inventory_low_stock", "LowStock"))
        and looks_like_delete_feature_requirement(req)
    ):
        out.append(
            "🔴 高危 — 彻底删除低库存预警：从 main.py 移除 import 与 include_router；"
            "删除 backend/app/routers/inventory_low_stock.py；"
            "清理 openapi_zh 标签/说明与前端路由·菜单·API 封装；"
            "勿在待删模块上修并发。验证：GET /api/inventory-low-stock → 404"
        )

    for x in items:
        # 丢掉「在待删低库存文件里修并发」类口令
        if any(k in x for k in ("inventory_low_stock", "LowStockAlerts", "低库存预警")) and any(
            k in x for k in ("并发", "非原子", "超发", "条件 UPDATE", "rowcount", "TOCTOU")
        ):
            continue
        if x not in out:
            out.append(x[:500])

    if not out:
        out.append(
            "🔴 高危 — 按需求彻底删除目标功能：卸路由、删页面/接口文件、清菜单与 OpenAPI；"
            "验证入口与 API 均不可达"
        )
    return out[:15]


def store_review_fail_epic(epic: dict[str, Any], receipt: dict[str, Any], *, round_no: int) -> None:
    ev = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    raw = ev.get("raw") if isinstance(ev.get("raw"), dict) else {}
    body = str(ev.get("report_body") or raw.get("reply") or "").strip()
    # 结构化 findings：evidence.findings / gate_findings / raw.findings
    findings: list[Any] = []
    for src in (
        ev.get("findings"),
        ev.get("gate_findings"),
        raw.get("findings"),
        raw.get("gate_findings"),
    ):
        if isinstance(src, list) and src:
            findings = list(src)
            break
    must_fix = extract_fix_items_from_findings(findings)
    if not must_fix:
        # 正文抽取时把 findings 塞进 raw，便于 extract 优先结构化
        must_fix = extract_review_fix_items(
            body, {**raw, "findings": findings} if findings else raw
        )
    # 门禁类 findings（path/message/P0）仍兼容追加
    gate_findings = ev.get("gate_findings") if isinstance(ev.get("gate_findings"), list) else []
    if not gate_findings and isinstance(raw.get("findings"), list):
        gate_findings = list(raw.get("findings") or [])
    for f in gate_findings:
        if not isinstance(f, dict):
            continue
        sev = str(f.get("severity") or "").strip().lower()
        # 兼容旧门禁 P0/P1 与审码 high/critical
        if not (
            f.get("blocking")
            or sev in _BLOCKING_SEV
            or sev.upper() in {"P0", "P1"}
            or sev in _MEDIUM_SEV and not must_fix
        ):
            continue
        # 已有 title 的审码 finding 走 _format；门禁用 path/message
        if f.get("title") or f.get("fix_suggestion"):
            line = _format_finding_fix_line(f)
        else:
            line = (
                f"[{f.get('severity') or 'P1'}] {f.get('path') or f.get('file') or '?'}: "
                f"{f.get('message') or f.get('rule') or '阻断'}"
            )
        if line and line not in must_fix:
            must_fix.append(line[:500])
    # 有高危则去掉误入的低危/概览
    high_only = [
        x for x in must_fix
        if any(k in x for k in ("高危", "critical", "high", "P0", "Blocker", "阻断"))
        or x.startswith("[P0]")
        or x.startswith("[high]")
    ]
    if high_only:
        must_fix = high_only
    must_fix = [x for x in must_fix if not _is_overview_noise(x)][:15]
    # 删功能：把「修并发」改成「彻底拆除」
    req_blob = "\n".join(
        [
            str(epic.get("requirement_core") or ""),
            str(epic.get("message") or ""),
            str((epic.get("artifacts") or {}).get("prd", {}).get("goal") or "")
            if isinstance(epic.get("artifacts"), dict)
            else "",
        ]
    )
    must_fix = align_must_fix_for_delete_feature(
        must_fix, requirement=req_blob, report_body=body
    )
    files = ev.get("files") if isinstance(ev.get("files"), list) else []
    reason = str(ev.get("reason") or "")
    if reason == "no_changed_files" and not must_fix:
        must_fix = [
            "必须真实改盘并回传非空 changed_files",
            "禁止空变更后跳过复核继续提交/部署",
            "对照用户需求实现功能并落盘",
        ]
    epic.setdefault("artifacts", {})["review_fail_evidence"] = {
        "round": round_no,
        "summary": str(receipt.get("summary") or ""),
        "reason": reason,
        "report_id": str(ev.get("report_id") or raw.get("report_id") or ""),
        "detail": str(ev.get("detail") or raw.get("detail") or "")[:4000],
        "report_body": body[:8000],
        "must_fix": must_fix,
        "files": files,
        "blocker_count": raw.get("blocker_count") or raw.get("high_count"),
        "gate_findings": (findings or gate_findings)[:30],
    }
    epic.setdefault("artifacts", {})["implement_fix_mandate"] = {
        "round": round_no,
        "max_rounds": max_fix_rounds(),
        "must_fix": must_fix[:15],
        "files": files[:30],
        "source": "review",
    }


def store_commit_gate_fail_epic(epic: dict[str, Any], receipt: dict[str, Any], *, round_no: int) -> None:
    """提交门禁阻断 → 与复核同一套 must_fix，打回写码补救。"""
    ev = receipt.get("evidence") if isinstance(receipt.get("evidence"), dict) else {}
    raw = ev.get("raw") if isinstance(ev.get("raw"), dict) else {}
    findings = ev.get("gate_findings") if isinstance(ev.get("gate_findings"), list) else []
    if not findings:
        gate = raw.get("gate") if isinstance(raw.get("gate"), dict) else {}
        findings = raw.get("findings") or gate.get("findings") or []
    if not isinstance(findings, list):
        findings = []
    must_fix: list[str] = []
    files: list[str] = []
    for f in findings:
        if not isinstance(f, dict):
            continue
        if not (f.get("blocking") or str(f.get("severity") or "").upper() in {"P0", "P1"}):
            continue
        p = str(f.get("path") or "").strip()
        if p and p not in files:
            files.append(p)
        must_fix.append(
            f"[{f.get('severity') or 'P1'}] {p or '?'}: "
            f"{f.get('message') or f.get('rule') or '阻断'}"[:500]
        )
    if not must_fix:
        must_fix.append(str(receipt.get("summary") or ev.get("detail") or "提交门禁阻断，请修复后重试")[:500])
    # 无文件列表时用写码产物
    if not files:
        impl = (epic.get("artifacts") or {}).get("implement") if isinstance(epic.get("artifacts"), dict) else {}
        if isinstance(impl, dict) and isinstance(impl.get("changed_files"), list):
            files = [str(x) for x in impl["changed_files"][:30]]
    epic.setdefault("artifacts", {})["commit_gate_fail_evidence"] = {
        "round": round_no,
        "summary": str(receipt.get("summary") or ""),
        "detail": str(ev.get("detail") or "")[:4000],
        "must_fix": must_fix,
        "files": files,
        "findings": findings[:30],
    }
    # 复用 review_fail 展示字段，写码侧同一套补救文案
    epic.setdefault("artifacts", {})["review_fail_evidence"] = {
        "round": round_no,
        "summary": str(receipt.get("summary") or "提交门禁阻断"),
        "reason": "commit_gate_blockers",
        "must_fix": must_fix,
        "files": files,
        "report_body": "\n".join(must_fix)[:8000],
        "gate_findings": findings[:30],
    }
    epic.setdefault("artifacts", {})["implement_fix_mandate"] = {
        "round": round_no,
        "max_rounds": max_fix_rounds(),
        "must_fix": must_fix[:15],
        "files": files[:30],
        "source": "commit_gate",
    }


def format_upstream_fix_feedback(arts: dict[str, Any]) -> str:
    """写入 Cursor requirement：上游验证/复核失败摘要（精准修复，非重写需求）。"""
    if not isinstance(arts, dict):
        return ""
    # 反馈正文也走洗净后的 must_fix
    try:
        refresh_implement_fix_mandate({"artifacts": arts})
    except Exception:  # noqa: BLE001
        pass
    mandate = arts.get("implement_fix_mandate")
    round_no = int((mandate or {}).get("round") or 0) if isinstance(mandate, dict) else 0
    if not round_no:
        for key in ("review_fail_evidence", "validate_fail_evidence", "scope_fail_evidence"):
            row = arts.get(key)
            if isinstance(row, dict) and row.get("round"):
                round_no = int(row["round"])
                break
    blocks: list[str] = []
    if round_no:
        blocks.append(
            f"【精准修复 · 第 {round_no}/{max_fix_rounds()} 轮】\n"
            "本轮写码只允许修复下列问题；禁止重新实现整个需求、禁止扩 scope、"
            "禁止顺带重构。未列出的文件不要改。"
        )
    vf = arts.get("validate_fail_evidence")
    if isinstance(vf, dict) and (vf.get("summary") or vf.get("evidence")):
        lines = [
            "【须修复 · 机器验证未通过】",
            f"轮次：{vf.get('round') or '—'}",
            str(vf.get("summary") or ""),
        ]
        results = (vf.get("evidence") or {}).get("results") if isinstance(vf.get("evidence"), dict) else []
        if isinstance(results, list):
            for r in results[:8]:
                if isinstance(r, dict) and not r.get("ok"):
                    lines.append(
                        f"- {r.get('name')}: exit {r.get('exit_code')} "
                        f"{(str(r.get('stderr') or '')[:200])}"
                    )
        blocks.append("\n".join(x for x in lines if x))
    sf = arts.get("scope_fail_evidence")
    if isinstance(sf, dict) and (sf.get("detail") or sf.get("violations")):
        lines = [
            "【须修复 · 变更面超出需求范围】",
            str(sf.get("detail") or ""),
            "要求：撤销无关改动；禁止顺带重构 API/http；只保留用户原话范围内的 diff。",
        ]
        vios = sf.get("violations") if isinstance(sf.get("violations"), list) else []
        for v in vios[:6]:
            lines.append(f"- {v}")
        sfiles = sf.get("files") if isinstance(sf.get("files"), list) else []
        if sfiles:
            lines.append("变更文件：" + "、".join(str(x) for x in sfiles[:20]))
        blocks.append("\n".join(x for x in lines if x))
    rf = arts.get("review_fail_evidence")
    if isinstance(rf, dict) and (rf.get("summary") or rf.get("detail") or rf.get("report_body")):
        lines = [
            "【须修复 · 复核未通过（仅本次改动）】",
            f"轮次：{rf.get('round') or '—'}",
            str(rf.get("summary") or ""),
        ]
        must = rf.get("must_fix") if isinstance(rf.get("must_fix"), list) else []
        if must:
            lines.append("【必须逐条修复】")
            for i, item in enumerate(must[:12], 1):
                lines.append(f"{i}. {item}")
        elif rf.get("report_body"):
            lines.append("【审码报告摘录】")
            lines.append(str(rf.get("report_body"))[:4500])
        elif rf.get("detail"):
            lines.append(str(rf.get("detail"))[:3000])
        if rf.get("report_id"):
            lines.append(f"报告 ID：{rf.get('report_id')}")
        files = rf.get("files") if isinstance(rf.get("files"), list) else []
        if files:
            lines.append("优先只改这些文件：" + "、".join(str(x) for x in files[:20]))
        blocks.append("\n".join(x for x in lines if x))
    if not blocks:
        return ""
    return (
        "【闭环 · 打回写码】\n"
        "以下问题须在本轮改盘中逐条修完，修完后自动再跑验证(6)、复核(7)与提交(8)。"
        f"最多 {max_fix_rounds()} 轮，超出则整条 Run 失败。\n\n"
        + "\n\n".join(blocks)
    )


def store_validate_fail_mandate(epic: dict[str, Any], receipt: dict[str, Any], *, round_no: int) -> None:
    store_validate_fail_epic(epic, receipt, round_no=round_no)
    results = (receipt.get("evidence") or {}).get("results") if isinstance(receipt.get("evidence"), dict) else []
    must_fix: list[str] = []
    if isinstance(results, list):
        for r in results:
            if isinstance(r, dict) and not r.get("ok"):
                name = str(r.get("name") or "命令")
                err = str(r.get("stderr") or r.get("stdout") or "")[:300]
                must_fix.append(f"{name} 失败（exit {r.get('exit_code')}）：{err}".strip())
    epic.setdefault("artifacts", {})["implement_fix_mandate"] = {
        "round": round_no,
        "max_rounds": max_fix_rounds(),
        "must_fix": must_fix[:12],
        "source": "validate",
    }


# —— 高危 must_fix 落盘验收（防「写码假成功 → 复核同高危空转」）——

_MUST_FIX_FILE_RE = re.compile(
    r"文件：\s*([A-Za-z0-9_./\\-]+\.(?:py|js|ts|tsx|jsx|vue|go|java))(?::(\d+))?",
)
# 「新增 approval_status 参数」「提供显式参数 include_unapproved=true」
_MUST_FIX_NEW_PARAM_RE = re.compile(
    # 「新增 approval_status 参数」「增加 approval_status 过滤参数」
    r"(?:新增|增加|添加)\s*[「`'\"]?([a-z_][a-z0-9_]{1,48})[」`'\"]?(?:\s*[\u4e00-\u9fff]{0,8})?\s*参数"
    r"|提供显式参数\s*[「`'\"]?([a-z_][a-z0-9_]{1,48})"
    r"|参数\s*[「`'\"]([a-z_][a-z0-9_]{1,48})[」`'\"]",
    re.I,
)


def _safe_ws_rel(rel: str) -> str:
    """规范化工作区相对路径；含 .. / 绝对盘符则返回空（防穿越）。"""
    raw = str(rel or "").replace("\\", "/")
    while raw.startswith("./"):
        raw = raw[2:]
    raw = raw.strip()
    if not raw or raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        return ""
    if ".." in raw.split("/"):
        return ""
    return raw


def extract_must_fix_file(item: str) -> str:
    """从 must_fix 行抽出点名文件（不含行号）。"""
    m = _MUST_FIX_FILE_RE.search(item or "")
    if not m:
        return ""
    return _safe_ws_rel(str(m.group(1) or ""))


def extract_must_fix_new_params(item: str) -> list[str]:
    """从修复建议抽出须作为接口/函数「入参」落地的符号。

    只认「新增 X 参数 / 提供显式参数 X」类可机检口令；
    响应字段赋值（如 approval_status=\"汇总\"）不算入参落地。
    """
    text = str(item or "")
    if "修复：" in text:
        text = text.split("修复：", 1)[1]
    seen: set[str] = set()
    out: list[str] = []
    for m in _MUST_FIX_NEW_PARAM_RE.finditer(text):
        name = next((g for g in m.groups() if g), "") or ""
        name = name.strip().lower()
        if not name or name in seen:
            continue
        # 排除过泛词，避免误抽
        if name in {"true", "false", "none", "null", "query", "path", "body"}:
            continue
        seen.add(name)
        out.append(name)
    return out


def _snake_to_camel(name: str) -> str:
    parts = [p for p in str(name or "").split("_") if p]
    if not parts:
        return ""
    return parts[0].lower() + "".join(p[:1].upper() + p[1:] for p in parts[1:])


def _param_landed_in_py(text: str, name: str) -> bool:
    """后端入参落地：Query(...) 或函数形参注解 name: Type；纯关键字赋值不算。"""
    if not text or not name:
        return False
    esc = re.escape(name)
    if re.search(rf"\b{esc}\s*[:=]\s*[^\n#]*\bQuery\b", text):
        return True
    if re.search(rf"(?m)^\s*{esc}\s*:\s*[A-Za-z_\[|]", text):
        return True
    if re.search(rf"[,(\s]{esc}\s*:\s*[A-Za-z_\[|]", text):
        return True
    return False


def _param_landed_in_frontend(text: str, name: str) -> bool:
    """前端：snake / camel 作为标识符出现即算（queryParams / 请求字段）。"""
    if not text or not name:
        return False
    cands = {name, _snake_to_camel(name)}
    for cand in cands:
        if not cand:
            continue
        if re.search(rf"\b{re.escape(cand)}\b", text):
            return True
    return False


def _read_ws_file(root: Any, rel: str) -> tuple[str | None, str]:
    """读工作区内相对文件；禁止绝对路径与 .. 穿越（must_fix 来自审码文案，不可信）。"""
    from pathlib import Path

    safe = _safe_ws_rel(rel)
    if not safe:
        return None, f"{rel}：路径非法或越界"
    try:
        root_p = Path(root).resolve()
        path = (root_p / safe).resolve()
        path.relative_to(root_p)
    except (OSError, ValueError):
        return None, f"{rel}：路径越界"
    if not path.is_file():
        return None, f"{rel}：点名文件不存在"
    try:
        return path.read_text(encoding="utf-8", errors="replace"), ""
    except OSError as e:
        return None, f"{rel}：无法读取（{e}）"


def audit_must_fix_landed(
    workspace: str,
    must_fix: list[Any] | None,
    hint_files: list[Any] | None = None,
) -> dict[str, Any]:
    """fix 轮写码后：可机检的 must_fix（新增入参类）必须已落盘。

    - 点名 .py：机检 Query / 形参注解
    - 点名 .vue/.ts/…：机检前端标识符；若修复文案含「后端/接口」再对 hint 里的 .py 做入参机检
    - 无可机检口令 → 跳过（不误杀「删硬编码」等）
    """
    from pathlib import Path

    root = Path((workspace or "").strip())
    items = [str(x) for x in (must_fix or []) if str(x).strip()]
    hints = [
        h
        for h in (
            _safe_ws_rel(str(x))
            for x in (hint_files or [])
            if str(x).strip()
        )
        if h
    ]
    if not items or not root.is_dir():
        return {"ok": True, "checked": 0, "violations": [], "detail": ""}

    violations: list[str] = []
    checked = 0
    for item in items[:12]:
        rel = extract_must_fix_file(item)
        symbols = extract_must_fix_new_params(item)
        if not symbols:
            continue
        # 正文里点名的其它 .py（审码常把前端路径写在「文件：」）
        py_in_item = [
            p
            for p in (
                _safe_ws_rel(m.group(1))
                for m in re.finditer(
                    r"([A-Za-z0-9_./\\-]+\.py)", item or "", flags=re.I
                )
            )
            if p
        ]
        is_py = bool(rel) and rel.lower().endswith(".py")
        is_fe = bool(rel) and rel.lower().endswith(
            (".vue", ".ts", ".tsx", ".js", ".jsx")
        )
        wants_backend = any(
            k in (item or "") for k in ("后端", "接口增加", "list/export", "Query")
        ) or is_py

        if is_py:
            checked += 1
            text, err = _read_ws_file(root, rel)
            if err:
                violations.append(f"{err}，无法验收入参 {', '.join(symbols)}")
                continue
            missing = [s for s in symbols if not _param_landed_in_py(text or "", s)]
            if missing:
                violations.append(
                    f"{rel}：仍缺少接口/函数入参 {', '.join(missing)}"
                    f"（响应字段赋值不算；须出现 Query 或形参注解 {missing[0]}: Type）"
                )
            continue

        if is_fe:
            checked += 1
            text, err = _read_ws_file(root, rel)
            if err:
                violations.append(f"{err}，无法验收前端入参 {', '.join(symbols)}")
            else:
                missing_fe = [
                    s
                    for s in symbols
                    if not _param_landed_in_frontend(text or "", s)
                ]
                if missing_fe:
                    violations.append(
                        f"{rel}：仍缺少前端入参/字段 "
                        f"{', '.join(missing_fe)}（如 queryParams.{_snake_to_camel(missing_fe[0])}）"
                    )
            if wants_backend:
                py_targets = list(
                    dict.fromkeys(
                        py_in_item
                        + [h for h in hints if h.lower().endswith(".py")]
                    )
                )
                if py_targets:
                    checked += 1
                    py_ok = False
                    last_miss: list[str] = list(symbols)
                    for pref in py_targets[:6]:
                        ptxt, perr = _read_ws_file(root, pref)
                        if perr or ptxt is None:
                            continue
                        miss = [s for s in symbols if not _param_landed_in_py(ptxt, s)]
                        if not miss:
                            py_ok = True
                            break
                        last_miss = miss
                    if not py_ok:
                        violations.append(
                            f"{py_targets[0]}：后端仍缺少入参 {', '.join(last_miss)}"
                            f"（修复要求后端/接口增加参数；须 Query 或形参注解）"
                        )
            continue

        # 无点名文件但抽到了符号：仅当 hint 有 .py 时做后端机检
        if not rel and wants_backend:
            py_targets = [h for h in hints if h.lower().endswith(".py")][:6]
            if not py_targets:
                continue
            checked += 1
            py_ok = False
            last_miss = list(symbols)
            for pref in py_targets:
                ptxt, perr = _read_ws_file(root, pref)
                if perr or ptxt is None:
                    continue
                miss = [s for s in symbols if not _param_landed_in_py(ptxt, s)]
                if not miss:
                    py_ok = True
                    break
                last_miss = miss
            if not py_ok:
                violations.append(
                    f"{py_targets[0]}：仍缺少接口入参 {', '.join(last_miss)}"
                )

    if not checked:
        return {
            "ok": True,
            "checked": 0,
            "violations": [],
            "detail": "无可机检 must_fix 口令，跳过落盘验收",
        }
    if violations:
        return {
            "ok": False,
            "checked": checked,
            "violations": violations,
            "detail": "；".join(violations)[:400],
        }
    return {
        "ok": True,
        "checked": checked,
        "violations": [],
        "detail": f"已验收 {checked} 条入参落盘",
    }


def format_must_fix_landing_checklist(must_fix: list[Any] | None) -> str:
    """写入任务卡：明确告诉写码 Agent 落盘验收口令（入参，非响应字段）。"""
    lines: list[str] = []
    for item in [str(x) for x in (must_fix or []) if str(x).strip()][:8]:
        rel = extract_must_fix_file(item)
        symbols = extract_must_fix_new_params(item)
        if not rel or not symbols:
            continue
        lines.append(f"- {rel} 必须出现形参/Query：{', '.join(symbols)}（仅写响应字段赋值 = 本步失败）")
    if not lines:
        return ""
    return "【落盘验收口令 · 写码门禁会机检】\n" + "\n".join(lines)
