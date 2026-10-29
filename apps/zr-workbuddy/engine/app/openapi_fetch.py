"""从 URL 拉取 OpenAPI。问数不调用这里。"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse, urlsplit, urlunsplit

import httpx

from .config_store import load_config
from .importers import parse_swagger


def openapi_candidates(url: str) -> list:
    """HTML 文档页（/docs /swagger 等）→ 常见 OpenAPI JSON 路径候选。"""
    parts = urlsplit(url)
    path = parts.path.rstrip("/")
    for suffix in (
        "/docs",
        "/redoc",
        "/swagger-ui",
        "/swagger-ui.html",
        "/swagger",
        "/index.html",
        "/api-docs",
        "/v2/api-docs",
    ):
        if path.endswith(suffix):
            path = path[: -len(suffix)]
            break
    base = urlunsplit((parts.scheme, parts.netloc, path, "", ""))
    return [
        base + "/openapi.json",
        base + "/swagger.json",
        base + "/v2/api-docs",
        base + "/api-docs",
    ]


def swagger_url_allowed(url: str) -> str | None:
    """拒绝明显危险目标（云元数据 / 非 http(s)）；厂内 MES OpenAPI 仍允许内网 IP。"""
    parts = urlparse(url)
    if parts.scheme not in ("http", "https"):
        return "仅允许 http/https"
    host = (parts.hostname or "").strip().lower()
    if not host:
        return "URL 缺少主机名"
    blocked_names = {"metadata.google.internal", "metadata.goog", "instance-data"}
    if host in blocked_names or host.endswith(".metadata.google.internal"):
        return "拒绝访问云元数据主机"
    try:
        infos = socket.getaddrinfo(host, None)
        for info in infos:
            ip = info[4][0]
            try:
                addr = ipaddress.ip_address(ip)
            except ValueError:
                continue
            if addr.is_link_local or str(addr) == "169.254.169.254":
                return "拒绝访问链路本地/元数据地址"
    except socket.gaierror:
        pass
    return None


async def fetch_openapi(url: str, username: str = "", password: str = "") -> tuple:
    """抓取并返回 (openapi 文本, 实际来源 URL)。自动处理 /docs 等 HTML 页面。"""
    bad = swagger_url_allowed(url)
    if bad:
        raise ValueError(bad)
    auth = (username, password) if username else None
    # SSL 校验跟随已保存 MES 配置；默认 verify=True（不再无条件 verify=False）
    mes = load_config().get("mes") or {}
    verify = bool(mes.get("verify_ssl", True))
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, verify=verify) as client:
        r = await client.get(url, auth=auth)
        r.raise_for_status()
        final = str(r.url)
        bad2 = swagger_url_allowed(final)
        if bad2:
            raise ValueError(bad2)
        content = r.text
        try:
            parse_swagger(content)
            return content, final
        except Exception:
            pass
        for cand in openapi_candidates(final):
            try:
                rr = await client.get(cand, auth=auth)
                if rr.status_code == 200:
                    parse_swagger(rr.text)
                    return rr.text, cand
            except Exception:
                continue
    raise ValueError(
        f"无法从 {url} 获取 OpenAPI 文档（已尝试 /openapi.json、/swagger.json、/v2/api-docs 等）"
    )
