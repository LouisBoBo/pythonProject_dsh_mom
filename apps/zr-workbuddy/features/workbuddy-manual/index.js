/**
 * 热插拔 feature：workbuddy-manual
 * 本机预置用户操作手册（默认知识库 · 免挂载）。
 */
export const name = "workbuddy-manual";
export const inject = ["tools"];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    reply: { type: "string" },
    detail: { type: "string" },
    source: { type: "string" },
    count: { type: "number" },
    code: { type: "string" },
    mount_required: { type: "boolean" },
  },
};

export function apply(ctx) {
  const eng = ctx.get("mesEngine");
  if (!eng) {
    console.error("[workbuddy-manual] mesEngine 未提供：请启用 mes-bridge");
    return;
  }

  ctx.tools.register(
    eng.defineTool({
      name: "mes_workbuddy_manual",
      description:
        "检索【本机默认知识库】里预置的《江西中软工作助手 · 用户操作手册》（免挂载，任意会话可用，用户无需上传）。" +
        "用户问怎么登录、怎么问数、怎么写码/审码/提交/部署、资料库、用量、设置、需求到上线时必须调用。" +
        "示例：「用户手册里怎么提交代码」「工作助手怎么配商用模型」「资料库在哪」。",
      parameters: {
        question: {
          type: "string",
          required: true,
          description: "要在用户操作手册中查找的问题或关键词；要全文可写「全文手册」",
        },
      },
      output: { schema: OUTPUT_SCHEMA, render: eng.resultRender },
      timeoutMs: eng.TIMEOUT_MS || 60000,
      async execute(args) {
        const question = String(args.question || "").trim();
        if (!question) {
          return {
            ok: false,
            code: "bad_request",
            count: 0,
            source: "workbuddy_manual",
            reply: "问题不能为空。",
            detail: "bad_request",
          };
        }
        const out = await eng.runEngine(["workbuddy-manual-cite", question]);
        return out || {
          ok: false,
          code: "denied",
          count: 0,
          source: "workbuddy_manual",
          reply: "用户操作手册暂时不可用。",
          detail: "denied",
        };
      },
    }),
  );
}
