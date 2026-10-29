# 项目内部署规则 · 可实施方案

> **状态**：方案定稿（待开发）· **日期**：2026-10-14  
> **目标**：每个业务工程自带部署规则；WorkBuddy 部署时读「当前工作区」内规则，不再靠配置中心一份全局 SSH/路径硬绑一个项目。  
> **不推翻**：四车道契约、HITL nonce、探活失败回滚（`workbuddy-deploy-service-alive`）、引擎只绑回环、密钥不进业务 git。  
> **产品入口**：用户仍只打开 http://127.0.0.1:3081 ；验收看引擎探活，不对用户报引擎端口。

---

## 0. 一句话

**部署规则跟工程走；本机私钥与「开车道」跟 WorkBuddy 走。**  
选哪个工作区部署，就读那个仓库根下的规则文件；缺文件则诚实停在「请补规则」，禁止再靠猜布局默认套 Vite+uvicorn。

---

## 1. 现状与痛点

### 1.1 现在怎么配

| 来源 | 内容 | 问题 |
|------|------|------|
| 设置 → **自动化部署**（`config.yaml` · `code_deploy`） | 开关、一体部署、默认分支、**单一**本地路径、SSH 主机/用户/密钥路径、远端目录、入口 URL、preset/构建/同步等 | **一份配置绑一个项目**；换工程要改设置或靠 override |
| `code_deploy.workspace_overrides` | 按路径子串叠 `ssh_app_path` / 入口 / 重启命令 | 仍写在 WorkBuddy 本机配置里，**不随业务仓走**，同事换机要重配 |
| 引擎 **项目画像**（`engine/data/project_profiles/*.json`） | 扫描缓存的 `deploy.preset` / `exclude_patterns` | 在 **WorkBuddy 数据目录**，不是业务仓文件；不能 SVN/Git 协作共享 |
| `resolve_deploy_strategy` | 全局 config → 画像 → 目录探测 | 探测失败才停；全局 preset 仍会盖住其它工程 |

截图中「本地项目路径 + SSH + 入口」整块，本质是 **单租户部署参数**，无法表达「A 厂 Vite+backend、B 仓静态、C 仓 WorkBuddy 一体」并存。

### 1.2 用户目标（本方案采纳）

1. **规则写在要部署的项目里**（可进业务版本库，团队共享）。  
2. 聊天/一体化说「部署」时，按 **当前工作区根** 读规则再执行。  
3. 配置中心只保留 **跨项目本机能力**（开车道、默认私钥路径等），不再当「唯一项目档案柜」。

### 1.3 与已有能力的关系（勿推倒）

| 已有 | 本方案 |
|------|--------|
| P1 按单元增量 + HITL + 探活回滚 | **保留**；只改「配置从哪读」 |
| `workspace_overrides` | **过渡期兼容**，P2 后降级为可选兜底，推荐迁到项目文件 |
| 项目画像 `deploy.*` | 继续作 **扫描提示 / 缺规则时的建议文案**；**真相源改为项目内文件** |
| MES 多对接卡 | **正交**：问数按对接卡；部署按项目文件。勿焊进 mes_connections |

---

## 2. 设计原则

1. **工程内可版本化**：默认文件可提交；密钥与本机路径进 **可选 local 覆盖**（gitignore）。  
2. **零配置中心态**：部署不以 WorkBuddy「自动化部署」页为准；可提交规则 + 本机 `deploy.local.yaml` 私钥即完整。  
3. **显式优于猜测**：无项目规则且无法识别布局 → `can_deploy=false`，引导生成模板。  
4. **合并顺序写死**（后者覆盖前者中的同名字段，密钥打码规则不变）：  
   `全局默认` → `项目 deploy.yaml` → `项目 deploy.local.yaml` →（可选）`workspace_overrides`。  
5. **安全底线不变**：私钥路径只在本机；`remote_restart_cmd` 仍白名单；禁止把 `.env` / `*.pem` / `config.yaml` 同步出去；探活失败必须回滚。  
6. **不对用户混报引擎端口**；公网入口仍只说浏览器 URL / 3081。

---

## 3. 文件约定

### 3.1 路径（仓库根 = 部署 workspace）

```text
<workspace>/
  .workbuddy/
    deploy.yaml          # 可提交：策略、远端布局、探活、排除、重启命令模板
    deploy.local.yaml    # 可选，建议 gitignore / svn:ignore：本机密钥路径、临时改 host
    deploy.example.yaml  # 可选样板（或由 WorkBuddy 文档/命令生成）
```

选用 **`.workbuddy/` 目录** 而不是仓根散落 `workbuddy.deploy.yaml`，便于以后扩展（如 `ask.yaml`、笔记约定），且一眼可 ignore local。

### 3.2 `deploy.yaml` 字段（v1）

```yaml
# .workbuddy/deploy.yaml — 可进业务 git/svn
version: 1

# 策略：auto | workbuddy | vite_backend | static | custom
preset: vite_backend          # 推荐写死；auto=仅目录探测

# 构建
build_where: local            # local | remote
build_cmd: "npm run build"    # custom/vite/static 常用
build_cwd: frontend
sync_paths:
  - frontend/dist
  - backend
dist_rel: frontend/dist

# 远端（无密钥）
ssh:
  host: "175.178.238.31"      # 可放 yaml；敏感环境可只放 local
  user: "root"
  port: 22
  app_path: "/www/wwwroot/zr-aicoding"
  # key_path 禁止写进可提交文件；只允许出现在 deploy.local.yaml

# 一体 / 收尾
unified_product: false        # 业务仓多数 false；WorkBuddy 自身仓才 true
auto_restart_engine: true
auto_restart_bridge: false
remote_restart_cmd: "systemctl restart zr-aicoding-api"   # 仍受引擎白名单校验
process_match: ""             # 无 systemd 时可选

# 探活（浏览器入口）
entry_url: "http://175.178.238.31:8090/"
health_url: ""                # 空则同 entry_url
health_expect_status: 0
health_timeout_sec: 8

# 分支默认（确认卡可改）
default_ref: HEAD

# 排除：与全局强制排除合并（强制项不可关掉）
rsync_excludes:
  - uploads/
  - "*.log"

# 环境策略（可选；默认沿用全局 staging 白名单）
# default_env: staging
```

### 3.3 `deploy.local.yaml`（本机，勿提交）

```yaml
version: 1
ssh:
  key_path: "C:/Users/Yu/.ssh/id_ed25519"   # 或留空，回退 WorkBuddy 全局 ssh_key_path
  # host / user / app_path 可在此覆盖测机
```

`.gitignore` / `svn:ignore` 建议：

```text
.workbuddy/deploy.local.yaml
```

### 3.4 密钥与禁止项（硬）

| 允许进可提交 yaml | 禁止进可提交 yaml |
|------------------|-------------------|
| host、user、port、app_path、preset、build_*、sync_paths、entry_url、restart 命令模板、excludes | `key_path`、私钥内容、密码、token、`.env` 内容 |

引擎加载时：若可提交文件出现 `ssh.key_path` / `password` / `token` → **拒绝部署并报错**（防止误提交）。

---

## 4. 运行时解析

### 4.1 入口

所有部署路径统一走：

```text
workspace（确认卡 / CLI / 一体化步骤 10）
  → load_project_deploy(workspace)
  → merge → CodeDeployConfig（或等价结构）
  → resolve_deploy_strategy(workspace, cfg, profile)
  → prepare / confirm（现有 HITL）
```

改码焦点：

| 模块 | 改动 |
|------|------|
| **新** `engine/app/code_deploy/project_file.py` | 定位仓库根、读 yaml、校验、合并 |
| `code_deploy/config.py` | `resolve_config_for_workspace`：**优先项目文件**，再 overrides / 启发式 |
| `code_deploy/ops.py` / `units.py` | prepare 时带上 `deploy_source=project_file|global|…` 写入确认卡 |
| `code_deploy/deploy_strategy.py` | 文案改为「请在项目 `.workbuddy/deploy.yaml` 配置」；全局 preset 不再优先于项目文件 |
| `features/code-deploy` | 工具说明：缺规则时提示生成模板 |
| `mes-bridge` 设置页「自动化部署」 | 精简 UI（见 §5） |
| 一体化 `dev_pipeline/lane_exec` | 步骤 10 已有 workspace，无需第二套配置 |

### 4.2 找仓库根

从 `workspace` 绝对路径向上找，命中其一即根：

1. 存在 `.workbuddy/deploy.yaml` 或 `deploy.local.yaml`  
2. 否则存在 `.git` / `.svn`  
3. 否则用传入 `workspace` 自身（与今日行为一致）

禁止把规则解析到 workspace **之外**（路径穿越：resolve 后须仍在允许根下）。

### 4.3 合并伪代码

```text
base = get_config()                    # 全局：enabled、默认 key_path、强制 excludes…
proj = read_yaml(.workbuddy/deploy.yaml) or {}
local = read_yaml(.workbuddy/deploy.local.yaml) or {}
assert_no_secrets_in_committed(proj)
cfg = deep_overlay(base, proj, local)  # 仅白名单字段
cfg = apply_workspace_overrides(cfg)   # 过渡期；命中则打 note「建议迁到项目文件」
if not project_file_exists and cfg.deploy_preset == "auto":
    # 仅探测；unknown → can_deploy false + 生成模板指引
```

### 4.4 缺文件时的产品行为

| 情况 | 行为 |
|------|------|
| 无 `.workbuddy/deploy.yaml`，目录可探测为 vite/static/workbuddy | **P0**：可用探测结果部署，确认卡注明「未找到项目规则，按目录探测」；并建议「一键写入模板」 |
| 无文件且探测 unknown | **硬失败**：确认卡/工具返回引导，附 `deploy.example.yaml` 内容或 `code-deploy-init` CLI |
| 有文件但缺 SSH host/app_path 且 local/全局也没有 | 硬失败：列出缺字段 |
| 有文件但缺 `key_path`（local+全局皆空） | 硬失败：提示到 WorkBuddy 设置填默认私钥或写 local |

**P1 建议**：探测成功也鼓励提交规则文件，避免同事机器探测不一致。

### 4.5 确认卡展示（必改文案）

增加一行只读摘要，避免「以为还在用设置页那一套」：

- 规则来源：`项目 .workbuddy/deploy.yaml` / `探测` / `全局+overrides`  
- 远端：`user@host:app_path`  
- 策略：`preset` + `sync_paths` 摘要  
- 入口：`entry_url`

---

## 5. 配置中心 UI 怎么变

### 5.1 配置中心「自动化部署」页已删除

说明写在**目标工程** `.workbuddy/README.md`；规则文件同目录 `deploy.yaml` + `deploy.local.yaml`。  
WorkBuddy 配置中心不再出现「自动化部署」导航；保存也不写 `code_deploy`。

### 5.2 与 MES 对接卡的对照（口径）

| | MES 连接 | 部署规则 |
|--|----------|----------|
| 多工程真相源 | WorkBuddy `mes_connections` 卡 | **业务仓** `.workbuddy/deploy.yaml` |
| 为何不同 | MES 地址常含 token，且不一定方便进业务仓 | 部署策略应随代码评审一起改 |
| 工作区角色 | 绑定「问数用哪张卡」 | 「部署读哪个仓的规则」 |

---

## 6. 实施阶段（可交付切片）

### P0 — 可读项目文件并优先合并（约 1～2 天）

**目标**：只要工程里有 `.workbuddy/deploy.yaml`，部署用它；设置页里错绑的「本地路径」不再决定远端目录。

- [ ] 新增 `project_file.py`：读/校验/合并；单测覆盖合并顺序、禁提交密钥、路径根解析  
- [ ] 改 `resolve_config_for_workspace`：项目文件优先于 `workspace_overrides` 与内置 aicoding 启发式  
- [ ] 改 `resolve_deploy_strategy`：项目 `preset` 优先于全局 `deploy_preset`  
- [ ] prepare/确认卡展示规则来源  
- [ ] 文档样板：`Framework/docs/功能实现/` 附 example；仓库可放 `scripts/examples/workbuddy-deploy.example.yaml`  
- [ ] 单测：`tests/test_code_deploy_project_file.py`  
- [ ] 人工：用 `pythonProject_zr_aicoding` 写入 yaml，设置页改成错误 app_path，确认仍发到 yaml 中的路径  

**验收**：换工作区部署，远端路径随项目文件变；无 yaml 的旧仓行为与今天兼容（overrides/探测）。

### P1 — 设置页精简 + 生成模板（约 1 天）

- [ ] 设置 UI：主路径只留开关 + 默认私钥；项目相关字段挪到说明 +「生成模板」  
- [ ] CLI/工具：`code-deploy-init [workspace=]` 写入 `.workbuddy/deploy.yaml`（按探测填 preset）  
- [ ] 业务仓 `.gitignore` 说明；WorkBuddy 文档索引更新  
- [ ] `availability()` 文案：缺规则时指向项目文件，不再只说「去配置中心填 SSH」  

**验收**：新工程「生成模板 → 填 host/app_path → 部署」全流程；设置页不再要求填本地项目路径。

### P2 — 收口 overrides 与画像（约 0.5～1 天）

- [ ] `workspace_overrides` 命中时确认卡警告「请迁到项目文件」；文档标 deprecated  
- [ ] 画像 `deploy.preset` 仅用于 init 模板建议，不再作为高于项目文件的真相源  
- [ ] 删除或收窄内置 aicoding 启发式（避免与文件双真相）  
- [ ] （可选）设置页「全局默认 SSH host」仅作无项目字段时的兜底  

**验收**：去掉 WorkBuddy 里 aicoding override 后，只靠项目 yaml 仍能部署。

### 不在本期

- 多环境矩阵（staging/prod 多份 yaml）——可预留 `deploy.staging.yaml`，v1 不做切换 UI  
- 非 SSH provider、K8s、纯 CI  
- 把私钥写进项目仓  
- 改 DSH 插件源码  

---

## 7. 安全与合规清单

| 项 | 要求 |
|----|------|
| HITL | 仍须 `code-deploy.confirm` + nonce；聊天一句不直接 SSH |
| 探活回滚 | 保持 LOCKED；`entry_url`/`health_url` 来自合并后配置 |
| 重启命令 | 现有正则白名单；项目文件也不能写任意 shell |
| 排除 | 强制排除 ∪ 全局 ∪ 项目 `rsync_excludes` ∪ 画像 excludes |
| 路径 | 规则文件必须在 workspace 根下；禁止 `../` 逃逸读其它盘规则 |
| 回显 | Job/SSE 不打印密钥；local 中的 key_path 日志脱敏 |
| 提交门禁 | CI/自检：可扫描业务仓禁止 `key_path` 出现在 `deploy.yaml`（非 local） |

---

## 8. 迁移指南（给已有用户）

1. 在业务仓根执行「生成模板」或手工建 `.workbuddy/deploy.yaml`。  
2. 把当前设置页里的 **host / user / app_path / entry_url / restart / preset / sync_paths** 抄进去。  
3. 私钥只放 WorkBuddy 设置或 `deploy.local.yaml`。  
4. 保存后做一次 **staging 干跑确认卡**，核对应规则来源与远端路径。  
5. 确认无误后再删掉 `config.yaml` 里对应的 `workspace_overrides` 项。  

示例（对应截图中的 aicoding）：

```yaml
version: 1
preset: vite_backend          # 或 custom，按实际布局
unified_product: false
default_ref: HEAD
ssh:
  host: "175.178.238.31"
  user: "root"
  port: 22
  app_path: "/www/wwwroot/zr-aicoding"
entry_url: "http://175.178.238.31:8090/"
remote_restart_cmd: "systemctl restart zr-aicoding-api"
build_where: local
# build_cmd / sync_paths 按探测或现网填写
```

---

## 9. 测试计划

| 用例 | 期望 |
|------|------|
| 仅有全局配置、无项目文件 | 行为与现网兼容（overrides/探测） |
| 有项目文件，全局 app_path 故意填错 | 使用项目文件路径 |
| 项目文件含 `ssh.key_path` | 拒绝部署 |
| `deploy.local.yaml` 覆盖 host | 合并后 host 为 local |
| 路径穿越 `workspace` + 规则在仓外 | 不读取或失败 |
| 非法 `remote_restart_cmd` | 校验失败 |
| 探活失败 | 回滚且部署失败（既有单测仍过） |
| 一体化步骤 10 | 读 Epic workspace 的项目文件 |
| Windows 路径 | `\`/`/` 归一；大小写按现网 `_norm` |

命令（落地后）：

```bash
cd apps/zr-workbuddy/engine
python -m unittest tests.test_code_deploy_project_file tests.test_code_deploy_strategy tests.test_code_deploy_service_alive -q
```

---

## 10. 文档与索引

| 动作 | 路径 |
|------|------|
| 本方案 | `Framework/docs/功能实现/项目内部署规则-可实施方案.md` |
| 实现后改 P1 文 | `P1-自动化部署-按单元增量.md` 增加「配置真相源」一节 |
| 知识库索引 | `Framework/docs/README.md` |
| 清单对齐 | `agent-optimization-checklist.md` §8 补「项目内 yaml」一行 |

---

## 11. 风险与决策记录

| 风险 | 缓解 |
|------|------|
| 业务仓忘提交 yaml，同事机器行为不一致 | init 模板 + 确认卡标明来源；P1 文档要求评审必带 |
| 与 `workspace_overrides` 双真相 | 合并顺序写死；P2 弃用 overrides |
| 把密钥写进 yaml | 加载拒绝 + 文档红字 + 可选 pre-commit 扫描 |
| 设置页大改引起「不会配了」 | P0 兼容旧全局；P1 再藏字段并给「生成模板」 |
| 公网 8093 一体与业务仓部署混淆 | `unified_product` 默认 false；仅 WorkBuddy 自仓写 true |

**已拍板（本方案）**：

1. 真相源 = 项目 `.workbuddy/deploy.yaml`（+ optional local）。  
2. 全局只保留车道开关与默认私钥（及可选兜底）。  
3. 不新造第二个 bridge / 不改 DSH 插件。  
4. 探活回滚与 HITL 不破窗。

---

## 12. 建议开发顺序（给执行者）

1. 单测先行：`load_project_deploy` 合并与禁密钥。  
2. 接线 `resolve_config_for_workspace`。  
3. 确认卡来源字段。  
4. 用 aicoding 仓落一份真实 yaml 冒烟。  
5. 再改设置页与 init 命令。  
6. 最后弃用启发式 / overrides。

---

## 13. 与「现在能不能删设置页部署」的结论

**现在不要整页删除。**  
P0 先让项目文件优先生效；P1 再精简 UI。整页删除会导致无项目文件的旧用户无法开车道、无法配私钥。
