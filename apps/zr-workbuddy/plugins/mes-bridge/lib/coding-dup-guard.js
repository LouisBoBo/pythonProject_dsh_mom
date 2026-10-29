/**
 * 防止「写码已终态」后用同一原话再开续改确认卡；并给出 Cursor IDE 风格的用户结论。
 * 不改 DSH 插件；供 mes-bridge tools.guard / pre-execute 软拦截。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  classifyCodingFailKind,
  isHollowCodingSuccess,
} from "./coding-fail-kind.js";
import {
  formatCodingCloseoutBanner,
  formatFriendlyCodingCloseout,
} from "./coding-closeout.js";

export { isHollowCodingSuccess };
export { formatCodingCloseoutBanner, formatFriendlyCodingCloseout };

export function cursorChatJobsDir() {
  return path.join(os.homedir(), ".zhongruan", "cursor-chat", "jobs");
}

export function readChatJob(jobId, opts) {
  let id = String(jobId || "").trim();
  if (id.toLowerCase().endsWith(".json")) id = id.slice(0, -5);
  if (!id.startsWith("cch-") && !id.startsWith("ccj-")) return null;
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return null;
  if (!/^(cch|ccj)-[A-Za-z0-9_-]+$/.test(id)) return null;
  const dir = (opts && opts.jobsDir) || cursorChatJobsDir();
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, id + ".json"), "utf8"));
  } catch {
    return null;
  }
}

export function normalizeCodingRequirement(text) {
  return String(text || "")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 240);
}

/** 用户明确提出新的修改点（允许续改）。 */
export function looksLikeNewCodingFollowUp(message) {
  const t = String(message || "").trim();
  if (!t) return false;
  return /(再|又|另外|还要|改成|改回|修一下|修好|调整|补上|补齐|去掉|删掉|不对|错了|重新|继续改|再改|再跑|再写|没生效|无效|失败|报错|bug)/i.test(
    t,
  );
}

/**
 * Agent 自嗨/进度复读（不是用户新诉求）→ 一律当重复，禁止开续改卡。
 */
export function looksLikeAgentEchoNotUserFollowUp(message) {
  const t = String(message || "").trim();
  if (!t) return true;
  if (t.length < 80) {
    if (
      /^(任务已完成|已完成|写码完成|写码已完成|继续|确认|开写|好的|收到|完成了|搞定了|可以了)[。．!！]?$/i.test(
        t,
      )
    ) {
      return true;
    }
  }
  if (/本轮结论|已同步\s*\d+\s*个文件|请自行打开页面确认|续改确认|确认并用 Cursor/.test(t)) {
    return true;
  }
  return false;
}

/**
 * 与已成功任务的诉求是否实质同一句（禁止再开确认卡）。
 */
export function isSameCodingRequirement(message, priorRequirement) {
  const a = normalizeCodingRequirement(message);
  const b = normalizeCodingRequirement(priorRequirement);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return true;
  }
  return false;
}

function jobUpdatedMs(job) {
  return Date.parse(String((job && (job.updated_at || job.created_at)) || "")) || 0;
}

/**
 * 本会话最近一条已成功的对话写码 Job（只读磁盘 jobs）。
 */
export function findLatestSucceededChatJob(sessionId, opts) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const dir = (opts && opts.jobsDir) || cursorChatJobsDir();
  if (!fs.existsSync(dir)) return null;
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
      if (String(job.status || "") !== "succeeded") continue;
      if (!best || jobUpdatedMs(job) >= jobUpdatedMs(best)) best = job;
    } catch {
      /* skip */
    }
  }
  return best;
}

/**
 * 本会话最近一条终态 Job（成功/失败/取消），供结论文案。
 */
export function findLatestTerminalChatJob(sessionId, opts) {
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

const CHAT_JOB_TERMINAL = new Set(["succeeded", "failed", "cancelled", "canceled"]);

/**
 * 本会话时间上最新的一条对话写码 Job（含仍在跑的）。
 */
export function findLatestChatJob(sessionId, opts) {
  const sid = String(sessionId || "").trim();
  if (!sid) return null;
  const dir = (opts && opts.jobsDir) || cursorChatJobsDir();
  if (!fs.existsSync(dir)) return null;
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
      if (!best || jobUpdatedMs(job) >= jobUpdatedMs(best)) best = job;
    } catch {
      /* skip */
    }
  }
  return best;
}

/**
 * 拦截「非用户发起的续改确认」：
 * - 上一轮已成功 + 同句/复读 → 拦，并给出用户结论；
 * - 上一轮已失败 + Agent 复读空话 → 拦；
 * - 上一轮已失败 + 同句续修 → **不拦**（插件仍会出 HITL 续改确认卡；客户端加失败说明，不自动点确认）。
 * 有附图时放行。
 */
export function duplicateCodingConfirmBlock({
  toolName,
  message,
  sessionId,
  hasImages,
  jobsDir,
} = {}) {
  const name = String(toolName || "");
  if (
    name !== "zr_cchat_begin" &&
    name !== "zr_cchat_continue" &&
    name.indexOf("zr_cchat_") !== 0
  ) {
    return null;
  }
  if (hasImages && name !== "zr_cchat_finish") return null;

  const latest = findLatestChatJob(sessionId, { jobsDir });
  if (latest && !CHAT_JOB_TERMINAL.has(String(latest.status || "").trim())) {
    // 进行中不回传文案：那段「禁止出结论」会变成工具红错，画在进度卡下面。
    // 未终态时由 execute 静默等到终态；界面另把卡下方的思考/轮询收起。
    return null;
  }
  if (name === "zr_cchat_finish" || name === "zr_cchat_apply") return null;

  const msg = String(message || "").trim();
  const job = findLatestTerminalChatJob(sessionId, { jobsDir });
  if (!job) return null;

  const st = String(job.status || "");
  const echo = looksLikeAgentEchoNotUserFollowUp(msg);
  const same = msg.length >= 2 && isSameCodingRequirement(msg, job.requirement);

  const isBegin =
    name === "zr_cchat_begin" ||
    name === "zr_cursor_begin" ||
    name === "mes_code_dev_begin";

  // 失败后续修同一诉求：continue 放行；Network 失败禁止同句 begin（须 continue + parent_job_id）
  if ((st === "failed" || st === "cancelled" || st === "canceled") && same && !echo) {
    if (isBegin) {
      const kind = classifyCodingFailKind(
        String(job.detail || job.error || ""),
      );
      if (kind === "network") {
        const jid = String(job.id || "").trim() || "（未知）";
        return (
          "【请转告用户并改调工具】上一轮写码因网络抖动失败（任务 " +
          jid +
          "），工程通常无改动。请调用 `zr_cchat_continue`，并带 `parent_job_id`=" +
          jid +
          " 与同一诉求；**禁止**对此用 begin 新开。用户明确说重开/换工程时才允许 begin。"
        );
      }
    }
    return null;
  }

  // 空同步「假成功」：同句放行 continue；拦 begin（与 Network 同策略）
  if (st === "succeeded" && isHollowCodingSuccess(job) && same && !echo) {
    if (isBegin) {
      const jid = String(job.id || "").trim() || "（未知）";
      return (
        "【请转告用户并改调工具】上一轮任务显示成功，但未检测到源码落盘（任务 " +
        jid +
        "）。请调用 `zr_cchat_continue`，并带 `parent_job_id`=" +
        jid +
        " 与同一诉求；**禁止**对此用 begin 新开。"
      );
    }
    return null;
  }

  if (!echo && !same) return null;
  // 成功后若用户明确说了新修改点，放行续改
  if (st === "succeeded" && !echo && looksLikeNewCodingFollowUp(msg) && !same) {
    return null;
  }
  // 成功后同句 / 任何终态下的 Agent 复读 → 一律禁止再出确认卡
  if (st === "succeeded" || echo) {
    const closeout = formatFriendlyCodingCloseout(job);
    if (closeout) return closeout;
    const jid = String(job.id || "").trim() || "（未知）";
    return (
      "写码任务 " +
      jid +
      " 已终态。请把结论用自然语言告诉用户，勿自行再开「续改确认」卡。" +
      "续改只能由用户提出新的修改点后发起。"
    );
  }

  return null;
}

/** 供客户端：父任务是否为失败/取消（续改卡补充失败说明）。 */
export function isFailedTerminalStatus(status) {
  const st = String(status || "").trim();
  return st === "failed" || st === "cancelled" || st === "canceled";
}

export function codingToolHasImages(exec) {
  const args = (exec && exec.arguments) || {};
  const raw = args.images ?? args.image ?? args.attachments;
  if (raw == null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  const s = String(raw).trim();
  return s.length > 2 && s !== "[]" && s !== "null";
}
