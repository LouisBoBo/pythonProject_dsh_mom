"""公司共享知识库：引擎旁路调中央 @zhongruan/dsh-knowledge 公开 API。

未配置 base_url / token 时全部接口返回「尚未接入」，不影响本机知识库。
密钥只从 config.yaml 的 company_knowledge 读取，不进仓库。
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from .config_store import load_config

_LOG = logging.getLogger("workbuddy.company_knowledge")

DEFAULT_API_PREFIX = "/knowledge-api/v1"
DEFAULT_TIMEOUT_MS = 10_000
MAX_CITE_CHARS = 14_000
MAX_SNIPPET = 4_800
_SAFE_FILENAME_RE = re.compile(r"^[^\\/]+$")

# PDF 抽字常见杂质：控制符、CJK 被空格拆开
_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
_CJK_GAP_RE = re.compile(
    r"(?<=[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef])"
    r"[ \t\u00a0\u3000]+"
    r"(?=[\u2e80-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef])"
)
_QUERY_TERM_RE = re.compile(
    r"[A-Za-z][A-Za-z0-9_./-]{0,31}"
    r"|P\d+"
    r"|[\u2e80-\u9fff\uf900-\ufaff]{2,12}"
    r"|\d{1,4}",
)


def _section(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = (cfg if cfg is not None else load_config()).get("company_knowledge") or {}
    return raw if isinstance(raw, dict) else {}


def _sanitize_base_url(raw: str) -> str:
    """只允许 http(s)；拒绝 file/gopher 等，降低配置面 SSRF。"""
    base = str(raw or "").strip().rstrip("/")
    if not base:
        return ""
    try:
        u = urlparse(base)
    except Exception:  # noqa: BLE001
        return ""
    if (u.scheme or "").lower() not in {"http", "https"} or not u.netloc:
        return ""
    # 禁止 userinfo 嵌进 URL（避免把密钥写进日志/异常）
    if u.username or u.password:
        return ""
    return base


def _safe_import_filename(name: str) -> str:
    """导入文件名：去路径与控制符，防 query/header 注入。"""
    raw = str(name or "").strip().replace("\\", "/")
    base = raw.rsplit("/", 1)[-1].strip()
    base = _CTRL_RE.sub("", base).replace("\r", "").replace("\n", "")
    if not base or base in {".", ".."} or not _SAFE_FILENAME_RE.match(base):
        return ""
    return base[:200]


def settings(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    sec = _section(cfg)
    base = _sanitize_base_url(str(sec.get("base_url") or ""))
    prefix = str(sec.get("api_prefix") or DEFAULT_API_PREFIX).strip() or DEFAULT_API_PREFIX
    if not prefix.startswith("/"):
        prefix = "/" + prefix
    prefix = prefix.rstrip("/") or DEFAULT_API_PREFIX
    try:
        timeout_ms = int(sec.get("timeout_ms") or DEFAULT_TIMEOUT_MS)
    except (TypeError, ValueError):
        timeout_ms = DEFAULT_TIMEOUT_MS
    timeout_ms = max(100, min(timeout_ms, 120_000))
    verify_ssl = sec.get("verify_ssl")
    if verify_ssl is None:
        verify_ssl = True
    return {
        "base_url": base,
        "api_prefix": prefix,
        "read_token": str(sec.get("read_token") or "").strip(),
        "write_token": str(sec.get("write_token") or "").strip(),
        "knowledge_base_id": str(sec.get("knowledge_base_id") or "").strip(),
        "timeout_ms": timeout_ms,
        # 中央机若用自签证书（如现网 8093），可设 false
        "verify_ssl": bool(verify_ssl),
    }


def is_configured(cfg: dict[str, Any] | None = None) -> bool:
    s = settings(cfg)
    return bool(s["base_url"] and s["read_token"] and len(s["read_token"]) >= 24)


def can_write(cfg: dict[str, Any] | None = None) -> bool:
    s = settings(cfg)
    return is_configured(cfg) and bool(s["write_token"] and len(s["write_token"]) >= 24)


def status_payload(*, role: str = "", reveal_config: bool = True) -> dict[str, Any]:
    """给侧栏上传目标选择用：未配置则 can_upload_company=false（不改本机导入行为）。

    show_company_sidebar / can_read_company：已接入则全员侧栏可见只读共享库
    （文档范围仍受人员页 company_knowledge_access 白名单约束）。
    can_upload_company：仅管理员且有 write_token 时可新建/导入/删除。

    reveal_config=False：未登录探测不泄露「中央库是否已接入」（避免公网匿名踩点）。
    """
    cfg = load_config()
    configured = bool(reveal_config and is_configured(cfg))
    admin = str(role or "").strip() == "admin"
    return {
        "ok": True,
        "configured": configured,
        "is_admin": admin,
        "show_company_sidebar": configured,
        "can_upload_company": bool(configured and admin and can_write(cfg)),
        "can_read_company": configured,
        "detail": ""
        if configured
        else (
            ""
            if not reveal_config
            else "公司共享知识库尚未接入（需发版种子 company-knowledge.env；启动时自动合并）"
        ),
    }


def _not_configured() -> dict[str, Any]:
    return {
        "ok": False,
        "code": "not_configured",
        "detail": "公司共享知识库尚未接入：请确认安装包含 company-knowledge.env，并重启 WorkBuddy",
    }


def _central_unavailable(exc: BaseException) -> dict[str, Any]:
    # 不对客户端回传异常原文（可能含内网 URL / 证书细节）
    _LOG.warning("company knowledge central unavailable: %s", exc)
    return {
        "ok": False,
        "code": "unavailable",
        "detail": "公司知识暂不可用（中央服务不可达或超时）",
    }


def _http_error(detail: str, *, status: int) -> dict[str, Any]:
    """中央 HTTP 失败：不把 upstream 原文回给浏览器（防泄漏）。"""
    return {
        "ok": False,
        "code": "http_error",
        "detail": detail or f"公司知识请求失败 HTTP {status}",
    }


async def _request(
    method: str,
    path: str,
    *,
    token: str,
    cfg: dict[str, Any] | None = None,
    json_body: dict[str, Any] | None = None,
    content: bytes | None = None,
    content_type: str | None = None,
    params: dict[str, str] | None = None,
) -> tuple[int, Any]:
    s = settings(cfg)
    url = f"{s['base_url']}{s['api_prefix']}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    if content_type:
        headers["Content-Type"] = content_type
    timeout = httpx.Timeout(s["timeout_ms"] / 1000.0)
    async with httpx.AsyncClient(
        timeout=timeout,
        follow_redirects=False,
        verify=s["verify_ssl"],
    ) as client:
        resp = await client.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
            content=content,
        )
    try:
        data = resp.json()
    except Exception:
        data = {"raw": (resp.text or "")[:500]}
    return resp.status_code, data


async def list_knowledge_bases(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    if not is_configured(cfg):
        return _not_configured()
    s = settings(cfg)
    try:
        status, data = await _request("GET", "/knowledge-bases", token=s["read_token"], cfg=cfg)
    except Exception as exc:
        _LOG.warning("list company knowledge bases failed: %s", exc)
        return _central_unavailable(exc)
    if status >= 400:
        return _http_error(f"列出公司知识库失败 HTTP {status}", status=status)
    items = data if isinstance(data, list) else (data.get("items") if isinstance(data, dict) else None)
    if not isinstance(items, list):
        items = []
    return {"ok": True, "bases": items}


async def resolve_import_base_id(cfg: dict[str, Any] | None = None) -> tuple[str, dict[str, Any] | None]:
    """返回 (base_id, error_payload)。"""
    s = settings(cfg)
    if s["knowledge_base_id"]:
        return s["knowledge_base_id"], None
    listed = await list_knowledge_bases(cfg)
    if not listed.get("ok"):
        return "", listed
    bases = listed.get("bases") or []
    active = [
        b
        for b in bases
        if isinstance(b, dict) and str(b.get("status") or "active") != "archived"
    ]
    if not active:
        return "", {
            "ok": False,
            "code": "no_base",
            "detail": "中央知识服务没有可用的知识库，请先在中央机创建公司库",
        }

    def _score(b: dict[str, Any]) -> tuple[int, str]:
        name = str(b.get("name") or b.get("title") or "")
        bid = str(b.get("id") or "")
        score = 0
        if "公司" in name or "共享" in name:
            score += 2
        if bid == "default" or name in ("默认知识库", "Default"):
            score += 1
        return (-score, name or bid)

    active.sort(key=_score)
    pick = active[0]
    return str(pick.get("id") or ""), None


def _clean_knowledge_text(text: str) -> str:
    value = _CTRL_RE.sub("", str(text or ""))
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = _CJK_GAP_RE.sub("", value)
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _query_terms(query: str) -> list[str]:
    raw = (query or "").strip()
    if not raw:
        return []
    found = _QUERY_TERM_RE.findall(raw)
    # 去重；长词优先，避免先命中过短噪声
    uniq: list[str] = []
    seen: set[str] = set()
    for term in sorted(found, key=lambda t: (-len(t), t.lower())):
        key = term.lower()
        if key in seen:
            continue
        if key in {"的", "了", "和", "与", "或", "是", "在", "项", "三", "四", "五"}:
            continue
        seen.add(key)
        uniq.append(term)
        if len(uniq) >= 12:
            break
    return uniq


def _snippet_for_query(body: str, query: str, *, max_chars: int = MAX_SNIPPET) -> str:
    """长文档不要总截文首：按问句词密度选窗口（避免「二期规划」只打到标题）。"""
    text = _clean_knowledge_text(body)
    if not text:
        return ""
    budget = max(400, min(int(max_chars or MAX_SNIPPET), 12_000))
    if len(text) <= budget:
        return text

    terms = _query_terms(query)
    if not terms:
        return text[:budget] + "…"

    lower = text.lower()
    needles = [t.lower() for t in terms]
    # 滑动窗口：命中词数优先，其次更靠后（正文段通常在标题/目录之后）
    step = max(80, budget // 10)
    best_start = 0
    best_key = (-1, -1)  # (term_hits, start)
    last = max(0, len(text) - budget)
    for start in range(0, last + 1, step):
        window = lower[start : start + budget]
        hits = sum(1 for n in needles if n in window)
        if hits <= 0:
            continue
        key = (hits, start)
        if key > best_key:
            best_key = key
            best_start = start
    # 再扫一遍各词首次出现，防止步长跳过密集群
    for n in needles:
        idx = lower.find(n)
        if idx < 0:
            continue
        start = max(0, min(last, idx - budget // 3))
        window = lower[start : start + budget]
        hits = sum(1 for x in needles if x in window)
        key = (hits, start)
        if key > best_key:
            best_key = key
            best_start = start

    if best_key[0] <= 0:
        return text[:budget] + "…"

    piece = text[best_start : best_start + budget].strip()
    if best_start > 0:
        piece = "…" + piece
    if best_start + budget < len(text):
        piece = piece + "…"
    return piece


async def search(query: str, *, limit: int = 8, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    if not is_configured(cfg):
        return _not_configured()
    text = (query or "").strip()
    if not text:
        return {"ok": False, "code": "bad_request", "detail": "检索问题不能为空"}
    # 防异常超长问句拖垮中央检索
    if len(text) > 2000:
        text = text[:2000]
    s = settings(cfg)
    body: dict[str, Any] = {
        "text": text,
        "limit": max(1, min(int(limit or 8), 20)),
    }
    if s["knowledge_base_id"]:
        body["knowledgeBaseIds"] = [s["knowledge_base_id"]]
    try:
        status, data = await _request(
            "POST",
            "/search",
            token=s["read_token"],
            cfg=cfg,
            json_body=body,
        )
    except Exception as exc:
        _LOG.warning("company knowledge search failed: %s", exc)
        return _central_unavailable(exc)
    if status >= 400:
        return _http_error(f"检索公司知识失败 HTTP {status}", status=status)
    rows = data if isinstance(data, list) else []
    hits: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        entry = row.get("entry") if isinstance(row.get("entry"), dict) else row
        if not isinstance(entry, dict):
            continue
        body_text = str(entry.get("body") or "")
        snippet = _snippet_for_query(body_text, text, max_chars=MAX_SNIPPET)
        hits.append(
            {
                "id": entry.get("id"),
                "title": entry.get("title") or "",
                "knowledge_base_id": entry.get("knowledgeBaseId")
                or entry.get("knowledge_base_id")
                or "",
                "score": row.get("score"),
                "snippet": snippet,
            }
        )
    return {"ok": True, "query": text, "hits": hits, "count": len(hits)}


def _display_query(query: str, *, max_len: int = 80) -> str:
    """写入摘录标题用的问句：去控制符/换行并截断，避免把注入指令嵌进工具结果。"""
    s = _CTRL_RE.sub("", str(query or ""))
    s = s.replace("\r", " ").replace("\n", " ").strip()
    s = re.sub(r"[ \t]{2,}", " ", s)
    if len(s) > max_len:
        s = s[:max_len] + "…"
    return s


def _format_cite(hits: list[dict[str, Any]], query: str) -> str:
    q_show = _display_query(query)
    if not hits:
        return (
            f"公司共享知识库中未找到与「{q_show}」相关的文档。"
            "（仅检索公司库；本机私有文档请用本机知识库挂载召回。）"
        )
    parts = [f"以下摘自公司共享知识库（问句：{q_show}）：", ""]
    used = 0
    for i, h in enumerate(hits, 1):
        title = str(h.get("title") or h.get("id") or f"文档{i}")
        snip = str(h.get("snippet") or "").strip()
        block = f"### [{i}] {title}\n{snip}\n"
        if used + len(block) > MAX_CITE_CHARS:
            parts.append("（后续命中已省略）")
            break
        parts.append(block)
        used += len(block)
    parts.append("请仅依据以上公司库摘录回答；未出现的内容不要编造。")
    return "\n".join(parts)


# 给用户看的定稿句（模型应原样转述）。故意不提「留档/历史摘录」等词，避免模型学会绕过话术。
_ACL_DENIED_USER = (
    "当前账号无权召回公司共享知识库中的相关文档，请联系管理员在「人员」页勾选后再问。"
    "我不能提供任何公司库正文或计价数字。"
)
_UNAVAILABLE_USER = (
    "公司共享知识库暂时不可用，无法当场核实。"
    "我不能根据记忆提供任何公司库正文或计价数字；请稍后再试或联系管理员。"
)
_NOT_FOUND_USER = (
    "公司共享知识库未命中相关文档。"
    "我不能根据记忆编造公司库正文或计价数字。"
)
_AUTH_REQUIRED_USER = "请先登录后再检索公司共享知识库。我不能根据记忆提供公司库正文或计价数字。"


def _cite_block(*, code: str, user_reply: str, filtered: bool = False) -> dict[str, Any]:
    """失败/无权：ok=false + 短 detail，避免把绕过话术教给模型。"""
    out: dict[str, Any] = {
        "ok": False,
        "code": code,
        "reply": user_reply,
        "detail": code,
        "source": "company_knowledge",
        "count": 0,
        "hits": [],
        # 给 Agent 的硬指令（会出现在工具结果里）
        "assistant_must_say": user_reply,
        "block_memory_quote": True,
    }
    if filtered:
        out["filtered"] = True
    return out


async def cite(
    query: str,
    *,
    limit: int = 8,
    cfg: dict[str, Any] | None = None,
    user_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """供 Agent 工具：检索公司库并拼成可引用正文。

    user_row：当前登录人；按共享库召回权限过滤命中（无权限篇不返回）。
    **未登录不得返回命中**（避免绕过 ACL 读全库）。
    ACL 挡住的命中必须返回 ok=false / code=acl_denied，禁止软成功诱使模型用记忆补全文。
    """
    if user_row is None:
        return _cite_block(code="auth_required", user_reply=_AUTH_REQUIRED_USER)

    from .auth.company_knowledge_access import (
        effective_company_knowledge_access,
        filter_hits_for_user,
    )

    access = effective_company_knowledge_access(user_row)
    # 白名单为空：中央可能仍能搜到，但本账号一篇都不能回——直接无权，避免模型当成「未收录」去翻记忆
    if not access.get("allow_all") and not (access.get("entry_ids") or []):
        return _cite_block(code="acl_denied", user_reply=_ACL_DENIED_USER, filtered=True)

    out = await search(query, limit=limit, cfg=cfg)
    if not out.get("ok"):
        code = str(out.get("code") or "unavailable")
        if code in {"unavailable", "not_configured"}:
            return _cite_block(code=code, user_reply=_UNAVAILABLE_USER)
        return _cite_block(
            code=code or "error",
            user_reply=_UNAVAILABLE_USER,
        )
    hits = list(out.get("hits") or [])
    before = len(hits)
    hits = filter_hits_for_user(hits, user_row)
    q = str(out.get("query") or query)
    if before and not hits:
        return _cite_block(code="acl_denied", user_reply=_ACL_DENIED_USER, filtered=True)
    if not hits:
        # 定稿句不回显问句：避免用户把绕过指令塞进 question → assistant_must_say
        return _cite_block(code="not_found", user_reply=_NOT_FOUND_USER)
    reply = _format_cite(hits, q)
    return {
        "ok": True,
        "reply": reply,
        "detail": reply,
        "source": "company_knowledge",
        "count": len(hits),
        "hits": [
            {"id": h.get("id"), "title": h.get("title"), "knowledge_base_id": h.get("knowledge_base_id")}
            for h in hits
        ],
    }


def _entry_summary(entry: dict[str, Any], *, include_body: bool = False) -> dict[str, Any]:
    """侧栏目录用摘要；body 仅在读单篇时带上。"""
    body = str(entry.get("body") or "")
    out: dict[str, Any] = {
        "id": str(entry.get("id") or ""),
        "title": str(entry.get("title") or "").strip() or "未命名",
        "knowledge_base_id": str(
            entry.get("knowledgeBaseId") or entry.get("knowledge_base_id") or ""
        ),
        "type": entry.get("type") or "fact",
        "tags": entry.get("tags") if isinstance(entry.get("tags"), list) else [],
        "status": entry.get("status") or "active",
        "document_state": entry.get("documentState") or entry.get("document_state") or "open",
        "updated_at": entry.get("updatedAt") or entry.get("updated_at") or "",
        "created_at": entry.get("createdAt") or entry.get("created_at") or "",
        "source": "company",
        "rel_path": f"共享/{str(entry.get('title') or entry.get('id') or '文档').strip()}",
    }
    if include_body:
        out["body"] = body
    return out


async def list_entries(
    *,
    limit: int = 100,
    status: str = "active",
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """侧栏列出共享知识库文档（免挂载；只读）。"""
    if not is_configured(cfg):
        return _not_configured()
    s = settings(cfg)
    # 中央 dsh-knowledge 公开 API：limit 仅允许 1～100
    params: dict[str, str] = {
        "limit": str(max(1, min(int(limit or 100), 100))),
        "status": (status or "active").strip() or "active",
    }
    if s["knowledge_base_id"]:
        params["knowledgeBaseId"] = s["knowledge_base_id"]
    try:
        http_status, data = await _request(
            "GET",
            "/entries",
            token=s["read_token"],
            cfg=cfg,
            params=params,
        )
    except Exception as exc:
        _LOG.warning("company knowledge list failed: %s", exc)
        return _central_unavailable(exc)
    if http_status >= 400:
        if isinstance(data, dict):
            _LOG.warning(
                "company knowledge list HTTP %s: %s",
                http_status,
                data.get("error") or data.get("detail") or data.get("message") or "",
            )
        return _http_error(f"列出公司知识失败 HTTP {http_status}", status=http_status)
    raw_items = data.get("items") if isinstance(data, dict) else data
    if not isinstance(raw_items, list):
        raw_items = []
    items = [
        _entry_summary(row, include_body=False)
        for row in raw_items
        if isinstance(row, dict) and str(row.get("id") or "").strip()
    ]
    return {
        "ok": True,
        "source": "company_knowledge",
        "count": len(items),
        "items": items,
        "base": {
            "id": "__workbuddy_company__",
            "name": "共享知识库",
            "source": "company",
        },
    }


async def get_entry(entry_id: str, *, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """侧栏打开公司共享库单篇（含正文）。"""
    if not is_configured(cfg):
        return _not_configured()
    eid = (entry_id or "").strip()
    if not eid:
        return {"ok": False, "code": "bad_request", "detail": "缺少文档 id"}
    s = settings(cfg)
    try:
        http_status, data = await _request(
            "GET",
            f"/entries/{quote(eid, safe='')}",
            token=s["read_token"],
            cfg=cfg,
        )
    except Exception as exc:
        _LOG.warning("company knowledge get entry failed: %s", exc)
        return _central_unavailable(exc)
    if http_status == 404:
        return {"ok": False, "code": "not_found", "detail": "公司库中未找到该文档"}
    if http_status >= 400 or not isinstance(data, dict):
        return _http_error(f"读取公司知识失败 HTTP {http_status}", status=http_status)
    summary = _entry_summary(data, include_body=True)
    return {"ok": True, "source": "company_knowledge", "entry": summary}


def _draft_from_body(body: dict[str, Any], *, cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    """规范化侧栏新建/保存草稿；失败返回 ok=False 的 error payload。"""
    s = settings(cfg)
    title = str(body.get("title") or "").strip()
    text = str(body.get("body") or "").strip()
    if not title or not text:
        return {"ok": False, "code": "bad_request", "detail": "标题和正文不能为空"}
    if len(title) > 200:
        return {"ok": False, "code": "bad_request", "detail": "标题不能超过 200 字"}
    if len(text) > 50_000:
        return {"ok": False, "code": "bad_request", "detail": "正文不能超过 50000 字"}
    tags = body.get("tags") if isinstance(body.get("tags"), list) else ["imported"]
    tags = [str(t).strip() for t in tags if str(t).strip()][:20]
    try:
        confidence = float(body.get("confidence") if body.get("confidence") is not None else 0.8)
    except (TypeError, ValueError):
        confidence = 0.8
    confidence = max(0.0, min(1.0, confidence))
    kb = s["knowledge_base_id"] or "default"
    return {
        "ok": True,
        "draft": {
            "knowledgeBaseId": kb,
            "title": title,
            "body": text,
            "type": str(body.get("type") or "fact").strip() or "fact",
            "tags": tags or ["imported"],
            "scope": {"kind": "global"},
            "confidence": confidence,
        },
    }


async def create_entry(
    *,
    title: str,
    body: str,
    tags: list[str] | None = None,
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """管理员在共享知识库新建一篇（中央 POST /entries）。"""
    if not can_write(cfg):
        if not is_configured(cfg):
            return _not_configured()
        return {
            "ok": False,
            "code": "write_not_configured",
            "detail": "未配置 company_knowledge.write_token，无法写入共享知识库",
        }
    prepared = _draft_from_body(
        {"title": title, "body": body, "tags": tags or ["imported"]},
        cfg=cfg,
    )
    if not prepared.get("ok"):
        return prepared
    s = settings(cfg)
    try:
        http_status, data = await _request(
            "POST",
            "/entries",
            token=s["write_token"],
            cfg=cfg,
            json_body={"draft": prepared["draft"]},
        )
    except Exception as exc:
        _LOG.warning("company knowledge create failed: %s", exc)
        return _central_unavailable(exc)
    if http_status >= 400 or not isinstance(data, dict):
        if isinstance(data, dict):
            _LOG.warning(
                "company knowledge create HTTP %s: %s",
                http_status,
                data.get("error") or data.get("detail") or data.get("message") or "",
            )
        return _http_error(f"新建共享文档失败 HTTP {http_status}", status=http_status)
    return {
        "ok": True,
        "source": "company_knowledge",
        "entry": _entry_summary(data, include_body=True),
    }


async def update_entry(
    entry_id: str,
    *,
    title: str,
    body: str,
    tags: list[str] | None = None,
    expected_version: int | None = None,
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """管理员更新共享知识库文档。"""
    if not can_write(cfg):
        if not is_configured(cfg):
            return _not_configured()
        return {
            "ok": False,
            "code": "write_not_configured",
            "detail": "未配置 company_knowledge.write_token，无法写入共享知识库",
        }
    eid = (entry_id or "").strip()
    if not eid:
        return {"ok": False, "code": "bad_request", "detail": "缺少文档 id"}
    prepared = _draft_from_body(
        {"title": title, "body": body, "tags": tags or ["imported"]},
        cfg=cfg,
    )
    if not prepared.get("ok"):
        return prepared
    s = settings(cfg)
    payload: dict[str, Any] = {"draft": prepared["draft"]}
    if expected_version is not None:
        try:
            payload["expectedVersion"] = int(expected_version)
        except (TypeError, ValueError):
            pass
    try:
        http_status, data = await _request(
            "PUT",
            f"/entries/{quote(eid, safe='')}",
            token=s["write_token"],
            cfg=cfg,
            json_body=payload,
        )
    except Exception as exc:
        _LOG.warning("company knowledge update failed: %s", exc)
        return _central_unavailable(exc)
    if http_status >= 400 or not isinstance(data, dict):
        if isinstance(data, dict):
            _LOG.warning(
                "company knowledge update HTTP %s: %s",
                http_status,
                data.get("error") or data.get("detail") or data.get("message") or "",
            )
        return _http_error(f"保存共享文档失败 HTTP {http_status}", status=http_status)
    return {
        "ok": True,
        "source": "company_knowledge",
        "entry": _entry_summary(data, include_body=True),
    }


async def delete_entry(
    entry_id: str,
    *,
    user_id: str = "",
    username: str = "",
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """管理员删除共享知识库文档（中央归档，侧栏/召回不可见）。

    路由层已校验 WorkBuddy 管理员；此处用 write_token 调中央 archive。
    （中央 hard DELETE 另需 admin 令牌，现网 write 令牌走归档即可达成删除效果。）
    """
    if not can_write(cfg):
        if not is_configured(cfg):
            return _not_configured()
        return {
            "ok": False,
            "code": "write_not_configured",
            "detail": "未配置 company_knowledge.write_token，无法删除共享知识库文档",
        }
    eid = (entry_id or "").strip()
    if not eid:
        return {"ok": False, "code": "bad_request", "detail": "缺少文档 id"}
    s = settings(cfg)
    try:
        http_status, data = await _request(
            "POST",
            f"/entries/{quote(eid, safe='')}/archive",
            token=s["write_token"],
            cfg=cfg,
            json_body={},
        )
    except Exception as exc:
        _LOG.warning("company knowledge delete failed: %s", exc)
        try:
            from .security_audit import append_audit

            append_audit(
                "company_knowledge_delete",
                user_id=user_id or "",
                username=username or "",
                entry_id=eid,
                result="unavailable",
            )
        except Exception:
            pass
        return _central_unavailable(exc)

    ok = http_status < 400 or http_status == 404
    try:
        from .security_audit import append_audit

        append_audit(
            "company_knowledge_delete",
            user_id=user_id or "",
            username=username or "",
            entry_id=eid,
            result="ok" if ok else "rejected",
            http_status=http_status,
        )
    except Exception:
        pass

    if not ok:
        if isinstance(data, dict):
            _LOG.warning(
                "company knowledge delete HTTP %s: %s",
                http_status,
                data.get("error") or data.get("detail") or data.get("message") or "",
            )
        return _http_error(f"删除共享文档失败 HTTP {http_status}", status=http_status)
    return {
        "ok": True,
        "source": "company_knowledge",
        "entry_id": eid,
        "already_gone": http_status == 404,
    }


async def import_file(
    *,
    filename: str,
    content: bytes,
    user_id: str = "",
    username: str = "",
    cfg: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """管理员上传到公司中央库。成员不得调用（由路由层校验角色）。"""
    if not can_write(cfg):
        if not is_configured(cfg):
            return _not_configured()
        return {
            "ok": False,
            "code": "write_not_configured",
            "detail": "未配置 company_knowledge.write_token，无法写入公司共享库",
        }
    name = _safe_import_filename(filename or "")
    if not name:
        return {"ok": False, "code": "bad_request", "detail": "缺少或非法文件名"}
    if not content:
        return {"ok": False, "code": "bad_request", "detail": "文件内容为空"}
    if len(content) > 16 * 1024 * 1024:
        return {"ok": False, "code": "bad_request", "detail": "文件过大（上限 16MB）"}

    base_id, err = await resolve_import_base_id(cfg)
    if err:
        return err
    s = settings(cfg)
    path = f"/knowledge-bases/{quote(base_id, safe='')}/import"
    try:
        status, data = await _request(
            "POST",
            path,
            token=s["write_token"],
            cfg=cfg,
            content=content,
            content_type="application/octet-stream",
            params={"filename": name},
        )
    except Exception as exc:
        _LOG.warning("company knowledge import failed: %s", exc)
        try:
            from .security_audit import append_audit

            append_audit(
                "company_knowledge_import",
                user_id=user_id or "",
                username=username or "",
                target="company",
                filename=name,
                result="unavailable",
            )
        except Exception:
            pass
        return _central_unavailable(exc)

    ok = status < 400
    try:
        from .security_audit import append_audit

        append_audit(
            "company_knowledge_import",
            user_id=user_id or "",
            username=username or "",
            target="company",
            filename=name,
            knowledge_base_id=base_id,
            result="ok" if ok else "rejected",
            http_status=status,
        )
    except Exception:
        pass

    if not ok:
        if isinstance(data, dict):
            _LOG.warning(
                "company knowledge import HTTP %s: %s",
                status,
                data.get("message") or data.get("detail") or data.get("error") or "",
            )
        return _http_error(f"写入公司共享库失败 HTTP {status}", status=status)

    created = 0
    items: list[Any] = []
    if isinstance(data, dict):
        created = int(data.get("created") or 0)
        items = data.get("items") if isinstance(data.get("items"), list) else []
    return {
        "ok": True,
        "target": "company",
        "message": "已对公司可见（写入公司共享知识库）",
        "knowledge_base_id": base_id,
        "created": created,
        "items": items,
        "filename": name,
    }
