/**
 * 对话写码因 *.db EPERM 整单失败后，宿主立刻回收非 db 源码。
 * 不改 DSH 插件。失败卡被 display:none 时 innerText 为空，不能只靠客户端扫卡。
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import * as runtime from "@dsh-external/mes-runtime";

import { cloneToolResult, loadCursorChatJob } from "./coding-chat-body.js";
import { userFacingCodingConclusion } from "./coding-closeout.js";
import { classifyCodingFailKind } from "./coding-fail-kind.js";
import { readChatJob } from "./coding-dup-guard.js";

export function shouldRecoverDbEperm(job) {
  if (!job || typeof job !== "object") return false;
  if (Array.isArray(job.recovered_files) && job.recovered_files.length) return false;
  const st = String(job.status || "").trim();
  if (st !== "failed" && st !== "error") return false;
  return classifyCodingFailKind(job.detail || job.error) === "db_eperm";
}

function landedRecoverFiles(rec) {
  const files = (rec && rec.changed_files) || [];
  const deleted = (rec && rec.deleted_files) || [];
  const out = files.slice();
  deleted.forEach(function (rel) {
    const text = String(rel || "").replace(/\\/g, "/").trim();
    if (text && out.indexOf(text) < 0) out.push(text);
  });
  return { files: files, deleted: deleted, landed: out };
}

export function applyRecoveredToolResult(result, rec) {
  const packed = landedRecoverFiles(rec);
  const files = packed.landed;
  const out = cloneToolResult(result) || {};
  out.isError = false;
  if (out.error) delete out.error;
  const payload =
    out.value && typeof out.value === "object" ? Object.assign({}, out.value) : {};
  payload.ok = true;
  payload.done = true;
  payload.recovered = true;
  payload.recovered_files = files;
  payload.recovered_deleted = packed.deleted;
  payload.changed_files = packed.files;
  if (!payload.status) payload.status = "failed";
  const full = userFacingCodingConclusion({
    id: payload.job_id,
    status: "failed",
    requirement: payload.requirement,
    detail: payload.detail || (rec && rec.detail) || "",
    assistant_text: payload.assistant_text,
    recovered_files: files,
    recovered_deleted: packed.deleted,
    synced_files: packed.files,
  });
  payload.chat_body = full;
  out.value = payload;
  out.content = [{ type: "text", text: full }];
  return out;
}

function persistRecovered(jobId, files, opts) {
  const job = loadCursorChatJob(jobId, opts);
  if (!job || !Array.isArray(files) || !files.length) return;
  job.recovered = true;
  job.recovered_files = files;
  job.updated_at = new Date().toISOString();
  try {
    const dir =
      (opts && opts.jobsDir) ||
      path.join(
        process.env.USERPROFILE || process.env.HOME || "",
        ".zhongruan",
        "cursor-chat",
        "jobs",
      );
    fs.writeFileSync(path.join(dir, jobId + ".json"), JSON.stringify(job, null, 2), "utf8");
  } catch {
    /* ignore */
  }
}

function engineOrigin() {
  try {
    const text = fs.readFileSync(path.join(runtime.ENGINE_DIR, "config", "runtime.yaml"), "utf8");
    const host = (text.match(/^\s*host:\s*["']?([^\s"']+)/m) || [])[1] || "127.0.0.1";
    const port = Number((text.match(/^\s*port:\s*(\d+)/m) || [])[1] || 0);
    if (!port) return "";
    return "http://" + String(host).replace(/^::1$/, "127.0.0.1") + ":" + port;
  } catch {
    return "";
  }
}

function postJson(url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const data = Buffer.from(JSON.stringify(body || {}), "utf8");
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": data.length,
        },
        timeout: timeoutMs || 20000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(raw));
          } catch {
            resolve({ ok: false, detail: raw.slice(0, 200) });
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.write(data);
    req.end();
  });
}

export async function recoverFailedChatJobIfNeeded(jobId, opts) {
  const jid = String(jobId || "").trim();
  if (!jid) return null;
  const job = readChatJob(jid, opts) || loadCursorChatJob(jid, opts);
  if (!shouldRecoverDbEperm(job)) return null;
  let rec = null;
  try {
    rec = await runtime.runEngine(["recover-db-sync", jid], 60000);
  } catch {
    rec = null;
  }
  if (!landedRecoverFiles(rec).landed.length) {
    const origin = engineOrigin();
    if (origin) {
      try {
        rec = await postJson(origin + "/api/cursor-chat/recover-db-sync", { job_id: jid });
      } catch {
        /* keep rec */
      }
    }
  }
  const packed = landedRecoverFiles(rec);
  if (rec && rec.ok && packed.landed.length) {
    persistRecovered(jid, packed.landed, opts);
    const job = loadCursorChatJob(jid, opts);
    if (job && packed.deleted.length) {
      job.recovered_deleted = packed.deleted;
      try {
        const dir =
          (opts && opts.jobsDir) ||
          path.join(
            process.env.USERPROFILE || process.env.HOME || "",
            ".zhongruan",
            "cursor-chat",
            "jobs",
          );
        fs.writeFileSync(path.join(dir, jid + ".json"), JSON.stringify(job, null, 2), "utf8");
      } catch {
        /* ignore */
      }
    }
    return rec;
  }
  return rec && rec.ok ? rec : null;
}
