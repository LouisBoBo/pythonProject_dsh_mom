import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  duplicateCodingConfirmBlock,
  findLatestSucceededChatJob,
  findLatestTerminalChatJob,
  formatCodingCloseoutBanner,
  formatFriendlyCodingCloseout,
  isHollowCodingSuccess,
  isSameCodingRequirement,
  looksLikeAgentEchoNotUserFollowUp,
  looksLikeNewCodingFollowUp,
  normalizeCodingRequirement,
  readChatJob,
} from "../lib/coding-dup-guard.js";

test("同一原话判定与新修改点放行", () => {
  assert.equal(normalizeCodingRequirement("  新增采购计划功能  "), "新增采购计划功能");
  assert.equal(isSameCodingRequirement("新增采购计划功能", "新增采购计划功能"), true);
  assert.equal(isSameCodingRequirement("新增采购计划功能", "删菜单"), false);
  assert.equal(looksLikeNewCodingFollowUp("新增采购计划功能"), false);
  assert.equal(looksLikeNewCodingFollowUp("按钮颜色改成蓝色"), true);
  assert.equal(looksLikeNewCodingFollowUp("刚才没生效再改一下"), true);
  assert.equal(looksLikeAgentEchoNotUserFollowUp("已完成"), true);
  assert.equal(looksLikeAgentEchoNotUserFollowUp("列表筛选没生效"), false);
});

test("成功同句拦截；失败同句放行（确认卡仍 HITL，客户端只补说明）", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cch-"));
  const sid = "session-dup-test-1";
  const req = "新建采购计划时，周期起/周期止已经选了，仍弹出提示。请按图自查并修复。";

  fs.writeFileSync(
    path.join(dir, "cch-ok.json"),
    JSON.stringify({
      id: "cch-ok",
      status: "succeeded",
      dsh_session_id: sid,
      requirement: req,
      detail: "已同步 3 个文件",
      assistant_text: "## 说明方案\nok",
      synced_files: ["a.vue"],
      updated_at: "2026-10-16T00:30:25.499Z",
    }),
    "utf8",
  );
  assert.equal(findLatestSucceededChatJob(sid, { jobsDir: dir }).id, "cch-ok");
  assert.match(
    String(
      duplicateCodingConfirmBlock({
        toolName: "zr_cchat_continue",
        message: req,
        sessionId: sid,
        jobsDir: dir,
      }),
    ),
    /已经做完了|转告用户/,
  );

  // 失败任务更新更晚 → 同句续修放行（不拦）
  fs.writeFileSync(
    path.join(dir, "cch-fail.json"),
    JSON.stringify({
      id: "cch-fail",
      status: "failed",
      dsh_session_id: sid,
      requirement: req,
      detail: "同步写入失败：backend/pcb_procurement.db（EPERM）",
      updated_at: "2026-10-16T01:00:00.000Z",
    }),
    "utf8",
  );
  assert.equal(findLatestTerminalChatJob(sid, { jobsDir: dir }).id, "cch-fail");
  assert.equal(
    duplicateCodingConfirmBlock({
      toolName: "zr_cchat_continue",
      message: req,
      sessionId: sid,
      jobsDir: dir,
    }),
    null,
  );
  assert.match(
    String(
      duplicateCodingConfirmBlock({
        toolName: "zr_cchat_continue",
        message: "已完成",
        sessionId: sid,
        jobsDir: dir,
      }),
    ),
    /转告用户|没有完成|EPERM|占用/,
  );
});

test("*.db EPERM 失败要说明合理且给规避做法", () => {
  const text = formatFriendlyCodingCloseout({
    id: "cch-db",
    status: "failed",
    requirement: "修采购计划 500",
    detail:
      "同步写入失败：backend/pcb_procurement.db（Error: EPERM: operation not permitted, rename）",
  });
  assert.match(text, /没有完成/);
  assert.match(text, /EPERM|占用/);
  assert.match(text, /migrate|源码|重启/);
});

test("URL 附图失败要说明是传图方式而非业务需求错", () => {
  const text = formatFriendlyCodingCloseout({
    id: "cch-img",
    status: "failed",
    requirement: "采购合同出现 Not found, 修复",
    detail: "URL images are only supported for cloud SDK agents (retryable=false)",
  });
  assert.match(text, /没有完成/);
  assert.match(text, /本地 Agent|传图|URL/);
  assert.match(text, /不是你的业务需求/);
});

test("Network request failed 要说明是出网抖动而非业务需求错", () => {
  const text = formatFriendlyCodingCloseout({
    id: "cch-20261016-103549-4d38",
    status: "failed",
    requirement: "修采购计划周期校验",
    detail: "Network request failed（retryable=true）",
  });
  assert.match(text, /没有完成/);
  assert.match(text, /网络|出网|抖动/);
  assert.match(text, /不是你的业务需求/);
  assert.match(text, /续改|再试|再跑/);
  assert.doesNotMatch(text, /EPERM|传图|URL images|migrate/);
});

test("空同步假成功：closeout 不说做完；同句放行 continue、拦 begin；真成功仍拦", () => {
  assert.equal(
    isHollowCodingSuccess({
      status: "succeeded",
      synced_files: [],
    }),
    true,
  );
  assert.equal(
    isHollowCodingSuccess({
      status: "succeeded",
      synced_files: ["backend/x.db"],
    }),
    true,
  );
  assert.equal(
    isHollowCodingSuccess({
      status: "succeeded",
      synced_files: ["backend/app/main.py"],
    }),
    false,
  );

  const hollowText = formatFriendlyCodingCloseout({
    id: "cch-hollow",
    status: "succeeded",
    requirement: "修采购计划",
    detail: "ok but nothing synced",
    synced_files: [],
  });
  assert.match(hollowText, /未检测到源码落盘|不能当成/);
  assert.doesNotMatch(hollowText, /已经做完了/);

  const okText = formatFriendlyCodingCloseout({
    id: "cch-ok-sync",
    status: "succeeded",
    requirement: "修采购计划",
    synced_files: ["a.py"],
  });
  assert.match(okText, /已经做完了/);
  assert.match(okText, /自检|硬刷新|验收|打开/);
  assert.match(okText, /- a\.py/);
  assert.doesNotMatch(okText, /未检测到源码落盘/);

  const thinPluginDetail = formatFriendlyCodingCloseout({
    id: "cch-thin",
    status: "succeeded",
    requirement: "修筛选",
    detail: "已同步 13 个文件",
    synced_files: ["frontend/src/a.vue", "backend/app/x.py"],
  });
  assert.match(thinPluginDetail, /已经做完了/);
  assert.match(thinPluginDetail, /frontend\/src\/a\.vue/);
  assert.doesNotMatch(thinPluginDetail, /^已同步 13 个文件$/m);

  const banner = formatCodingCloseoutBanner({
    id: "cch-ok-sync",
    status: "succeeded",
    requirement: "修采购计划",
    synced_files: ["frontend/src/a.vue"],
    assistant_text: "加了筛选按钮。",
  });
  assert.equal(banner.kind, "ok");
  assert.equal(banner.title, "本轮结论");
  assert.match(banner.body, /已经做完了|加了筛选/);
  assert.match(banner.body, /自检|硬刷新|验收/);
  assert.doesNotMatch(banner.body, /请把下面这段用自然口语转告/);

  const beText = formatFriendlyCodingCloseout({
    id: "cch-be",
    status: "succeeded",
    requirement: "修接口",
    synced_files: ["backend/app/api.py"],
  });
  assert.match(beText, /重启.*后端/);
  assert.match(beText, /不要.*代跑测试|不.*起开发服务器/);

  const feText = formatFriendlyCodingCloseout({
    id: "cch-fe",
    status: "succeeded",
    requirement: "改按钮",
    synced_files: ["frontend/src/Btn.vue"],
  });
  assert.match(feText, /硬刷新|前端/);


  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cch-hollow-"));
  const sid = "session-hollow-q01";
  const req = "修采购计划周期校验";
  fs.writeFileSync(
    path.join(dir, "cch-hollow.json"),
    JSON.stringify({
      id: "cch-hollow",
      status: "succeeded",
      dsh_session_id: sid,
      requirement: req,
      synced_files: [],
      updated_at: "2026-10-16T06:00:00.000Z",
    }),
    "utf8",
  );
  assert.match(
    String(
      duplicateCodingConfirmBlock({
        toolName: "zr_cchat_begin",
        message: req,
        sessionId: sid,
        jobsDir: dir,
      }),
    ),
    /continue|parent_job_id|落盘/,
  );
  assert.equal(
    duplicateCodingConfirmBlock({
      toolName: "zr_cchat_continue",
      message: req,
      sessionId: sid,
      jobsDir: dir,
    }),
    null,
  );
});

test("Network 失败同句：拦 begin、放行 continue；成功同句仍拦", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cch-net-"));
  const sid = "session-net-p12";
  const req = "修采购计划周期校验";
  fs.writeFileSync(
    path.join(dir, "cch-net.json"),
    JSON.stringify({
      id: "cch-net",
      status: "failed",
      dsh_session_id: sid,
      requirement: req,
      detail: "Network request failed（retryable=true）",
      updated_at: "2026-10-16T04:00:00.000Z",
    }),
    "utf8",
  );
  assert.match(
    String(
      duplicateCodingConfirmBlock({
        toolName: "zr_cchat_begin",
        message: req,
        sessionId: sid,
        jobsDir: dir,
      }),
    ),
    /continue|parent_job_id|网络/,
  );
  assert.equal(
    duplicateCodingConfirmBlock({
      toolName: "zr_cchat_continue",
      message: req,
      sessionId: sid,
      jobsDir: dir,
    }),
    null,
  );

  fs.writeFileSync(
    path.join(dir, "cch-ok2.json"),
    JSON.stringify({
      id: "cch-ok2",
      status: "succeeded",
      dsh_session_id: sid,
      requirement: req,
      synced_files: ["a.py"],
      updated_at: "2026-10-16T05:00:00.000Z",
    }),
    "utf8",
  );
  assert.match(
    String(
      duplicateCodingConfirmBlock({
        toolName: "zr_cchat_continue",
        message: req,
        sessionId: sid,
        jobsDir: dir,
      }),
    ),
    /已经做完了|转告用户|终态/,
  );
});

test("进行中的任务不向用户回传拦截文案", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cch-open-"));
  const sid = "session-open-1";
  fs.writeFileSync(
    path.join(dir, "cch-old.json"),
    JSON.stringify({
      id: "cch-old",
      status: "succeeded",
      dsh_session_id: sid,
      requirement: "新增采购报表功能",
      synced_files: ["a.vue"],
      updated_at: "2026-10-16T13:04:59.000Z",
    }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "cch-run.json"),
    JSON.stringify({
      id: "cch-run",
      status: "running",
      dsh_session_id: sid,
      requirement: "新增采购报表 报 Not Found",
      parent_job_id: "cch-old",
      updated_at: "2026-10-16T13:08:00.000Z",
    }),
    "utf8",
  );
  for (const toolName of ["zr_cchat_continue", "zr_cchat_finish", "zr_cchat_begin", "zr_cchat_wait"]) {
    assert.equal(
      duplicateCodingConfirmBlock({
        toolName,
        message: "新增采购报表功能",
        sessionId: sid,
        jobsDir: dir,
      }),
      null,
    );
  }
});

test("readChatJob 拒绝路径穿越与非任务 id", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cch-"));
  fs.writeFileSync(
    path.join(dir, "cch-ok.json"),
    JSON.stringify({ id: "cch-ok", status: "succeeded" }),
    "utf8",
  );
  assert.equal(readChatJob("cch-ok", { jobsDir: dir })?.id, "cch-ok");
  assert.equal(readChatJob("../cch-ok", { jobsDir: dir }), null);
  assert.equal(readChatJob("cch-ok/../cch-ok", { jobsDir: dir }), null);
  assert.equal(readChatJob("not-a-job", { jobsDir: dir }), null);
});
