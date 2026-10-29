/**
 * 宿主已直开工时，模型后到的 zr_cchat_begin 必须挂接同一 Job 并等到终态。
 * 否则插件会另开 pending 确认卡、begin 立刻把控制权交回模型，对话在进度卡结束后仍空转。
 * 不改 DSH 写码插件。
 */
import { enrichCodingToolResultWithChatBody } from "./coding-chat-body.js";
import {
  findLatestChatJob,
  isSameCodingRequirement,
  looksLikeAgentEchoNotUserFollowUp,
  looksLikeNewCodingFollowUp,
} from "./coding-dup-guard.js";
import { holdCodingToolResult } from "./coding-hold.js";

const LIVE = new Set(["queued", "running", "pending_review"]);

/**
 * 本会话可挂接的写码任务：进行中的同一句，或已成功且不是用户新修改点。
 * @param {{ sessionId?: string, message?: string, toolName?: string, jobsDir?: string }} opts
 * @returns {object | null}
 */
export function findAdoptableCodingJob(opts) {
  const o = opts || {};
  const name = String(o.toolName || "");
  if (name !== "zr_cchat_begin" && name !== "zr_cchat_continue") return null;
  const job = findLatestChatJob(o.sessionId, o);
  if (!job || !job.id) return null;
  const st = String(job.status || "").trim();
  const msg = String(o.message || "").trim();
  const same = isSameCodingRequirement(msg, job.requirement);
  if (LIVE.has(st)) {
    if (same) return job;
    return null;
  }
  if (st !== "succeeded") return null;
  if (looksLikeNewCodingFollowUp(msg) && !same) return null;
  if (same || looksLikeAgentEchoNotUserFollowUp(msg)) return job;
  return null;
}

/**
 * 把已有 Job 做成工具返回值，供 hold / 正文补强使用。
 * @param {object} job
 * @returns {object}
 */
export function codingJobToolResult(job) {
  const jid = String((job && job.id) || "").trim();
  const st = String((job && job.status) || "running").trim() || "running";
  const workspace = String((job && job.workspace) || "").trim();
  const requirement = String((job && job.requirement) || "").trim();
  return {
    ok: true,
    job_id: jid,
    status: st,
    workspace,
    requirement,
    cursor_chat_ui: {
      kind: "live",
      job_id: jid,
      status: st,
      workspace,
      requirement,
    },
    content: [{ type: "text", text: "写码任务进行中 " + jid }],
  };
}

/**
 * 不调写码插件：挂接已有 Job，等到终态后再把正文结论交回模型。
 * @param {object} job
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function adoptAndHoldCodingJob(job, opts) {
  const seed = codingJobToolResult(job);
  const held = await holdCodingToolResult(seed, opts);
  const enriched = enrichCodingToolResultWithChatBody(held.result, opts);
  return enriched.result;
}
