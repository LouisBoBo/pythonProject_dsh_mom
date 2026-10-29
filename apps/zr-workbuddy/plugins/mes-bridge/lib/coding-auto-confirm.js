/**
 * 普通写码：需求明确后由 bridge 代签 HITL 开工。
 * 不改写码插件；一体化过程流仍走 shouldSoftSkipPipelineCoding，这里不要调。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  findLatestChatJob,
  isSameCodingRequirement,
} from "./coding-dup-guard.js";
import {
  resolveCodingWorkspace,
  workspaceLogLabel,
} from "./coding-workspace.js";
import { clearLaneKind } from "./triage-pack.js";

const DEFAULT_PENDING = path.join(
  os.homedir(),
  ".zhongruan",
  "cursor-chat",
  "state",
  "pending-confirms.json",
);
const DEFAULT_BASE = "http://127.0.0.1:18791";
const FRESH_MS = 3 * 60 * 1000;

function compact(s) {
  return String(s || "").replace(/\s+/g, "");
}

function readPendingMap(filePath) {
  try {
    const raw = fs.readFileSync(filePath || DEFAULT_PENDING, "utf8");
    const map = JSON.parse(raw);
    return map && typeof map === "object" ? map : {};
  } catch {
    return {};
  }
}

export function findWaitingCodingPending(opts) {
  const callId = String((opts && opts.callId) || "").trim();
  const sessionId = String((opts && opts.sessionId) || "").trim();
  const requirement = compact((opts && opts.requirement) || "");
  const now = Number((opts && opts.now) || Date.now());
  const map = (opts && opts.map) || readPendingMap(opts && opts.pendingPath);
  let best = null;
  for (const row of Object.values(map)) {
    if (!row || row.status !== "waiting") continue;
    const created = Number(row.created_at || 0);
    if (created && now - created > FRESH_MS) continue;
    if (callId && String(row.call_id || "").trim() === callId) return { ...row };
    if (sessionId && String(row.session_id || "").trim() === sessionId) {
      const req = compact(row.requirement || "");
      const reqHit =
        !requirement ||
        req === requirement ||
        req.indexOf(requirement.slice(0, 24)) >= 0 ||
        requirement.indexOf(req.slice(0, 24)) >= 0;
      if (!reqHit) continue;
      if (!best || created > Number(best.created_at || 0)) best = row;
    }
  }
  return best ? { ...best } : null;
}

export function execCallId(exec) {
  try {
    const e = exec || {};
    return String(
      e.callId ||
        e.toolCallId ||
        (e.call && (e.call.id || e.call.callId)) ||
        e.id ||
        "",
    ).trim();
  } catch {
    return "";
  }
}

async function postJson(base, pathname, body) {
  const r = await fetch(String(base || DEFAULT_BASE).replace(/\/$/, "") + pathname, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3081",
    },
    body: JSON.stringify(body || {}),
  });
  const text = await r.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, detail: text.slice(0, 200) };
  }
  return { http: r.status, json };
}

export async function confirmWaitingCodingPending(row, opts) {
  const token = String((row && row.id) || "").trim();
  if (!token) return { ok: false, detail: "no-token" };
  const base = (opts && opts.base) || DEFAULT_BASE;
  const workspace = String((row && row.workspace) || "").trim();
  const requirement = String((row && row.requirement) || "").trim();
  const issued = await postJson(base, "/api/hitl/issue", {
    action: "cursor-chat.confirm",
    workspace,
    requirement,
    confirm_token: token,
  });
  const nonce = issued.json && issued.json.nonce;
  if (!issued.json || issued.json.ok !== true || !nonce) {
    return {
      ok: false,
      detail: (issued.json && issued.json.detail) || "hitl-issue-failed",
      issued: issued.json,
    };
  }
  const body = {
    workspace,
    requirement,
    nonce,
    confirm_token: token,
  };
  if (row.parent_job_id) body.parent_job_id = row.parent_job_id;
  const confirmed = await postJson(base, "/api/cursor-chat/confirm", body);
  const ok = !!(confirmed.json && confirmed.json.ok);
  return {
    ok,
    detail: (confirmed.json && (confirmed.json.detail || confirmed.json.job_id)) || "",
    job_id: confirmed.json && confirmed.json.job_id,
    http: confirmed.http,
  };
}

const LIVE_JOB = new Set(["queued", "running", "pending_review"]);
const hostAutoStartOnce = new Map();

/** 需求明确的普通写码：不经模型问卷，由宿主直接 pending+确认开工。 */
export function shouldHostAutoStartClearCoding(opts) {
  const o = opts || {};
  if (o.integrated) return { ok: false, reason: "integrated" };
  const utt = String(o.utterance || "").trim();
  if (clearLaneKind(utt, { integrated: false }) !== "coding") {
    return { ok: false, reason: "not-coding" };
  }
  const ws = String(o.workspace || "").trim();
  if (!ws) return { ok: false, reason: "no-workspace" };
  const job = o.latestJob;
  const st = String((job && job.status) || "").trim();
  if (job && LIVE_JOB.has(st) && isSameCodingRequirement(utt, job.requirement)) {
    return { ok: false, reason: "already-running" };
  }
  return { ok: true, workspace: ws, requirement: utt };
}

export async function hostAutoStartClearCoding(opts) {
  const sid = String((opts && opts.sessionId) || "").trim();
  const given = String((opts && opts.workspace) || "").trim();
  const resolved = resolveCodingWorkspace({
    workspace: given,
    sessionId: sid,
    latestJob: opts && opts.latestJob,
  });
  if (resolved && !given) {
    console.log("[mes-bridge] 写码工作区回退 " + workspaceLogLabel(resolved));
  }
  const gate = shouldHostAutoStartClearCoding({ ...opts, workspace: resolved });
  if (!gate.ok) return { ok: false, detail: gate.reason };
  const base = (opts && opts.base) || DEFAULT_BASE;
  const created = await postJson(base, "/api/cursor-chat/pending", {
    workspace: gate.workspace,
    requirement: gate.requirement,
    session_id: sid || undefined,
  });
  const token = String(
    (created.json &&
      (created.json.confirm_token ||
        (created.json.pending && created.json.pending.confirm_token))) ||
      "",
  ).trim();
  if (!created.json || created.json.ok !== true || !token) {
    return {
      ok: false,
      detail: (created.json && created.json.detail) || "pending-failed",
      created: created.json,
    };
  }
  return confirmWaitingCodingPending(
    {
      id: token,
      workspace: gate.workspace,
      requirement: gate.requirement,
      session_id: sid,
    },
    { base },
  );
}

export function scheduleHostAutoStartClearCoding(opts) {
  const key =
    compact((opts && opts.sessionId) || "") +
    "|" +
    compact((opts && opts.utterance) || "").slice(0, 80);
  if (!key || key === "|") return Promise.resolve({ ok: false, detail: "no-key" });
  if (hostAutoStartOnce.has(key)) return hostAutoStartOnce.get(key);
  const log = (opts && opts.log) || console.log;
  const latestJob =
    (opts && opts.latestJob) ||
    findLatestChatJob(String((opts && opts.sessionId) || "").trim());
  const p = hostAutoStartClearCoding({ ...opts, latestJob })
    .then((out) => {
      if (out && out.ok) {
        log(
          "[mes-bridge] 清晰写码宿主直开工 ok job=" +
            String(out.job_id || "") +
            " " +
            String(out.detail || "").slice(0, 80),
        );
      } else {
        // 失败不缓存：cwd 晚到 / 分诊误判后必须能再开，否则刷新才开工
        hostAutoStartOnce.delete(key);
        if (out && out.detail && out.detail !== "not-coding") {
          log("[mes-bridge] 清晰写码宿主直开工跳过 " + String(out.detail || ""));
        }
      }
      return out;
    })
    .catch((e) => {
      hostAutoStartOnce.delete(key);
      log("[mes-bridge] 清晰写码宿主直开工异常 " + String((e && e.message) || e));
      return { ok: false, detail: String((e && e.message) || e) };
    });
  hostAutoStartOnce.set(key, p);
  if (hostAutoStartOnce.size > 40) {
    const oldest = hostAutoStartOnce.keys().next().value;
    if (oldest) hostAutoStartOnce.delete(oldest);
  }
  return p;
}

export function scheduleCodingAutoConfirm(opts) {
  const callId = String((opts && opts.callId) || "").trim();
  const sessionId = String((opts && opts.sessionId) || "").trim();
  const requirement = String((opts && opts.requirement) || "").trim();
  if (!callId && !sessionId) return;
  const tries = Number((opts && opts.tries) || 20);
  const intervalMs = Number((opts && opts.intervalMs) || 250);
  const pendingPath = (opts && opts.pendingPath) || DEFAULT_PENDING;
  const base = (opts && opts.base) || DEFAULT_BASE;
  const log = (opts && opts.log) || console.log;
  let n = 0;
  const tick = setInterval(() => {
    n += 1;
    try {
      const row = findWaitingCodingPending({
        callId,
        sessionId,
        requirement,
        pendingPath,
      });
      if (!row) {
        if (n >= tries) clearInterval(tick);
        return;
      }
      try {
        const live = findLatestChatJob(sessionId);
        const st = String((live && live.status) || "").trim();
        if (
          live &&
          LIVE_JOB.has(st) &&
          isSameCodingRequirement(requirement || row.requirement, live.requirement)
        ) {
          clearInterval(tick);
          log(
            "[mes-bridge] 写码自动开工跳过：已有进行中任务 " +
              String(live.id || ""),
          );
          return;
        }
      } catch {
        /* 账本读失败仍尝试代签 */
      }
      clearInterval(tick);
      confirmWaitingCodingPending(row, { base })
        .then((out) => {
          log(
            "[mes-bridge] 写码自动开工 " +
              (out.ok ? "ok" : "fail") +
              " token=" +
              String(row.id || "").slice(0, 24) +
              " job=" +
              String(out.job_id || "") +
              " " +
              String(out.detail || "").slice(0, 80),
          );
        })
        .catch((e) => {
          log("[mes-bridge] 写码自动开工异常 " + String((e && e.message) || e));
        });
    } catch (eTick) {
      if (n >= tries) clearInterval(tick);
    }
  }, intervalMs);
  if (typeof tick.unref === "function") tick.unref();
  return tick;
}
