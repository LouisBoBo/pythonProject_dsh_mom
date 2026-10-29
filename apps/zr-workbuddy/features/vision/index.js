/**
 * 热插拔 feature：vision（独立视觉识图，其它业务可复用）
 */
export const name = "vision";
export const inject = ["tools"];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    text: { type: "string" },
    detail: { type: "string" },
  },
};

function eng(ctx) {
  return ctx.get("mesEngine");
}

export function apply(ctx) {
  const e = eng(ctx);
  if (!e) {
    console.error("[vision] mesEngine 未提供：请启用 mes-bridge");
    return;
  }

  ctx.tools.register(
    e.defineTool({
      name: "mes_vision_status",
      description:
        "查询引擎视觉识图（智谱等）是否已配置。贴图需求、独立识图前可先探测；未配置时引导用户去配置中心填写 vision Key。",
      parameters: {},
      output: { schema: OUTPUT_SCHEMA, render: e.resultRender },
      timeoutMs: 15000,
      async execute() {
        return await e.runEngine(["vision-status"]);
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_vision_understand",
      description:
        "【独立识图】用引擎视觉模型（智谱 glm-4v）识别已上传图片。" +
        "image_ids 为引擎 /api/vision/upload 返回的 vimg-… 列表（逗号分隔亦可）。" +
        "一体化需求（绿开关已开）请优先 mes_dev_pipeline_begin（会自动消费会话 pending 附图）；" +
        "普通写码贴图请先调本工具识图，再 mes_code_dev_begin。",
      parameters: {
        image_ids: {
          type: "string",
          required: true,
          description: "必填：图片 id，多个用逗号分隔，如 vimg-abc,vimg-def",
        },
        prompt: {
          type: "string",
          description: "可选提示词；空则按 purpose 用默认模板",
        },
        purpose: {
          type: "string",
          description: "可选：req_intake（需求采集）或 general",
        },
      },
      output: { schema: OUTPUT_SCHEMA, render: e.resultRender },
      timeoutMs: 120000,
      async execute(args) {
        const ids = String((args && args.image_ids) || "").trim();
        const prompt = String((args && args.prompt) || "").trim();
        const purpose = String((args && args.purpose) || "general").trim();
        const cmd = ["vision-understand", "image_ids=" + ids];
        if (prompt) cmd.push("prompt=" + prompt);
        if (purpose) cmd.push("purpose=" + purpose);
        return await e.runEngine(cmd);
      },
    }),
  );
}
