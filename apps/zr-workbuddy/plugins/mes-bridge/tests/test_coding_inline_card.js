import assert from "node:assert/strict";
import test from "node:test";

import {
  codingInlineRequirement,
  codingInlineSameRequirement,
  codingInlineStatusLine,
  codingProcessLines,
  codingProcessTick,
  codingProcessTypeStep,
  fileLangFromPath,
  isProcessLineComplete,
  isToolEchoText,
  mergeCodingProcessLines,
  isProgressiveCodingText,
  parseCodingSnippet,
  pickCodingInlineJob,
  pickLiveCodingJob,
  shellCommandTitle,
  shouldStreamCodingProcess,
  isPlanningSayText,
  normalizeProcessMarkdown,
  splitProcessProse,
  splitSayBlocks,
} from "../lib/coding-inline-card.js";

test("写码卡只取诉求首行，不带硬规则附录", () => {
  const raw = "新增设备停机报表\n\n【硬规则·勿碰数据库文件】禁止创建 *.db";
  assert.equal(codingInlineRequirement(raw), "新增设备停机报表");
});

test("同一诉求对得上，别的报表对不上", () => {
  const card = "新增设备停机报表";
  const job = "新增设备停机报表\n\n【硬规则·勿碰数据库文件】";
  assert.equal(codingInlineSameRequirement(card, job), true);
  assert.equal(codingInlineSameRequirement(card, "删除员工工时报表"), false);
  assert.equal(codingInlineSameRequirement("", job), false);
});

test("多条同诉求时取最近一条", () => {
  const picked = pickCodingInlineJob("新增设备停机报表", [
    {
      id: "cch-old",
      requirement: "新增设备停机报表",
      status: "succeeded",
      updated_at: "2026-10-19T01:00:00.000Z",
    },
    {
      id: "cch-new",
      requirement: "新增设备停机报表\n【硬规则】",
      status: "running",
      detail: "正在将目标工程受限拷贝到沙箱…",
      updated_at: "2026-10-19T01:22:40.000Z",
    },
    {
      id: "cch-other",
      requirement: "删除员工工时报表",
      status: "running",
      updated_at: "2026-10-19T01:23:00.000Z",
    },
  ]);
  assert.equal(picked && picked.id, "cch-new");
});

test("深度求索期间没有工具卡，仍按对话里的诉求对上正在写的那条", () => {
  const page = "删除停机报表\n11:20\n思考\n深度求索中，用时 18 秒";
  const picked = pickLiveCodingJob(page, [
    {
      id: "cch-old",
      requirement: "新增停机报表\n【硬规则】",
      updated_at: "2026-10-19T03:05:00.000Z",
    },
    {
      id: "cch-live",
      requirement: "删除停机报表\n\n【硬规则·勿碰数据库文件】",
      status: "running",
      updated_at: "2026-10-19T03:20:16.000Z",
    },
  ]);
  assert.equal(picked && picked.id, "cch-live");
  assert.equal(pickLiveCodingJob("深度求索中", [{ id: "cch-x", requirement: "删除停机报表" }]), null);
  assert.equal(pickLiveCodingJob("", [{ id: "cch-x", requirement: "删除停机报表" }]), null);
});

test("状态行用中文，并带上当前一句进度", () => {
  assert.equal(
    codingInlineStatusLine("running", "正在将目标工程受限拷贝到沙箱…"),
    "正在写码 · 正在将目标工程受限拷贝到沙箱…",
  );
  assert.equal(codingInlineStatusLine("succeeded", "已同步 1 个文件"), "已完成 · 已同步 1 个文件");
});

test("写码过程收成对话行：思考、说明、工具，不要诉求原文和空状态", () => {
  const lines = codingProcessLines([
    { kind: "user", text: "删除设备停机报表\n【硬规则】" },
    { kind: "status", text: "Cursor 正在改码，过程见进度卡…" },
    { kind: "status", text: "沙箱就绪（copy · 223 文件）" },
    { kind: "thinking", text: "先定位报表入口。" },
    { kind: "assistant", text: "正在查找相关代码。" },
    { kind: "tool", name: "grep", pattern: "设备停机", tool_status: "completed" },
    { kind: "tool", name: "edit", path: "frontend/src/config/reportFeatures.js", tool_status: "running" },
    { kind: "tool", name: "delete", path: "frontend/src/views/reports/EquipmentDowntimeReportView.vue" },
    { kind: "status", text: "FINISHED" },
  ]);
  assert.deepEqual(
    lines.map((row) => row.kind + ":" + row.text),
    [
      "status:沙箱就绪（copy · 223 文件）",
      "thinking:先定位报表入口。",
      "say:正在查找相关代码。",
      "tool:搜索 设备停机",
      "tool:编辑 reportFeatures.js",
      "tool:删除 EquipmentDowntimeReportView.vue",
    ],
  );
  assert.equal(lines[4].running, true);
  assert.equal(lines[5].running, false);
});

test("连续思考收成一块正文，按字往下淌，工具一行出完", () => {
  const merged = mergeCodingProcessLines([
    { kind: "thinking", text: "先找入口。" },
    { kind: "thinking", text: "再改注册表。" },
    { kind: "tool", text: "搜索 停机报表" },
    { kind: "say", text: "准备改文件。" },
  ]);
  assert.equal(merged.length, 3);
  assert.equal(merged[0].text, "先找入口。\n再改注册表。");
  assert.equal(codingProcessTypeStep("thinking", "", "先找入口。").length, 2);
  assert.equal(codingProcessTypeStep("thinking", "先找", "先找入口。"), "先找入口");
  assert.equal(codingProcessTypeStep("tool", "", "搜索 停机报表"), "搜索 停机报表");
});

test("同一句流式快照夹在工具中间，只留最长的一行，不要重复堆", () => {
  const merged = mergeCodingProcessLines([
    { kind: "say", text: "正在下线「员工工时报表」：从注册表、API、前端页面与" },
    { kind: "tool", text: "编辑 schemas.py" },
    { kind: "say", text: "正在下线「员工工时报表」：从注册表、API、前端页面与测试中" },
    { kind: "tool", text: "编辑 openapi_zh.py" },
    { kind: "say", text: "正在下线「员工工时报表」：从注册表、API、前端页面与测试中移除，保留 `employee_work_hours` 表及日产报表等共用逻辑。" },
    { kind: "tool", text: "删除 employeeWorkHours.js" },
    { kind: "tool", text: "删除 employeeWorkHours.js" },
  ]);
  const says = merged.filter((row) => row.kind === "say");
  assert.equal(says.length >= 1, true);
  assert.equal(merged[0].kind, "say");
  assert.equal(merged.filter((row) => row.kind === "tool").length, 3);
  assert.equal(merged[merged.length - 1].kind, "tool");
  assert.match(says.map((row) => row.text).join(""), /employee_work_hours` 表及日产报表/);
  assert.equal(says.filter((row) => /正在下线/.test(row.text)).length, 1);
  assert.equal(isProgressiveCodingText("正在下线「员工工时报表」：从", "正在下线「员工工时报表」：从注册表"), true);
  assert.equal(codingProcessTypeStep("say", "已决定", "说明方案仓库里后端已齐全。").startsWith("说明"), true);
  assert.ok(codingProcessTypeStep("say", "已决定", "说明方案仓库里后端已齐全。").length < 20);
});

test("进行中必须淌过程；刷新后终态不要把过程再灌进对话", () => {
  assert.equal(shouldStreamCodingProcess("running", 0, 40), true);
  assert.equal(shouldStreamCodingProcess("queued", 0, 1), true);
  assert.equal(shouldStreamCodingProcess("succeeded", 12, 40), true);
  assert.equal(shouldStreamCodingProcess("failed", 5, 40), true);
  assert.equal(shouldStreamCodingProcess("succeeded", 0, 40), false);
  assert.equal(shouldStreamCodingProcess("succeeded", 0, 3), false);
  assert.equal(shouldStreamCodingProcess("failed", 0, 40), false);
  assert.equal(shouldStreamCodingProcess("cancelled", 0, 10), false);
});

test("工具回声和空搜索不要进正文；上一行打完才算完", () => {
  const lines = mergeCodingProcessLines(
    codingProcessLines([
      { kind: "assistant", text: "确认员工工时报表是否已从注册表移除。" },
      { kind: "assistant", text: "读取 schemas.py" },
      { kind: "assistant", text: "搜索 downtime|停机" },
      { kind: "thinking", text: "搜索" },
      { kind: "tool", name: "grep", pattern: "", tool_status: "completed" },
      { kind: "tool", name: "read", path: "backend/app/schemas.py", tool_status: "completed" },
      { kind: "tool", name: "read", path: "backend/app/schemas.py", tool_status: "completed" },
    ]),
  );
  assert.equal(
    lines.map((row) => row.kind + ":" + row.text).join("|"),
    "say:确认员工工时报表是否已从注册表移除。|tool:读取 schemas.py",
  );
  assert.equal(isToolEchoText("读取 schemas.py"), true);
  assert.equal(isToolEchoText("确认员工工时报表是否已从注册表移除。"), false);
  assert.equal(isProcessLineComplete({ kind: "say", text: "确认" }, { kind: "say", text: "确认员工" }), false);
  assert.equal(isProcessLineComplete({ kind: "say", text: "确认员工" }, { kind: "say", text: "确认员工" }), true);
  assert.equal(isProcessLineComplete({ kind: "tool", text: "读取 schemas.py" }, { kind: "tool", text: "读取 schemas.py" }), true);
  const merged = mergeCodingProcessLines([
    { kind: "tool", name: "read", text: "读取 schemas.py", arg: "schemas.py" },
    { kind: "say", text: "读取 schemas.py" },
    { kind: "tool", name: "read", text: "读取 schemas.py", arg: "schemas.py" },
  ]);
  assert.equal(merged.length, 1);
});

test("说明方案粘连标题和空表要收整齐，规划自语不要进正文", () => {
  assert.equal(isPlanningSayText('撰写最终方案，首行将使用 "## 说明方案"。'), true);
  assert.equal(isPlanningSayText("已决定删除测试文件，仅保留最小改动。"), false);
  const tidy = normalizeProcessMarkdown(
    "说明方案仓库里**设备停机报表**已齐全。###改动| 文件 | 内容 |\n|------|------|| |新增: , , 路由 |\n| |补充 filters 中文摘要 |\n###验证",
  );
  assert.match(tidy, /说明方案\n/);
  assert.match(tidy, /### 改动/);
  assert.match(tidy, /### 验证/);
  assert.doesNotMatch(tidy, /\|-{3,}/);
  const blocks = splitProcessProse(tidy);
  assert.equal(blocks.some((b) => b.type === "heading" && /说明方案|改动|验证/.test(b.text)), true);
  assert.equal(
    blocks.some((b) => b.type === "para" && /设备停机报表/.test(b.text)),
    true,
  );
});

test("运行指令收成终端卡字段，编辑 snippet 收成 diff 计数", () => {
  const lines = codingProcessLines([
    {
      kind: "tool",
      name: "shell",
      command: 'python -c "print(1)"',
      tool_status: "completed",
    },
    {
      kind: "tool",
      name: "edit",
      path: "plugins/mes-bridge/tests/test_coding_inline_card.js",
      snippet: '- test("旧文案", () => {\n+ test("新文案", () => {\n  assert.equal(1, 1);\n…',
      tool_status: "completed",
    },
  ]);
  assert.equal(lines[0].variant, "run");
  assert.equal(lines[0].command, 'python -c "print(1)"');
  assert.equal(lines[1].variant, "code");
  assert.equal(lines[1].lang, "JS");
  assert.equal(lines[1].added, 1);
  assert.equal(lines[1].removed, 1);
  assert.equal(fileLangFromPath("a/b/c.py"), "PY");
  assert.equal(shellCommandTitle("x".repeat(120)).length, 88);
  const parsed = parseCodingSnippet("+ a\n- b\n  c\n…");
  assert.equal(parsed.added, 1);
  assert.equal(parsed.removed, 1);
  assert.equal(parsed.rows[3].type, "omit");
  const blocks = splitSayBlocks("看这段：\n```js\nconst a = 1;\n```\n结束");
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].type, "code");
  assert.equal(blocks[1].lang, "JS");
});

test("同一句变长时长在原行，工具只出现一次，思考和说明的「正在」不拆成两行", () => {
  const merged = mergeCodingProcessLines([
    { kind: "thinking", text: "正在" },
    { kind: "say", text: "正在" },
    { kind: "tool", name: "grep", text: "搜索 equipment-downtime|停机报表", arg: "equipment-downtime|停机报表" },
    { kind: "tool", name: "grep", text: "搜索 remove.*report|report-center-remove", arg: "remove.*report|report-center-remove" },
    { kind: "tool", name: "grep", text: "搜索 equipment-downtime|停机报表", arg: "equipment-downtime|停机报表" },
    { kind: "tool", name: "grep", text: "搜索 remove.*report|report-center-remove", arg: "remove.*report|report-center-remove" },
    { kind: "thinking", text: "正在" },
    { kind: "say", text: "正在移除停机报表入口。" },
    { kind: "tool", name: "grep", text: "搜索 EquipmentRuntimeLog", arg: "EquipmentRuntimeLog" },
    { kind: "tool", name: "grep", text: "搜索 EquipmentRuntimeLog", arg: "EquipmentRuntimeLog" },
  ]);
  assert.equal(merged.filter((row) => row.kind === "thinking" || row.kind === "say").length, 1);
  assert.equal(merged[0].kind, "say");
  assert.equal(merged[0].text, "正在移除停机报表入口。");
  assert.equal(
    merged.filter((row) => row.kind === "tool").map((row) => row.arg).join("|"),
    "equipment-downtime|停机报表|remove.*report|report-center-remove|EquipmentRuntimeLog",
  );
});

test("当前行没打完就不能长出下一行；上面还在打字时下面的工具要收回", () => {
  const target = mergeCodingProcessLines([
    { kind: "say", text: "正在移除停机报表入口。" },
    { kind: "tool", name: "grep", text: "搜索 equipment-downtime|停机报表", arg: "equipment-downtime|停机报表" },
    { kind: "tool", name: "grep", text: "搜索 EquipmentRuntimeLog", arg: "EquipmentRuntimeLog" },
  ]);
  let shown = [];
  shown = codingProcessTick(shown, target);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].kind, "say");
  assert.ok(shown[0].text.length < target[0].text.length);
  shown = [
    { kind: "say", text: "正在" },
    { kind: "tool", name: "grep", text: "搜索 equipment-downtime|停机报表", arg: "equipment-downtime|停机报表" },
    { kind: "tool", name: "grep", text: "搜索 EquipmentRuntimeLog", arg: "EquipmentRuntimeLog" },
  ];
  shown = codingProcessTick(shown, target);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].kind, "say");
  assert.ok(shown[0].text.startsWith("正在"));
  assert.ok(shown[0].text.length > 2);
  while (shown.length === 1 && shown[0].text !== target[0].text) {
    shown = codingProcessTick(shown, target);
  }
  assert.equal(shown[0].text, target[0].text);
  shown = codingProcessTick(shown, target);
  assert.equal(shown.length, 2);
  assert.equal(shown[1].kind, "tool");
});

test("刷新后已结束的任务不要再对上过程流", () => {
  const page = "删除停机报表\n已编辑 4 个文件\n员工工时报表";
  assert.equal(
    pickLiveCodingJob(page, [
      {
        id: "cch-done",
        requirement: "删除停机报表",
        status: "succeeded",
        updated_at: "2026-10-19T06:02:00.000Z",
      },
      {
        id: "cch-fail",
        requirement: "删除停机报表",
        status: "failed",
        updated_at: "2026-10-19T06:01:00.000Z",
      },
    ]),
    null,
  );
});
