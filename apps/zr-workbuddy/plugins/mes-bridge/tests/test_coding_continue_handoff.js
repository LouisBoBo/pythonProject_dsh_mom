import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  HANDOFF_MARKER,
  SCOPE_GATE_LINE,
  buildFailedParentHandoff,
  buildHollowSuccessHandoff,
  buildSucceededParentHandoff,
  codeFilesOnly,
  enrichContinueExecHandoff,
  resolveContinueParentJob,
  writableExecArguments,
} from "../lib/coding-continue-handoff.js";

test("codeFilesOnly 剔除 db", () => {
  assert.deepEqual(
    codeFilesOnly(["backend/app/main.py", "backend/pcb_procurement.db", "backend/db_migrate.py"]),
    ["backend/app/main.py", "backend/db_migrate.py"],
  );
});

test("失败父任务交接含未同步源码与禁 db", () => {
  const text = buildFailedParentHandoff({
    id: "cch-fail-1",
    status: "failed",
    requirement: "采购合同 Not found 修复",
    detail: "同步写入失败：backend/pcb_procurement.db（EPERM）",
    changed_files: ["backend/app/main.py", "backend/pcb_procurement.db"],
    synced_files: [],
  });
  assert.match(text, new RegExp(HANDOFF_MARKER));
  assert.match(text, /backend\/app\/main\.py/);
  assert.doesNotMatch(text, /pcb_procurement\.db\n|- backend\/pcb_procurement\.db/);
  assert.match(text, /禁止.*\.db|EPERM/);
  assert.match(text, /最小 diff/);
});

test("改动范围门禁句在成功/失败交接均出现", () => {
  assert.match(
    buildSucceededParentHandoff({
      id: "cch-s",
      status: "succeeded",
      synced_files: ["a.py"],
    }),
    /最小 diff|对照.*清单|扩大/,
  );
  assert.match(
    buildFailedParentHandoff({
      id: "cch-f",
      status: "failed",
      detail: "Network request failed（retryable=true）",
      synced_files: [],
      changed_files: [],
    }),
    /最小 diff/,
  );
});

test("成功父任务不生成失败交接；生成成功交接", () => {
  assert.equal(
    buildFailedParentHandoff({
      id: "cch-ok",
      status: "succeeded",
      synced_files: ["a.py"],
      changed_files: ["a.py"],
    }),
    "",
  );
  const ok = buildSucceededParentHandoff({
    id: "cch-ok",
    status: "succeeded",
    synced_files: ["backend/app/main.py", "backend/x.db"],
  });
  assert.match(ok, new RegExp(HANDOFF_MARKER));
  assert.match(ok, /backend\/app\/main\.py/);
  assert.doesNotMatch(ok, /backend\/x\.db/);
  assert.match(ok, /增量|勿.*重/);
  assert.match(ok, /最小 diff/);
  assert.ok(ok.includes(SCOPE_GATE_LINE.slice(0, 12)));
  assert.equal(
    buildSucceededParentHandoff({
      id: "cch-hollow",
      status: "succeeded",
      synced_files: [],
    }),
    "",
  );
  assert.match(
    buildHollowSuccessHandoff({
      id: "cch-hollow",
      status: "succeeded",
      synced_files: [],
    }),
    /未检测到源码落盘/,
  );
});

test("enrichContinue 对成功父任务注入成功交接", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-handoff-ok-"));
  const sid = "session-handoff-ok";
  const req = "按钮改成蓝色";
  fs.writeFileSync(
    path.join(dir, "cch-ok.json"),
    JSON.stringify({
      id: "cch-ok",
      status: "succeeded",
      dsh_session_id: sid,
      requirement: "先做一版按钮",
      synced_files: ["frontend/src/Btn.vue"],
      updated_at: "2026-10-16T07:00:00.000Z",
    }),
    "utf8",
  );
  const exec = {
    name: "zr_cchat_continue",
    arguments: { message: req, parent_job_id: "cch-ok" },
  };
  const once = enrichContinueExecHandoff(exec, sid, { jobsDir: dir });
  assert.equal(once.changed, true);
  assert.match(String(exec.arguments.message), new RegExp(HANDOFF_MARKER));
  assert.match(String(exec.arguments.message), /Btn\.vue/);
});

test("enrichContinueExecHandoff 补 parent 与交接；不重复追加", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-handoff-"));
  const sid = "session-handoff-1";
  const req = "采购合同出现 Not found，修复";
  fs.writeFileSync(
    path.join(dir, "cch-fail.json"),
    JSON.stringify({
      id: "cch-fail",
      status: "failed",
      dsh_session_id: sid,
      requirement: req,
      detail: "同步写入失败：backend/x.db（EPERM）",
      changed_files: ["backend/app/main.py", "backend/x.db"],
      synced_files: [],
      updated_at: "2026-10-16T03:00:00.000Z",
    }),
    "utf8",
  );

  const exec = {
    name: "zr_cchat_continue",
    arguments: { message: req, workspace: "D:\\proj" },
  };
  const once = enrichContinueExecHandoff(exec, sid, { jobsDir: dir });
  assert.equal(once.changed, true);
  assert.equal(exec.arguments.parent_job_id, "cch-fail");
  assert.match(String(exec.arguments.message), new RegExp(HANDOFF_MARKER));
  assert.match(String(exec.arguments.message), /backend\/app\/main\.py/);

  const twice = enrichContinueExecHandoff(exec, sid, { jobsDir: dir });
  assert.equal(twice.notes.includes("handoff_exists"), true);
  assert.equal(
    String(exec.arguments.message).split(HANDOFF_MARKER).length - 1,
    1,
  );
});

test("冻结的 continue 参数也能写入交接", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-handoff-fr-"));
  const sid = "session-handoff-frozen";
  const req = "删除员工工时报表";
  fs.writeFileSync(
    path.join(dir, "cch-net.json"),
    JSON.stringify({
      id: "cch-net",
      status: "failed",
      dsh_session_id: sid,
      requirement: req,
      detail: "Network request failed（retryable=true）",
      synced_files: [],
      updated_at: "2026-10-19T00:05:09.000Z",
    }),
    "utf8",
  );
  const exec = {
    name: "zr_cchat_continue",
    arguments: Object.freeze({ message: req, workspace: "D:\\proj" }),
  };
  assert.equal(Object.isFrozen(exec.arguments), true);
  const once = enrichContinueExecHandoff(exec, sid, { jobsDir: dir });
  assert.equal(once.changed, true);
  assert.equal(Object.isFrozen(exec.arguments), false);
  assert.equal(exec.arguments.parent_job_id, "cch-net");
  assert.match(String(exec.arguments.message), /Network|retryable|继续/);
  assert.equal(writableExecArguments(exec), exec.arguments);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Network 失败无改动清单仍生成交接并指引 continue", () => {
  const text = buildFailedParentHandoff({
    id: "cch-20261016-103549-4d38",
    status: "failed",
    requirement: "修采购计划",
    detail: "Network request failed（retryable=true）",
    changed_files: [],
    synced_files: [],
  });
  assert.match(text, new RegExp(HANDOFF_MARKER));
  assert.match(text, /parent_job_id=cch-20261016-103549-4d38/);
  assert.match(text, /Network|出网|continue/i);
  assert.doesNotMatch(text, /EPERM|migrate/);
});

test("显式父任务为更早成功单、最近同句失败 → 改挂失败单", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-handoff2-"));
  const sid = "session-handoff-2";
  const req = "采购合同 Not found 修复";
  fs.writeFileSync(
    path.join(dir, "cch-ok.json"),
    JSON.stringify({
      id: "cch-ok",
      status: "succeeded",
      dsh_session_id: sid,
      requirement: "新增订单与合同",
      synced_files: ["a.py"],
      updated_at: "2026-10-16T01:00:00.000Z",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "cch-fail.json"),
    JSON.stringify({
      id: "cch-fail",
      status: "failed",
      dsh_session_id: sid,
      requirement: req,
      detail: "同步写入失败：backend/x.db（EPERM）",
      changed_files: ["backend/app/main.py"],
      synced_files: [],
      updated_at: "2026-10-16T03:00:00.000Z",
    }),
    "utf8",
  );
  const parent = resolveContinueParentJob(
    { parent_job_id: "cch-ok", message: req },
    sid,
    { jobsDir: dir },
  );
  assert.equal(parent && parent.id, "cch-fail");
});
