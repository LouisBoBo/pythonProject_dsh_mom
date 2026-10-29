import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ACCEPTANCE_MARKER,
  enrichMessageWithAcceptanceHints,
  extractAcceptanceHints,
  formatAcceptanceBlock,
} from "../lib/coding-acceptance.js";
import { buildSucceededParentHandoff, enrichContinueExecHandoff } from "../lib/coding-continue-handoff.js";
import { codingMessageWithCachedDirectory } from "../lib/triage-pack.js";

test("抽出验收句；纯改需求不抽", () => {
  assert.deepEqual(
    extractAcceptanceHints("把按钮改成蓝色。打开采购计划页点保存，确认不再弹错。"),
    ["打开采购计划页点保存，确认不再弹错"],
  );
  assert.deepEqual(extractAcceptanceHints("把按钮改成蓝色"), []);
  assert.deepEqual(extractAcceptanceHints(""), []);
});

test("enrich 幂等；抽不出不改", () => {
  const plain = enrichMessageWithAcceptanceHints("只改文案");
  assert.equal(plain.changed, false);
  const once = enrichMessageWithAcceptanceHints(
    "修筛选。打开列表页点查询，应该能看到结果。",
  );
  assert.equal(once.changed, true);
  assert.match(once.text, new RegExp(ACCEPTANCE_MARKER));
  assert.match(once.text, /打开列表页/);
  const twice = enrichMessageWithAcceptanceHints(once.text);
  assert.equal(twice.changed, false);
  assert.equal(twice.text, once.text);
});

test("成功交接带上父任务 requirement 里的验收句", () => {
  const text = buildSucceededParentHandoff({
    id: "cch-ok",
    status: "succeeded",
    requirement: "加筛选。打开订单页点查询验收。",
    synced_files: ["frontend/src/OrderList.vue"],
  });
  assert.match(text, new RegExp(ACCEPTANCE_MARKER));
  assert.match(text, /打开订单页/);
  assert.match(text, /OrderList\.vue/);
});

test("写码 message 注入画像后仍可钉验收句", () => {
  const msg = codingMessageWithCachedDirectory({
    engineDir: "",
    workspace: "",
    message: "修表头。刷新页面后表头应对齐。",
    profile: {
      stack: { frontend: ["Vue"] },
      layout: { view_dirs: ["src/views"] },
      directory: { roots: [{ path: "src", role: "源码" }] },
    },
  });
  assert.match(msg, /【工作区目录画像】/);
  assert.match(msg, new RegExp(ACCEPTANCE_MARKER));
  assert.match(msg, /刷新页面/);
});

test("message 已有画像时仍钉验收句（禁止提前 return 丢掉）", () => {
  const withPortrait =
    "修筛选。打开列表页点查询应有结果。\n\n【工作区目录画像】\n- 栈：Vue\n";
  const msg = codingMessageWithCachedDirectory({
    engineDir: "",
    workspace: "",
    message: withPortrait,
    profile: null,
  });
  assert.match(msg, /【工作区目录画像】/);
  assert.match(msg, new RegExp(ACCEPTANCE_MARKER));
  assert.match(msg, /打开列表页/);
  // 不应重复灌第二份画像
  assert.equal(msg.split("【工作区目录画像】").length - 1, 1);
});

test("continue enrich 含验收；无验收句不误伤", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-acc-"));
  const sid = "session-acc-1";
  fs.writeFileSync(
    path.join(dir, "cch-ok.json"),
    JSON.stringify({
      id: "cch-ok",
      status: "succeeded",
      dsh_session_id: sid,
      requirement: "改按钮颜色",
      synced_files: ["a.vue"],
      updated_at: "2026-10-16T08:00:00.000Z",
    }),
    "utf8",
  );
  const exec = {
    name: "zr_cchat_continue",
    arguments: {
      message: "再改一下字号。打开设置页看效果。",
      parent_job_id: "cch-ok",
    },
  };
  const r = enrichContinueExecHandoff(exec, sid, { jobsDir: dir });
  assert.equal(r.changed, true);
  assert.match(String(exec.arguments.message), /【系统续改交接】/);
  assert.match(String(exec.arguments.message), new RegExp(ACCEPTANCE_MARKER));
  assert.match(String(exec.arguments.message), /打开设置页/);

  const exec2 = {
    name: "zr_cchat_continue",
    arguments: { message: "字号再大一点", parent_job_id: "cch-ok" },
  };
  enrichContinueExecHandoff(exec2, sid, { jobsDir: dir });
  // 父任务 requirement 无验收句、当前句也无 → 不应凭空造验收块
  assert.equal(
    String(exec2.arguments.message).includes(ACCEPTANCE_MARKER),
    false,
  );
});

test("formatAcceptanceBlock 空列表为空串", () => {
  assert.equal(formatAcceptanceBlock([]), "");
  assert.equal(formatAcceptanceBlock(null), "");
});
