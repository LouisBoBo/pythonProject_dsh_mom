"""本机用户库（JSON + scrypt 密码哈希）。"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import secrets
import threading
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from .paths import ensure_dir, users_path

_LOG = logging.getLogger(__name__)
_TZ = ZoneInfo("Asia/Shanghai")
_LOCK = threading.Lock()

# 仅首次种子写入；已有 users.json 则跳过（含已改密）
# 默认口令仅供本机回环演示；启动会打警告，请立即改密（POST /api/auth/change-password）
_SEED = (
    {"username": "admin", "password": "admin123", "role": "admin", "display_name": "管理员"},
    {"username": "hebo", "password": "hebo123", "role": "user", "display_name": "Hebo"},
)

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_DKLEN = 64

ALLOWED_ROLES = frozenset({"admin", "user"})
_USERNAME_RE = re.compile(r"^[a-z][a-z0-9_-]{0,63}$")


class UsersError(Exception):
    """人员维护业务错误（API 映射为 4xx）。"""

    def __init__(self, detail: str, code: str = "users_error"):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def _now_iso() -> str:
    return datetime.now(_TZ).isoformat(timespec="seconds")


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(raw: str) -> bytes:
    pad = "=" * ((4 - len(raw) % 4) % 4)
    return base64.urlsafe_b64decode(raw + pad)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_SCRYPT_DKLEN,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(dk)}"


def check_password(password: str, encoded: str) -> bool:
    try:
        algo, n_s, r_s, p_s, salt_b64, hash_b64 = encoded.split("$", 5)
        if algo != "scrypt":
            return False
        salt = _b64d(salt_b64)
        expect = _b64d(hash_b64)
        dk = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n_s),
            r=int(r_s),
            p=int(p_s),
            dklen=len(expect),
        )
        return secrets.compare_digest(dk, expect)
    except (ValueError, TypeError, OSError):
        return False


def _user_id_for(username: str) -> str:
    return "u_" + "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in username.strip().lower())


def _read_raw() -> dict[str, Any]:
    path = users_path()
    if not path.is_file():
        return {"version": 1, "users": []}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            return {"version": 1, "users": []}
        users = data.get("users")
        if not isinstance(users, list):
            data["users"] = []
        return data
    except (OSError, json.JSONDecodeError):
        _LOG.warning("auth users.json 读取失败，将重建种子", exc_info=True)
        return {"version": 1, "users": []}


def _write_raw(data: dict[str, Any]) -> None:
    ensure_dir()
    path = users_path()
    tmp = path.with_suffix(".tmp")
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


def ensure_seed_users() -> None:
    """首次启动写入演示账号；已有文件则不改。"""
    with _LOCK:
        path = users_path()
        if path.is_file():
            return
        users: list[dict[str, Any]] = []
        for row in _SEED:
            users.append(
                {
                    "id": _user_id_for(row["username"]),
                    "username": row["username"],
                    "display_name": row["display_name"],
                    "role": row["role"],
                    "password_hash": hash_password(row["password"]),
                    "created_at": _now_iso(),
                    "disabled": False,
                    "must_change_password": False,
                }
            )
        _write_raw({"version": 1, "users": users})
        _LOG.warning(
            "auth: 已写入种子账号 %s（默认口令 admin123/hebo123，请立即 POST /api/auth/change-password 改密；引擎请仅绑回环）",
            ", ".join(u["username"] for u in users),
        )


def find_user(username: str) -> dict[str, Any] | None:
    name = (username or "").strip().lower()
    if not name:
        return None
    with _LOCK:
        for u in _read_raw().get("users") or []:
            if not isinstance(u, dict):
                continue
            if str(u.get("username") or "").strip().lower() == name:
                return u
    return None


def find_user_by_id(user_id: str) -> dict[str, Any] | None:
    uid = (user_id or "").strip()
    if not uid:
        return None
    with _LOCK:
        for u in _read_raw().get("users") or []:
            if not isinstance(u, dict):
                continue
            if str(u.get("id") or "").strip() == uid:
                return u
    return None


def list_public_users(*, include_disabled: bool = False) -> list[dict[str, Any]]:
    """全部本机账号公开信息（含 admin），供企业用量按员工补齐零用量行。"""
    out: list[dict[str, Any]] = []
    with _LOCK:
        for u in _read_raw().get("users") or []:
            if not isinstance(u, dict):
                continue
            if not include_disabled and u.get("disabled"):
                continue
            pub = public_user(u)
            if pub and pub.get("id"):
                out.append(pub)
    out.sort(key=lambda x: str(x.get("username") or ""))
    return out


def verify_password(username: str, password: str) -> dict[str, Any] | None:
    u = find_user(username)
    if not u or u.get("disabled"):
        return None
    if not check_password(password or "", str(u.get("password_hash") or "")):
        return None
    return u


def change_password(username: str, old_password: str, new_password: str) -> dict[str, Any] | None:
    """校验旧密码后改密，并清除 must_change_password。新密码至少 8 位。"""
    name = (username or "").strip()
    new_pw = new_password or ""
    if len(new_pw) < 8:
        return None
    u = verify_password(name, old_password or "")
    if not u:
        return None
    uid = str(u.get("id") or "")
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != uid:
                continue
            row = dict(row)
            row["password_hash"] = hash_password(new_pw)
            row["must_change_password"] = False
            row["password_changed_at"] = _now_iso()
            users[i] = row
            data["users"] = users
            _write_raw(data)
            return row
    return None


def clear_must_change_password_for_tests() -> None:
    """测试专用：种子账号跳过强制改密。"""
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        changed = False
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if row.get("must_change_password"):
                row = dict(row)
                row["must_change_password"] = False
                users[i] = row
                changed = True
        if changed:
            data["users"] = users
            _write_raw(data)


def _count_active_admins(users: list[Any]) -> int:
    n = 0
    for u in users:
        if not isinstance(u, dict):
            continue
        if u.get("disabled"):
            continue
        if str(u.get("role") or "") == "admin":
            n += 1
    return n


def _normalize_username(username: str) -> str:
    name = (username or "").strip().lower()
    if not name:
        raise UsersError("请填写账号", "invalid_username")
    if not _USERNAME_RE.match(name):
        raise UsersError(
            "账号须以字母开头，仅含小写字母、数字、下划线或连字符，最长 64 位",
            "invalid_username",
        )
    return name


def _normalize_role(role: str) -> str:
    r = (role or "user").strip().lower()
    if r not in ALLOWED_ROLES:
        raise UsersError("角色只能是管理员或成员", "invalid_role")
    return r


def _require_password(password: str) -> str:
    pw = password or ""
    if len(pw) < 8:
        raise UsersError("密码至少 8 位", "weak_password")
    return pw


def set_user_disabled(user_id: str, disabled: bool = True) -> bool:
    """禁用/启用账号。停用最后一个未停用管理员时抛 UsersError。"""
    uid = (user_id or "").strip()
    if not uid:
        return False
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != uid:
                continue
            next_disabled = bool(disabled)
            if next_disabled and not row.get("disabled") and str(row.get("role") or "") == "admin":
                if _count_active_admins(users) <= 1:
                    raise UsersError(
                        "系统至少需要保留一名未停用的管理员",
                        "last_admin",
                    )
            row = dict(row)
            row["disabled"] = next_disabled
            users[i] = row
            data["users"] = users
            _write_raw(data)
            return True
    return False


def user_is_active(row: dict[str, Any] | None) -> bool:
    """存在且未禁用。"""
    if not row or not isinstance(row, dict):
        return False
    if row.get("disabled"):
        return False
    if not str(row.get("id") or "").strip():
        return False
    return True


def public_user(u: dict[str, Any] | None) -> dict[str, Any] | None:
    if not u:
        return None
    return {
        "id": str(u.get("id") or ""),
        "username": str(u.get("username") or ""),
        "display_name": str(u.get("display_name") or u.get("username") or ""),
        "role": str(u.get("role") or "user"),
        "must_change_password": bool(u.get("must_change_password")),
    }


def admin_public_user(u: dict[str, Any] | None) -> dict[str, Any] | None:
    """管理员列表字段（无密码哈希）。"""
    from .capabilities import effective_capabilities, normalize_disabled_caps

    pub = public_user(u)
    if not pub or not pub.get("id"):
        return None
    pub["disabled"] = bool((u or {}).get("disabled"))
    pub["created_at"] = str((u or {}).get("created_at") or "")
    from .company_knowledge_access import effective_company_knowledge_access
    from .data_access import effective_data_access

    disabled_caps = normalize_disabled_caps((u or {}).get("disabled_caps"))
    pub["disabled_caps"] = disabled_caps
    pub["capabilities"] = effective_capabilities(disabled_caps)
    pub["data_access"] = effective_data_access(u)
    pub["company_knowledge_access"] = effective_company_knowledge_access(u)
    return pub


def list_users_admin(*, include_disabled: bool = True) -> list[dict[str, Any]]:
    """人员维护列表（含停用账号）。"""
    out: list[dict[str, Any]] = []
    with _LOCK:
        for u in _read_raw().get("users") or []:
            if not isinstance(u, dict):
                continue
            if not include_disabled and u.get("disabled"):
                continue
            pub = admin_public_user(u)
            if pub:
                out.append(pub)
    out.sort(key=lambda x: str(x.get("username") or ""))
    return out


def create_user(
    username: str,
    password: str,
    *,
    display_name: str = "",
    role: str = "user",
    must_change_password: bool = True,
) -> dict[str, Any]:
    """新建账号。用户名占用（含已停用）拒绝复用。"""
    name = _normalize_username(username)
    pw = _require_password(password)
    role_n = _normalize_role(role)
    disp = (display_name or "").strip() or name
    if len(disp) > 64:
        raise UsersError("显示名过长", "invalid_display_name")
    uid = _user_id_for(name)
    with _LOCK:
        data = _read_raw()
        users = list(data.get("users") or [])
        for u in users:
            if not isinstance(u, dict):
                continue
            if str(u.get("username") or "").strip().lower() == name:
                raise UsersError("账号已存在", "username_exists")
            if str(u.get("id") or "").strip() == uid:
                raise UsersError("账号已存在", "username_exists")
        row = {
            "id": uid,
            "username": name,
            "display_name": disp,
            "role": role_n,
            "password_hash": hash_password(pw),
            "created_at": _now_iso(),
            "disabled": False,
            "must_change_password": bool(must_change_password),
            # 空列表 = 目录内能力默认全开（与全局 plugins.json 叠加）
            "disabled_caps": [],
        }
        users.append(row)
        data["users"] = users
        _write_raw(data)
        return row


def update_user(
    user_id: str,
    *,
    display_name: str | None = None,
    role: str | None = None,
) -> dict[str, Any]:
    """改显示名 / 角色。降权最后一个管理员时抛 UsersError。"""
    uid = (user_id or "").strip()
    if not uid:
        raise UsersError("用户不存在", "not_found")
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != uid:
                continue
            row = dict(row)
            if display_name is not None:
                disp = (display_name or "").strip()
                if not disp:
                    raise UsersError("显示名不能为空", "invalid_display_name")
                if len(disp) > 64:
                    raise UsersError("显示名过长", "invalid_display_name")
                row["display_name"] = disp
            if role is not None:
                role_n = _normalize_role(role)
                old_role = str(row.get("role") or "user")
                if (
                    old_role == "admin"
                    and role_n != "admin"
                    and not row.get("disabled")
                    and _count_active_admins(users) <= 1
                ):
                    raise UsersError(
                        "系统至少需要保留一名未停用的管理员",
                        "last_admin",
                    )
                row["role"] = role_n
            users[i] = row
            data["users"] = users
            _write_raw(data)
            return row
    raise UsersError("用户不存在", "not_found")


def reset_user_password(
    user_id: str,
    new_password: str,
    *,
    must_change_password: bool = True,
) -> dict[str, Any]:
    """管理员重置口令（不校验旧密）。"""
    uid = (user_id or "").strip()
    if not uid:
        raise UsersError("用户不存在", "not_found")
    pw = _require_password(new_password)
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != uid:
                continue
            row = dict(row)
            row["password_hash"] = hash_password(pw)
            row["must_change_password"] = bool(must_change_password)
            row["password_changed_at"] = _now_iso()
            users[i] = row
            data["users"] = users
            _write_raw(data)
            return row
    raise UsersError("用户不存在", "not_found")


def set_user_capabilities(
    user_id: str,
    *,
    caps: dict[str, Any] | None = None,
    disabled_caps: list[str] | None = None,
) -> dict[str, Any]:
    """设置账号能力。caps 为 {feature_id: bool}；也可直接传 disabled_caps 列表。"""
    from .capabilities import CAPABILITY_CATALOG, normalize_disabled_caps

    uid = (user_id or "").strip()
    if not uid:
        raise UsersError("用户不存在", "not_found")
    if disabled_caps is not None:
        next_disabled = normalize_disabled_caps(disabled_caps)
    elif caps is not None:
        if not isinstance(caps, dict):
            raise UsersError("能力参数格式错误", "invalid_caps")
        denied: list[str] = []
        for c in CAPABILITY_CATALOG:
            fid = str(c["id"])
            if fid in caps and not bool(caps.get(fid)):
                denied.append(fid)
        next_disabled = normalize_disabled_caps(denied)
    else:
        raise UsersError("没有可更新的能力字段", "noop")
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != uid:
                continue
            row = dict(row)
            row["disabled_caps"] = next_disabled
            users[i] = row
            data["users"] = users
            _write_raw(data)
            return row
    raise UsersError("用户不存在", "not_found")


def set_user_data_access(user_id: str, grants: dict[str, Any]) -> dict[str, Any]:
    """设置物料采购单价、员工工资是否可看。未出现的项保持原值；缺省视为不可看。"""
    from .data_access import normalize_data_access

    uid = (user_id or "").strip()
    if not uid:
        raise UsersError("用户不存在", "not_found")
    if not isinstance(grants, dict) or not grants:
        raise UsersError("没有可更新的数据权限", "noop")
    known = set(normalize_data_access({}).keys())
    unknown = [str(k) for k in grants.keys() if str(k) not in known]
    if unknown:
        raise UsersError("未知的数据权限项", "invalid_data_access")
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != uid:
                continue
            row = dict(row)
            current = normalize_data_access(row.get("data_access"))
            for key in known:
                if key in grants:
                    current[key] = bool(grants.get(key))
            row["data_access"] = current
            users[i] = row
            data["users"] = users
            _write_raw(data)
            return row
    raise UsersError("用户不存在", "not_found")


def set_user_company_knowledge_access(
    user_id: str,
    *,
    allow_all: bool | None = None,
    entry_ids: list[str] | None = None,
) -> dict[str, Any]:
    """设置成员可召回的共享知识库文档。管理员账号勿调用（始终全开）。"""
    from .company_knowledge_access import access_from_entry_ids

    uid = (user_id or "").strip()
    if not uid:
        raise UsersError("用户不存在", "not_found")
    payload = access_from_entry_ids(entry_ids, allow_all=allow_all)
    with _LOCK:
        data = _read_raw()
        users = data.get("users") or []
        for i, row in enumerate(users):
            if not isinstance(row, dict):
                continue
            if str(row.get("id") or "") != uid:
                continue
            if str(row.get("role") or "") == "admin":
                raise UsersError("管理员始终可召回全部共享文档，无需设置", "admin_always_all")
            row = dict(row)
            row["company_knowledge_access"] = payload
            users[i] = row
            data["users"] = users
            _write_raw(data)
            return row
    raise UsersError("用户不存在", "not_found")
