/**
 * 热插拔 feature：company-knowledge
 * 只登记工具并 runEngine；密钥与中央 URL 在引擎 config.yaml。
 */
export const name = "company-knowledge";
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
    assistant_must_say: { type: "string" },
    block_memory_quote: { type: "boolean" },
  },
};

/** 工具失败时只把定稿句交给模型，杜绝把价表从记忆里「补」出来。 */
function hardenFailure(out) {
  const code = String((out && out.code) || "denied");
  const fallback =
    "公司共享知识库不可用或无权召回。我不能根据记忆提供公司库正文或计价数字。";
  // 只信引擎定稿句；detail 可能是异常/上游噪声，禁止当用户可见全文
  let must = "";
  if (out && out.assistant_must_say != null) must = String(out.assistant_must_say).trim();
  else if (out && out.reply != null) must = String(out.reply).trim();
  if (!must || must === code || must.length > 400) must = fallback;
  return {
    ok: false,
    code,
    count: 0,
    hits: [],
    source: "company_knowledge",
    filtered: !!(out && out.filtered),
    block_memory_quote: true,
    assistant_must_say: must,
    reply: must,
    // detail 只放短码，避免 resultRender 把长文再贴一遍冲淡指令
    detail: code,
    note:
      "【硬约束】把 reply / assistant_must_say 原样告诉用户。" +
      "禁止追加任何层数单价表、元/㎡数字、文档正文，禁止写「此前检索/内部留档/历史记忆」来补充内容。",
  };
}

export function apply(ctx) {
  const eng = ctx.get("mesEngine");
  if (!eng) {
    console.error("[company-knowledge] mesEngine 未提供：请启用 mes-bridge");
    return;
  }

  ctx.tools.register(
    eng.defineTool({
      name: "mes_company_knowledge",
      description:
        "检索【公司共享知识库】并返回可引用摘录（工艺/口径/制度等公司唯一版本）。" +
        "管理员：自动召回已会合并公司库，仍不够时再调本工具。" +
        "普通成员：自动召回不含公司库，查公司资料必须用本工具。" +
        "若 ok=false（acl_denied / unavailable / not_found）：只能把 reply 原样告诉用户，" +
        "禁止输出任何计价数字、层数单价表或公司库正文，禁止用记忆补全文。" +
        "示例：「公司工艺规程里清洗步骤怎么写」「P1 深度优化有哪些」。",
      parameters: {
        question: {
          type: "string",
          required: true,
          description: "要在公司共享知识库中检索的问题或关键词",
        },
      },
      output: { schema: OUTPUT_SCHEMA, render: eng.resultRender },
      timeoutMs: eng.TIMEOUT_MS || 60000,
      async execute(args) {
        const question = String(args.question || "").trim();
        if (!question) return hardenFailure({ code: "bad_request", reply: "问题不能为空。" });
        const out = await eng.runEngine(["company-knowledge-cite", question]);
        if (!out || out.ok !== true || !(Number(out.count) > 0)) {
          return hardenFailure(out || { code: "denied" });
        }
        return out;
      },
    }),
  );
}
