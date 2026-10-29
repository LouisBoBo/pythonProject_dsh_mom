"""视觉附件落盘（engine/data/vision/）。"""
from __future__ import annotations

import json
import re
import secrets
import time
from pathlib import Path
from typing import Any

from . import media as vision_media

_ENGINE_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_DATA = _ENGINE_ROOT / "data"
_data_dir_override: Path | None = None


def set_data_dir_override(path: Path | None) -> None:
    global _data_dir_override
    _data_dir_override = path


def data_root() -> Path:
    if _data_dir_override is not None:
        return _data_dir_override
    return _DEFAULT_DATA


def vision_root() -> Path:
    p = data_root() / "vision"
    p.mkdir(parents=True, exist_ok=True)
    return p


def uploads_dir() -> Path:
    p = vision_root() / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p


def pending_dir() -> Path:
    p = vision_root() / "session_pending"
    p.mkdir(parents=True, exist_ok=True)
    return p


def new_image_id() -> str:
    return "vimg-" + secrets.token_hex(8)


def _safe_sid(session_id: str) -> str:
    s = (session_id or "").strip()
    if not s:
        return ""
    return re.sub(r"[^\w\-.:@+/]", "_", s)[:160]


def save_bytes(
    data: bytes,
    *,
    filename: str = "",
    content_type: str = "",
    user_id: str = "",
    purpose: str = "",
) -> dict[str, Any]:
    check = vision_media.validate_bytes(data, filename=filename, content_type=content_type)
    if not check.get("ok"):
        return check
    suf = str(check["suffix"])
    iid = new_image_id()
    stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", Path(filename or "img").stem)[:40] or "img"
    out_name = f"{iid}_{stem}{suf}"
    out_path = uploads_dir() / out_name
    meta = {
        "image_id": iid,
        "filename": filename or out_name,
        "rel_path": f"vision/uploads/{out_name}",
        "suffix": suf,
        "mime": check["mime"],
        "bytes": check["bytes"],
        "user_id": user_id or "",
        "purpose": purpose or "",
        "created_at": int(time.time()),
    }
    try:
        out_path.write_bytes(data)
        (uploads_dir() / f"{iid}.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError as e:
        return {"ok": False, "detail": f"保存失败：{e}"}
    return {"ok": True, **meta}


def load_image(image_id: str) -> dict[str, Any]:
    iid = (image_id or "").strip()
    if not iid or not re.match(r"^vimg-[a-f0-9]{16}$", iid):
        return {"ok": False, "detail": "无效 image_id"}
    meta_path = uploads_dir() / f"{iid}.json"
    if not meta_path.is_file():
        return {"ok": False, "detail": "图片不存在或已过期"}
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"ok": False, "detail": "图片元数据损坏"}
    rel = str(meta.get("rel_path") or "")
    if ".." in rel or not rel.startswith("vision/uploads/"):
        return {"ok": False, "detail": "非法路径"}
    fp = data_root() / rel
    if not fp.is_file():
        return {"ok": False, "detail": "图片文件缺失"}
    try:
        raw = fp.read_bytes()
    except OSError:
        return {"ok": False, "detail": "读取图片失败"}
    return {"ok": True, "meta": meta, "data": raw, "suffix": meta.get("suffix") or ".png"}


def list_pending(session_id: str) -> dict[str, Any]:
    sid = _safe_sid(session_id)
    if not sid:
        return {"ok": False, "detail": "缺少 sessionId", "image_ids": []}
    fp = pending_dir() / f"{sid}.json"
    if not fp.is_file():
        return {"ok": True, "session_id": sid, "image_ids": []}
    try:
        doc = json.loads(fp.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"ok": True, "session_id": sid, "image_ids": []}
    ids = [str(x) for x in (doc.get("image_ids") or []) if str(x).strip()]
    return {"ok": True, "session_id": sid, "image_ids": ids[: vision_media.MAX_IMAGES]}


def append_pending(session_id: str, image_ids: list[str]) -> dict[str, Any]:
    sid = _safe_sid(session_id)
    if not sid:
        return {"ok": False, "detail": "缺少 sessionId"}
    cur = list_pending(sid)
    merged: list[str] = []
    for x in list(cur.get("image_ids") or []) + list(image_ids or []):
        s = str(x or "").strip()
        if s and s not in merged:
            merged.append(s)
    merged = merged[-vision_media.MAX_IMAGES :]
    fp = pending_dir() / f"{sid}.json"
    doc = {
        "session_id": sid,
        "image_ids": merged,
        "updated_at": int(time.time()),
    }
    fp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, **doc}


def consume_pending(session_id: str) -> dict[str, Any]:
    """取出并清空会话待用附图（供 begin 一次性消费）。"""
    sid = _safe_sid(session_id)
    if not sid:
        return {"ok": True, "image_ids": []}
    cur = list_pending(sid)
    ids = list(cur.get("image_ids") or [])
    fp = pending_dir() / f"{sid}.json"
    try:
        if fp.is_file():
            fp.unlink()
    except OSError:
        pass
    return {"ok": True, "session_id": sid, "image_ids": ids}
