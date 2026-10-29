/**
 * 聊天「正文结论」补强：插件把权威结论文写在工具返回的 chat_body 里。
 * 若 Job 已终态但未走 buildConclusionToolResult（conclusion_delivered=false），
 * 进度卡只剩 detail「已同步 N」，正文结论丢失。本模块在 mes-bridge 侧补回 chat_body，
 * 不改 DSH 插件。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { codeFilesOnlyForSync, isHollowCodingSuccess } from "./coding-fail-kind.js";

const TERMINAL = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "canceled",
  "blocked_no_runner",
]);

function cursorChatJobsDir(jobsDir) {
  return jobsDir || path.join(os.homedir(), ".zhongruan", "cursor-chat", "jobs");
}

export function loadCursorChatJob(jobId, opts) {
  const id = String(jobId || "").trim();
  if (!id || !/^cch-[0-9a-z-]+$/i.test(id)) return null;
  const file = path.join(cursorChatJobsDir(opts && opts.jobsDir), id + ".json");
  try {
    if (!fs.existsSync(file)) return null;
    const job = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!job || typeof job !== "object") return null;
    if (!job.id) job.id = id;
    return job;
  } catch {
    return null;
  }
}

export function markCursorChatConclusionDelivered(jobId, opts) {
  const id = String(jobId || "").trim();
  if (!id || !/^(cch|ccj)-[A-Za-z0-9_-]+$/.test(id)) return false;
  const file = path.join(cursorChatJobsDir(opts && opts.jobsDir), id + ".json");
  try {
    if (!fs.existsSync(file)) return false;
    const job = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!job || typeof job !== "object") return false;
    if (job.conclusion_delivered) return true;
    job.conclusion_delivered = true;
    job.updated_at = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(job, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * 与插件 preferredConclusionAssistantText 对齐：优先最后一段「## 说明方案 / ## 本轮结论」。
 */
export function preferredConclusionAssistantText(assistant, maxLen) {
  const cap = typeof maxLen === "number" && maxLen > 200 ? maxLen : 3500;
  const asst = String(assistant || "").trim();
  if (!asst) return "";
  const markers = ["## 说明方案", "## 本轮结论"];
  let start = -1;
  for (const m of markers) {
    const i = asst.lastIndexOf(m);
    if (i > start) start = i;
  }
  let body = start >= 0 ? asst.slice(start).trim() : asst;
  if (start >= 0) {
    const again = body.indexOf("## 说明方案", 3);
    const again2 = body.indexOf("## 本轮结论", 3);
    const second = [again, again2].filter((i) => i > 0).sort((a, b) => a - b)[0];
    if (second != null && second > 0) {
      const a = body.slice(0, second).trim();
      const b = body.slice(second).trim();
      if (a === b || b.startsWith(a) || a.startsWith(b)) {
        body = a.length >= b.length ? a : b;
      }
    }
  }
  if (start < 0 && body.length > cap) {
    body = "…\n\n" + body.slice(-(cap - 6));
  } else if (body.length > cap) {
    body = body.slice(0, cap) + "\n\n…[已截断]";
  }
  return body;
}

/**
 * 聊天正文结论（对齐插件 formatChatConclusion 外壳；主体用说明方案）。
 * 这是用户要的「正文里那份结论」，不是进度卡横幅。
 */
export function formatChatBodyConclusion(job) {
  if (!job || typeof job !== "object") return "";
  const st = String(job.status || "").trim();
  if (!TERMINAL.has(st) && st !== "pending_review") return "";

  const asst = preferredConclusionAssistantText(
    job.assistant_text || lastAssistantFromTranscript(job.transcript) || "",
  );
  const synced = job.synced_files || job.last_synced_files || job.review_in_scope || [];
  const recovered = Array.isArray(job.recovered_files) ? job.recovered_files : [];
  const deferred = job.review_deferred || job.deferred_files || [];
  const lines = ["## 本轮结论", ""];
  if (recovered.length && (st === "failed" || st === "error")) {
    lines.push(
      "同步库文件时被占用（*.db EPERM），源码已从沙箱写回工程，不是整单作废。",
      "",
    );
    if (asst) lines.push(asst, "");
    lines.push("**已落盘：**");
    for (const f of recovered.slice(0, 30)) lines.push("- " + f);
    lines.push("", "请重启后端验收。库文件本来就不该当写码产物同步。");
    return lines.join("\n");
  }

  if (asst) {
    lines.push(asst, "");
  } else if (st === "succeeded" && isHollowCodingSuccess(job)) {
    lines.push(
      "任务显示完成，但未检测到源码落盘到工程（有效同步文件为 0）。不能当成已经改好了。",
      "",
    );
  } else if (job.detail && !/^已同步\s*\d+\s*个文件/.test(String(job.detail))) {
    lines.push(String(job.detail), "");
  } else if (st === "succeeded") {
    const req = String(job.requirement || "").trim();
    lines.push(
      (req ? "「" + req + "」" : "写码") + "已结束；下方为同步文件，请按验收步骤确认效果。",
      "",
    );
  } else {
    lines.push(String(job.detail || job.error || "写码流程已结束。"), "");
  }

  lines.push("---", "");
  lines.push("**状态：** " + st);
  if (st === "succeeded") {
    const codeFiles = codeFilesOnlyForSync(synced);
    const n = Array.isArray(synced) ? synced.length : 0;
    lines.push(
      "**同步：** 已自动同步 " +
        n +
        " 个文件到本机" +
        (String(job.detail || "").indexOf("Vite") >= 0 ? "，并尝试刷新了前端。" : "。"),
    );
    if (codeFiles.length) {
      lines.push("");
      for (const f of codeFiles.slice(0, 30)) lines.push("- " + f);
      if (codeFiles.length > 30) {
        lines.push("- …另有 " + (codeFiles.length - 30) + " 个");
      }
    }
  } else if (st === "pending_review") {
    lines.push("**同步：** 待审（自动同步未开启或范围内无文件）。");
  } else {
    lines.push("**说明：** " + (job.detail || job.error || st));
  }

  if (Array.isArray(deferred) && deferred.length) {
    lines.push("", "**范围外未同步 " + deferred.length + " 个**：");
    for (const f of deferred.slice(0, 15)) lines.push("- " + f);
    if (deferred.length > 15) {
      lines.push("- …另有 " + (deferred.length - 15) + " 个");
    }
  }

  lines.push("");
  lines.push("请自行打开页面确认编码效果。");
  lines.push("");
  lines.push(
    "如需调整或修 bug，请直接在本对话说明具体问题。小改直接续改确认卡；大改先说清楚要改哪里。",
  );
  return lines.join("\n");
}

/** 正文结论是否偏空（只剩同步条数 / 超时催 finish / 无说明方案） */
export function isThinChatBody(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  if (/请再调一次\s*zr_cchat_finish/.test(t)) return true;
  if (/等待写码结束超时/.test(t)) return true;
  if (/^已同步\s*\d+\s*个文件/.test(t) && t.length < 280) return true;
  // 外壳有「本轮结论」但主体只是同步 detail、没有说明方案/改动
  if (
    /^##\s*本轮结论/.test(t) &&
    !/##\s*说明方案|做了什么|改动清单|改动文件|怎么验收|验收路径|验收步骤/.test(t) &&
    /已同步\s*\d+\s*个文件/.test(t) &&
    t.length < 520
  ) {
    return true;
  }
  return false;
}

function lastAssistantFromTranscript(transcript) {
  if (!Array.isArray(transcript)) return "";
  for (let i = transcript.length - 1; i >= 0; i--) {
    const row = transcript[i];
    if (!row || typeof row !== "object") continue;
    if (row.kind !== "assistant" && row.type !== "assistant") continue;
    const text = String(row.text || row.message || "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * DSH 0.2 工具返回值常是 frozen；直接改 chat_body / status 会抛错，正文结论丢失 → 聊天空白。
 * 禁止 structuredClone 整包：会拆掉 source 引用，下一轮写入被 v4 拒成
 * 「format v4 message requires a producer-owned source kind」。
 */
export function cloneToolResult(result) {
  if (!result || typeof result !== "object") return result;
  const out = Object.assign({}, result);
  try {
    for (const sym of Object.getOwnPropertySymbols(result)) {
      out[sym] = result[sym];
    }
  } catch {
    /* ignore */
  }
  try {
    for (const n of Object.getOwnPropertyNames(result)) {
      if (Object.prototype.hasOwnProperty.call(out, n)) continue;
      const desc = Object.getOwnPropertyDescriptor(result, n);
      if (desc) Object.defineProperty(out, n, desc);
    }
  } catch {
    /* ignore */
  }
  if (result.value && typeof result.value === "object") {
    out.value = Object.assign({}, result.value);
  }
  if (Array.isArray(result.content)) {
    out.content = result.content.map((c) =>
      c && typeof c === "object" ? Object.assign({}, c) : c,
    );
  }
  if (result.source) out.source = result.source;
  return out;
}

function asToolValue(result) {
  if (!result || typeof result !== "object") return null;
  if (result.value && typeof result.value === "object") return result.value;
  if (result.chat_body != null || result.job_id != null || result.status != null) {
    return result;
  }
  return null;
}

function extractJobId(payload, result) {
  const fromPayload = String(
    (payload && (payload.job_id || payload.jobId)) || "",
  ).trim();
  if (fromPayload) return fromPayload;
  try {
    const text = JSON.stringify(result || "");
    const m = text.match(/\b(cch-[0-9a-z-]+)\b/i);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

/**
 * 进度卡只认 cursor_chat_ui。缺 job_id / 诉求时，插件会把已完成任务拆回确认表单。
 * 这里用账本补齐，不改插件。
 */
function ensureCursorChatUi(payload, job, jid, status) {
  if (!payload || typeof payload !== "object") return false;
  const prev =
    payload.cursor_chat_ui && typeof payload.cursor_chat_ui === "object"
      ? payload.cursor_chat_ui
      : {};
  const ui = Object.assign({}, prev);
  let filled = false;
  if (!ui.job_id && jid) {
    ui.job_id = jid;
    filled = true;
  }
  const req = String(ui.requirement || (job && job.requirement) || "").trim();
  if (!ui.requirement && req) {
    ui.requirement = req;
    filled = true;
  }
  const ws = String(ui.workspace || (job && job.workspace) || "").trim();
  if (!ui.workspace && ws) {
    ui.workspace = ws;
    filled = true;
  }
  if (!ui.status && status) {
    ui.status = status;
    filled = true;
  }
  if (!ui.kind && ui.job_id) {
    ui.kind = "live";
    filled = true;
  }
  if (!filled) return false;
  payload.cursor_chat_ui = ui;
  return true;
}

function setContentText(result, text) {
  if (!result || typeof result !== "object") return;
  const block = { type: "text", text: String(text || "") };
  if (Array.isArray(result.content)) {
    result.content = [block];
  }
}

/**
 * 写码工具返回后：若 Job 已终态但 chat_body 空/薄，用 Job 账本补全文结论进 chat_body。
 * @returns {{ result: any, changed: boolean, jobId?: string }}
 */
export function enrichCodingToolResultWithChatBody(result, opts) {
  if (!result) return { result, changed: false };
  result = cloneToolResult(result);
  const payload = asToolValue(result);
  if (!payload) return { result, changed: false };

  // 确认卡等待中：不要抢写结论
  if (payload.pending_confirm === true) return { result, changed: false };
  if (payload.need_clarify === true) return { result, changed: false };

  const jid = extractJobId(payload, result);
  const job =
    loadCursorChatJob(jid, opts) ||
    (payload.status && TERMINAL.has(String(payload.status))
      ? {
          id: jid,
          status: payload.status,
          detail: payload.detail,
          assistant_text: payload.assistant_text || "",
          synced_files: payload.synced_files || payload.last_synced_files || [],
          requirement: payload.requirement || "",
          conclusion_delivered: false,
        }
      : null);

  if (!job) return { result, changed: false };
  const st = String(job.status || "").trim();
  if (!TERMINAL.has(st)) return { result, changed: false };
  const uiFilled = ensureCursorChatUi(payload, job, jid, st);

  const currentBody = String(payload.chat_body || "").trim();
  const alreadyRich =
    !isThinChatBody(currentBody) &&
    /##\s*说明方案|做了什么|改动清单|改动文件|怎么验收|验收路径/.test(currentBody);
  if (alreadyRich) {
    if (!job.conclusion_delivered && jid) {
      markCursorChatConclusionDelivered(jid, opts);
    }
    setContentText(result, "写码已完成。结论已在对话过程中展示。");
    return { result, changed: true, jobId: jid };
  }

  // Job 上已有完整说明方案，但工具没把 chat_body 交出去（典型：conclusion_delivered=false）
  const rich = formatChatBodyConclusion(job);
  if (!rich || isThinChatBody(rich)) {
    // 连 Job 也凑不出（真没 assistant_text）——仍尽量交一份，避免正文全空
    if (!rich) return { result, changed: uiFilled, jobId: jid };
  }

  payload.chat_body = rich;
  payload.done = true;
  if (payload.ok === false && !payload.show_error) payload.ok = true;
  if (payload.silent) delete payload.silent;
  if (!payload.job_id && jid) payload.job_id = jid;
  if (!payload.status) payload.status = st;
  if (result.isError) result.isError = false;
  if (result.error) delete result.error;
  // 完整结论由过程流按字淌出；工具 content 若整段交出去，DSH 会在下面一次性蹦出。
  setContentText(result, "写码已完成。结论已在对话过程中展示。");
  if (jid) markCursorChatConclusionDelivered(jid, opts);
  return { result, changed: true, jobId: jid };
}
