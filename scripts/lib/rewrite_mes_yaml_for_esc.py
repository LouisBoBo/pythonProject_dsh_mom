# 一次性诊断脚本，勿进正式启停链路。改用 ensure_workbuddy_config_yaml_env.py。
# 已废弃：直接改 config.yaml 的 MES 段易误操作。
raise SystemExit(
    "deprecated: use scripts/lib/ensure_workbuddy_config_yaml_env.py "
    "(sidecar + WORKBUDDY_CONFIG_YAML); do not rewrite config.yaml here"
)
