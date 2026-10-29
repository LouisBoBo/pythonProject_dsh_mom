/**
 * DSH 会话 format v4：写入路径硬拒 { kind:'plugin', plugin:X } 和空 kind。
 * 读路径会把旧包装改成 plugin:X，写路径不会——第三方召回一注入，整轮变
 * 「本轮运行失败 format v4 message requires a producer-owned source kind」。
 *
 * 不能改 DSH / @zhongruan 插件源码。mes-bridge 在 session.append / agent.inject
 * 入口把退役包装改成 producer-owned kind，再交给宿主。
 */

const WB_V4_APPEND = "__wbV4AppendPatched";
const WB_V4_INJECT = "__wbV4InjectPatched";

/** 与 DSH v3→v4 producerKind 同名第一方，保留原 kind，不加 plugin: 前缀。 */
const SAME_NAME_PRODUCERS = new Set([
  "tool-jobs",
  "user-approval",
  "plan-mode",
  "time-context",
  "tmux-context",
  "schedule",
  "compact",
  "agent-instructions",
  "cordis-host-runner",
  "tools-code-mode",
  "system-prompt",
]);

function producerKind(pluginName) {
  const raw = String(pluginName || "").trim() || "dsh-mes-bridge";
  if (raw.startsWith("plugin:")) return raw;
  const short = raw.replace(/^@[^/]+\//, "");
  if (SAME_NAME_PRODUCERS.has(raw) || SAME_NAME_PRODUCERS.has(short)) {
    return SAME_NAME_PRODUCERS.has(raw) ? raw : short;
  }
  return "plugin:" + raw;
}

/**
 * 把一条 message.source 改成 v4 可写入形态。
 * 已是 user / plugin:x / 第一方 kind 的原样返回（保持引用）。
 */
export function rewriteV4MessageSource(source, fallbackName) {
  const fallback = String(fallbackName || "dsh-mes-bridge").trim() || "dsh-mes-bridge";
  if (!source || typeof source !== "object") {
    return { kind: producerKind(fallback) };
  }
  const kind = String(source.kind || "").trim();
  if (kind && kind !== "plugin") return source;
  const plugin = String(source.plugin || fallback).trim() || fallback;
  const next = Object.assign({}, source);
  next.kind = producerKind(plugin);
  delete next.plugin;
  return next;
}

function looksLikeChatMessage(data) {
  if (!data || typeof data !== "object") return false;
  if (Array.isArray(data.content)) return true;
  const role = String(data.role || "");
  return role === "user" || role === "assistant" || role === "system";
}

function needsSourceRewrite(source) {
  if (!source || typeof source !== "object") return false;
  const kind = String(source.kind || "").trim();
  return !kind || kind === "plugin";
}

/**
 * 改写 append / inject 载荷里所有 message.source。
 * 不给「无 source 的真用户消息」凭空加 plugin: 前缀。
 */
export function rewriteV4Payload(data, fallbackName) {
  if (!data || typeof data !== "object") return data;
  let next = data;
  function touch() {
    if (next === data) next = Object.assign({}, data);
    return next;
  }
  if (needsSourceRewrite(data.source)) {
    touch().source = rewriteV4MessageSource(data.source, fallbackName);
  } else if (
    looksLikeChatMessage(data) &&
    !data.source &&
    (data.form === "recall" || data.form === "notice" || data.plugin)
  ) {
    touch().source = rewriteV4MessageSource(
      { plugin: data.plugin, form: data.form },
      fallbackName,
    );
  }
  if (data.message && typeof data.message === "object") {
    const msg = rewriteV4Payload(data.message, fallbackName);
    if (msg !== data.message) touch().message = msg;
  }
  if (Array.isArray(data.messages)) {
    const msgs = data.messages.map((m) => rewriteV4Payload(m, fallbackName));
    if (msgs.some((m, i) => m !== data.messages[i])) touch().messages = msgs;
  }
  if (Array.isArray(data.items)) {
    const items = data.items.map((m) => rewriteV4Payload(m, fallbackName));
    if (items.some((m, i) => m !== data.items[i])) touch().items = items;
  }
  return next;
}

export function patchSessionAppend(session, fallbackName) {
  if (!session || typeof session.append !== "function") return session;
  if (session[WB_V4_APPEND]) return session;
  const orig = session.append;
  session[WB_V4_APPEND] = true;
  session.append = function (type, data, ...rest) {
    const fixed = rewriteV4Payload(data, fallbackName);
    return orig.call(this, type, fixed, ...rest);
  };
  return session;
}

export function patchAgentInject(agent, fallbackName) {
  if (!agent || typeof agent.inject !== "function") return agent;
  if (agent[WB_V4_INJECT]) return agent;
  const orig = agent.inject.bind(agent);
  agent[WB_V4_INJECT] = true;
  agent.inject = function (msg, ...rest) {
    return orig(rewriteV4Payload(msg, fallbackName), ...rest);
  };
  if (agent.session) patchSessionTree(agent.session, fallbackName);
  return agent;
}

function patchSessionTree(session, fallbackName) {
  if (!session || typeof session !== "object") return;
  try {
    const proto = Object.getPrototypeOf(session);
    if (proto && typeof proto.append === "function") {
      patchSessionAppend(proto, fallbackName);
    }
  } catch {
    /* ignore */
  }
  if (Object.prototype.hasOwnProperty.call(session, "append")) {
    patchSessionAppend(session, fallbackName);
  }
}

function wrapSessionFactory(sessions, key, fallbackName) {
  if (!sessions || typeof sessions[key] !== "function") return;
  const orig = sessions[key];
  if (orig.__wbV4Wrapped) return;
  const wrapped = function (...args) {
    const s = orig.apply(this, args);
    if (s && typeof s.then === "function") {
      return s.then(function (sess) {
        patchSessionTree(sess, fallbackName);
        return sess;
      });
    }
    patchSessionTree(s, fallbackName);
    return s;
  };
  wrapped.__wbV4Wrapped = true;
  sessions[key] = wrapped;
}

/**
 * 宿主加载时安装。session/event 对已发生的 append 来不及改，
 * 所以同时钉 prototype，让同一进程后面的知识召回 / ESC 注入走改写。
 */
export function installSessionV4SourceShim(ctx, fallbackName) {
  const name = fallbackName || "dsh-mes-bridge";
  try {
    ctx.on("session/event", function (session) {
      patchSessionTree(session, name);
    });
  } catch {
    /* ignore */
  }
  try {
    const sessions = ctx.get("sessions");
    if (sessions && typeof sessions === "object") {
      for (const key of ["get", "fork", "create", "open"]) {
        wrapSessionFactory(sessions, key, name);
      }
      if (typeof sessions.values === "function") {
        for (const s of sessions.values()) patchSessionTree(s, name);
      }
    }
  } catch {
    /* 无 sessions 服务时只靠 session/event */
  }
  console.log("[mes-bridge] 已安装会话 v4 source.kind 改写（kind:plugin → plugin:<名>）");
}
