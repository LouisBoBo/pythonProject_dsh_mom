import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { holdCodingToolResult } from "../lib/coding-hold.js";

test("确认卡与已终态不空等", async () => {
  const pending = await holdCodingToolResult({
    pending_confirm: true,
    job_id: "cch-x",
    status: "running",
  });
  assert.equal(pending.changed, false);

  const done = await holdCodingToolResult({
    job_id: "cch-y",
    status: "succeeded",
  });
  assert.equal(done.changed, false);
});

test("进行中的任务等到终态才交回", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-hold-"));
  const id = "cch-hold-1";
  const file = path.join(dir, id + ".json");
  fs.writeFileSync(
    file,
    JSON.stringify({ id, status: "running", dsh_session_id: "s" }),
    "utf8",
  );
  const result = { job_id: id, status: "running", content: [{ type: "text", text: "请再调 wait" }] };
  const pending = holdCodingToolResult(result, {
    jobsDir: dir,
    timeoutMs: 2000,
    intervalMs: 40,
  });
  setTimeout(() => {
    fs.writeFileSync(
      file,
      JSON.stringify({ id, status: "succeeded", dsh_session_id: "s" }),
      "utf8",
    );
  }, 120);
  const held = await pending;
  assert.equal(held.changed, true);
  assert.equal(held.status, "succeeded");
  assert.equal(held.result.status, "succeeded");
});

test("冻结的工具返回值也能写上终态 status", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-hold-freeze-"));
  const id = "cch-hold-freeze";
  const file = path.join(dir, id + ".json");
  fs.writeFileSync(
    file,
    JSON.stringify({ id, status: "running", dsh_session_id: "s" }),
    "utf8",
  );
  const result = Object.freeze({
    job_id: id,
    status: "running",
    content: Object.freeze([{ type: "text", text: "请再调 wait" }]),
  });
  const pending = holdCodingToolResult(result, {
    jobsDir: dir,
    timeoutMs: 2000,
    intervalMs: 40,
  });
  setTimeout(() => {
    fs.writeFileSync(
      file,
      JSON.stringify({ id, status: "succeeded", dsh_session_id: "s" }),
      "utf8",
    );
  }, 120);
  const held = await pending;
  assert.equal(held.changed, true);
  assert.equal(held.result.status, "succeeded");
  assert.equal(result.status, "running");
  fs.rmSync(dir, { recursive: true, force: true });
});
