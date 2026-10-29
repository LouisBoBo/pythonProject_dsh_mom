import { maskVendorUiText } from "./ui-vendor-mask.js";

export function installSettings(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect,
      useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession,
      authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine,
      fetchEngineApi = ctx.fetchEngineApi, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual,
      resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace,
      textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage,
      lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement,
      WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;

function field(label, props, full) {
  var p = props || {};
  return h(
    "div",
    { className: "wb-set-field" + (full ? " full" : "") },
    h("label", null, maskVendorUiText(label)),
    p.multiline ? h("textarea", p) : h("input", p),
  );
}

var WB_SECRET_MASK = "••••••••••••";

function secretMaskConfigured(s) {
  var t = String(s || "");
  return t === WB_SECRET_MASK || /^•+$/.test(t);
}
// 宿主设置侧栏重复页：只认 WorkBuddy 配置中心「写码」（图二），藏插件自带「Cursor 对话写码」配置页（图一）
var HOST_SET_HIDE_LABELS = ["远端审码", "Cursor 对话写码", "Cursor 写码"];

var _wbHostHideCleanup = null;
function hideHostSettingsDupes() {
  if (typeof document === "undefined") return function () {};
  if (_wbHostHideCleanup) return _wbHostHideCleanup;
  var marked = [];
  function labelMatch(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    for (var i = 0; i < HOST_SET_HIDE_LABELS.length; i++) {
      var lab = HOST_SET_HIDE_LABELS[i];
      if (t === lab || t.indexOf(lab) >= 0) return true;
    }
    return false;
  }
  function scan() {
    var nodes = document.querySelectorAll("button, [class*='_navCell'], [role='tab']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      // 只藏宿主设置侧栏，勿藏 WorkBuddy 内二级导航
      if (el.closest && el.closest(".wb-set")) continue;
      var text = String(el.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!labelMatch(text)) continue;
      var cell =
        (el.closest && (el.closest("[class*='_navCell']") || el.closest("[role='tab']"))) || el;
      if (cell.closest && cell.closest(".wb-set")) continue;
      if (cell.getAttribute("data-wb-host-hide") === "1") continue;
      cell.setAttribute("data-wb-host-hide", "1");
      marked.push(cell);
    }
  }
  scan();
  var obs =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(function () {
          scan();
        })
      : null;
  if (obs) obs.observe(document.body, { childList: true, subtree: true });
  _wbHostHideCleanup = function () {
    if (obs) obs.disconnect();
    marked.forEach(function (el) {
      try {
        el.removeAttribute("data-wb-host-hide");
      } catch (e) {}
    });
    _wbHostHideCleanup = null;
  };
  return _wbHostHideCleanup;
}

function WbRemoteReviewPanel(props) {
  ensureCss();
  var reportStatus = (props && props.reportStatus) || null;
  var apiRef = (props && props.apiRef) || null;
  // 本机插件默认监听；管理端地址写死，不再暴露 host/port/路径前缀
  var RR_SVC_BASE = "http://127.0.0.1:18787";
  var draftState = useState({
    engine: "http://127.0.0.1:8000",
    listen: "127.0.0.1",
    port: "18787",
    secret: "",
    secretConfigured: false,
    feishuAppId: "",
    feishuAppSecret: "",
    feishuAppSecretConfigured: false,
    feishuFolderToken: "",
    feishuWikiSpaceId: "",
    feishuWikiParentNodeToken: "",
    webhook: "",
    dataRoot: "",
  });
  var draft = draftState[0];
  var setDraft = draftState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var msgState = useState("");
  var msg = msgState[0];
  var setMsg = msgState[1];
  var msgOkState = useState(false);
  var msgOk = msgOkState[0];
  var setMsgOk = msgOkState[1];
  var healthState = useState("");
  var health = healthState[0];
  var setHealth = healthState[1];

  function setStatus(nextBusy, nextMsg, nextOk) {
    setBusy(!!nextBusy);
    if (nextMsg != null) setMsg(String(nextMsg));
    if (nextOk != null) setMsgOk(!!nextOk);
    if (reportStatus) reportStatus(!!nextBusy, nextMsg, nextOk);
  }

  function base() {
    return RR_SVC_BASE;
  }

  function secretForSave(v) {
    var s = String(v || "").trim();
    if (!s || s === WB_SECRET_MASK || /^•+$/.test(s)) return undefined;
    return s;
  }

  function loadConfig() {
    setStatus(true, "加载中…", false);
    fetch(base() + "/api/config")
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error((x.d && x.d.detail) || "无法加载：请先启用「远端审码」插件");
        }
        var c = x.d.config;
        setDraft({
          engine: c.engine || "http://127.0.0.1:8000",
          listen: c.listen || "127.0.0.1",
          port: String(c.port != null ? c.port : 18787),
          secret: c.secretConfigured ? WB_SECRET_MASK : "",
          secretConfigured: !!c.secretConfigured,
          feishuAppId: c.feishuAppId || "",
          feishuAppSecret: c.feishuAppSecretConfigured ? WB_SECRET_MASK : "",
          feishuAppSecretConfigured: !!c.feishuAppSecretConfigured,
          feishuFolderToken: c.feishuFolderToken || "",
          feishuWikiSpaceId: c.feishuWikiSpaceId || "",
          feishuWikiParentNodeToken: c.feishuWikiParentNodeToken || "",
          webhook: c.webhook || "",
          dataRoot: c.dataRoot || "",
        });
        setStatus(false, "已加载远端审码配置（本机，不进 git）", true);
      })
      .catch(function (e) {
        setStatus(false, "加载失败：" + (e && e.message ? e.message : String(e)), false);
      });
  }

  function saveConfig() {
    setStatus(true, "保存中…", false);
    if (!String(draft.feishuAppId || "").trim()) {
      setStatus(false, "保存失败：请填写飞书 App ID", false);
      return;
    }
    if (!draft.feishuAppSecretConfigured && !secretForSave(draft.feishuAppSecret)) {
      setStatus(false, "保存失败：请填写飞书 App Secret", false);
      return;
    }
    var payload = {
      engine: draft.engine,
      listen: draft.listen,
      port: draft.port,
      secret: secretForSave(draft.secret),
      feishuAppId: draft.feishuAppId,
      feishuAppSecret: secretForSave(draft.feishuAppSecret),
      feishuFolderToken: draft.feishuFolderToken,
      feishuWikiSpaceId: draft.feishuWikiSpaceId,
      feishuWikiParentNodeToken: draft.feishuWikiParentNodeToken,
    };
    fetch(base() + "/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: payload }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok) throw new Error((x.d && x.d.detail) || "保存失败");
        setStatus(false, (x.d.detail || "已保存") + (x.d.note ? "；" + x.d.note : ""), true);
        loadConfig();
      })
      .catch(function (e) {
        setStatus(false, "保存失败：" + (e && e.message ? e.message : String(e)), false);
      });
  }

  function checkHealth() {
    setHealth("检测中…");
    fetch(base() + "/health")
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        setHealth((d && d.ok ? "OK" : "FAIL") + " · " + ((d && d.detail) || JSON.stringify(d).slice(0, 120)));
      })
      .catch(function (e) {
        setHealth("无法连接 " + base() + "：" + (e && e.message ? e.message : e));
      });
  }

  useEffect(function () {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (apiRef) {
    apiRef.current = { save: saveConfig, load: loadConfig };
  }

  function patch(k, v) {
    var n = Object.assign({}, draft);
    n[k] = v;
    setDraft(n);
  }

  return h(
    "div",
    { className: "wb-set-card" },
    h("h3", null, "远端审码"),
    h(
      "div",
      { className: "body" },
      h(
        "p",
        { className: "wb-set-hint" },
        "Webhook 触发后调用本机审码并写飞书。配置落本机 ~/.zhongruan/remote-review，不进业务 git；用底部「保存配置」。",
      ),
      h("div", { className: "wb-set-grid" },
        field("WorkBuddy 引擎地址", {
          value: draft.engine,
          onChange: function (e) {
            patch("engine", e.target.value);
          },
        }, true),
        field("飞书 App ID", {
          value: draft.feishuAppId,
          onChange: function (e) {
            patch("feishuAppId", e.target.value);
          },
        }, true),
        field(draft.feishuAppSecretConfigured ? "飞书 App Secret（已保存）" : "飞书 App Secret", {
          type: "password",
          autoComplete: "new-password",
          value: draft.feishuAppSecret,
          onFocus: function () {
            if (draft.feishuAppSecret === WB_SECRET_MASK) patch("feishuAppSecret", "");
          },
          onChange: function (e) {
            patch("feishuAppSecret", e.target.value);
          },
        }, true),
        field("文档库 space_id", {
          value: draft.feishuWikiSpaceId,
          onChange: function (e) {
            patch("feishuWikiSpaceId", e.target.value);
          },
        }, true),
        field("Webhook 监听", {
          value: draft.listen,
          onChange: function (e) {
            patch("listen", e.target.value);
          },
        }),
        field("Webhook 端口", {
          value: draft.port,
          onChange: function (e) {
            patch("port", e.target.value);
          },
        }),
        field(draft.secretConfigured ? "Webhook 密钥（已保存）" : "Webhook 密钥（可选）", {
          type: "password",
          autoComplete: "new-password",
          value: draft.secret,
          onFocus: function () {
            if (draft.secret === WB_SECRET_MASK) patch("secret", "");
          },
          onChange: function (e) {
            patch("secret", e.target.value);
          },
        }, true),
      ),
      h(
        "p",
        { className: "wb-set-hint" },
        "Webhook：" + (draft.webhook || base() + "/webhook") + (draft.dataRoot ? " · " + draft.dataRoot : ""),
      ),
      h(
        "div",
        { className: "wb-set-actions" },
        h(
          "button",
          { type: "button", className: "wb-set-btn", disabled: busy, onClick: checkHealth },
          "检测服务",
        ),
        !reportStatus && msg
          ? h("span", { className: "wb-set-msg" + (msgOk ? " ok" : " err") }, maskVendorUiText(msg))
          : null,
      ),
      health ? h("p", { className: "wb-set-hint" }, maskVendorUiText(health)) : null,
    ),
  );
}

function WbCursorCodingPanel(props) {
  ensureCss();
  var reportStatus = (props && props.reportStatus) || null;
  var apiRef = (props && props.apiRef) || null;
  var draftState = useState({
    port: "18788",
    cursorApiKey: "",
    cursorKeyConfigured: false,
    writeScopeText: "",
  });
  var draft = draftState[0];
  var setDraft = draftState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var msgState = useState("");
  var msg = msgState[0];
  var setMsg = msgState[1];
  var msgOkState = useState(false);
  var msgOk = msgOkState[0];
  var setMsgOk = msgOkState[1];

  function setStatus(nextBusy, nextMsg, nextOk) {
    setBusy(!!nextBusy);
    if (nextMsg != null) setMsg(String(nextMsg));
    if (nextOk != null) setMsgOk(!!nextOk);
    if (reportStatus) reportStatus(!!nextBusy, nextMsg, nextOk);
  }

  function configUrl() {
    return engineBase() + "/api/cursor-coding/config";
  }

  function remember() {
    try {
      localStorage.setItem("dsh-cursor-coding-host", "127.0.0.1");
      localStorage.setItem("dsh-cursor-coding-port", String(draft.port || "18788").trim());
    } catch (e) {}
  }

  function loadConfig() {
    setStatus(true, "加载中…", false);
    fetch(configUrl())
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.detail) || "加载失败");
        var c = data.config || {};
        setDraft({
          port: String(c.port || 18788),
          cursorApiKey: c.cursorKeyConfigured ? WB_SECRET_MASK : "",
          cursorKeyConfigured: Boolean(c.cursorKeyConfigured),
          writeScopeText: c.writeScopeText || "",
        });
        remember();
        setStatus(false, "已加载公共模型配置（本机，不进 git）", true);
      })
      .catch(function (err) {
        var msg = String(err && err.message ? err.message : err);
        if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg) || /load failed/i.test(msg)) {
          msg = "无法连接 WorkBuddy 引擎读取公共模型配置。请确认引擎已启动。";
        }
        setStatus(false, msg, false);
      });
  }

  function saveConfig() {
    setStatus(true, "保存中…", false);
    remember();
    var key = String(draft.cursorApiKey || "").trim();
    /* 端口 / 可写范围仍按本机已有值回写，界面不再暴露给普通用户 */
    var body = {
      listen: "127.0.0.1",
      port: draft.port,
      writeScopeText: draft.writeScopeText,
    };
    if (key && key !== WB_SECRET_MASK && !/^•+$/.test(key)) body.cursorApiKey = key;
    fetch(configUrl(), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (out) {
        if (!out.d || !out.d.ok) throw new Error((out.d && out.d.detail) || "保存失败");
        setStatus(false, out.d.detail || "已保存", true);
        loadConfig();
      })
      .catch(function (err) {
        var msg = String(err && err.message ? err.message : err);
        if (/failed to fetch/i.test(msg) || /networkerror/i.test(msg) || /load failed/i.test(msg)) {
          msg = "无法连接 WorkBuddy 引擎保存公共模型 Key。请确认引擎已启动。";
        }
        setStatus(false, msg, false);
      });
  }

  useEffect(function () {
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (apiRef) {
    apiRef.current = { save: saveConfig, load: loadConfig };
  }

  return h(
    "div",
    { className: "wb-set-card" },
    h("h3", null, "公共模型"),
    h(
      "div",
      { className: "body" },
      h(
        "p",
        { className: "wb-set-hint" },
        "本页配置公共模型 API Key（保存后同步到对话写码）。请用底部「保存配置」。",
      ),
      h(
        "div",
        { className: "wb-set-grid" },
        field("API Key", {
          type: "password",
          autoComplete: "new-password",
          value: draft.cursorApiKey,
          placeholder: draft.cursorKeyConfigured ? "已配置，留空保存则保持不变" : "必填",
          onChange: function (e) {
            setDraft(Object.assign({}, draft, { cursorApiKey: e.target.value }));
          },
        }, true),
      ),
      !reportStatus && msg
        ? h("p", { className: "wb-set-msg" + (msgOk ? " ok" : " err") }, maskVendorUiText(msg))
        : null,
    ),
  );
}

function emptyDraft() {
  return {
    mes: {
      base_url: "",
      auth_type: "password",
      username: "",
      password: "",
      token: "",
      enterprise_code: "",
      extra_headers: "{}",
      verify_ssl: true,
      timeout: 30,
    },
    deepseek: llmApplySlice({ provider: "deepseek" }),
    vision: {
      api_key: "",
      base_url: "",
      model: "",
    },
    code_dev: {
      enabled: false,
      cursor_api_key: "",
      model: "composer-2.5",
      max_concurrent: 1,
      cursor_timeout_sec: 2700,
      default_workspace: "",
    },
    code_review: {
      enabled: true,
      max_files: 40,
      max_file_bytes: 120000,
      max_total_bytes: 800000,
      default_workspace: "",
    },
    code_commit: {
      enabled: true,
      default_workspace: "",
      work_branch: "",
      remote_name: "origin",
      default_push: true,
      use_skill_review: true,
      allow_blocked: false,
      max_files: 80,
    },
    code_deploy: {
      enabled: false,
      provider: "local_ssh",
      unified_product: true,
      default_workspace: "",
      default_ref: "HEAD",
      default_env: "staging",
      env_whitelist: ["staging"],
      allow_production: false,
      ssh_host: "",
      ssh_user: "",
      ssh_port: 22,
      ssh_key_path: "",
      ssh_app_path: "",
      entry_url: "",
      health_url: "",
      health_timeout_sec: 8,
    },
    automations: {
      wecom_webhook_key: "",
      wecom_push_enabled: false,
      wecom_push_dry_run: false,
      feishu_app_id: "",
      feishu_app_secret: "",
      feishu_bitable_enabled: false,
      feishu_bitable_dry_run: false,
    },
  };
}

function patchDraft(setDraft, path, value) {
  setDraft(function (prev) {
    var next = Object.assign({}, prev);
    var cur = next;
    for (var i = 0; i < path.length - 1; i++) {
      var k = path[i];
      cur[k] = Object.assign({}, cur[k] || {});
      cur = cur[k];
    }
    cur[path[path.length - 1]] = value;
    return next;
  });
}

function llmDefaultSlot(prov) {
  if (prov === "ollama") {
    return { api_key: "", base_url: "http://127.0.0.1:11434", model: "" };
  }
  if (prov === "openai_compat") {
    return { api_key: "", base_url: "", model: "" };
  }
  return { api_key: "", base_url: "https://api.deepseek.com", model: "deepseek-chat" };
}

function llmDefaultByProvider() {
  return {
    deepseek: llmDefaultSlot("deepseek"),
    ollama: llmDefaultSlot("ollama"),
    openai_compat: llmDefaultSlot("openai_compat"),
  };
}

function llmNormalizeProvider(raw) {
  var p = raw || "deepseek";
  if (p === "none") p = "deepseek";
  if (p !== "deepseek" && p !== "ollama" && p !== "openai_compat") p = "deepseek";
  return p;
}

function llmFlushSlice(ds, prov) {
  var by = Object.assign({}, llmDefaultByProvider(), ds.by_provider || {});
  var prev = by[prov] || {};
  var key = ds.api_key || "";
  if (!key && secretMaskConfigured(prev.api_key)) key = prev.api_key;
  by[prov] = {
    api_key: key,
    base_url: ds.base_url || "",
    model: ds.model || "",
  };
  return by;
}

function llmApplySlice(ds) {
  var prov = llmNormalizeProvider(ds.provider);
  var by = Object.assign({}, llmDefaultByProvider());
  var rawBy = ds.by_provider;
  if (rawBy && typeof rawBy === "object") {
    ["deepseek", "ollama", "openai_compat"].forEach(function (name) {
      by[name] = Object.assign({}, llmDefaultSlot(name), rawBy[name] || {});
    });
  } else {
    var flat = {
      api_key: ds.api_key || "",
      base_url: ds.base_url || "",
      model: ds.model || "",
    };
    if (flat.api_key || flat.base_url || flat.model) {
      by[prov] = Object.assign({}, llmDefaultSlot(prov), flat);
    }
  }
  var slice = Object.assign({}, llmDefaultSlot(prov), by[prov] || {});
  return {
    provider: prov,
    by_provider: by,
    api_key: slice.api_key,
    base_url: slice.base_url,
    model: slice.model,
  };
}

function llmPrepareSave(ds) {
  var norm = llmApplySlice(ds || {});
  var prov = norm.provider;
  var by = llmFlushSlice(norm, prov);
  var active = by[prov];
  return {
    provider: prov,
    by_provider: by,
    api_key: active.api_key,
    base_url: active.base_url,
    model: active.model,
  };
}

function fetchAbout() {
  return fetch(engineBase() + "/api/about", { headers: authHeaders() })
    .then(function (r) {
      return r.json().then(function (d) {
        return { http: r.status, data: d };
      });
    })
    .catch(function (e) {
      return { http: 0, data: { ok: false, detail: (e && e.message) || "网络错误" } };
    });
}

function wbAccountMenuIcon(kind) {
  var stroke = "1.35";
  var svg = {
    className: "wb-account-menu-icon-svg",
    "aria-hidden": "true",
    width: 20,
    height: 20,
    viewBox: "0 0 20 20",
    fill: "none",
  };
  var ring = { cx: 10, cy: 10, r: 6.6, stroke: "currentColor", strokeWidth: stroke };
  var glyph = null;
  if (kind === "settings") {
    glyph = h(
      "svg",
      svg,
      h("path", {
        d: "M10 3.4 15.72 6.7V13.3L10 16.6 4.28 13.3V6.7L10 3.4Z",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinejoin: "round",
      }),
      h("circle", { cx: 10, cy: 10, r: 1.45, fill: "currentColor" }),
    );
  } else if (kind === "people") {
    glyph = h(
      "svg",
      svg,
      h("circle", {
        cx: 7.2,
        cy: 7.4,
        r: 2.35,
        stroke: "currentColor",
        strokeWidth: stroke,
      }),
      h("circle", {
        cx: 13.1,
        cy: 8.1,
        r: 1.9,
        stroke: "currentColor",
        strokeWidth: stroke,
      }),
      h("path", {
        d: "M2.8 15.2c.55-2.35 2.35-3.55 4.4-3.55s3.85 1.2 4.4 3.55",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinecap: "round",
      }),
      h("path", {
        d: "M11.2 14.55c.35-1.45 1.45-2.25 2.85-2.25 1.55 0 2.7.95 3.1 2.45",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinecap: "round",
      }),
    );
  } else if (kind === "help") {
    glyph = h(
      "svg",
      svg,
      h("circle", ring),
      h("path", {
        d: "M7.9 7.6c.35-1.15 1.35-1.9 2.75-1.9 1.55 0 2.65.95 2.65 2.25 0 1.05-.75 1.65-1.85 2.15-.75.35-1.05.7-1.05 1.35",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinecap: "round",
      }),
      h("circle", { cx: 10, cy: 14.15, r: .75, fill: "currentColor" }),
    );
  } else if (kind === "update") {
    glyph = h(
      "svg",
      svg,
      h("circle", ring),
      h("path", {
        d: "M10 7.1V12M7.8 9.4 10 7.1l2.2 2.3",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );
  } else {
    glyph = h(
      "svg",
      svg,
      h("path", {
        d: "M4.35 3.55h5.35a1.1 1.1 0 0 1 1.1 1.1v10.7a1.1 1.1 0 0 1-1.1 1.1H4.35a1.1 1.1 0 0 1-1.1-1.1V4.65a1.1 1.1 0 0 1 1.1-1.1Z",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinejoin: "round",
      }),
      h("path", {
        d: "M9.15 10h6.75M14.85 8.05l1.75 1.95-1.75 1.95",
        stroke: "currentColor",
        strokeWidth: stroke,
        strokeLinecap: "round",
        strokeLinejoin: "round",
      }),
    );
  }
  return h("span", { className: "wb-account-menu-icon", "aria-hidden": "true" }, glyph);
}

function WorkBuddyHeaderLogout(props) {
  ensureCss();
  var userState = useState(null);
  var user = userState[0];
  var setUser = userState[1];
  var openState = useState(false);
  var open = openState[0];
  var setOpen = openState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var panelState = useState(null);
  var panel = panelState[0];
  var setPanel = panelState[1];
  var feedbackState = useState("");
  var feedback = feedbackState[0];
  var setFeedback = feedbackState[1];
  var imagesState = useState([]);
  var images = imagesState[0];
  var setImages = imagesState[1];
  var previewImgState = useState(null);
  var previewImg = previewImgState[0];
  var setPreviewImg = previewImgState[1];
  var fileInputRef = useRef(null);
  var successCloseTimerRef = useRef(null);
  var panelBusyState = useState(false);
  var panelBusy = panelBusyState[0];
  var setPanelBusy = panelBusyState[1];
  var panelMsgState = useState("");
  var panelMsg = panelMsgState[0];
  var setPanelMsg = panelMsgState[1];
  var panelOkState = useState(false);
  var panelOk = panelOkState[0];
  var setPanelOk = panelOkState[1];
  var aboutState = useState(null);
  var about = aboutState[0];
  var setAbout = aboutState[1];
  var feedbackDoneState = useState(false);
  var feedbackDone = feedbackDoneState[0];
  var setFeedbackDone = feedbackDoneState[1];
  // 桌面壳自升级："" | "downloading" | "ready" | "installing"（方案见 docs/功能实现/桌面应用版本升级方案.md）
  var updPhaseState = useState("");
  var updPhase = updPhaseState[0];
  var setUpdPhase = updPhaseState[1];
  var updPctState = useState(0);
  var updPct = updPctState[0];
  var setUpdPct = updPctState[1];
  var updUnsubRef = useRef(null);
  // 每日首启自动检查：有新版本时弹简洁提示（不含更新日志）；null 表示不弹
  var autoUpdState = useState(null);
  var autoUpd = autoUpdState[0];
  var setAutoUpd = autoUpdState[1];
  var copyHintState = useState("");
  var copyHint = copyHintState[0];
  var setCopyHint = copyHintState[1];
  var peopleListState = useState([]);
  var peopleList = peopleListState[0];
  var setPeopleList = peopleListState[1];
  var peopleLoadingState = useState(false);
  var peopleLoading = peopleLoadingState[0];
  var setPeopleLoading = peopleLoadingState[1];
  var peopleFormOpenState = useState(false);
  var peopleFormOpen = peopleFormOpenState[0];
  var setPeopleFormOpen = peopleFormOpenState[1];
  var peopleFormState = useState({
    username: "",
    display_name: "",
    password: "",
    role: "user",
  });
  var peopleForm = peopleFormState[0];
  var setPeopleForm = peopleFormState[1];
  var peopleResetIdState = useState("");
  var peopleResetId = peopleResetIdState[0];
  var setPeopleResetId = peopleResetIdState[1];
  var peopleResetPwState = useState("");
  var peopleResetPw = peopleResetPwState[0];
  var setPeopleResetPw = peopleResetPwState[1];
  var peopleCapsCatalogState = useState([]);
  var peopleCapsCatalog = peopleCapsCatalogState[0];
  var setPeopleCapsCatalog = peopleCapsCatalogState[1];
  var peopleCapsUserIdState = useState("");
  var peopleCapsUserId = peopleCapsUserIdState[0];
  var setPeopleCapsUserId = peopleCapsUserIdState[1];
  /** 能力草稿：点开关只改本地，点「保存能力」才提交 */
  var peopleCapsDraftState = useState(null);
  var peopleCapsDraft = peopleCapsDraftState[0];
  var setPeopleCapsDraft = peopleCapsDraftState[1];
  var peopleCapsDirtyState = useState(false);
  var peopleCapsDirty = peopleCapsDirtyState[0];
  var setPeopleCapsDirty = peopleCapsDirtyState[1];
  var peopleDataDraftState = useState(null);
  var peopleDataDraft = peopleDataDraftState[0];
  var setPeopleDataDraft = peopleDataDraftState[1];
  var peopleDataDirtyState = useState(false);
  var peopleDataDirty = peopleDataDirtyState[0];
  var setPeopleDataDirty = peopleDataDirtyState[1];
  /** 共享知识库召回权限：文档目录 + 勾选草稿 */
  var peopleCkDocsState = useState([]);
  var peopleCkDocs = peopleCkDocsState[0];
  var setPeopleCkDocs = peopleCkDocsState[1];
  var peopleCkDraftState = useState(null);
  var peopleCkDraft = peopleCkDraftState[0];
  var setPeopleCkDraft = peopleCkDraftState[1];
  var peopleCkDirtyState = useState(false);
  var peopleCkDirty = peopleCkDirtyState[0];
  var setPeopleCkDirty = peopleCkDirtyState[1];
  var peopleCkLoadErrState = useState("");
  var peopleCkLoadErr = peopleCkLoadErrState[0];
  var setPeopleCkLoadErr = peopleCkLoadErrState[1];

  function refresh() {
    var sess = readAuthSession();
    if (!sess) {
      setUser(null);
      return;
    }
    setUser({
      username: sess.username || "",
      display_name: sess.display_name || sess.username || "",
      role: sess.role || "user",
    });
    fetchEngineApi("/api/auth/me", { headers: authHeaders() })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.authenticated && d.user) setUser(d.user);
        else if (d && d.ok === true && d.authenticated === false) setUser(null);
        /* 引擎抖动：保留侧栏账号展示，勿误显示未登录 */
      })
      .catch(function () {});
  }

  function clearFeedbackImages(list) {
    (list || images || []).forEach(function (it) {
      try {
        if (it && it.url) URL.revokeObjectURL(it.url);
      } catch (e0) {}
    });
  }

  function closePanel() {
    if (successCloseTimerRef.current) {
      clearTimeout(successCloseTimerRef.current);
      successCloseTimerRef.current = null;
    }
    if (updUnsubRef.current) {
      try {
        updUnsubRef.current();
      } catch (e0) {}
      updUnsubRef.current = null;
    }
    setUpdPhase("");
    setUpdPct(0);
    if (panel === "feedback") clearFeedbackImages();
    setPreviewImg(null);
    setPanel(null);
    setPanelBusy(false);
    setPanelMsg("");
    setPanelOk(false);
    setFeedbackDone(false);
    setFeedback("");
    setImages([]);
    setPeopleFormOpen(false);
    setPeopleResetId("");
    setPeopleResetPw("");
    setPeopleCapsUserId("");
    setPeopleCapsDraft(null);
    setPeopleCapsDirty(false);
    setPeopleDataDraft(null);
    setPeopleDataDirty(false);
    setPeopleCkDocs([]);
    setPeopleCkDraft(null);
    setPeopleCkDirty(false);
    setPeopleCkLoadErr("");
    setPeopleForm({
      username: "",
      display_name: "",
      password: "",
      role: "user",
    });
  }

  function findHostSettingsTrigger() {
    if (typeof document === "undefined") return null;
    var foot = document.querySelector("[class*='footArea']");
    if (foot) {
      var inFoot = foot.querySelector("button[aria-haspopup='dialog']");
      if (inFoot) return inFoot;
    }
    return (
      document.querySelector("button[class*='_trigger'][aria-haspopup='dialog']") ||
      document.querySelector("[class*='settingsArea'] button[aria-haspopup='dialog']")
    );
  }

  function copyAccountId(text) {
    if (!text) return;
    function done() {
      setCopyHint("已复制");
      window.setTimeout(function () {
        setCopyHint("");
      }, 1500);
    }
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        done();
      });
      return;
    }
    done();
  }

  function findOfficialAccountMenuButton() {
    if (typeof document === "undefined") return null;
    return (
      document.querySelector("button[aria-haspopup='menu'][aria-label='账号菜单']") ||
      document.querySelector("button[aria-haspopup='menu'][aria-label='Account menu']")
    );
  }

  function clickOfficialSettingsItem() {
    if (typeof document === "undefined") return false;
    var nodes = document.querySelectorAll("[role='menuitem']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest && el.closest(".wb-header-logout, .wb-sidebar-account")) continue;
      var text = String(el.textContent || "").replace(/\s+/g, "");
      var official =
        (text.indexOf("设置") === 0 || text.indexOf("Settings") === 0) &&
        (text.indexOf("Ctrl") >= 0 || text.indexOf("Alt") >= 0 || text.indexOf(",") >= 0);
      if (!official) continue;
      if (typeof el.click === "function") el.click();
      return true;
    }
    return false;
  }

  function openHostSettings() {
    setOpen(false);
    var tries = 0;
    function step() {
      if (clickOfficialSettingsItem()) return;
      var btn = findOfficialAccountMenuButton();
      if (btn && btn.getAttribute("aria-expanded") !== "true" && typeof btn.click === "function") {
        btn.click();
      }
      if (clickOfficialSettingsItem()) return;
      if (!btn) {
        var legacy = findHostSettingsTrigger();
        if (legacy && typeof legacy.click === "function") {
          legacy.click();
          return;
        }
      }
      tries += 1;
      if (tries < 10) window.setTimeout(step, 40);
    }
    window.setTimeout(step, 0);
  }

  function openFeedback() {
    setOpen(false);
    clearFeedbackImages();
    setFeedback("");
    setImages([]);
    setPreviewImg(null);
    setPanelMsg("");
    setPanelOk(false);
    setFeedbackDone(false);
    setPanel("feedback");
  }

  function peopleRoleLabel(role) {
    return String(role || "") === "admin" ? "管理员" : "成员";
  }

  function peopleStatusLabel(row) {
    if (row && row.disabled) return "已停用";
    if (row && row.must_change_password) return "待改密";
    return "正常";
  }

  function loadPeopleList() {
    setPeopleLoading(true);
    setPanelMsg("");
    peopleApi("/api/auth/users")
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleList(Array.isArray(d.users) ? d.users : []);
          if (Array.isArray(d.capability_catalog) && d.capability_catalog.length) {
            setPeopleCapsCatalog(d.capability_catalog);
          }
          setPanelOk(true);
          if (!d.users || !d.users.length) setPanelMsg("");
        } else {
          setPeopleList([]);
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "加载人员失败");
        }
      })
      .catch(function (e) {
        setPeopleList([]);
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPeopleLoading(false);
      });
  }

  function openPeople() {
    if (String((user && user.role) || "") !== "admin") return;
    setOpen(false);
    setPeopleFormOpen(false);
    setPeopleResetId("");
    setPeopleResetPw("");
    setPeopleForm({
      username: "",
      display_name: "",
      password: "",
      role: "user",
    });
    setPanelMsg("");
    setPanelOk(false);
    setPanel("people");
    loadPeopleList();
  }

  function peopleApi(path, opts) {
    var o = opts || {};
    var headers = authHeaders();
    if (o.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(engineBase() + path, {
      method: o.method || "GET",
      headers: headers,
      body: o.body ? JSON.stringify(o.body) : undefined,
    }).then(function (r) {
      return r
        .json()
        .catch(function () {
          return {};
        })
        .then(function (d) {
          var detail = d && d.detail;
          if (typeof detail !== "string") {
            detail = detail != null ? JSON.stringify(detail) : "";
          }
          if (r.status === 404 || /not\s*found/i.test(detail || "")) {
            detail =
              "引擎还没有人员和角色接口（多为未重启）。请在本机执行：powershell -NoProfile -File scripts\\restart-web.ps1，然后刷新页面再试。";
          }
          return {
            http: r.status,
            data: Object.assign({}, d || {}, { detail: detail || (d && d.detail) }),
          };
        });
    });
  }

  function submitPeopleCreate() {
    var username = String(peopleForm.username || "").trim();
    var password = String(peopleForm.password || "");
    var display_name = String(peopleForm.display_name || "").trim();
    var role = String(peopleForm.role || "user");
    if (!username || !password) {
      setPanelOk(false);
      setPanelMsg("请填写账号和初始密码");
      return;
    }
    setPanelBusy(true);
    setPanelMsg("");
    peopleApi("/api/auth/users", {
      method: "POST",
      body: {
        username: username,
        password: password,
        display_name: display_name,
        role: role,
      },
    })
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleFormOpen(false);
          setPeopleForm({
            username: "",
            display_name: "",
            password: "",
            role: "user",
          });
          setPanelOk(true);
          setPanelMsg("已新增账号 " + username + "，请把初始密码转告对方");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "新增失败");
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  function patchPeopleRole(row, nextRole) {
    if (!row || !row.id) return;
    if (!window.confirm(
      "确定将「" + (row.display_name || row.username) + "」改为" + peopleRoleLabel(nextRole) + "？",
    )) {
      return;
    }
    setPanelBusy(true);
    setPanelMsg("");
    peopleApi("/api/auth/users/" + encodeURIComponent(row.id), {
      method: "PATCH",
      body: { role: nextRole },
    })
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPanelOk(true);
          setPanelMsg("已更新角色");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "更新失败");
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  function togglePeopleDisabled(row) {
    if (!row || !row.id) return;
    var disable = !row.disabled;
    var tip = disable
      ? "确定停用「" + (row.display_name || row.username) + "」？停用后无法登录。"
      : "确定启用「" + (row.display_name || row.username) + "」？";
    if (!window.confirm(tip)) return;
    setPanelBusy(true);
    setPanelMsg("");
    var path =
      "/api/auth/users/" +
      encodeURIComponent(row.id) +
      (disable ? "/disable" : "/enable");
    peopleApi(path, { method: "POST" })
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPanelOk(true);
          setPanelMsg(disable ? "已停用" : "已启用");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "操作失败");
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  function submitPeopleReset() {
    var uid = String(peopleResetId || "").trim();
    var pw = String(peopleResetPw || "");
    if (!uid || !pw) {
      setPanelOk(false);
      setPanelMsg("请填写新密码");
      return;
    }
    setPanelBusy(true);
    setPanelMsg("");
    peopleApi("/api/auth/users/" + encodeURIComponent(uid) + "/reset-password", {
      method: "POST",
      body: { password: pw },
    })
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleResetId("");
          setPeopleResetPw("");
          setPanelOk(true);
          setPanelMsg("已重置口令，请转告对方并用新密码登录后改密");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "重置失败");
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  function peopleCapCatalogList() {
    if (peopleCapsCatalog && peopleCapsCatalog.length) return peopleCapsCatalog;
    return [
      { id: "mes-ask", label: "问数" },
      { id: "mes-pcb", label: "PCB工艺" },
      { id: "code-dev", label: "写码（Cursor 对话写码）" },
      { id: "code-review", label: "审码" },
      { id: "code-commit", label: "提交" },
      { id: "code-deploy", label: "部署" },
      { id: "dev-pipeline", label: "需求到上线" },
      { id: "vision", label: "视觉识图" },
      { id: "mes-config", label: "连接配置" },
    ];
  }

  function peopleCapsFromRow(row) {
    var catalog = peopleCapCatalogList();
    var src = (row && row.capabilities) || {};
    var out = {};
    catalog.forEach(function (cap) {
      var fid = (cap && (cap.id || cap.feature_id)) || "";
      if (!fid) return;
      out[fid] = src[fid] !== false && src[fid] !== 0;
    });
    return out;
  }

  function peopleCkFromRow(row, docs) {
    var src = (row && row.company_knowledge_access) || {};
    var admin = String((row && row.role) || "") === "admin";
    var list = Array.isArray(docs) ? docs : peopleCkDocs || [];
    var ids = {};
    if (admin || src.allow_all !== false) {
      list.forEach(function (d) {
        if (d && d.id) ids[d.id] = true;
      });
      return { allow_all: true, ids: ids };
    }
    (src.entry_ids || []).forEach(function (id) {
      if (id) ids[String(id)] = true;
    });
    return { allow_all: false, ids: ids };
  }

  function loadPeopleCkDocs(row) {
    setPeopleCkLoadErr("");
    peopleApi("/api/company-knowledge/entries?limit=100&status=active", { method: "GET" })
      .then(function (res) {
        var d = res.data || {};
        if (res.http < 200 || res.http >= 300 || d.ok === false) {
          setPeopleCkDocs([]);
          setPeopleCkLoadErr(
            (d && d.detail) || "读取共享知识库文档失败（HTTP " + res.http + "）",
          );
          if (row) setPeopleCkDraft(peopleCkFromRow(row, []));
          setPeopleCkDirty(false);
          return;
        }
        var items = Array.isArray(d.items) ? d.items : [];
        var docs = items
          .map(function (it) {
            return {
              id: String((it && it.id) || "").trim(),
              title: String((it && it.title) || "").trim() || "未命名",
            };
          })
          .filter(function (it) {
            return !!it.id;
          });
        setPeopleCkDocs(docs);
        setPeopleCkLoadErr("");
        if (row) setPeopleCkDraft(peopleCkFromRow(row, docs));
        setPeopleCkDirty(false);
      })
      .catch(function (e) {
        setPeopleCkDocs([]);
        setPeopleCkLoadErr((e && e.message) || "网络错误，无法读取共享知识库文档");
        if (row) setPeopleCkDraft(peopleCkFromRow(row, []));
        setPeopleCkDirty(false);
      });
  }

  function openPeopleCaps(row) {
    if (!row || !row.id) return;
    if (peopleCapsUserId === row.id) {
      setPeopleCapsUserId("");
      setPeopleCapsDraft(null);
      setPeopleCapsDirty(false);
      setPeopleDataDraft(null);
      setPeopleDataDirty(false);
      setPeopleCkDraft(null);
      setPeopleCkDirty(false);
      return;
    }
    setPeopleFormOpen(false);
    setPeopleResetId("");
    setPeopleCapsUserId(row.id);
    setPeopleCapsDraft(peopleCapsFromRow(row));
    setPeopleCapsDirty(false);
    setPeopleDataDraft(peopleDataFromRow(row));
    setPeopleDataDirty(false);
    setPeopleCkDraft(null);
    setPeopleCkDirty(false);
    loadPeopleCkDocs(row);
    setPanelMsg("");
  }

  function draftPeopleCk(entryId, nextOn) {
    if (!entryId || !peopleCkDraft) return;
    var nextIds = Object.assign({}, peopleCkDraft.ids || {});
    if (nextOn) nextIds[entryId] = true;
    else delete nextIds[entryId];
    var allIds = (peopleCkDocs || []).map(function (d) {
      return d.id;
    });
    var allowAll =
      allIds.length > 0 &&
      allIds.every(function (id) {
        return !!nextIds[id];
      });
    setPeopleCkDraft({ allow_all: allowAll, ids: nextIds });
    setPeopleCkDirty(true);
    setPanelMsg("");
  }

  function savePeopleCkAccess(row) {
    if (!row || !row.id || !peopleCkDraft) return;
    if (String(row.role || "") === "admin") return;
    var who = (row.display_name || row.username || row.id) + "";
    var entryIds = Object.keys(peopleCkDraft.ids || {}).filter(Boolean);
    var allowAll = !!peopleCkDraft.allow_all;
    setPanelBusy(true);
    setPanelMsg("");
    peopleApi(
      "/api/auth/users/" + encodeURIComponent(row.id) + "/company-knowledge-access",
      {
        method: "PUT",
        body: allowAll
          ? { allow_all: true, entry_ids: [] }
          : { allow_all: false, entry_ids: entryIds },
      },
    )
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleCkDirty(false);
          if (d.user) setPeopleCkDraft(peopleCkFromRow(d.user, peopleCkDocs));
          setPanelOk(true);
          setPanelMsg("已保存「" + who + "」的共享知识库召回权限");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "保存共享知识库权限失败");
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  function draftPeopleCapability(featureId, nextOn) {
    if (!featureId || !peopleCapsDraft) return;
    var next = Object.assign({}, peopleCapsDraft);
    next[featureId] = !!nextOn;
    setPeopleCapsDraft(next);
    setPeopleCapsDirty(true);
    setPanelMsg("");
  }

  function savePeopleCapabilities(row) {
    if (!row || !row.id || !peopleCapsDraft) return;
    var who = (row.display_name || row.username || row.id) + "";
    setPanelBusy(true);
    setPanelMsg("");
    peopleApi("/api/auth/users/" + encodeURIComponent(row.id) + "/capabilities", {
      method: "PUT",
      body: { caps: peopleCapsDraft },
    })
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleCapsDirty(false);
          if (d.user && d.user.capabilities) {
            setPeopleCapsDraft(peopleCapsFromRow(d.user));
          }
          setPanelOk(true);
          setPanelMsg("已保存「" + who + "」的引擎能力");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "保存能力失败");
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  var PEOPLE_DATA_ITEMS = [
    { id: "purchase_unit_price", label: "物料采购单价" },
    { id: "employee_salary", label: "员工工资" },
  ];

  function peopleDataFromRow(row) {
    var src = (row && row.data_access) || {};
    var admin = String((row && row.role) || "") === "admin";
    var out = {};
    PEOPLE_DATA_ITEMS.forEach(function (item) {
      out[item.id] = admin ? true : !!src[item.id];
    });
    return out;
  }

  function draftPeopleData(itemId, nextOn) {
    if (!itemId || !peopleDataDraft) return;
    var next = Object.assign({}, peopleDataDraft);
    next[itemId] = !!nextOn;
    setPeopleDataDraft(next);
    setPeopleDataDirty(true);
    setPanelMsg("");
  }

  function savePeopleDataAccess(row) {
    if (!row || !row.id || !peopleDataDraft) return;
    if (String(row.role || "") === "admin") return;
    var who = (row.display_name || row.username || row.id) + "";
    setPanelBusy(true);
    setPanelMsg("");
    peopleApi("/api/auth/users/" + encodeURIComponent(row.id) + "/data-access", {
      method: "PUT",
      body: {
        purchase_unit_price: !!peopleDataDraft.purchase_unit_price,
        employee_salary: !!peopleDataDraft.employee_salary,
      },
    })
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleDataDirty(false);
          if (d.user && d.user.data_access) {
            setPeopleDataDraft(peopleDataFromRow(d.user));
          }
          setPanelOk(true);
          setPanelMsg("已保存「" + who + "」的数据访问");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "保存数据访问失败");
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  function peopleCapLabel(featureId) {
    var hit = peopleCapCatalogList().find(function (c) {
      return c && (c.id === featureId || c.feature_id === featureId);
    });
    return (hit && hit.label) || featureId;
  }

  function formatBytes(n) {
    var v = Number(n) || 0;
    if (v >= 1024 * 1024 * 1024) return (v / (1024 * 1024 * 1024)).toFixed(1) + " GB";
    if (v >= 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + " MB";
    if (v >= 1024) return (v / 1024).toFixed(1) + " KB";
    return v + " B";
  }

  // 每日首启检查按 Asia/Shanghai 自然日（与项目计量口径一致）
  function shanghaiDay() {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
    } catch (e) {
      var d = new Date();
      var mm = String(d.getMonth() + 1).padStart(2, "0");
      var dd = String(d.getDate()).padStart(2, "0");
      return d.getFullYear() + "-" + mm + "-" + dd;
    }
  }

  function openUpdate() {
    setOpen(false);
    setPanelMsg("");
    setPanelOk(false);
    setAbout(null);
    setUpdPhase("");
    setUpdPct(0);
    setPanel("update");
    setPanelBusy(true);
    var desk =
      typeof window !== "undefined" && window.workbuddyDesktop
        ? window.workbuddyDesktop
        : null;
    if (desk && typeof desk.onUpdateProgress === "function") {
      if (updUnsubRef.current) {
        try {
          updUnsubRef.current();
        } catch (e0) {}
      }
      updUnsubRef.current = desk.onUpdateProgress(function (p) {
        if (!p || p.phase !== "downloading") return;
        var total = Number(p.total) || 0;
        var received = Number(p.received) || 0;
        setUpdPct(total > 0 ? Math.min(100, Math.round((received * 100) / total)) : 0);
      });
    }
    var deskP =
      desk && typeof desk.checkUpdate === "function"
        ? Promise.resolve(desk.checkUpdate()).catch(function () {
            return null;
          })
        : Promise.resolve(null);
    // 清单拉取失败时 checkUpdate 仍带 currentVersion；IPC 整段失败则用 getAppVersion 兜底
    var verP =
      desk && typeof desk.getAppVersion === "function"
        ? Promise.resolve(desk.getAppVersion()).catch(function () {
            return null;
          })
        : Promise.resolve(null);
    Promise.all([fetchAbout(), deskP, verP])
      .then(function (pair) {
        var aboutRes = pair[0] || {};
        var deskRes = pair[1];
        var verRes = pair[2];
        var d = (aboutRes && aboutRes.data) || {};
        var fallbackVer =
          verRes && verRes.ok && verRes.version ? String(verRes.version) : "";
        var desktop = null;
        if (deskRes && typeof deskRes === "object") {
          desktop = deskRes;
          if (!desktop.currentVersion && fallbackVer) {
            desktop = Object.assign({}, deskRes, { currentVersion: fallbackVer });
          }
        } else if (fallbackVer) {
          // IPC 整段失败但能读到安装包号：按「已是最新」展示，避免误说成浏览器壳或红字告警
          desktop = {
            ok: true,
            checked: true,
            currentVersion: fallbackVer,
            updateAvailable: false,
            latestVersion: fallbackVer,
            message: "当前已是最新版本（v" + fallbackVer + "）。",
          };
        }
        var info = {
          ok: !!(d && d.ok),
          app_version: (d && d.app_version) || "",
          product: (d && d.product) || "ZR-WorkBuddy",
          desktop: desktop,
          detail: (d && d.detail) || "",
        };
        setAbout(info);
        // 弹窗重开时续接主进程状态（下载中 / 已就绪）
        if (info.desktop && info.desktop.phase === "downloading") setUpdPhase("downloading");
        else if (info.desktop && info.desktop.phase === "ready") {
          setUpdPhase("ready");
          setUpdPct(100);
        } else if (info.desktop && info.desktop.phase === "installing") setUpdPhase("installing");
        if (!info.ok && info.detail) {
          setPanelOk(false);
          setPanelMsg(info.detail);
        } else {
          var deskMsg =
            info.desktop && info.desktop.message
              ? String(info.desktop.message)
              : "";
          // 无更大版本 / 服务端无清单：主进程已落「当前已是最新版本（v…）」；仅清单格式异常等才红字
          var deskChecked = !!(info.desktop && info.desktop.checked);
          var deskFailed = !!(
            info.desktop &&
            info.desktop.checked === false &&
            !info.desktop.updateAvailable &&
            deskMsg &&
            deskMsg.indexOf("已是最新") < 0
          );
          var curVer =
            (info.desktop && info.desktop.currentVersion) || "";
          setPanelOk(!deskFailed);
          setPanelMsg(
            deskMsg ||
              (info.desktop && info.desktop.updateAvailable
                ? ""
                : deskChecked
                  ? "当前已是最新版本（v" + curVer + "）。"
                  : ""),
          );
        }
      })
      .finally(function () {
        setPanelBusy(false);
      });
  }

  function startDownloadUpdate() {
    var desk =
      typeof window !== "undefined" && window.workbuddyDesktop
        ? window.workbuddyDesktop
        : null;
    if (!desk || typeof desk.downloadUpdate !== "function") return;
    setUpdPhase("downloading");
    setUpdPct(0);
    setPanelOk(true);
    setPanelMsg("正在下载安装包，请勿关闭应用…");
    desk
      .downloadUpdate()
      .then(function (r) {
        if (r && r.ok) {
          setUpdPhase("ready");
          setUpdPct(100);
          setPanelOk(true);
          setPanelMsg("下载完成，校验通过。点击「马上安装」开始升级。");
        } else {
          setUpdPhase("");
          setPanelOk(false);
          setPanelMsg((r && r.message) || "下载失败，请重试。");
        }
      })
      .catch(function (e) {
        setUpdPhase("");
        setPanelOk(false);
        setPanelMsg("下载失败：" + ((e && e.message) || e));
      });
  }

  function startInstallUpdate() {
    var desk =
      typeof window !== "undefined" && window.workbuddyDesktop
        ? window.workbuddyDesktop
        : null;
    if (!desk || typeof desk.installUpdate !== "function") return;
    setUpdPhase("installing");
    setPanelOk(true);
    setPanelMsg("正在启动安装…本应用即将退出。");
    desk
      .installUpdate()
      .then(function (r) {
        if (r && r.ok) return; // 应用即将退出
        setUpdPhase("ready");
        setPanelOk(false);
        setPanelMsg((r && r.message) || "启动安装失败，请重试。");
      })
      .catch(function (e) {
        setUpdPhase("ready");
        setPanelOk(false);
        setPanelMsg("启动安装失败：" + ((e && e.message) || e));
      });
  }

  function onPickImages(ev) {
    var files = ev && ev.target && ev.target.files ? Array.from(ev.target.files) : [];
    if (ev && ev.target) ev.target.value = "";
    if (!files.length) return;
    var next = images.slice();
    var err = "";
    files.forEach(function (f) {
      if (next.length >= 6) {
        err = "最多上传 6 张图片";
        return;
      }
      if (!f || !(f.type || "").startsWith("image/")) {
        err = "仅支持图片文件";
        return;
      }
      if (f.size > 5 * 1024 * 1024) {
        err = "单张图片请不超过 5MB";
        return;
      }
      next.push({
        id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
        file: f,
        name: f.name || "image",
        url: URL.createObjectURL(f),
        broken: false,
      });
    });
    setImages(next);
    if (err) {
      setPanelOk(false);
      setPanelMsg(err);
    } else {
      setPanelMsg("");
    }
  }

  function removeImage(id) {
    var kept = [];
    images.forEach(function (it) {
      if (it.id === id) {
        try {
          if (it.url) URL.revokeObjectURL(it.url);
        } catch (e1) {}
      } else {
        kept.push(it);
      }
    });
    setImages(kept);
  }

  function submitFeedback() {
    var text = String(feedback || "").trim();
    if (!text) {
      setPanelOk(false);
      setPanelMsg("请填写反馈内容");
      return;
    }
    if (text.length > 4000) {
      setPanelOk(false);
      setPanelMsg("反馈内容请控制在 4000 字以内");
      return;
    }
    setPanelBusy(true);
    setPanelMsg("");
    var fd = new FormData();
    fd.append("message", text);
    images.forEach(function (it) {
      if (it && it.file) fd.append("images", it.file, it.name || "image.png");
    });
    var headers = authHeaders();
    // 让浏览器自动带 multipart boundary，勿手写 Content-Type
    fetch(engineBase() + "/api/feedback", {
      method: "POST",
      headers: headers,
      body: fd,
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { http: r.status, data: d };
        });
      })
      .then(function (res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          clearFeedbackImages();
          setFeedback("");
          setImages([]);
          setPreviewImg(null);
          setPanelBusy(false);
          setPanelOk(true);
          setPanelMsg("提交成功");
          setFeedbackDone(true);
          if (successCloseTimerRef.current) {
            clearTimeout(successCloseTimerRef.current);
          }
          successCloseTimerRef.current = setTimeout(function () {
            successCloseTimerRef.current = null;
            setPanel(null);
            setPanelMsg("");
            setPanelOk(false);
            setFeedbackDone(false);
          }, 2000);
        } else {
          setPanelOk(false);
          setPanelMsg((d && d.detail) || "提交失败");
          setPanelBusy(false);
        }
      })
      .catch(function (e) {
        setPanelOk(false);
        setPanelMsg((e && e.message) || "网络错误");
        setPanelBusy(false);
      });
  }

  useEffect(function () {
    refresh();
    function onAuth() { refresh(); }
    window.addEventListener(AUTH_EVENT, onAuth);
    return function () { window.removeEventListener(AUTH_EVENT, onAuth); };
  }, []);

  // 每天第一次打开桌面壳时自动检查更新（Asia/Shanghai 自然日）。
  // 只在拿到明确结果（checked）后才标记当日已查：网络失败时下次打开会重试。
  // 有新版本则弹简洁提示（无更新日志）；点「升级」接完整升级面板。
  useEffect(
    function () {
      if (!user) return undefined;
      var desk =
        typeof window !== "undefined" && window.workbuddyDesktop
          ? window.workbuddyDesktop
          : null;
      if (!desk || typeof desk.checkUpdate !== "function") return undefined;
      var day = shanghaiDay();
      var stored = null;
      try {
        stored = window.localStorage.getItem("wb-update-check-day");
      } catch (e0) {
        stored = null;
      }
      if (stored === day) return undefined;
      var cancelled = false;
      Promise.resolve(desk.checkUpdate())
        .then(function (r) {
          if (cancelled || !r || !r.ok || !r.checked) return;
          try {
            window.localStorage.setItem("wb-update-check-day", day);
          } catch (e1) {}
          if (r.updateAvailable) {
            setAutoUpd({
              currentVersion: r.currentVersion || "",
              latestVersion: r.latestVersion || "",
            });
          }
        })
        .catch(function () {});
      return function () {
        cancelled = true;
      };
    },
    [user],
  );

  useEffect(
    function () {
      if (!open && !panel && !previewImg && !autoUpd) return undefined;
      function onKey(ev) {
        if (ev.key !== "Escape") return;
        if (previewImg) setPreviewImg(null);
        else if (panel) closePanel();
        else if (autoUpd) setAutoUpd(null);
        else setOpen(false);
      }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    },
    [open, panel, previewImg, autoUpd],
  );

  /* 账号菜单打开时：点菜单外关闭。禁止全屏 wb-header-logout-mask——
   * 其 z-index 极高会盖住设置/插件市场，「安装」点不了。 */
  useEffect(
    function () {
      if (!open) return undefined;
      function onDocPointer(ev) {
        var t = ev && ev.target;
        if (t && t.closest && t.closest(".wb-header-logout")) return;
        setOpen(false);
      }
      document.addEventListener("pointerdown", onDocPointer, true);
      return function () {
        document.removeEventListener("pointerdown", onDocPointer, true);
      };
    },
    [open],
  );

  if (!user) return null;
  var wide = !props || props.wide !== false;
  var label = user.display_name || user.username || "";
  var accountId = String(user.username || user.display_name || label || "").trim();
  var initial = (label || "?").trim().charAt(0).toUpperCase() || "U";

  function accountMenuRow(text, iconKind, onClick) {
    return h(
      "button",
      {
        type: "button",
        className: "wb-account-menu-row",
        role: "menuitem",
        onClick: onClick,
      },
      wbAccountMenuIcon(iconKind),
      h("span", { className: "wb-account-menu-label" }, text),
    );
  }

  var dialog =
    panel === "feedback"
      ? h(
          "div",
          {
            className: "wb-account-dialog-overlay",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "帮助与反馈",
            onClick: closePanel,
          },
          h(
            "div",
            {
              className: "wb-account-dialog feedback",
              onClick: function (ev) {
                ev.stopPropagation();
              },
            },
            h(
              "div",
              { className: "wb-account-dialog-head" },
              h("span", { className: "t" }, "帮助与反馈"),
              h(
                "button",
                {
                  type: "button",
                  className: "wb-account-dialog-x",
                  "aria-label": "关闭",
                  onClick: closePanel,
                },
                "×",
              ),
            ),
            h(
              "div",
              { className: "wb-account-dialog-body" },
              feedbackDone
                ? h(
                    "div",
                    { className: "wb-fb-success", role: "status", "aria-live": "polite" },
                    h("div", { className: "ico", "aria-hidden": "true" }, "✓"),
                    h("p", { className: "t" }, "提交成功"),
                    h("p", { className: "s" }, "感谢反馈，窗口即将关闭…"),
                  )
                : h(
                    React.Fragment,
                    null,
                    h(
                      "p",
                      { className: "hint" },
                      "请描述现象、复现步骤与期望结果；可附截图（最多 6 张，单张 ≤5MB）。资料库、用量在会话顶栏页签。",
                    ),
                    h("textarea", {
                      value: feedback,
                      placeholder: "请描述你的问题或建议…",
                      disabled: panelBusy,
                      onChange: function (ev) {
                        setFeedback(ev.target.value);
                      },
                    }),
                    h(
                      "div",
                      { className: "wb-fb-images" },
                      images.map(function (it) {
                        return h(
                          "div",
                          {
                            key: it.id,
                            className: "wb-fb-thumb",
                            role: "button",
                            tabIndex: 0,
                            title: "点击预览",
                            onClick: function () {
                              if (it.broken || !it.url) return;
                              setPreviewImg({ url: it.url, name: it.name || "截图" });
                            },
                            onKeyDown: function (ev) {
                              if (ev.key === "Enter" || ev.key === " ") {
                                ev.preventDefault();
                                if (it.broken || !it.url) return;
                                setPreviewImg({ url: it.url, name: it.name || "截图" });
                              }
                            },
                          },
                          it.broken
                            ? h("div", { className: "wb-fb-broken" }, "无法预览此图")
                            : h("img", {
                                src: it.url,
                                alt: it.name || "截图",
                                onError: function () {
                                  setImages(function (prev) {
                                    return (prev || []).map(function (row) {
                                      if (row.id !== it.id) return row;
                                      return Object.assign({}, row, { broken: true });
                                    });
                                  });
                                },
                              }),
                          h(
                            "button",
                            {
                              type: "button",
                              className: "rm",
                              title: "移除",
                              "aria-label": "移除图片",
                              disabled: panelBusy,
                              onClick: function (ev) {
                                ev.stopPropagation();
                                removeImage(it.id);
                                if (previewImg && previewImg.url === it.url) setPreviewImg(null);
                              },
                            },
                            "×",
                          ),
                        );
                      }),
                      images.length < 6
                        ? h(
                            "label",
                            {
                              className: "wb-fb-add",
                              title: "添加图片",
                            },
                            h("span", null, "+"),
                            h("span", null, "图片"),
                            h("input", {
                              ref: fileInputRef,
                              type: "file",
                              accept: "image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp",
                              multiple: true,
                              disabled: panelBusy,
                              onChange: onPickImages,
                            }),
                          )
                        : null,
                    ),
                    panelMsg
                      ? h(
                          "p",
                          { className: "msg-banner " + (panelOk ? "ok" : "err") },
                          panelMsg,
                        )
                      : null,
                    h(
                      "div",
                      { className: "wb-account-dialog-actions" },
                      h(
                        "button",
                        {
                          type: "button",
                          className: "btn",
                          disabled: panelBusy,
                          onClick: closePanel,
                        },
                        "关闭",
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          className: "btn primary",
                          disabled: panelBusy,
                          onClick: submitFeedback,
                        },
                        panelBusy ? "提交中…" : "提交反馈",
                      ),
                    ),
                  ),
            ),
          ),
        )
      : panel === "people"
        ? h(
            "div",
            {
              className: "wb-account-dialog-overlay",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": "人员和角色",
              onClick: closePanel,
            },
            h(
              "div",
              {
                className: "wb-account-dialog people",
                onClick: function (ev) {
                  ev.stopPropagation();
                },
              },
              h(
                "div",
                { className: "wb-account-dialog-head" },
                h("span", { className: "t" }, "人员和角色"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "wb-account-dialog-x",
                    "aria-label": "关闭",
                    onClick: closePanel,
                  },
                  "×",
                ),
              ),
              h(
                "div",
                { className: "wb-account-dialog-body" },
                h(
                  "p",
                  { className: "hint" },
                  "管理本机登录账号：新增、停用、改角色、重置口令；点某人「能力」会标明维护谁，勾选后点「保存能力」才生效（默认全开）。至少保留一名管理员。",
                ),
                h(
                  "div",
                  { className: "wb-people-toolbar" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "wb-people-btn primary",
                      disabled: panelBusy || peopleLoading,
                      onClick: function () {
                        setPeopleFormOpen(!peopleFormOpen);
                        setPeopleResetId("");
                        setPanelMsg("");
                      },
                    },
                    peopleFormOpen ? "收起表单" : "新增人员",
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "wb-people-btn",
                      disabled: panelBusy || peopleLoading,
                      onClick: loadPeopleList,
                    },
                    peopleLoading ? "刷新中…" : "刷新",
                  ),
                ),
                peopleFormOpen
                  ? h(
                      "div",
                      { className: "wb-people-form" },
                      h("label", null, "账号", h("input", {
                        value: peopleForm.username,
                        autoComplete: "off",
                        disabled: panelBusy,
                        placeholder: "字母开头，如 zhangsan",
                        onChange: function (ev) {
                          setPeopleForm(Object.assign({}, peopleForm, {
                            username: ev.target.value,
                          }));
                        },
                      })),
                      h("label", null, "显示名", h("input", {
                        value: peopleForm.display_name,
                        autoComplete: "off",
                        disabled: panelBusy,
                        placeholder: "可选",
                        onChange: function (ev) {
                          setPeopleForm(Object.assign({}, peopleForm, {
                            display_name: ev.target.value,
                          }));
                        },
                      })),
                      h("label", null, "初始密码", h("input", {
                        type: "password",
                        value: peopleForm.password,
                        autoComplete: "new-password",
                        disabled: panelBusy,
                        placeholder: "至少 8 位",
                        onChange: function (ev) {
                          setPeopleForm(Object.assign({}, peopleForm, {
                            password: ev.target.value,
                          }));
                        },
                      })),
                      h("label", null, "角色", h("select", {
                        value: peopleForm.role,
                        disabled: panelBusy,
                        onChange: function (ev) {
                          setPeopleForm(Object.assign({}, peopleForm, {
                            role: ev.target.value,
                          }));
                        },
                      }, h("option", { value: "user" }, "成员"), h("option", { value: "admin" }, "管理员"))),
                      h(
                        "button",
                        {
                          type: "button",
                          className: "wb-people-btn primary",
                          disabled: panelBusy,
                          onClick: submitPeopleCreate,
                        },
                        panelBusy ? "保存中…" : "保存",
                      ),
                    )
                  : null,
                peopleResetId
                  ? h(
                      "div",
                      { className: "wb-people-form" },
                      h(
                        "p",
                        { className: "hint" },
                        "为选中账号设置新密码（至少 8 位），对方登录后须改密。",
                      ),
                      h("label", null, "新密码", h("input", {
                        type: "password",
                        value: peopleResetPw,
                        autoComplete: "new-password",
                        disabled: panelBusy,
                        onChange: function (ev) {
                          setPeopleResetPw(ev.target.value);
                        },
                      })),
                      h(
                        "div",
                        { className: "wb-people-toolbar" },
                        h(
                          "button",
                          {
                            type: "button",
                            className: "wb-people-btn primary",
                            disabled: panelBusy,
                            onClick: submitPeopleReset,
                          },
                          "确认重置",
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "wb-people-btn",
                            disabled: panelBusy,
                            onClick: function () {
                              setPeopleResetId("");
                              setPeopleResetPw("");
                            },
                          },
                          "取消",
                        ),
                      ),
                    )
                  : null,
                panelMsg
                  ? h(
                      "p",
                      { className: panelOk ? "hint" : "err" },
                      panelMsg,
                    )
                  : null,
                h(
                  "div",
                  { className: "wb-people-table-wrap" },
                  peopleLoading && !peopleList.length
                    ? h("p", { className: "hint" }, "加载中…")
                    : h(
                        "table",
                        { className: "wb-people-table" },
                        h(
                          "thead",
                          null,
                          h(
                            "tr",
                            null,
                            h("th", null, "显示名"),
                            h("th", null, "账号"),
                            h("th", null, "角色"),
                            h("th", null, "状态"),
                            h("th", null, "操作"),
                          ),
                        ),
                        h(
                          "tbody",
                          null,
                          (peopleList || []).map(function (row) {
                            var isAdminRole = String(row.role || "") === "admin";
                            var capsOpen = peopleCapsUserId && peopleCapsUserId === row.id;
                            var capsMap =
                              capsOpen && peopleCapsDraft
                                ? peopleCapsDraft
                                : peopleCapsFromRow(row);
                            var dataMap =
                              capsOpen && peopleDataDraft
                                ? peopleDataDraft
                                : peopleDataFromRow(row);
                            var catalog = peopleCapCatalogList();
                            var whoName = row.display_name || row.username || "—";
                            var whoAccount = row.username || row.id || "";
                            return h(
                              React.Fragment,
                              { key: row.id || row.username },
                              h(
                                "tr",
                                {
                                  className:
                                    (row.disabled ? "is-disabled " : "") +
                                    (capsOpen ? "is-caps-open" : ""),
                                },
                                h("td", null, row.display_name || "—"),
                                h("td", null, row.username || "—"),
                                h("td", null, peopleRoleLabel(row.role)),
                                h("td", null, peopleStatusLabel(row)),
                                h(
                                  "td",
                                  { className: "wb-people-actions" },
                                  h(
                                    "button",
                                    {
                                      type: "button",
                                      className: "wb-people-link",
                                      disabled: panelBusy,
                                      onClick: function () {
                                        openPeopleCaps(row);
                                      },
                                    },
                                    capsOpen ? "收起能力" : "能力",
                                  ),
                                  h(
                                    "button",
                                    {
                                      type: "button",
                                      className: "wb-people-link",
                                      disabled: panelBusy,
                                      onClick: function () {
                                        patchPeopleRole(
                                          row,
                                          isAdminRole ? "user" : "admin",
                                        );
                                      },
                                    },
                                    isAdminRole ? "改为成员" : "改为管理员",
                                  ),
                                  h(
                                    "button",
                                    {
                                      type: "button",
                                      className: "wb-people-link",
                                      disabled: panelBusy,
                                      onClick: function () {
                                        togglePeopleDisabled(row);
                                      },
                                    },
                                    row.disabled ? "启用" : "停用",
                                  ),
                                  h(
                                    "button",
                                    {
                                      type: "button",
                                      className: "wb-people-link",
                                      disabled: panelBusy || !!row.disabled,
                                      onClick: function () {
                                        setPeopleFormOpen(false);
                                        setPeopleCapsUserId("");
                                        setPeopleCapsDraft(null);
                                        setPeopleCapsDirty(false);
                                        setPeopleDataDraft(null);
                                        setPeopleDataDirty(false);
                                        setPeopleResetId(row.id || "");
                                        setPeopleResetPw("");
                                        setPanelMsg("");
                                      },
                                    },
                                    "重置口令",
                                  ),
                                ),
                              ),
                              capsOpen
                                ? h(
                                    "tr",
                                    { className: "wb-people-caps-row" },
                                    h(
                                      "td",
                                      { colSpan: 5 },
                                      h(
                                        "div",
                                        { className: "wb-people-caps" },
                                        h(
                                          "div",
                                          { className: "wb-people-caps-head" },
                                          h(
                                            "div",
                                            { className: "wb-people-caps-title" },
                                            h(
                                              "strong",
                                              { className: "wb-people-caps-who" },
                                              "正在维护：" +
                                                whoName +
                                                "（" +
                                                whoAccount +
                                                "）的引擎能力",
                                            ),
                                            peopleCapsDirty
                                              ? h(
                                                  "span",
                                                  { className: "wb-people-caps-dirty" },
                                                  "未保存",
                                                )
                                              : null,
                                          ),
                                          h(
                                            "button",
                                            {
                                              type: "button",
                                              className: "wb-people-btn primary",
                                              disabled:
                                                panelBusy ||
                                                !!row.disabled ||
                                                !peopleCapsDirty,
                                              onClick: function () {
                                                savePeopleCapabilities(row);
                                              },
                                            },
                                            panelBusy ? "保存中…" : "保存能力",
                                          ),
                                        ),
                                        h(
                                          "p",
                                          { className: "hint" },
                                          "勾选只改草稿，点右上「保存能力」后生效。关掉后该账号不可用对应功能；全局功能插件停用时仍全员不可用。",
                                        ),
                                        h(
                                          "div",
                                          { className: "wb-people-caps-grid" },
                                          catalog.map(function (cap) {
                                            var fid = (cap && (cap.id || cap.feature_id)) || "";
                                            var on = !!capsMap[fid];
                                            return h(
                                              "label",
                                              {
                                                key: fid,
                                                className:
                                                  "wb-people-cap-sw" +
                                                  (on ? " is-on" : " is-off"),
                                              },
                                              h("input", {
                                                type: "checkbox",
                                                checked: on,
                                                disabled: panelBusy || !!row.disabled,
                                                onChange: function (ev) {
                                                  draftPeopleCapability(
                                                    fid,
                                                    !!ev.target.checked,
                                                  );
                                                },
                                              }),
                                              h(
                                                "span",
                                                null,
                                                (cap && cap.label) || fid,
                                              ),
                                            );
                                          }),
                                        ),
                                        h(
                                          "div",
                                          { className: "wb-people-caps-head", style: { marginTop: 14 } },
                                          h(
                                            "div",
                                            { className: "wb-people-caps-title" },
                                            h(
                                              "strong",
                                              { className: "wb-people-caps-who" },
                                              "数据访问",
                                            ),
                                            peopleDataDirty
                                              ? h(
                                                  "span",
                                                  { className: "wb-people-caps-dirty" },
                                                  "未保存",
                                                )
                                              : null,
                                          ),
                                          isAdminRole
                                            ? null
                                            : h(
                                                "button",
                                                {
                                                  type: "button",
                                                  className: "wb-people-btn primary",
                                                  disabled:
                                                    panelBusy ||
                                                    !!row.disabled ||
                                                    !peopleDataDirty,
                                                  onClick: function () {
                                                    savePeopleDataAccess(row);
                                                  },
                                                },
                                                panelBusy ? "保存中…" : "保存数据权限",
                                              ),
                                        ),
                                        h(
                                          "p",
                                          { className: "hint" },
                                          isAdminRole
                                            ? "管理员默认拥有物料采购单价和员工工资的访问权限。"
                                            : "成员默认不能查看。勾选后点「保存数据权限」生效。未接入的项问数会说明尚未接入，不影响产量、工单等其它查询。",
                                        ),
                                        h(
                                          "div",
                                          { className: "wb-people-caps-grid" },
                                          PEOPLE_DATA_ITEMS.map(function (item) {
                                            var on = !!dataMap[item.id];
                                            return h(
                                              "label",
                                              {
                                                key: item.id,
                                                className:
                                                  "wb-people-cap-sw" +
                                                  (on ? " is-on" : " is-off") +
                                                  (isAdminRole ? " is-locked" : ""),
                                              },
                                              h("input", {
                                                type: "checkbox",
                                                checked: !!(on || isAdminRole),
                                                disabled: !isAdminRole && (panelBusy || !!row.disabled),
                                                onChange: function (ev) {
                                                  if (isAdminRole) {
                                                    ev.target.checked = true;
                                                    return;
                                                  }
                                                  draftPeopleData(
                                                    item.id,
                                                    !!ev.target.checked,
                                                  );
                                                },
                                              }),
                                              h("span", null, item.label),
                                            );
                                          }),
                                        ),
                                        h(
                                          "div",
                                          { className: "wb-people-caps-head", style: { marginTop: 14 } },
                                          h(
                                            "div",
                                            { className: "wb-people-caps-title" },
                                            h(
                                              "strong",
                                              { className: "wb-people-caps-who" },
                                              "共享知识库召回",
                                            ),
                                            peopleCkDirty
                                              ? h(
                                                  "span",
                                                  { className: "wb-people-caps-dirty" },
                                                  "未保存",
                                                )
                                              : null,
                                          ),
                                          isAdminRole
                                            ? null
                                            : h(
                                                "button",
                                                {
                                                  type: "button",
                                                  className: "wb-people-btn primary",
                                                  disabled:
                                                    panelBusy ||
                                                    !!row.disabled ||
                                                    !peopleCkDirty ||
                                                    !peopleCkDraft,
                                                  onClick: function () {
                                                    savePeopleCkAccess(row);
                                                  },
                                                },
                                                panelBusy ? "保存中…" : "保存知识库权限",
                                              ),
                                        ),
                                        h(
                                          "p",
                                          { className: "hint" },
                                          isAdminRole
                                            ? "管理员默认可召回全部共享知识库文档。"
                                            : "只管控公司共享知识库。勾选的文档可被聊天召回；未勾选的文档对该成员不可召回。本机知识库不受影响。默认全选。",
                                        ),
                                        peopleCkLoadErr
                                          ? h(
                                              "p",
                                              { className: "hint", style: { color: "#b42318" } },
                                              peopleCkLoadErr,
                                            )
                                          : !peopleCkDraft
                                          ? h("p", { className: "hint" }, "正在加载共享文档…")
                                          : (peopleCkDocs || []).length === 0
                                            ? h(
                                                "p",
                                                { className: "hint" },
                                                "共享知识库当前没有可勾选的活跃文档。请先在知识文档侧栏「共享知识库」新建或导入，再回到这里勾选。",
                                              )
                                            : h(
                                                "div",
                                                { className: "wb-people-caps-grid" },
                                                (peopleCkDocs || []).map(function (doc) {
                                                  var on =
                                                    isAdminRole ||
                                                    !!(
                                                      peopleCkDraft &&
                                                      peopleCkDraft.ids &&
                                                      peopleCkDraft.ids[doc.id]
                                                    );
                                                  return h(
                                                    "label",
                                                    {
                                                      key: doc.id,
                                                      className:
                                                        "wb-people-cap-sw" +
                                                        (on ? " is-on" : " is-off") +
                                                        (isAdminRole ? " is-locked" : ""),
                                                      title: doc.title,
                                                    },
                                                    h("input", {
                                                      type: "checkbox",
                                                      checked: !!on,
                                                      disabled:
                                                        isAdminRole ||
                                                        panelBusy ||
                                                        !!row.disabled,
                                                      onChange: function (ev) {
                                                        if (isAdminRole) {
                                                          ev.target.checked = true;
                                                          return;
                                                        }
                                                        draftPeopleCk(
                                                          doc.id,
                                                          !!ev.target.checked,
                                                        );
                                                      },
                                                    }),
                                                    h("span", null, doc.title),
                                                  );
                                                }),
                                              ),
                                      ),
                                    ),
                                  )
                                : null,
                            );
                          }),
                        ),
                      ),
                ),
              ),
            ),
          )
      : panel === "update"
        ? h(
            "div",
            {
              className: "wb-account-dialog-overlay",
              role: "dialog",
              "aria-modal": "true",
              "aria-label": "检查更新",
              onClick: closePanel,
            },
            h(
              "div",
              {
                className: "wb-account-dialog",
                onClick: function (ev) {
                  ev.stopPropagation();
                },
              },
              h(
                "div",
                { className: "wb-account-dialog-head" },
                h("span", { className: "t" }, "检查更新"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "wb-account-dialog-x",
                    "aria-label": "关闭",
                    onClick: closePanel,
                  },
                  "×",
                ),
              ),
              h(
                "div",
                { className: "wb-account-dialog-body" },
                panelBusy
                  ? h("p", { className: "hint" }, "正在检查…")
                  : h(
                      React.Fragment,
                      null,
                      // 用户只看安装包版本号：桌面壳显信息表（当前/最新/安装包/大小/发布日期/说明）；
                      // 浏览器/开发壳没有安装包号，不显产品号，只给提示（引擎号放括号里备查）
                      about &&
                        about.desktop &&
                        about.desktop.currentVersion
                        ? h(
                            "div",
                            { className: "wb-upd-info" },
                            [
                              ["当前版本", about.desktop.currentVersion],
                              about.desktop.updateAvailable
                                ? ["最新版本", about.desktop.latestVersion || ""]
                                : null,
                              about.desktop.updateAvailable && about.desktop.file
                                ? ["安装包", about.desktop.file]
                                : null,
                              about.desktop.updateAvailable && about.desktop.size
                                ? ["大小", formatBytes(about.desktop.size)]
                                : null,
                              about.desktop.updateAvailable && about.desktop.publishedAt
                                ? ["发布日期", about.desktop.publishedAt]
                                : null,
                              about.desktop.updateAvailable && about.desktop.notes
                                ? ["更新说明", about.desktop.notes]
                                : null,
                            ]
                              .filter(Boolean)
                              .map(function (r) {
                                return h(
                                  "p",
                                  { key: r[0], className: "wb-upd-row" },
                                  h("span", { className: "k" }, r[0] + "："),
                                  String(r[1]),
                                );
                              }),
                          )
                        : h(
                            "p",
                            { className: "hint" },
                            "当前为浏览器/开发壳" +
                              (about && about.app_version
                                ? "（引擎 v" + about.app_version + "，仅开发用）"
                                : "") +
                              "；桌面一体包请在应用内「检查更新」，版本以安装包号为准。",
                          ),
                      about &&
                        about.desktop &&
                        about.desktop.updateAvailable
                        ? h(
                            React.Fragment,
                            null,
                            updPhase === "downloading"
                              ? h(
                                  "div",
                                  {
                                    style: {
                                      margin: "10px 0 2px",
                                      height: "8px",
                                      borderRadius: "4px",
                                      background: "rgba(127,127,127,.25)",
                                      overflow: "hidden",
                                    },
                                  },
                                  h("div", {
                                    style: {
                                      width: updPct + "%",
                                      height: "100%",
                                      background: "#22c55e",
                                      transition: "width .2s",
                                    },
                                  }),
                                )
                              : null,
                            updPhase !== "downloading"
                              ? h(
                                  "p",
                                  { className: "hint" },
                                  "下载完成后需你确认才会启动安装包；安装期间会关闭本应用。",
                                )
                              : null,
                          )
                        : null,
                      panelMsg
                        ? h(
                            "p",
                            { className: panelOk ? "hint" : "err" },
                            panelMsg,
                          )
                        : null,
                    ),
                h(
                  "div",
                  { className: "wb-account-dialog-actions" },
                  about &&
                    about.desktop &&
                    about.desktop.updateAvailable &&
                    !panelBusy
                    ? [
                        !updPhase
                          ? h(
                              "button",
                              {
                                key: "dl",
                                type: "button",
                                className: "btn primary",
                                onClick: startDownloadUpdate,
                              },
                              "下载并安装",
                            )
                          : null,
                        updPhase === "downloading"
                          ? h(
                              "button",
                              {
                                key: "dl-ing",
                                type: "button",
                                className: "btn primary",
                                disabled: true,
                              },
                              "下载中… " + updPct + "%",
                            )
                          : null,
                        updPhase === "ready"
                          ? h(
                              "button",
                              {
                                key: "inst",
                                type: "button",
                                className: "btn primary",
                                onClick: startInstallUpdate,
                              },
                              "马上安装",
                            )
                          : null,
                        updPhase === "installing"
                          ? h(
                              "button",
                              {
                                key: "inst-ing",
                                type: "button",
                                className: "btn primary",
                                disabled: true,
                              },
                              "正在启动安装…",
                            )
                          : null,
                      ]
                    : null,
                  h(
                    "button",
                    {
                      type: "button",
                      className:
                        about && about.desktop && about.desktop.updateAvailable
                          ? "btn"
                          : "btn primary",
                      disabled: panelBusy || updPhase === "installing",
                      onClick: closePanel,
                    },
                    updPhase === "downloading"
                      ? "后台下载"
                      : about && about.desktop && about.desktop.updateAvailable
                        ? "稍后"
                        : "知道了",
                  ),
                ),
              ),
            ),
          )
        : null;

  return h(
    React.Fragment,
    null,
    h(
      "div",
      {
        className:
          "wb-header-logout wb-sidebar-account" +
          (open ? " open" : "") +
          (wide ? "" : " rail"),
      },
      h(
        "button",
        {
          type: "button",
          className: "trigger",
          "aria-haspopup": "menu",
          "aria-expanded": open,
          title: "账号",
          onClick: function () { setOpen(!open); },
        },
        h("span", { className: "avatar", "aria-hidden": "true" }, initial),
        h("span", { className: "name" }, accountId || label),
      ),
      open
        ? h(
            "div",
            { className: "menu wb-account-menu", role: "menu" },
            h(
              "div",
              { className: "wb-account-menu-head" },
              h("span", { className: "wb-account-menu-id" }, accountId || "—"),
              h(
                "button",
                {
                  type: "button",
                  className: "wb-account-menu-copy",
                  "aria-label": copyHint || "复制账号",
                  title: copyHint || "复制",
                  onClick: function () {
                    copyAccountId(accountId);
                  },
                },
                h(
                  "svg",
                  {
                    width: 18,
                    height: 18,
                    viewBox: "0 0 18 18",
                    fill: "none",
                    "aria-hidden": "true",
                  },
                  h("rect", {
                    x: 6,
                    y: 6,
                    width: 9,
                    height: 9,
                    rx: 1.5,
                    stroke: "currentColor",
                    strokeWidth: "1.3",
                  }),
                  h("path", {
                    d: "M5 12H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h6.5A1.5 1.5 0 0 1 12 4v1",
                    stroke: "currentColor",
                    strokeWidth: "1.3",
                    strokeLinecap: "round",
                  }),
                ),
              ),
            ),
            h(
              "div",
              { className: "wb-account-menu-body" },
              accountMenuRow("设置", "settings", openHostSettings),
              String((user && user.role) || "") === "admin"
                ? accountMenuRow("人员和角色", "people", openPeople)
                : null,
              accountMenuRow("帮助与反馈", "help", openFeedback),
              h("div", { className: "wb-account-menu-line", role: "separator" }),
              accountMenuRow("检查更新", "update", openUpdate),
              h("div", { className: "wb-account-menu-line", role: "separator" }),
              h(
                "button",
                {
                  type: "button",
                  className: "menu-logout wb-account-menu-logout",
                  role: "menuitem",
                  disabled: busy,
                  onClick: function () {
                    setBusy(true);
                    doAppLogout().finally(function () {
                      setBusy(false);
                      setOpen(false);
                    });
                  },
                },
                wbAccountMenuIcon("logout"),
                h("span", { className: "wb-account-menu-label" }, busy ? "退出中…" : "退出登录"),
              ),
            ),
          )
        : null,
    ),
    dialog,
    // 每日首启自动检查命中新版本：左下角轻量提醒（无遮罩、无更新日志）；「升级」接完整升级面板
    autoUpd && !panel && !open
      ? h(
          "div",
          { className: "wb-upd-toast", role: "status", "aria-label": "发现新版本" },
          h(
            "button",
            {
              type: "button",
              className: "wb-upd-toast-close",
              "aria-label": "关闭",
              onClick: function () {
                setAutoUpd(null);
              },
            },
            "×",
          ),
          h(
            "div",
            { className: "wb-upd-toast-title" },
            h("span", { className: "wb-upd-toast-dot" }),
            "发现新版本 v" + (autoUpd.latestVersion || ""),
          ),
          h(
            "div",
            { className: "wb-upd-toast-msg" },
            "当前版本 v" + (autoUpd.currentVersion || "") + "，建议更新后继续使用。",
          ),
          h(
            "div",
            { className: "wb-upd-toast-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-upd-toast-btn",
                onClick: function () {
                  setAutoUpd(null);
                },
              },
              "稍后",
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-upd-toast-btn primary",
                onClick: function () {
                  setAutoUpd(null);
                  openUpdate();
                },
              },
              "升级",
            ),
          ),
        )
      : null,
    previewImg
      ? h(
          "div",
          {
            className: "wb-fb-lightbox",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": "图片预览",
            onClick: function () {
              setPreviewImg(null);
            },
          },
          h(
            "div",
            {
              className: "wb-fb-lightbox-inner",
              onClick: function (ev) {
                ev.stopPropagation();
              },
            },
            h(
              "button",
              {
                type: "button",
                className: "wb-fb-lightbox-x",
                "aria-label": "关闭预览",
                onClick: function () {
                  setPreviewImg(null);
                },
              },
              "×",
            ),
            h("img", {
              src: previewImg.url,
              alt: previewImg.name || "预览",
            }),
            previewImg.name
              ? h("p", { className: "wb-fb-lightbox-cap" }, previewImg.name)
              : null,
          ),
        )
      : null,
  );
}

function WorkBuddySettingsSection() {
  ensureCss();
  var draftState = useState(emptyDraft);
  var draft = draftState[0];
  var setDraft = draftState[1];
  var busyState = useState(false);
  var busy = busyState[0];
  var setBusy = busyState[1];
  var msgState = useState("");
  var msg = msgState[0];
  var setMsg = msgState[1];
  var msgOkState = useState(false);
  var msgOk = msgOkState[0];
  var setMsgOk = msgOkState[1];
  var testState = useState({});
  var tests = testState[0];
  var setTests = testState[1];
  var apiEpsState = useState([]);
  var apiEps = apiEpsState[0];
  var setApiEps = apiEpsState[1];
  var swaggerModeState = useState("file");
  var swaggerMode = swaggerModeState[0];
  var setSwaggerMode = swaggerModeState[1];
  var swaggerUrlState = useState("");
  var swaggerUrl = swaggerUrlState[0];
  var setSwaggerUrl = swaggerUrlState[1];
  var swaggerUserState = useState("");
  var swaggerUser = swaggerUserState[0];
  var setSwaggerUser = swaggerUserState[1];
  var swaggerPassState = useState("");
  var swaggerPass = swaggerPassState[0];
  var setSwaggerPass = swaggerPassState[1];
  var swaggerPasteState = useState("");
  var swaggerPaste = swaggerPasteState[0];
  var setSwaggerPaste = swaggerPasteState[1];
  var swaggerPreviewState = useState(null);
  var swaggerPreview = swaggerPreviewState[0];
  var setSwaggerPreview = swaggerPreviewState[1];
  var swaggerBusyState = useState(false);
  var swaggerBusy = swaggerBusyState[0];
  var setSwaggerBusy = swaggerBusyState[1];
  var swaggerFileRef = useRef(null);
  var docsSyncState = useState(null);
  var docsSync = docsSyncState[0];
  var setDocsSync = docsSyncState[1];
  var docsFormReady = useRef(false);
  var docsSyncBusyRef = useRef(false);
  var tabState = useState("mes");
  var tab = tabState[0];
  var setTab = tabState[1];
  var mesProfilesState = useState({ active_profile_id: "default", items: [] });
  var mesProfiles = mesProfilesState[0];
  var setMesProfiles = mesProfilesState[1];
  // 侧栏「工作区」注册表（path+title），不是会话 cwd
  var dshWsOptsState = useState([]);
  var dshWsOpts = dshWsOptsState[0];
  var setDshWsOpts = dshWsOptsState[1];
  var SET_NAV = [
    { id: "branding", label: "应用配置" },
    { id: "mes", label: "MES 连接" },
    { id: "llm", label: "商用模型" },
    { id: "remote_review", label: "远端审码" },
    { id: "cursor_coding", label: "公共模型" },
    { id: "automations", label: "自动化推送" },
  ];

  function applyEngineEndpoint() {
    try {
      localStorage.setItem("dsh-mes-engine-host", String(engineHost() || "127.0.0.1").trim());
      localStorage.setItem("dsh-mes-engine-port", String(enginePort() || "8000").trim());
    } catch (e) {}
  }

  function applyConfigPayload(c, sync, okMsg) {
    var base = emptyDraft();
    setDraft({
      mes: Object.assign({}, base.mes, c.mes || {}),
      deepseek: llmApplySlice(Object.assign({}, base.deepseek, c.deepseek || {})),
      vision: Object.assign({}, base.vision, c.vision || {}),
      code_dev: Object.assign({}, base.code_dev, c.code_dev || {}),
      code_review: Object.assign({}, base.code_review, c.code_review || {}),
      code_commit: Object.assign({}, base.code_commit, c.code_commit || {}),
      code_deploy: Object.assign({}, base.code_deploy, c.code_deploy || {}),
      automations: Object.assign({}, base.automations, c.automations || {}),
    });
    var docs = c.api_docs && typeof c.api_docs === "object" ? c.api_docs : {};
    setApiEps(Array.isArray(docs.endpoints) ? docs.endpoints : []);
    setDocsSync(sync && typeof sync === "object" ? sync : null);
    setSwaggerUrl(String(docs.source_url || ""));
    setSwaggerUser(String(docs.source_username || ""));
    setSwaggerPass(String(docs.source_password || ""));
    if (!docsFormReady.current && docs.source_url) setSwaggerMode("url");
    docsFormReady.current = true;
    var mc = c.mes_connections && typeof c.mes_connections === "object" ? c.mes_connections : {};
    setMesProfiles({
      active_profile_id: String(mc.active_profile_id || "default"),
      items: Array.isArray(mc.items) ? mc.items : [],
    });
    if (okMsg != null) {
      setMsg(okMsg);
      setMsgOk(true);
    }
  }

  function loadConfig() {
    setBusy(true);
    setMsg("加载中…");
    setMsgOk(false);
    applyEngineEndpoint();
    fetch(engineBase() + "/api/config")
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "引擎未响应");
        }
        applyConfigPayload(x.d.config, x.d.api_docs_sync, "已从引擎加载");
      })
      .catch(function (e) {
        setMsg("加载失败：" + (e && e.message ? e.message : String(e)) + "（请先 scripts/engine.sh zr-workbuddy ensure）");
        setMsgOk(false);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function guessBindWorkspace() {
    try {
      var cd = (draft && draft.code_dev && draft.code_dev.default_workspace) || "";
      if (String(cd).trim()) return String(cd).trim();
    } catch (e0) {}
    try {
      var d = window.workbuddyDesktop && window.workbuddyDesktop.workspace;
      if (d) return String(d).trim();
    } catch (e1) {}
    return "";
  }

  function readHostCtx() {
    try {
      return (
        (ctx && ctx._wbClientCtx) ||
        (typeof window !== "undefined" && window.__wbClientCtx) ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  /**
   * 侧栏「工作区」清单：host.workspaces（与左侧面板同源）。
   * 不是会话 cwd，也无按 MES 过滤。
   */
  function readDshWorkspaceRegistry() {
    var out = [];
    var seen = {};
    function push(path, title) {
      var p = String(path || "").trim();
      if (!p) return;
      var key = p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var t = String(title || "").trim();
      out.push({ path: p, title: t || p.split(/[/\\]/).filter(Boolean).pop() || p });
    }
    try {
      var host = readHostCtx();
      var wsSvc =
        (host && host.workspaces) ||
        (host && typeof host.get === "function" ? host.get("workspaces") : null);
      if (wsSvc && wsSvc.list && typeof wsSvc.list.getSnapshot === "function") {
        var snap = wsSvc.list.getSnapshot() || {};
        var items = Array.isArray(snap.items) ? snap.items : [];
        items.forEach(function (it) {
          if (it) push(it.path, it.title);
        });
      }
      // 兜底：直连 connection.api.workspace.list（注册表尚未投影到 store 时）
      if (!out.length && host && typeof host.get === "function") {
        var conn = host.get("connection");
        var api = conn && conn.api;
        if (api && api.workspace && typeof api.workspace.list === "function") {
          // 异步填充由 useEffect 负责；此处只读同步 store
        }
      }
    } catch (eReg) {}
    return out;
  }

  /** 下拉选项：优先侧栏工作区注册表；再拼会话 cwd / 已绑 / 写码默认 */
  function listAvailableWorkspaces(extraRoots) {
    var out = [];
    var seen = {};
    function push(path, title) {
      var p = String(path || "").trim();
      if (!p) return;
      var key = p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var t = String(title || "").trim();
      out.push({ path: p, title: t || p.split(/[/\\]/).filter(Boolean).pop() || p });
    }
    (Array.isArray(dshWsOpts) ? dshWsOpts : []).forEach(function (it) {
      if (it) push(it.path, it.title);
    });
    readDshWorkspaceRegistry().forEach(function (it) {
      push(it.path, it.title);
    });
    try {
      var host = readHostCtx();
      var sessions =
        (host && host.sessions) ||
        (host && typeof host.get === "function" ? host.get("sessions") : null);
      if (sessions) {
        var list = sessions.list;
        var snap = null;
        try {
          snap = list && typeof list.getSnapshot === "function" ? list.getSnapshot() : null;
        } catch (eSnap) {
          snap = null;
        }
        var buckets = [];
        if (snap && snap.byId) buckets.push(snap.byId);
        if (sessions.byId) buckets.push(sessions.byId);
        var bi;
        for (bi = 0; bi < buckets.length; bi++) {
          var bag = buckets[bi] || {};
          Object.keys(bag).forEach(function (sid) {
            var row = bag[sid];
            if (row && row.cwd) push(row.cwd, "");
          });
        }
      }
    } catch (eSess) {}
    if (Array.isArray(extraRoots)) {
      extraRoots.forEach(function (r) {
        push(r, "");
      });
    }
    push(guessBindWorkspace(), "");
    return out;
  }

  useEffect(function () {
    var host = readHostCtx();
    var unsub = null;
    var cancelled = false;

    function mergeOpts(rows) {
      var seen = {};
      var out = [];
      function push(path, title) {
        var p = String(path || "").trim();
        if (!p) return;
        var key = p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        var t = String(title || "").trim();
        out.push({ path: p, title: t || p.split(/[/\\]/).filter(Boolean).pop() || p });
      }
      (Array.isArray(rows) ? rows : []).forEach(function (it) {
        if (it) push(it.path, it.title);
      });
      readDshWorkspaceRegistry().forEach(function (it) {
        push(it.path, it.title);
      });
      if (!cancelled) setDshWsOpts(out);
    }

    function loadFromEngine() {
      try {
        applyEngineEndpoint();
      } catch (eAe) {}
      return fetch(engineBase() + "/api/config/dsh-workspaces")
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (cancelled) return;
          var items = d && d.ok && Array.isArray(d.items) ? d.items : [];
          mergeOpts(items);
        })
        .catch(function () {
          if (!cancelled) mergeOpts([]);
        });
    }

    try {
      var wsSvc =
        (host && host.workspaces) ||
        (host && typeof host.get === "function" ? host.get("workspaces") : null);
      if (wsSvc && wsSvc.list && typeof wsSvc.list.subscribe === "function") {
        unsub = wsSvc.list.subscribe(function () {
          mergeOpts([]);
        });
      }
    } catch (eSub) {}

    // 主路径：引擎读 DSH workspace.json（与侧栏 7 项同源）；Cordis store 仅作补充
    loadFromEngine();

    try {
      if (host && typeof host.get === "function") {
        var conn = host.get("connection");
        var api = conn && conn.api;
        if (api && api.workspace && typeof api.workspace.list === "function") {
          Promise.resolve(api.workspace.list({}))
            .then(function (resp) {
              var result = resp && resp.result;
              var items =
                result && result.ok && result.value && Array.isArray(result.value.items)
                  ? result.value.items
                  : [];
              if (!items.length || cancelled) return;
              mergeOpts(
                items.map(function (it) {
                  return {
                    path: String((it && it.path) || "").trim(),
                    title: String((it && it.title) || "").trim(),
                  };
                }),
              );
            })
            .catch(function () {});
        }
      }
    } catch (eApi) {}

    return function () {
      cancelled = true;
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch (eU) {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function postMesProfile(path, body, okMsg) {
    setBusy(true);
    setMsg("处理中…");
    setMsgOk(false);
    applyEngineEndpoint();
    return fetch(engineBase() + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "操作失败");
        }
        applyConfigPayload(x.d.config, x.d.api_docs_sync, okMsg || "已更新对接档案");
      })
      .catch(function (e) {
        setMsg(String(e && e.message ? e.message : e));
        setMsgOk(false);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function selectMesProfile(pid) {
    if (!pid) return;
    if (pid === mesProfiles.active_profile_id) {
      setMsg("当前已在编辑此卡");
      setMsgOk(true);
      return;
    }
    // 先保存当前档案，避免未落盘的地址/文档在切换时丢失
    Promise.resolve(saveConfig())
      .then(function () {
        return postMesProfile(
          "/api/config/mes-profiles/select",
          { profile_id: pid },
          "已切换到该对接卡（可编辑连接与文档）",
        );
      })
      .catch(function () {});
  }

  function createMesProfile() {
    var name = window.prompt("新对接项目名称（如：A 厂生产）", "");
    if (name == null) return;
    name = String(name).trim();
    Promise.resolve(saveConfig())
      .then(function () {
        return postMesProfile(
          "/api/config/mes-profiles",
          { name: name || "", workspace: "", clone_from_active: false },
          "已新增对接卡，请在本卡填写地址、导入文档并绑定工作区",
        );
      })
      .catch(function () {});
  }

  function bindMesWorkspacePath(ws) {
    ws = String(ws || "").trim();
    if (!ws) {
      setMsg("请选择工作区");
      setMsgOk(false);
      return;
    }
    Promise.resolve(saveConfig())
      .then(function () {
        return postMesProfile(
          "/api/config/mes-profiles/bind-workspace",
          { workspace: ws },
          "已绑定工作区",
        );
      })
      .catch(function () {});
  }

  function deleteMesProfile(pid) {
    if (!pid) return;
    var items = Array.isArray(mesProfiles.items) ? mesProfiles.items : [];
    if (items.length <= 1) {
      setMsg("至少保留一张对接卡");
      setMsgOk(false);
      return;
    }
    if (!window.confirm("删除该对接卡？地址与已导入文档将一起删除。")) return;
    setBusy(true);
    applyEngineEndpoint();
    fetch(engineBase() + "/api/config/mes-profiles/" + encodeURIComponent(pid), { method: "DELETE" })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "删除失败");
        }
        applyConfigPayload(x.d.config, x.d.api_docs_sync, "已删除对接档案");
      })
      .catch(function (e) {
        setMsg(String(e && e.message ? e.message : e));
        setMsgOk(false);
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function applySwaggerPreview(srcName, d, meta) {
    if (!d || !d.ok || !Array.isArray(d.endpoints)) {
      setMsg("解析失败：" + ((d && (d.detail || d.message)) || "未知错误"));
      setMsgOk(false);
      return;
    }
    var extra = meta || {};
    setSwaggerPreview({
      source: String(srcName || "接口文档"),
      endpoints: d.endpoints,
      info: d.info && typeof d.info === "object" ? d.info : {},
      sourceUrl: String(extra.sourceUrl || ""),
      clearSource: !!extra.clearSource,
    });
    setMsg("已解析 " + d.endpoints.length + " 个接口，请确认后导入");
    setMsgOk(true);
  }

  function commitSwaggerImport() {
    if (!swaggerPreview || !Array.isArray(swaggerPreview.endpoints)) return;
    setSwaggerBusy(true);
    setMsg("正在写入接口清单…");
    setMsgOk(false);
    applyEngineEndpoint();
    fetch(engineBase() + "/api/config/import/swagger/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoints: swaggerPreview.endpoints,
        source_url: swaggerPreview.sourceUrl || "",
        clear_source: !!swaggerPreview.clearSource,
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "导入失败");
        }
        setApiEps(swaggerPreview.endpoints.slice());
        var keepUrl = !!swaggerPreview.sourceUrl;
        setSwaggerPreview(null);
        if (!keepUrl) {
          setSwaggerMode("file");
          setSwaggerPaste("");
        }
        setMsg("已接入 " + (x.d.count != null ? x.d.count : swaggerPreview.endpoints.length) + " 个接口，问数将走这些接口");
        setMsgOk(true);
        loadConfig();
      })
      .catch(function (e) {
        setMsg("导入失败：" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      })
      .finally(function () {
        setSwaggerBusy(false);
      });
  }

  function fetchSwaggerFromUrl() {
    var url = String(swaggerUrl || "").trim();
    if (!url) {
      setMsg("请填写接口文档 URL（如 …/docs 或 …/openapi.json）");
      setMsgOk(false);
      return;
    }
    setSwaggerBusy(true);
    setMsg("正在获取并解析…");
    setMsgOk(false);
    applyEngineEndpoint();
    fetch(engineBase() + "/api/config/import/swagger/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: url,
        username: String(swaggerUser || "").trim(),
        password: String(swaggerPass || ""),
      }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "解析失败");
        }
        applySwaggerPreview(url, x.d, {
          sourceUrl: url,
          clearSource: false,
        });
        if (String(swaggerPass || "") && swaggerPass !== "••••••••") setSwaggerPass("••••••••");
      })
      .catch(function (e) {
        setMsg("从 URL 导入失败：" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      })
      .finally(function () {
        setSwaggerBusy(false);
      });
  }

  function parseSwaggerPaste() {
    var content = String(swaggerPaste || "").trim();
    if (!content) {
      setMsg("请先粘贴 OpenAPI / Markdown 原文");
      setMsgOk(false);
      return;
    }
    setSwaggerBusy(true);
    setMsg("正在解析粘贴内容…");
    setMsgOk(false);
    applyEngineEndpoint();
    fetch(engineBase() + "/api/config/import/swagger/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "解析失败");
        }
        applySwaggerPreview("粘贴内容", x.d, { clearSource: true });
      })
      .catch(function (e) {
        setMsg("粘贴解析失败：" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      })
      .finally(function () {
        setSwaggerBusy(false);
      });
  }

  function onSwaggerFileChange(e) {
    var input = e && e.target;
    var f = input && input.files && input.files[0];
    if (!f) return;
    setSwaggerBusy(true);
    setMsg("正在上传并解析…");
    setMsgOk(false);
    applyEngineEndpoint();
    var fd = new FormData();
    fd.append("file", f);
    fetch(engineBase() + "/api/config/import/swagger", { method: "POST", body: fd })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "解析失败");
        }
        applySwaggerPreview(f.name || "上传文件", x.d, { clearSource: true });
      })
      .catch(function (err) {
        setMsg("上传解析失败：" + (err && err.message ? err.message : String(err)));
        setMsgOk(false);
      })
      .finally(function () {
        setSwaggerBusy(false);
        try {
          if (input) input.value = "";
        } catch (ex) {}
      });
  }

  var rootRef = useRef(null);
  var pluginApiRef = useRef(null);

  function reportPluginStatus(nextBusy, nextMsg, nextOk) {
    setBusy(!!nextBusy);
    if (nextMsg != null) setMsg(String(nextMsg));
    if (nextOk != null) setMsgOk(!!nextOk);
  }

  function saveCurrent() {
    if (tab === "branding") {
      saveBranding();
      return;
    }
    if (tab === "remote_review" || tab === "cursor_coding") {
      var api = pluginApiRef.current;
      if (api && typeof api.save === "function") api.save();
      else {
        setMsg("当前页尚未就绪，请稍候再保存");
        setMsgOk(false);
      }
      return;
    }
    saveConfig();
  }

  function loadCurrent() {
    if (tab === "branding") {
      loadBranding();
      return;
    }
    if (tab === "remote_review" || tab === "cursor_coding") {
      var api = pluginApiRef.current;
      if (api && typeof api.load === "function") api.load();
      else {
        setMsg("当前页尚未就绪，请稍候再加载");
        setMsgOk(false);
      }
      return;
    }
    loadConfig();
  }

  useEffect(function () {
    if (tab === "remote_review" || tab === "cursor_coding") return;
    loadConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- 应用配置（logo / 名称 / 概览） ----
  var brandingState = useState({ enabled: false, app_name: "", app_overview: "", logo_url: "" });
  var branding = brandingState[0];
  var setBranding = brandingState[1];
  var brandingBusyState = useState(false);
  var brandingBusy = brandingBusyState[0];
  var setBrandingBusy = brandingBusyState[1];
  var brandingMsgState = useState("");
  var brandingMsg = brandingMsgState[0];
  var setBrandingMsg = brandingMsgState[1];
  var brandingOkState = useState(false);
  var brandingOk = brandingOkState[0];
  var setBrandingOk = brandingOkState[1];
  var logoInputRef = useRef(null);

  function loadBranding() {
    setBrandingBusy(true);
    setBrandingMsg("加载中…");
    setBrandingOk(false);
    fetch(engineBase() + "/api/branding")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.branding) {
          setBranding(d.branding);
          setBrandingMsg("已加载应用配置");
          setBrandingOk(true);
        } else {
          throw new Error("引擎未响应");
        }
      })
      .catch(function (e) {
        setBrandingMsg("加载失败：" + (e && e.message ? e.message : String(e)));
        setBrandingOk(false);
      })
      .finally(function () { setBrandingBusy(false); });
  }

  function saveBranding() {
    setBrandingBusy(true);
    setBrandingMsg("保存中…");
    setBrandingOk(false);
    fetch(engineBase() + "/api/branding", {
      method: "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        enabled: !!branding.enabled,
        app_name: branding.app_name || "",
        app_overview: branding.app_overview || "",
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.branding) {
          setBranding(d.branding);
          setBrandingMsg(branding.enabled ? "已启用自定义配置，刷新页面生效" : "已保存（未启用，使用内置默认值）");
          setBrandingOk(true);
        } else {
          throw new Error((d && (d.detail || d.message)) || "保存失败");
        }
      })
      .catch(function (e) {
        setBrandingMsg("保存失败：" + (e && e.message ? e.message : String(e)));
        setBrandingOk(false);
      })
      .finally(function () { setBrandingBusy(false); });
  }

  function uploadLogo(file) {
    if (!file) return;
    setBrandingBusy(true);
    setBrandingMsg("上传 logo 中…");
    setBrandingOk(false);
    var fd = new FormData();
    fd.append("file", file);
    fetch(engineBase() + "/api/branding/logo", {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.ok && d.branding) {
          setBranding(d.branding);
          setBrandingMsg("logo 已上传，保存后启用生效");
          setBrandingOk(true);
        } else {
          throw new Error((d && (d.detail || d.message)) || "上传失败");
        }
      })
      .catch(function (e) {
        setBrandingMsg("上传失败：" + (e && e.message ? e.message : String(e)));
        setBrandingOk(false);
      })
      .finally(function () { setBrandingBusy(false); });
  }

  useEffect(function () {
    loadBranding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // 兜底：仅拉宽宿主设置 panel，不改其 display（避免内容被顶到底）
  useLayoutEffect(function () {
    var el = rootRef.current;
    if (!el || typeof document === "undefined") return undefined;
    var panel =
      document.querySelector(".VOzbGW_panel") ||
      (el.closest && el.closest("[class*='_panel']")) ||
      null;
    if (!panel) {
      var node = el.parentElement;
      while (node && node !== document.body) {
        if (node.className && String(node.className).indexOf("_panel") >= 0) {
          panel = node;
          break;
        }
        node = node.parentElement;
      }
    }
    if (!panel) return undefined;
    panel.classList.add("wb-set-host-wide");
    var prevW = panel.style.width;
    var prevMw = panel.style.maxWidth;
    // 清掉上一版误加的 flex/maxHeight，避免残留
    panel.style.removeProperty("display");
    panel.style.removeProperty("flex-direction");
    panel.style.removeProperty("max-height");
    panel.style.setProperty("width", "920px", "important");
    panel.style.setProperty("max-width", "calc(100vw - 48px)", "important");
    var options =
      panel.querySelector("[class*='_options']") ||
      (el.closest && el.closest("[class*='_options']")) ||
      null;
    if (options) {
      options.style.removeProperty("display");
      options.style.removeProperty("flex-direction");
      options.style.removeProperty("flex");
      options.style.removeProperty("min-height");
      options.style.removeProperty("padding-bottom");
      options.style.removeProperty("margin-bottom");
      options.style.removeProperty("overflow");
      options.style.removeProperty("height");
    }
    return function () {
      panel.classList.remove("wb-set-host-wide");
      panel.style.width = prevW;
      panel.style.maxWidth = prevMw;
    };
  }, []);

  function saveConfig() {
    setBusy(true);
    setMsg("保存中…");
    setMsgOk(false);
    applyEngineEndpoint();
    var payload = {
      mes: Object.assign({}, draft.mes, {
        timeout: Math.max(5, Number(draft.mes.timeout) || 30),
      }),
      deepseek: llmPrepareSave(draft.deepseek),
      vision: Object.assign({}, draft.vision || {}, {
        api_key: (draft.vision && draft.vision.api_key) || "",
        base_url: String((draft.vision && draft.vision.base_url) || "").trim().replace(/\/$/, ""),
        model: String((draft.vision && draft.vision.model) || "").trim(),
      }),
      code_dev: Object.assign({}, draft.code_dev, {
        model: (draft.code_dev.model || "").trim() || "composer-2.5",
        max_concurrent: Math.max(1, Number(draft.code_dev.max_concurrent) || 1),
        cursor_timeout_sec: Math.max(60, Number(draft.code_dev.cursor_timeout_sec) || 2700),
        default_workspace: (draft.code_dev.default_workspace || "").trim(),
      }),
      code_review: Object.assign({}, draft.code_review, {
        enabled: true,
        max_files: Math.max(1, Number(draft.code_review.max_files) || 40),
        max_file_bytes: Math.max(1024, Number(draft.code_review.max_file_bytes) || 120000),
        max_total_bytes: Math.max(4096, Number(draft.code_review.max_total_bytes) || 800000),
        default_workspace: (draft.code_review.default_workspace || "").trim(),
      }),
      code_commit: Object.assign({}, draft.code_commit, {
        enabled: true,
        default_workspace: (draft.code_commit.default_workspace || "").trim(),
        work_branch: "",
        remote_name: (draft.code_commit.remote_name || "").trim() || "origin",
        default_push: draft.code_commit.default_push !== false,
        max_files: Math.max(1, Number(draft.code_commit.max_files) || 80),
        use_skill_review: draft.code_commit.use_skill_review !== false,
        allow_blocked: !!draft.code_commit.allow_blocked,
      }),
      // 部署规则已全部迁到各工程 .workbuddy/；配置中心不再写 code_deploy。
      automations: Object.assign({}, draft.automations || {}, {
        wecom_webhook_key: (draft.automations && draft.automations.wecom_webhook_key) || "",
        wecom_push_enabled: !!(draft.automations && draft.automations.wecom_push_enabled),
        wecom_push_dry_run: !!(draft.automations && draft.automations.wecom_push_dry_run),
        feishu_app_id: String((draft.automations && draft.automations.feishu_app_id) || "").trim(),
        feishu_app_secret: (draft.automations && draft.automations.feishu_app_secret) || "",
        feishu_bitable_enabled: !!(draft.automations && draft.automations.feishu_bitable_enabled),
        feishu_bitable_dry_run: !!(draft.automations && draft.automations.feishu_bitable_dry_run),
      }),
    };
    return fetch(engineBase() + "/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: payload }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "保存失败");
        }
        applyConfigPayload(x.d.config || {}, x.d.api_docs_sync, "已保存到引擎 config.yaml");
        return x.d;
      })
      .catch(function (e) {
        setMsg("保存失败：" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
        throw e;
      })
      .finally(function () {
        setBusy(false);
      });
  }

  function runTest(key, path, body) {
    applyEngineEndpoint();
    setTests(function (prev) {
      var n = Object.assign({}, prev);
      n[key] = "测试中…";
      return n;
    });
    var opts = body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined;
    fetch(engineBase() + path, opts)
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        var d = x.d || {};
        var text =
          d.detail ||
          d.message ||
          d.summary ||
          (d.ok === false ? "未就绪" : d.ok ? "OK" : JSON.stringify(d).slice(0, 240));
        setTests(function (prev) {
          var n = Object.assign({}, prev);
          n[key] = (x.ok && d.ok !== false ? "✅ " : "❌ ") + text;
          return n;
        });
      })
      .catch(function (e) {
        setTests(function (prev) {
          var n = Object.assign({}, prev);
          n[key] = "❌ " + (e && e.message ? e.message : String(e));
          return n;
        });
      });
  }


  var mes = draft.mes;
  var llm = draft.deepseek;
  var vision = draft.vision || {};
  var auto = draft.automations || {};

  var VISION_PRESETS = [
    {
      id: "zhipu",
      label: "智谱 GLM-4V",
      base: "https://open.bigmodel.cn/api/paas/v4",
      model: "glm-4v-flash",
    },
    {
      id: "qwen-vl",
      label: "Qwen-VL",
      base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-vl-plus",
    },
    { id: "custom", label: "自定义", base: "", model: "" },
  ];

  function inferVisionPresetId() {
    var base = String(vision.base_url || "")
      .trim()
      .replace(/\/$/, "");
    if (!base) return vision.model ? "custom" : "";
    for (var i = 0; i < VISION_PRESETS.length; i++) {
      var p = VISION_PRESETS[i];
      if (p.id === "custom" || !p.base) continue;
      if (String(p.base).replace(/\/$/, "") === base) return p.id;
    }
    return "custom";
  }

  var visionPresetId = inferVisionPresetId();
  var visionKeyConfigured =
    !!vision.api_key && (/^•+$/.test(String(vision.api_key)) || String(vision.api_key).length > 0);

  function applyVisionPreset(p) {
    if (p.id === "custom") {
      setMsg("请自行填写视觉模型 Base URL 与模型名称");
      setMsgOk(true);
      return;
    }
    patchDraft(setDraft, ["vision", "base_url"], p.base);
    patchDraft(setDraft, ["vision", "model"], p.model);
    setMsg("已填入 " + p.label + "（请确认视觉 API Key）");
    setMsgOk(true);
  }

  function labeledField(label, props, full, meta) {
    var p = props || {};
    return h(
      "div",
      { className: "wb-set-field" + (full ? " full" : "") },
      h("label", null, label, h("span", { className: "wb-set-badge" }, "界面")),
      p.multiline ? h("textarea", p) : h("input", p),
      meta || null,
    );
  }

  function clearImportedApis() {
    if (typeof window !== "undefined" && window.confirm) {
      if (!window.confirm("确认清除已导入的全部接口清单？可稍后重新导入。")) return;
    }
    setSwaggerBusy(true);
    setMsg("正在清除已导入接口…");
    setMsgOk(false);
    applyEngineEndpoint();
    fetch(engineBase() + "/api/config/import/swagger/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoints: [], clear_source: true }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error((x.d && (x.d.detail || x.d.message)) || "清除失败");
        }
        setApiEps([]);
        setSwaggerPreview(null);
        setDocsSync(null);
        setMsg("已清除接口清单，可重新导入验证");
        setMsgOk(true);
        loadConfig();
      })
      .catch(function (e) {
        setMsg("清除失败：" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      })
      .finally(function () {
        setSwaggerBusy(false);
      });
  }

  function syncRememberedDocsQuiet() {
    /**
     * 打开「MES 连接」且已到期（默认满 1 天）时后台静默同步。
     * 不弹「正在同步」、不禁用按钮，避免每次切页阻塞界面。
     */
    if (docsSyncBusyRef.current) return;
    docsSyncBusyRef.current = true;
    applyEngineEndpoint();
    fetch(engineBase() + "/api/config/import/swagger/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "", username: "", password: "" }),
    })
      .then(function (r) {
        return r.json().then(function (d) {
          return { ok: r.ok, d: d };
        });
      })
      .then(function (x) {
        if (!x.d || x.d.skipped) return;
        // 仅刷新状态区；失败也不打断当前编辑
        loadConfig();
      })
      .catch(function () {})
      .finally(function () {
        docsSyncBusyRef.current = false;
      });
  }

  useEffect(
    function () {
      if (tab !== "mes") return undefined;
      var cancelled = false;
      var timer = setTimeout(function () {
        if (cancelled) return;
        applyEngineEndpoint();
        fetch(engineBase() + "/api/config")
          .then(function (r) {
            return r.json().then(function (d) {
              return { ok: r.ok, d: d };
            });
          })
          .then(function (x) {
            if (cancelled || !x.ok || !x.d || !x.d.ok) return;
            var sync =
              x.d.api_docs_sync && typeof x.d.api_docs_sync === "object"
                ? x.d.api_docs_sync
                : null;
            // 未到期：只展示状态，不拉文档
            if (!sync || !sync.enabled || !sync.due) return;
            syncRememberedDocsQuiet();
          })
          .catch(function () {});
      }, 200);
      return function () {
        cancelled = true;
        clearTimeout(timer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [tab],
  );

  function runSwaggerParse() {
    if (swaggerMode === "url") {
      fetchSwaggerFromUrl();
      return;
    }
    if (swaggerMode === "paste") {
      parseSwaggerPaste();
      return;
    }
    if (swaggerFileRef.current) swaggerFileRef.current.click();
  }

  var apiEpsPreview = (apiEps || []).slice(0, 6);
  var mesProfileItems = Array.isArray(mesProfiles.items) ? mesProfiles.items : [];
  var activeMesProfileId = String(mesProfiles.active_profile_id || "default");
  var activeDocsCount = Array.isArray(apiEps) ? apiEps.length : 0;

  var mesDocsEditor = h(
    "div",
    { className: "wb-set-mes-docs" },
    h("h4", { style: { margin: "14px 0 6px", fontSize: "14px" } }, "接口文档导入"),
    h(
      "p",
      { className: "wb-set-hint" },
      "与上方连接同属本卡。上传 OpenAPI / Swagger / Markdown，或从 URL 拉取；问数只自动调用无路径参数的只读 GET。",
    ),
    h(
      "div",
      { className: "wb-set-field", style: { marginBottom: "10px" } },
      h("label", null, "导入方式"),
      h(
        "div",
        { className: "wb-set-presets", role: "tablist", "aria-label": "接口文档导入方式" },
        [
          { id: "file", label: "上传文件" },
          { id: "url", label: "从 URL" },
          { id: "paste", label: "粘贴原文" },
        ].map(function (m) {
          var on = swaggerMode === m.id;
          return h(
            "button",
            {
              key: m.id,
              type: "button",
              role: "tab",
              "aria-selected": on ? "true" : "false",
              className: "wb-set-preset" + (on ? " active" : ""),
              disabled: busy || swaggerBusy,
              onClick: function () {
                setSwaggerMode(m.id);
              },
            },
            m.label,
          );
        }),
      ),
    ),
    h("input", {
      ref: swaggerFileRef,
      type: "file",
      accept: ".json,.yaml,.yml,.md,.markdown,.txt,application/json",
      style: { display: "none" },
      onChange: onSwaggerFileChange,
    }),
    swaggerMode === "file"
      ? h(
          "p",
          { className: "wb-set-hint", style: { marginTop: 0 } },
          "支持 .json / .yaml / .yml / .md / .txt。点击下方「获取并解析」选择本地文件。",
        )
      : null,
    swaggerMode === "url"
      ? h(
          "div",
          { style: { marginTop: "2px" } },
          h(
            "div",
            { className: "wb-set-grid" },
            field(
              "接口文档 URL",
              {
                value: swaggerUrl,
                placeholder: "https://业务系统/docs 或 …/openapi.json",
                onChange: function (e) {
                  setSwaggerUrl(e.target.value);
                },
              },
              true,
            ),
            field("用户名（可选 Basic）", {
              value: swaggerUser,
              autoComplete: "off",
              onChange: function (e) {
                setSwaggerUser(e.target.value);
              },
            }),
            field("密码（可选）", {
              type: "password",
              autoComplete: "new-password",
              value: swaggerPass,
              onChange: function (e) {
                setSwaggerPass(e.target.value);
              },
            }),
          ),
          h(
            "p",
            { className: "wb-set-hint", style: { marginTop: "8px" } },
            "解析成功后会记住地址、用户名和密码。已记住后可按日自动同步；失败仍用上一份接口清单。",
          ),
          h(
            "p",
            { className: "wb-set-hint", style: { marginBottom: "8px" } },
            docsSync && docsSync.last_error
              ? "上次同步失败（" +
                (docsSync.last_error_at || "时间未知") +
                "）：" +
                docsSync.last_error +
                " 问数仍使用已保存的接口清单。"
              : docsSync && docsSync.last_ok_at
                ? "上次同步成功（" +
                  docsSync.last_ok_at +
                  "），共 " +
                  (docsSync.last_count || (apiEps && apiEps.length) || 0) +
                  " 个接口。"
                : docsSync && docsSync.source_url
                  ? "已记住文档地址，尚未同步。"
                  : "尚未记住文档地址。",
          ),
        )
      : null,
    swaggerMode === "paste"
      ? h(
          "div",
          { style: { marginTop: "2px" } },
          h(
            "div",
            { className: "wb-set-field full" },
            h("label", null, "粘贴 OpenAPI / Markdown"),
            h("textarea", {
              value: swaggerPaste,
              rows: 8,
              placeholder: '可粘贴 OpenAPI JSON/YAML，或 Markdown 中的 "GET /api/…" 列表',
              onChange: function (e) {
                setSwaggerPaste(e.target.value);
              },
              style: { width: "100%", minHeight: "140px", fontFamily: "ui-monospace, monospace", fontSize: "12px" },
            }),
          ),
        )
      : null,
    h(
      "div",
      { className: "wb-set-actions", style: { marginTop: "12px" } },
      h(
        "button",
        {
          type: "button",
          className: "wb-set-btn primary",
          disabled: busy || swaggerBusy,
          onClick: runSwaggerParse,
        },
        swaggerBusy ? "解析中…" : "获取并解析",
      ),
    ),
    swaggerPreview
      ? h(
          "div",
          {
            className: "wb-set-test",
            style: {
              marginTop: "12px",
              padding: "12px",
              border: "1px solid var(--dsw-alias-border-1, #e5e7eb)",
              borderRadius: "8px",
              background: "var(--dsw-alias-bg-layer-1, #fafafa)",
            },
          },
          h(
            "p",
            { style: { margin: "0 0 8px", fontWeight: 600 } },
            "预览：" +
              (swaggerPreview.source || "") +
              " · 共 " +
              ((swaggerPreview.endpoints && swaggerPreview.endpoints.length) || 0) +
              " 个接口（确认后将替换当前清单）",
          ),
          h(
            "div",
            { style: { maxHeight: "220px", overflow: "auto", fontSize: "12px", lineHeight: "1.5" } },
            (swaggerPreview.endpoints || []).slice(0, 12).map(function (ep, i) {
              return h(
                "div",
                { key: i, style: { marginBottom: "4px" } },
                h("code", null, String(ep.method || "GET").toUpperCase() + " " + (ep.path || "")),
                " ",
                h("span", { style: { opacity: 0.75 } }, ep.desc || ep.name || ""),
              );
            }),
            (swaggerPreview.endpoints || []).length > 12
              ? h(
                  "p",
                  { className: "wb-set-hint", style: { marginTop: "6px" } },
                  "… 其余 " + ((swaggerPreview.endpoints || []).length - 12) + " 个已包含",
                )
              : null,
          ),
          h(
            "div",
            { className: "wb-set-actions", style: { marginTop: "10px" } },
            h(
              "button",
              {
                type: "button",
                className: "wb-set-btn primary",
                disabled: busy || swaggerBusy,
                onClick: commitSwaggerImport,
              },
              swaggerBusy ? "导入中…" : "确认导入",
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-set-btn",
                disabled: swaggerBusy,
                onClick: function () {
                  setSwaggerPreview(null);
                },
              },
              "取消",
            ),
          ),
        )
      : null,
    h(
      "div",
      {
        style: {
          marginTop: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          flexWrap: "wrap",
        },
      },
      h(
        "p",
        { className: "wb-set-hint", style: { margin: 0, flex: "1 1 200px" } },
        apiEps && apiEps.length
          ? "已接入 " + apiEps.length + " 个接口，问数将走这些接口（优先匹配其中的只读 GET）："
          : "尚未接入接口。导入后请用底部「保存配置」，再在对应工作区聊天里问数。",
      ),
      apiEps && apiEps.length
        ? h(
            "button",
            {
              type: "button",
              className: "wb-set-btn",
              disabled: busy || swaggerBusy,
              onClick: clearImportedApis,
            },
            "清除已导入",
          )
        : null,
    ),
    apiEpsPreview.length
      ? h(
          "div",
          { style: { fontSize: "12px", lineHeight: "1.55", opacity: 0.9, marginTop: "6px" } },
          apiEpsPreview.map(function (ep, i) {
            return h(
              "div",
              { key: i },
              h("code", null, String(ep.method || "GET").toUpperCase() + " " + (ep.path || "")),
              ep.desc || ep.name ? " — " + (ep.desc || ep.name) : "",
            );
          }),
          apiEps.length > apiEpsPreview.length
            ? h("div", { style: { marginTop: "4px", opacity: 0.7 } }, "… 共 " + apiEps.length + " 个")
            : null,
        )
      : null,
  );

  function mesCardToolIcon(kind) {
    var common = {
      className: "wb-set-card-icon-svg",
      "aria-hidden": "true",
      width: 16,
      height: 16,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    };
    if (kind === "edit") {
      return h(
        "svg",
        common,
        h("path", { d: "M12 20h9" }),
        h("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" }),
      );
    }
    return h(
      "svg",
      common,
      h("path", { d: "M3 6h18" }),
      h("path", { d: "M8 6V4h8v2" }),
      h("path", { d: "M19 6l-1 14H6L5 6" }),
      h("path", { d: "M10 11v6M14 11v6" }),
    );
  }

  function mesCardHead(title, opts) {
    var o = opts || {};
    var tools = [];
    if (o.onEdit) {
      tools.push(
        h(
          "button",
          {
            key: "edit",
            type: "button",
            className: "wb-set-card-icon",
            title: "编辑此卡",
            "aria-label": "编辑此卡",
            disabled: busy,
            onClick: o.onEdit,
          },
          mesCardToolIcon("edit"),
        ),
      );
    }
    if (o.onDelete) {
      tools.push(
        h(
          "button",
          {
            key: "del",
            type: "button",
            className: "wb-set-card-icon danger",
            title: "删除本卡",
            "aria-label": "删除本卡",
            disabled: busy,
            onClick: o.onDelete,
          },
          mesCardToolIcon("delete"),
        ),
      );
    }
    return h(
      "div",
      { className: "wb-set-card-head" },
      h("h3", null, title),
      tools.length ? h("div", { className: "wb-set-card-tools" }, tools) : null,
    );
  }

  function renderMesProfileCard(it) {
    var id = String((it && it.id) || "");
    var on = id === activeMesProfileId;
    var name = String((it && it.name) || id || "对接");
    var roots = it && Array.isArray(it.workspace_roots) ? it.workspace_roots : [];
    var nDocs =
      on && apiEps
        ? apiEps.length
        : it && it.api_docs && Array.isArray(it.api_docs.endpoints)
          ? it.api_docs.endpoints.length
          : 0;
    var baseHint =
      on
        ? String((mes && mes.base_url) || "")
        : String((it && it.mes && it.mes.base_url) || "");
    var cardTools = {
      onEdit: function () {
        selectMesProfile(id);
      },
      onDelete: function () {
        deleteMesProfile(id);
      },
    };

    if (!on) {
      return h(
        "div",
        { key: id, className: "wb-set-card", style: { opacity: 0.92 } },
        mesCardHead(name, cardTools),
        h(
          "div",
          { className: "body" },
          h(
            "p",
            { className: "wb-set-hint", style: { marginTop: 0 } },
            (baseHint ? "地址 " + baseHint + " · " : "") +
              (nDocs ? "文档 " + nDocs + " 个接口" : "文档未导入") +
              (roots.length ? " · 工作区 " + roots.join("；") : " · 未绑定工作区"),
          ),
        ),
      );
    }

    return h(
      "div",
      {
        key: id,
        className: "wb-set-card",
        style: { borderColor: "var(--dsw-alias-color-primary, #2563eb)", borderWidth: "1px", borderStyle: "solid" },
      },
      mesCardHead(name + "（当前编辑）", cardTools),
      h(
        "div",
        { className: "body" },
        (function () {
          function pathKey(p) {
            return String(p || "")
              .trim()
              .replace(/\\/g, "/")
              .replace(/\/+$/, "")
              .toLowerCase();
          }
          var boundRaw = roots.length ? String(roots[0] || "").trim() : "";
          var opts = listAvailableWorkspaces(roots);
          var boundKey = pathKey(boundRaw);
          var matched = null;
          opts.forEach(function (o) {
            if (!matched && pathKey(o.path) === boundKey) matched = o;
          });
          // 回显必须用 option.value 原文，否则 Windows 规范化后大小写/斜杠对不上会空白
          var selectValue = matched ? matched.path : boundRaw;
          if (boundRaw && !matched) {
            opts = [{ path: boundRaw, title: boundRaw }].concat(opts);
            selectValue = boundRaw;
          }
          var showLabel = matched
            ? matched.title && matched.title !== matched.path
              ? matched.title + " — " + matched.path
              : matched.path
            : boundRaw;
          return h(
            "div",
            { className: "wb-set-field full", style: { marginBottom: "10px" } },
            h("label", null, "绑定工作区"),
            h(
              "select",
              {
                value: selectValue,
                disabled: busy,
                onChange: function (e) {
                  bindMesWorkspacePath(e.target.value);
                },
              },
              h(
                "option",
                { value: "" },
                opts.length ? "请选择工作区（与左侧工作区列表相同）" : "暂无可用工作区（请先在左侧添加工程）",
              ),
              opts.map(function (o) {
                var p = o.path;
                var label = o.title && o.title !== p ? o.title + " — " + p : p;
                return h("option", { key: p, value: p }, label);
              }),
            ),
            boundRaw
              ? h(
                  "div",
                  { className: "wb-set-field-meta" },
                  "已绑定：" + (showLabel || boundRaw),
                )
              : null,
          );
        })(),
        h("h4", { style: { margin: "4px 0 6px", fontSize: "14px" } }, "MES 连接"),
        h("div", { className: "wb-set-grid" },
          field(
            "Base URL",
            {
              value: mes.base_url || "",
              onChange: function (e) {
                patchDraft(setDraft, ["mes", "base_url"], e.target.value);
              },
            },
            true,
          ),
          field("账号", {
            value: mes.username || "",
            onChange: function (e) {
              patchDraft(setDraft, ["mes", "username"], e.target.value);
            },
          }),
          field("密码（脱敏回显）", {
            type: "password",
            autoComplete: "new-password",
            value: mes.password || "",
            onChange: function (e) {
              patchDraft(setDraft, ["mes", "password"], e.target.value);
            },
          }),
          field(
            "企业编码",
            {
              value: mes.enterprise_code || "",
              onChange: function (e) {
                patchDraft(setDraft, ["mes", "enterprise_code"], e.target.value);
              },
            },
            true,
          ),
        ),
        mesDocsEditor,
      ),
    );
  }

  var sectionMes = h(
    "div",
    { className: "wb-set-auto-stack" },
    h(
      "div",
      { className: "wb-set-mes-toolbar" },
      h(
        "p",
        { className: "wb-set-hint", style: { margin: 0 } },
        "每个项目一张对接卡；右上角 + 新增，底部「保存配置」整卡落盘。",
      ),
      h(
        "button",
        {
          type: "button",
          className: "wb-set-card-icon primary",
          title: "新增对接卡",
          "aria-label": "新增对接卡",
          disabled: busy,
          onClick: createMesProfile,
        },
        h(
          "svg",
          {
            className: "wb-set-card-icon-svg",
            "aria-hidden": "true",
            width: 16,
            height: 16,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            strokeLinecap: "round",
          },
          h("path", { d: "M12 5v14M5 12h14" }),
        ),
      ),
    ),
    mesProfileItems.length
      ? mesProfileItems.map(renderMesProfileCard)
      : h(
          "div",
          { className: "wb-set-card" },
          h("h3", null, "江西中软制造执行系统"),
          h("div", { className: "body" }, h("p", { className: "wb-set-hint" }, "加载中…")),
        ),
  );

  var sectionLlm = h(
    "div",
    { className: "wb-set-auto-stack" },
    h(
      "div",
      { className: "wb-set-card" },
      h("h3", null, "商用模型 / LLM 意图引擎"),
      h(
        "div",
        { className: "body" },
        h(
          "p",
          { className: "wb-set-hint" },
          "审码、意图与 DSH 聊天共用此处模型配置。选择 DeepSeek 时保存会同步 Key 到本机 DSH 凭据，不必再去「设置 → 模型」填一遍。亦可选 Ollama 或 OpenAI 兼容的通用模型。",
        ),
        h(
          "div",
          { className: "wb-set-field", style: { marginBottom: "12px" } },
          h("label", null, "提供方"),
          h(
            "div",
            { className: "wb-set-radios" },
            (function () {
              var llmProv = llm.provider || "deepseek";
              if (llmProv === "none") llmProv = "deepseek";
              return [
                ["deepseek", "DeepSeek API"],
                ["ollama", "Ollama 本地"],
                ["openai_compat", "通用模型配置"],
              ].map(function (pair) {
                var on = llmProv === pair[0];
                return h(
                  "label",
                  { key: pair[0], className: on ? "active" : "" },
                  h("input", {
                    type: "radio",
                    name: "wb-llm",
                    checked: on,
                    onChange: function () {
                      setDraft(function (prev) {
                        var oldProv = llmNormalizeProvider((prev.deepseek && prev.deepseek.provider) || "deepseek");
                        var flushed = llmApplySlice(prev.deepseek || {});
                        var by = llmFlushSlice(flushed, oldProv);
                        var newProv = pair[0];
                        var slice = Object.assign({}, llmDefaultSlot(newProv), by[newProv] || {});
                        return Object.assign({}, prev, {
                          deepseek: {
                            provider: newProv,
                            by_provider: by,
                            api_key: slice.api_key,
                            base_url: slice.base_url,
                            model: slice.model,
                          },
                        });
                      });
                    },
                  }),
                  " ",
                  pair[1],
                );
              });
            })(),
          ),
        ),
        h(
          "div",
          { className: "wb-set-grid" },
          (function () {
            var llmProv = llm.provider || "deepseek";
            if (llmProv === "none") llmProv = "deepseek";
            if (llmProv === "ollama") return null;
            var llmKeyConfigured = secretMaskConfigured(llm.api_key);
            var keyLabel =
              llmProv === "openai_compat" ? "API Key" : "API Key（脱敏回显）";
            return labeledField(
              keyLabel,
              {
                type: "password",
                autoComplete: "new-password",
                value: llmKeyConfigured ? "" : llm.api_key || "",
                placeholder: llmKeyConfigured
                  ? "已配置，留空保存则保持不变"
                  : llmProv === "openai_compat"
                    ? "未配置，请粘贴 OpenAI 兼容 Key"
                    : "未配置，请粘贴 DeepSeek Key 后保存",
                onChange: function (e) {
                  patchDraft(setDraft, ["deepseek", "api_key"], e.target.value);
                },
              },
              true,
              h(
                "div",
                { className: "wb-set-field-meta" },
                llmKeyConfigured
                  ? h("span", null, "当前已配置（已脱敏，留空保存不修改）")
                  : h("span", null, "尚未保存 Key；保存后此处只显示状态，不回显明文"),
                llmKeyConfigured
                  ? h(
                      "button",
                      {
                        type: "button",
                        className: "wb-set-clear",
                        onClick: function () {
                          patchDraft(setDraft, ["deepseek", "api_key"], "");
                          setMsg("已清除 Key，保存后生效");
                          setMsgOk(true);
                        },
                      },
                      "清除 Key",
                    )
                  : null,
              ),
            );
          })(),
          field("Base URL", {
            value: llm.base_url || "",
            onChange: function (e) {
              patchDraft(setDraft, ["deepseek", "base_url"], e.target.value);
            },
          }),
          field("模型", {
            value: llm.model || "",
            onChange: function (e) {
              patchDraft(setDraft, ["deepseek", "model"], e.target.value);
            },
          }),
        ),
        h(
          "div",
          { className: "wb-set-actions" },
          h(
            "button",
            {
              type: "button",
              className: "wb-set-btn",
              disabled: busy,
              onClick: function () {
                runTest("llm", "/api/config/test/deepseek", {
                  config: { deepseek: llmPrepareSave(draft.deepseek) },
                });
              },
            },
            "测试 LLM",
          ),
        ),
        tests.llm ? h("div", { className: "wb-set-test" }, tests.llm) : null,
      ),
    ),
    h(
      "div",
      { className: "wb-set-card" },
      h("h3", null, "视觉模型"),
      h(
        "div",
        { className: "body" },
        h("p", { className: "wb-set-hint", style: { marginBottom: "8px" } }, "快速填入视觉模型默认地址"),
        h(
          "div",
          { className: "wb-set-presets" },
          VISION_PRESETS.map(function (p) {
            return h(
              "button",
              {
                key: p.id,
                type: "button",
                className: "wb-set-preset" + (visionPresetId === p.id ? " active" : ""),
                onClick: function () {
                  applyVisionPreset(p);
                },
              },
              p.label,
            );
          }),
        ),
        h(
          "p",
          { className: "wb-set-hint" },
          "需支持多模态 / 识图的 OpenAI 兼容接口；未配置时贴图无法生成视觉规格。",
        ),
        h(
          "div",
          { className: "wb-set-grid" },
          labeledField(
            "API Key",
            {
              type: "password",
              autoComplete: "new-password",
              value: /^•+$/.test(String(vision.api_key || "")) ? "" : vision.api_key || "",
              placeholder: visionKeyConfigured
                ? "留空表示不修改；输入新值则覆盖"
                : "必填（智谱 / 通义等）",
              onChange: function (e) {
                patchDraft(setDraft, ["vision", "api_key"], e.target.value);
              },
            },
            true,
            visionKeyConfigured
              ? h(
                  "div",
                  { className: "wb-set-field-meta" },
                  /^•+$/.test(String(vision.api_key || ""))
                    ? "当前已配置（已脱敏）"
                    : "当前已配置：" +
                      String(vision.api_key || "")
                        .replace(/./g, "*")
                        .slice(0, 8) +
                      (String(vision.api_key || "").length > 4
                        ? String(vision.api_key || "").slice(-4)
                        : "****"),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "wb-set-clear",
                      onClick: function () {
                        patchDraft(setDraft, ["vision", "api_key"], "");
                        setMsg("已清除视觉 API Key，保存后生效");
                        setMsgOk(true);
                      },
                    },
                    "清除界面覆盖",
                  ),
                )
              : null,
          ),
          labeledField(
            "API Base URL",
            {
              value: vision.base_url || "",
              placeholder: "https://open.bigmodel.cn/api/paas/v4",
              onChange: function (e) {
                patchDraft(setDraft, ["vision", "base_url"], e.target.value);
              },
            },
            true,
            h("div", { className: "wb-set-field-meta" }, "例：https://open.bigmodel.cn/api/paas/v4/"),
          ),
          labeledField(
            "视觉模型名称",
            {
              value: vision.model || "",
              placeholder: "glm-4v-flash",
              onChange: function (e) {
                patchDraft(setDraft, ["vision", "model"], e.target.value);
              },
            },
            true,
            h(
              "div",
              { className: "wb-set-field-meta" },
              "例：glm-4v-flash、glm-4v、qwen-vl-plus",
            ),
          ),
        ),
      ),
    ),
  );

  var sectionAuto = h(
    "div",
    { className: "wb-set-auto-stack" },
    h(
      "div",
      { className: "wb-set-card" },
      h("h3", null, "自动化任务推送"),
      h(
        "div",
        { className: "body" },
        h(
          "p",
          { className: "wb-set-hint" },
          "企微群消息与飞书多维表格写数是两套独立能力，可只开其一。保存写入引擎 config.yaml → automations。",
        ),
        h(
          "div",
          { className: "wb-set-grid" },
          field(
            "群机器人 Webhook",
            {
              type: "password",
              autoComplete: "new-password",
              value: auto.wecom_webhook_key || "",
              placeholder: "完整 Webhook 地址，或 key= 后的值",
              onChange: function (e) {
                patchDraft(setDraft, ["automations", "wecom_webhook_key"], e.target.value);
              },
            },
            true,
          ),
        ),
        h(
          "div",
          { className: "wb-set-check", style: { marginBottom: "8px" } },
          h("input", {
            type: "checkbox",
            checked: !!auto.wecom_push_enabled,
            onChange: function (e) {
              patchDraft(setDraft, ["automations", "wecom_push_enabled"], e.target.checked);
            },
          }),
          h("span", null, "开启自动化结果推送"),
        ),
        h(
          "div",
          { className: "wb-set-check" },
          h("input", {
            type: "checkbox",
            checked: !!auto.wecom_push_dry_run,
            onChange: function (e) {
              patchDraft(setDraft, ["automations", "wecom_push_dry_run"], e.target.checked);
            },
          }),
          h("span", null, "推送联调模式（仅打日志）"),
        ),
        h(
          "p",
          { className: "wb-set-hint", style: { marginTop: "12px", marginBottom: 0 } },
          "开启后，任务勾选「推送到企业微信」且执行成功时会发到上述群；联调模式不真正调用企微接口。",
        ),
      ),
    ),
    h(
      "div",
      { className: "wb-set-card" },
      h("h3", null, "飞书多维表格同步"),
      h(
        "div",
        { className: "body" },
        h(
          "div",
          { className: "wb-set-grid" },
          field(
            "飞书应用 App ID",
            {
              value: auto.feishu_app_id || "",
              placeholder: "cli_xxxxxxxx",
              onChange: function (e) {
                patchDraft(setDraft, ["automations", "feishu_app_id"], e.target.value);
              },
            },
            true,
          ),
          field(
            "飞书应用 App Secret",
            {
              type: "password",
              autoComplete: "new-password",
              value: auto.feishu_app_secret || "",
              placeholder: "开放平台凭证页复制；勿提交 git",
              onChange: function (e) {
                patchDraft(setDraft, ["automations", "feishu_app_secret"], e.target.value);
              },
            },
            true,
          ),
        ),
        h(
          "div",
          { className: "wb-set-check", style: { marginBottom: "8px", marginTop: "4px" } },
          h("input", {
            type: "checkbox",
            checked: !!auto.feishu_bitable_enabled,
            onChange: function (e) {
              patchDraft(setDraft, ["automations", "feishu_bitable_enabled"], e.target.checked);
            },
          }),
          h("span", null, "开启飞书多维表格同步"),
        ),
        h(
          "div",
          { className: "wb-set-check" },
          h("input", {
            type: "checkbox",
            checked: !!auto.feishu_bitable_dry_run,
            onChange: function (e) {
              patchDraft(setDraft, ["automations", "feishu_bitable_dry_run"], e.target.checked);
            },
          }),
          h("span", null, "写表联调模式（仅打日志）"),
        ),
        h(
          "p",
          { className: "wb-set-hint", style: { marginTop: "12px", marginBottom: 0 } },
          "总开关与企微互不干涉。任务还需开启「同步到飞书多维表格」并填写 app_token / table_id。",
        ),
      ),
    ),
  );

  var sectionBranding = h(
    "div",
    { className: "wb-set-card" },
    h("h3", null, "应用配置"),
    h(
      "div",
      { className: "body" },
      h("p", { className: "wb-set-hint" }, "自定义应用 logo、名称和概览；启用后刷新页面生效，关闭则恢复内置默认值。"),
      h("div", { className: "wb-set-check", style: { marginBottom: "12px" } },
        h("input", {
          type: "checkbox",
          checked: !!branding.enabled,
          onChange: function (e) {
            setBranding(Object.assign({}, branding, { enabled: e.target.checked }));
          },
        }),
        h("span", null, "启用自定义配置"),
      ),
      h("div", { className: "wb-set-field", style: { marginBottom: "12px" } },
        h("label", null, "应用 Logo"),
        h("div", { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
          branding.logo_url
            ? h("img", { src: branding.logo_url, alt: "logo", style: { width: "48px", height: "48px", objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "2px" } })
            : h("span", { style: { width: "48px", height: "48px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#94a3b8", fontSize: "11px" } }, "未上传"),
          h("input", {
            ref: logoInputRef,
            type: "file",
            accept: "image/png,image/jpeg,image/svg+xml",
            style: { display: "none" },
            onChange: function (e) {
              if (e.target.files && e.target.files[0]) uploadLogo(e.target.files[0]);
            },
          }),
          h("button", {
            type: "button",
            className: "wb-set-btn",
            disabled: brandingBusy,
            onClick: function () { if (logoInputRef.current) logoInputRef.current.click(); },
          }, "上传 Logo"),
        ),
      ),
      h("div", { className: "wb-set-field full", style: { marginBottom: "12px" } },
        h("label", null, "应用名称"),
        h("input", {
          type: "text",
          value: branding.app_name || "",
          placeholder: "江西中软工作助手",
          onChange: function (e) { setBranding(Object.assign({}, branding, { app_name: e.target.value })); },
        }),
      ),
      h("div", { className: "wb-set-field full", style: { marginBottom: "12px" } },
        h("label", null, "应用概览"),
        h("input", {
          type: "text",
          value: branding.app_overview || "",
          placeholder: "江西中软，让制造更智能",
          onChange: function (e) { setBranding(Object.assign({}, branding, { app_overview: e.target.value })); },
        }),
      ),
      h("div", { className: "wb-set-actions" },
        h("button", {
          type: "button",
          className: "wb-set-btn primary",
          disabled: brandingBusy,
          onClick: function () { saveBranding(); },
        }, brandingBusy ? "处理中…" : branding.enabled ? "保存并启用" : "保存配置"),
        h("button", {
          type: "button",
          className: "wb-set-btn",
          disabled: brandingBusy,
          onClick: function () { loadBranding(); },
        }, "重新加载"),
      ),
      brandingMsg
        ? h("p", { className: "wb-set-msg" + (brandingOk ? " ok" : " err"), style: { marginTop: "8px" } }, brandingMsg)
        : null,
    ),
  );

  var pluginPanelProps = {
    apiRef: pluginApiRef,
    reportStatus: reportPluginStatus,
  };
  var activeSection =
    tab === "branding"
      ? sectionBranding
      : tab === "llm"
      ? sectionLlm
      : tab === "remote_review"
        ? h(WbRemoteReviewPanel, pluginPanelProps)
        : tab === "cursor_coding"
          ? h(WbCursorCodingPanel, pluginPanelProps)
          : tab === "automations"
            ? sectionAuto
            : sectionMes;

  return h(
    "div",
    { className: "wb-set", ref: rootRef },
    h(
      "p",
      { className: "wb-set-lead" },
      maskVendorUiText(
        "WorkBuddy 配置中心：MES / 商用模型 / 远端审码 / 公共模型 / 推送。底部统一保存当前页。公共模型只认本页。部署规则写在各目标工程 .workbuddy/。",
      ),
    ),
    h(
      "div",
      { className: "wb-set-shell" },
      h(
        "nav",
        { className: "wb-set-nav", "aria-label": "配置分类" },
        SET_NAV.map(function (item) {
          return h(
            "button",
            {
              key: item.id,
              type: "button",
              className: "wb-set-nav-btn" + (tab === item.id ? " active" : ""),
              onClick: function () {
                setTab(item.id);
                setMsg("");
              },
            },
            maskVendorUiText(item.label),
          );
        }),
      ),
      h(
        "div",
        { className: "wb-set-main" },
        activeSection,
      ),
    ),
    h(
      "div",
      { className: "wb-set-bar" },
      msg
        ? h("span", { className: "wb-set-msg" + (msgOk ? " ok" : " err") }, maskVendorUiText(msg))
        : null,
      h(
        "button",
        {
          type: "button",
          className: "wb-set-btn",
          disabled: busy,
          onClick: loadCurrent,
        },
        "重新加载",
      ),
      h(
        "button",
        {
          type: "button",
          className: "wb-set-btn primary",
          disabled: busy,
          onClick: saveCurrent,
        },
        busy ? "处理中…" : "保存配置",
      ),
    ),
  );
}

  ctx.field = field;
  ctx.hideHostSettingsDupes = hideHostSettingsDupes;
  ctx.WbRemoteReviewPanel = WbRemoteReviewPanel;
  ctx.WbCursorCodingPanel = WbCursorCodingPanel;
  ctx.WorkBuddyHeaderLogout = WorkBuddyHeaderLogout;
  ctx.WorkBuddySettingsSection = WorkBuddySettingsSection;
}
