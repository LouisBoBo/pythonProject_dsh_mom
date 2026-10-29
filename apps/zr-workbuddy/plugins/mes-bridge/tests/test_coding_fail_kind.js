import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyCodingFailKind,
  classifySyncedTouch,
  codeFilesOnlyForSync,
  codingFailContinueCopy,
  codingFailProgressCopy,
  formatPostCodingSelfCheck,
  isHollowCodingSuccess,
} from "../lib/coding-fail-kind.js";

test("落盘计数剔 db；空同步假成功判定", () => {
  assert.deepEqual(codeFilesOnlyForSync(["a.py", "x.db"]), ["a.py"]);
  assert.equal(isHollowCodingSuccess({ status: "succeeded", synced_files: [] }), true);
  assert.equal(
    isHollowCodingSuccess({ status: "succeeded", synced_files: ["a.py"] }),
    false,
  );
  assert.equal(isHollowCodingSuccess({ status: "failed", synced_files: [] }), false);
});

test("写完自检：前端刷新 vs 后端重启启发式", () => {
  assert.deepEqual(classifySyncedTouch(["frontend/src/Btn.vue"]), {
    frontend: true,
    backend: false,
    n: 1,
  });
  assert.deepEqual(classifySyncedTouch(["backend/app/main.py"]), {
    frontend: false,
    backend: true,
    n: 1,
  });
  const both = classifySyncedTouch(["frontend/a.vue", "backend/b.py"]);
  assert.equal(both.frontend && both.backend, true);
  assert.match(formatPostCodingSelfCheck(["frontend/a.vue"]), /硬刷新|前端/);
  assert.match(formatPostCodingSelfCheck(["backend/app/main.py"]), /重启.*后端/);
  assert.match(
    formatPostCodingSelfCheck(["frontend/a.vue", "backend/b.py"]),
    /重启.*后端|硬刷新/,
  );
  assert.equal(formatPostCodingSelfCheck([]), "");
});

test("四类失败判定不串类", () => {
  assert.equal(
    classifyCodingFailKind(
      "同步写入失败：backend/pcb_procurement.db（Error: EPERM: operation not permitted, rename）",
    ),
    "db_eperm",
  );
  assert.equal(
    classifyCodingFailKind(
      "URL images are only supported for cloud SDK agents (retryable=false)",
    ),
    "url_images",
  );
  assert.equal(classifyCodingFailKind("Agent abc123 not found"), "agent_missing");
  assert.equal(
    classifyCodingFailKind("Network request failed（retryable=true）"),
    "network",
  );
  assert.equal(classifyCodingFailKind("something else exploded"), "other");
});

test("优先序：db 盖过同串里的 retryable", () => {
  assert.equal(
    classifyCodingFailKind(
      "EPERM operation not permitted on erp.db; also Network request failed retryable=true",
    ),
    "db_eperm",
  );
});

test("进度卡与续改卡文案带分类标签且互不串", () => {
  const kinds = ["network", "db_eperm", "url_images", "agent_missing", "other"];
  for (const k of kinds) {
    const p = codingFailProgressCopy(k, "detail-x");
    const c = codingFailContinueCopy(k, "detail-x");
    assert.ok(p.title && p.body);
    assert.ok(c.title && c.body);
    assert.match(c.body, /确认并用 Cursor 开写|未点确认/);
  }
  assert.match(codingFailProgressCopy("network").title, /网络/);
  assert.doesNotMatch(codingFailProgressCopy("network").title, /数据库|附图|Agent/);
  assert.match(codingFailProgressCopy("db_eperm").title, /数据库|\.db|EPERM/);
  assert.match(codingFailProgressCopy("url_images").title, /附图|URL/);
  assert.match(codingFailProgressCopy("agent_missing").title, /Agent|会话/);
});
