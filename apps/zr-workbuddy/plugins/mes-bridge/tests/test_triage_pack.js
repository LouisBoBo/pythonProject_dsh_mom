import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  clearCodingAskDenyReason,
  clearLaneKind,
  codingMessageWithCachedDirectory,
  collectLaneSignals,
  cwdFromSessions,
  formatCodingPortraitBlock,
  formatDirectoryBlock,
  formatFirstToolLogLine,
  formatHostTriage,
  guessUtteranceFeatureId,
  guessUtteranceLane,
  looksLikeAskQuery,
  looksLikeBusinessRecordOp,
  isDisposableHostUserSource,
  looksLikeExplicitCodeChange,
  stripDshTimeSnapshot,
  redactForLog,
  relatedDirectoryHints,
  resolveClearLane,
  utteranceLaneAdvice,
  profileStoreKey,
  summaryHead,
} from "../lib/triage-pack.js";

const indexSrc = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "index.js"),
  "utf8",
);

test("画像头只留栈信息，不把页面路径送进分诊", () => {
  const head = summaryHead({
    summary_zh: ["布局：dotnet_web", "语言：C#", "前端：未识别", "后端：.NET、ASP.NET Core", "托管：Git", "页面目录：Views/Warehouse"].join(
      "\n",
    ),
  });
  assert.equal(head.includes("页面目录"), false);
  assert.match(head, /布局：dotnet_web/);
  assert.match(head, /后端：\.NET、ASP\.NET Core/);
});

test("无工作区也只做辅助，不要求先追问，不推荐旧写码入口", () => {
  const text = formatHostTriage({
    workspace: "",
    summaryHead: "",
    notes: "",
    enabledIds: ["mes-ask", "code-review", "dev-pipeline", "vision", "code-dev"],
  });
  assert.match(text, /分流表优先/);
  assert.match(text, /mes_ask/);
  assert.match(text, /仅当绿色/);
  assert.equal(text.includes("先追问"), false);
  assert.equal(text.includes("mes_code_dev_begin"), false);
  assert.equal(text.includes("mes_vision_understand"), false);
  assert.match(text, /看看改动/);
  assert.match(text, /保养/);
});

test("工程说明过长会被截断，且标成背景", () => {
  const notes = "甲".repeat(800);
  const text = formatHostTriage({
    workspace: "D:\\demo",
    summaryHead: "布局：unknown\n语言：未识别\n前端：未识别\n后端：未识别\n托管：无",
    notes,
    enabledIds: ["company-knowledge"],
  });
  assert.match(text, /仅背景/);
  assert.ok(text.length < 1400);
  assert.equal(text.includes("甲".repeat(400)), false);
});

function pythonProfileKey(workspace) {
  const code = [
    "import hashlib, os, sys",
    "raw = os.path.normcase(os.path.normpath(sys.argv[1]))",
    "print(hashlib.sha256(raw.encode('utf-8')).hexdigest()[:32])",
  ].join("; ");
  const bins = process.platform === "win32" ? [["py", "-3"], ["python"]] : [["python3"], ["python"]];
  let last = "";
  for (const bin of bins) {
    try {
      return execFileSync(bin[0], [...bin.slice(1), "-c", code, workspace], {
        encoding: "utf8",
        timeout: 8000,
        windowsHide: true,
      }).trim();
    } catch (e) {
      last = String(e && e.message ? e.message : e);
    }
  }
  throw new Error(last || "python missing");
}

test("Windows 路径键与 Python 画像缓存键一致", () => {
  const sample = "D:/Foo/Bar/";
  const key = profileStoreKey(sample);
  assert.equal(key, pythonProfileKey(sample));
  assert.equal(profileStoreKey("D:\\foo\\bar"), key);
  assert.equal(profileStoreKey(""), "");
});

test("分诊与普通写码都带上已扫描的全部目录", () => {
  const children = [];
  for (let i = 0; i < 9; i += 1) {
    children.push({
      path: "src/area" + i,
      name: "area" + i,
      role: "",
      modules: i === 0 ? ["orders"] : [],
    });
  }
  const profile = {
    directory: {
      roots: [{ path: "src", name: "src", role: "源码", children: children }],
      truncated: false,
    },
  };
  const block = formatDirectoryBlock(profile);
  const triage = formatHostTriage({
    workspace: "D:\\demo",
    summaryHead: "布局：frontend_only",
    notes: "",
    enabledIds: ["mes-ask"],
    directoryBlock: block,
  });
  for (let i = 0; i < 9; i += 1) {
    assert.match(triage, new RegExp("area" + i));
  }
  assert.match(triage, /分流表优先/);
  assert.match(triage, /不要复述给用户/);
  assert.match(triage, /orders/);
  assert.match(indexSrc, /attachCodingDirectoryPortrait/);
});

test("写码消息接上已有目录画像，已有则不重复；始终附带勿碰 db 硬规则", () => {
  const profile = {
    directory: {
      roots: [
        {
          path: "src",
          name: "src",
          role: "源码",
          children: [{ path: "src/views", name: "views", role: "页面", modules: ["orders", "shipping"] }],
        },
      ],
    },
  };
  const block = formatDirectoryBlock(profile);
  const once = codingMessageWithCachedDirectory({
    engineDir: "",
    workspace: "",
    message: "把按钮改成蓝色",
    profile,
  });
  assert.match(once, /把按钮改成蓝色/);
  assert.match(once, /【硬规则·勿碰数据库文件】/);
  assert.match(once, /【工作区目录画像】/);
  // 写码短画像：目录要点含 views；modules 不灌进短块（控长度）
  assert.match(once, /src\/views|views/);
  assert.match(once, /禁改（通用）/);
  const twice = codingMessageWithCachedDirectory({
    engineDir: "",
    workspace: "",
    message: once,
    profile,
  });
  assert.equal(twice, once);
  const plain = codingMessageWithCachedDirectory({
    engineDir: "",
    workspace: "",
    message: "把按钮改成蓝色",
    profile: null,
  });
  assert.match(plain, /^把按钮改成蓝色/);
  assert.match(plain, /【硬规则·勿碰数据库文件】/);
  assert.equal(plain.includes("【工作区目录画像】"), false);
  // 分诊用全文目录块仍含 modules
  assert.equal(block.includes("orders"), true);
});

test("写码短画像含栈、前后端根、通用禁改；不焊死 ERP 路径", () => {
  const profile = {
    summary_zh: "布局：frontend_only\nVue + Vite",
    languages: ["TypeScript"],
    stack: { frontend: ["Vue", "Vite"], backend: [] },
    layout: {
      kind: "frontend_only",
      view_dirs: ["src/views"],
      router_files: ["src/router/index.ts"],
      api_dirs: [],
      entry_files: ["src/main.ts"],
    },
    ui: { style_libs: ["Element Plus"], sample_pages: ["src/views/orders/List.vue"] },
    directory: {
      roots: [{ path: "src", role: "源码", children: [{ path: "src/views", role: "页面" }] }],
    },
  };
  const block = formatCodingPortraitBlock(profile);
  assert.match(block, /【工作区目录画像】/);
  assert.match(block, /栈：.*Vue/);
  assert.match(block, /前端\/页面根：src\/views/);
  assert.match(block, /路由：src\/router/);
  assert.match(block, /禁改（通用）/);
  assert.doesNotMatch(block, /warehouse|reportFeatures|某家 ERP/);
  const msg = codingMessageWithCachedDirectory({
    engineDir: "",
    workspace: "/tmp/demo",
    message: "加一个筛选",
    profile,
  });
  assert.match(msg, /栈：/);
  assert.match(msg, /禁改（通用）/);
  // 分诊目录块行为不变
  assert.match(formatDirectoryBlock(profile), /源码/);
});

test("分诊路径跟侧栏快照，点名的会话不借用另一个工程", () => {
  const sessions = {
    list: {
      getSnapshot() {
        return {
          current: "s-current",
          byId: {
            "s-current": { id: "s-current", cwd: "D:\\current" },
            "s-other": { id: "s-other", cwd: "D:\\other" },
          },
        };
      },
    },
  };
  assert.equal(cwdFromSessions(null, sessions), "D:\\current");
  assert.equal(cwdFromSessions({ id: "s-other" }, sessions), "D:\\other");
  assert.equal(cwdFromSessions({ id: "s-missing" }, sessions), "");
  assert.equal(cwdFromSessions({ id: "s-other", cwd: "D:\\on-message" }, sessions), "D:\\on-message");
  assert.match(indexSrc, /cwdFromSessions/);
});

test("本条原话只给辅助车道提示，不覆盖分流表，不推荐旧入口", () => {
  assert.match(guessUtteranceLane("今天保养完成了几台", { integrated: false }), /mes_ask/);
  assert.match(guessUtteranceLane("帮我审码看看改动", { integrated: false }), /mes_code_review_begin/);
  assert.match(guessUtteranceLane("把按钮改成蓝色", { integrated: false }), /zr_cchat_begin|写码|开发改盘/);
  assert.match(guessUtteranceLane("把按钮改成蓝色", { integrated: true }), /mes_dev_pipeline_begin/);
  assert.match(guessUtteranceLane("部署到预发", { integrated: false }), /mes_code_deploy_begin/);
  assert.equal(guessUtteranceLane("你好", { integrated: false }), "");
  const triage = formatHostTriage({
    workspace: "D:\\demo",
    summaryHead: "布局：frontend_only",
    notes: "",
    enabledIds: ["mes-ask", "dev-pipeline"],
    utteranceHint: guessUtteranceLane("库存还剩多少", { integrated: false }),
  });
  assert.match(triage, /本条原话更像/);
  assert.match(triage, /分流表优先|以分流表为准/);
  assert.equal(triage.includes("先追问"), false);
  assert.equal(triage.includes("mes_code_dev_begin"), false);
  assert.equal(triage.includes("mes_vision_understand"), false);
});

test("多信号并行收集，不按写死优先级互斥；冲突才模糊追问", () => {
  assert.equal(looksLikeBusinessRecordOp("增加一条采购订单"), true);
  assert.equal(looksLikeBusinessRecordOp("新建一张入库单"), true);
  assert.equal(looksLikeBusinessRecordOp("录入一笔付款记录"), true);
  assert.equal(looksLikeExplicitCodeChange("改代码把按钮改蓝"), true);
  // 建单 + 查数名词并存 → 信号冲突 → 模糊（不是写死「建单永远压过查数」）
  assert.equal(looksLikeBusinessRecordOp("增加一条工单"), true);
  assert.equal(looksLikeAskQuery("增加一条工单"), true);
  const workOrderSigs = collectLaneSignals("增加一条工单");
  assert.ok(workOrderSigs.some((s) => s.id === "business"));
  assert.ok(workOrderSigs.some((s) => s.id === "ask"));
  assert.equal(resolveClearLane(workOrderSigs), "");
  assert.equal(clearLaneKind("增加一条工单"), "");
  assert.equal(guessUtteranceFeatureId("增加一条工单", { integrated: false }), "");
  assert.match(guessUtteranceLane("增加一条工单", { integrated: false }), /模糊|软信号|灵活/);
  // 明确查数口吻 → 单一 ask
  assert.match(guessUtteranceLane("查一下工单还有多少", { integrated: false }), /mes_ask/);
  assert.equal(clearLaneKind("查一下工单还有多少"), "ask");
  // 强写码 + 弱业务/查数名词：strong 池只剩 coding → 清晰写码（不是砍掉其它检测器）
  assert.equal(looksLikeExplicitCodeChange("创建一个工单管理页面"), true);
  assert.equal(clearLaneKind("创建一个工单管理页面"), "coding");
  const hint = guessUtteranceLane("增加一条采购订单", { integrated: false });
  assert.match(hint, /模糊|软信号|灵活/);
  assert.match(hint, /追问|确认/);
  assert.equal(hint.includes("普通写码"), false);
  assert.equal(guessUtteranceFeatureId("增加一条采购订单", { integrated: false }), "");
  assert.match(guessUtteranceLane("改代码加一个采购订单列表页", { integrated: false }), /写码|zr_cchat/);
  // 同时像建单又像查数的复合句 → 模糊
  assert.equal(clearLaneKind("增加一条工单并查一下库存"), "");
  assert.match(guessUtteranceLane("增加一条工单并查一下库存"), /模糊|软信号|灵活/);
});

test("删除界面意图清晰则立刻写码，仅模糊才底座追问", () => {
  assert.equal(looksLikeExplicitCodeChange("删除对账付款界面"), true);
  assert.equal(clearLaneKind("删除对账付款界面"), "coding");
  assert.equal(looksLikeExplicitCodeChange("删除员工工时列表"), true);
  assert.equal(clearLaneKind("删除员工工时列表"), "coding");
  assert.equal(looksLikeExplicitCodeChange("添加员工工时报表"), true);
  assert.equal(clearLaneKind("添加员工工时报表"), "coding");
  assert.equal(looksLikeExplicitCodeChange("新增员工工时报表"), true);
  assert.equal(clearLaneKind("新增员工工时报表"), "coding");
  const buildApp =
    "帮我开发一个工艺评审系统，需求如下：\n阻抗控制：\n叠构图：\n评审要点：";
  assert.equal(looksLikeExplicitCodeChange(buildApp), true);
  assert.equal(clearLaneKind(buildApp), "coding");
  assert.equal(
    collectLaneSignals(buildApp).some((s) => s.id === "pcb"),
    false,
  );
  assert.match(guessUtteranceLane(buildApp, { integrated: false }), /zr_cchat_begin/);
  assert.match(
    clearCodingAskDenyReason("ask_user_question", "添加员工工时报表"),
    /zr_cchat_begin/,
  );
  assert.match(
    clearCodingAskDenyReason("ask_user_question", "新增员工工时报表"),
    /zr_cchat_begin/,
  );
  assert.equal(clearCodingAskDenyReason("ask_user_question", "增加一条采购订单"), "");
  assert.equal(clearCodingAskDenyReason("zr_cchat_begin", "添加员工工时报表"), "");
  assert.equal(clearLaneKind("删除这条列表记录"), "");
  const timed = [
    "Time sampled while preparing turn 1, step 1: 2026-10-18T21:16:17+08:00[Asia/Shanghai]",
    "Browser time zone for this request: Asia/Shanghai. Interpret otherwise-unqualified times in this zone.",
    "Elapsed since the preceding model-visible message: unavailable.",
    "",
    "删除员工工时列表",
  ].join("\n");
  assert.equal(stripDshTimeSnapshot(timed), "删除员工工时列表");
  assert.match(guessUtteranceLane(timed, { integrated: false }), /zr_cchat_begin/);
  assert.equal(isDisposableHostUserSource({ kind: "time-context", form: "snapshot" }), true);
  assert.equal(isDisposableHostUserSource({ kind: "tmux-context", form: "snapshot" }), true);
  assert.equal(isDisposableHostUserSource({ kind: "composer", form: "prompt" }), false);
  assert.equal(
    isDisposableHostUserSource({ kind: "plugin", plugin: "dsh-knowledge", form: "recall" }),
    true,
  );
  assert.equal(
    isDisposableHostUserSource({ kind: "plugin:dsh-knowledge", form: "recall" }),
    true,
  );
  assert.equal(clearLaneKind("帮我审码"), "review");
  assert.equal(clearLaneKind("增加一条采购订单"), "");
  const hint = guessUtteranceLane("删除对账付款界面", { integrated: false });
  assert.match(hint, /zr_cchat_begin/);
  assert.match(hint, /立刻/);
  assert.match(hint, /不要先 ask_user_question/);
  const integrated = guessUtteranceLane("去掉侧栏报表菜单", { integrated: true });
  assert.match(integrated, /mes_dev_pipeline_begin/);
  const triage = formatHostTriage({
    workspace: "D:\\demo",
    summaryHead: "布局：frontend_only",
    notes: "",
    enabledIds: ["mes-ask"],
    utteranceHint: hint,
  });
  assert.match(triage, /灵活判定/);
  assert.match(triage, /不要.*写死优先级|不按写死/);
  assert.match(triage, /何时算模糊/);
  assert.match(triage, /车道级短选项/);
  assert.match(triage, /确认车道后/);
  assert.match(triage, /绿色「需求→上线」/);
  assert.match(indexSrc, /灵活/);
  assert.match(indexSrc, /仅当模糊/);
});

test("未启用车道只提示打开功能插件，不改调其它工具", () => {
  const advice = utteranceLaneAdvice("帮我审码看看改动", {
    integrated: false,
    enabledIds: ["mes-ask"],
  });
  assert.match(advice.hint, /mes_code_review_begin/);
  assert.match(advice.disabledNote, /未启用/);
  assert.match(advice.disabledNote, /功能插件/);
  assert.equal(advice.disabledNote.includes("先追问"), false);
  const ok = utteranceLaneAdvice("帮我审码看看改动", {
    integrated: false,
    enabledIds: ["mes-ask", "code-review"],
  });
  assert.equal(ok.disabledNote, "");
  const triage = formatHostTriage({
    workspace: "D:\\demo",
    summaryHead: "布局：frontend_only",
    notes: "点检=查数",
    enabledIds: ["mes-ask"],
    utteranceHint: advice.hint,
    disabledLaneNote: advice.disabledNote,
  });
  assert.match(triage, /未启用/);
  assert.match(triage, /意图词典|仅背景/);
  assert.equal(triage.includes("mes_code_dev_begin"), false);
});

test("分诊只额外标出原话命中的目录名，全文目录仍保留", () => {
  const profile = {
    directory: {
      roots: [
        {
          path: "src",
          name: "src",
          role: "源码",
          children: [
            { path: "src/views", name: "views", role: "页面", modules: ["orders", "shipping"] },
          ],
        },
      ],
    },
  };
  const hits = relatedDirectoryHints("把 orders 页按钮改蓝", profile);
  assert.deepEqual(hits, ["orders"]);
  assert.deepEqual(relatedDirectoryHints("改一下 application 配置", profile), []);
  assert.deepEqual(relatedDirectoryHints("看看 src 目录", profile), []);
  const block = formatDirectoryBlock(profile);
  const triage = formatHostTriage({
    workspace: "D:\\demo",
    summaryHead: "布局：frontend_only",
    notes: "",
    enabledIds: ["mes-ask"],
    relatedDirs: hits,
    directoryBlock: block,
  });
  assert.match(triage, /原话可能相关目录：orders/);
  assert.match(triage, /shipping/);
  assert.match(triage, /不要复述给用户/);
});

test("首工具日志只记车道入口，不改执行结果", () => {
  const line = formatFirstToolLogLine({
    sessionId: "s1",
    tool: "mes_ask",
    utterance: "库存还剩多少",
    workspace: "D:\\demo",
    hasDirectory: true,
  });
  assert.match(line, /"tool":"mes_ask"/);
  assert.match(line, /库存/);
  assert.equal(formatFirstToolLogLine({ tool: "bash" }), "");
  const askMiss = formatFirstToolLogLine({
    sessionId: "s2",
    tool: "ask_user_question",
    utterance: "删除对账付款界面",
    workspace: "D:\\demo",
    hasDirectory: false,
  });
  assert.match(askMiss, /ask_user_question/);
  assert.match(askMiss, /clearLaneMissed/);
  assert.match(askMiss, /coding/);
  assert.match(indexSrc, /noteFirstToolChoice/);
  const leaked = formatFirstToolLogLine({
    sessionId: "s1",
    tool: "mes_ask",
    utterance: "key sk-abcdefghijklmnopqrstuvwxyz password=secret123",
    workspace: "D:\\demo",
    hasDirectory: false,
  });
  assert.match(leaked, /\[redacted\]/);
  assert.equal(leaked.includes("sk-abcdefghijklmnopqrstuvwxyz"), false);
  assert.equal(leaked.includes("secret123"), false);
  assert.match(redactForLog("Bearer abc.def"), /Bearer \[redacted\]/);
});

test("现有分流表仍在，分诊段按当前会话现算", () => {
  assert.match(indexSrc, /ZR-WorkBuddy 意图分流（强制 · 先看这张表）/);
  assert.match(indexSrc, /workbuddy:intent-triage/);
  assert.match(indexSrc, /text:\s*function\s*\(\s*assembleCtx\s*\)/);
  assert.match(indexSrc, /rememberSessionCwd/);
  assert.equal(indexSrc.includes("lastTriageText"), false);
  assert.equal(indexSrc.includes("refreshTriagePrompt"), false);
  assert.equal(indexSrc.split('name: "workbuddy:intent-triage"').length - 1, 1);
  assert.match(indexSrc, /禁止\*\*先 `mes_dev_pipeline_status`/);
});
