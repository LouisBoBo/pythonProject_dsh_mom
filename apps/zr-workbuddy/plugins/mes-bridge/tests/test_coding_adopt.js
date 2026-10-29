import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  adoptAndHoldCodingJob,
  codingJobToolResult,
  findAdoptableCodingJob,
} from "../lib/coding-adopt.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function writeJob(dir, job) {
  fs.writeFileSync(path.join(dir, job.id + ".json"), JSON.stringify(job), "utf8");
}

test("宿主已开工的进行中任务可被 begin 挂接", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-adopt-"));
  const sid = "session-adopt-live";
  writeJob(dir, {
    id: "cch-live-1",
    status: "running",
    dsh_session_id: sid,
    dsh_call_id: null,
    requirement: "开发一个工艺评审系统",
    workspace: "C:\\Users\\Yu\\Desktop\\gyps",
    updated_at: "2026-10-29T05:56:04.000Z",
  });
  const job = findAdoptableCodingJob({
    sessionId: sid,
    message: "开发一个工艺评审系统",
    toolName: "zr_cchat_begin",
    jobsDir: dir,
  });
  assert.equal(job && job.id, "cch-live-1");
  assert.equal(
    findAdoptableCodingJob({
      sessionId: sid,
      message: "产量多少",
      toolName: "zr_cchat_begin",
      jobsDir: dir,
    }),
    null,
  );
  assert.equal(
    findAdoptableCodingJob({
      sessionId: sid,
      message: "",
      toolName: "zr_cchat_begin",
      jobsDir: dir,
    }),
    null,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("已成功同一句挂接结论，用户新修改点不挂接", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-adopt-ok-"));
  const sid = "session-adopt-ok";
  writeJob(dir, {
    id: "cch-ok-1",
    status: "succeeded",
    dsh_session_id: sid,
    requirement: "开发一个工艺评审系统",
    detail: "已同步 14 个文件",
    assistant_text: "## 说明方案\n\n已落地列表与评审单。",
    synced_files: ["app/main.py", "static/index.html"],
    updated_at: "2026-10-29T05:57:21.000Z",
  });
  assert.equal(
    findAdoptableCodingJob({
      sessionId: sid,
      message: "开发一个工艺评审系统",
      toolName: "zr_cchat_begin",
      jobsDir: dir,
    }).id,
    "cch-ok-1",
  );
  assert.equal(
    findAdoptableCodingJob({
      sessionId: sid,
      message: "按钮颜色改成蓝色",
      toolName: "zr_cchat_continue",
      jobsDir: dir,
    }),
    null,
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("挂接进行中任务须等到终态再交回结论", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-adopt-hold-"));
  const id = "cch-adopt-hold";
  const file = path.join(dir, id + ".json");
  const job = {
    id,
    status: "running",
    dsh_session_id: "s",
    requirement: "开发工艺评审",
    workspace: "D:\\proj",
  };
  fs.writeFileSync(file, JSON.stringify(job), "utf8");
  const pending = adoptAndHoldCodingJob(job, {
    jobsDir: dir,
    timeoutMs: 2000,
    intervalMs: 40,
  });
  setTimeout(() => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...job,
        status: "succeeded",
        detail: "已同步 2 个文件",
        assistant_text: "## 说明方案\n\n列表与发起评审已落地。",
        synced_files: ["app/main.py", "static/index.html"],
      }),
      "utf8",
    );
  }, 80);
  const out = await pending;
  assert.equal(out.job_id, id);
  assert.equal(out.status, "succeeded");
  assert.match(String(out.chat_body || ""), /说明方案/);
  assert.equal(out.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("bridge 在 begin/continue 前挂接已有任务，不把控制权提前交回模型", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "lib", "index.js"), "utf8");
  assert.match(src, /adoptExistingCodingTool/);
  assert.match(src, /写码挂接已有任务/);
  assert.match(src, /if \(adoptedOut\) return adoptedOut/);
});

test("codingJobToolResult 不含 pending_confirm，才能被 hold 等待", () => {
  const seed = codingJobToolResult({
    id: "cch-x",
    status: "running",
    workspace: "D:\\a",
    requirement: "开发",
  });
  assert.equal(seed.pending_confirm, undefined);
  assert.equal(seed.job_id, "cch-x");
});
