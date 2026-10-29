import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  cloneToolResult,
  enrichCodingToolResultWithChatBody,
  formatChatBodyConclusion,
  isThinChatBody,
  preferredConclusionAssistantText,
} from "../lib/coding-chat-body.js";

test("preferredConclusionAssistantText 取最后一段说明方案", () => {
  const asst =
    "过程摸底…\n\n## 说明方案\n**做了什么**\n- a.js 删菜单\n\n**怎么验收**\n- 硬刷新看侧栏\n";
  const body = preferredConclusionAssistantText(asst);
  assert.match(body, /## 说明方案/);
  assert.match(body, /做了什么/);
  assert.match(body, /怎么验收/);
  assert.doesNotMatch(body, /过程摸底/);
});

test("isThinChatBody 认同步条数与 finish 超时", () => {
  assert.equal(isThinChatBody(""), true);
  assert.equal(isThinChatBody("已同步 13 个文件"), true);
  assert.equal(
    isThinChatBody("等待写码结束超时（job `cch-x`）。请再调一次 zr_cchat_finish(job_id)。"),
    true,
  );
  assert.equal(
    isThinChatBody("## 本轮结论\n\n已同步 13 个文件；已软重启 Vite。\n\n---\n**状态：** succeeded\n"),
    true,
  );
  assert.equal(
    isThinChatBody(
      "## 本轮结论\n\n## 说明方案\n\n**做了什么**\n- 删 Contracts.vue\n\n**怎么验收**\n- 刷新侧栏\n",
    ),
    false,
  );
});

test("formatChatBodyConclusion 把说明方案放进正文外壳", () => {
  const md = formatChatBodyConclusion({
    id: "cch-demo",
    status: "succeeded",
    requirement: "删除采购合同",
    detail: "已同步 7 个文件",
    assistant_text:
      "摸底…\n\n## 说明方案\n\n**做了什么**\n- 删除 Contracts.vue\n\n**怎么验收**\n- 侧栏无采购合同\n",
    synced_files: ["frontend/src/views/Contracts.vue"],
  });
  assert.match(md, /^## 本轮结论/m);
  assert.match(md, /## 说明方案/);
  assert.match(md, /做了什么/);
  assert.match(md, /怎么验收/);
  assert.match(md, /Contracts\.vue/);
  assert.match(md, /\*\*状态：\*\* succeeded/);
});

test("enrichCodingToolResultWithChatBody：终态未交付时补 chat_body", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cchat-body-"));
  const jid = "cch-20261016-test-body01";
  const job = {
    id: jid,
    status: "succeeded",
    conclusion_delivered: false,
    detail: "已同步 13 个文件；已软重启 Vite :5173。",
    requirement: "加库存",
    assistant_text:
      "过程…\n\n## 说明方案\n\n### 本次新增（库存）\n\n1. 表 stock_ledger\n\n### 验收路径\n\n1. 打开库存管理\n",
    synced_files: ["frontend/src/views/Inventory.vue", "backend/app/api/inventory.py"],
  };
  fs.writeFileSync(path.join(dir, jid + ".json"), JSON.stringify(job, null, 2), "utf8");

  const result = {
    value: {
      ok: true,
      done: true,
      job_id: jid,
      status: "succeeded",
      detail: job.detail,
      chat_body: "已同步 13 个文件",
      silent: true,
    },
    content: [{ type: "text", text: "已同步 13 个文件" }],
  };

  const out = enrichCodingToolResultWithChatBody(result, { jobsDir: dir });
  assert.equal(out.changed, true);
  assert.match(out.result.value.chat_body, /## 本轮结论/);
  assert.match(out.result.value.chat_body, /## 说明方案/);
  assert.match(out.result.value.chat_body, /stock_ledger|验收路径/);
  assert.equal(out.result.value.silent, undefined);
  assert.match(out.result.content[0].text, /结论已在对话过程中展示/);
  assert.doesNotMatch(out.result.content[0].text, /## 说明方案/);
  assert.doesNotMatch(out.result.content[0].text, /【请把下面这段用/);
  assert.equal(out.result.value.cursor_chat_ui.job_id, jid);
  assert.equal(out.result.value.cursor_chat_ui.requirement, "加库存");
  assert.equal(out.result.value.cursor_chat_ui.status, "succeeded");

  const saved = JSON.parse(fs.readFileSync(path.join(dir, jid + ".json"), "utf8"));
  assert.equal(saved.conclusion_delivered, true);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("enrich：冻结工具返回值也能补 chat_body", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cchat-body-fr-"));
  const jid = "cch-20261018-freeze-body";
  const job = {
    id: jid,
    status: "succeeded",
    conclusion_delivered: false,
    detail: "已同步 5 个文件",
    requirement: "添加员工工时报表",
    transcript: [
      {
        kind: "assistant",
        text: "## 说明方案\n\n**做了什么**\n- 新增员工工时报表页\n\n**怎么验收**\n- 打开报表中心\n",
      },
    ],
    synced_files: ["frontend/src/config/reportFeatures.js"],
  };
  fs.writeFileSync(path.join(dir, jid + ".json"), JSON.stringify(job, null, 2), "utf8");
  const result = Object.freeze({
    value: Object.freeze({
      ok: true,
      done: true,
      job_id: jid,
      status: "succeeded",
      detail: job.detail,
      chat_body: "已同步 5 个文件",
    }),
    content: Object.freeze([{ type: "text", text: "已同步 5 个文件" }]),
  });
  const out = enrichCodingToolResultWithChatBody(result, { jobsDir: dir });
  assert.equal(out.changed, true);
  assert.match(out.result.value.chat_body, /## 本轮结论/);
  assert.match(out.result.value.chat_body, /员工工时报表/);
  assert.equal(result.value.chat_body, "已同步 5 个文件");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("cloneToolResult 得到可写副本", () => {
  const frozen = Object.freeze({ chat_body: "", status: "running" });
  const copy = cloneToolResult(frozen);
  copy.chat_body = "ok";
  assert.equal(copy.chat_body, "ok");
  assert.equal(frozen.chat_body, "");
});

test("cloneToolResult 保持 source.kind 引用（禁止 structuredClone 拆掉）", () => {
  const source = { kind: "plugin:dsh-mes-bridge", form: "notice" };
  const frozen = Object.freeze({
    chat_body: "",
    status: "succeeded",
    source,
  });
  const copy = cloneToolResult(frozen);
  assert.equal(copy.source, source);
  assert.equal(copy.source.kind, "plugin:dsh-mes-bridge");
  copy.chat_body = "## 本轮结论";
  assert.equal(frozen.chat_body, "");
});

test("enrich：已有完整正文不覆盖", () => {
  const rich =
    "## 本轮结论\n\n## 说明方案\n\n**做了什么**\n- x\n\n**怎么验收**\n- y\n";
  const result = {
    value: {
      ok: true,
      done: true,
      job_id: "cch-skip",
      status: "succeeded",
      chat_body: rich,
    },
  };
  const out = enrichCodingToolResultWithChatBody(result, {
    jobsDir: path.join(os.tmpdir(), "wb-missing-jobs"),
  });
  assert.equal(out.result.value.chat_body, rich);
  assert.equal(out.result.value.cursor_chat_ui.job_id, "cch-skip");
  assert.equal(out.result.value.cursor_chat_ui.status, "succeeded");
});
