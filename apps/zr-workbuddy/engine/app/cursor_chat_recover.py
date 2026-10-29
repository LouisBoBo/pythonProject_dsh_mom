"""对话写码（cch-*）因 *.db EPERM 整单失败后的源码回收。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def cursor_chat_jobs_dir() -> Path:
    return Path.home() / ".zhongruan" / "cursor-chat" / "jobs"


def load_cchat_job(job_id: str) -> dict[str, Any] | None:
    jid = str(job_id or "").strip()
    if not jid.startswith(("cch-", "ccj-")):
        return None
    if "/" in jid or "\\" in jid or ".." in jid:
        return None
    path = cursor_chat_jobs_dir() / f"{jid}.json"
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    if str(data.get("id") or "").strip() != jid:
        data = {**data, "id": jid}
    return data


def recover_cchat_db_sync_fail(job_id: str) -> dict[str, Any]:
    """
    普通对话写码失败且原因为 *.db EPERM 时：从沙箱把非 db 源码写回 workspace。
    供引擎 HTTP / 客户端自动调用；不改 DSH 插件。
    """
    from .dev_pipeline.implement import (
        _looks_like_db_sync_fail,
        recover_job_after_db_sync_fail,
    )

    jid = str(job_id or "").strip()
    job = load_cchat_job(jid)
    if not job:
        return {"ok": False, "detail": f"任务不存在：{jid}", "code": "job_missing"}
    detail = str(job.get("detail") or job.get("error") or "")
    if not _looks_like_db_sync_fail(detail):
        return {
            "ok": False,
            "detail": "该任务不是 *.db 同步 EPERM 失败，不自动回收",
            "code": "not_db_eperm",
            "job_id": jid,
            "status": job.get("status"),
        }
    workspace = str(job.get("workspace") or "").strip()
    if not workspace:
        return {"ok": False, "detail": "任务缺少 workspace", "code": "no_workspace", "job_id": jid}
    requirement = str(job.get("requirement") or "").strip()
    out = recover_job_after_db_sync_fail(
        job=job,
        workspace=workspace,
        requirement=requirement,
    )
    if out is None:
        return {"ok": False, "detail": "无法回收", "code": "no_recover", "job_id": jid}
    files = out.get("changed_files") if isinstance(out.get("changed_files"), list) else []
    deleted = out.get("deleted_files") if isinstance(out.get("deleted_files"), list) else []
    landed = list(files)
    for rel in deleted:
        text = str(rel or "").replace("\\", "/").strip()
        if text and text not in landed:
            landed.append(text)
    out = {**out, "job_id": jid, "workspace": workspace}
    if out.get("ok") and landed:
        try:
            from datetime import datetime, timezone

            job["recovered"] = True
            job["recovered_files"] = landed
            job["recovered_deleted"] = [str(x).replace("\\", "/") for x in deleted if str(x).strip()]
            job["updated_at"] = datetime.now(timezone.utc).isoformat()
            path = cursor_chat_jobs_dir() / f"{jid}.json"
            path.write_text(
                json.dumps(job, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError:
            pass
    return out
