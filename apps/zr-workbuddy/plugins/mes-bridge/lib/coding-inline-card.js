/**
 * 普通写码：确认表单被藏起时，主聊天里仍要有一张写码卡。
 * 只做文案与对单，不碰 DOM。对单用诉求首行，避免把上一轮任务挂到新会话。
 */

export function codingInlineRequirement(raw) {
  const lines = String(raw || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const line = lines[0] || "";
  return line.replace(/^【[^】]{0,40}】/, "").trim().slice(0, 80);
}

export function codingInlineSameRequirement(a, b) {
  const x = codingInlineRequirement(a).replace(/\s+/g, "");
  const y = codingInlineRequirement(b).replace(/\s+/g, "");
  if (x.length < 2 || y.length < 2) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

const LIVE_CODING = new Set(["running", "queued", "pending_review"]);
const TERMINAL_CODING = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "canceled",
  "blocked_no_runner",
]);

const STATUS_ZH = {
  queued: "已入队",
  running: "正在写码",
  pending_review: "待确认同步",
  succeeded: "已完成",
  failed: "写码未成功",
  cancelled: "已取消",
  canceled: "已取消",
  blocked_no_runner: "写码环境未就绪",
};

export function codingInlineStatusLine(status, detail) {
  const key = String(status || "").trim();
  const head = STATUS_ZH[key] || "正在写码";
  let extra = String(detail || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean) || "";
  if (!extra || extra === key || extra === head) return head;
  if (extra.length > 90) extra = extra.slice(0, 90) + "…";
  return head + " · " + extra;
}

/**
 * @param {string} cardReq
 * @param {Array<{id?: string, requirement?: string, status?: string, detail?: string, updated_at?: string}>} jobs
 */
export function pickCodingInlineJob(cardReq, jobs) {
  const rows = Array.isArray(jobs) ? jobs : [];
  const hits = rows.filter((j) => j && codingInlineSameRequirement(cardReq, j.requirement));
  hits.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return hits[0] || null;
}

/**
 * 深度求索期间工具卡还没挂上。用当前对话里能看到的诉求，对上最近一条写码任务。
 * 对不上就不挂，避免把别的报表过程写进这次对话。
 * @param {string} pageText
 * @param {Array<{id?: string, requirement?: string, updated_at?: string}>} jobs
 */
export function pickLiveCodingJob(pageText, jobs) {
  const text = String(pageText || "").replace(/\s+/g, "");
  if (text.length < 2) return null;
  const rows = Array.isArray(jobs) ? jobs : [];
  const hits = rows.filter((job) => {
    const st = String((job && job.status) || "");
    if (TERMINAL_CODING.has(st)) return false;
    const req = codingInlineRequirement(job && job.requirement).replace(/\s+/g, "");
    return req.length >= 2 && text.includes(req);
  });
  hits.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return hits[0] || null;
}

const FILE_LANG = {
  js: "JS",
  mjs: "JS",
  cjs: "JS",
  jsx: "JSX",
  ts: "TS",
  tsx: "TSX",
  py: "PY",
  vue: "VUE",
  css: "CSS",
  scss: "SCSS",
  less: "LESS",
  json: "JSON",
  md: "MD",
  html: "HTML",
  htm: "HTML",
  yml: "YML",
  yaml: "YML",
  sh: "SH",
  bash: "SH",
  ps1: "PS",
  sql: "SQL",
  go: "GO",
  rs: "RS",
  java: "JAVA",
};

export function fileLangFromPath(filePath) {
  const name = String(filePath || "").split(/[/\\]/).filter(Boolean).pop() || "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return FILE_LANG[name.slice(dot + 1).toLowerCase()] || name.slice(dot + 1).toUpperCase().slice(0, 6);
}

export function parseCodingSnippet(snippet) {
  const src = String(snippet || "").replace(/\u2026/g, "…");
  const rows = [];
  let added = 0;
  let removed = 0;
  if (!src.trim()) return { rows, added, removed };
  const lines = src.split(/\r?\n/);
  for (const raw of lines) {
    if (raw === "…" || raw === "..." || raw.trim() === "…") {
      rows.push({ type: "omit", text: "…" });
      continue;
    }
    if (raw.startsWith("+")) {
      added += 1;
      rows.push({ type: "add", text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith("-")) {
      removed += 1;
      rows.push({ type: "del", text: raw.slice(1) });
      continue;
    }
    rows.push({ type: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : raw });
  }
  return { rows, added, removed };
}

export function shellCommandTitle(cmd) {
  const s = String(cmd || "").replace(/\s+/g, " ").trim();
  if (!s) return "运行命令";
  if (s.length <= 88) return s;
  return s.slice(0, 87) + "…";
}

/**
 * 模型自言自语的「我要开始写说明方案」不当正文。
 * @param {string} text
 */
export function isPlanningSayText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 160) return false;
  if (/撰写最终方案|首行将使用|将使用.{0,12}说明方案|开始写说明方案|先写说明方案/.test(t)) return true;
  if (/^#{1,3}\s*说明方案\s*$/.test(t)) return true;
  return false;
}

/**
 * 把粘在一起的标题、烂表、多余管道收成能排版的 Markdown。
 * @param {string} text
 */
export function normalizeProcessMarkdown(text) {
  let t = String(text || "").replace(/\r\n/g, "\n");
  t = t.replace(/说明方案(?=仓库|本次|后端|前端|已)/g, "说明方案\n\n");
  t = t.replace(/([^#\s\n])(#{1,3})(?=\s|[^\s#])/g, "$1\n\n$2");
  t = t.replace(/^(#{1,3})([^#\s])/gm, "$1 $2");
  t = t.replace(/^(#{1,3}\s+[^\n|]+?)\s*(\|)/gm, "$1\n$2");
  t = t.replace(/\|{2,}/g, "|");
  t = t.replace(/^[ \t]*\|?[\s:|-]{3,}\|?[\s:|-]*$/gm, "");
  t = t.replace(/[：:]\s*[、，,]+\s*/g, "：");
  t = t.replace(/[、，,]{2,}/g, "，");
  const kept = [];
  for (const line of t.split("\n")) {
    if (/^\s*#/.test(line)) {
      kept.push(line.trim());
      continue;
    }
    if (/^\s*\|/.test(line) || /\|.+\|/.test(line)) {
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c && !/^[-:]+$/.test(c) && !/^[-:，、,]+$/.test(c));
      const useful = cells.filter((c) => /[\u4e00-\u9fffA-Za-z0-9./_-]{2,}/.test(c));
      if (!useful.length) continue;
      kept.push("| " + useful.join(" | ") + " |");
      continue;
    }
    kept.push(line);
  }
  t = kept.join("\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

const PROCESS_TITLE = /^(?:#{1,3}\s+)?(说明方案|本轮结论|改动|验收|已有能力.*|做了什么|怎么验收)\s*$/;

/**
 * 结论文拆成标题 / 段落 / 列表 / 表，供对话里排版。
 * @param {string} text
 * @returns {Array<{type: string, text?: string, level?: number, items?: string[], rows?: string[][]}>}
 */
export function splitProcessProse(text) {
  const lines = normalizeProcessMarkdown(text).split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = String(raw || "");
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const trimmed = line.trim();
    const hm = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hm || PROCESS_TITLE.test(trimmed)) {
      blocks.push({
        type: "heading",
        level: hm ? hm[1].length : 2,
        text: hm ? hm[2] : trimmed.replace(/^#{1,3}\s+/, ""),
      });
      i += 1;
      continue;
    }
    if (/^\s*\|/.test(line) || /\|.+\|/.test(trimmed)) {
      const rows = [];
      while (i < lines.length) {
        const row = String(lines[i] || "");
        if (!row.trim()) break;
        if (!(/^\s*\|/.test(row) || /\|.+\|/.test(row.trim()))) break;
        const cells = row
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c && !/^[-:]+$/.test(c));
        if (cells.length) rows.push(cells);
        i += 1;
      }
      const wide = rows.filter((r) => r.length >= 2);
      if (wide.length >= 2) blocks.push({ type: "table", rows: wide });
      else if (rows.length) {
        const items = rows
          .reduce((acc, r) => acc.concat(r), [])
          .filter((c) => !/^(文件|内容|改动)$/.test(c));
        if (items.length) blocks.push({ type: "list", items });
      }
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(String(lines[i]).replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      if (items.length) blocks.push({ type: "list", items });
      continue;
    }
    const para = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !PROCESS_TITLE.test(lines[i].trim()) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*\|/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "para", text: para.join("\n") });
  }
  return blocks;
}

export function splitSayBlocks(text) {
  const src = String(text || "");
  const out = [];
  const re = /```([a-zA-Z0-9_+-]*)\r?\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ type: "prose", text: src.slice(last, m.index) });
    out.push({ type: "code", lang: String(m[1] || "").toUpperCase(), text: String(m[2] || "").replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: "prose", text: src.slice(last) });
  if (!out.length && src) out.push({ type: "prose", text: src });
  return out;
}

/**
 * 模型常把「读取 xxx」又说一遍，和工具芯片重复。这类短句不当正文。
 * @param {string} text
 */
export function isToolEchoText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/[。！？]/.test(t)) return false;
  return /^(搜索|查找|读取|编辑|删除|运行)(\s+\S.*)?$/.test(t) && t.length <= 120;
}

/**
 * 当前行是否还在打字。工具/状态一出来就算完，正文必须打完才进入下一行。
 * @param {{kind?: string, text?: string}|null} shown
 * @param {{kind?: string, text?: string}|null} full
 */
export function isProcessLineComplete(shown, full) {
  if (!full) return true;
  if (full.kind === "say" || full.kind === "thinking") {
    return String((shown && shown.text) || "").length >= String(full.text || "").length;
  }
  return true;
}

function toolVariant(name) {
  if (name === "shell") return "run";
  if (name === "edit" || name === "write") return "code";
  return "chip";
}

function toolChipLabel(name) {
  if (name === "grep") return "搜索";
  if (name === "glob") return "查找";
  if (name === "read") return "读取";
  if (name === "delete") return "删除";
  if (name === "edit" || name === "write") return "编辑";
  if (name === "shell") return "运行";
  return name || "工具";
}

function toolProcessLine(item) {
  const name = String(item.name || "tool");
  const filePath = String(item.path || "");
  const file = filePath.split(/[/\\]/).filter(Boolean).pop() || filePath;
  const pattern = String(item.pattern || item.glob || "");
  const cmd = String(item.command || item.cmd || "");
  if (name === "grep") return "搜索 " + (pattern || file || ".");
  if (name === "glob") return "查找 " + (pattern || file || ".");
  if (name === "read") return "读取 " + (file || filePath || "文件");
  if (name === "edit" || name === "write") return "编辑 " + (file || filePath || "文件");
  if (name === "delete") return "删除 " + (file || filePath || "文件");
  if (name === "shell") return "运行 " + (cmd || "命令").replace(/\s+/g, " ").slice(0, 120);
  return name + (file ? " " + file : "");
}

function toolArg(item) {
  const name = String(item.name || "tool");
  const filePath = String(item.path || "");
  const file = filePath.split(/[/\\]/).filter(Boolean).pop() || filePath;
  const pattern = String(item.pattern || item.glob || "");
  if (name === "grep") return pattern || file || ".";
  if (name === "glob") return pattern || file || ".";
  if (name === "read" || name === "delete" || name === "edit" || name === "write") {
    return file || filePath || "文件";
  }
  if (name === "shell") return shellCommandTitle(item.command || item.cmd || "");
  return file || "";
}

function copyToolFields(line, extra) {
  const snippet = extra && extra.snippet != null ? extra.snippet : line.snippet;
  const parsed = extra && extra.added != null ? extra : parseCodingSnippet(snippet);
  return {
    variant: extra && extra.variant ? extra.variant : line.variant || "",
    name: extra && extra.name ? extra.name : line.name || "",
    path: extra && extra.path != null ? extra.path : line.path || "",
    file: extra && extra.file ? extra.file : line.file || "",
    lang: extra && extra.lang ? extra.lang : line.lang || "",
    command: extra && extra.command != null ? extra.command : line.command || "",
    snippet: String(snippet || ""),
    arg: extra && extra.arg != null ? extra.arg : line.arg || "",
    added: Number(parsed.added || 0),
    removed: Number(parsed.removed || 0),
  };
}

function copyProcessRow(line) {
  const src = line || {};
  return {
    kind: src.kind,
    text: String(src.text || ""),
    running: !!src.running,
    ...copyToolFields(src, src),
  };
}

function isTextKind(kind) {
  return kind === "thinking" || kind === "say";
}

function toolDedupeKey(line) {
  const name = String((line && line.name) || "");
  const arg = String((line && line.arg) || (line && line.text) || "");
  if (!name && !arg) return "";
  return name + "\0" + arg;
}

/**
 * 把写码任务的 transcript 收成对话行（思考 / 说明 / 工具）。
 * 不展示确认卡、进度卡。跳过发给模型的诉求原文和「请看进度卡」这类空状态。
 * @param {unknown} transcript
 * @returns {Array<{kind: "thinking"|"say"|"tool"|"status", text: string, running?: boolean}>}
 */
export function codingProcessLines(transcript) {
  const rows = Array.isArray(transcript) ? transcript : [];
  const out = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const kind = String(item.kind || "");
    const text = String(item.text || "").trim();
    if (kind === "user") continue;
    if (kind === "status") {
      if (!text || text === "FINISHED") continue;
      if (/进度卡|请稍候|运行中/.test(text)) continue;
      out.push({ kind: "status", text });
      continue;
    }
    if (kind === "thinking") {
      if (!text || isToolEchoText(text) || isPlanningSayText(text)) continue;
      out.push({ kind: "thinking", text });
      continue;
    }
    if (kind === "assistant") {
      if (!text || isToolEchoText(text) || isPlanningSayText(text)) continue;
      out.push({ kind: "say", text });
      continue;
    }
    if (kind === "tool") {
      const name = String(item.name || "tool");
      const filePath = String(item.path || "");
      const file = filePath.split(/[/\\]/).filter(Boolean).pop() || "";
      const snippet = String(item.snippet || item.diff || "");
      const parsed = parseCodingSnippet(snippet);
      const cmd = String(item.command || item.cmd || "");
      const arg = toolArg(item);
      const pattern = String(item.pattern || item.glob || "").trim();
      if ((name === "grep" || name === "glob") && !pattern) continue;
      if (name !== "shell" && !String(arg || "").trim()) continue;
      out.push({
        kind: "tool",
        text: toolProcessLine(item),
        running: String(item.tool_status || "") === "running",
        variant: toolVariant(name),
        name,
        path: filePath,
        file,
        lang: fileLangFromPath(filePath || file),
        command: cmd,
        snippet,
        arg,
        added: parsed.added,
        removed: parsed.removed,
      });
    }
  }
  return out;
}

/**
 * 同一句正文的增量快照（Streaming）只保留最长的一版，不要一句拆成很多行。
 * @param {string} prev
 * @param {string} next
 */
export function isProgressiveCodingText(prev, next) {
  const a = String(prev || "").trim();
  const b = String(next || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  return b.startsWith(a) || a.startsWith(b);
}

/**
 * 按时间顺序收行。同一句思考/说明变长时写回原行，工具去重。
 * 后面若已经有工具，展示层必须等这句打完才露出工具，禁止拆成「正在」+ 下面又出搜索。
 * @param {ReturnType<typeof codingProcessLines>} lines
 */
export function mergeCodingProcessLines(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const out = [];
  const toolAt = new Map();
  for (const line of rows) {
    if (!line) continue;
    const text = String(line.text || "");
    const kind = line.kind;
    if (isTextKind(kind)) {
      if (isToolEchoText(text) || isPlanningSayText(text)) continue;
      let echoed = false;
      for (let t = out.length - 1; t >= 0; t--) {
        if (out[t].kind === "tool" && (out[t].text === text || (out[t].arg && text.endsWith(out[t].arg)))) {
          echoed = true;
          break;
        }
        if (isTextKind(out[t].kind)) break;
      }
      if (echoed) continue;
      let grown = false;
      for (let i = out.length - 1; i >= 0; i--) {
        const prev = out[i];
        if (!isTextKind(prev.kind)) continue;
        if (isProgressiveCodingText(prev.text, text)) {
          if (text.length > String(prev.text || "").length) prev.text = text;
          if (kind === "say") prev.kind = "say";
          grown = true;
        }
        break;
      }
      if (grown) continue;
      const last = out[out.length - 1];
      if (last && last.kind === kind) {
        last.text = last.text + (last.text && text ? "\n" : "") + text;
        continue;
      }
      out.push({
        kind,
        text,
        running: !!line.running,
        ...copyToolFields(line, line),
      });
      continue;
    }
    if (kind === "tool") {
      const key = toolDedupeKey(line) || toolDedupeKey({ name: line.name, arg: text });
      if (key && toolAt.has(key)) {
        const prev = out[toolAt.get(key)];
        prev.running = !!line.running;
        const nextSnippet = String(line.snippet || "");
        if (nextSnippet.length >= String(prev.snippet || "").length) {
          Object.assign(prev, copyToolFields(prev, line));
        }
        if (line.command) prev.command = line.command;
        continue;
      }
      if (out.length) {
        const last = out[out.length - 1];
        if (last.kind === "tool" && (last.text === text || (last.name && last.name === line.name && last.arg && last.arg === line.arg))) {
          last.running = !!line.running;
          continue;
        }
      }
      if (key) toolAt.set(key, out.length);
      out.push({
        kind,
        text,
        running: !!line.running,
        ...copyToolFields(line, line),
      });
      continue;
    }
    out.push({
      kind: kind,
      text: text,
      running: !!line.running,
      ...copyToolFields(line, line),
    });
  }
  return out;
}

/**
 * 一次打字步进：当前行没打完，禁止长出下一行。
 * 若下面已经提前露出工具，先收回，只留下正在打的这一行。
 * @param {Array<{kind?: string, text?: string}>} shown
 * @param {Array<{kind?: string, text?: string}>} target
 */
export function codingProcessTick(shown, target) {
  const src = Array.isArray(shown) ? shown.map(copyProcessRow) : [];
  const want = Array.isArray(target) ? target : [];
  let cursor = 0;
  while (cursor < src.length && cursor < want.length) {
    if (!want[cursor] || src[cursor].kind !== want[cursor].kind) {
      src.length = cursor;
      break;
    }
    if (!isProcessLineComplete(src[cursor], want[cursor])) break;
    cursor += 1;
  }
  if (cursor < src.length && cursor < want.length && !isProcessLineComplete(src[cursor], want[cursor])) {
    src.length = cursor + 1;
    const cur = src[cursor];
    const full = want[cursor];
    if (cur.kind === "tool" || cur.kind === "status") {
      src[cursor] = copyProcessRow(full);
    } else {
      cur.text = codingProcessTypeStep(cur.kind, cur.text, full.text);
      if (full.running != null) cur.running = !!full.running;
    }
    return src;
  }
  if (src.length < want.length && cursor === src.length) {
    const add = want[src.length];
    const copy = copyProcessRow(add);
    if (add.kind === "tool" || add.kind === "status") copy.text = String(add.text || "");
    else copy.text = codingProcessTypeStep(add.kind, "", add.text);
    src.push(copy);
  }
  return src;
}

/**
 * 思考 / 说明按字往下淌；工具和状态一行出完（和 Cursor 工具条一样）。
 * @param {string} kind
 * @param {string} shown
 * @param {string} full
 */
export function codingProcessTypeStep(kind, shown, full) {
  const have = String(shown || "");
  const want = String(full || "");
  if (!want) return "";
  if (kind === "tool" || kind === "status") return want;
  const prefix = want.startsWith(have) ? have : "";
  if (prefix.length >= want.length) return want;
  const rest = want.slice(prefix.length);
  const budget = kind === "thinking" ? 2 : want.length > 360 ? 8 : 4;
  let n = 0;
  let count = 0;
  while (n < rest.length && count < budget) {
    const code = rest.codePointAt(n) || 0;
    n += code > 0xffff ? 2 : 1;
    count += 1;
  }
  return prefix + rest.slice(0, n);
}

/**
 * 只在进行中淌过程；本页已经淌过的可以收束。
 * 刷新后终态任务不要把历史过程再灌进对话（结论已经在正文里）。
 * @param {string} status
 * @param {number} shownCount
 * @param {number} [_lineCount]
 */
export function shouldStreamCodingProcess(status, shownCount, _lineCount) {
  const key = String(status || "");
  if (LIVE_CODING.has(key)) return true;
  return Number(shownCount) > 0;
}
