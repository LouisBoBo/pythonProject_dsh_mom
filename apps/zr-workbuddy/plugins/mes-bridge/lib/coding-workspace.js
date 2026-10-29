/**
 * 写码工程目录：不依赖 session.cwd 是否已挂上。
 * 用户发消息时 DSH 常还没把 cwd 填进 session/event，宿主直开工会 no-workspace，
 * 只能干等模型调 zr_cchat_begin（约 1 分钟）。此处从侧栏工作区注册表 / 落盘 / 近次 Job 回退。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { findLatestChatJob } from "./coding-dup-guard.js";

export function lastWorkspaceFile() {
  return path.join(
    os.homedir(),
    ".zhongruan",
    "cursor-chat",
    "state",
    "last-workspace.json",
  );
}

export function dshHomeCandidates(extra) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    const abs = String(p || "").trim();
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };
  for (const x of extra || []) add(x);
  add(process.env.DSH_HOME);
  add(path.join(os.homedir(), ".dsh"));
  if (process.env.APPDATA) {
    add(path.join(process.env.APPDATA, "zr-workbuddy-desktop", "dsh-home"));
  }
  return out;
}

function isDir(p) {
  try {
    return !!p && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 规范化写码根目录：resolve + realpath，拒绝盘符根和 Windows 系统目录。
 * @returns {string} 真实绝对路径，不合法则空串
 */
export function resolveTrustedWorkspaceDir(p) {
  const raw = String(p || "").trim();
  if (!raw || raw.includes("\0")) return "";
  let real = "";
  try {
    const abs = path.resolve(raw);
    if (!isDir(abs)) return "";
    real = fs.realpathSync.native ? fs.realpathSync.native(abs) : fs.realpathSync(abs);
  } catch {
    return "";
  }
  if (!real || !isDir(real)) return "";
  const lower = String(real).toLowerCase().replace(/\//g, "\\");
  if (/^[a-z]:\\?$/.test(lower)) return "";
  if (lower === "\\" || lower === "/") return "";
  if (/(^|\\)windows(\\system32|\\syswow64)?(\\|$)/i.test(lower)) return "";
  return real;
}

export function isSafeWorkspaceDir(p) {
  return !!resolveTrustedWorkspaceDir(p);
}

/** 日志只留末级目录名，不打完整用户路径。 */
export function workspaceLogLabel(p) {
  const s = String(p || "").trim();
  if (!s) return "";
  const base = path.basename(s);
  return base || "[workspace]";
}

function readJson(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function eachWorkspaceRow(raw, fn) {
  const tables = raw && raw.tables && typeof raw.tables === "object" ? raw.tables : {};
  const workspaces =
    tables.workspaces && typeof tables.workspaces === "object" ? tables.workspaces : {};
  for (const row of Object.values(workspaces)) {
    if (row && typeof row === "object") fn(row);
  }
}

/** 侧栏工作区注册表：sessionId → 工程路径。 */
export function workspacePathForSession(sessionId, opts) {
  const sid = String(sessionId || "").trim();
  if (!sid) return "";
  const homes = (opts && opts.homes) || dshHomeCandidates();
  for (const home of homes) {
    const file = path.join(String(home), "storages", "workspace.json");
    const raw = readJson(file);
    if (!raw) continue;
    let hit = "";
    eachWorkspaceRow(raw, (row) => {
      if (hit) return;
      const ids = Array.isArray(row.sessionIds) ? row.sessionIds : [];
      if (ids.some((id) => String(id) === sid)) {
        const p = resolveTrustedWorkspaceDir(row.path);
        if (p) hit = p;
      }
    });
    if (hit) return hit;
  }
  return "";
}

/** 注册表里最近更新且目录仍在的工程（新会话尚未写入 sessionIds 时用）。 */
export function recentlyUpdatedWorkspacePath(opts) {
  const homes = (opts && opts.homes) || dshHomeCandidates();
  let best = null;
  let bestTs = 0;
  for (const home of homes) {
    const file = path.join(String(home), "storages", "workspace.json");
    const raw = readJson(file);
    if (!raw) continue;
    eachWorkspaceRow(raw, (row) => {
      const p = resolveTrustedWorkspaceDir(row.path);
      if (!p) return;
      const ts = Date.parse(String(row.updatedAt || row.createdAt || "")) || 0;
      if (ts >= bestTs) {
        bestTs = ts;
        best = p;
      }
    });
  }
  return best || "";
}

/** 注册表里只有一个仍存在的工程时才允许猜。多工程禁止乱开工。 */
export function uniqueRegisteredWorkspacePath(opts) {
  const homes = (opts && opts.homes) || dshHomeCandidates();
  const found = [];
  const seen = new Set();
  for (const home of homes) {
    const file = path.join(String(home), "storages", "workspace.json");
    const raw = readJson(file);
    if (!raw) continue;
    eachWorkspaceRow(raw, (row) => {
      const p = resolveTrustedWorkspaceDir(row.path);
      if (!p) return;
      const key = p.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      found.push(p);
    });
  }
  return found.length === 1 ? found[0] : "";
}

export function persistCodingWorkspace(workspace, sessionId, opts) {
  const ws = resolveTrustedWorkspaceDir(workspace);
  if (!ws) return false;
  const file = (opts && opts.lastFile) || lastWorkspaceFile();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          workspace: ws,
          session_id: String(sessionId || "").trim(),
          updated_at: Date.now(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    return true;
  } catch {
    return false;
  }
}

export function readPersistedCodingWorkspace(opts) {
  const file = (opts && opts.lastFile) || lastWorkspaceFile();
  const raw = readJson(file);
  const ws = resolveTrustedWorkspaceDir(raw ? raw.workspace : "");
  if (!ws) return "";
  const wantSid = String((opts && opts.sessionId) || "").trim();
  const gotSid = raw ? String(raw.session_id || "").trim() : "";
  if (wantSid && gotSid && wantSid !== gotSid) return "";
  return ws;
}

/**
 * 解析本轮写码工程目录。
 * 顺序：显式 cwd → 侧栏 session 映射 → 同会话落盘 → 本会话近次 Job → 注册表仅一个工程。
 */
export function resolveCodingWorkspace(opts) {
  const o = opts || {};
  const sid = String(o.sessionId || "").trim();
  const explicit = resolveTrustedWorkspaceDir(o.workspace);
  if (explicit) {
    persistCodingWorkspace(explicit, sid, o);
    return explicit;
  }
  const fromReg = workspacePathForSession(sid, o);
  if (fromReg) {
    persistCodingWorkspace(fromReg, sid, o);
    return fromReg;
  }
  const persisted = readPersistedCodingWorkspace({ ...o, sessionId: sid });
  if (persisted) return persisted;
  const job = o.latestJob || (sid ? findLatestChatJob(sid) : null);
  const fromJob = resolveTrustedWorkspaceDir(job && job.workspace);
  if (fromJob) {
    persistCodingWorkspace(fromJob, sid, o);
    return fromJob;
  }
  const unique = uniqueRegisteredWorkspacePath(o);
  if (unique) {
    persistCodingWorkspace(unique, sid, o);
    return unique;
  }
  return "";
}
