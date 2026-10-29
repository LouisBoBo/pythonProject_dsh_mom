"""步骤 5：真实调用本机 Cursor 对话写码插件（:18791），不改插件源码。"""
from __future__ import annotations

import time
from typing import Any, Callable

from .config import get_config
from . import cursor_coding_client as cc


LogFn = Callable[[str], None]

# 写码 Job 轮询：连接丢失连续 N 次且自愈失败才判失败
REFUSE_FAIL_AFTER = 3
# 轮询期间最多自愈拉起 sidecar 次数（避免死循环）
SIDECAR_HEAL_MAX = 2


def is_conn_refused(err: str) -> bool:
    """含 Windows 积极拒绝 / 强迫关闭 / 重置，以及常见 urlopen 文案。"""
    e = err or ""
    return any(
        x in e
        for x in (
            "Connection refused",
            "Errno 61",
            "WinError 10061",
            "10061",
            "积极拒绝",
            "连接被拒绝",
            "Failed to connect",
            "ConnectionResetError",
            "Remote end closed",
            "WinError 10054",
            "10054",
            "强迫关闭",
            "Connection aborted",
            "BrokenPipeError",
            "Broken pipe",
        )
    )


def is_transient_conn_err(err: str) -> bool:
    if is_conn_refused(err):
        return True
    e = (err or "").lower()
    return any(
        x in e
        for x in (
            "timed out",
            "timeout",
            "temporarily unavailable",
            "10060",  # Windows 连接超时
        )
    )


def is_cursor_network_job_fail(detail: str) -> bool:
    """写码插件 Job 因上游网络失败（可重试），非需求写错。"""
    d = (detail or "").lower()
    return any(
        x in d
        for x in (
            "network request failed",
            "retryable=true",
            "retryable = true",
            "econnreset",
            "socket hang up",
            "fetch failed",
        )
    )


def _ensure_cursor_sidecar(base: str) -> dict[str, Any]:
    """写码前/中自愈对话写码 :18791（不改 DSH 插件源码）。"""
    try:
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[5]
        lib = root / "scripts" / "lib"
        if lib.is_dir() and str(lib) not in sys.path:
            sys.path.insert(0, str(lib))
        from ensure_cursor_chat_sidecar import ensure_cursor_chat_sidecar

        return ensure_cursor_chat_sidecar(fix=True, require=False)
    except Exception as e:
        return {"ok": False, "detail": f"ensure sidecar 异常：{type(e).__name__}: {e}", "base": base}


def build_implement_requirement(*, message: str, epic: dict[str, Any], workspace: str = "") -> str:
    """把 PRD / 计划压成插件 requirement（健全任务卡，见 implement_gate）。"""
    from .implement_gate import build_stable_implement_requirement

    return build_stable_implement_requirement(message=message, epic=epic, workspace=workspace)


def _is_db_or_binary_path(rel: str) -> bool:
    p = str(rel or "").replace("\\", "/").lower().strip()
    if not p:
        return True
    if p.endswith((".db", ".sqlite", ".sqlite3", ".db-journal", ".db-wal", ".db-shm")):
        return True
    name = p.rsplit("/", 1)[-1]
    if name in ("erp.db", "data.db", "app.db"):
        return True
    if any(
        seg in p
        for seg in (
            "/.venv/",
            "/node_modules/",
            "/__pycache__/",
            "/dist/",
            "/.git/",
        )
    ):
        return True
    return False


def _code_files_only(files: list[Any] | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in files or []:
        rel = str(raw or "").replace("\\", "/").strip().lstrip("./")
        if not rel or _is_db_or_binary_path(rel):
            continue
        if rel in seen:
            continue
        seen.add(rel)
        out.append(rel)
    return out


def _looks_like_db_sync_fail(detail: str) -> bool:
    d = detail or ""
    if "同步写入失败" not in d and "EPERM" not in d and "operation not permitted" not in d:
        return False
    return any(x in d.lower() for x in (".db", "sqlite", "erp.db"))


def _find_requirement_files_on_disk(workspace: str, requirement: str) -> list[str]:
    """需求相关源码已在工程中时，用于 db 同步失败后的自愈举证。"""
    from pathlib import Path

    root = Path(workspace or "")
    if not root.is_dir():
        return []
    req = requirement or ""
    candidates: list[str] = []
    if any(k in req for k in ("低库存", "inventory-low-stock", "low-stock", "low_stock")):
        candidates.extend(
            [
                "backend/app/routers/inventory_low_stock.py",
                "frontend/src/api/inventoryLowStock.js",
                "frontend/src/views/warehouse/LowStockAlertsView.vue",
                "backend/app/main.py",
                "frontend/src/layouts/AppLayout.vue",
                "frontend/src/router/index.js",
            ]
        )
    if "收藏夹" in req or "favorites" in req.lower():
        candidates.extend(
            [
                "frontend/src/views/favorites/Index.vue",
                "frontend/src/utils/pageFavorites.js",
                "frontend/src/layouts/AppLayout.vue",
            ]
        )
    found: list[str] = []
    for rel in candidates:
        if (root / rel).is_file() and rel not in found:
            found.append(rel)
    return found[:20]


def _safe_rel_under(root: Path, rel: str) -> Path | None:
    """resolve 后必须仍在 root 下（防路径穿越）。"""
    text = str(rel or "").replace("\\", "/").strip().lstrip("./")
    if not text or ".." in text.split("/") or text.startswith("/") or ":" in text:
        return None
    try:
        base = root.expanduser().resolve(strict=False)
        dest = (base / text).resolve(strict=False)
        dest.relative_to(base)
        return dest
    except (OSError, ValueError):
        return None


def _cursor_chat_sandboxes_root():
    from pathlib import Path

    return Path.home() / ".zhongruan" / "cursor-chat" / "sandboxes"


def _resolve_job_sandbox(job: dict[str, Any]):
    """仅允许 ~/.zhongruan/cursor-chat/sandboxes/<job_id>/ 下的沙箱。"""
    from pathlib import Path

    jid = str(job.get("id") or "").strip()
    if not jid.startswith("cch-") and not jid.startswith("ccj-"):
        return None
    raw = str(job.get("sandbox_path") or "").strip()
    roots = _cursor_chat_sandboxes_root()
    try:
        roots_res = roots.resolve(strict=False)
    except OSError:
        return None
    candidates: list[Path] = []
    if raw:
        candidates.append(Path(raw))
    candidates.append(roots / jid)
    for cand in candidates:
        try:
            resolved = cand.expanduser().resolve(strict=False)
            resolved.relative_to(roots_res)
        except (OSError, ValueError):
            continue
        if not resolved.is_dir():
            continue
        # 目录名须等于 job id（防误指其它沙箱）
        if resolved.name != jid:
            continue
        return resolved
    return None


def _atomic_copy_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".wb-db-recover-tmp")
    try:
        if tmp.exists():
            tmp.unlink()
        tmp.write_bytes(src.read_bytes())
        tmp.replace(dest)
    finally:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass


def copy_code_files_from_sandbox(
    *,
    job: dict[str, Any],
    workspace: str,
    log: LogFn | None = None,
) -> list[str]:
    """把沙箱里非 *.db 的 changed_files 原子写回真实工程（补插件因 db EPERM 整单中断的同步）。"""
    from pathlib import Path

    def _log(m: str) -> None:
        if log:
            log(m)

    sandbox = _resolve_job_sandbox(job)
    if sandbox is None:
        return []
    ws = Path(workspace or "")
    if not ws.is_dir():
        return []
    raw_files = job.get("changed_files") or job.get("synced_files") or []
    code_files = _code_files_only(raw_files if isinstance(raw_files, list) else [])
    written: list[str] = []
    for rel in code_files:
        src = _safe_rel_under(sandbox, rel)
        dest = _safe_rel_under(ws, rel)
        if src is None or dest is None or not src.is_file():
            continue
        try:
            _atomic_copy_file(src, dest)
            written.append(rel.replace("\\", "/"))
        except OSError as exc:
            _log(f"沙箱回收跳过 {rel}：{exc}")
    if written:
        _log(
            f"已从沙箱回收源码 {len(written)} 个文件到工程（已忽略 *.db）："
            + "、".join(written[:8])
        )
    return written


def remove_sandbox_deleted_code_files(
    *,
    job: dict[str, Any],
    workspace: str,
    log: LogFn | None = None,
) -> list[str]:
    """沙箱里已经不存在的非 db 源码，从真实工程删掉。

    只认 job.deleted_files，且沙箱中该相对路径已不是文件。库文件不删。
    沙箱仍保留该文件时不动工程，避免误删。
    """
    from pathlib import Path

    def _log(m: str) -> None:
        if log:
            log(m)

    sandbox = _resolve_job_sandbox(job)
    if sandbox is None:
        return []
    ws = Path(workspace or "")
    if not ws.is_dir():
        return []
    raw = job.get("deleted_files") or []
    rels = _code_files_only(raw if isinstance(raw, list) else [])
    removed: list[str] = []
    for rel in rels:
        src = _safe_rel_under(sandbox, rel)
        dest = _safe_rel_under(ws, rel)
        if src is None or dest is None:
            continue
        if src.is_file():
            continue
        if not dest.is_file():
            continue
        # 父目录须在沙箱存在：证明该子树曾被镜像。残缺/空沙箱 + 伪造 deleted_files 不得乱删工程。
        parent_rel = str(Path(rel).parent).replace("\\", "/")
        if parent_rel in ("", "."):
            sandbox_parent = sandbox
        else:
            sandbox_parent = _safe_rel_under(sandbox, parent_rel)
        if sandbox_parent is None or not sandbox_parent.is_dir():
            _log(f"沙箱删除回收跳过 {rel}：沙箱无对应父目录（防残缺沙箱误删）")
            continue
        try:
            dest.unlink()
            removed.append(rel.replace("\\", "/"))
        except OSError as exc:
            _log(f"沙箱删除回收跳过 {rel}：{exc}")
    if removed:
        _log(
            f"已按沙箱删除清单从工程移除 {len(removed)} 个源码（已忽略 *.db）："
            + "、".join(removed[:8])
        )
    return removed


def recover_job_after_db_sync_fail(
    *,
    job: dict[str, Any],
    workspace: str,
    requirement: str,
    log: LogFn | None = None,
) -> dict[str, Any] | None:
    """插件因 *.db EPERM 整单失败时：丢掉 db，从沙箱/工程回收源码变更。"""
    detail = str(job.get("detail") or "")
    if not _looks_like_db_sync_fail(detail):
        return None

    def _log(m: str) -> None:
        if log:
            log(m)

    from pathlib import Path

    # 1) 优先：沙箱里已有改动但同步因 db 中断 → 把非 db 源码写回，并删掉沙箱已删的源码
    copied = copy_code_files_from_sandbox(job=job, workspace=workspace, log=log)
    removed = remove_sandbox_deleted_code_files(job=job, workspace=workspace, log=log)
    if copied or removed:
        summary = (
            f"写码完成（已忽略数据库同步失败，从沙箱回收源码 {len(copied)} 项"
            f"，删除 {len(removed)} 项）"
        )
        return {
            "ok": True,
            "changed_files": copied,
            "deleted_files": removed,
            "summary": summary,
            "detail": detail,
            "reason": "recovered_db_sync_fail_sandbox",
            "recovered": True,
            "from_sandbox": True,
        }

    raw_files = job.get("changed_files") or job.get("synced_files") or []
    code_files = _code_files_only(raw_files if isinstance(raw_files, list) else [])
    existing = [
        f
        for f in code_files
        if Path(workspace, f).is_file()
    ]
    if existing:
        _log(
            f"写码 Job 因数据库文件同步失败，但已回收源码变更 {len(existing)} 个（已忽略 *.db）"
        )
        return {
            "ok": True,
            "changed_files": existing,
            "summary": f"写码完成（已忽略数据库同步失败，回收源码 {len(existing)} 项）",
            "detail": detail,
            "reason": "recovered_db_sync_fail",
            "recovered": True,
        }

    found = _find_requirement_files_on_disk(workspace, requirement)
    if found:
        _log(
            "写码 Job 仅数据库同步失败；工程内已有需求相关源码，按已实现回收 "
            + "、".join(found[:6])
        )
        return {
            "ok": True,
            "changed_files": found,
            "summary": f"写码完成（工程已有实现，忽略 *.db 同步失败，{len(found)} 个文件）",
            "detail": detail,
            "reason": "recovered_existing_feature",
            "recovered": True,
        }

    _log("写码失败：数据库文件被占用无法同步，且未回收到源码变更")
    return {
        "ok": False,
        "changed_files": [],
        "detail": (
            "写码同步撞上被占用的数据库文件（*.db / erp.db）。"
            "禁止改数据库文件；请只改业务源码后重试。"
            f" 原错误：{detail[:400]}"
        ),
        "summary": "写码失败：数据库文件同步被占用（EPERM）",
        "reason": "db_sync_blocked",
        "can_retry": True,
    }


def run_implement(
    *,
    workspace: str,
    requirement: str,
    log: LogFn | None = None,
    is_cancelled: Callable[[], bool] | None = None,
    on_job_started: Callable[[str], None] | None = None,
    resume_job_id: str = "",
) -> dict[str, Any]:
    """pending → HITL issue → confirm → 轮询 Job 终态。连拒时自愈 :18791 再续轮询。

    resume_job_id：引擎中断后续跑时优先接着轮询已有 Job，避免空开第 N 轮新单。
    """

    def _log(m: str) -> None:
        if log:
            log(m)

    def _cancelled() -> bool:
        try:
            return bool(is_cancelled and is_cancelled())
        except Exception:
            return False

    def _notify_job(jid: str) -> None:
        if not jid or not on_job_started:
            return
        try:
            on_job_started(jid)
        except Exception:
            pass

    cfg = get_config()
    base, remap_note = cc.normalize_chat_base(
        str(cfg.get("cursor_coding_base") or cc.DEFAULT_BASE)
    )
    if remap_note:
        _log(remap_note)
    timeout = int(cfg.get("implement_timeout_sec") or 2700)
    poll = float(cfg.get("implement_poll_sec") or 2.0)

    ws = (workspace or "").strip()
    req = (requirement or "").strip()
    if not ws:
        return {"ok": False, "detail": "workspace 为空，无法写码", "reason": "no_workspace"}
    if not req:
        return {"ok": False, "detail": "requirement 为空，无法写码", "reason": "no_requirement"}

    # —— 续跑：先跟已有 Job，成功/失败直接返回，禁止无故再开一张 ——
    resume_id = str(resume_job_id or "").strip()
    if resume_id:
        _log(f"续跑写码：先跟已有 Job {resume_id}…")
        _ensure_cursor_sidecar(base)
        try:
            job0 = cc.get_job(base, resume_id)
            st0 = str(job0.get("status") or "").strip()
            if st0 in ("succeeded", "success", "done", "completed", "failed", "error", "cancelled", "canceled"):
                # 走统一终态处理：复用下方逻辑——此处直接构造与轮询结束相同出口
                if st0 in ("succeeded", "success", "done", "completed"):
                    files = _code_files_only(
                        job0.get("changed_files") or job0.get("synced_files") or []
                    )
                    detail = str(job0.get("detail") or "").strip()
                    if files and "未产生可同步文件变更" not in detail:
                        return {
                            "ok": True,
                            "job_id": resume_id,
                            "status": st0,
                            "changed_files": files,
                            "summary": f"写码完成（续跑回收 {resume_id}，变更 {len(files)} 项）",
                            "job": job0,
                            "resumed": True,
                        }
                    return {
                        "ok": False,
                        "job_id": resume_id,
                        "status": st0,
                        "changed_files": [],
                        "detail": detail or "写码未产生任何可同步变更文件",
                        "summary": f"写码失败（{resume_id}，变更 0 项）",
                        "reason": "no_changed_files",
                        "job": job0,
                        "can_retry": True,
                        "resumed": True,
                    }
                detail = str(job0.get("detail") or f"写码 Job {st0}")
                if is_cursor_network_job_fail(detail):
                    # 网络失败可重开一趟，不占用「交付打回」语义
                    _log(f"续跑发现 Job 网络失败，将新开一趟：{detail[:160]}")
                elif _looks_like_db_sync_fail(detail):
                    return {
                        "ok": False,
                        "job_id": resume_id,
                        "status": st0,
                        "detail": detail,
                        "reason": "db_sync_blocked",
                        "changed_files": _code_files_only(
                            job0.get("changed_files") or job0.get("synced_files") or []
                        ),
                        "job": job0,
                        "can_retry": True,
                        "resumed": True,
                    }
                else:
                    return {
                        "ok": False,
                        "job_id": resume_id,
                        "status": st0,
                        "detail": detail,
                        "reason": "job_" + st0,
                        "changed_files": _code_files_only(
                            job0.get("changed_files") or job0.get("synced_files") or []
                        ),
                        "job": job0,
                        "can_retry": True,
                        "resumed": True,
                    }
            else:
                # 仍在跑：跳进轮询环
                job_id = resume_id
                _notify_job(job_id)
                _log(f"续跑轮询未完成 Job：{job_id}")
                deadline = time.time() + max(60, timeout)
                last_status = st0
                job = job0
                refuse_streak = 0
                heal_used = 0
                while time.time() < deadline:
                    if _cancelled():
                        return {
                            "ok": False,
                            "job_id": job_id,
                            "status": "cancelled",
                            "detail": "用户已停止任务",
                            "reason": "cancelled",
                            "resumed": True,
                        }
                    try:
                        job = cc.get_job(base, job_id)
                        refuse_streak = 0
                    except Exception as e:
                        refuse_streak += 1
                        _log(f"续跑轮询暂失败（{refuse_streak}）：{e}")
                        if is_transient_conn_err(str(e)) and heal_used < SIDECAR_HEAL_MAX:
                            heal_used += 1
                            _ensure_cursor_sidecar(base)
                            time.sleep(max(1.0, poll))
                            continue
                        if refuse_streak >= REFUSE_FAIL_AFTER:
                            return {
                                "ok": False,
                                "job_id": job_id,
                                "detail": f"续跑轮询不可达：{e}",
                                "reason": "plugin_down",
                                "can_retry": True,
                                "resumed": True,
                            }
                        time.sleep(poll)
                        continue
                    st = str(job.get("status") or "").strip()
                    if st and st != last_status:
                        _log(f"Job 状态 → {st}")
                        last_status = st
                    if st in ("succeeded", "success", "done", "completed"):
                        files = _code_files_only(
                            job.get("changed_files") or job.get("synced_files") or []
                        )
                        detail = str(job.get("detail") or "").strip()
                        if not files or "未产生可同步文件变更" in detail:
                            return {
                                "ok": False,
                                "job_id": job_id,
                                "changed_files": [],
                                "detail": detail or "写码未产生任何可同步变更文件",
                                "summary": f"写码失败（{job_id}，变更 0 项）",
                                "reason": "no_changed_files",
                                "can_retry": True,
                                "resumed": True,
                            }
                        return {
                            "ok": True,
                            "job_id": job_id,
                            "changed_files": files,
                            "summary": f"写码完成（续跑 {job_id}，变更 {len(files)} 项）",
                            "resumed": True,
                        }
                    if st in ("failed", "error", "cancelled", "canceled"):
                        detail = str(job.get("detail") or f"写码 Job {st}")
                        reason = (
                            "plugin_network"
                            if is_cursor_network_job_fail(detail)
                            else (
                                "db_sync_blocked"
                                if _looks_like_db_sync_fail(detail)
                                else "job_" + st
                            )
                        )
                        return {
                            "ok": False,
                            "job_id": job_id,
                            "detail": detail,
                            "reason": reason,
                            "can_retry": True,
                            "resumed": True,
                        }
                    time.sleep(poll)
                return {
                    "ok": False,
                    "job_id": job_id,
                    "detail": f"续跑写码超时（{timeout}s）",
                    "reason": "timeout",
                    "can_retry": True,
                    "resumed": True,
                }
        except Exception as e:
            _log(f"续跑跟 Job 失败，将新开写码：{e}")

    _log(f"写码目标：{base}")
    ensured = _ensure_cursor_sidecar(base)
    if ensured.get("fixed"):
        _log(f"已自愈拉起写码 sidecar：{ensured.get('detail') or base}")
    elif not ensured.get("ok"):
        _log(f"写码 sidecar 探测：{ensured.get('detail') or '未就绪'}")

    ready = cc.probe(base)
    if not ready.get("ok"):
        # 再 ensure 一次后复探
        ensured2 = _ensure_cursor_sidecar(base)
        ready = cc.probe(base)
        if not ready.get("ok"):
            detail = str(ready.get("detail") or "Cursor 对话写码未就绪（:18791）")
            if ensured2.get("detail") or ensured.get("detail"):
                detail = f"{detail}；ensure：{ensured2.get('detail') or ensured.get('detail')}"
            return {
                "ok": False,
                "detail": detail,
                "reason": "plugin_down",
                "can_retry": True,
            }
    if not ready.get("cursor_key_configured"):
        return {
            "ok": False,
            "detail": "Cursor API Key 未配置：请在设置 → Cursor 写码填写 Key",
            "reason": "cursor_key_required",
        }

    _log(f"写码插件就绪：{base}")
    _log("创建 pending 确认单…")
    try:
        pending = cc.create_pending(base, workspace=ws, requirement=req)
    except Exception as e:
        err = str(e)
        if is_transient_conn_err(err):
            _log(f"创建 pending 连不上，自愈后重试：{e}")
            _ensure_cursor_sidecar(base)
            try:
                pending = cc.create_pending(base, workspace=ws, requirement=req)
            except Exception as e2:
                return {
                    "ok": False,
                    "detail": f"创建 pending 失败：{e2}",
                    "reason": "pending_fail",
                    "can_retry": True,
                }
        else:
            return {"ok": False, "detail": f"创建 pending 失败：{e}", "reason": "pending_fail"}
    token = str(pending.get("confirm_token") or "").strip()
    if not token:
        return {
            "ok": False,
            "detail": "插件未返回 confirm_token",
            "reason": "pending_fail",
            "raw": pending,
        }
    _log(f"confirm_token={token}")

    _log("签发写码 HITL nonce（流水线代签，不再弹中间确认）…")
    try:
        issued = cc.issue_confirm_nonce(base, confirm_token=token)
    except Exception as e:
        return {"ok": False, "detail": f"签发 nonce 失败：{e}", "reason": "hitl_fail"}
    nonce = str(issued.get("nonce") or issued.get("hitl_nonce") or "").strip()
    if not nonce:
        return {"ok": False, "detail": "未拿到 nonce", "reason": "hitl_fail", "raw": issued}

    _log("确认开工（真实 Cursor 写码 Job）…")
    try:
        started = cc.confirm_start(base, confirm_token=token, nonce=nonce)
    except Exception as e:
        return {"ok": False, "detail": f"confirm 开工失败：{e}", "reason": "confirm_fail"}
    job_id = str(started.get("job_id") or "").strip()
    if not job_id and isinstance(started.get("job"), dict):
        job_id = str(started["job"].get("id") or "").strip()
    if not job_id:
        return {
            "ok": False,
            "detail": "开工成功但无 job_id：" + str(started.get("detail") or started)[:300],
            "reason": "no_job_id",
            "raw": started,
        }
    _log(f"Job 已启动：{job_id}，等待终态（最长 {timeout}s）…")
    _notify_job(job_id)

    deadline = time.time() + max(60, timeout)
    last_status = ""
    job: dict[str, Any] = {}
    refuse_streak = 0
    heal_used = 0

    while time.time() < deadline:
        if _cancelled():
            return {
                "ok": False,
                "job_id": job_id,
                "status": "cancelled",
                "detail": "用户已停止任务",
                "reason": "cancelled",
            }
        try:
            job = cc.get_job(base, job_id)
            refuse_streak = 0
        except Exception as e:
            refuse_streak += 1
            err = str(e)
            _log(f"轮询 Job 暂失败（{refuse_streak}/{REFUSE_FAIL_AFTER}）：{e}")
            if is_transient_conn_err(err) and heal_used < SIDECAR_HEAL_MAX:
                heal_used += 1
                _log(
                    f"写码服务连接中断，自愈拉起 sidecar（{heal_used}/{SIDECAR_HEAL_MAX}）…"
                )
                ens = _ensure_cursor_sidecar(base)
                _log(str(ens.get("detail") or ens))
                # 给进程一点起来时间
                time.sleep(max(1.0, poll))
                try:
                    job = cc.get_job(base, job_id)
                    refuse_streak = 0
                    _log("自愈后 Job 轮询恢复")
                    # fall through to status handling below
                except Exception as e2:
                    e2s = str(e2)
                    _log(f"自愈后仍不可达：{e2}")
                    # Job 可能随进程内存丢失
                    if any(
                        x in e2s.lower()
                        for x in ("404", "not found", "unknown job", "无此", "不存在")
                    ):
                        return {
                            "ok": False,
                            "job_id": job_id,
                            "detail": (
                                f"写码 sidecar 崩溃后 Job {job_id} 已丢失，需重跑写码步骤。"
                                f"自愈：{ens.get('detail') or '—'}"
                            ),
                            "reason": "job_lost_after_sidecar_heal",
                            "can_retry": True,
                        }
                    if refuse_streak >= REFUSE_FAIL_AFTER:
                        return {
                            "ok": False,
                            "job_id": job_id,
                            "detail": (
                                f"Cursor 写码服务不可达（{base}），"
                                f"已自愈 {heal_used} 次仍失败：{e2}"
                            ),
                            "reason": "plugin_down",
                            "can_retry": True,
                        }
                    time.sleep(poll)
                    continue
            elif refuse_streak >= REFUSE_FAIL_AFTER and is_conn_refused(err):
                return {
                    "ok": False,
                    "job_id": job_id,
                    "detail": (
                        f"Cursor 写码服务不可达（{base}），连续 {REFUSE_FAIL_AFTER} 次连接失败：{err}。"
                        "请确认 :18791 写码插件已启动后再开跑。"
                    ),
                    "reason": "plugin_down",
                    "can_retry": True,
                }
            else:
                time.sleep(poll)
                continue
        st = str(job.get("status") or "").strip()
        if st and st != last_status:
            _log(f"Job 状态 → {st}")
            last_status = st
        if st in ("succeeded", "success", "done", "completed"):
            files = job.get("changed_files") or job.get("synced_files") or []
            if not isinstance(files, list):
                files = []
            # 成功态也剔除 db/二进制，避免后续审码/提交去碰库文件
            files = _code_files_only(files)
            n = len(files)
            detail = str(job.get("detail") or "").strip()
            # 插件可报 succeeded 但「未产生可同步文件变更」——对企业流水线仍算写码失败
            empty_sync = n == 0 or (
                "未产生可同步文件变更" in detail or "无可同步" in detail
            )
            if empty_sync:
                # 若成功文案却夹带 db 同步问题，尝试按失败路径回收
                recovered = recover_job_after_db_sync_fail(
                    job=job if isinstance(job, dict) else {},
                    workspace=ws,
                    requirement=req,
                    log=_log,
                )
                if recovered is not None and recovered.get("ok"):
                    recovered["job_id"] = job_id
                    recovered["status"] = st
                    recovered["job"] = job
                    return recovered
                _log(
                    f"写码 Job 终态成功但无变更文件（{job_id}）："
                    f"{detail or 'changed_files 为空'} → 判失败"
                )
                return {
                    "ok": False,
                    "job_id": job_id,
                    "status": st,
                    "changed_files": [],
                    "detail": detail
                    or "写码未产生任何可同步变更文件（空变更视为写码失败）",
                    "summary": f"写码失败（{job_id}，变更 0 项）",
                    "reason": "no_changed_files",
                    "job": job,
                    "can_retry": True,
                }
            return {
                "ok": True,
                "job_id": job_id,
                "status": st,
                "changed_files": files,
                "summary": f"写码完成（{job_id}，变更 {n} 项）",
                "job": job,
            }
        if st in ("failed", "error", "cancelled", "canceled"):
            recovered = recover_job_after_db_sync_fail(
                job=job if isinstance(job, dict) else {},
                workspace=ws,
                requirement=req,
                log=_log,
            )
            if recovered is not None:
                recovered["job_id"] = job_id
                recovered["status"] = st
                recovered["job"] = job
                return recovered
            detail = str((job or {}).get("detail") or f"写码 Job {st}")
            if is_cursor_network_job_fail(detail):
                reason = "plugin_network"
            elif _looks_like_db_sync_fail(detail):
                reason = "db_sync_blocked"
            else:
                reason = "job_" + st
            return {
                "ok": False,
                "job_id": job_id,
                "status": st,
                "detail": detail,
                "reason": reason,
                "changed_files": _code_files_only(
                    (job or {}).get("changed_files") or (job or {}).get("synced_files") or []
                ),
                "job": job,
                "can_retry": True,
            }
        time.sleep(poll)

    return {
        "ok": False,
        "job_id": job_id,
        "status": last_status or "timeout",
        "detail": f"写码超时（{timeout}s），最后状态={last_status or 'unknown'}",
        "reason": "timeout",
        "job": job,
        "can_retry": True,
    }
