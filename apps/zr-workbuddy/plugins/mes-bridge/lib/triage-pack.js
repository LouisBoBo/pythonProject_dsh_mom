/**
 * 宿主分诊辅助段。只读已缓存画像，不注册工具、不改分流表。
 * 任何读盘失败都应让调用方忽略，沿用原有提示。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { enrichMessageWithAcceptanceHints } from "./coding-acceptance.js";

const MAX_CHARS = 1400;
const NOTES_MAX = 240;

/** 只列出「第一个工具」车道。识图 / 旧写码不写进来，避免抢走分流表。 */
const LANE_HINT = {
  "mes-ask": "查数量、明细、列表，以及保养/库存/点检等已导入业务 → mes_ask",
  "mes-pcb": "PCB 叠层/阻抗/DFM 等工艺术语，且不是在问良率数字 → mes_pcb",
  "code-review": "看看改动、有没有问题、review → mes_code_review_begin",
  "code-commit": "提交 → mes_code_commit_begin",
  "code-deploy": "部署 → mes_code_deploy_begin",
  "dev-pipeline": "需求→上线仅当绿色开关开着 → mes_dev_pipeline_begin",
  "company-knowledge": "制度、口径、计价 → mes_company_knowledge",
};

export function profileStoreKey(workspace) {
  const raw = String(workspace || "").trim();
  if (!raw) return "";
  let norm;
  if (process.platform === "win32") {
    norm = path.win32.normalize(raw).replace(/[\\/]+$/, "");
    norm = norm.toLowerCase();
  } else {
    norm = path.posix.normalize(raw).replace(/\/+$/, "");
  }
  return crypto.createHash("sha256").update(norm, "utf8").digest("hex").slice(0, 32);
}

export function summaryHead(profile) {
  const summary = profile && typeof profile.summary_zh === "string" ? profile.summary_zh : "";
  const lines = summary
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.slice(0, 5).join("\n");
}

function clip(text, max) {
  const s = String(text || "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}

/**
 * DSH 0.2 在每轮前注入 time-context / tmux 等 snapshot，不是用户原话。
 * form=snapshot 或这些 kind 不得覆盖分诊用的真需求。
 */
export function isDisposableHostUserSource(source) {
  if (!source || typeof source !== "object") return false;
  if (source.baseline === true) return true;
  if (source.form === "snapshot") return true;
  if (source.form === "recall") return true;
  const kind = String(source.kind || "");
  if (kind === "plugin" || kind.startsWith("plugin:")) return true;
  return (
    kind === "agent-instructions" ||
    kind === "system" ||
    kind === "time-context" ||
    kind === "tmux-context"
  );
}

/** 去掉宿主塞进用户消息里的时间快照，留下后面的真需求。 */
export function stripDshTimeSnapshot(text) {
  return String(text || "")
    .replace(
      /(?:^|\n)\s*Time sampled while preparing turn [\s\S]*?Elapsed since the preceding [^\n]*(?:\n+|$)/gi,
      "\n",
    )
    .trim();
}

function utteranceHead(text) {
  return stripDshTimeSnapshot(text)
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
    .trim()
    .slice(0, 400);
}

/** 明确在改产品/页面/代码（不是「业务库里多一条数据」）。 */
export function looksLikeExplicitCodeChange(text) {
  const head = utteranceHead(text);
  if (!head) return false;
  if (
    /(改代码|改页面|改菜单|加列|加个按钮|加字段|加功能|写码|修一下|报表页|做一个|挪菜单|删菜单|加路由|改接口实现)/.test(
      head,
    )
  ) {
    return true;
  }
  // 「删除对账付款界面 / 去掉某菜单」等：开发改盘，不是业务删库记录
  if (/(删除|删掉|去掉|移除|下线|隐藏).{0,20}(界面|页面|菜单|报表|模块|入口|视图|路由)/.test(head)) {
    return true;
  }
  // 「删除员工工时列表」：列表页本身，不是删一条业务记录
  if (/(删除|删掉|去掉|移除|下线|隐藏).{0,24}列表页?[。.!！]?$/.test(head)) {
    return true;
  }
  if (/(界面|页面|菜单|报表).{0,12}(删除|删掉|去掉|下线|移除)/.test(head)) {
    return true;
  }
  // 「创建一个工单管理页面 / 添加员工工时报表」等：增删改盘，不是业务建单
  if (
    /(创建|新建|增加|新增|添加|加个|做一个).{0,24}(界面|页面|菜单|模块|报表|入口|视图|路由)/.test(
      head,
    )
  ) {
    return true;
  }
  // 「帮我开发一个工艺评审系统 / 从零搭建应用」：整应用开发，不是查 PCB 术语
  if (
    /(帮我开发|开发一个|从零搭建|从零开发|搭建一个|新做一个).{0,24}(系统|应用|平台|网站|工程)/.test(
      head,
    )
  ) {
    return true;
  }
  if (/(工艺评审系统|评审系统)/.test(head) && /(开发|搭建|做|写)/.test(head)) {
    return true;
  }
  return false;
}

/** 原话已是清晰写码时，禁止再用问卷卡把聊天撑成空白。一体化开着时走已有拦截。 */
export function clearCodingAskDenyReason(toolName, utterance, opts) {
  const name = String(toolName || "");
  const isAsk =
    name === "ask_user_question" ||
    name === "AskUserQuestion" ||
    name.toLowerCase() === "ask_user_question";
  if (!isAsk) return "";
  if (opts && opts.integrated) return "";
  const lane = clearLaneKind(utterance, opts);
  if (lane !== "coding") return "";
  return (
    "本条需求已明确是开发改盘。禁止 ask_user_question（问卷卡会被折叠，聊天只剩空白）。" +
    "立刻 zr_cchat_begin(message=用户原话) 开始写码。"
  );
}

/**
 * 像「业务里新增一条单据/记录」。
 * 不写死行业词与固定车道优先级；只作软信号，与其它信号冲突时交给 resolve。
 */
export function looksLikeBusinessRecordOp(text) {
  const head = utteranceHead(text);
  if (!head) return false;
  // 数量词 + 增删类动词，或「新建/录入/创建…单据类」
  const qty = /(一条|一张|一笔|一单|几条|几张)/.test(head);
  const verb = /(增加|新增|加一|加条|新建|录入|创建|补一|插一)/.test(head);
  if (qty && verb) return true;
  if (/(新建|录入|创建).{0,12}(订单|单据|记录|申请|工单|台账)/.test(head)) return true;
  return false;
}

/** 像查数/问业务数据（软信号；可与建单、写码并存，由 resolve 消解）。 */
export function looksLikeAskQuery(text) {
  const head = utteranceHead(text);
  if (!head) return false;
  if (/(还有多少|查一下|查下|查一查|统计一下|多少台|多少件)/.test(head)) return true;
  if (/(产量|良率|不良率)/.test(head)) return true;
  if (/(保养|库存|点检|台账|工单)/.test(head) && /(查|问|看下|看看|有多少|还有)/.test(head)) {
    return true;
  }
  // 仅业务名词：弱信号，单独出现时仍可提示查数
  if (/(保养|库存|点检|台账|产量|良率|工单)/.test(head)) return true;
  return false;
}

const SIGNAL_LABEL = {
  review: "审码",
  commit: "提交",
  deploy: "部署",
  knowledge: "知识",
  pcb: "PCB",
  coding: "写码",
  business: "业务建单",
  ask: "查数",
};

/**
 * 并行收集车道软信号（不按写死先后顺序互斥砍掉）。
 * strength=strong 表示原话已够稳；soft 可与其它信号并存，有 strong 时先看 strong 池。
 */
export function collectLaneSignals(text, opts) {
  const head = utteranceHead(text);
  const out = [];
  if (!head) return out;
  const integrated = !!(opts && opts.integrated);
  const push = (id, strength) => {
    if (!out.some((s) => s.id === id && s.strength === strength)) {
      out.push({ id, strength });
    }
  };

  if (/(审核|审码|code\s*review|看看改动|帮我\s*review)/i.test(head)) {
    push("review", "strong");
  }
  if (/(提交代码|帮我\s*commit|git\s*commit|push\s*本批|提交本批|提交门禁)/i.test(head)) {
    push("commit", "strong");
  }
  if (!integrated && /(部署|上线|预发|发布服务器|发布到)/.test(head)) {
    push("deploy", "strong");
  }
  if (/(计价|制度|口径|公司知识|规划文档)/.test(head)) {
    push("knowledge", "strong");
  }
  const codingStrong = looksLikeExplicitCodeChange(head);
  if (codingStrong) {
    push("coding", "strong");
  } else if (
    /(改代码|改页面|改菜单|加列|加个|写码|修一下|按钮|报表页|做一个|挪菜单|删菜单)/.test(head)
  ) {
    push("coding", "soft");
  }

  // 需求正文里的「阻抗/叠构」字段名不得抢走「开发一个系统」写码车道
  if (
    !codingStrong &&
    /(PCB|叠层|阻抗|DFM)/i.test(head) &&
    !/(良率|产量|不良率)/.test(head)
  ) {
    push("pcb", "strong");
  }

  if (looksLikeBusinessRecordOp(head)) {
    // 业务建单本身通常要澄清车道，标 soft；与写码 strong 并存时由 resolve 判模糊或取 strong
    push("business", "soft");
  }

  if (looksLikeAskQuery(head)) {
    const strongAsk = /(还有多少|查一下|查下|统计|产量|良率|不良率)/.test(head);
    push("ask", strongAsk ? "strong" : "soft");
  }

  return out;
}

/**
 * 灵活消解（不写死全序优先级）：
 * - 全信号恰好一条非 business → 清晰；
 * - 多条并存 → 默认模糊（避免「查数 strong 压掉建单 soft」这类硬优先级）；
 * - 例外：写码 strong 常带领域词（工单/页面），仍可判清晰写码。
 */
export function resolveClearLane(signals) {
  const list = Array.isArray(signals) ? signals : [];
  if (!list.length) return "";
  const ids = [];
  const strongIds = [];
  for (const s of list) {
    const id = String((s && s.id) || "").trim();
    if (!id) continue;
    if (!ids.includes(id)) ids.push(id);
    if (s.strength === "strong" && !strongIds.includes(id)) strongIds.push(id);
  }
  if (ids.length === 1) {
    return ids[0] === "business" ? "" : ids[0];
  }
  if (strongIds.length === 1 && strongIds[0] === "coding") return "coding";
  return "";
}

/**
 * 原话是否已能对上一条明确车道（清晰 → 不宜先问卷）。
 * 返回短标签供日志；空串表示模糊/未命中/多信号冲突。
 */
export function clearLaneKind(text, opts) {
  return resolveClearLane(collectLaneSignals(text, opts));
}

const FEATURE_BY_LANE = {
  review: "code-review",
  commit: "code-commit",
  deploy: "code-deploy",
  knowledge: "company-knowledge",
  pcb: "mes-pcb",
  ask: "mes-ask",
};

/** 本条原话对应的功能插件 id（仅辅助）。普通写码不绑 features id。 */
export function guessUtteranceFeatureId(text, opts) {
  const integrated = !!(opts && opts.integrated);
  const lane = clearLaneKind(text, opts);
  if (!lane) return "";
  if (lane === "coding") return integrated ? "dev-pipeline" : "";
  return FEATURE_BY_LANE[lane] || "";
}

function fuzzyLaneHint(signals) {
  const labels = [];
  for (const s of signals || []) {
    const lab = SIGNAL_LABEL[s.id] || s.id;
    if (lab && !labels.includes(lab)) labels.push(lab);
  }
  const sig =
    labels.length > 0 ? "当前软信号：" + labels.join("、") + "。" : "尚未稳命中单一车道。";
  return (
    "本条需求偏模糊（" +
    sig +
    "）。灵活处理：不要按固定优先级硬选；用底座追问只给车道级短选项（查数/业务建单 · 写码改功能 · 审码/提交/部署等），不要问实现细节。" +
    "用户确认后下一轮立刻调对应 begin，并把原需求写入 message。与分流表冲突时以分流表为准。"
  );
}

/** 本条原话的软提示。只辅助理解，任何时候都以分流表为准；不推荐旧写码/识图入口。 */
export function guessUtteranceLane(text, opts) {
  const integrated = !!(opts && opts.integrated);
  const signals = collectLaneSignals(text, opts);
  if (!signals.length) return "";
  const tip = (lane) => "本条原话更像：" + lane + "。与分流表冲突时以分流表为准。";
  const clear = resolveClearLane(signals);
  if (!clear) return fuzzyLaneHint(signals);

  if (clear === "review") return tip("代码审核 → mes_code_review_begin");
  if (clear === "commit") return tip("提交 → mes_code_commit_begin");
  if (clear === "deploy") return tip("部署 → mes_code_deploy_begin");
  if (clear === "knowledge") return tip("知识问答 → mes_company_knowledge");
  if (clear === "pcb") return tip("PCB 工艺 → mes_pcb");
  if (clear === "ask") return tip("查数 → mes_ask");
  if (clear === "coding") {
    if (integrated) {
      return tip(
        "开发改盘（意图已够清晰）→ 立刻 mes_dev_pipeline_begin(message=原话)；不要先 ask_user_question",
      );
    }
    return tip(
      "开发改盘（意图已够清晰）→ 立刻 zr_cchat_begin(message=原话)；不要先 ask_user_question 问删除范围",
    );
  }
  return fuzzyLaneHint(signals);
}

export function utteranceLaneAdvice(text, opts) {
  const integrated = !!(opts && opts.integrated);
  const enabled = Array.isArray(opts && opts.enabledIds) ? opts.enabledIds.map(String) : [];
  const hint = guessUtteranceLane(text, { integrated });
  const featureId = guessUtteranceFeatureId(text, { integrated });
  let disabledNote = "";
  if (featureId && enabled.length > 0 && !enabled.includes(featureId) && LANE_HINT[featureId]) {
    disabledNote =
      "本条更像「" +
      LANE_HINT[featureId] +
      "」所属车道，但当前未启用该功能插件。请到功能插件页打开后再试，不要改调其它工具。与分流表冲突时以分流表为准。";
  }
  return { hint, disabledNote, featureId };
}

/** 太泛的目录名不做「原话相关」命中，避免 src/app 误报。 */
const SKIP_RELATED_NAMES = new Set([
  "src",
  "source",
  "lib",
  "frontend",
  "backend",
  "app",
  "apps",
  "server",
  "client",
  "web",
  "views",
  "pages",
  "screens",
  "api",
  "apis",
  "tests",
  "test",
  "docs",
  "doc",
  "public",
  "static",
  "assets",
  "config",
  "configs",
  "dist",
  "build",
]);

function nameHitsUtterance(name, head) {
  const token = String(name || "").trim();
  if (!token || token.length < 2) return false;
  const low = token.toLowerCase();
  if (SKIP_RELATED_NAMES.has(low)) return false;
  const hay = String(head || "");
  if (/^[a-z0-9_-]+$/i.test(token)) {
    const escaped = low.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9_])" + escaped + "([^a-z0-9_]|$)", "i").test(hay);
  }
  return hay.toLowerCase().includes(low);
}

/** 原话命中的目录/模块名（来自已扫描画像）。只辅助分诊，不替代全文目录。 */
export function relatedDirectoryHints(utterance, profile) {
  const head = utteranceHead(utterance);
  if (!head) return [];
  const block = profile && profile.directory && typeof profile.directory === "object" ? profile.directory : {};
  const roots = Array.isArray(block.roots) ? block.roots : [];
  const names = [];
  const seen = new Set();
  function pushName(raw) {
    const name = String(raw || "").trim();
    if (!name || name.length < 2) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  }
  for (const row of roots) {
    if (!row || typeof row !== "object") continue;
    pushName(row.name);
    const children = Array.isArray(row.children) ? row.children : [];
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      pushName(child.name);
      const modules = Array.isArray(child.modules) ? child.modules : [];
      for (const mod of modules) pushName(mod);
    }
  }
  const hits = [];
  for (const name of names) {
    if (nameHitsUtterance(name, head)) hits.push(name);
    if (hits.length >= 6) break;
  }
  return hits;
}

/** 首工具日志脱敏：避免把 Key / Token 写进 jsonl。 */
export function redactForLog(text) {
  let s = String(text || "");
  s = s.replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]");
  s = s.replace(/\bBearer\s+[A-Za-z0-9._\-+=\/]+/gi, "Bearer [redacted]");
  s = s.replace(
    /\b(api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*\S+/gi,
    "$1=[redacted]",
  );
  return s;
}

const FIRST_TOOL_LANES = new Set([
  "mes_ask",
  "mes_pcb",
  "mes_company_knowledge",
  "mes_code_review_begin",
  "mes_code_commit_begin",
  "mes_code_deploy_begin",
  "mes_dev_pipeline_begin",
  "zr_cchat_begin",
  "zr_cchat_continue",
  "zr_cursor_begin",
  "mes_code_dev_begin",
  "ask_user_question",
  "AskUserQuestion",
]);

export function formatFirstToolLogLine({
  sessionId,
  tool,
  utterance,
  workspace,
  hasDirectory,
  clearLane,
  integrated,
}) {
  const name = String(tool || "").trim();
  if (!name || !FIRST_TOOL_LANES.has(name)) return "";
  const utt = String(utterance || "");
  const lane =
    String(clearLane || "").trim() ||
    clearLaneKind(utt, { integrated: !!integrated });
  const isAsk =
    name === "ask_user_question" ||
    name === "AskUserQuestion" ||
    name.toLowerCase() === "ask_user_question";
  const row = {
    ts: new Date().toISOString(),
    session: String(sessionId || "").slice(0, 80),
    tool: name,
    utterance: redactForLog(utt)
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, " ")
      .trim()
      .slice(0, 160),
    workspace: redactForLog(String(workspace || "")).slice(0, 240),
    hasDirectory: !!hasDirectory,
  };
  // 原话已清晰却先问卷：便于事后看「插件未命中」比例（只记日志，不拦执行）
  if (isAsk && lane) row.clearLaneMissed = lane;
  try {
    return JSON.stringify(row);
  } catch {
    return "";
  }
}

export function formatHostTriage({
  workspace,
  summaryHead: head,
  notes,
  enabledIds,
  directoryBlock,
  utteranceHint,
  disabledLaneNote,
  relatedDirs,
}) {
  const enabled = Array.isArray(enabledIds) ? enabledIds.map(String) : [];
  const lanes = [];
  for (const id of enabled) {
    if (LANE_HINT[id]) lanes.push(LANE_HINT[id]);
  }
  const ws = String(workspace || "").trim();
  const stack = String(head || "").trim();
  const lines = [
    "## 当前工作区（辅助理解，分流表优先）",
    "灵活判定（**不要**按写死优先级卡死某条车道）：对照分流表与已启用插件；原话只稳命中一条就立刻调对应工具；对不上、或同时像多条、或业务建单与改功能说不清 → 才底座追问。",
    "何时算模糊（可操作）：对不上分流表，或软信号互相冲突（如又像建单又像查数/写码）。已能稳命中（如删界面→写码、审码→审码、查一下产量→查数）=清晰，不宜先问卷。",
    "底座追问只问车道级短选项（查数 / 业务建单 / 写码 / 审码 / 提交 / 部署 / 知识等），不要问实现细节。",
    "用户确认车道后：下一轮第一个工具必须是对应 begin，message 带上用户原需求+所选车道；禁止再问卷、禁止闲聊了事。",
    "写码终态（进度卡已完成/失败）：必须口语告知用户本轮结论（成功讲结果与验收，失败讲原因）；禁止同一原话再开续改确认卡。",
    "例外：输入框旁绿色「需求→上线」已开时，仍禁止开跑前 ask_user_question 抢 UI（第一个工具直接 mes_dev_pipeline_begin）。",
    "本段只辅助理解，不新增工具。与分流表冲突时以分流表为准。",
  ];
  if (!ws) {
    lines.push("工作区：当前会话还没有工程目录。不要套用其它仓库的目录或框架。");
  } else if (!stack) {
    lines.push("工作区已选，画像尚未生成。不要套用其它仓库的目录或框架。");
  } else {
    lines.push(stack);
  }
  const hint = String(utteranceHint || "").trim();
  if (hint) lines.push(hint);
  const disabled = String(disabledLaneNote || "").trim();
  if (disabled) lines.push(disabled);
  const note = clip(notes, NOTES_MAX);
  if (note) {
    lines.push(
      "工程意图词典（仅背景，不覆盖分流表；可写「点检=查数」这类短句）：" + note,
    );
  }
  if (lanes.length) {
    lines.push("当前已启用车道：" + lanes.join("；") + "。");
    lines.push("未出现在上述列表的车道不要调用；未启用时不要改调邻近工具。");
  }
  lines.push(
    "补充（分流表未点名时）：问保养、库存、点检、台账等已导入业务，与问产量工单一样可走查数；只有「是什么/怎么定义」且没有数量或时间范围时才当概念。" +
      "「增加/新建一条单据」等软信号未单独稳命中时：灵活追问业务建单还是改功能，确认后再导；禁止用种子/演示数据冒充业务交付。",
  );
  const rules = clip(lines.join("\n"), MAX_CHARS);
  const related = Array.isArray(relatedDirs)
    ? relatedDirs.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 6)
    : [];
  const directory = String(directoryBlock || "").trim();
  let extra = "";
  if (related.length) {
    extra += "\n原话可能相关目录：" + related.join("、") + "。仍以分流表为准，不要复述给用户。";
  }
  if (directory) {
    extra +=
      "\n以下目录只供你理解用户意图并选择工具。不要复述给用户，不要写进写码 message。\n" +
      directory;
  }
  if (!extra) return rules;
  return rules + extra;
}

export function formatDirectoryBlock(profile) {
  const block = profile && profile.directory && typeof profile.directory === "object" ? profile.directory : {};
  const roots = Array.isArray(block.roots) ? block.roots : [];
  const lines = ["【工作区目录画像】"];
  let wrote = false;
  for (const row of roots) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.path || row.name || "").trim();
    if (!name) continue;
    wrote = true;
    const role = String(row.role || "").trim();
    lines.push(role ? name + "（" + role + "）" : name);
    const children = Array.isArray(row.children) ? row.children : [];
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      const cname = String(child.path || child.name || "").trim();
      if (!cname) continue;
      const crole = String(child.role || "").trim();
      lines.push("  " + (crole ? cname + "（" + crole + "）" : cname));
      const modules = Array.isArray(child.modules) ? child.modules : [];
      const shown = [];
      for (const m of modules) {
        const token = String(m || "").trim();
        if (token) shown.push(token);
      }
      if (shown.length) lines.push("    " + shown.join("、"));
      if (child.modules_truncated) lines.push("    更深目录超过上限，其余未收入");
    }
    if (row.children_truncated) lines.push("  子目录超过扫描上限，其余未收入");
  }
  if (!wrote) return "";
  if (block.truncated) lines.push("顶层目录超过扫描上限，其余未收入");
  return lines.join("\n");
}

function listField(arr, max) {
  const out = [];
  for (const raw of arr || []) {
    const s = String(raw || "").trim();
    if (!s || out.includes(s)) continue;
    out.push(s);
    if (out.length >= (max || 6)) break;
  }
  return out;
}

/**
 * 写码专用短画像（Q0-3 补全）：栈 + 前后端根 + 精简目录 + 通用禁改。
 * 只读已有 profile 字段；不焊死某一家 ERP 路径。分诊仍用 formatDirectoryBlock。
 */
export function formatCodingPortraitBlock(profile) {
  if (!profile || typeof profile !== "object") return "";
  const lines = ["【工作区目录画像】"];
  let meaningful = false;

  const stackObj = profile.stack && typeof profile.stack === "object" ? profile.stack : {};
  const fe = listField(stackObj.frontend, 6);
  const be = listField(stackObj.backend, 6);
  const langs = listField(profile.languages, 4);
  const stackBits = [];
  if (fe.length) stackBits.push("前端 " + fe.join("/"));
  if (be.length) stackBits.push("后端 " + be.join("/"));
  if (langs.length) stackBits.push("语言 " + langs.join("/"));
  if (stackBits.length) {
    lines.push("栈：" + stackBits.join("；"));
    meaningful = true;
  }

  const head = summaryHead(profile);
  if (head) {
    lines.push("摘要：" + head.replace(/\n/g, " / "));
    meaningful = true;
  }

  const layout = profile.layout && typeof profile.layout === "object" ? profile.layout : {};
  const viewDirs = listField(layout.view_dirs, 6);
  const apiDirs = listField(layout.api_dirs, 6);
  const entries = listField(layout.entry_files, 4);
  const routers = listField(layout.router_files, 4);
  const menus = listField(layout.menu_files, 4);
  const kind = String(layout.kind || "").trim();
  if (kind) {
    lines.push("布局类型：" + kind);
    meaningful = true;
  }
  if (viewDirs.length) {
    lines.push("前端/页面根：" + viewDirs.join("、"));
    meaningful = true;
  }
  if (apiDirs.length || entries.length) {
    const bits = [];
    if (apiDirs.length) bits.push(apiDirs.join("、"));
    if (entries.length) bits.push("入口 " + entries.join("、"));
    lines.push("后端/接口根：" + bits.join("；"));
    meaningful = true;
  }
  if (routers.length) {
    lines.push("路由：" + routers.join("、") + "（新页面须能在此注册/被引用）");
    meaningful = true;
  }
  if (menus.length) {
    lines.push("菜单/导航：" + menus.join("、") + "（勿假设其它仓库的固定注册文件）");
    meaningful = true;
  }

  const ui = profile.ui && typeof profile.ui === "object" ? profile.ui : {};
  const styles = listField(ui.style_libs, 4);
  const samples = listField(ui.sample_pages, 3);
  if (styles.length) {
    lines.push("界面库：" + styles.join("、"));
    meaningful = true;
  }
  if (samples.length) {
    lines.push("对照样例页：" + samples.join("、"));
    meaningful = true;
  }

  // 目录要点：只顶层 + 一层子目录名（不灌 modules，控制长度）
  const dir = profile.directory && typeof profile.directory === "object" ? profile.directory : {};
  const roots = Array.isArray(dir.roots) ? dir.roots : [];
  const dirLines = [];
  let rootN = 0;
  for (const row of roots) {
    if (!row || typeof row !== "object") continue;
    const name = String(row.path || row.name || "").trim();
    if (!name) continue;
    rootN += 1;
    if (rootN > 8) break;
    const role = String(row.role || "").trim();
    dirLines.push(role ? name + "（" + role + "）" : name);
    const children = Array.isArray(row.children) ? row.children : [];
    let cN = 0;
    for (const child of children) {
      if (!child || typeof child !== "object") continue;
      const cname = String(child.path || child.name || "").trim();
      if (!cname) continue;
      cN += 1;
      if (cN > 6) break;
      const crole = String(child.role || "").trim();
      dirLines.push("  " + (crole ? cname + "（" + crole + "）" : cname));
    }
  }
  if (dirLines.length) {
    lines.push("目录要点：");
    for (const ln of dirLines) lines.push(ln);
    meaningful = true;
  }

  // 通用禁改（不点名某家 ERP 业务路径）
  lines.push(
    "禁改（通用）：node_modules、.git、.venv、__pycache__、dist/build 产物、*.db/*.sqlite、包锁/对账产物勿当业务源码改；禁止套用其它仓库的目录习惯。",
  );
  lines.push("写码须以本块栈与目录为准；无把握先对照本工程同层现有文件再改。");

  if (!meaningful) return "";
  return clip(lines.join("\n"), 1800);
}

export function messageHasCodingPortrait(message) {
  const s = String(message || "");
  return s.includes("【工作区目录画像】") || s.includes("【项目画像");
}

export function loadCachedProfile(engineDir, workspace) {
  const key = profileStoreKey(workspace);
  if (!engineDir || !key) return null;
  const file = path.join(engineDir, "data", "project_profiles", key + ".json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function notesKey(workspace) {
  const raw = String(workspace || "").trim();
  if (!raw) return "";
  let resolved = raw;
  try {
    resolved = fs.realpathSync.native(raw);
  } catch {
    try {
      resolved = path.resolve(raw);
    } catch {
      resolved = raw;
    }
  }
  return crypto.createHash("sha256").update(resolved, "utf8").digest("hex").slice(0, 24);
}

export function loadProjectNotes(engineDir, workspace) {
  const key = notesKey(workspace);
  if (!engineDir || !key) return "";
  const file = path.join(engineDir, "data", "project_notes", key + ".md");
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

export function cwdFromSessions(session, sessions) {
  try {
    if (session && session.cwd) return String(session.cwd).trim();
  } catch {
    /* 会话对象没有 cwd 时改看快照 */
  }
  let sid = "";
  try {
    if (session && session.id) sid = String(session.id);
  } catch {
    sid = "";
  }
  let snap = null;
  try {
    const list = sessions && sessions.list;
    snap = list && typeof list.getSnapshot === "function" ? list.getSnapshot() : null;
  } catch {
    snap = null;
  }
  if (!sid) {
    if (snap && snap.current != null && snap.current !== "") sid = String(snap.current);
    else if (sessions && typeof sessions.current === "string") sid = sessions.current;
  }
  if (!sid) return "";
  const buckets = [];
  if (snap && snap.byId) buckets.push(snap.byId);
  if (sessions && sessions.byId) buckets.push(sessions.byId);
  for (let i = 0; i < buckets.length; i++) {
    const row = buckets[i] ? buckets[i][sid] : null;
    if (row && row.cwd) return String(row.cwd).trim();
  }
  const items = (snap && (snap.items || snap.sessions)) || [];
  if (Array.isArray(items)) {
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      if (it && String(it.id || "") === sid && it.cwd) return String(it.cwd).trim();
    }
  }
  return "";
}

/** 写入写码 message：禁止把 *.db 当产物回写（占用中会 EPERM 整单失败）。 */
export const CODING_DB_FILE_BAN =
  "【硬规则·勿碰数据库文件】禁止创建/修改/同步任何 *.db / *.sqlite / *.sqlite3 / erp.db / pcb_procurement.db。" +
  "表结构变更只改 migrate / ORM / 业务源码，由本机重启后端 lifespan 重建或迁移；" +
  "勿把库文件当写码产物回写（Windows 下库被进程占用时 rename 会 EPERM，整单失败）。";

export function codingMessageWithCachedDirectory({ engineDir, workspace, message, profile }) {
  const msg = String(message ?? "");
  if (!msg.trim()) return msg;
  let out = msg.replace(/\s+$/, "");
  if (!out.includes("【硬规则·勿碰数据库文件】")) {
    out = out + "\n\n" + CODING_DB_FILE_BAN;
  }
  // 已有短画像或目录画像则不重复灌（含引擎 format_for_agent 的【项目画像】）
  // 注意：仍须继续走验收句钉入，禁止因「已有画像」提前 return 丢掉 Q1-3
  if (!messageHasCodingPortrait(out)) {
    let cached = profile;
    if (cached === undefined) {
      try {
        cached = loadCachedProfile(engineDir, workspace);
      } catch {
        cached = null;
      }
    }
    // 写码优先短画像（栈+根+禁改）；无 stack/layout 时回退纯目录块
    const block = formatCodingPortraitBlock(cached) || formatDirectoryBlock(cached);
    if (block) out = out + "\n\n" + block;
  }
  // 验收标准进诉求：原话含「打开/点/验收…」则钉进 message（抽不出则跳过）
  try {
    const acc = enrichMessageWithAcceptanceHints(out);
    if (acc.changed) out = acc.text;
  } catch {
    /* 忽略 */
  }
  return out;
}

export function buildHostTriageFromDisk({
  engineDir,
  workspace,
  enabledIds,
  utterance,
  integrated,
}) {
  let profile = null;
  let notes = "";
  try {
    profile = loadCachedProfile(engineDir, workspace);
  } catch {
    profile = null;
  }
  try {
    notes = loadProjectNotes(engineDir, workspace);
  } catch {
    notes = "";
  }
  const advice = utteranceLaneAdvice(utterance, {
    integrated: !!integrated,
    enabledIds,
  });
  return formatHostTriage({
    workspace,
    summaryHead: summaryHead(profile),
    notes,
    enabledIds,
    utteranceHint: advice.hint,
    disabledLaneNote: advice.disabledNote,
    relatedDirs: relatedDirectoryHints(utterance, profile),
    directoryBlock: formatDirectoryBlock(profile),
  });
}

export function appendFirstToolLog(engineDir, row) {
  const line = formatFirstToolLogLine(row);
  if (!line || !engineDir) return false;
  const dir = path.join(engineDir, "data");
  const file = path.join(dir, "triage_first_tools.jsonl");
  try {
    fs.mkdirSync(dir, { recursive: true });
    try {
      const st = fs.statSync(file);
      if (st.size > 2 * 1024 * 1024) fs.writeFileSync(file, "", "utf8");
    } catch {
      /* 文件不存在时直接追加 */
    }
    fs.appendFileSync(file, line + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}
