"""业务仓内部署规则：.workbuddy/deploy.yaml（+ optional deploy.local.yaml）。

可提交文件禁止写密钥路径；本机私钥只放 deploy.local.yaml（勿提交）。
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore


class ProjectDeployError(ValueError):
    """项目部署规则不合法（含误写密钥）。"""


_SECRET_KEYS = frozenset(
    {
        "key_path",
        "ssh_key_path",
        "identity_file",
        "identityfile",
        "password",
        "passwd",
        "passphrase",
        "token",
        "secret",
        "credential",
        "credentials",
        "private_key",
        "private_key_pem",
        "privatekey",
        "api_key",
        "apikey",
    }
)


def _read_yaml(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    if yaml is None:
        raise ProjectDeployError("缺少 PyYAML，无法读取项目部署规则")
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, UnicodeError) as e:
        raise ProjectDeployError(f"无法读取 {path.name}：{e}") from e
    except Exception as e:  # noqa: BLE001 — yaml 解析错误
        raise ProjectDeployError(f"无法解析 {path.name}：{e}") from e
    if not isinstance(raw, dict):
        raise ProjectDeployError(f"{path.name} 根节点须为 mapping")
    return raw


def find_deploy_root(workspace: str | Path | None) -> Path | None:
    """从 workspace 向上找含 .workbuddy/deploy*.yaml 的根；否则找 .git/.svn；再否则 None。"""
    raw = str(workspace or "").strip()
    if not raw:
        return None
    try:
        cur = Path(raw).expanduser().resolve()
    except OSError:
        return None
    if cur.is_file():
        cur = cur.parent
    start = cur
    for _ in range(48):
        wb = cur / ".workbuddy"
        if (wb / "deploy.yaml").is_file() or (wb / "deploy.local.yaml").is_file():
            return cur
        if (cur / ".git").exists() or (cur / ".svn").is_dir():
            # 命中 VCS 根即停：禁止再往上爬到父仓的 .workbuddy（防误用父工程部署规则）
            return cur
        parent = cur.parent
        if parent == cur:
            break
        cur = parent
    # 无 .workbuddy、无 VCS：用传入路径自身
    return start if start.is_dir() else None


def _looks_like_pem_blob(val: Any) -> bool:
    s = str(val or "").strip()
    if not s or len(s) < 27:
        return False
    u = s.upper()
    return "BEGIN " in u and ("PRIVATE KEY" in u or "OPENSSH PRIVATE KEY" in u)


def _assert_no_secrets(doc: dict[str, Any], *, where: str) -> None:
    def walk(obj: Any, path: str) -> None:
        if isinstance(obj, dict):
            for k, v in obj.items():
                key = str(k or "").strip().lower()
                p = f"{path}.{key}" if path else key
                if key in _SECRET_KEYS and str(v or "").strip():
                    raise ProjectDeployError(
                        f"{where} 禁止写入密钥字段「{k}」"
                        f"（请放到 .workbuddy/deploy.local.yaml，勿提交）"
                    )
                if _looks_like_pem_blob(v):
                    raise ProjectDeployError(
                        f"{where} 禁止写入私钥内容（字段 {p}）；请只在本机 deploy.local.yaml 写 key_path"
                    )
                walk(v, p)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{path}[{i}]")

    walk(doc, "")


def _ssh_block(doc: dict[str, Any]) -> dict[str, Any]:
    ssh = doc.get("ssh")
    return ssh if isinstance(ssh, dict) else {}


def project_doc_to_override(doc: dict[str, Any], *, allow_key_path: bool) -> dict[str, Any]:
    """把项目 yaml 转成 _apply_override_dict 可用的扁平字段。"""
    if not doc:
        return {}
    ssh = _ssh_block(doc)
    out: dict[str, Any] = {}

    preset = doc.get("preset") or doc.get("deploy_preset")
    if preset is not None and str(preset).strip():
        out["deploy_preset"] = str(preset).strip()

    for src, dst in (
        ("build_cmd", "build_cmd"),
        ("build_cwd", "build_cwd"),
        ("dist_rel", "dist_rel"),
        ("process_match", "process_match"),
        ("build_where", "build_where"),
        ("remote_restart_cmd", "remote_restart_cmd"),
        ("entry_url", "entry_url"),
        ("health_url", "health_url"),
        ("default_ref", "default_ref"),
    ):
        if src in doc and doc[src] is not None and str(doc[src]).strip() != "":
            out[dst] = doc[src]

    for src, dst in (
        ("unified_product", "unified_product"),
        ("auto_restart_engine", "auto_restart_engine"),
        ("auto_restart_bridge", "auto_restart_bridge"),
    ):
        if src in doc and doc[src] is not None:
            out[dst] = bool(doc[src])

    if "health_expect_status" in doc and doc["health_expect_status"] is not None:
        out["health_expect_status"] = doc["health_expect_status"]
    if "health_timeout_sec" in doc and doc["health_timeout_sec"] is not None:
        # CodeDeployConfig 有该字段；_apply_override_dict 未列则后面扩展
        out["health_timeout_sec"] = doc["health_timeout_sec"]

    if isinstance(doc.get("sync_paths"), list):
        out["sync_paths"] = doc["sync_paths"]
    if isinstance(doc.get("rsync_excludes"), list):
        out["rsync_excludes"] = doc["rsync_excludes"]

    for src, dst in (
        ("host", "ssh_host"),
        ("user", "ssh_user"),
        ("app_path", "ssh_app_path"),
        ("port", "ssh_port"),
    ):
        if src in ssh and ssh[src] is not None and str(ssh[src]).strip() != "":
            out[dst] = ssh[src]

    if allow_key_path:
        for k in ("key_path", "ssh_key_path"):
            if k in ssh and str(ssh.get(k) or "").strip():
                out["ssh_key_path"] = str(ssh.get(k)).strip()
                break

    return out


def load_project_deploy_overlay(workspace: str | Path | None) -> dict[str, Any]:
    """读取项目规则叠层（已合并 committed + local）。无文件返回 {}。

    可提交 deploy.yaml 含密钥字段 → ProjectDeployError。
    """
    root = find_deploy_root(workspace)
    if root is None:
        return {}
    committed_path = root / ".workbuddy" / "deploy.yaml"
    local_path = root / ".workbuddy" / "deploy.local.yaml"
    if not committed_path.is_file() and not local_path.is_file():
        return {}

    committed = _read_yaml(committed_path) if committed_path.is_file() else {}
    if committed:
        _assert_no_secrets(committed, where=".workbuddy/deploy.yaml")
    local = _read_yaml(local_path) if local_path.is_file() else {}

    ov = project_doc_to_override(committed, allow_key_path=False)
    ov_local = project_doc_to_override(local, allow_key_path=True)
    ov.update(ov_local)
    ov["_project_deploy_root"] = str(root)
    ov["_project_deploy_source"] = (
        "project_file+local"
        if committed and local
        else ("project_file" if committed else "project_local")
    )
    return ov


def has_project_deploy_file(workspace: str | Path | None) -> bool:
    root = find_deploy_root(workspace)
    if root is None:
        return False
    return (root / ".workbuddy" / "deploy.yaml").is_file() or (
        root / ".workbuddy" / "deploy.local.yaml"
    ).is_file()
