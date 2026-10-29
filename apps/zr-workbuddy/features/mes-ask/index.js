/**
 * 热插拔 feature：mes_ask
 * 无 import；能力经 ctx.get('mesEngine') 注入（由 mes-bridge provide）。
 * inject 必须含 attachments：出图时 attachChart → saveImage，否则 Cordis 会抛
 * cannot get property "attachments" without inject（无图查询不会踩到）。
 */
export const name = "mes-ask";
export const inject = ["tools", "attachments"];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    reply: { type: "string" },
    chart: { oneOf: [{ type: "string" }, { type: "null" }] },
    chart_attachment: { oneOf: [{ type: "object", additionalProperties: true }, { type: "null" }] },
    table: { oneOf: [{ type: "array", items: { type: "object", additionalProperties: true } }, { type: "null" }] },
    note: { oneOf: [{ type: "string" }, { type: "null" }] },
    source: { oneOf: [{ type: "string" }, { type: "null" }] },
    data_source: { oneOf: [{ type: "string" }, { type: "null" }] },
    detail: { oneOf: [{ type: "string" }, { type: "null" }] },
    intent: { oneOf: [{ type: "object", additionalProperties: true }, { type: "null" }] },
  },
};

export function apply(ctx) {
  const eng = ctx.get("mesEngine");
  if (!eng) {
    console.error("[mes-ask] mesEngine 未提供：请启用 mes-bridge");
    return;
  }

  ctx.tools.register(
    eng.defineTool({
      name: "mes_ask",
      description:
        "ZR-WorkBuddy：自然语言查询业务数据。含产量/良率/OEE/缺陷/工单等，以及配置中心已导入 OpenAPI 的只读接口（如设备保养计划、仓储等）。" +
        "问「多少/汇总/对比」返回合计；问「明细/列表/计划」返回记录列表（最多 50 条）。" +
        "同一会话追问时请把上文业务对象/已用接口写进 context，避免「工单」误打到保养工单。" +
        "必须把当前会话工作区绝对路径传入 workspace，问数按该路径命中对应 MES 对接卡。" +
        "示例：「今日再制品工单有多少个」「查询设备保养计划」「查今日在制品工单明细」。",
      parameters: {
        question: { type: "string", required: true, description: "自然语言问题" },
        workspace: {
          type: "string",
          description: "当前会话工作区绝对路径（侧栏已选目录）。用于命中 MES 对接卡。",
        },
        // 可选：勿写 required:false（宿主校验「有 required 必须为 true」会导致整包加载失败）
        context: {
          type: "string",
          description:
            "本轮对话与查数相关的上文摘要（例如：刚才查的是生产工单 /api/work-orders，不是保养）。供接口消歧；勿塞无关闲聊。",
        },
      },
      output: { schema: OUTPUT_SCHEMA, render: eng.resultRender },
      timeoutMs: eng.TIMEOUT_MS || 60000,
      async execute(args) {
        const question = String(args.question || "").trim();
        if (!question) return { ok: false, detail: "问题不能为空" };
        const context = String(args.context || "").trim();
        const workspace = String((args && (args.workspace || args.cwd)) || "").trim();
        const argv = ["ask"];
        if (workspace) argv.push("workspace=" + workspace);
        if (context) argv.push("--ask-context", context);
        argv.push(question);
        const raw = await eng.runEngine(argv);
        return await eng.attachChart(ctx, raw);
      },
    }),
  );
}
