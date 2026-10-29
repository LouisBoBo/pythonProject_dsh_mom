import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isSafeWorkspaceDir,
  persistCodingWorkspace,
  recentlyUpdatedWorkspacePath,
  resolveCodingWorkspace,
  uniqueRegisteredWorkspacePath,
  workspaceLogLabel,
  workspacePathForSession,
} from "../lib/coding-workspace.js";

function real(p) {
  return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
}

test("侧栏 workspace.json 用 sessionId 找回工程目录", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ws-"));
  const storages = path.join(dir, "storages");
  fs.mkdirSync(storages);
  const proj = path.join(dir, "gyps");
  fs.mkdirSync(proj);
  fs.writeFileSync(
    path.join(storages, "workspace.json"),
    JSON.stringify({
      tables: {
        workspaces: {
          a: {
            path: proj,
            sessionIds: ["session-abc"],
            updatedAt: "2026-10-29T05:49:08.544Z",
          },
        },
      },
    }),
  );
  assert.equal(
    workspacePathForSession("session-abc", { homes: [dir] }),
    real(proj),
  );
  assert.equal(workspacePathForSession("session-missing", { homes: [dir] }), "");
  assert.equal(recentlyUpdatedWorkspacePath({ homes: [dir] }), real(proj));
});

test("session.cwd 为空时仍能解析写码工作区", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ws2-"));
  const storages = path.join(dir, "storages");
  fs.mkdirSync(storages);
  const proj = path.join(dir, "app");
  fs.mkdirSync(proj);
  fs.writeFileSync(
    path.join(storages, "workspace.json"),
    JSON.stringify({
      tables: {
        workspaces: {
          a: {
            path: proj,
            sessionIds: ["session-live"],
            updatedAt: "2026-10-29T05:49:08.544Z",
          },
        },
      },
    }),
  );
  const lastFile = path.join(dir, "last-workspace.json");
  const ws = resolveCodingWorkspace({
    workspace: "",
    sessionId: "session-live",
    homes: [dir],
    lastFile,
  });
  assert.equal(ws, real(proj));
  persistCodingWorkspace(proj, "session-live", { lastFile });
  const again = resolveCodingWorkspace({
    workspace: "",
    sessionId: "session-new-not-in-registry",
    homes: [dir],
    lastFile,
  });
  assert.equal(again, real(proj));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("多工程时禁止把另一会话的目录当成当前工作区", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-ws3-"));
  const storages = path.join(dir, "storages");
  fs.mkdirSync(storages);
  const gyps = path.join(dir, "gyps");
  const other = path.join(dir, "other");
  fs.mkdirSync(gyps);
  fs.mkdirSync(other);
  fs.writeFileSync(
    path.join(storages, "workspace.json"),
    JSON.stringify({
      tables: {
        workspaces: {
          a: {
            path: gyps,
            sessionIds: ["session-gyps"],
            updatedAt: "2026-10-29T06:00:00.000Z",
          },
          b: {
            path: other,
            sessionIds: ["session-other"],
            updatedAt: "2026-10-29T07:00:00.000Z",
          },
        },
      },
    }),
  );
  const lastFile = path.join(dir, "last-workspace.json");
  persistCodingWorkspace(gyps, "session-gyps", { lastFile });
  assert.equal(uniqueRegisteredWorkspacePath({ homes: [dir] }), "");
  assert.equal(
    resolveCodingWorkspace({
      workspace: "",
      sessionId: "session-unknown",
      homes: [dir],
      lastFile,
    }),
    "",
  );
  assert.equal(
    resolveCodingWorkspace({
      workspace: "",
      sessionId: "session-gyps",
      homes: [dir],
      lastFile,
    }),
    real(gyps),
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("拒绝把盘符根或 Windows 目录当写码工作区", () => {
  assert.equal(isSafeWorkspaceDir(""), false);
  assert.equal(isSafeWorkspaceDir("C:\\"), false);
  if (process.platform === "win32" && fs.existsSync("C:\\Windows")) {
    assert.equal(isSafeWorkspaceDir("C:\\Windows"), false);
  }
});

test("工作区日志只留末级目录名", () => {
  assert.equal(workspaceLogLabel("C:\\Users\\Yu\\Desktop\\gyps"), "gyps");
  assert.equal(workspaceLogLabel(""), "");
});
