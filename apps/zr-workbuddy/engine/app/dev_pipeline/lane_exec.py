"""步骤 7～10：真实调用审码 / 提交 / 开 PR / 部署（不作假交接）。"""
from __future__ import annotations

import asyncio
import concurrent.futures
import os
import subprocess
import time
from typing import Any, Callable

LogFn = Callable[[str], None]


def _review_short_summary(raw: dict[str, Any]) -> str:
    """流水线摘要：优先高/中/低危三行（图二），勿把 Viprasol 技术摘要顶到红框。"""
    findings = raw.get("findings") if isinstance(raw.get("findings"), list) else []
    if findings:
        try:
            from ..code_review.findings import format_risk_overview_from_findings

            risk = format_risk_overview_from_findings(findings).strip()
            if risk:
                return risk[:800]
        except Exception:  # noqa: BLE001
            pass
    short = str(raw.get("summary") or "").strip()
    if short and ("高危问题" in short or "🔴" in short):
        return short[:800]
    reply = str(raw.get("reply") or "").strip()
    if reply:
        marker = "一、总体评价"
        pos = reply.find(marker)
        if pos >= 0:
            tail = reply[pos + len(marker) :].lstrip("\n")
            lines: list[str] = []
            for ln in tail.splitlines():
                s = ln.strip()
                if not s:
                    if lines:
                        break
                    continue
                if s.startswith("---") or s.startswith("二、"):
                    break
                # 跳过 Viprasol 技术元信息行
                if s.startswith("已按") or s.startswith("> 审码元信息"):
                    continue
                lines.append(s)
            if lines:
                return "\n".join(lines)[:800]
    if short and "代码审核汇总报告" not in short[:80] and "已按" not in short[:20]:
        return short[:800]
    return short[:800] if short else ""


def _log(log: LogFn | None, msg: str) -> None:
    if log:
        log(msg)


def run_review(
    *,
    workspace: str,
    message: str = "",
    files: list[str] | None = None,
    log: LogFn | None = None,
) -> dict[str, Any]:
    """一体化第 7 步：只审 ``files``（本次改动）。

    - 空列表 / 未传：**硬失败停机**，绝不跳过当 pass，也绝不退回全仓抽样。
    - 聊天审码卡仍走 ``confirm_and_run(..., files=None)``，全量逻辑在那条分支，本函数不碰。
    """
    from ..code_review.chat_bridge import confirm_and_run

    ws = (workspace or "").strip()
    if not ws:
        return {"ok": False, "detail": "workspace 为空，无法审码"}
    focus = (message or "").strip()[:2000]
    explicit = _normalize_review_files(files)
    if not explicit:
        _log(log, "本次无可用改动文件，停止流程（不跑全仓、不跳过当成功）")
        return {
            "ok": False,
            "skipped": False,
            "summary": "无可用改动文件，复核硬门禁失败，已停止后续提交/开PR/部署",
            "detail": (
                "写码步骤未产出可审 changed_files。"
                "企业流水线禁止「空变更跳过复核」后继续提交或部署。"
            ),
            "reason": "no_changed_files",
            "files": [],
            "changed_only": True,
        }
    _log(log, f"开始真实审码（仅本次改动 {len(explicit)} 个）：{ws}")
    _log(log, "文件：" + "、".join(explicit[:20]) + ("…" if len(explicit) > 20 else ""))
    scope_note = f"【范围】仅审核本次改动文件（共 {len(explicit)} 个）"
    focus = f"{scope_note}\n{focus}".strip() if focus else scope_note

    async def _go():
        return await confirm_and_run(
            local_path=ws,
            scope="",
            focus=focus,
            files=explicit,
        )

    try:
        out = asyncio.run(_go())
    except Exception as e:
        return {"ok": False, "detail": f"审码执行失败：{e}", "files": explicit}
    if not out.get("ok"):
        return {
            "ok": False,
            "detail": str(out.get("detail") or out.get("reply") or "审码失败"),
            "raw": out,
            "files": explicit,
        }
    report_id = str(out.get("report_id") or "").strip()
    blockers = out.get("blocker_count")
    high_n = out.get("high_count")
    if not isinstance(high_n, int):
        high_n = blockers if isinstance(blockers, int) else 0
    short = _review_short_summary(out)
    report_body = str(out.get("reply") or "").strip()
    # 有高危（P0）即阻断：审核不通过，打回写码
    if (isinstance(high_n, int) and high_n > 0) or (
        isinstance(blockers, int) and blockers > 0
    ):
        n = int(high_n or blockers or 0)
        return {
            "ok": False,
            "detail": f"审码存在 {n} 处高危问题，审核不通过",
            "report_id": report_id,
            "summary": short
            or report_body[:400]
            or f"审码存在 {n} 处高危问题，审核不通过",
            "report_body": report_body,
            "raw": out,
            "reason": "review_blockers",
            "files": explicit,
            "changed_only": True,
            "high_count": n,
        }
    if "❌ 审核不通过" in report_body or "存在高危问题" in report_body[:800]:
        return {
            "ok": False,
            "detail": str(out.get("detail") or "审码存在高危问题，审核不通过"),
            "report_id": report_id,
            "summary": short or "存在高危问题，审核不通过",
            "report_body": report_body,
            "raw": out,
            "reason": "review_blockers",
            "files": explicit,
            "changed_only": True,
        }

    # 与步骤 8 同一套提交门禁：复核阶段先拦住，避免「复核绿、提交红」
    gate_out = _run_commit_gate_on_files(ws, explicit, log=log)
    if not gate_out.get("can_commit"):
        findings = gate_out.get("findings") or []
        blocking = [
            f
            for f in findings
            if isinstance(f, dict)
            and (f.get("blocking") or str(f.get("severity") or "").upper() in {"P0", "P1"})
        ]
        lines = [
            str(gate_out.get("summary") or "提交门禁未通过"),
            "",
            "【与提交步骤同一标准 · 须在写码阶段修完】",
        ]
        for f in blocking[:12]:
            lines.append(
                f"- [{f.get('severity') or 'P1'}] {f.get('path')}: {f.get('message') or f.get('rule')}"
            )
        body = "\n".join(lines)
        return {
            "ok": False,
            "detail": str(gate_out.get("summary") or "提交门禁阻断"),
            "report_id": report_id,
            "summary": str(gate_out.get("summary") or "复核未过：提交门禁阻断"),
            "report_body": (report_body + "\n\n" + body).strip() if report_body else body,
            "raw": {**(out if isinstance(out, dict) else {}), "gate": gate_out, "findings": findings},
            "reason": "commit_gate_blockers",
            "files": explicit,
            "gate_findings": findings,
            "changed_only": True,
        }

    return {
        "ok": True,
        "report_id": report_id,
        "summary": short
        or f"审码完成（report={report_id or '-'}，本批次 {len(explicit)} 个改动文件；提交门禁已对齐通过）",
        "report_body": report_body,
        "raw": out,
        "files": explicit,
        "changed_only": True,
        "gate": gate_out,
    }


def _run_commit_gate_on_files(
    workspace: str,
    files: list[str],
    *,
    log: LogFn | None = None,
) -> dict[str, Any]:
    """对变更文件跑与提交相同的 run_commit_review_gate（不落 Job）。"""
    from ..code_commit.config import get_config as get_cc_config
    from ..code_commit.gate import run_commit_review_gate

    ws = (workspace or "").strip()
    paths = [str(x) for x in (files or []) if str(x).strip()]
    if not ws or not paths:
        return {"can_commit": True, "summary": "无文件，跳过门禁对齐", "findings": []}
    _log(log, f"复核对齐提交门禁（{len(paths)} 个文件）…")
    cfg = get_cc_config()
    gate = run_commit_review_gate(
        ws,
        paths,
        allow_blocked_override=bool(getattr(cfg, "allow_blocked", False)),
        use_skill_review=bool(getattr(cfg, "use_skill_review", True)),
    )
    _log(log, str(gate.get("summary") or ("门禁通过" if gate.get("can_commit") else "门禁阻断")))
    return gate if isinstance(gate, dict) else {"can_commit": False, "summary": "门禁异常", "findings": []}


def _normalize_review_files(files: list[str] | None) -> list[str]:
    """去重、规范化相对路径；保持顺序。禁止绝对路径与 .. 穿越。"""
    out: list[str] = []
    seen: set[str] = set()
    for raw in files or []:
        rel = str(raw or "").strip().replace("\\", "/")
        while rel.startswith("./"):
            rel = rel[2:]
        if not rel or rel.startswith("/") or ".." in rel.split("/"):
            continue
        if rel in seen:
            continue
        seen.add(rel)
        out.append(rel)
    return out


def collect_pipeline_changed_files(epic: dict[str, Any] | None) -> list[str]:
    """从 Epic 写码产物取本次变更列表（一体化专用）。"""
    arts = (epic or {}).get("artifacts") if isinstance((epic or {}).get("artifacts"), dict) else {}
    impl = arts.get("implement") if isinstance(arts.get("implement"), dict) else {}
    raw = impl.get("changed_files") or []
    if not isinstance(raw, list):
        return []
    return _normalize_review_files([str(x) for x in raw])


def _gate_blocking_findings(gate: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(gate, dict):
        return []
    out: list[dict[str, Any]] = []
    for f in gate.get("findings") or []:
        if not isinstance(f, dict):
            continue
        if f.get("blocking") or str(f.get("severity") or "").upper() in {"P0", "P1"}:
            out.append(f)
    return out


def _detail_looks_like_gate_block(detail: str) -> bool:
    d = detail or ""
    return ("阻断" in d) or ("禁止提交" in d) or ("门禁未通过" in d)


def _commit_gate_block_result(
    *,
    gate: dict[str, Any],
    detail: str,
    attempt: int,
    job_id: str = "",
) -> dict[str, Any]:
    findings = _gate_blocking_findings(gate)
    return {
        "ok": False,
        "skipped": False,
        "can_manual_retry": True,
        "summary": (
            f"提交门禁阻断（{len(findings)} 条），已触发写码补救闭环，"
            f"将重跑验证/复核/提交。原因：{detail}"
        )[:400],
        "detail": detail,
        "job_id": job_id or str(gate.get("job_id") or ""),
        "raw": gate,
        "gate_findings": findings or list(gate.get("findings") or []),
        "reason": "commit_gate_blockers",
        "attempts": attempt,
    }


def _commit_timeout_soft_skip(*, timeout_sec: int, log: LogFn | None = None) -> dict[str, Any]:
    summary = (
        f"提交超过 {timeout_sec} 秒未完成，已跳过本步以便继续开 PR/部署；"
        "可稍后在聊天用「提交代码」手动再提。"
    )
    _log(log, summary)
    return {
        "ok": True,
        "skipped": True,
        "can_manual_retry": True,
        "reason": "commit_timeout_soft_skip",
        "summary": summary[:400],
        "detail": summary,
        "job_id": "",
        "attempts": 0,
    }


def run_commit(
    *,
    workspace: str,
    message: str = "",
    log: LogFn | None = None,
    max_attempts: int = 3,
    timeout_sec: int | None = None,
) -> dict[str, Any]:
    """一体化第 8 步：门禁 → commit/push。

    - 提交说明自动压到 ≤200 字（避免「说明过长」卡死）。
    - **墙钟超时（默认 60s）**：软跳过本步（ok+skipped），流水线继续 9/10；可稍后手动提交。
    - **门禁 P0/P1 阻断：立即失败**（``commit_gate_blockers``），由 runner 打回写码补救。
    - 仅「说明过长」等可恢复错误才自动重试；无变更跳过仍算合法通过。
    """
    from .config import get_config

    if timeout_sec is not None:
        # 显式传入可短于默认（便于单测）；配置默认仍 ≥15s
        limit = max(1, min(180, int(timeout_sec)))
    else:
        limit = max(15, min(180, int(get_config().get("commit_timeout_sec") or 60)))
    _log(log, f"提交墙钟上限 {limit}s（超时将软跳过并继续下一步）")

    def _work() -> dict[str, Any]:
        return _run_commit_body(
            workspace=workspace,
            message=message,
            log=log,
            max_attempts=max_attempts,
            deadline=time.time() + limit,
            timeout_sec=limit,
        )

    # 墙钟：门禁审码偶发 >2 分钟，禁止拖死整条 Run；超时立即返回，不等待后台线程收尾
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    try:
        fut = pool.submit(_work)
        try:
            return fut.result(timeout=float(limit) + 0.5)
        except concurrent.futures.TimeoutError:
            return _commit_timeout_soft_skip(timeout_sec=limit, log=log)
    finally:
        try:
            pool.shutdown(wait=False, cancel_futures=True)
        except TypeError:
            pool.shutdown(wait=False)


def _run_commit_body(
    *,
    workspace: str,
    message: str,
    log: LogFn | None,
    max_attempts: int,
    deadline: float,
    timeout_sec: int,
) -> dict[str, Any]:
    from ..code_commit.git_ops import is_push_retry_needed
    from ..code_commit.ops import confirm, start_gate

    ws = (workspace or "").strip()
    if not ws:
        return {"ok": False, "detail": "workspace 为空，无法提交"}
    attempts = max(1, min(int(max_attempts or 3), 5))
    base_msg = _pipeline_commit_message(message)
    last_detail = ""
    last_raw: dict[str, Any] = {}
    last_job = ""
    last_findings: list[Any] = []
    limit = max(15, int(timeout_sec or 60))

    def _timed_out() -> bool:
        return time.time() >= deadline

    for attempt in range(1, attempts + 1):
        if _timed_out():
            return _commit_timeout_soft_skip(timeout_sec=limit, log=log)
        _log(log, f"开始真实提交门禁（第 {attempt}/{attempts} 次）：{ws}")
        gate = start_gate(ws)
        if _timed_out():
            return _commit_timeout_soft_skip(timeout_sec=limit, log=log)
        if not isinstance(gate, dict):
            gate = {}

        if not gate.get("ok") and not gate.get("can_commit"):
            detail = str(gate.get("detail") or gate.get("reply") or "门禁未通过")
            if "没有可提交" in detail:
                return {
                    "ok": True,
                    "skipped": True,
                    "summary": "工作区无待提交变更，跳过提交",
                    "raw": gate,
                }
            if _gate_blocking_findings(gate) or _detail_looks_like_gate_block(detail):
                _log(log, f"门禁阻断，立即打回写码补救：{detail[:200]}")
                return _commit_gate_block_result(
                    gate=gate, detail=detail, attempt=attempt
                )
            last_detail = detail
            last_raw = gate
            last_findings = list(gate.get("findings") or [])
            _log(log, f"门禁未过：{detail[:200]}")
            if attempt < attempts:
                continue
            break

        job_id = str(gate.get("job_id") or gate.get("id") or "").strip()
        if not job_id and isinstance(gate.get("job"), dict):
            job_id = str(gate["job"].get("id") or "").strip()
        if not job_id:
            last_detail = "门禁未返回 job_id"
            last_raw = gate
            if attempt < attempts:
                continue
            break

        if not gate.get("can_commit"):
            detail = str(gate.get("detail") or gate.get("reply") or "门禁阻断，禁止提交")
            _log(log, f"门禁阻断，立即打回写码补救：{detail[:200]}")
            return _commit_gate_block_result(
                gate=gate, detail=detail, attempt=attempt, job_id=job_id
            )

        msg = base_msg
        draft = str(gate.get("draft_message") or "").strip()
        if draft and (not msg or len(msg) > 200):
            msg = _pipeline_commit_message(draft)
        if attempt >= 2 and len(msg) > 80:
            msg = _pipeline_commit_message(msg[:80])
        if attempt >= 3:
            msg = _pipeline_commit_message("一体化自动提交：修复说明过长后重试")

        last_job = job_id
        if _timed_out():
            return _commit_timeout_soft_skip(timeout_sec=limit, log=log)
        _log(log, f"门禁通过，执行 commit/push（job={job_id}，说明 {len(msg)} 字）…")
        out = confirm(job_id, message=msg, push=True, decision="approve")
        if out.get("ok"):
            return {
                "ok": True,
                "job_id": job_id,
                "summary": str(out.get("reply") or "提交完成")[:400],
                "commit_result": out.get("commit_result"),
                "raw": out,
                "attempts": attempt,
            }
        cr = out.get("commit_result") if isinstance(out.get("commit_result"), dict) else {}
        if out.get("push_retry_needed") or is_push_retry_needed(cr) or is_push_retry_needed(out):
            summary = str(out.get("reply") or out.get("detail") or "本地已提交，远程推送待重试")[:400]
            _log(log, f"本地已提交；push 失败记为可重试通过：{summary[:160]}")
            return {
                "ok": True,
                "job_id": job_id,
                "summary": summary,
                "commit_result": out.get("commit_result"),
                "push_retry_needed": True,
                "raw": out,
                "attempts": attempt,
            }
        last_detail = str(out.get("detail") or out.get("reply") or "提交失败")
        last_raw = out if isinstance(out, dict) else {}
        _log(log, f"第 {attempt}/{attempts} 次提交失败：{last_detail[:220]}")
        if "过长" in last_detail:
            base_msg = _pipeline_commit_message(base_msg[:60] or "一体化自动提交")
            continue
        break

    reason = (
        "commit_gate_blockers"
        if (last_findings or _detail_looks_like_gate_block(last_detail))
        else "commit_retry_exhausted"
    )
    summary = (
        f"提交仍失败，将打回写码补救后重跑验证/复核/提交。原因：{last_detail or '未知'}"
    )[:400]
    _log(log, summary)
    return {
        "ok": False,
        "skipped": False,
        "can_manual_retry": True,
        "summary": summary,
        "detail": last_detail or summary,
        "job_id": last_job,
        "raw": last_raw,
        "gate_findings": last_findings,
        "reason": reason,
        "attempts": attempts,
    }


def _pipeline_commit_message(message: str) -> str:
    """一体化提交说明：首行 + 中文兜底 + ≤200 字（对齐 code_commit 门禁）。"""
    msg = (message or "").strip()
    if not msg:
        msg = "一体化流水线自动提交"
    first = msg.splitlines()[0].strip() or msg
    if not any("\u4e00" <= c <= "\u9fff" for c in first):
        first = "一体化自动提交：" + first
    if len(first) > 200:
        first = first[:197] + "…"
    return first


def _git_remote_url(workspace: str) -> str:
    """只读 origin URL；失败返回空。"""
    ws = (workspace or "").strip()
    if not ws:
        return ""
    try:
        kwargs: dict[str, Any] = {
            "cwd": ws,
            "capture_output": True,
            "text": True,
            "timeout": 8,
        }
        if os.name == "nt":
            kwargs["creationflags"] = 0x08000000  # CREATE_NO_WINDOW
        proc = subprocess.run(["git", "remote", "get-url", "origin"], **kwargs)
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if proc.returncode != 0:
        return ""
    return (proc.stdout or "").strip()[:400]


def detect_pr_hosting(workspace: str) -> dict[str, Any]:
    """识别工作区 VCS / 远端托管，供步骤 9 分支。

    provider: github | gitlab | gitee | unknown | none
    kind: git | svn | none
    """
    from pathlib import Path

    root = Path((workspace or "").strip() or ".")
    if (root / ".svn").is_dir():
        return {"kind": "svn", "provider": "none", "remote": ""}
    if not (root / ".git").exists():
        return {"kind": "none", "provider": "none", "remote": ""}
    remote = _git_remote_url(str(root))
    low = remote.lower()
    provider = "unknown"
    if "github.com" in low:
        provider = "github"
    elif "gitee.com" in low:
        provider = "gitee"
    elif "gitlab.com" in low or "gitlab." in low:
        provider = "gitlab"
    return {"kind": "git", "provider": provider, "remote": remote}


def _pr_title_body(message: str) -> tuple[str, str]:
    title = (message or "").strip().split("\n", 1)[0][:80] or "一体化流水线变更"
    if not any("\u4e00" <= c <= "\u9fff" for c in title):
        title = "一体化：" + title
    body = (message or "").strip()[:4000] or title
    return title, body


def _run_gh_pr(*, workspace: str, title: str, body: str, log: LogFn | None) -> dict[str, Any]:
    _log(log, "尝试 gh pr create（GitHub）…")
    try:
        proc = subprocess.run(
            ["gh", "pr", "create", "--title", title, "--body", body],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return {
            "ok": True,
            "skipped": True,
            "summary": "本机无 GitHub CLI（gh），已跳过开 PR。请安装 gh 后手工开，或改用配置 pr_provider=skip",
            "reason": "no_gh",
            "provider": "github",
        }
    except Exception as e:
        return {"ok": False, "detail": f"开 PR 失败：{e}", "provider": "github"}
    out = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    if proc.returncode != 0:
        low = out.lower()
        if "already exists" in low or "已存在" in out:
            _log(log, "PR 已存在，视为通过")
            return {
                "ok": True,
                "summary": "PR 已存在",
                "detail": out[:500],
                "provider": "github",
            }
        if "no commits" in low or "nothing to" in low:
            return {
                "ok": True,
                "skipped": True,
                "summary": "无可开 PR 的提交差异，已跳过",
                "detail": out[:500],
                "provider": "github",
            }
        if (
            "auth login" in low
            or "gh_token" in low
            or "not logged into" in low
            or "authentication required" in low
            or "http 401" in low
        ):
            return {
                "ok": True,
                "skipped": True,
                "summary": "本机 gh 未登录（请 gh auth login 或设 GH_TOKEN），已跳过开 PR",
                "reason": "gh_not_auth",
                "detail": out[:500],
                "provider": "github",
            }
        return {
            "ok": False,
            "detail": out[:800] or f"gh exit {proc.returncode}",
            "provider": "github",
        }
    url = ""
    for line in (proc.stdout or "").splitlines():
        if line.strip().startswith("http"):
            url = line.strip()
            break
    _log(log, f"PR 已创建：{url or 'ok'}")
    return {
        "ok": True,
        "pr_url": url,
        "summary": f"已开 PR{(' · ' + url) if url else ''}",
        "raw": out[:500],
        "provider": "github",
    }


def _run_glab_mr(*, workspace: str, title: str, body: str, log: LogFn | None) -> dict[str, Any]:
    _log(log, "尝试 glab mr create（GitLab）…")
    try:
        proc = subprocess.run(
            [
                "glab",
                "mr",
                "create",
                "--title",
                title,
                "--description",
                body,
                "--yes",
            ],
            cwd=workspace,
            capture_output=True,
            text=True,
            timeout=120,
        )
    except FileNotFoundError:
        return {
            "ok": True,
            "skipped": True,
            "summary": "远端是 GitLab，但本机无 glab CLI，已跳过。请安装 glab 后手工开 MR，或配置 pr_provider=skip",
            "reason": "no_glab",
            "provider": "gitlab",
        }
    except Exception as e:
        return {"ok": False, "detail": f"开 MR 失败：{e}", "provider": "gitlab"}
    out = ((proc.stdout or "") + "\n" + (proc.stderr or "")).strip()
    if proc.returncode != 0:
        low = out.lower()
        if "already exists" in low or "已存在" in out:
            return {
                "ok": True,
                "summary": "MR 已存在",
                "detail": out[:500],
                "provider": "gitlab",
            }
        if "auth" in low or "login" in low or "401" in low:
            return {
                "ok": True,
                "skipped": True,
                "summary": "本机 glab 未登录，已跳过开 MR（请 glab auth login）",
                "reason": "glab_not_auth",
                "detail": out[:500],
                "provider": "gitlab",
            }
        return {
            "ok": False,
            "detail": out[:800] or f"glab exit {proc.returncode}",
            "provider": "gitlab",
        }
    url = ""
    for line in (proc.stdout or "").splitlines():
        s = line.strip()
        if s.startswith("http"):
            url = s
            break
    _log(log, f"MR 已创建：{url or 'ok'}")
    return {
        "ok": True,
        "pr_url": url,
        "summary": f"已开 GitLab MR{(' · ' + url) if url else ''}",
        "raw": out[:500],
        "provider": "gitlab",
    }


def run_pr(*, workspace: str, message: str = "", log: LogFn | None = None) -> dict[str, Any]:
    """按远端托管开 PR/MR；SVN / 未装 CLI / 配置 skip 时诚实跳过，不假绿硬闯。"""
    from .config import get_config

    ws = (workspace or "").strip()
    if not ws:
        return {"ok": False, "detail": "workspace 为空，无法开 PR"}

    cfg = get_config()
    provider_cfg = str(cfg.get("pr_provider") or "auto").strip().lower()
    if provider_cfg in ("skip", "none", "off", "manual"):
        return {
            "ok": True,
            "skipped": True,
            "not_applicable": True,
            "summary": "配置 pr_provider=skip：本步不适用，请手工开合并请求后继续部署",
            "reason": "pr_provider_skip",
            "provider": "skip",
        }

    hosting = detect_pr_hosting(ws)
    kind = str(hosting.get("kind") or "")
    auto_provider = str(hosting.get("provider") or "none")
    remote = str(hosting.get("remote") or "")

    if kind == "svn":
        return {
            "ok": True,
            "skipped": True,
            "not_applicable": True,
            "summary": "SVN 工程无 Pull Request，本步不适用；整单可继续部署",
            "reason": "svn_no_pr",
            "provider": "none",
        }

    # 配置强制指定托管（仍要能落到可执行分支）
    provider = provider_cfg if provider_cfg in ("github", "gitlab", "gitee") else auto_provider
    if provider_cfg == "auto":
        provider = auto_provider

    title, body = _pr_title_body(message)

    if provider == "github":
        return _run_gh_pr(workspace=ws, title=title, body=body, log=log)

    if provider == "gitlab":
        return _run_glab_mr(workspace=ws, title=title, body=body, log=log)

    if provider == "gitee":
        hint = remote or "（请在 Gitee 网页开 Pull Request）"
        return {
            "ok": True,
            "skipped": True,
            "summary": f"远端是 Gitee，暂不自动开 PR；请手工在网页创建合并请求后继续。远端：{hint}",
            "reason": "gitee_manual",
            "provider": "gitee",
            "detail": hint,
            "manual_hint": True,
        }

    if kind == "none":
        return {
            "ok": True,
            "skipped": True,
            "not_applicable": True,
            "summary": "未检测到 Git/SVN，本步不适用开 PR",
            "reason": "no_vcs",
            "provider": "none",
        }

    # 未知 Git 远端：不硬跑 gh（避免误报）
    return {
        "ok": True,
        "skipped": True,
        "summary": (
            "远端不是 GitHub/GitLab/Gitee 标准地址，已跳过自动开 PR。"
            f"请手工开合并请求。远端：{remote or '（无 origin）'}"
        ),
        "reason": "unknown_remote",
        "provider": "unknown",
        "detail": remote,
        "manual_hint": True,
    }


def _is_retryable_deploy_failure(detail: str) -> bool:
    """部署整趟失败是否值得再开一趟 Job（瞬时基建/管道崩溃；源码编译错误不重试）。"""
    d = str(detail or "")
    if not d.strip():
        return True
    # 配置/环境/鉴权硬失败：重开 Job 也过不了（勿把 SSH 认证失败当成瞬时）
    hard = (
        "workspace 为空",
        "找不到 npm",
        "当前不可部署",
        "未返回 job_id",
        "SyntaxError",
        "Module not found",
        "Could not resolve",
        "FAILED to resolve",
        "Rollup failed to resolve",
        "error during build",
        "TS2307",
        "TS2345",
        "ValidationError",
        "鉴权失败",
        "认证失败",
        "authentication failed",
        "Permission denied",
        "Host key verification failed",
        "Could not resolve hostname",
        "无法解析主机",
        "路径穿越",
        "拒绝覆盖",
        "未配置 health",
        "未配置探活",
        # 服务存活硬约束：坏包已回滚，再整趟推同一变更只会反复空窗
        "新版本导致服务不可用",
        "已自动回滚到部署前",
        "无可用快照可回滚",
        "自动回滚失败",
        "已回滚文件但服务仍不可用",
        "service_down_after_deploy",
        "service_down_rolled_back",
        "需运维介入",
    )
    if any(k in d for k in hard):
        return False
    # 瞬时：libuv、网络、同步抖动；探活空窗仅认明确瞬时口令（勿单靠「探活」——
    # 「恢复探活」会出现在硬回滚成功文案里）
    soft = (
        "UV_HANDLE_CLOSING",
        "Assertion failed",
        "EPIPE",
        "ECONNRESET",
        "ECONNABORTED",
        "Connection reset",
        "Connection timed out",
        "Connection refused",
        "timed out",
        "Timeout",
        "WinError 10054",
        "WinError 10060",
        "broken pipe",
        "管道",
        "npm_build_transient",
        "rsync",
        "scp",
        "探活 502",
        "探活 503",
        "探活空窗",
        "health check",
        "502",
        "503",
        "空窗",
        "回滚后",
    )
    return any(k in d for k in soft)


def run_deploy(*, workspace: str, log: LogFn | None = None) -> dict[str, Any]:
    """一体部署：prepare → confirm；瞬时失败最多再开 Job 重试（硬顶 3，与写码轮次独立）。"""
    import time

    from . import config as dp_config
    from ..code_deploy.ops import confirm, prepare

    ws = (workspace or "").strip()
    if not ws:
        return {"ok": False, "detail": "workspace 为空，无法部署", "reason": "no_workspace"}

    max_attempts = max(1, min(3, int(dp_config.get_config().get("max_deploy_attempts") or 3)))
    last: dict[str, Any] = {"ok": False, "detail": "部署未执行"}
    for attempt in range(1, max_attempts + 1):
        if attempt > 1:
            _log(log, f"部署瞬时失败，自动重试整趟 {attempt}/{max_attempts} …")
            time.sleep(min(1.5 * (attempt - 1), 4.0))
        else:
            _log(log, f"准备真实部署：{ws}")
        prep = prepare(ws, mode="auto")
        if not prep.get("ok") and not prep.get("can_deploy"):
            detail = str(prep.get("detail") or prep.get("reply") or "部署准备失败")
            last = {"ok": False, "detail": detail, "raw": prep, "attempts": attempt}
            if _is_retryable_deploy_failure(detail) and attempt < max_attempts:
                continue
            return last
        job_id = str(prep.get("job_id") or "").strip()
        if not job_id and isinstance(prep.get("job"), dict):
            job_id = str(prep["job"].get("id") or "").strip()
        if not job_id:
            return {
                "ok": False,
                "detail": "部署准备未返回 job_id",
                "raw": prep,
                "attempts": attempt,
                "reason": "no_job_id",
            }
        if prep.get("can_deploy") is False:
            detail = str(prep.get("detail") or prep.get("reply") or "当前不可部署")
            # 增量 0 单元且已有上次部署基线：远端已与本机对齐，一体化算成功（禁止「成功后再部署」假失败）
            try:
                n_units = len((prep.get("execution") or {}).get("unit_ids") or [])
            except Exception:
                n_units = 0
            mode = str(prep.get("mode") or "")
            has_baseline = bool(str(prep.get("last_deploy_sha") or "").strip())
            first = bool(prep.get("first_deploy"))
            if (
                mode == "incremental"
                and n_units == 0
                and has_baseline
                and not first
            ):
                _log(log, "无增量变更，远端已是当前版本，跳过重复部署")
                return {
                    "ok": True,
                    "skipped": True,
                    "reason": "nothing_to_deploy",
                    "summary": "无增量变更，远端已是当前版本（跳过重复部署）",
                    "job_id": job_id,
                    "attempts": attempt,
                    "raw": prep,
                }
            return {
                "ok": False,
                "detail": detail,
                "job_id": job_id,
                "raw": prep,
                "attempts": attempt,
                "reason": "cannot_deploy",
            }
        _log(log, f"确认部署执行（job={job_id}，尝试 {attempt}/{max_attempts}）…")
        out = confirm(job_id, decision="approve")
        if out.get("ok"):
            return {
                "ok": True,
                "job_id": job_id,
                "summary": str(out.get("reply") or "部署完成")[:400],
                "deploy_result": out.get("deploy_result"),
                "raw": out,
                "attempts": attempt,
            }
        detail = str(out.get("detail") or out.get("reply") or "部署失败")
        last = {
            "ok": False,
            "detail": detail,
            "job_id": job_id,
            "raw": out,
            "attempts": attempt,
            "reason": "deploy_fail",
        }
        if _is_retryable_deploy_failure(detail) and attempt < max_attempts:
            continue
        break
    if not last.get("ok") and int(last.get("attempts") or 0) >= max_attempts:
        last["reason"] = "deploy_retry_exhausted"
        last["detail"] = (
            f"{last.get('detail') or '部署失败'}（已自动重试 {max_attempts} 次仍失败）"
        )[:800]
    return last
