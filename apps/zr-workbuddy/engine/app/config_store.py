"""配置存储：YAML 读写、默认模板、密钥脱敏与合并。"""

import os
import shutil
import sys
import threading
from copy import deepcopy
from typing import Any, Callable, Dict, List, Tuple

CONFIG_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.yaml")
BACKUP_PATH = CONFIG_PATH + ".bak"

MASK = "••••••••"

# 需要脱敏的字段路径（界面回显时打码；保存时若传入打码值则保留原值）
SECRET_PATHS: List[Tuple[str, ...]] = [
    ("mes", "password"),
    ("mes", "token"),
    ("deepseek", "api_key"),
    ("code_dev", "cursor_api_key"),
    ("usage", "report_token"),
    ("automations", "wecom_webhook_key"),
    ("automations", "feishu_app_secret"),
    ("vision", "api_key"),
    ("api_docs", "source_password"),
    ("company_knowledge", "read_token"),
    ("company_knowledge", "write_token"),
]

DEFAULT_CONFIG: Dict[str, Any] = {
    "mes": {
        "base_url": "",
        "auth_type": "password",  # password | token | apikey | none
        "username": "",
        "password": "",
        "token": "",
        "enterprise_code": "江西中软",  # MES 登录企业编码
        "extra_headers": "{}",    # JSON 字符串，如 {"X-Tenant": "xxx"}
        "verify_ssl": True,
        "timeout": 30,
        # 问数：默认禁止用内置演示表冒充业务结果；本机联调可显式 true
        "allow_demo_fallback": False,
    },
    # 公司共享知识库：中央 exposeApi；皆空 = 未接入，本机知识库行为不变
    "company_knowledge": {
        "base_url": "",
        "api_prefix": "/knowledge-api/v1",
        "read_token": "",
        "write_token": "",
        "knowledge_base_id": "",
        "timeout_ms": 10000,
        "verify_ssl": True,
    },
    # 数据访问：仅物料采购单价、员工工资。path/fields 皆空 = 尚未接入，问数不猜测字段。
    "sensitive_data": {
        "purchase_unit_price": {"path": "", "fields": []},
        "employee_salary": {"path": "", "fields": []},
    },
    "api_docs": {
        # endpoint: {name, method, path, table, desc}
        # source_url：从 URL 确认导入后记住；空则不自动拉取。问数不读这个地址。
        "source_url": "",
        "source_username": "",
        "source_password": "",
        "sync_interval_sec": 24 * 3600,
        "endpoints": [
            {"name": "工单列表", "method": "GET", "path": "", "table": "work_orders",
             "desc": "按时间范围拉取生产工单"},
            {"name": "设备事件", "method": "GET", "path": "", "table": "equipment_events",
             "desc": "设备运行/停机事件记录"},
            {"name": "质检记录", "method": "GET", "path": "", "table": "quality_records",
             "desc": "检验与不良记录"},
        ],
        "raw_docs": "",  # 粘贴的接口文档原文，供后续分析
    },
    "data_dictionary": {
        # 每张标准表的字段映射: {mes_field, std_field, type, desc}
        "work_orders": [
            {"mes_field": "工单号", "std_field": "work_order_no", "type": "文本", "desc": ""},
            {"mes_field": "产品编码", "std_field": "product_code", "type": "文本", "desc": ""},
            {"mes_field": "产品名称", "std_field": "product_name", "type": "文本", "desc": ""},
            {"mes_field": "产线", "std_field": "line_name", "type": "文本", "desc": ""},
            {"mes_field": "班次", "std_field": "shift", "type": "文本", "desc": ""},
            {"mes_field": "计划数量", "std_field": "planned_qty", "type": "数值", "desc": ""},
            {"mes_field": "实际数量", "std_field": "actual_qty", "type": "数值", "desc": ""},
            {"mes_field": "开始时间", "std_field": "start_time", "type": "时间", "desc": ""},
            {"mes_field": "结束时间", "std_field": "end_time", "type": "时间", "desc": ""},
            {"mes_field": "状态", "std_field": "status", "type": "文本", "desc": ""},
        ],
        "equipment_events": [
            {"mes_field": "设备编码", "std_field": "equipment_code", "type": "文本", "desc": ""},
            {"mes_field": "设备名称", "std_field": "equipment_name", "type": "文本", "desc": ""},
            {"mes_field": "产线", "std_field": "line_name", "type": "文本", "desc": ""},
            {"mes_field": "事件类型", "std_field": "event_type", "type": "文本",
             "desc": "运行/停机/维修/待机等"},
            {"mes_field": "开始时间", "std_field": "start_time", "type": "时间", "desc": ""},
            {"mes_field": "结束时间", "std_field": "end_time", "type": "时间", "desc": ""},
            {"mes_field": "时长(分钟)", "std_field": "duration_min", "type": "数值", "desc": ""},
        ],
        "quality_records": [
            {"mes_field": "工单号", "std_field": "work_order_no", "type": "文本", "desc": ""},
            {"mes_field": "产品编码", "std_field": "product_code", "type": "文本", "desc": ""},
            {"mes_field": "检验时间", "std_field": "inspect_time", "type": "时间", "desc": ""},
            {"mes_field": "抽检数", "std_field": "sample_qty", "type": "数值", "desc": ""},
            {"mes_field": "不良数", "std_field": "defect_qty", "type": "数值", "desc": ""},
            {"mes_field": "缺陷类型", "std_field": "defect_type", "type": "文本", "desc": ""},
        ],
    },
    # 工程对接档案：空 items 时 load/save 由 mes_profile 从顶层 mes∪api_docs∪dictionary 整包迁移
    "mes_connections": {
        "active_profile_id": "default",
        "items": [],
    },
    "deepseek": {
        "provider": "deepseek",   # deepseek | ollama | openai_compat；legacy: none
        "api_key": "",
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat",
        # 各提供方独立分槽；顶层 api_key/base_url/model 仅为当前 provider 镜像
        "by_provider": {
            "deepseek": {
                "api_key": "",
                "base_url": "https://api.deepseek.com",
                "model": "deepseek-chat",
            },
            "ollama": {
                "api_key": "",
                "base_url": "http://127.0.0.1:11434",
                "model": "",
            },
            "openai_compat": {
                "api_key": "",
                "base_url": "",
                "model": "",
            },
        },
    },
    # 视觉模型（对齐 simplified VISION_*；贴图识图 / 多模态）
    "vision": {
        "api_key": "",
        "base_url": "",
        "model": "",
    },
    # P0-1 本机 Cursor Local 写码（默认关闭，避免误改工程）
    "code_dev": {
        "enabled": False,
        "cursor_api_key": "",
        "model": "composer-2.5",
        "max_concurrent": 1,
        "cursor_timeout_sec": 2700,
        "default_workspace": "",
    },
    # P0-3 本机目录直读审码（默认关闭；无 Git / 无 IDE Bridge）
    "code_review": {
        "enabled": False,
        "max_files": 40,
        "max_file_bytes": 120000,
        "max_total_bytes": 800000,
        "default_workspace": "",
    },
    # P0-2 人触发提交（参数在配置中心；总开关以功能插件 code-commit 为准，此处默认开以免双关找不到）
    "code_commit": {
        "enabled": True,
        "default_workspace": "",
        "work_branch": "",
        "remote_name": "origin",
        "default_push": True,
        "use_skill_review": True,
        "allow_blocked": False,
        "max_files": 80,
    },
    # 企业用量上报（默认关；失败不得影响聊天/写码）
    "usage": {
        "report_enabled": False,
        "report_url": "",  # 如 http://127.0.0.1:8000/api/usage-hub/v1
        "report_token": "",
    },
    # 自动化推送（对齐 simplified WECOM_* / FEISHU_*；P0-4 任务调度读此节）
    "automations": {
        "wecom_webhook_key": "",
        "wecom_push_enabled": False,
        "wecom_push_dry_run": False,
        "feishu_app_id": "",
        "feishu_app_secret": "",
        "feishu_bitable_enabled": False,
        "feishu_bitable_dry_run": False,
    },
    # 需求到上线一体化（默认关：与普通写码/四车道分离）
    "dev_pipeline": {
        "enabled": True,
        "default_workspace": "",
        "max_fix_rounds": 3,
        "max_deploy_attempts": 3,
    },
    # 本机「我的空间」（会话摘要进库、报告正文进空间；失败不影响业务）
    "space": {
        "retention_days": 90,
        "max_session_body_chars": 65536,
        "auto_purge_enabled": True,
        "sync_pcb_8d": True,
        "pcb_8d_drafts_dir": "",
        "sync_chat_docs": True,
    },
}


def _deep_merge(target: Dict[str, Any], source: Dict[str, Any]) -> None:
    """递归合并：source 覆盖 target（标量/列表直接替换）。"""
    for k, v in source.items():
        if isinstance(v, dict) and isinstance(target.get(k), dict):
            _deep_merge(target[k], v)
        else:
            target[k] = deepcopy(v)


def _get(node: Dict[str, Any], path: Tuple[str, ...]):
    cur = node
    for k in path:
        if not isinstance(cur, dict) or k not in cur:
            return None
        cur = cur[k]
    return cur


def _set(node: Dict[str, Any], path: Tuple[str, ...], value: Any) -> None:
    cur = node
    for k in path[:-1]:
        cur = cur.setdefault(k, {})
    cur[path[-1]] = value


# 读-改-写共用，避免接口文档同步和配置页保存互相盖掉。
_CONFIG_LOCK = threading.RLock()


def load_config() -> Dict[str, Any]:
    """读取配置；不存在则写入默认模板（含数据字典示例）。"""
    with _CONFIG_LOCK:
        return _load_config_unlocked()


def _load_config_unlocked() -> Dict[str, Any]:
    if not os.path.exists(CONFIG_PATH):
        _save_config_unlocked(deepcopy(DEFAULT_CONFIG))
    with open(CONFIG_PATH, encoding="utf-8") as f:
        raw = f.read()
    cfg = raw and yaml_safe_load(raw) or {}
    if not isinstance(cfg, dict):
        cfg = {}
    merged = deepcopy(DEFAULT_CONFIG)
    _deep_merge(merged, cfg)
    from .llm_config import normalize_deepseek_block
    from .mes_profile import ensure_mes_profiles, mirror_active_profile_to_top

    merged["deepseek"] = normalize_deepseek_block(merged.get("deepseek"))
    merged, migrated = ensure_mes_profiles(merged)
    # 现网读者只认顶层：用 active 档案镜像，保证地址与文档一体且行为与升级前一致
    mirror_active_profile_to_top(merged)
    if migrated:
        # 只落盘一次迁移结果，不触发 DeepSeek/chat 副作用
        _save_config_unlocked(merged, side_effects=False)
    return merged


def save_config(cfg: Dict[str, Any], *, side_effects: bool = True) -> None:
    """写入配置（先备份旧文件）。"""
    with _CONFIG_LOCK:
        _save_config_unlocked(cfg, side_effects=side_effects)


def _save_config_unlocked(cfg: Dict[str, Any], *, side_effects: bool = True) -> None:
    """强制 LF 换行：Windows 默认 text mode 会把 \\n 译成 CRLF，而 DSH 自动化/
    ESC 插件用简易正则读 yaml 段时遇 \\r 会只解析到每段第一行，导致
    automations.feishu_*（第二行起）读空、误报「未配置飞书」。
    """
    from .llm_config import prepare_deepseek_for_save
    from .mes_profile import (
        ensure_mes_profiles,
        mirror_active_profile_to_top,
        sync_top_level_into_active_profile,
    )

    to_write = deepcopy(cfg)
    if isinstance(to_write.get("deepseek"), dict):
        to_write["deepseek"] = prepare_deepseek_for_save(to_write["deepseek"])
    # 旧设置页只改顶层 mes/api_docs：写回 active 档案；再镜像，避免两张皮
    ensure_mes_profiles(to_write)
    sync_top_level_into_active_profile(to_write)
    mirror_active_profile_to_top(to_write)
    os.makedirs(CONFIG_DIR, exist_ok=True)
    if os.path.exists(CONFIG_PATH):
        shutil.copy2(CONFIG_PATH, BACKUP_PATH)
    # newline="\n"：禁止 Windows 把 LF 译成 CRLF
    with open(CONFIG_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write("# DSH-ZR-WorkBuddy / ZR-WorkBuddy 配置\n")
        f.write("# 由配置界面写入，包含密钥，请勿外传/提交版本库\n")
        f.write(yaml_dump(to_write))
    if side_effects:
        _sync_dsh_chat_credential(to_write)
        _refresh_workbuddy_config_sidecar()


def update_config(mutator: Callable[[Dict[str, Any]], bool], *, side_effects: bool = True) -> Dict[str, Any]:
    """同一把锁里读取并修改。mutator 返回 True 才写盘。"""
    with _CONFIG_LOCK:
        cfg = _load_config_unlocked()
        if mutator(cfg):
            _save_config_unlocked(cfg, side_effects=side_effects)
        return cfg


def _refresh_workbuddy_config_sidecar() -> None:
    """配置中心保存后刷新 ~/.dsh/workbuddy-mes.yaml（WORKBUDDY_CONFIG_YAML 真相源）。

    失败不影响保存。自动化/ESC 只读该 sidecar；若不刷新，飞书 Key 会继续误报未配置。
    """
    try:
        import subprocess
        from pathlib import Path

        # app/config_store.py → …/DSH_WorkBuddy
        root = Path(__file__).resolve().parents[4]
        script = root / "scripts" / "lib" / "ensure_workbuddy_config_yaml_env.py"
        if not script.is_file():
            return
        subprocess.run(
            [sys.executable, str(script), "--repo", str(root), "--no-env"],
            cwd=str(root),
            timeout=20,
            check=False,
            capture_output=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0,
        )
    except Exception:  # noqa: BLE001
        pass


def _sync_dsh_chat_credential(cfg: Dict[str, Any]) -> None:
    """配置中心保存后，把 DeepSeek Key 同步给 DSH 聊天。失败不影响保存。"""
    try:
        from .dsh_chat_credential import key_from_config_dict, sync_workbuddy_deepseek_key

        sync_workbuddy_deepseek_key(key_from_config_dict(cfg))
    except Exception as exc:  # noqa: BLE001
        import logging

        logging.getLogger(__name__).warning(
            "同步 DSH 聊天凭据失败: %s", type(exc).__name__
        )


def mask_config(cfg: Dict[str, Any]) -> Dict[str, Any]:
    """回显用：密钥字段打码。"""
    from .llm_config import mask_deepseek_block
    from .mes_profile import mask_mes_connection_secrets

    out = deepcopy(cfg)
    if isinstance(out.get("deepseek"), dict):
        out["deepseek"] = mask_deepseek_block(out["deepseek"])
    for path in SECRET_PATHS:
        v = _get(out, path)
        if v:
            _set(out, path, MASK)
    mask_mes_connection_secrets(out, MASK)
    return out


def merge_secrets(saved: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    """把界面提交的配置合并到已保存配置上：
    - 非密钥字段：以界面提交为准
    - 密钥字段：提交值为打码值 → 保留原值；空字符串 → 清空；其他 → 更新
    """
    from .llm_config import merge_deepseek_secrets, prepare_deepseek_for_save

    merged = deepcopy(saved)
    if isinstance(incoming, dict):
        _deep_merge(merged, incoming)
    if isinstance(incoming, dict) and isinstance(incoming.get("deepseek"), dict):
        merged["deepseek"] = merge_deepseek_secrets(
            saved.get("deepseek") or {},
            incoming.get("deepseek") or {},
        )
        merged["deepseek"] = prepare_deepseek_for_save(merged["deepseek"])
    for path in SECRET_PATHS:
        inv = _get(incoming, path)
        if inv is None:
            continue
        if inv == MASK:
            keep = _get(saved, path) or ""
            _set(merged, path, keep)
        else:
            _set(merged, path, inv)
    # 多工程对接卡：items 内密钥不在 SECRET_PATHS 路径上，须单独保留打码占位
    from .mes_profile import merge_mes_connection_secrets

    merge_mes_connection_secrets(saved, incoming if isinstance(incoming, dict) else {}, merged, MASK)
    return merged


def yaml_safe_load(text: str):
    import yaml

    return yaml.safe_load(text)


def yaml_dump(cfg: Dict[str, Any]) -> str:
    import yaml

    return yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False)
