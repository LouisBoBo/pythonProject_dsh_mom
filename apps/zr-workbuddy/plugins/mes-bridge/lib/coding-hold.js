/**
 * 写码工具在任务终态前不把控制权交回模型。
 * 否则模型会在进度卡下面连续思考、轮询、报错，把写码卡顶出屏幕。
 * 不改 DSH 写码插件；只在 mes-bridge 接到插件的短返回后继续读本地账本。
 */
import { cloneToolResult } from "./coding-chat-body.js";
import { readChatJob } from "./coding-dup-guard.js";

const HOLD_DONE = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "canceled",
  "blocked_no_runner",
  "pending_review",
]);

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 1000;

function sleep(ms, signal) {
  if (signal && signal.aborted) return Promise.reject(new Error("已取消"));
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("已取消"));
    };
    if (signal.aborted) {
      clearTimeout(t);
      reject(new Error("已取消"));
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
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

function payloadStatus(payload) {
  return String((payload && payload.status) || "").trim();
}

/**
 * 插件短返回后，若账本仍在跑，就在这次工具调用里等到终态再交回。
 * pending_confirm / 待澄清不挡确认卡。
 * @returns {Promise<{ result: any, changed: boolean, jobId?: string, status?: string }>}
 */
export async function holdCodingToolResult(result, opts) {
  const options = opts || {};
  if (!result) return { result, changed: false };
  result = cloneToolResult(result);
  const payload = asToolValue(result);
  if (!payload && !result.isError) return { result, changed: false };
  if (payload && (payload.pending_confirm === true || payload.need_clarify === true)) {
    return { result, changed: false };
  }
  const jid = extractJobId(payload, result);
  if (!jid) return { result, changed: false };

  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const intervalMs = Number(options.intervalMs) > 0 ? Number(options.intervalMs) : DEFAULT_INTERVAL_MS;
  const signal = options.signal;
  const deadline = Date.now() + timeoutMs;
  let job = readChatJob(jid, options) || null;
  let status = job ? String(job.status || "").trim() : payloadStatus(payload);
  if (HOLD_DONE.has(status)) {
    return { result, changed: false, jobId: jid, status };
  }

  while (Date.now() < deadline) {
    if (signal && signal.aborted) break;
    await sleep(intervalMs, signal);
    job = readChatJob(jid, options);
    status = job ? String(job.status || "").trim() : "";
    if (HOLD_DONE.has(status)) break;
  }

  if (job && payload && payload.status !== status && status) payload.status = status;
  if (HOLD_DONE.has(status)) {
    return { result, changed: true, jobId: jid, status };
  }
  return { result, changed: false, jobId: jid, status: status || payloadStatus(payload) };
}
