import assert from "node:assert/strict";
import test from "node:test";

import {
  installSessionV4SourceShim,
  patchAgentInject,
  patchSessionAppend,
  rewriteV4MessageSource,
  rewriteV4Payload,
} from "../lib/session-v4-source.js";

function assertV4Admits(source) {
  if (
    !source ||
    typeof source !== "object" ||
    typeof source.kind !== "string" ||
    source.kind.length === 0 ||
    source.kind === "plugin"
  ) {
    throw new Error("format v4 message requires a producer-owned source kind");
  }
}

test("dsh-knowledge 召回包装改成 plugin:dsh-knowledge", () => {
  const src = rewriteV4MessageSource({
    kind: "plugin",
    plugin: "dsh-knowledge",
    form: "recall",
  });
  assert.equal(src.kind, "plugin:dsh-knowledge");
  assert.equal(src.plugin, undefined);
  assert.equal(src.form, "recall");
  assert.doesNotThrow(() => assertV4Admits(src));
});

test("空 kind / 字面 plugin 写入会被 v4 拒，改写后通过", () => {
  assert.throws(() => assertV4Admits({ kind: "plugin", plugin: "dsh-esc" }));
  assert.throws(() => assertV4Admits({ kind: "" }));
  assert.throws(() => assertV4Admits({}));
  assert.doesNotThrow(() =>
    assertV4Admits(rewriteV4MessageSource({ kind: "plugin", plugin: "dsh-esc" })),
  );
  assert.equal(rewriteV4MessageSource({ kind: "" }, "dsh-mes-bridge").kind, "plugin:dsh-mes-bridge");
});

test("已是 v4 / 真用户 kind 保持引用", () => {
  const user = { kind: "user" };
  const owned = { kind: "plugin:dsh-knowledge", form: "recall" };
  assert.equal(rewriteV4MessageSource(user), user);
  assert.equal(rewriteV4MessageSource(owned), owned);
});

test("第一方同名生产方不加 plugin: 前缀", () => {
  const src = rewriteV4MessageSource({ kind: "plugin", plugin: "time-context" });
  assert.equal(src.kind, "time-context");
});

test("append 载荷嵌套 message.source 一并改写", () => {
  const payload = rewriteV4Payload({
    message: {
      role: "user",
      content: [{ type: "text", text: "召回" }],
      source: { kind: "plugin", plugin: "dsh-knowledge", form: "recall" },
    },
  });
  assert.equal(payload.message.source.kind, "plugin:dsh-knowledge");
  assert.doesNotThrow(() => assertV4Admits(payload.message.source));
});

test("patchSessionAppend 让退役包装能写入", () => {
  const seen = [];
  const session = {
    append(type, data) {
      assertV4Admits(data && data.source);
      seen.push({ type, kind: data.source.kind });
      return { ok: true };
    },
  };
  patchSessionAppend(session);
  session.append("user/message", {
    role: "user",
    content: [{ type: "text", text: "增加员工工时报表" }],
    source: { kind: "plugin", plugin: "dsh-knowledge", form: "recall" },
  });
  assert.equal(seen[0].kind, "plugin:dsh-knowledge");
});

test("prototype append 覆盖后续 session 实例", () => {
  function Session() {}
  Session.prototype.append = function (type, data) {
    assertV4Admits(data && data.source);
    return data.source.kind;
  };
  const a = new Session();
  patchSessionAppend(Object.getPrototypeOf(a));
  const b = new Session();
  const kind = b.append("user/message", {
    source: { kind: "plugin", plugin: "dsh-knowledge", form: "recall" },
  });
  assert.equal(kind, "plugin:dsh-knowledge");
});

test("agent.inject 同样改写", () => {
  const injected = [];
  const agent = {
    inject(msg) {
      assertV4Admits(msg.source);
      injected.push(msg.source.kind);
    },
  };
  patchAgentInject(agent);
  agent.inject({
    content: [{ type: "text", text: "x" }],
    source: { kind: "plugin", plugin: "dsh-esc" },
  });
  assert.equal(injected[0], "plugin:dsh-esc");
});

test("installSessionV4SourceShim 钉 session/event", () => {
  const handlers = [];
  const ctx = {
    on(type, fn) {
      handlers.push({ type, fn });
    },
    get() {
      throw new Error("no sessions");
    },
  };
  installSessionV4SourceShim(ctx);
  assert.equal(handlers.some((h) => h.type === "session/event"), true);
  const proto = {
    append(type, data) {
      assertV4Admits(data.source);
      return data.source.kind;
    },
  };
  const session = Object.create(proto);
  handlers[0].fn(session, { type: "user/message" });
  const kind = session.append("user/message", {
    source: { kind: "plugin", plugin: "dsh-knowledge" },
  });
  assert.equal(kind, "plugin:dsh-knowledge");
});
