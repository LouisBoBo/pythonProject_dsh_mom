/**
 * 续改交接补强：上一轮 failed 且 synced 空时，插件 compactParentHandoff
 * 几乎只剩错误 detail，不带 changed_files。本模块在 zr_cchat_continue 执行前
 * 把「已改未同步源码清单（剔 *.db）」写入 message，并在缺省时补 parent_job_id。
 * 不改 DSH 插件。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  enrichMessageWithAcceptanceHints,
  extractAcceptanceHints,
  formatAcceptanceBlock,
} from "./coding-acceptance.js";
import { classifyCodingFailKind, isHollowCodingSuccess } from "./coding-fail-kind.js";

function appendAcceptanceFromRequirement(lines, requirement) {
  const hints = extractAcceptanceHints(requirement);
  if (!hints.length) return;
  const block = formatAcceptanceBlock(hints);
  if (!block) return;
  // formatAcceptanceBlock 自带 marker 行；handoff 内嵌时去掉重复空行
  for (const ln of block.split("\n")) lines.push(ln);
}

export const HANDOFF_MARKER = "【系统续改交接】";

/** 改动范围门禁（Q1-1）：提示层，非插件硬限额 */
export const SCOPE_GATE_LINE =
  "改动范围：优先最小 diff；只改与本轮诉求相关的文件。" +
  "续改时先对照下方/交接中的已同步清单，禁止重做无关文件或整页重写；用户未要求时不要扩大改动面。";

const MAX_FILES = 40;
const MAX_DETAIL = 240;

function cursorChatJobsDir() {
  return path.join(os.homedir(), ".zhongruan", "cursor-chat", "jobs");
}

function jobUpdatedMs(job) {
  return Date.parse(String((job && (job.updated_at || job.created_at)) || "")) || 0;
}

export function isDbOrBinaryRel(rel) {
  const p = String(rel || "")
    .replace(/\\/g, "/")
    .toLowerCase()
    .trim();
  if (!p) return true;
  if (p.endsWith(".db") || p.endsWith(".sqlite") || p.endsWith(".sqlite3")) return true;
  if (p.endsWith(".db-journal") || p.endsWith(".db-wal") || p.endsWith(".db-shm")) return true;
  const name = p.split("/").pop() || "";
  if (name === "erp.db" || name === "data.db" || name === "app.db") return true;
  return false;
}

export function codeFilesOnly(files) {
  const out = [];
  const seen = new Set();
  for (const raw of files || []) {
    const rel = String(raw || "")
      .replace(/\\/g, "/")
      .trim()
      .replace(/^\.\//, "");
    if (!rel || isDbOrBinaryRel(rel) || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

export function loadChatJobById(jobId, opts) {
  const jid = String(jobId || "").trim();
  if (!jid.startsWith("cch-") && !jid.startsWith("ccj-")) return null;
  if (jid.includes("/") || jid.includes("\\") || jid.includes("..")) return null;
  const dir = (opts && opts.jobsDir) || cursorChatJobsDir();
  const fp = path.join(dir, jid + ".json");
  if (!fs.existsSync(fp)) return null;
  try {
    const job = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!job || typeof job !== "object") return null;
    if (!job.id) job.id = jid;
    return job;
  } catch {
    return null;
  }
}

export function findLatestTerminalChatJobForHandoff(sessionId, opts) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const dir = (opts && opts.jobsDir) || cursorChatJobsDir();
  if (!fs.existsSync(dir)) return null;
  const terminal = new Set(["succeeded", "failed", "cancelled", "canceled"]);
  let best = null;
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const f of files) {
    if (!f.startsWith("cch-") || !f.endsWith(".json")) continue;
    try {
      const job = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (String(job.dsh_session_id || "") !== sid) continue;
      if (!terminal.has(String(job.status || ""))) continue;
      if (!best || jobUpdatedMs(job) >= jobUpdatedMs(best)) best = job;
    } catch {
      /* skip */
    }
  }
  return best;
}

function isFailedTerminal(status) {
  const st = String(status || "").trim();
  return st === "failed" || st === "cancelled" || st === "canceled";
}

/**
 * 成功父任务续改交接（Q0-2）：把已同步源码清单钉进 message，避免续改重做整份。
 * 空同步假成功见 buildHollowSuccessHandoff。
 */
export function buildSucceededParentHandoff(parent) {
  if (!parent || typeof parent !== "object") return "";
  if (String(parent.status || "").trim() !== "succeeded") return "";
  if (isHollowCodingSuccess(parent)) return "";
  const jid = String(parent.id || "").trim() || "（未知）";
  const synced = codeFilesOnly(
    parent.last_synced_files?.length
      ? parent.last_synced_files
      : parent.synced_files || [],
  );
  if (!synced.length) return "";
  const lines = [
    HANDOFF_MARKER,
    "上一任务 " + jid + " 已成功同步。请在下列已落盘源码上增量修改，勿整页重写或重复造轮子。",
    "续改须带 parent_job_id=" + jid + "（系统也会补钉）。",
    SCOPE_GATE_LINE,
    "已同步源码（禁止把 *.db 当产物再同步）：",
  ];
  for (const f of synced) lines.push("- " + f);
  appendAcceptanceFromRequirement(lines, parent.requirement);
  return lines.join("\n");
}

/** 空同步假成功：续改时仍注入交接，避免当「已修好」重开 */
export function buildHollowSuccessHandoff(parent) {
  if (!isHollowCodingSuccess(parent)) return "";
  const jid = String(parent.id || "").trim() || "（未知）";
  const detail = String(parent.detail || parent.error || "").trim();
  const lines = [
    HANDOFF_MARKER,
    "上一任务 " + jid + " 显示成功，但未检测到源码落盘。请同句续改把改动真正同步到工程。",
    "续改须带 parent_job_id=" + jid + "（系统也会补钉）。",
    SCOPE_GATE_LINE,
  ];
  if (detail) {
    lines.push("上次摘要：" + detail.replace(/\s+/g, " ").slice(0, MAX_DETAIL));
  }
  appendAcceptanceFromRequirement(lines, parent.requirement);
  return lines.join("\n");
}

/**
 * 仅当父任务失败/取消且需要补上下文时生成交接块。
 */
export function buildFailedParentHandoff(parent) {
  if (!parent || typeof parent !== "object") return "";
  if (!isFailedTerminal(parent.status)) return "";
  const jid = String(parent.id || "").trim() || "（未知）";
  const st = String(parent.status || "").trim();
  const codeFiles = codeFilesOnly(
    parent.changed_files || parent.review_in_scope || parent.synced_files || [],
  );
  const synced = codeFilesOnly(
    parent.last_synced_files?.length
      ? parent.last_synced_files
      : parent.synced_files || [],
  );
  // 已有完整同步清单且无「仅失败 detail」缺口时，不必重复灌 message
  const detail = String(parent.detail || parent.error || "").trim();
  const failKind = classifyCodingFailKind(detail);
  const dbEperm = failKind === "db_eperm";
  const networkFail = failKind === "network";
  const needsFileList = codeFiles.length > 0 && synced.length === 0;
  // 网络失败常无改动清单，仍须交接块（确认卡/续跑可见）
  if (!needsFileList && !dbEperm && !networkFail && !detail) return "";

  const lines = [
    HANDOFF_MARKER,
    "上一任务 " + jid + " 状态 " + st + "。请在沙箱已有改动上增量继续，勿重做已完成部分。",
    "续改须带 parent_job_id=" + jid + "（系统也会补钉）。",
    SCOPE_GATE_LINE,
  ];
  if (needsFileList) {
    lines.push(
      "已改动文件（可能尚未同步到工程；优先核对/收尾这些源码，禁止把 *.db 当产物同步）：",
    );
    for (const f of codeFiles) lines.push("- " + f);
  } else if (codeFiles.length) {
    lines.push("相关源码文件（勿同步 *.db）：");
    for (const f of codeFiles.slice(0, 20)) lines.push("- " + f);
  }
  if (dbEperm) {
    lines.push(
      "注意：上一轮因数据库文件同步 EPERM 失败。禁止创建/修改/同步任何 *.db / *.sqlite；只改 migrate/业务源码，表结构靠重启后端 migrate。",
    );
  } else if (networkFail) {
    lines.push(
      "注意：上一轮因写码云/出网 Network 失败，通常未改到工程。请同句 zr_cchat_continue 重试；禁止无故改用 begin 开全新任务（除非用户明确要求重开/换工程）。",
    );
    if (detail) {
      lines.push("上次失败原因摘要：" + detail.replace(/\s+/g, " ").slice(0, MAX_DETAIL));
    }
  } else if (detail) {
    lines.push("上次失败原因摘要：" + detail.replace(/\s+/g, " ").slice(0, MAX_DETAIL));
  }
  appendAcceptanceFromRequirement(lines, parent.requirement);
  return lines.join("\n");
}

export function messageAlreadyHasHandoff(message) {
  return String(message || "").indexOf(HANDOFF_MARKER) >= 0;
}

function normReq(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 240);
}

function sameRequirement(a, b) {
  const x = normReq(a);
  const y = normReq(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true;
  return false;
}

/**
 * 解析续改父任务（谨慎）：
 * - 无显式 id → 本会话最近终态；
 * - 有显式 id → 默认尊重；
 * - 仅当「最近终态是失败、更新更晚、且与本轮 message / 失败诉求同句」时改挂到失败单（避免续改挂到更早成功单而丢掉失败沙箱）。
 */
export function resolveContinueParentJob(args, sessionId, opts) {
  const explicitId = String(
    (args && (args.parent_job_id || args.parentJobId || args.job_id)) || "",
  ).trim();
  const explicit = explicitId ? loadChatJobById(explicitId, opts) : null;
  const latest = findLatestTerminalChatJobForHandoff(sessionId, opts);
  if (!explicit) return latest;
  if (!latest) return explicit;
  if (String(explicit.id) === String(latest.id)) return explicit;
  const msg = String(
    (args && (args.message || args.requirement || args.prompt)) || "",
  );
  const mayRetarget =
    isFailedTerminal(latest.status) &&
    jobUpdatedMs(latest) > jobUpdatedMs(explicit) &&
    (sameRequirement(msg, latest.requirement) ||
      sameRequirement(explicit.requirement, latest.requirement));
  if (mayRetarget) return latest;
  return explicit;
}

/**
 * DSH 0.2 的工具参数常被冻结。直接写 message 会抛
 * Cannot assign to read only property 'message'，续改交接中断。
 * 能换掉 exec.arguments 就换成可写副本。
 */
export function writableExecArguments(exec) {
  const args = exec && exec.arguments;
  if (!args || typeof args !== "object") return null;
  let locked = false;
  try {
    locked = Object.isFrozen(args);
  } catch {
    locked = false;
  }
  if (!locked) {
    try {
      const probe = "__wbArgProbe";
      args[probe] = 1;
      delete args[probe];
      return args;
    } catch {
      locked = true;
    }
  }
  const copy = Object.assign({}, args);
  try {
    exec.arguments = copy;
    return exec.arguments === copy ? copy : args;
  } catch {
    return args;
  }
}

/**
 * 就地改写 continue 的 message / parent_job_id。
 * @returns {{ changed: boolean, parentId: string, notes: string[] }}
 */
export function enrichContinueExecHandoff(exec, sessionId, opts) {
  const notes = [];
  const name = String((exec && exec.name) || "");
  if (name !== "zr_cchat_continue") {
    return { changed: false, parentId: "", notes };
  }
  const args = writableExecArguments(exec);
  if (!args || typeof args !== "object") {
    return { changed: false, parentId: "", notes };
  }

  const parent = resolveContinueParentJob(args, sessionId, opts);
  if (!parent) {
    return { changed: false, parentId: "", notes };
  }
  const parentId = String(parent.id || "").trim();
  let changed = false;

  // 缺省或挂错父任务时，钉到解析结果（失败优先）
  const curPid = String(args.parent_job_id || args.parentJobId || "").trim();
  if (parentId && curPid !== parentId) {
    args.parent_job_id = parentId;
    changed = true;
    notes.push(curPid ? "retarget_parent:" + parentId : "fill_parent:" + parentId);
  }

  let handoff = "";
  if (isHollowCodingSuccess(parent)) {
    handoff = buildHollowSuccessHandoff(parent);
  } else if (isFailedTerminal(parent.status)) {
    handoff = buildFailedParentHandoff(parent);
  } else if (String(parent.status || "").trim() === "succeeded") {
    handoff = buildSucceededParentHandoff(parent);
  }

  const msgKey =
    args.message != null
      ? "message"
      : args.requirement != null
        ? "requirement"
        : args.prompt != null
          ? "prompt"
          : "message";
  let prev = String(args[msgKey] || "").trim();

  if (handoff && !messageAlreadyHasHandoff(prev)) {
    args[msgKey] = prev ? prev + "\n\n" + handoff : handoff;
    changed = true;
    notes.push("handoff_appended");
    prev = String(args[msgKey] || "").trim();
  } else if (handoff) {
    notes.push("handoff_exists");
  }

  // 验收句：handoff 可能已带父任务 requirement 的标准；否则从当前 message 再钉一次
  try {
    const acc = enrichMessageWithAcceptanceHints(prev);
    if (acc.changed) {
      args[msgKey] = acc.text;
      changed = true;
      notes.push("acceptance_appended");
    }
  } catch {
    /* 忽略 */
  }

  return { changed, parentId, notes };
}
