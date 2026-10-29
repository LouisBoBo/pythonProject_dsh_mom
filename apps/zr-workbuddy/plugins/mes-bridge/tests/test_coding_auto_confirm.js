import assert from "node:assert/strict";
import test from "node:test";

import {
  execCallId,
  findWaitingCodingPending,
  shouldHostAutoStartClearCoding,
} from "../lib/coding-auto-confirm.js";

test("execCallId 读 DSH 工具调用 id", () => {
  assert.equal(execCallId({ callId: "call_00_abc" }), "call_00_abc");
  assert.equal(execCallId({ call: { id: "call_1" } }), "call_1");
  assert.equal(execCallId({}), "");
});

test("只认新鲜 waiting 确认单，不误开工旧单", () => {
  const now = 1_000_000;
  const map = {
    old: {
      id: "pcf-old",
      status: "waiting",
      session_id: "sid-a",
      call_id: "call-old",
      requirement: "删除停机报表",
      created_at: now - 10 * 60 * 1000,
    },
    live: {
      id: "pcf-live",
      status: "waiting",
      session_id: "sid-a",
      call_id: "call-live",
      requirement: "删除停机报表",
      created_at: now - 1000,
    },
    other: {
      id: "pcf-other",
      status: "waiting",
      session_id: "sid-b",
      call_id: "call-b",
      requirement: "别的需求",
      created_at: now - 1000,
    },
    started: {
      id: "pcf-started",
      status: "started",
      session_id: "sid-a",
      call_id: "call-x",
      requirement: "删除停机报表",
      created_at: now - 500,
    },
  };
  assert.equal(
    findWaitingCodingPending({
      callId: "call-live",
      sessionId: "sid-a",
      requirement: "删除停机报表",
      map,
      now,
    }).id,
    "pcf-live",
  );
  assert.equal(
    findWaitingCodingPending({
      sessionId: "sid-a",
      requirement: "删除停机报表",
      map,
      now,
    }).id,
    "pcf-live",
  );
  assert.equal(
    findWaitingCodingPending({
      callId: "call-old",
      map,
      now,
    }),
    null,
  );
  assert.equal(
    findWaitingCodingPending({
      sessionId: "sid-b",
      requirement: "删除停机报表",
      map,
      now,
    }),
    null,
  );
});

test("新增员工工时报表：宿主应直接开工，不先问卷", () => {
  const gate = shouldHostAutoStartClearCoding({
    utterance: "新增员工工时报表",
    workspace: "D:\\proj\\app",
    integrated: false,
  });
  assert.equal(gate.ok, true);
  assert.equal(
    shouldHostAutoStartClearCoding({
      utterance: "新增员工工时报表",
      workspace: "",
    }).reason,
    "no-workspace",
  );
  assert.equal(
    shouldHostAutoStartClearCoding({
      utterance: "新增员工工时报表",
      workspace: "D:\\proj\\app",
      integrated: true,
    }).reason,
    "integrated",
  );
  assert.equal(
    shouldHostAutoStartClearCoding({
      utterance: "产量多少",
      workspace: "D:\\proj\\app",
    }).reason,
    "not-coding",
  );
  const processReview = [
    "帮我开发一个工艺评审系统，需求如下：",
    "阻抗控制：",
    "叠构图：",
  ].join("\n");
  assert.equal(
    shouldHostAutoStartClearCoding({
      utterance: processReview,
      workspace: "C:\\Users\\Yu\\Desktop\\gyps",
    }).ok,
    true,
  );
  assert.equal(
    shouldHostAutoStartClearCoding({
      utterance: "新增员工工时报表",
      workspace: "D:\\proj\\app",
      latestJob: {
        id: "cch-live",
        status: "running",
        requirement: "新增员工工时报表",
      },
    }).reason,
    "already-running",
  );
});
