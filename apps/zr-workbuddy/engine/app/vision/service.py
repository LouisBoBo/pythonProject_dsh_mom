"""视觉识图对外服务。"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence

from . import client as vision_client
from . import media as vision_media
from . import store as vision_store
from .config import get_vision_config

REQ_INTAKE_PROMPT = (
    "你是需求截图精读助手。必须只依据图片可见内容作答，用中文输出，禁止套话"
    "（禁止写「请随时补充」「结构化需求草稿」等空话），不要写代码。\n"
    "先判断图片类型，再按对应结构提取（看不到的写「未见」）。\n"
    "侧栏/模块名硬规则：只抄图上或表中真实出现的菜单·导航·模块原文；未见写「未见」。"
    "禁止假设或默认写成「生产管理」「仓储管理」或任何图上未出现的侧栏名。\n"
    "\n"
    "## A. 若是需求跟踪表 / PRD 行（含编码如 R04、项目、本项、功能要求、验收）\n"
    "### 需求条目\n"
    "- 编码：\n"
    "- 模块/项目：只抄表中该列原文；禁止用制造业默认菜单名填空\n"
    "- 本项/现状问题：（逐字抄录）\n"
    "- 功能要求：（①②③…逐条抄录，禁止改写）\n"
    "- 验收标准：（①②③…逐条抄录）\n"
    "- 优先级 / 业务目标：\n"
    "要求：以表中「功能要求」「本项」为需求真相源；"
    "禁止套用任何示例业务（禁止自行写成低库存/入库/加列等图中未出现的需求）。\n"
    "\n"
    "## B. 若是软件业务界面截图（列表/表单/看板）\n"
    "### 页面定位\n"
    "- 页面标题：只写界面上真实可见的主标题原文；未见则写「未见」。"
    "禁止照抄本提示中的任何样例词。\n"
    "- 菜单/导航路径：只抄侧栏或面包屑可见原文；未见写「未见」；"
    "禁止默认「生产管理 / 仓储管理」\n"
    "- 页面类型：列表页 / 表单 / 看板 / 弹窗 / 其它\n"
    "### 筛选与操作\n"
    "- 筛选项：\n"
    "- 按钮：\n"
    "### 表格（若有）\n"
    "- 表头列名（从左到右完整列出）\n"
    "- 可见示例行（最多 3 行）\n"
    "- 分页/合计文案\n"
    "### 标注与改动暗示\n"
    "- 附图附加文字：逐字抄录图上叠加批注/手写/打字说明（含图上方大字标题、红字需求句）；"
    "例如「xxx在红框处新增yyy列」必须原样抄入，禁止改写成只描述红框位置\n"
    "- 红框/箭头/高亮：如实写圈住的是行、单元格、列还是区域；"
    "仅当明显是在两列表头之间加列时才写「位于第N列和第M列之间」；"
    "不要把圈行/示例行硬写成列插入；改动意图采用附加文字原文\n"
    "要求：页面标题与列名必须来自图面原文；禁止把批注字段名擅自替换成其它词。"
)


def get_status() -> dict[str, Any]:
    cfg = get_vision_config()
    return {
        "ok": True,
        "configured": bool(cfg.get("configured")),
        "model": cfg.get("model") or "",
        "base_url": cfg.get("base_url") or "",
        "has_api_key": bool(cfg.get("api_key")),
        "detail": (
            "视觉模型已配置"
            if cfg.get("configured")
            else "请在配置中心填写 vision.api_key / base_url / model（智谱 glm-4v-flash）"
        ),
    }


def save_upload(
    data: bytes,
    *,
    filename: str = "",
    content_type: str = "",
    user_id: str = "",
    purpose: str = "",
    session_id: str = "",
) -> dict[str, Any]:
    out = vision_store.save_bytes(
        data,
        filename=filename,
        content_type=content_type,
        user_id=user_id,
        purpose=purpose,
    )
    if not out.get("ok"):
        return out
    sid = (session_id or "").strip()
    if sid:
        pend = vision_store.append_pending(sid, [str(out.get("image_id") or "")])
        out["pending"] = pend
    # 不回传二进制
    return {k: v for k, v in out.items() if k != "data"}


def _resolve_one(item: Any) -> dict[str, Any]:
    """支持：image_id / data URL / 本机绝对路径（仅引擎 data/vision 下）。"""
    if isinstance(item, dict):
        iid = str(item.get("image_id") or item.get("id") or "").strip()
        if iid:
            return vision_store.load_image(iid)
        b64 = item.get("base64") or item.get("data_base64")
        if b64:
            raw = str(b64)
            if not raw.startswith("data:"):
                raw = "data:image/png;base64," + raw
            parsed = vision_media.parse_data_url(raw)
            if not parsed:
                return {"ok": False, "detail": "无效 base64 图片"}
            data, suf = parsed
            return {"ok": True, "data": data, "suffix": suf, "meta": {"source": "base64"}}
        path = str(item.get("path") or "").strip()
        if path:
            return _resolve_path(path)
        return {"ok": False, "detail": "无法解析图片项"}
    s = str(item or "").strip()
    if not s:
        return {"ok": False, "detail": "空图片项"}
    if s.startswith("vimg-"):
        return vision_store.load_image(s)
    if s.startswith("data:image/"):
        parsed = vision_media.parse_data_url(s)
        if not parsed:
            return {"ok": False, "detail": "无效 data URL"}
        data, suf = parsed
        return {"ok": True, "data": data, "suffix": suf, "meta": {"source": "data_url"}}
    return _resolve_path(s)


def _path_under_vision_root(p: Path, root: Path) -> Path | None:
    """resolve 后必须在 vision_root 内（防 .. / 符号链接逃逸）。"""
    try:
        resolved = p.expanduser().resolve(strict=True)
        resolved.relative_to(root)
        return resolved
    except (OSError, ValueError):
        return None


def _resolve_path(path: str) -> dict[str, Any]:
    root = vision_store.vision_root().resolve()
    raw = (path or "").strip()
    if not raw:
        return {"ok": False, "detail": "路径无效"}
    rel = raw.replace("\\", "/")
    if rel.startswith("vision/uploads/"):
        p = _path_under_vision_root(vision_store.data_root() / rel, root)
    else:
        p = _path_under_vision_root(Path(raw), root)
    if p is None:
        return {"ok": False, "detail": "仅允许读取 engine/data/vision 下已上传图片"}
    if not p.is_file():
        return {"ok": False, "detail": "文件不存在"}
    try:
        data = p.read_bytes()
    except OSError:
        return {"ok": False, "detail": "读取失败"}
    check = vision_media.validate_bytes(data, filename=p.name)
    if not check.get("ok"):
        return check
    return {"ok": True, "data": data, "suffix": check["suffix"], "meta": {"path": str(p)}}


def understand(
    images: Sequence[Any],
    *,
    prompt: str = "",
    purpose: str = "",
) -> dict[str, Any]:
    items = list(images or [])[: vision_media.MAX_IMAGES]
    if not items:
        return {"ok": False, "detail": "请提供至少一张图片"}
    data_urls: list[str] = []
    metas: list[dict[str, Any]] = []
    for it in items:
        got = _resolve_one(it)
        if not got.get("ok"):
            return {"ok": False, "detail": got.get("detail") or "图片解析失败"}
        data = got["data"]
        suf = str(got.get("suffix") or ".png")
        check = vision_media.validate_bytes(data, filename="x" + suf)
        if not check.get("ok"):
            return check
        data_urls.append(vision_media.to_data_url(data, suf))
        meta = got.get("meta") if isinstance(got.get("meta"), dict) else {}
        metas.append(
            {
                "image_id": meta.get("image_id") or "",
                "bytes": len(data),
                "suffix": suf,
            }
        )
    text_prompt = (prompt or "").strip()
    if not text_prompt:
        if (purpose or "").strip() in ("req_intake", "dev_pipeline", "intake"):
            text_prompt = REQ_INTAKE_PROMPT
        else:
            text_prompt = "请用中文详细描述图片中的内容、文字与关键信息。"
    out = vision_client.chat_vision(prompt=text_prompt, image_data_urls=data_urls)
    if not out.get("ok"):
        return out
    return {
        "ok": True,
        "text": out.get("text") or "",
        "model": out.get("model") or "",
        "images": metas,
        "purpose": purpose or "",
    }


def understand_paths(paths: Sequence[str], *, prompt: str = "", purpose: str = "") -> dict[str, Any]:
    return understand(list(paths or []), prompt=prompt, purpose=purpose)


def understand_image_ids(
    image_ids: Sequence[str], *, prompt: str = "", purpose: str = ""
) -> dict[str, Any]:
    return understand(list(image_ids or []), prompt=prompt, purpose=purpose)
