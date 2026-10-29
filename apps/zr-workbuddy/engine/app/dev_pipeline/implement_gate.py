"""写码步骤健全机制（步骤 5 唯一验收口径）。

分层：
1. 预检 preflight —— sidecar / Key / workspace，基建问题先挡在 Job 外
2. 任务卡 brief —— 短、可执行；验收用语义匹配，不钉死某一四字文案
3. 结果分级 judge —— pass / retry_infra / retry_delivery / fail_hard
   - content_gap ≠ scope_creep（前者补字段，后者缩变更面）
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .requirement_scope import (
    audit_implement_content,
    audit_implement_scope,
    scope_contract_for_implement,
)

# Job / 轮询侧可立即自愈重跑（不计入「需求写错」）
INFRA_RETRY_REASONS = frozenset(
    {
        "plugin_down",
        "plugin_network",
        "job_lost_after_sidecar_heal",
        "pending_fail",
        "timeout",
    }
)

# 交付未达标 → 打回写码闭环（计入 fix_round）
DELIVERY_RETRY_REASONS = frozenset(
    {
        "no_changed_files",
        "db_sync_blocked",
        "scope_creep",
        "content_gap",
        "wrong_page",
        "must_fix_unaddressed",
    }
)

HARD_FAIL_REASONS = frozenset(
    {
        "cancelled",
        "no_workspace",
        "no_requirement",
        "cursor_key_required",
        "hitl_fail",
        "confirm_fail",
        "no_job_id",
    }
)


def extract_change_intent(text: str) -> str:
    """从锚定 PRD 抽出【改动】叶句；无则取可实施短摘要。"""
    t = (text or "").strip()
    if not t:
        return ""
    if "【改动】" in t:
        m = re.search(r"【改动】([^\n【]+)", t)
        if m:
            leaf = m.group(1).strip()
            leaf = re.split(r"[。；;]须改|禁止改其它", leaf, maxsplit=1)[0].strip("。；; ")
            if leaf:
                return leaf[:240]
    from .intake_normalize import to_one_liner

    return to_one_liner(t, max_len=200) or t[:200]


def _project_profile_bits(workspace: str) -> tuple[str, list[str], str]:
    """当前工作区画像。扫描失败时退回空，不挡住写码。目录全文另附在任务末尾。"""
    ws = (workspace or "").strip()
    if not ws:
        return "", [], ""
    try:
        from ..project_profile import ensure, format_directory_block, format_for_agent

        got = ensure(ws)
    except Exception:  # noqa: BLE001
        return "", [], ""
    profile = got.get("profile") if isinstance(got, dict) else None
    if not isinstance(profile, dict):
        return "", [], ""
    layout = profile.get("layout") if isinstance(profile.get("layout"), dict) else {}
    views = [str(x) for x in (layout.get("view_dirs") or []) if str(x).strip()]
    return format_for_agent(profile), views[:4], format_directory_block(profile)


def _scope_from_epic(epic: dict[str, Any]) -> dict[str, Any]:
    arts = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
    prd = arts.get("prd") if isinstance(arts.get("prd"), dict) else {}
    plan = arts.get("plan") if isinstance(arts.get("plan"), dict) else {}
    plan_scope = plan.get("scope") if isinstance(plan.get("scope"), dict) else {}
    prd_scope = prd.get("scope") if isinstance(prd.get("scope"), dict) else {}
    return plan_scope if plan_scope else prd_scope


def build_stable_implement_requirement(*, message: str, epic: dict[str, Any], workspace: str = "") -> str:
    """精简写码任务卡：改动意图置顶，长 PRD 压到后段，避免插件淹没。

    打回写码（有 implement_fix_mandate.round≥1）时：任务卡主目标改为「精准修复」，
    原需求降为背景，避免与 must_fix（如禁硬编码）互相打架。
    """
    from .delivery_scope import delivery_guidance_for_implement, infer_dev_scenario
    from .fix_loop import format_upstream_fix_feedback, refresh_implement_fix_mandate
    from .vision_surface import format_vision_surface_for_implement

    arts = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
    # 读时洗净脏 must_fix（旧进程写的「共 N 处」概览），再拼任务卡
    refresh_implement_fix_mandate(epic)
    arts = epic.get("artifacts") if isinstance(epic.get("artifacts"), dict) else {}
    prd = arts.get("prd") if isinstance(arts.get("prd"), dict) else {}
    plan = arts.get("plan") if isinstance(arts.get("plan"), dict) else {}
    scope = _scope_from_epic(epic)
    msg = (message or "").strip()
    intent = extract_change_intent(
        str(prd.get("goal") or epic.get("requirement_core") or msg)
    ) or extract_change_intent(msg)

    mandate = arts.get("implement_fix_mandate") if isinstance(arts.get("implement_fix_mandate"), dict) else {}
    fix_round = int(mandate.get("round") or 0)
    must_fix_items = [str(x) for x in (mandate.get("must_fix") or []) if str(x).strip()]
    if not must_fix_items:
        rf = arts.get("review_fail_evidence") if isinstance(arts.get("review_fail_evidence"), dict) else {}
        must_fix_items = [str(x) for x in (rf.get("must_fix") or []) if str(x).strip()]
    is_fix_round = fix_round >= 1 and bool(must_fix_items)
    _profile_block, _profile_view_dirs, _profile_directory = _project_profile_bits(workspace)
    _contract_block = ""
    try:
        from ..config_store import load_config
        from ..data_contract import format_for_coding, summarize_data_contract

        _cfg = load_config()
        if is_fix_round:
            # 打回轮次只留状态一行，避免挤掉【必须逐条修复】
            sl = str(summarize_data_contract(_cfg).get("status_line") or "").strip()
            if sl.startswith("已接入"):
                _contract_block = "【数据契约】" + sl[:200]
        else:
            _contract_block = format_for_coding(_cfg) or ""
    except Exception:
        _contract_block = ""
    _notes_block = ""
    if not is_fix_round and (workspace or "").strip():
        try:
            from ..project_notes import format_for_coding as format_project_notes

            _notes_block = format_project_notes(workspace) or ""
        except Exception:
            _notes_block = ""

    must = [str(x) for x in (scope.get("must_include_paths") or []) if str(x).strip()][:8]
    forbid = [str(x) for x in (scope.get("forbid_paths") or []) if str(x).strip()][:6]
    # 打回时优先 mandate.files（审码点名文件）
    if is_fix_round:
        mfiles = [str(x) for x in (mandate.get("files") or []) if str(x).strip()]
        if mfiles:
            must = mfiles[:8]
    page = str(scope.get("page_title") or "").strip()
    target_menu = str(scope.get("target_menu") or "").strip()
    if not target_menu:
        from .requirement_scope import extract_menu_anchor

        target_menu = extract_menu_anchor(
            "\n".join(
                [
                    msg,
                    str(prd.get("goal") or ""),
                    str(epic.get("requirement_core") or ""),
                    intent or "",
                ]
            )
        )

    if is_fix_round:
        from .fix_loop import format_must_fix_landing_checklist

        card_lines = [
            "【写码任务卡 · 精准修复 · 本步唯一交付目标】",
            f"- 改动：逐条修复复核/验证指出的问题（第 {fix_round} 轮），禁止重做整需求",
        ]
        for i, item in enumerate(must_fix_items[:8], 1):
            card_lines.append(f"  {i}. {item[:400]}")
        landing = format_must_fix_landing_checklist(must_fix_items)
        if landing:
            card_lines.append(landing)
        if fix_round >= 2:
            card_lines.append(
                "- ⚠ 上轮写码未消高危：本轮禁止只改测试/文案；必须按「修复：」改点名文件的"
                "函数签名与过滤逻辑，门禁会机检入参是否落盘"
            )
        card_lines.extend(
            [
                "- 冲突裁决：若下方背景需求与「必须逐条修复」矛盾（例如背景要接口硬编码插行、"
                "修复要求删硬编码改走入库/seed），以【必须逐条修复】为准",
                "- 禁止：为满足背景需求再次写入硬编码演示数据 / 假插行",
                "- 验收：高危项全部消除；只改点名文件；必须非空源码 changed_files；禁止碰 *.db",
            ]
        )
        if must:
            card_lines.append("- 优先只改：" + "、".join(must))
        if intent:
            card_lines.append(f"- 背景需求（仅供理解上下文，非本步主目标）：{intent[:200]}")
    else:
        card_lines = [
            "【写码任务卡 · 本步唯一交付目标】",
            f"- 改动：{intent or '（见下方用户需求）'}",
        ]
        if target_menu:
            card_lines.append(
                f"- 菜单：必须挂「{target_menu}」（改挂到用户未指定的其它侧栏 = 失败）"
            )
            if _profile_view_dirs:
                card_lines.append(
                    "- 目录：新页面放在当前工作区页面目录「"
                    + "、".join(_profile_view_dirs[:3])
                    + "」中与现有页面同一层；禁止套用其它仓库的 views 路径"
                )
            else:
                card_lines.append(
                    "- 目录：按项目画像页面目录落文件；画像无目录时先向用户确认路径，"
                    "禁止默认套用 views/production 或 views/warehouse"
                )
        if page:
            card_lines.append(f"- 页面：{page}（改错页 = 失败）")
        if must:
            card_lines.append("- 必须改：" + "、".join(must))
        if forbid:
            card_lines.append("- 禁止改：" + "、".join(forbid))
        card_lines.extend(
            [
                "- 验收（以用户意图与图上批注为准，禁止擅自换成其它列/字段）：",
                "  · 用户写明要加的列名/字段名必须原样落地到本页表格（及对应列表接口）",
                "  · 插入位置按红框/标注；不要猜用户没写的列",
                "  · 侧栏菜单必须与用户指定一致，禁止曲解到其它模块",
                "  · 必须产生非空源码 changed_files；禁止碰 *.db / erp.db",
                "- 只做任务卡与用户需求；禁止顺手加无关列/重构/改其它列表页",
            ]
        )

    parts: list[str] = ["\n".join(card_lines)]
    if _profile_block:
        parts.append(_profile_block)
    if _contract_block:
        parts.append(_contract_block)
    if _notes_block:
        parts.append(_notes_block)

    fix_fb = format_upstream_fix_feedback(arts)
    if fix_fb:
        parts.insert(0, fix_fb[:6000])

    parts.append(scope_contract_for_implement(scope))

    scenario = prd.get("scenario") if isinstance(prd.get("scenario"), dict) else None
    if not scenario and isinstance(plan.get("scenario"), dict):
        scenario = plan.get("scenario")
    if not scenario:
        scenario = infer_dev_scenario(msg or intent)
    guide = delivery_guidance_for_implement(scenario)
    # 打回轮次：不再塞「现页增强/加列」交付提示，避免与删硬编码打架
    if not is_fix_round:
        if intent and any(k in intent for k in ("增加", "新增", "加列", "红框", "批注", "字段")):
            parts.append(
                "【交付提示】这是现有页面增强：只改本页表格列 + 对应列表接口字段；"
                "列名严格按用户意图/图上批注；不要新建菜单/路由/整页，不要改其它业务列表页。"
            )
        elif guide:
            parts.append(guide[:1200])

    raw_in = arts.get("raw_intake") if isinstance(arts.get("raw_intake"), dict) else {}
    surf_block = format_vision_surface_for_implement(
        raw_in.get("vision_surface") if isinstance(raw_in.get("vision_surface"), dict) else None
    )
    if surf_block and not is_fix_round:
        parts.append(surf_block[:1500])

    if is_fix_round:
        if msg:
            parts.append("【背景需求 · 非本步主目标】\n" + msg[:2000])
    else:
        if msg:
            parts.append("【用户需求 · 真相源】\n" + msg[:3500])
        goal = str(prd.get("goal_one_liner") or "").strip()
        if goal and goal not in msg and goal != intent:
            parts.append("【目标摘要】\n" + goal[:400])

    text = "\n\n".join(p for p in parts if p and str(p).strip()).strip()
    text = text[:10000] or msg or "按计划实现需求"
    directory = str(_profile_directory or "").strip()
    if directory and "【工作区目录画像】" not in text:
        text = text + "\n\n" + directory
    return text


def preflight_implement(*, workspace: str, base: str = "") -> dict[str, Any]:
    """写码前预检：不过则不要开 Job。"""
    from . import cursor_coding_client as cc
    from .implement import _ensure_cursor_sidecar

    ws = (workspace or "").strip()
    notes: list[str] = []
    if not ws:
        return {"ok": False, "reason": "no_workspace", "detail": "workspace 为空"}
    root = Path(ws)
    if not root.is_dir():
        return {
            "ok": False,
            "reason": "no_workspace",
            "detail": f"工程目录不存在：{ws}",
        }

    b, remap = cc.normalize_chat_base(base or cc.DEFAULT_BASE)
    if remap:
        notes.append(remap)
    ens = _ensure_cursor_sidecar(b)
    if ens.get("fixed"):
        notes.append(f"已自愈 sidecar：{ens.get('detail') or b}")
    ready = cc.probe(b)
    if not ready.get("ok"):
        ens2 = _ensure_cursor_sidecar(b)
        ready = cc.probe(b)
        if not ready.get("ok"):
            detail = str(ready.get("detail") or "写码插件未就绪")
            if ens2.get("detail"):
                detail = f"{detail}；{ens2.get('detail')}"
            return {
                "ok": False,
                "reason": "plugin_down",
                "detail": detail,
                "can_retry": True,
                "notes": notes,
            }
    if not ready.get("cursor_key_configured"):
        return {
            "ok": False,
            "reason": "cursor_key_required",
            "detail": "Cursor API Key 未配置",
            "notes": notes,
        }
    return {
        "ok": True,
        "reason": "ready",
        "detail": "预检通过",
        "base": b,
        "notes": notes,
        "probe": {k: ready.get(k) for k in ("ok", "cursor_key_configured", "detail")},
    }


def recover_changed_files_from_disk(
    *,
    workspace: str,
    scope: dict[str, Any] | None,
    reported: list[str] | None = None,
) -> list[str]:
    """插件漏报 changed_files 时，用锚定 must 路径在磁盘上举证。"""
    root = Path(workspace or "")
    if not root.is_dir():
        return []
    sc = scope if isinstance(scope, dict) else {}
    must = [str(x).replace("\\", "/") for x in (sc.get("must_include_paths") or []) if str(x).strip()]
    out: list[str] = []
    seen: set[str] = set()
    for rel in list(reported or []) + must:
        r = str(rel or "").replace("\\", "/").strip().lstrip("./")
        if not r or r in seen:
            continue
        if (root / r).is_file():
            seen.add(r)
            out.append(r)
    return out[:30]


def judge_implement_result(
    *,
    job_out: dict[str, Any],
    scope: dict[str, Any] | None,
    workspace: str,
    fix_mandate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Job 返回后的唯一判定。

    返回：
      ok, class(pass|retry_infra|retry_delivery|fail_hard),
      reason, summary, violations, mandate_items, changed_files, evidence
    """
    out = job_out if isinstance(job_out, dict) else {}
    sc = scope if isinstance(scope, dict) else {}
    ws = (workspace or "").strip()
    mandate = fix_mandate if isinstance(fix_mandate, dict) else {}

    if out.get("ok"):
        files = out.get("changed_files") if isinstance(out.get("changed_files"), list) else []
        files = [str(x).replace("\\", "/") for x in files if str(x).strip()]
        if not files:
            # 漏报：锚定文件已在盘且内容过关 → 回收为成功
            recovered = recover_changed_files_from_disk(workspace=ws, scope=sc, reported=[])
            content = audit_implement_content(recovered, sc, workspace=ws)
            if recovered and content.get("ok"):
                files = recovered
            else:
                return {
                    "ok": False,
                    "class": "retry_delivery",
                    "reason": "no_changed_files",
                    "summary": "写码未产生任何变更文件（空变更硬门禁）",
                    "violations": ["changed_files 为空"],
                    "mandate_items": [
                        "必须真实改盘并回传非空 changed_files",
                        "对照【写码任务卡】改 must 文件；禁止只回复不落盘",
                    ],
                    "changed_files": [],
                    "evidence": {"job_id": out.get("job_id"), "content_audit": content},
                }

        scope_audit = audit_implement_scope(files, sc)
        content_audit = audit_implement_content(files, sc, workspace=ws)

        # 禁止路径命中 → wrong_page（比笼统 scope_creep 更可修）
        vios = list(scope_audit.get("violations") or [])
        wrong = [v for v in vios if "误改禁止" in v or "锚定" in v and "勿改" in v]
        creep = [v for v in vios if v not in wrong]

        if wrong:
            return {
                "ok": False,
                "class": "retry_delivery",
                "reason": "wrong_page",
                "summary": "写码改错页面：" + "；".join(wrong)[:200],
                "violations": wrong,
                "mandate_items": wrong
                + [
                    "撤销禁止路径上的改动",
                    "只改【写码任务卡】必须改文件",
                ],
                "changed_files": files,
                "evidence": {
                    "job_id": out.get("job_id"),
                    "scope_audit": scope_audit,
                    "content_audit": content_audit,
                },
            }

        if not content_audit.get("ok"):
            cv = list(content_audit.get("violations") or [])
            return {
                "ok": False,
                "class": "retry_delivery",
                "reason": "content_gap",
                "summary": "写码交付内容未达标：" + (content_audit.get("detail") or "；".join(cv))[:220],
                "violations": cv,
                "mandate_items": cv
                + [
                    "按用户意图补齐列/字段文案（勿擅自换成需求未写的列）",
                    "不要扩大改动面，不要改其它业务列表页",
                ],
                "changed_files": files,
                "evidence": {
                    "job_id": out.get("job_id"),
                    "scope_audit": scope_audit,
                    "content_audit": content_audit,
                },
            }

        if creep or not scope_audit.get("ok"):
            return {
                "ok": False,
                "class": "retry_delivery",
                "reason": "scope_creep",
                "summary": "写码变更面超出需求范围：" + str(scope_audit.get("detail") or "")[:200],
                "violations": creep or list(scope_audit.get("violations") or []),
                "mandate_items": list(scope_audit.get("violations") or [])
                or ["缩小变更面，仅保留需求相关 diff"],
                "changed_files": files,
                "evidence": {
                    "job_id": out.get("job_id"),
                    "scope_audit": scope_audit,
                    "content_audit": content_audit,
                },
            }

        # 打回写码轮次：机检高危 must_fix 入参是否真落盘（防假成功空转复核）
        must_items = [str(x) for x in (mandate.get("must_fix") or []) if str(x).strip()]
        if int(mandate.get("round") or 0) >= 1 and must_items:
            from .fix_loop import audit_must_fix_landed

            landed = audit_must_fix_landed(
                ws,
                must_items,
                hint_files=mandate.get("files")
                if isinstance(mandate.get("files"), list)
                else None,
            )
            if not landed.get("ok"):
                lv = list(landed.get("violations") or [])
                keep_files = [
                    str(x).replace("\\", "/")
                    for x in (mandate.get("files") or [])
                    if str(x).strip()
                ][:30] or files
                return {
                    "ok": False,
                    "class": "retry_delivery",
                    "reason": "must_fix_unaddressed",
                    "summary": "高危修复未落盘：" + str(landed.get("detail") or "；".join(lv))[:220],
                    "violations": lv,
                    "mandate_items": lv
                    + [
                        "须在点名文件的函数签名/Query 增加修复建议中的入参；"
                        "响应模型字段赋值不算完成",
                    ]
                    + must_items[:8],
                    "changed_files": keep_files,
                    "evidence": {
                        "job_id": out.get("job_id"),
                        "scope_audit": scope_audit,
                        "content_audit": content_audit,
                        "must_fix_audit": landed,
                    },
                }

        return {
            "ok": True,
            "class": "pass",
            "reason": "pass",
            "summary": str(out.get("summary") or f"写码完成（变更 {len(files)} 项）"),
            "violations": [],
            "mandate_items": [],
            "changed_files": files,
            "evidence": {
                "job_id": out.get("job_id"),
                "scope_audit": scope_audit,
                "content_audit": content_audit,
            },
        }

    # Job 失败路径
    reason = str(out.get("reason") or "implement_fail")
    detail = str(out.get("detail") or out.get("summary") or reason)
    if reason in HARD_FAIL_REASONS or reason.startswith("job_cancel"):
        return {
            "ok": False,
            "class": "fail_hard",
            "reason": reason if reason in HARD_FAIL_REASONS else "cancelled",
            "summary": detail[:300],
            "violations": [detail[:200]],
            "mandate_items": [],
            "changed_files": out.get("changed_files")
            if isinstance(out.get("changed_files"), list)
            else [],
            "evidence": {"job_id": out.get("job_id"), "raw_reason": reason},
        }
    if reason in INFRA_RETRY_REASONS:
        return {
            "ok": False,
            "class": "retry_infra",
            "reason": reason,
            "summary": detail[:300],
            "violations": [detail[:200]],
            "mandate_items": [],
            "changed_files": [],
            "evidence": {"job_id": out.get("job_id")},
            "can_retry": True,
        }
    if reason in DELIVERY_RETRY_REASONS:
        mandate = []
        if reason == "no_changed_files":
            mandate = [
                "必须真实改盘并产生非空 changed_files",
                "禁止只回复说明而不落文件",
            ]
        elif reason == "db_sync_blocked":
            mandate = [
                "禁止创建/同步 *.db / erp.db",
                "只改业务源码后重试",
            ]
        return {
            "ok": False,
            "class": "retry_delivery",
            "reason": reason,
            "summary": detail[:300],
            "violations": [detail[:200]],
            "mandate_items": mandate,
            "changed_files": out.get("changed_files")
            if isinstance(out.get("changed_files"), list)
            else [],
            "evidence": {"job_id": out.get("job_id")},
            "can_retry": True,
        }

    # 未知失败：按交付重试，避免静默变硬失败
    return {
        "ok": False,
        "class": "retry_delivery",
        "reason": reason or "implement_fail",
        "summary": detail[:300],
        "violations": [detail[:200]],
        "mandate_items": [detail[:300]],
        "changed_files": out.get("changed_files")
        if isinstance(out.get("changed_files"), list)
        else [],
        "evidence": {"job_id": out.get("job_id")},
        "can_retry": True,
    }


def store_delivery_fail_mandate(
    epic: dict[str, Any],
    verdict: dict[str, Any],
    *,
    round_no: int = 0,
) -> None:
    """按分级写入精准修复清单（content_gap / wrong_page / scope_creep…）。"""
    from .fix_loop import max_fix_rounds

    reason = str(verdict.get("reason") or "")
    items = [str(x) for x in (verdict.get("mandate_items") or []) if str(x).strip()][:12]
    files = verdict.get("changed_files") if isinstance(verdict.get("changed_files"), list) else []
    arts = epic.setdefault("artifacts", {})
    arts["implement_fix_mandate"] = {
        "round": round_no,
        "max_rounds": max_fix_rounds(),
        "must_fix": items or [str(verdict.get("summary") or "按任务卡补齐交付")],
        "files": list(files)[:30],
        "source": reason or "delivery",
    }
    arts["implement_gate_verdict"] = {
        "class": verdict.get("class"),
        "reason": reason,
        "summary": verdict.get("summary"),
        "violations": verdict.get("violations") or [],
    }
    if reason in ("scope_creep", "wrong_page", "content_gap", "must_fix_unaddressed"):
        arts["scope_fail_evidence"] = {
            "detail": str(verdict.get("summary") or ""),
            "violations": verdict.get("violations") or [],
            "file_count": len(files),
            "files": list(files)[:40],
            "gate_reason": reason,
        }
