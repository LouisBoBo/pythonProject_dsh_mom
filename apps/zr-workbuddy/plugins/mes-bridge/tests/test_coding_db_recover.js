import assert from "node:assert/strict";
import test from "node:test";

import {
  applyRecoveredToolResult,
  shouldRecoverDbEperm,
} from "../lib/coding-db-recover.js";
import { formatFriendlyCodingCloseout, userFacingCodingConclusion } from "../lib/coding-closeout.js";

test("只有 *.db EPERM 失败才回收，已经回收过的不再重复", () => {
  assert.equal(
    shouldRecoverDbEperm({
      status: "failed",
      detail: "同步写入失败：backend/erp.db（EPERM）",
    }),
    true,
  );
  assert.equal(
    shouldRecoverDbEperm({
      status: "failed",
      detail: "同步写入失败：backend/erp.db（EPERM）",
      recovered_files: ["a.js"],
    }),
    false,
  );
  assert.equal(
    shouldRecoverDbEperm({
      status: "succeeded",
      detail: "已同步 1 个文件",
    }),
    false,
  );
});

test("回收后的工具返回不能再是 Error，也不准带请转告指令", () => {
  const out = applyRecoveredToolResult(
    {
      isError: true,
      error: { message: "【请把下面这段用自然口语转告用户" },
      content: [{ type: "text", text: "【请把下面这段" }],
      value: { ok: false, status: "failed", job_id: "cch-x" },
    },
    { ok: true, changed_files: ["frontend/src/config/reportFeatures.js"] },
  );
  assert.equal(out.isError, false);
  assert.equal(out.value.ok, true);
  assert.equal(out.value.recovered, true);
  assert.match(out.content[0].text, /写回工程|已落盘/);
  assert.match(out.value.chat_body, /reportFeatures\.js/);
  assert.doesNotMatch(out.content[0].text, /【请把下面这段用/);
});

test("已回收源码时失败结论要说落盘了，不是整单作废", () => {
  const text = formatFriendlyCodingCloseout({
    id: "cch-demo",
    status: "failed",
    requirement: "新增员工工时报表",
    detail: "同步写入失败：backend/erp.db（EPERM）",
    recovered_files: [
      "frontend/src/config/reportFeatures.js",
      "backend/app/routers/reports.py",
    ],
  });
  assert.match(text, /写回工程|已落盘/);
  assert.match(text, /reportFeatures\.js/);
  assert.match(text, /不是整单作废|重启后端/);
});

test("完整结论从账本取出后交给流式正文，不裁成两三句", () => {
  const body = userFacingCodingConclusion({
    status: "succeeded",
    requirement: "新增员工工时报表",
    detail: "已同步 7 个文件",
    assistant_text:
      "## 说明方案\n\n**做了什么**\n- 新增员工工时报表页和接口\n\n**怎么验收**\n- 打开报表中心 → 员工工时报表\n",
    synced_files: ["frontend/src/config/reportFeatures.js", "backend/app/routers/reports.py"],
  });
  assert.match(body, /员工工时报表/);
  assert.match(body, /做了什么|怎么验收|reportFeatures/);
  assert.doesNotMatch(body, /两三句口语/);
  assert.doesNotMatch(body, /【请把下面这段用/);
});
