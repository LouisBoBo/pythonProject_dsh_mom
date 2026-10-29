/**
 * 热插拔 feature：code-dev（本机 Cursor Local 写码）
 * 无 import npm；算数在 engine/app/code_dev。
 *
 * 主聊天 HITL：begin 返回 code_dev_ui + presentationMeta，
 * 由 mes-bridge tool.call.toolview 在主对话工具卡内选目录/填需求/确认开工。
 * 禁止依赖浮层面板 / ask_user_question；确认前绝不 start Job。
 */
export const name = "code-dev";
export const inject = ["tools"];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    reply: { type: "string" },
    detail: { oneOf: [{ type: "string" }, { type: "null" }] },
    job_id: { oneOf: [{ type: "string" }, { type: "null" }] },
    job: { oneOf: [{ type: "object", additionalProperties: true }, { type: "null" }] },
  },
};

function eng(ctx) {
  return ctx.get("mesEngine");
}

function timeoutOf(e) {
  return Math.max(e.TIMEOUT_MS || 60000, 120000);
}

function resolveDshSessionId(args, e) {
  const fromArgs = String((args && args.dsh_session_id) || "").trim();
  if (fromArgs) return fromArgs;
  if (e && typeof e.getActiveDshSessionId === "function") {
    const fromHost = String(e.getActiveDshSessionId() || "").trim();
    if (fromHost) return fromHost;
  }
  try {
    return String(globalThis.__wbDshSessionId || "").trim();
  } catch {
    return "";
  }
}

function cdPresentationMeta(_args, value) {
  // 绿开关开启时误调本工具：禁止出 Cursor 确认卡，只留轻量提示
  if (value && value.redirected_to === "mes_dev_pipeline_begin") {
    return {
      wb: {
        t: "cd-redirect-integrated",
        run_id: value.run_id || null,
      },
    };
  }
  if (value && value.code_dev_ui) {
    const kind = value.code_dev_ui.kind || "pick";
    return { wb: { t: "cd-" + kind, ui: value.code_dev_ui } };
  }
  if (value && value.job_id) {
    return { wb: { t: "cd-job", job_id: value.job_id } };
  }
  return { wb: { t: "cd-none" } };
}

function cdCardOnlyRender(args, value, fallback) {
  if (value && value.redirected_to === "mes_dev_pipeline_begin") {
    const ack = String((value && value.reply) || "").trim();
    return [
      {
        type: "text",
        text:
          ack ||
          "本会话已开「需求→上线」，已改走过程流卡；禁止再开 Cursor 写码确认卡。",
      },
    ];
  }
  if (!value || value.ok === false || !value.code_dev_ui) {
    return fallback(args, value);
  }
  return [{ type: "text", text: "" }];
}

export function apply(ctx) {
  const e = eng(ctx);
  if (!e) {
    console.error("[code-dev] mesEngine 未提供：请启用 mes-bridge");
    return;
  }
  const t = timeoutOf(e);

  ctx.tools.register(
    e.defineTool({
      name: "mes_code_dev_begin",
      description:
        "【普通写码入口 · 仅当输入框旁显示「普通写码」/「需求→上线」关闭时】用户说「写码 / 改代码 / 改页面 / 改菜单」时调本工具。" +
        "可贴图：消息含【附图:vimg-…】时先 mes_vision_understand 再调本工具；**禁止**因贴图改调 mes_dev_pipeline_begin。" +
        "**仅当绿色「需求→上线」已开时**禁止调用本工具，必须改用 mes_dev_pipeline_begin。" +
        "开关关闭时：message=用户原话，可选 workspace；返回写码工具卡（选目录→梳理→确认）。" +
        "成功后立刻结束本轮，禁止再输出用户可见指引；成功时 reply 留空。",
      parameters: {
        workspace: {
          type: "string",
          description: "可选：本机工程绝对路径",
        },
        message: {
          type: "string",
          required: true,
          description: "必填：用户本轮原话/写码诉求（原样传入，工具卡会自动填入「原始写码诉求」）",
        },
        dsh_session_id: {
          type: "string",
          description: "可选：DSH 会话 id；缺省由宿主注入",
        },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (a, v) => cdCardOnlyRender(a, v, e.resultRender),
        presentationMeta: cdPresentationMeta,
      },
      timeoutMs: t,
      async execute(args) {
        const workspace = String((args && args.workspace) || "").trim();
        const message = String((args && args.message) || "").trim();
        const sid = resolveDshSessionId(args, e);
        // 硬门禁：绿开关开启时绝不出 Cursor 确认卡，改走一体化过程流
        if (sid) {
          const st = await e.runEngine([
            "dev-pipeline-status",
            "dsh_session_id=" + sid,
          ]);
          if (st && st.integrated_flow_enabled) {
            const cmd = [
              "dev-pipeline-begin",
              "message=" + (message || "（附图需求）"),
              "dsh_session_id=" + sid,
            ];
            if (workspace) cmd.push("workspace=" + workspace);
            const out = await e.runEngine(cmd);
            const ack = String((out && (out.reply || out.detail)) || "").trim();
            return {
              ok: !!(out && out.ok),
              reply:
                ack ||
                "本会话已开「需求→上线」，已改走过程流卡（禁止 Cursor 写码确认卡）。",
              detail: (out && out.detail) || null,
              run_id: (out && out.run_id) || null,
              epic_id: (out && out.epic_id) || null,
              code_dev_ui: null,
              redirected_to: "mes_dev_pipeline_begin",
              coding_mode: "integrated",
              source: "code_dev_redirect",
            };
          }
        }
        const cmd = ["code-dev-pick"];
        if (workspace) cmd.push("workspace=" + workspace);
        if (message) cmd.push("requirement=" + message);
        if (sid) cmd.push("session=" + sid);
        const pick = await e.runEngine(cmd);
        if (!pick || !pick.ok) return pick;
        const ui = pick.code_dev_ui || null;
        if (ui) {
          if (workspace) ui.workspace = workspace;
          if (message) {
            ui.requirement = message;
            ui.original_goal = message;
          }
        }
        return {
          ok: true,
          reply: "",
          detail: null,
          workspace: (ui && ui.workspace) || workspace || pick.workspace || "",
          code_dev_ui: ui,
          suggestions: pick.suggestions || [],
          source: "code_dev",
        };
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_code_dev_status",
      description:
        "【排障】写码车道状态。用户说「写码」时禁止调用；请用 mes_code_dev_begin。",
      parameters: {},
      output: {
        schema: OUTPUT_SCHEMA,
        render: e.resultRender,
        presentationMeta: cdPresentationMeta,
      },
      timeoutMs: e.TIMEOUT_MS || 60000,
      async execute() {
        return await e.runEngine(["code-dev-status"]);
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_code_dev_check",
      description:
        "【排障】校验工程路径。用户说「写码」时禁止调用；请用 mes_code_dev_begin。",
      parameters: {
        workspace: {
          type: "string",
          required: true,
          description: "本机工程绝对路径",
        },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: e.resultRender,
        presentationMeta: cdPresentationMeta,
      },
      timeoutMs: e.TIMEOUT_MS || 60000,
      async execute(args) {
        const workspace = String(args.workspace || "").trim();
        if (!workspace) return { ok: false, detail: "workspace 不能为空" };
        return await e.runEngine(["code-dev-check", workspace]);
      },
    }),
  );


  ctx.tools.register(
    e.defineTool({
      name: "mes_code_dev_job",
      description: "查询本机写码任务状态。示例：「查一下任务 ldj-xxxx」。",
      parameters: {
        job_id: { type: "string", required: true, description: "任务 id" },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: e.resultRender,
        presentationMeta: cdPresentationMeta,
      },
      timeoutMs: e.TIMEOUT_MS || 60000,
      async execute(args) {
        const job_id = String(args.job_id || "").trim();
        if (!job_id) return { ok: false, detail: "job_id 不能为空" };
        return await e.runEngine(["code-dev-job", job_id]);
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_code_dev_cancel",
      description: "取消进行中的本机写码任务。",
      parameters: {
        job_id: { type: "string", required: true, description: "任务 id" },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: e.resultRender,
        presentationMeta: cdPresentationMeta,
      },
      timeoutMs: e.TIMEOUT_MS || 60000,
      async execute(args) {
        const job_id = String(args.job_id || "").trim();
        if (!job_id) return { ok: false, detail: "job_id 不能为空" };
        return await e.runEngine(["code-dev-cancel", job_id]);
      },
    }),
  );
}
