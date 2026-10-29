"""图片校验与 data-URL 编码。"""
from __future__ import annotations

import base64
import re
from typing import Any

ALLOWED_SUFFIX = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"}
MIME_BY_SUFFIX = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGES = 6


def magic_ok(data: bytes, suffix: str) -> bool:
    if not data:
        return False
    suf = (suffix or "").lower()
    if suf == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if suf in {".jpg", ".jpeg"}:
        return data.startswith(b"\xff\xd8\xff")
    if suf == ".gif":
        return data.startswith(b"GIF87a") or data.startswith(b"GIF89a")
    if suf == ".webp":
        return len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    if suf == ".bmp":
        return data.startswith(b"BM")
    return False


def guess_suffix(filename: str = "", content_type: str = "", data: bytes | None = None) -> str:
    name = (filename or "").strip()
    if "." in name:
        suf = "." + name.rsplit(".", 1)[-1].lower()
        if suf == ".jpeg":
            return ".jpg"
        if suf in ALLOWED_SUFFIX:
            return suf
    ct = (content_type or "").lower()
    if "png" in ct:
        return ".png"
    if "jpeg" in ct or "jpg" in ct:
        return ".jpg"
    if "gif" in ct:
        return ".gif"
    if "webp" in ct:
        return ".webp"
    if "bmp" in ct:
        return ".bmp"
    if data:
        for suf in (".png", ".jpg", ".gif", ".webp", ".bmp"):
            if magic_ok(data, suf):
                return suf
    return ""


def mime_for_suffix(suffix: str) -> str:
    suf = (suffix or "").lower()
    if suf == ".jpeg":
        suf = ".jpg"
    return MIME_BY_SUFFIX.get(suf, "application/octet-stream")


def to_data_url(data: bytes, suffix: str) -> str:
    mime = mime_for_suffix(suffix)
    b64 = base64.standard_b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def parse_data_url(raw: str) -> tuple[bytes, str] | None:
    s = (raw or "").strip()
    m = re.match(
        r"^data:(image/(?:png|jpeg|jpg|gif|webp|bmp));base64,(.+)$",
        s,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return None
    mime = m.group(1).lower()
    try:
        data = base64.standard_b64decode(m.group(2))
    except Exception:
        return None
    if "png" in mime:
        suf = ".png"
    elif "gif" in mime:
        suf = ".gif"
    elif "webp" in mime:
        suf = ".webp"
    elif "bmp" in mime:
        suf = ".bmp"
    else:
        suf = ".jpg"
    if not magic_ok(data, suf):
        return None
    return data, suf


def validate_bytes(data: bytes, *, filename: str = "", content_type: str = "") -> dict[str, Any]:
    if not data:
        return {"ok": False, "detail": "空图片"}
    if len(data) > MAX_IMAGE_BYTES:
        return {"ok": False, "detail": "单张图片请不超过 5MB"}
    suf = guess_suffix(filename, content_type, data)
    if not suf:
        return {"ok": False, "detail": "不支持的图片类型（仅 png/jpg/gif/webp/bmp）"}
    if not magic_ok(data, suf):
        return {"ok": False, "detail": "图片内容与类型不符"}
    return {"ok": True, "suffix": suf, "mime": mime_for_suffix(suf), "bytes": len(data)}
