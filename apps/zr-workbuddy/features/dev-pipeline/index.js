/**
 * 热插拔 feature：dev-pipeline（需求 → 上线编排）
 * 算数在 engine/app/dev_pipeline；不 import npm。
 */
export const name = "dev-pipeline";
export const inject = ["tools"];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    reply: { type: "string" },
    run_id: { oneOf: [{ type: "string" }, { type: "null" }] },
    epic_id: { oneOf: [{ type: "string" }, { type: "null" }] },
  },
};

function eng(ctx) {
  return ctx.get("mesEngine");
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

function dpPresentationMeta(_args, value) {
  if (value && value.dev_pipeline_ui) {
    const ui = value.dev_pipeline_ui;
    return { wb: { t: "dp-timeline", ui: ui, run_id: value.run_id || ui.run_id } };
  }
  if (value && value.run_id) {
    return { wb: { t: "dp-run", run_id: value.run_id } };
  }
  return { wb: { t: "dp-none" } };
}

/** begin：一行 Agent 确认 + 自定义 toolview；禁止再渲染空串（模型会当成失败连调） */
function dpCardOnlyRender(args, value, fallback) {
  if (!value || value.ok === false || !value.dev_pipeline_ui) {
    return fallback(args, value);
  }
  const ack = String((value && value.reply) || "").trim();
  return [
    {
      type: "text",
      text:
        ack ||
        "已启动需求→上线；进度见过程流卡，禁止再调 mes_dev_pipeline_begin，禁止让用户自查绿开关。",
    },
  ];
}

function dpSilentRender(_args, value) {
  if (!value || value.ok === false) {
    const detail = String((value && (value.detail || value.reply)) || "操作失败");
    return [{ type: "text", text: detail }];
  }
  // 禁止返回空串：模型会当成失败再连调 / 误导用户去点确认卡
  const ack = String((value && value.reply) || "").trim();
  const rid = String((value && value.run_id) || "").trim();
  return [
    {
      type: "text",
      text:
        ack ||
        (rid
          ? "已继续过程流（run_id=" + rid + "），进度看上方过程流卡。"
          : "已继续过程流，进度看上方过程流卡。"),
    },
  ];
}

export function apply(ctx) {
  const e = eng(ctx);
  if (!e) {
    console.error("[dev-pipeline] mesEngine 未提供：请启用 mes-bridge");
    return;
  }
  const t = Math.max(e.TIMEOUT_MS || 60000, 120000);

  ctx.tools.register(
    e.defineTool({
      name: "mes_dev_pipeline_begin",
      description:
        "【一体化唯一入口 · 仅当输入框旁绿色「需求→上线」已开】用户发需求后本轮只调一次本工具。" +
        "**普通写码（开关关闭，含贴图）禁止调用本工具**，应走 mes_code_dev_begin / 写码 begin + 可选 mes_vision_understand。" +
        "message=用户原话；聊天贴图在开关开启时会自动进入会话 pending，begin 自动合并识图，也可传 image_ids。" +
        "成功时 reply 会有一行确认（含 run_id）且挂过程流卡：这就是成功，不是失败。" +
        "用户追问/补充/贴新图：再调本工具（message=追问原话）→ **新开独立 Run**（结束旧过程流，不并账本，但关联同会话上一任务上下文）；禁止只调 advance。" +
        "禁止因「看起来没字」空转；禁止让用户检查绿开关/转写截图；禁止用 advance 刷 UI；禁止让用户点对话写码确认卡。" +
        "默认 auto_run：开跑后自动真实执行写码→验证→审码→提交→PR→部署。" +
        "禁止开跑前 ask_user_question 抢 UI / zr_cursor_begin 抢跑。",
      parameters: {
        message: {
          type: "string",
          required: true,
          description:
            "必填：用户需求原话（含正文）。若只有贴图、几乎无字，也须传非空占位如「（附图需求）」；附图由开关开启时自动进 pending，不必手填 image_ids。",
        },
        image_ids: {
          type: "string",
          description:
            "可选：引擎已上传的视觉附件 id（vimg-…，逗号分隔）。" +
            "聊天贴图在「需求→上线」开启下会自动上传 pending，begin 自动合并，通常不必手填。",
        },
        workspace: {
          type: "string",
          description:
            "强烈建议传入：本机工程绝对路径（= 顶栏已选工作区）。缺省时引擎会回退写码配置 code_dev.default_workspace；仍空则验证步会卡住。",
        },
        dsh_session_id: {
          type: "string",
          description: "可选：DSH 会话 id；缺省则读宿主注入的当前会话",
        },
      },
      output: {
        schema: OUTPUT_SCHEMA,
        render: (a, v) => dpCardOnlyRender(a, v, e.resultRender),
        presentationMeta: dpPresentationMeta,
      },
      timeoutMs: t,
      async execute(args) {
        const message = String((args && args.message) || "").trim();
        const workspace = String((args && args.workspace) || "").trim();
        const imageIds = String((args && args.image_ids) || "").trim();
        const sid = resolveDshSessionId(args, e);
        const cmd = ["dev-pipeline-begin", "message=" + message];
        if (workspace) cmd.push("workspace=" + workspace);
        if (sid) cmd.push("dsh_session_id=" + sid);
        if (imageIds) cmd.push("image_ids=" + imageIds);
        return await e.runEngine(cmd);
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_dev_pipeline_status",
      description:
        "【排障专用】一般不要先调本工具。开关已绿时直接 mes_dev_pipeline_begin。dsh_session_id 可省略（宿主自动注入当前会话 id）。",
      parameters: {
        dsh_session_id: {
          type: "string",
          description: "可选：DSH 会话 id；缺省则读当前会话",
        },
      },
      output: { schema: OUTPUT_SCHEMA, render: e.resultRender },
      timeoutMs: 60000,
      async execute(args) {
        const sid = resolveDshSessionId(args, e);
        const cmd = ["dev-pipeline-status"];
        if (sid) cmd.push("dsh_session_id=" + sid);
        return await e.runEngine(cmd);
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_dev_pipeline_advance",
      description: "【重试/继续】一体化 Run 从当前或指定步继续。进度仍看 begin 那张卡，本工具不另开 UI。",
      parameters: {
        run_id: { type: "string", required: true, description: "Run id（dpj-*）" },
        step_id: { type: "string", description: "可选：从指定步重试" },
      },
      output: { schema: OUTPUT_SCHEMA, render: dpSilentRender },
      timeoutMs: t,
      async execute(args) {
        const rid = String((args && args.run_id) || "").trim();
        const step = String((args && args.step_id) || "").trim();
        const cmd = ["dev-pipeline-advance", rid];
        if (step) cmd.push("step=" + step);
        return await e.runEngine(cmd);
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_dev_pipeline_cancel",
      description:
        "【停止一体化】取消进行中的需求→上线 Run。用户说暂停/取消/停止任务时调用；也可由时间线卡「停止任务」按钮触发（HTTP）。",
      parameters: {
        run_id: { type: "string", required: true, description: "Run id（dpj-*）" },
        reason: { type: "string", description: "可选停止原因" },
      },
      output: { schema: OUTPUT_SCHEMA, render: dpSilentRender },
      timeoutMs: 60000,
      async execute(args) {
        const rid = String((args && args.run_id) || "").trim();
        const reason = String((args && args.reason) || "").trim();
        const cmd = ["dev-pipeline-cancel", rid];
        if (reason) cmd.push("reason=" + reason);
        return await e.runEngine(cmd);
      },
    }),
  );

  ctx.tools.register(
    e.defineTool({
      name: "mes_dev_pipeline_confirm_step",
      description:
        "【一体化 HITL】写码（5）或车道交接步（7/8/9/10）完成后确认。进度仍更新 begin 那张卡，本工具不另开 UI。" +
        "步骤 5 可填 cursor_job_id；验证失败修复后再次确认 5。",
      parameters: {
        run_id: { type: "string", required: true },
        step_id: { type: "string", required: true, description: "5/7/8/9/10" },
        decision: { type: "string", description: "pass 或 fail，默认 pass" },
        cursor_job_id: { type: "string", description: "步骤 5 可选" },
        no_code_change: { type: "boolean", description: "步骤 5：无代码变更" },
        note: { type: "string", description: "说明" },
      },
      output: { schema: OUTPUT_SCHEMA, render: dpSilentRender },
      timeoutMs: t,
      async execute(args) {
        const rid = String((args && args.run_id) || "").trim();
        const sid = String((args && args.step_id) || "").trim();
        const cmd = ["dev-pipeline-confirm-step", rid, "step=" + sid];
        const dec = String((args && args.decision) || "").trim();
        if (dec) cmd.push("decision=" + dec);
        const cj = String((args && args.cursor_job_id) || "").trim();
        if (cj) cmd.push("cursor_job_id=" + cj);
        if (args && args.no_code_change) cmd.push("no_code_change=1");
        const note = String((args && args.note) || "").trim();
        if (note) cmd.push("note=" + note);
        return await e.runEngine(cmd);
      },
    }),
  );
}
