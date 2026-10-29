/*RUNTIME_BEGIN*/
window.__APP_ENGINE__ = { host: "127.0.0.1", port: 8000 };
/*RUNTIME_END*/
window.__ModuleLoader__.load({
  id: "@dsh-external/dsh-mes-bridge",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client-src/entry.js
var entry_exports = {};
__export(entry_exports, {
  createBridgeModule: () => createBridgeModule
});
module.exports = __toCommonJS(entry_exports);

// client-src/deps-init.js
function createCtx(require2) {
  var React = require2("react");
  return {
    React,
    h: React.createElement,
    useState: React.useState,
    useMemo: React.useMemo,
    useEffect: React.useEffect,
    useLayoutEffect: React.useLayoutEffect || React.useEffect,
    useRef: React.useRef,
    _wbClientCtx: null,
    _loginGateUnmount: null
  };
}

// client-src/shared-preamble.js
function installPreamble(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  function installLoopbackProxy() {
    try {
      var loc = window.location || {};
      var host = String(loc.hostname || "");
      var isLocal = host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0" || host === "";
      if (isLocal) return;
      if (window.__WB_LOOPBACK_PROXY__) return;
      window.__WB_LOOPBACK_PROXY__ = true;
      var of = window.fetch;
      window.fetch = function(u, o) {
        try {
          if (typeof u === "string" && u.indexOf("http://127.0.0.1:") === 0) {
            var rest = u.slice("http://127.0.0.1:".length);
            var slash = rest.indexOf("/");
            var port = slash === -1 ? rest : rest.slice(0, slash);
            var path = slash === -1 ? "/" : rest.slice(slash);
            if (/^\d+$/.test(port)) u = "/proxy/" + port + path;
          }
        } catch (e) {
        }
        return of.call(window, u, o || {});
      };
    } catch (e) {
    }
  }
  installLoopbackProxy();
  function alignCursorChatServicePort() {
    var wantPort = "18791";
    var wantHost = "127.0.0.1";
    try {
      var cur = String(localStorage.getItem("dsh-cursor-chat-port") || "").trim();
      if (cur !== wantPort) {
        localStorage.setItem("dsh-cursor-chat-port", wantPort);
      }
      var host = String(localStorage.getItem("dsh-cursor-chat-host") || "").trim();
      if (!host || host === "localhost") {
        localStorage.setItem("dsh-cursor-chat-host", wantHost);
      }
    } catch (eAlign) {
    }
  }
  alignCursorChatServicePort();
  var _engineResolved = null;
  function sanitizeEngineHost(host) {
    var h2 = String(host || "").trim().toLowerCase();
    if (!h2 || h2 === "localhost" || h2 === "127.0.0.1" || h2 === "::1") {
      return h2 === "localhost" ? "localhost" : "127.0.0.1";
    }
    return "127.0.0.1";
  }
  function markEngineResolved(host, port) {
    var h2 = sanitizeEngineHost(host);
    var p = String(port == null ? "" : port).trim();
    if (!/^\d+$/.test(p) || Number(p) <= 0) return;
    try {
      var desk = desktopEngine();
      if (desk && desk.port && String(p) !== String(desk.port)) {
        h2 = desk.host;
        p = String(desk.port);
      }
    } catch (eDesk) {
    }
    _engineResolved = { host: h2, port: p };
    try {
      localStorage.setItem("dsh-mes-engine-host", h2);
      localStorage.setItem("dsh-mes-engine-port", p);
    } catch (e0) {
    }
    try {
      window.__APP_ENGINE__ = Object.assign({}, window.__APP_ENGINE__ || {}, { host: h2, port: Number(p) });
    } catch (e1) {
    }
  }
  function isDesktopShell() {
    try {
      return !!(typeof window !== "undefined" && window.workbuddyDesktop);
    } catch (eDs) {
      return false;
    }
  }
  function desktopEngine() {
    try {
      if (!isDesktopShell()) return null;
      var wd = window.workbuddyDesktop;
      var d = null;
      try {
        if (typeof wd.getEngine === "function") d = wd.getEngine();
        else d = wd.engine;
      } catch (eGe) {
        d = wd && wd.engine;
      }
      var p = d && d.port != null ? String(d.port).trim() : "";
      if (/^\d+$/.test(p) && Number(p) > 0) {
        return { host: sanitizeEngineHost(d.host), port: p };
      }
      var cfg = window.__APP_ENGINE__ || {};
      var cfgP = String(cfg.port == null ? "" : cfg.port).trim();
      if (/^\d+$/.test(cfgP) && Number(cfgP) > 0) {
        return { host: sanitizeEngineHost(cfg.host), port: cfgP };
      }
      try {
        var ls = String(localStorage.getItem("dsh-mes-engine-port") || "").trim();
        if (/^\d+$/.test(ls) && Number(ls) > 0 && ls !== "8000") {
          var lh = localStorage.getItem("dsh-mes-engine-host") || "127.0.0.1";
          return { host: sanitizeEngineHost(lh), port: ls };
        }
      } catch (eLs) {
      }
      return { host: "127.0.0.1", port: "18000" };
    } catch (e) {
      return isDesktopShell() ? { host: "127.0.0.1", port: "18000" } : null;
    }
  }
  function isPublicWebEntry() {
    try {
      var loc = window.location || {};
      var pageHost = String(loc.hostname || "");
      return !!(pageHost && !isLoopbackOrPrivateHost(pageHost));
    } catch (ePub) {
      return false;
    }
  }
  function isBrowserDevShell() {
    return !isDesktopShell() && !isPublicWebEntry();
  }
  function enginePortCandidates() {
    var out = [];
    function add(p) {
      p = String(p == null ? "" : p).trim();
      if (!/^\d+$/.test(p) || Number(p) <= 0) return;
      for (var i = 0; i < out.length; i++) if (out[i] === p) return;
      out.push(p);
    }
    if (isDesktopShell()) {
      var dDesk = desktopEngine();
      if (dDesk) add(dDesk.port);
      add(18e3);
      return out;
    }
    if (isBrowserDevShell()) {
      add(8e3);
      if (_engineResolved && String(_engineResolved.port) !== "18000") add(_engineResolved.port);
      try {
        var ls = localStorage.getItem("dsh-mes-engine-port");
        if (ls && ls !== "18000") add(ls);
      } catch (e2) {
      }
      var cfgB = window.__APP_ENGINE__ || {};
      if (String(cfgB.port || "") !== "18000") add(cfgB.port);
      add(18e3);
      return out;
    }
    if (_engineResolved) add(_engineResolved.port);
    try {
      add(localStorage.getItem("dsh-mes-engine-port"));
    } catch (e2b) {
    }
    var cfg = window.__APP_ENGINE__ || {};
    add(cfg.port);
    add(18e3);
    add(8e3);
    return out;
  }
  function isFetchNetworkError(err) {
    var msg = err && err.message ? String(err.message) : String(err || "");
    return /failed to fetch|networkerror|load failed/i.test(msg);
  }
  function shouldTryNextEnginePort(resp, path, portIndex, portsLen) {
    if (!resp || portIndex + 1 >= portsLen) return false;
    if (resp.status !== 404) return false;
    var p = String(path || "");
    return p.indexOf("/api/dev-pipeline") === 0 || p.indexOf("/api/vision") === 0 || p.indexOf("/api/workbuddy") === 0 || p === "/api/runtime" || p.indexOf("/api/auth/") === 0;
  }
  function publicEngineBase() {
    var cfg = window.__APP_ENGINE__ || {};
    if (cfg.webBase) return String(cfg.webBase).replace(/\/$/, "");
    return String(window.location && window.location.origin || "").replace(/\/$/, "") + "/workbuddy";
  }
  function fetchEngineApi(path, opts) {
    var o = opts || {};
    if (isPublicWebEntry()) {
      return fetch(publicEngineBase() + path, o);
    }
    var host = engineHost();
    var ports = enginePortCandidates();
    var desktopWaitMs = isDesktopShell() ? 12e4 : 0;
    var waitStarted = Date.now();
    var waitRound = 0;
    function sleep(ms) {
      return new Promise(function(resolve) {
        setTimeout(resolve, ms);
      });
    }
    function canWaitMore() {
      return desktopWaitMs > 0 && Date.now() - waitStarted < desktopWaitMs;
    }
    function waitThenRetry() {
      waitRound += 1;
      var delay = Math.min(800, 200 + waitRound * 40);
      return sleep(delay).then(function() {
        return attempt(0);
      });
    }
    function isEngineWarmingStatus(status) {
      return status === 502 || status === 503 || status === 504;
    }
    function attempt(i) {
      if (i >= ports.length) {
        if (canWaitMore()) return waitThenRetry();
        return Promise.reject(new Error("failed to fetch"));
      }
      var port = ports[i];
      var url = "http://" + host + ":" + port + path;
      return fetch(url, o).then(function(r) {
        if (shouldTryNextEnginePort(r, path, i, ports.length)) return attempt(i + 1);
        if (isEngineWarmingStatus(r.status)) {
          if (i + 1 < ports.length) return attempt(i + 1);
          if (canWaitMore()) return waitThenRetry();
        }
        markEngineResolved(host, port);
        return r;
      }).catch(function(err) {
        if (isFetchNetworkError(err)) {
          if (i + 1 < ports.length) return attempt(i + 1);
          if (canWaitMore()) return waitThenRetry();
        }
        throw err;
      });
    }
    return attempt(0);
  }
  function engineHost() {
    var d = desktopEngine();
    if (d) return d.host;
    try {
      var x = localStorage.getItem("dsh-mes-engine-host");
      if (x) return sanitizeEngineHost(x);
    } catch (e) {
    }
    var cfg = window.__APP_ENGINE__ || {};
    return sanitizeEngineHost(cfg.host || "127.0.0.1");
  }
  function enginePort() {
    var d = desktopEngine();
    if (d) return d.port;
    if (isBrowserDevShell()) {
      if (_engineResolved && String(_engineResolved.port) !== "18000") {
        return String(_engineResolved.port);
      }
      try {
        var pBad = localStorage.getItem("dsh-mes-engine-port");
        if (pBad === "18000") {
          localStorage.setItem("dsh-mes-engine-port", "8000");
          localStorage.setItem("dsh-mes-engine-host", "127.0.0.1");
        }
      } catch (eClr) {
      }
      var cfgDev = window.__APP_ENGINE__ || {};
      var cfgP = String(cfgDev.port || "").trim();
      if (/^\d+$/.test(cfgP) && cfgP !== "18000") return cfgP;
      return "8000";
    }
    if (_engineResolved && _engineResolved.port) return String(_engineResolved.port);
    var cfg = window.__APP_ENGINE__ || {};
    var cfgPort = String(cfg.port || "").trim();
    try {
      var p = localStorage.getItem("dsh-mes-engine-port");
      if (p && /^\d+$/.test(p)) return p;
    } catch (e) {
    }
    if (/^\d+$/.test(cfgPort) && Number(cfgPort) > 0) return cfgPort;
    return "8000";
  }
  function isLoopbackOrPrivateHost(host) {
    var h2 = String(host || "").toLowerCase();
    if (!h2 || h2 === "localhost" || h2 === "0.0.0.0") return true;
    if (h2 === "127.0.0.1" || h2 === "::1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h2)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h2)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h2)) return true;
    return false;
  }
  function engineBase() {
    var cfg = window.__APP_ENGINE__ || {};
    if (cfg.webBase) return String(cfg.webBase).replace(/\/$/, "");
    if (isPublicWebEntry()) {
      return publicEngineBase();
    }
    var desk = desktopEngine();
    if (desk) return "http://" + desk.host + ":" + desk.port;
    if (isBrowserDevShell()) {
      return "http://" + engineHost() + ":" + enginePort();
    }
    if (_engineResolved) return "http://" + _engineResolved.host + ":" + _engineResolved.port;
    var eh = engineHost();
    var ep = String(enginePort() || "");
    if (/^\d+$/.test(ep) && Number(ep) > 0) {
      return "http://" + eh + ":" + ep;
    }
    var loc = window.location || {};
    var pageHost = String(loc.hostname || "");
    if (isLoopbackOrPrivateHost(pageHost)) {
      return "http://" + eh + ":" + ep;
    }
    return String(loc.origin || "").replace(/\/$/, "");
  }
  function formatLoginError(err) {
    var msg = err && err.message ? String(err.message) : String(err || "");
    if (isFetchNetworkError(err)) {
      if (window.workbuddyDesktop) {
        return "\u65E0\u6CD5\u8FDE\u63A5\u5F15\u64CE\uFF08:18000 / :8000 \u5747\u65E0\u54CD\u5E94\uFF09\u3002\u8BF7\u5B8C\u5168\u9000\u51FA\u540E\u91CD\u65B0\u6253\u5F00\u300C\u6C5F\u897F\u4E2D\u8F6F\u300D\uFF0C\u6216\u786E\u8BA4\u6258\u76D8\u91CC\u5F15\u64CE\u5DF2\u542F\u52A8\u3002";
      }
      return "\u65E0\u6CD5\u8FDE\u63A5\u5F15\u64CE\uFF08:8000 / :18000 \u5747\u65E0\u54CD\u5E94\uFF09\u3002\u8BF7\u5148\u6267\u884C\uFF1Ascripts/engine.sh zr-workbuddy ensure";
    }
    return msg || "\u767B\u5F55\u5931\u8D25";
  }
  var AUTH_LS_KEY = "mes_auth_session";
  var AUTH_ENTERPRISES = [
    { key: "jsry", label: "\u6C5F\u82CF\u8F6F\u4E91", code: "" },
    { key: "jxzr", label: "\u6C5F\u897F\u4E2D\u8F6F", code: "" },
    { key: "qhzr", label: "\u524D\u6D77\u4E2D\u8F6F", code: "" }
  ];
  var AUTH_EVENT = "wb-auth-changed";
  function readAuthSession() {
    try {
      var raw = localStorage.getItem(AUTH_LS_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.access_token) return null;
      if (data.expires_at && Date.now() / 1e3 > Number(data.expires_at) - 30) {
        try {
          localStorage.removeItem(AUTH_LS_KEY);
        } catch (e0) {
        }
        return null;
      }
      return data;
    } catch (e1) {
      return null;
    }
  }
  function writeAuthSession(session) {
    try {
      if (session && session.access_token) localStorage.setItem(AUTH_LS_KEY, JSON.stringify(session));
      else localStorage.removeItem(AUTH_LS_KEY);
    } catch (e2) {
    }
    try {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT));
    } catch (e3) {
    }
  }
  function authHeaders(extra) {
    var headers = Object.assign({}, extra || {});
    var s = readAuthSession();
    if (s && s.access_token) headers.Authorization = "Bearer " + s.access_token;
    return headers;
  }
  function confirmAuthExpiredAndClear() {
    if (!readAuthSession()) return Promise.resolve(true);
    return fetchEngineApi("/api/auth/me", { headers: authHeaders() }).then(function(r) {
      return r.text().then(function(t) {
        var d = null;
        try {
          d = t ? JSON.parse(t) : null;
        } catch (eParse) {
          d = null;
        }
        return { status: r.status, d };
      });
    }).then(function(pack) {
      var d = pack.d || {};
      if (d && d.ok && d.authenticated && d.user) {
        return false;
      }
      if (pack.status >= 500 || pack.status === 0) return false;
      if (d && d.ok === true && d.authenticated === false) {
        writeAuthSession(null);
        return true;
      }
      if (pack.status === 401 && d && (d.code === "auth_required" || d.detail)) {
        writeAuthSession(null);
        return true;
      }
      return false;
    }).catch(function() {
      return false;
    });
  }
  function notifyAuthChanged() {
    try {
      window.dispatchEvent(new CustomEvent(AUTH_EVENT));
    } catch (e4) {
    }
  }
  function doAppLogout() {
    return fetchEngineApi("/api/auth/logout", {
      method: "POST",
      headers: authHeaders()
    }).catch(function() {
    }).then(function() {
      writeAuthSession(null);
    });
  }
  function workspaceDirFieldLabel() {
    if (typeof window !== "undefined" && window.workbuddyDesktop) return "\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55";
    if (isPublicWebEntry()) return "\u5DE5\u7A0B\u76EE\u5F55\uFF08\u670D\u52A1\u5668\uFF09";
    return "\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55";
  }
  function workspaceDirFieldHint() {
    if (typeof window !== "undefined" && window.workbuddyDesktop) return "";
    if (!isPublicWebEntry()) return "";
    return "\u516C\u7F51\u5165\u53E3\u7684\u5F15\u64CE\u8DD1\u5728\u670D\u52A1\u5668\u4E0A\uFF1A\u8DEF\u5F84\u5FC5\u987B\u662F\u670D\u52A1\u5668\u78C1\u76D8\u4E0A\u7684\u76EE\u5F55\u3002\u8981\u9009\u4F60\u7535\u8111\u91CC\u7684\u5DE5\u7A0B\uFF0C\u8BF7\u7528\u684C\u9762\u7248\u6216\u672C\u673A\u6253\u5F00 http://127.0.0.1:3081 \u3002";
  }
  var REMOTE_ENGINE_NO_LOCAL_PICK = "\u5F53\u524D\u662F\u516C\u7F51\u5165\u53E3\uFF0C\u5F15\u64CE\u5728\u670D\u52A1\u5668\u4E0A\u8FD0\u884C\uFF1A\u300C\u6D4F\u89C8\u300D\u4E0D\u80FD\u6253\u5F00\u4F60\u7535\u8111\u4E0A\u7684\u6587\u4EF6\u5939\uFF08\u53EA\u4F1A\u843D\u5230\u670D\u52A1\u5668\u78C1\u76D8\uFF09\u3002\u8BF7\u5728\u8F93\u5165\u6846\u586B\u5199\u670D\u52A1\u5668\u4E0A\u7684\u5DE5\u7A0B\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u8981\u9009\u672C\u673A\u5DE5\u7A0B\u8BF7\u7528 ZR WorkBuddy \u684C\u9762\u7248\uFF0C\u6216\u5728\u672C\u673A\u6253\u5F00 http://127.0.0.1:3081 \u3002";
  function pickLocalFolder(prompt, signal) {
    var p = prompt || "\u9009\u62E9\u5DE5\u7A0B\u76EE\u5F55";
    try {
      var desk = typeof window !== "undefined" ? window.workbuddyDesktop : null;
      if (desk && typeof desk.pickFolder === "function") {
        return Promise.resolve(desk.pickFolder(p)).then(function(d) {
          if (d && typeof d === "object") return d;
          return { ok: false, path: "", error: "\u9009\u6587\u4EF6\u5939\u5931\u8D25" };
        });
      }
    } catch (e0) {
    }
    if (isPublicWebEntry()) {
      return Promise.resolve({
        ok: false,
        path: "",
        code: "remote_engine_no_local_pick",
        error: REMOTE_ENGINE_NO_LOCAL_PICK
      });
    }
    return fetch(engineBase() + "/api/pick-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p }),
      signal
    }).then(function(r) {
      return r.json();
    });
  }
  function issueHitl(action, bind) {
    var body = Object.assign({ action }, bind || {});
    return fetch(engineBase() + "/api/hitl/issue", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-WorkBuddy-Hitl": "ui"
      },
      body: JSON.stringify(body)
    }).then(function(r) {
      return r.json().then(function(d) {
        if (!r.ok || !d || !d.ok || !d.nonce) {
          var msg = d && (d.detail || d.reply) || "HITL \u7B7E\u53D1\u5931\u8D25 HTTP " + r.status;
          var err = new Error(msg);
          err.hitl = d;
          throw err;
        }
        return d.nonce;
      });
    });
  }
  function discoverEngine() {
    fetchEngineApi("/api/runtime").then(function(r) {
      return r.json();
    }).then(function(d) {
      if (d && d.ok && d.port) markEngineResolved(d.host || engineHost(), d.port);
    }).catch(function() {
    });
  }
  ctx.engineHost = engineHost;
  ctx.enginePort = enginePort;
  ctx.engineBase = engineBase;
  ctx.formatLoginError = formatLoginError;
  ctx.AUTH_LS_KEY = AUTH_LS_KEY;
  ctx.AUTH_ENTERPRISES = AUTH_ENTERPRISES;
  ctx.AUTH_EVENT = AUTH_EVENT;
  ctx.readAuthSession = readAuthSession;
  ctx.writeAuthSession = writeAuthSession;
  ctx.authHeaders = authHeaders;
  ctx.confirmAuthExpiredAndClear = confirmAuthExpiredAndClear;
  ctx.notifyAuthChanged = notifyAuthChanged;
  ctx.doAppLogout = doAppLogout;
  ctx.pickLocalFolder = pickLocalFolder;
  ctx.isPublicWebEntry = isPublicWebEntry;
  ctx.workspaceDirFieldLabel = workspaceDirFieldLabel;
  ctx.workspaceDirFieldHint = workspaceDirFieldHint;
  ctx.issueHitl = issueHitl;
  ctx.discoverEngine = discoverEngine;
  ctx.fetchEngineApi = fetchEngineApi;
}

// client-src/styles.css
var styles_default = `.wb-main-view-overlay{position:absolute;top:0;right:0;bottom:var(--dsh-composer-height,0px);z-index:21;background:var(--dsw-alias-bg-layer-2,#fff);overflow:auto;display:flex;flex-direction:column;align-items:center;min-width:0;box-sizing:border-box}.wb-main-view-overlay .wb-space-view,.wb-main-view-overlay .wb-usage-view{flex:1 1 auto;width:100%;max-width:920px;margin-left:auto;margin-right:auto;height:100%}.wb-brand-wordmark{font-size:17px;font-weight:600;letter-spacing:.02em;line-height:24px;white-space:nowrap;color:inherit}.wb-brand-mark{--wb-mark-size:24px;display:inline-flex!important;align-items:center;justify-content:center;box-sizing:border-box;flex:none!important;width:var(--wb-mark-size)!important;height:var(--wb-mark-size)!important;min-width:var(--wb-mark-size)!important;max-width:var(--wb-mark-size)!important;border-radius:6px;background:transparent;border:none;padding:0;overflow:hidden}.wb-brand-mark img{width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain;display:block}[data-wb-brand-hide='1']{display:none!important}[class*='brandMark']:not([data-wb-brand-mark='1']):not(.wb-brand-mark),[class*='_brandMark']:not([data-wb-brand-mark='1']):not(.wb-brand-mark),[class*='railMark']:not([data-wb-brand-mark='1']):not(.wb-brand-mark),[class*='fishHitbox'],[class*='fallbackBrandName'],[class*='buildRevision'],[class*='brandName']>span:not([data-wb-brand='1']):not([data-wb-brand-mark='1']),[class*='_brandName']>span:not([data-wb-brand='1']):not([data-wb-brand-mark='1']),[class*='brandName'] svg:not([data-wb-brand-mark='1']),[class*='_brandName'] svg:not([data-wb-brand-mark='1']),[class*='brandMark'] svg:not([data-wb-brand-mark='1']),[class*='_brandMark'] svg:not([data-wb-brand-mark='1']),[class*='railMark'] svg:not([data-wb-brand-mark='1']),[data-slot='sidebar.brand.name'] svg:not([data-wb-brand-mark='1']),[data-slot='sidebar.brand.mark'] svg:not([data-wb-brand-mark='1']){display:none!important}.wb-footer-nav-item{display:block;width:100%;min-width:0;flex:none}.wb-space-note{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.5}.wb-space-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}.wb-space-toolbar .wb-cr-btn.active{border-color:#0f766e;color:#0f766e;background:#ecfdf5}.wb-space-status{font-size:12px;color:#64748b;margin:0 0 10px}.wb-space-table{width:100%;border-collapse:collapse;font-size:13px}.wb-space-table th,.wb-space-table td{border-bottom:1px solid #eef0f3;padding:8px 6px;text-align:left;vertical-align:top}.wb-space-table th{font-size:12px;color:#64748b;font-weight:600}.wb-space-table tr.wb-space-row-active{background:#ecfdf5}.wb-space-table tr.wb-space-row-active td{border-bottom-color:#a7f3d0}.wb-space-preview{font-size:12px;color:#64748b;margin-top:4px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-space-actions{display:flex;gap:6px;flex-wrap:wrap}.wb-space-detail{margin-top:14px;border:1px solid #e5e7eb;border-radius:12px;padding:12px 14px;background:#fafafa}.wb-space-detail.wb-space-detail-active{border-color:#6ee7b7;box-shadow:0 0 0 1px rgba(16,185,129,.18)}.wb-space-detail-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px;margin:0 0 8px}.wb-space-detail-head h3{margin:0;font-size:15px;flex:1;min-width:180px}.wb-space-pill{display:inline-block;font-size:11px;font-weight:600;color:#0f766e;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:2px 8px;margin:0 0 8px}.wb-space-detail pre{white-space:pre-wrap;word-break:break-word;font:12px/1.5 ui-monospace,Menlo,monospace;margin:0;max-height:360px;overflow:auto}.wb-space-empty{font-size:13px;color:#64748b;padding:18px 0}.wb-lib-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}.wb-lib-search{flex:1;min-width:180px;height:32px;border:1px solid #e5e7eb;border-radius:8px;padding:0 12px;font:13px inherit;color:#111827;background:#f8fafc}.wb-lib-meta{font-size:12px;color:#94a3b8;margin:0 0 8px}.wb-lib-page{display:flex;flex-direction:column;min-height:0;height:100%}.wb-lib-scroll{flex:1;min-height:0;overflow:auto}.wb-lib-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:min(52vh,420px);gap:20px;user-select:none}.wb-lib-orbit{position:relative;width:78px;height:78px}.wb-lib-orbit .ring{position:absolute;inset:0;border-radius:50%;border:2.5px solid transparent;border-top-color:#0f766e;border-right-color:rgba(15,118,110,.28);animation:wb-lib-spin .9s linear infinite}.wb-lib-orbit .ring.r2{inset:12px;border-top-color:#2dd4bf;border-right-color:transparent;animation-duration:.65s;animation-direction:reverse}.wb-lib-orbit .core{position:absolute;inset:24px;border-radius:50%;background:radial-gradient(circle at 32% 28%,#ecfdf5 0%,#5eead4 42%,#0f766e 100%);box-shadow:0 0 0 1px rgba(15,118,110,.12),0 0 28px rgba(45,212,191,.4);animation:wb-lib-pulse 1.35s ease-in-out infinite}.wb-lib-orbit .dot{position:absolute;width:7px;height:7px;border-radius:50%;background:#0f766e;top:50%;left:50%;margin:-3.5px 0 0 -3.5px;transform-origin:0 0;animation:wb-lib-dot 1.5s linear infinite;box-shadow:0 0 10px rgba(15,118,110,.55)}.wb-lib-orbit .dot.d2{animation-delay:-.5s;background:#14b8a6;width:5px;height:5px;margin:-2.5px 0 0 -2.5px}.wb-lib-orbit .dot.d3{animation-delay:-1s;background:#5eead4;width:4px;height:4px;margin:-2px 0 0 -2px}.wb-lib-loading .hint{margin:0;font-size:12px;color:#94a3b8;letter-spacing:.12em}@keyframes wb-lib-spin{to{transform:rotate(360deg)}}@keyframes wb-lib-pulse{0%,100%{transform:scale(.9);opacity:.75}50%{transform:scale(1.05);opacity:1}}@keyframes wb-lib-dot{0%{transform:rotate(0deg) translateX(34px) scale(1)}50%{transform:rotate(180deg) translateX(34px) scale(.7)}100%{transform:rotate(360deg) translateX(34px) scale(1)}}.wb-lib-table{width:100%;table-layout:fixed;border-collapse:collapse;font-size:13px;color:#334155}.wb-lib-table th{font-size:12px;font-weight:500;color:#94a3b8;text-align:left;padding:10px 8px;border-bottom:1px solid #eef0f3;white-space:nowrap}.wb-lib-table td{padding:10px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;overflow:hidden}.wb-lib-table td.col-act{overflow:visible}.wb-lib-table .col-type{width:52px}.wb-lib-table .col-who{width:72px}.wb-lib-table .col-time{width:148px}.wb-lib-table .col-size{width:64px}.wb-lib-table .col-act{width:44px;text-align:right}.wb-lib-table tr.file td.col-act{position:relative}.wb-lib-table tr.sess td{color:#0f172a;font-weight:600;background:transparent;padding:8px 8px 4px 0;border-bottom:none}.wb-lib-table tr.file{cursor:pointer}.wb-lib-table tr.file:hover td{background:#f8fafc}.wb-lib-name{display:flex;align-items:center;gap:8px;min-width:0;max-width:100%}.wb-lib-name .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-lib-name .t.sess-link{color:#2563eb;cursor:pointer;font-weight:600}.wb-lib-name .t.sess-link:hover{text-decoration:underline}.wb-lib-name .t.sess-muted{color:#64748b;cursor:default;font-weight:600}.wb-lib-name.wb-lib-file{padding-left:50px;font-weight:400}.wb-lib-ico{width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;flex:none;font-size:11px;font-weight:700}.wb-lib-ico.chat{background:#eef2ff;color:#4f46e5}.wb-lib-ico.code{background:#fef3c7;color:#b45309}.wb-lib-ico.md{background:#d1fae5;color:#047857}.wb-lib-ico.json{background:#dbeafe;color:#1d4ed8}.wb-lib-actions{display:flex;justify-content:flex-end;position:relative}.wb-lib-more{width:28px;height:28px;border:0;background:transparent;color:#64748b;cursor:pointer;border-radius:8px;font-size:18px;line-height:1;padding:0;letter-spacing:1px}.wb-lib-more:hover,.wb-lib-more.open{background:#f1f5f9;color:#0f172a}.wb-lib-menu{position:fixed;z-index:1200;min-width:112px;padding:4px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12)}.wb-lib-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:8px 10px;font:12px inherit;color:#334155;border-radius:6px;cursor:pointer}.wb-lib-menu button:hover{background:#f8fafc}.wb-lib-menu button.danger{color:#b91c1c}.wb-lib-menu button.danger:hover{background:#fef2f2}.wb-lib-fold{width:18px;height:22px;border:0;background:transparent;color:#64748b;cursor:pointer;border-radius:6px;flex:none;font-size:11px;line-height:1;padding:0;margin-right:2px}.wb-lib-fold:hover{background:#f1f5f9;color:#0f172a}.wb-lib-fold-spacer{width:18px;flex:none;margin-right:2px}.wb-lib-count{font-size:12px;font-weight:500;color:#94a3b8;flex:none;white-space:nowrap}.wb-lib-pager{flex:none;display:flex;flex-wrap:nowrap;align-items:center;justify-content:flex-end;gap:8px;margin:0;padding:10px 0 0;font-size:12px;color:#64748b;background:var(--dsw-alias-bg-layer-2,#fff)}.wb-lib-pager .wb-cr-btn{min-width:64px}.wb-lib-fs{z-index:8;position:absolute;inset:0;display:flex;flex-direction:column;background:#f3f4f6;border-radius:24px;box-shadow:inset 0 0 0 1px rgba(15,23,42,.06),0 12px 32px rgba(15,23,42,.10)}.wb-lib-fs-head{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 30px 12px;border-bottom:1px solid #e5e7eb;background:#f3f4f6;border-radius:24px 24px 0 0}.wb-lib-fs-head .t{font-size:16px;font-weight:600;color:#0f172a;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-lib-fs-head .sub{font-size:12px;color:#64748b;margin-top:2px}.wb-lib-fs-body{flex:1;min-height:0;overflow:auto;padding:16px 30px 28px;background:#f3f4f6;display:flex;flex-direction:column}.wb-lib-fs-body pre{white-space:pre-wrap;word-break:break-word;margin:0;font:13px/1.65 ui-monospace,Menlo,monospace;color:#0f172a;background:#fff;border:1px solid #e8eaed;border-radius:12px;padding:16px 18px;box-shadow:0 1px 3px rgba(15,23,42,.04)}.wb-lib-html{display:block;width:100%;flex:1;min-height:0;border:0;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(15,23,42,.04)}.wb-lib-md{font:14px/1.7 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;background:#fff;border:1px solid #e8eaed;border-radius:12px;padding:18px 20px;box-shadow:0 1px 3px rgba(15,23,42,.04)}.wb-lib-md h1{font-size:22px;margin:0 0 12px}.wb-lib-md h2{font-size:18px;margin:18px 0 8px}.wb-lib-md h3{font-size:15px;margin:14px 0 6px}.wb-lib-md p{margin:0 0 10px}.wb-lib-md ul,.wb-lib-md ol{margin:0 0 10px;padding-left:22px}.wb-lib-md blockquote{margin:0 0 10px;padding:6px 12px;border-left:3px solid #cbd5e1;color:#475569}.wb-lib-md table{border-collapse:collapse;margin:0 0 12px;width:100%;font-size:13px}.wb-lib-md th,.wb-lib-md td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left}.wb-lib-md th{background:#f8fafc}.wb-lib-md code{font:12px ui-monospace,Menlo,monospace;background:#f1f5f9;padding:1px 4px;border-radius:4px}.wb-lib-md pre{background:#f8fafc;border:1px solid #eef0f3;border-radius:8px;padding:10px 12px;overflow:auto}.wb-usage-page.wb-lib-has-preview{height:100%;min-height:0;position:static}.wb-cr{font:13px/1.5 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#111827;border:1px solid #e5e7eb;border-radius:12px;background:#fff;overflow:hidden;margin:4px 0 8px;width:100%;max-width:100%;box-sizing:border-box;min-width:0}.wb-cr-head{padding:10px 12px;border-bottom:1px solid #eef0f3;display:flex;align-items:center;gap:8px}.wb-cr-badge{font-size:11px;font-weight:700;color:#0f766e;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:2px 8px}.wb-cr-hint{font-size:11px;color:#64748b}.wb-cr-body{padding:12px;min-width:0;width:100%;box-sizing:border-box}.wb-cr-label{display:block;font-size:11px;font-weight:600;color:#374151;margin:0 0 6px}.wb-cr-row{display:flex;gap:8px;align-items:center;margin-bottom:10px}.wb-cr-input{flex:1;min-width:0;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font:12px/1.4 ui-monospace,Menlo,monospace}.wb-cr-btn{border:1px solid #d1d5db;background:#f9fafb;border-radius:8px;padding:7px 12px;font-size:12px;cursor:pointer;white-space:nowrap}.wb-cr-btn:hover{border-color:#0ea5e9;color:#0369a1}.wb-cr-btn:disabled{opacity:.5;cursor:not-allowed}.wb-cr-btn.primary{background:linear-gradient(135deg,#0f766e,#0ea5e9);border:none;color:#fff;font-weight:600}.wb-cr-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.wb-cr-chip{border:1px solid #e5e7eb;border-radius:999px;padding:4px 10px;font-size:11px;background:#f8fafc;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis}.wb-cr-chip:hover{border-color:#0ea5e9;color:#0369a1}.wb-cr-err{color:#b91c1c;font-size:12px;margin:8px 0 0;white-space:pre-wrap}.wb-cr-warn{color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:8px 10px;font-size:12px;margin:8px 0 0;white-space:pre-wrap}.wb-cr-dsh{font-size:11px;color:#64748b;margin:0 0 8px}.wb-cr-dsh code{font-size:11px;word-break:break-all}.wb-cr-files{max-height:220px;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;padding:8px;margin:8px 0;font-size:12px}.wb-cr-file{display:flex;gap:8px;align-items:flex-start;margin:4px 0;cursor:pointer}.wb-cr-file span{word-break:break-all;font-family:ui-monospace,Menlo,monospace}.wb-cr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.wb-set{display:flex;flex-direction:column;gap:0;height:calc(min(720px,100vh - 120px));max-height:calc(100vh - 140px);min-height:360px;width:100%;max-width:none;margin:0 -4px;padding:0 2px 4px;font:13px/1.5 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;box-sizing:border-box;overflow:hidden}.VOzbGW_panel,[class*='_panel'][class]:has([class*='_navTitle']),[class*='_panel'][class]:has([class*='_navCell']){width:920px!important;max-width:calc(100vw - 48px)!important}.wb-set-host-wide{width:920px!important;max-width:calc(100vw - 48px)!important}.VOzbGW_options:has(.wb-set),[class*='_options']:has(.wb-set){overflow:hidden!important;min-height:0}.wb-set-lead{font-size:12px;color:#64748b;margin:0 0 8px;line-height:1.45;padding:0 4px;flex:none}.wb-set-shell{display:flex;align-items:stretch;flex:1 1 auto;min-height:0;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;background:#f1f5f9;box-shadow:0 1px 3px rgba(15,23,42,.04)}.wb-set-nav{flex:none;width:132px;padding:10px 6px;background:#e8edf3;display:flex;flex-direction:column;gap:2px;border-right:1px solid #dde4ec;overflow-x:hidden;overflow-y:auto}.wb-set-nav-btn{display:block;width:100%;text-align:left;border:none;background:transparent;border-radius:8px;padding:9px 10px;font:600 12px/1.35 inherit;color:#64748b;cursor:pointer;transition:background .12s,color .12s,box-shadow .12s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wb-set-nav-btn:hover{background:rgba(255,255,255,.6);color:#0f172a}.wb-set-nav-btn.active{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.08)}.wb-set-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;background:#f8fafc;padding:12px 14px 10px;overflow-x:hidden;overflow-y:auto}.wb-set-eng{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin:0 0 12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;flex:none}.wb-set-eng .eng-field{display:flex;flex-direction:column;gap:5px}.wb-set-eng label{font-size:12px;font-weight:600;color:#334155}.wb-set-eng input{width:136px;border:1px solid #d0d9e6;border-radius:8px;padding:8px 10px;font:12px/1.4 ui-monospace,Menlo,monospace;background:#fff;color:#0f172a}.wb-set-eng input:focus{outline:none;border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.12)}.wb-set-card{border:1px solid #e2e8f0;border-radius:12px;background:#fff;margin:0;overflow:visible;box-shadow:0 1px 2px rgba(15,23,42,.03);flex:none;display:flex;flex-direction:column}.wb-set-card h3{margin:0;padding:14px 16px 4px;font-size:16px;font-weight:700;letter-spacing:-.01em;color:#0f172a}.wb-set-card .body{padding:2px 16px 14px;overflow:visible;flex:none}.wb-set-hint{font-size:12px;color:#64748b;margin:0 0 12px;line-height:1.55}.wb-set-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 16px}.wb-set-grid .full{grid-column:1/-1}.wb-set-field{display:flex;flex-direction:column;gap:6px;min-width:0}.wb-set-field label{display:block;font-size:12px;font-weight:600;color:#334155;margin:0}.wb-set-field input:not([type=radio]):not([type=checkbox]),.wb-set-field select,.wb-set-field textarea{width:100%;box-sizing:border-box;border:1px solid #d0d9e6;border-radius:8px;padding:9px 12px;font:13px/1.4 inherit;background:#fff;color:#0f172a;transition:border-color .12s,box-shadow .12s}.wb-set-field input:not([type=radio]):not([type=checkbox]):focus,.wb-set-field select:focus,.wb-set-field textarea:focus{outline:none;border-color:#60a5fa;box-shadow:0 0 0 3px rgba(37,99,235,.12)}.wb-set-field textarea{min-height:72px;resize:vertical;font-family:ui-monospace,Menlo,monospace;font-size:12px}.wb-set-field input::placeholder,.wb-set-field textarea::placeholder{color:#94a3b8}.wb-set-jobbody{margin-top:10px;max-height:220px;overflow:auto;border:1px solid #eef2f7;border-radius:8px;padding:10px 12px;background:#f8fafc;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:#334155}.wb-set-jobbody.empty{color:#94a3b8}[data-wb-host-hide='1']{display:none!important}.wb-set-check{display:flex;align-items:flex-start;gap:10px;margin:0;font-size:13px;color:#0f172a;padding:4px 0;line-height:1.45}.wb-set-check input[type=checkbox]{width:16px;height:16px;margin-top:2px;accent-color:#2563eb;cursor:pointer;flex:none}.wb-set-radios{display:flex;flex-wrap:wrap;gap:8px;margin:0;font-size:12px;align-items:center}.wb-set-radios label{display:inline-flex;align-items:center;gap:6px;width:auto;max-width:none;height:34px;box-sizing:border-box;padding:0 12px;border:1px solid #d0d9e6;border-radius:8px;background:#fff;cursor:pointer;color:#475569;font-weight:500;line-height:1.2;white-space:nowrap;flex:0 0 auto;transition:border-color .12s,background .12s,color .12s}.wb-set-radios label:has(input:checked),.wb-set-radios label.active{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8}.wb-set-radios input[type=radio]{width:14px!important;height:14px!important;min-width:14px;margin:0;padding:0;flex:none;accent-color:#2563eb;border:none;box-shadow:none}.wb-set-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;padding-top:4px}.wb-set-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;margin:6px 0 0;padding:8px 4px 0;border-top:1px solid #e2e8f0;flex:none;background:#fff;z-index:1}.wb-set-bar .wb-set-msg{margin-right:auto;max-width:min(480px,55%);text-align:left}.wb-set-auto-stack{display:flex;flex-direction:column;gap:12px;flex:none}.wb-set-presets{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 8px}.wb-set-preset{border:1px solid #d0d9e6;background:#fff;border-radius:999px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;color:#334155;transition:background .12s,border-color .12s,color .12s}.wb-set-preset:hover{border-color:#93c5fd;color:#1d4ed8}.wb-set-preset.active{background:#2563eb;border-color:#2563eb;color:#fff}.wb-set-badge{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;color:#6366f1;background:#eef2ff;vertical-align:middle;line-height:1.4}.wb-set-field-meta{font-size:12px;color:#94a3b8;margin:4px 0 0;line-height:1.45}.wb-set-clear{border:none;background:none;color:#dc2626;font-size:12px;cursor:pointer;padding:0;margin-left:8px;font-weight:600}.wb-set-clear:hover{text-decoration:underline}.wb-set-btn{border:1px solid #d0d9e6;background:#fff;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;color:#0f172a;transition:border-color .12s,background .12s,color .12s}.wb-set-btn:hover{border-color:#93c5fd;color:#1d4ed8;background:#f8fbff}.wb-set-btn:disabled{opacity:.5;cursor:not-allowed}.wb-set-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff}.wb-set-btn.primary:hover{background:#1d4ed8;border-color:#1d4ed8;color:#fff}.wb-set-msg{font-size:12px;color:#64748b}.wb-set-msg.ok{color:#047857}.wb-set-msg.err{color:#b91c1c}.wb-set-test{font-size:12px;margin:12px 0 0;white-space:pre-wrap;color:#475569;background:#f8fafc;border:1px solid #eef2f7;border-radius:8px;padding:10px 12px}@media (max-width:720px){.wb-set{height:auto;max-height:none;min-height:0;overflow:visible}.wb-set-shell{flex-direction:column;min-height:0;overflow:visible}.wb-set-nav{width:auto;flex-direction:row;flex-wrap:wrap;overflow:auto;border-right:none;border-bottom:1px solid #dde4ec}.wb-set-nav-btn{width:auto}.wb-set-main{overflow:visible}.wb-set-grid{grid-template-columns:1fr}}.wb-usage-nav-slot{width:100%;min-width:0;flex:1 0 100%}.wb-usage-nav{box-sizing:border-box;cursor:pointer;width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary,inherit);background:transparent;border:none;border-radius:12px;flex:none;align-items:center;gap:8px;margin:4px -2px;padding:0 10px 0 8px;font:inherit;font-size:14px;line-height:22px;display:flex;overflow:hidden}.wb-usage-nav:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06))}.wb-usage-nav.rail{border-radius:50%;justify-content:center;gap:0;width:36px;height:36px;margin:8px 0 10px;padding:0}.wb-usage-nav-label{white-space:nowrap;overflow:hidden}.wb-space-view{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;width:100%;max-width:920px;margin-left:auto;margin-right:auto;overflow:hidden;background:var(--dsw-alias-bg-layer-2,#fff);flex:1 1 auto}.wb-space-view-body{box-sizing:border-box;flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding:12px 20px 16px;position:relative;width:100%;max-width:920px}.wb-space-view-body .wb-lib-page{flex:1;min-height:0;height:auto!important;max-width:920px;width:100%;padding-top:0;box-sizing:border-box}.wb-space-view-body:has(.wb-lib-has-preview){padding:0;overflow:hidden}.wb-space-view .wb-lib-has-preview{flex:1;min-height:0;height:100%;position:relative;max-width:920px;width:100%}[data-conversation-scroll]:has(.wb-space-view) > [data-slot='conversation.session'],[class*='_viewArea']:has(.wb-space-view){display:flex!important;flex-direction:column;flex:1 1 0!important;min-height:0!important;height:100%;overflow:hidden!important;width:100%}[data-conversation-scroll]:has(.wb-usage-view) > [data-slot='conversation.session']{display:flex;flex-direction:column;justify-content:center;flex:1 1 auto;min-height:100%;width:100%;max-width:100%;box-sizing:border-box}[class*='_viewArea']:has(.wb-usage-view){display:flex!important;flex-direction:column;justify-content:center;align-items:stretch;flex:1 1 auto;height:auto!important;max-height:none!important;min-height:0;overflow:visible!important;width:100%}.wb-usage-view{box-sizing:border-box;display:flex;flex-direction:column;height:auto!important;max-height:none!important;min-height:0;width:100%;max-width:920px;margin-left:auto;margin-right:auto;flex:none;overflow:visible!important;background:var(--dsw-alias-bg-layer-2,#fff)}.wb-usage-view-head{box-sizing:border-box;flex:none;display:flex;align-items:center;justify-content:flex-start;gap:12px;padding:12px 20px 10px;border-bottom:1px solid #eef0f3}.wb-usage-view-head .t{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#111827)}.wb-usage-view-body{flex:none;min-height:0;height:auto;overflow:visible;padding:0 20px 40px}[data-conversation-scroll] .wb-usage-view{height:auto!important;max-height:none!important;min-height:0;overflow:visible!important}.wb-usage-view .wb-set,.wb-usage-view .wb-usage-page,.wb-usage-panel .wb-set,.wb-usage-panel .wb-usage-page{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;margin:0}.wb-usage-view-body .wb-usage-page{max-width:920px;padding-top:12px;padding-bottom:8px}.wb-usage-overlay{z-index:1000;justify-content:center;align-items:center;display:flex;position:fixed;inset:0}.wb-usage-mask{background:var(--dsw-alias-bg-mask-1,rgba(15,23,42,.45));backdrop-filter:var(--dsw-mask-blur,blur(8px));position:absolute;inset:0}.wb-usage-panel{z-index:1;background:var(--dsw-alias-bg-layer-2,#fff);width:920px;max-width:calc(100vw - 48px);height:min(800px,100vh - 48px);box-shadow:var(--dsw-shadow-lv3,0 16px 48px rgba(15,23,42,.18));border-radius:24px;display:flex;flex-direction:column;position:relative;overflow:hidden}.wb-usage-panel-head{box-sizing:border-box;flex:none;display:flex;justify-content:space-between;align-items:center;padding:20px 16px 8px 24px}.wb-usage-panel-head .t{font-size:16px;font-weight:500;color:var(--dsw-alias-label-primary,#111827)}.wb-usage-tabs{border-collapse:collapse;margin:0;padding:0;border:1px solid var(--ds-color-border-subtle,#e5e7eb);border-radius:10px;overflow:hidden;background:#fff}.wb-usage-tabs td{padding:0;margin:0;border:none;border-right:1px solid var(--ds-color-border-subtle,#e5e7eb)}.wb-usage-tabs td:last-child{border-right:none}.wb-usage-tabs button{cursor:pointer;border:none;background:transparent;padding:7px 14px;font:inherit;font-size:13px;font-weight:500;color:#64748b;line-height:1.2;min-width:88px}.wb-usage-tabs td.active{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06))}.wb-usage-tabs td.active button{color:var(--dsw-alias-label-primary,#111827);font-weight:600}.wb-usage-tabs button:hover{color:var(--dsw-alias-label-primary,#111827)}.wb-usage-panel-x{cursor:pointer;width:28px;height:28px;color:var(--dsw-alias-label-primary,#111827);background:transparent;border:none;border-radius:28px;font-size:18px;line-height:1;display:inline-flex;align-items:center;justify-content:center}.wb-usage-panel-x:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06))}.wb-usage-panel-body{flex:1;min-height:0;overflow:auto;padding:0 24px 24px;position:relative}.wb-usage-panel-body:has(.wb-lib-page){overflow:hidden;display:flex;flex-direction:column}.wb-usage-panel-body:has(.wb-lib-page) .wb-lib-page{flex:1;min-height:0}.wb-usage-panel-body:has(.wb-lib-has-preview){overflow:hidden;padding:0;position:static}.wb-usage-panel:has(.wb-lib-has-preview) .wb-usage-panel-head{visibility:hidden;pointer-events:none}.wb-usage-panel .wb-usage-page{max-width:none;padding-top:0}.wb-usage-panel .wb-usage-page-title{display:none}.wb-usage-panel .wb-set-bar{position:static;background:transparent}.wb-usage-page{max-width:920px;padding-top:12px;box-sizing:border-box;width:100%;font:13px/1.5 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a}.wb-usage-page-title{font-size:18px;font-weight:700;margin:0 0 8px;color:#0f172a}.wb-usage-filter{display:flex;align-items:center;gap:8px;margin:0 0 12px;min-height:36px}.wb-usage-filter label{font-size:12px;color:#64748b;font-weight:600}.wb-usage-filter input[type=date]{border:1px solid #d1d5db;border-radius:8px;padding:6px 10px;font:13px inherit;color:#111827;background:#fff}.wb-usage-auth{margin:0 0 12px;padding:0;border:none;background:transparent}.wb-app-login-gate{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(1200px 600px at 10% -10%,#d8f3e4 0%,transparent 55%),radial-gradient(900px 500px at 100% 0%,#eef7f1 0%,transparent 50%),#f6faf7}.wb-login-page{--brand:#1B5E3B;--brand-hover:#164A2F;--brand-ring:rgba(27,94,59,.22);--brand-border:#2E8B57;--ent-accent:#4a9eff;--ent-accent-text:#3b82f6;--ent-accent-soft:#eef5ff;padding:12px 4px 24px;background:radial-gradient(900px 420px at 10% -10%,#d8f3e4 0%,transparent 55%),radial-gradient(700px 360px at 100% 0%,#eef7f1 0%,transparent 50%),#f6faf7;border-radius:12px}.wb-login-card{width:100%;max-width:400px;margin:0 auto;padding:28px 24px 20px;background:#fff;border:1px solid #dce8e0;border-radius:16px;box-shadow:0 12px 40px rgba(27,94,59,.08)}.wb-login-brand{text-align:center;margin-bottom:20px}.wb-login-brand .brand-icon{display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;padding:0;margin-bottom:10px;border-radius:14px;background:transparent;border:none;box-sizing:border-box}.wb-login-brand .brand-icon img{width:100%;height:100%;object-fit:contain}.wb-login-brand .brand-icon img{width:100%;height:100%;object-fit:contain}.wb-login-brand h1{margin:0;font-size:20px;font-weight:700;color:#0f172a}.wb-login-brand p{margin:8px 0 0;font-size:13px;color:#64748b}.wb-login-form{display:flex;flex-direction:column;gap:12px}.wb-login-form .field{display:flex;flex-direction:column;gap:6px;font-size:13px;color:#475569;font-weight:500}.wb-login-form .field input{height:40px;padding:0 12px;border:1px solid #dbe1ea;border-radius:10px;font:14px inherit;color:#0f172a;background:#fff;outline:none}.wb-login-form .field input:focus{border-color:#2E8B57;background:#f4fbf6;box-shadow:0 0 0 3px rgba(27,94,59,.22)}.wb-login-form .ent-select{position:relative}.wb-login-form .ent-trigger{display:flex;align-items:center;justify-content:space-between;width:100%;height:40px;padding:0 12px;border:1px solid #dbe1ea;border-radius:10px;background:#fff;font:14px inherit;color:#334155;cursor:pointer}.wb-login-form .ent-select.open .ent-trigger{border-color:#4a9eff;box-shadow:0 0 0 3px rgba(74,158,255,.18)}.wb-login-form .ent-menu{display:none;position:absolute;z-index:20;left:0;right:0;top:calc(100% + 8px);margin:0;padding:6px 0;list-style:none;background:#fff;border:1px solid #e8eef5;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.1)}.wb-login-form .ent-select.open .ent-menu{display:block}.wb-login-form .ent-option{padding:10px 14px;font-size:14px;color:#64748b;cursor:pointer}.wb-login-form .ent-option.active{background:#eef5ff;color:#3b82f6}.wb-login-form .error{margin:0;padding:8px 10px;border-radius:8px;background:#fff1f2;color:#e11d48;font-size:13px}.wb-login-form .submit{margin-top:4px;height:42px;border:none;border-radius:10px;background:#1B5E3B;color:#fff;font:600 15px inherit;cursor:pointer}.wb-login-form .submit:disabled{opacity:.7;cursor:not-allowed}.wb-login-hint{margin:14px 0 0;text-align:center;font-size:11px;color:#94a3b8;line-height:1.5}.wb-header-logout{position:relative;display:inline-flex;align-items:center;margin:0 4px;font:12px/1.3 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif}.wb-header-logout .trigger{display:inline-flex;align-items:center;gap:8px;border:none;background:transparent;padding:4px 6px;border-radius:8px;cursor:pointer;color:inherit;font:inherit}.wb-header-logout .trigger:hover{background:rgba(15,23,42,.06)}.wb-header-logout .avatar{width:28px;height:28px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:#fff;font-size:13px;font-weight:700;background:linear-gradient(135deg,#7c5cfc,#4d6bfe);letter-spacing:0}.wb-header-logout .name{max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:var(--ds-color-text-primary,#0f172a);font-size:13px}.wb-header-logout .caret{width:10px;height:10px;flex:none;color:#94a3b8;transition:transform .15s}.wb-header-logout.open .caret{transform:rotate(180deg)}.wb-header-logout .menu{position:absolute;top:calc(100% + 10px);right:0;z-index:2147483002;min-width:168px;background:#fff;border:1px solid #e8eef5;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.12);padding:6px 0}.wb-header-logout .menu::before{content:'';position:absolute;top:-5px;right:18px;width:10px;height:10px;background:#fff;border-left:1px solid #e8eef5;border-top:1px solid #e8eef5;transform:rotate(45deg)}.wb-header-logout .menu-item,.wb-header-logout .menu-logout{position:relative;z-index:1;display:block;width:100%;border:none;background:transparent;text-align:left;padding:8px 14px;font:13px inherit;color:#0f172a;cursor:pointer}.wb-header-logout .menu-item:hover,.wb-header-logout .menu-logout:hover{background:#f8fafc}.wb-header-logout .menu-item:disabled,.wb-header-logout .menu-logout:disabled{opacity:.6;cursor:not-allowed}.wb-header-logout .menu-sep{height:1px;margin:6px 10px;background:#eef2f7;border:none}.wb-header-logout-mask{display:none!important;pointer-events:none!important;position:fixed;inset:0;z-index:0;background:transparent}.wb-account-dialog-overlay{position:fixed;inset:0;z-index:2147483010;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.28)}.wb-account-dialog{width:min(640px,100%);background:#fff;border-radius:14px;border:1px solid #e8eef5;box-shadow:0 16px 48px rgba(15,23,42,.18);overflow:hidden;font:13px/1.5 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a}.wb-account-dialog.feedback{width:min(720px,100%)}.wb-account-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 8px 20px}.wb-account-dialog-head .t{font-size:16px;font-weight:600}.wb-account-dialog-x{width:28px;height:28px;border:none;border-radius:28px;background:transparent;cursor:pointer;font-size:18px;line-height:1;color:#0f172a}.wb-account-dialog-x:hover{background:rgba(15,23,42,.06)}.wb-account-dialog-body{padding:8px 20px 20px;display:flex;flex-direction:column;gap:12px}.wb-account-dialog-body .hint{margin:0;color:#64748b;font-size:12px;line-height:1.55}.wb-account-dialog-body .ver{margin:0;font-size:13px;font-weight:600}.wb-account-dialog-body textarea{width:100%;min-height:220px;box-sizing:border-box;resize:vertical;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;font:14px/1.55 inherit;color:#0f172a}.wb-account-dialog-body textarea:focus{outline:none;border-color:#93c5fd;box-shadow:0 0 0 3px rgba(59,130,246,.15)}.wb-account-dialog-body .err{margin:0;color:#e11d48;font-size:12px}.wb-account-dialog-body .ok{margin:0;color:#15803d;font-size:12px}.wb-fb-success{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:260px;padding:24px 12px;text-align:center}.wb-fb-success .ico{width:48px;height:48px;border-radius:999px;background:#dcfce7;color:#15803d;display:inline-flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;line-height:1}.wb-fb-success .t{margin:0;font-size:18px;font-weight:700;color:#166534}.wb-fb-success .s{margin:0;font-size:13px;color:#64748b}.wb-account-dialog-body .msg-banner{margin:0;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:600;line-height:1.4}.wb-account-dialog-body .msg-banner.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0}.wb-account-dialog-body .msg-banner.err{background:#fff1f2;color:#be123c;border:1px solid #fecdd3}.wb-fb-images{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start}.wb-fb-thumb{position:relative;width:96px;height:96px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#f1f5f9;flex:none;cursor:zoom-in;padding:0}.wb-fb-thumb img{width:100%;height:100%;object-fit:contain;display:block;background:#f8fafc}.wb-fb-thumb .rm{position:absolute;top:4px;right:4px;z-index:2;width:22px;height:22px;border:none;border-radius:999px;background:rgba(15,23,42,.72);color:#fff;font-size:14px;line-height:1;cursor:pointer}.wb-fb-thumb .rm:hover{background:rgba(15,23,42,.9)}.wb-fb-add{width:96px;height:96px;border:1px dashed #cbd5e1;border-radius:10px;background:#fff;color:#64748b;font:12px inherit;cursor:pointer;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}.wb-fb-add:hover{border-color:#94a3b8;color:#0f172a;background:#f8fafc}.wb-fb-add:disabled{opacity:.55;cursor:not-allowed}.wb-fb-add input{display:none}.wb-fb-lightbox{position:fixed;inset:0;z-index:2147483020;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.72)}.wb-fb-lightbox-inner{position:relative;max-width:min(960px,96vw);max-height:90vh;display:flex;flex-direction:column;align-items:center;gap:10px}.wb-fb-lightbox-inner img{max-width:100%;max-height:calc(90vh - 40px);object-fit:contain;border-radius:10px;background:#0f172a;box-shadow:0 16px 48px rgba(0,0,0,.35)}.wb-fb-lightbox-cap{margin:0;color:#e2e8f0;font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-fb-lightbox-x{position:absolute;top:-8px;right:-8px;width:32px;height:32px;border:none;border-radius:999px;background:#fff;color:#0f172a;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2)}.wb-fb-lightbox-x:hover{background:#f8fafc}.wb-fb-broken{display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:8px;box-sizing:border-box;font-size:11px;color:#94a3b8;text-align:center;line-height:1.35}.wb-account-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.wb-account-dialog-actions .btn{height:36px;padding:0 14px;border-radius:9px;border:1px solid #e2e8f0;background:#fff;font:600 13px inherit;cursor:pointer;color:#0f172a}.wb-account-dialog-actions .btn.primary{background:#1B5E3B;border-color:#1B5E3B;color:#fff}.wb-account-dialog-actions .btn:disabled{opacity:.65;cursor:not-allowed}.wb-usage-kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 18px}.wb-usage-kpi{border:1px solid var(--ds-color-border-subtle,#e5e7eb);border-radius:14px;padding:12px 14px;background:#fff;min-width:0}.wb-usage-kpi .k{font-size:12px;font-weight:600;color:#64748b;margin:0 0 8px}.wb-usage-kpi .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:3px 0}.wb-usage-kpi .row .t{font-size:12px;color:#64748b}.wb-usage-kpi .row .n{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;color:#111827}.wb-usage-meter{margin:28px 0 22px}.wb-usage-page .wb-set-card{margin-bottom:4px}.wb-usage-meter-title{font-size:14px;font-weight:700;line-height:1.4;margin:0 0 2px}.wb-usage-meter-sub{font-size:12px;color:#64748b;margin:4px 0 10px}.wb-usage-meter-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.wb-usage-chart{border:1px solid var(--ds-color-border-subtle,#e5e7eb);border-radius:14px;padding:12px 12px 8px;background:#fff;min-width:0}.wb-usage-chart-head{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}.wb-usage-chart-head .t{font-size:12px;color:#64748b}.wb-usage-chart-head .n{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}.wb-usage-chart-scroll{overflow:hidden;width:100%}.wb-usage-chart-inner{height:150px;width:100%}.wb-usage-chart svg{display:block;width:100%;height:150px;overflow:visible}.wb-usage-chart-plot{position:relative;height:150px;cursor:crosshair}.wb-usage-guide{position:absolute;width:1px;background:currentColor;opacity:.35;pointer-events:none;transform:translateX(-50%)}.wb-usage-dot{position:absolute;width:9px;height:9px;border-radius:50%;background:#fff;border:2px solid currentColor;pointer-events:none;transform:translate(-50%,-50%);box-sizing:border-box}.wb-usage-tip{position:absolute;top:6px;transform:translateX(-50%);background:#1f2937;color:#fff;font-size:11px;line-height:1.35;border-radius:8px;padding:6px 8px;pointer-events:none;z-index:2;white-space:nowrap;box-shadow:0 6px 16px rgba(15,23,42,.18)}.wb-usage-colhi{position:absolute;background:rgba(15,23,42,.06);pointer-events:none;border-radius:2px}.wb-usage-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:6px 0 2px;font-size:11px;color:#64748b}.wb-usage-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}.wb-usage-hour-sub{font-size:12px;color:#64748b;margin:0 0 10px}.wb-usage-hour-plot{position:relative;height:200px;cursor:crosshair;background:#f5f6f8;border-radius:14px}.wb-usage-hour-plot svg{display:block;width:100%;height:200px}.wb-usage-hour-guide{position:absolute;width:0;border-left:1px dashed #c5cad3;pointer-events:none;transform:translateX(-50%)}.wb-usage-hour-tip{position:absolute;top:10px;transform:translateX(-50%);background:#fff;color:#111827;font-size:12px;line-height:1.3;border-radius:999px;padding:8px 14px;pointer-events:none;z-index:2;white-space:nowrap;box-shadow:0 8px 24px rgba(15,23,42,.12);display:flex;align-items:center;gap:14px}.wb-usage-hour-tip-dual{border-radius:12px;flex-wrap:wrap;max-width:min(420px,90%);gap:8px 12px;justify-content:center}.wb-usage-hour-tip .r{color:#64748b}.wb-usage-hour-tip .v{font-weight:700;font-variant-numeric:tabular-nums}.wb-usage-hour-tip .v.llm{color:#ea580c}.wb-usage-hour-tip .v.cur{color:#0f766e}.wb-usage-hour-tip .c{color:#94a3b8;font-size:11px}.wb-usage-filter select{border:1px solid #d1d5db;border-radius:8px;padding:6px 10px;font:13px inherit;color:#111827;background:#fff}.wb-usage-people{margin:0 0 22px}.wb-usage-people-title{font-size:14px;font-weight:700;line-height:1.4;margin:0 0 2px}.wb-usage-people-sub{font-size:12px;color:#64748b;margin:4px 0 12px}.wb-usage-hbar{border:1px solid var(--ds-color-border-subtle,#e5e7eb);border-radius:14px;padding:12px 14px;background:#fff}.wb-usage-hbar-person{margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid #f1f5f9}.wb-usage-hbar-person:last-child{margin-bottom:0;padding-bottom:0;border-bottom:none}.wb-usage-hbar-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 0 8px}.wb-usage-hbar-name{font-size:13px;font-weight:600;color:#334155;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-usage-hbar-total{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:#111827;white-space:nowrap}.wb-usage-hbar-row{display:grid;grid-template-columns:72px 1fr 72px;gap:8px;align-items:center;margin:0 0 6px}.wb-usage-hbar-row:last-child{margin-bottom:0}.wb-usage-hbar-lab{font-size:11px;color:#64748b;font-weight:600}.wb-usage-hbar-track{height:14px;border-radius:7px;background:#f1f5f9;overflow:hidden;min-width:0}.wb-usage-hbar-fill.llm{height:100%;border-radius:7px;background:linear-gradient(90deg,#93c5fd,#3b82f6);min-width:2px}.wb-usage-hbar-fill.cursor{height:100%;border-radius:7px;background:linear-gradient(90deg,#99f6e4,#14b8a6);min-width:2px}.wb-usage-hbar-val{font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:#111827;text-align:right}.wb-usage-hbar-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 10px;font-size:11px;color:#64748b}.wb-usage-hbar-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}@media (max-width:640px){.wb-set-grid{grid-template-columns:1fr}.wb-usage-meter-grid{grid-template-columns:1fr}.wb-usage-kpis{grid-template-columns:1fr}.wb-usage-hbar-row{grid-template-columns:56px 1fr 64px}}.wb-cr-progress{font-size:12px;color:#475569;white-space:pre-wrap;max-height:280px;overflow:auto;background:#f8fafc;border-radius:8px;padding:10px;margin-top:8px}.wb-cd-plan{border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;padding:10px;margin:8px 0}.wb-cd-plan-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 8px;font-size:12px}.wb-cd-plan-head .sum{color:#64748b}.wb-cd-plan-head .dur{margin-left:auto;font-variant-numeric:tabular-nums;color:#0f766e;font-weight:600}.wb-cd-ol{list-style:none;margin:0;padding:0}.wb-cd-li{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid #eef2f7;font-size:12px}.wb-cd-li:first-child{border-top:none}.wb-cd-ico{width:18px;height:18px;flex:none;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:11px;font-weight:700}.wb-cd-li.is-pending .wb-cd-ico{background:#e5e7eb;color:#6b7280}.wb-cd-li.is-running .wb-cd-ico{background:#dcfce7;color:#15803d}.wb-cd-li.is-done .wb-cd-ico{background:#d1fae5;color:#047857}.wb-cd-li.is-error .wb-cd-ico{background:#fee2e2;color:#b91c1c}.wb-cd-title{font-weight:600;color:#111827;display:block}.wb-cd-state{color:#64748b;font-size:11px}.wb-cd-pulse{display:inline-block;width:8px;height:8px;border-radius:999px;background:#06b6d4;animation:wbCdPulse 1s ease-in-out infinite}@keyframes wbCdPulse{0%,100%{opacity:.35;transform:scale(.85)}50%{opacity:1;transform:scale(1)}}.wb-cd-dot-live{display:inline-block;width:8px;height:8px;border-radius:999px;background:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.18)}.wb-cd-spin{display:inline-block;width:12px;height:12px;box-sizing:border-box;border:2px solid #bae6fd;border-top-color:#0284c7;border-radius:999px;animation:wbCdSpin .65s linear infinite;vertical-align:middle}@keyframes wbCdSpin{to{transform:rotate(360deg)}}.wb-cd-pipecard-h .hint .wb-cd-spin{display:block}.wb-cd-act ul{list-style:none;margin:0;padding:0}.wb-cd-act li{display:flex;align-items:flex-start;gap:8px}.wb-cd-act li::before{content:'';flex:none;width:8px;height:8px;margin-top:5px;border-radius:999px;background:#94a3b8}.wb-cd-act li.is-live::before{background:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.18)}.wb-cd-flow{width:100%;min-width:0;max-width:100%;overflow:visible;background:transparent;border:none;padding:0;margin:8px 0;box-sizing:border-box}.wb-cd-composer{width:100%;min-width:0;margin:4px 0 8px;padding:0}.wb-cd-composer-bar{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:12px;color:#64748b}.wb-cd-composer-bar .ws{margin-left:auto;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Menlo,monospace;font-size:11px}.wb-cd-toolchip{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px;padding:5px 10px;border:1px solid #e2e8f0;border-radius:999px;background:#f8fafc;font-size:12px;color:#475569;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-cd-codewrap{margin:12px 0 16px;border-radius:12px;overflow:hidden;background:#f4f4f4;border:1px solid #e5e5e5;box-shadow:none}.wb-cd-codebar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 14px;background:#f4f4f4;border-bottom:1px solid #e5e5e5;min-height:40px;box-sizing:border-box}.wb-cd-codelang{font:13px/1.4 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#666;text-transform:lowercase;letter-spacing:.01em;flex-shrink:0}.wb-cd-codeacts{display:flex;align-items:center;gap:2px;flex-shrink:0}.wb-cd-codebtn{display:inline-flex;align-items:center;gap:5px;margin:0;padding:5px 8px;border:none;border-radius:8px;background:transparent;color:#666;font:13px/1.4 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;cursor:pointer;white-space:nowrap}.wb-cd-codebtn:hover{background:#e8e8e8;color:#333}.wb-cd-codebtn svg{width:16px;height:16px;flex-shrink:0;display:block}.wb-cd-codebtn.is-copied{color:#0f766e}.wb-cd-codewrap-streaming .wb-cd-codelang::after{content:' \xB7 \u5199\u5165\u4E2D';margin-left:6px;color:#999;font-size:12px;text-transform:none}.wb-cd-md .wb-cd-codewrap pre.wb-cd-code,.wb-cd-doc .wb-cd-codewrap pre.wb-cd-code,.wb-cd-stream .wb-cd-codewrap pre.wb-cd-code{background:#fafafa!important;color:#1f2328!important;padding:14px 16px!important;margin:0!important;overflow:auto;font:13px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important;max-height:min(70vh,640px);white-space:pre!important;word-break:normal!important;overflow-wrap:normal!important;tab-size:4;-webkit-overflow-scrolling:touch;border-radius:0}.wb-cd-md .wb-cd-codewrap pre.wb-cd-code code,.wb-cd-doc .wb-cd-codewrap pre.wb-cd-code code,.wb-cd-stream .wb-cd-codewrap pre.wb-cd-code code{background:none!important;color:#1f2328!important;padding:0!important;margin:0!important;font:inherit!important;white-space:pre!important;display:block;user-select:text}.wb-cd-codewrap pre.wb-cd-code .wb-hl-op{color:#1f2328!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-kw{color:#9538b3!important;font-weight:500!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-fn{color:#0550ae!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-builtin{color:#116329!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-str{color:#0a3069!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-doc{color:#116329!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-cmt{color:#6e7781!important;font-style:italic!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-num{color:#0550ae!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-name{color:#116329!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-attr{color:#0550ae!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-punct{color:#59636e!important}.wb-cd-codewrap pre.wb-cd-code .wb-hl-tag{color:#59636e!important}.wb-cd-md{font:15px/1.85 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;white-space:normal;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:visible;background:transparent;border:none;padding:0;margin:4px 0 0;overflow-wrap:break-word;word-break:normal}.wb-cd-proc{list-style:none;margin:6px 0 12px;padding:0!important;position:relative;border-left:none}.wb-cd-proc-li{display:flex;gap:12px;align-items:flex-start;margin:0;padding:0 0 16px;position:relative;border-top:none}.wb-cd-proc-li:last-child{padding-bottom:0}.wb-cd-proc-rail{flex:none;width:22px;position:relative;display:flex;justify-content:center;align-items:flex-start;padding-top:3px;align-self:stretch}.wb-cd-proc-li:not(:last-child) .wb-cd-proc-rail::before{content:'';position:absolute;left:50%;top:14px;bottom:-16px;width:1px;transform:translateX(-50%);background:#e5e7eb;pointer-events:none;z-index:0}.wb-cd-proc-node{flex:none;width:22px;height:22px;border-radius:999px;background:#fff;border:1px solid #e5e7eb;display:inline-flex;align-items:center;justify-content:center;position:relative;z-index:1;box-sizing:border-box;color:#64748b}.wb-cd-proc-node.is-dot{border-color:transparent;background:transparent}.wb-cd-proc-node.is-live{border-color:#86efac;color:#15803d;box-shadow:0 0 0 2px rgba(22,163,74,.14)}.wb-cd-proc-node.is-dot.is-live{border-color:transparent;box-shadow:none;color:#64748b}.wb-cd-proc-node.is-dot::after{content:'';width:8px;height:8px;border-radius:999px;background:#94a3b8;box-shadow:0 0 0 3px #fff}.wb-cd-proc-node.is-dot.is-live::after{background:#16a34a;box-shadow:0 0 0 3px #fff,0 0 0 5px rgba(22,163,74,.16)}.wb-cd-proc-node svg{width:12px;height:12px;display:block}.wb-cd-proc-body{flex:1;min-width:0;padding-top:1px}.wb-cd-proc-t{margin:0;font-size:14px;line-height:1.75;color:#0f172a;overflow-wrap:break-word}.wb-cd-proc-t + .wb-cd-proc-t,.wb-cd-proc-t + .wb-cd-proc-path,.wb-cd-proc-path + .wb-cd-proc-path{margin-top:6px}.wb-cd-proc-path{margin:0;font:12px/1.55 ui-monospace,Menlo,Consolas,monospace;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:4px 8px;overflow-wrap:anywhere}.wb-cd-proc-meta{margin:0 0 4px;font-size:12px;font-weight:650;color:#64748b;letter-spacing:.02em}.wb-cd-proc-links{list-style:none;margin:6px 0 0;padding:0}.wb-cd-proc-links li{margin:0 0 4px;font-size:13px;line-height:1.55;color:#334155}.wb-cd-proc-links li:last-child{margin-bottom:0}.wb-cd-md h3,.wb-cd-md h4{margin:18px 0 8px;font-size:15px;font-weight:650;color:#111827}.wb-cd-md p{margin:0 0 12px;max-width:100%;overflow-wrap:break-word}.wb-cd-md table{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:13px;table-layout:auto;display:block;overflow-x:auto}.wb-cd-md th,.wb-cd-md td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:break-word}.wb-cd-md th{background:#f8fafc}.wb-cd-md code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f1f5f9;padding:1px 4px;border-radius:4px;white-space:pre-wrap;overflow-wrap:break-word}.wb-cd-md .wb-cd-codewrap code,.wb-cd-stream .wb-cd-codewrap code{background:none!important;padding:0!important;border-radius:0!important;white-space:pre!important}.wb-cd-md ul,.wb-cd-md ol{margin:0 0 16px;padding-left:1.35em}.wb-cd-md li{margin:0 0 8px;line-height:1.75}.wb-cd-md pre.wb-cd-code{background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:0;overflow:auto;font:12.5px/1.55 ui-monospace,Menlo,monospace;margin:0;max-height:min(70vh,640px);white-space:pre}.wb-cd-md pre.wb-cd-code code{background:none;color:inherit;padding:0;white-space:pre;overflow-wrap:normal}.wb-cd-codewrap + .wb-cd-codewrap{margin-top:8px}.wb-cd-kicker{margin:20px 0 8px;font-size:11px;font-weight:700;letter-spacing:.08em;color:#0f766e}.wb-cd-doc{margin-top:8px;padding-top:4px}.wb-cd-doc h3{margin:20px 0 8px;font-size:14px;font-weight:700}.wb-cd-doc h3:first-child{margin-top:4px;font-size:16px}.wb-cd-doc p{margin:0 0 14px;line-height:1.85}.wb-cd-doc ul,.wb-cd-doc ol{margin:0 0 16px;padding-left:1.4em}.wb-cd-doc li{margin:0 0 8px;line-height:1.75}.wb-cd-stream{font:13px/1.65 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;white-space:normal;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:visible;background:transparent;border:none;padding:0;margin-top:8px;overflow-wrap:break-word}.wb-cd-stream h3,.wb-cd-stream h4{margin:12px 0 6px;font-size:14px;color:#111827}.wb-cd-stream p{margin:0 0 10px;max-width:100%;overflow-wrap:break-word}.wb-cd-stream table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12px;table-layout:auto}.wb-cd-stream th,.wb-cd-stream td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:break-word}.wb-cd-stream th{background:#f8fafc}.wb-cd-stream code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#f1f5f9;padding:1px 4px;border-radius:4px;white-space:pre-wrap;overflow-wrap:break-word}.wb-cd-stream ul,.wb-cd-stream ol{margin:0 0 8px;padding-left:1.2em}.wb-cd-stream pre.wb-cd-code{background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:8px;overflow:auto;font:12px/1.5 ui-monospace,Menlo,monospace;margin:8px 0 12px;white-space:pre}.wb-cd-stream pre.wb-cd-code code{background:none;color:inherit;padding:0;white-space:pre;overflow-wrap:normal}.wb-cd-action{margin:8px 0 0;font-size:12px;color:#334155;overflow-wrap:anywhere}.wb-cd-tools{margin-top:6px;font-size:12px;color:#64748b}.wb-cd-tools summary{cursor:pointer}.wb-cd-think{margin:0 0 10px;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;overflow:hidden;width:100%;box-sizing:border-box}.wb-cd-think summary{cursor:pointer;list-style:none;padding:8px 12px;font-size:12px;color:#64748b;user-select:none}.wb-cd-think summary::-webkit-details-marker{display:none}.wb-cd-think.is-live{display:flex;align-items:center;gap:8px;border:none;background:transparent;border-radius:0;margin:0 0 12px;overflow:visible}.wb-cd-think-lab{flex:none;font-size:13px;font-weight:650;color:#64748b;line-height:20px;letter-spacing:.02em}.wb-cd-think-rail{flex:none;width:2px;height:16px;border-radius:1px;background:#94a3b8}.wb-cd-think-ticker{flex:1;min-width:0;height:20px;overflow:hidden;position:relative}.wb-cd-think-line.is-solo{height:20px;line-height:20px;padding:0;font-size:13px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .35s ease}.wb-cd-think-line.is-solo.is-fade{opacity:.35}.wb-cd-think .wb-cd-think-body{padding:10px 12px 12px;font-size:13px;color:#334155;white-space:pre-wrap;overflow-wrap:anywhere;word-break:normal;line-height:1.7;border-top:1px dashed #e5e7eb;max-height:min(40vh,320px);overflow:auto}.wb-cd-alive{font-size:12px;color:#0f766e;margin:0 0 8px}.wb-cd-act{margin:0 0 12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;max-height:min(36vh,280px);overflow:auto}.wb-cd-act-h{font-size:11px;font-weight:650;color:#64748b;margin:0 0 8px;letter-spacing:.04em}.wb-cd-act li{display:flex;align-items:flex-start;gap:8px;margin:0 0 6px;font-size:12px;line-height:1.55;color:#334155;font-family:ui-monospace,Menlo,monospace;word-break:break-all}.wb-cd-act li.is-live{color:#0369a1;font-weight:600}.wb-cd-act li.is-live::before{background:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.18)}.wb-cd-stack{display:flex;flex-direction:column;gap:8px;width:100%;min-width:0}.wb-cd-intro{margin:0 0 4px;padding:10px 12px;border:1px solid #bae6fd;border-radius:10px;background:#f0f9ff;font-size:13px;line-height:1.65;color:#0c4a6e}.wb-cd-guide{margin:0;padding:10px 14px 10px 1.7em;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-size:13px;line-height:1.75;color:#334155}.wb-cd-guide li{margin:0 0 8px}.wb-cd-guide li:last-child{margin:0}.wb-cd-guide li.is-on{font-weight:650;color:#0f766e}.wb-cd-guide li.is-done{color:#64748b}.wb-cd-checks{display:flex;flex-wrap:wrap;gap:8px 12px;margin:0 0 12px;padding:0;list-style:none}.wb-cd-checks li{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8}.wb-cd-checks li.is-on{color:#0f766e;font-weight:650}.wb-cd-checks li.is-done{color:#047857}.wb-cd-checks .mark{width:18px;height:18px;flex:none;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:#e5e7eb;color:#6b7280}.wb-cd-checks li.is-on .mark{background:#cffafe;color:#0e7490}.wb-cd-checks li.is-done .mark{background:#d1fae5;color:#047857}.wb-cd-pipe{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 14px;width:100%;min-width:0}.wb-cd-pipecard{border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;overflow:hidden;min-width:0}.wb-cd-pipecard.is-running{border-color:#7dd3fc;background:#fff}.wb-cd-pipecard.is-done{background:#f8fafc}.wb-cd-pipecard.is-error{border-color:#fecaca;background:#fef2f2}.wb-cd-pipecard-h{display:flex;align-items:center;gap:6px;padding:10px 10px;font-size:12px;font-weight:600;color:#111827;min-width:0}.wb-cd-pipecard-h .ttl{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-cd-pipecard-h .hint{margin-left:auto;font-weight:500;font-size:10px;color:#64748b;flex:none}.wb-cd-pipecard.is-done .hint{color:#047857}.wb-cd-pipecard.is-running .hint{color:#0369a1;display:inline-flex;align-items:center}.wb-cd-pipecard .wb-cd-ico{background:#e5e7eb;color:#6b7280}.wb-cd-pipecard.is-done .wb-cd-ico{background:#d1fae5;color:#047857}.wb-cd-pipecard.is-running .wb-cd-ico{background:#dcfce7;color:#15803d}.wb-cd-stepcard{border:1px solid #e5e7eb;border-radius:12px;background:#f8fafc;overflow:hidden}.wb-cd-stepcard-h{display:flex;align-items:center;gap:8px;padding:8px 12px;font-size:12px;font-weight:600;color:#111827}.wb-cd-stepcard-h .hint{margin-left:auto;font-weight:500;color:#64748b;font-size:11px}.wb-cd-stepcard-b{margin:0;padding:0 12px 10px;font:12px/1.5 inherit;color:#475569;white-space:pre-wrap;max-height:88px;overflow:auto}.wb-cd-job{border-color:#c7d2fe}.wb-cd-stepcard .wb-cd-ico{background:#d1fae5;color:#047857}.wb-cr-sum{font-size:12px;color:#4b5563;margin:0 0 8px}.wb-cr-kv{display:grid;grid-template-columns:4.5em 1fr;gap:4px 10px;margin:0 0 10px;font-size:12px}.wb-cr-kv dt{margin:0;color:#94a3b8;font-weight:600}.wb-cr-kv dd{margin:0;color:#334155;word-break:break-all}.wb-cr-kv a{color:#0f766e;text-decoration:none}.wb-cr-kv a:hover{text-decoration:underline}.wb-cr-units{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;max-height:140px;overflow:auto}.wb-cr-unit{display:inline-flex;align-items:center;gap:4px;border:1px solid #e2e8f0;background:#f8fafc;border-radius:999px;padding:3px 9px;font-size:11px;color:#334155}.wb-cr-unit .k{color:#94a3b8;font-size:10px}.wb-cr-note{font-size:11px;color:#64748b;margin:0 0 8px;line-height:1.45}.wb-cr-done-banner{display:flex;align-items:flex-start;gap:10px;border-radius:10px;padding:10px 12px;margin:0 0 12px;font-size:13px;line-height:1.45}.wb-cr-done-banner.ok{color:#065f46;background:#ecfdf5;border:1px solid #a7f3d0}.wb-cr-done-banner.warn{color:#92400e;background:#fffbeb;border:1px solid #fcd34d}.wb-cr-done-icon{font-size:16px;line-height:1;font-weight:700;flex-shrink:0}.wb-cr-msg{border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font-size:12px;color:#334155;background:#f8fafc;white-space:pre-wrap;margin:0 0 10px}.wb-upd-info{margin:2px 0 8px}.wb-upd-row{margin:3px 0;font-size:13px;line-height:1.6;word-break:break-all;color:#1f2937}.wb-upd-row .k{color:#64748b}.wb-upd-toast{position:fixed;left:24px;bottom:24px;z-index:2147483010;width:300px;box-sizing:border-box;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 28px rgba(15,23,42,.14),0 2px 6px rgba(15,23,42,.08);padding:16px 16px 14px}.wb-upd-toast-title{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#111827;line-height:1.4}.wb-upd-toast-dot{width:8px;height:8px;border-radius:50%;flex:none;background:linear-gradient(135deg,#3b82f6,#8b5cf6)}.wb-upd-toast-msg{margin-top:8px;font-size:12px;color:#6b7280;line-height:1.6}.wb-upd-toast-actions{margin-top:14px;display:flex;justify-content:flex-end;gap:8px}.wb-upd-toast-btn{padding:5px 16px;border-radius:6px;font-size:12px;line-height:1.5;cursor:pointer;border:1px solid #d1d5db;background:#fff;color:#374151}.wb-upd-toast-btn:hover{background:#f9fafb}.wb-upd-toast-btn.primary{background:#3b82f6;border-color:#3b82f6;color:#fff}.wb-upd-toast-btn.primary:hover{background:#2563eb}.wb-upd-toast-close{position:absolute;top:8px;right:10px;width:22px;height:22px;border:none;background:transparent;color:#9ca3af;font-size:16px;line-height:1;cursor:pointer;border-radius:4px;padding:0;display:flex;align-items:center;justify-content:center}.wb-upd-toast-close:hover{color:#4b5563;background:#f3f4f6}.wb-dp{font:13px/1.5 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#0f172a;border:1px solid #e5e7eb;border-radius:12px;background:#fff;margin:4px 0 8px;overflow:hidden}.wb-dp-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #eef0f3;background:#f8fafc}.wb-dp-badge{font-size:11px;font-weight:700;color:#0f766e;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:2px 8px}.wb-dp-meta{margin-left:auto;font-size:11px;color:#64748b;font-family:ui-monospace,Menlo,monospace;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wb-dp-summary{padding:8px 12px;font-size:12px;color:#475569;border-bottom:1px solid #f1f5f9}.wb-dp-sum-line{margin:2px 0}.wb-dp-steps{padding:8px 10px 10px}.wb-dp-step{border:1px solid #e5e7eb;border-radius:10px;margin:0 0 6px;background:#fafafa}.wb-dp-step.is-current{border-color:#7dd3fc;background:#fff}.wb-dp-step-sum{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer;list-style:none;font-size:12px;font-weight:600}.wb-dp-step-sum::-webkit-details-marker{display:none}.wb-dp-step-id{width:1.6em;color:#64748b;font-variant-numeric:tabular-nums}.wb-dp-step-title{flex:1;min-width:0}.wb-dp-step-st{font-size:11px;font-weight:700;color:#64748b;flex:none}.wb-dp-step-st.pass{color:#047857}.wb-dp-step-st.waiting_hitl{color:#b45309}.wb-dp-step-st.fail,.wb-dp-step-st.failed{color:#b91c1c}.wb-dp-step-body{padding:0 10px 10px 2.4em;font-size:12px;color:#334155}.wb-dp-receipt{margin:0 0 6px;line-height:1.55}.wb-dp-log{margin:0;padding-left:1.1em;color:#64748b;font:11px/1.45 ui-monospace,Menlo,monospace}.wb-dp-foot{margin:0;padding:8px 12px 10px;font-size:11px;color:#94a3b8;border-top:1px solid #f1f5f9}[class*='_footArea']{display:flex!important;flex-direction:column!important}[class*='_footArea']>[class*='_settingsArea']{order:1;height:0!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important;border:0!important}[class*='_settingsArea'] button[aria-haspopup='dialog']{position:fixed!important;left:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}[class*='_settingsArea'] [class*='_overlay']{position:fixed!important;inset:0!important;z-index:2147483200!important}[class*='_footArea']>[class*='_footerActions']{order:2;flex-wrap:wrap!important;align-items:stretch!important;width:100%!important}.wb-sidebar-account{position:relative;display:flex;flex:1 0 100%;width:100%;margin:4px 0 2px;box-sizing:border-box}.wb-sidebar-account .trigger{width:100%;justify-content:flex-start;gap:12px;padding:6px 4px;border-radius:10px}.wb-sidebar-account .avatar{width:36px;height:36px;font-size:15px}.wb-sidebar-account .name{flex:1;min-width:0;max-width:none;font-size:15px;font-weight:600;text-align:left}.wb-sidebar-account .caret{display:none}.wb-sidebar-account .menu{top:auto;bottom:calc(100% + 8px);left:0;right:auto}.wb-sidebar-account .menu::before{top:auto;bottom:-6px;left:16px;right:auto;border-left:none;border-top:none;border-right:1px solid #e8eef5;border-bottom:1px solid #e8eef5;transform:rotate(45deg)}.wb-sidebar-account.rail{flex:0 0 auto;width:auto;margin:4px 0}.wb-sidebar-account.rail .name{display:none}.wb-sidebar-account.rail .trigger{width:auto;justify-content:center;padding:4px}.wb-header-logout .menu.wb-account-menu{min-width:248px;padding:0;background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 12px 40px rgba(15,23,42,.14);overflow:hidden}.wb-header-logout .menu.wb-account-menu::before{display:none}.wb-account-menu-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 16px 12px;background:#fff}.wb-account-menu-id{font-size:20px;font-weight:600;color:#111827;letter-spacing:.02em;line-height:1.2;word-break:break-all}.wb-account-menu-copy{border:none;background:transparent;padding:6px;border-radius:8px;cursor:pointer;color:#9ca3af;display:inline-flex;align-items:center;justify-content:center;flex:none}.wb-account-menu-copy:hover{color:#6b7280;background:#f3f4f6}.wb-account-menu-body{padding:2px 0 8px;background:#fff}.wb-account-menu-line,.wb-account-menu .menu-sep{height:1px;margin:4px 12px 6px;background:#eef0f3;border:none;flex:none}.wb-account-menu-row{display:flex;align-items:center;gap:12px;width:100%;border:none;background:transparent;text-align:left;padding:11px 16px;font:15px/1.35 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1f2937;cursor:pointer;box-sizing:border-box}.wb-account-menu-row:hover{background:#f9fafb}.wb-account-menu-icon{width:22px;height:22px;min-width:22px;max-width:22px;flex:none;display:inline-flex;align-items:center;justify-content:center;color:#374151;line-height:0}.wb-account-menu-icon-svg{width:20px!important;height:20px!important;display:block;flex:none}.wb-account-menu-label{flex:1;min-width:0}.wb-account-menu .menu-sep{height:1px;margin:6px 12px 8px;background:#eef0f3;border:none}.wb-account-menu-logout{margin:0 12px 4px!important;width:calc(100% - 24px)!important;max-width:calc(100% - 24px)!important;display:flex!important;align-items:center;gap:12px;justify-content:flex-start;padding:11px 14px!important;border:none!important;border-radius:10px!important;background:#ecfdf5!important;color:#047857!important;font:15px/1.35 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif!important;font-weight:500!important;box-sizing:border-box!important;text-align:left!important}.wb-account-menu-logout:hover{background:#d1fae5!important}.wb-account-menu-logout:disabled{opacity:.65;cursor:not-allowed}.wb-sidebar-plugin-dock{display:flex;flex-direction:column;flex:none;width:100%;min-width:0;box-sizing:border-box;margin:0 0 4px;padding:0 2px}.wb-sidebar-plugin-dock:empty{display:none!important;height:0;margin:0;padding:0;overflow:hidden}.wb-sidebar-plugin-dock .dsh-knowledge-launcher,.wb-sidebar-plugin-dock .za-launcher,.wb-sidebar-plugin-dock .esc-launcher{order:0!important;flex:0 0 auto!important;width:calc(100% + 4px)!important;max-width:none!important;margin:4px -2px!important}.wb-sidebar-views-nav{display:flex;flex-direction:column;flex:none;width:100%;margin:0 0 4px;gap:0;box-sizing:border-box}.wb-sidebar-views-nav--rail{align-items:center;width:auto;margin:0 0 8px}.wb-sidebar-view-btn{display:flex;align-items:center;gap:8px;width:100%;min-width:0;height:36px;margin:2px 0;padding:0 12px;border:0;border-radius:12px;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:14px;line-height:22px;white-space:nowrap;box-sizing:border-box}.wb-sidebar-view-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}.wb-sidebar-view-btn.is-active{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16))}.wb-sidebar-view-btn--rail{width:36px;height:36px;padding:0;justify-content:center;border-radius:50%;margin:8px 0}.wb-sidebar-view-btn--rail span{display:none}[role='tab'][data-wb-hide-view-tab='1']{display:none!important}body > [role='menu'],body > [role='listbox'],body > [role='dialog'],body > [class*='popup'],body > [class*='Popup'],body > [class*='popover'],body > [class*='Popover'],body > [class*='menu'],body > [class*='Menu'],body > [class*='dropdown'],body > [class*='Dropdown'],body > [class*='listbox'],body > [class*='Listbox']{z-index:2147483300!important}
.wb-dp-sum-title{font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px}
.wb-dp-summary-ok{background:#ecfdf5;border-bottom-color:#a7f3d0}
.wb-dp-summary-warn{background:#fffbeb;border-bottom-color:#fcd34d}
.wb-dp-summary-error{background:#fef2f2;border-bottom-color:#fecaca}
.wb-dp-btn{margin-top:8px;border:1px solid #0f766e;background:#ecfdf5;color:#0f766e;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}
.wb-dp-btn:hover{background:#d1fae5}
.wb-dp-btn:disabled{opacity:.55;cursor:not-allowed}
.wb-dp-stream-head .wb-dp-btn{margin-top:0;flex:none;white-space:nowrap}
.wb-dp-btn-stop{border-color:#b91c1c;background:#fef2f2;color:#b91c1c}
.wb-dp-btn-stop:hover{background:#fee2e2}
.wb-dp-val{margin:6px 0 0;padding-left:1.1em;font:11px/1.45 ui-monospace,Menlo,monospace}
.wb-dp-val li.ok{color:#047857}
.wb-dp-val li.bad{color:#b91c1c}
.wb-dp-session-toggle{display:inline-flex;align-items:center;gap:6px;margin:0 8px 0 0;padding:4px 10px;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;font:12px/1.3 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#64748b;cursor:pointer;user-select:none}
.wb-dp-session-toggle.is-on{border-color:#6ee7b7;background:#ecfdf5;color:#0f766e;font-weight:600}
.wb-dp-session-toggle.is-blocked{border-color:#fcd34d;background:#fffbeb;color:#b45309}
.wb-dp-session-toggle input{margin:0;accent-color:#0f766e;pointer-events:auto}
.wb-vision-atts{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 2px;align-items:flex-start}
.wb-vision-thumb{display:block;flex:none;max-width:min(360px,72vw);margin:0;padding:0;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#f1f5f9;box-shadow:0 1px 3px rgba(15,23,42,.06);text-decoration:none;color:#94a3b8;font-size:11px;line-height:1.3;cursor:zoom-in;font:inherit}
.wb-vision-thumb img{display:block;max-width:100%;max-height:220px;width:auto;height:auto;object-fit:contain;background:#f8fafc;vertical-align:top;pointer-events:none}
.wb-vision-thumb:hover{border-color:#94a3b8;box-shadow:0 2px 8px rgba(15,23,42,.1)}
.wb-vision-thumb.is-broken{padding:12px 14px;max-width:200px;cursor:default}
.wb-vision-lightbox{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.72);box-sizing:border-box}
.wb-vision-lightbox-inner{position:relative;max-width:min(960px,96vw);max-height:90vh;display:flex;flex-direction:column;align-items:center}
.wb-vision-lightbox-inner img{max-width:100%;max-height:calc(90vh - 16px);object-fit:contain;border-radius:10px;background:#0f172a;box-shadow:0 16px 48px rgba(0,0,0,.35)}
.wb-vision-lightbox-x{position:absolute;top:-10px;right:-10px;z-index:1;width:36px;height:36px;border:none;border-radius:999px;background:#fff;color:#0f172a;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);padding:0}
.wb-vision-lightbox-x:hover{background:#f8fafc}
/* dshmarket\uFF1A\u5B89\u88C5\u786E\u8BA4\u5F39\u5C42\u9ED8\u8BA4 z-index:1\uFF0C\u88AB\u5438\u9876\u641C\u7D22\u680F(z=5)\u76D6\u4F4F \u2192\u300C\u786E\u8BA4\u5B89\u88C5\u300D\u70B9\u5230\u641C\u7D22\u6846\uFF1B
 * \u5F39\u5C42\u7236\u7EA7 _root_ \u4EC5 z-index:1000\uFF0C\u4ECD\u4F1A\u88AB\u5E02\u573A\u5361\u7247\u76D6\u4F4F\uFF0C\u987B\u62AC\u9AD8 :has(_dialog_) \u7684\u6839\u5C42 */
[class*="stickyHead"]{z-index:1!important}
[class*="_root_"]:has([class*="_dialog_"]){z-index:2147483600!important}
[class*="_dialog_"]{z-index:2147483600!important;position:relative}
.wb-dp-msg-skill{display:flex;align-items:center;gap:8px;margin:0 0 8px;flex-wrap:wrap}
.wb-dp-skill-tag{flex:none;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0f766e;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:999px;padding:2px 7px}
.wb-dp-skill-name{font-size:12px;font-weight:600;color:#334155;word-break:break-all}
.wb-dp-msg-flow{margin:0;color:#475569;font-size:12px;line-height:1.65}
.wb-dp-msg-result-detail{margin:8px 0 0;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font:12px/1.55 ui-monospace,Menlo,monospace;color:#334155;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;max-height:240px;overflow:auto}
.wb-dp-msg-result-detail.is-review{font:13px/1.7 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;max-height:min(520px,55vh)}
.wb-dp-msg-result-detail.is-report{max-height:min(560px,60vh)}
.wb-dp-multiline{display:flex;flex-direction:column;align-items:stretch;gap:3px;width:100%;max-width:100%;min-width:0;box-sizing:border-box}
.wb-dp-text-line{display:block;width:100%;max-width:100%;min-width:0;white-space:normal!important;word-break:break-word;overflow-wrap:anywhere;line-height:1.65}
.wb-dp-msg-result.wb-dp-multiline.is-lead{margin:0 0 8px;padding:8px 10px;border-radius:8px;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;font-weight:700;font-size:14px}
.wb-dp-msg.is-fail .wb-dp-msg-result.wb-dp-multiline.is-lead{background:#fef2f2;border-color:#fecaca;color:#b91c1c}
/* \u590D\u6838\u56FE\u4E8C\uFF1A\u9AD8/\u4E2D/\u4F4E\u5371\u6C47\u603B */
.wb-dp-risk-overview{margin:8px 0 0;padding:12px 14px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0}
.wb-dp-risk-row{display:flex;align-items:flex-start;gap:10px;margin:0 0 10px;line-height:1.65;font-size:13px;color:#1e293b}
.wb-dp-risk-row:last-child{margin-bottom:0}
.wb-dp-risk-orb{flex:0 0 auto;width:14px;height:14px;margin-top:4px;border-radius:50%;box-shadow:inset 0 1px 2px rgba(255,255,255,.55),0 0 0 1px rgba(15,23,42,.08)}
.wb-dp-risk-orb.is-high{background:radial-gradient(circle at 35% 30%,#fca5a5 0%,#ef4444 45%,#b91c1c 100%)}
.wb-dp-risk-orb.is-medium{background:radial-gradient(circle at 35% 30%,#fde68a 0%,#f59e0b 45%,#b45309 100%)}
.wb-dp-risk-orb.is-low{background:radial-gradient(circle at 35% 30%,#6ee7b7 0%,#10b981 45%,#047857 100%)}
.wb-dp-risk-label{font-weight:700;margin-right:2px}
.wb-dp-risk-row.is-high .wb-dp-risk-label{color:#b91c1c}
.wb-dp-risk-row.is-medium .wb-dp-risk-label{color:#b45309}
.wb-dp-risk-row.is-low .wb-dp-risk-label{color:#047857}
.wb-dp-risk-body{font-weight:500}
.wb-dp-risk-body b,.wb-dp-risk-body strong{font-weight:700}
.wb-dp-msg-result-detail.wb-dp-multiline{margin:8px 0 0;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;font:13px/1.65 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;overflow:auto}
.wb-dp-msg-result-detail.wb-dp-multiline.is-meta{max-height:160px;font-size:12px;color:#64748b;background:#f1f5f9}
.wb-dp-msg-result-detail.wb-dp-multiline.is-report{max-height:min(560px,62vh)}
.wb-dp-msg-result.is-wrap{margin:0;color:#0f172a;font-weight:500;font-size:13px;line-height:1.7;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}
.wb-dp-session-toggle--compact{margin:0;padding:2px 8px;font-size:11px;max-height:28px}
.wb-dp-stream{border:1px solid #e5e7eb;border-radius:12px;background:#fff;overflow:hidden;font:13px/1.5 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#334155;max-width:100%}
.wb-dp-stream-head{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #eef2f7;background:#f8fafc}
.wb-dp-stream-head-text{flex:1;font-weight:600;color:#0f172a;font-size:13px}
.wb-dp-stream-body{padding:10px 12px 14px;display:flex;flex-direction:column;gap:12px;max-height:min(42vh,420px);overflow:auto}
.wb-dp-stream-empty{margin:8px 4px}
.wb-dp-stream-end{height:1px}
.wb-dp-stream-err{margin:0 12px 12px;padding:8px 10px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:12px;line-height:1.45}
.wb-dp-stream-summary{margin:0 12px 12px;padding:12px 14px;border-radius:12px;background:linear-gradient(180deg,#f8fafc 0%,#fff 100%);border:1px solid #e5e7eb;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.wb-dp-stream-summary.is-live{border-color:#99f6e4;background:linear-gradient(180deg,#f0fdfa 0%,#fff 72%)}
.wb-dp-stream-summary.is-ok{border-color:#a7f3d0;background:linear-gradient(180deg,#ecfdf5 0%,#fff 70%)}
.wb-dp-stream-summary.is-warn{border-color:#fcd34d;background:linear-gradient(180deg,#fffbeb 0%,#fff 70%)}
.wb-dp-stream-summary.is-error{border-color:#fecaca;background:linear-gradient(180deg,#fef2f2 0%,#fff 70%)}
.wb-dp-sum-top{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap;margin-bottom:10px}
.wb-dp-sum-headline{margin:0;flex:1 1 160px;min-width:0;max-width:100%;display:flex;align-items:baseline;gap:6px;font-size:14px;line-height:1.35;font-weight:600;color:#0f172a}
.wb-dp-sum-head-k,.wb-dp-sum-head-v{font:inherit;color:inherit;letter-spacing:normal;flex:none}
.wb-dp-sum-head-v{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wb-dp-sum-head-sep{color:#94a3b8;font:inherit;flex:none}
.wb-dp-sum-live{font-size:11px;font-weight:600;color:#64748b;letter-spacing:.04em}
.wb-dp-sum-live.is-pulse{color:#0f766e;animation:wb-dp-pulse 1.4s ease-in-out infinite}
.wb-dp-sum-meta{display:flex;flex-wrap:wrap;gap:6px;margin:0;flex:0 1 auto;justify-content:flex-end;align-items:center}
.wb-dp-sum-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#334155;background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:3px 9px}
.wb-dp-sum-chip-time{color:#0f766e;border-color:#a7f3d0;background:#ecfdf5;font-variant-numeric:tabular-nums}
.wb-dp-sum-dot{width:7px;height:7px;border-radius:999px;background:#94a3b8;flex:none}
.is-live .wb-dp-sum-dot{background:#14b8a6;box-shadow:0 0 0 3px rgba(20,184,166,.18);animation:wb-dp-pulse 1.2s ease-in-out infinite}
.is-ok .wb-dp-sum-dot{background:#10b981}
.is-error .wb-dp-sum-dot{background:#ef4444}
.wb-dp-sum-lines{margin-top:8px;border-top:1px dashed #e2e8f0;padding-top:6px}
/* \u804A\u5929 Markdown \u6B63\u6587\u5185\u5D4C\u603B\u7ED3\uFF1Adisplay:contents \u8BA9 p/ul \u5403\u5BBF\u4E3B\u6D88\u606F\u6837\u5F0F\uFF08\u56FE\u4E8C\u6548\u679C\uFF09 */
.wb-dp-closing-text{display:contents}
.wb-dp-rail{margin:4px 0 2px;padding:0;max-width:100%;min-width:0}
/* \u4E00\u5361\u6700\u591A\u7EA6 10 \u4E2A\u8282\u70B9\u5165\u89C6\u53E3\uFF1B\u8D85\u51FA\u53EF\u5DE6\u53F3\u6ED1\uFF1B\u6267\u884C\u4E2D JS \u6EDA\u5230\u5F53\u524D\u6B65 */
.wb-dp-rail-scroll{overflow-x:auto;overflow-y:hidden;max-width:100%;width:100%;padding-bottom:6px;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-width:thin}
.wb-dp-rail-scroll::-webkit-scrollbar{height:5px}
.wb-dp-rail-scroll::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}
.wb-dp-rail-inner{position:relative;display:block;box-sizing:border-box;padding:4px 0 0;width:calc(100% * max(var(--wb-dp-rail-total,1), var(--wb-dp-rail-visible,10)) / var(--wb-dp-rail-visible,10));min-width:100%}
.wb-dp-rail-track{position:absolute;left:calc(50%/var(--wb-dp-rail-n,10));right:calc(50%/var(--wb-dp-rail-n,10));top:18px;height:3px;border-radius:999px;background:#e2e8f0;overflow:hidden;z-index:0;pointer-events:none}
.wb-dp-rail-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#5eead4,#0f766e 55%,#14b8a6);width:0;transition:width .55s cubic-bezier(.22,1,.36,1);box-shadow:0 0 10px rgba(20,184,166,.35)}
.wb-dp-rail-nodes{position:relative;z-index:1;display:flex;justify-content:flex-start;gap:0;width:100%;align-items:flex-start;flex-wrap:nowrap}
.wb-dp-rail-node{flex:0 0 calc(100% / var(--wb-dp-rail-total,10));min-width:0;width:auto;max-width:none;display:flex;flex-direction:column;align-items:center;gap:5px;animation:wb-dp-node-in .35s ease both;border:none;background:transparent;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;-webkit-appearance:none;appearance:none}
.wb-dp-rail-node.is-rollback{cursor:default;flex:0 0 calc(100% / var(--wb-dp-rail-total,10));min-width:0;max-width:none}
.wb-dp-rail-node.is-rollback .wb-dp-rail-dot{border-style:dashed;border-color:#f59e0b;background:#fffbeb;color:#b45309;font-size:14px}
.wb-dp-rail-node.is-retry .wb-dp-rail-dot{box-shadow:0 0 0 2px rgba(245,158,11,.25)}
.wb-dp-rollback-banner{margin:10px 0;padding:8px 12px;border-radius:8px;border:1px dashed #fbbf24;background:#fffbeb;color:#92400e;font-size:12px;line-height:1.5;font-weight:600}
.wb-dp-msg.is-retry{border-left:3px solid #fbbf24}
.wb-dp-rail-node:focus-visible{outline:2px solid #2dd4bf;outline-offset:3px;border-radius:8px}
.wb-dp-rail-node:hover .wb-dp-rail-dot{transform:scale(1.08);border-color:#2dd4bf}
.wb-dp-msg.is-flash{animation:wb-dp-flash 1.1s ease;border-color:#2dd4bf!important;box-shadow:0 0 0 3px rgba(45,212,191,.28)}
@keyframes wb-dp-flash{0%{box-shadow:0 0 0 0 rgba(45,212,191,.45)}40%{box-shadow:0 0 0 6px rgba(45,212,191,.2)}100%{box-shadow:0 0 0 0 rgba(45,212,191,0)}}
.wb-dp-rail-dot{width:clamp(22px,5vw,26px);height:clamp(22px,5vw,26px);border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:clamp(9px,2.2vw,11px);font-weight:700;color:#64748b;background:#fff;border:2px solid #cbd5e1;box-sizing:border-box;transition:transform .25s ease,border-color .25s,background .25s,color .25s,box-shadow .25s}
.wb-dp-rail-cap{font-size:clamp(9px,2.1vw,10px);color:#94a3b8;text-align:center;line-height:1.25;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 1px}
.wb-dp-rail-node.is-done .wb-dp-rail-dot{background:#ecfdf5;border-color:#34d399;color:#047857;animation:none;box-shadow:none}
.wb-dp-rail-node.is-done .wb-dp-rail-dot::before{display:none}
.wb-dp-rail-node.is-done .wb-dp-rail-cap{color:#047857;font-weight:600}
.wb-dp-rail-node.is-active .wb-dp-rail-dot{position:relative;border-color:#eab308;color:#854d0e;background:linear-gradient(135deg,#fef9c3,#fde047);box-shadow:0 0 0 2px rgba(250,204,21,.45);animation:wb-dp-rail-active-glow 1.4s ease-in-out infinite}
.wb-dp-rail-node.is-done.is-active .wb-dp-rail-dot{background:#ecfdf5;border-color:#34d399;color:#047857;animation:none;box-shadow:none}
.wb-dp-rail-node.is-done.is-active .wb-dp-rail-dot::before{display:none}
.wb-dp-rail-node.is-active .wb-dp-rail-dot::before{content:"";position:absolute;inset:-5px;border-radius:999px;border:2px solid rgba(234,179,8,.25);border-top-color:#ca8a04;border-right-color:#facc15;animation:wb-dp-rail-spin .75s linear infinite;pointer-events:none}
.wb-dp-rail-node.is-active .wb-dp-rail-cap{color:#a16207;font-weight:700}
.wb-dp-rail-node.is-active:hover .wb-dp-rail-dot{border-color:#ca8a04;transform:none}
.wb-dp-rail-node.is-fail .wb-dp-rail-dot{background:#ef4444;border-color:#dc2626;color:#fff;box-shadow:0 0 0 2px rgba(239,68,68,.35);animation:none}
.wb-dp-rail-node.is-fail .wb-dp-rail-dot::before{display:none}
.wb-dp-rail-node.is-fail .wb-dp-rail-cap{color:#dc2626;font-weight:700}
.wb-dp-rail-node.is-pending .wb-dp-rail-dot{opacity:.55}
@keyframes wb-dp-fade-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes wb-dp-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes wb-dp-node-in{from{opacity:0;transform:translateY(6px) scale(.92)}to{opacity:1;transform:none}}
@keyframes wb-dp-rail-spin{to{transform:rotate(360deg)}}
@keyframes wb-dp-rail-active-glow{0%,100%{box-shadow:0 0 0 2px rgba(250,204,21,.5),0 0 8px rgba(250,204,21,.25)}50%{box-shadow:0 0 0 4px rgba(250,204,21,.35),0 0 14px rgba(234,179,8,.4)}}
@media (max-width:520px){.wb-dp-rail-cap{font-size:9px}.wb-dp-rail-dot{width:22px;height:22px;font-size:10px}}
.wb-dp-msg{border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;padding:10px 12px;animation:wb-dp-fade-in .25s ease}
.wb-dp-msg.is-current,.wb-dp-msg.is-running{border-color:#facc15;background:#fefce8;box-shadow:inset 0 0 0 1px rgba(250,204,21,.25);animation:wb-dp-msg-running 1.6s ease-in-out infinite}
@keyframes wb-dp-msg-running{0%,100%{border-color:#fde047;background:#fefce8}50%{border-color:#eab308;background:#fef9c3}}
.wb-dp-msg.is-pass{border-color:#d1fae5;background:#fff}
.wb-dp-msg.is-wait{border-color:#fdba74;background:#fff7ed}
.wb-dp-msg.is-fail{border-color:#fecaca;background:#fef2f2}
.wb-dp-msg-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.wb-dp-msg-title{flex:1;font-weight:700;color:#0f172a;font-size:14px}
.wb-dp-msg-st{flex:none;font-size:11px;padding:2px 8px;border-radius:999px;background:#f1f5f9;color:#64748b}
.wb-dp-msg-st.pass{background:#ecfdf5;color:#047857}
.wb-dp-msg-st.running{background:#ecfeff;color:#0e7490}
.wb-dp-msg-st.waiting_hitl{background:#ffedd5;color:#c2410c}
.wb-dp-msg-st.waiting_user{background:#fef3c7;color:#b45309}
.wb-dp-msg-st.fail,.wb-dp-msg-st.failed{background:#fee2e2;color:#b91c1c}
.wb-dp-msg-sec{margin-top:6px}
.wb-dp-msg-label{font-size:11px;font-weight:700;color:#64748b;letter-spacing:.04em;margin-bottom:4px}
.wb-dp-msg-log{margin:0;padding-left:1.15em;color:#334155}
.wb-dp-msg-log li{margin:2px 0}
.wb-dp-msg-result{margin:0;color:#0f172a;font-weight:600}
.wb-dp-msg-result:not(.is-wrap){white-space:normal}
.wb-dp-msg-muted{margin:4px 0 0;color:#94a3b8;font-size:12px}
.wb-dp-msg-arts,.wb-dp-msg-val{margin:4px 0 0;padding-left:1.1em;color:#64748b;font:12px/1.45 ui-monospace,Menlo,monospace;word-break:break-all}
.wb-dp-msg-val li.ok{color:#047857}
.wb-dp-msg-val li.bad{color:#b91c1c}
.wb-dp-badge{display:inline-flex;padding:2px 8px;border-radius:999px;background:#ecfdf5;color:#0f766e;font-weight:600;font-size:11px}
.wb-dp-btn{margin-top:10px;border:1px solid #0f766e;background:#ecfdf5;color:#0f766e;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}
.wb-dp-btn:hover{background:#d1fae5}
.wb-dp-btn:disabled{opacity:.55;cursor:not-allowed}
.wb-dp-stream-head .wb-dp-btn{margin-top:0;flex:none;white-space:nowrap}
.wb-dp-btn-stop{border-color:#b91c1c;background:#fef2f2;color:#b91c1c}
.wb-dp-btn-stop:hover{background:#fee2e2}
.wb-dp-session-toggle{display:inline-flex;align-items:center;gap:6px;margin:0 8px 0 0;padding:4px 10px;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;font:12px/1.3 -apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#64748b;cursor:pointer;user-select:none}
.wb-dp-session-toggle.is-on{border-color:#6ee7b7;background:#ecfdf5;color:#0f766e;font-weight:600}
.wb-dp-session-toggle.is-blocked{border-color:#fcd34d;background:#fffbeb;color:#b45309}
.wb-dp-session-toggle input{margin:0;accent-color:#0f766e;pointer-events:auto}

.wb-vision-atts{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 2px;align-items:flex-start}
.wb-vision-thumb{display:block;flex:none;max-width:min(360px,72vw);margin:0;padding:0;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;background:#f1f5f9;box-shadow:0 1px 3px rgba(15,23,42,.06);text-decoration:none;color:#94a3b8;font-size:11px;line-height:1.3;cursor:zoom-in;font:inherit}
.wb-vision-thumb img{display:block;max-width:100%;max-height:220px;width:auto;height:auto;object-fit:contain;background:#f8fafc;vertical-align:top;pointer-events:none}
.wb-vision-thumb:hover{border-color:#94a3b8;box-shadow:0 2px 8px rgba(15,23,42,.1)}
.wb-vision-thumb.is-broken{padding:12px 14px;max-width:200px;cursor:default}
.wb-vision-lightbox{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(15,23,42,.72);box-sizing:border-box}
.wb-vision-lightbox-inner{position:relative;max-width:min(960px,96vw);max-height:90vh;display:flex;flex-direction:column;align-items:center}
.wb-vision-lightbox-inner img{max-width:100%;max-height:calc(90vh - 16px);object-fit:contain;border-radius:10px;background:#0f172a;box-shadow:0 16px 48px rgba(0,0,0,.35)}
.wb-vision-lightbox-x{position:absolute;top:-10px;right:-10px;z-index:1;width:36px;height:36px;border:none;border-radius:999px;background:#fff;color:#0f172a;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.25);padding:0}
.wb-vision-lightbox-x:hover{background:#f8fafc}

/* dshmarket\uFF1A\u5B89\u88C5\u786E\u8BA4\u5F39\u5C42\u9ED8\u8BA4 z-index:1\uFF0C\u88AB\u5438\u9876\u641C\u7D22\u680F(z=5)\u76D6\u4F4F \u2192\u300C\u786E\u8BA4\u5B89\u88C5\u300D\u70B9\u5230\u641C\u7D22\u6846\uFF1B
 * \u5F39\u5C42\u7236\u7EA7 _root_ \u4EC5 z-index:1000\uFF0C\u4ECD\u4F1A\u88AB\u5E02\u573A\u5361\u7247\u76D6\u4F4F\uFF0C\u987B\u62AC\u9AD8 :has(_dialog_) \u7684\u6839\u5C42 */
[class*="stickyHead"]{z-index:1!important}
[class*="_root_"]:has([class*="_dialog_"]){z-index:2147483600!important}
[class*="_dialog_"]{z-index:2147483600!important;position:relative}

/* \u4EBA\u5458\u548C\u89D2\u8272\u7EF4\u62A4\uFF08\u8D26\u53F7\u83DC\u5355\u5BF9\u8BDD\u6846\uFF1B\u5C3A\u5BF8\u5BF9\u9F50\u4E3B\u5185\u5BB9\u533A/\u8BBE\u7F6E\u7C7B\u9762\u677F\uFF0C\u4E3B\u6309\u94AE\u5BF9\u9F50\u8F66\u9053 primary \u6E10\u53D8\uFF09 */
.wb-account-dialog.people{width:min(920px,96vw);max-height:min(90vh,880px);display:flex;flex-direction:column}
.wb-account-dialog.people .wb-account-dialog-body{overflow:auto;flex:1 1 auto}
.wb-people-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px;justify-content:flex-end}
.wb-people-btn{height:36px;padding:0 14px;border-radius:10px;border:1px solid #dbe1ea;background:#fff;color:#1f2937;font:13px inherit;cursor:pointer}
.wb-people-btn:hover:not(:disabled){background:#f8fafc}
.wb-people-btn:disabled{opacity:.55;cursor:not-allowed}
.wb-people-btn.primary{background:linear-gradient(135deg,#0f766e,#0ea5e9);border:none;color:#fff;font-weight:600}
.wb-people-btn.primary:hover:not(:disabled){filter:brightness(1.05);background:linear-gradient(135deg,#0f766e,#0ea5e9)}
.wb-people-form{display:grid;gap:8px;padding:12px;margin-bottom:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafbfc}
.wb-people-form label{display:grid;gap:4px;font-size:12px;color:#64748b}
.wb-people-form input,.wb-people-form select{height:36px;border:1px solid #dbe1ea;border-radius:8px;padding:0 10px;font:14px inherit;color:#111827;background:#fff}
.wb-people-table-wrap{overflow:auto;border:1px solid #e5e7eb;border-radius:10px}
.wb-people-table{width:100%;border-collapse:collapse;font-size:13px}
.wb-people-table th,.wb-people-table td{padding:10px 12px;text-align:left;border-bottom:1px solid #eef2f7;vertical-align:top}
.wb-people-table th{background:#f8fafc;color:#64748b;font-weight:600;white-space:nowrap}
.wb-people-table tr.is-disabled td{color:#94a3b8}
.wb-people-actions{display:flex;flex-wrap:wrap;gap:6px 10px}
.wb-people-link{border:0;background:none;padding:0;color:#2563eb;font:inherit;cursor:pointer}
.wb-people-link:hover:not(:disabled){text-decoration:underline}
.wb-people-link:disabled{color:#94a3b8;cursor:not-allowed}

.wb-people-caps-row td{background:#f8fafc;padding:12px}
.wb-people-caps .hint{margin:0 0 10px}
.wb-people-caps-grid{display:flex;flex-wrap:wrap;gap:8px 10px}
.wb-people-cap-sw{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:999px;border:1px solid #dbe1ea;background:#fff;font-size:13px;color:#334155;cursor:pointer;user-select:none}
.wb-people-cap-sw.is-on{border-color:#86efac;background:#f0fdf4;color:#166534}
.wb-people-cap-sw.is-off{border-color:#fecaca;background:#fef2f2;color:#991b1b}
.wb-people-cap-sw.is-locked{cursor:default}
.wb-people-cap-sw input{margin:0;accent-color:#16a34a}
.wb-people-cap-sw.is-locked input{pointer-events:none}

.wb-people-table tr.is-caps-open td{background:#eef6ff}
.wb-people-caps-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.wb-people-caps-title{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0;flex:1 1 auto}
.wb-people-caps-who{font-size:14px;color:#0f172a}
.wb-people-caps-dirty{font-size:12px;color:#b45309;background:#fffbeb;border:1px solid #fcd34d;border-radius:999px;padding:2px 8px}
.wb-people-caps-head .wb-people-btn{flex:none;margin-left:auto}

/* \u53EA\u85CF\u6253\u8FC7\u6807\u8BB0\u7684\u5199\u7801\u786E\u8BA4/\u8FDB\u5EA6\u5361\u3002\u7981\u6B62\u901A\u914D .cc-card\uFF1ADSH \u5BF9\u8BDD\u6B63\u6587\u4E5F\u53EF\u80FD\u7528\u8FD9\u4E2A\u7C7B\uFF0C
 * \u6574\u8868 display:none \u4F1A\u628A\u4E3B\u680F\u9AD8\u5EA6\u584C\u6389\uFF0C\u7CFB\u7EDF\u8F93\u5165\u6846\u88AB\u9876\u5230\u9875\u9762\u4E0A\u65B9\u3002\u4E0D\u78B0\u5E95\u680F\u3002 */
.cc-card[data-wb-cchat-confirm-only="1"]:not([data-composer-seat]):not([data-composer-card]),
.cc-card[data-wb-cchat-autostart-hide="1"]:not([data-composer-seat]):not([data-composer-card]),
[data-wb-cchat-confirm-shell="1"]:not([data-composer-seat]):not([data-composer-card]){display:none}
.wb-cchat-feed{margin:8px 0 12px;width:100%;flex:none;align-self:stretch;display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.6;color:#0f172a}
.wb-cchat-line{white-space:pre-wrap;word-break:break-word}
.wb-cchat-line.is-think{color:#64748b;font-size:13px;line-height:1.55}
.wb-cchat-line.is-say{color:#0f172a}
.wb-cchat-line.is-say .wb-cchat-prose{white-space:pre-wrap;margin:0 0 8px;line-height:1.65}
.wb-cchat-line.is-say .wb-cchat-prose:last-child{margin-bottom:0}
.wb-cchat-h{font-size:13px;font-weight:650;color:#1e293b;margin:12px 0 6px;letter-spacing:.01em}
.wb-cchat-h:first-child{margin-top:0}
.wb-cchat-ul{margin:4px 0 10px;padding-left:1.25em}
.wb-cchat-ul li{margin:3px 0;line-height:1.55}
.wb-cchat-table-wrap{margin:8px 0 12px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
.wb-cchat-table{width:100%;border-collapse:collapse;font-size:13px;line-height:1.45}
.wb-cchat-table th{background:#f8fafc;font-weight:650;color:#334155}
.wb-cchat-table th,.wb-cchat-table td{padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
.wb-cchat-table tr:last-child th,.wb-cchat-table tr:last-child td{border-bottom:0}
.wb-cchat-inline{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;background:#f1f5f9;border-radius:4px;padding:1px 5px;color:#0f172a}
.wb-cchat-line.is-say strong{font-weight:650}
.wb-cchat-line.is-tool{white-space:normal}
.wb-cchat-line.is-status{color:#64748b;font-size:12px}
.wb-cchat-line.is-stream{border-right:1.5px solid currentColor;padding-right:1px;animation:wb-cchat-caret .9s step-end infinite}
@keyframes wb-cchat-caret{50%{border-right-color:transparent}}

/* \u641C\u7D22 / \u8BFB\u53D6 / \u5220\u9664\uFF1A\u6D45\u8272\u82AF\u7247 */
.wb-cchat-chip{display:flex;align-items:baseline;gap:8px;min-width:0}
.wb-cchat-chip-label{flex:none;font-size:12px;color:#64748b;font-weight:600}
.wb-cchat-chip-arg{min-width:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px;color:#0f172a;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:3px 8px;line-height:1.4;word-break:break-all}
.wb-cchat-line.is-run .wb-cchat-chip-arg{border-color:#93c5fd;background:#eff6ff;color:#1d4ed8}

/* \u8FD0\u884C\u6307\u4EE4\uFF1ACursor \u7EC8\u7AEF\u5361 */
.wb-cchat-run{margin:0;background:#1e1e1e;color:#d4d4d4;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a}
.wb-cchat-run-head{list-style:none;display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;user-select:none;color:#c8c8c8;font-size:13px;line-height:1.35}
.wb-cchat-run-head::-webkit-details-marker{display:none}
.wb-cchat-run-chevron{flex:none;width:0;height:0;border-style:solid;border-width:4px 0 4px 6px;border-color:transparent transparent transparent #9ca3af;transform:rotate(0deg);transition:transform .15s ease}
.wb-cchat-run[open] .wb-cchat-run-chevron{transform:rotate(90deg)}
.wb-cchat-run-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12.5px}
.wb-cchat-line.is-run .wb-cchat-run-title::after{content:" \u2026";color:#60a5fa}
.wb-cchat-run-body{margin:0;padding:0 14px 12px;max-height:240px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.55;color:#d4d4d4;white-space:pre-wrap;word-break:break-word;background:transparent}

/* \u7F16\u8F91\u4EE3\u7801\uFF1ACursor diff \u5361 */
.wb-cchat-code{background:#1e1e1e;color:#d4d4d4;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a}
.wb-cchat-code-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #2f2f2f;font-size:12.5px;color:#d4d4d4}
.wb-cchat-code-lang{flex:none;font-weight:700;letter-spacing:.04em;color:#93c5fd;font-size:11px}
.wb-cchat-code-file{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.wb-cchat-code-stat{margin-left:auto;flex:none;display:inline-flex;gap:8px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
.wb-cchat-code-stat .is-add{color:#4ade80}
.wb-cchat-code-stat .is-del{color:#f87171}
.wb-cchat-code-body{max-height:360px;overflow:auto;padding:4px 0 8px}
.wb-cchat-code-plain{margin:0;padding:10px 14px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;color:#d4d4d4}
.wb-cchat-code-row{display:grid;grid-template-columns:44px 16px minmax(0,1fr);gap:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.55}
.wb-cchat-code-ln{text-align:right;padding:0 8px;color:#6b7280;user-select:none}
.wb-cchat-code-mk{text-align:center;color:#6b7280}
.wb-cchat-code-tx{padding:0 10px 0 4px;white-space:pre;overflow-x:auto;color:#e5e7eb}
.wb-cchat-code-row.is-add{background:rgba(22,101,52,.28)}
.wb-cchat-code-row.is-add .wb-cchat-code-mk{color:#4ade80}
.wb-cchat-code-row.is-del{background:rgba(127,29,29,.32)}
.wb-cchat-code-row.is-del .wb-cchat-code-mk{color:#f87171}
.wb-cchat-code-row.is-omit .wb-cchat-code-tx{color:#6b7280}
.wb-cchat-code-empty,.wb-cchat-code-more{padding:8px 14px;color:#9ca3af;font-size:12px}
.wb-cchat-line.is-say .wb-cchat-code{margin:8px 0}
/* \u7981\u6B62\u518D\u7ED9\u804A\u5929\u680F\u7956\u5148\u52A0 height:auto\uFF1A\u4F1A\u628A\u4E3B\u680F\u4ECE flex \u6EE1\u9AD8\u584C\u6210\u5185\u5BB9\u9AD8\uFF0C\u8F93\u5165\u6846\u9876\u5230\u4E0A\u9762\u3002 */
/* \u5BF9\u8BDD\u505C\u5728\u5E95\u90E8\u300C\u6DF1\u5EA6\u6C42\u7D22\u300D\u65F6\uFF0C\u5199\u7801\u5361\u5728\u4E0A\u9762\u7684\u300C\u5DF2\u8C03\u7528\u5DE5\u5177\u300D\u91CC\uFF0C\u6EDA\u56DE\u53BB\u4F1A\u88AB\u5BBF\u4E3B\u62FD\u56DE\u5E95\u90E8\u3002
 * \u53EA\u5728\u5199\u7801\u8FDB\u884C\u4E2D\u3001\u5361\u4E0D\u5728\u89C6\u53E3\u91CC\u65F6\uFF0C\u628A\u8FD9\u5F20\u63D2\u4EF6\u5361\u672C\u8EAB\u8D34\u8FDB\u804A\u5929\u680F\u3002\u4E0D\u662F\u53E6\u505A\u6D6E\u5C42\u3002 */
.cc-card.wb-cchat-stick{
  position:fixed !important;
  z-index:30;
  overflow:auto !important;
  background:#fff;
  box-shadow:0 8px 28px rgba(15,23,42,.12);
}
/* \u6E05\u6670\u5199\u7801\u65F6\u85CF\u6A21\u578B\u8BEF\u5410\u7684\u95EE\u5377\u884C\uFF08\u63D0\u95EE \xB7 \u5165\u53E3\u4F4D\u7F6E\uFF09\u3002\u7981\u6B62\u6253\u5230\u7236\u7EA7\uFF0C\u4EE5\u514D\u85CF\u5E95\u680F\u3002 */
[data-wb-clear-coding-ask-hide="1"]{display:none !important}
/* \u7EED\u6539\u786E\u8BA4\u5361\u8865\u5145\u8BF4\u660E\uFF1A\u5931\u8D25/\u5931\u6548\u65F6\u5199\u6E05\u695A\uFF0C\u907F\u514D\u5F53\u6210\u83AB\u540D\u5176\u5999\u7684\u65B0\u786E\u8BA4 */
.wb-continue-clarify{margin:0 0 10px;padding:10px 12px;border-radius:8px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;line-height:1.45;font-size:13px}
.wb-continue-clarify.is-failed{border-color:#fecaca;background:#fef2f2;color:#7f1d1d}
.wb-continue-clarify.is-warn{border-color:#fcd34d;background:#fffbeb;color:#92400e}
.wb-continue-clarify-title{font-weight:650;margin:0 0 4px}
.wb-continue-clarify-body{margin:0;opacity:.95}
/* *.db EPERM \u6574\u5355\u5931\u8D25\u540E\uFF1A\u81EA\u52A8\u4ECE\u6C99\u7BB1\u56DE\u6536\u6E90\u7801\u7684\u63D0\u793A\u6761 */
.wb-db-sync-recover{margin:0 0 10px;padding:10px 12px;border-radius:8px;border:1px solid #fcd34d;background:#fffbeb;color:#92400e;line-height:1.45;font-size:13px}
.wb-db-sync-recover.is-ok{border-color:#86efac;background:#f0fdf4;color:#166534}
.wb-db-sync-recover.is-busy{border-color:#93c5fd;background:#eff6ff;color:#1e3a8a}
.wb-db-sync-recover.is-warn{border-color:#fcd34d;background:#fffbeb;color:#92400e}
.wb-db-sync-recover-title{font-weight:650;margin:0 0 4px}
.wb-db-sync-recover-body{margin:0;opacity:.95}

/* MES \u5BF9\u63A5\uFF1A\u9876\u680F + \u65B0\u589E\uFF1B\u5361\u7247\u6807\u9898\u884C\u53F3\u4FA7\u7F16\u8F91 / \u5220\u9664 */
.wb-set-mes-toolbar{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin:0 0 8px}
.wb-set-mes-toolbar .wb-set-hint{flex:1;min-width:0;line-height:1.45}
.wb-set-card{position:relative}
.wb-set-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:12px 10px 2px 16px}
.wb-set-card-head h3{margin:0;padding:4px 0 0;font-size:16px;font-weight:700;letter-spacing:-.01em;color:#0f172a;flex:1;min-width:0;line-height:1.35}
.wb-set-card-tools{display:inline-flex;align-items:center;gap:2px;flex:none}
.wb-set-card-icon{width:32px;height:32px;border:none;border-radius:8px;background:transparent;color:#64748b;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;flex:none}
.wb-set-card-icon:hover{background:#f1f5f9;color:#0f172a}
.wb-set-card-icon.primary{color:#2563eb}
.wb-set-card-icon.primary:hover{background:#eff6ff;color:#1d4ed8}
.wb-set-card-icon.danger:hover{background:#fef2f2;color:#b91c1c}
.wb-set-card-icon:disabled{opacity:.45;cursor:not-allowed}
.wb-set-card-icon-svg{display:block;width:16px;height:16px}

/* \u94C1\u5F8B LOCKED\uFF1A\u5BBF\u4E3B\u5E95\u680F\u8F93\u5165 [data-composer-seat]/[data-composer-card] \u662F\u7CFB\u7EDF\u7EC4\u4EF6\u3002
 * \u672C\u4ED3\u7981\u6B62\u5BF9\u5176\u505A\u4EFB\u4F55\u5E03\u5C40/\u4F4D\u79FB/\u663E\u9690\u6539\u5199\uFF08\u542B sticky\u3001flex\u3001\u6295\u5F71\u3001display:none\u3001height:0\uFF09\u3002
 * \u8D44\u6599\u5E93/\u7528\u91CF\u53E0\u5C42\u7528 bottom:var(--dsh-composer-height) \u8BA9\u51FA\u5E95\u680F\uFF0C\u7981\u6B62\u518D\u85CF\u8F93\u5165\u6846\u3002 */

/* \u63D2\u4EF6\u5165\u53E3\u7559\u5728\u539F React \u7236\u7EA7\uFF0C\u5C55\u5F00\u4FA7\u680F\u65F6\u7528 flex order \u6392\u5230\u4F1A\u8BDD\u5217\u8868\u4E0A\u65B9\u3002
   \u5FC5\u987B\u538B\u8FC7 [class*='_footArea']{display:flex!important}\uFF0C\u5426\u5219\u6574\u6BB5\u811A\u533A\u4F1A\u6324\u5230\u5217\u8868\u4E0A\u9762\u628A\u4F1A\u8BDD\u5217\u538B\u6241\u3002
   \u6536\u8D77\u8F68\u4E0D\u6539\uFF0C\u907F\u514D\u56FE\u6807\u5217\u88AB order \u6253\u4E71\u3002\u7981\u6B62\u518D appendChild \u8FDB\u81EA\u5EFA dock\u3002 */
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) > [class*="footArea"],
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) > [class*="footArea"] > [class*="footerActions"]{
  display:contents!important
}
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) > [class*="regionArea"]{
  order:5;
  flex:1 1 auto;
  min-height:0
}
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) .dsh-knowledge-launcher,
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) .za-launcher,
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) .esc-launcher,
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) .wb-sidebar-views-nav{
  order:2;
  flex:0 0 auto!important;
  align-self:stretch;
  width:100%;
  max-width:none
}
[data-wb-sidebar-root="1"]:not([class*="collapsed"]) .wb-sidebar-account{
  order:20;
  flex:0 0 auto!important;
  width:100%
}
/* \u5B98\u65B9\u4FA7\u680F\u300C\u66F4\u591A\u300D\u4E0E\u8D26\u53F7\u83DC\u5355\u91CD\u590D\u3002\u53EA\u85CF\u8BE5\u6309\u94AE\u53CA\u5176\u610F\u89C1\u53CD\u9988/\u767B\u5F55\u3002
   \u4E0D\u5199 [data-composer-seat] / [data-composer-card]\u3002 */
[data-wb-hide-official-more="1"]{
  display:none!important
}
[data-wb-official-account-menu="1"]{
  visibility:hidden!important;
  pointer-events:none!important
}
[data-wb-official-drop="1"]{
  display:none!important
}
[data-wb-coding-hold="1"]{display:none!important}

/* docked panellist main scroll */
.wb-docked-main-scroll{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;width:100%;overflow:hidden}
.wb-docked-main-scroll .wb-usage-view{height:100%!important;max-height:none!important;min-height:0!important;flex:1 1 auto;overflow:hidden!important;max-width:none;margin:0}
.wb-docked-main-scroll .wb-usage-view-head{flex:none}
.wb-docked-main-scroll .wb-usage-view-body{flex:1 1 auto!important;min-height:0!important;height:auto!important;overflow:auto!important;-webkit-overflow-scrolling:touch}
.wb-docked-main-scroll .wb-usage-view .wb-usage-page,.wb-docked-main-scroll .wb-usage-view .wb-set{height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;margin:0}
.wb-docked-main-scroll .wb-space-view{height:100%;max-width:none;margin:0;flex:1 1 auto;min-height:0}\r
`;

// client-src/css.js
function installCss(ctx) {
  var cssInjected = false;
  function ensureCss() {
    if (typeof document === "undefined") return;
    var ver = "composer-121";
    if (cssInjected && document.querySelector("style[data-wb-cd-css='" + ver + "']")) return;
    document.querySelectorAll("style[data-plugin='@dsh-external/dsh-mes-bridge']").forEach(function(el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    cssInjected = true;
    var s = document.createElement("style");
    s.dataset.plugin = "@dsh-external/dsh-mes-bridge";
    s.dataset.wbCdCss = ver;
    s.textContent = styles_default;
    document.head.appendChild(s);
  }
  ctx.ensureCss = ensureCss;
}

// client-src/shared-helpers.js
function installSharedHelpers(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var ensureCss = ctx.ensureCss;
  function readMeta(block) {
    if (!block || !("kind" in block)) return null;
    var meta = block.meta;
    if (!meta || typeof meta !== "object") return null;
    var wb = meta.wb;
    if (!wb || typeof wb !== "object") return null;
    return wb;
  }
  function expandHomePath(p, home) {
    var s = String(p || "").trim();
    if (!s) return "";
    var hm = String(home || "").trim().replace(/\/+$/, "");
    if (s === "~" && hm) return hm;
    if (s.indexOf("~/") === 0 && hm) s = hm + s.slice(1);
    if (s.length > 1) s = s.replace(/\/+$/, "");
    return s;
  }
  function pathsEqual(a, b, home) {
    var x = expandHomePath(a, home);
    var y = expandHomePath(b, home);
    if (!x || !y) return false;
    return x === y;
  }
  function resolveDshCwd(props) {
    if (!props) return "";
    var direct = String(props.cwd || "").trim();
    if (direct) return expandHomePath(direct, props.home);
    try {
      if (typeof props.useSessions === "function" && props.sessionId) {
        var cwd = props.useSessions(function(s) {
          var row = s && s.byId && s.byId[props.sessionId];
          return row && row.cwd;
        });
        if (cwd) return expandHomePath(cwd, props.home);
      }
    } catch (e) {
    }
    return "";
  }
  function initialWorkspace(props, ui) {
    var dsh = resolveDshCwd(props);
    var fromUi = String(ui && ui.workspace || "").trim();
    return dsh || fromUi || "";
  }
  function mergeWorkspaceSuggestions(suggestions, dshCwd, home) {
    var out = [];
    var seen = {};
    function add(path, label) {
      var p2 = expandHomePath(path, home);
      if (!p2 || seen[p2]) return;
      seen[p2] = true;
      out.push({ path: p2, label: label ? String(label) : "" });
    }
    add(dshCwd, "\u5F53\u524D\u5DE5\u4F5C\u533A");
    var list = Array.isArray(suggestions) ? suggestions : [];
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var p = typeof s === "string" ? s : s && s.path || "";
      var lab = typeof s === "object" && s && s.label ? s.label : "";
      add(p, lab);
    }
    return out;
  }
  function textFromContentBlocks(content) {
    if (!Array.isArray(content)) return "";
    return content.map(function(c) {
      if (!c) return "";
      if (c.type === "text" || c.kind === "text") return String(c.text || "");
      return "";
    }).filter(Boolean).join("\n").trim();
  }
  function toolArgsMessage(block) {
    if (!block) return "";
    var raw = "";
    if (typeof block.argsRaw === "string") raw = block.argsRaw;
    else if (block.call && typeof block.call.argsRaw === "string") raw = block.call.argsRaw;
    if (!raw) return "";
    try {
      var o = JSON.parse(raw);
      return String(o && (o.message || o.requirement) || "").trim();
    } catch (e) {
      return "";
    }
  }
  function lastUserUtterance(props) {
    try {
      if (!props || typeof props.useSession !== "function") return "";
      var text = props.useSession(function(s) {
        var list = s && Array.isArray(s.nodes) && s.nodes || s && s.chat && s.chat.legacy && Array.isArray(s.chat.legacy.nodes) && s.chat.legacy.nodes || null;
        if (!list) return "";
        for (var i = list.length - 1; i >= 0; i--) {
          var n = list[i];
          if (n && n.kind === "user") return textFromContentBlocks(n.content);
        }
        return "";
      });
      return String(text || "").trim();
    } catch (e) {
      return "";
    }
  }
  function initialRequirement(props, ui) {
    var fromUi = String(ui && (ui.requirement || ui.original_goal) || "").trim();
    if (fromUi) return fromUi;
    var fromArgs = toolArgsMessage(props && props.block);
    if (fromArgs) return fromArgs;
    return lastUserUtterance(props) || "";
  }
  function WorkspaceMismatchHint(hintProps) {
    var dshCwd = hintProps.dshCwd;
    var workspace = hintProps.workspace;
    var home = hintProps.home;
    var onUseDsh = hintProps.onUseDsh;
    if (!dshCwd) {
      return h(
        "p",
        { className: "wb-cr-dsh" },
        "\u672A\u68C0\u6D4B\u5230\u4FA7\u680F\u5DE5\u4F5C\u533A\u8DEF\u5F84\uFF1B\u8BF7\u5148\u5728\u5DE6\u4FA7\u9009\u62E9\u5DE5\u4F5C\u533A\uFF0C\u6216\u624B\u52A8\u586B\u5199/\u6D4F\u89C8\u76EE\u5F55\u3002"
      );
    }
    var mismatch = !!String(workspace || "").trim() && !pathsEqual(workspace, dshCwd, home);
    return h(
      "div",
      null,
      h(
        "p",
        { className: "wb-cr-dsh" },
        "\u5F53\u524D\u5DE5\u4F5C\u533A\uFF1A",
        h("code", null, dshCwd),
        mismatch ? null : "\uFF08\u5DF2\u9ED8\u8BA4\u586B\u5165\uFF0C\u53EF\u6539\uFF09"
      ),
      mismatch ? h(
        "div",
        { className: "wb-cr-warn" },
        "\u586B\u5199\u76EE\u5F55\u4E0E\u4FA7\u680F\u5DE5\u4F5C\u533A\u4E0D\u4E00\u81F4\u3002\u5C06\u6309\u4E0A\u65B9\u8F93\u5165\u8DEF\u5F84\u6267\u884C\uFF0C\u8BF7\u786E\u8BA4\u662F\u5426\u641E\u9519\u5DE5\u7A0B\u3002",
        onUseDsh ? h(
          "div",
          { style: { marginTop: 8 } },
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn",
              onClick: onUseDsh
            },
            "\u6539\u7528\u5F53\u524D\u5DE5\u4F5C\u533A"
          )
        ) : null
      ) : null
    );
  }
  ctx.readMeta = readMeta;
  ctx.expandHomePath = expandHomePath;
  ctx.pathsEqual = pathsEqual;
  ctx.resolveDshCwd = resolveDshCwd;
  ctx.initialWorkspace = initialWorkspace;
  ctx.mergeWorkspaceSuggestions = mergeWorkspaceSuggestions;
  ctx.textFromContentBlocks = textFromContentBlocks;
  ctx.toolArgsMessage = toolArgsMessage;
  ctx.lastUserUtterance = lastUserUtterance;
  ctx.initialRequirement = initialRequirement;
  ctx.WorkspaceMismatchHint = WorkspaceMismatchHint;
}

// client-src/lanes/code-review.js
function installCodeReview(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, workspaceDirFieldLabel = ctx.workspaceDirFieldLabel, workspaceDirFieldHint = ctx.workspaceDirFieldHint, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, mergeWorkspaceSuggestions = ctx.mergeWorkspaceSuggestions, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var CR_UI_REV = "2026-09-10o-cr-session";
  var CR_PERSIST_VER = 1;
  var CR_PERSIST_MAX_REPORT = 1e5;
  function crBlockCallId(block, callIdProp) {
    if (callIdProp != null && String(callIdProp).trim()) return String(callIdProp).trim();
    if (!block) return "";
    var nested = block.call && typeof block.call === "object" ? block.call : null;
    return String(
      block.callId || block.toolCallId || nested && (nested.callId || nested.toolCallId || nested.id) || block.id || ""
    ).trim();
  }
  function crBlockSessionId(block, sessionId) {
    return String(
      sessionId || block && (block.threadId || block.thread_id || block.sessionId || block.session_id || block.conversationId || "") || ""
    ).trim();
  }
  function crPersistKey(block, sessionId, callIdProp) {
    var callId = crBlockCallId(block, callIdProp);
    var sid = crBlockSessionId(block, sessionId);
    if (callId && sid) return "wb-cr-card:" + sid + ":" + callId;
    if (callId) return "wb-cr-card:call:" + callId;
    if (sid) return "wb-cr-card:session:" + sid + ":lone";
    return "wb-cr-card:anon";
  }
  function crPersistKeyAliases(block, sessionId, callIdProp) {
    var callId = crBlockCallId(block, callIdProp);
    var sid = crBlockSessionId(block, sessionId);
    var keys = [crPersistKey(block, sessionId, callIdProp)];
    if (callId) {
      keys.push("wb-cr-card:call:" + callId, "wb-cr-card:block:" + callId);
      if (sid) keys.push("wb-cr-card:" + sid + ":" + callId);
    } else if (sid) {
      keys.push("wb-cr-card:" + sid, "wb-cr-card:session:" + sid + ":lone");
    } else {
      keys.push("wb-cr-card:anon");
    }
    var uniq = [];
    var seen = {};
    keys.forEach(function(k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      uniq.push(k);
    });
    return uniq;
  }
  function crPersistBelongsToCall(saved, callId) {
    if (!saved || typeof saved !== "object") return false;
    var cid = String(callId || "").trim();
    if (!cid) return false;
    return String(saved.callId || "").trim() === cid;
  }
  function crPickMustStayPick(wb, ui, saved, callId) {
    var cid = String(callId || "").trim();
    if (saved && cid && crPersistBelongsToCall(saved, callId)) {
      var phase = String(saved.phase || "");
      if (phase === "done" || phase === "running" || phase === "files") return false;
    }
    var isPick = ui && String(ui.kind || "") === "pick" || wb && wb.t === "cr-pick";
    if (!isPick && wb && wb.t && String(wb.t).indexOf("cr-") === 0 && wb.t !== "cr-pick") {
      return false;
    }
    if (!isPick && wb && wb.t) return false;
    if (!saved) return true;
    if (!cid) return true;
    return !crPersistBelongsToCall(saved, callId);
  }
  function crPersistClip(text, maxLen) {
    var s = String(text || "");
    if (!s) return "";
    var n = maxLen || CR_PERSIST_MAX_REPORT;
    return s.length > n ? s.slice(-n) : s;
  }
  function crPersistNormalize(o) {
    if (!o || typeof o !== "object") return null;
    if (Number(o.v || 0) < 1) return null;
    return o;
  }
  function crPersistLoad(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return crPersistNormalize(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }
  function crPersistLoadForCard(block, sessionId, callIdProp) {
    try {
      var callId = crBlockCallId(block, callIdProp);
      var key = crPersistKey(block, sessionId, callIdProp);
      var aliases = crPersistKeyAliases(block, sessionId, callIdProp);
      for (var i = 0; i < aliases.length; i++) {
        var hit = crPersistLoad(aliases[i]);
        if (hit && crPersistBelongsToCall(hit, callId) && (hit.phase === "done" || hit.phase === "running" || hit.phase === "files")) {
          return { key, saved: hit };
        }
      }
      return { key, saved: null };
    } catch (eLoad) {
      return { key: crPersistKey(block, sessionId, callIdProp), saved: null };
    }
  }
  function crPersistSave(key, data) {
    try {
      var prev = null;
      try {
        prev = JSON.parse(localStorage.getItem(key) || "null");
      } catch (ePrev) {
      }
      if (prev && Number(prev.v || 0) >= 1 && prev.phase === "done" && data && data.phase === "dir" && !data.forceReset) {
        return;
      }
      var payload = Object.assign({ v: CR_PERSIST_VER, at: Date.now() }, data || {});
      if (prev && Number(prev.v || 0) >= 1 && (payload.phase === "done" || payload.phase === "running")) {
        if (!payload.report && prev.report) payload.report = prev.report;
        if (!payload.log && prev.log) payload.log = prev.log;
      }
      payload.report = crPersistClip(payload.report, CR_PERSIST_MAX_REPORT);
      payload.log = crPersistClip(payload.log, 4e4);
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e0) {
    }
  }
  function crPersistSaveCard(block, sessionId, callIdProp, data) {
    var callId = crBlockCallId(block, callIdProp) || data && data.callId || "";
    var aliases = crPersistKeyAliases(block, sessionId, callIdProp);
    var payload = Object.assign({}, data || {}, {
      callId,
      sessionId: crBlockSessionId(block, sessionId) || data && data.sessionId || ""
    });
    aliases.forEach(function(k) {
      crPersistSave(k, payload);
    });
    if (callId) {
      var sid = crBlockSessionId(block, sessionId);
      ["wb-cr-card:anon"].concat(sid ? ["wb-cr-card:" + sid, "wb-cr-card:session:" + sid + ":lone"] : []).forEach(function(sharedKey) {
        try {
          var old = crPersistLoad(sharedKey);
          if (old && (old.phase === "done" || old.phase === "running")) {
            localStorage.removeItem(sharedKey);
          }
        } catch (eClr) {
        }
      });
    }
    return aliases[0];
  }
  function crPersistClearCard(block, sessionId, callIdProp) {
    crPersistKeyAliases(block, sessionId, callIdProp).forEach(function(k) {
      try {
        localStorage.removeItem(k);
      } catch (e1) {
      }
    });
  }
  function CodeReviewBeginCard(props) {
    ensureCss();
    var block = props.block;
    var toolCallId = String(props.callId || crBlockCallId(block, "") || "").trim();
    var wb = useMemo(function() {
      return readMeta(block);
    }, [block]);
    var ui = wb && wb.ui || {};
    var dshCwd = resolveDshCwd(props);
    var persistBoot = useMemo(
      function() {
        return crPersistLoadForCard(block, props.sessionId, toolCallId);
      },
      [block, props.sessionId, toolCallId]
    );
    var bootSavedRaw = persistBoot.saved && crPersistBelongsToCall(persistBoot.saved, toolCallId) ? persistBoot.saved : null;
    var bootSaved = bootSavedRaw && !crPickMustStayPick(wb, ui, bootSavedRaw, toolCallId) ? bootSavedRaw : null;
    var _phase = useState(function() {
      return bootSaved && bootSaved.phase || "dir";
    });
    var phase = _phase[0];
    var setPhase = _phase[1];
    var _ws = useState(function() {
      return bootSaved && bootSaved.workspace || initialWorkspace(props, ui);
    });
    var workspace = _ws[0];
    var setWorkspace = _ws[1];
    var _scope = useState(function() {
      return bootSaved && bootSaved.scope || String(ui.scope || "");
    });
    var scope = _scope[0];
    var setScope = _scope[1];
    var _focus = useState(function() {
      return bootSaved && bootSaved.focus || String(ui.focus || "");
    });
    var focus = _focus[0];
    var setFocus = _focus[1];
    var _err = useState(function() {
      return bootSaved && bootSaved.err || "";
    });
    var err = _err[0];
    var setErr = _err[1];
    var _busy = useState(false);
    var busy = _busy[0];
    var setBusy = _busy[1];
    var _files = useState(function() {
      return bootSaved && bootSaved.files || [];
    });
    var files = _files[0];
    var setFiles = _files[1];
    var _sample = useState(function() {
      return bootSaved && bootSaved.sample || [];
    });
    var sample = _sample[0];
    var setSample = _sample[1];
    var _selected = useState(function() {
      return bootSaved && bootSaved.selected || {};
    });
    var selected = _selected[0];
    var setSelected = _selected[1];
    var _count = useState(function() {
      return bootSaved && bootSaved.count || 0;
    });
    var count = _count[0];
    var setCount = _count[1];
    var _log = useState(function() {
      return bootSaved && bootSaved.log || "";
    });
    var log = _log[0];
    var setLog = _log[1];
    var _report = useState(function() {
      return bootSaved && bootSaved.report || "";
    });
    var report = _report[0];
    var setReport = _report[1];
    var _pathTicket = useState(function() {
      return bootSaved && bootSaved.pathTicket || "";
    });
    var pathTicket = _pathTicket[0];
    var setPathTicket = _pathTicket[1];
    var suggestions = typeof mergeWorkspaceSuggestions === "function" ? mergeWorkspaceSuggestions(ui.suggestions, dshCwd, props.home) : Array.isArray(ui.suggestions) ? ui.suggestions : [];
    function crSnapshotPersist(extra) {
      if (phase === "dir" && !(extra && extra.forceReset)) return;
      crPersistSaveCard(
        block,
        props.sessionId,
        toolCallId,
        Object.assign(
          {
            phase,
            callId: toolCallId,
            sessionId: crBlockSessionId(block, props.sessionId),
            workspace,
            scope,
            focus,
            files,
            sample,
            selected,
            count,
            log,
            report,
            pathTicket,
            err
          },
          extra || {}
        )
      );
    }
    function crResetCard() {
      crPersistClearCard(block, props.sessionId, toolCallId);
      setPhase("dir");
      setErr("");
      setLog("");
      setReport("");
      setFiles([]);
      setSelected({});
      setPathTicket("");
    }
    useEffect(
      function() {
        if (phase === "files" || phase === "running" || phase === "done") {
          crSnapshotPersist();
        }
      },
      [phase, workspace, scope, focus, files, selected, count, log, report, pathTicket, err]
    );
    useEffect(
      function() {
        if (dshCwd && !String(workspace || "").trim()) setWorkspace(dshCwd);
      },
      [dshCwd]
    );
    if (!wb || wb.t !== "cr-pick") {
      var out = block && "kind" in block ? (block.content || []).map(function(c) {
        return c && c.type === "text" ? c.text : "";
      }).filter(Boolean).join("\n") : "\u5BA1\u7801\u8FDB\u884C\u4E2D\u2026";
      return h(
        "div",
        { className: "wb-cr" },
        h("div", { className: "wb-cr-head" }, h("span", { className: "wb-cr-badge" }, "\u4EE3\u7801\u5BA1\u6838"), h("span", { className: "wb-cr-hint" }, "\u7ED3\u679C")),
        h("div", { className: "wb-cr-body" }, h("pre", { className: "wb-cr-progress", style: { margin: 0 } }, out || "\uFF08\u65E0\u8BE6\u60C5\uFF09"))
      );
    }
    function browse() {
      setBusy(true);
      setErr("\u8BF7\u5728\u5F39\u51FA\u7684\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u4E2D\u9009\u62E9\u76EE\u5F55\uFF08\u82E5\u770B\u4E0D\u5230\uFF0C\u8BF7\u770B Dock / \u5176\u5B83\u7A97\u53E3\u540E\u9762\uFF09");
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function() {
        try {
          if (ctrl) ctrl.abort();
        } catch (e0) {
        }
      }, 12e4);
      pickLocalFolder("\u9009\u62E9\u8981\u5BA1\u6838\u7684\u5DE5\u7A0B\u76EE\u5F55", ctrl ? ctrl.signal : void 0).then(function(d) {
        if (d && d.ok && d.path) {
          setWorkspace(d.path);
          setErr("");
        } else if (d && d.error && d.error !== "\u5DF2\u53D6\u6D88\u9009\u62E9") {
          setErr(d.error || "\u9009\u6587\u4EF6\u5939\u5931\u8D25");
        } else {
          setErr("");
        }
      }).catch(function(e) {
        setErr(
          e && e.name === "AbortError" ? "\u9009\u62E9\u8D85\u65F6\uFF1A\u8BF7\u70B9\u5E38\u7528\u8DEF\u5F84\u6216\u624B\u52A8\u7C98\u8D34\u76EE\u5F55" : "\u6D4F\u89C8\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e)
        );
      }).finally(function() {
        clearTimeout(timer);
        setBusy(false);
      });
    }
    function goList() {
      var local_path = String(workspace || "").trim();
      if (!local_path) {
        setErr("\u8BF7\u586B\u5199\u6216\u6D4F\u89C8\u9009\u62E9\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55");
        return;
      }
      setBusy(true);
      setErr("\u6B63\u5728\u5217\u51FA\u53EF\u5BA1\u6587\u4EF6\u2026");
      fetch(engineBase() + "/api/code-review/list", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ local_path, scope: String(scope || "").trim() })
      }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (!d || !d.ok) {
          setErr(d && (d.detail || d.reply) || "\u5217\u6587\u4EF6\u5931\u8D25");
          setBusy(false);
          return;
        }
        var list = Array.isArray(d.files) ? d.files : [];
        var samp = Array.isArray(d.sample_selected) ? d.sample_selected : [];
        var paths = [];
        var seen = {};
        var sel = {};
        function add(p, check) {
          var rel = typeof p === "string" ? p : p && p.path || "";
          if (!rel || seen[rel]) return;
          seen[rel] = true;
          paths.push(rel);
          if (check) sel[rel] = true;
        }
        samp.forEach(function(p) {
          add(p, true);
        });
        list.forEach(function(p) {
          add(p, false);
        });
        setFiles(paths.slice(0, 80));
        setSample(
          samp.map(function(p) {
            return typeof p === "string" ? p : p && p.path || "";
          }).filter(Boolean)
        );
        setSelected(sel);
        setCount(d.count || paths.length);
        if (d.local_path) setWorkspace(String(d.local_path));
        setPathTicket(String(d.path_ticket || ""));
        setPhase("files");
        setErr("");
        setBusy(false);
      }).catch(function(e) {
        setErr("\u5217\u6587\u4EF6\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
        setBusy(false);
      });
    }
    function toggle(rel) {
      setSelected(function(prev) {
        var next = Object.assign({}, prev);
        if (next[rel]) delete next[rel];
        else next[rel] = true;
        return next;
      });
    }
    function selectedList() {
      return Object.keys(selected).filter(function(k) {
        return selected[k];
      });
    }
    function runReview(fileList) {
      var local_path = String(workspace || "").trim();
      var ticket = String(pathTicket || "").trim();
      if (!ticket) {
        setErr("\u7F3A\u5C11 path_ticket\uFF1A\u8BF7\u91CD\u65B0\u5217\u51FA\u6587\u4EF6\u540E\u518D\u5F00\u59CB\u5BA1\u6838");
        return;
      }
      setPhase("running");
      setBusy(true);
      setErr("");
      setLog("\u6B63\u5728\u5BA1\u6838\u2026\n");
      setReport("");
      var reportAcc = "";
      var logAcc = "\u6B63\u5728\u5BA1\u6838\u2026\n";
      var flushTimer = null;
      var finished = false;
      function flushUi() {
        flushTimer = null;
        setLog(logAcc);
        setReport(reportAcc);
      }
      function scheduleFlush() {
        if (flushTimer != null) return;
        flushTimer = setTimeout(flushUi, 150);
      }
      fetch(engineBase() + "/api/code-review/run/stream", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
        body: JSON.stringify({
          local_path,
          scope: String(scope || "").trim(),
          focus: String(focus || "").trim(),
          files: fileList && fileList.length ? fileList : null,
          path_ticket: ticket,
          ui_session_id: crBlockSessionId(block, props.sessionId) || ""
        })
      }).then(function(r) {
        if (!r.ok) {
          return r.json().catch(function() {
            return {};
          }).then(function(j) {
            finished = true;
            setPhase("done");
            setBusy(false);
            setErr(j && (j.detail || j.reply) || "HTTP " + r.status);
          });
        }
        var reader = r.body.getReader();
        var decoder = new TextDecoder();
        var pending = "";
        function onEvent(ev) {
          if (!ev || typeof ev !== "object") return;
          if (ev.type === "step" || ev.type === "status") {
            var line = ev.title || ev.detail || ev.text || ev.id || "";
            if (line) {
              logAcc += line + "\n";
              scheduleFlush();
            }
          } else if (ev.type === "token") {
            if (typeof ev.text === "string") reportAcc = ev.text;
            else if (typeof ev.delta === "string") reportAcc += ev.delta;
            scheduleFlush();
          } else if (ev.type === "done" || ev.type === "error" || ev.ok === true || ev.ok === false) {
            finished = true;
            if (flushTimer != null) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            if (ev.reply) reportAcc = ev.reply;
            flushUi();
            setPhase("done");
            setBusy(false);
            if (ev.ok === false || ev.type === "error") {
              setErr(ev.detail || ev.message || ev.reply || "\u5BA1\u6838\u5931\u8D25");
            } else {
              setErr("");
            }
          }
        }
        function pump() {
          return reader.read().then(function(res) {
            if (res.done) {
              if (flushTimer != null) {
                clearTimeout(flushTimer);
                flushTimer = null;
              }
              flushUi();
              if (!finished) {
                setBusy(false);
                setPhase("done");
                if (!reportAcc) setErr("\u6D41\u5F0F\u7ED3\u675F\u4F46\u672A\u6536\u5230\u5B8C\u6210\u4E8B\u4EF6");
              }
              return;
            }
            pending += decoder.decode(res.value, { stream: true });
            var chunks = pending.split("\n\n");
            pending = chunks.pop() || "";
            chunks.forEach(function(block2) {
              block2.split("\n").forEach(function(line) {
                if (line.indexOf("data:") !== 0) return;
                var raw = line.slice(5).trim();
                if (!raw) return;
                try {
                  onEvent(JSON.parse(raw));
                } catch (e1) {
                }
              });
            });
            return pump();
          });
        }
        return pump();
      }).catch(function(e) {
        finished = true;
        setPhase("done");
        setBusy(false);
        setErr("\u8BF7\u6C42\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
      });
    }
    if (phase === "running" || phase === "done") {
      var reportView = report;
      if (phase === "running" && report && report.length > 3500) {
        reportView = "\u2026\uFF08\u62A5\u544A\u751F\u6210\u4E2D\uFF0C\u5DF2 " + report.length + " \u5B57\uFF0C\u5B8C\u6210\u540E\u663E\u793A\u5168\u6587\uFF09\n\n" + report.slice(-2800);
      }
      return h(
        "div",
        { className: "wb-cr" },
        h(
          "div",
          { className: "wb-cr-head" },
          h("span", { className: "wb-cr-badge" }, "\u4EE3\u7801\u5BA1\u6838"),
          h("span", { className: "wb-cr-hint" }, (phase === "running" ? "\u8FDB\u884C\u4E2D\uFF08\u52FF\u91CD\u590D\u70B9\u51FB\uFF09" : "\u5B8C\u6210") + " \xB7 " + CR_UI_REV)
        ),
        h(
          "div",
          { className: "wb-cr-body" },
          h("p", { className: "wb-cr-sum" }, "\u8DEF\u5F84\uFF1A" + workspace),
          log ? h("pre", { className: "wb-cr-progress" }, log) : null,
          reportView ? h("pre", { className: "wb-cr-progress", style: { maxHeight: phase === "done" ? "420px" : "220px" } }, reportView) : phase === "running" ? h("p", { className: "wb-cr-sum" }, "\u6B63\u5728\u5BA1\u67E5\u6E90\u7801\uFF0C\u8BF7\u7A0D\u5019\u2026") : null,
          err ? h("p", { className: "wb-cr-err" }, err) : null,
          phase === "done" ? h(
            "div",
            { className: "wb-cr-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: crResetCard
              },
              "\u91CD\u65B0\u9009\u62E9"
            )
          ) : null
        )
      );
    }
    if (phase === "files") {
      var sampleSet = {};
      sample.forEach(function(p) {
        sampleSet[p] = true;
      });
      return h(
        "div",
        { className: "wb-cr" },
        h(
          "div",
          { className: "wb-cr-head" },
          h("span", { className: "wb-cr-badge" }, "\u4EE3\u7801\u5BA1\u6838"),
          h("span", { className: "wb-cr-hint" }, "\u52FE\u9009\u6587\u4EF6")
        ),
        h(
          "div",
          { className: "wb-cr-body" },
          h(
            "p",
            { className: "wb-cr-sum" },
            workspace + " \xB7 \u5171 " + count + " \u4E2A\u53EF\u5BA1\uFF0C\u5C55\u793A " + files.length
          ),
          h(
            "div",
            { className: "wb-cr-actions", style: { marginTop: 0 } },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  var next = {};
                  sample.forEach(function(p) {
                    next[p] = true;
                  });
                  setSelected(next);
                }
              },
              "\u52FE\u9009\u9ED8\u8BA4\u62BD\u6837"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  var next = {};
                  files.forEach(function(p) {
                    next[p] = true;
                  });
                  setSelected(next);
                }
              },
              "\u5168\u9009\u5F53\u524D\u5217\u8868"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  setSelected({});
                }
              },
              "\u6E05\u7A7A"
            )
          ),
          h(
            "div",
            { className: "wb-cr-files" },
            files.length ? files.map(function(rel) {
              return h(
                "label",
                { key: rel, className: "wb-cr-file" },
                h("input", {
                  type: "checkbox",
                  checked: !!selected[rel],
                  onChange: function() {
                    toggle(rel);
                  }
                }),
                h("span", null, rel + (sampleSet[rel] ? " \xB7 \u62BD\u6837" : ""))
              );
            }) : h("p", { className: "wb-cr-sum" }, "\u6CA1\u6709\u53EF\u5BA1\u6587\u4EF6\uFF0C\u53EF\u7528\u9ED8\u8BA4\u62BD\u6837\u5F00\u5BA1\u3002")
          ),
          err ? h("p", { className: "wb-cr-err" }, err) : null,
          h(
            "div",
            { className: "wb-cr-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                disabled: busy,
                onClick: function() {
                  setPhase("dir");
                  setErr("");
                }
              },
              "\u8FD4\u56DE\u6539\u76EE\u5F55"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn primary",
                disabled: busy,
                onClick: function() {
                  var sel = selectedList();
                  if (!sel.length) {
                    setErr("\u8BF7\u81F3\u5C11\u52FE\u9009\u4E00\u4E2A\u6587\u4EF6\uFF0C\u6216\u70B9\u300C\u4E0D\u9009\u6587\u4EF6\xB7\u9ED8\u8BA4\u62BD\u6837\u300D");
                    return;
                  }
                  runReview(sel);
                }
              },
              "\u5F00\u59CB\u5BA1\u6838\u6240\u9009"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn primary",
                disabled: busy,
                onClick: function() {
                  runReview(null);
                }
              },
              "\u4E0D\u9009\u6587\u4EF6\xB7\u9ED8\u8BA4\u62BD\u6837"
            )
          )
        )
      );
    }
    return h(
      "div",
      { className: "wb-cr" },
      h(
        "div",
        { className: "wb-cr-head" },
        h("span", { className: "wb-cr-badge" }, "\u4EE3\u7801\u5BA1\u6838"),
        h("span", { className: "wb-cr-hint" }, "\u9009\u62E9\u76EE\u5F55 \xB7 \u4E0B\u4E00\u6B65\u52FE\u9009\u6587\u4EF6 \xB7 " + CR_UI_REV)
      ),
      h(
        "div",
        { className: "wb-cr-body" },
        h("p", { className: "wb-cr-sum" }, "\u5728\u4E3B\u804A\u5929\u5DE5\u5177\u5361\u91CC\u9009\u76EE\u5F55\u4E0E\u6587\u4EF6\uFF08\u4E0D\u662F\u7B54\u9898\u58F3\u3001\u4E5F\u4E0D\u662F\u6D6E\u5C42\u9762\u677F\uFF09\u3002"),
        h(WorkspaceMismatchHint, {
          dshCwd,
          workspace,
          home: props.home,
          onUseDsh: function() {
            setWorkspace(dshCwd);
          }
        }),
        h(
          "label",
          { className: "wb-cr-label" },
          typeof workspaceDirFieldLabel === "function" ? workspaceDirFieldLabel() : "\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55"
        ),
        typeof workspaceDirFieldHint === "function" && workspaceDirFieldHint() ? h("p", { className: "wb-cr-dsh", style: { margin: "0 0 6px" } }, workspaceDirFieldHint()) : null,
        h(
          "div",
          { className: "wb-cr-row" },
          h("input", {
            className: "wb-cr-input",
            value: workspace,
            placeholder: "/Users/\u4F60/\u9879\u76EE",
            onChange: function(e) {
              setWorkspace(e.target.value);
            }
          }),
          h(
            "button",
            { type: "button", className: "wb-cr-btn", disabled: busy, onClick: browse },
            busy ? "\u9009\u62E9\u4E2D\u2026" : "\u6D4F\u89C8\u2026"
          )
        ),
        suggestions.length ? h(
          "div",
          { className: "wb-cr-chips" },
          suggestions.map(function(s, i) {
            var p = typeof s === "string" ? s : s && s.path || "";
            var lab = typeof s === "object" && s.label ? s.label + " \xB7 " : "";
            if (!p) return null;
            return h(
              "button",
              {
                key: i + p,
                type: "button",
                className: "wb-cr-chip",
                title: p,
                onClick: function() {
                  setWorkspace(p);
                }
              },
              lab + p
            );
          })
        ) : null,
        h("label", { className: "wb-cr-label" }, "\u8303\u56F4\uFF08\u53EF\u9009\uFF0C\u76F8\u5BF9\u5B50\u8DEF\u5F84\uFF09"),
        h("input", {
          className: "wb-cr-input",
          style: { width: "100%", marginBottom: 10, boxSizing: "border-box" },
          value: scope,
          placeholder: "\u5982 frontend/src",
          onChange: function(e) {
            setScope(e.target.value);
          }
        }),
        h("label", { className: "wb-cr-label" }, "\u5BA1\u67E5\u91CD\u70B9\uFF08\u53EF\u9009\uFF09"),
        h("input", {
          className: "wb-cr-input",
          style: { width: "100%", marginBottom: 10, boxSizing: "border-box" },
          value: focus,
          placeholder: "\u5982 SQL \u6CE8\u5165\u3001\u6743\u9650\u6821\u9A8C",
          onChange: function(e) {
            setFocus(e.target.value);
          }
        }),
        err ? h("p", { className: "wb-cr-err" }, err) : null,
        h(
          "div",
          { className: "wb-cr-actions" },
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn primary",
              disabled: busy,
              onClick: goList
            },
            busy ? "\u5217\u51FA\u6587\u4EF6\u2026" : "\u4E0B\u4E00\u6B65\uFF1A\u9009\u6587\u4EF6"
          )
        )
      )
    );
  }
  ctx.CodeReviewBeginCard = CodeReviewBeginCard;
}

// client-src/lanes/code-commit.js
function installCodeCommit(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, workspaceDirFieldLabel = ctx.workspaceDirFieldLabel, workspaceDirFieldHint = ctx.workspaceDirFieldHint, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, mergeWorkspaceSuggestions = ctx.mergeWorkspaceSuggestions, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  function ccTailName(path) {
    var s = String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
    var slash = s.lastIndexOf("/");
    return slash >= 0 ? s.slice(slash + 1) : s || "\u2014";
  }
  function ccRedactRemoteUrl(url) {
    var u = String(url || "").trim();
    if (!u) return "";
    try {
      if (/^https?:\/\//i.test(u)) {
        var parsed = new URL(u);
        if (parsed.username || parsed.password) {
          parsed.username = "";
          parsed.password = "";
          return parsed.toString();
        }
      }
    } catch (_e) {
    }
    return u.replace(/^(https?:\/\/)([^/@\s]+)@/i, "$1");
  }
  function ccSanitizeCommitDetail(detail) {
    if (!detail || typeof detail !== "object") return detail;
    var out = Object.assign({}, detail);
    if (out.push && typeof out.push === "object") {
      out.push = Object.assign({}, out.push, {
        remote_url: ccRedactRemoteUrl(out.push.remote_url || "")
      });
    }
    return out;
  }
  function ccCommitRemoteLabel(didPush, pushInfo) {
    if (!didPush) return "\u4EC5\u672C\u5730\u63D0\u4EA4\uFF08\u672A push\uFF09";
    if (pushInfo && pushInfo.ok) {
      var remote = String(pushInfo.remote || "origin");
      var url = ccRedactRemoteUrl(pushInfo.remote_url || "");
      return url ? "\u5DF2\u63A8\u9001\u5230 " + remote + " \xB7 " + url : "\u5DF2\u63A8\u9001\u5230 " + remote;
    }
    return "\u63A8\u9001\u5931\u8D25";
  }
  var CC_PERSIST_VER = 1;
  var CC_UI_REV = "2026-09-10o-cc-contract";
  function ccBlockCallId(block, callIdProp) {
    if (callIdProp != null && String(callIdProp).trim()) return String(callIdProp).trim();
    if (!block) return "";
    var nested = block.call && typeof block.call === "object" ? block.call : null;
    return String(
      block.callId || block.toolCallId || nested && (nested.callId || nested.toolCallId || nested.id) || block.id || ""
    ).trim();
  }
  function ccBlockSessionId(block, sessionId) {
    return String(
      sessionId || block && (block.threadId || block.thread_id || block.sessionId || block.session_id || block.conversationId || "") || ""
    ).trim();
  }
  function ccPersistKey(block, sessionId, callIdProp) {
    var callId = ccBlockCallId(block, callIdProp);
    var sid = ccBlockSessionId(block, sessionId);
    if (callId && sid) return "wb-cc-card:" + sid + ":" + callId;
    if (callId) return "wb-cc-card:call:" + callId;
    if (sid) return "wb-cc-card:session:" + sid + ":lone";
    return "wb-cc-card:anon";
  }
  function ccPersistKeyAliases(block, sessionId, callIdProp) {
    var callId = ccBlockCallId(block, callIdProp);
    var sid = ccBlockSessionId(block, sessionId);
    var keys = [ccPersistKey(block, sessionId, callIdProp)];
    if (callId) {
      keys.push("wb-cc-card:call:" + callId, "wb-cc-card:block:" + callId);
      if (sid) keys.push("wb-cc-card:" + sid + ":" + callId);
    } else if (sid) {
      keys.push("wb-cc-card:" + sid, "wb-cc-card:session:" + sid + ":lone");
    } else {
      keys.push("wb-cc-card:anon");
    }
    var uniq = [];
    var seen = {};
    keys.forEach(function(k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      uniq.push(k);
    });
    return uniq;
  }
  function ccPersistBelongsToCall(saved, callId) {
    if (!saved || typeof saved !== "object") return false;
    var cid = String(callId || "").trim();
    if (!cid) return false;
    var savedCid = String(saved.callId || "").trim();
    if (!savedCid) return false;
    return savedCid === cid;
  }
  function ccPickMustStayPick(wb, ui, saved, callId) {
    var cid = String(callId || "").trim();
    if (saved && cid && ccPersistBelongsToCall(saved, callId)) {
      var phase = String(saved.phase || "");
      if (phase === "done" || phase === "confirm" || phase === "blocked" || phase === "files" || phase === "gating" || saved.jobId) {
        return false;
      }
    }
    var isPick = ui && String(ui.kind || "") === "pick" || wb && wb.t === "cc-pick";
    if (!isPick && wb && wb.t && String(wb.t).indexOf("cc-") === 0 && wb.t !== "cc-pick") {
      return false;
    }
    if (!isPick && wb && wb.t) return false;
    if (!saved) return true;
    if (!cid) return true;
    return !ccPersistBelongsToCall(saved, callId);
  }
  function ccPersistScanByCallId(callId) {
    var cid = String(callId || "").trim();
    if (!cid) return null;
    var best = null;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("wb-cc-card:") !== 0) continue;
        var hitKey = k === "wb-cc-card:call:" + cid || k === "wb-cc-card:block:" + cid || k.slice(-cid.length - 1) === ":" + cid;
        var o = null;
        try {
          o = ccPersistNormalize(JSON.parse(localStorage.getItem(k) || "null"));
        } catch (e1) {
          continue;
        }
        if (!o) continue;
        if (!hitKey && String(o.callId || "") !== cid) continue;
        if (!(o.phase === "done" || o.phase === "confirm" || o.phase === "blocked" || o.phase === "files" || o.phase === "gating" || o.jobId)) {
          continue;
        }
        if (!best || Number(o.at || 0) > Number(best.at || 0)) best = o;
      }
    } catch (e2) {
    }
    return best;
  }
  function ccPersistNormalize(o) {
    if (!o || typeof o !== "object") return null;
    if (Number(o.v || 0) < 1) return null;
    return o;
  }
  function ccPersistLoad(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return ccPersistNormalize(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }
  function ccPersistLoadForCard(block, sessionId, callIdProp) {
    try {
      var callId = ccBlockCallId(block, callIdProp);
      var key = ccPersistKey(block, sessionId, callIdProp);
      var aliases = ccPersistKeyAliases(block, sessionId, callIdProp);
      for (var i = 0; i < aliases.length; i++) {
        var hit = ccPersistLoad(aliases[i]);
        if (hit && ccPersistBelongsToCall(hit, callId) && (hit.phase === "done" || hit.phase === "confirm" || hit.phase === "blocked" || hit.phase === "files" || hit.phase === "gating" || hit.jobId)) {
          return { key, saved: hit, migrateFrom: aliases[i] !== key ? aliases[i] : "" };
        }
      }
      var scanned = ccPersistScanByCallId(callId);
      if (scanned && ccPersistBelongsToCall(scanned, callId)) {
        return { key, saved: scanned, migrateFrom: "" };
      }
      return { key, saved: null };
    } catch (eLoad) {
      return { key: ccPersistKey(block, sessionId, callIdProp), saved: null };
    }
  }
  function ccPersistSave(key, data) {
    try {
      var prev = null;
      try {
        prev = JSON.parse(localStorage.getItem(key) || "null");
      } catch (ePrev) {
      }
      if (prev && Number(prev.v || 0) >= 1 && prev.phase === "done" && data && data.phase === "dir" && !data.forceReset) {
        return;
      }
      var payload = Object.assign({ v: CC_PERSIST_VER, at: Date.now() }, data || {});
      if (prev && Number(prev.v || 0) >= 1 && (payload.phase === "done" || prev.phase === "done")) {
        if (!payload.commitDetail && prev.commitDetail) payload.commitDetail = prev.commitDetail;
        if (!payload.result && prev.result) payload.result = prev.result;
        if (!payload.jobId && prev.jobId) payload.jobId = prev.jobId;
      }
      if (payload.commitDetail) {
        payload.commitDetail = ccSanitizeCommitDetail(payload.commitDetail);
      }
      if (payload.lastPush && typeof payload.lastPush === "object") {
        payload.lastPush = Object.assign({}, payload.lastPush, {
          remote_url: ccRedactRemoteUrl(payload.lastPush.remote_url || "")
        });
      }
      localStorage.setItem(key, JSON.stringify(payload));
      if (payload.jobId && payload.phase === "done") {
        try {
          localStorage.setItem(
            "wb-cc-job:" + String(payload.jobId),
            JSON.stringify({
              v: CC_PERSIST_VER,
              at: Date.now(),
              jobId: payload.jobId,
              callId: payload.callId || "",
              commitDetail: payload.commitDetail || null,
              result: payload.result || "",
              lastPush: payload.lastPush
            })
          );
        } catch (eJob) {
        }
      }
    } catch (e0) {
    }
  }
  function ccPersistSaveCard(block, sessionId, callIdProp, data) {
    var callId = ccBlockCallId(block, callIdProp) || data && data.callId || "";
    var aliases = ccPersistKeyAliases(block, sessionId, callIdProp);
    var payload = Object.assign({}, data || {}, {
      callId,
      sessionId: ccBlockSessionId(block, sessionId) || data && data.sessionId || ""
    });
    aliases.forEach(function(k) {
      ccPersistSave(k, payload);
    });
    if (callId) {
      var sid = ccBlockSessionId(block, sessionId);
      ["wb-cc-card:anon"].concat(sid ? ["wb-cc-card:" + sid, "wb-cc-card:session:" + sid + ":lone"] : []).forEach(function(sharedKey) {
        try {
          var old = ccPersistLoad(sharedKey);
          if (old && (old.phase === "done" || old.jobId)) {
            localStorage.removeItem(sharedKey);
          }
        } catch (eClr) {
        }
      });
    }
    return aliases[0];
  }
  function ccPersistClearCard(block, sessionId, callIdProp) {
    ccPersistKeyAliases(block, sessionId, callIdProp).forEach(function(k) {
      try {
        localStorage.removeItem(k);
      } catch (e1) {
      }
    });
  }
  function ccDetailFromEngineJob(job) {
    if (!job || typeof job !== "object") return null;
    var cr = job.commit_result || {};
    var pushInfo = cr.push || {};
    var st = String(job.status || "");
    var ok = st === "done" && !!cr.commit;
    var pushRetry = st === "done" && !!cr.commit && job.push !== false && pushInfo && !pushInfo.ok;
    return {
      ok: ok && !pushRetry,
      job_id: job.id,
      workspace: job.workspace,
      message: job.message || cr.message || "",
      files: job.files || cr.files || [],
      commit_result: cr,
      push_retry_needed: pushRetry,
      status: st
    };
  }
  function CodeCommitBeginCard(props) {
    ensureCss();
    var block = props.block;
    var toolCallId = String(props.callId || ccBlockCallId(block, "") || "").trim();
    var wb = useMemo(function() {
      return readMeta(block);
    }, [block]);
    var ui = wb && wb.ui || {};
    var dshCwd = resolveDshCwd(props);
    var persistBoot = useMemo(
      function() {
        return ccPersistLoadForCard(block, props.sessionId, toolCallId);
      },
      [block, props.sessionId, toolCallId]
    );
    var persistKey = persistBoot.key;
    var bootSavedRaw = persistBoot.saved && ccPersistBelongsToCall(persistBoot.saved, toolCallId) ? persistBoot.saved : null;
    var bootSaved = null;
    if (bootSavedRaw && !ccPickMustStayPick(wb, ui, bootSavedRaw, toolCallId)) {
      bootSaved = bootSavedRaw;
    }
    var _phase = useState(function() {
      return bootSaved && bootSaved.phase || "dir";
    });
    var phase = _phase[0];
    var setPhase = _phase[1];
    var _ws = useState(function() {
      return bootSaved && bootSaved.workspace || initialWorkspace(props, ui);
    });
    var workspace = _ws[0];
    var setWorkspace = _ws[1];
    var _branch = useState(function() {
      return bootSaved && bootSaved.branch || String(ui.work_branch || "");
    });
    var branch = _branch[0];
    var setBranch = _branch[1];
    var _branchHint = useState(function() {
      return bootSaved && bootSaved.branchHint || String(ui.branch_hint || "");
    });
    var branchHint = _branchHint[0];
    var setBranchHint = _branchHint[1];
    var _err = useState("");
    var err = _err[0];
    var setErr = _err[1];
    var _busy = useState(false);
    var busy = _busy[0];
    var setBusy = _busy[1];
    var _files = useState(function() {
      return bootSaved && bootSaved.files || [];
    });
    var files = _files[0];
    var setFiles = _files[1];
    var _selected = useState(function() {
      return bootSaved && bootSaved.selected || {};
    });
    var selected = _selected[0];
    var setSelected = _selected[1];
    var _draft = useState(function() {
      return bootSaved && bootSaved.draft || "";
    });
    var draft = _draft[0];
    var setDraft = _draft[1];
    var _push = useState(function() {
      return bootSaved && bootSaved.push != null ? !!bootSaved.push : ui.default_push !== false;
    });
    var push = _push[0];
    var setPush = _push[1];
    var _jobId = useState(function() {
      return bootSaved && bootSaved.jobId || "";
    });
    var jobId = _jobId[0];
    var setJobId = _jobId[1];
    var _findings = useState(function() {
      return bootSaved && bootSaved.findings || [];
    });
    var findings = _findings[0];
    var setFindings = _findings[1];
    var _summary = useState(function() {
      return bootSaved && bootSaved.summary || "";
    });
    var summary = _summary[0];
    var setSummary = _summary[1];
    var _result = useState(function() {
      return bootSaved && bootSaved.result || "";
    });
    var result = _result[0];
    var setResult = _result[1];
    var _commitDetail = useState(function() {
      return bootSaved && bootSaved.commitDetail || null;
    });
    var commitDetail = _commitDetail[0];
    var setCommitDetail = _commitDetail[1];
    var _lastPush = useState(function() {
      return bootSaved && bootSaved.lastPush != null ? !!bootSaved.lastPush : true;
    });
    var lastPush = _lastPush[0];
    var setLastPush = _lastPush[1];
    var restoreOnceRef = useRef(false);
    var suggestions = typeof mergeWorkspaceSuggestions === "function" ? mergeWorkspaceSuggestions(ui.suggestions, dshCwd, props.home) : Array.isArray(ui.suggestions) ? ui.suggestions : [];
    function ccSnapshotPersist(extra) {
      if (phase === "dir" && !(extra && extra.forceReset)) return;
      var cidSave = ccResolveCallId();
      ccPersistSaveCard(
        block,
        props.sessionId,
        cidSave,
        Object.assign(
          {
            phase,
            callId: cidSave,
            sessionId: ccBlockSessionId(block, props.sessionId),
            workspace,
            branch,
            branchHint,
            files,
            selected,
            draft,
            push,
            jobId,
            findings,
            summary,
            result,
            commitDetail,
            lastPush
          },
          extra || {}
        )
      );
    }
    function ccResetCard() {
      ccPersistClearCard(block, props.sessionId, toolCallId);
      try {
        var jidClr = String(jobId || commitDetail && commitDetail.job_id || "").trim();
        if (jidClr) localStorage.removeItem("wb-cc-job:" + jidClr);
      } catch (eClr) {
      }
      setPhase("dir");
      setErr("");
      setResult("");
      setSummary("");
      setFindings([]);
      setCommitDetail(null);
      setJobId("");
      setFiles([]);
      setSelected({});
    }
    function ccResolveCallId() {
      return String(props.callId || ccBlockCallId(block, toolCallId) || toolCallId || "").trim();
    }
    useEffect(
      function() {
        if (phase === "files" || phase === "confirm" || phase === "blocked" || phase === "done" || phase === "gating") {
          ccSnapshotPersist();
        }
      },
      [
        phase,
        workspace,
        branch,
        files,
        selected,
        draft,
        push,
        jobId,
        findings,
        summary,
        result,
        commitDetail,
        lastPush
      ]
    );
    useEffect(
      function() {
        if (restoreOnceRef.current) return;
        restoreOnceRef.current = true;
        var cid = ccResolveCallId();
        if (!cid) return;
        if (ccPickMustStayPick(wb, ui, bootSavedRaw, cid)) {
          var sidClr = ccBlockSessionId(block, props.sessionId);
          ["wb-cc-card:anon"].concat(
            sidClr ? ["wb-cc-card:" + sidClr, "wb-cc-card:session:" + sidClr + ":lone"] : []
          ).forEach(function(sharedKey) {
            try {
              localStorage.removeItem(sharedKey);
            } catch (eRm) {
            }
          });
          return;
        }
        var saved = bootSaved;
        if (!saved || saved.phase !== "done" || !saved.jobId) return;
        if (saved.commitDetail) return;
        try {
          var snapRaw = localStorage.getItem("wb-cc-job:" + String(saved.jobId));
          if (snapRaw) {
            var snap = JSON.parse(snapRaw);
            if (snap && snap.commitDetail) {
              setCommitDetail(snap.commitDetail);
              if (snap.result) setResult(String(snap.result));
              if (snap.lastPush != null) setLastPush(!!snap.lastPush);
              return;
            }
          }
        } catch (eSnap) {
        }
        fetch(engineBase() + "/api/code-commit/jobs/" + encodeURIComponent(String(saved.jobId)), {
          headers: authHeaders()
        }).then(function(r) {
          return r.json();
        }).then(function(jd) {
          if (!jd || !jd.ok || !jd.job) return;
          var rebuilt = ccDetailFromEngineJob(jd.job);
          if (!rebuilt) return;
          setCommitDetail(rebuilt);
          ccPersistSaveCard(block, props.sessionId, toolCallId, Object.assign({}, saved, {
            commitDetail: rebuilt,
            phase: "done"
          }));
        }).catch(function() {
        });
      },
      [persistKey, toolCallId]
    );
    useEffect(
      function() {
        if (phase === "done") return;
        var ws = String(workspace || "").trim();
        if (dshCwd && !ws) {
          setWorkspace(dshCwd);
          ws = dshCwd;
        }
        if (!ws) return;
        setBranchHint("\u6B63\u5728\u8BC6\u522B\u5206\u652F\u2026");
        fetch(engineBase() + "/api/code-commit/check", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ workspace: ws })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (!d || !d.ok) {
            setBranch("");
            var msg0 = d && (d.detail || d.reply) || "\u8DEF\u5F84\u4E0D\u53EF\u7528";
            setBranchHint(msg0);
            if (d && d.source === "user_capability") {
              setPhase("cap-denied");
              setErr(msg0);
            }
            return;
          }
          setBranch(String(d.work_branch || ""));
          setBranchHint(String(d.branch_hint || (d.need_user_branch ? "\u8BF7\u586B\u5199\u8981\u63D0\u4EA4\u7684\u5206\u652F" : "") || ""));
        }).catch(function() {
          setBranchHint("\u5206\u652F\u8BC6\u522B\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u586B\u5199");
        });
      },
      [dshCwd]
    );
    if (!wb || wb.t !== "cc-pick" && String(wb.t || "").indexOf("cc-") !== 0) {
      if (!(ui && ui.kind === "pick") && !(ui && ui.kind === "denied") && wb && wb.t !== "cc-denied") {
        var out = block && "kind" in block ? (block.content || []).map(function(c) {
          return c && c.type === "text" ? c.text : "";
        }).filter(Boolean).join("\n") : "\u63D0\u4EA4\u8FDB\u884C\u4E2D\u2026";
        return h(
          "div",
          { className: "wb-cr" },
          h(
            "div",
            { className: "wb-cr-head" },
            h("span", { className: "wb-cr-badge" }, "\u63D0\u4EA4\u4EE3\u7801"),
            h("span", { className: "wb-cr-hint" }, "\u7ED3\u679C")
          ),
          h("div", { className: "wb-cr-body" }, h("pre", { className: "wb-cr-progress", style: { margin: 0 } }, out || "\uFF08\u65E0\u8BE6\u60C5\uFF09"))
        );
      }
    }
    if (phase === "cap-denied" || wb && wb.t === "cc-denied" || ui && ui.kind === "denied") {
      var denyMsg = String(
        err || branchHint || ui && (ui.message || ui.desc || ui.summary) || "\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u300C\u63D0\u4EA4\u300D\u80FD\u529B\uFF0C\u65E0\u6CD5\u4F7F\u7528\u3002\n\n\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u5F00\u901A\u300C\u63D0\u4EA4\u300D\u3002\u4F60\u672C\u4EBA\u65E0\u6CD5\u81EA\u884C\u5F00\u901A\u3002"
      );
      return h(
        "div",
        { className: "wb-cr" },
        h(
          "div",
          { className: "wb-cr-head" },
          h("span", { className: "wb-cr-badge" }, "\u63D0\u4EA4\u4EE3\u7801"),
          h("span", { className: "wb-cr-hint" }, "\u65E0\u6743\u9650")
        ),
        h(
          "div",
          { className: "wb-cr-body" },
          h(
            "div",
            { className: "wb-cr-banner fail" },
            h("span", { className: "wb-cr-done-icon" }, "!"),
            h(
              "div",
              null,
              h("strong", null, "\u5F53\u524D\u8D26\u53F7\u6CA1\u6709\u300C\u63D0\u4EA4\u300D\u80FD\u529B"),
              h(
                "p",
                {
                  className: "wb-cr-note",
                  style: { margin: "6px 0 0", whiteSpace: "pre-wrap" }
                },
                denyMsg
              )
            )
          )
        )
      );
    }
    function refreshBranch(path) {
      var workspacePath = String(path || workspace || "").trim();
      if (!workspacePath) {
        setBranch("");
        setBranchHint("\u8BF7\u5148\u9009\u62E9\u5DE5\u7A0B\u76EE\u5F55");
        return;
      }
      setBranchHint("\u6B63\u5728\u8BC6\u522B\u5206\u652F\u2026");
      fetch(engineBase() + "/api/code-commit/check", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ workspace: workspacePath })
      }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (!d || !d.ok) {
          setBranch("");
          var msg = d && (d.detail || d.reply) || "\u8DEF\u5F84\u4E0D\u53EF\u7528";
          setBranchHint(msg);
          if (d && d.source === "user_capability") {
            setPhase("cap-denied");
            setErr(msg);
          }
          return;
        }
        setBranch(String(d.work_branch || ""));
        setBranchHint(String(d.branch_hint || (d.need_user_branch ? "\u8BF7\u586B\u5199\u8981\u63D0\u4EA4\u7684\u5206\u652F" : "") || ""));
      }).catch(function() {
        setBranchHint("\u5206\u652F\u8BC6\u522B\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u586B\u5199");
      });
    }
    function browse() {
      setBusy(true);
      setErr("\u8BF7\u5728\u5F39\u51FA\u7684\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u4E2D\u9009\u62E9\u76EE\u5F55\uFF08\u82E5\u770B\u4E0D\u5230\uFF0C\u8BF7\u770B Dock / \u5176\u5B83\u7A97\u53E3\u540E\u9762\uFF09");
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function() {
        try {
          if (ctrl) ctrl.abort();
        } catch (e0) {
        }
      }, 12e4);
      pickLocalFolder("\u9009\u62E9\u8981\u63D0\u4EA4\u7684 Git \u5DE5\u7A0B\u76EE\u5F55", ctrl ? ctrl.signal : void 0).then(function(d) {
        if (d && d.ok && d.path) {
          setWorkspace(d.path);
          setErr("");
          refreshBranch(d.path);
        } else if (d && d.error && d.error !== "\u5DF2\u53D6\u6D88\u9009\u62E9") {
          setErr(d.error || "\u9009\u6587\u4EF6\u5939\u5931\u8D25");
        } else {
          setErr("");
        }
      }).catch(function(e) {
        setErr(
          e && e.name === "AbortError" ? "\u9009\u62E9\u8D85\u65F6\uFF1A\u8BF7\u70B9\u5E38\u7528\u8DEF\u5F84\u6216\u624B\u52A8\u7C98\u8D34\u76EE\u5F55" : "\u6D4F\u89C8\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e)
        );
      }).finally(function() {
        clearTimeout(timer);
        setBusy(false);
      });
    }
    function runPrepare(local_path, work_branch) {
      setBusy(true);
      setErr("\u6B63\u5728\u5217\u51FA\u5F85\u63D0\u4EA4\u6587\u4EF6\u2026");
      fetch(engineBase() + "/api/code-commit/prepare", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ workspace: local_path, work_branch })
      }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (!d || !d.ok) {
          setErr(d && (d.detail || d.reply) || "\u5217\u6587\u4EF6\u5931\u8D25");
          setBusy(false);
          if (d && d.source === "user_capability") setPhase("cap-denied");
          return;
        }
        var list = Array.isArray(d.pending_files) ? d.pending_files : Array.isArray(d.files) ? d.files : [];
        var paths = list.map(function(p) {
          return typeof p === "string" ? p : p && p.path || "";
        }).filter(Boolean);
        if (!paths.length) {
          setErr(d && d.reply || "\u6CA1\u6709\u5F85\u63D0\u4EA4\u7684\u4E1A\u52A1\u6587\u4EF6\uFF08\u5DE5\u4F5C\u533A\u53EF\u80FD\u5E72\u51C0\uFF09");
          setBusy(false);
          return;
        }
        var sel = {};
        paths.forEach(function(p) {
          sel[p] = true;
        });
        setFiles(paths.slice(0, 120));
        setSelected(sel);
        setDraft(String(d.draft_message || ""));
        if (d.work_branch) setBranch(String(d.work_branch));
        setPhase("files");
        setErr("");
        setBusy(false);
      }).catch(function(e) {
        setErr("\u5217\u6587\u4EF6\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
        setBusy(false);
      });
    }
    function goPrepare() {
      var local_path = String(workspace || "").trim();
      var work_branch = String(branch || "").trim();
      if (!local_path) {
        setErr("\u8BF7\u586B\u5199\u6216\u6D4F\u89C8\u9009\u62E9\u672C\u673A Git \u5DE5\u7A0B\u76EE\u5F55");
        return;
      }
      if (work_branch) {
        runPrepare(local_path, work_branch);
        return;
      }
      setBusy(true);
      setErr("\u6B63\u5728\u8BC6\u522B\u5206\u652F\u2026");
      fetch(engineBase() + "/api/code-commit/check", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ workspace: local_path })
      }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (!d || !d.ok) {
          setErr(d && (d.detail || d.reply) || "\u8DEF\u5F84\u4E0D\u53EF\u7528");
          setBusy(false);
          return;
        }
        var wb2 = String(d.work_branch || "").trim();
        setBranch(wb2);
        setBranchHint(String(d.branch_hint || (d.need_user_branch ? "\u8BF7\u586B\u5199\u8981\u63D0\u4EA4\u7684\u5206\u652F" : "") || ""));
        if (!wb2) {
          setErr(d.branch_hint || "\u8BF7\u586B\u5199\u8981\u63D0\u4EA4\u7684\u5206\u652F");
          setBusy(false);
          return;
        }
        runPrepare(local_path, wb2);
      }).catch(function(e) {
        setErr("\u5206\u652F\u8BC6\u522B\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
        setBusy(false);
      });
    }
    function selectedList() {
      return Object.keys(selected).filter(function(k) {
        return selected[k];
      });
    }
    function toggle(rel) {
      setSelected(function(prev) {
        var next = Object.assign({}, prev);
        if (next[rel]) delete next[rel];
        else next[rel] = true;
        return next;
      });
    }
    function runGate(fileList2) {
      var local_path = String(workspace || "").trim();
      var work_branch = String(branch || "").trim();
      setPhase("gating");
      setBusy(true);
      setErr("");
      setSummary("\u95E8\u7981\u5BA1\u6838\u4E2D\u2026");
      setFindings([]);
      fetch(engineBase() + "/api/code-commit/start", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          workspace: local_path,
          work_branch,
          files: fileList2 && fileList2.length ? fileList2 : null
        })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { status: r.status, d };
        });
      }).then(function(pack) {
        var d = pack.d || {};
        if (!d.ok && !d.job_id) {
          setPhase(d.source === "user_capability" ? "cap-denied" : "dir");
          setBusy(false);
          setErr(d.detail || d.reply || "\u95E8\u7981\u5931\u8D25");
          if (d.need_user_branch) setBranchHint(d.branch_hint || d.detail || "\u8BF7\u586B\u5199\u5206\u652F");
          return;
        }
        setJobId(String(d.job_id || ""));
        setFindings(Array.isArray(d.findings) ? d.findings : []);
        if (d.work_branch) setBranch(String(d.work_branch));
        if (!d.can_commit) {
          setPhase("blocked");
          setBusy(false);
          setSummary(
            d.summary || d.reply || "\u95E8\u7981\u672A\u901A\u8FC7\uFF0C\u7981\u6B62\u63D0\u4EA4\uFF08\u963B\u65AD " + (d.blocking_count || 0) + "\uFF09"
          );
          return;
        }
        var cui = d.code_commit_ui || {};
        setDraft(String(cui.message || d.draft_message || draft || ""));
        setPush(cui.push !== false && d.default_push !== false);
        setPhase("confirm");
        setBusy(false);
        setSummary(d.summary || "\u95E8\u7981\u901A\u8FC7\uFF0C\u8BF7\u786E\u8BA4\u63D0\u4EA4\u8BF4\u660E\u540E\u63A8\u9001");
        setErr("");
      }).catch(function(e) {
        setPhase("dir");
        setBusy(false);
        setErr("\u95E8\u7981\u8BF7\u6C42\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
      });
    }
    function doConfirm(doPush) {
      var jid = String(jobId || "").trim();
      var message = String(draft || "").trim();
      if (!jid) {
        setErr("\u7F3A\u5C11 job_id");
        return;
      }
      if (!message) {
        setErr("\u8BF7\u586B\u5199\u4E2D\u6587\u63D0\u4EA4\u8BF4\u660E");
        return;
      }
      setBusy(true);
      setErr("");
      issueHitl("code-commit.confirm", { job_id: jid }).then(function(nonce) {
        return fetch(engineBase() + "/api/code-commit/confirm", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            job_id: jid,
            message,
            push: !!doPush,
            decision: "approve",
            nonce
          })
        });
      }).then(function(r) {
        return r.json().then(function(d) {
          return { status: r.status, d };
        });
      }).then(function(pack) {
        var d = pack.d || {};
        setBusy(false);
        setLastPush(!!doPush);
        setCommitDetail(d);
        setPhase("done");
        var resultText = "";
        if (d.ok) {
          resultText = d.reply || "\u63D0\u4EA4\u6210\u529F" + (doPush ? "\u5E76\u5DF2\u63A8\u9001" : "\uFF08\u4EC5\u672C\u5730\uFF09");
          setResult(resultText);
          setErr("");
        } else if (d.push_retry_needed) {
          resultText = d.reply || "\u672C\u5730\u5DF2 commit\uFF0C\u63A8\u9001\u5931\u8D25\uFF0C\u53EF\u7A0D\u540E\u91CD\u8BD5\u63A8\u9001";
          setResult(resultText);
          setErr(d.detail || d.reply || "push \u5931\u8D25");
        } else {
          setResult("");
          setErr(d.detail || d.reply || "\u786E\u8BA4\u5931\u8D25");
        }
        ccPersistSaveCard(block, props.sessionId, ccResolveCallId(), {
          phase: "done",
          callId: ccResolveCallId(),
          sessionId: ccBlockSessionId(block, props.sessionId),
          workspace,
          branch,
          branchHint,
          files,
          selected,
          draft,
          push,
          jobId: jid,
          findings,
          summary,
          result: resultText,
          commitDetail: d,
          lastPush: !!doPush
        });
      }).catch(function(e) {
        setBusy(false);
        setPhase("done");
        setErr("\u786E\u8BA4\u8BF7\u6C42\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
      });
    }
    function head(hint) {
      return h(
        "div",
        { className: "wb-cr-head" },
        h("span", { className: "wb-cr-badge" }, "\u63D0\u4EA4\u4EE3\u7801"),
        h("span", { className: "wb-cr-hint" }, hint)
      );
    }
    if (phase === "gating") {
      return h(
        "div",
        { className: "wb-cr" },
        head("\u95E8\u7981\u4E2D"),
        h("div", { className: "wb-cr-body" }, h("p", { className: "wb-cr-sum" }, summary || "\u95E8\u7981\u5BA1\u6838\u4E2D\uFF0C\u8BF7\u7A0D\u5019\u2026"))
      );
    }
    function doPushRetry() {
      var jid = String(commitDetail && commitDetail.job_id || jobId || "").trim();
      if (!jid) {
        setErr("\u7F3A\u5C11 job_id\uFF0C\u65E0\u6CD5\u91CD\u8BD5\u63A8\u9001");
        return;
      }
      setBusy(true);
      setErr("");
      fetch(engineBase() + "/api/code-commit/push-retry", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ job_id: jid })
      }).then(function(r) {
        return r.json();
      }).then(function(d) {
        setBusy(false);
        setCommitDetail(d);
        var resultText = "";
        if (d && d.ok) {
          resultText = d.reply || "\u63A8\u9001\u6210\u529F";
          setResult(resultText);
          setErr("");
          setLastPush(true);
        } else {
          resultText = d && d.reply || "\u63A8\u9001\u4ECD\u5931\u8D25";
          setResult(resultText);
          setErr(d && (d.detail || d.hint || d.reply) || "\u63A8\u9001\u5931\u8D25");
        }
        ccPersistSaveCard(block, props.sessionId, toolCallId, {
          phase: "done",
          callId: toolCallId,
          jobId: jid,
          commitDetail: d,
          result: resultText,
          lastPush: !!(d && d.ok),
          workspace,
          branch,
          files,
          selected,
          draft
        });
      }).catch(function(e) {
        setBusy(false);
        setErr("\u91CD\u8BD5\u63A8\u9001\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
      });
    }
    if (phase === "done") {
      var detail = commitDetail || {};
      var cr = detail.commit_result || {};
      var pushInfo = cr.push || {};
      var didPush = lastPush;
      var pushRetry = !!(detail.push_retry_needed || cr.commit && pushInfo && !pushInfo.ok && didPush);
      var okCommit = !!(detail.ok || cr.ok || cr.commit);
      var fileList = Array.isArray(detail.files) && detail.files.length ? detail.files : Array.isArray(cr.files) && cr.files.length ? cr.files : selectedList();
      var msgText = String(detail.message || cr.message || draft || "").trim();
      var wsPath = String(detail.workspace || workspace || "").trim();
      var branchName = String(cr.branch || branch || "").trim();
      var commitSha = String(cr.commit || "").trim();
      var title = pushRetry ? "\u672C\u5730\u5DF2\u63D0\u4EA4\uFF0C\u63A8\u9001\u672A\u5B8C\u6210" : didPush && pushInfo && pushInfo.ok ? "\u5DF2\u63D0\u4EA4\u5E76\u63A8\u9001\u5230\u8FDC\u7A0B" : okCommit ? didPush ? "\u5DF2\u63D0\u4EA4" : "\u5DF2\u672C\u5730\u63D0\u4EA4\uFF08\u672A\u63A8\u9001\uFF09" : "\u63D0\u4EA4\u7ED3\u675F";
      var bannerClass = pushRetry ? "wb-cr-done-banner warn" : okCommit ? "wb-cr-done-banner ok" : "wb-cr-done-banner warn";
      var remoteLine = ccCommitRemoteLabel(didPush, pushInfo);
      var skippedNote = cr.skipped ? String(cr.message || "\u672C\u6279\u65E0\u65B0\u53D8\u66F4\u6216\u5DF2\u8DF3\u8FC7 commit") : "";
      var kvKids = [
        h("dt", null, "\u9879\u76EE"),
        h("dd", { title: wsPath }, ccTailName(wsPath))
      ];
      if (wsPath) {
        kvKids.push(h("dt", null, "\u8DEF\u5F84"), h("dd", { title: wsPath }, wsPath));
      }
      kvKids.push(
        h("dt", null, "\u5206\u652F"),
        h("dd", null, branchName || "\u2014"),
        h("dt", null, "Commit"),
        h("dd", null, commitSha || "\u2014"),
        h("dt", null, "\u63A8\u9001"),
        h("dd", null, remoteLine)
      );
      if (pushInfo && pushInfo.remote_url && didPush && pushInfo.ok) {
        kvKids.push(h("dt", null, "\u8FDC\u7A0B"), h("dd", null, String(pushInfo.remote_url)));
      }
      if (jobId || detail.job_id) {
        kvKids.push(h("dt", null, "\u4EFB\u52A1"), h("dd", null, String(detail.job_id || jobId)));
      }
      if (msgText) {
        kvKids.push(h("dt", null, "\u8BF4\u660E"), h("dd", null, msgText));
      }
      kvKids.push(
        h("dt", null, "\u6587\u4EF6"),
        h("dd", null, fileList.length ? fileList.length + " \u4E2A" : "\u2014")
      );
      return h(
        "div",
        { className: "wb-cr" },
        head(
          (pushRetry ? "\u63A8\u9001\u5F85\u91CD\u8BD5" : okCommit ? "\u5B8C\u6210" : "\u7ED3\u675F") + " \xB7 " + CC_UI_REV
        ),
        h(
          "div",
          { className: "wb-cr-body" },
          h(
            "div",
            { className: bannerClass },
            h("span", { className: "wb-cr-done-icon" }, pushRetry ? "!" : okCommit ? "\u2713" : "\xB7"),
            h(
              "div",
              null,
              h("strong", null, title),
              result && result !== title ? h("p", { className: "wb-cr-note", style: { margin: "4px 0 0" } }, result) : null
            )
          ),
          h("dl", { className: "wb-cr-kv" }, kvKids),
          fileList.length ? h(
            "div",
            { className: "wb-cr-files" },
            h("div", { className: "wb-cr-label" }, "\u672C\u6279\u63D0\u4EA4\u6587\u4EF6"),
            fileList.slice(0, 40).map(function(f, i) {
              return h("div", { key: i, className: "wb-cr-file" }, h("span", null, String(f)));
            }),
            fileList.length > 40 ? h("p", { className: "wb-cr-note" }, "\u2026\u53E6\u6709 " + (fileList.length - 40) + " \u4E2A\u6587\u4EF6") : null
          ) : null,
          skippedNote ? h("p", { className: "wb-cr-warn" }, skippedNote) : null,
          pushRetry && (pushInfo.error || pushInfo.raw_error) ? h(
            "p",
            { className: "wb-cr-err" },
            String(pushInfo.error || pushInfo.raw_error || "").slice(0, 320)
          ) : null,
          err && !pushRetry ? h("p", { className: "wb-cr-err" }, err) : null,
          pushRetry && err ? h("p", { className: "wb-cr-warn" }, err) : null,
          h(
            "div",
            { className: "wb-cr-actions" },
            pushRetry ? h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn primary",
                disabled: busy,
                onClick: doPushRetry
              },
              busy ? "\u63A8\u9001\u4E2D\u2026" : "\u91CD\u8BD5\u63A8\u9001"
            ) : null,
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: ccResetCard
              },
              "\u91CD\u65B0\u9009\u62E9"
            )
          )
        )
      );
    }
    if (phase === "blocked") {
      return h(
        "div",
        { className: "wb-cr" },
        head("\u95E8\u7981\u963B\u65AD"),
        h(
          "div",
          { className: "wb-cr-body" },
          h("p", { className: "wb-cr-sum" }, summary),
          h(
            "div",
            { className: "wb-cr-files" },
            findings.length ? findings.slice(0, 20).map(function(f, i) {
              return h(
                "div",
                { key: i, style: { margin: "6px 0" } },
                h("b", null, "[" + (f.severity || "?") + "] "),
                (f.path || f.file || "") + " \u2014 " + (f.message || f.title || "")
              );
            }) : h("p", { className: "wb-cr-sum" }, "\u65E0 findings \u8BE6\u60C5")
          ),
          h(
            "div",
            { className: "wb-cr-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  setPhase("files");
                }
              },
              "\u8FD4\u56DE\u6539\u6587\u4EF6"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  setPhase("dir");
                }
              },
              "\u6539\u76EE\u5F55"
            )
          )
        )
      );
    }
    if (phase === "confirm") {
      return h(
        "div",
        { className: "wb-cr" },
        head("\u786E\u8BA4\u63D0\u4EA4\u5E76\u63A8\u9001"),
        h(
          "div",
          { className: "wb-cr-body" },
          h("p", { className: "wb-cr-sum" }, summary || "job\uFF1A" + jobId),
          h("p", { className: "wb-cr-sum" }, "\u5206\u652F\uFF1A" + branch + " \xB7 \u76EE\u5F55\uFF1A" + workspace),
          h("label", { className: "wb-cr-label" }, "\u4E2D\u6587\u63D0\u4EA4\u8BF4\u660E"),
          h("textarea", {
            className: "wb-cr-input",
            style: { width: "100%", minHeight: 72, boxSizing: "border-box", fontFamily: "inherit" },
            value: draft,
            onChange: function(e) {
              setDraft(e.target.value);
            }
          }),
          h(
            "label",
            { className: "wb-cr-file", style: { marginTop: 8 } },
            h("input", {
              type: "checkbox",
              checked: !!push,
              onChange: function() {
                setPush(!push);
              }
            }),
            h("span", null, "\u540C\u65F6\u63A8\u9001\u5230\u8FDC\u7A0B\uFF08push\uFF09")
          ),
          err ? h("p", { className: "wb-cr-err" }, err) : null,
          h(
            "div",
            { className: "wb-cr-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn primary",
                disabled: busy,
                onClick: function() {
                  doConfirm(!!push);
                }
              },
              busy ? "\u63D0\u4EA4\u4E2D\u2026" : push ? "\u786E\u8BA4\u63D0\u4EA4\u5E76\u63A8\u9001" : "\u786E\u8BA4\u4EC5\u672C\u5730\u63D0\u4EA4"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                disabled: busy,
                onClick: function() {
                  doConfirm(false);
                }
              },
              "\u4EC5\u672C\u5730\u63D0\u4EA4"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                disabled: busy,
                onClick: function() {
                  setPhase("done");
                  setResult("\u5DF2\u53D6\u6D88\uFF0C\u672A\u6267\u884C git commit\u3002");
                }
              },
              "\u53D6\u6D88"
            )
          )
        )
      );
    }
    if (phase === "files") {
      return h(
        "div",
        { className: "wb-cr" },
        head("\u52FE\u9009\u5F85\u63D0\u4EA4\u6587\u4EF6"),
        h(
          "div",
          { className: "wb-cr-body" },
          h("p", { className: "wb-cr-sum" }, workspace + " \xB7 " + branch + " \xB7 " + files.length + " \u4E2A\u5F85\u63D0\u4EA4"),
          h(
            "div",
            { className: "wb-cr-actions", style: { marginTop: 0 } },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  var next = {};
                  files.forEach(function(p) {
                    next[p] = true;
                  });
                  setSelected(next);
                }
              },
              "\u5168\u9009"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  setSelected({});
                }
              },
              "\u6E05\u7A7A"
            )
          ),
          h(
            "div",
            { className: "wb-cr-files" },
            files.map(function(rel) {
              return h(
                "label",
                { key: rel, className: "wb-cr-file" },
                h("input", {
                  type: "checkbox",
                  checked: !!selected[rel],
                  onChange: function() {
                    toggle(rel);
                  }
                }),
                h("span", null, rel)
              );
            })
          ),
          err ? h("p", { className: "wb-cr-err" }, err) : null,
          h(
            "div",
            { className: "wb-cr-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                disabled: busy,
                onClick: function() {
                  setPhase("dir");
                  setErr("");
                }
              },
              "\u8FD4\u56DE\u6539\u76EE\u5F55"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn primary",
                disabled: busy,
                onClick: function() {
                  var sel = selectedList();
                  if (!sel.length) {
                    setErr("\u8BF7\u81F3\u5C11\u52FE\u9009\u4E00\u4E2A\u6587\u4EF6");
                    return;
                  }
                  runGate(sel);
                }
              },
              "\u5F00\u59CB\u95E8\u7981\u5BA1\u6838"
            )
          )
        )
      );
    }
    return h(
      "div",
      { className: "wb-cr" },
      head("\u9009\u62E9\u76EE\u5F55 \xB7 \u4E0B\u4E00\u6B65\u52FE\u9009\u6587\u4EF6 \xB7 " + CC_UI_REV),
      h(
        "div",
        { className: "wb-cr-body" },
        h("p", { className: "wb-cr-sum" }, "\u4E3B\u804A\u5929\u5DE5\u5177\u5361\uFF1A\u9009\u76EE\u5F55 \u2192 \u52FE\u9009\u6587\u4EF6 \u2192 \u95E8\u7981 \u2192 \u786E\u8BA4\u540E\u624D commit/push\u3002"),
        h(WorkspaceMismatchHint, {
          dshCwd,
          workspace,
          home: props.home,
          onUseDsh: function() {
            setWorkspace(dshCwd);
          }
        }),
        h(
          "label",
          { className: "wb-cr-label" },
          typeof workspaceDirFieldLabel === "function" ? workspaceDirFieldLabel().replace("\u5DE5\u7A0B\u76EE\u5F55", "Git \u5DE5\u7A0B\u76EE\u5F55") : "\u672C\u673A Git \u5DE5\u7A0B\u76EE\u5F55"
        ),
        typeof workspaceDirFieldHint === "function" && workspaceDirFieldHint() ? h("p", { className: "wb-cr-dsh", style: { margin: "0 0 6px" } }, workspaceDirFieldHint()) : null,
        h(
          "div",
          { className: "wb-cr-row" },
          h("input", {
            className: "wb-cr-input",
            value: workspace,
            placeholder: "/Users/\u4F60/\u9879\u76EE",
            onChange: function(e) {
              setWorkspace(e.target.value);
            },
            onBlur: function() {
              refreshBranch();
            }
          }),
          h(
            "button",
            { type: "button", className: "wb-cr-btn", disabled: busy, onClick: browse },
            busy ? "\u9009\u62E9\u4E2D\u2026" : "\u6D4F\u89C8\u2026"
          )
        ),
        suggestions.length ? h(
          "div",
          { className: "wb-cr-chips" },
          suggestions.map(function(s, i) {
            var p = typeof s === "string" ? s : s && s.path || "";
            var lab = typeof s === "object" && s.label ? s.label + " \xB7 " : "";
            if (!p) return null;
            return h(
              "button",
              {
                key: i + p,
                type: "button",
                className: "wb-cr-chip",
                title: p,
                onClick: function() {
                  setWorkspace(p);
                  refreshBranch(p);
                }
              },
              lab + p
            );
          })
        ) : null,
        h("label", { className: "wb-cr-label" }, "\u63D0\u4EA4\u5206\u652F"),
        h("input", {
          className: "wb-cr-input",
          style: { width: "100%", marginBottom: 4, boxSizing: "border-box" },
          value: branch,
          placeholder: "\u5982 feature/xxx",
          onChange: function(e) {
            setBranch(e.target.value);
          }
        }),
        h("p", { className: "wb-cr-sum" }, branchHint || "\u9009\u76EE\u5F55\u540E\u81EA\u52A8\u8BC6\u522B\u5F53\u524D\u5206\u652F"),
        err ? h("p", { className: "wb-cr-err" }, err) : null,
        h(
          "div",
          { className: "wb-cr-actions" },
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn primary",
              disabled: busy,
              onClick: goPrepare
            },
            busy ? "\u5217\u51FA\u6587\u4EF6\u2026" : "\u4E0B\u4E00\u6B65\uFF1A\u9009\u6587\u4EF6"
          )
        )
      )
    );
  }
  ctx.CodeCommitBeginCard = CodeCommitBeginCard;
}

// client-src/lanes/code-dev-persist.js
function createCodeDevPersist() {
  var _scrub = {
    stripBoilerplate: function(s) {
      return String(s || "");
    },
    stripExploration: function(s) {
      return String(s || "");
    },
    dedupeThink: function(s) {
      return String(s || "");
    }
  };
  function setScrubbers(fns) {
    if (!fns || typeof fns !== "object") return;
    if (typeof fns.cdStripBoilerplate === "function") {
      _scrub.stripBoilerplate = fns.cdStripBoilerplate;
    }
    if (typeof fns.cdStripExplorationFromProcess === "function") {
      _scrub.stripExploration = fns.cdStripExplorationFromProcess;
    }
    if (typeof fns.cdDedupeThinkText === "function") {
      _scrub.dedupeThink = fns.cdDedupeThinkText;
    }
  }
  var CD_PIPELINE = [
    { id: "brief", title: "\u9700\u6C42\u7406\u89E3" },
    { id: "sandbox-prep", title: "\u6C99\u7BB1\u51C6\u5907" },
    { id: "dev", title: "\u5199\u7801" },
    { id: "sync", title: "\u540C\u6B65\u5230\u672C\u673A\u5DE5\u7A0B" }
  ];
  var CD_STEP_MAP = {
    "agent-loop": "dev",
    "cursor-local": "dev",
    "delete-plan": "dev",
    "delete-exec": "dev",
    "sync-del": "sync"
  };
  var CD_PERSIST_VER = 4;
  var CD_PERSIST_MIN_VER = 2;
  var CD_UI_REV = "2026-09-10q-review-fix";
  var CD_PERSIST_MAX_STREAM = 1e5;
  var CD_PERSIST_MAX_DELIVERY = 8e4;
  var CD_PERSIST_MAX_THINK = 24e3;
  function cdPersistClip(text, maxLen) {
    var s = String(text || "");
    if (!s) return "";
    var n = maxLen || CD_PERSIST_MAX_STREAM;
    return s.length > n ? s.slice(-n) : s;
  }
  function cdPersistMergeBody(prev, payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (!prev || typeof prev !== "object") return payload;
    var phase = String(payload.phase || "");
    if (phase !== "done" && phase !== "running") return payload;
    ["streamText", "deliveryText", "thinkingText", "result"].forEach(function(field) {
      if (!payload[field] && prev[field]) payload[field] = prev[field];
    });
    if ((!payload.steps || !payload.steps.length) && prev.steps && prev.steps.length) {
      payload.steps = prev.steps;
    }
    return payload;
  }
  function cdPersistLoadJobSnapshot(jobId) {
    var jid = String(jobId || "").trim();
    if (!jid) return null;
    try {
      var raw = localStorage.getItem("wb-cd-job:" + jid);
      if (!raw) return null;
      var o = cdPersistNormalize(JSON.parse(raw));
      if (!o || String(o.jobId || "") !== jid) return null;
      return o;
    } catch (eJ) {
      return null;
    }
  }
  function cdPersistEnrichCardSaved(saved) {
    if (!saved || typeof saved !== "object") return saved;
    var jid = String(saved.jobId || "").trim();
    if (!jid) return saved;
    var snap = cdPersistLoadJobSnapshot(jid);
    if (!snap) return saved;
    return Object.assign({}, saved, {
      streamText: saved.streamText || snap.streamText || "",
      deliveryText: saved.deliveryText || snap.deliveryText || "",
      thinkingText: saved.thinkingText || snap.thinkingText || "",
      thinkingMs: saved.thinkingMs != null ? saved.thinkingMs : snap.thinkingMs,
      result: saved.result || snap.result || "",
      steps: saved.steps && saved.steps.length ? saved.steps : snap.steps,
      synced: saved.synced && saved.synced.length ? saved.synced : snap.synced,
      deferred: saved.deferred && saved.deferred.length ? saved.deferred : snap.deferred,
      deleted: saved.deleted && saved.deleted.length ? saved.deleted : snap.deleted,
      runtimeHint: saved.runtimeHint || snap.runtimeHint || "",
      aliveHint: saved.aliveHint || snap.aliveHint || ""
    });
  }
  var CD_ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
  var CD_ICON_DOWNLOAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  function cdFinalizeSteps(stepState, ev, asError) {
    var job = ev && ev.job;
    if (job && (job.events || job.status)) {
      return cdJobStepsFromRecord(job);
    }
    var sealed = cdSealSteps(stepState, asError);
    var syncedList = ev && ev.synced_files || job && job.synced_files || [];
    if (!asError && syncedList && syncedList.length) {
      sealed = sealed.map(function(s) {
        if (s.id === "sync" && (s.state === "skipped" || s.state === "pending")) {
          return Object.assign({}, s, {
            state: "done",
            title: "\u5DF2\u540C\u6B65 " + syncedList.length + " \u4E2A\u6587\u4EF6\u5230\u672C\u673A"
          });
        }
        return s;
      });
    }
    return sealed;
  }
  function cdBlockCallId(block, callIdProp) {
    if (callIdProp != null && String(callIdProp).trim()) return String(callIdProp).trim();
    if (!block) return "";
    var nested = block.call && typeof block.call === "object" ? block.call : null;
    return String(
      block.callId || block.toolCallId || nested && (nested.callId || nested.toolCallId || nested.id) || block.id || ""
    ).trim();
  }
  function cdBlockSessionId(block, sessionId) {
    return String(
      sessionId || block && (block.threadId || block.thread_id || block.sessionId || block.session_id || block.conversationId || "") || ""
    ).trim();
  }
  function cdPersistKey(block, sessionId, callIdProp) {
    var callId = cdBlockCallId(block, callIdProp);
    var sid = cdBlockSessionId(block, sessionId);
    if (callId && sid) return "wb-cd-card:" + sid + ":" + callId;
    if (callId) return "wb-cd-card:call:" + callId;
    if (sid) return "wb-cd-card:session:" + sid + ":lone";
    return "wb-cd-card:anon";
  }
  function cdPersistKeyAliases(block, sessionId, callIdProp) {
    var callId = cdBlockCallId(block, callIdProp);
    var sid = cdBlockSessionId(block, sessionId);
    var keys = [];
    var primary = cdPersistKey(block, sessionId, callIdProp);
    keys.push(primary);
    if (callId) {
      keys.push("wb-cd-card:call:" + callId);
      keys.push("wb-cd-card:block:" + callId);
      if (sid) keys.push("wb-cd-card:" + sid + ":" + callId);
    } else if (sid) {
      keys.push("wb-cd-card:" + sid);
      keys.push("wb-cd-card:session:" + sid + ":lone");
    } else {
      keys.push("wb-cd-card:anon");
    }
    var uniq = [];
    var seen = {};
    keys.forEach(function(k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      uniq.push(k);
    });
    return uniq;
  }
  function cdPersistBelongsToCall(saved, callId) {
    if (!saved || typeof saved !== "object") return false;
    var cid = String(callId || "").trim();
    if (!cid) return false;
    var savedCid = String(saved.callId || "").trim();
    if (!savedCid) return false;
    return savedCid === cid;
  }
  function cdPickMustStayHitl(wb, ui, saved, callId) {
    var cid = String(callId || "").trim();
    if (saved && cid && cdPersistBelongsToCall(saved, callId)) {
      var phase = String(saved.phase || "");
      if (phase === "done" || phase === "running" || phase === "options" || phase === "propose" || saved.jobId) {
        return false;
      }
    }
    if (wb && wb.t === "cd-redirect-integrated") return false;
    var isPick = ui && String(ui.kind || "") === "pick" || wb && (wb.t === "cd-pick" || wb.t === "cd-none");
    if (!isPick && wb && wb.t && String(wb.t).indexOf("cd-") === 0 && wb.t !== "cd-pick") {
      return false;
    }
    if (!isPick && wb && wb.t) return false;
    if (!saved) return true;
    if (!cid) return true;
    return !cdPersistBelongsToCall(saved, callId);
  }
  function cdPersistNormalize(o) {
    if (!o || typeof o !== "object") return null;
    var ver = Number(o.v || 0);
    if (!ver || ver < CD_PERSIST_MIN_VER) return null;
    if (o.streamText) {
      o.streamText = _scrub.stripExploration(_scrub.stripBoilerplate(String(o.streamText || "")));
    }
    if (o.thinkingText) o.thinkingText = _scrub.dedupeThink(String(o.thinkingText || ""));
    return o;
  }
  function cdPersistLoad(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return cdPersistNormalize(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }
  function cdPersistScanByCallId(callId) {
    var cid = String(callId || "").trim();
    if (!cid) return null;
    var best = null;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("wb-cd-card:") !== 0) continue;
        var hit = false;
        if (k === "wb-cd-card:call:" + cid || k === "wb-cd-card:block:" + cid || k.slice(-cid.length - 1) === ":" + cid) {
          hit = true;
        }
        var o = null;
        try {
          o = cdPersistNormalize(JSON.parse(localStorage.getItem(k) || "null"));
        } catch (e1) {
          continue;
        }
        if (!o) continue;
        if (!hit && String(o.callId || "") !== cid) continue;
        if (!(o.phase === "done" || o.phase === "running" || o.jobId)) continue;
        if (!best || Number(o.at || 0) > Number(best.at || 0)) best = o;
      }
    } catch (e2) {
    }
    return best;
  }
  function cdPersistLoadForCard(block, sessionId, callIdProp) {
    try {
      var callId = cdBlockCallId(block, callIdProp);
      var sid = cdBlockSessionId(block, sessionId);
      var key = cdPersistKey(block, sessionId, callIdProp);
      var aliases = cdPersistKeyAliases(block, sessionId, callIdProp);
      for (var i = 0; i < aliases.length; i++) {
        var hit = cdPersistLoad(aliases[i]);
        if (hit && cdPersistBelongsToCall(hit, callId) && (hit.phase === "done" || hit.phase === "running" || hit.jobId || hit.phase === "options" || hit.phase === "propose")) {
          return { key, saved: hit, migrateFrom: aliases[i] !== key ? aliases[i] : "" };
        }
      }
      var scanned = cdPersistScanByCallId(callId);
      if (scanned && cdPersistBelongsToCall(scanned, callId)) {
        return { key, saved: scanned, migrateFrom: "" };
      }
      if (!callId) {
        var orphans = ["wb-cd-card:anon"];
        if (sid) orphans.push("wb-cd-card:session:" + sid + ":lone", "wb-cd-card:" + sid);
        for (var j = 0; j < orphans.length; j++) {
          var orphan = cdPersistLoad(orphans[j]);
          if (orphan && (orphan.phase === "done" || orphan.phase === "running") && orphan.jobId) {
            return { key, saved: orphan, migrateFrom: orphans[j] };
          }
        }
      }
      return { key, saved: null };
    } catch (eLoad) {
      try {
        console.warn("[dsh-mes-bridge] cdPersistLoadForCard failed", eLoad);
      } catch (eLog) {
      }
      return {
        key: cdPersistKey(block, sessionId, callIdProp),
        saved: null
      };
    }
  }
  function cdPersistPrune() {
    try {
      var now = Date.now();
      var maxAge = 7 * 24 * 3600 * 1e3;
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k.indexOf("wb-cd-card:") === 0 || k.indexOf("wb-cd-job:") === 0)) keys.push(k);
      }
      keys.forEach(function(k2) {
        try {
          var o = JSON.parse(localStorage.getItem(k2) || "null");
          if (!o || Number(o.v || 0) < CD_PERSIST_MIN_VER) {
            localStorage.removeItem(k2);
            return;
          }
          var at = Number(o.at || 0);
          if (at && now - at > maxAge) localStorage.removeItem(k2);
        } catch (e2) {
          try {
            localStorage.removeItem(k2);
          } catch (e3) {
          }
        }
      });
    } catch (e4) {
    }
  }
  function cdPersistSave(key, data) {
    try {
      try {
        var prev = JSON.parse(localStorage.getItem(key) || "null");
        var nextPhase = data && data.phase;
        if (prev && Number(prev.v || 0) >= CD_PERSIST_MIN_VER && (prev.phase === "done" || prev.phase === "running") && nextPhase === "form" && prev.jobId && !(data && data.jobId)) {
          return;
        }
      } catch (eGuard) {
      }
      var payload = Object.assign({ v: CD_PERSIST_VER, at: Date.now() }, data || {});
      try {
        var prevBody = JSON.parse(localStorage.getItem(key) || "null");
        if (prevBody && Number(prevBody.v || 0) >= CD_PERSIST_MIN_VER) {
          payload = cdPersistMergeBody(prevBody, payload);
        }
      } catch (ePrev) {
      }
      payload.streamText = cdPersistClip(payload.streamText, CD_PERSIST_MAX_STREAM);
      payload.deliveryText = cdPersistClip(payload.deliveryText, CD_PERSIST_MAX_DELIVERY);
      payload.thinkingText = cdPersistClip(payload.thinkingText, CD_PERSIST_MAX_THINK);
      localStorage.setItem(key, JSON.stringify(payload));
      if (payload.jobId) {
        try {
          localStorage.setItem(
            "wb-cd-job:" + String(payload.jobId),
            JSON.stringify({
              v: CD_PERSIST_VER,
              at: Date.now(),
              cardKey: key,
              phase: payload.phase,
              jobId: payload.jobId,
              callId: payload.callId || "",
              sessionId: payload.sessionId || "",
              workspace: payload.workspace || "",
              streamText: payload.streamText || "",
              deliveryText: payload.deliveryText || "",
              thinkingText: payload.thinkingText || "",
              thinkingMs: payload.thinkingMs,
              result: payload.result || "",
              steps: payload.steps || [],
              synced: payload.synced || [],
              deferred: payload.deferred || [],
              deleted: payload.deleted || [],
              runtimeHint: payload.runtimeHint || "",
              aliveHint: payload.aliveHint || "",
              elapsed: payload.elapsed
            })
          );
        } catch (eJob) {
        }
      }
      cdPersistPrune();
    } catch (e0) {
      try {
        cdPersistPrune();
        var slim = Object.assign({ v: CD_PERSIST_VER, at: Date.now() }, data || {});
        slim.streamText = cdPersistClip(slim.streamText, 2e4);
        slim.deliveryText = cdPersistClip(slim.deliveryText, 12e3);
        slim.thinkingText = cdPersistClip(slim.thinkingText, 4e3);
        try {
          var prevSlim = JSON.parse(localStorage.getItem(key) || "null");
          if (prevSlim && Number(prevSlim.v || 0) >= CD_PERSIST_MIN_VER) {
            slim = cdPersistMergeBody(prevSlim, slim);
          }
        } catch (eM) {
        }
        localStorage.setItem(key, JSON.stringify(slim));
      } catch (e1) {
      }
    }
  }
  function cdPersistSaveCard(block, sessionId, callIdProp, data) {
    var callId = cdBlockCallId(block, callIdProp) || data && data.callId || "";
    var aliases = cdPersistKeyAliases(block, sessionId, callIdProp);
    var payload = Object.assign({}, data || {}, {
      callId,
      sessionId: cdBlockSessionId(block, sessionId) || data && data.sessionId || ""
    });
    aliases.forEach(function(k) {
      cdPersistSave(k, payload);
    });
    if (callId) {
      var sid = cdBlockSessionId(block, sessionId);
      ["wb-cd-card:anon"].concat(sid ? ["wb-cd-card:" + sid, "wb-cd-card:session:" + sid + ":lone"] : []).forEach(function(sharedKey) {
        try {
          var old = cdPersistLoad(sharedKey);
          if (old && (old.phase === "done" || old.phase === "running" || old.jobId)) {
            localStorage.removeItem(sharedKey);
          }
        } catch (eClr) {
        }
      });
    }
    return aliases[0];
  }
  function cdPersistClear(key) {
    try {
      localStorage.removeItem(key);
    } catch (e1) {
    }
  }
  function cdJobStepsFromRecord(job) {
    var list = cdInitSteps().map(function(s) {
      return s.id === "brief" ? Object.assign({}, s, { state: "done" }) : s;
    });
    var evs = Array.isArray(job.events) ? job.events : [];
    var stepped = false;
    evs.forEach(function(ev) {
      if (ev && ev.type === "step") {
        stepped = true;
        list = cdApplyStep(list, ev);
      }
    });
    if (!stepped) {
      (job.steps || []).forEach(function(s) {
        if (s && s.id) list = cdApplyStep(list, { id: s.id, state: s.state, title: s.title });
      });
    }
    var st = String(job.status || "");
    if (st === "succeeded") return cdSealSteps(list, false);
    if (st === "failed" || st === "cancelled") return cdSealSteps(list, true);
    return list;
  }
  function cdJobElapsed(job) {
    var created = Number(job.created_at || 0);
    var updated = Number(job.updated_at || 0);
    if (created > 0 && updated >= created) return Math.max(0, updated - created);
    return 0;
  }
  function cdJobAliveHint(job) {
    var st = String(job.status || "");
    if (st === "succeeded") return "\u4EFB\u52A1\u5B8C\u6210 \xB7 " + cdFormatDuration(cdJobElapsed(job));
    if (st === "failed") return "\u4EFB\u52A1\u7ED3\u675F\uFF08\u5931\u8D25\uFF09";
    if (st === "cancelled") return "\u4EFB\u52A1\u5DF2\u53D6\u6D88";
    return String(job.progress || "\u5199\u7801\u8FDB\u884C\u4E2D\u2026");
  }
  function cdInitSteps() {
    return CD_PIPELINE.map(function(p) {
      return { id: p.id, title: p.title, state: "pending" };
    });
  }
  function cdPipelineIndex(id) {
    for (var i = 0; i < CD_PIPELINE.length; i++) {
      if (CD_PIPELINE[i].id === id) return i;
    }
    return CD_PIPELINE.length + 99;
  }
  function cdNormalizeStepId(id) {
    return CD_STEP_MAP[id] || id;
  }
  function cdMarkPriorDone(list, id) {
    var pIdx = cdPipelineIndex(id);
    return list.map(function(s) {
      if (cdPipelineIndex(s.id) < pIdx && s.state !== "done" && s.state !== "error") {
        return Object.assign({}, s, { state: "done" });
      }
      return s;
    });
  }
  function cdSealSteps(steps, asError) {
    return (steps || []).filter(function(s) {
      return s.id !== "status" && s.id !== "cursor-heartbeat";
    }).map(function(s) {
      if (asError) {
        if (s.state === "running" || s.state === "waiting") {
          return Object.assign({}, s, { state: "error" });
        }
        return s;
      }
      if (s.state === "skipped") return s;
      if (s.state === "pending") {
        return Object.assign({}, s, { state: "skipped" });
      }
      if (s.state !== "error") return Object.assign({}, s, { state: "done" });
      return s;
    });
  }
  function cdApplyStep(steps, event) {
    var rawId = event && event.id;
    if (!rawId || rawId === "status" || rawId === "cursor-heartbeat") return steps;
    var id = cdNormalizeStepId(rawId);
    var title = String(event.title || "").trim();
    var nextState = event.state || "running";
    var list = steps && steps.length ? steps.slice() : cdInitSteps();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return list;
    var cur = list[idx];
    var merged = Object.assign({}, cur, { state: nextState });
    if (id === "dev") {
      if (rawId === "cursor-local" && nextState === "done") merged.state = "running";
      else if (rawId === "agent-loop" && nextState === "done") merged.state = "done";
      else if ((rawId === "delete-plan" || rawId === "delete-exec") && (nextState === "done" || nextState === "skipped")) {
        merged.state = nextState === "done" ? "done" : "running";
      } else if (nextState === "running") merged.state = "running";
    }
    list[idx] = merged;
    if (nextState === "running" || id === "dev" && rawId === "agent-loop" && nextState === "done" || nextState === "done") {
      list = cdMarkPriorDone(list, id);
    }
    if (id === "sync" && nextState === "running") {
      list = list.map(function(s) {
        return s.id === "dev" && s.state === "running" ? Object.assign({}, s, { state: "done" }) : s;
      });
    }
    return list;
  }
  function cdPlanSummary(steps) {
    var list = (steps || []).filter(function(s) {
      return s.state !== "pending";
    });
    if (!list.length) return "\u51C6\u5907\u4E2D\u2026";
    var total = list.length;
    var done = list.filter(function(s) {
      return s.state === "done";
    }).length;
    if (list.some(function(s) {
      return s.state === "running";
    })) {
      return "\u6B63\u5728\u8FDB\u884C " + done + "/" + total;
    }
    var err = list.filter(function(s) {
      return s.state === "error";
    }).length;
    if (err) return "\u5B8C\u6210 " + done + "/" + total + "\uFF08" + err + " \u6B65\u5931\u8D25\uFF09";
    if (done === total) return "\u5DF2\u5168\u90E8\u5B8C\u6210\uFF08" + total + " \u6B65\uFF09";
    return "\u5171 " + total + " \u6B65";
  }
  function cdFormatDuration(sec) {
    sec = Math.max(0, Number(sec) || 0);
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m > 0 ? m + "\u5206" + s + "\u79D2" : s + "\u79D2";
  }
  return {
    setScrubbers,
    CD_PIPELINE,
    CD_STEP_MAP,
    CD_PERSIST_VER,
    CD_PERSIST_MIN_VER,
    CD_UI_REV,
    CD_PERSIST_MAX_STREAM,
    CD_PERSIST_MAX_DELIVERY,
    CD_PERSIST_MAX_THINK,
    CD_ICON_COPY,
    CD_ICON_DOWNLOAD,
    cdPersistClip,
    cdPersistMergeBody,
    cdPersistLoadJobSnapshot,
    cdPersistEnrichCardSaved,
    cdFinalizeSteps,
    cdBlockCallId,
    cdBlockSessionId,
    cdPersistKey,
    cdPersistKeyAliases,
    cdPersistBelongsToCall,
    cdPickMustStayHitl,
    cdPersistNormalize,
    cdPersistLoad,
    cdPersistScanByCallId,
    cdPersistLoadForCard,
    cdPersistPrune,
    cdPersistSave,
    cdPersistSaveCard,
    cdPersistClear,
    cdJobStepsFromRecord,
    cdJobElapsed,
    cdJobAliveHint,
    cdInitSteps,
    cdPipelineIndex,
    cdNormalizeStepId,
    cdMarkPriorDone,
    cdSealSteps,
    cdApplyStep,
    cdPlanSummary,
    cdFormatDuration
  };
}

// client-src/ui-vendor-mask.js
function maskVendorUiText(s) {
  if (s == null || s === "") return s;
  var t = String(s);
  t = t.replace(/Cursor\s*写码\s*插件/gi, "\u5199\u7801\u63D2\u4EF6");
  t = t.replace(/Cursor\s*插件/gi, "\u5199\u7801\u63D2\u4EF6");
  t = t.replace(/Cursor\s*写码/gi, "\u5199\u7801");
  t = t.replace(/Cursor\s*SDK/gi, "\u5199\u7801 SDK");
  t = t.replace(/Cursor\s*API\s*Key/gi, "\u5199\u7801 API Key");
  t = t.replace(/本机\s*Cursor/gi, "\u672C\u673A\u5199\u7801");
  t = t.replace(/调用\s*Cursor/gi, "\u8C03\u7528\u5199\u7801");
  t = t.replace(/启动\s*Cursor/gi, "\u542F\u52A8\u5199\u7801");
  t = t.replace(/并用\s*Cursor/gi, "\u5E76\u7528\u5199\u7801");
  t = t.replace(/Cursor/gi, "\u5199\u7801");
  return t;
}

// client-src/lanes/code-dev.js
function installCodeDev(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, workspaceDirFieldLabel = ctx.workspaceDirFieldLabel, workspaceDirFieldHint = ctx.workspaceDirFieldHint, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, mergeWorkspaceSuggestions = ctx.mergeWorkspaceSuggestions, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var _cdP = createCodeDevPersist();
  var CD_PIPELINE = _cdP.CD_PIPELINE;
  var CD_STEP_MAP = _cdP.CD_STEP_MAP;
  var CD_PERSIST_VER = _cdP.CD_PERSIST_VER;
  var CD_PERSIST_MIN_VER = _cdP.CD_PERSIST_MIN_VER;
  var CD_UI_REV = _cdP.CD_UI_REV;
  var CD_PERSIST_MAX_STREAM = _cdP.CD_PERSIST_MAX_STREAM;
  var CD_PERSIST_MAX_DELIVERY = _cdP.CD_PERSIST_MAX_DELIVERY;
  var CD_PERSIST_MAX_THINK = _cdP.CD_PERSIST_MAX_THINK;
  var CD_ICON_COPY = _cdP.CD_ICON_COPY;
  var CD_ICON_DOWNLOAD = _cdP.CD_ICON_DOWNLOAD;
  var cdPersistClip = _cdP.cdPersistClip;
  var cdPersistMergeBody = _cdP.cdPersistMergeBody;
  var cdPersistLoadJobSnapshot = _cdP.cdPersistLoadJobSnapshot;
  var cdPersistEnrichCardSaved = _cdP.cdPersistEnrichCardSaved;
  var cdFinalizeSteps = _cdP.cdFinalizeSteps;
  var cdBlockCallId = _cdP.cdBlockCallId;
  var cdBlockSessionId = _cdP.cdBlockSessionId;
  var cdPersistKey = _cdP.cdPersistKey;
  var cdPersistKeyAliases = _cdP.cdPersistKeyAliases;
  var cdPersistBelongsToCall = _cdP.cdPersistBelongsToCall;
  var cdPickMustStayHitl = _cdP.cdPickMustStayHitl;
  var cdPersistNormalize = _cdP.cdPersistNormalize;
  var cdPersistLoad = _cdP.cdPersistLoad;
  var cdPersistScanByCallId = _cdP.cdPersistScanByCallId;
  var cdPersistLoadForCard = _cdP.cdPersistLoadForCard;
  var cdPersistPrune = _cdP.cdPersistPrune;
  var cdPersistSave = _cdP.cdPersistSave;
  var cdPersistSaveCard = _cdP.cdPersistSaveCard;
  var cdPersistClear = _cdP.cdPersistClear;
  var cdJobStepsFromRecord = _cdP.cdJobStepsFromRecord;
  var cdJobElapsed = _cdP.cdJobElapsed;
  var cdJobAliveHint = _cdP.cdJobAliveHint;
  var cdInitSteps = _cdP.cdInitSteps;
  var cdPipelineIndex = _cdP.cdPipelineIndex;
  var cdNormalizeStepId = _cdP.cdNormalizeStepId;
  var cdMarkPriorDone = _cdP.cdMarkPriorDone;
  var cdSealSteps = _cdP.cdSealSteps;
  var cdApplyStep = _cdP.cdApplyStep;
  var cdPlanSummary = _cdP.cdPlanSummary;
  var cdFormatDuration = _cdP.cdFormatDuration;
  function cdEsc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function cdHl(cls, s) {
    return '<span class="' + cls + '">' + cdEsc(s) + "</span>";
  }
  var CD_JS_TOK = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*(?=\s*\()|\b(?:async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|interface|let|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|from|of|null|undefined|true|false|as|type|enum|declare|readonly)\b|\b\d+(?:\.\d+)?\b)/g;
  function cdHighlightJs(src) {
    var s = String(src || "");
    var out = [];
    var last = 0;
    var m;
    CD_JS_TOK.lastIndex = 0;
    while (m = CD_JS_TOK.exec(s)) {
      if (m.index > last) out.push(cdEsc(s.slice(last, m.index)));
      var tok = m[0];
      var cls = "wb-hl-op";
      if (/^\/\//.test(tok) || /^\/\*/.test(tok)) cls = "wb-hl-cmt";
      else if (/^['"`]/.test(tok)) cls = "wb-hl-str";
      else if (/^\d/.test(tok)) cls = "wb-hl-num";
      else if (/^[A-Za-z_$]/.test(tok)) {
        var ahead = s.slice(m.index + tok.length);
        cls = /^\s*\(/.test(ahead) ? "wb-hl-fn" : "wb-hl-kw";
        if (cls === "wb-hl-kw" && !/^(async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|interface|let|new|return|super|switch|this|throw|try|typeof|var|void|while|with|yield|from|of|null|undefined|true|false|as|type|enum|declare|readonly)$/.test(tok)) {
          cls = "wb-hl-op";
        }
      }
      out.push(cdHl(cls, tok));
      last = m.index + tok.length;
    }
    if (last < s.length) out.push(cdEsc(s.slice(last)));
    return out.join("") || cdEsc(s);
  }
  function cdHighlightAttrs(s) {
    var src = String(s || "");
    var out = [];
    var i = 0;
    while (i < src.length) {
      var ch = src[i];
      if (/\s/.test(ch)) {
        out.push(ch);
        i++;
        continue;
      }
      var nm = src.slice(i).match(/^[@#:.]?[\w-]+/);
      if (!nm) {
        out.push(cdEsc(ch));
        i++;
        continue;
      }
      out.push(cdHl("wb-hl-attr", nm[0]));
      i += nm[0].length;
      if (src[i] === "=") {
        out.push(cdHl("wb-hl-punct", "="));
        i++;
        var q = src[i];
        if (q === '"' || q === "'") {
          var j = i + 1;
          while (j < src.length && src[j] !== q) j++;
          out.push(cdHl("wb-hl-str", src.slice(i, j + 1)));
          i = j + 1;
        }
      }
    }
    return out.join("");
  }
  function cdHighlightTag(tag) {
    var s = String(tag || "");
    var m = s.match(/^(<\/?)([\w-]+)([\s\S]*?)(\/?>)$/);
    if (!m) return cdHl("wb-hl-tag", s);
    return cdHl("wb-hl-punct", m[1]) + cdHl("wb-hl-name", m[2]) + cdHighlightAttrs(m[3]) + cdHl("wb-hl-punct", m[4]);
  }
  function cdHighlightHtml(src) {
    var s = String(src || "");
    var out = [];
    var i = 0;
    while (i < s.length) {
      if (s.slice(i, i + 4) === "<!--") {
        var end = s.indexOf("-->", i);
        if (end < 0) {
          out.push(cdHl("wb-hl-cmt", s.slice(i)));
          break;
        }
        out.push(cdHl("wb-hl-cmt", s.slice(i, end + 3)));
        i = end + 3;
        continue;
      }
      if (s[i] === "<") {
        var gt = s.indexOf(">", i);
        if (gt < 0) {
          out.push(cdHl("wb-hl-tag", s.slice(i)));
          break;
        }
        out.push(cdHighlightTag(s.slice(i, gt + 1)));
        i = gt + 1;
        continue;
      }
      var next = s.indexOf("<", i);
      if (next < 0) next = s.length;
      var text = s.slice(i, next);
      if (text) out.push(cdEsc(text));
      i = next;
    }
    return out.join("") || cdEsc(s);
  }
  function cdHighlightCss(src) {
    return String(src || "").replace(/(\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[\da-fA-F]{3,8}\b|\b[\d.]+(?:px|em|rem|%|vh|vw)?\b)/g, function(tok) {
      if (/^\/\*/.test(tok)) return cdHl("wb-hl-cmt", tok);
      if (/^['"]/.test(tok)) return cdHl("wb-hl-str", tok);
      if (/^#/.test(tok) || /px|em|rem|%|vh|vw/.test(tok)) return cdHl("wb-hl-num", tok);
      return cdEsc(tok);
    });
  }
  function cdHighlightJson(src) {
    return String(src || "").replace(
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
      function(all, str, colon) {
        if (str && colon) return cdHl("wb-hl-attr", str) + colon;
        if (str) return cdHl("wb-hl-str", str);
        if (/^(true|false|null)$/.test(all)) return cdHl("wb-hl-kw", all);
        if (/^-?\d/.test(all)) return cdHl("wb-hl-num", all);
        return cdEsc(all);
      }
    );
  }
  function cdHighlightPython(src) {
    var s = String(src || "");
    if (!s) return "";
    var out = [];
    var i = 0;
    var n = s.length;
    var pendingFn = false;
    var PY_KW = /^(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|yield|lambda|pass|break|continue|raise|global|nonlocal|async|await|and|or|not|in|is|True|False|None)$/;
    var PY_BI = /^(len|range|print|str|int|float|bool|list|dict|set|tuple|type|isinstance|enumerate|zip|map|filter|sorted|min|max|sum|abs|open|super|staticmethod|classmethod|property|any|all|next|iter|repr|format|input|id|hash|hex|oct|bin|round|pow|divmod|chr|ord|bytes|bytearray|memoryview|object|Exception|ValueError|TypeError|KeyError|IndexError|AttributeError|RuntimeError)$/;
    while (i < n) {
      var tri = s.slice(i, i + 3);
      if (tri === '"""' || tri === "'''") {
        var j = i + 3;
        while (j + 2 < n && s.slice(j, j + 3) !== tri) j++;
        out.push(cdHl("wb-hl-doc", s.slice(i, Math.min(j + 3, n))));
        i = Math.min(j + 3, n);
        pendingFn = false;
        continue;
      }
      if (s[i] === "#") {
        var cj = i;
        while (cj < n && s[cj] !== "\n") cj++;
        out.push(cdHl("wb-hl-cmt", s.slice(i, cj)));
        i = cj;
        pendingFn = false;
        continue;
      }
      if (s[i] === '"' || s[i] === "'") {
        var q = s[i];
        var sj = i + 1;
        while (sj < n && s[sj] !== q) {
          if (s[sj] === "\\") sj++;
          sj++;
        }
        if (sj < n) sj++;
        out.push(cdHl("wb-hl-str", s.slice(i, sj)));
        i = sj;
        pendingFn = false;
        continue;
      }
      if (/[a-zA-Z_]/.test(s[i])) {
        var wm = s.slice(i).match(/^[A-Za-z_]\w*/);
        var w = wm ? wm[0] : s[i];
        var cls = "wb-hl-op";
        if (PY_KW.test(w)) {
          cls = "wb-hl-kw";
          pendingFn = w === "def" || w === "class";
        } else if (pendingFn) {
          cls = "wb-hl-fn";
          pendingFn = false;
        } else if (PY_BI.test(w)) {
          cls = "wb-hl-builtin";
        } else if (/^\s*\(/.test(s.slice(i + w.length))) {
          cls = "wb-hl-fn";
        }
        out.push(cdHl(cls, w));
        i += w.length;
        continue;
      }
      if (/\d/.test(s[i])) {
        var dm = s.slice(i).match(/^\d+(?:\.\d+)?/);
        out.push(cdHl("wb-hl-num", dm ? dm[0] : s[i]));
        i += dm ? dm[0].length : 1;
        pendingFn = false;
        continue;
      }
      out.push(cdEsc(s[i]));
      if (!/\s/.test(s[i])) pendingFn = false;
      i++;
    }
    return out.join("");
  }
  function cdHighlightVue(src) {
    var s = String(src || "");
    if (/<(template|script|style)\b/i.test(s)) {
      return s.replace(/(<(template|script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi, function(_all, open, kind, body, close) {
        var k = String(kind || "").toLowerCase();
        var mid = k === "script" ? cdHighlightJs(body) : k === "style" ? cdHighlightCss(body) : cdHighlightHtml(body);
        return cdHighlightTag(open) + mid + cdHighlightTag(close);
      });
    }
    return cdHighlightHtml(s);
  }
  function cdHighlightCode(lang, code) {
    var show = String(code || "");
    if (!show) return "";
    var lg = String(lang || "text").toLowerCase();
    if (lg === "vue") return cdHighlightVue(show);
    if (lg === "html" || lg === "xml") return cdHighlightHtml(show);
    if (/^(javascript|js|jsx|typescript|ts|tsx)$/.test(lg)) return cdHighlightJs(show);
    if (/^(python|py)$/.test(lg)) return cdHighlightPython(show);
    if (lg === "json") return cdHighlightJson(show);
    if (/^(css|scss|less)$/.test(lg)) return cdHighlightCss(show);
    return cdEsc(show);
  }
  function cdInline(s) {
    var raw = maskVendorUiText(String(s || ""));
    if (cdLineLooksLikeCode(raw) || raw.indexOf("\n") >= 0 && cdGuessLang(raw) !== "text") {
      return cdEsc(cdStripLineBackticks(raw));
    }
    var t = cdEsc(raw);
    t = t.replace(/`([^`\n]+)`/g, function(_all, inner) {
      var v = String(inner || "");
      if (v.length > 48 || cdLineLooksLikeCode(v) || /[{};=<>]|import |const |function |from /.test(v)) {
        return v;
      }
      return "<code>" + v + "</code>";
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return t;
  }
  function cdDeliveryStarts(t) {
    var s = String(t || "");
    var starts = [];
    var m;
    var re1 = /一句话结论/g;
    while (m = re1.exec(s)) starts.push(m.index);
    var re2 = /(^|\n|[。．])([ \t]*#{0,3}[ \t]*)说明方案/g;
    while (m = re2.exec(s)) {
      starts.push(m.index + (m[1] ? m[1].length : 0) + (m[2] ? m[2].length : 0));
    }
    var re3 = /(^|\n)\s*#{1,3}\s*说明方案/g;
    while (m = re3.exec(s)) starts.push(m.index + (m[1] ? m[1].length : 0));
    var re4 = /(^|\n)\s*\*\*结论\*\*/g;
    while (m = re4.exec(s)) starts.push(m.index + (m[1] ? m[1].length : 0));
    starts.sort(function(a, b) {
      return a - b;
    });
    var uniq = [];
    starts.forEach(function(at) {
      if (!uniq.length || at !== uniq[uniq.length - 1]) uniq.push(at);
    });
    return uniq;
  }
  function cdStripLineBackticks(line) {
    var s = String(line || "").trim();
    var m = s.match(/^`([^`]+)`$/);
    return m ? m[1] : String(line || "");
  }
  function cdGuessLang(text) {
    var t = String(text || "");
    if (/<(script|template|style)[\s>]|<el-[\w-]+/i.test(t)) return "vue";
    if (/\b(from __future__|mapped_column|sqlalchemy|async def |@router|@app\.)/.test(t)) return "python";
    if (/^\s*(def |class \w+|from \w+ import)/m.test(t)) return "python";
    if (/\b(import |export |const |let |function |=>)/.test(t)) return "javascript";
    if (/^\s*(from |import |class |def )/m.test(t)) return "python";
    return "text";
  }
  function cdLineLooksLikeCode(line) {
    var s = cdStripLineBackticks(line).trim();
    if (!s || /^```/.test(s)) return false;
    if (/^(from\s+\S+|import\s+|def\s+|class\s+|async\s+def|@router|@app|@\w|#\s|if\s+|elif\s+|else:|for\s+|while\s+|return\s+|try:|except|with\s+|pass\b|raise\b)/.test(s)) {
      return true;
    }
    if (/^(const |let |var |function |export |import |class |async )/.test(s)) return true;
    if (/^<script[\s>]/i.test(s) || /^<\/script>/i.test(s) || /^<template[\s>]/i.test(s) || /^<style[\s>]/i.test(s)) {
      return true;
    }
    if (/^\s*(<[\w-]+|<\/[\w-]+|<template|<script|<style|el-[\w-]+)/i.test(s)) return true;
    if (/^[A-Z_][A-Z0-9_]*\s*=/.test(s)) return true;
    if (/^\s*[})];?\s*$/.test(s)) return true;
    if (/[{}();=<>]/.test(s) && (s.match(/[\u4e00-\u9fff]/g) || []).length < 4) return true;
    if (/^\s{2,}\S/.test(String(line || ""))) return true;
    return false;
  }
  function cdLineLooksLikeProse(line) {
    var s = cdStripLineBackticks(line).trim();
    if (!s || cdLineLooksLikeCode(s)) return false;
    if (/[\u4e00-\u9fff]/.test(s) && !/[{};=<>]|import |const |function |from |def |class /.test(s)) return true;
    return false;
  }
  function cdRepairFlattenedCode(text, lang) {
    var s = String(text || "");
    if (!s) return s;
    var lg = String(lang || cdGuessLang(s) || "text").toLowerCase();
    s = s.replace(/(import)([A-Za-z_])/g, "$1 $2").replace(/(from)(['"])/g, "$1 $2").replace(/([A-Za-z0-9_\"'`)\]])(from|import|class|def|const|let|var|function|export|async|return)\b/g, "$1\n$2").replace(/(\"{3}|'{3})([A-Za-z_])/g, "$1\n$2").replace(/(#[^\n]*?)([A-Za-z_]\w*\s*[:=])/g, "$1\n$2").replace(/(\})(const|let|var|function|import|export|class)\b/g, "$1\n$2");
    if (lg === "python" || lg === "py") {
      return s.replace(/([;)\]}])(from\s+\w+\s+import\s+)/g, "$1\n$2").replace(/([;)\]}])(import\s+\w+)/g, "$1\n$2").replace(/([^\n:])(class\s+\w+)/g, "$1\n\n$2").replace(/([^\n:])(def\s+\w+)/g, "$1\n\n$2").replace(/([^\n])(@\w+)/g, "$1\n$2").replace(/datetimeimport/g, "datetime\nimport").replace(/timedelta(from|import)/g, "timedelta\n$1").replace(/(\w)(Mapped\[)/g, "$1\n    $2");
    }
    if (lg === "vue" || lg === "html" || lg === "xml") {
      return s.replace(/>\s*(<[\w-/!])/g, ">\n$1").replace(/(\/>)\s*(<[\w-/!])/g, "$1\n$2");
    }
    if (/^(javascript|js|jsx|typescript|ts|tsx)$/.test(lg)) {
      return s.replace(/([;{}])(const |let |var |function |class |export |import )/g, "$1\n$2").replace(/([;{}])(async function )/g, "$1\n$2");
    }
    return s;
  }
  function cdIsExplorationProse(text) {
    var t = String(text || "").trim();
    if (!t) return false;
    if (cdLineLooksLikeCode(t)) return false;
    if (cdDeliveryStarts(t).length) return false;
    if (/frontend\/|backend\/|\.vue|\.js|AppLayout|router\/|已删除|改为|重定向/.test(t)) return false;
    if (t.indexOf("```") >= 0) return false;
    if (/开始处理删除|阶段\s*\d+\s*\/\s*\d+|本机验尸|已删除|已修补|正在同步|引擎将删除|引擎直接删除|无需再删|删除清单|验尸通过|下线「/.test(
      t
    )) {
      return false;
    }
    var compact = t.replace(/\s+/g, "");
    if (compact.length > 96) return false;
    return /正在定位|正在搜索|正在分析|正在探索|先定位|开始分析|接下来|准备|沙箱|未发现|怀疑|发现|宿主机|git |已理解需求|将按 A/.test(
      t
    );
  }
  function cdStripExplorationFromProcess(text) {
    var t = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!t) return "";
    if (t.indexOf("```") >= 0) return t;
    var paras = t.split(/\n{2,}/);
    var kept = [];
    paras.forEach(function(para) {
      var chunk = String(para || "").trim();
      if (!chunk) return;
      if (cdIsExplorationProse(chunk)) return;
      kept.push(chunk);
    });
    return kept.join("\n\n").trim();
  }
  function cdProcessOverlapsThink(processText, thinkText) {
    var p = String(processText || "").replace(/\s+/g, "").trim();
    var th = String(thinkText || "").replace(/\s+/g, "").trim();
    if (!p || !th) return false;
    if (p.length < 24) return false;
    if (p.length > 96 && th.indexOf(p.slice(0, 96)) >= 0) return true;
    if (p.length <= 160 && th.indexOf(p) >= 0 && p.length / Math.max(th.length, 1) > 0.85) return true;
    return false;
  }
  function cdRouteStreamChannels(text) {
    var t = cdStripBoilerplate(String(text || "")).replace(/\r\n/g, "\n");
    if (!t.trim()) return { process: "", delivery: "" };
    var starts = cdDeliveryStarts(t);
    if (!starts.length) {
      if (/^(说明方(?:案)?|一句话结论?|(\*\*)?结论(\*\*)?)/.test(t.trim())) {
        return { process: "", delivery: t.trim() };
      }
      return { process: cdStripExplorationFromProcess(t.trim()), delivery: "" };
    }
    var d0 = starts[starts.length - 1];
    return {
      process: cdStripExplorationFromProcess(t.slice(0, starts[0]).replace(/[ \t。.;；、，]+$/g, "").trim()),
      delivery: t.slice(d0).trim()
    };
  }
  function cdSplitDelivery(text) {
    var routed = cdRouteStreamChannels(text);
    return { process: routed.process, delivery: routed.delivery };
  }
  function cdDedupeLines(arr) {
    var out = [];
    (arr || []).forEach(function(s) {
      var t = String(s || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      var dup = out.some(function(x) {
        var y = String(x || "").replace(/\s+/g, " ").trim();
        if (t === y) return true;
        if (t.length > 48 && y.indexOf(t.slice(0, 48)) >= 0) return true;
        if (y.length > 48 && t.indexOf(y.slice(0, 48)) >= 0) return true;
        return false;
      });
      if (!dup) out.push(String(s || "").trim());
    });
    return out;
  }
  function cdNormalizeDelivery(text) {
    var t = String(text || "").replace(/\r\n/g, "\n").trim();
    t = t.replace(/^#{0,3}[ \t]*说明方案[ \t]*/m, "");
    t = t.replace(/一句话结论[ \t]*[：:]?[ \t]*/g, "\u7ED3\u8BBA\n");
    t = t.replace(/^#{0,3}[ \t]*(?:一句话结论|说明方案)\b[ \t]*[：:]?[ \t]*/m, "\u7ED3\u8BBA\n");
    t = t.replace(/未改动文件/g, "\u672A\u6539\u52A8\u3002\n\u6539\u52A8\u6587\u4EF6\n");
    t = t.replace(/行为约定/g, "\n\u884C\u4E3A\u7EA6\u5B9A\n");
    t = t.replace(/\s*-?\s*(已删除|保留|未改动)[：:]/g, "\n$1\uFF1A");
    t = t.replace(/\s+-\s+(frontend|backend|apps|src|desktop|host)\//g, "\n- $1/");
    t = t.replace(/^[ \t]*\*\*(结论|改动文件|行为约定|验收)\*\*[ \t]*[：:]?[ \t]*/gm, "$1\n");
    t = t.replace(/^[ \t]*\*\*?结论\*\*?[ \t]*[：:]?[ \t]*/gm, "\u7ED3\u8BBA\n");
    t = t.replace(/^[ \t]*做了什么[ \t]*[：:]?[ \t]*/gm, "\u7ED3\u8BBA\n");
    t = t.replace(/^[ \t]*改动文件表?[ \t]*[：:]?[ \t]*/gm, "\u6539\u52A8\u6587\u4EF6\n");
    t = t.replace(/^[ \t]*行为约定[ \t]*[：:]?[ \t]*/gm, "\u884C\u4E3A\u7EA6\u5B9A\n");
    t = t.replace(/^[ \t]*验收(?:步骤)?[ \t]*[：:]?[ \t]*/gm, "\u9A8C\u6536\n");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }
  function cdIsToolEcho(s) {
    var t = String(s || "").trim().replace(/`/g, "");
    if (/^(搜索|查找文件|列出|写入|阅读|查看|语义搜索)$/.test(t)) return true;
    if (!/^(阅读|查看|写入|列出|搜索|查找文件|语义搜索)\s+\S/.test(t)) return false;
    if (/[\/\\]/.test(t) || /\.\w{1,10}\b/.test(t)) return true;
    var rest = t.replace(/^(阅读|查看|写入|列出|搜索|查找文件|语义搜索)\s+/, "");
    return /^(frontend|backend|apps|src|desktop|host|DSH-ZR-WorkBuddy|pythonProject[\w.-]*|[A-Za-z0-9_.-]+)$/i.test(rest);
  }
  function cdScrubAbs(text) {
    return cdStripBoilerplate(
      String(text || "").replace(/\/[^\s\"']*sandboxes\/ldj-[a-f0-9]+\//gi, "").replace(/\/Users\/[^\s\"']+\/sandboxes\/ldj-[a-f0-9]+\//gi, "")
    );
  }
  function cdScrubProcess(text) {
    var t = cdScrubAbs(text);
    var inFence = false;
    return t.split("\n").map(function(line) {
      var raw = String(line || "");
      if (raw.trim().indexOf("```") === 0) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      if (cdLineLooksLikeCode(raw)) return "";
      if (/^\s*-\s+(阅读|查看|搜索|查找文件|写入|列出|修改|执行|检索)/.test(raw)) {
        return raw;
      }
      var scrubbed = raw.replace(/(?:阅读|查看|搜索|查找文件|写入|列出|语义搜索)\s*`[^`]+`/g, "").replace(
        /(?:阅读|查看|搜索|查找文件|写入|列出|语义搜索)\s+(?:frontend|backend|apps|src|desktop|host)\/[\w./@-]+/gi,
        ""
      ).replace(
        /(?:阅读|查看|搜索|查找文件|写入|列出|语义搜索)\s+(frontend|backend|apps|src|desktop|host|DSH-ZR-WorkBuddy|pythonProject[\w.-]*|agent-transcripts)\b/gi,
        ""
      ).replace(/(?:阅读|查看|写入|列出)\s+[\w./@-]+\.[A-Za-z0-9]+/g, "");
      var keep = [];
      scrubbed.split(/[。．]/).forEach(function(b) {
        var s = b.trim();
        if (!s) return;
        if (cdIsToolEcho(s)) return;
        keep.push(s);
      });
      return keep.join("\u3002");
    }).join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
  }
  function cdLooksLikeFileChange(line) {
    var s = String(line || "").trim();
    if (!s || s.length > 400) return false;
    if (/^(frontend|backend|apps|src|desktop|host)\//.test(s)) return true;
    return /^[\w./@-]+\.[A-Za-z0-9]+(?:\s*[—–-]\s+\S)/.test(s);
  }
  function cdIsSepOnly(line) {
    var s = String(line || "").trim();
    return /-{3,}/.test(s) && /^[-–—|: \t]+$/.test(s);
  }
  function cdIsJunkHeader(line) {
    var s = String(line || "").replace(/\t+/g, " ").trim();
    if (cdIsSepOnly(s)) return true;
    return /^(列|说明|文件)(\s+(列|说明|文件))*$/.test(s);
  }
  function cdIsPipeTableStart(lines, i) {
    var a = String(lines[i] || "");
    var b = String(lines[i + 1] || "");
    return /^\s*\|/.test(a) && /\|/.test(a) && /^\s*\|?\s*[-:| ]+$/.test(b) && /-{3,}/.test(b);
  }
  function cdSplitKv(line) {
    var s = String(line || "");
    if (/\t/.test(s)) {
      var p = s.split("	").map(function(c) {
        return c.trim();
      }).filter(Boolean);
      if (p.length >= 2) return p;
    }
    var dash = s.split(/\s+[—–]\s+/);
    if (dash.length === 2 && dash[0].trim() && dash[1].trim()) {
      return [dash[0].trim(), dash[1].trim()];
    }
    return null;
  }
  function cdFileLi(pathPart, desc) {
    var path = String(pathPart || "").trim();
    var extra = String(desc || "").trim();
    if (path.indexOf("	") >= 0) {
      var tb = path.split("	").map(function(x) {
        return x.trim();
      }).filter(Boolean);
      path = tb[0] || path;
      extra = extra || tb.slice(1).join(" ");
    }
    var dm = path.split(/\s+[—–-]\s+/);
    if (dm.length >= 2 && !extra) {
      path = dm[0].trim();
      extra = dm.slice(1).join(" \u2014 ").trim();
    }
    return "<li><code>" + cdEsc(path) + "</code>" + (extra ? "\uFF1A" + cdInline(extra) : "") + "</li>";
  }
  function cdExplodeFileChunks(s) {
    return String(s || "").split(/(?=\s*-\s*(?:frontend|backend|apps|src|desktop|host)\/)/).map(function(x) {
      return x.replace(/^[-*]\s*/, "").trim();
    }).filter(Boolean);
  }
  function cdBuildDocProseHtml(t) {
    var conclusion = [];
    var files = [];
    var rules = [];
    var checks = [];
    var mode = "conclusion";
    function pushFile(chunk) {
      var path = String(chunk || "").replace(/`/g, "");
      var sp = path.split(/[：:]/);
      if (sp.length < 2) sp = path.split(/\s+[—–-]\s+/);
      files.push({ path: (sp[0] || path).trim(), desc: sp.slice(1).join("\uFF1A").trim() });
    }
    String(t || "").split("\n").forEach(function(line) {
      var s = line.trim().replace(/^[-*]\s+/, "");
      if (!s) return;
      var body = s.replace(/^#{1,3}\s*/, "");
      if (/^(结论|一句话结论|做了什么|说明方案)/.test(body)) {
        mode = "conclusion";
        var rest = body.replace(/^(说明方案|一句话结论|做了什么|结论)[：:]?/, "").trim();
        if (rest) conclusion.push(rest);
        return;
      }
      if (/^改动文件/.test(body)) {
        mode = "files";
        var after = body.replace(/^改动文件表?[：:]?/, "").trim();
        if (after) cdExplodeFileChunks(after).forEach(pushFile);
        return;
      }
      if (/^行为约定/.test(body)) {
        mode = "rules";
        var rrest = body.replace(/^行为约定[：:]?/, "").trim();
        if (rrest) rules.push(rrest);
        return;
      }
      if (/^验收/.test(body)) {
        mode = "checks";
        var crest = body.replace(/^验收(?:步骤)?[：:]?/, "").trim().replace(/^\d+[\.、]\s*/, "");
        if (crest) checks.push(crest);
        return;
      }
      if (/^(已删除|保留|未改动)/.test(s)) {
        mode = "rules";
        rules.push(s);
        return;
      }
      if (/^\d+[\.、]/.test(s)) {
        mode = "checks";
        checks.push(s.replace(/^\d+[\.、]\s*/, ""));
        return;
      }
      var chunks = cdExplodeFileChunks(s);
      var looksFiles = chunks.length > 1 || cdLooksLikeFileChange(s) || /^(frontend|backend|apps|src|desktop|host)\//.test(s) || /`[^`]+\/[^`]+\.[A-Za-z0-9]+`/.test(s);
      if (looksFiles) {
        mode = "files";
        chunks.forEach(pushFile);
        return;
      }
      if (mode === "files" && files.length) {
        files[files.length - 1].desc += (files[files.length - 1].desc ? " " : "") + s;
        return;
      }
      if (mode === "rules") {
        rules.push(s);
        return;
      }
      if (mode === "checks") {
        checks.push(s);
        return;
      }
      conclusion.push(s);
    });
    conclusion = cdDedupeLines(conclusion);
    rules = cdDedupeLines(rules);
    checks = cdDedupeLines(checks);
    var html = "";
    if (conclusion.length) {
      html += "<h3>\u7ED3\u8BBA</h3>";
      String(conclusion.join(" ")).split(/([。！？])/).reduce(function(acc, part, idx, arr) {
        if (/[。！？]/.test(part)) return acc;
        var mark = arr[idx + 1] && /[。！？]/.test(arr[idx + 1]) ? arr[idx + 1] : "";
        var s = (part + mark).trim();
        if (s) acc.push("<p>" + cdInline(s) + "</p>");
        return acc;
      }, []).forEach(function(p) {
        html += p;
      });
    }
    if (files.length) {
      html += "<h3>\u6539\u52A8\u6587\u4EF6</h3><ul>" + files.map(function(f) {
        return cdFileLi(f.path, f.desc);
      }).join("") + "</ul>";
    }
    if (rules.length) {
      html += "<h3>\u884C\u4E3A\u7EA6\u5B9A</h3><ul>" + rules.map(function(r) {
        return "<li>" + cdInline(r) + "</li>";
      }).join("") + "</ul>";
    }
    if (checks.length) {
      html += "<h3>\u9A8C\u6536</h3><ol>" + checks.map(function(c) {
        return "<li>" + cdInline(c) + "</li>";
      }).join("") + "</ol>";
    }
    return html;
  }
  function cdStripAllCodeText(text) {
    var raw = String(text || "").replace(/\r\n/g, "\n");
    if (!raw.trim()) return "";
    if (raw.indexOf("```") >= 0) {
      var out = [];
      cdFenceParts(raw).forEach(function(part) {
        if (part.t === "code") return;
        var prose = cdStripAllCodeText(part.v);
        if (String(prose || "").trim()) out.push(prose);
      });
      return out.join("\n\n");
    }
    return cdStripBareCodeText(raw);
  }
  function cdBuildDocHtml(raw) {
    var prepared = cdStripAllCodeText(cdScrubAbs(cdNormalizeDelivery(raw)).replace(/\*\*/g, ""));
    if (!String(prepared || "").trim()) return "";
    return cdBuildDocProseHtml(prepared) || cdMdBlocksProse(prepared);
  }
  function cdStripBareCodeText(text) {
    var raw = String(text || "").replace(/\r\n/g, "\n");
    if (!raw.trim()) return "";
    if (raw.indexOf("```") >= 0) {
      var out = [];
      cdFenceParts(raw).forEach(function(part) {
        if (part.t === "code") {
          var body = String(part.v || "").trim();
          if (!body && !part.streaming) return;
          var lang = part.lang || cdGuessLang(body) || "text";
          out.push("```" + lang + "\n" + cdRepairFlattenedCode(body, lang) + "\n```");
          return;
        }
        var prose = cdStripBareCodeText(part.v);
        if (String(prose || "").trim()) out.push(prose);
      });
      return out.join("\n\n");
    }
    var kept = [];
    raw.split("\n").forEach(function(line) {
      var rawLine = String(line || "");
      if (/^```/.test(rawLine.trim())) return;
      var inner = cdStripLineBackticks(rawLine).trim();
      if (cdLineLooksLikeCode(inner) && !cdLineLooksLikeProse(rawLine)) return;
      if (inner) kept.push(rawLine);
    });
    return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function cdWrapCodeRunsInner(text) {
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var out = [];
    var run = [];
    function flushRun() {
      if (!run.length) return;
      var norm = run.map(function(ln) {
        return cdStripLineBackticks(ln);
      });
      var body = norm.join("\n").replace(/^\n+|\n+$/g, "");
      run = [];
      if (!body.trim()) return;
      var lang = cdDetectCodeLangFromLines(norm) || cdGuessLang(body);
      if (lang === "text" && !cdLineLooksLikeCode(body.split("\n")[0] || "")) {
        out.push(body);
        return;
      }
      out.push("```" + lang + "\n" + cdRepairFlattenedCode(body, lang) + "\n```");
    }
    lines.forEach(function(line) {
      var raw = String(line || "");
      if (/^```/.test(raw.trim())) {
        flushRun();
        out.push(line);
        return;
      }
      var inner = cdStripLineBackticks(raw).trim();
      var wrapped = /^`[^`]+`$/.test(String(raw || "").trim());
      if (cdLineLooksLikeCode(raw) || wrapped || run.length && !inner) {
        run.push(wrapped ? inner : raw);
        return;
      }
      if (run.length && !cdLineLooksLikeProse(raw)) {
        run.push(raw);
        return;
      }
      flushRun();
      out.push(line);
    });
    flushRun();
    return out.join("\n");
  }
  function cdForceCodeFences(text) {
    var raw = String(text || "").replace(/\r\n/g, "\n");
    if (!raw.trim()) return raw;
    if (raw.indexOf("```") < 0) return cdWrapCodeRunsInner(raw);
    var out = [];
    cdFenceParts(raw).forEach(function(part) {
      if (part.t === "code") {
        var body = String(part.v || "").trim();
        if (!body && !part.streaming) return;
        var lang = part.lang || cdGuessLang(body) || "text";
        out.push("```" + lang + "\n" + cdRepairFlattenedCode(body, lang) + "\n```");
        return;
      }
      var prose = cdWrapCodeRunsInner(String(part.v || ""));
      if (String(prose || "").trim()) out.push(prose);
    });
    return out.join("\n\n");
  }
  function cdWrapCodeRuns(text) {
    return cdForceCodeFences(text);
  }
  function cdWrapMarkupRuns(text) {
    return cdForceCodeFences(text);
  }
  function cdNormalizeRawCodeFences(text) {
    var t = String(text || "").replace(/\r\n/g, "\n").trim();
    if (!t || t.indexOf("```") >= 0) return text || "";
    var langHead = t.match(/^(vue|javascript|typescript|python|json|html|css|bash|sh|sql|js|ts|tsx|jsx)\s*\n([\s\S]+)$/i);
    if (langHead && cdKnownLang(langHead[1].toLowerCase())) {
      return "```" + langHead[1].toLowerCase() + "\n" + langHead[2].trim() + "\n```";
    }
    var parts = t.split(/\n{2,}/);
    var out = [];
    var changed = false;
    parts.forEach(function(p) {
      var s = String(p || "").trim();
      if (!s) return;
      var lang = "";
      if (/^<(template|script|style)\b/i.test(s)) lang = "vue";
      else if (/^<[\w-]+/.test(s.trim()) || /<el-[\w-]+/.test(s)) lang = "vue";
      else if (/^(import |export |const |let |function |class |async function )/.test(s)) lang = "javascript";
      else if (/^(def |class .*:|from .* import)/.test(s)) lang = "python";
      else if (/^\{[\s\S]*\:\s*[\s\S]*\}$/.test(s) && s.indexOf('"') >= 0) lang = "json";
      if (lang) {
        changed = true;
        out.push("```" + lang + "\n" + s + "\n```");
      } else {
        out.push(s);
      }
    });
    return changed ? out.join("\n\n") : text || "";
  }
  function cdDetectCodeLangFromLines(para) {
    var lines = (para || []).map(function(l) {
      return cdStripLineBackticks(l);
    });
    if (!lines.length) return "";
    var joined = lines.join("\n").trim();
    if (!joined) return "";
    if (/^<script[\s>]/i.test(joined) || /<script[\s>]/i.test(joined)) return "vue";
    if (/^<(template|script|style)\b/i.test(joined)) return "vue";
    if (/^<[\w-]+/.test(joined.trim()) || /<el-[\w-]+/.test(joined)) return "vue";
    if (/^(import |export |const |let |function |class |async function )/m.test(joined)) return "javascript";
    if (/import\s+\{/.test(joined) && /from\s+['"]/.test(joined)) return "javascript";
    if (/^(def |class .*:|from .* import)/m.test(joined)) return "python";
    var head = lines[0].trim();
    if (/^(vue|javascript|typescript|python|json|html|css|bash|sh|sql|js|ts|tsx|jsx)$/i.test(head) && lines.length > 1) {
      return head.toLowerCase();
    }
    if (/^[\s<][\s\S]*>/.test(joined) && /<\/?[\w-]+/.test(joined)) return "vue";
    return "";
  }
  function cdCodeBodyFromPara(para, lang) {
    var lines = (para || []).map(function(l) {
      return cdStripLineBackticks(l);
    });
    var joined = lines.join("\n").trim();
    var head = lines[0] ? lines[0].trim() : "";
    if (lang && head && head.toLowerCase() === String(lang).toLowerCase() && lines.length > 1) {
      return lines.slice(1).join("\n").trim();
    }
    return joined;
  }
  function cdNormalizeFences(text) {
    var t = String(text || "").replace(/\r\n/g, "\n");
    t = t.replace(/([^\n])```/g, "$1\n```");
    t = t.replace(/```([A-Za-z][A-Za-z0-9_+-]*)\s*\{/g, "```$1\n{");
    t = t.replace(/\}```/g, "}\n```");
    return t;
  }
  function cdCodeExtForLang(lang) {
    var lg = String(lang || "text").toLowerCase();
    var map = {
      python: "py",
      py: "py",
      javascript: "js",
      js: "js",
      jsx: "jsx",
      typescript: "ts",
      ts: "ts",
      tsx: "tsx",
      vue: "vue",
      html: "html",
      css: "css",
      json: "json",
      bash: "sh",
      sh: "sh",
      sql: "sql",
      java: "java",
      go: "go",
      rust: "rs"
    };
    return map[lg] || "txt";
  }
  function cdCodeToolbarHtml(lang) {
    var ext = cdCodeExtForLang(lang);
    return '<div class="wb-cd-codeacts"><button type="button" class="wb-cd-codebtn" data-cd-copy title="\u590D\u5236\u4EE3\u7801">' + CD_ICON_COPY + '<span class="wb-cd-codebtn-label">\u590D\u5236</span></button><button type="button" class="wb-cd-codebtn" data-cd-download data-cd-ext="' + cdEsc(ext) + '" title="\u4E0B\u8F7D\u4EE3\u7801">' + CD_ICON_DOWNLOAD + '<span class="wb-cd-codebtn-label">\u4E0B\u8F7D</span></button></div>';
  }
  function cdCodeHtml(lang, body, streaming) {
    var guessed = cdGuessLang(body);
    var langLabel = String(lang || guessed || "text").trim() || "text";
    if (langLabel === "text" && guessed !== "text") langLabel = guessed;
    var show = cdRepairFlattenedCode(String(body || ""), langLabel);
    if (!String(show || "").trim()) {
      if (streaming) show = "\u2026";
      else return "";
    }
    var inner = streaming && show.length > 16e3 ? cdEsc(show) : cdHighlightCode(langLabel, show);
    return '<div class="wb-cd-codewrap' + (streaming ? " wb-cd-codewrap-streaming" : "") + '"><div class="wb-cd-codebar"><span class="wb-cd-codelang">' + cdEsc(langLabel) + "</span>" + cdCodeToolbarHtml(langLabel) + '</div><pre class="wb-cd-code"><code class="wb-hl-root">' + inner + "</code></pre></div>";
  }
  function cdKnownLang(lang) {
    return /^(javascript|js|jsx|ts|tsx|typescript|vue|python|py|bash|sh|zsh|shell|json|html|css|scss|less|yaml|yml|diff|text|txt|plaintext|md|markdown|sql|go|rust|java|c|cpp|xml|toml|ini|dockerfile)$/i.test(
      String(lang || "").trim()
    );
  }
  function cdSplitFenceLang(langLine) {
    var s = String(langLine || "").trim();
    var m = s.match(/^([A-Za-z][A-Za-z0-9_+-]*)([\s{\[\(<].*)?$/);
    if (m && cdKnownLang(m[1])) {
      return { lang: m[1], rest: String(m[2] || "").replace(/^\s+/, "") };
    }
    return { lang: s, rest: "" };
  }
  function cdFenceCloseAt(src, from) {
    var q = from;
    while (q < src.length) {
      var at = src.indexOf("```", q);
      if (at < 0) return -1;
      if (at === 0 || src[at - 1] === "\n") return at;
      q = at + 3;
    }
    return -1;
  }
  function cdFenceParts(raw) {
    var src = cdNormalizeFences(raw);
    var parts = [];
    var i = 0;
    while (i < src.length) {
      var start = src.indexOf("```", i);
      while (start > 0 && src[start - 1] !== "\n") {
        start = src.indexOf("```", start + 3);
      }
      if (start < 0) {
        parts.push({ t: "md", v: src.slice(i) });
        break;
      }
      if (start > i) parts.push({ t: "md", v: src.slice(i, start) });
      var after = start + 3;
      var nl = src.indexOf("\n", after);
      var langLine = ((nl < 0 ? src.slice(after) : src.slice(after, nl)) || "").trim();
      var splitLang = cdSplitFenceLang(langLine);
      var lang = splitLang.lang;
      var prefixBody = splitLang.rest;
      if (nl < 0) {
        if (cdKnownLang(lang) && prefixBody) {
          parts.push({ t: "code", lang, v: prefixBody, streaming: true });
        } else if (cdKnownLang(lang)) {
          parts.push({ t: "code", lang, v: "", streaming: true });
        } else {
          parts.push({ t: "md", v: src.slice(start).replace(/^```/, "") });
        }
        break;
      }
      var bodyStart = nl + 1;
      var close = cdFenceCloseAt(src, bodyStart);
      var rawBody = close < 0 ? src.slice(bodyStart) : src.slice(bodyStart, close);
      var body = ((prefixBody ? prefixBody + "\n" : "") + rawBody).replace(/\s+$/, "");
      var streaming = close < 0;
      if (cdKnownLang(lang)) {
        if (body || streaming) {
          parts.push({ t: "code", lang: lang || "text", v: body, streaming });
        }
        if (close < 0) break;
        i = close + 3;
        if (src[i] === "\n") i++;
        continue;
      }
      var junk = !body && !streaming || /^[。．、，；;:!！？?\s`]+$/.test(body) || body.length < 12 && !cdKnownLang(lang) && /[\u4e00-\u9fff]/.test(body);
      if (junk || !cdKnownLang(lang) && body.length < 48 && body.indexOf("\n") < 0 && !streaming) {
        parts.push({ t: "md", v: body || lang });
        if (close < 0) break;
        i = close + 3;
        if (src[i] === "\n") i++;
        continue;
      }
      if (body || streaming) {
        parts.push({ t: "code", lang: lang || "text", v: body, streaming });
      }
      if (close < 0) break;
      i = close + 3;
      if (src[i] === "\n") i++;
    }
    return parts;
  }
  function cdPipeCells(line) {
    return String(line || "").replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map(function(c) {
      return c.trim();
    }).filter(Boolean);
  }
  function cdIsHeaderCells(cells) {
    var joined = (cells || []).join(" ");
    return /^(列|说明|文件|路径|改动)(\s+(列|说明|文件|路径|改动))*$/.test(joined);
  }
  function cdMdTable(rows) {
    var parsed = (rows || []).filter(function(r) {
      return !cdIsSepOnly(r);
    }).map(cdPipeCells).filter(function(r) {
      return r.length && !cdIsHeaderCells(r);
    });
    if (!parsed.length) return "";
    var items = parsed.map(function(r) {
      if (r.length >= 2 && (cdLooksLikeFileChange(r[0]) || /[./].+\.[A-Za-z0-9]+$/.test(r[0]))) {
        return cdFileLi(r[0], r.slice(1).join(" "));
      }
      if (r.length >= 2) {
        return "<li><strong>" + cdInline(r[0]) + "</strong>\uFF1A" + cdInline(r.slice(1).join(" ")) + "</li>";
      }
      return "<li>" + cdInline(r[0]) + "</li>";
    });
    return "<ul>" + items.join("") + "</ul>";
  }
  function cdSectionTitle(line) {
    return String(line || "").trim().replace(/^#{1,3}\s*/, "").replace(/^\*\*|\*\*$/g, "").replace(/[\t ]+$/, "").replace(/[:：]\s*$/, "");
  }
  function cdIsSectionLine(line) {
    var section = cdSectionTitle(line);
    return /^(说明方案|一句话结论|结论|做了什么|改动文件表|改动文件|行为约定.*|验收步骤|验收|菜单与路由|后端接口|页面功能|路由\/菜单|接口)$/.test(
      section
    );
  }
  function cdProcNodeKind(tag, lines) {
    var blob = [tag].concat(lines || []).join(" ");
    if (/搜索|检索|查找|grep|Glob|定位待删|网页/.test(blob)) return "search";
    if (/查看|阅读|浏览|Read|打开|核对|确认.*路由|确认.*菜单|读盘/.test(blob)) return "read";
    if (/删除清单|清单|待删路径|阶段\s*\d+/.test(blob) || tag === "\u6E05\u5355") return "list";
    return "dot";
  }
  function cdProcNodeHtml(kind, isLast) {
    var k = kind || "dot";
    var live = isLast ? " is-live" : "";
    if (k === "search") {
      return '<span class="wb-cd-proc-node is-search' + live + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span>';
    }
    if (k === "read") {
      return '<span class="wb-cd-proc-node is-read' + live + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h8l3 3v13H7V4z"/><path d="M15 4v3h3"/><path d="M9 12h6M9 16h6"/></svg></span>';
    }
    if (k === "list") {
      return '<span class="wb-cd-proc-node is-list' + live + '" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7h11M8 12h11M8 17h11"/><circle cx="4.5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17" r="1" fill="currentColor" stroke="none"/></svg></span>';
    }
    return '<span class="wb-cd-proc-node is-dot' + live + '" aria-hidden="true"></span>';
  }
  function cdMdBlocksProseProcess(text) {
    var raw = String(text || "").replace(/\r\n/g, "\n");
    raw = raw.replace(
      /([^\n])\n(?!\n)(阶段\s*\d+\s*\/\s*\d+|开始处理|Cursor 定位说明|本机验尸|本机核对|本机代码已核对|正在同步|正在本机|已删除|已修补|定位过程|引擎将|引擎校验|引擎直接)/g,
      "$1\n\n$2"
    ).replace(/(Cursor 定位说明[：:])\s*/g, "$1\n").replace(/([、，])(`(?:frontend|backend|apps|src)\/[^`]+`)/g, "$1\n$2");
    var chunks = raw.split(/\n{2,}/).map(function(c) {
      return String(c || "").trim();
    }).filter(Boolean);
    if (!chunks.length) return "";
    var items = [];
    chunks.forEach(function(chunk) {
      var lines = chunk.split("\n").map(function(ln) {
        return String(ln || "").trim();
      }).filter(function(ln) {
        return ln && !cdIsJunkHeader(ln) && !cdLineLooksLikeCode(ln);
      });
      if (!lines.length) return;
      var tag = "";
      var first = lines[0];
      var mStage = first.match(/^(阶段\s*\d+\s*\/\s*\d+)[：:]\s*(.*)$/);
      var mCursor = first.match(/^Cursor 定位说明[：:]?\s*(.*)$/i);
      var mPlan = first.match(/^#{0,3}\s*删除清单\s*$/);
      if (mStage) {
        tag = String(mStage[1] || "").replace(/\s+/g, "");
        var rest = String(mStage[2] || "").trim();
        lines = rest ? [rest].concat(lines.slice(1)) : lines.slice(1);
      } else if (mCursor) {
        tag = "\u5B9A\u4F4D";
        var restC = String(mCursor[1] || "").trim();
        lines = restC ? [restC].concat(lines.slice(1)) : lines.slice(1);
      } else if (mPlan) {
        tag = "\u6E05\u5355";
        lines = lines.slice(1);
      }
      if (!lines.length) return;
      var pathLines = [];
      var textLines = [];
      lines.forEach(function(ln) {
        var pathOnly = ln.replace(/^[-*]\s*/, "").replace(/^`([^`]+)`$/, "$1");
        var mBullet = ln.match(/^[-*]\s+`([^`]+)`\s*[：:]?\s*(.*)$/);
        if (mBullet) {
          pathLines.push({ path: mBullet[1], desc: String(mBullet[2] || "").trim() });
          return;
        }
        if (/^(frontend|backend|apps|src)\//.test(pathOnly) && pathOnly.indexOf(" ") < 0) {
          pathLines.push({ path: pathOnly, desc: "" });
          return;
        }
        textLines.push(ln);
      });
      var kind = cdProcNodeKind(tag, textLines.length ? textLines : lines);
      var bodyHtml = "";
      if (tag) {
        bodyHtml += '<div class="wb-cd-proc-meta">' + cdInline(tag) + "</div>";
      }
      bodyHtml += textLines.map(function(ln) {
        return '<div class="wb-cd-proc-t">' + cdInline(ln) + "</div>";
      }).join("");
      if (pathLines.length) {
        if (tag === "\u6E05\u5355" || kind === "list") {
          bodyHtml += '<ul class="wb-cd-proc-links">' + pathLines.map(function(p) {
            return "<li><code>" + cdInline(p.path) + "</code>" + (p.desc ? "\uFF1A" + cdInline(p.desc) : "") + "</li>";
          }).join("") + "</ul>";
        } else {
          bodyHtml += pathLines.map(function(p) {
            return '<div class="wb-cd-proc-path">' + cdInline(p.path) + (p.desc ? "\uFF1A" + cdInline(p.desc) : "") + "</div>";
          }).join("");
        }
      }
      items.push({ kind, bodyHtml });
    });
    if (!items.length) return "";
    return '<ul class="wb-cd-proc">' + items.map(function(it, idx) {
      return '<li class="wb-cd-proc-li"><span class="wb-cd-proc-rail">' + cdProcNodeHtml(it.kind, idx === items.length - 1) + '</span><div class="wb-cd-proc-body">' + it.bodyHtml + "</div></li>";
    }).join("") + "</ul>";
  }
  function cdMdBlocksProse(text) {
    var lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (!String(line || "").trim() || cdIsJunkHeader(line)) {
        i++;
        continue;
      }
      if (cdLineLooksLikeCode(line)) {
        var codeRun = [line];
        i++;
        while (i < lines.length && (cdLineLooksLikeCode(lines[i]) || !String(lines[i] || "").trim() || /^\s{2,}\S/.test(String(lines[i] || "")))) {
          if (String(lines[i] || "").trim()) codeRun.push(lines[i]);
          else if (codeRun.length) codeRun.push(lines[i]);
          i++;
        }
        var lang0 = cdDetectCodeLangFromLines(codeRun) || cdGuessLang(codeRun.join("\n"));
        if (lang0 !== "text" || cdLineLooksLikeCode(codeRun[0])) {
          html.push(cdCodeHtml(lang0 === "text" ? "javascript" : lang0, cdCodeBodyFromPara(codeRun, lang0), false));
          continue;
        }
      }
      var conc = String(line || "").match(/^#{0,3}\s*一句话结论\s*[：:]?\s*(.*)$/);
      if (conc && String(line || "").indexOf("\u4E00\u53E5\u8BDD\u7ED3\u8BBA") >= 0) {
        html.push("<h3>\u4E00\u53E5\u8BDD\u7ED3\u8BBA</h3>");
        if (String(conc[1] || "").trim()) {
          html.push("<p>" + cdInline(conc[1].trim()) + "</p>");
        }
        i++;
        continue;
      }
      var strippedLine = String(line || "").replace(/[\t ]+$/, "");
      if (cdIsSectionLine(strippedLine) && strippedLine.indexOf("	") < 0) {
        html.push("<h3>" + cdInline(cdSectionTitle(strippedLine)) + "</h3>");
        i++;
        continue;
      }
      if (/^\s*\|/.test(line) || cdIsPipeTableStart(lines, i)) {
        var pipeRows = [];
        while (i < lines.length && (/^\s*\|/.test(lines[i] || "") || cdIsSepOnly(lines[i]))) {
          pipeRows.push(lines[i]);
          i++;
        }
        html.push(cdMdTable(pipeRows));
        continue;
      }
      if (/^### /.test(line)) {
        html.push("<h4>" + cdInline(line.slice(4)) + "</h4>");
        i++;
        continue;
      }
      if (/^## /.test(line)) {
        html.push("<h3>" + cdInline(line.slice(3)) + "</h3>");
        i++;
        continue;
      }
      if (/^# /.test(line)) {
        html.push("<h3>" + cdInline(line.slice(2)) + "</h3>");
        i++;
        continue;
      }
      if (/^[-*] /.test(line)) {
        var ul = [];
        while (i < lines.length && /^[-*] /.test(lines[i])) {
          ul.push("<li>" + cdInline(lines[i].replace(/^[-*] /, "")) + "</li>");
          i++;
        }
        html.push("<ul>" + ul.join("") + "</ul>");
        continue;
      }
      if (/^\d+\.\s/.test(line) || /^\d+\t/.test(line)) {
        var ol = [];
        while (i < lines.length && (/^\d+\.\s/.test(lines[i]) || /^\d+\t/.test(lines[i]))) {
          ol.push(
            "<li>" + cdInline(String(lines[i]).replace(/^\d+\.\s*/, "").replace(/^\d+\t\s*/, "")) + "</li>"
          );
          i++;
        }
        html.push("<ol>" + ol.join("") + "</ol>");
        continue;
      }
      var kv0 = cdSplitKv(line);
      var fileBits = [];
      while (i < lines.length) {
        var cur = lines[i];
        if (!String(cur || "").trim() || cdIsJunkHeader(cur)) break;
        if (cdIsSectionLine(String(cur).replace(/[\t ]+$/, "")) && String(cur).indexOf("	") < 0) break;
        if (/^\d+\.\s/.test(cur) || /^\d+\t/.test(cur) || /^[-*] /.test(cur)) break;
        var kv = cdSplitKv(cur);
        if (kv && (cdLooksLikeFileChange(kv[1] || "") || /[./].+\.[A-Za-z0-9]+/.test(kv[1] || "") || kv[0] === "\u6539\u52A8\u6587\u4EF6")) {
          fileBits.push(cdFileLi(kv[1], kv.slice(2).join(" ")));
          i++;
          continue;
        }
        if (kv && cdLooksLikeFileChange(kv[0] || "")) {
          fileBits.push(cdFileLi(kv[0], kv.slice(1).join(" ")));
          i++;
          continue;
        }
        if (cdLooksLikeFileChange(cur)) {
          var sp = String(cur).split(/\s+[—–-]\s+/);
          fileBits.push(cdFileLi(sp[0], sp.slice(1).join(" \u2014 ")));
          i++;
          continue;
        }
        break;
      }
      if (fileBits.length) {
        html.push("<ul>" + fileBits.join("") + "</ul>");
        continue;
      }
      if (kv0) {
        html.push(
          "<p><strong>" + cdInline(kv0[0]) + "</strong>\uFF1A" + cdInline(kv0.slice(1).join(" ")) + "</p>"
        );
        i++;
        continue;
      }
      var para = [line];
      i++;
      while (i < lines.length && String(lines[i] || "").trim() && !cdIsJunkHeader(lines[i]) && !/^#{1,3} /.test(lines[i]) && !/^\s*\|/.test(lines[i]) && !cdIsPipeTableStart(lines, i) && !/^[-*] /.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !/^\d+\t/.test(lines[i]) && String(lines[i]).indexOf("\u4E00\u53E5\u8BDD\u7ED3\u8BBA") !== 0 && !cdIsSectionLine(lines[i]) && !cdSplitKv(lines[i]) && !cdLooksLikeFileChange(lines[i]) && !cdLineLooksLikeCode(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      var codeLang = cdDetectCodeLangFromLines(para);
      if (codeLang) {
        html.push(cdCodeHtml(codeLang, cdCodeBodyFromPara(para, codeLang), false));
        continue;
      }
      html.push("<p>" + cdInline(para.join(" ")) + "</p>");
    }
    return html.join("");
  }
  function cdMdBlocks(text) {
    var t = String(text || "").replace(/\r\n/g, "\n");
    if (!t.trim()) return "";
    var forced = cdForceCodeFences(t);
    if (forced.indexOf("```") >= 0) {
      return cdFenceParts(forced).map(function(part) {
        if (part.t === "code") return cdCodeHtml(part.lang, part.v, !!part.streaming);
        return cdMdBlocksProse(part.v);
      }).join("");
    }
    return cdMdBlocksProse(t);
  }
  function cdNormDialogKey(text) {
    return String(text || "").replace(/[`「」→—–#*\-\s]/g, "").replace(/[：:，,。．！？?；;、·•]/g, "").replace(/[由的了则再]/g, "").toLowerCase();
  }
  function cdCollapseDupProseSegment(text) {
    var raw = String(text || "").replace(/\r/g, "");
    if (cdDetectCodeLangFromLines(raw.split("\n")) || cdLineLooksLikeCode(raw.split("\n")[0] || raw)) {
      return raw.trim();
    }
    var chunks = [];
    raw.split(/\n+/).forEach(function(line) {
      var ln = String(line || "").trim();
      if (!ln) return;
      if (/^#{1,3}\s*删除清单/.test(ln) || /^[-*]\s+/.test(ln)) {
        chunks.push(ln);
        return;
      }
      var buf = "";
      for (var i = 0; i < ln.length; i++) {
        var ch = ln.charAt(i);
        buf += ch;
        if ("\u3002\uFF01\uFF1F".indexOf(ch) >= 0) {
          var s = buf.trim();
          if (s) chunks.push(s);
          buf = "";
        }
      }
      var tail = buf.trim();
      if (tail) chunks.push(tail);
    });
    var out = [];
    var keys = [];
    function prefer(a, b) {
      var sa = (String(a).match(/ /g) || []).length + (String(a).match(/`/g) || []).length * 2;
      var sb = (String(b).match(/ /g) || []).length + (String(b).match(/`/g) || []).length * 2;
      return sa >= sb ? a : b;
    }
    chunks.forEach(function(part) {
      var s = String(part || "").trim();
      if (!s) return;
      var key = cdNormDialogKey(s);
      if (!key) return;
      var hit = -1;
      for (var i = 0; i < keys.length; i++) {
        var old = keys[i];
        if (key === old || key.length >= 12 && (key.indexOf(old) >= 0 || old.indexOf(key) >= 0)) {
          hit = i;
          break;
        }
      }
      if (hit >= 0) {
        out[hit] = prefer(out[hit], s);
        keys[hit] = cdNormDialogKey(out[hit]);
        return;
      }
      out.push(s);
      keys.push(key);
    });
    var rendered = [];
    var inPlan = false;
    out.forEach(function(ln) {
      if (/^#{0,3}\s*删除清单/.test(ln) || ln === "\u5220\u9664\u6E05\u5355") {
        inPlan = true;
        rendered.push("## \u5220\u9664\u6E05\u5355");
        return;
      }
      if (inPlan && /^[-*]\s+/.test(ln)) {
        rendered.push(ln);
        return;
      }
      if (inPlan && /^(frontend|backend|apps|src)\//.test(ln.replace(/^[`*\-\s]+/, ""))) {
        rendered.push("- " + ln.replace(/^[-*\s]+/, ""));
        return;
      }
      inPlan = false;
      rendered.push(ln);
    });
    var htmlParts = [];
    var planBuf = [];
    function flushPlan() {
      if (!planBuf.length) return;
      htmlParts.push(planBuf.join("\n"));
      planBuf = [];
    }
    rendered.forEach(function(ln) {
      if (ln === "## \u5220\u9664\u6E05\u5355" || /^[-*]\s+/.test(ln)) {
        planBuf.push(ln);
        return;
      }
      flushPlan();
      htmlParts.push(ln);
    });
    flushPlan();
    return htmlParts.join("\n\n").trim();
  }
  function cdCollapseDupProse(text) {
    var raw = String(text || "");
    if (raw.indexOf("```") < 0) return cdCollapseDupProseSegment(raw);
    return cdFenceParts(raw).map(function(part) {
      if (part.t === "code") {
        var lang = part.lang || "text";
        return "```" + lang + "\n" + String(part.v || "") + "\n```";
      }
      return cdCollapseDupProseSegment(part.v);
    }).join("\n\n");
  }
  function cdPrepProcess(text) {
    var t = cdStripAllCodeText(text);
    t = cdScrubProcess(t);
    t = cdStripAllCodeText(t);
    t = t.replace(/##\s*删除清单/g, "\n\n## \u5220\u9664\u6E05\u5355\n");
    t = t.replace(/([。！？])\s*(#{1,3}\s*删除清单)/g, "$1\n\n$2");
    t = t.replace(/(结论[：:])\s*/g, "\n\n$1");
    t = cdCollapseDupProse(t);
    t = t.replace(/bash#\s*已删除/g, "\n\u5DF2\u5220\u9664\uFF1A\n");
    t = t.replace(
      /((?:frontend|backend|apps|src|desktop|host)\/[\w./@-]+\.[A-Za-z0-9]+)(?=(?:frontend|backend|apps|src|desktop|host)\/)/g,
      "$1\n"
    );
    return t.trim();
  }
  function cdSplitProse(text) {
    return String(text || "").replace(/([。！？])([^\n])/g, "$1\n\n$2");
  }
  function cdMdHtml(text) {
    return cdFenceParts(text).map(function(part) {
      if (part.t === "code") return cdCodeHtml(part.lang, part.v, !!part.streaming);
      return cdMdBlocks(part.v);
    }).join("");
  }
  function cdProcessHtml(text) {
    var prose = cdPrepProcess(text);
    if (!String(prose || "").trim()) return "";
    return cdMdBlocksProseProcess(cdSplitProse(prose));
  }
  function cdThinkSummary(running, ms, elapsed) {
    if (running) return "\u601D\u8003\u4E2D\u2026 \xB7 \u5DF2 " + cdFormatDuration(elapsed || 0);
    if (ms != null && ms !== "") return "\u5DF2\u5B8C\u6210\u601D\u8003\uFF08" + cdFormatDuration(Number(ms) / 1e3) + "\uFF09\xB7 \u70B9\u51FB\u5C55\u5F00\u5168\u6587";
    return "\u5DF2\u5B8C\u6210\u601D\u8003 \xB7 \u70B9\u51FB\u5C55\u5F00\u5168\u6587";
  }
  function cdDedupeThinkText(text) {
    return cdCollapseDupProse(String(text || "").replace(/\r/g, "").trim());
  }
  function cdThinkSentences(text) {
    var t = cdDedupeThinkText(text);
    if (!t) return [];
    var parts = [];
    var buf = "";
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      buf += ch;
      if ("\u3002\uFF01\uFF1F".indexOf(ch) >= 0) {
        var s = buf.trim();
        if (s) parts.push(s);
        buf = "";
      }
    }
    var tail = buf.trim();
    if (tail) parts.push(tail);
    var out = [];
    parts.forEach(function(sent) {
      var s2 = sent.trim();
      if (!s2) return;
      if (out.length) {
        var prev = out[out.length - 1];
        if (s2 === prev) return;
        if (s2.length > 18 && prev.length > 18 && (s2.indexOf(prev) >= 0 || prev.indexOf(s2) >= 0)) {
          if (s2.length > prev.length) out[out.length - 1] = s2;
          return;
        }
      }
      out.push(s2);
    });
    return out.slice(-20);
  }
  function CdThinkMarquee(props) {
    var action = String(props.action || "").trim();
    var sents = cdThinkSentences(props.text);
    if (action && (!sents.length || sents[sents.length - 1] !== action)) sents.push(action);
    if (!sents.length) sents = [props.placeholder || "\u6B63\u5728\u5BF9\u7167\u5DE5\u4F5C\u533A\u2026"];
    var n = sents.length;
    var _idx = useState(Math.max(0, n - 1));
    var idx = _idx[0];
    var setIdx = _idx[1];
    var _fade = useState(false);
    var fading = _fade[0];
    var setFade = _fade[1];
    useEffect(
      function() {
        setIdx(n - 1);
      },
      [n]
    );
    useEffect(
      function() {
        if (!props.running || n < 2) return void 0;
        var t = setInterval(function() {
          setFade(true);
          setTimeout(function() {
            setIdx(function(i) {
              var start = Math.max(0, n - 5);
              var next = i + 1;
              if (next >= n) return start;
              return next;
            });
            setFade(false);
          }, 280);
        }, 3800);
        return function() {
          clearInterval(t);
        };
      },
      [props.running, n]
    );
    var safeIdx = Math.max(0, Math.min(idx, n - 1));
    var line = sents[safeIdx] || sents[n - 1] || props.placeholder || "\u6B63\u5728\u5BF9\u7167\u5DE5\u4F5C\u533A\u2026";
    return h(
      "div",
      { className: "wb-cd-think-ticker", "aria-live": "polite" },
      h("div", { key: safeIdx + ":" + line, className: "wb-cd-think-line is-solo" + (fading ? " is-fade" : "") }, line)
    );
  }
  function CdThinkPanel(props) {
    var running = !!props.running;
    var text = cdDedupeThinkText(props.text || "");
    var action = String(props.action || "").trim();
    if (running) {
      return h(
        "div",
        { className: "wb-cd-think is-live" },
        h("span", { className: "wb-cd-think-lab" }, "\u601D\u8003\u4E2D"),
        h("span", { className: "wb-cd-think-rail", "aria-hidden": "true" }),
        h(CdThinkMarquee, {
          running: true,
          text,
          action,
          placeholder: "\u6B63\u5728\u5BF9\u7167\u5DE5\u4F5C\u533A\u2026"
        })
      );
    }
    return h(
      "details",
      { className: "wb-cd-think", open: false },
      h("summary", null, cdThinkSummary(false, props.ms, props.elapsed)),
      h("div", { className: "wb-cd-think-body" }, text || "\u672C\u8F6E\u672A\u6355\u83B7\u5230\u601D\u8003\u6B63\u6587")
    );
  }
  function CdPlanView(planProps) {
    var steps = planProps.steps || [];
    var duration = planProps.duration || "";
    var visible = steps.filter(function(s) {
      return s.state !== "pending";
    });
    var list = visible.length ? visible : [{ id: "boot", title: "\u4EFB\u52A1\u5DF2\u6392\u961F", state: "running" }];
    var summary = planProps.summary || cdPlanSummary(list);
    return h(
      "div",
      { className: "wb-cd-plan" },
      h(
        "div",
        { className: "wb-cd-plan-head" },
        h("span", { className: "wb-cr-badge" }, "\u672C\u8F6E\u8FDB\u5EA6"),
        h("span", { className: "sum" }, summary),
        duration ? h("span", { className: "dur" }, duration) : null
      ),
      h(
        "ol",
        { className: "wb-cd-ol" },
        list.map(function(s, i) {
          var st = s.state || "pending";
          var icon = st === "running" ? h("span", { className: "wb-cd-dot-live", "aria-hidden": "true" }) : st === "done" ? "\u2713" : st === "error" ? "!" : String(i + 1);
          var hint = st === "running" ? h("span", { className: "wb-cd-spin", role: "status", "aria-label": "\u8FDB\u884C\u4E2D" }) : st === "done" ? "\u5DF2\u5B8C\u6210" : st === "error" ? "\u5931\u8D25" : "\u7B49\u5F85\u4E2D";
          return h(
            "li",
            { key: s.id, className: "wb-cd-li is-" + st },
            h("span", { className: "wb-cd-ico" }, icon),
            h(
              "div",
              null,
              h("span", { className: "wb-cd-title" }, s.title || s.id),
              h("span", { className: "wb-cd-state" }, hint)
            )
          );
        })
      )
    );
  }
  function cdActivityPathKey(line) {
    var m = String(line || "").match(/`([^`]+)`/);
    if (m) return m[1].trim();
    var bare = String(line || "").trim().split("\uFF08")[0].trim();
    if (/^(查找文件|搜索|查看|检索|查看目录|执行)$/.test(bare)) return "";
    return bare;
  }
  function cdCompactToolLines(lines) {
    var out = [];
    var seen = {};
    (lines || []).forEach(function(ln) {
      var key = cdActivityPathKey(ln) || ln;
      if (key && seen[key]) return;
      if (key) seen[key] = true;
      out.push(ln);
    });
    return out.slice(-8);
  }
  function CdActivityFeed(props) {
    var lines = cdCompactToolLines(props.lines || []);
    var live = String(props.live || "").trim();
    if (!lines.length && !live) return null;
    var kids = lines.slice(-10).map(function(ln, i) {
      var isLast = i === lines.length - 1 && !live;
      return h(
        "li",
        { key: i + ":" + ln, className: isLast && props.running ? "is-live" : "" },
        ln
      );
    });
    if (live && (props.running || lines.indexOf(live) < 0)) {
      kids.push(h("li", { key: "live", className: "is-live" }, live));
    }
    return h(
      "div",
      { className: "wb-cd-act" },
      h("div", { className: "wb-cd-act-h" }, "\u5B9E\u65F6\u8FDB\u5C55 \xB7 \u540C\u6587\u4EF6\u53EA\u4FDD\u7559\u6700\u540E\u4E00\u6B21"),
      h("ul", null, kids)
    );
  }
  var CD_FLOW_INTRO = "\u5199\u7801\u5DE5\u5177\u5361\u5DF2\u6253\u5F00\u3002\u8BF7\u5148\u5728\u672C\u5361\u9009\u62E9\u5DE5\u7A0B\u76EE\u5F55\u3001\u586B\u5199\u8BC9\u6C42\u5E76\u5B8C\u6210\u786E\u8BA4\uFF1B\u786E\u8BA4\u540E\u624D\u4F1A\u542F\u52A8 Cursor \u5199\u7801\u4E0E\u540C\u6B65\uFF0C\u4E0D\u4F1A\u81EA\u52A8 commit\u3002";
  function cdStripBoilerplate(text) {
    var t = String(text || "");
    t = t.replace(
      /The development tool card has been opened for you\.[\s\S]*?in the tool card\.?\s*/gi,
      ""
    );
    t = t.replace(
      /Please complete the directory selection and requirement confirmation in the tool card\.?\s*/gi,
      ""
    );
    t = t.replace(/已为您打开写码工具卡[（(，,][\s\S]*?后?再?(开工|执行)[。．]?\s*/g, "");
    t = t.replace(/已为您打开写码工具卡[\s\S]{0,200}?确认需求后开工[。．]?\s*/g, "");
    t = t.replace(/写码工具卡已打开[。．][\s\S]*?确认后再?(开工|执行)[。．]?\s*/g, "");
    t = t.replace(/请在(上方)?工具卡(中)?确认[。．]?\s*/g, "");
    t = t.replace(/请在卡片中确认[。．]?\s*/g, "");
    return t.trim();
  }
  _cdP.setScrubbers({
    cdStripBoilerplate,
    cdStripExplorationFromProcess,
    cdDedupeThinkText
  });
  function CdFlowIntro() {
    return h("p", { className: "wb-cd-intro" }, maskVendorUiText(CD_FLOW_INTRO));
  }
  function CdPipelineCards(props) {
    var steps = props.steps || [];
    return h(
      "div",
      { className: "wb-cd-pipe" },
      steps.map(function(s, i) {
        var st = s.state || "pending";
        var mark = st === "done" ? "\u2713" : st === "running" ? h("span", { className: "wb-cd-dot-live", "aria-hidden": "true" }) : st === "error" ? "!" : st === "skipped" ? "\u2014" : String(i + 1);
        var hint = st === "done" ? "\u5DF2\u5B8C\u6210" : st === "running" ? h("span", { className: "wb-cd-spin", role: "status", "aria-label": "\u8FDB\u884C\u4E2D" }) : st === "error" ? "\u5931\u8D25" : st === "skipped" ? "\u5DF2\u8DF3\u8FC7" : "\u7B49\u5F85\u4E2D";
        return h(
          "div",
          { key: s.id, className: "wb-cd-pipecard is-" + st },
          h(
            "div",
            { className: "wb-cd-pipecard-h" },
            h("span", { className: "wb-cd-ico" }, mark),
            h("span", { className: "ttl" }, s.title || CD_PIPELINE[i] && CD_PIPELINE[i].title || s.id),
            h("span", { className: "hint" }, hint)
          )
        );
      })
    );
  }
  function CdDoneCard(props) {
    return h(
      "div",
      { className: "wb-cd-stepcard" },
      h(
        "div",
        { className: "wb-cd-stepcard-h" },
        h("span", { className: "wb-cd-ico" }, "\u2713"),
        h("span", null, maskVendorUiText(props.title)),
        h("span", { className: "hint" }, "\u5DF2\u786E\u8BA4")
      ),
      props.body ? h("pre", { className: "wb-cd-stepcard-b" }, maskVendorUiText(props.body)) : null
    );
  }
  function CodeDevBeginCard(props) {
    ensureCss();
    var block = props.block;
    var toolCallId = String(props.callId || cdBlockCallId(block, "") || "").trim();
    var wb = useMemo(function() {
      return readMeta(block);
    }, [block]);
    var ui = wb && wb.ui || {};
    var dshCwd = resolveDshCwd(props);
    var persistBoot = useMemo(
      function() {
        return cdPersistLoadForCard(block, props.sessionId, toolCallId);
      },
      [block, props.sessionId, toolCallId]
    );
    var persistKey = persistBoot.key;
    var bootSavedRaw = persistBoot.saved && cdPersistBelongsToCall(persistBoot.saved, toolCallId) ? cdPersistEnrichCardSaved(persistBoot.saved) : null;
    var bootSaved = null;
    if (bootSavedRaw) {
      if (cdPickMustStayHitl(wb, ui, bootSavedRaw, toolCallId)) {
        if ((bootSavedRaw.phase === "options" || bootSavedRaw.phase === "propose") && cdPersistBelongsToCall(bootSavedRaw, toolCallId)) {
          bootSaved = bootSavedRaw;
        }
      } else {
        bootSaved = bootSavedRaw;
      }
    }
    var _phase = useState(function() {
      return bootSaved && bootSaved.phase || "form";
    });
    var phase = _phase[0];
    var setPhase = _phase[1];
    var _ws = useState(function() {
      return bootSaved && bootSaved.workspace || initialWorkspace(props, ui);
    });
    var workspace = _ws[0];
    var setWorkspace = _ws[1];
    var _req = useState(function() {
      return bootSaved && bootSaved.requirement || initialRequirement(props, ui);
    });
    var requirement = _req[0];
    var setRequirement = _req[1];
    var _goal = useState(function() {
      return bootSaved && bootSaved.goal || initialRequirement(props, ui);
    });
    var goal = _goal[0];
    var setGoal = _goal[1];
    var _brief = useState(function() {
      return bootSaved && bootSaved.brief || ui.brief || null;
    });
    var brief = _brief[0];
    var setBrief = _brief[1];
    var _optionsUi = useState(function() {
      return bootSaved && bootSaved.optionsUi || null;
    });
    var optionsUi = _optionsUi[0];
    var setOptionsUi = _optionsUi[1];
    var _proposeUi = useState(function() {
      return bootSaved && bootSaved.proposeUi || null;
    });
    var proposeUi = _proposeUi[0];
    var setProposeUi = _proposeUi[1];
    var _sel = useState(function() {
      return bootSaved && bootSaved.selectedOpts || {};
    });
    var selectedOpts = _sel[0];
    var setSelectedOpts = _sel[1];
    var _notes = useState(function() {
      return bootSaved && bootSaved.notes || "";
    });
    var notes = _notes[0];
    var setNotes = _notes[1];
    var _ack = useState(function() {
      return !!(bootSaved && bootSaved.ackWarn);
    });
    var ackWarn = _ack[0];
    var setAckWarn = _ack[1];
    var _err = useState("");
    var err = _err[0];
    var setErr = _err[1];
    var _busy = useState(false);
    var busy = _busy[0];
    var setBusy = _busy[1];
    var _jobId = useState(function() {
      return bootSaved && bootSaved.jobId || "";
    });
    var jobId = _jobId[0];
    var setJobId = _jobId[1];
    var _log = useState("");
    var log = _log[0];
    var setLog = _log[1];
    var _result = useState(function() {
      return bootSaved && bootSaved.result || "";
    });
    var result = _result[0];
    var setResult = _result[1];
    var _runtimeHint = useState(function() {
      return bootSaved && bootSaved.runtimeHint || "";
    });
    var runtimeHint = _runtimeHint[0];
    var setRuntimeHint = _runtimeHint[1];
    var _synced = useState(function() {
      return bootSaved && bootSaved.synced || [];
    });
    var synced = _synced[0];
    var setSynced = _synced[1];
    var _deferred = useState(function() {
      return bootSaved && bootSaved.deferred || [];
    });
    var deferred = _deferred[0];
    var setDeferred = _deferred[1];
    var _deleted = useState(function() {
      return bootSaved && bootSaved.deleted || [];
    });
    var deleted = _deleted[0];
    var setDeleted = _deleted[1];
    var _steps = useState(function() {
      var s = bootSaved;
      return s && s.steps && s.steps.length && s.steps || cdInitSteps();
    });
    var steps = _steps[0];
    var setSteps = _steps[1];
    var _stream = useState(function() {
      return bootSaved && bootSaved.streamText || "";
    });
    var streamText = _stream[0];
    var setStreamText = _stream[1];
    var _elapsed = useState(function() {
      return bootSaved && bootSaved.elapsed || 0;
    });
    var elapsed = _elapsed[0];
    var setElapsed = _elapsed[1];
    var _alive = useState(function() {
      return bootSaved && bootSaved.aliveHint || "\u51C6\u5907\u542F\u52A8\u2026";
    });
    var aliveHint = _alive[0];
    var setAliveHint = _alive[1];
    var _think = useState(function() {
      return bootSaved && bootSaved.thinkingText || "";
    });
    var thinkingText = _think[0];
    var setThinkingText = _think[1];
    var _delivery = useState(function() {
      return bootSaved && bootSaved.deliveryText || "";
    });
    var deliveryText = _delivery[0];
    var setDeliveryText = _delivery[1];
    var _thinkMs = useState(function() {
      var s = bootSaved;
      return s && s.thinkingMs != null ? s.thinkingMs : null;
    });
    var thinkingMs = _thinkMs[0];
    var setThinkingMs = _thinkMs[1];
    var _action = useState("");
    var currentAction = _action[0];
    var setCurrentAction = _action[1];
    var _tools = useState([]);
    var toolLines = _tools[0];
    var setToolLines = _tools[1];
    var suggestions = typeof mergeWorkspaceSuggestions === "function" ? mergeWorkspaceSuggestions(ui.suggestions, dshCwd, props.home) : Array.isArray(ui.suggestions) ? ui.suggestions : [];
    var streamBoxRef = useRef(null);
    var composerRef = useRef(null);
    var restoreOnceRef = useRef(false);
    var resumeWatchRef = useRef(null);
    var streamTokenRef = useRef("");
    var cancelRunningRef = useRef(null);
    var _cancelling = useState(false);
    var cancelling = _cancelling[0];
    var setCancelling = _cancelling[1];
    useEffect(
      function() {
        if (dshCwd && !String(workspace || "").trim()) setWorkspace(dshCwd);
      },
      [dshCwd]
    );
    useEffect(
      function() {
        var el = streamBoxRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      },
      [streamText, phase]
    );
    useEffect(
      function() {
        var el = composerRef.current;
        if (!el) return;
        function codeFromWrap(wrap) {
          var codeEl = wrap ? wrap.querySelector("code") : null;
          return codeEl ? String(codeEl.textContent || "") : "";
        }
        function markCopied(btn) {
          btn.classList.add("is-copied");
          var label = btn.querySelector(".wb-cd-codebtn-label");
          if (label) label.textContent = "\u5DF2\u590D\u5236";
          setTimeout(function() {
            btn.classList.remove("is-copied");
            if (label) label.textContent = "\u590D\u5236";
          }, 1600);
        }
        function copyText(text, btn) {
          if (!text) return;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() {
              markCopied(btn);
            }).catch(function() {
              try {
                var ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.left = "-9999px";
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                markCopied(btn);
              } catch (e0) {
              }
            });
          }
        }
        function onCodeAction(ev) {
          var copyBtn = ev.target && ev.target.closest ? ev.target.closest("[data-cd-copy]") : null;
          var dlBtn = ev.target && ev.target.closest ? ev.target.closest("[data-cd-download]") : null;
          var btn = copyBtn || dlBtn;
          if (!btn || !el.contains(btn)) return;
          ev.preventDefault();
          ev.stopPropagation();
          var wrap = btn.closest ? btn.closest(".wb-cd-codewrap") : null;
          var text = codeFromWrap(wrap);
          if (!text) return;
          if (copyBtn) {
            copyText(text, copyBtn);
            return;
          }
          var ext = btn.getAttribute("data-cd-ext") || "txt";
          try {
            var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = "snippet." + ext;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          } catch (e1) {
          }
        }
        el.addEventListener("click", onCodeAction);
        return function() {
          el.removeEventListener("click", onCodeAction);
        };
      },
      [streamText, phase]
    );
    function cdSnapshotPersist(extra) {
      cdPersistSaveCard(
        block,
        props.sessionId,
        toolCallId,
        Object.assign(
          {
            phase,
            jobId,
            streamToken: streamTokenRef.current || void 0,
            callId: toolCallId || cdBlockCallId(block),
            sessionId: cdBlockSessionId(block, props.sessionId),
            workspace,
            requirement,
            goal,
            brief,
            optionsUi,
            proposeUi,
            selectedOpts,
            notes,
            ackWarn,
            streamText,
            deliveryText,
            steps,
            elapsed,
            aliveHint,
            thinkingText,
            thinkingMs,
            synced,
            deferred,
            deleted,
            result,
            runtimeHint
          },
          extra || {}
        )
      );
      if (persistBoot.migrateFrom && persistBoot.migrateFrom !== persistKey) {
        try {
          localStorage.removeItem(persistBoot.migrateFrom);
        } catch (eMig) {
        }
        persistBoot.migrateFrom = "";
      }
    }
    function hydrateFromJob(job, pack) {
      if (!job || typeof job !== "object") return;
      if (job.workspace) setWorkspace(String(job.workspace));
      if (job.live_text) setStreamText(String(job.live_text));
      if (job.delivery_text) setDeliveryText(String(job.delivery_text));
      if (job.thinking_text) setThinkingText(cdDedupeThinkText(String(job.thinking_text)));
      if (job.thinking_duration_ms != null) setThinkingMs(job.thinking_duration_ms);
      if (job.synced_files) setSynced(job.synced_files || []);
      if (job.deferred_files) setDeferred(job.deferred_files || []);
      if (job.deleted_files) setDeleted(job.deleted_files || []);
      if (job.runtime_hint) setRuntimeHint(String(job.runtime_hint));
      setSteps(cdJobStepsFromRecord(job));
      setElapsed(cdJobElapsed(job));
      var st = String(job.status || "");
      if (st === "succeeded" || st === "failed" || st === "cancelled") {
        setPhase("done");
        setBusy(false);
        setAliveHint(cdJobAliveHint(job));
        if (pack && pack.reply) setResult(String(pack.reply));
        if (st === "failed") setErr(String(job.error || pack && pack.detail || "\u5199\u7801\u5931\u8D25"));
      } else if (st === "queued" || st === "running") {
        setPhase("running");
        setBusy(true);
        setAliveHint(String(job.progress || "\u5199\u7801\u8FDB\u884C\u4E2D\u2026"));
      }
    }
    function head(hint) {
      return h(
        "div",
        { className: "wb-cr-head" },
        h("span", { className: "wb-cr-badge" }, "\u672C\u673A\u5199\u7801"),
        h("span", { className: "wb-cr-hint" }, hint)
      );
    }
    function browse() {
      setBusy(true);
      setErr("\u8BF7\u5728\u5F39\u51FA\u7684\u7CFB\u7EDF\u5BF9\u8BDD\u6846\u4E2D\u9009\u62E9\u76EE\u5F55\uFF08\u82E5\u770B\u4E0D\u5230\uFF0C\u8BF7\u770B Dock / \u5176\u5B83\u7A97\u53E3\u540E\u9762\uFF09");
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function() {
        try {
          if (ctrl) ctrl.abort();
        } catch (e0) {
        }
      }, 12e4);
      pickLocalFolder("\u9009\u62E9\u8981\u5199\u7801\u7684\u5DE5\u7A0B\u76EE\u5F55", ctrl ? ctrl.signal : void 0).then(function(d) {
        clearTimeout(timer);
        setBusy(false);
        if (d && d.ok && d.path) {
          setWorkspace(String(d.path));
          setErr("");
        } else {
          setErr(d && (d.error || d.detail || d.message) || "\u672A\u9009\u62E9\u76EE\u5F55");
        }
      }).catch(function(e) {
        clearTimeout(timer);
        setBusy(false);
        setErr("\u9009\u76EE\u5F55\u5931\u8D25\uFF1A" + (e && e.name === "AbortError" ? "\u8D85\u65F6\u6216\u5DF2\u53D6\u6D88" : e && e.message ? e.message : e));
      });
    }
    function applyDiscussResult(d) {
      if (d && d.code_dev_brief) setBrief(d.code_dev_brief);
      var nextUi = d && d.code_dev_ui || null;
      if (!nextUi || !nextUi.kind) {
        setErr(d && (d.reply || d.detail) || "\u672A\u8FD4\u56DE\u9009\u9879\u5361/\u786E\u8BA4\u5361\uFF0C\u8BF7\u8865\u5145\u8BC9\u6C42\u540E\u518D\u8BD5");
        return;
      }
      if (nextUi.workspace) setWorkspace(String(nextUi.workspace));
      if (nextUi.original_goal) setGoal(String(nextUi.original_goal));
      else if (d.code_dev_brief && d.code_dev_brief.original_goal) {
        setGoal(String(d.code_dev_brief.original_goal));
      }
      if (nextUi.kind === "options") {
        setOptionsUi(nextUi);
        setSelectedOpts({});
        setNotes("");
        setPhase("options");
        return;
      }
      if (nextUi.kind === "propose") {
        var req0 = nextUi.requirement || nextUi.propose && nextUi.propose.requirement || requirement || "";
        setProposeUi(nextUi);
        setRequirement(String(req0));
        setAckWarn(false);
        setPhase("propose");
        return;
      }
      setErr("\u672A\u77E5\u5199\u7801\u5361\u7247\uFF1A" + nextUi.kind);
    }
    function runDiscuss(messageOverride, briefOverride) {
      var ws = String(workspace || "").trim();
      var msg = String(messageOverride != null ? messageOverride : requirement || "").trim();
      if (!ws) {
        setErr("\u8BF7\u586B\u5199\u6216\u6D4F\u89C8\u9009\u62E9\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55");
        return;
      }
      if (!msg) {
        setErr("\u8BF7\u5148\u586B\u5199\u539F\u59CB\u5199\u7801\u8BC9\u6C42");
        return;
      }
      setBusy(true);
      setErr("");
      var briefPayload = briefOverride || brief || {
        original_goal: goal || msg,
        workspace: ws,
        selections: [],
        notes: [],
        option_rounds: 0
      };
      if (!briefPayload.original_goal) briefPayload.original_goal = goal || msg;
      if (!briefPayload.workspace) briefPayload.workspace = ws;
      fetch(engineBase() + "/api/code-dev/discuss", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          message: msg,
          workspace: ws,
          code_dev_brief: briefPayload
        })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(pack) {
        setBusy(false);
        var d = pack.d || {};
        if (!pack.ok && d.ok === false) {
          setErr(d.detail || d.reply || "\u9700\u6C42\u8BA8\u8BBA\u5931\u8D25");
          return;
        }
        if (d.ok === false && !d.code_dev_ui) {
          setErr(d.detail || d.reply || "\u9700\u6C42\u8BA8\u8BBA\u5931\u8D25");
          return;
        }
        applyDiscussResult(d);
      }).catch(function(e) {
        setBusy(false);
        setErr("\u9700\u6C42\u8BA8\u8BBA\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
      });
    }
    function submitOptions() {
      var nextUi = optionsUi || {};
      var opts2 = nextUi.options || {};
      var groups2 = Array.isArray(opts2.groups) ? opts2.groups : [];
      for (var i = 0; i < groups2.length; i++) {
        var g = groups2[i];
        if (g.required === false) continue;
        if (!(selectedOpts[g.id] || []).length) {
          setErr("\u8BF7\u5148\u9009\u62E9\uFF1A\u300C" + (g.label || g.id) + "\u300D");
          return;
        }
      }
      var noteText = String(notes || "").trim();
      if (opts2.notes_required && !noteText) {
        setErr("\u8BF7\u586B\u5199\u5907\u6CE8\uFF1A\u4E1A\u52A1\u6A21\u5757\u3001\u9875\u9762\u540D\u79F0\u3001\u63A5\u53E3\u8DEF\u5F84\u7B49\uFF08\u5FC5\u586B\uFF09");
        return;
      }
      var lines = ["\u3010\u5199\u7801\u9700\u6C42\u9009\u9879\u5DF2\u786E\u8BA4\u3011"];
      var ws = String(workspace || "").trim();
      if (ws) lines.push("\u5DE5\u7A0B\u8DEF\u5F84\uFF1A" + ws);
      groups2.forEach(function(g2) {
        var ids = selectedOpts[g2.id] || [];
        var labels = (g2.options || []).filter(function(o) {
          return ids.indexOf(o.id) >= 0;
        }).map(function(o) {
          return o.label || o.id;
        });
        if (labels.length) lines.push((g2.label || g2.id) + "\uFF1A" + labels.join("\u3001"));
      });
      if (noteText) lines.push("\u5907\u6CE8\uFF1A" + noteText);
      runDiscuss(lines.join("\n"), brief || nextUi.brief || null);
    }
    function watchJob(jid, opts2) {
      opts2 = opts2 || {};
      var resume = !!opts2.resume;
      var streamToken = String(opts2.streamToken || streamTokenRef.current || "").trim();
      if (streamToken) streamTokenRef.current = streamToken;
      setPhase("running");
      setBusy(true);
      if (!resume) {
        setSteps(
          cdInitSteps().map(function(s) {
            return s.id === "brief" ? Object.assign({}, s, { state: "done" }) : s;
          })
        );
        setStreamText("");
        setThinkingText("\u6B63\u5728\u5BF9\u7167\u5DE5\u4F5C\u533A\u2026");
        setThinkingMs(null);
        setCurrentAction("");
        setToolLines([]);
        setElapsed(0);
        setAliveHint("\u4EFB\u52A1\u5DF2\u542F\u52A8\uFF0C\u6B63\u5728\u8FDE\u63A5\u8FDB\u5EA6\u6D41\u2026");
        setLog("");
        setErr("");
      }
      cdSnapshotPersist({
        phase: "running",
        jobId: jid,
        streamToken: streamToken || void 0
      });
      var logAcc = log || "";
      var streamAcc = resume ? cdStripExplorationFromProcess(cdStripBoilerplate(String(streamText || ""))) : "";
      var deliveryAcc = resume ? String(deliveryText || "") : "";
      var thinkAcc = resume && thinkingText ? cdDedupeThinkText(String(thinkingText)) : "\u6B63\u5728\u5BF9\u7167\u5DE5\u4F5C\u533A\u2026";
      var toolAcc = toolLines.slice();
      var stepState = resume && steps && steps.length ? steps.slice() : cdInitSteps().map(function(s) {
        return s.id === "brief" ? Object.assign({}, s, { state: "done" }) : s;
      });
      var finished = false;
      var startedAt = Date.now() - (resume ? Math.max(0, Number(elapsed) || 0) * 1e3 : 0);
      var lastFlush = 0;
      function applyJobProcessText(raw, keepPrev) {
        var prev = String(keepPrev || streamAcc || "");
        var t = cdStripExplorationFromProcess(
          cdStripBoilerplate(String(raw || ""))
        );
        if (t) {
          streamAcc = t;
        } else if (prev) {
          streamAcc = prev;
        } else {
          streamAcc = String(raw || "");
        }
        flushStream(true);
      }
      function applyStreamPayload(raw) {
        var t = String(raw || "");
        var prev = String(streamAcc || "");
        if (/说明方案|一句话结论/.test(t)) {
          var routed = cdRouteStreamChannels(t);
          streamAcc = routed.process || cdStripAllCodeText(t) || prev;
          if (routed.delivery) {
            deliveryAcc = routed.delivery;
            setDeliveryText(deliveryAcc);
          }
        } else {
          streamAcc = cdStripAllCodeText(t) || t || prev;
        }
        flushStream(true);
      }
      function applyJobSnapshot(job) {
        if (!job || typeof job !== "object") return;
        if (job.stream_token) {
          streamToken = String(job.stream_token || "").trim() || streamToken;
          if (streamToken) streamTokenRef.current = streamToken;
        }
        if (job.live_text != null) {
          applyJobProcessText(job.live_text, streamAcc);
        }
        if (job.delivery_text != null && String(job.delivery_text || "").trim()) {
          deliveryAcc = String(job.delivery_text || "");
          setDeliveryText(deliveryAcc);
        }
        if (job.thinking_text) {
          thinkAcc = cdDedupeThinkText(String(job.thinking_text || ""));
          setThinkingText(thinkAcc);
        }
        if (job.thinking_duration_ms != null) setThinkingMs(job.thinking_duration_ms);
      }
      fetch(engineBase() + "/api/code-dev/jobs/" + encodeURIComponent(jid)).then(function(r) {
        return r.json();
      }).then(function(jd) {
        if (jd && jd.ok && jd.job) applyJobSnapshot(jd.job);
        if (jd && jd.stream_token) {
          streamToken = String(jd.stream_token || "").trim() || streamToken;
          if (streamToken) streamTokenRef.current = streamToken;
        }
        startStream();
      }).catch(function() {
        startStream();
      });
      var tickTimer = setInterval(function() {
        if (finished) {
          clearInterval(tickTimer);
          return;
        }
        var sec = Math.floor((Date.now() - startedAt) / 1e3);
        setElapsed(sec);
        setAliveHint("Cursor \u4ECD\u5728\u5DE5\u4F5C \xB7 \u5DF2\u8FD0\u884C " + cdFormatDuration(sec) + "\uFF08\u754C\u9762\u672A\u5361\u4F4F\uFF0C\u8BF7\u7A0D\u5019\uFF09");
      }, 1e3);
      function flushStream(force) {
        var now = Date.now();
        if (!force && now - lastFlush < 20) return;
        lastFlush = now;
        setStreamText(streamAcc);
      }
      function pushLog(line) {
        if (!line) return;
        logAcc += line + "\n";
        setLog(logAcc);
      }
      function finish(ev) {
        if (finished) return;
        finished = true;
        clearInterval(tickTimer);
        cancelRunningRef.current = null;
        setCancelling(false);
        flushStream(true);
        setBusy(false);
        setPhase("done");
        var termSt = String(
          ev && ev.status || ev && ev.job && ev.job.status || (ev && ev.ok === false ? "failed" : "succeeded")
        );
        var isCancelled = termSt === "cancelled";
        var asError = termSt === "failed" || isCancelled || !!(ev && ev.ok === false && termSt !== "succeeded");
        var sealed = cdFinalizeSteps(stepState, ev, asError);
        setSteps(sealed);
        var dur = Math.floor((Date.now() - startedAt) / 1e3);
        setElapsed(dur);
        setAliveHint(
          isCancelled ? "\u4EFB\u52A1\u5DF2\u53D6\u6D88 \xB7 \u5171 " + cdFormatDuration(dur) : asError ? "\u4EFB\u52A1\u7ED3\u675F\uFF08\u5931\u8D25\uFF09\xB7 \u5171 " + cdFormatDuration(dur) : "\u4EFB\u52A1\u5B8C\u6210 \xB7 \u5171 " + cdFormatDuration(dur)
        );
        if (ev && ev.synced_files) setSynced(ev.synced_files || []);
        if (ev && ev.deferred_files) setDeferred(ev.deferred_files || []);
        if (ev && ev.deleted_files) setDeleted(ev.deleted_files || []);
        if (ev && ev.job) {
          if (ev.job.synced_files) setSynced(ev.job.synced_files || []);
          if (ev.job.deferred_files) setDeferred(ev.job.deferred_files || []);
          if (ev.job.deleted_files) setDeleted(ev.job.deleted_files || []);
          if (ev.job.runtime_hint) setRuntimeHint(String(ev.job.runtime_hint));
          if (ev.job.thinking_text) setThinkingText(cdDedupeThinkText(String(ev.job.thinking_text)));
          if (ev.job.thinking_duration_ms != null) setThinkingMs(ev.job.thinking_duration_ms);
          if (ev.job.live_text) {
            applyJobProcessText(ev.job.live_text, streamAcc);
          }
          if (ev.job.delivery_text) {
            deliveryAcc = String(ev.job.delivery_text);
            setDeliveryText(deliveryAcc);
          }
          if (ev.job.workspace) setWorkspace(String(ev.job.workspace));
        }
        var ok = termSt === "succeeded";
        var resultText = ev && (ev.reply || ev.error || ev.detail) || (isCancelled ? "\u4EFB\u52A1\u5DF2\u53D6\u6D88" : ok ? "\u5199\u7801\u4EFB\u52A1\u5DF2\u7ED3\u675F" : "\u5199\u7801\u5931\u8D25");
        setResult(resultText);
        if (isCancelled) setErr(ev && (ev.error || ev.detail) || "\u4EFB\u52A1\u5DF2\u53D6\u6D88");
        else if (!ok) setErr(ev && (ev.error || ev.detail || ev.reply) || "\u5199\u7801\u5931\u8D25");
        else if (ev && (ev.deferred_files || []).length) {
          setErr(
            "\u6709 " + ev.deferred_files.length + " \u4E2A\u6587\u4EF6\u56E0\u5199\u8303\u56F4\u672A\u540C\u6B65\uFF08\u542B\u8DEF\u7531/\u83DC\u5355\u65F6\u4F1A\u5BFC\u81F4\u5237\u65B0\u770B\u4E0D\u5230\u65B0\u754C\u9762\uFF09\uFF1A" + ev.deferred_files.slice(0, 6).join("\u3001")
          );
        }
        cdPersistSaveCard(block, props.sessionId, toolCallId, {
          phase: "done",
          jobId: jid,
          callId: toolCallId || cdBlockCallId(block),
          sessionId: cdBlockSessionId(block, props.sessionId),
          workspace: ev && ev.job && ev.job.workspace || workspace,
          requirement,
          goal,
          brief,
          streamText: streamAcc,
          deliveryText: deliveryAcc,
          steps: sealed,
          elapsed: dur,
          aliveHint: asError ? "\u4EFB\u52A1\u7ED3\u675F\uFF08\u5931\u8D25\uFF09\xB7 \u5171 " + cdFormatDuration(dur) : "\u4EFB\u52A1\u5B8C\u6210 \xB7 \u5171 " + cdFormatDuration(dur),
          thinkingText: thinkAcc,
          thinkingMs: ev && ev.job ? ev.job.thinking_duration_ms : thinkingMs,
          synced: ev && ev.synced_files || ev && ev.job && ev.job.synced_files || synced,
          deferred: ev && ev.deferred_files || ev && ev.job && ev.job.deferred_files || deferred,
          deleted: ev && ev.deleted_files || ev && ev.job && ev.job.deleted_files || deleted,
          result: resultText,
          runtimeHint: ev && ev.job && ev.job.runtime_hint || runtimeHint || ""
        });
      }
      cancelRunningRef.current = function() {
        if (finished || cancelling) return;
        setCancelling(true);
        setAliveHint("\u6B63\u5728\u53D6\u6D88\u4EFB\u52A1\u2026");
        fetch(engineBase() + "/api/code-dev/jobs/" + encodeURIComponent(jid) + "/cancel", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" })
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (!d || !d.ok) {
            throw new Error(d && (d.detail || d.reply) || "\u53D6\u6D88\u5931\u8D25");
          }
          var job = d.job || {};
          finish({
            ok: false,
            status: "cancelled",
            error: job.error || "\u7528\u6237\u53D6\u6D88",
            reply: d.reply || "\u4EFB\u52A1\u5DF2\u53D6\u6D88",
            job
          });
        }).catch(function(e) {
          setCancelling(false);
          setErr(e && e.message || "\u53D6\u6D88\u5931\u8D25");
        });
      };
      function startStream() {
        var streamUrl = engineBase() + "/api/code-dev/jobs/" + encodeURIComponent(jid) + "/stream";
        if (streamToken) {
          streamUrl += "?stream_token=" + encodeURIComponent(streamToken);
        }
        fetch(streamUrl, {
          headers: { Accept: "text/event-stream" }
        }).then(function(r) {
          if (!r.ok || !r.body || !r.body.getReader) {
            throw new Error("\u65E0\u6CD5\u8BA2\u9605\u8FDB\u5EA6\u6D41");
          }
          setAliveHint("\u5DF2\u8FDE\u63A5\u8FDB\u5EA6\u6D41 \xB7 Cursor \u5199\u7801\u8FC7\u7A0B\u4F1A\u5B9E\u65F6\u5237\u65B0");
          var reader = r.body.getReader();
          var decoder = new TextDecoder();
          var pending = "";
          function onEvent(ev) {
            if (!ev || typeof ev !== "object") return;
            if (ev.type === "step") {
              stepState = cdApplyStep(stepState, ev);
              setSteps(stepState.slice());
              var line = ev.title || ev.detail || ev.id || "";
              if (line) pushLog(line);
              if (ev.state === "running" && line) {
                setAliveHint(line + " \xB7 \u5DF2\u8FD0\u884C " + cdFormatDuration(Math.floor((Date.now() - startedAt) / 1e3)));
              }
            } else if (ev.type === "status") {
              var st = ev.text || ev.detail || "";
              if (st) {
                pushLog(st);
                setAliveHint(st + " \xB7 \u5DF2\u8FD0\u884C " + cdFormatDuration(Math.floor((Date.now() - startedAt) / 1e3)));
              }
            } else if (ev.type === "token") {
              streamAcc = String(streamAcc || "") + String(ev.text || "");
              if (streamAcc.length > 1e5) streamAcc = streamAcc.slice(-1e5);
              flushStream(true);
            } else if (ev.type === "token_delivery") {
              deliveryAcc = String(deliveryAcc || "") + String(ev.text || "");
              if (deliveryAcc.length > 1e5) deliveryAcc = deliveryAcc.slice(-1e5);
              setDeliveryText(deliveryAcc);
            } else if (ev.type === "replace_text") {
              applyStreamPayload(String(ev.text || ""));
            } else if (ev.type === "replace_delivery") {
              deliveryAcc = String(ev.text || "");
              setDeliveryText(deliveryAcc);
              var routedDel = cdRouteStreamChannels(streamAcc + "\n\n" + deliveryAcc);
              if (routedDel.process !== streamAcc) {
                streamAcc = routedDel.process;
                flushStream(true);
              }
            } else if (ev.type === "thinking") {
              if (ev.text) thinkAcc = cdDedupeThinkText(String(ev.text || ""));
              else if (ev.delta) thinkAcc = cdDedupeThinkText(thinkAcc + String(ev.delta || ""));
              if (thinkAcc.length > 12e3) thinkAcc = thinkAcc.slice(-12e3);
              if (thinkAcc) setThinkingText(thinkAcc);
            } else if (ev.type === "tool_call") {
              var toolLine = String(ev.text || ev.detail || "").trim();
              if (toolLine) {
                setCurrentAction(toolLine);
                var pkey = cdActivityPathKey(toolLine);
                toolAcc = toolAcc.filter(function(x) {
                  return !pkey || cdActivityPathKey(x) !== pkey;
                });
                toolAcc = cdCompactToolLines(toolAcc.concat([toolLine])).slice(-8);
                setToolLines(toolAcc.slice());
              }
            } else if (ev.type === "done") {
              finish(ev);
            } else if (ev.type === "error") {
              finish({ ok: false, error: ev.message || ev.detail, reply: ev.message || ev.detail });
            }
          }
          function pump() {
            return reader.read().then(function(res) {
              if (res.done) {
                if (!finished) {
                  fetch(engineBase() + "/api/code-dev/jobs/" + encodeURIComponent(jid)).then(function(r2) {
                    return r2.json();
                  }).then(function(jd) {
                    var job = jd && jd.job || jd || {};
                    var st = job.status || "";
                    if (job.live_text) {
                      applyJobProcessText(job.live_text, streamAcc);
                    }
                    if (job.delivery_text) {
                      deliveryAcc = String(job.delivery_text);
                      setDeliveryText(deliveryAcc);
                    }
                    if (job.thinking_text) {
                      thinkAcc = cdDedupeThinkText(String(job.thinking_text));
                      setThinkingText(thinkAcc);
                    }
                    if (job.thinking_duration_ms != null) setThinkingMs(job.thinking_duration_ms);
                    finish({
                      ok: st === "succeeded",
                      status: st,
                      reply: jd && jd.reply || "",
                      job,
                      synced_files: job.synced_files || [],
                      deferred_files: job.deferred_files || [],
                      deleted_files: job.deleted_files || [],
                      error: job.error || ""
                    });
                  }).catch(function() {
                    finish({ ok: false, error: "\u6D41\u5F0F\u7ED3\u675F\u4F46\u672A\u6536\u5230\u5B8C\u6210\u4E8B\u4EF6" });
                  });
                }
                return;
              }
              pending += decoder.decode(res.value, { stream: true });
              var chunks = pending.split("\n\n");
              pending = chunks.pop() || "";
              chunks.forEach(function(blk) {
                blk.split("\n").forEach(function(line) {
                  if (line.indexOf("data:") !== 0) return;
                  var raw = line.slice(5).trim();
                  if (!raw) return;
                  try {
                    onEvent(JSON.parse(raw));
                  } catch (e1) {
                  }
                });
              });
              return pump();
            });
          }
          return pump();
        }).catch(function(e) {
          finished = true;
          clearInterval(tickTimer);
          setPhase("done");
          setBusy(false);
          setSteps(cdSealSteps(stepState, true));
          setErr("\u8BA2\u9605\u8FDB\u5EA6\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
        });
      }
    }
    useEffect(
      function() {
        if (restoreOnceRef.current) return;
        restoreOnceRef.current = true;
        var pack = cdPersistLoadForCard(block, props.sessionId, toolCallId);
        var savedRaw = pack.saved && cdPersistBelongsToCall(pack.saved, toolCallId) ? cdPersistEnrichCardSaved(pack.saved) : null;
        var forceHitl = cdPickMustStayHitl(wb, ui, savedRaw, toolCallId);
        var saved = null;
        if (savedRaw && !forceHitl) saved = savedRaw;
        else if (savedRaw && forceHitl && (savedRaw.phase === "options" || savedRaw.phase === "propose")) {
          saved = savedRaw;
        }
        if (saved && saved.streamToken) {
          streamTokenRef.current = String(saved.streamToken || "").trim();
        }
        if (forceHitl || !toolCallId) {
          var sidClr = cdBlockSessionId(block, props.sessionId);
          ["wb-cd-card:anon"].concat(
            sidClr ? ["wb-cd-card:" + sidClr, "wb-cd-card:session:" + sidClr + ":lone"] : []
          ).forEach(function(sharedKey) {
            try {
              localStorage.removeItem(sharedKey);
            } catch (eRm) {
            }
          });
          if (phase === "done" || phase === "running") {
            setPhase(
              saved && (saved.phase === "options" || saved.phase === "propose") ? saved.phase : "form"
            );
            setJobId("");
            setResult("");
            setDeliveryText("");
            setStreamText("");
            setSteps(cdInitSteps());
            setAliveHint("\u51C6\u5907\u542F\u52A8\u2026");
          }
          if (saved && (saved.phase === "options" || saved.phase === "propose")) {
            cdPersistSaveCard(block, props.sessionId, toolCallId, saved);
          }
          return;
        }
        if (ui && ui.kind === "pick" || wb && wb.t === "cd-pick") {
          var sidPick = cdBlockSessionId(block, props.sessionId);
          ["wb-cd-card:anon"].concat(
            sidPick ? ["wb-cd-card:" + sidPick, "wb-cd-card:session:" + sidPick + ":lone"] : []
          ).forEach(function(sharedKey) {
            try {
              localStorage.removeItem(sharedKey);
            } catch (eRm2) {
            }
          });
        }
        var jid = saved && saved.jobId || wb && wb.t === "cd-job" && wb.job_id || "";
        function hydrateJobId(foundId) {
          if (!foundId) return Promise.resolve();
          if (ui && ui.kind === "pick" || wb && wb.t === "cd-pick") {
            if (!saved || !saved.jobId || String(saved.jobId) !== String(foundId)) {
              return Promise.resolve();
            }
            if (!cdPersistBelongsToCall(saved, toolCallId)) return Promise.resolve();
          }
          return fetch(engineBase() + "/api/code-dev/jobs/" + encodeURIComponent(foundId)).then(function(r) {
            return r.json();
          }).then(function(jd) {
            if (!jd || !jd.ok) return;
            var job = jd.job || {};
            var jobCall = String(job.ui_call_id || "").trim();
            var savedBond = saved && String(saved.jobId || "") === String(foundId);
            if (toolCallId && jobCall && jobCall !== toolCallId) return;
            if (toolCallId && !jobCall && !savedBond) return;
            setJobId(foundId);
            hydrateFromJob(job, jd);
            cdPersistSaveCard(block, props.sessionId, toolCallId, {
              phase: String(job.status || "") === "queued" || String(job.status || "") === "running" ? "running" : "done",
              jobId: foundId,
              streamToken: String(saved && saved.streamToken || jd.stream_token || "").trim() || void 0,
              callId: toolCallId,
              sessionId: props.sessionId || "",
              workspace: job.workspace || workspace,
              requirement,
              goal,
              brief,
              deliveryText: job.delivery_text || "",
              streamText: job.live_text || "",
              thinkingText: job.thinking_text || "",
              thinkingMs: job.thinking_duration_ms,
              steps: cdJobStepsFromRecord(job),
              synced: job.synced_files || [],
              deferred: job.deferred_files || [],
              deleted: job.deleted_files || [],
              result: jd && jd.reply || "",
              runtimeHint: job.runtime_hint || "",
              aliveHint: cdJobAliveHint(job)
            });
            var st = String(job.status || "");
            if (st === "queued" || st === "running") {
              resumeWatchRef.current = {
                jid: foundId,
                streamToken: String(
                  saved && saved.streamToken || jd.stream_token || ""
                ).trim()
              };
            }
          }).catch(function() {
          });
        }
        if (jid) {
          hydrateJobId(jid);
          return;
        }
        if (saved && saved.jobId && (saved.phase === "done" || saved.phase === "running") && !saved.streamText && !saved.deliveryText) {
          var snapOnly = cdPersistLoadJobSnapshot(saved.jobId);
          if (snapOnly) {
            hydrateFromJob(
              {
                workspace: snapOnly.workspace,
                live_text: snapOnly.streamText,
                delivery_text: snapOnly.deliveryText,
                thinking_text: snapOnly.thinkingText,
                thinking_duration_ms: snapOnly.thinkingMs,
                synced_files: snapOnly.synced,
                deferred_files: snapOnly.deferred,
                deleted_files: snapOnly.deleted,
                runtime_hint: snapOnly.runtimeHint,
                status: snapOnly.phase === "running" ? "running" : "succeeded"
              },
              { reply: snapOnly.result }
            );
          }
          hydrateJobId(String(saved.jobId));
          return;
        }
        if (toolCallId) {
          fetch(
            engineBase() + "/api/code-dev/jobs?limit=5&ui_call_id=" + encodeURIComponent(toolCallId)
          ).then(function(r) {
            return r.json();
          }).then(function(d) {
            var rows = d && d.jobs || [];
            if (!rows.length) {
              if (saved && (saved.phase === "options" || saved.phase === "propose")) {
                cdPersistSaveCard(block, props.sessionId, toolCallId, saved);
              }
              return;
            }
            if (!saved || !saved.jobId) return;
            var hit = rows.filter(function(row) {
              return String(row && row.id || "") === String(saved.jobId);
            })[0];
            if (!hit) return;
            return hydrateJobId(String(hit.id || ""));
          }).catch(function() {
          });
          return;
        }
        if (saved && (saved.phase === "options" || saved.phase === "propose")) {
          cdPersistSaveCard(block, props.sessionId, toolCallId, saved);
        }
      },
      [persistKey, toolCallId]
    );
    useEffect(
      function() {
        if (!resumeWatchRef.current) return;
        var pack = resumeWatchRef.current;
        resumeWatchRef.current = null;
        var jid = typeof pack === "string" ? pack : pack && pack.jid;
        var stok = typeof pack === "object" && pack ? String(pack.streamToken || "").trim() : "";
        if (!jid) return;
        watchJob(jid, { resume: true, streamToken: stok });
      }
    );
    useEffect(
      function() {
        if (phase === "running" || phase === "done" || phase === "options" || phase === "propose" || phase === "form" && (requirement || workspace || optionsUi || proposeUi)) {
          cdSnapshotPersist();
        }
      },
      [
        persistKey,
        phase,
        jobId,
        workspace,
        requirement,
        goal,
        streamText,
        steps,
        elapsed,
        aliveHint,
        thinkingText,
        thinkingMs,
        synced,
        deferred,
        deleted,
        result,
        optionsUi,
        proposeUi,
        selectedOpts,
        notes,
        ackWarn,
        brief
      ]
    );
    function confirmStart() {
      var ws = String(workspace || "").trim();
      var req = String(requirement || "").trim();
      var pui2 = proposeUi || {};
      var val2 = pui2.validation || {};
      if (!ws) {
        setErr("\u8BF7\u586B\u5199\u6216\u6D4F\u89C8\u9009\u62E9\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55");
        return;
      }
      if (!req) {
        setErr("\u8BF7\u586B\u5199\u9700\u6C42\u6458\u8981");
        return;
      }
      if (val2.errors && val2.errors.length) {
        setErr(val2.errors.join("\uFF1B"));
        return;
      }
      if (val2.warnings && val2.warnings.length && !ackWarn) {
        setErr("\u8BF7\u5148\u52FE\u9009\u786E\u8BA4\uFF1A\u6458\u8981\u4E0E\u539F\u59CB\u8BC9\u6C42\u4E00\u81F4");
        return;
      }
      setBusy(true);
      setErr("");
      issueHitl("code-dev.confirm", { workspace: ws, requirement: req }).then(function(nonce) {
        return fetch(engineBase() + "/api/code-dev/confirm", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            workspace: ws,
            requirement: req,
            code_dev_brief: brief || pui2.brief || {
              original_goal: goal || req,
              workspace: ws,
              selections: [],
              notes: [],
              option_rounds: 0
            },
            write_scope: pui2.write_scope && pui2.write_scope.length ? pui2.write_scope : void 0,
            source_gate_job_id: pui2.source_gate_job_id || void 0,
            nonce,
            ui_call_id: toolCallId || void 0,
            ui_session_id: props.sessionId || void 0
          })
        });
      }).then(function(r) {
        return r.json().then(function(d) {
          return { status: r.status, d };
        });
      }).then(function(pack) {
        var d = pack.d || {};
        if (!d.ok) {
          setBusy(false);
          setErr(d.detail || d.reply || "\u542F\u52A8\u5931\u8D25");
          if (d.validation) {
            setProposeUi(
              Object.assign({}, pui2, {
                validation: d.validation,
                requirement: req,
                workspace: ws
              })
            );
          }
          return;
        }
        var jid = String(d.job_id || "");
        var stok = String(d.stream_token || d.job && d.job.stream_token || "").trim();
        if (stok) streamTokenRef.current = stok;
        setJobId(jid);
        setPhase("running");
        setLog((d.reply || "\u5DF2\u542F\u52A8") + "\n");
        setResult("");
        if (jid) {
          cdPersistSaveCard(block, props.sessionId, toolCallId, {
            phase: "running",
            jobId: jid,
            streamToken: stok || void 0,
            callId: toolCallId || "",
            sessionId: props.sessionId || "",
            workspace: ws,
            requirement: req,
            goal: goal || req,
            brief
          });
          watchJob(jid, { streamToken: stok });
        } else {
          setPhase("done");
          setBusy(false);
          setResult(d.reply || "\u5DF2\u542F\u52A8\uFF08\u65E0 job_id\uFF09");
        }
      }).catch(function(e) {
        setBusy(false);
        setErr("\u8BF7\u6C42\u5931\u8D25\uFF1A" + (e && e.message ? e.message : e));
      });
    }
    function optionSummaryText() {
      if (!optionsUi) return "";
      var groups2 = (optionsUi.options || {}).groups || [];
      var lines = [];
      groups2.forEach(function(g) {
        var ids = selectedOpts[g.id] || [];
        var labels = (g.options || []).filter(function(o) {
          return ids.indexOf(o.id) >= 0;
        }).map(function(o) {
          return o.label || o.id;
        });
        if (labels.length) lines.push((g.label || g.id) + "\uFF1A" + labels.join("\u3001"));
      });
      if (notes) lines.push("\u5907\u6CE8\uFF1A" + notes);
      return lines.join("\n");
    }
    function confirmTrailCards() {
      var cards = [];
      if (phase === "form") return cards;
      cards.push(
        h(CdDoneCard, {
          key: "t-form",
          title: "1 \xB7 \u9009\u76EE\u5F55\u4E0E\u8BC9\u6C42",
          body: String(workspace || "") + (requirement ? "\n" + String(requirement).slice(0, 280) : "")
        })
      );
      if (optionsUi && phase !== "options") {
        cards.push(
          h(CdDoneCard, {
            key: "t-opt",
            title: "2 \xB7 \u9700\u6C42\u9009\u9879",
            body: optionSummaryText() || "\u5DF2\u786E\u8BA4\u9009\u9879"
          })
        );
      }
      var nConfirm = optionsUi ? "3" : "2";
      var nGo = optionsUi ? "4" : "3";
      if ((phase === "running" || phase === "done") && proposeUi) {
        cards.push(
          h(CdDoneCard, {
            key: "t-propose",
            title: nConfirm + " \xB7 \u6838\u5BF9\u5199\u7801\u6458\u8981",
            body: String(requirement || goal || "").slice(0, 280) || "\u5DF2\u6838\u5BF9\u6458\u8981"
          })
        );
      }
      if (phase === "running" || phase === "done") {
        cards.push(
          h(CdDoneCard, {
            key: "t-go",
            title: nGo + " \xB7 \u786E\u8BA4\u5F00\u5DE5",
            body: "\u5DF2\u542F\u52A8 Cursor \u5199\u7801" + (jobId ? " \xB7 " + jobId : "")
          })
        );
      }
      return cards;
    }
    function pipelineForHitl() {
      return CD_PIPELINE.map(function(p) {
        return {
          id: p.id,
          title: p.title,
          state: "pending"
        };
      });
    }
    function wrapStack(active) {
      return h("div", { className: "wb-cd-stack" }, [
        h(CdFlowIntro, { key: "intro" }),
        h(CdPipelineCards, { key: "pipe", steps: pipelineForHitl() }),
        active
      ]);
    }
    if (wb && wb.t === "cd-redirect-integrated") {
      var redirectText = "";
      try {
        var contents = block && block.content || [];
        redirectText = contents.map(function(c) {
          return c && c.type === "text" ? String(c.text || "") : "";
        }).filter(Boolean).join("\n");
      } catch (eRd) {
      }
      return h(
        "div",
        { className: "wb-cr" },
        h(
          "div",
          { className: "wb-cr-head" },
          h("span", { className: "wb-cr-badge" }, "\u9700\u6C42\u2192\u4E0A\u7EBF"),
          h("span", { className: "wb-cr-hint" }, "\u5DF2\u6539\u8D70\u8FC7\u7A0B\u6D41")
        ),
        h(
          "div",
          { className: "wb-cr-body" },
          h(
            "p",
            { className: "wb-cr-sum", style: { margin: 0 } },
            maskVendorUiText(
              redirectText || "\u672C\u4F1A\u8BDD\u5DF2\u5F00\u300C\u9700\u6C42\u2192\u4E0A\u7EBF\u300D\uFF0C\u8FDB\u5EA6\u8BF7\u770B\u4E0A\u65B9\u8FC7\u7A0B\u6D41\u5361\uFF1B\u4E0D\u4F1A\u5F39\u51FA Cursor \u5199\u7801\u786E\u8BA4\u5361\u3002"
            )
          )
        )
      );
    }
    if (phase === "running" || phase === "done") {
      var processText = String(streamText || "");
      var showDelivery = String(deliveryText || "").trim();
      if (!showDelivery && /说明方案|一句话结论/.test(processText)) {
        var routedView = cdRouteStreamChannels(processText);
        processText = routedView.process || processText;
        showDelivery = String(routedView.delivery || "").trim();
      }
      if (thinkingText && processText && processText.replace(/\s+/g, "").length < 64 && cdProcessOverlapsThink(processText, thinkingText)) {
        processText = "";
      }
      if (!showDelivery) {
        var splitFb = cdSplitDelivery(cdStripBoilerplate(streamText));
        if (splitFb.delivery) showDelivery = splitFb.delivery;
      }
      if (phase === "running" && !processText && toolLines.length) {
        processText = toolLines.slice(-8).join("\n");
      }
      var wsShort = String(workspace || "").replace(/\/+$/, "");
      var slash = wsShort.lastIndexOf("/");
      if (slash > 0) wsShort = wsShort.slice(slash + 1);
      var pipeSteps = steps && steps.length ? steps : cdInitSteps();
      var thinkEl = phase === "running" || thinkingText || thinkingMs != null ? h(CdThinkPanel, {
        running: phase === "running",
        text: thinkingText,
        action: currentAction,
        ms: thinkingMs,
        elapsed
      }) : null;
      var bodyKids = [];
      if (thinkEl) bodyKids.push(thinkEl);
      if (phase === "running" && (toolLines.length || currentAction)) {
        bodyKids.push(
          h(CdActivityFeed, {
            lines: toolLines,
            live: currentAction,
            running: phase === "running"
          })
        );
      }
      var showProcess = processText;
      if (showProcess) {
        bodyKids.push(
          h("div", {
            className: "wb-cd-md",
            ref: streamBoxRef,
            dangerouslySetInnerHTML: { __html: cdProcessHtml(showProcess) }
          })
        );
      } else if (phase === "running" && !showProcess && !showDelivery) {
        bodyKids.push(
          h(
            "p",
            { className: "wb-cr-dsh" },
            "\u6B63\u5728\u5B9A\u4F4D\u4E0E\u6539\u7801\uFF1B\u6B63\u6587\u5C06\u5728\u5185\u5BB9\u53D6\u9F50\u540E\u6D41\u5F0F\u5237\u65B0\u2026"
          )
        );
      }
      if (showDelivery) {
        bodyKids.push(
          h("div", {
            className: "wb-cd-doc wb-cd-md",
            dangerouslySetInnerHTML: { __html: cdBuildDocHtml(showDelivery) }
          })
        );
      }
      if (synced && synced.length) {
        bodyKids.push(
          h(
            "div",
            { className: "wb-cr-files", style: { marginTop: 10 } },
            h("div", { className: "wb-cr-label", style: { marginBottom: 6 } }, "\u5DF2\u540C\u6B65\u6587\u4EF6"),
            synced.slice(0, 40).map(function(f, i) {
              return h("div", { key: i, className: "wb-cr-file" }, h("span", null, String(f)));
            })
          )
        );
      }
      if (deleted && deleted.length) {
        bodyKids.push(
          h(
            "div",
            { className: "wb-cr-files", style: { marginTop: 10 } },
            h("div", { className: "wb-cr-label", style: { marginBottom: 6 } }, "\u5DF2\u4ECE\u672C\u673A\u5220\u9664"),
            deleted.slice(0, 40).map(function(f, i) {
              return h("div", { key: "d" + i, className: "wb-cr-file" }, h("span", null, String(f)));
            })
          )
        );
      }
      if (deferred && deferred.length) {
        var deferWiring = deferred.some(function(f) {
          var s = String(f || "").replace(/\\/g, "/");
          return s.indexOf("frontend/src/config/") >= 0 || s.indexOf("frontend/src/router/") >= 0 || s.indexOf("frontend/src/layouts/") >= 0 || /reportFeatures|reportIcons|menu/i.test(s);
        });
        bodyKids.push(
          h(
            "div",
            { className: "wb-cr-warn", style: { marginTop: 8 } },
            (deferWiring ? "\u26A0 \u83DC\u5355/\u8DEF\u7531\u914D\u7F6E\u672A\u540C\u6B65\u5230\u672C\u673A\uFF0C\u6D4F\u89C8\u5668\u53EF\u80FD\u770B\u4E0D\u5230\u65B0\u83DC\u5355\uFF08\u52FF\u4FE1\u300C\u5DF2\u4E0A\u83DC\u5355\u300D\u4EA4\u4ED8\u6587\u6848\uFF09\u3002\u8BF7\u91CD\u65B0\u5F00\u5DE5\u6216\u6269\u5927\u5199\u8303\u56F4\u3002\n" : "") + "\u672A\u540C\u6B65 " + deferred.length + " \u4E2A\u6587\u4EF6\uFF1A\n" + deferred.slice(0, 12).join("\n")
          )
        );
      }
      return h(
        "div",
        { className: "wb-cd-composer", ref: composerRef },
        h(
          "div",
          { className: "wb-cd-composer-bar" },
          phase === "running" ? h("span", { className: "wb-cd-pulse" }) : null,
          h(
            "span",
            null,
            phase === "running" ? "\u5199\u4F5C\u4E2D \xB7 " + cdFormatDuration(elapsed) : maskVendorUiText(aliveHint || "\u5DF2\u5B8C\u6210 \xB7 " + cdFormatDuration(elapsed))
          ),
          h("span", { className: "ws", title: workspace }, wsShort || workspace || ""),
          h("span", { className: "ws", title: "\u5199\u7801 UI \u7248\u672C " + CD_UI_REV, style: { fontSize: 10, opacity: 0.55 } }, CD_UI_REV),
          phase === "running" ? h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn",
              disabled: cancelling,
              style: { marginLeft: 8, fontSize: 12, padding: "2px 10px" },
              onClick: function() {
                if (cancelRunningRef.current) cancelRunningRef.current();
              }
            },
            cancelling ? "\u53D6\u6D88\u4E2D\u2026" : "\u53D6\u6D88\u4EFB\u52A1"
          ) : null
        ),
        h(CdPipelineCards, { steps: pipeSteps }),
        bodyKids.length ? h("div", { className: "wb-cd-stream" }, bodyKids) : null,
        runtimeHint ? h(
          "div",
          { className: "wb-cr-warn", style: { marginTop: 10 } },
          maskVendorUiText(runtimeHint)
        ) : null,
        err ? h("p", { className: "wb-cr-err" }, maskVendorUiText(err)) : null
      );
    }
    if ((phase === "options" || phase === "propose") && (!wb || wb.t !== "cd-pick" && !(ui && ui.kind === "pick")) && !(ui && (ui.kind === "pick" || ui.kind === "propose" || ui.kind === "options"))) {
      var outFallback = block && "kind" in block ? (block.content || []).map(function(c) {
        return c && c.type === "text" ? c.text : "";
      }).filter(Boolean).join("\n") : "\u5199\u7801\u8FDB\u884C\u4E2D\u2026";
      return h(
        "div",
        { className: "wb-cr" },
        h(
          "div",
          { className: "wb-cr-head" },
          h("span", { className: "wb-cr-badge" }, "\u672C\u673A\u5199\u7801"),
          h("span", { className: "wb-cr-hint" }, "\u7ED3\u679C")
        ),
        h(
          "div",
          { className: "wb-cr-body" },
          h("pre", { className: "wb-cr-progress", style: { margin: 0 } }, outFallback || "\uFF08\u65E0\u8BE6\u60C5\uFF09")
        )
      );
    }
    if (phase === "options" && optionsUi) {
      var opts = optionsUi.options || {};
      var groups = Array.isArray(opts.groups) ? opts.groups : [];
      var og = optionsUi.original_goal || optionsUi.brief && optionsUi.brief.original_goal || goal;
      return wrapStack(h(
        "div",
        { className: "wb-cr" },
        head("\u9700\u6C42\u9009\u9879 \xB7 \u52FE\u9009\u540E\u7EE7\u7EED\uFF08\u4E0D\u4F1A\u7ACB\u523B\u5199\u7801\uFF09"),
        h(
          "div",
          { className: "wb-cr-body" },
          h("p", { className: "wb-cr-sum" }, maskVendorUiText(opts.title || "\u8BF7\u786E\u8BA4\u4EE5\u4E0B\u5173\u952E\u9879")),
          opts.summary ? h("p", { className: "wb-cr-dsh" }, maskVendorUiText(opts.summary)) : null,
          og ? h("p", { className: "wb-cr-dsh" }, "\u539F\u59CB\u8BC9\u6C42\uFF1A", h("code", null, og)) : null,
          groups.map(function(g) {
            return h(
              "div",
              { key: g.id, style: { marginBottom: 10 } },
              h(
                "div",
                { className: "wb-cr-label" },
                (g.label || g.id) + (g.required === false ? "" : " \xB7 \u5FC5\u9009") + (g.multi ? " \xB7 \u53EF\u591A\u9009" : " \xB7 \u5355\u9009")
              ),
              h(
                "div",
                { className: "wb-cr-chips" },
                (g.options || []).map(function(o) {
                  var on = (selectedOpts[g.id] || []).indexOf(o.id) >= 0;
                  return h(
                    "button",
                    {
                      key: o.id,
                      type: "button",
                      className: "wb-cr-chip" + (on ? " on" : ""),
                      style: on ? { borderColor: "#0ea5e9", color: "#0369a1", background: "#e0f2fe" } : void 0,
                      onClick: function() {
                        setSelectedOpts(function(prev) {
                          var next = Object.assign({}, prev);
                          var cur = (next[g.id] || []).slice();
                          if (g.multi) {
                            var ix = cur.indexOf(o.id);
                            if (ix >= 0) cur.splice(ix, 1);
                            else cur.push(o.id);
                          } else {
                            cur = [o.id];
                          }
                          next[g.id] = cur;
                          return next;
                        });
                      }
                    },
                    o.label || o.id
                  );
                })
              )
            );
          }),
          h(
            "label",
            { className: "wb-cr-label" },
            opts.notes_required ? "\u5907\u6CE8\uFF08\u5FC5\u586B\uFF09" : "\u5907\u6CE8\uFF08\u53EF\u9009\uFF09"
          ),
          h("textarea", {
            className: "wb-cr-input",
            style: { width: "100%", minHeight: 72, boxSizing: "border-box", marginBottom: 8 },
            value: notes,
            placeholder: opts.notes_placeholder || "\u8865\u5145\u7EA6\u675F\u3001\u9A8C\u6536\u70B9\u2026",
            onChange: function(e) {
              setNotes(e.target.value);
            }
          }),
          err ? h("p", { className: "wb-cr-err" }, maskVendorUiText(err)) : null,
          h(
            "div",
            { className: "wb-cr-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                disabled: busy,
                onClick: function() {
                  setPhase("form");
                  setErr("");
                }
              },
              "\u8FD4\u56DE\u6539\u8BC9\u6C42"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn primary",
                disabled: busy,
                onClick: submitOptions
              },
              busy ? "\u68B3\u7406\u4E2D\u2026" : "\u786E\u8BA4\u9009\u9879"
            )
          )
        )
      ));
    }
    if (phase === "propose") {
      var pui = proposeUi || {};
      var val = pui.validation || {};
      var mod = pui.target_hints && pui.target_hints.module || "";
      var paths = pui.target_hints && pui.target_hints.expected_paths || [];
      var og2 = pui.original_goal || pui.brief && pui.brief.original_goal || goal;
      var hasErr = !!(val.errors && val.errors.length);
      var hasWarn = !!(val.warnings && val.warnings.length) && !hasErr;
      return wrapStack(h(
        "div",
        { className: "wb-cr" },
        head("\u5199\u7801\u786E\u8BA4 \xB7 \u6838\u5BF9\u540E\u518D\u5F00\u5DE5"),
        h(
          "div",
          { className: "wb-cr-body" },
          h(
            "p",
            { className: "wb-cr-sum" },
            maskVendorUiText("\u8BF7\u786E\u8BA4\u539F\u59CB\u8BC9\u6C42\u3001\u76EE\u6807\u6A21\u5757\u4E0E\u9700\u6C42\u6458\u8981\uFF1B\u786E\u8BA4\u540E\u624D\u4F1A\u542F\u52A8 Cursor\u3002")
          ),
          og2 ? h("p", { className: "wb-cr-dsh" }, "\u539F\u59CB\u8BC9\u6C42\uFF1A", h("code", null, og2)) : null,
          mod ? h("p", { className: "wb-cr-dsh" }, "\u76EE\u6807\u6A21\u5757\uFF1A", h("code", null, mod)) : null,
          paths.length ? h(
            "p",
            { className: "wb-cr-dsh" },
            "\u9884\u671F\u6539\u52A8\uFF1A",
            paths.slice(0, 6).join(" \xB7 ")
          ) : null,
          hasErr ? h("div", { className: "wb-cr-err" }, maskVendorUiText(val.errors.join("\n"))) : null,
          hasWarn ? h("div", { className: "wb-cr-warn" }, maskVendorUiText(val.warnings.join("\n"))) : null,
          h(WorkspaceMismatchHint, {
            dshCwd,
            workspace,
            home: props.home,
            onUseDsh: function() {
              setWorkspace(dshCwd);
            }
          }),
          h(
            "label",
            { className: "wb-cr-label" },
            typeof workspaceDirFieldLabel === "function" ? workspaceDirFieldLabel() : "\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55"
          ),
          typeof workspaceDirFieldHint === "function" && workspaceDirFieldHint() ? h("p", { className: "wb-cr-dsh", style: { margin: "0 0 6px" } }, workspaceDirFieldHint()) : null,
          h(
            "div",
            { className: "wb-cr-row" },
            h("input", {
              className: "wb-cr-input",
              value: workspace,
              onChange: function(e) {
                setWorkspace(e.target.value);
              }
            }),
            h(
              "button",
              { type: "button", className: "wb-cr-btn", disabled: busy, onClick: browse },
              "\u6D4F\u89C8\u2026"
            )
          ),
          h("label", { className: "wb-cr-label" }, "\u9700\u6C42\u6458\u8981\uFF08\u53EF\u7F16\u8F91\uFF0C\u987B\u542B\u539F\u59CB\u4E1A\u52A1\u540D\u79F0\uFF09"),
          h("textarea", {
            className: "wb-cr-input",
            style: {
              width: "100%",
              minHeight: 120,
              boxSizing: "border-box",
              fontFamily: "inherit",
              marginBottom: 8
            },
            value: requirement,
            onChange: function(e) {
              setRequirement(e.target.value);
            }
          }),
          hasWarn ? h(
            "label",
            { className: "wb-set-check" },
            h("input", {
              type: "checkbox",
              checked: ackWarn,
              onChange: function(e) {
                setAckWarn(e.target.checked);
              }
            }),
            h("span", null, "\u6211\u5DF2\u6838\u5BF9\u539F\u59CB\u8BC9\u6C42\u4E0E\u76EE\u6807\u6A21\u5757\uFF0C\u786E\u8BA4\u6458\u8981\u4E0D\u504F\u79BB\u4E1A\u52A1\u76EE\u6807")
          ) : null,
          err ? h("p", { className: "wb-cr-err" }, maskVendorUiText(err)) : null,
          h(
            "div",
            { className: "wb-cr-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                disabled: busy,
                onClick: function() {
                  setPhase("form");
                  setErr("");
                }
              },
              "\u8FD4\u56DE\u6539\u8BC9\u6C42"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn primary",
                disabled: busy || hasErr,
                onClick: confirmStart
              },
              busy ? "\u542F\u52A8\u4E2D\u2026" : maskVendorUiText("\u786E\u8BA4\u5E76\u7528 Cursor \u5199\u5165\u672C\u673A")
            )
          )
        )
      ));
    }
    return wrapStack(h(
      "div",
      { className: "wb-cr" },
      head("\u9009\u62E9\u76EE\u5F55 \xB7 \u586B\u5199\u8BC9\u6C42 \xB7 \u5148\u68B3\u7406\u9700\u6C42"),
      h(
        "div",
        { className: "wb-cr-body" },
        h(WorkspaceMismatchHint, {
          dshCwd,
          workspace,
          home: props.home,
          onUseDsh: function() {
            setWorkspace(dshCwd);
          }
        }),
        h(
          "label",
          { className: "wb-cr-label" },
          typeof workspaceDirFieldLabel === "function" ? workspaceDirFieldLabel() : "\u672C\u673A\u5DE5\u7A0B\u76EE\u5F55"
        ),
        typeof workspaceDirFieldHint === "function" && workspaceDirFieldHint() ? h("p", { className: "wb-cr-dsh", style: { margin: "0 0 6px" } }, workspaceDirFieldHint()) : null,
        h(
          "div",
          { className: "wb-cr-row" },
          h("input", {
            className: "wb-cr-input",
            value: workspace,
            placeholder: "/Users/\u4F60/\u9879\u76EE",
            onChange: function(e) {
              setWorkspace(e.target.value);
            }
          }),
          h(
            "button",
            { type: "button", className: "wb-cr-btn", disabled: busy, onClick: browse },
            busy ? "\u9009\u62E9\u4E2D\u2026" : "\u6D4F\u89C8\u2026"
          )
        ),
        suggestions.length ? h(
          "div",
          { className: "wb-cr-chips" },
          suggestions.map(function(s, i) {
            var p = typeof s === "string" ? s : s && s.path || "";
            var lab = typeof s === "object" && s.label ? s.label + " \xB7 " : "";
            if (!p) return null;
            return h(
              "button",
              {
                key: i + p,
                type: "button",
                className: "wb-cr-chip",
                title: p,
                onClick: function() {
                  setWorkspace(p);
                }
              },
              lab + p
            );
          })
        ) : null,
        h("label", { className: "wb-cr-label" }, "\u539F\u59CB\u5199\u7801\u8BC9\u6C42\uFF08\u4E00\u53E5\u8BDD\u4E5F\u884C\uFF0C\u4E0B\u4E00\u6B65\u4F1A\u5E2E\u4F60\u8865\u5168\uFF09"),
        h("textarea", {
          className: "wb-cr-input",
          style: {
            width: "100%",
            minHeight: 96,
            boxSizing: "border-box",
            fontFamily: "inherit",
            marginBottom: 10
          },
          value: requirement,
          placeholder: "\u4F8B\u5982\uFF1AMES\u7CFB\u7EDF\u4ED3\u5E93\u7BA1\u7406\u83DC\u5355\u65B0\u589E\u7269\u6599\u51FA\u5E93\u754C\u9762",
          onChange: function(e) {
            setRequirement(e.target.value);
            setGoal(e.target.value);
          }
        }),
        err ? h("p", { className: "wb-cr-err" }, maskVendorUiText(err)) : null,
        h(
          "div",
          { className: "wb-cr-actions" },
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn primary",
              disabled: busy,
              onClick: function() {
                setGoal(requirement);
                runDiscuss();
              }
            },
            busy ? "\u68B3\u7406\u4E2D\u2026" : "\u4E0B\u4E00\u6B65\uFF1A\u68B3\u7406\u9700\u6C42"
          )
        )
      )
    ));
  }
  ctx.CodeDevBeginCard = CodeDevBeginCard;
}

// client-src/lanes/code-deploy.js
function installCodeDeploy(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var CDP_UI_REV = "2026-09-10o-cdp-session";
  var CDP_PERSIST_VER = 1;
  function cdpBlockCallId(block, callIdProp) {
    if (callIdProp != null && String(callIdProp).trim()) return String(callIdProp).trim();
    if (!block) return "";
    var nested = block.call && typeof block.call === "object" ? block.call : null;
    return String(
      block.callId || block.toolCallId || nested && (nested.callId || nested.toolCallId || nested.id) || block.id || ""
    ).trim();
  }
  function cdpBlockSessionId(block, sessionId) {
    return String(
      sessionId || block && (block.threadId || block.thread_id || block.sessionId || block.session_id || block.conversationId || "") || ""
    ).trim();
  }
  function cdpPersistKey(block, sessionId, callIdProp) {
    var callId = cdpBlockCallId(block, callIdProp);
    var sid = cdpBlockSessionId(block, sessionId);
    if (callId && sid) return "wb-cdp-card:" + sid + ":" + callId;
    if (callId) return "wb-cdp-card:call:" + callId;
    if (sid) return "wb-cdp-card:session:" + sid + ":lone";
    return "wb-cdp-card:anon";
  }
  function cdpPersistKeyAliases(block, sessionId, callIdProp) {
    var callId = cdpBlockCallId(block, callIdProp);
    var sid = cdpBlockSessionId(block, sessionId);
    var keys = [cdpPersistKey(block, sessionId, callIdProp)];
    if (callId) {
      keys.push("wb-cdp-card:call:" + callId, "wb-cdp-card:block:" + callId);
      if (sid) keys.push("wb-cdp-card:" + sid + ":" + callId);
    } else if (sid) {
      keys.push("wb-cdp-card:" + sid, "wb-cdp-card:session:" + sid + ":lone");
    } else {
      keys.push("wb-cdp-card:anon");
    }
    var uniq = [];
    var seen = {};
    keys.forEach(function(k) {
      if (!k || seen[k]) return;
      seen[k] = true;
      uniq.push(k);
    });
    return uniq;
  }
  function cdpPersistBelongsToCall(saved, callId) {
    if (!saved || typeof saved !== "object") return false;
    var cid = String(callId || "").trim();
    if (!cid) return false;
    return String(saved.callId || "").trim() === cid;
  }
  function cdpPersistNormalize(o) {
    if (!o || typeof o !== "object") return null;
    if (Number(o.v || 0) < 1) return null;
    return o;
  }
  function cdpPersistLoad(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      return cdpPersistNormalize(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }
  function cdpPersistLoadForCard(block, sessionId, callIdProp) {
    try {
      var callId = cdpBlockCallId(block, callIdProp);
      var key = cdpPersistKey(block, sessionId, callIdProp);
      var aliases = cdpPersistKeyAliases(block, sessionId, callIdProp);
      for (var i = 0; i < aliases.length; i++) {
        var hit = cdpPersistLoad(aliases[i]);
        if (hit && cdpPersistBelongsToCall(hit, callId) && (hit.done || hit.phase === "done")) {
          return { key, saved: hit };
        }
      }
      return { key, saved: null };
    } catch (eLoad) {
      return { key: cdpPersistKey(block, sessionId, callIdProp), saved: null };
    }
  }
  function cdpPersistSaveCard(block, sessionId, callIdProp, data) {
    var callId = cdpBlockCallId(block, callIdProp) || data && data.callId || "";
    if (!callId) return "";
    var aliases = cdpPersistKeyAliases(block, sessionId, callIdProp);
    var payload = Object.assign({ v: CDP_PERSIST_VER, at: Date.now() }, data || {}, {
      callId,
      sessionId: cdpBlockSessionId(block, sessionId) || data && data.sessionId || ""
    });
    aliases.forEach(function(k) {
      try {
        localStorage.setItem(k, JSON.stringify(payload));
      } catch (e0) {
      }
    });
    return aliases[0];
  }
  function CodeDeployConfirmCard(props) {
    ensureCss();
    var block = props.block;
    var toolCallId = String(props.callId || cdpBlockCallId(block, "") || "").trim();
    var wb = useMemo(function() {
      return readMeta(block);
    }, [block]);
    var ui = wb && wb.ui || {};
    var kind = String(ui.kind || wb && String(wb.t || "").replace(/^cdp-/, "") || "confirm");
    var persistBoot = useMemo(
      function() {
        return cdpPersistLoadForCard(block, props.sessionId, toolCallId);
      },
      [block, props.sessionId, toolCallId]
    );
    var bootSaved = persistBoot.saved && cdpPersistBelongsToCall(persistBoot.saved, toolCallId) ? persistBoot.saved : null;
    var _busy = useState(false);
    var busy = _busy[0];
    var setBusy = _busy[1];
    var _err = useState("");
    var err = _err[0];
    var setErr = _err[1];
    var _done = useState(function() {
      if (bootSaved && (bootSaved.done || bootSaved.phase === "done")) return true;
      return kind === "success";
    });
    var done = _done[0];
    var setDone = _done[1];
    var _success = useState(function() {
      if (bootSaved && bootSaved.success) return bootSaved.success;
      return kind === "success" ? ui : null;
    });
    var success = _success[0];
    var setSuccess = _success[1];
    function cdpSnapshot(doneFlag, successObj) {
      if (!toolCallId) return;
      cdpPersistSaveCard(block, props.sessionId, toolCallId, {
        phase: "done",
        done: !!doneFlag,
        success: successObj || null,
        jobId: ui && ui.job_id || successObj && successObj.job_id || ""
      });
    }
    function resolveIds(src) {
      var u = src || {};
      if (Array.isArray(u.unit_ids) && u.unit_ids.length) {
        return u.unit_ids.map(String).filter(Boolean);
      }
      var exec = u.execution || {};
      if (Array.isArray(exec.unit_ids) && exec.unit_ids.length) {
        return exec.unit_ids.map(String).filter(Boolean);
      }
      var list = u.mode === "full" || u.force_full ? u.units_full || u.units || [] : u.units_incremental || u.units || [];
      return (list || []).map(function(x) {
        return typeof x === "string" ? x : x && x.id || "";
      }).filter(Boolean);
    }
    var forceFull = !!(ui.force_full || ui.locked_mode === "full");
    var mode = forceFull ? "full" : ui.mode === "full" ? "full" : "incremental";
    var ids = resolveIds(ui);
    var unitCount = Number(ui.unit_count) || ids.length;
    var entry = ui.entry_url || ui.access_url || ui.health_url || "";
    var canGo = ui.can_deploy !== false && !!ui.job_id && (ids.length > 0 || unitCount > 0);
    if (!done && kind === "confirm" && !ui.job_id) {
      return h(
        "div",
        { className: "wb-cr" },
        h("div", { className: "wb-cr-head" }, h("span", { className: "wb-cr-badge" }, "\u90E8\u7F72\u672A\u5C31\u7EEA")),
        h(
          "div",
          { className: "wb-cr-body" },
          h("p", { className: "wb-cr-err" }, "\u8BF7\u518D\u8BF4\u4E00\u6B21\u300C\u90E8\u7F72\u4E0A\u7EBF\u300D\uFF08\u52FF\u9009 production\uFF09")
        )
      );
    }
    function doReject() {
      if (!ui.job_id) {
        setDone(true);
        setSuccess({ cancelled: true });
        cdpSnapshot(true, { cancelled: true });
        return;
      }
      setBusy(true);
      setErr("");
      issueHitl("code-deploy.confirm", { job_id: ui.job_id }).then(function(nonce) {
        return fetch(engineBase() + "/api/code-deploy/confirm", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ job_id: ui.job_id, decision: "reject", nonce })
        }).then(function(r) {
          return r.json();
        });
      }).then(function() {
        setDone(true);
        setSuccess({ cancelled: true });
        cdpSnapshot(true, { cancelled: true });
        setBusy(false);
      }).catch(function(e) {
        setErr(e && e.message || "\u53D6\u6D88\u5931\u8D25");
        setBusy(false);
      });
    }
    function doApprove() {
      var sendIds = ids.length ? ids : resolveIds(ui);
      if (!ui.job_id || !sendIds.length && !unitCount) {
        setErr("\u6CA1\u6709\u53EF\u540C\u6B65\u7684\u5355\u5143");
        return;
      }
      if (!canGo && !sendIds.length) {
        setErr("\u5F53\u524D\u4E0D\u53EF\u90E8\u7F72\uFF0C\u8BF7\u68C0\u67E5\u914D\u7F6E");
        return;
      }
      setBusy(true);
      setErr("");
      issueHitl("code-deploy.confirm", { job_id: ui.job_id }).then(function(nonce) {
        return fetch(engineBase() + "/api/code-deploy/confirm", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            job_id: ui.job_id,
            decision: "approve",
            mode,
            unit_ids: sendIds,
            nonce
          })
        }).then(function(r) {
          return r.json();
        });
      }).then(function(d) {
        if (!d || !d.ok) {
          setErr(d && (d.detail || d.reply) || "\u90E8\u7F72\u5931\u8D25");
          setBusy(false);
          return;
        }
        var succ = d.deploy_success || d.code_deploy_ui || {};
        var successObj = {
          title: succ.title || (mode === "full" ? "\u5168\u91CF\u90E8\u7F72\u5B8C\u6210" : "\u589E\u91CF\u90E8\u7F72\u5B8C\u6210"),
          entry_url: succ.entry_url || succ.access_url || succ.health_url || entry,
          remote: succ.remote || "",
          env: succ.env || ui.env || "",
          units: succ.units || ids,
          actions: succ.actions || [],
          job_id: ui.job_id
        };
        setSuccess(successObj);
        setDone(true);
        cdpSnapshot(true, successObj);
        setBusy(false);
      }).catch(function(e) {
        setErr(e && e.message || "\u90E8\u7F72\u8BF7\u6C42\u5931\u8D25");
        setBusy(false);
      });
    }
    if (done && success) {
      if (success.cancelled) {
        return h(
          "div",
          { className: "wb-cr" },
          h(
            "div",
            { className: "wb-cr-head" },
            h("span", { className: "wb-cr-badge" }, "\u5DF2\u53D6\u6D88"),
            h("span", { className: "wb-cr-hint" }, CDP_UI_REV)
          ),
          h("div", { className: "wb-cr-body" }, h("p", { className: "wb-cr-sum" }, "\u672A\u6267\u884C\u540C\u6B65"))
        );
      }
      return h(
        "div",
        { className: "wb-cr" },
        h(
          "div",
          { className: "wb-cr-head" },
          h("span", { className: "wb-cr-badge" }, "\u90E8\u7F72\u5B8C\u6210"),
          h("span", { className: "wb-cr-hint" }, CDP_UI_REV)
        ),
        h(
          "div",
          { className: "wb-cr-body" },
          h("p", { className: "wb-cr-sum" }, success.title || "\u90E8\u7F72\u5B8C\u6210"),
          success.remote ? h("p", { className: "wb-cr-sum" }, success.remote) : null,
          success.entry_url ? h(
            "p",
            { className: "wb-cr-sum" },
            h(
              "a",
              { href: success.entry_url, target: "_blank", rel: "noopener noreferrer" },
              success.entry_url
            )
          ) : null,
          Array.isArray(success.actions) && success.actions.length ? h(
            "ul",
            { className: "wb-cr-units", style: { display: "block", marginTop: "8px" } },
            success.actions.map(function(a, i) {
              return h("li", { key: String(i) }, String(a));
            })
          ) : null
        )
      );
    }
    var title = forceFull || mode === "full" ? "\u786E\u8BA4\u5168\u91CF\u90E8\u7F72" : "\u786E\u8BA4\u589E\u91CF\u90E8\u7F72";
    var remote = (ui.ssh_host || "\u2014") + ":" + (ui.ssh_app_path || "\u2014");
    var unitRows = Array.isArray(ui.units) && ui.units.length ? ui.units : ids.map(function(id) {
      return { id, label: id, kind: "" };
    });
    var gitLine = "";
    if (ui.head_sha_short || ui.head_ref) {
      gitLine = (ui.head_ref || "HEAD") + (ui.head_sha_short ? " @" + ui.head_sha_short : "");
      if (ui.base_ref && ui.base_ref !== "(none)") {
        gitLine = String(ui.base_ref).slice(0, 10) + " \u2192 " + gitLine;
      }
    }
    function kv(label, node) {
      if (!node) return null;
      return [h("dt", null, label), h("dd", null, node)];
    }
    return h(
      "div",
      { className: "wb-cr" },
      h(
        "div",
        { className: "wb-cr-head" },
        h("span", { className: "wb-cr-badge" }, title),
        h(
          "span",
          { className: "wb-cr-hint" },
          ui.unified_product ? "\u70B9\u786E\u8BA4\u540E\u624D\u4F1A\u540C\u6B65\u5E76\u62C9\u8D77\u8FDC\u7AEF\u5165\u53E3" : "\u70B9\u786E\u8BA4\u540E\u624D\u4F1A\u540C\u6B65\u6587\u4EF6"
        )
      ),
      h(
        "div",
        { className: "wb-cr-body" },
        h(
          "dl",
          { className: "wb-cr-kv" },
          kv("\u73AF\u5883", ui.env || "staging"),
          kv("\u8FDC\u7AEF", remote),
          entry ? kv(
            "\u5165\u53E3",
            h(
              "a",
              { href: entry, target: "_blank", rel: "noopener noreferrer" },
              entry
            )
          ) : null,
          ui.workspace ? kv("\u672C\u673A\u4ED3", ui.workspace) : null,
          gitLine ? kv("\u7248\u672C", gitLine) : null,
          kv(
            "\u8303\u56F4",
            (unitCount || ids.length) + " \u4E2A\u5355\u5143 \xB7 " + (forceFull ? "\u5168\u91CF\u9501\u5B9A" : mode === "full" ? "\u5168\u91CF" : "\u589E\u91CF")
          )
        ),
        unitRows.length ? h(
          "div",
          { className: "wb-cr-units" },
          unitRows.map(function(u) {
            var id = typeof u === "string" ? u : u.id;
            var label = typeof u === "string" ? u : u.label || u.id;
            var kind2 = typeof u === "string" ? "" : u.kind || "";
            return h(
              "span",
              { key: id, className: "wb-cr-unit", title: id },
              kind2 ? h("span", { className: "k" }, kind2) : null,
              label
            );
          })
        ) : null,
        ui.reason || ui.note ? h(
          "p",
          { className: "wb-cr-note" },
          ui.reason || ui.note
        ) : null,
        err ? h("p", { className: "wb-cr-err" }, err) : null,
        h(
          "div",
          { className: "wb-cr-actions" },
          h(
            "button",
            { type: "button", className: "wb-cr-btn", disabled: busy, onClick: doReject },
            "\u53D6\u6D88"
          ),
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn primary",
              disabled: busy || !canGo,
              onClick: doApprove
            },
            busy ? "\u90E8\u7F72\u4E2D\u2026" : "\u786E\u8BA4\u90E8\u7F72"
          )
        )
      )
    );
  }
  ctx.CodeDeployConfirmCard = CodeDeployConfirmCard;
}

// client-src/lanes/dev-pipeline.js
function installDevPipeline(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useMemo = ctx.useMemo, useRef = ctx.useRef;
  var engineBase = ctx.engineBase, fetchEngineApi = ctx.fetchEngineApi, ensureCss = ctx.ensureCss, readMeta = ctx.readMeta, authHeaders = ctx.authHeaders, resolveDshCwd = ctx.resolveDshCwd;
  function engineApi(path, opts) {
    var p = path.charAt(0) === "/" ? path : "/" + path;
    if (typeof fetchEngineApi === "function") return fetchEngineApi(p, opts || {});
    return fetch(String(engineBase()).replace(/\/$/, "") + p, opts || {});
  }
  function formatApiDetail(d, status) {
    if (!d) return status === 404 ? "\u5F15\u64CE API \u4E0D\u5B58\u5728\uFF08\u8BF7\u91CD\u542F\u5F15\u64CE\u5E76 Ctrl+F5\uFF09" : "\u5207\u6362\u5931\u8D25";
    var det = d.detail;
    if (typeof det === "string") return det;
    if (Array.isArray(det) && det.length) return String(det[0].msg || det[0] || "\u5207\u6362\u5931\u8D25");
    return String(d.detail || d.reply || "\u5207\u6362\u5931\u8D25");
  }
  var DP_UI_REV = "2026-09-30p04-closing-md-body";
  function dpClosingTextId(runId) {
    return "wb-dp-closing-text-" + String(runId || "anon").replace(/[^\w.-]/g, "_");
  }
  function dpRemoveClosingHost(runId) {
    if (typeof document === "undefined") return;
    try {
      var id = dpClosingTextId(runId);
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      document.querySelectorAll("[data-wb-dp-closing-body],[data-wb-dp-closing-text]").forEach(function(n) {
        if (String(n.getAttribute("data-run-id") || "") === String(runId || "")) {
          if (n.parentNode) n.parentNode.removeChild(n);
        }
      });
    } catch (eRm) {
    }
  }
  function dpFindBeginHit(runId) {
    var scroll = document.querySelector("[data-conversation-scroll]");
    if (!scroll) return null;
    var rid = String(runId || "").trim();
    if (!rid) return null;
    var nodes = scroll.querySelectorAll("p, div, span, li");
    var hit = null;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el.id === dpClosingTextId(runId)) continue;
      if (el.closest && (el.closest("[data-wb-dp-closing-text]") || el.closest(".wb-dp") || el.closest("[data-wb-dp-closing-body]") || el.closest("[data-composer-seat],[data-composer-card]"))) {
        continue;
      }
      var t = String(el.textContent || "");
      if (t.indexOf(rid) < 0) continue;
      if (t.indexOf("\u9700\u6C42") < 0 && t.indexOf("run_id") < 0 && t.indexOf("\u4E00\u4F53\u5316") < 0) continue;
      if (t.indexOf("\u5173\u952E\u6210\u679C") >= 0 && t.indexOf("\u5982\u4F55\u9A8C\u8BC1") >= 0) continue;
      if (t.length > 400) continue;
      if (!hit || t.length <= String(hit.textContent || "").length) hit = el;
    }
    return hit;
  }
  function dpFindMarkdownRoot(hit) {
    if (!hit) return null;
    var el = hit;
    for (var d = 0; d < 12 && el; d++) {
      var cls = String(el.className || "");
      var hasBlockKids = false;
      try {
        hasBlockKids = !!(el.querySelector && el.querySelector(":scope > p, :scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > h3"));
      } catch (eQ) {
        hasBlockKids = !!(el.querySelector && el.querySelector("p, ul"));
      }
      if (hasBlockKids || /markdown|prose|md-body|message-content|MessageContent|bubble|chat-content/i.test(cls)) {
        return el;
      }
      el = el.parentElement;
    }
    return hit.parentElement || hit;
  }
  function dpFindMessageTextAnchor(runId) {
    if (typeof document === "undefined") return null;
    var hit = dpFindBeginHit(runId);
    if (!hit) return null;
    var md = dpFindMarkdownRoot(hit);
    if (!md) return null;
    var after = hit;
    while (after.parentElement && after.parentElement !== md) {
      after = after.parentElement;
    }
    if (after.parentElement === md) {
      var sib = after.nextElementSibling;
      while (sib) {
        if (sib.getAttribute && sib.getAttribute("data-wb-dp-closing-text")) {
          return { parent: md, before: sib, replace: sib };
        }
        var cls = String(sib.className || "") + " " + String(sib.getAttribute("role") || "");
        var hasBtn = false;
        try {
          hasBtn = !!(sib.matches && sib.matches("button")) || !!sib.querySelector("button, [role='button']");
        } catch (eM) {
        }
        if (hasBtn || /action|feedback|toolbar|reaction|thumb|copy|footer/i.test(cls)) {
          return { parent: md, before: sib };
        }
        break;
      }
      return { parent: md, before: after.nextSibling };
    }
    return { parent: md, before: null };
  }
  function dpEnsureClosingTextHost(runId) {
    if (typeof document === "undefined") return null;
    try {
      document.querySelectorAll("[data-wb-dp-closing-body]").forEach(function(n) {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
    } catch (eOld) {
    }
    var id = dpClosingTextId(runId);
    var host = document.getElementById(id);
    var anchor = dpFindMessageTextAnchor(runId);
    if (!anchor || !anchor.parent) return null;
    if (!host) {
      host = document.createElement("div");
      host.id = id;
      host.className = "wb-dp-closing-text";
      host.setAttribute("data-wb-dp-closing-text", "1");
      host.setAttribute("data-run-id", String(runId || ""));
    }
    if (anchor.replace && anchor.replace !== host && anchor.replace.parentNode) {
      anchor.parent.insertBefore(host, anchor.replace);
      if (anchor.replace.parentNode) anchor.replace.parentNode.removeChild(anchor.replace);
    } else if (host.parentNode !== anchor.parent || host.nextSibling !== anchor.before) {
      anchor.parent.insertBefore(host, anchor.before || null);
    }
    return host;
  }
  function dpAppendText(parent, tag, text) {
    var el = document.createElement(tag);
    el.textContent = maskVendorUiText(String(text || ""));
    parent.appendChild(el);
    return el;
  }
  function dpAppendList(parent, items) {
    if (!items || !items.length) return;
    var ul = document.createElement("ul");
    items.forEach(function(line) {
      var li = document.createElement("li");
      var raw = maskVendorUiText(String(line || ""));
      var m = raw.match(/^([^：:]{1,12})([：:])([\s\S]*)$/);
      if (m) {
        var b = document.createElement("strong");
        b.textContent = m[1] + m[2];
        li.appendChild(b);
        li.appendChild(document.createTextNode(m[3]));
      } else {
        li.textContent = raw;
      }
      ul.appendChild(li);
    });
    parent.appendChild(ul);
  }
  function dpFillClosingHost(host, closing) {
    if (!host || !closing || typeof closing !== "object") return;
    host.className = "wb-dp-closing-text";
    host.setAttribute("data-wb-dp-closing-text", "1");
    host.removeAttribute("data-wb-dp-closing-body");
    while (host.firstChild) host.removeChild(host.firstChild);
    var conclusion = String(closing.conclusion || "").trim();
    var highlights = closing.highlights || [];
    var verify = closing.verify || [];
    if (conclusion) dpAppendText(host, "p", conclusion);
    if (highlights.length) {
      dpAppendText(host, "p", "\u5173\u952E\u6210\u679C\uFF1A");
      dpAppendList(host, highlights);
    }
    if (verify.length) {
      dpAppendText(host, "p", "\u5982\u4F55\u9A8C\u8BC1\uFF1A");
      dpAppendList(host, verify);
    }
  }
  function dpRailCapLabel(title, stepId) {
    var t = maskVendorUiText(String(title || "").trim());
    if (String(stepId) === "5") {
      t = t.replace(/\s*[（(][^）)]*[）)]\s*/g, " ").replace(/\s+/g, " ").trim();
    }
    return t || "\u6B65\u9AA4 " + String(stepId || "");
  }
  var dpLiveOwners = typeof globalThis !== "undefined" && globalThis.__wbDpLiveOwners || (typeof globalThis !== "undefined" ? globalThis.__wbDpLiveOwners = /* @__PURE__ */ Object.create(null) : /* @__PURE__ */ Object.create(null));
  function dpStatusLabel(st) {
    var s = String(st || "");
    if (s === "pass") return "\u5B8C\u6210";
    if (s === "running") return "\u6267\u884C\u4E2D";
    if (s === "waiting_hitl") return "\u5F85\u4F60\u786E\u8BA4";
    if (s === "waiting_user") return "\u5F85\u5904\u7406";
    if (s === "fail" || s === "failed") return "\u5931\u8D25";
    if (s === "pending") return "\u672A\u5F00\u59CB";
    if (s === "skipped") return "\u8DF3\u8FC7";
    if (s === "queued") return "\u6392\u961F\u4E2D";
    if (s === "paused") return "\u5DF2\u6682\u505C";
    if (s === "cancelling") return "\u6B63\u5728\u505C\u6B62";
    if (s === "cancelled" || s === "canceled") return "\u5DF2\u505C\u6B62";
    if (s === "rollback") return "\u56DE\u9000";
    if (s === "done") return "\u5DF2\u7ED3\u675F";
    if (s === "syncing") return "\u540C\u6B65\u4E2D";
    return s || "\u672A\u5F00\u59CB";
  }
  function dpRunLiveLike(status) {
    var s = String(status || "");
    return s === "running" || s === "queued" || s === "paused" || s === "cancelling";
  }
  function dpRunFinished(status, outcome) {
    var st = String(status || "");
    var oc = String(outcome || "");
    return st === "done" || st === "failed" || st === "cancelled" || st === "canceled" || oc === "success" || oc === "failed" || oc === "cancelled";
  }
  function dpUiDoneCount(ui) {
    var steps = ui && ui.steps || [];
    var n = 0;
    for (var i = 0; i < steps.length; i++) {
      var st = String(steps[i] && steps[i].status || "");
      if (st === "pass" || st === "skipped") n++;
    }
    return n;
  }
  function dpPreferUi(prev, next) {
    if (!next || !next.run_id) return prev || next;
    if (!prev || !prev.run_id) return next;
    if (String(prev.run_id) !== String(next.run_id)) return next;
    var prevFin = dpRunFinished(prev.status, prev.outcome);
    var nextFin = dpRunFinished(next.status, next.outcome);
    if (prevFin && !nextFin && !dpRunLiveLike(next.status)) return prev;
    if (nextFin && !prevFin) return next;
    var prevDone = dpUiDoneCount(prev);
    var nextDone = dpUiDoneCount(next);
    if (nextDone > prevDone) return next;
    if (prevDone > nextDone && prevFin === nextFin) return prev;
    var prevUp = Number(prev.updated_at || prev.run_summary && prev.run_summary.finished_at || 0) || 0;
    var nextUp = Number(next.updated_at || next.run_summary && next.run_summary.finished_at || 0) || 0;
    if (nextUp > prevUp) return next;
    if (prevUp > nextUp) return prev;
    if (dpRunLiveLike(prev.status) && !dpRunLiveLike(next.status) && String(next.status || "")) {
      return next;
    }
    if (!String(prev.status || "") && String(next.status || "")) return next;
    return next;
  }
  var dpStepStartCache = typeof globalThis !== "undefined" && globalThis.__wbDpStepStartCache || (typeof globalThis !== "undefined" ? globalThis.__wbDpStepStartCache = /* @__PURE__ */ Object.create(null) : /* @__PURE__ */ Object.create(null));
  function dpStepStartKey(runId, sid, visitSeq) {
    return String(runId || "") + ":" + String(sid || "") + ":" + String(visitSeq || "");
  }
  function dpStepElapsedSec(st, receipt, stStatus, runId, visitSeq) {
    var rec = receipt || {};
    if (rec.duration_sec != null && String(rec.duration_sec) !== "") {
      var done = Math.floor(Number(rec.duration_sec));
      if (!isNaN(done) && done >= 0) return done;
    }
    var start = Number(rec.started_at || st && st.started_at || 0) || 0;
    var key = dpStepStartKey(runId, st && st.step_id, visitSeq);
    var live = stStatus === "running" || stStatus === "waiting_hitl" || stStatus === "waiting_user" || stStatus === "queued";
    if (start) {
      dpStepStartCache[key] = start;
    } else if (live) {
      if (!dpStepStartCache[key]) {
        dpStepStartCache[key] = Math.floor(Date.now() / 1e3);
      }
      start = dpStepStartCache[key];
    } else {
      start = Number(dpStepStartCache[key] || 0) || 0;
    }
    if (!start) return null;
    var end = Number(rec.finished_at || 0) || 0;
    if (end > start) return end - start;
    if (live) return Math.max(0, Math.floor(Date.now() / 1e3) - start);
    return null;
  }
  function dpStepStatusTerminal(stStatus) {
    var s = String(stStatus || "");
    return s === "pass" || s === "fail" || s === "failed" || s === "cancelled" || s === "canceled" || s === "rollback" || s === "done";
  }
  function dpStatusWithDuration(stStatus, st, receipt, runId, visitSeq) {
    var label = dpStatusLabel(stStatus);
    if (stStatus === "pending" || stStatus === "skipped" || !stStatus) {
      return label;
    }
    var sec = dpStepElapsedSec(st, receipt, stStatus, runId, visitSeq);
    if (sec == null) return label;
    if (dpStepStatusTerminal(stStatus) && sec < 1) sec = 1;
    return label + " \xB7 " + dpFmtDuration(sec);
  }
  function dpFormatReviewDisplay(text) {
    var t = String(text || "").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();
    if (!t) return "";
    var lineCount = t.split("\n").length;
    if (lineCount >= 4) return t;
    var labels = [
      "\u4EE3\u7801\u5BA1\u6838\u6C47\u603B\u62A5\u544A",
      "\u4E00\u3001\u603B\u4F53\u8BC4\u4EF7",
      "\u4E8C\u3001\u8BE6\u7EC6\u95EE\u9898\u6E05\u5355",
      "\u4E09\u3001",
      "\u56DB\u3001\u5BA1\u6838\u7ED3\u8BBA",
      "\u5BA1\u6838\u6587\u4EF6\uFF1A",
      "\u5BA1\u6838\u65E5\u671F\uFF1A",
      "\u5BA1\u6838\u4EBA\uFF1A",
      "\u5DE5\u7A0B\u8DEF\u5F84\uFF1A",
      "\u72B6\u6001\uFF1A",
      "\u6458\u8981\uFF1A",
      "\u5224\u5B9A\u8BF4\u660E\uFF1A",
      "\u5931\u8D25\u5BF9\u7167\uFF1A",
      "\u62A5\u544A ID\uFF1A",
      "\u8303\u56F4\uFF1A",
      "\u6587\u4EF6\uFF1A"
    ];
    for (var i = 0; i < labels.length; i++) {
      var lab = labels[i];
      if (t.indexOf(lab) < 0) continue;
      t = t.split(lab).join("\n" + lab);
    }
    t = t.replace(/\s*---\s*/g, "\n---\n");
    t = t.replace(/审核文件：([^\n]{80,})/g, function(_m, files) {
      var parts = files.split("\u3001").map(function(x) {
        return x.trim();
      }).filter(Boolean);
      if (parts.length <= 4) return "\u5BA1\u6838\u6587\u4EF6\uFF1A" + files;
      return "\u5BA1\u6838\u6587\u4EF6\uFF1A\n" + parts.map(function(p) {
        return "\xB7 " + p;
      }).join("\n");
    });
    t = t.replace(/文件：([^\n]{60,})/g, function(_m, files) {
      if (files.indexOf("\u3001") < 0) return "\u6587\u4EF6\uFF1A" + files;
      var parts = files.split("\u3001").map(function(x) {
        return x.trim();
      }).filter(Boolean);
      return "\u6587\u4EF6\uFF1A\n" + parts.map(function(p) {
        return "\xB7 " + p;
      }).join("\n");
    });
    t = t.replace(/([。；])\s*(?=-\s*[🔴🟡🟢])/g, "$1\n");
    t = t.replace(/-\s*(🔴|🟡|🟢)/g, "\n- $1");
    t = t.replace(/(🟡|🟢|🔴)\s*(中危|低危|高危)\s*问题/g, "\n$1 $2 \u95EE\u9898");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.replace(/^\n+/, "").trim();
  }
  function dpExtractReviewOverall(text) {
    var t = String(text || "").trim();
    if (!t) return "";
    var marker = "\u4E00\u3001\u603B\u4F53\u8BC4\u4EF7";
    var pos = t.indexOf(marker);
    if (pos < 0) {
      if (/高危问题/.test(t) && /中危问题/.test(t)) return t.slice(0, 800);
      if (t.indexOf("\u4EE3\u7801\u5BA1\u6838\u6C47\u603B\u62A5\u544A") >= 0) return t.slice(0, 480);
      return "";
    }
    var tail = t.slice(pos + marker.length).replace(/^\s+/, "");
    var lines = [];
    var parts = tail.split("\n");
    for (var i = 0; i < parts.length; i++) {
      var ln = parts[i].trim();
      if (!ln) {
        if (lines.length) break;
        continue;
      }
      if (ln.indexOf("---") === 0 || ln.indexOf("\u4E8C\u3001") === 0) break;
      if (/^已按\s/.test(ln) || /^>\s*审码元信息/.test(ln)) continue;
      if (/本次审核共发现/.test(ln) || /^所有问题均基于/.test(ln)) break;
      lines.push(ln);
    }
    return lines.join("\n") || t.slice(0, 480);
  }
  function dpParseRiskRows(text) {
    var rows = [];
    String(text || "").split("\n").forEach(function(ln) {
      var s = ln.trim().replace(/^[-•]\s*/, "");
      s = s.replace(/^[🔴🟡🟢]\s*/, "");
      var m = s.match(/^(高危|中危|低危)问题[：:]\s*(.+)$/);
      if (!m) return;
      var band = m[1];
      var level = band === "\u9AD8\u5371" ? "high" : band === "\u4E2D\u5371" ? "medium" : "low";
      rows.push({ level, label: band + "\u95EE\u9898", body: m[2] });
    });
    return rows;
  }
  function dpRenderRiskOverview(text) {
    var rows = dpParseRiskRows(text);
    if (!rows.length) return null;
    return h(
      "div",
      { className: "wb-dp-risk-overview" },
      rows.map(function(r, i) {
        return h(
          "div",
          {
            key: "risk-" + r.level + "-" + i,
            className: "wb-dp-risk-row is-" + r.level
          },
          [
            h("span", {
              className: "wb-dp-risk-orb is-" + r.level,
              "aria-hidden": "true"
            }),
            h("div", { className: "wb-dp-risk-text" }, [
              h("b", { className: "wb-dp-risk-label" }, r.label + "\uFF1A"),
              h(
                "span",
                { className: "wb-dp-risk-body" },
                String(r.body || "").split(/(\d+)/).map(function(p, j) {
                  if (/^\d+$/.test(p)) return h("b", { key: "n-" + j }, p);
                  return p;
                })
              )
            ])
          ]
        );
      })
    );
  }
  function dpDedupeReviewDetail(detail) {
    var t = String(detail || "");
    if (!t) return "";
    var head = "\u4EE3\u7801\u5BA1\u6838\u6C47\u603B\u62A5\u544A";
    var second = t.indexOf(head, head.length);
    if (second > 0) return t.slice(0, second).trim();
    var marker = "\u4E00\u3001\u603B\u4F53\u8BC4\u4EF7";
    var first = t.indexOf(marker);
    if (first < 0) return t;
    var again = t.indexOf(marker, first + marker.length);
    if (again > 0) return t.slice(0, again).trim();
    return t;
  }
  function dpExtractReviewReportBlob(text) {
    var t = String(text || "").replace(/\\n/g, "\n").replace(/\r\n/g, "\n");
    var marker = "\u4EE3\u7801\u5BA1\u6838\u6C47\u603B\u62A5\u544A";
    var pos = t.indexOf(marker);
    if (pos >= 0) return t.slice(pos).trim();
    var sumPos = t.indexOf("\u6458\u8981\uFF1A");
    if (sumPos >= 0) {
      var after = t.slice(sumPos + 3).trim();
      if (after.indexOf(marker) >= 0) return after;
    }
    return "";
  }
  function dpResolveReviewStepStatus(st, receipt, resultDetail) {
    var s = String(
      st && st.status || receipt && receipt.status || ""
    ).trim();
    if (s === "pass" || s === "skipped" || s === "fail" || s === "failed" || s === "running" || s === "waiting_hitl" || s === "waiting_user") {
      return s;
    }
    var detail = String(resultDetail || "");
    var m = detail.match(/状态[：:]\s*([a-z_]+)/i);
    if (m && m[1]) return m[1].toLowerCase();
    if (/审核结果：\s*通过|✅\s*审核通过|有条件通过/.test(detail)) return "pass";
    if (/审核结果：\s*不通过|❌/.test(detail)) return "fail";
    return s;
  }
  function dpReviewVerdict(stepStatus) {
    var s = String(stepStatus || "");
    if (s === "pass" || s === "skipped") return "\u5BA1\u6838\u7ED3\u679C\uFF1A\u901A\u8FC7";
    if (s === "fail" || s === "failed") return "\u5BA1\u6838\u7ED3\u679C\uFF1A\u4E0D\u901A\u8FC7";
    if (s === "running") return "\u5BA1\u6838\u7ED3\u679C\uFF1A\u5BA1\u9605\u4E2D\u2026";
    if (s === "waiting_hitl" || s === "waiting_user") return "\u5BA1\u6838\u7ED3\u679C\uFF1A\u5F85\u786E\u8BA4";
    return "";
  }
  function dpStripTruncatedReviewTail(text) {
    var lines = String(text || "").split("\n");
    while (lines.length) {
      var last = lines[lines.length - 1].trim();
      if (!last) {
        lines.pop();
        continue;
      }
      if (last === "\u6240\u6709\u95EE\u9898\u5747\u57FA\u4E8E" || last.indexOf("\u6240\u6709\u95EE\u9898\u5747\u57FA\u4E8E") === 0 && last.length < 48 && last.indexOf("\u3002") < 0) {
        lines.pop();
        continue;
      }
      if (/^已按 .+重审/.test(last) && last.indexOf("\u3002") < 0) {
        lines.pop();
        continue;
      }
      break;
    }
    return lines.join("\n");
  }
  function dpPipelineReviewReport(text, stepStatus) {
    var t = dpFormatReviewDisplay(text);
    if (!t) return "";
    var lines = t.split("\n");
    var out = [];
    var verdict = dpReviewVerdict(stepStatus);
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var trim = ln.trim();
      if (trim === "\u4E00\u3001\u603B\u4F53\u8BC4\u4EF7") {
        out.push(ln);
        if (verdict) out.push(verdict);
        i += 1;
        while (i < lines.length) {
          var cur = lines[i].trim();
          if (cur === "---" || cur.indexOf("\u4E8C\u3001") === 0 || cur.indexOf("\u672C\u6B21\u5BA1\u6838\u5171\u53D1\u73B0") === 0 || cur.indexOf("\u56DB\u3001\u5BA1\u6838\u7ED3\u8BBA") === 0) {
            break;
          }
          if (/高危问题|中危问题|低危问题/.test(cur) || /^[🔴🟡🟢]/.test(cur)) {
            out.push(lines[i]);
          }
          i += 1;
        }
        continue;
      }
      if (/^>\s*审码元信息/.test(trim) || /^已按\s/.test(trim)) continue;
      out.push(ln);
    }
    return dpStripTruncatedReviewTail(out.join("\n"));
  }
  function dpRenderMultiline(text, className) {
    var formatted = dpFormatReviewDisplay(text);
    if (!formatted) return null;
    var lines = formatted.split("\n");
    return h(
      "div",
      { className: className || "wb-dp-multiline" },
      lines.map(function(ln, i) {
        return h(
          "div",
          { key: "ln-" + i, className: "wb-dp-text-line" },
          ln === "" ? "\xA0" : ln
        );
      })
    );
  }
  function dpStepResultView(sid, st, evidence, resultDetail, stepStatus) {
    var stepId = String(sid || "");
    var summaryRaw = String(st && st.summary || "").trim();
    var detail = dpDedupeReviewDetail(resultDetail);
    var reportBody = String(evidence && evidence.report_body || "").trim();
    if (stepId === "7") {
      var embedded = dpExtractReviewReportBlob(detail);
      var source = String(reportBody || embedded || "").trim();
      if (!source && /高危问题|代码审核汇总报告|一、总体评价|存在\s*\d+\s*处高危/.test(
        summaryRaw
      )) {
        source = summaryRaw;
      }
      var fullReport = source ? dpFormatReviewDisplay(maskVendorUiText(source)) : "";
      var resolved = stepStatus;
      if (/高危问题：共\s*[1-9]|❌\s*审核不通过|存在高危/.test(
        fullReport + "\n" + summaryRaw
      )) {
        resolved = "fail";
      }
      var verdict = dpReviewVerdict(resolved);
      var riskText = fullReport ? dpExtractReviewOverall(fullReport) : "";
      if (!dpParseRiskRows(riskText).length) {
        riskText = /高危问题/.test(summaryRaw) && dpParseRiskRows(summaryRaw).length ? summaryRaw : "";
      }
      var body = fullReport ? dpPipelineReviewReport(fullReport, resolved) : "";
      if (body && dpParseRiskRows(riskText).length) {
        body = body.split("\n").filter(function(ln) {
          var t = ln.trim().replace(/^[🔴🟡🟢]\s*/, "");
          if (t === "\u4E00\u3001\u603B\u4F53\u8BC4\u4EF7") return false;
          if (/^审核结果[：:]/.test(t)) return false;
          if (/^(高危|中危|低危)问题/.test(t)) return false;
          return true;
        }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
      }
      return {
        lead: maskVendorUiText(verdict),
        riskText: maskVendorUiText(riskText),
        body: maskVendorUiText(body),
        meta: "",
        isReview: true
      };
    }
    return {
      lead: maskVendorUiText(summaryRaw),
      riskText: "",
      body: "",
      meta: maskVendorUiText(detail),
      isReview: false
    };
  }
  function dpFmtDuration(sec) {
    var n = Math.max(0, Math.floor(Number(sec) || 0));
    if (n < 60) return n + " \u79D2";
    var m = Math.floor(n / 60);
    var s = n % 60;
    if (m < 60) return s ? m + " \u5206 " + s + " \u79D2" : m + " \u5206";
    var h2 = Math.floor(m / 60);
    m = m % 60;
    return h2 + " \u5C0F\u65F6 " + m + " \u5206";
  }
  function dpMergeTraceStep(entry, stepsById) {
    var sid = String(entry && entry.step_id || "");
    var base = stepsById && stepsById[sid] || {};
    var rec = entry.receipt || base.receipt || {};
    var ev = rec.evidence || {};
    var entrySt = String(entry && entry.status || "");
    var baseSt = String(base.status || "");
    var status = entrySt || baseSt;
    if ((baseSt === "cancelled" || baseSt === "canceled" || baseSt === "pass" || baseSt === "fail" || baseSt === "failed") && (entrySt === "running" || entrySt === "queued" || entrySt === "waiting_hitl" || entrySt === "waiting_user" || !entrySt)) {
      status = baseSt;
    }
    return {
      step_id: sid,
      visit_seq: entry.seq,
      implement_attempt: entry.implement_attempt || 1,
      title: maskVendorUiText(entry.title || base.title || ""),
      status,
      summary: maskVendorUiText(
        status === "cancelled" || status === "canceled" ? base.summary || entry.summary || "\u5DF2\u505C\u6B62" : entry.summary || base.summary
      ),
      receipt: rec,
      skill_id: base.skill_id || rec.skill_id || ev.skill && ev.skill.id || "",
      skill_title: maskVendorUiText(
        base.skill_title || rec.skill_title || ev.skill && ev.skill.title_zh || ""
      ),
      flow_brief: maskVendorUiText(
        base.flow_brief || ev.skill && ev.skill.flow_brief || ""
      ),
      result_detail: maskVendorUiText(rec.result_detail || ev.result_detail || "")
    };
  }
  function dpRailNodeHappened(st) {
    var s = String(st || "");
    return !!s && s !== "pending" && s !== "queued";
  }
  function dpCollapseRailNodes(nodes) {
    var list = nodes || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n) continue;
      if (n.kind === "rollback" || n.status === "rollback") {
        out.push(
          Object.assign({}, n, {
            kind: "rollback",
            display_step: "\u21A9"
          })
        );
        continue;
      }
      var sid = String(n.step_id || "");
      if (!sid || sid === "rollback") continue;
      if (!dpRailNodeHappened(n.status)) continue;
      out.push(
        Object.assign({}, n, {
          display_step: String(n.display_step || sid),
          kind: "step"
        })
      );
    }
    return out;
  }
  function dpTrimRailNodes(nodes, finished) {
    void finished;
    return dpCollapseRailNodes(nodes);
  }
  function dpCollapseStreamItems(items) {
    var out = [];
    (items || []).forEach(function(item) {
      if (item) out.push(item);
    });
    return out;
  }
  function dpRailProgress(nodes) {
    var filled = 0;
    var stepCount = 0;
    var nodesLen = nodes.length;
    for (var ri = 0; ri < nodesLen; ri++) {
      var rn = nodes[ri];
      if (rn.kind === "rollback" || rn.status === "rollback") continue;
      stepCount += 1;
      var rs = String(rn.status || "");
      if (rs === "pass" || rs === "skipped") filled += 1;
      else if (rs === "running" || rs === "waiting_hitl" || rs === "waiting_user") {
        filled += 0.45;
        break;
      } else if (rs === "fail" || rs === "failed" || rs === "cancelled" || rs === "canceled") {
        filled += 0.45;
        break;
      } else break;
    }
    if (!stepCount) stepCount = nodesLen;
    var pct = stepCount ? Math.min(100, Math.round(filled / stepCount * 100)) : 0;
    return { pct, stepCount };
  }
  function dpBuildStreamItems(ui, steps) {
    var trace = ui && ui.timeline_trace || [];
    var byId = {};
    (steps || []).forEach(function(s) {
      if (s && s.step_id) byId[String(s.step_id)] = s;
    });
    if (!trace.length) {
      return dpCollapseStreamItems(
        (steps || []).filter(function(s) {
          return s.status && s.status !== "pending";
        }).map(function(s) {
          return { kind: "step", visit_seq: s.step_id, step: s };
        })
      );
    }
    var out = [];
    trace.forEach(function(e) {
      if (!e) return;
      if (e.kind === "rollback") {
        out.push({
          kind: "rollback",
          visit_seq: e.seq,
          label: e.label || "\u6253\u56DE\u5199\u7801"
        });
        return;
      }
      if (e.kind !== "step") return;
      if (!e.status || e.status === "pending") return;
      out.push({
        kind: "step",
        visit_seq: e.seq,
        step: dpMergeTraceStep(e, byId)
      });
    });
    return dpCollapseStreamItems(out);
  }
  function dpStepLogs(st, logsMap) {
    var sid = st && st.step_id;
    var fromLive = logsMap && sid && logsMap[sid] || [];
    var fromReceipt = st && st.receipt && st.receipt.evidence && st.receipt.evidence.process_log || [];
    var picked = fromLive.length >= fromReceipt.length ? fromLive : fromReceipt.slice();
    return picked.map(function(ln) {
      return maskVendorUiText(ln);
    });
  }
  function dpFmtTs(ts) {
    var n = Number(ts) || 0;
    if (!n) return "";
    try {
      return new Date(n * 1e3).toLocaleString("zh-CN", { hour12: false });
    } catch (e) {
      return String(n);
    }
  }
  function DevPipelineTimelineCard(props) {
    ensureCss();
    var block = props.block;
    var wb = useMemo(function() {
      return readMeta(block);
    }, [block]);
    var ui0 = wb && wb.ui || {};
    var runId = String(
      ui0 && ui0.run_id || wb && wb.run_id || props.runId || ""
    ).trim();
    var _ui = useState(ui0);
    var ui = _ui[0];
    var setUi = _ui[1];
    var _logs = useState({});
    var logs = _logs[0];
    var setLogs = _logs[1];
    var _busy = useState("");
    var busy = _busy[0];
    var setBusy = _busy[1];
    var _err = useState("");
    var errMsg = _err[0];
    var setErrMsg = _err[1];
    var _primary = useState(true);
    var isPrimary = _primary[0];
    var setPrimary = _primary[1];
    var esRef = useRef(null);
    var streamEndRef = useRef(null);
    var railScrollRef = useRef(null);
    var followStreamRef = useRef(true);
    var followRailRef = useRef(true);
    var ownerRef = useRef("dp-" + Math.random().toString(36).slice(2, 10));
    var serverSyncedRef = useRef(false);
    var alignToggleOnceRef = useRef("");
    useEffect(
      function() {
        followStreamRef.current = true;
        followRailRef.current = true;
        serverSyncedRef.current = false;
        alignToggleOnceRef.current = "";
      },
      [runId]
    );
    useEffect(
      function() {
        if (!runId) {
          setPrimary(true);
          return;
        }
        var owner = ownerRef.current;
        var cur2 = dpLiveOwners[runId];
        if (!cur2) {
          dpLiveOwners[runId] = owner;
          setPrimary(true);
        } else if (cur2 === owner) {
          setPrimary(true);
        } else {
          setPrimary(false);
        }
        return function() {
          if (dpLiveOwners[runId] === owner) {
            delete dpLiveOwners[runId];
          }
        };
      },
      [runId]
    );
    function alignToggleWithPipelineUi(nextUi) {
      try {
        var rid = String(nextUi && nextUi.run_id || runId || "").trim();
        if (!rid || alignToggleOnceRef.current === rid) return;
        var sid = "";
        try {
          sid = String(
            nextUi && nextUi.dsh_session_id || resolveIntegratedFlowSessionId({}) || ""
          ).trim();
        } catch (eSid) {
          sid = "";
        }
        if (!sid) return;
        var runSid = String(nextUi && nextUi.dsh_session_id || "").trim();
        if (runSid && runSid !== sid) return;
        alignToggleOnceRef.current = rid;
        writeIntegratedFlowCache(sid, true);
        try {
          globalThis.__wbIntegratedFlowOn = true;
          if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.classList.add("wb-integrated-flow-on");
          }
        } catch (eFlag) {
        }
        try {
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent("wb-integrated-flow-changed", {
                detail: { on: true, fromPipelineCard: true, sessionId: sid }
              })
            );
          }
        } catch (eEv) {
        }
        engineApi(
          "/api/dev-pipeline/sessions/" + encodeURIComponent(sid) + "/integrated",
          {
            method: "PUT",
            headers: Object.assign(
              { "Content-Type": "application/json" },
              authHeaders()
            ),
            body: JSON.stringify({ enabled: true })
          }
        ).catch(function() {
        });
      } catch (eAlign) {
      }
    }
    function mergeUiFromServer(d) {
      if (d && d.dev_pipeline_ui) {
        serverSyncedRef.current = true;
        setUi(function(prev) {
          return dpPreferUi(prev, d.dev_pipeline_ui);
        });
        seedLogsFromUi(d.dev_pipeline_ui);
        alignToggleWithPipelineUi(d.dev_pipeline_ui);
        return;
      }
      if (d && d.ok === false) {
        serverSyncedRef.current = true;
        setUi(function(prev) {
          var base = prev && typeof prev === "object" ? Object.assign({}, prev) : {};
          base.status = "cancelled";
          base.outcome = "cancelled";
          base.run_summary = Object.assign({}, base.run_summary || {}, {
            title: "\u5DF2\u505C\u6B62 \xB7 \u8BB0\u5F55\u4E0D\u53EF\u7528",
            tone: "warn",
            status: "cancelled",
            outcome: "cancelled",
            live: false
          });
          return base;
        });
      }
    }
    function seedLogsFromUi(nextUi) {
      var steps2 = nextUi && nextUi.steps || [];
      setLogs(function(prev) {
        var out = Object.assign({}, prev);
        steps2.forEach(function(st) {
          var sid = st.step_id;
          var pl = st.receipt && st.receipt.evidence && st.receipt.evidence.process_log || [];
          if (pl.length && (!out[sid] || pl.length >= out[sid].length)) {
            out[sid] = pl.slice();
          }
        });
        return out;
      });
    }
    function confirmStep(stepId, extra) {
      if (!runId || busy) return;
      setBusy(stepId);
      setErrMsg("");
      var body = Object.assign({ step_id: stepId, decision: "pass" }, extra || {});
      if (!String(body.workspace || "").trim()) {
        var dshWs = typeof resolveDshCwd === "function" && resolveDshCwd(props) || String(ui && ui.workspace || "").trim();
        if (dshWs) body.workspace = dshWs;
      }
      engineApi(
        "/api/dev-pipeline/runs/" + encodeURIComponent(runId) + "/confirm-step",
        {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify(body)
        }
      ).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok === false) {
          setErrMsg(String(d.detail || "\u786E\u8BA4\u5931\u8D25"));
          return;
        }
        mergeUiFromServer(d);
      }).catch(function() {
        setErrMsg("\u786E\u8BA4\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      }).finally(function() {
        setBusy("");
      });
    }
    function cancelRun() {
      if (!runId || busy) return;
      setBusy("cancel");
      setErrMsg("");
      engineApi(
        "/api/dev-pipeline/runs/" + encodeURIComponent(runId) + "/cancel",
        {
          method: "POST",
          headers: Object.assign(
            { "Content-Type": "application/json" },
            authHeaders()
          ),
          body: JSON.stringify({ reason: "\u7528\u6237\u70B9\u51FB\u505C\u6B62\u4EFB\u52A1" })
        }
      ).then(function(r) {
        return r.json().then(function(d) {
          return { okHttp: r.ok, d };
        });
      }).then(function(x) {
        if (x.d && x.d.dev_pipeline_ui) mergeUiFromServer(x.d);
        else if (!x.okHttp || x.d && x.d.ok === false) {
          setErrMsg(
            String(x.d && (x.d.detail || x.d.reply) || "\u505C\u6B62\u5931\u8D25")
          );
        }
      }).catch(function(e) {
        setErrMsg(String(e && e.message || e || "\u505C\u6B62\u5931\u8D25"));
      }).finally(function() {
        setBusy("");
      });
    }
    function retryStep(stepId) {
      if (!runId || busy) return;
      setBusy("retry-" + stepId);
      setErrMsg("");
      var retryBody = { step_id: stepId };
      var dshWs = typeof resolveDshCwd === "function" && resolveDshCwd(props) || String(ui && ui.workspace || "").trim();
      if (dshWs) retryBody.workspace = dshWs;
      engineApi(
        "/api/dev-pipeline/runs/" + encodeURIComponent(runId) + "/advance",
        {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify(retryBody)
        }
      ).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok === false) {
          setErrMsg(String(d.detail || "\u91CD\u8BD5\u5931\u8D25"));
          return;
        }
        mergeUiFromServer(d);
      }).catch(function() {
        setErrMsg("\u91CD\u8BD5\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      }).finally(function() {
        setBusy("");
      });
    }
    useEffect(function() {
      if (!ui0 || !ui0.run_id) return;
      if (serverSyncedRef.current) {
        setUi(function(prev) {
          return dpPreferUi(prev, ui0);
        });
        return;
      }
      setUi(ui0);
      seedLogsFromUi(ui0);
    }, [ui0]);
    useEffect(function() {
      if (!runId || !isPrimary) return;
      var es = null;
      function connectStream() {
        var url = String(engineBase()).replace(/\/$/, "") + "/api/dev-pipeline/runs/" + encodeURIComponent(runId) + "/stream";
        try {
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
        } catch (e0) {
        }
        es = new EventSource(url);
        esRef.current = es;
        es.onmessage = function(ev) {
          try {
            var data = JSON.parse(ev.data || "{}");
            if (data.type === "snapshot" && data.ui) {
              serverSyncedRef.current = true;
              setUi(function(prev) {
                return dpPreferUi(prev, data.ui);
              });
              seedLogsFromUi(data.ui);
              alignToggleWithPipelineUi(data.ui);
              return;
            }
            if (data.type === "step" && data.step_id && data.phase === "running") {
              setUi(function(prev) {
                var base = Object.assign({}, prev || {});
                base.current_step = data.step_id;
                base.status = "running";
                base.steps = (base.steps || []).map(function(st) {
                  if (st.step_id === data.step_id) {
                    return Object.assign({}, st, { status: "running", summary: "\u6267\u884C\u4E2D\u2026" });
                  }
                  return st;
                });
                return base;
              });
              return;
            }
            if (data.type === "log" && data.step_id) {
              var sid = data.step_id;
              setLogs(function(prev) {
                var next = Object.assign({}, prev);
                var arr = (next[sid] || []).slice();
                arr.push(String(data.message || ""));
                next[sid] = arr;
                return next;
              });
              return;
            }
            if (data.type === "receipt" && data.receipt) {
              setUi(function(prev) {
                var base = prev && typeof prev === "object" ? Object.assign({}, prev) : {};
                var steps2 = (base.steps || []).map(function(st) {
                  if (st.step_id === data.receipt.step_id) {
                    return Object.assign({}, st, {
                      status: data.receipt.status,
                      summary: data.receipt.summary,
                      receipt: data.receipt
                    });
                  }
                  return st;
                });
                base.steps = steps2;
                base.current_step = data.receipt.step_id;
                return base;
              });
              var pl = data.receipt.evidence && data.receipt.evidence.process_log || [];
              if (pl.length) {
                setLogs(function(prev) {
                  var next = Object.assign({}, prev);
                  next[data.receipt.step_id] = pl.slice();
                  return next;
                });
              }
              return;
            }
            if (data.type === "run") {
              setUi(function(prev) {
                var base = Object.assign({}, prev || {});
                if (data.phase) base.status = data.phase;
                if (data.outcome) base.outcome = data.outcome;
                if (data.current_step) base.current_step = data.current_step;
                if (data.run_summary) base.run_summary = data.run_summary;
                var phase = String(data.phase || "");
                if ((phase === "cancelled" || phase === "canceled" || phase === "done" || phase === "failed") && data.current_step) {
                  base.steps = (base.steps || []).map(function(st) {
                    if (String(st.step_id) !== String(data.current_step)) return st;
                    if (st.status === "running" || st.status === "waiting_hitl" || st.status === "waiting_user" || st.status === "queued" || st.summary === "\u6267\u884C\u4E2D\u2026") {
                      return Object.assign({}, st, {
                        status: phase === "cancelled" || phase === "canceled" ? "cancelled" : phase === "failed" ? "fail" : st.status,
                        summary: phase === "cancelled" || phase === "canceled" ? String(
                          data.run_summary && data.run_summary.title || st.summary || "\u5DF2\u505C\u6B62"
                        ) : st.summary
                      });
                    }
                    return st;
                  });
                }
                return base;
              });
              return;
            }
            if (data.type === "summary" && data.run) {
              setUi(function(prev) {
                return Object.assign({}, prev || {}, {
                  status: data.run.status,
                  outcome: data.run.outcome,
                  steps: data.run.steps || prev && prev.steps,
                  current_step: data.run.current_step,
                  run_summary: data.run_summary || data.run.run_summary || prev && prev.run_summary
                });
              });
              if (data.run && data.run.steps) seedLogsFromUi({ steps: data.run.steps });
            }
          } catch (eParse) {
          }
        };
      }
      if (typeof fetchEngineApi === "function") {
        fetchEngineApi("/api/runtime").finally(connectStream);
      } else {
        connectStream();
      }
      return function() {
        try {
          if (es) es.close();
        } catch (e1) {
        }
        esRef.current = null;
      };
    }, [runId, isPrimary]);
    useEffect(function() {
      if (!runId) return;
      var cancelled = false;
      function pullOnce() {
        return engineApi("/api/dev-pipeline/runs/" + encodeURIComponent(runId), {
          headers: authHeaders()
        }).then(function(r) {
          return r.json().then(function(d) {
            return { okHttp: r.ok, status: r.status, d };
          });
        }).then(function(pack) {
          if (cancelled) return;
          var d = pack.d || {};
          if (d && d.dev_pipeline_ui) {
            mergeUiFromServer(d);
            return;
          }
          if (!pack.okHttp || d && d.ok === false) {
            mergeUiFromServer({
              ok: false,
              detail: d && d.detail || "run \u4E0D\u5B58\u5728"
            });
          }
        }).catch(function() {
        });
      }
      pullOnce();
      var poll = setInterval(function() {
        if (cancelled) return;
        var st = "";
        try {
          st = String(ui && ui.status || "");
        } catch (eSt) {
        }
        engineApi("/api/dev-pipeline/runs/" + encodeURIComponent(runId), {
          headers: authHeaders()
        }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (cancelled) return;
          if (d && d.dev_pipeline_ui) {
            mergeUiFromServer(d);
            var st2 = String(d.dev_pipeline_ui.status || "");
            if (dpRunFinished(st2, d.dev_pipeline_ui.outcome)) {
              try {
                clearInterval(poll);
              } catch (eClr) {
              }
            }
          }
        }).catch(function() {
        });
        void st;
      }, 2500);
      return function() {
        cancelled = true;
        try {
          clearInterval(poll);
        } catch (eP) {
        }
      };
    }, [runId]);
    var _tick = useState(0);
    var tick = _tick[0];
    var setTick = _tick[1];
    useEffect(
      function() {
        if (!isPrimary) return void 0;
        var st = ui && ui.status || "";
        var oc = ui && ui.outcome || "";
        var live = st === "running" || st === "queued" || st === "paused" || st === "cancelling";
        if (st === "done" || st === "failed" || st === "cancelled" || st === "canceled" || oc === "success" || oc === "failed" || oc === "cancelled") {
          live = false;
        }
        if (!live) return void 0;
        var t = setInterval(function() {
          setTick(function(n) {
            return (n + 1) % 1e5;
          });
        }, 1e3);
        return function() {
          clearInterval(t);
        };
      },
      [isPrimary, ui && ui.status, ui && ui.outcome]
    );
    var steps = ui && ui.steps || [];
    var outcome = ui && ui.outcome;
    var status = ui && ui.status;
    var cur = ui && ui.current_step;
    var runSummary = ui && ui.run_summary || {};
    var doneCount = steps.filter(function(s) {
      return s.status === "pass" || s.status === "skipped";
    }).length;
    var total = steps.length || 10;
    var finished = dpRunFinished(status, outcome);
    var liveLike = dpRunLiveLike(status);
    var canCancel = !finished && liveLike;
    var streamItems = dpBuildStreamItems(ui, steps);
    var visibleSteps = streamItems.filter(function(it) {
      return it.kind === "step";
    }).map(function(it) {
      return it.step;
    });
    var statusForBadge = String(status || runSummary.status || "").trim();
    if (!statusForBadge) {
      statusForBadge = serverSyncedRef.current ? finished ? "done" : "syncing" : "syncing";
    } else if (statusForBadge === "pending" && !liveLike && !finished) {
      statusForBadge = serverSyncedRef.current ? "cancelled" : "syncing";
    }
    var headLine = finished ? runSummary.title || (outcome === "success" ? "\u5168\u6D41\u7A0B\u5B8C\u6210" : outcome === "cancelled" || status === "cancelled" || status === "canceled" ? "\u5DF2\u505C\u6B62" : "\u5DF2\u7ED3\u675F") : status === "cancelling" ? "\u6B63\u5728\u505C\u6B62\u2026" : status === "paused" ? "\u5DF2\u505C\u5728\u7B2C " + (cur || "\u2014") + " \u6B65" : liveLike ? "\u6B63\u5728\u6267\u884C\u7B2C " + (cur || "\u2014") + " \u6B65 \xB7 \u5DF2\u5B8C\u6210 " + doneCount + "/" + total : runSummary.title || (serverSyncedRef.current ? "\u8FC7\u7A0B\u6D41\u5DF2\u7ED3\u675F\u6216\u4E0D\u53EF\u7528" : "\u8FC7\u7A0B\u6D41 \xB7 \u6B63\u5728\u540C\u6B65\u72B6\u6001\u2026");
    var startedAt = Number(runSummary.started_at || ui.created_at || 0) || 0;
    var elapsedSec = 0;
    if (startedAt) {
      if (finished && runSummary.duration_sec != null) {
        elapsedSec = Number(runSummary.duration_sec) || 0;
      } else {
        elapsedSec = Math.max(0, Math.floor(Date.now() / 1e3) - startedAt);
      }
    }
    void tick;
    var railNodesRaw = (runSummary.timeline_flat && runSummary.timeline_flat.length ? runSummary.timeline_flat : runSummary.timeline_trace_display && runSummary.timeline_trace_display.length ? runSummary.timeline_trace_display : runSummary.timeline && runSummary.timeline.length ? runSummary.timeline : steps.map(function(s) {
      return {
        kind: "step",
        step_id: s.step_id,
        title: s.title,
        status: s.status,
        duration_sec: s.receipt && s.receipt.duration_sec || null
      };
    })) || [];
    var railNodes = dpTrimRailNodes(railNodesRaw, finished);
    var railProg = dpRailProgress(railNodes);
    var progressPct = railProg.pct;
    var railStepCount = railProg.stepCount;
    var toneClass = runSummary.tone === "ok" ? " is-ok" : runSummary.tone === "error" ? " is-error" : runSummary.tone === "warn" ? " is-warn" : finished ? outcome === "success" ? " is-ok" : " is-error" : " is-live";
    useEffect(
      function() {
        if (!isPrimary) return;
        if (finished || !followStreamRef.current) return;
        try {
          if (streamEndRef.current && streamEndRef.current.scrollIntoView) {
            streamEndRef.current.scrollIntoView({
              behavior: "smooth",
              block: "nearest"
            });
          }
        } catch (eScroll) {
        }
      },
      [isPrimary, streamItems.length, cur, logs, status, finished]
    );
    useEffect(
      function() {
        if (!isPrimary) return;
        if (!finished) followRailRef.current = true;
        if (!followRailRef.current) return;
        var sc = railScrollRef.current;
        if (!sc) return;
        var active = sc.querySelector(".wb-dp-rail-node.is-active") || (!finished ? null : sc.querySelector(".wb-dp-rail-node.is-fail")) || null;
        if (!active) {
          var nodes = sc.querySelectorAll(".wb-dp-rail-node");
          if (nodes && nodes.length) {
            active = nodes[nodes.length - 1];
          }
        }
        if (!active) return;
        try {
          var left = active.offsetLeft - sc.clientWidth / 2 + active.offsetWidth / 2;
          var max = Math.max(0, sc.scrollWidth - sc.clientWidth);
          var next = Math.max(0, Math.min(max, left));
          if (typeof sc.scrollTo === "function") {
            sc.scrollTo({ left: next, behavior: finished ? "auto" : "smooth" });
          } else {
            sc.scrollLeft = next;
          }
        } catch (eRail) {
        }
      },
      [
        isPrimary,
        finished,
        cur,
        progressPct,
        railNodes.length,
        status,
        tick
      ]
    );
    useEffect(
      function() {
        if (!isPrimary || !runId) return;
        var closing = runSummary && runSummary.closing;
        if (!finished || !closing) {
          dpRemoveClosingHost(runId);
          return;
        }
        var cancelled = false;
        var tries = 0;
        function mountOnce() {
          if (cancelled) return;
          try {
            ensureCss();
            var host = dpEnsureClosingTextHost(runId);
            if (host) {
              dpFillClosingHost(host, closing);
              return true;
            }
          } catch (eClose) {
          }
          return false;
        }
        if (!mountOnce()) {
          var timer = setInterval(function() {
            tries += 1;
            if (mountOnce() || tries >= 12) clearInterval(timer);
          }, 500);
          return function() {
            cancelled = true;
            clearInterval(timer);
          };
        }
        return function() {
          cancelled = true;
        };
      },
      [
        isPrimary,
        runId,
        finished,
        runSummary && runSummary.closing && runSummary.closing.body,
        runSummary && runSummary.closing && runSummary.closing.conclusion
      ]
    );
    if (!isPrimary) return null;
    return h(
      "div",
      { className: "wb-dp wb-dp-stream", "data-dp-rev": DP_UI_REV },
      h("div", { className: "wb-dp-stream-head" }, [
        h("span", { className: "wb-dp-badge" }, "\u9700\u6C42\u2192\u4E0A\u7EBF"),
        h("span", { className: "wb-dp-stream-head-text" }, headLine),
        canCancel ? h(
          "button",
          {
            type: "button",
            className: "wb-dp-btn wb-dp-btn-stop",
            disabled: !!busy || status === "cancelling",
            title: "\u505C\u6B62\u672C\u6D41\u6C34\u7EBF\uFF08\u8F93\u5165\u6846\u53D1\u300C\u6682\u505C\u300D/\u300C\u53D6\u6D88\u300D\u4E5F\u53EF\uFF09",
            onClick: function() {
              cancelRun();
            }
          },
          busy === "cancel" || status === "cancelling" ? "\u505C\u6B62\u4E2D\u2026" : "\u505C\u6B62\u4EFB\u52A1"
        ) : null
      ]),
      h(
        "div",
        { className: "wb-dp-stream-body", "aria-live": "polite" },
        streamItems.length ? streamItems.map(function(item) {
          if (item.kind === "rollback") {
            return h(
              "div",
              {
                key: "rollback-" + (item.visit_seq || ""),
                className: "wb-dp-rollback-banner",
                "data-dp-visit": String(item.visit_seq || "")
              },
              item.label || "\u6253\u56DE\u5199\u7801\uFF08\u5404\u6B65\u8F6E\u6B21\u72EC\u7ACB\u8BA1\uFF09"
            );
          }
          var st = item.step || {};
          var sid = st.step_id;
          var visitSeq = st.visit_seq || item.visit_seq;
          var attempt = st.implement_attempt || 1;
          var isCur = sid === cur && !finished && (st.status === "running" || st.status === "waiting_hitl" || st.status === "waiting_user");
          var receipt = st.receipt || {};
          var evidence = receipt.evidence || {};
          var resultDetailEarly = st.result_detail || receipt.result_detail || evidence.result_detail || "";
          var stStatus = dpResolveReviewStepStatus(
            st,
            receipt,
            resultDetailEarly
          );
          if (finished && (status === "cancelled" || status === "canceled" || outcome === "cancelled") && (stStatus === "running" || stStatus === "queued" || stStatus === "waiting_hitl" || stStatus === "waiting_user")) {
            stStatus = "cancelled";
          }
          var stepLogs = dpStepLogs(st, logs);
          var valResults = evidence.results || [];
          var hitlSteps = { "5": 1, "7": 1, "8": 1, "9": 1, "10": 1 };
          var arts = receipt.artifacts || {};
          var artKeys = Object.keys(arts).filter(function(k) {
            return arts[k] !== true && arts[k] !== false;
          });
          var skillId = st.skill_id || receipt.skill_id || evidence.skill && evidence.skill.id || "";
          var skillTitle = maskVendorUiText(
            st.skill_title || receipt.skill_title || evidence.skill && evidence.skill.title_zh || ""
          );
          var flowBrief = maskVendorUiText(
            st.flow_brief || evidence.skill && evidence.skill.flow_brief || ""
          );
          var stepTitle = maskVendorUiText(st.title || "");
          var resultDetail = st.result_detail || receipt.result_detail || evidence.result_detail || "";
          var resultView = dpStepResultView(
            sid,
            st,
            evidence,
            resultDetail,
            stStatus
          );
          if (resultView.isReview && /审核结果：不通过/.test(String(resultView.lead || ""))) {
            stStatus = "fail";
          }
          return h(
            "article",
            {
              key: "visit-" + String(visitSeq || sid),
              className: "wb-dp-msg" + (isCur ? " is-current" : "") + (stStatus === "running" ? " is-running" : "") + (stStatus === "pass" ? " is-pass" : "") + (stStatus === "waiting_hitl" ? " is-wait" : "") + (stStatus === "waiting_user" ? " is-wait" : "") + (stStatus === "fail" || stStatus === "failed" ? " is-fail" : "") + (attempt > 1 ? " is-retry" : ""),
              "data-dp-step": sid,
              "data-dp-visit": String(visitSeq || "")
            },
            [
              h("header", { className: "wb-dp-msg-head" }, [
                h(
                  "span",
                  { className: "wb-dp-msg-title" },
                  "\u7B2C " + sid + " \u6B65 \xB7 " + stepTitle + (attempt > 1 ? "\uFF08\u7B2C " + attempt + " \u8F6E\uFF09" : "")
                ),
                h(
                  "span",
                  {
                    className: "wb-dp-msg-st " + stStatus,
                    title: "\u672C\u6B65\u7528\u65F6"
                  },
                  dpStatusWithDuration(
                    stStatus,
                    st,
                    receipt,
                    runId,
                    visitSeq
                  )
                )
              ]),
              skillId || skillTitle ? h("div", { className: "wb-dp-msg-skill" }, [
                h("span", { className: "wb-dp-skill-tag" }, "Skill"),
                h(
                  "span",
                  { className: "wb-dp-skill-name", title: skillId },
                  (skillTitle || skillId) + (skillId && skillTitle ? "\uFF08" + skillId + "\uFF09" : "")
                )
              ]) : null,
              flowBrief ? h("div", { className: "wb-dp-msg-sec" }, [
                h("div", { className: "wb-dp-msg-label" }, "\u8FD9\u4E00\u6B65\u5728\u5E72\u4EC0\u4E48"),
                h("p", { className: "wb-dp-msg-flow" }, flowBrief)
              ]) : null,
              h("div", { className: "wb-dp-msg-sec" }, [
                h("div", { className: "wb-dp-msg-label" }, "\u5904\u7406\u8FC7\u7A0B"),
                stepLogs.length ? h(
                  "ul",
                  { className: "wb-dp-msg-log" },
                  stepLogs.map(function(ln, i) {
                    return h("li", { key: i }, ln);
                  })
                ) : h(
                  "p",
                  { className: "wb-dp-msg-muted" },
                  stStatus === "running" ? "\u6B63\u5728\u5904\u7406\u2026" : "\u6682\u65E0\u8FC7\u7A0B\u8BB0\u5F55"
                )
              ]),
              h("div", { className: "wb-dp-msg-sec" }, [
                h("div", { className: "wb-dp-msg-label" }, "\u7ED3\u679C"),
                resultView.isReview ? resultView.lead ? dpRenderMultiline(
                  resultView.lead,
                  "wb-dp-msg-result is-wrap wb-dp-multiline is-lead"
                ) : null : h(
                  "p",
                  { className: "wb-dp-msg-result" },
                  resultView.lead || (stStatus === "running" ? "\u6267\u884C\u4E2D\uFF0C\u5B8C\u6210\u540E\u4F1A\u5199\u5728\u8FD9\u91CC" : stStatus === "waiting_hitl" ? "\u672C\u6B65\u9700\u4F60\u786E\u8BA4\u540E\u624D\u80FD\u7EE7\u7EED" : stStatus === "cancelled" || stStatus === "canceled" ? maskVendorUiText(
                    String(st.summary || "\u7528\u6237\u5DF2\u505C\u6B62\u4EFB\u52A1")
                  ) : "\u2014")
                ),
                resultView.isReview && resultView.riskText ? dpRenderRiskOverview(resultView.riskText) : null,
                resultView.meta ? dpRenderMultiline(
                  resultView.meta,
                  "wb-dp-msg-result-detail is-meta is-review wb-dp-multiline"
                ) : null,
                resultView.body ? dpRenderMultiline(
                  resultView.body,
                  "wb-dp-msg-result-detail is-report is-review wb-dp-multiline"
                ) : null,
                receipt.started_at || receipt.finished_at ? h(
                  "p",
                  { className: "wb-dp-msg-muted" },
                  (receipt.started_at ? "\u5F00\u59CB " + dpFmtTs(receipt.started_at) : "") + (receipt.finished_at ? " \xB7 \u7ED3\u675F " + dpFmtTs(receipt.finished_at) : "") + (receipt.duration_sec != null ? " \xB7 \u8017\u65F6 " + dpFmtDuration(
                    dpStepStatusTerminal(stStatus) ? Math.max(1, Number(receipt.duration_sec) || 0) : receipt.duration_sec
                  ) : "")
                ) : null,
                artKeys.length ? h(
                  "ul",
                  { className: "wb-dp-msg-arts" },
                  artKeys.map(function(k) {
                    var v = arts[k];
                    var shown = typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v);
                    return h("li", { key: k }, k + "\uFF1A" + shown);
                  })
                ) : null,
                valResults.length ? h(
                  "ul",
                  { className: "wb-dp-msg-val" },
                  valResults.map(function(vr, vi) {
                    return h(
                      "li",
                      { key: vi, className: vr.ok ? "ok" : "bad" },
                      (vr.name || "\u547D\u4EE4") + (vr.ok ? " \xB7 \u901A\u8FC7" : " \xB7 \u5931\u8D25") + "\uFF08exit " + vr.exit_code + "\uFF09"
                    );
                  })
                ) : null
              ]),
              stStatus === "waiting_hitl" && hitlSteps[sid] ? h(
                "button",
                {
                  type: "button",
                  className: "wb-dp-btn",
                  disabled: !!busy,
                  onClick: function() {
                    if (sid === "5") {
                      confirmStep("5", {
                        no_code_change: false,
                        note: "\u5199\u7801\u5DF2\u5B8C\u6210"
                      });
                    } else {
                      confirmStep(sid, { note: "\u8F66\u9053\u6B65\u9AA4\u5DF2\u4EBA\u5DE5\u5B8C\u6210" });
                    }
                  }
                },
                busy === sid ? "\u63D0\u4EA4\u4E2D\u2026" : sid === "5" ? "\u5199\u7801\u5DF2\u5B8C\u6210\uFF0C\u7EE7\u7EED\u9A8C\u8BC1" : "\u672C\u6B65\u5DF2\u5B8C\u6210\uFF0C\u7EE7\u7EED"
              ) : null,
              stStatus === "waiting_user" && sid === "6" ? h(
                "button",
                {
                  type: "button",
                  className: "wb-dp-btn",
                  disabled: !!busy,
                  onClick: function() {
                    retryStep("6");
                  }
                },
                busy === "retry-6" ? "\u91CD\u8BD5\u4E2D\u2026" : "\u5DF2\u914D\u7F6E\uFF0C\u91CD\u8BD5\u9A8C\u8BC1"
              ) : null,
              function() {
                var canRetryCommit = sid === "8" && (arts.can_manual_retry || evidence && evidence.can_manual_retry || st.can_manual_retry);
                if (!canRetryCommit) return null;
                return h(
                  "button",
                  {
                    type: "button",
                    className: "wb-dp-btn",
                    disabled: !!busy,
                    onClick: function() {
                      retryStep("8");
                    }
                  },
                  busy === "retry-8" ? "\u91CD\u8BD5\u63D0\u4EA4\u4E2D\u2026" : "\u91CD\u8BD5\u63D0\u4EA4"
                );
              }()
            ]
          );
        }) : h(
          "p",
          { className: "wb-dp-msg-muted wb-dp-stream-empty" },
          finished ? "\u672C Run \u65E0\u8FC7\u7A0B\u660E\u7EC6\uFF08\u53EF\u80FD\u5DF2\u505C\u6B62\u6216\u8BB0\u5F55\u4E0D\u5B8C\u6574\uFF09" : liveLike ? "\u5DF2\u5F00\u8DD1\uFF0C\u7B2C\u4E00\u6B65\u8FC7\u7A0B\u9A6C\u4E0A\u51FA\u73B0\u5728\u8FD9\u91CC\u2026" : serverSyncedRef.current ? "\u6682\u65E0\u8FC7\u7A0B\u660E\u7EC6" : "\u6B63\u5728\u4ECE\u5F15\u64CE\u540C\u6B65\u8FC7\u7A0B\u6D41\u72B6\u6001\u2026"
        ),
        h("div", { ref: streamEndRef, className: "wb-dp-stream-end" })
      ),
      errMsg ? h("p", { className: "wb-dp-stream-err" }, errMsg) : null,
      h(
        "div",
        {
          className: "wb-dp-stream-summary" + toneClass
        },
        [
          h("div", { className: "wb-dp-sum-top" }, [
            h("p", { className: "wb-dp-sum-headline" }, [
              h("span", { className: "wb-dp-sum-head-k" }, "\u603B\u7ED3\u679C"),
              h("span", { className: "wb-dp-sum-head-sep" }, "\xB7"),
              h(
                "span",
                { className: "wb-dp-sum-head-v" },
                maskVendorUiText(runSummary.title || headLine || "\u8FDB\u884C\u4E2D")
              )
            ]),
            h("div", { className: "wb-dp-sum-meta" }, [
              h("span", { className: "wb-dp-sum-chip" }, [
                h("i", { className: "wb-dp-sum-dot" }),
                "\u72B6\u6001 \xB7 " + dpStatusLabel(statusForBadge)
              ]),
              h(
                "span",
                { className: "wb-dp-sum-chip wb-dp-sum-chip-time" },
                "\u603B\u7528\u65F6 \xB7 " + (elapsedSec ? dpFmtDuration(elapsedSec) : runSummary.duration_label || "\u2014")
              ),
              h(
                "span",
                { className: "wb-dp-sum-chip" },
                "\u8FDB\u5EA6 \xB7 " + (railStepCount || runSummary.trace_node_count || railNodes.length || total) + " \u8282\u70B9" + (runSummary.fix_round || ui && ui.fix_round ? " \xB7 \u5DF2\u56DE\u9000 " + (runSummary.fix_round || ui.fix_round) + " \u6B21" : "")
              )
            ])
          ]),
          h(
            "div",
            {
              className: "wb-dp-rail",
              role: "list",
              "aria-label": "\u6B65\u9AA4\u65F6\u95F4\u7EBF\uFF08\u542B\u56DE\u9000\u91CD\u8DD1\uFF0C\u8D85\u8FC7 10 \u6B65\u53EF\u5DE6\u53F3\u6ED1\u52A8\uFF09"
            },
            [
              h(
                "div",
                {
                  className: "wb-dp-rail-scroll",
                  ref: railScrollRef,
                  onWheel: function(ev) {
                    try {
                      var sc = railScrollRef.current;
                      if (!sc || sc.scrollWidth <= sc.clientWidth + 2) return;
                      if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
                        sc.scrollLeft += ev.deltaY;
                        if (ev.cancelable) ev.preventDefault();
                      }
                    } catch (eW) {
                    }
                  }
                },
                h(
                  "div",
                  {
                    className: "wb-dp-rail-inner",
                    style: function() {
                      var totalN = Math.max(1, railNodes.length || 1);
                      var visibleN = 10;
                      return {
                        "--wb-dp-rail-fill": String(progressPct) + "%",
                        "--wb-dp-rail-n": String(totalN),
                        "--wb-dp-rail-total": String(totalN),
                        "--wb-dp-rail-visible": String(visibleN)
                      };
                    }()
                  },
                  [
                    h("div", { className: "wb-dp-rail-track" }, [
                      h("div", {
                        className: "wb-dp-rail-fill",
                        style: { width: progressPct + "%" }
                      })
                    ]),
                    h(
                      "div",
                      { className: "wb-dp-rail-nodes" },
                      railNodes.map(function(node, ni) {
                        var ns = String(node.status || "pending");
                        if (node.kind === "rollback" || ns === "rollback") {
                          return h(
                            "div",
                            {
                              key: "rb-" + (node.seq || ni),
                              className: "wb-dp-rail-node is-rollback",
                              role: "listitem",
                              title: maskVendorUiText(node.title || "\u6253\u56DE\u5199\u7801")
                            },
                            [
                              h("div", { className: "wb-dp-rail-dot" }, "\u21A9"),
                              h(
                                "div",
                                { className: "wb-dp-rail-cap" },
                                "\u56DE\u9000"
                              )
                            ]
                          );
                        }
                        var done = ns === "pass" || ns === "skipped";
                        var sid = String(node.step_id || "");
                        var isLastVisitOfSid = true;
                        for (var lj = ni + 1; lj < railNodes.length; lj++) {
                          var later = railNodes[lj];
                          if (later && later.kind !== "rollback" && later.status !== "rollback" && String(later.step_id || "") === sid) {
                            isLastVisitOfSid = false;
                            break;
                          }
                        }
                        var isActive = isLastVisitOfSid && !done && !finished && (ns === "running" || ns === "waiting_hitl" || ns === "waiting_user" || sid === String(cur) && ns !== "fail" && ns !== "failed" && ns !== "cancelled" && ns !== "canceled");
                        var bad = ns === "fail" || ns === "failed" || ns === "cancelled" || ns === "canceled";
                        var cls = "wb-dp-rail-node" + (done ? " is-done" : "") + (isActive ? " is-active" : "") + (bad ? " is-fail" : "") + (ns === "pending" ? " is-pending" : "") + (node.implement_attempt > 1 ? " is-retry" : "");
                        var dotLabel = node.display_step || (node.implement_attempt > 1 ? sid + "\xB7" + node.implement_attempt : sid || String(ni + 1));
                        var visitKey = String(node.seq || ni);
                        return h(
                          "button",
                          {
                            type: "button",
                            key: "visit-" + visitKey,
                            className: cls,
                            role: "listitem",
                            title: "\u7B2C " + sid + " \u6B65" + (node.implement_attempt > 1 ? "\uFF08\u7B2C " + node.implement_attempt + " \u8F6E\uFF09" : "") + " \xB7 " + maskVendorUiText(node.title || "") + " \xB7 " + dpStatusLabel(ns) + "\uFF08\u70B9\u51FB\u67E5\u770B\u8BE6\u60C5\uFF09",
                            style: {
                              animationDelay: Math.min(ni * 0.04, 0.4) + "s"
                            },
                            onClick: function() {
                              followStreamRef.current = false;
                              try {
                                var root = streamEndRef.current && streamEndRef.current.parentElement || null;
                                var sel = '[data-dp-visit="' + visitKey + '"]';
                                var el = root && root.querySelector(sel) || document.querySelector(
                                  ".wb-dp-stream " + sel
                                );
                                if (!el && sid) {
                                  el = root && root.querySelector(
                                    '[data-dp-step="' + sid + '"]'
                                  ) || document.querySelector(
                                    '.wb-dp-stream [data-dp-step="' + sid + '"]'
                                  );
                                }
                                if (el && el.scrollIntoView) {
                                  el.scrollIntoView({
                                    behavior: "smooth",
                                    block: "center"
                                  });
                                  el.classList.add("is-flash");
                                  setTimeout(function() {
                                    try {
                                      el.classList.remove("is-flash");
                                    } catch (e2) {
                                    }
                                  }, 1200);
                                }
                              } catch (eScroll) {
                              }
                            }
                          },
                          [
                            h(
                              "div",
                              { className: "wb-dp-rail-dot" },
                              done ? "\u2713" : bad ? "!" : dotLabel
                            ),
                            h(
                              "div",
                              { className: "wb-dp-rail-cap" },
                              dpRailCapLabel(node.title, sid)
                            )
                          ]
                        );
                      })
                    )
                  ]
                )
              )
            ]
          )
        ]
      )
    );
  }
  ctx.DevPipelineTimelineCard = DevPipelineTimelineCard;
  function resolveIntegratedFlowSessionId(props) {
    var sid = "";
    if (props) {
      sid = props.sessionId || props.session && (props.session.id || props.session.sessionId) || "";
    }
    sid = String(sid || "").trim();
    if (sid) return sid;
    if (typeof ctx.readWorkbuddyCurrentSessionId === "function") {
      try {
        sid = String(ctx.readWorkbuddyCurrentSessionId() || "").trim();
        if (sid) return sid;
      } catch (eRead) {
      }
    }
    try {
      return String(globalThis.__wbDshSessionId || "").trim() || "";
    } catch (eG) {
      return "";
    }
  }
  function readIntegratedFlowCache(sessionId) {
    var sid = String(sessionId || "").trim();
    var stores = [];
    try {
      if (typeof localStorage !== "undefined") stores.push(localStorage);
    } catch (eL) {
    }
    try {
      if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);
    } catch (eS) {
    }
    if (sid) {
      var keySid = "wb.integratedFlow." + sid;
      for (var s = 0; s < stores.length; s++) {
        try {
          var v = String(stores[s].getItem(keySid) || "");
          if (v === "1") return true;
          if (v === "0") return false;
        } catch (eR) {
        }
      }
      return null;
    }
    for (var s2 = 0; s2 < stores.length; s2++) {
      try {
        var v2 = String(stores[s2].getItem("wb.integratedFlow.__last") || "");
        if (v2 === "1") return true;
        if (v2 === "0") return false;
      } catch (eR2) {
      }
    }
    return null;
  }
  function syncToggleFromSessionRuns(sessionId, setOnFn) {
    var sid = String(sessionId || "").trim();
    if (!sid || typeof setOnFn !== "function") return Promise.resolve(false);
    function forceOn() {
      setOnFn(true);
      writeIntegratedFlowCache(sid, true);
      return engineApi(
        "/api/dev-pipeline/sessions/" + encodeURIComponent(sid) + "/integrated",
        {
          method: "PUT",
          headers: Object.assign(
            { "Content-Type": "application/json" },
            authHeaders()
          ),
          body: JSON.stringify({ enabled: true })
        }
      ).then(function() {
        return true;
      }).catch(function() {
        return true;
      });
    }
    return engineApi(
      "/api/dev-pipeline/sessions/" + encodeURIComponent(sid) + "/active-run",
      { headers: authHeaders() }
    ).then(function(r) {
      return r.json();
    }).then(function(d) {
      if (d && d.ok && d.run) return forceOn();
      return engineApi(
        "/api/dev-pipeline/sessions/" + encodeURIComponent(sid) + "/latest-run",
        { headers: authHeaders() }
      ).then(function(r2) {
        return r2.json();
      }).then(function(d2) {
        var run = d2 && d2.run;
        if (d2 && d2.ok && run && dpRunLiveLike(run.status)) {
          return forceOn();
        }
        return false;
      });
    }).catch(function() {
      return false;
    });
  }
  function syncToggleFromActiveRun(sessionId, setOnFn) {
    return syncToggleFromSessionRuns(sessionId, setOnFn);
  }
  function writeIntegratedFlowCache(sessionId, on) {
    var sid = String(sessionId || "").trim();
    var v = on ? "1" : "0";
    var stores = [];
    try {
      if (typeof localStorage !== "undefined") stores.push(localStorage);
    } catch (eA) {
    }
    try {
      if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);
    } catch (eB) {
    }
    for (var i = 0; i < stores.length; i++) {
      try {
        if (sid) stores[i].setItem("wb.integratedFlow." + sid, v);
        stores[i].setItem("wb.integratedFlow.__last", v);
      } catch (eW) {
      }
    }
  }
  function WorkBuddyIntegratedFlowToggle(props) {
    ensureCss();
    var sessionId = resolveIntegratedFlowSessionId(props);
    var cachedInit = readIntegratedFlowCache(sessionId);
    var _on = useState(cachedInit === true);
    var on = _on[0];
    var setOnRaw = _on[1];
    function setOn(next) {
      var v = !!next;
      setOnRaw(v);
      try {
        globalThis.__wbIntegratedFlowOn = v;
        if (typeof document !== "undefined" && document.documentElement) {
          document.documentElement.classList.toggle("wb-integrated-flow-on", v);
        }
        try {
          var sid = String(sessionId || globalThis.__wbDshSessionId || "").trim();
          writeIntegratedFlowCache(sid, v);
        } catch (eSs) {
        }
        try {
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent("wb-integrated-flow-changed", { detail: { on: v } })
            );
          }
        } catch (eEv) {
        }
      } catch (eSetOn) {
      }
    }
    var _busy = useState(false);
    var busy = _busy[0];
    var setBusy = _busy[1];
    var _hint = useState("");
    var hint = _hint[0];
    var setHint = _hint[1];
    var _blocked = useState(false);
    var blocked = _blocked[0];
    var setBlocked = _blocked[1];
    useEffect(
      function() {
        if (!sessionId) return;
        try {
          globalThis.__wbDshSessionId = sessionId;
        } catch (eSid) {
        }
        try {
          var cached = readIntegratedFlowCache(sessionId);
          if (cached === true) setOn(true);
          else if (cached === false) setOn(false);
        } catch (eCache) {
        }
      },
      [sessionId]
    );
    useEffect(
      function() {
        if (typeof window === "undefined" || !window.addEventListener) return;
        function onFlowFlag(ev) {
          try {
            var d = ev && ev.detail || {};
            if (!d.fromPipelineCard || !d.on) return;
            var evSid = String(d.sessionId || "").trim();
            var cur = String(sessionId || "").trim();
            if (evSid && cur && evSid !== cur) return;
            setOnRaw(true);
            writeIntegratedFlowCache(cur || evSid, true);
            try {
              globalThis.__wbIntegratedFlowOn = true;
              if (typeof document !== "undefined" && document.documentElement) {
                document.documentElement.classList.add("wb-integrated-flow-on");
              }
            } catch (eFlag) {
            }
          } catch (eF) {
          }
        }
        window.addEventListener("wb-integrated-flow-changed", onFlowFlag);
        return function() {
          try {
            window.removeEventListener("wb-integrated-flow-changed", onFlowFlag);
          } catch (eR) {
          }
        };
      },
      [sessionId]
    );
    useEffect(
      function() {
        if (!sessionId) {
          try {
            var keepBoot = readIntegratedFlowCache("");
            if (keepBoot === true) setOn(true);
          } catch (eBoot) {
          }
          return;
        }
        engineApi(
          "/api/dev-pipeline/sessions/" + encodeURIComponent(sessionId) + "/integrated",
          { headers: authHeaders() }
        ).then(function(r) {
          return r.json().then(function(d) {
            return { status: r.status, d };
          });
        }).then(function(pack) {
          var d = pack.d || {};
          if (d && d.ok) {
            setBlocked(false);
            setHint("");
            var onApi = !!d.integrated_flow_enabled;
            setOn(onApi);
            try {
              writeIntegratedFlowCache(sessionId, onApi);
            } catch (eW) {
            }
            try {
              globalThis.__wbIntegratedFlowOn = onApi;
              if (typeof document !== "undefined" && document.documentElement) {
                document.documentElement.classList.toggle(
                  "wb-integrated-flow-on",
                  onApi
                );
              }
            } catch (eFlag) {
            }
            if (!onApi) {
              syncToggleFromSessionRuns(sessionId, setOn);
            }
            return;
          }
          var detail = String(d && d.detail || "").trim();
          if (detail.indexOf("\u505C\u7528") >= 0 || d && d.source === "disabled") {
            setBlocked(true);
            setHint("\u8BF7\u5148\u5728\u5DE6\u4FA7\u300C\u529F\u80FD\u63D2\u4EF6\u300D\u542F\u7528\u300C\u9700\u6C42\u5230\u4E0A\u7EBF\u4E00\u4F53\u5316\u300D");
            setOn(false);
            return;
          }
          if (detail) {
            setHint(detail.slice(0, 80));
          }
          var keep = readIntegratedFlowCache(sessionId);
          if (keep === true) setOn(true);
          else if (keep === false) setOn(false);
        }).catch(function() {
          setHint("\u5F15\u64CE\u672A\u5C31\u7EEA\uFF0C\u7A0D\u540E\u518D\u8BD5");
          var keep2 = readIntegratedFlowCache(sessionId);
          if (keep2 === true) setOn(true);
        });
      },
      [sessionId]
    );
    if (!sessionId) return null;
    var compact = props && props.compact;
    return h(
      "label",
      {
        className: "wb-dp-session-toggle" + (on ? " is-on" : "") + (blocked ? " is-blocked" : "") + (compact ? " wb-dp-session-toggle--compact" : ""),
        title: hint || "\u4EC5\u672C\u4F1A\u8BDD\u6709\u6548\uFF1A\u5F00\u542F\u8D70\u300C\u9700\u6C42\u2192\u4E0A\u7EBF\u300D\u8FC7\u7A0B\u6D41\uFF1B\u5173\u95ED\u4E3A\u666E\u901A\u5199\u7801/\u56DB\u8F66\u9053\u3002\u4E24\u79CD\u6A21\u5F0F\u5747\u53EF\u8D34\u56FE\uFF08\u9644\u56FE\u8D70\u667A\u8C31\u8BC6\u56FE\uFF0C\u6587\u5B57\u4ECD\u7528\u5F53\u524D\u804A\u5929\u6A21\u578B\uFF09"
      },
      h("input", {
        type: "checkbox",
        checked: !!on,
        disabled: busy,
        onChange: function(ev) {
          var next = !!ev.target.checked;
          setBusy(true);
          setHint("");
          engineApi(
            "/api/dev-pipeline/sessions/" + encodeURIComponent(sessionId) + "/integrated",
            {
              method: "PUT",
              headers: Object.assign(
                { "Content-Type": "application/json" },
                authHeaders()
              ),
              body: JSON.stringify({ enabled: next })
            }
          ).then(function(r) {
            return r.json().then(function(d) {
              return { status: r.status, d };
            });
          }).then(function(pack) {
            var d = pack.d || {};
            if (d && d.ok) {
              setBlocked(false);
              setOn(!!d.integrated_flow_enabled);
              setHint("");
              try {
                globalThis.__wbIntegratedFlowOn = !!d.integrated_flow_enabled;
                if (typeof document !== "undefined" && document.documentElement) {
                  document.documentElement.classList.toggle(
                    "wb-integrated-flow-on",
                    !!d.integrated_flow_enabled
                  );
                }
              } catch (eFlag2) {
              }
              return;
            }
            setOn(false);
            try {
              globalThis.__wbIntegratedFlowOn = false;
              if (typeof document !== "undefined" && document.documentElement) {
                document.documentElement.classList.remove("wb-integrated-flow-on");
              }
            } catch (eFlag3) {
            }
            var detail = formatApiDetail(d, pack.status).trim();
            if (detail.indexOf("\u505C\u7528") >= 0 || d && d.source === "disabled") {
              setBlocked(true);
              setHint("\u8BF7\u5148\u5728\u5DE6\u4FA7\u300C\u529F\u80FD\u63D2\u4EF6\u300D\u542F\u7528\u300C\u9700\u6C42\u5230\u4E0A\u7EBF\u4E00\u4F53\u5316\u300D");
            } else {
              setHint(detail.slice(0, 100));
            }
            try {
              if (typeof window !== "undefined" && window.alert) {
                window.alert(detail);
              }
            } catch (eAlert) {
            }
          }).catch(function() {
            setOn(false);
            setHint("\u5F15\u64CE\u672A\u5C31\u7EEA\uFF0C\u65E0\u6CD5\u5207\u6362");
          }).finally(function() {
            setBusy(false);
          });
        }
      }),
      h(
        "span",
        { className: "wb-dp-session-toggle-label" },
        blocked ? "\u9700\u542F\u7528\u63D2\u4EF6" : on ? "\u9700\u6C42\u2192\u4E0A\u7EBF" : "\u666E\u901A\u5199\u7801"
      )
    );
  }
  function WorkBuddyIntegratedFlowInputChip(props) {
    ensureCss();
    var sessionId = resolveIntegratedFlowSessionId(props);
    if (!sessionId) return null;
    return h(WorkBuddyIntegratedFlowToggle, {
      sessionId,
      compact: true
    });
  }
  ctx.WorkBuddyIntegratedFlowToggle = WorkBuddyIntegratedFlowToggle;
  ctx.WorkBuddyIntegratedFlowInputChip = WorkBuddyIntegratedFlowInputChip;
  function registerIntegratedFlowComposerSlots(ctx2) {
    if (!ctx2 || !ctx2.slots || typeof ctx2.slots.inject !== "function") return;
    if (ctx2.__wbDpComposerSlotsRegistered) return;
    ctx2.__wbDpComposerSlotsRegistered = true;
    try {
      ctx2.slots.inject("conversation.input.right", function() {
        return ctx2.slots.register(
          {
            name: "conversation.input.right",
            id: "workbuddy-integrated-flow-chip",
            order: 40
          },
          WorkBuddyIntegratedFlowInputChip
        );
      });
    } catch (eRight) {
      ctx2.__wbDpComposerSlotsRegistered = false;
      console.warn("[dsh-mes-bridge] conversation.input.right \u4E00\u4F53\u5316\u5F00\u5173\u4E0D\u53EF\u7528", eRight);
    }
    try {
      installIntegratedComposerVisionBridge(ctx2);
    } catch (ePaste) {
      console.warn("[dsh-mes-bridge] \u4E00\u4F53\u5316\u8D34\u56FE\u6865\u4E0D\u53EF\u7528", ePaste);
    }
  }
  function installIntegratedComposerVisionBridge(ctx2) {
    if (typeof document === "undefined") return;
    if (ctx2.__wbDpVisionBridgeInstalled) return;
    ctx2.__wbDpVisionBridgeInstalled = true;
    var diverting = false;
    var eagerFiles = [];
    function currentSid() {
      try {
        if (typeof ctx2.readWorkbuddyCurrentSessionId === "function") {
          var s = String(ctx2.readWorkbuddyCurrentSessionId() || "").trim();
          if (s) return s;
        }
      } catch (e1) {
      }
      try {
        return String(globalThis.__wbDshSessionId || "").trim();
      } catch (e2) {
        return "";
      }
    }
    function composerCard() {
      return document.querySelector("[data-composer-card]");
    }
    function collectImageFiles(dt) {
      var out = [];
      if (!dt) return out;
      var i;
      if (dt.files && dt.files.length) {
        for (i = 0; i < dt.files.length; i++) {
          var f = dt.files[i];
          if (f && String(f.type || "").indexOf("image/") === 0) out.push(f);
        }
      }
      if (!out.length && dt.items && dt.items.length) {
        for (i = 0; i < dt.items.length; i++) {
          var it = dt.items[i];
          if (it && it.kind === "file" && String(it.type || "").indexOf("image/") === 0) {
            var f2 = it.getAsFile && it.getAsFile();
            if (f2) out.push(f2);
          }
        }
      }
      return out.slice(0, 6);
    }
    function rememberFiles(files) {
      if (!files || !files.length) return;
      for (var i = 0; i < files.length; i++) {
        eagerFiles.push(files[i]);
      }
      if (eagerFiles.length > 6) eagerFiles = eagerFiles.slice(-6);
    }
    function uploadPending(files) {
      var sid = currentSid();
      if (!sid || !files || !files.length) {
        return Promise.resolve({ ok: false, detail: "no files", image_ids: [] });
      }
      var fd = new FormData();
      fd.append("session_id", sid);
      fd.append("purpose", "req_intake");
      for (var i = 0; i < files.length; i++) {
        fd.append("images", files[i], files[i].name || "paste.png");
      }
      var headers = {};
      try {
        headers = authHeaders() || {};
      } catch (eH) {
      }
      if (headers["Content-Type"]) delete headers["Content-Type"];
      if (headers["content-type"]) delete headers["content-type"];
      return engineApi("/api/vision/upload", {
        method: "POST",
        headers,
        body: fd
      }).then(function(r) {
        return r.json().catch(function() {
          return { ok: r.ok, image_ids: [] };
        });
      }).catch(function() {
        return { ok: false, image_ids: [] };
      });
    }
    var lastUploadIds = [];
    function visionMarkerFromIds(imageIds) {
      var ids = (imageIds || []).map(String).filter(function(id) {
        return /^vimg-/.test(id);
      });
      if (!ids.length) return "";
      return "\u3010\u9644\u56FE:" + ids.join(",") + "\u3011";
    }
    function injectVisionMarkdownIntoDraft(imageIds) {
      var card = composerCard();
      var ta = card && card.querySelector("textarea");
      if (!ta || !imageIds || !imageIds.length) return false;
      var marker = visionMarkerFromIds(imageIds);
      if (!marker) return false;
      lastUploadIds = imageIds.slice();
      var cur = String(ta.value || "");
      if (/【(?:已)?附图/.test(cur) || /\/api\/vision\/images\//.test(cur)) {
        return true;
      }
      var next = cur.replace(/\s*$/, "") + "\n" + marker + "\n";
      try {
        var desc = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value"
        );
        if (desc && typeof desc.set === "function") {
          desc.set.call(ta, next);
        } else {
          ta.value = next;
        }
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        ta.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      } catch (eSet) {
        return false;
      }
    }
    function installVisionChatThumbnails() {
      if (typeof document === "undefined") return;
      if (document.documentElement.getAttribute("data-wb-vision-thumbs") === "1") {
        return;
      }
      document.documentElement.setAttribute("data-wb-vision-thumbs", "1");
      var MARKER_RE = /【\s*(?:已附图(?:×\d+)?(?:\s*[·•]\s*交智谱识图)?(?::([^\】]*))?|附图\s*:\s*([^\】]+))\s*】|!\[需求附图\]\((https?:\/\/[^)\s]+\/api\/vision\/images\/(vimg-[a-zA-Z0-9_-]+))\)|(?:^|[\s\n])(vimg-[a-f0-9]{16})(?=[\s\n】]|$)/gi;
      var lightboxEl = null;
      var lightboxEsc = null;
      function closeVisionLightbox() {
        if (lightboxEsc) {
          try {
            document.removeEventListener("keydown", lightboxEsc, true);
          } catch (eRm) {
          }
          lightboxEsc = null;
        }
        if (lightboxEl && lightboxEl.parentNode) {
          try {
            lightboxEl.parentNode.removeChild(lightboxEl);
          } catch (eRm2) {
          }
        }
        lightboxEl = null;
      }
      function openVisionLightbox(url, alt) {
        closeVisionLightbox();
        var overlay = document.createElement("div");
        overlay.className = "wb-vision-lightbox";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "\u9644\u56FE\u9884\u89C8");
        var inner = document.createElement("div");
        inner.className = "wb-vision-lightbox-inner";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wb-vision-lightbox-x";
        btn.setAttribute("aria-label", "\u5173\u95ED\u9884\u89C8");
        btn.textContent = "\xD7";
        btn.addEventListener("click", function(ev) {
          ev.preventDefault();
          ev.stopPropagation();
          closeVisionLightbox();
        });
        var img = document.createElement("img");
        img.src = url;
        img.alt = alt || "\u9700\u6C42\u9644\u56FE";
        inner.appendChild(btn);
        inner.appendChild(img);
        overlay.appendChild(inner);
        overlay.addEventListener("click", function(ev) {
          if (ev.target === overlay) closeVisionLightbox();
        });
        lightboxEsc = function(ev) {
          if (ev.key === "Escape") {
            ev.preventDefault();
            closeVisionLightbox();
          }
        };
        document.addEventListener("keydown", lightboxEsc, true);
        document.body.appendChild(overlay);
        lightboxEl = overlay;
        try {
          btn.focus();
        } catch (eF) {
        }
      }
      function parseIdsFromMatch(m) {
        var raw = String(m[1] || m[2] || "").trim();
        var fromUrl = m[4] ? String(m[4]) : "";
        var bare = m[5] ? String(m[5]) : "";
        var ids = [];
        if (raw) {
          raw.split(/[,\s，、]+/).forEach(function(id) {
            id = String(id || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "").trim();
            if (/^vimg-[a-zA-Z0-9_-]+$/.test(id)) ids.push(id);
          });
        }
        if (fromUrl && /^vimg-/.test(fromUrl)) ids.push(fromUrl);
        if (bare && /^vimg-/.test(bare)) ids.push(bare);
        if (!ids.length && lastUploadIds.length) ids = lastUploadIds.slice();
        return ids;
      }
      function imgUrl(id) {
        return String(engineBase() || "").replace(/\/$/, "") + "/api/vision/images/" + encodeURIComponent(id);
      }
      function buildThumbStrip(ids) {
        var wrap = document.createElement("span");
        wrap.className = "wb-vision-atts";
        wrap.setAttribute("data-wb-vision-enhanced", "1");
        wrap.setAttribute("contenteditable", "false");
        for (var i = 0; i < ids.length; i++) {
          (function(id) {
            var a = document.createElement("button");
            a.type = "button";
            a.className = "wb-vision-thumb";
            a.title = "\u70B9\u51FB\u653E\u5927\u9884\u89C8";
            a.setAttribute("aria-label", "\u70B9\u51FB\u653E\u5927\u9884\u89C8\u9644\u56FE");
            var img = document.createElement("img");
            img.src = imgUrl(id);
            img.alt = "\u9700\u6C42\u9644\u56FE";
            img.loading = "lazy";
            img.draggable = false;
            img.onerror = function() {
              a.classList.add("is-broken");
              a.textContent = "\u9644\u56FE\u52A0\u8F7D\u5931\u8D25";
            };
            a.appendChild(img);
            a.addEventListener("click", function(ev) {
              ev.preventDefault();
              ev.stopPropagation();
              if (a.classList.contains("is-broken")) return;
              openVisionLightbox(imgUrl(id), "\u9700\u6C42\u9644\u56FE");
            });
            wrap.appendChild(a);
          })(ids[i]);
        }
        return wrap;
      }
      function replaceTextWithThumbs(text) {
        var cleaned = String(text || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "");
        if (cleaned.indexOf("\u9644\u56FE") < 0 && cleaned.indexOf("vision/images") < 0 && cleaned.indexOf("vimg-") < 0) {
          return null;
        }
        MARKER_RE.lastIndex = 0;
        if (!MARKER_RE.test(cleaned)) return null;
        MARKER_RE.lastIndex = 0;
        var frag = document.createDocumentFragment();
        var last = 0;
        var m;
        var any = false;
        while (m = MARKER_RE.exec(cleaned)) {
          var ids = parseIdsFromMatch(m);
          if (!ids.length) continue;
          any = true;
          if (m.index > last) {
            frag.appendChild(document.createTextNode(cleaned.slice(last, m.index)));
          }
          frag.appendChild(buildThumbStrip(ids));
          last = m.index + m[0].length;
        }
        if (!any) return null;
        if (last < cleaned.length) {
          frag.appendChild(document.createTextNode(cleaned.slice(last)));
        }
        return frag;
      }
      function isInsideComposer(node) {
        var el = node && node.nodeType === 3 ? node.parentElement : node;
        if (!el) return false;
        try {
          if (el.isContentEditable) return true;
        } catch (eCe) {
        }
        try {
          if (el.closest) {
            if (el.closest("[data-composer-seat],[data-composer-card]")) return true;
            if (el.closest('[contenteditable="true"],[contenteditable=""]')) return true;
          }
        } catch (eC) {
        }
        return false;
      }
      function enhanceTextNode(textNode) {
        if (isInsideComposer(textNode)) return false;
        var frag = replaceTextWithThumbs(textNode.nodeValue || "");
        if (!frag) return false;
        var parent = textNode.parentNode;
        if (!parent || isInsideComposer(parent)) return false;
        parent.replaceChild(frag, textNode);
        return true;
      }
      function enhanceFragmentedParent(parent) {
        if (!parent || parent.nodeType !== 1) return false;
        if (isInsideComposer(parent)) return false;
        if (parent.querySelector && parent.querySelector(".wb-vision-atts")) return false;
        if (parent.tagName === "TEXTAREA" || parent.tagName === "INPUT" || parent.tagName === "SCRIPT" || parent.tagName === "STYLE" || parent.tagName === "BUTTON" || parent.tagName === "A") {
          return false;
        }
        var kids = parent.childNodes;
        var onlyTextish = true;
        var joined = "";
        for (var i = 0; i < kids.length; i++) {
          var k = kids[i];
          if (k.nodeType === 3) {
            joined += k.nodeValue || "";
          } else if (k.nodeType === 1 && (k.tagName === "BR" || k.tagName === "WBR")) {
            joined += "\n";
          } else {
            onlyTextish = false;
            break;
          }
        }
        if (!onlyTextish || kids.length < 2) return false;
        var frag = replaceTextWithThumbs(joined);
        if (!frag) return false;
        while (parent.firstChild) parent.removeChild(parent.firstChild);
        parent.appendChild(frag);
        return true;
      }
      function walk(root) {
        if (!root) return;
        if (isInsideComposer(root)) return;
        if (root.nodeType === 3) {
          try {
            enhanceTextNode(root);
          } catch (eT) {
          }
          return;
        }
        if (root.nodeType !== 1) return;
        if (root.classList && root.classList.contains("wb-vision-atts")) return;
        if (root.classList && root.classList.contains("wb-vision-lightbox")) return;
        if (root.closest && root.closest(".wb-vision-atts")) return;
        if (root.tagName === "TEXTAREA" || root.tagName === "INPUT" || root.tagName === "SCRIPT" || root.tagName === "STYLE") {
          return;
        }
        try {
          enhanceFragmentedParent(root);
        } catch (eF) {
        }
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        var n;
        while (n = walker.nextNode()) {
          if (isInsideComposer(n)) continue;
          var v = n.nodeValue || "";
          if (v.indexOf("\u9644\u56FE") >= 0 || v.indexOf("vision/images") >= 0 || v.indexOf("vimg-") >= 0) {
            nodes.push(n);
          }
        }
        for (var i = 0; i < nodes.length; i++) {
          try {
            enhanceTextNode(nodes[i]);
          } catch (eEnh) {
          }
        }
      }
      var scheduled = false;
      var pendingRoot = null;
      function schedule(root) {
        pendingRoot = root || document.body;
        if (scheduled) return;
        scheduled = true;
        setTimeout(function() {
          scheduled = false;
          var r = pendingRoot || document.body;
          pendingRoot = null;
          try {
            walk(r);
            if (r !== document.body) walk(document.body);
          } catch (eW) {
          }
        }, 60);
      }
      schedule(document.body);
      var pulses = 0;
      var pulseTimer = setInterval(function() {
        pulses += 1;
        schedule(document.body);
        if (pulses >= 40) {
          try {
            clearInterval(pulseTimer);
          } catch (eC) {
          }
        }
      }, 750);
      try {
        var mo = new MutationObserver(function(mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var mu = mutations[i];
            if (mu.type === "childList") {
              for (var j = 0; j < mu.addedNodes.length; j++) {
                var node = mu.addedNodes[j];
                if (isInsideComposer(node)) continue;
                if (node.nodeType === 1) {
                  if (node.classList && (node.classList.contains("wb-vision-atts") || node.classList.contains("wb-vision-lightbox"))) {
                    continue;
                  }
                  schedule(node);
                } else if (node.nodeType === 3 && node.parentNode) {
                  if (!isInsideComposer(node.parentNode)) schedule(node.parentNode);
                }
              }
            } else if (mu.type === "characterData" && mu.target && mu.target.parentNode) {
              if (!isInsideComposer(mu.target)) schedule(mu.target.parentNode);
            }
          }
        });
        mo.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        });
      } catch (eMo) {
      }
    }
    ctx.installVisionChatThumbnails = installVisionChatThumbnails;
    function collectBlobFilesFromComposer() {
      var card = composerCard();
      if (!card) return Promise.resolve([]);
      var imgs = card.querySelectorAll('img[src^="blob:"]');
      var tasks = [];
      for (var i = 0; i < imgs.length && i < 6; i++) {
        (function(img) {
          var src = img.getAttribute("src") || "";
          var alt = String(img.getAttribute("alt") || "paste.png").trim() || "paste.png";
          tasks.push(
            fetch(src).then(function(r) {
              return r.blob();
            }).then(function(blob) {
              var type = blob.type || "image/png";
              var name = alt.indexOf(".") > 0 ? alt : alt + ".png";
              return new File([blob], name, { type });
            }).catch(function() {
              return null;
            })
          );
        })(imgs[i]);
      }
      return Promise.all(tasks).then(function(arr) {
        return arr.filter(Boolean);
      });
    }
    function composerHasDraftImages() {
      var card = composerCard();
      if (!card) return false;
      return card.querySelectorAll('img[src^="blob:"]').length > 0;
    }
    function stripComposerDraftImages() {
      var card = composerCard();
      if (!card) return 0;
      var buttons = card.querySelectorAll("button[aria-label]");
      var n = 0;
      for (var i = 0; i < buttons.length; i++) {
        var label = String(buttons[i].getAttribute("aria-label") || "");
        if (label.indexOf("\u79FB\u9664\u56FE\u7247") === 0 || label.indexOf("Remove image") === 0) {
          try {
            buttons[i].click();
            n += 1;
          } catch (eClick) {
          }
        }
      }
      return n;
    }
    function clickSendAgain() {
      var card = composerCard();
      if (!card) return;
      var buttons = card.querySelectorAll("button[aria-label]");
      for (var i = 0; i < buttons.length; i++) {
        var label = String(buttons[i].getAttribute("aria-label") || "");
        if (label === "\u53D1\u9001\u6D88\u606F" || label === "Send message") {
          try {
            buttons[i].click();
          } catch (eSend) {
          }
          return;
        }
      }
      var ta = card.querySelector("textarea");
      if (ta) {
        try {
          ta.focus();
          ta.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              bubbles: true,
              cancelable: true
            })
          );
        } catch (eKey) {
        }
      }
    }
    function divertSendThenRelease(ev) {
      if (diverting) return false;
      if (!composerHasDraftImages() && !eagerFiles.length) return false;
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") {
          ev.stopImmediatePropagation();
        }
      }
      diverting = true;
      var fromEager = eagerFiles.slice();
      eagerFiles = [];
      collectBlobFilesFromComposer().then(function(fromBlob) {
        var files = fromBlob.length ? fromBlob : fromEager;
        return uploadPending(files);
      }).then(function(up) {
        var ids = up && up.image_ids || [];
        stripComposerDraftImages();
        return new Promise(function(resolve) {
          setTimeout(function() {
            stripComposerDraftImages();
            if (ids.length) injectVisionMarkdownIntoDraft(ids);
            resolve(ids);
          }, 60);
        });
      }).then(function() {
        return new Promise(function(resolve) {
          setTimeout(resolve, 80);
        });
      }).then(function() {
        diverting = false;
        clickSendAgain();
      }).catch(function() {
        diverting = false;
      });
      return true;
    }
    function onPaste(ev) {
      var files = collectImageFiles(ev && ev.clipboardData);
      if (!files.length) return;
      rememberFiles(files);
      uploadPending(files);
    }
    function onDrop(ev) {
      var files = collectImageFiles(ev && ev.dataTransfer);
      if (!files.length) return;
      rememberFiles(files);
      uploadPending(files);
    }
    function onKeyDown(ev) {
      if (diverting) return;
      if (ev.key !== "Enter" || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) {
        return;
      }
      if (ev.isComposing || ev.nativeEvent && ev.nativeEvent.isComposing) return;
      var card = composerCard();
      if (!card) return;
      var ta = card.querySelector("textarea");
      if (!ta || ev.target !== ta && !card.contains(ev.target)) return;
      if (!composerHasDraftImages() && !eagerFiles.length) return;
      divertSendThenRelease(ev);
    }
    function onClick(ev) {
      if (diverting) return;
      var btn = ev.target && ev.target.closest ? ev.target.closest("button[aria-label]") : null;
      if (!btn) return;
      var label = String(btn.getAttribute("aria-label") || "");
      if (label !== "\u53D1\u9001\u6D88\u606F" && label !== "Send message") return;
      var card = composerCard();
      if (!card || !card.contains(btn)) return;
      if (!composerHasDraftImages() && !eagerFiles.length) return;
      divertSendThenRelease(ev);
    }
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("click", onClick, true);
    try {
      installVisionChatThumbnails();
    } catch (eThumbs) {
      console.warn("[dsh-mes-bridge] \u9644\u56FE\u7F29\u7565\u56FE\u589E\u5F3A\u4E0D\u53EF\u7528", eThumbs);
    }
  }
  ctx.registerIntegratedFlowComposerSlots = registerIntegratedFlowComposerSlots;
  function installIntegratedFlowComposerDock(_ctx2) {
    return function() {
    };
  }
  ctx.installIntegratedFlowComposerDock = installIntegratedFlowComposerDock;
}

// client-src/settings.js
function installSettings(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, fetchEngineApi = ctx.fetchEngineApi, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  function field(label, props, full) {
    var p = props || {};
    return h(
      "div",
      { className: "wb-set-field" + (full ? " full" : "") },
      h("label", null, maskVendorUiText(label)),
      p.multiline ? h("textarea", p) : h("input", p)
    );
  }
  var WB_SECRET_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  function secretMaskConfigured(s) {
    var t = String(s || "");
    return t === WB_SECRET_MASK || /^•+$/.test(t);
  }
  var HOST_SET_HIDE_LABELS = ["\u8FDC\u7AEF\u5BA1\u7801", "Cursor \u5BF9\u8BDD\u5199\u7801", "Cursor \u5199\u7801"];
  var _wbHostHideCleanup = null;
  function hideHostSettingsDupes() {
    if (typeof document === "undefined") return function() {
    };
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
        if (el.closest && el.closest(".wb-set")) continue;
        var text = String(el.textContent || "").replace(/\s+/g, " ").trim();
        if (!labelMatch(text)) continue;
        var cell = el.closest && (el.closest("[class*='_navCell']") || el.closest("[role='tab']")) || el;
        if (cell.closest && cell.closest(".wb-set")) continue;
        if (cell.getAttribute("data-wb-host-hide") === "1") continue;
        cell.setAttribute("data-wb-host-hide", "1");
        marked.push(cell);
      }
    }
    scan();
    var obs = typeof MutationObserver !== "undefined" ? new MutationObserver(function() {
      scan();
    }) : null;
    if (obs) obs.observe(document.body, { childList: true, subtree: true });
    _wbHostHideCleanup = function() {
      if (obs) obs.disconnect();
      marked.forEach(function(el) {
        try {
          el.removeAttribute("data-wb-host-hide");
        } catch (e) {
        }
      });
      _wbHostHideCleanup = null;
    };
    return _wbHostHideCleanup;
  }
  function WbRemoteReviewPanel(props) {
    ensureCss();
    var reportStatus = props && props.reportStatus || null;
    var apiRef = props && props.apiRef || null;
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
      dataRoot: ""
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
      if (!s || s === WB_SECRET_MASK || /^•+$/.test(s)) return void 0;
      return s;
    }
    function loadConfig() {
      setStatus(true, "\u52A0\u8F7D\u4E2D\u2026", false);
      fetch(base() + "/api/config").then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error(x.d && x.d.detail || "\u65E0\u6CD5\u52A0\u8F7D\uFF1A\u8BF7\u5148\u542F\u7528\u300C\u8FDC\u7AEF\u5BA1\u7801\u300D\u63D2\u4EF6");
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
          dataRoot: c.dataRoot || ""
        });
        setStatus(false, "\u5DF2\u52A0\u8F7D\u8FDC\u7AEF\u5BA1\u7801\u914D\u7F6E\uFF08\u672C\u673A\uFF0C\u4E0D\u8FDB git\uFF09", true);
      }).catch(function(e) {
        setStatus(false, "\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)), false);
      });
    }
    function saveConfig() {
      setStatus(true, "\u4FDD\u5B58\u4E2D\u2026", false);
      if (!String(draft.feishuAppId || "").trim()) {
        setStatus(false, "\u4FDD\u5B58\u5931\u8D25\uFF1A\u8BF7\u586B\u5199\u98DE\u4E66 App ID", false);
        return;
      }
      if (!draft.feishuAppSecretConfigured && !secretForSave(draft.feishuAppSecret)) {
        setStatus(false, "\u4FDD\u5B58\u5931\u8D25\uFF1A\u8BF7\u586B\u5199\u98DE\u4E66 App Secret", false);
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
        feishuWikiParentNodeToken: draft.feishuWikiParentNodeToken
      };
      fetch(base() + "/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) throw new Error(x.d && x.d.detail || "\u4FDD\u5B58\u5931\u8D25");
        setStatus(false, (x.d.detail || "\u5DF2\u4FDD\u5B58") + (x.d.note ? "\uFF1B" + x.d.note : ""), true);
        loadConfig();
      }).catch(function(e) {
        setStatus(false, "\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)), false);
      });
    }
    function checkHealth() {
      setHealth("\u68C0\u6D4B\u4E2D\u2026");
      fetch(base() + "/health").then(function(r) {
        return r.json();
      }).then(function(d) {
        setHealth((d && d.ok ? "OK" : "FAIL") + " \xB7 " + (d && d.detail || JSON.stringify(d).slice(0, 120)));
      }).catch(function(e) {
        setHealth("\u65E0\u6CD5\u8FDE\u63A5 " + base() + "\uFF1A" + (e && e.message ? e.message : e));
      });
    }
    useEffect(function() {
      loadConfig();
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
      h("h3", null, "\u8FDC\u7AEF\u5BA1\u7801"),
      h(
        "div",
        { className: "body" },
        h(
          "p",
          { className: "wb-set-hint" },
          "Webhook \u89E6\u53D1\u540E\u8C03\u7528\u672C\u673A\u5BA1\u7801\u5E76\u5199\u98DE\u4E66\u3002\u914D\u7F6E\u843D\u672C\u673A ~/.zhongruan/remote-review\uFF0C\u4E0D\u8FDB\u4E1A\u52A1 git\uFF1B\u7528\u5E95\u90E8\u300C\u4FDD\u5B58\u914D\u7F6E\u300D\u3002"
        ),
        h(
          "div",
          { className: "wb-set-grid" },
          field("WorkBuddy \u5F15\u64CE\u5730\u5740", {
            value: draft.engine,
            onChange: function(e) {
              patch("engine", e.target.value);
            }
          }, true),
          field("\u98DE\u4E66 App ID", {
            value: draft.feishuAppId,
            onChange: function(e) {
              patch("feishuAppId", e.target.value);
            }
          }, true),
          field(draft.feishuAppSecretConfigured ? "\u98DE\u4E66 App Secret\uFF08\u5DF2\u4FDD\u5B58\uFF09" : "\u98DE\u4E66 App Secret", {
            type: "password",
            autoComplete: "new-password",
            value: draft.feishuAppSecret,
            onFocus: function() {
              if (draft.feishuAppSecret === WB_SECRET_MASK) patch("feishuAppSecret", "");
            },
            onChange: function(e) {
              patch("feishuAppSecret", e.target.value);
            }
          }, true),
          field("\u6587\u6863\u5E93 space_id", {
            value: draft.feishuWikiSpaceId,
            onChange: function(e) {
              patch("feishuWikiSpaceId", e.target.value);
            }
          }, true),
          field("Webhook \u76D1\u542C", {
            value: draft.listen,
            onChange: function(e) {
              patch("listen", e.target.value);
            }
          }),
          field("Webhook \u7AEF\u53E3", {
            value: draft.port,
            onChange: function(e) {
              patch("port", e.target.value);
            }
          }),
          field(draft.secretConfigured ? "Webhook \u5BC6\u94A5\uFF08\u5DF2\u4FDD\u5B58\uFF09" : "Webhook \u5BC6\u94A5\uFF08\u53EF\u9009\uFF09", {
            type: "password",
            autoComplete: "new-password",
            value: draft.secret,
            onFocus: function() {
              if (draft.secret === WB_SECRET_MASK) patch("secret", "");
            },
            onChange: function(e) {
              patch("secret", e.target.value);
            }
          }, true)
        ),
        h(
          "p",
          { className: "wb-set-hint" },
          "Webhook\uFF1A" + (draft.webhook || base() + "/webhook") + (draft.dataRoot ? " \xB7 " + draft.dataRoot : "")
        ),
        h(
          "div",
          { className: "wb-set-actions" },
          h(
            "button",
            { type: "button", className: "wb-set-btn", disabled: busy, onClick: checkHealth },
            "\u68C0\u6D4B\u670D\u52A1"
          ),
          !reportStatus && msg ? h("span", { className: "wb-set-msg" + (msgOk ? " ok" : " err") }, maskVendorUiText(msg)) : null
        ),
        health ? h("p", { className: "wb-set-hint" }, maskVendorUiText(health)) : null
      )
    );
  }
  function WbCursorCodingPanel(props) {
    ensureCss();
    var reportStatus = props && props.reportStatus || null;
    var apiRef = props && props.apiRef || null;
    var draftState = useState({
      port: "18788",
      cursorApiKey: "",
      cursorKeyConfigured: false,
      writeScopeText: ""
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
      } catch (e) {
      }
    }
    function loadConfig() {
      setStatus(true, "\u52A0\u8F7D\u4E2D\u2026", false);
      fetch(configUrl()).then(function(r) {
        return r.json();
      }).then(function(data) {
        if (!data || !data.ok) throw new Error(data && data.detail || "\u52A0\u8F7D\u5931\u8D25");
        var c = data.config || {};
        setDraft({
          port: String(c.port || 18788),
          cursorApiKey: c.cursorKeyConfigured ? WB_SECRET_MASK : "",
          cursorKeyConfigured: Boolean(c.cursorKeyConfigured),
          writeScopeText: c.writeScopeText || ""
        });
        remember();
        setStatus(false, "\u5DF2\u52A0\u8F7D\u516C\u5171\u6A21\u578B\u914D\u7F6E\uFF08\u672C\u673A\uFF0C\u4E0D\u8FDB git\uFF09", true);
      }).catch(function(err) {
        var msg2 = String(err && err.message ? err.message : err);
        if (/failed to fetch/i.test(msg2) || /networkerror/i.test(msg2) || /load failed/i.test(msg2)) {
          msg2 = "\u65E0\u6CD5\u8FDE\u63A5 WorkBuddy \u5F15\u64CE\u8BFB\u53D6\u516C\u5171\u6A21\u578B\u914D\u7F6E\u3002\u8BF7\u786E\u8BA4\u5F15\u64CE\u5DF2\u542F\u52A8\u3002";
        }
        setStatus(false, msg2, false);
      });
    }
    function saveConfig() {
      setStatus(true, "\u4FDD\u5B58\u4E2D\u2026", false);
      remember();
      var key = String(draft.cursorApiKey || "").trim();
      var body = {
        listen: "127.0.0.1",
        port: draft.port,
        writeScopeText: draft.writeScopeText
      };
      if (key && key !== WB_SECRET_MASK && !/^•+$/.test(key)) body.cursorApiKey = key;
      fetch(configUrl(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(out) {
        if (!out.d || !out.d.ok) throw new Error(out.d && out.d.detail || "\u4FDD\u5B58\u5931\u8D25");
        setStatus(false, out.d.detail || "\u5DF2\u4FDD\u5B58", true);
        loadConfig();
      }).catch(function(err) {
        var msg2 = String(err && err.message ? err.message : err);
        if (/failed to fetch/i.test(msg2) || /networkerror/i.test(msg2) || /load failed/i.test(msg2)) {
          msg2 = "\u65E0\u6CD5\u8FDE\u63A5 WorkBuddy \u5F15\u64CE\u4FDD\u5B58\u516C\u5171\u6A21\u578B Key\u3002\u8BF7\u786E\u8BA4\u5F15\u64CE\u5DF2\u542F\u52A8\u3002";
        }
        setStatus(false, msg2, false);
      });
    }
    useEffect(function() {
      loadConfig();
    }, []);
    if (apiRef) {
      apiRef.current = { save: saveConfig, load: loadConfig };
    }
    return h(
      "div",
      { className: "wb-set-card" },
      h("h3", null, "\u516C\u5171\u6A21\u578B"),
      h(
        "div",
        { className: "body" },
        h(
          "p",
          { className: "wb-set-hint" },
          "\u672C\u9875\u914D\u7F6E\u516C\u5171\u6A21\u578B API Key\uFF08\u4FDD\u5B58\u540E\u540C\u6B65\u5230\u5BF9\u8BDD\u5199\u7801\uFF09\u3002\u8BF7\u7528\u5E95\u90E8\u300C\u4FDD\u5B58\u914D\u7F6E\u300D\u3002"
        ),
        h(
          "div",
          { className: "wb-set-grid" },
          field("API Key", {
            type: "password",
            autoComplete: "new-password",
            value: draft.cursorApiKey,
            placeholder: draft.cursorKeyConfigured ? "\u5DF2\u914D\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u5B58\u5219\u4FDD\u6301\u4E0D\u53D8" : "\u5FC5\u586B",
            onChange: function(e) {
              setDraft(Object.assign({}, draft, { cursorApiKey: e.target.value }));
            }
          }, true)
        ),
        !reportStatus && msg ? h("p", { className: "wb-set-msg" + (msgOk ? " ok" : " err") }, maskVendorUiText(msg)) : null
      )
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
        timeout: 30
      },
      deepseek: llmApplySlice({ provider: "deepseek" }),
      vision: {
        api_key: "",
        base_url: "",
        model: ""
      },
      code_dev: {
        enabled: false,
        cursor_api_key: "",
        model: "composer-2.5",
        max_concurrent: 1,
        cursor_timeout_sec: 2700,
        default_workspace: ""
      },
      code_review: {
        enabled: true,
        max_files: 40,
        max_file_bytes: 12e4,
        max_total_bytes: 8e5,
        default_workspace: ""
      },
      code_commit: {
        enabled: true,
        default_workspace: "",
        work_branch: "",
        remote_name: "origin",
        default_push: true,
        use_skill_review: true,
        allow_blocked: false,
        max_files: 80
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
        health_timeout_sec: 8
      },
      automations: {
        wecom_webhook_key: "",
        wecom_push_enabled: false,
        wecom_push_dry_run: false,
        feishu_app_id: "",
        feishu_app_secret: "",
        feishu_bitable_enabled: false,
        feishu_bitable_dry_run: false
      }
    };
  }
  function patchDraft(setDraft, path, value) {
    setDraft(function(prev) {
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
      openai_compat: llmDefaultSlot("openai_compat")
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
      model: ds.model || ""
    };
    return by;
  }
  function llmApplySlice(ds) {
    var prov = llmNormalizeProvider(ds.provider);
    var by = Object.assign({}, llmDefaultByProvider());
    var rawBy = ds.by_provider;
    if (rawBy && typeof rawBy === "object") {
      ["deepseek", "ollama", "openai_compat"].forEach(function(name) {
        by[name] = Object.assign({}, llmDefaultSlot(name), rawBy[name] || {});
      });
    } else {
      var flat = {
        api_key: ds.api_key || "",
        base_url: ds.base_url || "",
        model: ds.model || ""
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
      model: slice.model
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
      model: active.model
    };
  }
  function fetchAbout() {
    return fetch(engineBase() + "/api/about", { headers: authHeaders() }).then(function(r) {
      return r.json().then(function(d) {
        return { http: r.status, data: d };
      });
    }).catch(function(e) {
      return { http: 0, data: { ok: false, detail: e && e.message || "\u7F51\u7EDC\u9519\u8BEF" } };
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
      fill: "none"
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
          strokeLinejoin: "round"
        }),
        h("circle", { cx: 10, cy: 10, r: 1.45, fill: "currentColor" })
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
          strokeWidth: stroke
        }),
        h("circle", {
          cx: 13.1,
          cy: 8.1,
          r: 1.9,
          stroke: "currentColor",
          strokeWidth: stroke
        }),
        h("path", {
          d: "M2.8 15.2c.55-2.35 2.35-3.55 4.4-3.55s3.85 1.2 4.4 3.55",
          stroke: "currentColor",
          strokeWidth: stroke,
          strokeLinecap: "round"
        }),
        h("path", {
          d: "M11.2 14.55c.35-1.45 1.45-2.25 2.85-2.25 1.55 0 2.7.95 3.1 2.45",
          stroke: "currentColor",
          strokeWidth: stroke,
          strokeLinecap: "round"
        })
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
          strokeLinecap: "round"
        }),
        h("circle", { cx: 10, cy: 14.15, r: 0.75, fill: "currentColor" })
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
          strokeLinejoin: "round"
        })
      );
    } else {
      glyph = h(
        "svg",
        svg,
        h("path", {
          d: "M4.35 3.55h5.35a1.1 1.1 0 0 1 1.1 1.1v10.7a1.1 1.1 0 0 1-1.1 1.1H4.35a1.1 1.1 0 0 1-1.1-1.1V4.65a1.1 1.1 0 0 1 1.1-1.1Z",
          stroke: "currentColor",
          strokeWidth: stroke,
          strokeLinejoin: "round"
        }),
        h("path", {
          d: "M9.15 10h6.75M14.85 8.05l1.75 1.95-1.75 1.95",
          stroke: "currentColor",
          strokeWidth: stroke,
          strokeLinecap: "round",
          strokeLinejoin: "round"
        })
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
    var updPhaseState = useState("");
    var updPhase = updPhaseState[0];
    var setUpdPhase = updPhaseState[1];
    var updPctState = useState(0);
    var updPct = updPctState[0];
    var setUpdPct = updPctState[1];
    var updUnsubRef = useRef(null);
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
      role: "user"
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
        role: sess.role || "user"
      });
      fetchEngineApi("/api/auth/me", { headers: authHeaders() }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok && d.authenticated && d.user) setUser(d.user);
        else if (d && d.ok === true && d.authenticated === false) setUser(null);
      }).catch(function() {
      });
    }
    function clearFeedbackImages(list) {
      (list || images || []).forEach(function(it) {
        try {
          if (it && it.url) URL.revokeObjectURL(it.url);
        } catch (e0) {
        }
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
        } catch (e0) {
        }
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
        role: "user"
      });
    }
    function findHostSettingsTrigger() {
      if (typeof document === "undefined") return null;
      var foot = document.querySelector("[class*='footArea']");
      if (foot) {
        var inFoot = foot.querySelector("button[aria-haspopup='dialog']");
        if (inFoot) return inFoot;
      }
      return document.querySelector("button[class*='_trigger'][aria-haspopup='dialog']") || document.querySelector("[class*='settingsArea'] button[aria-haspopup='dialog']");
    }
    function copyAccountId(text) {
      if (!text) return;
      function done() {
        setCopyHint("\u5DF2\u590D\u5236");
        window.setTimeout(function() {
          setCopyHint("");
        }, 1500);
      }
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function() {
          done();
        });
        return;
      }
      done();
    }
    function findOfficialAccountMenuButton() {
      if (typeof document === "undefined") return null;
      return document.querySelector("button[aria-haspopup='menu'][aria-label='\u8D26\u53F7\u83DC\u5355']") || document.querySelector("button[aria-haspopup='menu'][aria-label='Account menu']");
    }
    function clickOfficialSettingsItem() {
      if (typeof document === "undefined") return false;
      var nodes = document.querySelectorAll("[role='menuitem']");
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (el.closest && el.closest(".wb-header-logout, .wb-sidebar-account")) continue;
        var text = String(el.textContent || "").replace(/\s+/g, "");
        var official = (text.indexOf("\u8BBE\u7F6E") === 0 || text.indexOf("Settings") === 0) && (text.indexOf("Ctrl") >= 0 || text.indexOf("Alt") >= 0 || text.indexOf(",") >= 0);
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
      return String(role || "") === "admin" ? "\u7BA1\u7406\u5458" : "\u6210\u5458";
    }
    function peopleStatusLabel(row) {
      if (row && row.disabled) return "\u5DF2\u505C\u7528";
      if (row && row.must_change_password) return "\u5F85\u6539\u5BC6";
      return "\u6B63\u5E38";
    }
    function loadPeopleList() {
      setPeopleLoading(true);
      setPanelMsg("");
      peopleApi("/api/auth/users").then(function(res) {
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
          setPanelMsg(d && d.detail || "\u52A0\u8F7D\u4EBA\u5458\u5931\u8D25");
        }
      }).catch(function(e) {
        setPeopleList([]);
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
        setPeopleLoading(false);
      });
    }
    function openPeople() {
      if (String(user && user.role || "") !== "admin") return;
      setOpen(false);
      setPeopleFormOpen(false);
      setPeopleResetId("");
      setPeopleResetPw("");
      setPeopleForm({
        username: "",
        display_name: "",
        password: "",
        role: "user"
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
        headers,
        body: o.body ? JSON.stringify(o.body) : void 0
      }).then(function(r) {
        return r.json().catch(function() {
          return {};
        }).then(function(d) {
          var detail = d && d.detail;
          if (typeof detail !== "string") {
            detail = detail != null ? JSON.stringify(detail) : "";
          }
          if (r.status === 404 || /not\s*found/i.test(detail || "")) {
            detail = "\u5F15\u64CE\u8FD8\u6CA1\u6709\u4EBA\u5458\u548C\u89D2\u8272\u63A5\u53E3\uFF08\u591A\u4E3A\u672A\u91CD\u542F\uFF09\u3002\u8BF7\u5728\u672C\u673A\u6267\u884C\uFF1Apowershell -NoProfile -File scripts\\restart-web.ps1\uFF0C\u7136\u540E\u5237\u65B0\u9875\u9762\u518D\u8BD5\u3002";
          }
          return {
            http: r.status,
            data: Object.assign({}, d || {}, { detail: detail || d && d.detail })
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
        setPanelMsg("\u8BF7\u586B\u5199\u8D26\u53F7\u548C\u521D\u59CB\u5BC6\u7801");
        return;
      }
      setPanelBusy(true);
      setPanelMsg("");
      peopleApi("/api/auth/users", {
        method: "POST",
        body: {
          username,
          password,
          display_name,
          role
        }
      }).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleFormOpen(false);
          setPeopleForm({
            username: "",
            display_name: "",
            password: "",
            role: "user"
          });
          setPanelOk(true);
          setPanelMsg("\u5DF2\u65B0\u589E\u8D26\u53F7 " + username + "\uFF0C\u8BF7\u628A\u521D\u59CB\u5BC6\u7801\u8F6C\u544A\u5BF9\u65B9");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u65B0\u589E\u5931\u8D25");
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
        setPanelBusy(false);
      });
    }
    function patchPeopleRole(row, nextRole) {
      if (!row || !row.id) return;
      if (!window.confirm(
        "\u786E\u5B9A\u5C06\u300C" + (row.display_name || row.username) + "\u300D\u6539\u4E3A" + peopleRoleLabel(nextRole) + "\uFF1F"
      )) {
        return;
      }
      setPanelBusy(true);
      setPanelMsg("");
      peopleApi("/api/auth/users/" + encodeURIComponent(row.id), {
        method: "PATCH",
        body: { role: nextRole }
      }).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPanelOk(true);
          setPanelMsg("\u5DF2\u66F4\u65B0\u89D2\u8272");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u66F4\u65B0\u5931\u8D25");
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
        setPanelBusy(false);
      });
    }
    function togglePeopleDisabled(row) {
      if (!row || !row.id) return;
      var disable = !row.disabled;
      var tip = disable ? "\u786E\u5B9A\u505C\u7528\u300C" + (row.display_name || row.username) + "\u300D\uFF1F\u505C\u7528\u540E\u65E0\u6CD5\u767B\u5F55\u3002" : "\u786E\u5B9A\u542F\u7528\u300C" + (row.display_name || row.username) + "\u300D\uFF1F";
      if (!window.confirm(tip)) return;
      setPanelBusy(true);
      setPanelMsg("");
      var path = "/api/auth/users/" + encodeURIComponent(row.id) + (disable ? "/disable" : "/enable");
      peopleApi(path, { method: "POST" }).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPanelOk(true);
          setPanelMsg(disable ? "\u5DF2\u505C\u7528" : "\u5DF2\u542F\u7528");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u64CD\u4F5C\u5931\u8D25");
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
        setPanelBusy(false);
      });
    }
    function submitPeopleReset() {
      var uid = String(peopleResetId || "").trim();
      var pw = String(peopleResetPw || "");
      if (!uid || !pw) {
        setPanelOk(false);
        setPanelMsg("\u8BF7\u586B\u5199\u65B0\u5BC6\u7801");
        return;
      }
      setPanelBusy(true);
      setPanelMsg("");
      peopleApi("/api/auth/users/" + encodeURIComponent(uid) + "/reset-password", {
        method: "POST",
        body: { password: pw }
      }).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleResetId("");
          setPeopleResetPw("");
          setPanelOk(true);
          setPanelMsg("\u5DF2\u91CD\u7F6E\u53E3\u4EE4\uFF0C\u8BF7\u8F6C\u544A\u5BF9\u65B9\u5E76\u7528\u65B0\u5BC6\u7801\u767B\u5F55\u540E\u6539\u5BC6");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u91CD\u7F6E\u5931\u8D25");
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
        setPanelBusy(false);
      });
    }
    function peopleCapCatalogList() {
      if (peopleCapsCatalog && peopleCapsCatalog.length) return peopleCapsCatalog;
      return [
        { id: "mes-ask", label: "\u95EE\u6570" },
        { id: "mes-pcb", label: "PCB\u5DE5\u827A" },
        { id: "code-dev", label: "\u5199\u7801\uFF08Cursor \u5BF9\u8BDD\u5199\u7801\uFF09" },
        { id: "code-review", label: "\u5BA1\u7801" },
        { id: "code-commit", label: "\u63D0\u4EA4" },
        { id: "code-deploy", label: "\u90E8\u7F72" },
        { id: "dev-pipeline", label: "\u9700\u6C42\u5230\u4E0A\u7EBF" },
        { id: "vision", label: "\u89C6\u89C9\u8BC6\u56FE" },
        { id: "mes-config", label: "\u8FDE\u63A5\u914D\u7F6E" }
      ];
    }
    function peopleCapsFromRow(row) {
      var catalog = peopleCapCatalogList();
      var src = row && row.capabilities || {};
      var out = {};
      catalog.forEach(function(cap) {
        var fid = cap && (cap.id || cap.feature_id) || "";
        if (!fid) return;
        out[fid] = src[fid] !== false && src[fid] !== 0;
      });
      return out;
    }
    function peopleCkFromRow(row, docs) {
      var src = row && row.company_knowledge_access || {};
      var admin = String(row && row.role || "") === "admin";
      var list = Array.isArray(docs) ? docs : peopleCkDocs || [];
      var ids = {};
      if (admin || src.allow_all !== false) {
        list.forEach(function(d) {
          if (d && d.id) ids[d.id] = true;
        });
        return { allow_all: true, ids };
      }
      (src.entry_ids || []).forEach(function(id) {
        if (id) ids[String(id)] = true;
      });
      return { allow_all: false, ids };
    }
    function loadPeopleCkDocs(row) {
      setPeopleCkLoadErr("");
      peopleApi("/api/company-knowledge/entries?limit=100&status=active", { method: "GET" }).then(function(res) {
        var d = res.data || {};
        if (res.http < 200 || res.http >= 300 || d.ok === false) {
          setPeopleCkDocs([]);
          setPeopleCkLoadErr(
            d && d.detail || "\u8BFB\u53D6\u5171\u4EAB\u77E5\u8BC6\u5E93\u6587\u6863\u5931\u8D25\uFF08HTTP " + res.http + "\uFF09"
          );
          if (row) setPeopleCkDraft(peopleCkFromRow(row, []));
          setPeopleCkDirty(false);
          return;
        }
        var items = Array.isArray(d.items) ? d.items : [];
        var docs = items.map(function(it) {
          return {
            id: String(it && it.id || "").trim(),
            title: String(it && it.title || "").trim() || "\u672A\u547D\u540D"
          };
        }).filter(function(it) {
          return !!it.id;
        });
        setPeopleCkDocs(docs);
        setPeopleCkLoadErr("");
        if (row) setPeopleCkDraft(peopleCkFromRow(row, docs));
        setPeopleCkDirty(false);
      }).catch(function(e) {
        setPeopleCkDocs([]);
        setPeopleCkLoadErr(e && e.message || "\u7F51\u7EDC\u9519\u8BEF\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u5171\u4EAB\u77E5\u8BC6\u5E93\u6587\u6863");
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
      var allIds = (peopleCkDocs || []).map(function(d) {
        return d.id;
      });
      var allowAll = allIds.length > 0 && allIds.every(function(id) {
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
          body: allowAll ? { allow_all: true, entry_ids: [] } : { allow_all: false, entry_ids: entryIds }
        }
      ).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleCkDirty(false);
          if (d.user) setPeopleCkDraft(peopleCkFromRow(d.user, peopleCkDocs));
          setPanelOk(true);
          setPanelMsg("\u5DF2\u4FDD\u5B58\u300C" + who + "\u300D\u7684\u5171\u4EAB\u77E5\u8BC6\u5E93\u53EC\u56DE\u6743\u9650");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u4FDD\u5B58\u5171\u4EAB\u77E5\u8BC6\u5E93\u6743\u9650\u5931\u8D25");
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
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
        body: { caps: peopleCapsDraft }
      }).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleCapsDirty(false);
          if (d.user && d.user.capabilities) {
            setPeopleCapsDraft(peopleCapsFromRow(d.user));
          }
          setPanelOk(true);
          setPanelMsg("\u5DF2\u4FDD\u5B58\u300C" + who + "\u300D\u7684\u5F15\u64CE\u80FD\u529B");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u4FDD\u5B58\u80FD\u529B\u5931\u8D25");
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
        setPanelBusy(false);
      });
    }
    var PEOPLE_DATA_ITEMS = [
      { id: "purchase_unit_price", label: "\u7269\u6599\u91C7\u8D2D\u5355\u4EF7" },
      { id: "employee_salary", label: "\u5458\u5DE5\u5DE5\u8D44" }
    ];
    function peopleDataFromRow(row) {
      var src = row && row.data_access || {};
      var admin = String(row && row.role || "") === "admin";
      var out = {};
      PEOPLE_DATA_ITEMS.forEach(function(item) {
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
          employee_salary: !!peopleDataDraft.employee_salary
        }
      }).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          setPeopleDataDirty(false);
          if (d.user && d.user.data_access) {
            setPeopleDataDraft(peopleDataFromRow(d.user));
          }
          setPanelOk(true);
          setPanelMsg("\u5DF2\u4FDD\u5B58\u300C" + who + "\u300D\u7684\u6570\u636E\u8BBF\u95EE");
          loadPeopleList();
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u4FDD\u5B58\u6570\u636E\u8BBF\u95EE\u5931\u8D25");
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
      }).finally(function() {
        setPanelBusy(false);
      });
    }
    function peopleCapLabel(featureId) {
      var hit = peopleCapCatalogList().find(function(c) {
        return c && (c.id === featureId || c.feature_id === featureId);
      });
      return hit && hit.label || featureId;
    }
    function formatBytes(n) {
      var v = Number(n) || 0;
      if (v >= 1024 * 1024 * 1024) return (v / (1024 * 1024 * 1024)).toFixed(1) + " GB";
      if (v >= 1024 * 1024) return (v / (1024 * 1024)).toFixed(1) + " MB";
      if (v >= 1024) return (v / 1024).toFixed(1) + " KB";
      return v + " B";
    }
    function shanghaiDay() {
      try {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(/* @__PURE__ */ new Date());
      } catch (e) {
        var d = /* @__PURE__ */ new Date();
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
      var desk = typeof window !== "undefined" && window.workbuddyDesktop ? window.workbuddyDesktop : null;
      if (desk && typeof desk.onUpdateProgress === "function") {
        if (updUnsubRef.current) {
          try {
            updUnsubRef.current();
          } catch (e0) {
          }
        }
        updUnsubRef.current = desk.onUpdateProgress(function(p) {
          if (!p || p.phase !== "downloading") return;
          var total = Number(p.total) || 0;
          var received = Number(p.received) || 0;
          setUpdPct(total > 0 ? Math.min(100, Math.round(received * 100 / total)) : 0);
        });
      }
      var deskP = desk && typeof desk.checkUpdate === "function" ? Promise.resolve(desk.checkUpdate()).catch(function() {
        return null;
      }) : Promise.resolve(null);
      var verP = desk && typeof desk.getAppVersion === "function" ? Promise.resolve(desk.getAppVersion()).catch(function() {
        return null;
      }) : Promise.resolve(null);
      Promise.all([fetchAbout(), deskP, verP]).then(function(pair) {
        var aboutRes = pair[0] || {};
        var deskRes = pair[1];
        var verRes = pair[2];
        var d = aboutRes && aboutRes.data || {};
        var fallbackVer = verRes && verRes.ok && verRes.version ? String(verRes.version) : "";
        var desktop = null;
        if (deskRes && typeof deskRes === "object") {
          desktop = deskRes;
          if (!desktop.currentVersion && fallbackVer) {
            desktop = Object.assign({}, deskRes, { currentVersion: fallbackVer });
          }
        } else if (fallbackVer) {
          desktop = {
            ok: true,
            checked: true,
            currentVersion: fallbackVer,
            updateAvailable: false,
            latestVersion: fallbackVer,
            message: "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C\uFF08v" + fallbackVer + "\uFF09\u3002"
          };
        }
        var info = {
          ok: !!(d && d.ok),
          app_version: d && d.app_version || "",
          product: d && d.product || "ZR-WorkBuddy",
          desktop,
          detail: d && d.detail || ""
        };
        setAbout(info);
        if (info.desktop && info.desktop.phase === "downloading") setUpdPhase("downloading");
        else if (info.desktop && info.desktop.phase === "ready") {
          setUpdPhase("ready");
          setUpdPct(100);
        } else if (info.desktop && info.desktop.phase === "installing") setUpdPhase("installing");
        if (!info.ok && info.detail) {
          setPanelOk(false);
          setPanelMsg(info.detail);
        } else {
          var deskMsg = info.desktop && info.desktop.message ? String(info.desktop.message) : "";
          var deskChecked = !!(info.desktop && info.desktop.checked);
          var deskFailed = !!(info.desktop && info.desktop.checked === false && !info.desktop.updateAvailable && deskMsg && deskMsg.indexOf("\u5DF2\u662F\u6700\u65B0") < 0);
          var curVer = info.desktop && info.desktop.currentVersion || "";
          setPanelOk(!deskFailed);
          setPanelMsg(
            deskMsg || (info.desktop && info.desktop.updateAvailable ? "" : deskChecked ? "\u5F53\u524D\u5DF2\u662F\u6700\u65B0\u7248\u672C\uFF08v" + curVer + "\uFF09\u3002" : "")
          );
        }
      }).finally(function() {
        setPanelBusy(false);
      });
    }
    function startDownloadUpdate() {
      var desk = typeof window !== "undefined" && window.workbuddyDesktop ? window.workbuddyDesktop : null;
      if (!desk || typeof desk.downloadUpdate !== "function") return;
      setUpdPhase("downloading");
      setUpdPct(0);
      setPanelOk(true);
      setPanelMsg("\u6B63\u5728\u4E0B\u8F7D\u5B89\u88C5\u5305\uFF0C\u8BF7\u52FF\u5173\u95ED\u5E94\u7528\u2026");
      desk.downloadUpdate().then(function(r) {
        if (r && r.ok) {
          setUpdPhase("ready");
          setUpdPct(100);
          setPanelOk(true);
          setPanelMsg("\u4E0B\u8F7D\u5B8C\u6210\uFF0C\u6821\u9A8C\u901A\u8FC7\u3002\u70B9\u51FB\u300C\u9A6C\u4E0A\u5B89\u88C5\u300D\u5F00\u59CB\u5347\u7EA7\u3002");
        } else {
          setUpdPhase("");
          setPanelOk(false);
          setPanelMsg(r && r.message || "\u4E0B\u8F7D\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
        }
      }).catch(function(e) {
        setUpdPhase("");
        setPanelOk(false);
        setPanelMsg("\u4E0B\u8F7D\u5931\u8D25\uFF1A" + (e && e.message || e));
      });
    }
    function startInstallUpdate() {
      var desk = typeof window !== "undefined" && window.workbuddyDesktop ? window.workbuddyDesktop : null;
      if (!desk || typeof desk.installUpdate !== "function") return;
      setUpdPhase("installing");
      setPanelOk(true);
      setPanelMsg("\u6B63\u5728\u542F\u52A8\u5B89\u88C5\u2026\u672C\u5E94\u7528\u5373\u5C06\u9000\u51FA\u3002");
      desk.installUpdate().then(function(r) {
        if (r && r.ok) return;
        setUpdPhase("ready");
        setPanelOk(false);
        setPanelMsg(r && r.message || "\u542F\u52A8\u5B89\u88C5\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
      }).catch(function(e) {
        setUpdPhase("ready");
        setPanelOk(false);
        setPanelMsg("\u542F\u52A8\u5B89\u88C5\u5931\u8D25\uFF1A" + (e && e.message || e));
      });
    }
    function onPickImages(ev) {
      var files = ev && ev.target && ev.target.files ? Array.from(ev.target.files) : [];
      if (ev && ev.target) ev.target.value = "";
      if (!files.length) return;
      var next = images.slice();
      var err = "";
      files.forEach(function(f) {
        if (next.length >= 6) {
          err = "\u6700\u591A\u4E0A\u4F20 6 \u5F20\u56FE\u7247";
          return;
        }
        if (!f || !(f.type || "").startsWith("image/")) {
          err = "\u4EC5\u652F\u6301\u56FE\u7247\u6587\u4EF6";
          return;
        }
        if (f.size > 5 * 1024 * 1024) {
          err = "\u5355\u5F20\u56FE\u7247\u8BF7\u4E0D\u8D85\u8FC7 5MB";
          return;
        }
        next.push({
          id: String(Date.now()) + "-" + Math.random().toString(36).slice(2, 8),
          file: f,
          name: f.name || "image",
          url: URL.createObjectURL(f),
          broken: false
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
      images.forEach(function(it) {
        if (it.id === id) {
          try {
            if (it.url) URL.revokeObjectURL(it.url);
          } catch (e1) {
          }
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
        setPanelMsg("\u8BF7\u586B\u5199\u53CD\u9988\u5185\u5BB9");
        return;
      }
      if (text.length > 4e3) {
        setPanelOk(false);
        setPanelMsg("\u53CD\u9988\u5185\u5BB9\u8BF7\u63A7\u5236\u5728 4000 \u5B57\u4EE5\u5185");
        return;
      }
      setPanelBusy(true);
      setPanelMsg("");
      var fd = new FormData();
      fd.append("message", text);
      images.forEach(function(it) {
        if (it && it.file) fd.append("images", it.file, it.name || "image.png");
      });
      var headers = authHeaders();
      fetch(engineBase() + "/api/feedback", {
        method: "POST",
        headers,
        body: fd
      }).then(function(r) {
        return r.json().then(function(d) {
          return { http: r.status, data: d };
        });
      }).then(function(res) {
        var d = res.data || {};
        if (res.http >= 200 && res.http < 300 && d.ok) {
          clearFeedbackImages();
          setFeedback("");
          setImages([]);
          setPreviewImg(null);
          setPanelBusy(false);
          setPanelOk(true);
          setPanelMsg("\u63D0\u4EA4\u6210\u529F");
          setFeedbackDone(true);
          if (successCloseTimerRef.current) {
            clearTimeout(successCloseTimerRef.current);
          }
          successCloseTimerRef.current = setTimeout(function() {
            successCloseTimerRef.current = null;
            setPanel(null);
            setPanelMsg("");
            setPanelOk(false);
            setFeedbackDone(false);
          }, 2e3);
        } else {
          setPanelOk(false);
          setPanelMsg(d && d.detail || "\u63D0\u4EA4\u5931\u8D25");
          setPanelBusy(false);
        }
      }).catch(function(e) {
        setPanelOk(false);
        setPanelMsg(e && e.message || "\u7F51\u7EDC\u9519\u8BEF");
        setPanelBusy(false);
      });
    }
    useEffect(function() {
      refresh();
      function onAuth() {
        refresh();
      }
      window.addEventListener(AUTH_EVENT, onAuth);
      return function() {
        window.removeEventListener(AUTH_EVENT, onAuth);
      };
    }, []);
    useEffect(
      function() {
        if (!user) return void 0;
        var desk = typeof window !== "undefined" && window.workbuddyDesktop ? window.workbuddyDesktop : null;
        if (!desk || typeof desk.checkUpdate !== "function") return void 0;
        var day = shanghaiDay();
        var stored = null;
        try {
          stored = window.localStorage.getItem("wb-update-check-day");
        } catch (e0) {
          stored = null;
        }
        if (stored === day) return void 0;
        var cancelled = false;
        Promise.resolve(desk.checkUpdate()).then(function(r) {
          if (cancelled || !r || !r.ok || !r.checked) return;
          try {
            window.localStorage.setItem("wb-update-check-day", day);
          } catch (e1) {
          }
          if (r.updateAvailable) {
            setAutoUpd({
              currentVersion: r.currentVersion || "",
              latestVersion: r.latestVersion || ""
            });
          }
        }).catch(function() {
        });
        return function() {
          cancelled = true;
        };
      },
      [user]
    );
    useEffect(
      function() {
        if (!open && !panel && !previewImg && !autoUpd) return void 0;
        function onKey(ev) {
          if (ev.key !== "Escape") return;
          if (previewImg) setPreviewImg(null);
          else if (panel) closePanel();
          else if (autoUpd) setAutoUpd(null);
          else setOpen(false);
        }
        document.addEventListener("keydown", onKey);
        return function() {
          document.removeEventListener("keydown", onKey);
        };
      },
      [open, panel, previewImg, autoUpd]
    );
    useEffect(
      function() {
        if (!open) return void 0;
        function onDocPointer(ev) {
          var t = ev && ev.target;
          if (t && t.closest && t.closest(".wb-header-logout")) return;
          setOpen(false);
        }
        document.addEventListener("pointerdown", onDocPointer, true);
        return function() {
          document.removeEventListener("pointerdown", onDocPointer, true);
        };
      },
      [open]
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
          onClick
        },
        wbAccountMenuIcon(iconKind),
        h("span", { className: "wb-account-menu-label" }, text)
      );
    }
    var dialog = panel === "feedback" ? h(
      "div",
      {
        className: "wb-account-dialog-overlay",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "\u5E2E\u52A9\u4E0E\u53CD\u9988",
        onClick: closePanel
      },
      h(
        "div",
        {
          className: "wb-account-dialog feedback",
          onClick: function(ev) {
            ev.stopPropagation();
          }
        },
        h(
          "div",
          { className: "wb-account-dialog-head" },
          h("span", { className: "t" }, "\u5E2E\u52A9\u4E0E\u53CD\u9988"),
          h(
            "button",
            {
              type: "button",
              className: "wb-account-dialog-x",
              "aria-label": "\u5173\u95ED",
              onClick: closePanel
            },
            "\xD7"
          )
        ),
        h(
          "div",
          { className: "wb-account-dialog-body" },
          feedbackDone ? h(
            "div",
            { className: "wb-fb-success", role: "status", "aria-live": "polite" },
            h("div", { className: "ico", "aria-hidden": "true" }, "\u2713"),
            h("p", { className: "t" }, "\u63D0\u4EA4\u6210\u529F"),
            h("p", { className: "s" }, "\u611F\u8C22\u53CD\u9988\uFF0C\u7A97\u53E3\u5373\u5C06\u5173\u95ED\u2026")
          ) : h(
            React.Fragment,
            null,
            h(
              "p",
              { className: "hint" },
              "\u8BF7\u63CF\u8FF0\u73B0\u8C61\u3001\u590D\u73B0\u6B65\u9AA4\u4E0E\u671F\u671B\u7ED3\u679C\uFF1B\u53EF\u9644\u622A\u56FE\uFF08\u6700\u591A 6 \u5F20\uFF0C\u5355\u5F20 \u22645MB\uFF09\u3002\u8D44\u6599\u5E93\u3001\u7528\u91CF\u5728\u4F1A\u8BDD\u9876\u680F\u9875\u7B7E\u3002"
            ),
            h("textarea", {
              value: feedback,
              placeholder: "\u8BF7\u63CF\u8FF0\u4F60\u7684\u95EE\u9898\u6216\u5EFA\u8BAE\u2026",
              disabled: panelBusy,
              onChange: function(ev) {
                setFeedback(ev.target.value);
              }
            }),
            h(
              "div",
              { className: "wb-fb-images" },
              images.map(function(it) {
                return h(
                  "div",
                  {
                    key: it.id,
                    className: "wb-fb-thumb",
                    role: "button",
                    tabIndex: 0,
                    title: "\u70B9\u51FB\u9884\u89C8",
                    onClick: function() {
                      if (it.broken || !it.url) return;
                      setPreviewImg({ url: it.url, name: it.name || "\u622A\u56FE" });
                    },
                    onKeyDown: function(ev) {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        if (it.broken || !it.url) return;
                        setPreviewImg({ url: it.url, name: it.name || "\u622A\u56FE" });
                      }
                    }
                  },
                  it.broken ? h("div", { className: "wb-fb-broken" }, "\u65E0\u6CD5\u9884\u89C8\u6B64\u56FE") : h("img", {
                    src: it.url,
                    alt: it.name || "\u622A\u56FE",
                    onError: function() {
                      setImages(function(prev) {
                        return (prev || []).map(function(row) {
                          if (row.id !== it.id) return row;
                          return Object.assign({}, row, { broken: true });
                        });
                      });
                    }
                  }),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "rm",
                      title: "\u79FB\u9664",
                      "aria-label": "\u79FB\u9664\u56FE\u7247",
                      disabled: panelBusy,
                      onClick: function(ev) {
                        ev.stopPropagation();
                        removeImage(it.id);
                        if (previewImg && previewImg.url === it.url) setPreviewImg(null);
                      }
                    },
                    "\xD7"
                  )
                );
              }),
              images.length < 6 ? h(
                "label",
                {
                  className: "wb-fb-add",
                  title: "\u6DFB\u52A0\u56FE\u7247"
                },
                h("span", null, "+"),
                h("span", null, "\u56FE\u7247"),
                h("input", {
                  ref: fileInputRef,
                  type: "file",
                  accept: "image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp",
                  multiple: true,
                  disabled: panelBusy,
                  onChange: onPickImages
                })
              ) : null
            ),
            panelMsg ? h(
              "p",
              { className: "msg-banner " + (panelOk ? "ok" : "err") },
              panelMsg
            ) : null,
            h(
              "div",
              { className: "wb-account-dialog-actions" },
              h(
                "button",
                {
                  type: "button",
                  className: "btn",
                  disabled: panelBusy,
                  onClick: closePanel
                },
                "\u5173\u95ED"
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "btn primary",
                  disabled: panelBusy,
                  onClick: submitFeedback
                },
                panelBusy ? "\u63D0\u4EA4\u4E2D\u2026" : "\u63D0\u4EA4\u53CD\u9988"
              )
            )
          )
        )
      )
    ) : panel === "people" ? h(
      "div",
      {
        className: "wb-account-dialog-overlay",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "\u4EBA\u5458\u548C\u89D2\u8272",
        onClick: closePanel
      },
      h(
        "div",
        {
          className: "wb-account-dialog people",
          onClick: function(ev) {
            ev.stopPropagation();
          }
        },
        h(
          "div",
          { className: "wb-account-dialog-head" },
          h("span", { className: "t" }, "\u4EBA\u5458\u548C\u89D2\u8272"),
          h(
            "button",
            {
              type: "button",
              className: "wb-account-dialog-x",
              "aria-label": "\u5173\u95ED",
              onClick: closePanel
            },
            "\xD7"
          )
        ),
        h(
          "div",
          { className: "wb-account-dialog-body" },
          h(
            "p",
            { className: "hint" },
            "\u7BA1\u7406\u672C\u673A\u767B\u5F55\u8D26\u53F7\uFF1A\u65B0\u589E\u3001\u505C\u7528\u3001\u6539\u89D2\u8272\u3001\u91CD\u7F6E\u53E3\u4EE4\uFF1B\u70B9\u67D0\u4EBA\u300C\u80FD\u529B\u300D\u4F1A\u6807\u660E\u7EF4\u62A4\u8C01\uFF0C\u52FE\u9009\u540E\u70B9\u300C\u4FDD\u5B58\u80FD\u529B\u300D\u624D\u751F\u6548\uFF08\u9ED8\u8BA4\u5168\u5F00\uFF09\u3002\u81F3\u5C11\u4FDD\u7559\u4E00\u540D\u7BA1\u7406\u5458\u3002"
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
                onClick: function() {
                  setPeopleFormOpen(!peopleFormOpen);
                  setPeopleResetId("");
                  setPanelMsg("");
                }
              },
              peopleFormOpen ? "\u6536\u8D77\u8868\u5355" : "\u65B0\u589E\u4EBA\u5458"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-people-btn",
                disabled: panelBusy || peopleLoading,
                onClick: loadPeopleList
              },
              peopleLoading ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0"
            )
          ),
          peopleFormOpen ? h(
            "div",
            { className: "wb-people-form" },
            h("label", null, "\u8D26\u53F7", h("input", {
              value: peopleForm.username,
              autoComplete: "off",
              disabled: panelBusy,
              placeholder: "\u5B57\u6BCD\u5F00\u5934\uFF0C\u5982 zhangsan",
              onChange: function(ev) {
                setPeopleForm(Object.assign({}, peopleForm, {
                  username: ev.target.value
                }));
              }
            })),
            h("label", null, "\u663E\u793A\u540D", h("input", {
              value: peopleForm.display_name,
              autoComplete: "off",
              disabled: panelBusy,
              placeholder: "\u53EF\u9009",
              onChange: function(ev) {
                setPeopleForm(Object.assign({}, peopleForm, {
                  display_name: ev.target.value
                }));
              }
            })),
            h("label", null, "\u521D\u59CB\u5BC6\u7801", h("input", {
              type: "password",
              value: peopleForm.password,
              autoComplete: "new-password",
              disabled: panelBusy,
              placeholder: "\u81F3\u5C11 8 \u4F4D",
              onChange: function(ev) {
                setPeopleForm(Object.assign({}, peopleForm, {
                  password: ev.target.value
                }));
              }
            })),
            h("label", null, "\u89D2\u8272", h("select", {
              value: peopleForm.role,
              disabled: panelBusy,
              onChange: function(ev) {
                setPeopleForm(Object.assign({}, peopleForm, {
                  role: ev.target.value
                }));
              }
            }, h("option", { value: "user" }, "\u6210\u5458"), h("option", { value: "admin" }, "\u7BA1\u7406\u5458"))),
            h(
              "button",
              {
                type: "button",
                className: "wb-people-btn primary",
                disabled: panelBusy,
                onClick: submitPeopleCreate
              },
              panelBusy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58"
            )
          ) : null,
          peopleResetId ? h(
            "div",
            { className: "wb-people-form" },
            h(
              "p",
              { className: "hint" },
              "\u4E3A\u9009\u4E2D\u8D26\u53F7\u8BBE\u7F6E\u65B0\u5BC6\u7801\uFF08\u81F3\u5C11 8 \u4F4D\uFF09\uFF0C\u5BF9\u65B9\u767B\u5F55\u540E\u987B\u6539\u5BC6\u3002"
            ),
            h("label", null, "\u65B0\u5BC6\u7801", h("input", {
              type: "password",
              value: peopleResetPw,
              autoComplete: "new-password",
              disabled: panelBusy,
              onChange: function(ev) {
                setPeopleResetPw(ev.target.value);
              }
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
                  onClick: submitPeopleReset
                },
                "\u786E\u8BA4\u91CD\u7F6E"
              ),
              h(
                "button",
                {
                  type: "button",
                  className: "wb-people-btn",
                  disabled: panelBusy,
                  onClick: function() {
                    setPeopleResetId("");
                    setPeopleResetPw("");
                  }
                },
                "\u53D6\u6D88"
              )
            )
          ) : null,
          panelMsg ? h(
            "p",
            { className: panelOk ? "hint" : "err" },
            panelMsg
          ) : null,
          h(
            "div",
            { className: "wb-people-table-wrap" },
            peopleLoading && !peopleList.length ? h("p", { className: "hint" }, "\u52A0\u8F7D\u4E2D\u2026") : h(
              "table",
              { className: "wb-people-table" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", null, "\u663E\u793A\u540D"),
                  h("th", null, "\u8D26\u53F7"),
                  h("th", null, "\u89D2\u8272"),
                  h("th", null, "\u72B6\u6001"),
                  h("th", null, "\u64CD\u4F5C")
                )
              ),
              h(
                "tbody",
                null,
                (peopleList || []).map(function(row) {
                  var isAdminRole = String(row.role || "") === "admin";
                  var capsOpen = peopleCapsUserId && peopleCapsUserId === row.id;
                  var capsMap = capsOpen && peopleCapsDraft ? peopleCapsDraft : peopleCapsFromRow(row);
                  var dataMap = capsOpen && peopleDataDraft ? peopleDataDraft : peopleDataFromRow(row);
                  var catalog = peopleCapCatalogList();
                  var whoName = row.display_name || row.username || "\u2014";
                  var whoAccount = row.username || row.id || "";
                  return h(
                    React.Fragment,
                    { key: row.id || row.username },
                    h(
                      "tr",
                      {
                        className: (row.disabled ? "is-disabled " : "") + (capsOpen ? "is-caps-open" : "")
                      },
                      h("td", null, row.display_name || "\u2014"),
                      h("td", null, row.username || "\u2014"),
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
                            onClick: function() {
                              openPeopleCaps(row);
                            }
                          },
                          capsOpen ? "\u6536\u8D77\u80FD\u529B" : "\u80FD\u529B"
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "wb-people-link",
                            disabled: panelBusy,
                            onClick: function() {
                              patchPeopleRole(
                                row,
                                isAdminRole ? "user" : "admin"
                              );
                            }
                          },
                          isAdminRole ? "\u6539\u4E3A\u6210\u5458" : "\u6539\u4E3A\u7BA1\u7406\u5458"
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "wb-people-link",
                            disabled: panelBusy,
                            onClick: function() {
                              togglePeopleDisabled(row);
                            }
                          },
                          row.disabled ? "\u542F\u7528" : "\u505C\u7528"
                        ),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "wb-people-link",
                            disabled: panelBusy || !!row.disabled,
                            onClick: function() {
                              setPeopleFormOpen(false);
                              setPeopleCapsUserId("");
                              setPeopleCapsDraft(null);
                              setPeopleCapsDirty(false);
                              setPeopleDataDraft(null);
                              setPeopleDataDirty(false);
                              setPeopleResetId(row.id || "");
                              setPeopleResetPw("");
                              setPanelMsg("");
                            }
                          },
                          "\u91CD\u7F6E\u53E3\u4EE4"
                        )
                      )
                    ),
                    capsOpen ? h(
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
                                "\u6B63\u5728\u7EF4\u62A4\uFF1A" + whoName + "\uFF08" + whoAccount + "\uFF09\u7684\u5F15\u64CE\u80FD\u529B"
                              ),
                              peopleCapsDirty ? h(
                                "span",
                                { className: "wb-people-caps-dirty" },
                                "\u672A\u4FDD\u5B58"
                              ) : null
                            ),
                            h(
                              "button",
                              {
                                type: "button",
                                className: "wb-people-btn primary",
                                disabled: panelBusy || !!row.disabled || !peopleCapsDirty,
                                onClick: function() {
                                  savePeopleCapabilities(row);
                                }
                              },
                              panelBusy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u80FD\u529B"
                            )
                          ),
                          h(
                            "p",
                            { className: "hint" },
                            "\u52FE\u9009\u53EA\u6539\u8349\u7A3F\uFF0C\u70B9\u53F3\u4E0A\u300C\u4FDD\u5B58\u80FD\u529B\u300D\u540E\u751F\u6548\u3002\u5173\u6389\u540E\u8BE5\u8D26\u53F7\u4E0D\u53EF\u7528\u5BF9\u5E94\u529F\u80FD\uFF1B\u5168\u5C40\u529F\u80FD\u63D2\u4EF6\u505C\u7528\u65F6\u4ECD\u5168\u5458\u4E0D\u53EF\u7528\u3002"
                          ),
                          h(
                            "div",
                            { className: "wb-people-caps-grid" },
                            catalog.map(function(cap) {
                              var fid = cap && (cap.id || cap.feature_id) || "";
                              var on = !!capsMap[fid];
                              return h(
                                "label",
                                {
                                  key: fid,
                                  className: "wb-people-cap-sw" + (on ? " is-on" : " is-off")
                                },
                                h("input", {
                                  type: "checkbox",
                                  checked: on,
                                  disabled: panelBusy || !!row.disabled,
                                  onChange: function(ev) {
                                    draftPeopleCapability(
                                      fid,
                                      !!ev.target.checked
                                    );
                                  }
                                }),
                                h(
                                  "span",
                                  null,
                                  cap && cap.label || fid
                                )
                              );
                            })
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
                                "\u6570\u636E\u8BBF\u95EE"
                              ),
                              peopleDataDirty ? h(
                                "span",
                                { className: "wb-people-caps-dirty" },
                                "\u672A\u4FDD\u5B58"
                              ) : null
                            ),
                            isAdminRole ? null : h(
                              "button",
                              {
                                type: "button",
                                className: "wb-people-btn primary",
                                disabled: panelBusy || !!row.disabled || !peopleDataDirty,
                                onClick: function() {
                                  savePeopleDataAccess(row);
                                }
                              },
                              panelBusy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u6570\u636E\u6743\u9650"
                            )
                          ),
                          h(
                            "p",
                            { className: "hint" },
                            isAdminRole ? "\u7BA1\u7406\u5458\u9ED8\u8BA4\u62E5\u6709\u7269\u6599\u91C7\u8D2D\u5355\u4EF7\u548C\u5458\u5DE5\u5DE5\u8D44\u7684\u8BBF\u95EE\u6743\u9650\u3002" : "\u6210\u5458\u9ED8\u8BA4\u4E0D\u80FD\u67E5\u770B\u3002\u52FE\u9009\u540E\u70B9\u300C\u4FDD\u5B58\u6570\u636E\u6743\u9650\u300D\u751F\u6548\u3002\u672A\u63A5\u5165\u7684\u9879\u95EE\u6570\u4F1A\u8BF4\u660E\u5C1A\u672A\u63A5\u5165\uFF0C\u4E0D\u5F71\u54CD\u4EA7\u91CF\u3001\u5DE5\u5355\u7B49\u5176\u5B83\u67E5\u8BE2\u3002"
                          ),
                          h(
                            "div",
                            { className: "wb-people-caps-grid" },
                            PEOPLE_DATA_ITEMS.map(function(item) {
                              var on = !!dataMap[item.id];
                              return h(
                                "label",
                                {
                                  key: item.id,
                                  className: "wb-people-cap-sw" + (on ? " is-on" : " is-off") + (isAdminRole ? " is-locked" : "")
                                },
                                h("input", {
                                  type: "checkbox",
                                  checked: !!(on || isAdminRole),
                                  disabled: !isAdminRole && (panelBusy || !!row.disabled),
                                  onChange: function(ev) {
                                    if (isAdminRole) {
                                      ev.target.checked = true;
                                      return;
                                    }
                                    draftPeopleData(
                                      item.id,
                                      !!ev.target.checked
                                    );
                                  }
                                }),
                                h("span", null, item.label)
                              );
                            })
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
                                "\u5171\u4EAB\u77E5\u8BC6\u5E93\u53EC\u56DE"
                              ),
                              peopleCkDirty ? h(
                                "span",
                                { className: "wb-people-caps-dirty" },
                                "\u672A\u4FDD\u5B58"
                              ) : null
                            ),
                            isAdminRole ? null : h(
                              "button",
                              {
                                type: "button",
                                className: "wb-people-btn primary",
                                disabled: panelBusy || !!row.disabled || !peopleCkDirty || !peopleCkDraft,
                                onClick: function() {
                                  savePeopleCkAccess(row);
                                }
                              },
                              panelBusy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u77E5\u8BC6\u5E93\u6743\u9650"
                            )
                          ),
                          h(
                            "p",
                            { className: "hint" },
                            isAdminRole ? "\u7BA1\u7406\u5458\u9ED8\u8BA4\u53EF\u53EC\u56DE\u5168\u90E8\u5171\u4EAB\u77E5\u8BC6\u5E93\u6587\u6863\u3002" : "\u53EA\u7BA1\u63A7\u516C\u53F8\u5171\u4EAB\u77E5\u8BC6\u5E93\u3002\u52FE\u9009\u7684\u6587\u6863\u53EF\u88AB\u804A\u5929\u53EC\u56DE\uFF1B\u672A\u52FE\u9009\u7684\u6587\u6863\u5BF9\u8BE5\u6210\u5458\u4E0D\u53EF\u53EC\u56DE\u3002\u672C\u673A\u77E5\u8BC6\u5E93\u4E0D\u53D7\u5F71\u54CD\u3002\u9ED8\u8BA4\u5168\u9009\u3002"
                          ),
                          peopleCkLoadErr ? h(
                            "p",
                            { className: "hint", style: { color: "#b42318" } },
                            peopleCkLoadErr
                          ) : !peopleCkDraft ? h("p", { className: "hint" }, "\u6B63\u5728\u52A0\u8F7D\u5171\u4EAB\u6587\u6863\u2026") : (peopleCkDocs || []).length === 0 ? h(
                            "p",
                            { className: "hint" },
                            "\u5171\u4EAB\u77E5\u8BC6\u5E93\u5F53\u524D\u6CA1\u6709\u53EF\u52FE\u9009\u7684\u6D3B\u8DC3\u6587\u6863\u3002\u8BF7\u5148\u5728\u77E5\u8BC6\u6587\u6863\u4FA7\u680F\u300C\u5171\u4EAB\u77E5\u8BC6\u5E93\u300D\u65B0\u5EFA\u6216\u5BFC\u5165\uFF0C\u518D\u56DE\u5230\u8FD9\u91CC\u52FE\u9009\u3002"
                          ) : h(
                            "div",
                            { className: "wb-people-caps-grid" },
                            (peopleCkDocs || []).map(function(doc) {
                              var on = isAdminRole || !!(peopleCkDraft && peopleCkDraft.ids && peopleCkDraft.ids[doc.id]);
                              return h(
                                "label",
                                {
                                  key: doc.id,
                                  className: "wb-people-cap-sw" + (on ? " is-on" : " is-off") + (isAdminRole ? " is-locked" : ""),
                                  title: doc.title
                                },
                                h("input", {
                                  type: "checkbox",
                                  checked: !!on,
                                  disabled: isAdminRole || panelBusy || !!row.disabled,
                                  onChange: function(ev) {
                                    if (isAdminRole) {
                                      ev.target.checked = true;
                                      return;
                                    }
                                    draftPeopleCk(
                                      doc.id,
                                      !!ev.target.checked
                                    );
                                  }
                                }),
                                h("span", null, doc.title)
                              );
                            })
                          )
                        )
                      )
                    ) : null
                  );
                })
              )
            )
          )
        )
      )
    ) : panel === "update" ? h(
      "div",
      {
        className: "wb-account-dialog-overlay",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "\u68C0\u67E5\u66F4\u65B0",
        onClick: closePanel
      },
      h(
        "div",
        {
          className: "wb-account-dialog",
          onClick: function(ev) {
            ev.stopPropagation();
          }
        },
        h(
          "div",
          { className: "wb-account-dialog-head" },
          h("span", { className: "t" }, "\u68C0\u67E5\u66F4\u65B0"),
          h(
            "button",
            {
              type: "button",
              className: "wb-account-dialog-x",
              "aria-label": "\u5173\u95ED",
              onClick: closePanel
            },
            "\xD7"
          )
        ),
        h(
          "div",
          { className: "wb-account-dialog-body" },
          panelBusy ? h("p", { className: "hint" }, "\u6B63\u5728\u68C0\u67E5\u2026") : h(
            React.Fragment,
            null,
            // 用户只看安装包版本号：桌面壳显信息表（当前/最新/安装包/大小/发布日期/说明）；
            // 浏览器/开发壳没有安装包号，不显产品号，只给提示（引擎号放括号里备查）
            about && about.desktop && about.desktop.currentVersion ? h(
              "div",
              { className: "wb-upd-info" },
              [
                ["\u5F53\u524D\u7248\u672C", about.desktop.currentVersion],
                about.desktop.updateAvailable ? ["\u6700\u65B0\u7248\u672C", about.desktop.latestVersion || ""] : null,
                about.desktop.updateAvailable && about.desktop.file ? ["\u5B89\u88C5\u5305", about.desktop.file] : null,
                about.desktop.updateAvailable && about.desktop.size ? ["\u5927\u5C0F", formatBytes(about.desktop.size)] : null,
                about.desktop.updateAvailable && about.desktop.publishedAt ? ["\u53D1\u5E03\u65E5\u671F", about.desktop.publishedAt] : null,
                about.desktop.updateAvailable && about.desktop.notes ? ["\u66F4\u65B0\u8BF4\u660E", about.desktop.notes] : null
              ].filter(Boolean).map(function(r) {
                return h(
                  "p",
                  { key: r[0], className: "wb-upd-row" },
                  h("span", { className: "k" }, r[0] + "\uFF1A"),
                  String(r[1])
                );
              })
            ) : h(
              "p",
              { className: "hint" },
              "\u5F53\u524D\u4E3A\u6D4F\u89C8\u5668/\u5F00\u53D1\u58F3" + (about && about.app_version ? "\uFF08\u5F15\u64CE v" + about.app_version + "\uFF0C\u4EC5\u5F00\u53D1\u7528\uFF09" : "") + "\uFF1B\u684C\u9762\u4E00\u4F53\u5305\u8BF7\u5728\u5E94\u7528\u5185\u300C\u68C0\u67E5\u66F4\u65B0\u300D\uFF0C\u7248\u672C\u4EE5\u5B89\u88C5\u5305\u53F7\u4E3A\u51C6\u3002"
            ),
            about && about.desktop && about.desktop.updateAvailable ? h(
              React.Fragment,
              null,
              updPhase === "downloading" ? h(
                "div",
                {
                  style: {
                    margin: "10px 0 2px",
                    height: "8px",
                    borderRadius: "4px",
                    background: "rgba(127,127,127,.25)",
                    overflow: "hidden"
                  }
                },
                h("div", {
                  style: {
                    width: updPct + "%",
                    height: "100%",
                    background: "#22c55e",
                    transition: "width .2s"
                  }
                })
              ) : null,
              updPhase !== "downloading" ? h(
                "p",
                { className: "hint" },
                "\u4E0B\u8F7D\u5B8C\u6210\u540E\u9700\u4F60\u786E\u8BA4\u624D\u4F1A\u542F\u52A8\u5B89\u88C5\u5305\uFF1B\u5B89\u88C5\u671F\u95F4\u4F1A\u5173\u95ED\u672C\u5E94\u7528\u3002"
              ) : null
            ) : null,
            panelMsg ? h(
              "p",
              { className: panelOk ? "hint" : "err" },
              panelMsg
            ) : null
          ),
          h(
            "div",
            { className: "wb-account-dialog-actions" },
            about && about.desktop && about.desktop.updateAvailable && !panelBusy ? [
              !updPhase ? h(
                "button",
                {
                  key: "dl",
                  type: "button",
                  className: "btn primary",
                  onClick: startDownloadUpdate
                },
                "\u4E0B\u8F7D\u5E76\u5B89\u88C5"
              ) : null,
              updPhase === "downloading" ? h(
                "button",
                {
                  key: "dl-ing",
                  type: "button",
                  className: "btn primary",
                  disabled: true
                },
                "\u4E0B\u8F7D\u4E2D\u2026 " + updPct + "%"
              ) : null,
              updPhase === "ready" ? h(
                "button",
                {
                  key: "inst",
                  type: "button",
                  className: "btn primary",
                  onClick: startInstallUpdate
                },
                "\u9A6C\u4E0A\u5B89\u88C5"
              ) : null,
              updPhase === "installing" ? h(
                "button",
                {
                  key: "inst-ing",
                  type: "button",
                  className: "btn primary",
                  disabled: true
                },
                "\u6B63\u5728\u542F\u52A8\u5B89\u88C5\u2026"
              ) : null
            ] : null,
            h(
              "button",
              {
                type: "button",
                className: about && about.desktop && about.desktop.updateAvailable ? "btn" : "btn primary",
                disabled: panelBusy || updPhase === "installing",
                onClick: closePanel
              },
              updPhase === "downloading" ? "\u540E\u53F0\u4E0B\u8F7D" : about && about.desktop && about.desktop.updateAvailable ? "\u7A0D\u540E" : "\u77E5\u9053\u4E86"
            )
          )
        )
      )
    ) : null;
    return h(
      React.Fragment,
      null,
      h(
        "div",
        {
          className: "wb-header-logout wb-sidebar-account" + (open ? " open" : "") + (wide ? "" : " rail")
        },
        h(
          "button",
          {
            type: "button",
            className: "trigger",
            "aria-haspopup": "menu",
            "aria-expanded": open,
            title: "\u8D26\u53F7",
            onClick: function() {
              setOpen(!open);
            }
          },
          h("span", { className: "avatar", "aria-hidden": "true" }, initial),
          h("span", { className: "name" }, accountId || label)
        ),
        open ? h(
          "div",
          { className: "menu wb-account-menu", role: "menu" },
          h(
            "div",
            { className: "wb-account-menu-head" },
            h("span", { className: "wb-account-menu-id" }, accountId || "\u2014"),
            h(
              "button",
              {
                type: "button",
                className: "wb-account-menu-copy",
                "aria-label": copyHint || "\u590D\u5236\u8D26\u53F7",
                title: copyHint || "\u590D\u5236",
                onClick: function() {
                  copyAccountId(accountId);
                }
              },
              h(
                "svg",
                {
                  width: 18,
                  height: 18,
                  viewBox: "0 0 18 18",
                  fill: "none",
                  "aria-hidden": "true"
                },
                h("rect", {
                  x: 6,
                  y: 6,
                  width: 9,
                  height: 9,
                  rx: 1.5,
                  stroke: "currentColor",
                  strokeWidth: "1.3"
                }),
                h("path", {
                  d: "M5 12H4a1.5 1.5 0 0 1-1.5-1.5V4A1.5 1.5 0 0 1 4 2.5h6.5A1.5 1.5 0 0 1 12 4v1",
                  stroke: "currentColor",
                  strokeWidth: "1.3",
                  strokeLinecap: "round"
                })
              )
            )
          ),
          h(
            "div",
            { className: "wb-account-menu-body" },
            accountMenuRow("\u8BBE\u7F6E", "settings", openHostSettings),
            String(user && user.role || "") === "admin" ? accountMenuRow("\u4EBA\u5458\u548C\u89D2\u8272", "people", openPeople) : null,
            accountMenuRow("\u5E2E\u52A9\u4E0E\u53CD\u9988", "help", openFeedback),
            h("div", { className: "wb-account-menu-line", role: "separator" }),
            accountMenuRow("\u68C0\u67E5\u66F4\u65B0", "update", openUpdate),
            h("div", { className: "wb-account-menu-line", role: "separator" }),
            h(
              "button",
              {
                type: "button",
                className: "menu-logout wb-account-menu-logout",
                role: "menuitem",
                disabled: busy,
                onClick: function() {
                  setBusy(true);
                  doAppLogout().finally(function() {
                    setBusy(false);
                    setOpen(false);
                  });
                }
              },
              wbAccountMenuIcon("logout"),
              h("span", { className: "wb-account-menu-label" }, busy ? "\u9000\u51FA\u4E2D\u2026" : "\u9000\u51FA\u767B\u5F55")
            )
          )
        ) : null
      ),
      dialog,
      // 每日首启自动检查命中新版本：左下角轻量提醒（无遮罩、无更新日志）；「升级」接完整升级面板
      autoUpd && !panel && !open ? h(
        "div",
        { className: "wb-upd-toast", role: "status", "aria-label": "\u53D1\u73B0\u65B0\u7248\u672C" },
        h(
          "button",
          {
            type: "button",
            className: "wb-upd-toast-close",
            "aria-label": "\u5173\u95ED",
            onClick: function() {
              setAutoUpd(null);
            }
          },
          "\xD7"
        ),
        h(
          "div",
          { className: "wb-upd-toast-title" },
          h("span", { className: "wb-upd-toast-dot" }),
          "\u53D1\u73B0\u65B0\u7248\u672C v" + (autoUpd.latestVersion || "")
        ),
        h(
          "div",
          { className: "wb-upd-toast-msg" },
          "\u5F53\u524D\u7248\u672C v" + (autoUpd.currentVersion || "") + "\uFF0C\u5EFA\u8BAE\u66F4\u65B0\u540E\u7EE7\u7EED\u4F7F\u7528\u3002"
        ),
        h(
          "div",
          { className: "wb-upd-toast-actions" },
          h(
            "button",
            {
              type: "button",
              className: "wb-upd-toast-btn",
              onClick: function() {
                setAutoUpd(null);
              }
            },
            "\u7A0D\u540E"
          ),
          h(
            "button",
            {
              type: "button",
              className: "wb-upd-toast-btn primary",
              onClick: function() {
                setAutoUpd(null);
                openUpdate();
              }
            },
            "\u5347\u7EA7"
          )
        )
      ) : null,
      previewImg ? h(
        "div",
        {
          className: "wb-fb-lightbox",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "\u56FE\u7247\u9884\u89C8",
          onClick: function() {
            setPreviewImg(null);
          }
        },
        h(
          "div",
          {
            className: "wb-fb-lightbox-inner",
            onClick: function(ev) {
              ev.stopPropagation();
            }
          },
          h(
            "button",
            {
              type: "button",
              className: "wb-fb-lightbox-x",
              "aria-label": "\u5173\u95ED\u9884\u89C8",
              onClick: function() {
                setPreviewImg(null);
              }
            },
            "\xD7"
          ),
          h("img", {
            src: previewImg.url,
            alt: previewImg.name || "\u9884\u89C8"
          }),
          previewImg.name ? h("p", { className: "wb-fb-lightbox-cap" }, previewImg.name) : null
        )
      ) : null
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
    var dshWsOptsState = useState([]);
    var dshWsOpts = dshWsOptsState[0];
    var setDshWsOpts = dshWsOptsState[1];
    var SET_NAV = [
      { id: "branding", label: "\u5E94\u7528\u914D\u7F6E" },
      { id: "mes", label: "MES \u8FDE\u63A5" },
      { id: "llm", label: "\u5546\u7528\u6A21\u578B" },
      { id: "remote_review", label: "\u8FDC\u7AEF\u5BA1\u7801" },
      { id: "cursor_coding", label: "\u516C\u5171\u6A21\u578B" },
      { id: "automations", label: "\u81EA\u52A8\u5316\u63A8\u9001" }
    ];
    function applyEngineEndpoint() {
      try {
        localStorage.setItem("dsh-mes-engine-host", String(engineHost() || "127.0.0.1").trim());
        localStorage.setItem("dsh-mes-engine-port", String(enginePort() || "8000").trim());
      } catch (e) {
      }
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
        automations: Object.assign({}, base.automations, c.automations || {})
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
        items: Array.isArray(mc.items) ? mc.items : []
      });
      if (okMsg != null) {
        setMsg(okMsg);
        setMsgOk(true);
      }
    }
    function loadConfig() {
      setBusy(true);
      setMsg("\u52A0\u8F7D\u4E2D\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      fetch(engineBase() + "/api/config").then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u5F15\u64CE\u672A\u54CD\u5E94");
        }
        applyConfigPayload(x.d.config, x.d.api_docs_sync, "\u5DF2\u4ECE\u5F15\u64CE\u52A0\u8F7D");
      }).catch(function(e) {
        setMsg("\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)) + "\uFF08\u8BF7\u5148 scripts/engine.sh zr-workbuddy ensure\uFF09");
        setMsgOk(false);
      }).finally(function() {
        setBusy(false);
      });
    }
    function guessBindWorkspace() {
      try {
        var cd = draft && draft.code_dev && draft.code_dev.default_workspace || "";
        if (String(cd).trim()) return String(cd).trim();
      } catch (e0) {
      }
      try {
        var d = window.workbuddyDesktop && window.workbuddyDesktop.workspace;
        if (d) return String(d).trim();
      } catch (e1) {
      }
      return "";
    }
    function readHostCtx() {
      try {
        return ctx && ctx._wbClientCtx || typeof window !== "undefined" && window.__wbClientCtx || null;
      } catch (e) {
        return null;
      }
    }
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
        var wsSvc = host && host.workspaces || (host && typeof host.get === "function" ? host.get("workspaces") : null);
        if (wsSvc && wsSvc.list && typeof wsSvc.list.getSnapshot === "function") {
          var snap = wsSvc.list.getSnapshot() || {};
          var items = Array.isArray(snap.items) ? snap.items : [];
          items.forEach(function(it) {
            if (it) push(it.path, it.title);
          });
        }
        if (!out.length && host && typeof host.get === "function") {
          var conn = host.get("connection");
          var api = conn && conn.api;
          if (api && api.workspace && typeof api.workspace.list === "function") {
          }
        }
      } catch (eReg) {
      }
      return out;
    }
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
      (Array.isArray(dshWsOpts) ? dshWsOpts : []).forEach(function(it) {
        if (it) push(it.path, it.title);
      });
      readDshWorkspaceRegistry().forEach(function(it) {
        push(it.path, it.title);
      });
      try {
        var host = readHostCtx();
        var sessions = host && host.sessions || (host && typeof host.get === "function" ? host.get("sessions") : null);
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
            Object.keys(bag).forEach(function(sid) {
              var row = bag[sid];
              if (row && row.cwd) push(row.cwd, "");
            });
          }
        }
      } catch (eSess) {
      }
      if (Array.isArray(extraRoots)) {
        extraRoots.forEach(function(r) {
          push(r, "");
        });
      }
      push(guessBindWorkspace(), "");
      return out;
    }
    useEffect(function() {
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
        (Array.isArray(rows) ? rows : []).forEach(function(it) {
          if (it) push(it.path, it.title);
        });
        readDshWorkspaceRegistry().forEach(function(it) {
          push(it.path, it.title);
        });
        if (!cancelled) setDshWsOpts(out);
      }
      function loadFromEngine() {
        try {
          applyEngineEndpoint();
        } catch (eAe) {
        }
        return fetch(engineBase() + "/api/config/dsh-workspaces").then(function(r) {
          return r.json();
        }).then(function(d) {
          if (cancelled) return;
          var items = d && d.ok && Array.isArray(d.items) ? d.items : [];
          mergeOpts(items);
        }).catch(function() {
          if (!cancelled) mergeOpts([]);
        });
      }
      try {
        var wsSvc = host && host.workspaces || (host && typeof host.get === "function" ? host.get("workspaces") : null);
        if (wsSvc && wsSvc.list && typeof wsSvc.list.subscribe === "function") {
          unsub = wsSvc.list.subscribe(function() {
            mergeOpts([]);
          });
        }
      } catch (eSub) {
      }
      loadFromEngine();
      try {
        if (host && typeof host.get === "function") {
          var conn = host.get("connection");
          var api = conn && conn.api;
          if (api && api.workspace && typeof api.workspace.list === "function") {
            Promise.resolve(api.workspace.list({})).then(function(resp) {
              var result = resp && resp.result;
              var items = result && result.ok && result.value && Array.isArray(result.value.items) ? result.value.items : [];
              if (!items.length || cancelled) return;
              mergeOpts(
                items.map(function(it) {
                  return {
                    path: String(it && it.path || "").trim(),
                    title: String(it && it.title || "").trim()
                  };
                })
              );
            }).catch(function() {
            });
          }
        }
      } catch (eApi) {
      }
      return function() {
        cancelled = true;
        if (typeof unsub === "function") {
          try {
            unsub();
          } catch (eU) {
          }
        }
      };
    }, []);
    function postMesProfile(path, body, okMsg) {
      setBusy(true);
      setMsg("\u5904\u7406\u4E2D\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      return fetch(engineBase() + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u64CD\u4F5C\u5931\u8D25");
        }
        applyConfigPayload(x.d.config, x.d.api_docs_sync, okMsg || "\u5DF2\u66F4\u65B0\u5BF9\u63A5\u6863\u6848");
      }).catch(function(e) {
        setMsg(String(e && e.message ? e.message : e));
        setMsgOk(false);
      }).finally(function() {
        setBusy(false);
      });
    }
    function selectMesProfile(pid) {
      if (!pid) return;
      if (pid === mesProfiles.active_profile_id) {
        setMsg("\u5F53\u524D\u5DF2\u5728\u7F16\u8F91\u6B64\u5361");
        setMsgOk(true);
        return;
      }
      Promise.resolve(saveConfig()).then(function() {
        return postMesProfile(
          "/api/config/mes-profiles/select",
          { profile_id: pid },
          "\u5DF2\u5207\u6362\u5230\u8BE5\u5BF9\u63A5\u5361\uFF08\u53EF\u7F16\u8F91\u8FDE\u63A5\u4E0E\u6587\u6863\uFF09"
        );
      }).catch(function() {
      });
    }
    function createMesProfile() {
      var name = window.prompt("\u65B0\u5BF9\u63A5\u9879\u76EE\u540D\u79F0\uFF08\u5982\uFF1AA \u5382\u751F\u4EA7\uFF09", "");
      if (name == null) return;
      name = String(name).trim();
      Promise.resolve(saveConfig()).then(function() {
        return postMesProfile(
          "/api/config/mes-profiles",
          { name: name || "", workspace: "", clone_from_active: false },
          "\u5DF2\u65B0\u589E\u5BF9\u63A5\u5361\uFF0C\u8BF7\u5728\u672C\u5361\u586B\u5199\u5730\u5740\u3001\u5BFC\u5165\u6587\u6863\u5E76\u7ED1\u5B9A\u5DE5\u4F5C\u533A"
        );
      }).catch(function() {
      });
    }
    function bindMesWorkspacePath(ws) {
      ws = String(ws || "").trim();
      if (!ws) {
        setMsg("\u8BF7\u9009\u62E9\u5DE5\u4F5C\u533A");
        setMsgOk(false);
        return;
      }
      Promise.resolve(saveConfig()).then(function() {
        return postMesProfile(
          "/api/config/mes-profiles/bind-workspace",
          { workspace: ws },
          "\u5DF2\u7ED1\u5B9A\u5DE5\u4F5C\u533A"
        );
      }).catch(function() {
      });
    }
    function deleteMesProfile(pid) {
      if (!pid) return;
      var items = Array.isArray(mesProfiles.items) ? mesProfiles.items : [];
      if (items.length <= 1) {
        setMsg("\u81F3\u5C11\u4FDD\u7559\u4E00\u5F20\u5BF9\u63A5\u5361");
        setMsgOk(false);
        return;
      }
      if (!window.confirm("\u5220\u9664\u8BE5\u5BF9\u63A5\u5361\uFF1F\u5730\u5740\u4E0E\u5DF2\u5BFC\u5165\u6587\u6863\u5C06\u4E00\u8D77\u5220\u9664\u3002")) return;
      setBusy(true);
      applyEngineEndpoint();
      fetch(engineBase() + "/api/config/mes-profiles/" + encodeURIComponent(pid), { method: "DELETE" }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok || !x.d.config) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u5220\u9664\u5931\u8D25");
        }
        applyConfigPayload(x.d.config, x.d.api_docs_sync, "\u5DF2\u5220\u9664\u5BF9\u63A5\u6863\u6848");
      }).catch(function(e) {
        setMsg(String(e && e.message ? e.message : e));
        setMsgOk(false);
      }).finally(function() {
        setBusy(false);
      });
    }
    function applySwaggerPreview(srcName, d, meta) {
      if (!d || !d.ok || !Array.isArray(d.endpoints)) {
        setMsg("\u89E3\u6790\u5931\u8D25\uFF1A" + (d && (d.detail || d.message) || "\u672A\u77E5\u9519\u8BEF"));
        setMsgOk(false);
        return;
      }
      var extra = meta || {};
      setSwaggerPreview({
        source: String(srcName || "\u63A5\u53E3\u6587\u6863"),
        endpoints: d.endpoints,
        info: d.info && typeof d.info === "object" ? d.info : {},
        sourceUrl: String(extra.sourceUrl || ""),
        clearSource: !!extra.clearSource
      });
      setMsg("\u5DF2\u89E3\u6790 " + d.endpoints.length + " \u4E2A\u63A5\u53E3\uFF0C\u8BF7\u786E\u8BA4\u540E\u5BFC\u5165");
      setMsgOk(true);
    }
    function commitSwaggerImport() {
      if (!swaggerPreview || !Array.isArray(swaggerPreview.endpoints)) return;
      setSwaggerBusy(true);
      setMsg("\u6B63\u5728\u5199\u5165\u63A5\u53E3\u6E05\u5355\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      fetch(engineBase() + "/api/config/import/swagger/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoints: swaggerPreview.endpoints,
          source_url: swaggerPreview.sourceUrl || "",
          clear_source: !!swaggerPreview.clearSource
        })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u5BFC\u5165\u5931\u8D25");
        }
        setApiEps(swaggerPreview.endpoints.slice());
        var keepUrl = !!swaggerPreview.sourceUrl;
        setSwaggerPreview(null);
        if (!keepUrl) {
          setSwaggerMode("file");
          setSwaggerPaste("");
        }
        setMsg("\u5DF2\u63A5\u5165 " + (x.d.count != null ? x.d.count : swaggerPreview.endpoints.length) + " \u4E2A\u63A5\u53E3\uFF0C\u95EE\u6570\u5C06\u8D70\u8FD9\u4E9B\u63A5\u53E3");
        setMsgOk(true);
        loadConfig();
      }).catch(function(e) {
        setMsg("\u5BFC\u5165\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      }).finally(function() {
        setSwaggerBusy(false);
      });
    }
    function fetchSwaggerFromUrl() {
      var url = String(swaggerUrl || "").trim();
      if (!url) {
        setMsg("\u8BF7\u586B\u5199\u63A5\u53E3\u6587\u6863 URL\uFF08\u5982 \u2026/docs \u6216 \u2026/openapi.json\uFF09");
        setMsgOk(false);
        return;
      }
      setSwaggerBusy(true);
      setMsg("\u6B63\u5728\u83B7\u53D6\u5E76\u89E3\u6790\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      fetch(engineBase() + "/api/config/import/swagger/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          username: String(swaggerUser || "").trim(),
          password: String(swaggerPass || "")
        })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u89E3\u6790\u5931\u8D25");
        }
        applySwaggerPreview(url, x.d, {
          sourceUrl: url,
          clearSource: false
        });
        if (String(swaggerPass || "") && swaggerPass !== "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022") setSwaggerPass("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022");
      }).catch(function(e) {
        setMsg("\u4ECE URL \u5BFC\u5165\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      }).finally(function() {
        setSwaggerBusy(false);
      });
    }
    function parseSwaggerPaste() {
      var content = String(swaggerPaste || "").trim();
      if (!content) {
        setMsg("\u8BF7\u5148\u7C98\u8D34 OpenAPI / Markdown \u539F\u6587");
        setMsgOk(false);
        return;
      }
      setSwaggerBusy(true);
      setMsg("\u6B63\u5728\u89E3\u6790\u7C98\u8D34\u5185\u5BB9\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      fetch(engineBase() + "/api/config/import/swagger/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u89E3\u6790\u5931\u8D25");
        }
        applySwaggerPreview("\u7C98\u8D34\u5185\u5BB9", x.d, { clearSource: true });
      }).catch(function(e) {
        setMsg("\u7C98\u8D34\u89E3\u6790\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      }).finally(function() {
        setSwaggerBusy(false);
      });
    }
    function onSwaggerFileChange(e) {
      var input = e && e.target;
      var f = input && input.files && input.files[0];
      if (!f) return;
      setSwaggerBusy(true);
      setMsg("\u6B63\u5728\u4E0A\u4F20\u5E76\u89E3\u6790\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      var fd = new FormData();
      fd.append("file", f);
      fetch(engineBase() + "/api/config/import/swagger", { method: "POST", body: fd }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u89E3\u6790\u5931\u8D25");
        }
        applySwaggerPreview(f.name || "\u4E0A\u4F20\u6587\u4EF6", x.d, { clearSource: true });
      }).catch(function(err) {
        setMsg("\u4E0A\u4F20\u89E3\u6790\u5931\u8D25\uFF1A" + (err && err.message ? err.message : String(err)));
        setMsgOk(false);
      }).finally(function() {
        setSwaggerBusy(false);
        try {
          if (input) input.value = "";
        } catch (ex) {
        }
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
          setMsg("\u5F53\u524D\u9875\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u5019\u518D\u4FDD\u5B58");
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
          setMsg("\u5F53\u524D\u9875\u5C1A\u672A\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u5019\u518D\u52A0\u8F7D");
          setMsgOk(false);
        }
        return;
      }
      loadConfig();
    }
    useEffect(function() {
      if (tab === "remote_review" || tab === "cursor_coding") return;
      loadConfig();
    }, []);
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
      setBrandingMsg("\u52A0\u8F7D\u4E2D\u2026");
      setBrandingOk(false);
      fetch(engineBase() + "/api/branding").then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok && d.branding) {
          setBranding(d.branding);
          setBrandingMsg("\u5DF2\u52A0\u8F7D\u5E94\u7528\u914D\u7F6E");
          setBrandingOk(true);
        } else {
          throw new Error("\u5F15\u64CE\u672A\u54CD\u5E94");
        }
      }).catch(function(e) {
        setBrandingMsg("\u52A0\u8F7D\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setBrandingOk(false);
      }).finally(function() {
        setBrandingBusy(false);
      });
    }
    function saveBranding() {
      setBrandingBusy(true);
      setBrandingMsg("\u4FDD\u5B58\u4E2D\u2026");
      setBrandingOk(false);
      fetch(engineBase() + "/api/branding", {
        method: "PUT",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          enabled: !!branding.enabled,
          app_name: branding.app_name || "",
          app_overview: branding.app_overview || ""
        })
      }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok && d.branding) {
          setBranding(d.branding);
          setBrandingMsg(branding.enabled ? "\u5DF2\u542F\u7528\u81EA\u5B9A\u4E49\u914D\u7F6E\uFF0C\u5237\u65B0\u9875\u9762\u751F\u6548" : "\u5DF2\u4FDD\u5B58\uFF08\u672A\u542F\u7528\uFF0C\u4F7F\u7528\u5185\u7F6E\u9ED8\u8BA4\u503C\uFF09");
          setBrandingOk(true);
        } else {
          throw new Error(d && (d.detail || d.message) || "\u4FDD\u5B58\u5931\u8D25");
        }
      }).catch(function(e) {
        setBrandingMsg("\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setBrandingOk(false);
      }).finally(function() {
        setBrandingBusy(false);
      });
    }
    function uploadLogo(file) {
      if (!file) return;
      setBrandingBusy(true);
      setBrandingMsg("\u4E0A\u4F20 logo \u4E2D\u2026");
      setBrandingOk(false);
      var fd = new FormData();
      fd.append("file", file);
      fetch(engineBase() + "/api/branding/logo", {
        method: "POST",
        headers: authHeaders(),
        body: fd
      }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok && d.branding) {
          setBranding(d.branding);
          setBrandingMsg("logo \u5DF2\u4E0A\u4F20\uFF0C\u4FDD\u5B58\u540E\u542F\u7528\u751F\u6548");
          setBrandingOk(true);
        } else {
          throw new Error(d && (d.detail || d.message) || "\u4E0A\u4F20\u5931\u8D25");
        }
      }).catch(function(e) {
        setBrandingMsg("\u4E0A\u4F20\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setBrandingOk(false);
      }).finally(function() {
        setBrandingBusy(false);
      });
    }
    useEffect(function() {
      loadBranding();
    }, []);
    useLayoutEffect(function() {
      var el = rootRef.current;
      if (!el || typeof document === "undefined") return void 0;
      var panel = document.querySelector(".VOzbGW_panel") || el.closest && el.closest("[class*='_panel']") || null;
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
      if (!panel) return void 0;
      panel.classList.add("wb-set-host-wide");
      var prevW = panel.style.width;
      var prevMw = panel.style.maxWidth;
      panel.style.removeProperty("display");
      panel.style.removeProperty("flex-direction");
      panel.style.removeProperty("max-height");
      panel.style.setProperty("width", "920px", "important");
      panel.style.setProperty("max-width", "calc(100vw - 48px)", "important");
      var options = panel.querySelector("[class*='_options']") || el.closest && el.closest("[class*='_options']") || null;
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
      return function() {
        panel.classList.remove("wb-set-host-wide");
        panel.style.width = prevW;
        panel.style.maxWidth = prevMw;
      };
    }, []);
    function saveConfig() {
      setBusy(true);
      setMsg("\u4FDD\u5B58\u4E2D\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      var payload = {
        mes: Object.assign({}, draft.mes, {
          timeout: Math.max(5, Number(draft.mes.timeout) || 30)
        }),
        deepseek: llmPrepareSave(draft.deepseek),
        vision: Object.assign({}, draft.vision || {}, {
          api_key: draft.vision && draft.vision.api_key || "",
          base_url: String(draft.vision && draft.vision.base_url || "").trim().replace(/\/$/, ""),
          model: String(draft.vision && draft.vision.model || "").trim()
        }),
        code_dev: Object.assign({}, draft.code_dev, {
          model: (draft.code_dev.model || "").trim() || "composer-2.5",
          max_concurrent: Math.max(1, Number(draft.code_dev.max_concurrent) || 1),
          cursor_timeout_sec: Math.max(60, Number(draft.code_dev.cursor_timeout_sec) || 2700),
          default_workspace: (draft.code_dev.default_workspace || "").trim()
        }),
        code_review: Object.assign({}, draft.code_review, {
          enabled: true,
          max_files: Math.max(1, Number(draft.code_review.max_files) || 40),
          max_file_bytes: Math.max(1024, Number(draft.code_review.max_file_bytes) || 12e4),
          max_total_bytes: Math.max(4096, Number(draft.code_review.max_total_bytes) || 8e5),
          default_workspace: (draft.code_review.default_workspace || "").trim()
        }),
        code_commit: Object.assign({}, draft.code_commit, {
          enabled: true,
          default_workspace: (draft.code_commit.default_workspace || "").trim(),
          work_branch: "",
          remote_name: (draft.code_commit.remote_name || "").trim() || "origin",
          default_push: draft.code_commit.default_push !== false,
          max_files: Math.max(1, Number(draft.code_commit.max_files) || 80),
          use_skill_review: draft.code_commit.use_skill_review !== false,
          allow_blocked: !!draft.code_commit.allow_blocked
        }),
        // 部署规则已全部迁到各工程 .workbuddy/；配置中心不再写 code_deploy。
        automations: Object.assign({}, draft.automations || {}, {
          wecom_webhook_key: draft.automations && draft.automations.wecom_webhook_key || "",
          wecom_push_enabled: !!(draft.automations && draft.automations.wecom_push_enabled),
          wecom_push_dry_run: !!(draft.automations && draft.automations.wecom_push_dry_run),
          feishu_app_id: String(draft.automations && draft.automations.feishu_app_id || "").trim(),
          feishu_app_secret: draft.automations && draft.automations.feishu_app_secret || "",
          feishu_bitable_enabled: !!(draft.automations && draft.automations.feishu_bitable_enabled),
          feishu_bitable_dry_run: !!(draft.automations && draft.automations.feishu_bitable_dry_run)
        })
      };
      return fetch(engineBase() + "/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: payload })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u4FDD\u5B58\u5931\u8D25");
        }
        applyConfigPayload(x.d.config || {}, x.d.api_docs_sync, "\u5DF2\u4FDD\u5B58\u5230\u5F15\u64CE config.yaml");
        return x.d;
      }).catch(function(e) {
        setMsg("\u4FDD\u5B58\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
        throw e;
      }).finally(function() {
        setBusy(false);
      });
    }
    function runTest(key, path, body) {
      applyEngineEndpoint();
      setTests(function(prev) {
        var n = Object.assign({}, prev);
        n[key] = "\u6D4B\u8BD5\u4E2D\u2026";
        return n;
      });
      var opts = body ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      } : void 0;
      fetch(engineBase() + path, opts).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        var d = x.d || {};
        var text = d.detail || d.message || d.summary || (d.ok === false ? "\u672A\u5C31\u7EEA" : d.ok ? "OK" : JSON.stringify(d).slice(0, 240));
        setTests(function(prev) {
          var n = Object.assign({}, prev);
          n[key] = (x.ok && d.ok !== false ? "\u2705 " : "\u274C ") + text;
          return n;
        });
      }).catch(function(e) {
        setTests(function(prev) {
          var n = Object.assign({}, prev);
          n[key] = "\u274C " + (e && e.message ? e.message : String(e));
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
        label: "\u667A\u8C31 GLM-4V",
        base: "https://open.bigmodel.cn/api/paas/v4",
        model: "glm-4v-flash"
      },
      {
        id: "qwen-vl",
        label: "Qwen-VL",
        base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
        model: "qwen-vl-plus"
      },
      { id: "custom", label: "\u81EA\u5B9A\u4E49", base: "", model: "" }
    ];
    function inferVisionPresetId() {
      var base = String(vision.base_url || "").trim().replace(/\/$/, "");
      if (!base) return vision.model ? "custom" : "";
      for (var i = 0; i < VISION_PRESETS.length; i++) {
        var p = VISION_PRESETS[i];
        if (p.id === "custom" || !p.base) continue;
        if (String(p.base).replace(/\/$/, "") === base) return p.id;
      }
      return "custom";
    }
    var visionPresetId = inferVisionPresetId();
    var visionKeyConfigured = !!vision.api_key && (/^•+$/.test(String(vision.api_key)) || String(vision.api_key).length > 0);
    function applyVisionPreset(p) {
      if (p.id === "custom") {
        setMsg("\u8BF7\u81EA\u884C\u586B\u5199\u89C6\u89C9\u6A21\u578B Base URL \u4E0E\u6A21\u578B\u540D\u79F0");
        setMsgOk(true);
        return;
      }
      patchDraft(setDraft, ["vision", "base_url"], p.base);
      patchDraft(setDraft, ["vision", "model"], p.model);
      setMsg("\u5DF2\u586B\u5165 " + p.label + "\uFF08\u8BF7\u786E\u8BA4\u89C6\u89C9 API Key\uFF09");
      setMsgOk(true);
    }
    function labeledField(label, props, full, meta) {
      var p = props || {};
      return h(
        "div",
        { className: "wb-set-field" + (full ? " full" : "") },
        h("label", null, label, h("span", { className: "wb-set-badge" }, "\u754C\u9762")),
        p.multiline ? h("textarea", p) : h("input", p),
        meta || null
      );
    }
    function clearImportedApis() {
      if (typeof window !== "undefined" && window.confirm) {
        if (!window.confirm("\u786E\u8BA4\u6E05\u9664\u5DF2\u5BFC\u5165\u7684\u5168\u90E8\u63A5\u53E3\u6E05\u5355\uFF1F\u53EF\u7A0D\u540E\u91CD\u65B0\u5BFC\u5165\u3002")) return;
      }
      setSwaggerBusy(true);
      setMsg("\u6B63\u5728\u6E05\u9664\u5DF2\u5BFC\u5165\u63A5\u53E3\u2026");
      setMsgOk(false);
      applyEngineEndpoint();
      fetch(engineBase() + "/api/config/import/swagger/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoints: [], clear_source: true })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) {
          throw new Error(x.d && (x.d.detail || x.d.message) || "\u6E05\u9664\u5931\u8D25");
        }
        setApiEps([]);
        setSwaggerPreview(null);
        setDocsSync(null);
        setMsg("\u5DF2\u6E05\u9664\u63A5\u53E3\u6E05\u5355\uFF0C\u53EF\u91CD\u65B0\u5BFC\u5165\u9A8C\u8BC1");
        setMsgOk(true);
        loadConfig();
      }).catch(function(e) {
        setMsg("\u6E05\u9664\u5931\u8D25\uFF1A" + (e && e.message ? e.message : String(e)));
        setMsgOk(false);
      }).finally(function() {
        setSwaggerBusy(false);
      });
    }
    function syncRememberedDocsQuiet() {
      if (docsSyncBusyRef.current) return;
      docsSyncBusyRef.current = true;
      applyEngineEndpoint();
      fetch(engineBase() + "/api/config/import/swagger/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "", username: "", password: "" })
      }).then(function(r) {
        return r.json().then(function(d) {
          return { ok: r.ok, d };
        });
      }).then(function(x) {
        if (!x.d || x.d.skipped) return;
        loadConfig();
      }).catch(function() {
      }).finally(function() {
        docsSyncBusyRef.current = false;
      });
    }
    useEffect(
      function() {
        if (tab !== "mes") return void 0;
        var cancelled = false;
        var timer = setTimeout(function() {
          if (cancelled) return;
          applyEngineEndpoint();
          fetch(engineBase() + "/api/config").then(function(r) {
            return r.json().then(function(d) {
              return { ok: r.ok, d };
            });
          }).then(function(x) {
            if (cancelled || !x.ok || !x.d || !x.d.ok) return;
            var sync = x.d.api_docs_sync && typeof x.d.api_docs_sync === "object" ? x.d.api_docs_sync : null;
            if (!sync || !sync.enabled || !sync.due) return;
            syncRememberedDocsQuiet();
          }).catch(function() {
          });
        }, 200);
        return function() {
          cancelled = true;
          clearTimeout(timer);
        };
      },
      [tab]
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
      h("h4", { style: { margin: "14px 0 6px", fontSize: "14px" } }, "\u63A5\u53E3\u6587\u6863\u5BFC\u5165"),
      h(
        "p",
        { className: "wb-set-hint" },
        "\u4E0E\u4E0A\u65B9\u8FDE\u63A5\u540C\u5C5E\u672C\u5361\u3002\u4E0A\u4F20 OpenAPI / Swagger / Markdown\uFF0C\u6216\u4ECE URL \u62C9\u53D6\uFF1B\u95EE\u6570\u53EA\u81EA\u52A8\u8C03\u7528\u65E0\u8DEF\u5F84\u53C2\u6570\u7684\u53EA\u8BFB GET\u3002"
      ),
      h(
        "div",
        { className: "wb-set-field", style: { marginBottom: "10px" } },
        h("label", null, "\u5BFC\u5165\u65B9\u5F0F"),
        h(
          "div",
          { className: "wb-set-presets", role: "tablist", "aria-label": "\u63A5\u53E3\u6587\u6863\u5BFC\u5165\u65B9\u5F0F" },
          [
            { id: "file", label: "\u4E0A\u4F20\u6587\u4EF6" },
            { id: "url", label: "\u4ECE URL" },
            { id: "paste", label: "\u7C98\u8D34\u539F\u6587" }
          ].map(function(m) {
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
                onClick: function() {
                  setSwaggerMode(m.id);
                }
              },
              m.label
            );
          })
        )
      ),
      h("input", {
        ref: swaggerFileRef,
        type: "file",
        accept: ".json,.yaml,.yml,.md,.markdown,.txt,application/json",
        style: { display: "none" },
        onChange: onSwaggerFileChange
      }),
      swaggerMode === "file" ? h(
        "p",
        { className: "wb-set-hint", style: { marginTop: 0 } },
        "\u652F\u6301 .json / .yaml / .yml / .md / .txt\u3002\u70B9\u51FB\u4E0B\u65B9\u300C\u83B7\u53D6\u5E76\u89E3\u6790\u300D\u9009\u62E9\u672C\u5730\u6587\u4EF6\u3002"
      ) : null,
      swaggerMode === "url" ? h(
        "div",
        { style: { marginTop: "2px" } },
        h(
          "div",
          { className: "wb-set-grid" },
          field(
            "\u63A5\u53E3\u6587\u6863 URL",
            {
              value: swaggerUrl,
              placeholder: "https://\u4E1A\u52A1\u7CFB\u7EDF/docs \u6216 \u2026/openapi.json",
              onChange: function(e) {
                setSwaggerUrl(e.target.value);
              }
            },
            true
          ),
          field("\u7528\u6237\u540D\uFF08\u53EF\u9009 Basic\uFF09", {
            value: swaggerUser,
            autoComplete: "off",
            onChange: function(e) {
              setSwaggerUser(e.target.value);
            }
          }),
          field("\u5BC6\u7801\uFF08\u53EF\u9009\uFF09", {
            type: "password",
            autoComplete: "new-password",
            value: swaggerPass,
            onChange: function(e) {
              setSwaggerPass(e.target.value);
            }
          })
        ),
        h(
          "p",
          { className: "wb-set-hint", style: { marginTop: "8px" } },
          "\u89E3\u6790\u6210\u529F\u540E\u4F1A\u8BB0\u4F4F\u5730\u5740\u3001\u7528\u6237\u540D\u548C\u5BC6\u7801\u3002\u5DF2\u8BB0\u4F4F\u540E\u53EF\u6309\u65E5\u81EA\u52A8\u540C\u6B65\uFF1B\u5931\u8D25\u4ECD\u7528\u4E0A\u4E00\u4EFD\u63A5\u53E3\u6E05\u5355\u3002"
        ),
        h(
          "p",
          { className: "wb-set-hint", style: { marginBottom: "8px" } },
          docsSync && docsSync.last_error ? "\u4E0A\u6B21\u540C\u6B65\u5931\u8D25\uFF08" + (docsSync.last_error_at || "\u65F6\u95F4\u672A\u77E5") + "\uFF09\uFF1A" + docsSync.last_error + " \u95EE\u6570\u4ECD\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684\u63A5\u53E3\u6E05\u5355\u3002" : docsSync && docsSync.last_ok_at ? "\u4E0A\u6B21\u540C\u6B65\u6210\u529F\uFF08" + docsSync.last_ok_at + "\uFF09\uFF0C\u5171 " + (docsSync.last_count || apiEps && apiEps.length || 0) + " \u4E2A\u63A5\u53E3\u3002" : docsSync && docsSync.source_url ? "\u5DF2\u8BB0\u4F4F\u6587\u6863\u5730\u5740\uFF0C\u5C1A\u672A\u540C\u6B65\u3002" : "\u5C1A\u672A\u8BB0\u4F4F\u6587\u6863\u5730\u5740\u3002"
        )
      ) : null,
      swaggerMode === "paste" ? h(
        "div",
        { style: { marginTop: "2px" } },
        h(
          "div",
          { className: "wb-set-field full" },
          h("label", null, "\u7C98\u8D34 OpenAPI / Markdown"),
          h("textarea", {
            value: swaggerPaste,
            rows: 8,
            placeholder: '\u53EF\u7C98\u8D34 OpenAPI JSON/YAML\uFF0C\u6216 Markdown \u4E2D\u7684 "GET /api/\u2026" \u5217\u8868',
            onChange: function(e) {
              setSwaggerPaste(e.target.value);
            },
            style: { width: "100%", minHeight: "140px", fontFamily: "ui-monospace, monospace", fontSize: "12px" }
          })
        )
      ) : null,
      h(
        "div",
        { className: "wb-set-actions", style: { marginTop: "12px" } },
        h(
          "button",
          {
            type: "button",
            className: "wb-set-btn primary",
            disabled: busy || swaggerBusy,
            onClick: runSwaggerParse
          },
          swaggerBusy ? "\u89E3\u6790\u4E2D\u2026" : "\u83B7\u53D6\u5E76\u89E3\u6790"
        )
      ),
      swaggerPreview ? h(
        "div",
        {
          className: "wb-set-test",
          style: {
            marginTop: "12px",
            padding: "12px",
            border: "1px solid var(--dsw-alias-border-1, #e5e7eb)",
            borderRadius: "8px",
            background: "var(--dsw-alias-bg-layer-1, #fafafa)"
          }
        },
        h(
          "p",
          { style: { margin: "0 0 8px", fontWeight: 600 } },
          "\u9884\u89C8\uFF1A" + (swaggerPreview.source || "") + " \xB7 \u5171 " + (swaggerPreview.endpoints && swaggerPreview.endpoints.length || 0) + " \u4E2A\u63A5\u53E3\uFF08\u786E\u8BA4\u540E\u5C06\u66FF\u6362\u5F53\u524D\u6E05\u5355\uFF09"
        ),
        h(
          "div",
          { style: { maxHeight: "220px", overflow: "auto", fontSize: "12px", lineHeight: "1.5" } },
          (swaggerPreview.endpoints || []).slice(0, 12).map(function(ep, i) {
            return h(
              "div",
              { key: i, style: { marginBottom: "4px" } },
              h("code", null, String(ep.method || "GET").toUpperCase() + " " + (ep.path || "")),
              " ",
              h("span", { style: { opacity: 0.75 } }, ep.desc || ep.name || "")
            );
          }),
          (swaggerPreview.endpoints || []).length > 12 ? h(
            "p",
            { className: "wb-set-hint", style: { marginTop: "6px" } },
            "\u2026 \u5176\u4F59 " + ((swaggerPreview.endpoints || []).length - 12) + " \u4E2A\u5DF2\u5305\u542B"
          ) : null
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
              onClick: commitSwaggerImport
            },
            swaggerBusy ? "\u5BFC\u5165\u4E2D\u2026" : "\u786E\u8BA4\u5BFC\u5165"
          ),
          h(
            "button",
            {
              type: "button",
              className: "wb-set-btn",
              disabled: swaggerBusy,
              onClick: function() {
                setSwaggerPreview(null);
              }
            },
            "\u53D6\u6D88"
          )
        )
      ) : null,
      h(
        "div",
        {
          style: {
            marginTop: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            flexWrap: "wrap"
          }
        },
        h(
          "p",
          { className: "wb-set-hint", style: { margin: 0, flex: "1 1 200px" } },
          apiEps && apiEps.length ? "\u5DF2\u63A5\u5165 " + apiEps.length + " \u4E2A\u63A5\u53E3\uFF0C\u95EE\u6570\u5C06\u8D70\u8FD9\u4E9B\u63A5\u53E3\uFF08\u4F18\u5148\u5339\u914D\u5176\u4E2D\u7684\u53EA\u8BFB GET\uFF09\uFF1A" : "\u5C1A\u672A\u63A5\u5165\u63A5\u53E3\u3002\u5BFC\u5165\u540E\u8BF7\u7528\u5E95\u90E8\u300C\u4FDD\u5B58\u914D\u7F6E\u300D\uFF0C\u518D\u5728\u5BF9\u5E94\u5DE5\u4F5C\u533A\u804A\u5929\u91CC\u95EE\u6570\u3002"
        ),
        apiEps && apiEps.length ? h(
          "button",
          {
            type: "button",
            className: "wb-set-btn",
            disabled: busy || swaggerBusy,
            onClick: clearImportedApis
          },
          "\u6E05\u9664\u5DF2\u5BFC\u5165"
        ) : null
      ),
      apiEpsPreview.length ? h(
        "div",
        { style: { fontSize: "12px", lineHeight: "1.55", opacity: 0.9, marginTop: "6px" } },
        apiEpsPreview.map(function(ep, i) {
          return h(
            "div",
            { key: i },
            h("code", null, String(ep.method || "GET").toUpperCase() + " " + (ep.path || "")),
            ep.desc || ep.name ? " \u2014 " + (ep.desc || ep.name) : ""
          );
        }),
        apiEps.length > apiEpsPreview.length ? h("div", { style: { marginTop: "4px", opacity: 0.7 } }, "\u2026 \u5171 " + apiEps.length + " \u4E2A") : null
      ) : null
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
        strokeLinejoin: "round"
      };
      if (kind === "edit") {
        return h(
          "svg",
          common,
          h("path", { d: "M12 20h9" }),
          h("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" })
        );
      }
      return h(
        "svg",
        common,
        h("path", { d: "M3 6h18" }),
        h("path", { d: "M8 6V4h8v2" }),
        h("path", { d: "M19 6l-1 14H6L5 6" }),
        h("path", { d: "M10 11v6M14 11v6" })
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
              title: "\u7F16\u8F91\u6B64\u5361",
              "aria-label": "\u7F16\u8F91\u6B64\u5361",
              disabled: busy,
              onClick: o.onEdit
            },
            mesCardToolIcon("edit")
          )
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
              title: "\u5220\u9664\u672C\u5361",
              "aria-label": "\u5220\u9664\u672C\u5361",
              disabled: busy,
              onClick: o.onDelete
            },
            mesCardToolIcon("delete")
          )
        );
      }
      return h(
        "div",
        { className: "wb-set-card-head" },
        h("h3", null, title),
        tools.length ? h("div", { className: "wb-set-card-tools" }, tools) : null
      );
    }
    function renderMesProfileCard(it) {
      var id = String(it && it.id || "");
      var on = id === activeMesProfileId;
      var name = String(it && it.name || id || "\u5BF9\u63A5");
      var roots = it && Array.isArray(it.workspace_roots) ? it.workspace_roots : [];
      var nDocs = on && apiEps ? apiEps.length : it && it.api_docs && Array.isArray(it.api_docs.endpoints) ? it.api_docs.endpoints.length : 0;
      var baseHint = on ? String(mes && mes.base_url || "") : String(it && it.mes && it.mes.base_url || "");
      var cardTools = {
        onEdit: function() {
          selectMesProfile(id);
        },
        onDelete: function() {
          deleteMesProfile(id);
        }
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
              (baseHint ? "\u5730\u5740 " + baseHint + " \xB7 " : "") + (nDocs ? "\u6587\u6863 " + nDocs + " \u4E2A\u63A5\u53E3" : "\u6587\u6863\u672A\u5BFC\u5165") + (roots.length ? " \xB7 \u5DE5\u4F5C\u533A " + roots.join("\uFF1B") : " \xB7 \u672A\u7ED1\u5B9A\u5DE5\u4F5C\u533A")
            )
          )
        );
      }
      return h(
        "div",
        {
          key: id,
          className: "wb-set-card",
          style: { borderColor: "var(--dsw-alias-color-primary, #2563eb)", borderWidth: "1px", borderStyle: "solid" }
        },
        mesCardHead(name + "\uFF08\u5F53\u524D\u7F16\u8F91\uFF09", cardTools),
        h(
          "div",
          { className: "body" },
          function() {
            function pathKey(p) {
              return String(p || "").trim().replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
            }
            var boundRaw = roots.length ? String(roots[0] || "").trim() : "";
            var opts = listAvailableWorkspaces(roots);
            var boundKey = pathKey(boundRaw);
            var matched = null;
            opts.forEach(function(o) {
              if (!matched && pathKey(o.path) === boundKey) matched = o;
            });
            var selectValue = matched ? matched.path : boundRaw;
            if (boundRaw && !matched) {
              opts = [{ path: boundRaw, title: boundRaw }].concat(opts);
              selectValue = boundRaw;
            }
            var showLabel = matched ? matched.title && matched.title !== matched.path ? matched.title + " \u2014 " + matched.path : matched.path : boundRaw;
            return h(
              "div",
              { className: "wb-set-field full", style: { marginBottom: "10px" } },
              h("label", null, "\u7ED1\u5B9A\u5DE5\u4F5C\u533A"),
              h(
                "select",
                {
                  value: selectValue,
                  disabled: busy,
                  onChange: function(e) {
                    bindMesWorkspacePath(e.target.value);
                  }
                },
                h(
                  "option",
                  { value: "" },
                  opts.length ? "\u8BF7\u9009\u62E9\u5DE5\u4F5C\u533A\uFF08\u4E0E\u5DE6\u4FA7\u5DE5\u4F5C\u533A\u5217\u8868\u76F8\u540C\uFF09" : "\u6682\u65E0\u53EF\u7528\u5DE5\u4F5C\u533A\uFF08\u8BF7\u5148\u5728\u5DE6\u4FA7\u6DFB\u52A0\u5DE5\u7A0B\uFF09"
                ),
                opts.map(function(o) {
                  var p = o.path;
                  var label = o.title && o.title !== p ? o.title + " \u2014 " + p : p;
                  return h("option", { key: p, value: p }, label);
                })
              ),
              boundRaw ? h(
                "div",
                { className: "wb-set-field-meta" },
                "\u5DF2\u7ED1\u5B9A\uFF1A" + (showLabel || boundRaw)
              ) : null
            );
          }(),
          h("h4", { style: { margin: "4px 0 6px", fontSize: "14px" } }, "MES \u8FDE\u63A5"),
          h(
            "div",
            { className: "wb-set-grid" },
            field(
              "Base URL",
              {
                value: mes.base_url || "",
                onChange: function(e) {
                  patchDraft(setDraft, ["mes", "base_url"], e.target.value);
                }
              },
              true
            ),
            field("\u8D26\u53F7", {
              value: mes.username || "",
              onChange: function(e) {
                patchDraft(setDraft, ["mes", "username"], e.target.value);
              }
            }),
            field("\u5BC6\u7801\uFF08\u8131\u654F\u56DE\u663E\uFF09", {
              type: "password",
              autoComplete: "new-password",
              value: mes.password || "",
              onChange: function(e) {
                patchDraft(setDraft, ["mes", "password"], e.target.value);
              }
            }),
            field(
              "\u4F01\u4E1A\u7F16\u7801",
              {
                value: mes.enterprise_code || "",
                onChange: function(e) {
                  patchDraft(setDraft, ["mes", "enterprise_code"], e.target.value);
                }
              },
              true
            )
          ),
          mesDocsEditor
        )
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
          "\u6BCF\u4E2A\u9879\u76EE\u4E00\u5F20\u5BF9\u63A5\u5361\uFF1B\u53F3\u4E0A\u89D2 + \u65B0\u589E\uFF0C\u5E95\u90E8\u300C\u4FDD\u5B58\u914D\u7F6E\u300D\u6574\u5361\u843D\u76D8\u3002"
        ),
        h(
          "button",
          {
            type: "button",
            className: "wb-set-card-icon primary",
            title: "\u65B0\u589E\u5BF9\u63A5\u5361",
            "aria-label": "\u65B0\u589E\u5BF9\u63A5\u5361",
            disabled: busy,
            onClick: createMesProfile
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
              strokeLinecap: "round"
            },
            h("path", { d: "M12 5v14M5 12h14" })
          )
        )
      ),
      mesProfileItems.length ? mesProfileItems.map(renderMesProfileCard) : h(
        "div",
        { className: "wb-set-card" },
        h("h3", null, "\u6C5F\u897F\u4E2D\u8F6F\u5236\u9020\u6267\u884C\u7CFB\u7EDF"),
        h("div", { className: "body" }, h("p", { className: "wb-set-hint" }, "\u52A0\u8F7D\u4E2D\u2026"))
      )
    );
    var sectionLlm = h(
      "div",
      { className: "wb-set-auto-stack" },
      h(
        "div",
        { className: "wb-set-card" },
        h("h3", null, "\u5546\u7528\u6A21\u578B / LLM \u610F\u56FE\u5F15\u64CE"),
        h(
          "div",
          { className: "body" },
          h(
            "p",
            { className: "wb-set-hint" },
            "\u5BA1\u7801\u3001\u610F\u56FE\u4E0E DSH \u804A\u5929\u5171\u7528\u6B64\u5904\u6A21\u578B\u914D\u7F6E\u3002\u9009\u62E9 DeepSeek \u65F6\u4FDD\u5B58\u4F1A\u540C\u6B65 Key \u5230\u672C\u673A DSH \u51ED\u636E\uFF0C\u4E0D\u5FC5\u518D\u53BB\u300C\u8BBE\u7F6E \u2192 \u6A21\u578B\u300D\u586B\u4E00\u904D\u3002\u4EA6\u53EF\u9009 Ollama \u6216 OpenAI \u517C\u5BB9\u7684\u901A\u7528\u6A21\u578B\u3002"
          ),
          h(
            "div",
            { className: "wb-set-field", style: { marginBottom: "12px" } },
            h("label", null, "\u63D0\u4F9B\u65B9"),
            h(
              "div",
              { className: "wb-set-radios" },
              function() {
                var llmProv = llm.provider || "deepseek";
                if (llmProv === "none") llmProv = "deepseek";
                return [
                  ["deepseek", "DeepSeek API"],
                  ["ollama", "Ollama \u672C\u5730"],
                  ["openai_compat", "\u901A\u7528\u6A21\u578B\u914D\u7F6E"]
                ].map(function(pair) {
                  var on = llmProv === pair[0];
                  return h(
                    "label",
                    { key: pair[0], className: on ? "active" : "" },
                    h("input", {
                      type: "radio",
                      name: "wb-llm",
                      checked: on,
                      onChange: function() {
                        setDraft(function(prev) {
                          var oldProv = llmNormalizeProvider(prev.deepseek && prev.deepseek.provider || "deepseek");
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
                              model: slice.model
                            }
                          });
                        });
                      }
                    }),
                    " ",
                    pair[1]
                  );
                });
              }()
            )
          ),
          h(
            "div",
            { className: "wb-set-grid" },
            function() {
              var llmProv = llm.provider || "deepseek";
              if (llmProv === "none") llmProv = "deepseek";
              if (llmProv === "ollama") return null;
              var llmKeyConfigured = secretMaskConfigured(llm.api_key);
              var keyLabel = llmProv === "openai_compat" ? "API Key" : "API Key\uFF08\u8131\u654F\u56DE\u663E\uFF09";
              return labeledField(
                keyLabel,
                {
                  type: "password",
                  autoComplete: "new-password",
                  value: llmKeyConfigured ? "" : llm.api_key || "",
                  placeholder: llmKeyConfigured ? "\u5DF2\u914D\u7F6E\uFF0C\u7559\u7A7A\u4FDD\u5B58\u5219\u4FDD\u6301\u4E0D\u53D8" : llmProv === "openai_compat" ? "\u672A\u914D\u7F6E\uFF0C\u8BF7\u7C98\u8D34 OpenAI \u517C\u5BB9 Key" : "\u672A\u914D\u7F6E\uFF0C\u8BF7\u7C98\u8D34 DeepSeek Key \u540E\u4FDD\u5B58",
                  onChange: function(e) {
                    patchDraft(setDraft, ["deepseek", "api_key"], e.target.value);
                  }
                },
                true,
                h(
                  "div",
                  { className: "wb-set-field-meta" },
                  llmKeyConfigured ? h("span", null, "\u5F53\u524D\u5DF2\u914D\u7F6E\uFF08\u5DF2\u8131\u654F\uFF0C\u7559\u7A7A\u4FDD\u5B58\u4E0D\u4FEE\u6539\uFF09") : h("span", null, "\u5C1A\u672A\u4FDD\u5B58 Key\uFF1B\u4FDD\u5B58\u540E\u6B64\u5904\u53EA\u663E\u793A\u72B6\u6001\uFF0C\u4E0D\u56DE\u663E\u660E\u6587"),
                  llmKeyConfigured ? h(
                    "button",
                    {
                      type: "button",
                      className: "wb-set-clear",
                      onClick: function() {
                        patchDraft(setDraft, ["deepseek", "api_key"], "");
                        setMsg("\u5DF2\u6E05\u9664 Key\uFF0C\u4FDD\u5B58\u540E\u751F\u6548");
                        setMsgOk(true);
                      }
                    },
                    "\u6E05\u9664 Key"
                  ) : null
                )
              );
            }(),
            field("Base URL", {
              value: llm.base_url || "",
              onChange: function(e) {
                patchDraft(setDraft, ["deepseek", "base_url"], e.target.value);
              }
            }),
            field("\u6A21\u578B", {
              value: llm.model || "",
              onChange: function(e) {
                patchDraft(setDraft, ["deepseek", "model"], e.target.value);
              }
            })
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
                onClick: function() {
                  runTest("llm", "/api/config/test/deepseek", {
                    config: { deepseek: llmPrepareSave(draft.deepseek) }
                  });
                }
              },
              "\u6D4B\u8BD5 LLM"
            )
          ),
          tests.llm ? h("div", { className: "wb-set-test" }, tests.llm) : null
        )
      ),
      h(
        "div",
        { className: "wb-set-card" },
        h("h3", null, "\u89C6\u89C9\u6A21\u578B"),
        h(
          "div",
          { className: "body" },
          h("p", { className: "wb-set-hint", style: { marginBottom: "8px" } }, "\u5FEB\u901F\u586B\u5165\u89C6\u89C9\u6A21\u578B\u9ED8\u8BA4\u5730\u5740"),
          h(
            "div",
            { className: "wb-set-presets" },
            VISION_PRESETS.map(function(p) {
              return h(
                "button",
                {
                  key: p.id,
                  type: "button",
                  className: "wb-set-preset" + (visionPresetId === p.id ? " active" : ""),
                  onClick: function() {
                    applyVisionPreset(p);
                  }
                },
                p.label
              );
            })
          ),
          h(
            "p",
            { className: "wb-set-hint" },
            "\u9700\u652F\u6301\u591A\u6A21\u6001 / \u8BC6\u56FE\u7684 OpenAI \u517C\u5BB9\u63A5\u53E3\uFF1B\u672A\u914D\u7F6E\u65F6\u8D34\u56FE\u65E0\u6CD5\u751F\u6210\u89C6\u89C9\u89C4\u683C\u3002"
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
                placeholder: visionKeyConfigured ? "\u7559\u7A7A\u8868\u793A\u4E0D\u4FEE\u6539\uFF1B\u8F93\u5165\u65B0\u503C\u5219\u8986\u76D6" : "\u5FC5\u586B\uFF08\u667A\u8C31 / \u901A\u4E49\u7B49\uFF09",
                onChange: function(e) {
                  patchDraft(setDraft, ["vision", "api_key"], e.target.value);
                }
              },
              true,
              visionKeyConfigured ? h(
                "div",
                { className: "wb-set-field-meta" },
                /^•+$/.test(String(vision.api_key || "")) ? "\u5F53\u524D\u5DF2\u914D\u7F6E\uFF08\u5DF2\u8131\u654F\uFF09" : "\u5F53\u524D\u5DF2\u914D\u7F6E\uFF1A" + String(vision.api_key || "").replace(/./g, "*").slice(0, 8) + (String(vision.api_key || "").length > 4 ? String(vision.api_key || "").slice(-4) : "****"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "wb-set-clear",
                    onClick: function() {
                      patchDraft(setDraft, ["vision", "api_key"], "");
                      setMsg("\u5DF2\u6E05\u9664\u89C6\u89C9 API Key\uFF0C\u4FDD\u5B58\u540E\u751F\u6548");
                      setMsgOk(true);
                    }
                  },
                  "\u6E05\u9664\u754C\u9762\u8986\u76D6"
                )
              ) : null
            ),
            labeledField(
              "API Base URL",
              {
                value: vision.base_url || "",
                placeholder: "https://open.bigmodel.cn/api/paas/v4",
                onChange: function(e) {
                  patchDraft(setDraft, ["vision", "base_url"], e.target.value);
                }
              },
              true,
              h("div", { className: "wb-set-field-meta" }, "\u4F8B\uFF1Ahttps://open.bigmodel.cn/api/paas/v4/")
            ),
            labeledField(
              "\u89C6\u89C9\u6A21\u578B\u540D\u79F0",
              {
                value: vision.model || "",
                placeholder: "glm-4v-flash",
                onChange: function(e) {
                  patchDraft(setDraft, ["vision", "model"], e.target.value);
                }
              },
              true,
              h(
                "div",
                { className: "wb-set-field-meta" },
                "\u4F8B\uFF1Aglm-4v-flash\u3001glm-4v\u3001qwen-vl-plus"
              )
            )
          )
        )
      )
    );
    var sectionAuto = h(
      "div",
      { className: "wb-set-auto-stack" },
      h(
        "div",
        { className: "wb-set-card" },
        h("h3", null, "\u81EA\u52A8\u5316\u4EFB\u52A1\u63A8\u9001"),
        h(
          "div",
          { className: "body" },
          h(
            "p",
            { className: "wb-set-hint" },
            "\u4F01\u5FAE\u7FA4\u6D88\u606F\u4E0E\u98DE\u4E66\u591A\u7EF4\u8868\u683C\u5199\u6570\u662F\u4E24\u5957\u72EC\u7ACB\u80FD\u529B\uFF0C\u53EF\u53EA\u5F00\u5176\u4E00\u3002\u4FDD\u5B58\u5199\u5165\u5F15\u64CE config.yaml \u2192 automations\u3002"
          ),
          h(
            "div",
            { className: "wb-set-grid" },
            field(
              "\u7FA4\u673A\u5668\u4EBA Webhook",
              {
                type: "password",
                autoComplete: "new-password",
                value: auto.wecom_webhook_key || "",
                placeholder: "\u5B8C\u6574 Webhook \u5730\u5740\uFF0C\u6216 key= \u540E\u7684\u503C",
                onChange: function(e) {
                  patchDraft(setDraft, ["automations", "wecom_webhook_key"], e.target.value);
                }
              },
              true
            )
          ),
          h(
            "div",
            { className: "wb-set-check", style: { marginBottom: "8px" } },
            h("input", {
              type: "checkbox",
              checked: !!auto.wecom_push_enabled,
              onChange: function(e) {
                patchDraft(setDraft, ["automations", "wecom_push_enabled"], e.target.checked);
              }
            }),
            h("span", null, "\u5F00\u542F\u81EA\u52A8\u5316\u7ED3\u679C\u63A8\u9001")
          ),
          h(
            "div",
            { className: "wb-set-check" },
            h("input", {
              type: "checkbox",
              checked: !!auto.wecom_push_dry_run,
              onChange: function(e) {
                patchDraft(setDraft, ["automations", "wecom_push_dry_run"], e.target.checked);
              }
            }),
            h("span", null, "\u63A8\u9001\u8054\u8C03\u6A21\u5F0F\uFF08\u4EC5\u6253\u65E5\u5FD7\uFF09")
          ),
          h(
            "p",
            { className: "wb-set-hint", style: { marginTop: "12px", marginBottom: 0 } },
            "\u5F00\u542F\u540E\uFF0C\u4EFB\u52A1\u52FE\u9009\u300C\u63A8\u9001\u5230\u4F01\u4E1A\u5FAE\u4FE1\u300D\u4E14\u6267\u884C\u6210\u529F\u65F6\u4F1A\u53D1\u5230\u4E0A\u8FF0\u7FA4\uFF1B\u8054\u8C03\u6A21\u5F0F\u4E0D\u771F\u6B63\u8C03\u7528\u4F01\u5FAE\u63A5\u53E3\u3002"
          )
        )
      ),
      h(
        "div",
        { className: "wb-set-card" },
        h("h3", null, "\u98DE\u4E66\u591A\u7EF4\u8868\u683C\u540C\u6B65"),
        h(
          "div",
          { className: "body" },
          h(
            "div",
            { className: "wb-set-grid" },
            field(
              "\u98DE\u4E66\u5E94\u7528 App ID",
              {
                value: auto.feishu_app_id || "",
                placeholder: "cli_xxxxxxxx",
                onChange: function(e) {
                  patchDraft(setDraft, ["automations", "feishu_app_id"], e.target.value);
                }
              },
              true
            ),
            field(
              "\u98DE\u4E66\u5E94\u7528 App Secret",
              {
                type: "password",
                autoComplete: "new-password",
                value: auto.feishu_app_secret || "",
                placeholder: "\u5F00\u653E\u5E73\u53F0\u51ED\u8BC1\u9875\u590D\u5236\uFF1B\u52FF\u63D0\u4EA4 git",
                onChange: function(e) {
                  patchDraft(setDraft, ["automations", "feishu_app_secret"], e.target.value);
                }
              },
              true
            )
          ),
          h(
            "div",
            { className: "wb-set-check", style: { marginBottom: "8px", marginTop: "4px" } },
            h("input", {
              type: "checkbox",
              checked: !!auto.feishu_bitable_enabled,
              onChange: function(e) {
                patchDraft(setDraft, ["automations", "feishu_bitable_enabled"], e.target.checked);
              }
            }),
            h("span", null, "\u5F00\u542F\u98DE\u4E66\u591A\u7EF4\u8868\u683C\u540C\u6B65")
          ),
          h(
            "div",
            { className: "wb-set-check" },
            h("input", {
              type: "checkbox",
              checked: !!auto.feishu_bitable_dry_run,
              onChange: function(e) {
                patchDraft(setDraft, ["automations", "feishu_bitable_dry_run"], e.target.checked);
              }
            }),
            h("span", null, "\u5199\u8868\u8054\u8C03\u6A21\u5F0F\uFF08\u4EC5\u6253\u65E5\u5FD7\uFF09")
          ),
          h(
            "p",
            { className: "wb-set-hint", style: { marginTop: "12px", marginBottom: 0 } },
            "\u603B\u5F00\u5173\u4E0E\u4F01\u5FAE\u4E92\u4E0D\u5E72\u6D89\u3002\u4EFB\u52A1\u8FD8\u9700\u5F00\u542F\u300C\u540C\u6B65\u5230\u98DE\u4E66\u591A\u7EF4\u8868\u683C\u300D\u5E76\u586B\u5199 app_token / table_id\u3002"
          )
        )
      )
    );
    var sectionBranding = h(
      "div",
      { className: "wb-set-card" },
      h("h3", null, "\u5E94\u7528\u914D\u7F6E"),
      h(
        "div",
        { className: "body" },
        h("p", { className: "wb-set-hint" }, "\u81EA\u5B9A\u4E49\u5E94\u7528 logo\u3001\u540D\u79F0\u548C\u6982\u89C8\uFF1B\u542F\u7528\u540E\u5237\u65B0\u9875\u9762\u751F\u6548\uFF0C\u5173\u95ED\u5219\u6062\u590D\u5185\u7F6E\u9ED8\u8BA4\u503C\u3002"),
        h(
          "div",
          { className: "wb-set-check", style: { marginBottom: "12px" } },
          h("input", {
            type: "checkbox",
            checked: !!branding.enabled,
            onChange: function(e) {
              setBranding(Object.assign({}, branding, { enabled: e.target.checked }));
            }
          }),
          h("span", null, "\u542F\u7528\u81EA\u5B9A\u4E49\u914D\u7F6E")
        ),
        h(
          "div",
          { className: "wb-set-field", style: { marginBottom: "12px" } },
          h("label", null, "\u5E94\u7528 Logo"),
          h(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } },
            branding.logo_url ? h("img", { src: branding.logo_url, alt: "logo", style: { width: "48px", height: "48px", objectFit: "contain", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "2px" } }) : h("span", { style: { width: "48px", height: "48px", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "1px dashed #cbd5e1", borderRadius: "8px", color: "#94a3b8", fontSize: "11px" } }, "\u672A\u4E0A\u4F20"),
            h("input", {
              ref: logoInputRef,
              type: "file",
              accept: "image/png,image/jpeg,image/svg+xml",
              style: { display: "none" },
              onChange: function(e) {
                if (e.target.files && e.target.files[0]) uploadLogo(e.target.files[0]);
              }
            }),
            h("button", {
              type: "button",
              className: "wb-set-btn",
              disabled: brandingBusy,
              onClick: function() {
                if (logoInputRef.current) logoInputRef.current.click();
              }
            }, "\u4E0A\u4F20 Logo")
          )
        ),
        h(
          "div",
          { className: "wb-set-field full", style: { marginBottom: "12px" } },
          h("label", null, "\u5E94\u7528\u540D\u79F0"),
          h("input", {
            type: "text",
            value: branding.app_name || "",
            placeholder: "\u6C5F\u897F\u4E2D\u8F6F\u5DE5\u4F5C\u52A9\u624B",
            onChange: function(e) {
              setBranding(Object.assign({}, branding, { app_name: e.target.value }));
            }
          })
        ),
        h(
          "div",
          { className: "wb-set-field full", style: { marginBottom: "12px" } },
          h("label", null, "\u5E94\u7528\u6982\u89C8"),
          h("input", {
            type: "text",
            value: branding.app_overview || "",
            placeholder: "\u6C5F\u897F\u4E2D\u8F6F\uFF0C\u8BA9\u5236\u9020\u66F4\u667A\u80FD",
            onChange: function(e) {
              setBranding(Object.assign({}, branding, { app_overview: e.target.value }));
            }
          })
        ),
        h(
          "div",
          { className: "wb-set-actions" },
          h("button", {
            type: "button",
            className: "wb-set-btn primary",
            disabled: brandingBusy,
            onClick: function() {
              saveBranding();
            }
          }, brandingBusy ? "\u5904\u7406\u4E2D\u2026" : branding.enabled ? "\u4FDD\u5B58\u5E76\u542F\u7528" : "\u4FDD\u5B58\u914D\u7F6E"),
          h("button", {
            type: "button",
            className: "wb-set-btn",
            disabled: brandingBusy,
            onClick: function() {
              loadBranding();
            }
          }, "\u91CD\u65B0\u52A0\u8F7D")
        ),
        brandingMsg ? h("p", { className: "wb-set-msg" + (brandingOk ? " ok" : " err"), style: { marginTop: "8px" } }, brandingMsg) : null
      )
    );
    var pluginPanelProps = {
      apiRef: pluginApiRef,
      reportStatus: reportPluginStatus
    };
    var activeSection = tab === "branding" ? sectionBranding : tab === "llm" ? sectionLlm : tab === "remote_review" ? h(WbRemoteReviewPanel, pluginPanelProps) : tab === "cursor_coding" ? h(WbCursorCodingPanel, pluginPanelProps) : tab === "automations" ? sectionAuto : sectionMes;
    return h(
      "div",
      { className: "wb-set", ref: rootRef },
      h(
        "p",
        { className: "wb-set-lead" },
        maskVendorUiText(
          "WorkBuddy \u914D\u7F6E\u4E2D\u5FC3\uFF1AMES / \u5546\u7528\u6A21\u578B / \u8FDC\u7AEF\u5BA1\u7801 / \u516C\u5171\u6A21\u578B / \u63A8\u9001\u3002\u5E95\u90E8\u7EDF\u4E00\u4FDD\u5B58\u5F53\u524D\u9875\u3002\u516C\u5171\u6A21\u578B\u53EA\u8BA4\u672C\u9875\u3002\u90E8\u7F72\u89C4\u5219\u5199\u5728\u5404\u76EE\u6807\u5DE5\u7A0B .workbuddy/\u3002"
        )
      ),
      h(
        "div",
        { className: "wb-set-shell" },
        h(
          "nav",
          { className: "wb-set-nav", "aria-label": "\u914D\u7F6E\u5206\u7C7B" },
          SET_NAV.map(function(item) {
            return h(
              "button",
              {
                key: item.id,
                type: "button",
                className: "wb-set-nav-btn" + (tab === item.id ? " active" : ""),
                onClick: function() {
                  setTab(item.id);
                  setMsg("");
                }
              },
              maskVendorUiText(item.label)
            );
          })
        ),
        h(
          "div",
          { className: "wb-set-main" },
          activeSection
        )
      ),
      h(
        "div",
        { className: "wb-set-bar" },
        msg ? h("span", { className: "wb-set-msg" + (msgOk ? " ok" : " err") }, maskVendorUiText(msg)) : null,
        h(
          "button",
          {
            type: "button",
            className: "wb-set-btn",
            disabled: busy,
            onClick: loadCurrent
          },
          "\u91CD\u65B0\u52A0\u8F7D"
        ),
        h(
          "button",
          {
            type: "button",
            className: "wb-set-btn primary",
            disabled: busy,
            onClick: saveCurrent
          },
          busy ? "\u5904\u7406\u4E2D\u2026" : "\u4FDD\u5B58\u914D\u7F6E"
        )
      )
    );
  }
  ctx.field = field;
  ctx.hideHostSettingsDupes = hideHostSettingsDupes;
  ctx.WbRemoteReviewPanel = WbRemoteReviewPanel;
  ctx.WbCursorCodingPanel = WbCursorCodingPanel;
  ctx.WorkBuddyHeaderLogout = WorkBuddyHeaderLogout;
  ctx.WorkBuddySettingsSection = WorkBuddySettingsSection;
}

// client-src/usage-helpers.js
function installUsageHelpers(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  function fmtUsageTokens(n) {
    var x = Number(n) || 0;
    if (x >= 1e6) {
      return (x / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    }
    if (x >= 1e3) {
      return (x / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    }
    return String(Math.round(x));
  }
  function fmtUsageTokensTitle(n) {
    return Math.round(Number(n) || 0).toLocaleString("zh-CN");
  }
  function qualityLabel(q, source) {
    if (q === "provider") return "\u4F9B\u5E94\u5546\u56DE\u4F20";
    if (q === "session") return "DSH \u4F1A\u8BDD";
    if (q === "sdk") {
      return maskVendorUiText(source === "llm" ? "DSH \u4F1A\u8BDD" : "Cursor SDK");
    }
    if (q === "estimate") return "\u4F30\u7B97\uFF08\u975E\u771F\u503C\uFF09";
    return "\u672A\u56DE\u4F20";
  }
  function usageNiceMax(v) {
    v = Number(v) || 0;
    if (v <= 0) return 1;
    if (v <= 10) return 10;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / exp) * exp;
  }
  function usageMd(date) {
    var s = String(date || "");
    return s.length >= 10 ? s.slice(5).replace("-", "/") : s;
  }
  function usageMonthLabel(ym) {
    var s = String(ym || "");
    if (s.length >= 7) return s.slice(0, 4) + "\u5E74" + String(Number(s.slice(5, 7))) + "\u6708";
    return "";
  }
  function usageShowDayTick(i, n, label, axis) {
    if (axis === "hour") {
      if (n <= 8) return true;
      return i === 0 || i === 8 || i === 15 || i === n - 1;
    }
    if (n <= 8) return true;
    if (i === 0 || i === n - 1) return true;
    var d = String(label || "");
    var dd = d.length >= 2 ? d.slice(-2) : "";
    return dd === "01" || dd === "08" || dd === "15" || dd === "22";
  }
  function usageChartWidth(n) {
    return Math.max(340, (n || 1) * 44);
  }
  function usagePlotBox(n) {
    var L = 40, R = 28, T = 8, B = 26, H = 150;
    var W = usageChartWidth(n);
    return { W, H, L, R, T, B, iw: W - L - R, ih: H - T - B };
  }
  function usageXTickAnchor(i, n) {
    if (n > 1 && i === 0) return "start";
    if (n > 1 && i === n - 1) return "end";
    return "middle";
  }
  function usageTipShift(xPct) {
    if (xPct >= 82) return "translateX(-100%)";
    if (xPct <= 18) return "translateX(0)";
    return "translateX(-50%)";
  }
  function usageChartScroll(n, child) {
    return h(
      "div",
      { className: "wb-usage-chart-scroll" },
      h("div", { className: "wb-usage-chart-inner" }, child)
    );
  }
  function usageAlignMonthScroll(el, idx, n, align) {
    if (!el || n < 1) return;
    var view = el.clientWidth;
    var total = el.scrollWidth;
    if (view < 8 || total <= view + 1) return;
    var i = Math.max(0, Math.min(n - 1, idx | 0));
    var left = align === "start" ? i / n * total : (i + 1) / n * total - view;
    if (left < 0) left = 0;
    var max = total - view;
    if (left > max) left = max;
    el.scrollLeft = left;
  }
  function usageHourScrollIndex(hourly) {
    var byH = {};
    (hourly || []).forEach(function(r) {
      byH[Number(r.hour)] = r;
    });
    var peak = -1;
    var peakTok = -1;
    for (var hr = 0; hr < 24; hr++) {
      var row = byH[hr] || {};
      var tok = (Number(row.llm_tokens) || 0) + (Number(row.cursor_tokens) || 0);
      if (tok > peakTok) {
        peakTok = tok;
        peak = hr;
      }
    }
    var workStart = 8;
    if (peak < 0 || peakTok <= 0) return workStart;
    var start = peak - 4;
    if (start < workStart) start = workStart;
    if (start > 16) start = 16;
    return start;
  }
  function usageScrollToFocus(root, dates, focusYmd) {
    if (!root) return;
    var list = dates || [];
    var n = list.length || 1;
    var idx = n - 1;
    var want = String(focusYmd || "").slice(0, 10);
    if (want) {
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].date || "").slice(0, 10) === want) {
          idx = i;
          break;
        }
      }
    }
    var nodes = root.querySelectorAll(".wb-usage-chart-scroll");
    for (var j = 0; j < nodes.length; j++) {
      usageAlignMonthScroll(nodes[j], idx, n);
    }
  }
  function usageScrollToHour(root, hourly) {
    if (!root) return;
    var idx = usageHourScrollIndex(hourly);
    function apply() {
      var nodes = root.querySelectorAll(".wb-usage-chart-scroll");
      for (var j = 0; j < nodes.length; j++) {
        usageAlignMonthScroll(nodes[j], idx, 24, "start");
      }
    }
    apply();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function() {
        apply();
        requestAnimationFrame(apply);
      });
    } else {
      setTimeout(apply, 0);
    }
  }
  function usageTodayYmd() {
    try {
      return (/* @__PURE__ */ new Date()).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).slice(0, 10);
    } catch (e) {
      return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    }
  }
  function usageAddDays(ymd, delta) {
    var parts = String(ymd || "").split("-");
    if (parts.length < 3) return usageTodayYmd();
    var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + Number(delta || 0)));
    return d.toISOString().slice(0, 10);
  }
  function usageKpiDayLabel(ymd) {
    var day = String(ymd || "").slice(0, 10);
    var md = usageMd(day);
    if (!md) return "\u4ECA\u65E5";
    return day === usageTodayYmd() ? "\u4ECA\u65E5 " + md : md;
  }
  function usageCatmullPath(pts) {
    if (!pts.length) return "";
    var d = "M " + pts[0].x.toFixed(2) + " " + pts[0].y.toFixed(2);
    if (pts.length === 1) return d;
    if (pts.length === 2) {
      return d + " L " + pts[1].x.toFixed(2) + " " + pts[1].y.toFixed(2);
    }
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)];
      var p1 = pts[i];
      var p2 = pts[i + 1];
      var p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1x = p1.x + (p2.x - p0.x) / 6;
      var c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6;
      var c2y = p2.y - (p3.y - p1.y) / 6;
      d += " C " + c1x.toFixed(2) + " " + c1y.toFixed(2) + ", " + c2x.toFixed(2) + " " + c2y.toFixed(2) + ", " + p2.x.toFixed(2) + " " + p2.y.toFixed(2);
    }
    return d;
  }
  function usageCurveSvg(values, labels, fill, stroke, gid, axis) {
    var n = values.length || 1;
    var box = usagePlotBox(n);
    var W = box.W, H = box.H, L = box.L, R = box.R, T = box.T, iw = box.iw, ih = box.ih;
    var max = usageNiceMax(Math.max.apply(null, [0].concat(values)));
    function xAt(i) {
      return L + (n <= 1 ? iw / 2 : i * iw / (n - 1));
    }
    function yAt(v) {
      return T + ih - (max ? v / max * ih : 0);
    }
    var pts = values.map(function(v, i) {
      return { x: xAt(i), y: yAt(v) };
    });
    var line = usageCatmullPath(pts);
    var baseY = (T + ih).toFixed(2);
    var area = line ? line + " L " + xAt(n - 1).toFixed(2) + " " + baseY + " L " + xAt(0).toFixed(2) + " " + baseY + " Z" : "";
    var clip = "uc-" + String(gid || "g").replace(/[^a-zA-Z0-9_-]/g, "");
    var grid = [0, 0.5, 1].map(function(f) {
      var yy = yAt(max * f);
      var label = f === 0 ? "0" : String(Math.round(max * f));
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e5e7eb"/><text x="' + (L - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + label + "</text>";
    }).join("");
    var xlabs = labels.map(function(lb, i) {
      if (!usageShowDayTick(i, n, lb, axis)) return "";
      return '<text x="' + xAt(i) + '" y="' + (H - 8) + '" text-anchor="' + usageXTickAnchor(i, n) + '" font-size="10" fill="#94a3b8">' + String(lb) + "</text>";
    }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="150" preserveAspectRatio="none"><defs><linearGradient id="' + clip + '-fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="' + stroke + '" stop-opacity="0.38"/><stop offset="100%" stop-color="' + stroke + '" stop-opacity="0.04"/></linearGradient><clipPath id="' + clip + '"><rect x="' + L + '" y="' + T + '" width="' + iw + '" height="' + ih + '"/></clipPath></defs>' + grid + '<g clip-path="url(#' + clip + ')"><path d="' + area + '" fill="url(#' + clip + '-fg)"/><path d="' + line + '" fill="none" stroke="' + stroke + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>' + xlabs + "</svg>";
  }
  function UsageCurveChart(props) {
    var hoverState = useState(-1);
    var hover = hoverState[0];
    var setHover = hoverState[1];
    var values = props.values || [];
    var labels = props.labels || [];
    var axis = props.axis === "hour" ? "hour" : "day";
    var n = values.length || 1;
    var box = usagePlotBox(n);
    var W = box.W, H = box.H, L = box.L, T = box.T, iw = box.iw, ih = box.ih;
    var max = usageNiceMax(Math.max.apply(null, [0].concat(values)));
    function xAt(i) {
      return L + (n <= 1 ? iw / 2 : i * iw / (n - 1));
    }
    function yAt(v) {
      return T + ih - (max ? v / max * ih : 0);
    }
    function onMove(ev) {
      var rect = ev.currentTarget.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var scale = rect.width / W;
      var t = n <= 1 ? 0 : (x / scale - L) / Math.max(1, iw);
      var i = Math.round(Math.max(0, Math.min(1, t)) * (n - 1));
      setHover(i);
    }
    var xPct = xAt(hover) / W * 100;
    var tip = hover >= 0 && hover < n ? {
      label: labels[hover] || "",
      value: values[hover] || 0,
      left: xPct,
      tipShift: usageTipShift(xPct),
      top: yAt(values[hover] || 0) / H * 100,
      gTop: T / H * 100,
      gH: ih / H * 100
    } : null;
    return h(
      "div",
      {
        className: "wb-usage-chart-plot",
        style: { color: props.stroke },
        onMouseMove: onMove,
        onMouseLeave: function() {
          setHover(-1);
        }
      },
      h("div", { dangerouslySetInnerHTML: { __html: usageCurveSvg(values, labels, props.fill, props.stroke, props.gid, axis) } }),
      tip ? h("div", { className: "wb-usage-guide", style: { left: tip.left + "%", top: tip.gTop + "%", height: tip.gH + "%" } }) : null,
      tip ? h("div", { className: "wb-usage-dot", style: { left: tip.left + "%", top: tip.top + "%" } }) : null,
      tip ? h(
        "div",
        { className: "wb-usage-tip", style: { left: tip.left + "%", transform: tip.tipShift } },
        h("div", { className: "d" }, String(tip.label)),
        "\u8BF7\u6C42 " + String(tip.value)
      ) : null
    );
  }
  function usageStackSvg(rows, colors, hoverIdx, axis) {
    var n = rows.length || 1;
    var box = usagePlotBox(n);
    var W = box.W, H = box.H, L = box.L, R = box.R, T = box.T, iw = box.iw, ih = box.ih;
    var totals = rows.map(function(r) {
      return r.hit + r.miss + r.out;
    });
    var max = usageNiceMax(Math.max.apply(null, [0].concat(totals)));
    var slot = iw / n;
    var bw = Math.max(2, slot * 0.58);
    var hi = hoverIdx == null ? -1 : hoverIdx;
    var grid = [0, 0.5, 1].map(function(f) {
      var yy = T + ih - f * ih;
      var label = f === 0 ? "0" : fmtUsageTokens(max * f);
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#e5e7eb"/><text x="' + (L - 6) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + label + "</text>";
    }).join("");
    var bars = rows.map(function(r, i) {
      var cx = L + (i + 0.5) * slot;
      var x0 = cx - bw / 2;
      var y = T + ih;
      var segs = [
        [r.out, colors.out],
        [r.miss, colors.miss],
        [r.hit, colors.hit]
      ];
      var hiRect = i === hi ? '<rect x="' + (L + i * slot).toFixed(1) + '" y="' + T + '" width="' + slot.toFixed(1) + '" height="' + ih + '" fill="rgba(15,23,42,0.06)"/>' : "";
      var rects = segs.map(function(seg) {
        var v = seg[0], c = seg[1];
        var hh = max ? v / max * ih : 0;
        y -= hh;
        if (hh <= 0.4) return "";
        return '<rect x="' + x0.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hh.toFixed(1) + '" fill="' + c + '"/>';
      }).join("");
      var showLab = usageShowDayTick(i, n, r.label, axis);
      var lab = showLab ? '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="' + usageXTickAnchor(i, n) + '" font-size="10" fill="#94a3b8">' + r.label + "</text>" : "";
      return hiRect + rects + lab;
    }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="150" preserveAspectRatio="none">' + grid + bars + "</svg>";
  }
  function UsageStackChart(props) {
    var hoverState = useState(-1);
    var hover = hoverState[0];
    var setHover = hoverState[1];
    var rows = props.rows || [];
    var axis = props.axis === "hour" ? "hour" : "day";
    var n = rows.length || 1;
    var box = usagePlotBox(n);
    var W = box.W, H = box.H, L = box.L, T = box.T, iw = box.iw, ih = box.ih;
    function onMove(ev) {
      var rect = ev.currentTarget.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var scale = rect.width / W;
      var t = (x / scale - L) / Math.max(1, iw);
      var i = Math.floor(Math.max(0, Math.min(0.999, t)) * n);
      setHover(i);
    }
    var row = hover >= 0 && hover < n ? rows[hover] : null;
    var xPct = (L + (hover + 0.5) * (iw / n)) / W * 100;
    var tip = row ? {
      left: xPct,
      tipShift: usageTipShift(xPct),
      colL: (L + hover * (iw / n)) / W * 100,
      colW: iw / n / W * 100,
      gTop: T / H * 100,
      gH: ih / H * 100
    } : null;
    return h(
      "div",
      {
        className: "wb-usage-chart-plot",
        onMouseMove: onMove,
        onMouseLeave: function() {
          setHover(-1);
        }
      },
      h("div", { dangerouslySetInnerHTML: { __html: usageStackSvg(rows, props.colors, hover, axis) } }),
      tip ? h("div", { className: "wb-usage-colhi", style: { left: tip.colL + "%", width: tip.colW + "%", top: tip.gTop + "%", height: tip.gH + "%" } }) : null,
      row ? h(
        "div",
        { className: "wb-usage-tip", style: { left: tip.left + "%", transform: tip.tipShift } },
        h("div", { className: "d" }, String(row.label || "")),
        h("div", null, "\u5408\u8BA1 " + fmtUsageTokens((row.hit || 0) + (row.miss || 0) + (row.out || 0))),
        h("div", null, "\u547D\u4E2D\u7F13\u5B58 " + fmtUsageTokens(row.hit)),
        h("div", null, "\u672A\u547D\u4E2D " + fmtUsageTokens(row.miss)),
        h("div", null, "\u8F93\u51FA " + fmtUsageTokens(row.out))
      ) : null
    );
  }
  function usageHourRange(h2) {
    var a = (h2 < 10 ? "0" : "") + h2 + ":00";
    if (h2 >= 23) return "23:00\uFF5E24:00";
    var n = h2 + 1;
    return a + "\uFF5E" + (n < 10 ? "0" : "") + n + ":00";
  }
  function usageHourCombinedRows(hourly) {
    var byH = {};
    (hourly || []).forEach(function(r2) {
      byH[Number(r2.hour)] = r2;
    });
    var out = [];
    for (var h2 = 0; h2 < 24; h2++) {
      var r = byH[h2] || {};
      out.push({
        key: h2,
        range: usageHourRange(h2),
        tick: null,
        llm_tokens: Number(r.llm_tokens) || 0,
        llm_calls: Number(r.llm_calls) || 0,
        cursor_tokens: Number(r.cursor_tokens) || 0,
        cursor_calls: Number(r.cursor_calls) || 0
      });
    }
    return out;
  }
  function usageDayCombinedRows(daily) {
    return (daily || []).map(function(r) {
      var date = String(r.date || "").slice(0, 10);
      var md = usageMd(date) || date;
      return {
        key: date,
        range: md,
        tick: md,
        llm_tokens: Number(r.llm_tokens) || 0,
        llm_calls: Number(r.llm_calls) || 0,
        cursor_tokens: Number(r.cursor_tokens) || 0,
        cursor_calls: Number(r.cursor_calls) || 0
      };
    });
  }
  var USAGE_HOUR_GEO = { W: 560, H: 200, L: 48, R: 14, T: 16, B: 30 };
  function usageDualCombinedSvg(rows, hoverIdx, axis) {
    var g = USAGE_HOUR_GEO;
    var W = g.W, H = g.H, L = g.L, R = g.R, T = g.T, B = g.B;
    var iw = W - L - R, ih = H - T - B;
    var n = Math.max(1, (rows || []).length);
    var llmVals = [];
    var curVals = [];
    for (var i = 0; i < n; i++) {
      llmVals.push(rows[i] && rows[i].llm_tokens || 0);
      curVals.push(rows[i] && rows[i].cursor_tokens || 0);
    }
    var max = usageNiceMax(Math.max.apply(null, [0].concat(llmVals, curVals)));
    var slot = iw / n;
    var outer = Math.max(1.5, slot * 0.18);
    var pairW = Math.max(4, slot - outer);
    var bw = pairW / 2;
    var hi = hoverIdx == null ? -1 : hoverIdx;
    var cLlm = "#ff5a1f";
    var cCur = "#14b8a6";
    var grid = [0, 0.5, 1].map(function(f) {
      var yy = T + ih - f * ih;
      var label = f === 0 ? "0" : fmtUsageTokens(max * f);
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="#eceef2"/><text x="' + (L - 8) + '" y="' + (yy + 3) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + label + "</text>";
    }).join("");
    var hourMarks = { 0: "00:00", 8: "08:00", 15: "15:00", 23: "23:00" };
    var bars = "";
    for (var j = 0; j < n; j++) {
      var slotX = L + j * slot;
      var cx = slotX + slot / 2;
      if (j === hi) {
        bars += '<rect x="' + slotX.toFixed(1) + '" y="' + T + '" width="' + slot.toFixed(1) + '" height="' + ih + '" fill="rgba(15,23,42,0.04)"/>';
      }
      var xL = cx - pairW / 2;
      var xC = xL + bw;
      var hL = max ? llmVals[j] / max * ih : 0;
      var hC = max ? curVals[j] / max * ih : 0;
      if (hL > 0.6) {
        bars += '<rect x="' + xL.toFixed(1) + '" y="' + (T + ih - hL).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hL.toFixed(1) + '" fill="' + cLlm + '"/>';
      }
      if (hC > 0.6) {
        bars += '<rect x="' + xC.toFixed(1) + '" y="' + (T + ih - hC).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + hC.toFixed(1) + '" fill="' + cCur + '"/>';
      }
      var tick = "";
      if (axis === "day") {
        if (usageShowDayTick(j, n, rows[j] && rows[j].tick)) {
          tick = String(rows[j] && rows[j].tick || "");
        }
      } else if (hourMarks[j]) {
        tick = hourMarks[j];
      }
      if (tick) {
        bars += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#94a3b8">' + tick + "</text>";
      }
    }
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="200" preserveAspectRatio="none">' + grid + bars + "</svg>";
  }
  function UsageDualCombinedChart(props) {
    var hoverState = useState(-1);
    var hover = hoverState[0];
    var setHover = hoverState[1];
    var rows = props.rows || [];
    var axis = props.axis === "day" ? "day" : "hour";
    var n = Math.max(1, rows.length);
    var g = USAGE_HOUR_GEO;
    var W = g.W, H = g.H, L = g.L, R = g.R, T = g.T, B = g.B;
    var iw = W - L - R, ih = H - T - B;
    function onMove(ev) {
      var rect = ev.currentTarget.getBoundingClientRect();
      var x = ev.clientX - rect.left;
      var scale = rect.width / W;
      var t = (x / scale - L) / Math.max(1, iw);
      var i = Math.floor(Math.max(0, Math.min(0.999, t)) * n);
      setHover(i);
    }
    var row = hover >= 0 && hover < rows.length ? rows[hover] : null;
    var tip = row ? {
      left: Math.max(14, Math.min(86, (L + (hover + 0.5) * (iw / n)) / W * 100)),
      gTop: T / H * 100,
      gH: ih / H * 100
    } : null;
    return h(
      "div",
      {
        className: "wb-usage-hour-plot",
        onMouseMove: onMove,
        onMouseLeave: function() {
          setHover(-1);
        }
      },
      h("div", { dangerouslySetInnerHTML: { __html: usageDualCombinedSvg(rows, hover, axis) } }),
      tip ? h("div", { className: "wb-usage-hour-guide", style: { left: tip.left + "%", top: tip.gTop + "%", height: tip.gH + "%" } }) : null,
      row ? h(
        "div",
        { className: "wb-usage-hour-tip wb-usage-hour-tip-dual", style: { left: tip.left + "%" } },
        h("span", { className: "r" }, String(row.range || "")),
        h("span", { className: "v llm" }, "LLM " + fmtUsageTokens(row.llm_tokens)),
        h("span", { className: "c" }, String(row.llm_calls || 0) + " \u6B21"),
        h("span", { className: "v cur" }, maskVendorUiText("Cursor ") + fmtUsageTokens(row.cursor_tokens)),
        h("span", { className: "c" }, String(row.cursor_calls || 0) + " \u6B21")
      ) : null
    );
  }
  function usageHourCombinedCard(title, series, day, opts) {
    var monthMode = !!(opts && opts.monthMode);
    var rows = monthMode ? usageDayCombinedRows(series) : usageHourCombinedRows(series);
    var sumLlmTok = rows.reduce(function(a, r) {
      return a + r.llm_tokens;
    }, 0);
    var sumCurTok = rows.reduce(function(a, r) {
      return a + r.cursor_tokens;
    }, 0);
    var sumLlmCalls = rows.reduce(function(a, r) {
      return a + r.llm_calls;
    }, 0);
    var sumCurCalls = rows.reduce(function(a, r) {
      return a + r.cursor_calls;
    }, 0);
    var when = String(day || "").slice(0, 10) || "\u6240\u9009\u65E5\u671F";
    var monthLab = usageMonthLabel(opts && opts.monthLabel || when) || String(opts && opts.monthLabel || when).slice(0, 7);
    var rangeLab = monthMode ? monthLab + " \u9010\u65E5" : when + " 00:00\u201324:00";
    return h(
      "div",
      { className: "wb-set-card" },
      h("h3", null, maskVendorUiText(title)),
      h(
        "div",
        { className: "body" },
        h(
          "div",
          { className: "wb-usage-hour-sub" },
          maskVendorUiText(
            rangeLab + " \xB7 LLM " + sumLlmCalls + " \u6B21 / " + fmtUsageTokens(sumLlmTok) + " \xB7 Cursor " + sumCurCalls + " \u6B21 / " + fmtUsageTokens(sumCurTok)
          )
        ),
        h(
          "div",
          { className: "wb-usage-legend", style: { marginBottom: "8px" } },
          h("span", null, h("i", { style: { background: "#ff5a1f" } }), "LLM"),
          h("span", null, h("i", { style: { background: "#14b8a6" } }), maskVendorUiText("Cursor \u5199\u7801"))
        ),
        h(UsageDualCombinedChart, { rows, axis: monthMode ? "day" : "hour" })
      )
    );
  }
  function usageKpiCard(title, calls, tokens) {
    return h(
      "div",
      { className: "wb-usage-kpi" },
      h("div", { className: "k" }, maskVendorUiText(title)),
      h("div", { className: "row" }, h("span", { className: "t" }, "API \u8BF7\u6C42\u6B21\u6570"), h("span", { className: "n" }, String(calls || 0))),
      h("div", { className: "row" }, h("span", { className: "t" }, "Token \u6D88\u8017"), h("span", { className: "n", title: fmtUsageTokensTitle(tokens) }, fmtUsageTokens(tokens)))
    );
  }
  function usageTodayKpis(today, dateLabel) {
    var t = today || {};
    var llmT = t.llm || {};
    var curT = t.cursor || {};
    var day = dateLabel || "\u4ECA\u65E5";
    return h(
      "div",
      { className: "wb-usage-kpis" },
      usageKpiCard(day + " \xB7 LLM", llmT.calls, llmT.tokens),
      usageKpiCard(maskVendorUiText(day + " \xB7 Cursor \u5199\u7801"), curT.calls, curT.tokens)
    );
  }
  function usageMeterNode(title, subtitle, series, prefix, palette, extraNote, axis) {
    var axisMode = axis === "hour" ? "hour" : "day";
    var rows = series || [];
    if (axisMode === "hour") {
      var byH = {};
      rows.forEach(function(r) {
        byH[Number(r.hour)] = r;
      });
      rows = [];
      for (var hr = 0; hr < 24; hr++) {
        rows.push(byH[hr] || { hour: hr });
      }
    }
    var calls = rows.map(function(d) {
      return Number(d[prefix + "calls"]) || 0;
    });
    var labels = rows.map(function(d, i) {
      if (axisMode === "hour") {
        var hh = d.hour != null ? Number(d.hour) : i;
        return (hh < 10 ? "0" : "") + hh + ":00";
      }
      return usageMd(d.date);
    });
    var stacks = rows.map(function(d, i) {
      return {
        label: labels[i],
        hit: Number(d[prefix + "cache_hit"]) || 0,
        miss: Number(d[prefix + "cache_miss"]) || 0,
        out: Number(d[prefix + "output"]) || 0
      };
    });
    var sumCalls = calls.reduce(function(a, b) {
      return a + b;
    }, 0);
    var sumTok = rows.reduce(function(a, d) {
      return a + (Number(d[prefix + "tokens"]) || 0);
    }, 0);
    return h(
      "section",
      { className: "wb-usage-meter" },
      h("div", { className: "wb-usage-meter-title" }, maskVendorUiText(title)),
      h(
        "div",
        { className: "wb-usage-meter-sub" },
        maskVendorUiText(subtitle + (extraNote ? " \xB7 " + extraNote : ""))
      ),
      h(
        "div",
        { className: "wb-usage-meter-grid" },
        h(
          "div",
          { className: "wb-usage-chart" },
          h("div", { className: "wb-usage-chart-head" }, h("span", { className: "t" }, "API \u8BF7\u6C42\u6B21\u6570"), h("span", { className: "n" }, String(sumCalls))),
          usageChartScroll(calls.length, h(UsageCurveChart, { values: calls, labels, fill: palette.fill, stroke: palette.stroke, gid: prefix, axis: axisMode }))
        ),
        h(
          "div",
          { className: "wb-usage-chart" },
          h("div", { className: "wb-usage-chart-head" }, h("span", { className: "t" }, "Tokens"), h("span", { className: "n", title: fmtUsageTokensTitle(sumTok) }, fmtUsageTokens(sumTok))),
          usageChartScroll(stacks.length, h(UsageStackChart, { rows: stacks, colors: palette, axis: axisMode })),
          h(
            "div",
            { className: "wb-usage-legend" },
            h("span", null, h("i", { style: { background: palette.hit } }), "\u8F93\u5165\uFF08\u547D\u4E2D\u7F13\u5B58\uFF09"),
            h("span", null, h("i", { style: { background: palette.miss } }), "\u8F93\u5165\uFF08\u672A\u547D\u4E2D\u7F13\u5B58\uFF09"),
            h("span", null, h("i", { style: { background: palette.out } }), "\u8F93\u51FA")
          )
        )
      )
    );
  }
  function usageMonthRangeFromDay(ymd) {
    var s = String(ymd || usageTodayYmd());
    var y = Number(s.slice(0, 4));
    var m = Number(s.slice(5, 7));
    if (!y || !m) {
      s = usageTodayYmd();
      y = Number(s.slice(0, 4));
      m = Number(s.slice(5, 7));
    }
    var from = s.slice(0, 7) + "-01";
    var last = new Date(y, m, 0).getDate();
    var to = s.slice(0, 7) + "-" + String(last).padStart(2, "0");
    var today = usageTodayYmd();
    if (to > today) to = today;
    return { from, to, label: s.slice(0, 7) };
  }
  function usagePeopleHBars(rows) {
    var list = (rows || []).slice().sort(function(a, b) {
      var ta = (Number(a.llm_tokens) || 0) + (Number(a.cursor_tokens) || 0);
      var tb = (Number(b.llm_tokens) || 0) + (Number(b.cursor_tokens) || 0);
      if (tb !== ta) return tb - ta;
      return String(a.display_name || a.username || "").localeCompare(
        String(b.display_name || b.username || ""),
        "zh"
      );
    });
    var maxTok = 0;
    list.forEach(function(r) {
      var llm = Number(r.llm_tokens) || 0;
      var cur = Number(r.cursor_tokens) || 0;
      if (llm > maxTok) maxTok = llm;
      if (cur > maxTok) maxTok = cur;
    });
    if (!list.length) {
      return h("p", { className: "wb-usage-people-sub" }, "\u6682\u65E0\u5458\u5DE5\u8D26\u53F7\u3002");
    }
    function barPct(n) {
      if (maxTok <= 0) return 0;
      var v = Number(n) || 0;
      if (v <= 0) return 0;
      return Math.max(2, Math.round(v / maxTok * 100));
    }
    return h(
      "div",
      { className: "wb-usage-hbar" },
      h(
        "div",
        { className: "wb-usage-hbar-legend" },
        h("span", null, h("i", { style: { background: "#3b82f6" } }), "LLM Token"),
        h("span", null, h("i", { style: { background: "#14b8a6" } }), maskVendorUiText("Cursor \u5199\u7801 Token"))
      ),
      list.map(function(r, idx) {
        var name = r.display_name || r.username || r.user_id || "\u2014";
        var llmTok = Number(r.llm_tokens) || 0;
        var curTok = Number(r.cursor_tokens) || 0;
        var llmCalls = Number(r.llm_calls) || 0;
        var curCalls = Number(r.cursor_calls) || 0;
        var total = llmTok + curTok;
        return h(
          "div",
          { className: "wb-usage-hbar-person", key: String(r.user_id || name) + "|" + idx },
          h(
            "div",
            { className: "wb-usage-hbar-head" },
            h("div", { className: "wb-usage-hbar-name", title: name }, name),
            h(
              "div",
              {
                className: "wb-usage-hbar-total",
                title: maskVendorUiText("LLM+Cursor \u5408\u8BA1 " + fmtUsageTokensTitle(total))
              },
              "\u5408\u8BA1 " + fmtUsageTokens(total)
            )
          ),
          h(
            "div",
            { className: "wb-usage-hbar-row" },
            h("div", { className: "wb-usage-hbar-lab" }, "LLM"),
            h(
              "div",
              { className: "wb-usage-hbar-track" },
              h("div", {
                className: "wb-usage-hbar-fill llm",
                style: { width: barPct(llmTok) + "%" },
                title: fmtUsageTokensTitle(llmTok) + " \xB7 " + llmCalls + " \u6B21"
              })
            ),
            h(
              "div",
              { className: "wb-usage-hbar-val", title: fmtUsageTokensTitle(llmTok) + " \xB7 API " + llmCalls + " \u6B21" },
              fmtUsageTokens(llmTok)
            )
          ),
          h(
            "div",
            { className: "wb-usage-hbar-row" },
            h("div", { className: "wb-usage-hbar-lab" }, maskVendorUiText("Cursor")),
            h(
              "div",
              { className: "wb-usage-hbar-track" },
              h("div", {
                className: "wb-usage-hbar-fill cursor",
                style: { width: barPct(curTok) + "%" },
                title: fmtUsageTokensTitle(curTok) + " \xB7 " + curCalls + " \u6B21"
              })
            ),
            h(
              "div",
              {
                className: "wb-usage-hbar-val",
                title: fmtUsageTokensTitle(curTok) + " \xB7 " + curCalls + " \u6B21"
              },
              fmtUsageTokens(curTok)
            )
          )
        );
      })
    );
  }
  function usagePeopleBarsNode(title, subtitle, rows) {
    return h(
      "section",
      { className: "wb-usage-people" },
      h("div", { className: "wb-usage-people-title" }, maskVendorUiText(title)),
      h("div", { className: "wb-usage-people-sub" }, maskVendorUiText(subtitle)),
      usagePeopleHBars(rows)
    );
  }
  ctx.fmtUsageTokens = fmtUsageTokens;
  ctx.fmtUsageTokensTitle = fmtUsageTokensTitle;
  ctx.qualityLabel = qualityLabel;
  ctx.usageNiceMax = usageNiceMax;
  ctx.usageMd = usageMd;
  ctx.usageMonthLabel = usageMonthLabel;
  ctx.usageShowDayTick = usageShowDayTick;
  ctx.usageChartWidth = usageChartWidth;
  ctx.usagePlotBox = usagePlotBox;
  ctx.usageXTickAnchor = usageXTickAnchor;
  ctx.usageTipShift = usageTipShift;
  ctx.usageChartScroll = usageChartScroll;
  ctx.usageAlignMonthScroll = usageAlignMonthScroll;
  ctx.usageHourScrollIndex = usageHourScrollIndex;
  ctx.usageScrollToFocus = usageScrollToFocus;
  ctx.usageScrollToHour = usageScrollToHour;
  ctx.usageTodayYmd = usageTodayYmd;
  ctx.usageAddDays = usageAddDays;
  ctx.usageKpiDayLabel = usageKpiDayLabel;
  ctx.usageCatmullPath = usageCatmullPath;
  ctx.usageCurveSvg = usageCurveSvg;
  ctx.UsageCurveChart = UsageCurveChart;
  ctx.usageStackSvg = usageStackSvg;
  ctx.UsageStackChart = UsageStackChart;
  ctx.usageHourRange = usageHourRange;
  ctx.usageHourCombinedRows = usageHourCombinedRows;
  ctx.usageDayCombinedRows = usageDayCombinedRows;
  ctx.usageDualCombinedSvg = usageDualCombinedSvg;
  ctx.UsageDualCombinedChart = UsageDualCombinedChart;
  ctx.usageHourCombinedCard = usageHourCombinedCard;
  ctx.usageKpiCard = usageKpiCard;
  ctx.usageTodayKpis = usageTodayKpis;
  ctx.usageMeterNode = usageMeterNode;
  ctx.usageMonthRangeFromDay = usageMonthRangeFromDay;
  ctx.usagePeopleHBars = usagePeopleHBars;
  ctx.usagePeopleBarsNode = usagePeopleBarsNode;
}

// client-src/login.js
function installLogin(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var formatLoginError = ctx.formatLoginError;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, fetchEngineApi = ctx.fetchEngineApi, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var WB_APP_DISPLAY_NAME = "\u6C5F\u897F\u4E2D\u8F6F\u5DE5\u4F5C\u52A9\u624B";
  function WorkBuddyLoginForm(props) {
    ensureCss();
    var onSuccess = props && props.onSuccess;
    var busyState = useState(false);
    var busy = busyState[0];
    var setBusy = busyState[1];
    var authErrState = useState(props && props.initialError || "");
    var authErr = authErrState[0];
    var setAuthErr = authErrState[1];
    var loginUserState = useState("");
    var loginUser = loginUserState[0];
    var setLoginUser = loginUserState[1];
    var loginPassState = useState("");
    var loginPass = loginPassState[0];
    var setLoginPass = loginPassState[1];
    var entKeyState = useState("jxzr");
    var entKey = entKeyState[0];
    var setEntKey = entKeyState[1];
    var entOpenState = useState(false);
    var entOpen = entOpenState[0];
    var setEntOpen = entOpenState[1];
    function selectedEnt() {
      return AUTH_ENTERPRISES.find(function(e) {
        return e.key === entKey;
      }) || AUTH_ENTERPRISES[1];
    }
    function doLogin() {
      var u = (loginUser || "").trim();
      var p = loginPass || "";
      if (!u || !p) {
        setAuthErr("\u8BF7\u8F93\u5165\u8D26\u53F7\u548C\u5BC6\u7801");
        return;
      }
      setAuthErr("");
      setBusy(true);
      fetchEngineApi("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          password: p,
          enterprise_code: String(selectedEnt().code || "").trim()
        })
      }).then(function(r) {
        return r.text().then(function(t) {
          var d = null;
          try {
            d = t ? JSON.parse(t) : null;
          } catch (eParse) {
            throw new Error(
              "\u767B\u5F55\u63A5\u53E3\u8FD4\u56DE\u975E JSON\uFF08HTTP " + r.status + "\uFF09\uFF1A" + String(t || "").slice(0, 80)
            );
          }
          if (!r.ok && (!d || !d.detail)) {
            throw new Error("\u767B\u5F55\u5931\u8D25\uFF08HTTP " + r.status + "\uFF09");
          }
          return d;
        });
      }).then(function(d) {
        if (!d || !d.ok || !d.token) throw new Error(d && d.detail || "\u767B\u5F55\u5931\u8D25");
        writeAuthSession({
          access_token: d.token,
          token_type: d.token_type || "Bearer",
          username: d.user && d.user.username || u,
          display_name: d.user && d.user.display_name || u,
          user_id: d.user && d.user.id || "",
          role: d.user && d.user.role || "user",
          enterprise_code: String(selectedEnt().code || "").trim(),
          expires_at: d.expires_at
        });
        fetchEngineApi("/api/auth/touch", {
          method: "POST",
          headers: authHeaders()
        }).catch(function() {
        });
        setLoginPass("");
        if (typeof onSuccess === "function") onSuccess(d.user || null);
      }).catch(function(err) {
        writeAuthSession(null);
        setAuthErr(typeof formatLoginError === "function" ? formatLoginError(err) : err && err.message ? err.message : String(err));
      }).finally(function() {
        setBusy(false);
      });
    }
    var logoUrl = engineBase() + "/zr-logo.png";
    return h(
      "div",
      { className: "wb-login-card" },
      h(
        "div",
        { className: "wb-login-brand" },
        h("div", { className: "brand-icon", "aria-hidden": "true" }, h("img", { src: logoUrl, alt: "" })),
        h("h1", null, WB_APP_DISPLAY_NAME),
        h("p", null, "\u4F60\u7684\u5DE5\u4F5C\u642D\u6863 \xB7 \u767B\u5F55 " + WB_APP_DISPLAY_NAME)
      ),
      h(
        "form",
        {
          className: "wb-login-form",
          onSubmit: function(ev) {
            ev.preventDefault();
            doLogin();
          }
        },
        h(
          "div",
          { className: "field" },
          h("span", null, "\u4F01\u4E1A\u7F16\u7801"),
          h(
            "div",
            { className: "ent-select" + (entOpen ? " open" : "") },
            h(
              "button",
              {
                type: "button",
                className: "ent-trigger",
                "aria-expanded": entOpen,
                onClick: function() {
                  setEntOpen(!entOpen);
                }
              },
              h("span", null, selectedEnt().label)
            ),
            h(
              "ul",
              { className: "ent-menu", role: "listbox" },
              AUTH_ENTERPRISES.map(function(item) {
                return h(
                  "li",
                  {
                    key: item.key,
                    role: "option",
                    className: "ent-option" + (item.key === entKey ? " active" : ""),
                    onMouseDown: function(ev) {
                      ev.preventDefault();
                      setEntKey(item.key);
                      setEntOpen(false);
                    }
                  },
                  item.label
                );
              })
            )
          )
        ),
        h(
          "label",
          { className: "field" },
          h("span", null, "\u8D26\u53F7"),
          h("input", {
            type: "text",
            autoComplete: "username",
            placeholder: "\u8D26\u53F7",
            required: true,
            value: loginUser,
            onChange: function(ev) {
              setLoginUser(ev.target.value);
            }
          })
        ),
        h(
          "label",
          { className: "field" },
          h("span", null, "\u5BC6\u7801"),
          h("input", {
            type: "password",
            autoComplete: "current-password",
            placeholder: "\u5BC6\u7801",
            required: true,
            value: loginPass,
            onChange: function(ev) {
              setLoginPass(ev.target.value);
            }
          })
        ),
        authErr ? h("p", { className: "error" }, authErr) : null,
        h("button", { className: "submit", type: "submit", disabled: busy }, busy ? "\u767B\u5F55\u4E2D\u2026" : "\u767B\u5F55")
      )
    );
  }
  function WorkBuddyAppLoginGate() {
    ensureCss();
    var readyState = useState(!readAuthSession());
    var ready = readyState[0];
    var setReady = readyState[1];
    var authedState = useState(false);
    var authed = authedState[0];
    var setAuthed = authedState[1];
    function touchAuthActive() {
      return fetchEngineApi("/api/auth/touch", {
        method: "POST",
        headers: authHeaders()
      }).catch(function() {
      });
    }
    function refresh() {
      var sess = readAuthSession();
      if (!sess) {
        setAuthed(false);
        setReady(true);
        return;
      }
      fetchEngineApi("/api/auth/me", { headers: authHeaders() }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok && d.authenticated && d.user) {
          setAuthed(true);
          touchAuthActive();
        } else if (d && d.ok === true && d.authenticated === false) {
          writeAuthSession(null);
          setAuthed(false);
        } else {
          setAuthed(true);
        }
      }).catch(function() {
        setAuthed(true);
      }).finally(function() {
        setReady(true);
      });
    }
    useEffect(function() {
      refresh();
      function onAuth() {
        refresh();
      }
      window.addEventListener(AUTH_EVENT, onAuth);
      return function() {
        window.removeEventListener(AUTH_EVENT, onAuth);
      };
    }, []);
    if (!ready) return null;
    if (authed) return null;
    return h(
      "div",
      { className: "wb-app-login-gate", role: "dialog", "aria-modal": "true", "aria-label": "\u767B\u5F55" },
      h(WorkBuddyLoginForm, {
        onSuccess: function() {
          setAuthed(true);
        }
      })
    );
  }
  function mountAppLoginGate() {
    if (typeof document === "undefined") return function() {
    };
    var disposed = false;
    var cleanupInner = function() {
    };
    function start() {
      if (disposed) return;
      ensureCss();
      var host = document.getElementById("wb-app-login-gate-root");
      if (!host) {
        host = document.createElement("div");
        host.id = "wb-app-login-gate-root";
        (document.body || document.documentElement).appendChild(host);
      }
      function paintDomFallback(errMsg) {
        var logoUrl = engineBase() + "/zr-logo.png";
        function escAttr(s) {
          return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        function escText(s) {
          return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        host.innerHTML = '<div class="wb-app-login-gate" role="dialog" aria-modal="true" aria-label="\u767B\u5F55"><div class="wb-login-card"><div class="wb-login-brand"><div class="brand-icon" aria-hidden="true"><img src="' + escAttr(logoUrl) + '" alt="" /></div><h1>' + escText(WB_APP_DISPLAY_NAME) + "</h1><p>\u4F60\u7684\u5DE5\u4F5C\u642D\u6863 \xB7 \u767B\u5F55 " + escText(WB_APP_DISPLAY_NAME) + '</p></div><form class="wb-login-form" id="wbDomLoginForm"><div class="field"><span>\u4F01\u4E1A\u7F16\u7801</span><select id="wbDomEnt" style="height:40px;border:1px solid #dbe1ea;border-radius:10px;padding:0 12px;font:14px inherit">' + AUTH_ENTERPRISES.map(function(e) {
          return '<option value="' + escAttr(e.key) + '"' + (e.key === "jxzr" ? " selected" : "") + ">" + escText(e.label) + "</option>";
        }).join("") + '</select></div><label class="field"><span>\u8D26\u53F7</span><input id="wbDomUser" type="text" autocomplete="username" placeholder="\u8D26\u53F7" required /></label><label class="field"><span>\u5BC6\u7801</span><input id="wbDomPass" type="password" autocomplete="current-password" placeholder="\u5BC6\u7801" required /></label>' + (errMsg ? '<p class="error">' + escText(errMsg) + "</p>" : "") + '<button class="submit" type="submit" id="wbDomSubmit">\u767B\u5F55</button></form></div></div>';
        var form = document.getElementById("wbDomLoginForm");
        if (form) {
          form.onsubmit = function(ev) {
            ev.preventDefault();
            var u = (document.getElementById("wbDomUser").value || "").trim();
            var p = document.getElementById("wbDomPass").value || "";
            var ek = document.getElementById("wbDomEnt") && document.getElementById("wbDomEnt").value || "jxzr";
            var ent = AUTH_ENTERPRISES.find(function(e) {
              return e.key === ek;
            }) || AUTH_ENTERPRISES[1];
            var btn = document.getElementById("wbDomSubmit");
            if (!u || !p) {
              paintDomFallback("\u8BF7\u8F93\u5165\u8D26\u53F7\u548C\u5BC6\u7801");
              return;
            }
            if (btn) {
              btn.disabled = true;
              btn.textContent = "\u767B\u5F55\u4E2D\u2026";
            }
            fetchEngineApi("/api/auth/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                username: u,
                password: p,
                enterprise_code: String(ent.code || "").trim()
              })
            }).then(function(r) {
              return r.text().then(function(t) {
                var d = null;
                try {
                  d = t ? JSON.parse(t) : null;
                } catch (eParse) {
                  throw new Error(
                    "\u767B\u5F55\u63A5\u53E3\u8FD4\u56DE\u975E JSON\uFF08HTTP " + r.status + "\uFF09\uFF1A" + String(t || "").slice(0, 80)
                  );
                }
                if (!r.ok && (!d || !d.detail)) {
                  throw new Error("\u767B\u5F55\u5931\u8D25\uFF08HTTP " + r.status + "\uFF09");
                }
                return d;
              });
            }).then(function(d) {
              if (!d || !d.ok || !d.token) throw new Error(d && d.detail || "\u767B\u5F55\u5931\u8D25");
              writeAuthSession({
                access_token: d.token,
                token_type: d.token_type || "Bearer",
                username: d.user && d.user.username || u,
                display_name: d.user && d.user.display_name || u,
                user_id: d.user && d.user.id || "",
                role: d.user && d.user.role || "user",
                enterprise_code: String(ent.code || "").trim(),
                expires_at: d.expires_at
              });
              fetchEngineApi("/api/auth/touch", {
                method: "POST",
                headers: authHeaders()
              }).catch(function() {
              });
              host.innerHTML = "";
            }).catch(function(err) {
              writeAuthSession(null);
              paintDomFallback(typeof formatLoginError === "function" ? formatLoginError(err) : err && err.message ? err.message : String(err));
            });
          };
        }
      }
      function syncDomGate() {
        var sess = readAuthSession();
        if (!sess) {
          paintDomFallback("");
          return;
        }
        fetchEngineApi("/api/auth/me", { headers: authHeaders() }).then(function(r) {
          return r.json();
        }).then(function(d) {
          if (disposed) return;
          if (d && d.ok && d.authenticated && d.user) {
            host.innerHTML = "";
            fetchEngineApi("/api/auth/touch", {
              method: "POST",
              headers: authHeaders()
            }).catch(function() {
            });
          } else if (d && d.ok === true && d.authenticated === false) {
            writeAuthSession(null);
            paintDomFallback("");
          } else {
            host.innerHTML = "";
          }
        }).catch(function() {
          if (disposed) return;
          host.innerHTML = "";
        });
      }
      syncDomGate();
      window.addEventListener(AUTH_EVENT, syncDomGate);
      cleanupInner = function() {
        try {
          window.removeEventListener(AUTH_EVENT, syncDomGate);
        } catch (e4) {
        }
        if (host && host.parentNode) host.parentNode.removeChild(host);
      };
      console.log("[dsh-mes-bridge] \u5DF2\u6302\u8F7D :3081 \u767B\u5F55\u6321\u677F");
    }
    if (document.body) start();
    else document.addEventListener("DOMContentLoaded", start);
    return function() {
      disposed = true;
      cleanupInner();
    };
  }
  ctx.WorkBuddyLoginForm = WorkBuddyLoginForm;
  ctx.WorkBuddyAppLoginGate = WorkBuddyAppLoginGate;
  ctx.mountAppLoginGate = mountAppLoginGate;
}

// client-src/usage-section.js
function installUsageSection(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var formatLoginError = ctx.formatLoginError;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout, confirmAuthExpiredAndClear = ctx.confirmAuthExpiredAndClear;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, fetchEngineApi = ctx.fetchEngineApi, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var fmtUsageTokens = ctx.fmtUsageTokens, fmtUsageTokensTitle = ctx.fmtUsageTokensTitle, qualityLabel = ctx.qualityLabel, usageNiceMax = ctx.usageNiceMax, usageMd = ctx.usageMd, usageMonthLabel = ctx.usageMonthLabel, usageShowDayTick = ctx.usageShowDayTick, usageChartWidth = ctx.usageChartWidth, usagePlotBox = ctx.usagePlotBox, usageXTickAnchor = ctx.usageXTickAnchor, usageTipShift = ctx.usageTipShift, usageChartScroll = ctx.usageChartScroll, usageAlignMonthScroll = ctx.usageAlignMonthScroll, usageHourScrollIndex = ctx.usageHourScrollIndex, usageScrollToFocus = ctx.usageScrollToFocus, usageScrollToHour = ctx.usageScrollToHour, usageTodayYmd = ctx.usageTodayYmd, usageAddDays = ctx.usageAddDays, usageKpiDayLabel = ctx.usageKpiDayLabel, usageCatmullPath = ctx.usageCatmullPath, usageCurveSvg = ctx.usageCurveSvg, UsageCurveChart = ctx.UsageCurveChart, usageStackSvg = ctx.usageStackSvg, UsageStackChart = ctx.UsageStackChart, usageHourRange = ctx.usageHourRange, usageHourCombinedRows = ctx.usageHourCombinedRows, usageDayCombinedRows = ctx.usageDayCombinedRows, usageDualCombinedSvg = ctx.usageDualCombinedSvg, UsageDualCombinedChart = ctx.UsageDualCombinedChart, usageHourCombinedCard = ctx.usageHourCombinedCard, usageKpiCard = ctx.usageKpiCard, usageTodayKpis = ctx.usageTodayKpis, usageMeterNode = ctx.usageMeterNode, usageMonthRangeFromDay = ctx.usageMonthRangeFromDay, usagePeopleHBars = ctx.usagePeopleHBars, usagePeopleBarsNode = ctx.usagePeopleBarsNode;
  var WorkBuddyLoginForm = ctx.WorkBuddyLoginForm;
  function WorkBuddyUsageSection(props) {
    ensureCss();
    var ENTERPRISES = AUTH_ENTERPRISES || [
      { key: "jsry", label: "\u6C5F\u82CF\u8F6F\u4E91", code: "" },
      { key: "jxzr", label: "\u6C5F\u897F\u4E2D\u8F6F", code: "" },
      { key: "qhzr", label: "\u524D\u6D77\u4E2D\u8F6F", code: "" }
    ];
    var scope = props && props.scope === "enterprise" ? "enterprise" : "personal";
    var onScopeChange = props && typeof props.onScopeChange === "function" ? props.onScopeChange : null;
    var onAdminChange = props && typeof props.onAdminChange === "function" ? props.onAdminChange : null;
    var busyState = useState(false);
    var busy = busyState[0];
    var setBusy = busyState[1];
    var msgState = useState("");
    var msg = msgState[0];
    var setMsg = msgState[1];
    var msgOkState = useState(false);
    var msgOk = msgOkState[0];
    var setMsgOk = msgOkState[1];
    var dataState = useState(null);
    var data = dataState[0];
    var setData = dataState[1];
    var onDateState = useState(usageTodayYmd);
    var onDate = onDateState[0];
    var setOnDate = onDateState[1];
    var pageRef = useRef(null);
    var userState = useState(null);
    var authUser = userState[0];
    var setAuthUser = userState[1];
    var authReadyState = useState(false);
    var authReady = authReadyState[0];
    var setAuthReady = authReadyState[1];
    var authErrState = useState("");
    var authErr = authErrState[0];
    var setAuthErr = authErrState[1];
    var loginUserState = useState("");
    var loginUser = loginUserState[0];
    var setLoginUser = loginUserState[1];
    var loginPassState = useState("");
    var loginPass = loginPassState[0];
    var setLoginPass = loginPassState[1];
    var entKeyState = useState("jxzr");
    var entKey = entKeyState[0];
    var setEntKey = entKeyState[1];
    var entOpenState = useState(false);
    var entOpen = entOpenState[0];
    var setEntOpen = entOpenState[1];
    var peopleGrainState = useState("day");
    var peopleGrain = peopleGrainState[0];
    var setPeopleGrain = peopleGrainState[1];
    var peopleRowsState = useState([]);
    var peopleRows = peopleRowsState[0];
    var setPeopleRows = peopleRowsState[1];
    var peoplePeriodState = useState("");
    var peoplePeriod = peoplePeriodState[0];
    var setPeoplePeriod = peoplePeriodState[1];
    function selectedEnt() {
      return ENTERPRISES.find(function(e) {
        return e.key === entKey;
      }) || ENTERPRISES[1];
    }
    function onUsageAuth401() {
      var confirm = typeof confirmAuthExpiredAndClear === "function" ? confirmAuthExpiredAndClear() : Promise.resolve(true).then(function() {
        writeAuthSession(null);
        return true;
      });
      return confirm.then(function(cleared) {
        if (cleared) {
          setAuthUser(null);
          if (onAdminChange) onAdminChange(false);
          throw new Error("\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55");
        }
        throw new Error("\u7528\u91CF\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
      });
    }
    function loadUsage(day, scopeOverride, grainOverride) {
      if (!authUser) return;
      var d = day || onDate || usageTodayYmd();
      var sc = scopeOverride || scope;
      var isEnt2 = sc === "enterprise" && String(authUser.role || "") === "admin";
      var grain = grainOverride || peopleGrain || "day";
      if (grain !== "month") grain = "day";
      var path = isEnt2 ? "/api/usage/enterprise/summary?days=7&grain=" + encodeURIComponent(grain) + "&on=" : "/api/usage/summary?days=7&grain=" + encodeURIComponent(grain) + "&on=";
      setBusy(true);
      setMsg("\u52A0\u8F7D\u4E2D\u2026");
      setMsgOk(false);
      fetchEngineApi(path + encodeURIComponent(d), {
        headers: authHeaders()
      }).then(function(r) {
        if (r.status === 401) {
          return onUsageAuth401();
        }
        if (r.status === 403) {
          throw new Error("\u4EC5\u7BA1\u7406\u5458\u53EF\u67E5\u770B\u4F01\u4E1A\u7528\u91CF");
        }
        return r.json();
      }).then(function(s) {
        if (!s || !s.ok) {
          throw new Error(s && (s.detail || s.message) || "\u5F15\u64CE\u672A\u54CD\u5E94");
        }
        setData(s);
        if (s.grain === "month" && s.month_from) {
          setOnDate(String(s.month_from).slice(0, 10));
        } else if (s.on && s.on !== d && grain === "day") {
          setOnDate(s.on);
        }
        setMsg(
          isEnt2 ? grain === "month" ? "\u5DF2\u52A0\u8F7D\u4F01\u4E1A\u6574\u6708\u7528\u91CF" : "\u5DF2\u52A0\u8F7D\u4F01\u4E1A\u603B\u7528\u91CF" : grain === "month" ? "\u5DF2\u52A0\u8F7D\u4E2A\u4EBA\u6574\u6708\u7528\u91CF" : "\u5DF2\u4ECE\u5F15\u64CE\u52A0\u8F7D"
        );
        setMsgOk(true);
      }).catch(function(err) {
        setMsg(
          "\u52A0\u8F7D\u5931\u8D25\uFF1A" + (err && err.message ? err.message : String(err)) + "\uFF08\u8BF7\u5148 scripts/engine.sh zr-workbuddy ensure\uFF09"
        );
        setMsgOk(false);
      }).finally(function() {
        setBusy(false);
      });
    }
    function loadPeople(day, grainOverride) {
      if (!authUser || String(authUser.role || "") !== "admin") {
        setPeopleRows([]);
        setPeoplePeriod("");
        return;
      }
      var d = day || onDate || usageTodayYmd();
      var grain = grainOverride || peopleGrain || "day";
      var from = d;
      var to = d;
      var periodLabel = d;
      if (grain === "month") {
        var mr = usageMonthRangeFromDay(d);
        from = mr.from;
        to = mr.to;
        periodLabel = mr.label;
      }
      var q = "from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&grain=" + encodeURIComponent(grain);
      fetchEngineApi("/api/usage/enterprise/people?" + q, { headers: authHeaders() }).then(function(r) {
        if (r.status === 401) {
          return onUsageAuth401();
        }
        if (r.status === 403) throw new Error("\u4EC5\u7BA1\u7406\u5458\u53EF\u67E5\u770B");
        return r.json();
      }).then(function(p) {
        if (!p || !p.ok) throw new Error(p && p.detail || "\u6309\u4EBA\u6C47\u603B\u5931\u8D25");
        var rows = p.rows || [];
        var by = {};
        rows.forEach(function(r) {
          var uid = String(r.user_id || "");
          if (!uid) return;
          if (!by[uid]) {
            by[uid] = {
              user_id: uid,
              username: r.username || "",
              display_name: r.display_name || "",
              period: r.period || periodLabel,
              llm_tokens: 0,
              llm_calls: 0,
              cursor_tokens: 0,
              cursor_calls: 0
            };
          }
          by[uid].llm_tokens += Number(r.llm_tokens) || 0;
          by[uid].llm_calls += Number(r.llm_calls) || 0;
          by[uid].cursor_tokens += Number(r.cursor_tokens) || 0;
          by[uid].cursor_calls += Number(r.cursor_calls) || 0;
          if (r.display_name) by[uid].display_name = r.display_name;
          if (r.username) by[uid].username = r.username;
        });
        setPeopleRows(Object.keys(by).map(function(k) {
          return by[k];
        }));
        setPeoplePeriod(periodLabel);
      }).catch(function() {
        setPeopleRows([]);
        setPeoplePeriod(periodLabel);
      });
    }
    function refreshAuth() {
      var sess = readAuthSession();
      if (!sess) {
        setAuthUser(null);
        setAuthReady(true);
        if (onAdminChange) onAdminChange(false);
        return;
      }
      fetchEngineApi("/api/auth/me", { headers: authHeaders() }).then(function(r) {
        return r.json();
      }).then(function(d) {
        if (d && d.ok && d.authenticated && d.user) {
          setAuthUser(d.user);
          if (onAdminChange) onAdminChange(String(d.user.role || "") === "admin");
        } else if (d && d.ok === true && d.authenticated === false) {
          writeAuthSession(null);
          setAuthUser(null);
          if (onAdminChange) onAdminChange(false);
        }
      }).catch(function() {
      }).finally(function() {
        setAuthReady(true);
      });
    }
    function doLogin() {
      var u = (loginUser || "").trim();
      var p = loginPass || "";
      if (!u || !p) {
        setAuthErr("\u8BF7\u8F93\u5165\u8D26\u53F7\u548C\u5BC6\u7801");
        return;
      }
      setAuthErr("");
      setBusy(true);
      fetchEngineApi("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: u,
          password: p,
          enterprise_code: String(selectedEnt().code || "").trim()
        })
      }).then(function(r) {
        return r.text().then(function(t) {
          var d = null;
          try {
            d = t ? JSON.parse(t) : null;
          } catch (eParse) {
            throw new Error(
              "\u767B\u5F55\u63A5\u53E3\u8FD4\u56DE\u975E JSON\uFF08HTTP " + r.status + "\uFF09\uFF1A" + String(t || "").slice(0, 80)
            );
          }
          if (!r.ok && (!d || !d.detail)) {
            throw new Error("\u767B\u5F55\u5931\u8D25\uFF08HTTP " + r.status + "\uFF09");
          }
          return d;
        });
      }).then(function(d) {
        if (!d || !d.ok || !d.token) throw new Error(d && d.detail || "\u767B\u5F55\u5931\u8D25");
        writeAuthSession({
          access_token: d.token,
          token_type: d.token_type || "Bearer",
          username: d.user && d.user.username || u,
          display_name: d.user && d.user.display_name || u,
          user_id: d.user && d.user.id || "",
          role: d.user && d.user.role || "user",
          enterprise_code: String(selectedEnt().code || "").trim(),
          expires_at: d.expires_at
        });
        setAuthUser(d.user || null);
        setLoginPass("");
        setAuthErr("");
        if (onAdminChange) onAdminChange(String(d.user && d.user.role || "") === "admin");
      }).catch(function(err) {
        writeAuthSession(null);
        setAuthUser(null);
        setAuthErr(typeof formatLoginError === "function" ? formatLoginError(err) : err && err.message ? err.message : String(err));
        if (onAdminChange) onAdminChange(false);
      }).finally(function() {
        setBusy(false);
      });
    }
    useEffect(function() {
      refreshAuth();
      function onAuth() {
        refreshAuth();
      }
      window.addEventListener(AUTH_EVENT, onAuth);
      return function() {
        window.removeEventListener(AUTH_EVENT, onAuth);
      };
    }, []);
    useEffect(
      function() {
        if (authReady && authUser) {
          var isAdmin = String(authUser.role || "") === "admin";
          if (scope === "enterprise" && !isAdmin && onScopeChange) {
            onScopeChange("personal");
            return;
          }
          loadUsage(onDate, scope, peopleGrain);
          if (scope === "enterprise" && isAdmin) loadPeople(onDate, peopleGrain);
          else {
            setPeopleRows([]);
            setPeoplePeriod("");
          }
        }
      },
      [authReady, authUser, scope, peopleGrain]
    );
    useLayoutEffect(function() {
      if (!data || !pageRef.current) return;
      if (peopleGrain === "month") {
        usageScrollToFocus(pageRef.current, data.monthly || data.daily || [], data.on || onDate);
        return;
      }
      usageScrollToHour(pageRef.current, data.hourly || []);
    }, [data, onDate, peopleGrain]);
    var llm = data && data.llm || {};
    var cursor = data && data.cursor || {};
    var daily = data && data.monthly || data && data.daily || [];
    var monthLab = usageMonthLabel(data && data.month);
    var llmModel = llm.models && llm.models[0] && llm.models[0].model || "\u6682\u65E0\u8C03\u7528";
    var curModel = cursor.models && cursor.models[0] && cursor.models[0].model || "\u6682\u65E0\u8C03\u7528";
    var llmPal = { fill: "#93c5fd", stroke: "#3b82f6", hit: "#93c5fd", miss: "#3b82f6", out: "#1d4ed8" };
    var curPal = { fill: "#99f6e4", stroke: "#14b8a6", hit: "#99f6e4", miss: "#14b8a6", out: "#0f766e" };
    var hourly = data && data.hourly || [];
    var isEnt = scope === "enterprise";
    var monthMode = peopleGrain === "month";
    var meterAxis = monthMode ? "day" : "hour";
    var meterSeries = monthMode ? daily : hourly;
    var dayLab = monthMode ? (isEnt ? "\u5168\u5458 \xB7 " : "") + (usageMonthLabel(data && data.month || onDate) || String(onDate || "").slice(0, 7)) : usageKpiDayLabel(data && data.on || onDate);
    if (isEnt && !monthMode && dayLab) dayLab = "\u5168\u5458 \xB7 " + dayLab;
    if (!authReady) {
      return h("div", { className: "wb-usage-page", "aria-busy": "true" });
    }
    if (!authUser) {
      return h(
        "div",
        { className: "wb-usage-page wb-login-page", ref: pageRef },
        h(WorkBuddyLoginForm, {
          onSuccess: function(user) {
            setAuthUser(user);
            if (onAdminChange) onAdminChange(String(user && user.role || "") === "admin");
          }
        })
      );
    }
    return h(
      "div",
      { className: "wb-usage-page", ref: pageRef },
      h(
        "div",
        { className: "wb-usage-filter" },
        h("label", { htmlFor: "wb-usage-on" }, monthMode ? "\u6708\u4EFD" : "\u65E5\u671F"),
        h("input", {
          id: "wb-usage-on",
          type: monthMode ? "month" : "date",
          value: monthMode ? String(onDate || "").slice(0, 7) : onDate,
          min: monthMode ? usageAddDays(usageTodayYmd(), -89).slice(0, 7) : usageAddDays(usageTodayYmd(), -89),
          max: monthMode ? usageTodayYmd().slice(0, 7) : usageTodayYmd(),
          onChange: function(ev) {
            var v = ev.target.value;
            if (!v) return;
            var day = v;
            if (v.length === 7) day = v + "-01";
            setOnDate(day);
            loadUsage(day, scope, peopleGrain);
            if (scope === "enterprise") loadPeople(day, peopleGrain);
          }
        }),
        h(
          "label",
          { htmlFor: "wb-people-grain", style: { marginLeft: "4px" } },
          "\u7EDF\u8BA1\u7C92\u5EA6"
        ),
        h(
          "select",
          {
            id: "wb-people-grain",
            value: peopleGrain,
            onChange: function(ev) {
              var g = ev.target.value === "month" ? "month" : "day";
              setPeopleGrain(g);
              loadUsage(onDate, scope, g);
              if (scope === "enterprise") loadPeople(onDate, g);
            }
          },
          h("option", { value: "day" }, "\u6309\u65E5"),
          h("option", { value: "month" }, "\u6309\u6708")
        )
      ),
      usageTodayKpis(data && data.today, dayLab),
      usageHourCombinedCard(
        monthMode ? isEnt ? "\u5404\u65E5\u7528\u91CF\uFF08\u5168\u5458\uFF09" : "\u5404\u65E5\u7528\u91CF" : isEnt ? "\u5404\u65F6\u6BB5\u7528\u91CF\uFF08\u5168\u5458\uFF09" : "\u5404\u65F6\u6BB5\u7528\u91CF",
        monthMode ? daily : hourly,
        data && data.on || onDate,
        { monthMode, monthLabel: data && data.month || onDate }
      ),
      usageMeterNode(
        isEnt ? "LLM\uFF08\u5168\u5458\uFF09" : "LLM",
        llmModel + (monthMode ? monthLab ? " \xB7 " + monthLab : "" : " \xB7 " + (data && data.on || onDate || "")),
        meterSeries,
        "llm_",
        llmPal,
        "",
        meterAxis
      ),
      usageMeterNode(
        maskVendorUiText(isEnt ? "Cursor \u5199\u7801\uFF08\u5168\u5458\uFF09" : "Cursor \u5199\u7801"),
        curModel + (monthMode ? monthLab ? " \xB7 " + monthLab : "" : " \xB7 " + (data && data.on || onDate || "")),
        meterSeries,
        "cursor_",
        curPal,
        "",
        meterAxis
      ),
      isEnt ? usagePeopleBarsNode(
        maskVendorUiText("\u5458\u5DE5\u7528\u91CF\uFF08LLM + Cursor\uFF09"),
        maskVendorUiText(
          (peopleGrain === "month" ? "\u6309\u6708" : "\u6309\u65E5") + " \xB7 " + (peoplePeriod || onDate || "") + " \xB7 \u6309\u5408\u8BA1 Token \u4ECE\u9AD8\u5230\u4F4E \xB7 \u542B\u5168\u90E8\u8D26\u53F7\uFF08\u542B\u7BA1\u7406\u5458\uFF09\xB7 \u5171 " + String(peopleRows.length) + " \u4EBA"
        ),
        peopleRows
      ) : null,
      h(
        "div",
        { className: "wb-set-bar" },
        h(
          "button",
          {
            type: "button",
            className: "wb-set-btn",
            disabled: busy,
            onClick: function() {
              loadUsage(onDate, scope, peopleGrain);
              if (scope === "enterprise") loadPeople(onDate, peopleGrain);
            }
          },
          busy ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0"
        ),
        msg ? h("span", { className: "wb-set-msg" + (msgOk ? " ok" : " err") }, msg) : null
      )
    );
  }
  ctx.WorkBuddyUsageSection = WorkBuddyUsageSection;
}

// client-src/space.js
function installSpace(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout, confirmAuthExpiredAndClear = ctx.confirmAuthExpiredAndClear;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, fetchEngineApi = ctx.fetchEngineApi, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var bag = ctx;
  function spaceFmtTime(ts) {
    var n = Number(ts) || 0;
    if (!n) return "";
    try {
      return new Date(n * 1e3).toLocaleString("zh-CN");
    } catch (e) {
      return String(n);
    }
  }
  function spaceEscapeHtml(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function spaceMdToHtml(src) {
    var lines = String(src || "").replace(/\r\n/g, "\n").split("\n");
    var html = [];
    var i = 0;
    function inlineFmt(t) {
      t = spaceEscapeHtml(t);
      t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
      t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      return t;
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /\|/.test(lines[i + 1]) && /---/.test(lines[i + 1])) {
        var rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          rows.push(lines[i]);
          i += 1;
        }
        var tbl = ["<table>"];
        rows.forEach(function(row, idx) {
          if (idx === 1 && /---/.test(row)) return;
          var cells = row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|");
          var tag = idx === 0 ? "th" : "td";
          tbl.push(
            "<tr>" + cells.map(function(c) {
              return "<" + tag + ">" + inlineFmt(c.trim()) + "</" + tag + ">";
            }).join("") + "</tr>"
          );
        });
        tbl.push("</table>");
        html.push(tbl.join(""));
        continue;
      }
      if (/^```/.test(line)) {
        var buf = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i])) {
          buf.push(spaceEscapeHtml(lines[i]));
          i += 1;
        }
        i += 1;
        html.push("<pre><code>" + buf.join("\n") + "</code></pre>");
        continue;
      }
      if (/^###\s+/.test(line)) html.push("<h3>" + inlineFmt(line.replace(/^###\s+/, "")) + "</h3>");
      else if (/^##\s+/.test(line)) html.push("<h2>" + inlineFmt(line.replace(/^##\s+/, "")) + "</h2>");
      else if (/^#\s+/.test(line)) html.push("<h1>" + inlineFmt(line.replace(/^#\s+/, "")) + "</h1>");
      else if (/^>\s?/.test(line)) html.push("<blockquote>" + inlineFmt(line.replace(/^>\s?/, "")) + "</blockquote>");
      else if (/^\s*[-*]\s+/.test(line)) html.push("<ul><li>" + inlineFmt(line.replace(/^\s*[-*]\s+/, "")) + "</li></ul>");
      else if (!line.trim()) html.push("");
      else html.push("<p>" + inlineFmt(line) + "</p>");
      i += 1;
    }
    return html.join("\n") || "<p>\uFF08\u65E0\u6B63\u6587\uFF09</p>";
  }
  function spaceGuessFormat(kind, id, relpath, body) {
    var rel = String(relpath || id || "").toLowerCase();
    var k = String(kind || "").toLowerCase();
    if (k === "code_file" || /\.(py|js|jsx|ts|tsx|vue|css|scss|go|rs|java|c|cpp|h|hpp|sh|sql|toml|ya?ml)$/i.test(rel)) {
      return "code";
    }
    if (rel.indexOf(".json") >= 0 || body && body.trim().charAt(0) === "{") return "json";
    if (rel.indexOf(".html") >= 0 || k === "html") return "html";
    if (k.indexOf("8d") >= 0 || k.indexOf("review") >= 0 || k.indexOf("delivery") >= 0 || rel.indexOf(".md") >= 0) {
      return "md";
    }
    return "md";
  }
  function spaceTypeLabel(kind, format) {
    var k = String(kind || "").toLowerCase();
    if (k === "code_file" || format === "code") return "\u4EE3\u7801";
    return "\u6587\u6863";
  }
  function tryClickSidebarSession(title, sessionId, extraTitle) {
    var skip = /^(资料库|用量|设置|新会话|记忆|工作区)$/;
    var bare = String(sessionId || "").replace(/^session-/, "");
    var nodes = document.querySelectorAll("button, a, [role='button']");
    var i;
    var el;
    var t;
    var names = [title, extraTitle].filter(function(x) {
      return String(x || "").trim();
    });
    var n;
    for (n = 0; n < names.length; n++) {
      var want = String(names[n]).replace(/\s+/g, " ").trim();
      if (!want) continue;
      for (i = 0; i < nodes.length; i++) {
        el = nodes[i];
        if (el.closest && el.closest(".wb-usage-overlay")) continue;
        t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!t || t.length > 120 || skip.test(t)) continue;
        if (t === want || want.length >= 8 && t.indexOf(want) >= 0) {
          el.click();
          return true;
        }
      }
    }
    if (bare && bare.length > 8) {
      var links = document.querySelectorAll("a[href]");
      for (i = 0; i < links.length; i++) {
        if ((links[i].getAttribute("href") || "").indexOf(bare) >= 0) {
          links[i].click();
          return true;
        }
      }
    }
    return false;
  }
  var WB_WORKSPACE_ACTIVATE = "@lemoncat7/dsh-plugin-ui/workspace-activate";
  function foreignPluginWorkspaceVisible() {
    try {
      if (typeof document === "undefined") return false;
      return !!(document.querySelector(".dsh-knowledge-workspace") || document.querySelector("[data-knowledge-surface='workspace']") || document.querySelector(".za-root") || document.querySelector(".esc-root"));
    } catch (eVis) {
      return false;
    }
  }
  function clickCloseForeignPluginWorkspaces() {
    try {
      if (typeof document === "undefined") return false;
      var closed = false;
      var knClose = document.querySelector(
        ".dsh-knowledge-workspace [data-knowledge-workspace-close], [data-knowledge-surface='workspace'] [data-knowledge-workspace-close]"
      );
      if (knClose && typeof knClose.click === "function") {
        knClose.click();
        closed = true;
      }
      var roots = document.querySelectorAll(
        ".dsh-knowledge-workspace, [data-knowledge-surface='workspace'], .za-root, .esc-root"
      );
      for (var r = 0; r < roots.length; r++) {
        var btns = roots[r].querySelectorAll("button");
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          if (b.closest && b.closest(".dsh-knowledge-launcher, .za-launcher, .esc-launcher")) continue;
          var lab = String(
            b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent || ""
          ).replace(/\s+/g, " ").trim();
          if (lab === "\u8FD4\u56DE\u5BF9\u8BDD" || lab.indexOf("\u8FD4\u56DE\u4F1A\u8BDD") === 0 || lab === "\u5173\u95ED") {
            if (typeof b.click === "function") {
              b.click();
              closed = true;
              break;
            }
          }
        }
      }
      return closed;
    } catch (eClick) {
      return false;
    }
  }
  function trySelectHostConversationPanel(ctx2) {
    try {
      var layout = ctx2 && ctx2.layout || (bag._wbClientCtx && typeof bag._wbClientCtx.get === "function" ? bag._wbClientCtx.get("layout") : null);
      if (!layout || typeof layout.selectPanel !== "function") return false;
      var candidates = ["conversation", "chat", "main"];
      for (var i = 0; i < candidates.length; i++) {
        try {
          layout.selectPanel(candidates[i]);
          return true;
        } catch (eSel) {
        }
      }
    } catch (eLayout) {
    }
    return false;
  }
  function dismissForeignPluginWorkspaces(ctx2, opts) {
    opts = opts || {};
    try {
      if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
      window.dispatchEvent(
        new CustomEvent(WB_WORKSPACE_ACTIVATE, {
          detail: { pluginId: "workbuddy-session-switch" }
        })
      );
    } catch (eDismiss) {
    }
    if (!opts.preserveActivePanel) {
      trySelectHostConversationPanel(ctx2);
    }
    var runDomFallback = function() {
      if (foreignPluginWorkspaceVisible()) clickCloseForeignPluginWorkspaces();
    };
    try {
      runDomFallback();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function() {
          runDomFallback();
          setTimeout(runDomFallback, 40);
          setTimeout(runDomFallback, 120);
          setTimeout(runDomFallback, 280);
        });
      } else {
        setTimeout(runDomFallback, 0);
        setTimeout(runDomFallback, 50);
        setTimeout(runDomFallback, 200);
      }
    } catch (eFb) {
      setTimeout(runDomFallback, 0);
    }
  }
  function borrowChatStore(slots) {
    if (!slots || typeof slots.entries !== "function") return null;
    try {
      var names = ["conversation.session", "conversation.session.header", "conversation.view"];
      for (var n = 0; n < names.length; n++) {
        var entries = slots.entries(names[n]) || [];
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (!e || !e.store) continue;
          if (names[n] === "conversation.view" && (!e.options || e.options.id !== "chat")) continue;
          return e.store;
        }
      }
    } catch (eBorrow) {
    }
    return null;
  }
  function patchPersistedChatView(sessionId) {
    try {
      if (!sessionId || typeof localStorage === "undefined") return;
      var key = "dsh.conversation.chat." + String(sessionId);
      var raw = localStorage.getItem(key);
      var data = raw ? JSON.parse(raw) : {};
      if (!data || typeof data !== "object") data = {};
      if (isWorkbuddyStickyView(data.view)) {
        data.view = "chat";
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (ePatch) {
    }
  }
  function activateHostChatTab() {
    try {
      var lists = document.querySelectorAll('[role="tablist"]');
      var li;
      for (li = 0; li < lists.length; li++) {
        var tabs = lists[li].querySelectorAll('[role="tab"]');
        var labels = [];
        var j;
        for (j = 0; j < tabs.length; j++) {
          labels.push((tabs[j].textContent || "").replace(/\s+/g, " ").trim());
        }
        var joined = labels.join("|");
        if (joined.indexOf("\u5BF9\u8BDD") < 0 && joined.indexOf("Chat") < 0 && joined.indexOf("\u8F68\u8FF9") < 0 && joined.indexOf("\u7528\u91CF") < 0 && joined.indexOf("\u8D44\u6599\u5E93") < 0) {
          continue;
        }
        for (j = 0; j < tabs.length; j++) {
          var t = labels[j];
          if (t === "\u5BF9\u8BDD" || t === "Chat") {
            tabs[j].click();
            return true;
          }
        }
      }
      var all = document.querySelectorAll('[role="tab"]');
      for (var i = 0; i < all.length; i++) {
        var tx = (all[i].textContent || "").replace(/\s+/g, " ").trim();
        if (tx === "\u5BF9\u8BDD" || tx === "Chat") {
          all[i].click();
          return true;
        }
      }
    } catch (eTab) {
    }
    return false;
  }
  function ensureConversationChatView(actions) {
    try {
      if (actions && typeof actions.setView === "function") {
        actions.setView("chat");
        activateHostChatTab();
        return true;
      }
    } catch (eSet) {
    }
    return activateHostChatTab();
  }
  function clearWorkbuddyLibraryUsagePresentation(actions, sessionId) {
    setWorkbuddyMainView(null);
    try {
      var layout = wbLayout();
      if (layout && typeof layout.selectPanel === "function" && layout.panelInfo) {
        var snap = typeof layout.panelInfo.getSnapshot === "function" ? layout.panelInfo.getSnapshot() : null;
        var active = snap && snap.activePanelId;
        if (active === "workbuddy-library" || active === "workbuddy-usage") {
          try {
            layout.selectPanel(null);
          } catch (_eSel) {
          }
        }
      }
    } catch (_eLayout) {
    }
    patchPersistedChatView(sessionId);
    var acts = actions || bag._wbChatActions || null;
    try {
      if (acts && typeof acts.setView === "function") {
        acts.setView("chat");
      }
    } catch (eClear) {
    }
  }
  function forceLeaveStickyWorkbuddyViews(actions, sessionId) {
    clearWorkbuddyLibraryUsagePresentation(actions, sessionId);
    ensureConversationChatView(actions);
    setTimeout(function() {
      activateHostChatTab();
    }, 0);
    setTimeout(function() {
      activateHostChatTab();
    }, 80);
  }
  function isWorkbuddyStickyView(viewId) {
    return viewId === "workbuddy-usage" || viewId === "workbuddy-library";
  }
  function wbReadCurrentSessionIdFromCtx(clientCtx) {
    try {
      var ctx2 = clientCtx || bag._wbClientCtx;
      var sessions = ctx2 && ctx2.sessions || (ctx2 && typeof ctx2.get === "function" ? ctx2.get("sessions") : null);
      if (!sessions) return null;
      var list = sessions.list;
      if (list && typeof list.getSnapshot === "function") {
        var snap = list.getSnapshot();
        var cur = snap && snap.current;
        return cur == null || cur === "" ? null : String(cur);
      }
      if (typeof sessions.current === "string") return sessions.current;
    } catch (eRead) {
    }
    return null;
  }
  function wbReadPersistedChatView(sessionId) {
    try {
      if (!sessionId || typeof localStorage === "undefined") return null;
      var raw = localStorage.getItem("dsh.conversation.chat." + String(sessionId));
      var data = raw ? JSON.parse(raw) : null;
      return data && data.view ? String(data.view) : null;
    } catch (eLs) {
      return null;
    }
  }
  function activateConversationViewTab(label) {
    try {
      var lists = document.querySelectorAll('[role="tablist"]');
      var li;
      for (li = 0; li < lists.length; li++) {
        var tabs = lists[li].querySelectorAll('[role="tab"]');
        var labels = [];
        var j;
        for (j = 0; j < tabs.length; j++) {
          labels.push((tabs[j].textContent || "").replace(/\s+/g, " ").trim());
        }
        var joined = labels.join("|");
        if (joined.indexOf("\u5BF9\u8BDD") < 0 && joined.indexOf("Chat") < 0 && joined.indexOf("\u8F68\u8FF9") < 0 && joined.indexOf("\u7528\u91CF") < 0 && joined.indexOf("\u8D44\u6599\u5E93") < 0) {
          continue;
        }
        for (j = 0; j < tabs.length; j++) {
          if (labels[j] === label) {
            tabs[j].click();
            return true;
          }
        }
      }
    } catch (eTab) {
    }
    return false;
  }
  var WB_MAIN_VIEW_EVENT = "wb-main-view-change";
  var WB_PLUGIN_LAUNCHER_SEL = ".dsh-knowledge-launcher, .dsh-knowledge-trigger, .za-launcher, .esc-launcher";
  var _wbMainView = null;
  function getWorkbuddyMainView() {
    return _wbMainView;
  }
  function setWorkbuddyMainView(viewId) {
    var next = viewId === "workbuddy-library" || viewId === "workbuddy-usage" ? viewId : null;
    _wbMainView = next;
    try {
      if (typeof document !== "undefined" && document.documentElement) {
        if (next) document.documentElement.setAttribute("data-wb-main-view", next);
        else document.documentElement.removeAttribute("data-wb-main-view");
      }
      if (typeof window !== "undefined" && typeof CustomEvent !== "undefined") {
        window.dispatchEvent(new CustomEvent(WB_MAIN_VIEW_EVENT, { detail: { viewId: next } }));
      }
    } catch (eEv) {
    }
  }
  function wbSupportsDockedPanels(ctx2) {
    try {
      var c = ctx2 || bag._wbClientCtx;
      var layout = c && c.layout || (c && typeof c.get === "function" ? c.get("layout") : null);
      return !!(layout && typeof layout.selectPanel === "function");
    } catch (_e) {
      return false;
    }
  }
  function wbLayout(ctx2) {
    try {
      var c = ctx2 || bag._wbClientCtx;
      return c && c.layout || (c && typeof c.get === "function" ? c.get("layout") : null) || null;
    } catch (_e) {
      return null;
    }
  }
  function openWorkbuddySidebarView(viewId) {
    if (viewId !== "workbuddy-library" && viewId !== "workbuddy-usage") return;
    dismissForeignPluginWorkspaces(bag._wbClientCtx, { preserveActivePanel: true });
    var layout = wbLayout();
    if (layout && typeof layout.selectPanel === "function") {
      try {
        layout.selectPanel(viewId);
      } catch (_eSel) {
      }
      setWorkbuddyMainView(viewId);
      return;
    }
    setWorkbuddyMainView(viewId);
  }
  function measureSidebarWidth() {
    try {
      var overlay = document.querySelector("[data-shell-overlay]");
      var frame = overlay && overlay.parentElement;
      var col = frame && frame.querySelector("[class*='sidebarCol']");
      var w = col ? Math.round(col.getBoundingClientRect().width) : 0;
      if (w < 8) {
        var rail = document.querySelector("aside") || document.querySelector("[class*='hHd-Xa_root']");
        if (rail) w = Math.round(rail.getBoundingClientRect().width);
      }
      return w >= 8 ? w : 56;
    } catch (eM) {
      return 56;
    }
  }
  function wbLibraryIcon(size) {
    size = size || 18;
    return h(
      "svg",
      { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
      h("path", {
        d: "M3 5.5A1.5 1.5 0 0 1 4.5 4h7A1.5 1.5 0 0 1 13 5.5v7A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-7Z",
        stroke: "currentColor",
        strokeWidth: "1.2"
      }),
      h("path", {
        d: "M5.5 4V3.2A1.2 1.2 0 0 1 6.7 2h2.6A1.2 1.2 0 0 1 10.5 3.2V4",
        stroke: "currentColor",
        strokeWidth: "1.2"
      })
    );
  }
  function wbUsageIcon(size) {
    size = size || 18;
    return h(
      "svg",
      { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
      h("rect", { x: "2", y: "8", width: "3", height: "6", rx: "0.5", fill: "currentColor" }),
      h("rect", { x: "6.5", y: "4", width: "3", height: "10", rx: "0.5", fill: "currentColor" }),
      h("rect", { x: "11", y: "6", width: "3", height: "8", rx: "0.5", fill: "currentColor" })
    );
  }
  function WorkBuddyLibraryPanelIcon(props) {
    return wbLibraryIcon(props && props.size || 18);
  }
  function WorkBuddyUsagePanelIcon(props) {
    return wbUsageIcon(props && props.size || 18);
  }
  function WorkBuddyLibraryMain() {
    useEffect(function() {
      dismissForeignPluginWorkspaces(bag._wbClientCtx, { preserveActivePanel: true });
      setWorkbuddyMainView("workbuddy-library");
      return function() {
        if (getWorkbuddyMainView() === "workbuddy-library") setWorkbuddyMainView(null);
      };
    }, []);
    return h(
      "div",
      { className: "wb-docked-main-scroll", "data-wb-docked-main": "library" },
      h(WorkBuddySpaceView, null)
    );
  }
  function WorkBuddyUsageMain() {
    useEffect(function() {
      dismissForeignPluginWorkspaces(bag._wbClientCtx, { preserveActivePanel: true });
      setWorkbuddyMainView("workbuddy-usage");
      return function() {
        if (getWorkbuddyMainView() === "workbuddy-usage") setWorkbuddyMainView(null);
      };
    }, []);
    var Usage = bag.WorkBuddyUsageView;
    return h(
      "div",
      { className: "wb-docked-main-scroll", "data-wb-docked-main": "usage" },
      typeof Usage === "function" ? h(Usage, null) : null
    );
  }
  function WorkBuddyMainViewOverlay() {
    if (wbSupportsDockedPanels()) return null;
    ensureCss();
    var viewState = useState(_wbMainView);
    var view = viewState[0];
    var setView = viewState[1];
    var leftState = useState(56);
    var left = leftState[0];
    var setLeft = leftState[1];
    useEffect(function() {
      function on(ev) {
        setView(ev && ev.detail && ev.detail.viewId || null);
      }
      window.addEventListener(WB_MAIN_VIEW_EVENT, on);
      return function() {
        window.removeEventListener(WB_MAIN_VIEW_EVENT, on);
      };
    }, []);
    useEffect(
      function() {
        if (!view) return;
        function measure() {
          setLeft(measureSidebarWidth());
        }
        measure();
        var ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        try {
          var overlay = document.querySelector("[data-shell-overlay]");
          if (ro && overlay && overlay.parentElement) ro.observe(overlay.parentElement);
          var col = overlay && overlay.parentElement && overlay.parentElement.querySelector("[class*='sidebarCol']");
          if (ro && col) ro.observe(col);
        } catch (eRo) {
        }
        window.addEventListener("resize", measure);
        return function() {
          window.removeEventListener("resize", measure);
          if (ro) ro.disconnect();
        };
      },
      [view]
    );
    if (!view) return null;
    var body = view === "workbuddy-usage" && typeof bag.WorkBuddyUsageView === "function" ? h(bag.WorkBuddyUsageView, null) : h(WorkBuddySpaceView, null);
    return h(
      "div",
      {
        className: "wb-main-view-overlay",
        "data-wb-main-view-overlay": "1",
        style: { left: left + "px" }
      },
      body
    );
  }
  function hideWorkbuddyConversationViewTabs() {
    if (typeof document === "undefined") return;
    var initialScanDone = false;
    function isActiveTab(el) {
      if (el && typeof el.getAttribute === "function") {
        var s = el.getAttribute("aria-selected") || el.getAttribute("data-active");
        if (s === "true" || s === "1") return true;
      }
      if (el && el.className && String(el.className).indexOf("active") >= 0) return true;
      return false;
    }
    function scan() {
      var tabs = document.querySelectorAll('[role="tablist"] [role="tab"]');
      var hiddenActive = false;
      for (var i = 0; i < tabs.length; i++) {
        var t = (tabs[i].textContent || "").replace(/\s+/g, " ").trim();
        if (t === "\u8D44\u6599\u5E93" || t === "\u7528\u91CF") {
          tabs[i].setAttribute("data-wb-hide-view-tab", "1");
          if (!initialScanDone && isActiveTab(tabs[i])) hiddenActive = true;
        }
      }
      if (hiddenActive) {
        for (var j = 0; j < tabs.length; j++) {
          var tj = (tabs[j].textContent || "").replace(/\s+/g, " ").trim();
          if (tj === "\u5BF9\u8BDD" || tj === "Chat") {
            tabs[j].click();
            break;
          }
        }
      }
      initialScanDone = true;
    }
    scan();
    if (typeof MutationObserver !== "undefined") {
      var scheduled = false;
      var stopped = false;
      var obs = new MutationObserver(function() {
        if (scheduled || stopped) return;
        scheduled = true;
        setTimeout(function() {
          scheduled = false;
          if (!stopped) scan();
        }, 80);
      });
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      return function() {
        stopped = true;
        obs.disconnect();
      };
    }
  }
  function WorkBuddySidebarViewsNav(props) {
    ensureCss();
    var wide = !props || props.wide !== false;
    var tickState = useState(0);
    var tick = tickState[0];
    var bump = tickState[1];
    useEffect(function() {
      function on() {
        bump(function(n) {
          return n + 1;
        });
      }
      window.addEventListener(WB_MAIN_VIEW_EVENT, on);
      return function() {
        window.removeEventListener(WB_MAIN_VIEW_EVENT, on);
      };
    }, []);
    var sid = wbReadCurrentSessionIdFromCtx(bag._wbClientCtx);
    var view = sid ? wbReadPersistedChatView(sid) : null;
    void tick;
    function isTabActive(label) {
      var cur = getWorkbuddyMainView();
      if (label === "\u8D44\u6599\u5E93") return cur === "workbuddy-library";
      if (label === "\u7528\u91CF") return cur === "workbuddy-usage";
      return false;
    }
    function row(label, viewId, iconFn) {
      var active = isTabActive(label);
      return h(
        "button",
        {
          type: "button",
          className: "wb-sidebar-view-btn" + (wide ? "" : " wb-sidebar-view-btn--rail") + (active ? " is-active" : ""),
          "aria-pressed": active,
          title: label,
          onClick: function() {
            openWorkbuddySidebarView(viewId);
            bump(function(n) {
              return n + 1;
            });
          }
        },
        iconFn(wide ? 16 : 18),
        wide ? h("span", null, label) : null
      );
    }
    return h(
      "div",
      {
        className: "wb-sidebar-views-nav" + (wide ? "" : " wb-sidebar-views-nav--rail"),
        role: "group",
        "aria-label": "\u8D44\u6599\u5E93\u4E0E\u7528\u91CF"
      },
      row("\u8D44\u6599\u5E93", "workbuddy-library", wbLibraryIcon),
      row("\u7528\u91CF", "workbuddy-usage", wbUsageIcon)
    );
  }
  var _wbGuardLastSessionId = null;
  function installWorkbuddyPluginWorkspaceHandoff(ctx2) {
    function sessionIdForClear() {
      return wbReadCurrentSessionIdFromCtx(ctx2) || _wbGuardLastSessionId || null;
    }
    function onOpenPluginWorkspace() {
      clearWorkbuddyLibraryUsagePresentation(bag._wbChatActions, sessionIdForClear());
    }
    function onWorkspaceActivate(ev) {
      var pid = ev && ev.detail && ev.detail.pluginId;
      if (!pid || pid === "workbuddy-session-switch") return;
      onOpenPluginWorkspace();
    }
    function onPointerDown(ev) {
      try {
        var el = ev && ev.target;
        if (!el || typeof el.closest !== "function") return;
        if (!el.closest(WB_PLUGIN_LAUNCHER_SEL)) return;
        onOpenPluginWorkspace();
      } catch (ePtr) {
      }
    }
    if (typeof window !== "undefined") {
      window.addEventListener(WB_WORKSPACE_ACTIVATE, onWorkspaceActivate);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", onPointerDown, true);
    }
    return function() {
      try {
        if (typeof window !== "undefined") {
          window.removeEventListener(WB_WORKSPACE_ACTIVATE, onWorkspaceActivate);
        }
      } catch (eW) {
      }
      try {
        if (typeof document !== "undefined") {
          document.removeEventListener("pointerdown", onPointerDown, true);
        }
      } catch (eD) {
      }
    };
  }
  function installWorkBuddySessionSwitchWatcher(ctx2) {
    var lastId = null;
    var primed = false;
    var unsubList = null;
    var retryTimer = null;
    var disposed = false;
    function readCurrentSessionId() {
      try {
        var sessions = ctx2 && ctx2.sessions || (ctx2 && typeof ctx2.get === "function" ? ctx2.get("sessions") : null);
        if (!sessions) return null;
        var list = sessions.list;
        if (list && typeof list.getSnapshot === "function") {
          var snap = list.getSnapshot();
          var cur = snap && snap.current;
          return cur == null || cur === "" ? null : String(cur);
        }
        if (typeof sessions.current === "string") return sessions.current;
      } catch (eRead) {
      }
      return null;
    }
    function onSessionCurrentChanged(reason) {
      var sid = readCurrentSessionId();
      dismissForeignPluginWorkspaces(ctx2);
      forceLeaveStickyWorkbuddyViews(null, sid);
      setTimeout(function() {
        dismissForeignPluginWorkspaces(ctx2);
        forceLeaveStickyWorkbuddyViews(null, sid || readCurrentSessionId());
        activateHostChatTab();
      }, 0);
      setTimeout(function() {
        if (foreignPluginWorkspaceVisible()) dismissForeignPluginWorkspaces(ctx2);
        activateHostChatTab();
      }, 160);
      try {
        console.debug("[dsh-mes-bridge] session-switch", reason || "", sid);
      } catch (eLog) {
      }
    }
    function syncFromList() {
      var next = readCurrentSessionId();
      if (!primed) {
        primed = true;
        lastId = next;
        _wbGuardLastSessionId = next;
        return;
      }
      if (next === lastId) return;
      lastId = next;
      _wbGuardLastSessionId = next;
      onSessionCurrentChanged("list");
    }
    function tryBindList() {
      if (disposed || unsubList) return !!unsubList;
      try {
        var sessions = ctx2 && ctx2.sessions || (ctx2 && typeof ctx2.get === "function" ? ctx2.get("sessions") : null);
        var list = sessions && sessions.list;
        if (list && typeof list.subscribe === "function") {
          syncFromList();
          unsubList = list.subscribe(syncFromList);
          return true;
        }
      } catch (eSub) {
      }
      return false;
    }
    if (!tryBindList()) {
      var attempts = 0;
      retryTimer = setInterval(function() {
        attempts += 1;
        if (tryBindList() || attempts > 40 || disposed) {
          clearInterval(retryTimer);
          retryTimer = null;
          if (!primed) {
            primed = true;
            lastId = readCurrentSessionId();
            _wbGuardLastSessionId = lastId;
          }
        }
      }, 250);
    }
    function onSidebarPointerDown(ev) {
      try {
        var el = ev && ev.target;
        if (!el || typeof el.closest !== "function") return;
        if (el.closest(
          WB_PLUGIN_LAUNCHER_SEL + ", [data-knowledge-workspace-close]"
        )) {
          if (el.closest(WB_PLUGIN_LAUNCHER_SEL)) {
            clearWorkbuddyLibraryUsagePresentation(bag._wbChatActions, readCurrentSessionId());
          }
          return;
        }
        var foreign = foreignPluginWorkspaceVisible();
        var stickyNow = false;
        try {
          var sid0 = readCurrentSessionId();
          if (sid0 && typeof localStorage !== "undefined") {
            var raw0 = localStorage.getItem("dsh.conversation.chat." + sid0);
            var data0 = raw0 ? JSON.parse(raw0) : null;
            stickyNow = !!(data0 && isWorkbuddyStickyView(data0.view));
          }
        } catch (eSt) {
        }
        if (!foreign && !stickyNow && !document.querySelector(".wb-usage-view, .wb-space-view, [data-wb-usage-view], [data-wb-space-view]")) {
          return;
        }
        var hit = el.closest("[data-session-id]") || el.closest('[role="treeitem"]') || el.closest('[role="option"]') || el.closest("a[href*='session']");
        if (!hit) {
          var btn = el.closest("button, a, [role='button']");
          if (!btn) return;
          var side = btn.closest(
            "aside, nav, [class*='sidebar'], [class*='Sidebar'], [class*='session'], [data-slot*='sidebar']"
          );
          if (!side) return;
          var bt = (btn.textContent || "").replace(/\s+/g, " ").trim();
          if (!bt || bt.length > 120) return;
          if (/^(资料库|用量|设置|知识库|自动化|定时任务|专家)/.test(bt)) return;
          hit = btn;
        }
        onSessionCurrentChanged("sidebar-pointer");
      } catch (ePtr) {
      }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("pointerdown", onSidebarPointerDown, true);
    }
    return function() {
      disposed = true;
      try {
        if (retryTimer) clearInterval(retryTimer);
      } catch (eT) {
      }
      try {
        if (typeof unsubList === "function") unsubList();
      } catch (eU) {
      }
      try {
        if (typeof document !== "undefined") {
          document.removeEventListener("pointerdown", onSidebarPointerDown, true);
        }
      } catch (eR) {
      }
    };
  }
  function WorkBuddySessionSwitchGuard(props) {
    var sessionId = props && props.sessionId;
    var actions = props && props.actions;
    var useStore = props && props.useStore;
    try {
      bag._wbChatActions = actions || bag._wbChatActions || null;
    } catch (eBag) {
    }
    var view = useStore ? useStore(function(s) {
      return s && s.view;
    }) : null;
    useEffect(
      function() {
        var prev = _wbGuardLastSessionId;
        _wbGuardLastSessionId = sessionId || null;
        if (sessionId) {
          try {
            globalThis.__wbDshSessionId = sessionId;
          } catch (eSid) {
          }
        }
        if (prev == null || prev === sessionId) return;
        dismissForeignPluginWorkspaces(bag._wbClientCtx);
        if (isWorkbuddyStickyView(view) || getWorkbuddyMainView()) {
          forceLeaveStickyWorkbuddyViews(actions, sessionId);
          return;
        }
        var acts = actions;
        var storeHook = useStore;
        setTimeout(function() {
          try {
            var cur = storeHook && typeof storeHook.getState === "function" ? storeHook.getState().view : null;
            if (isWorkbuddyStickyView(cur)) ensureConversationChatView(acts);
            else if (!cur) activateHostChatTab();
          } catch (eLate) {
            activateHostChatTab();
          }
        }, 0);
      },
      [sessionId, view, actions, useStore]
    );
    return null;
  }
  function tryOpenDshSession(sessionId, title, extraTitle) {
    var sid = String(sessionId || "").trim();
    if (sid) {
      try {
        var svc = bag._wbClientCtx && typeof bag._wbClientCtx.get === "function" ? bag._wbClientCtx.get("sessions") : null;
        if (svc && typeof svc.open === "function") {
          svc.open(sid);
          dismissForeignPluginWorkspaces(bag._wbClientCtx);
          setTimeout(function() {
            activateHostChatTab();
            forceLeaveStickyWorkbuddyViews(null);
          }, 0);
          return "opened";
        }
      } catch (eOpen) {
      }
    }
    if (tryClickSidebarSession(title, sid, extraTitle)) {
      dismissForeignPluginWorkspaces(bag._wbClientCtx);
      setTimeout(function() {
        activateHostChatTab();
        forceLeaveStickyWorkbuddyViews(null);
      }, 0);
      return "clicked";
    }
    return "failed";
  }
  function WorkBuddySpaceSection(props) {
    ensureCss();
    var PAGE_SIZE = 10;
    var queryState = useState("");
    var query = queryState[0];
    var setQuery = queryState[1];
    var statusState = useState("");
    var statusText = statusState[0];
    var setStatusText = statusState[1];
    var sessionsState = useState([]);
    var sessions = sessionsState[0];
    var setSessions = sessionsState[1];
    var pageState = useState(1);
    var page = pageState[0];
    var setPage = pageState[1];
    var totalState = useState(0);
    var total = totalState[0];
    var setTotal = totalState[1];
    var collapsedState = useState({});
    var collapsed = collapsedState[0];
    var setCollapsed = collapsedState[1];
    var meNameState = useState("");
    var meName = meNameState[0];
    var setMeName = meNameState[1];
    var busyState = useState(false);
    var busy = busyState[0];
    var setBusy = busyState[1];
    var errState = useState("");
    var err = errState[0];
    var setErr = errState[1];
    var previewState = useState(null);
    var preview = previewState[0];
    var setPreview = previewState[1];
    var menuIdState = useState("");
    var menuId = menuIdState[0];
    var setMenuId = menuIdState[1];
    var menuPosState = useState(null);
    var menuPos = menuPosState[0];
    var setMenuPos = menuPosState[1];
    function closeLibMenu() {
      setMenuId("");
      setMenuPos(null);
    }
    function openLibMenu(aid, btnEl) {
      if (menuId === aid) {
        closeLibMenu();
        return;
      }
      var rect = btnEl && btnEl.getBoundingClientRect ? btnEl.getBoundingClientRect() : null;
      var menuW = 120;
      var menuH = 132;
      var left = 8;
      var top = 8;
      if (rect) {
        left = Math.min(rect.right - menuW, (window.innerWidth || 0) - menuW - 8);
        left = Math.max(8, left);
        top = rect.bottom + 4;
        if (top + menuH > (window.innerHeight || 0) - 8) {
          top = Math.max(8, rect.top - menuH - 4);
        }
      }
      setMenuPos({ top, left });
      setMenuId(aid);
    }
    function spaceFetch(path, opts) {
      return fetchEngineApi(
        path,
        Object.assign({}, opts || {}, {
          headers: authHeaders(opts && opts.headers || {})
        })
      ).then(function(r) {
        return r.json().then(function(d) {
          if (r.status === 401) {
            var confirm = typeof confirmAuthExpiredAndClear === "function" ? confirmAuthExpiredAndClear() : Promise.resolve(true).then(function() {
              writeAuthSession(null);
              return true;
            });
            return confirm.then(function(cleared) {
              throw new Error(
                cleared ? "\u767B\u5F55\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" : "\u8D44\u6599\u5E93\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5"
              );
            });
          }
          return d;
        });
      });
    }
    function downloadMarkdownFile(filename, text, format) {
      var raw = String(filename || "library-export").trim() || "library-export";
      var safe = raw.replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").slice(0, 120);
      var fmt = String(format || "md").toLowerCase();
      var ext = fmt === "json" ? ".json" : fmt === "html" ? ".html" : fmt === "code" ? "" : ".md";
      var mime = fmt === "json" ? "application/json;charset=utf-8" : fmt === "html" ? "text/html;charset=utf-8" : "text/plain;charset=utf-8";
      if (fmt === "code") {
        if (!/\.[A-Za-z0-9]{1,12}$/.test(safe)) safe += ".txt";
      } else if (!/\.(md|json|html)$/i.test(safe)) {
        safe += ext;
      }
      var blob = new Blob([text == null ? "" : String(text)], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = safe;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        try {
          document.body.removeChild(a);
        } catch (e0) {
        }
        try {
          URL.revokeObjectURL(url);
        } catch (e1) {
        }
      }, 800);
    }
    function spaceFmtBytes(n) {
      var x = Number(n) || 0;
      if (x < 1024) return x + " B";
      if (x < 1024 * 1024) return Math.round(x / 1024) + " KB";
      return (x / (1024 * 1024)).toFixed(1) + " MB";
    }
    function loadLibrary(pageOverride, queryOverride) {
      var pg = pageOverride != null ? pageOverride : page;
      var qv = queryOverride != null ? queryOverride : query;
      setBusy(true);
      setErr("");
      var qs = "/api/space/library?page=" + encodeURIComponent(String(pg)) + "&page_size=" + PAGE_SIZE;
      var qTrim = String(qv || "").trim();
      if (qTrim) qs += "&q=" + encodeURIComponent(qTrim);
      return spaceFetch(qs).then(function(d) {
        if (!d || !d.ok) throw new Error(d && d.detail || "\u5217\u8868\u5931\u8D25");
        var list = d.sessions || [];
        setSessions(list);
        setMeName(d.display_name || "");
        setTotal(Number(d.total) || 0);
        setPage(Number(d.page) || pg);
        setCollapsed(function(prev) {
          var next = Object.assign({}, prev || {});
          list.forEach(function(s) {
            var sid = String(s && s.id || "");
            if (!sid) return;
            var n = (s.artifacts || []).length;
            if (n <= 1) delete next[sid];
            else if (next[sid] == null) next[sid] = false;
          });
          return next;
        });
      }).catch(function(e) {
        setSessions([]);
        setTotal(0);
        setErr(e && e.message || String(e));
      }).then(function() {
        return loadStatus().catch(function() {
        });
      }).then(function() {
        setBusy(false);
      });
    }
    function loadStatus() {
      return spaceFetch("/api/space/status").then(function(d) {
        if (!d || !d.ok) throw new Error(d && d.detail || "\u72B6\u6001\u5931\u8D25");
        var cfg = d.config || {};
        setStatusText(
          (d.sessions || 0) + " \u4E2A\u4F1A\u8BDD \xB7 " + (d.artifacts || 0) + " \u4EFD\u6587\u6863 \xB7 \u7EA6 " + Math.round((d.bytes || 0) / 1024) + " KB \xB7 \u4FDD\u7559 " + (cfg.retention_days == null ? "\u2014" : cfg.retention_days) + " \u5929"
        );
      });
    }
    useEffect(
      function() {
        var t = setTimeout(function() {
          loadLibrary(1, query);
        }, 320);
        return function() {
          clearTimeout(t);
        };
      },
      [query]
    );
    useEffect(
      function() {
        if (!menuId) return void 0;
        function onDocClick() {
          closeLibMenu();
        }
        function onScrollOrResize() {
          closeLibMenu();
        }
        document.addEventListener("click", onDocClick);
        window.addEventListener("resize", onScrollOrResize);
        window.addEventListener("scroll", onScrollOrResize, true);
        return function() {
          document.removeEventListener("click", onDocClick);
          window.removeEventListener("resize", onScrollOrResize);
          window.removeEventListener("scroll", onScrollOrResize, true);
        };
      },
      [menuId]
    );
    useEffect(
      function() {
        if (!preview) return void 0;
        function onKey(ev) {
          if (ev.key === "Escape") {
            ev.stopPropagation();
            setPreview(null);
          }
        }
        document.addEventListener("keydown", onKey, true);
        return function() {
          document.removeEventListener("keydown", onKey, true);
        };
      },
      [preview]
    );
    function openLinkedSession(s) {
      if (!s || !s.id || s.id === "unassigned") return;
      var bound = String(s.dsh_session_id || "").trim();
      if (!bound && !s.openable) {
        window.alert(
          "\u8BE5\u6863\u6848\u672A\u7ED1\u5B9A DSH \u4F1A\u8BDD\uFF0C\u65E0\u6CD5\u8DF3\u8F6C\u3002\n\n\u5BA1\u7801/\u5199\u7801\u987B\u5728\u4EFB\u52A1\u5F00\u59CB\u65F6\u5E26\u4E0A\u5F53\u524D sessionId \u624D\u4F1A\u5199\u5165\u7ED1\u5B9A\uFF1BPCB 8D \u7B49\u4ECE\u8349\u7A3F\u76EE\u5F55\u626B\u5165\u7684\u6761\u76EE\u6CA1\u6709\u804A\u5929\u4F1A\u8BDD id\u3002\n\u4E0D\u4F1A\u518D\u7528\u5185\u5BB9\u53BB\u731C\u76F8\u4F3C\u4F1A\u8BDD\uFF0C\u4EE5\u514D\u70B9\u9519\u3002"
        );
        return;
      }
      setBusy(true);
      setErr("");
      spaceFetch("/api/space/sessions/" + encodeURIComponent(s.id) + "/locate-dsh").then(function(d) {
        var sid = d && d.dsh_session_id || bound || "";
        var title = d && d.dsh_title || "";
        if (!sid) {
          window.alert(
            "\u672A\u7ED1\u5B9A DSH \u4F1A\u8BDD\uFF08detail: " + (d && d.detail || "no-binding") + "\uFF09\u3002\u8BF7\u91CD\u65B0\u8DD1\u4E00\u904D\u5BA1\u7801/\u5199\u7801\u4EE5\u5199\u5165\u7ED1\u5B9A\u3002"
          );
          return;
        }
        if (props && typeof props.onClose === "function") props.onClose();
        setTimeout(function() {
          var how = tryOpenDshSession(sid, title, s.title || "");
          if (how === "failed") {
            window.alert(
              "\u5DF2\u7ED1\u5B9A\u4F1A\u8BDD " + sid + "\uFF0C\u4F46\u5F53\u524D\u4FA7\u680F\u672A\u80FD\u6253\u5F00\u3002\n\u53EF\u80FD\u4E0D\u5728\u5F53\u524D\u5DE5\u4F5C\u533A\uFF0C\u8BF7\u5207\u6362\u5DE5\u4F5C\u533A\u540E\u518D\u8BD5\u3002"
            );
          }
        }, 160);
      }).catch(function(e) {
        setErr(e && e.message || String(e));
      }).then(function() {
        setBusy(false);
      });
    }
    function openArtifactPreview(id) {
      setBusy(true);
      setErr("");
      spaceFetch("/api/space/artifacts/" + encodeURIComponent(id)).then(function(d) {
        if (!d || !d.ok) throw new Error(d && d.detail || "\u9884\u89C8\u5931\u8D25");
        var art = d.artifact || {};
        setPreview({
          kind: "artifact",
          id: art.id || id,
          title: art.title || art.id || "\u6587\u6863",
          body: d.body || "",
          format: spaceGuessFormat(art.kind, art.id, art.relpath, d.body || "")
        });
      }).catch(function(e) {
        setErr(e && e.message || String(e));
      }).then(function() {
        setBusy(false);
      });
    }
    function downloadArtifact(id) {
      setBusy(true);
      spaceFetch("/api/space/artifacts/" + encodeURIComponent(id)).then(function(d) {
        if (!d || !d.ok) throw new Error(d && d.detail || "\u4E0B\u8F7D\u5931\u8D25");
        var art = d.artifact || {};
        var fmt = spaceGuessFormat(art.kind, art.id, art.relpath, d.body || "");
        var name = String(art.title || art.id || id || "report");
        downloadMarkdownFile(name, d.body || "", fmt);
      }).catch(function(e) {
        setErr(e && e.message || String(e));
      }).then(function() {
        setBusy(false);
      });
    }
    function deleteSession(id) {
      if (!id || !window.confirm("\u5220\u9664\u8BE5\u4F1A\u8BDD\u6863\u6848\u53CA\u5176\u6587\u6863\uFF1F\u4E0D\u4F1A\u5220\u9664\u5DE6\u4FA7 DSH \u539F\u4F1A\u8BDD\u3002")) return;
      setBusy(true);
      spaceFetch("/api/space/sessions/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
      }).then(function(d) {
        if (!d || !d.ok) throw new Error(d && d.detail || "\u5220\u9664\u5931\u8D25");
        setPreview(null);
        return loadLibrary();
      }).catch(function(e) {
        setErr(e && e.message || String(e));
        setBusy(false);
      });
    }
    function deleteArtifact(id) {
      if (!id || !window.confirm("\u5220\u9664\u8BE5\u6587\u6863\uFF1F")) return;
      setBusy(true);
      spaceFetch("/api/space/artifacts/" + encodeURIComponent(id), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" }
      }).then(function(d) {
        if (!d || !d.ok) throw new Error(d && d.detail || "\u5220\u9664\u5931\u8D25");
        setPreview(null);
        return loadLibrary();
      }).catch(function(e) {
        setErr(e && e.message || String(e));
        setBusy(false);
      });
    }
    function purge(dry) {
      if (!dry && !window.confirm("\u6309\u4FDD\u7559\u7B56\u7565\u6E05\u7406\u8FC7\u671F\u6863\u6848\uFF1F")) return;
      setBusy(true);
      spaceFetch("/api/space/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry_run: !!dry })
      }).then(function(d) {
        if (!d || !d.ok) throw new Error(d && d.detail || "\u6E05\u7406\u5931\u8D25");
        window.alert(
          (dry ? "\u5C06\u6E05\u7406\u7EA6 " : "\u5DF2\u6E05\u7406 ") + (d.purged_sessions || 0) + " \u4E2A\u4F1A\u8BDD\uFF08\u4FDD\u7559 " + (d.retention_days != null ? d.retention_days : "\u2014") + " \u5929\uFF09"
        );
        return dry ? loadStatus() : loadLibrary();
      }).catch(function(e) {
        setErr(e && e.message || String(e));
      }).then(function() {
        setBusy(false);
      });
    }
    var pageCount = Math.max(1, Math.ceil((Number(total) || 0) / PAGE_SIZE));
    var rows = [];
    (sessions || []).forEach(function(s) {
      var who = s.display_name || meName || "";
      var canOpen = !!(s.openable || s.dsh_session_id);
      var arts = s.artifacts || [];
      var multi = arts.length > 1;
      var isCollapsed = multi && !!collapsed[s.id];
      rows.push(
        h(
          "tr",
          { key: "s-" + s.id, className: "sess" },
          h(
            "td",
            { colSpan: 6 },
            h(
              "div",
              { className: "wb-lib-name" },
              multi ? h(
                "button",
                {
                  type: "button",
                  className: "wb-lib-fold",
                  title: isCollapsed ? "\u5C55\u5F00\u6587\u6863" : "\u6298\u53E0\u6587\u6863",
                  "aria-expanded": !isCollapsed,
                  onClick: function(ev) {
                    ev.stopPropagation();
                    setCollapsed(function(prev) {
                      var next = Object.assign({}, prev || {});
                      next[s.id] = !next[s.id];
                      return next;
                    });
                  }
                },
                isCollapsed ? "\u25B6" : "\u25BC"
              ) : h("span", { className: "wb-lib-fold-spacer", "aria-hidden": "true" }),
              h("span", { className: "wb-lib-ico chat", "aria-hidden": "true" }, "\u4F1A"),
              h(
                "span",
                {
                  className: "t " + (canOpen ? "sess-link" : "sess-muted"),
                  title: canOpen ? "\u6253\u5F00\u5DF2\u7ED1\u5B9A\u7684 DSH \u4F1A\u8BDD" : "\u672A\u7ED1\u5B9A DSH \u4F1A\u8BDD\uFF0C\u65E0\u6CD5\u8DF3\u8F6C\uFF08\u5BA1\u7801/\u5199\u7801\u65B0\u8DD1\u624D\u4F1A\u5199\u5165\u7ED1\u5B9A\uFF09",
                  onClick: function() {
                    openLinkedSession(s);
                  }
                },
                s.title || s.id
              ),
              arts.length ? h("span", { className: "wb-lib-count" }, arts.length + " \u4EFD\u6587\u6863") : null
            )
          )
        )
      );
      if (isCollapsed) return;
      arts.forEach(function(a) {
        var afmt = spaceGuessFormat(a.kind, a.id, a.relpath || a.summary || "", "");
        var typeLabel = spaceTypeLabel(a.kind, afmt);
        var icoClass = afmt === "json" ? "json" : afmt === "code" ? "code" : "md";
        var icoLetter = afmt === "json" ? "J" : afmt === "code" ? "C" : afmt === "html" ? "H" : "M";
        rows.push(
          h(
            "tr",
            {
              key: "a-" + a.id,
              className: "file",
              onClick: function() {
                openArtifactPreview(a.id);
              }
            },
            h(
              "td",
              { className: "col-name" },
              h(
                "div",
                { className: "wb-lib-name wb-lib-file" },
                h(
                  "span",
                  {
                    className: "wb-lib-ico " + icoClass,
                    "aria-hidden": "true"
                  },
                  icoLetter
                ),
                h("span", { className: "t" }, a.title || a.id)
              )
            ),
            h("td", { className: "col-type" }, typeLabel),
            h("td", { className: "col-who" }, a.display_name || who),
            h("td", { className: "col-time" }, spaceFmtTime(a.created_at || s.updated_at)),
            h("td", { className: "col-size" }, spaceFmtBytes(a.bytes)),
            h(
              "td",
              {
                className: "col-act",
                onClick: function(ev) {
                  ev.stopPropagation();
                }
              },
              h(
                "div",
                { className: "wb-lib-actions" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "wb-lib-more" + (menuId === a.id ? " open" : ""),
                    "aria-label": "\u66F4\u591A\u64CD\u4F5C",
                    "aria-haspopup": "menu",
                    "aria-expanded": menuId === a.id,
                    disabled: busy,
                    onClick: function(ev) {
                      ev.stopPropagation();
                      openLibMenu(a.id, ev.currentTarget);
                    }
                  },
                  "\xB7\xB7\xB7"
                ),
                menuId === a.id && menuPos ? h(
                  "div",
                  {
                    className: "wb-lib-menu",
                    role: "menu",
                    style: {
                      top: menuPos.top + "px",
                      left: menuPos.left + "px"
                    },
                    onClick: function(ev) {
                      ev.stopPropagation();
                    }
                  },
                  h(
                    "button",
                    {
                      type: "button",
                      role: "menuitem",
                      onClick: function() {
                        closeLibMenu();
                        openArtifactPreview(a.id);
                      }
                    },
                    "\u9884\u89C8"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      role: "menuitem",
                      onClick: function() {
                        closeLibMenu();
                        downloadArtifact(a.id);
                      }
                    },
                    "\u4E0B\u8F7D"
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      role: "menuitem",
                      className: "danger",
                      onClick: function() {
                        closeLibMenu();
                        deleteArtifact(a.id);
                      }
                    },
                    "\u5220\u9664"
                  )
                ) : null
              )
            )
          )
        );
      });
    });
    var loadingNode = h(
      "div",
      { className: "wb-lib-loading", role: "status", "aria-live": "polite", "aria-label": "\u8D44\u6599\u5E93\u52A0\u8F7D\u4E2D" },
      h(
        "div",
        { className: "wb-lib-orbit", "aria-hidden": "true" },
        h("div", { className: "ring" }),
        h("div", { className: "ring r2" }),
        h("div", { className: "core" }),
        h("div", { className: "dot" }),
        h("div", { className: "dot d2" }),
        h("div", { className: "dot d3" })
      ),
      h("p", { className: "hint" }, "\u6574\u7406\u8D44\u6599\u4E2D")
    );
    var tableNode;
    if (busy) {
      tableNode = loadingNode;
    } else if (!sessions.length) {
      tableNode = h(
        "div",
        { className: "wb-space-empty" },
        String(query || "").trim() ? "\u6CA1\u6709\u5339\u914D\u7684\u4F1A\u8BDD\u6216\u6587\u6863\u3002" : "\u6682\u65E0\u8D44\u6599\u3002\u5BA1\u7801\u62A5\u544A\u3001\u5199\u7801\u6E90\u7801\u3001PCB 8D \u4F1A\u6309\u4F1A\u8BDD\u51FA\u73B0\u5728\u8FD9\u91CC\u3002"
      );
    } else {
      tableNode = h(
        "table",
        { className: "wb-lib-table" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", { className: "col-name" }, "\u540D\u79F0"),
            h("th", { className: "col-type" }, "\u7C7B\u578B"),
            h("th", { className: "col-who" }, "\u66F4\u65B0\u4EBA"),
            h("th", { className: "col-time" }, "\u66F4\u65B0\u65F6\u95F4"),
            h("th", { className: "col-size" }, "\u5927\u5C0F"),
            h("th", { className: "col-act" }, "")
          )
        ),
        h("tbody", null, rows)
      );
    }
    var pagerNode = total > 0 ? h(
      "div",
      { className: "wb-lib-pager" },
      h(
        "button",
        {
          type: "button",
          className: "wb-cr-btn",
          disabled: busy || page <= 1,
          onClick: function() {
            loadLibrary(page - 1);
          }
        },
        "\u4E0A\u4E00\u9875"
      ),
      h("span", null, "\u7B2C " + page + " / " + pageCount + " \u9875 \xB7 \u5171 " + total + " \u4E2A\u4F1A\u8BDD"),
      h(
        "button",
        {
          type: "button",
          className: "wb-cr-btn",
          disabled: busy || page >= pageCount,
          onClick: function() {
            loadLibrary(page + 1);
          }
        },
        "\u4E0B\u4E00\u9875"
      )
    ) : null;
    var previewFmt = preview ? preview.format || "md" : "md";
    var previewInner = null;
    var previewNode = null;
    if (preview) {
      if (previewFmt === "json") {
        var pretty = preview.body || "";
        try {
          pretty = JSON.stringify(JSON.parse(preview.body || ""), null, 2);
        } catch (eJson) {
        }
        previewInner = h("pre", null, pretty || "\uFF08\u65E0\u6B63\u6587\uFF09");
      } else if (previewFmt === "code") {
        previewInner = h("pre", null, preview.body || "\uFF08\u65E0\u6B63\u6587\uFF09");
      } else if (previewFmt === "html") {
        previewInner = h("iframe", {
          className: "wb-lib-html",
          sandbox: "",
          srcDoc: preview.body || "<p>\uFF08\u65E0\u6B63\u6587\uFF09</p>",
          title: "HTML \u9884\u89C8"
        });
      } else {
        previewInner = h("div", {
          className: "wb-lib-md",
          dangerouslySetInnerHTML: { __html: spaceMdToHtml(preview.body || "") }
        });
      }
      previewNode = h(
        "div",
        { className: "wb-lib-fs", role: "dialog", "aria-label": "\u9884\u89C8" },
        h(
          "div",
          { className: "wb-lib-fs-head" },
          h(
            "div",
            { style: { minWidth: 0 } },
            h("div", { className: "t" }, preview.title || preview.id),
            h(
              "div",
              { className: "sub" },
              "\u6B63\u5728\u9884\u89C8 \xB7 " + (previewFmt === "md" ? "Markdown" : previewFmt === "code" ? "\u4EE3\u7801" : previewFmt.toUpperCase())
            )
          ),
          h(
            "div",
            { className: "wb-space-actions" },
            h(
              "button",
              {
                type: "button",
                className: "wb-cr-btn",
                onClick: function() {
                  downloadMarkdownFile(preview.title || preview.id || "preview", preview.body || "", previewFmt);
                }
              },
              previewFmt === "json" ? "\u4E0B\u8F7D .json" : previewFmt === "html" ? "\u4E0B\u8F7D .html" : previewFmt === "code" ? "\u4E0B\u8F7D\u6E90\u7801" : "\u4E0B\u8F7D .md"
            ),
            h(
              "button",
              {
                type: "button",
                className: "wb-usage-panel-x",
                "aria-label": "\u5173\u95ED\u9884\u89C8",
                onClick: function() {
                  setPreview(null);
                }
              },
              "\xD7"
            )
          )
        ),
        h("div", { className: "wb-lib-fs-body" }, previewInner)
      );
    }
    if (preview) {
      return h("div", { className: "wb-usage-page wb-lib-has-preview" }, previewNode);
    }
    return h(
      "div",
      { className: "wb-usage-page wb-lib-page" },
      h(
        "p",
        { className: "wb-space-note" },
        "\u70B9\u84DD\u8272\u4F1A\u8BDD\u540D\u6253\u5F00\u5DF2\u7ED1\u5B9A\u804A\u5929\u3002\u8D44\u6599\u5E93\u6536\u521B\u4F5C/\u6D4B\u8BD5\u7528\u4F8B\u3001\u5BA1\u7801\u4E0E 8D\uFF1B\u5199\u7801\u6210\u529F\u540E\u53EA\u6302\u672C\u4EFB\u52A1\u6539\u52A8\u5E76\u5DF2\u540C\u6B65\u7684\u6E90\u7801\uFF08\u672A\u6539\u52A8\u7684\u4E0D\u5165\u5E93\uFF09\u3002\u77E5\u8BC6\u5E93\u68C0\u7D22\u95EE\u7B54\u4E0D\u8FDB\u8D44\u6599\u5E93\u3002"
      ),
      h(
        "div",
        { className: "wb-lib-toolbar" },
        h("input", {
          className: "wb-lib-search",
          placeholder: "\u641C\u7D22\u6587\u4EF6\u3001\u4F1A\u8BDD",
          value: query,
          onChange: function(ev) {
            setQuery(ev.target.value);
          }
        }),
        h(
          "button",
          {
            type: "button",
            className: "wb-cr-btn",
            disabled: busy,
            onClick: function() {
              loadLibrary();
            }
          },
          busy ? "\u5237\u65B0\u4E2D\u2026" : "\u5237\u65B0"
        ),
        h(
          "button",
          {
            type: "button",
            className: "wb-cr-btn",
            disabled: busy,
            onClick: function() {
              purge(true);
            }
          },
          "\u9884\u89C8\u6E05\u7406"
        ),
        h(
          "button",
          {
            type: "button",
            className: "wb-cr-btn",
            disabled: busy,
            onClick: function() {
              purge(false);
            }
          },
          "\u6E05\u7406\u8FC7\u671F"
        )
      ),
      statusText && !busy ? h("div", { className: "wb-lib-meta" }, statusText) : null,
      err ? h("div", { className: "wb-cr-err" }, err) : null,
      h("div", { className: "wb-lib-scroll" }, tableNode),
      pagerNode
    );
  }
  function WorkBuddySpaceView(_props) {
    ensureCss();
    return h(
      "div",
      { className: "wb-space-view", "data-wb-space-view": "1" },
      h("div", { className: "wb-space-view-body" }, h(WorkBuddySpaceSection, null))
    );
  }
  ctx.installWorkBuddySessionSwitchWatcher = installWorkBuddySessionSwitchWatcher;
  ctx.installWorkbuddyPluginWorkspaceHandoff = installWorkbuddyPluginWorkspaceHandoff;
  ctx.clearWorkbuddyLibraryUsagePresentation = clearWorkbuddyLibraryUsagePresentation;
  ctx.WorkBuddySessionSwitchGuard = WorkBuddySessionSwitchGuard;
  ctx.WorkBuddySidebarViewsNav = WorkBuddySidebarViewsNav;
  ctx.WorkBuddyLibraryPanelIcon = WorkBuddyLibraryPanelIcon;
  ctx.WorkBuddyUsagePanelIcon = WorkBuddyUsagePanelIcon;
  ctx.WorkBuddyLibraryMain = WorkBuddyLibraryMain;
  ctx.WorkBuddyUsageMain = WorkBuddyUsageMain;
  ctx.wbSupportsDockedPanels = wbSupportsDockedPanels;
  ctx.hideWorkbuddyConversationViewTabs = hideWorkbuddyConversationViewTabs;
  ctx.WorkBuddyMainViewOverlay = WorkBuddyMainViewOverlay;
  ctx.setWorkbuddyMainView = setWorkbuddyMainView;
  ctx.WorkBuddySpaceSection = WorkBuddySpaceSection;
  ctx.WorkBuddySpaceView = WorkBuddySpaceView;
  ctx.borrowChatStore = borrowChatStore;
  ctx.readWorkbuddyCurrentSessionId = function() {
    try {
      var c = bag._wbClientCtx || ctx;
      var sessions = c && c.sessions || (c && typeof c.get === "function" ? c.get("sessions") : null);
      if (sessions) {
        var list = sessions.list;
        if (list && typeof list.getSnapshot === "function") {
          var snap = list.getSnapshot();
          var cur = snap && snap.current;
          if (cur != null && cur !== "") return String(cur);
        }
        if (typeof sessions.current === "string" && sessions.current) {
          return sessions.current;
        }
      }
    } catch (eRead) {
    }
    if (_wbGuardLastSessionId) return String(_wbGuardLastSessionId);
    try {
      return String(globalThis.__wbDshSessionId || "").trim() || null;
    } catch (eG) {
      return null;
    }
  };
}

// client-src/project-profile.js
function installProjectProfile(ctx) {
  var engineBase = ctx.engineBase;
  var authHeaders = ctx.authHeaders;
  function installProjectProfileWatcher(hostCtx) {
    var lastCwd = "";
    var disposed = false;
    var timer = null;
    var unsub = null;
    function sessionsOf() {
      try {
        return hostCtx && hostCtx.sessions || (hostCtx && typeof hostCtx.get === "function" ? hostCtx.get("sessions") : null);
      } catch (e) {
        return null;
      }
    }
    function readCwd() {
      var sessions2 = sessionsOf();
      if (!sessions2) return "";
      var list2 = sessions2.list;
      var snap = null;
      try {
        snap = list2 && typeof list2.getSnapshot === "function" ? list2.getSnapshot() : null;
      } catch (eSnap) {
        snap = null;
      }
      var sid = "";
      if (snap && snap.current != null && snap.current !== "") sid = String(snap.current);
      else if (typeof sessions2.current === "string") sid = sessions2.current;
      if (!sid) return "";
      var buckets = [];
      if (snap && snap.byId) buckets.push(snap.byId);
      if (sessions2.byId) buckets.push(sessions2.byId);
      var i;
      for (i = 0; i < buckets.length; i++) {
        var row = buckets[i][sid];
        if (row && row.cwd) return String(row.cwd).trim();
      }
      var items = snap && (snap.items || snap.sessions) || [];
      if (Array.isArray(items)) {
        for (i = 0; i < items.length; i++) {
          var it = items[i];
          if (it && String(it.id || "") === sid && it.cwd) return String(it.cwd).trim();
        }
      }
      return "";
    }
    function ensure(cwd) {
      var base = "";
      try {
        base = engineBase ? engineBase() : "";
      } catch (eBase) {
        base = "";
      }
      if (!base || !cwd) return;
      var headers = { "Content-Type": "application/json" };
      try {
        if (typeof authHeaders === "function") headers = authHeaders(headers);
      } catch (eAuth) {
      }
      fetch(base + "/api/project-profile/ensure", {
        method: "POST",
        headers,
        body: JSON.stringify({ workspace: cwd })
      }).catch(function() {
      });
    }
    function tick() {
      if (disposed) return;
      var cwd = readCwd();
      if (!cwd || cwd === lastCwd) return;
      lastCwd = cwd;
      ensure(cwd);
    }
    try {
      var sessions = sessionsOf();
      var list = sessions && sessions.list;
      if (list && typeof list.subscribe === "function") {
        unsub = list.subscribe(tick);
      }
    } catch (eSub) {
    }
    timer = setInterval(tick, 2e3);
    tick();
    return function() {
      disposed = true;
      if (timer) clearInterval(timer);
      if (typeof unsub === "function") {
        try {
          unsub();
        } catch (eUn) {
        }
      }
    };
  }
  ctx.installProjectProfileWatcher = installProjectProfileWatcher;
}

// client-src/usage-view.js
function installUsageView(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var WorkBuddyUsageSection = ctx.WorkBuddyUsageSection;
  function usageNavIcon(size) {
    return h(
      "svg",
      { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
      h("rect", { x: "2", y: "8", width: "3", height: "6", rx: "0.5", fill: "currentColor" }),
      h("rect", { x: "6.5", y: "4", width: "3", height: "10", rx: "0.5", fill: "currentColor" }),
      h("rect", { x: "11", y: "6", width: "3", height: "8", rx: "0.5", fill: "currentColor" })
    );
  }
  function WorkBuddyUsageView(_props) {
    ensureCss();
    var scopeState = useState("personal");
    var scope = scopeState[0];
    var setScope = scopeState[1];
    var isAdminState = useState(false);
    var isAdmin = isAdminState[0];
    var setIsAdmin = isAdminState[1];
    return h(
      "div",
      { className: "wb-usage-view", "data-wb-usage-view": "1" },
      isAdmin ? h(
        "div",
        { className: "wb-usage-view-head" },
        h(
          "table",
          { className: "wb-usage-tabs", role: "tablist", "aria-label": "\u7528\u91CF\u8303\u56F4" },
          h(
            "tbody",
            null,
            h(
              "tr",
              null,
              h(
                "td",
                {
                  className: scope === "personal" ? "active" : "",
                  role: "presentation"
                },
                h(
                  "button",
                  {
                    type: "button",
                    role: "tab",
                    "aria-selected": scope === "personal",
                    onClick: function() {
                      setScope("personal");
                    }
                  },
                  "\u4E2A\u4EBA\u7528\u91CF"
                )
              ),
              h(
                "td",
                {
                  className: scope === "enterprise" ? "active" : "",
                  role: "presentation"
                },
                h(
                  "button",
                  {
                    type: "button",
                    role: "tab",
                    "aria-selected": scope === "enterprise",
                    onClick: function() {
                      setScope("enterprise");
                    }
                  },
                  "\u4F01\u4E1A\u7528\u91CF"
                )
              )
            )
          )
        )
      ) : null,
      h(
        "div",
        { className: "wb-usage-view-body" },
        h(WorkBuddyUsageSection, {
          scope: isAdmin ? scope : "personal",
          onScopeChange: function(next) {
            setScope(next === "enterprise" ? "enterprise" : "personal");
          },
          onAdminChange: function(admin) {
            setIsAdmin(!!admin);
            if (!admin) setScope("personal");
          }
        })
      )
    );
  }
  ctx.usageNavIcon = usageNavIcon;
  ctx.WorkBuddyUsageView = WorkBuddyUsageView;
}

// client-src/login-mount.js
function installLoginMount(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var bag = ctx;
  var mountAppLoginGate = ctx.mountAppLoginGate;
  function ensureLoginGateMounted() {
    if (bag._loginGateUnmount) return;
    try {
      bag._loginGateUnmount = mountAppLoginGate();
    } catch (err) {
      console.error("[dsh-mes-bridge] \u767B\u5F55\u6321\u677F\u6302\u8F7D\u5931\u8D25", err);
    }
  }
  ctx.ensureLoginGateMounted = ensureLoginGateMounted;
}

// lib/coding-fail-kind.js
function isDbOrBinaryRel(rel) {
  const p = String(rel || "").replace(/\\/g, "/").toLowerCase().trim();
  if (!p) return true;
  if (p.endsWith(".db") || p.endsWith(".sqlite") || p.endsWith(".sqlite3")) return true;
  if (p.endsWith(".db-journal") || p.endsWith(".db-wal") || p.endsWith(".db-shm")) return true;
  const name = p.split("/").pop() || "";
  if (name === "erp.db" || name === "data.db" || name === "app.db") return true;
  return false;
}
function codeFilesOnlyForSync(files) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of files || []) {
    const rel = String(raw || "").replace(/\\/g, "/").trim().replace(/^\.\//, "");
    if (!rel || isDbOrBinaryRel(rel) || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
    if (out.length >= 40) break;
  }
  return out;
}
function isHollowCodingSuccess(job) {
  if (!job || typeof job !== "object") return false;
  if (String(job.status || "").trim() !== "succeeded") return false;
  const synced = codeFilesOnlyForSync(
    job.synced_files || job.last_synced_files || []
  );
  return synced.length === 0;
}
function classifySyncedTouch(files) {
  const list = codeFilesOnlyForSync(files);
  let frontend = false;
  let backend = false;
  for (const rel of list) {
    const p = String(rel || "").replace(/\\/g, "/").toLowerCase();
    if (!p) continue;
    const fePath = /(^|\/)(frontend|web|client|src\/views|src\/components|src\/pages|src\/router)\//.test(
      p
    ) || /\.(vue|tsx|jsx|css|scss|less|html|svelte)$/.test(p);
    const bePath = /(^|\/)(backend|server|api|engine\/app|app\/)\//.test(p) || /\.(py|go|rs|java|cs)$/.test(p) || /(migrate|alembic|sqlalchemy|uvicorn)/.test(p);
    if (fePath) frontend = true;
    if (bePath) backend = true;
    if (/\.(ts|js|mjs|cjs)$/.test(p) && !fePath && !bePath) {
      frontend = true;
    }
  }
  return { frontend, backend, n: list.length };
}
function formatPostCodingSelfCheck(files) {
  const touch = classifySyncedTouch(files);
  if (!touch.n) return "";
  if (touch.backend && touch.frontend) {
    return "\u81EA\u68C0\uFF1A\u672C\u6B21\u524D\u540E\u7AEF\u90FD\u6709\u6539\u52A8\u2014\u2014\u8BF7\u5148\u91CD\u542F\u4E1A\u52A1\u540E\u7AEF\uFF0C\u518D\u786C\u5237\u65B0\u9875\u9762\uFF0C\u70B9\u4E00\u904D\u521A\u6539\u7684\u529F\u80FD\u786E\u8BA4\u3002\u82E5\u8F93\u5165\u6846\u65C1\u7EFF\u8272\u300C\u9700\u6C42\u2192\u4E0A\u7EBF\u300D\u5F00\u7740\uFF0C\u53EF\u5BF9\u7167\u8FC7\u7A0B\u6D41\u91CC\u7684\u9A8C\u8BC1\u6B65\u7ED3\u679C\uFF1B\u672C\u4ED3\u4E0D\u4F1A\u4EE3\u8DD1\u6D4B\u8BD5\u6216\u8D77 Vite\u3002";
  }
  if (touch.backend) {
    return "\u81EA\u68C0\uFF1A\u672C\u6B21\u504F\u540E\u7AEF\u6539\u52A8\u2014\u2014\u8BF7\u91CD\u542F\u4E1A\u52A1\u540E\u7AEF\u540E\u518D\u8C03\u63A5\u53E3/\u6253\u5F00\u76F8\u5173\u9875\u786E\u8BA4\u3002\u4E0D\u8981\u5728\u804A\u5929\u91CC\u8BA9\u6211\u4EE3\u8DD1\u6D4B\u8BD5\u6216\u8D77\u5F00\u53D1\u670D\u52A1\u5668\u3002";
  }
  return "\u81EA\u68C0\uFF1A\u672C\u6B21\u504F\u524D\u7AEF\u6539\u52A8\u2014\u2014\u8BF7\u786C\u5237\u65B0\u9875\u9762\uFF08\u5FC5\u8981\u65F6\u6E05\u7F13\u5B58\uFF09\u540E\u70B9\u4E00\u904D\u521A\u6539\u7684\u529F\u80FD\u786E\u8BA4\u3002\u82E5\u4ECD\u4E0D\u5BF9\uFF0C\u76F4\u63A5\u8BF4\u5177\u4F53\u54EA\u91CC\u4E0D\u5BF9\u5373\u53EF\u3002";
}
function classifyCodingFailKind(detail) {
  const blob = String(detail || "");
  if (/EPERM|operation not permitted/i.test(blob) && /\.db|sqlite|erp\.db|pcb_procurement\.db/i.test(blob)) {
    return "db_eperm";
  }
  if (/URL images are only supported for cloud SDK agents/i.test(blob)) {
    return "url_images";
  }
  if (/Agent .+ not found|父 Agent 不可用|unknown agent|no such agent/i.test(blob)) {
    return "agent_missing";
  }
  if (/Network request failed/i.test(blob) || /retryable\s*=\s*true/i.test(blob) && /network|fetch|ECONN|ETIMEDOUT|ENOTFOUND/i.test(blob)) {
    return "network";
  }
  return "other";
}
function shortDetail(detail, n) {
  const s = String(detail || "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  return s.length > (n || 160) ? s.slice(0, n || 160) + "\u2026" : s;
}
function codingFailProgressCopy(kind, detail) {
  const d = shortDetail(detail, 120);
  switch (kind) {
    case "network":
      return {
        title: "\u3010\u7F51\u7EDC\u3011\u6296\u52A8\uFF0C\u672C\u8F6E\u672A\u6539\u5230\u5DE5\u7A0B",
        body: "\u5199\u7801\u4E91/\u51FA\u7F51\u5931\u8D25\uFF08\u5E38\u5E26 retryable\uFF09\uFF0C\u4E0D\u662F\u4E1A\u52A1\u9700\u6C42\u5199\u9519\u3002\u8BF7\u70B9\u300C\u7EED\u6539\u786E\u8BA4\u300D\u7528\u540C\u4E00\u8BC9\u6C42\u518D\u8BD5\uFF1B\u82E5\u591A\u6B21\u4ECD\u5931\u8D25\uFF0C\u5148\u68C0\u67E5\u672C\u673A\u51FA\u7F51\u3002"
      };
    case "db_eperm":
      return {
        title: "\u3010\u6570\u636E\u5E93\u6587\u4EF6\u3011\u540C\u6B65\u88AB\u5360\u7528\uFF08*.db EPERM\uFF09",
        body: "\u5E93\u6587\u4EF6\u4E0D\u662F\u5199\u7801\u4EA7\u7269\u3002\u5C06\u5C1D\u8BD5\u81EA\u52A8\u56DE\u6536\u4E1A\u52A1\u6E90\u7801\uFF08\u5FFD\u7565 *.db\uFF09\uFF1B\u4E5F\u53EF\u8BF4\u300C\u4E0D\u8981\u78B0 db\uFF0C\u53EA\u540C\u6B65\u6E90\u7801\u518D\u8DD1\u300D\u3002"
      };
    case "url_images":
      return {
        title: "\u3010\u9644\u56FE\u3011\u672C\u5730 Agent \u4E0D\u652F\u6301 http \u56FE URL",
        body: "\u4F20\u56FE\u65B9\u5F0F\u95EE\u9898\uFF0C\u4E0D\u662F\u4E1A\u52A1\u9700\u6C42\u5199\u9519\u3002\u8BF7\u518D\u53D1\u4E00\u6B21\uFF08\u53EF\u5E26\u540C\u4E00\u5F20\u56FE\uFF09\uFF1B\u7CFB\u7EDF\u4F1A\u672C\u5730\u5316\u9644\u56FE\u3002\u6216\u8BF4\u300C\u4E0D\u8981\u9644\u56FE\u3001\u6309\u6587\u5B57\u63CF\u8FF0\u518D\u4FEE\u300D\u3002"
      };
    case "agent_missing":
      return {
        title: "\u3010\u4F1A\u8BDD\u3011\u4E0A\u4E00\u8F6E Agent \u5DF2\u5931\u6548",
        body: "\u5E38\u89C1\u4E8E\u91CD\u542F/\u6E05\u7406\u540E\u3002\u8BF7\u70B9\u300C\u7EED\u6539\u786E\u8BA4\u300D\u518D\u8DD1\uFF1B\u6216\u65B0\u5F00\u4E00\u53E5\u5177\u4F53\u4FEE\u6539\u70B9\u91CD\u65B0 begin\uFF0C\u4E0D\u8981\u6B7B\u76EF\u65E7\u4EFB\u52A1 id\u3002"
      };
    default:
      return {
        title: "\u3010\u5199\u7801\u5931\u8D25\u3011\u672C\u8F6E\u672A\u5B8C\u6210",
        body: (d ? "\u539F\u56E0\uFF1A" + d + "\u3002" : "\u672A\u8BB0\u5F55\u5177\u4F53\u539F\u56E0\u3002") + " \u53EF\u70B9\u300C\u7EED\u6539\u786E\u8BA4\u300D\u7EE7\u7EED\uFF0C\u6216\u8865\u5145\u4E00\u53E5\u5177\u4F53\u95EE\u9898\u540E\u518D\u8BD5\u3002"
      };
  }
}
function codingFailContinueCopy(kind, detail) {
  const d = shortDetail(detail, 140);
  switch (kind) {
    case "network":
      return {
        title: "\u4E0A\u4E00\u8F6E\u56E0\u3010\u7F51\u7EDC\u3011\u5931\u8D25\uFF0C\u70B9\u786E\u8BA4\u540E\u540C\u53E5\u91CD\u8BD5",
        body: "\u51FA\u7F51/\u5199\u7801\u4E91\u6296\u52A8\uFF0C\u901A\u5E38\u672A\u6539\u5230\u5DE5\u7A0B\uFF0C\u4E0D\u662F\u9700\u6C42\u5199\u9519\u3002" + (d ? " \u7EC6\u8282\uFF1A" + d + "\u3002" : "") + " \u70B9\u300C\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199\u300D\u6309\u540C\u4E00\u8BC9\u6C42\u7EE7\u7EED\uFF1B\u672A\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u6539\u4EE3\u7801\u3002"
      };
    case "db_eperm":
      return {
        title: "\u4E0A\u4E00\u8F6E\u56E0\u3010*.db \u5360\u7528\u3011\u5931\u8D25\uFF0C\u70B9\u786E\u8BA4\u540E\u7EE7\u7EED\uFF08\u52FF\u518D\u540C\u6B65\u5E93\uFF09",
        body: "\u540C\u6B65\u649E\u5230\u88AB\u5360\u7528\u7684\u6570\u636E\u5E93\u6587\u4EF6\u3002" + (d ? " \u7EC6\u8282\uFF1A" + d + "\u3002" : "") + " \u7EED\u6539\u5E94\u53EA\u52A8\u6E90\u7801/migrate\u3002\u70B9\u300C\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199\u300D\u7EE7\u7EED\uFF1B\u672A\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u6539\u4EE3\u7801\u3002"
      };
    case "url_images":
      return {
        title: "\u4E0A\u4E00\u8F6E\u56E0\u3010\u9644\u56FE URL\u3011\u5931\u8D25\uFF0C\u70B9\u786E\u8BA4\u540E\u5C06\u6309\u672C\u5730\u5316\u65B9\u5F0F\u518D\u8BD5",
        body: "\u672C\u5730 Agent \u4E0D\u80FD\u5403 http(s) \u9644\u56FE URL\u3002" + (d ? " \u7EC6\u8282\uFF1A" + d + "\u3002" : "") + " \u70B9\u300C\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199\u300D\u7EE7\u7EED\uFF1B\u672A\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u6539\u4EE3\u7801\u3002"
      };
    case "agent_missing":
      return {
        title: "\u4E0A\u4E00\u8F6E\u3010Agent \u5DF2\u5931\u6548\u3011\uFF0C\u70B9\u786E\u8BA4\u540E\u5F00\u65B0\u4F1A\u8BDD\u7EED\u6539",
        body: "\u65E7 Agent \u627E\u4E0D\u5230\u65F6\u63D2\u4EF6\u4F1A\u6362\u65B0 Agent + \u590D\u7528\u6C99\u7BB1\u3002" + (d ? " \u7EC6\u8282\uFF1A" + d + "\u3002" : "") + " \u70B9\u300C\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199\u300D\u7EE7\u7EED\uFF1B\u672A\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u6539\u4EE3\u7801\u3002"
      };
    default:
      return {
        title: "\u4E0A\u4E00\u8F6E\u5199\u7801\u672A\u5B8C\u6210\uFF0C\u9700\u8981\u7EE7\u7EED\u5904\u7406",
        body: (d ? "\u5931\u8D25\u539F\u56E0\uFF1A" + d + "\u3002" : "\u4E0A\u4E00\u8F6E\u4EFB\u52A1\u5DF2\u5931\u8D25\u6216\u4E2D\u65AD\u3002") + " \u70B9\u300C\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199\u300D\u5C06\u6309\u540C\u4E00\u8BC9\u6C42\u7EE7\u7EED\uFF1B\u4E0D\u662F\u91CD\u65B0\u5F00\u4E00\u4E2A\u65E0\u5173\u7684\u65B0\u4EFB\u52A1\u3002"
      };
  }
}

// lib/coding-closeout.js
function clipAssistant(text, max) {
  let t = String(text || "").trim();
  if (!t) return "";
  if (t.length > max) t = t.slice(0, max).trim() + "\u2026";
  return t;
}
function formatCodingCloseoutBanner2(job) {
  const raw = formatFriendlyCodingCloseout(job);
  if (!raw) return null;
  const st = String(job && job.status || "").trim();
  const body = raw.split("\n").filter(function(line) {
    return !/^【请把下面这段/.test(String(line || "").trim());
  }).join("\n").replace(/^\s+/, "").trim();
  if (!body) return null;
  if (st === "succeeded" && isHollowCodingSuccess(job)) {
    return {
      kind: "warn",
      title: "\u663E\u793A\u5B8C\u6210\uFF0C\u4F46\u672A\u68C0\u6D4B\u5230\u6E90\u7801\u843D\u76D8",
      body
    };
  }
  if (st === "succeeded") {
    return { kind: "ok", title: "\u672C\u8F6E\u7ED3\u8BBA", body };
  }
  if (st === "failed" || st === "cancelled" || st === "canceled") {
    return { kind: "warn", title: "\u672C\u8F6E\u7ED3\u8BBA\uFF08\u672A\u5B8C\u6210\uFF09", body };
  }
  return null;
}
function formatFriendlyCodingCloseout(job) {
  if (!job || typeof job !== "object") return "";
  const st = String(job.status || "").trim();
  const req = String(job.requirement || "").trim();
  const jid = String(job.id || "").trim();
  const detail = String(job.detail || job.error || "").trim();
  const asst = clipAssistant(job.assistant_text || "", 3500);
  const synced = job.synced_files || job.last_synced_files || job.review_in_scope || [];
  const n = Array.isArray(synced) ? synced.length : 0;
  const lines = [];
  if (st === "succeeded") {
    const syncedCode = codeFilesOnlyForSync(
      job.synced_files || job.last_synced_files || []
    );
    const nCode = syncedCode.length;
    if (isHollowCodingSuccess(job)) {
      lines.push("\u3010\u8BF7\u628A\u4E0B\u9762\u8FD9\u6BB5\u7528\u81EA\u7136\u53E3\u8BED\u8F6C\u544A\u7528\u6237\uFF1B\u5F15\u5BFC\u7EED\u6539\uFF0C\u4E0D\u8981\u8BF4\u5DF2\u7ECF\u4FEE\u597D\u3011");
      lines.push("");
      lines.push(
        "\u8FD9\u6B21\u300C" + (req || "\u5199\u7801") + "\u300D\u4EFB\u52A1\u663E\u793A\u5B8C\u6210\uFF0C\u4F46**\u672A\u68C0\u6D4B\u5230\u6E90\u7801\u843D\u76D8\u5230\u5DE5\u7A0B**\uFF08\u6709\u6548\u540C\u6B65\u6587\u4EF6\u4E3A 0\uFF09\u3002\u4E0D\u80FD\u5F53\u6210\u5DF2\u7ECF\u6539\u597D\u4E86\u3002"
      );
      if (detail) {
        lines.push("");
        lines.push("\u6280\u672F\u7EC6\u8282\uFF1A" + detail.slice(0, 280));
      }
      lines.push("");
      lines.push(
        "\u8BF7\u70B9\u300C\u7EED\u6539\u786E\u8BA4\u300D\u5361\u7528\u540C\u4E00\u8BC9\u6C42\u518D\u8DD1\uFF08\u5E26 parent_job_id\uFF09\uFF1B\u6216\u8BF4\u660E\u5177\u4F53\u8981\u6539\u54EA\u91CC\u3002\u4FEE\u597D\u7684\u6807\u51C6\u662F\u5DE5\u7A0B\u91CC\u80FD\u770B\u5230\u5BF9\u5E94\u6E90\u7801\u53D8\u66F4\u3002"
      );
      if (jid) lines.push("\uFF08\u4EFB\u52A1 " + jid + "\uFF09");
      return lines.join("\n");
    }
    lines.push("\u3010\u8BF7\u628A\u4E0B\u9762\u8FD9\u6BB5\u7528\u81EA\u7136\u53E3\u8BED\u8F6C\u544A\u7528\u6237\uFF0C\u4E0D\u8981\u518D\u8C03\u5199\u7801\u5DE5\u5177\u3001\u4E0D\u8981\u518D\u5F00\u786E\u8BA4\u5361\u3011");
    lines.push("");
    lines.push("\u8FD9\u6B21\u300C" + (req || "\u5199\u7801") + "\u300D\u5DF2\u7ECF\u505A\u5B8C\u4E86\u3002");
    if (asst) {
      lines.push("");
      lines.push(asst);
    } else if (detail && !/^已同步\s*\d+\s*个文件/.test(detail)) {
      lines.push("");
      lines.push(detail);
    }
    if (nCode > 0) {
      lines.push("");
      lines.push(
        "\u5DF2\u540C\u6B65\u5230\u672C\u673A " + nCode + " \u4E2A\u6587\u4EF6" + (detail && /Vite|5173|刷新/.test(detail) ? "\uFF0C\u5E76\u5C1D\u8BD5\u5237\u65B0\u4E86\u524D\u7AEF\u3002" : "\uFF1A")
      );
      for (const f of syncedCode.slice(0, 12)) {
        lines.push("- " + f);
      }
      if (nCode > 12) lines.push("- \u2026\u53E6\u6709 " + (nCode - 12) + " \u4E2A");
    } else if (n > 0) {
      lines.push("");
      lines.push("\u5DF2\u540C\u6B65\u5230\u672C\u673A " + n + " \u4E2A\u6587\u4EF6\u3002");
    }
    lines.push("");
    const selfCheck = formatPostCodingSelfCheck(
      job.synced_files || job.last_synced_files || []
    );
    if (selfCheck) {
      lines.push(selfCheck);
    } else {
      lines.push(
        "\u8BF7\u6309\u4E0B\u9762\u65B9\u5F0F\u9A8C\u6536\uFF1A\u6253\u5F00\u76F8\u5173\u9875\u9762\uFF0C\u70B9\u4E00\u904D\u521A\u6539\u7684\u529F\u80FD\u786E\u8BA4\u6548\u679C\u3002"
      );
    }
    lines.push(
      "\u5982\u679C\u8FD8\u8981\u6539\uFF0C\u76F4\u63A5\u8BF4\u5177\u4F53\u54EA\u91CC\u4E0D\u5BF9\uFF08\u4F8B\u5982\u6309\u94AE\u989C\u8272\u3001\u63A5\u53E3\u62A5\u9519\uFF09\uFF0C\u6211\u4F1A\u6309\u65B0\u7684\u4FEE\u6539\u70B9\u7EE7\u7EED\u3002"
    );
    if (jid) lines.push("\uFF08\u4EFB\u52A1 " + jid + "\uFF09");
    return lines.join("\n");
  }
  if (st === "failed" || st === "cancelled" || st === "canceled") {
    const blob = detail + "\n" + asst;
    const recovered = Array.isArray(job.recovered_files) ? job.recovered_files : [];
    const recoveredDeleted = Array.isArray(job.recovered_deleted) ? job.recovered_deleted : [];
    if (recovered.length) {
      lines.push(
        "\u540C\u6B65\u5E93\u6587\u4EF6\u65F6\u88AB\u672C\u673A\u540E\u7AEF\u5360\u7528\uFF08*.db EPERM\uFF09\uFF0C\u4F46\u8FD9\u4E0D\u662F\u6574\u5355\u4F5C\u5E9F\uFF1A\u6E90\u7801\u5DF2\u4ECE\u6C99\u7BB1\u5199\u56DE\u5DE5\u7A0B\uFF08\u8DF3\u8FC7\u5E93\u6587\u4EF6\uFF0C\u5171 " + recovered.length + " \u4E2A\uFF09\u3002"
      );
      lines.push("");
      lines.push("\u5DF2\u843D\u76D8\uFF1A");
      for (const f of recovered.slice(0, 20)) lines.push("- " + f);
      if (recovered.length > 20) {
        lines.push("- \u2026\u53E6\u6709 " + (recovered.length - 20) + " \u4E2A");
      }
      if (recoveredDeleted.length) {
        lines.push("");
        lines.push("\u5DF2\u6309\u6C99\u7BB1\u5220\u9664\u6E05\u5355\u4ECE\u5DE5\u7A0B\u79FB\u9664\uFF1A");
        for (const f of recoveredDeleted.slice(0, 20)) lines.push("- " + f);
      }
      lines.push("");
      lines.push("\u8BF7\u91CD\u542F\u540E\u7AEF\u9A8C\u6536\u3002\u5E93\u6587\u4EF6\u672C\u6765\u5C31\u4E0D\u8BE5\u5F53\u5199\u7801\u4EA7\u7269\u540C\u6B65\u3002");
      if (jid) lines.push("\uFF08\u4EFB\u52A1 " + jid + "\uFF09");
      return lines.join("\n");
    }
    const failKind = classifyCodingFailKind(blob);
    const dbEperm = failKind === "db_eperm";
    const urlImages = failKind === "url_images";
    const agentMissing = failKind === "agent_missing";
    const networkFail = failKind === "network";
    lines.push("\u3010\u8BF7\u628A\u4E0B\u9762\u8FD9\u6BB5\u7528\u81EA\u7136\u53E3\u8BED\u8F6C\u544A\u7528\u6237\uFF0C\u8BF4\u660E\u539F\u56E0\uFF1B\u4E0D\u8981\u7528\u540C\u4E00\u539F\u8BDD\u518D\u5F00\u786E\u8BA4\u5361\u3011");
    lines.push("");
    lines.push(
      (st === "failed" ? "\u8FD9\u6B21\u5199\u7801\u6CA1\u6709\u5B8C\u6210\u3002" : "\u8FD9\u6B21\u5199\u7801\u5DF2\u53D6\u6D88\u3002") + (req ? "\u8BC9\u6C42\u662F\u300C" + req + "\u300D\u3002" : "")
    );
    lines.push("");
    if (dbEperm) {
      lines.push(
        "\u539F\u56E0\uFF1A\u540C\u6B65\u65F6\u8BD5\u56FE\u56DE\u5199\u6B63\u5728\u88AB\u672C\u673A\u540E\u7AEF\u5360\u7528\u7684\u6570\u636E\u5E93\u6587\u4EF6\uFF08*.db\uFF09\uFF0CWindows \u4E0B\u539F\u5B50\u66FF\u6362\u4F1A\u62A5 EPERM\u2014\u2014\u8FD9\u5C5E\u4E8E\u9884\u671F\u98CE\u9669\uFF0C\u4E0D\u662F\u300C\u6539\u5E93\u7ED3\u6784\u65B9\u6848\u672C\u8EAB\u9519\u4E86\u300D\u3002"
      );
      lines.push("");
      lines.push(
        "\u6B63\u786E\u505A\u6CD5\uFF1A\u53EA\u540C\u6B65 migrate / \u4E1A\u52A1\u6E90\u7801\uFF0C\u4E0D\u8981\u540C\u6B65 *.db\uFF1B\u5148\u505C\u6389\u5360\u7528\u5E93\u7684\u540E\u7AEF\uFF0C\u786E\u8BA4\u6E90\u7801\u5DF2\u843D\u5730\u540E\uFF0C\u518D\u672C\u673A\u91CD\u542F\u540E\u7AEF\u8D70 lifespan/migrate \u91CD\u5EFA\u6216\u8FC1\u79FB\u8868\u7ED3\u6784\u3002"
      );
      if (detail) {
        lines.push("");
        lines.push("\u6280\u672F\u7EC6\u8282\uFF1A" + detail.slice(0, 280));
      }
    } else if (urlImages) {
      lines.push(
        "\u539F\u56E0\uFF1A\u672C\u673A\u5199\u7801\u7528\u7684\u662F Cursor \u672C\u5730 Agent\uFF0C\u4E0D\u80FD\u628A\u5F15\u64CE\u9644\u56FE\u5F53\u6210 http(s) URL \u4F20\u8FDB\u53BB\uFF08\u4E91\u7AEF Agent \u624D\u652F\u6301 URL \u56FE\uFF09\u3002\u8FD9\u662F\u4F20\u56FE\u65B9\u5F0F\u95EE\u9898\uFF0C\u4E0D\u662F\u4F60\u7684\u4E1A\u52A1\u9700\u6C42\u5199\u9519\u4E86\u3002"
      );
      lines.push("");
      lines.push(
        "\u8BF7\u518D\u53D1\u4E00\u6B21\uFF08\u53EF\u5E26\u540C\u4E00\u5F20\u622A\u56FE\uFF09\u3002\u7CFB\u7EDF\u4F1A\u628A\u9644\u56FE\u8F6C\u6210\u672C\u5730\u53EF\u7528\u5F62\u6001\u540E\u518D\u5F00\u5199\uFF1B\u82E5\u4ECD\u5931\u8D25\uFF0C\u8BF4\u300C\u4E0D\u8981\u9644\u56FE\u3001\u6309\u6587\u5B57\u63CF\u8FF0\u518D\u4FEE\u300D\u3002"
      );
    } else if (agentMissing) {
      lines.push(
        "\u539F\u56E0\uFF1A\u4E0A\u4E00\u8F6E\u5199\u7801\u4F1A\u8BDD\u7684 Agent \u5DF2\u8FC7\u671F\u6216\u4E0D\u5728\uFF08\u91CD\u542F/\u6E05\u7406\u540E\uFF09\uFF0C\u7EED\u8DD1\u627E\u4E0D\u5230\u65E7 Agent\u3002\u63D2\u4EF6\u4E00\u822C\u4F1A\u6539\u7528\u65B0 Agent + \u590D\u7528\u6C99\u7BB1\uFF1B\u82E5\u4ECD\u5931\u8D25\uFF0C\u591A\u534A\u662F\u8FDE\u5E26\u7684\u5176\u5B83\u9519\u8BEF\uFF08\u5982\u4F20\u56FE\u65B9\u5F0F\uFF09\u3002"
      );
      lines.push("");
      lines.push(
        "\u8BF7\u70B9\u300C\u7EED\u6539\u786E\u8BA4\u300D\u518D\u8DD1\u4E00\u8F6E\uFF1B\u6216\u65B0\u5F00\u4E00\u53E5\u5177\u4F53\u4FEE\u6539\u70B9\u8BA9\u6211\u91CD\u65B0 begin\uFF0C\u4E0D\u8981\u4F9D\u8D56\u5DF2\u5931\u6548\u7684\u65E7\u4EFB\u52A1 id\u3002"
      );
      if (detail) {
        lines.push("");
        lines.push("\u6280\u672F\u7EC6\u8282\uFF1A" + detail.slice(0, 280));
      }
    } else if (networkFail) {
      lines.push(
        "\u539F\u56E0\uFF1A\u5199\u7801\u4E91/\u672C\u673A\u51FA\u7F51\u51FA\u73B0\u7F51\u7EDC\u6296\u52A8\uFF08\u5E38\u89C1\u6587\u6848 Network request failed\uFF0C\u5E38\u5E26 retryable=true\uFF09\u3002\u8FD9\u4E0D\u662F\u4F60\u7684\u4E1A\u52A1\u9700\u6C42\u5199\u9519\u4E86\uFF1B\u672C\u8F6E\u901A\u5E38\u8FD8\u6CA1\u5EFA\u8D77 Agent\u3001\u5DE5\u7A0B\u91CC\u4E5F\u6CA1\u6709\u6539\u52A8\u3002"
      );
      lines.push("");
      lines.push(
        "\u8BF7\u70B9\u300C\u7EED\u6539\u786E\u8BA4\u300D\u5361\u7528\u540C\u4E00\u8BC9\u6C42\u518D\u8BD5\u4E00\u8F6E\u3002\u82E5\u8FDE\u7EED\u591A\u6B21\u4ECD\u662F\u7F51\u7EDC\u5931\u8D25\uFF0C\u5148\u68C0\u67E5\u672C\u673A\u80FD\u5426\u6B63\u5E38\u51FA\u7F51\uFF0C\u518D\u8BF4\u300C\u518D\u8DD1\u4E00\u904D\u300D\u3002"
      );
      if (detail) {
        lines.push("");
        lines.push("\u6280\u672F\u7EC6\u8282\uFF1A" + detail.slice(0, 280));
      }
    } else {
      lines.push("\u539F\u56E0\uFF1A" + (detail || asst || "\u672A\u8BB0\u5F55\u5177\u4F53\u539F\u56E0\uFF0C\u8BF7\u770B\u8FDB\u5EA6\u5361\u6216\u7A0D\u540E\u91CD\u8BD5\u3002"));
    }
    lines.push("");
    lines.push(
      dbEperm ? "\u6E90\u7801\u82E5\u5DF2\u5728\u5DE5\u7A0B\u91CC\uFF0C\u4F60\u76F4\u63A5\u91CD\u542F\u540E\u7AEF\u9A8C\u6536\u5373\u53EF\uFF1B\u82E5\u8FD8\u7F3A migrate \u6587\u4EF6\uFF0C\u8BF4\u300C\u4E0D\u8981\u78B0 db\uFF0C\u53EA\u8865\u6E90\u7801\u518D\u540C\u6B65\u300D\u6211\u7EE7\u7EED\u3002" : urlImages || agentMissing || networkFail ? "\u70B9\u7EED\u6539\u786E\u8BA4\u5361\u7EE7\u7EED\u5373\u53EF\uFF1B\u6211\u4F1A\u6309\u540C\u4E00\u8BC9\u6C42\u518D\u5904\u7406\u3002" : "\u4F60\u53EF\u4EE5\u8865\u5145\u4E00\u53E5\u5177\u4F53\u95EE\u9898\uFF0C\u6216\u8BF4\u660E\u300C\u6309\u521A\u624D\u65B9\u6848\u518D\u8DD1\u4E00\u904D\u300D\uFF0C\u6211\u518D\u7EE7\u7EED\u5E2E\u4F60\u5904\u7406\u3002"
    );
    if (jid) lines.push("\uFF08\u4EFB\u52A1 " + jid + "\uFF09");
    return lines.join("\n");
  }
  return "";
}
function userFacingCodingConclusion(job) {
  if (!job || typeof job !== "object") return "";
  let asst = String(job.assistant_text || "").trim();
  if (!asst && Array.isArray(job.transcript)) {
    for (let i = job.transcript.length - 1; i >= 0; i--) {
      const row = job.transcript[i];
      if (!row || typeof row !== "object") continue;
      if (row.kind !== "assistant" && row.type !== "assistant") continue;
      asst = String(row.text || row.message || "").trim();
      if (asst) break;
    }
  }
  const banner = formatCodingCloseoutBanner2(
    asst && asst !== job.assistant_text ? Object.assign({}, job, { assistant_text: asst }) : job
  );
  return banner && banner.body ? banner.body : "";
}

// lib/coding-inline-card.js
function codingInlineRequirement(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const line = lines[0] || "";
  return line.replace(/^【[^】]{0,40}】/, "").trim().slice(0, 80);
}
function codingInlineSameRequirement(a, b) {
  const x = codingInlineRequirement(a).replace(/\s+/g, "");
  const y = codingInlineRequirement(b).replace(/\s+/g, "");
  if (x.length < 2 || y.length < 2) return false;
  return x === y || x.startsWith(y) || y.startsWith(x);
}
var LIVE_CODING = /* @__PURE__ */ new Set(["running", "queued", "pending_review"]);
var TERMINAL_CODING = /* @__PURE__ */ new Set([
  "succeeded",
  "failed",
  "cancelled",
  "canceled",
  "blocked_no_runner"
]);
var STATUS_ZH = {
  queued: "\u5DF2\u5165\u961F",
  running: "\u6B63\u5728\u5199\u7801",
  pending_review: "\u5F85\u786E\u8BA4\u540C\u6B65",
  succeeded: "\u5DF2\u5B8C\u6210",
  failed: "\u5199\u7801\u672A\u6210\u529F",
  cancelled: "\u5DF2\u53D6\u6D88",
  canceled: "\u5DF2\u53D6\u6D88",
  blocked_no_runner: "\u5199\u7801\u73AF\u5883\u672A\u5C31\u7EEA"
};
function codingInlineStatusLine(status, detail) {
  const key = String(status || "").trim();
  const head = STATUS_ZH[key] || "\u6B63\u5728\u5199\u7801";
  let extra = String(detail || "").split(/\r?\n/).map((s) => s.trim()).find(Boolean) || "";
  if (!extra || extra === key || extra === head) return head;
  if (extra.length > 90) extra = extra.slice(0, 90) + "\u2026";
  return head + " \xB7 " + extra;
}
function pickCodingInlineJob(cardReq, jobs) {
  const rows = Array.isArray(jobs) ? jobs : [];
  const hits = rows.filter((j) => j && codingInlineSameRequirement(cardReq, j.requirement));
  hits.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return hits[0] || null;
}
function pickLiveCodingJob(pageText, jobs) {
  const text = String(pageText || "").replace(/\s+/g, "");
  if (text.length < 2) return null;
  const rows = Array.isArray(jobs) ? jobs : [];
  const hits = rows.filter((job) => {
    const st = String(job && job.status || "");
    if (TERMINAL_CODING.has(st)) return false;
    const req = codingInlineRequirement(job && job.requirement).replace(/\s+/g, "");
    return req.length >= 2 && text.includes(req);
  });
  hits.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  return hits[0] || null;
}
var FILE_LANG = {
  js: "JS",
  mjs: "JS",
  cjs: "JS",
  jsx: "JSX",
  ts: "TS",
  tsx: "TSX",
  py: "PY",
  vue: "VUE",
  css: "CSS",
  scss: "SCSS",
  less: "LESS",
  json: "JSON",
  md: "MD",
  html: "HTML",
  htm: "HTML",
  yml: "YML",
  yaml: "YML",
  sh: "SH",
  bash: "SH",
  ps1: "PS",
  sql: "SQL",
  go: "GO",
  rs: "RS",
  java: "JAVA"
};
function fileLangFromPath(filePath) {
  const name = String(filePath || "").split(/[/\\]/).filter(Boolean).pop() || "";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return FILE_LANG[name.slice(dot + 1).toLowerCase()] || name.slice(dot + 1).toUpperCase().slice(0, 6);
}
function parseCodingSnippet(snippet) {
  const src = String(snippet || "").replace(/\u2026/g, "\u2026");
  const rows = [];
  let added = 0;
  let removed = 0;
  if (!src.trim()) return { rows, added, removed };
  const lines = src.split(/\r?\n/);
  for (const raw of lines) {
    if (raw === "\u2026" || raw === "..." || raw.trim() === "\u2026") {
      rows.push({ type: "omit", text: "\u2026" });
      continue;
    }
    if (raw.startsWith("+")) {
      added += 1;
      rows.push({ type: "add", text: raw.slice(1) });
      continue;
    }
    if (raw.startsWith("-")) {
      removed += 1;
      rows.push({ type: "del", text: raw.slice(1) });
      continue;
    }
    rows.push({ type: "ctx", text: raw.startsWith(" ") ? raw.slice(1) : raw });
  }
  return { rows, added, removed };
}
function shellCommandTitle(cmd) {
  const s = String(cmd || "").replace(/\s+/g, " ").trim();
  if (!s) return "\u8FD0\u884C\u547D\u4EE4";
  if (s.length <= 88) return s;
  return s.slice(0, 87) + "\u2026";
}
function isPlanningSayText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t || t.length > 160) return false;
  if (/撰写最终方案|首行将使用|将使用.{0,12}说明方案|开始写说明方案|先写说明方案/.test(t)) return true;
  if (/^#{1,3}\s*说明方案\s*$/.test(t)) return true;
  return false;
}
function normalizeProcessMarkdown(text) {
  let t = String(text || "").replace(/\r\n/g, "\n");
  t = t.replace(/说明方案(?=仓库|本次|后端|前端|已)/g, "\u8BF4\u660E\u65B9\u6848\n\n");
  t = t.replace(/([^#\s\n])(#{1,3})(?=\s|[^\s#])/g, "$1\n\n$2");
  t = t.replace(/^(#{1,3})([^#\s])/gm, "$1 $2");
  t = t.replace(/^(#{1,3}\s+[^\n|]+?)\s*(\|)/gm, "$1\n$2");
  t = t.replace(/\|{2,}/g, "|");
  t = t.replace(/^[ \t]*\|?[\s:|-]{3,}\|?[\s:|-]*$/gm, "");
  t = t.replace(/[：:]\s*[、，,]+\s*/g, "\uFF1A");
  t = t.replace(/[、，,]{2,}/g, "\uFF0C");
  const kept = [];
  for (const line of t.split("\n")) {
    if (/^\s*#/.test(line)) {
      kept.push(line.trim());
      continue;
    }
    if (/^\s*\|/.test(line) || /\|.+\|/.test(line)) {
      const cells = line.split("|").map((c) => c.trim()).filter((c) => c && !/^[-:]+$/.test(c) && !/^[-:，、,]+$/.test(c));
      const useful = cells.filter((c) => /[\u4e00-\u9fffA-Za-z0-9./_-]{2,}/.test(c));
      if (!useful.length) continue;
      kept.push("| " + useful.join(" | ") + " |");
      continue;
    }
    kept.push(line);
  }
  t = kept.join("\n").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}
var PROCESS_TITLE = /^(?:#{1,3}\s+)?(说明方案|本轮结论|改动|验收|已有能力.*|做了什么|怎么验收)\s*$/;
function splitProcessProse(text) {
  const lines = normalizeProcessMarkdown(text).split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = String(raw || "");
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const trimmed = line.trim();
    const hm = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (hm || PROCESS_TITLE.test(trimmed)) {
      blocks.push({
        type: "heading",
        level: hm ? hm[1].length : 2,
        text: hm ? hm[2] : trimmed.replace(/^#{1,3}\s+/, "")
      });
      i += 1;
      continue;
    }
    if (/^\s*\|/.test(line) || /\|.+\|/.test(trimmed)) {
      const rows = [];
      while (i < lines.length) {
        const row = String(lines[i] || "");
        if (!row.trim()) break;
        if (!(/^\s*\|/.test(row) || /\|.+\|/.test(row.trim()))) break;
        const cells = row.split("|").map((c) => c.trim()).filter((c) => c && !/^[-:]+$/.test(c));
        if (cells.length) rows.push(cells);
        i += 1;
      }
      const wide = rows.filter((r) => r.length >= 2);
      if (wide.length >= 2) blocks.push({ type: "table", rows: wide });
      else if (rows.length) {
        const items = rows.reduce((acc, r) => acc.concat(r), []).filter((c) => !/^(文件|内容|改动)$/.test(c));
        if (items.length) blocks.push({ type: "list", items });
      }
      continue;
    }
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        items.push(String(lines[i]).replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
        i += 1;
      }
      if (items.length) blocks.push({ type: "list", items });
      continue;
    }
    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !/^(#{1,3})\s+/.test(lines[i].trim()) && !PROCESS_TITLE.test(lines[i].trim()) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*\d+\.\s+/.test(lines[i]) && !/^\s*\|/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "para", text: para.join("\n") });
  }
  return blocks;
}
function splitSayBlocks(text) {
  const src = String(text || "");
  const out = [];
  const re = /```([a-zA-Z0-9_+-]*)\r?\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while (m = re.exec(src)) {
    if (m.index > last) out.push({ type: "prose", text: src.slice(last, m.index) });
    out.push({ type: "code", lang: String(m[1] || "").toUpperCase(), text: String(m[2] || "").replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ type: "prose", text: src.slice(last) });
  if (!out.length && src) out.push({ type: "prose", text: src });
  return out;
}
function isToolEchoText(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (/[。！？]/.test(t)) return false;
  return /^(搜索|查找|读取|编辑|删除|运行)(\s+\S.*)?$/.test(t) && t.length <= 120;
}
function isProcessLineComplete(shown, full) {
  if (!full) return true;
  if (full.kind === "say" || full.kind === "thinking") {
    return String(shown && shown.text || "").length >= String(full.text || "").length;
  }
  return true;
}
function toolVariant(name) {
  if (name === "shell") return "run";
  if (name === "edit" || name === "write") return "code";
  return "chip";
}
function toolProcessLine(item) {
  const name = String(item.name || "tool");
  const filePath = String(item.path || "");
  const file = filePath.split(/[/\\]/).filter(Boolean).pop() || filePath;
  const pattern = String(item.pattern || item.glob || "");
  const cmd = String(item.command || item.cmd || "");
  if (name === "grep") return "\u641C\u7D22 " + (pattern || file || ".");
  if (name === "glob") return "\u67E5\u627E " + (pattern || file || ".");
  if (name === "read") return "\u8BFB\u53D6 " + (file || filePath || "\u6587\u4EF6");
  if (name === "edit" || name === "write") return "\u7F16\u8F91 " + (file || filePath || "\u6587\u4EF6");
  if (name === "delete") return "\u5220\u9664 " + (file || filePath || "\u6587\u4EF6");
  if (name === "shell") return "\u8FD0\u884C " + (cmd || "\u547D\u4EE4").replace(/\s+/g, " ").slice(0, 120);
  return name + (file ? " " + file : "");
}
function toolArg(item) {
  const name = String(item.name || "tool");
  const filePath = String(item.path || "");
  const file = filePath.split(/[/\\]/).filter(Boolean).pop() || filePath;
  const pattern = String(item.pattern || item.glob || "");
  if (name === "grep") return pattern || file || ".";
  if (name === "glob") return pattern || file || ".";
  if (name === "read" || name === "delete" || name === "edit" || name === "write") {
    return file || filePath || "\u6587\u4EF6";
  }
  if (name === "shell") return shellCommandTitle(item.command || item.cmd || "");
  return file || "";
}
function copyToolFields(line, extra) {
  const snippet = extra && extra.snippet != null ? extra.snippet : line.snippet;
  const parsed = extra && extra.added != null ? extra : parseCodingSnippet(snippet);
  return {
    variant: extra && extra.variant ? extra.variant : line.variant || "",
    name: extra && extra.name ? extra.name : line.name || "",
    path: extra && extra.path != null ? extra.path : line.path || "",
    file: extra && extra.file ? extra.file : line.file || "",
    lang: extra && extra.lang ? extra.lang : line.lang || "",
    command: extra && extra.command != null ? extra.command : line.command || "",
    snippet: String(snippet || ""),
    arg: extra && extra.arg != null ? extra.arg : line.arg || "",
    added: Number(parsed.added || 0),
    removed: Number(parsed.removed || 0)
  };
}
function copyProcessRow(line) {
  const src = line || {};
  return {
    kind: src.kind,
    text: String(src.text || ""),
    running: !!src.running,
    ...copyToolFields(src, src)
  };
}
function isTextKind(kind) {
  return kind === "thinking" || kind === "say";
}
function toolDedupeKey(line) {
  const name = String(line && line.name || "");
  const arg = String(line && line.arg || line && line.text || "");
  if (!name && !arg) return "";
  return name + "\0" + arg;
}
function codingProcessLines(transcript) {
  const rows = Array.isArray(transcript) ? transcript : [];
  const out = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const kind = String(item.kind || "");
    const text = String(item.text || "").trim();
    if (kind === "user") continue;
    if (kind === "status") {
      if (!text || text === "FINISHED") continue;
      if (/进度卡|请稍候|运行中/.test(text)) continue;
      out.push({ kind: "status", text });
      continue;
    }
    if (kind === "thinking") {
      if (!text || isToolEchoText(text) || isPlanningSayText(text)) continue;
      out.push({ kind: "thinking", text });
      continue;
    }
    if (kind === "assistant") {
      if (!text || isToolEchoText(text) || isPlanningSayText(text)) continue;
      out.push({ kind: "say", text });
      continue;
    }
    if (kind === "tool") {
      const name = String(item.name || "tool");
      const filePath = String(item.path || "");
      const file = filePath.split(/[/\\]/).filter(Boolean).pop() || "";
      const snippet = String(item.snippet || item.diff || "");
      const parsed = parseCodingSnippet(snippet);
      const cmd = String(item.command || item.cmd || "");
      const arg = toolArg(item);
      const pattern = String(item.pattern || item.glob || "").trim();
      if ((name === "grep" || name === "glob") && !pattern) continue;
      if (name !== "shell" && !String(arg || "").trim()) continue;
      out.push({
        kind: "tool",
        text: toolProcessLine(item),
        running: String(item.tool_status || "") === "running",
        variant: toolVariant(name),
        name,
        path: filePath,
        file,
        lang: fileLangFromPath(filePath || file),
        command: cmd,
        snippet,
        arg,
        added: parsed.added,
        removed: parsed.removed
      });
    }
  }
  return out;
}
function isProgressiveCodingText(prev, next) {
  const a = String(prev || "").trim();
  const b = String(next || "").trim();
  if (!a || !b) return false;
  if (a === b) return true;
  return b.startsWith(a) || a.startsWith(b);
}
function mergeCodingProcessLines(lines) {
  const rows = Array.isArray(lines) ? lines : [];
  const out = [];
  const toolAt = /* @__PURE__ */ new Map();
  for (const line of rows) {
    if (!line) continue;
    const text = String(line.text || "");
    const kind = line.kind;
    if (isTextKind(kind)) {
      if (isToolEchoText(text) || isPlanningSayText(text)) continue;
      let echoed = false;
      for (let t = out.length - 1; t >= 0; t--) {
        if (out[t].kind === "tool" && (out[t].text === text || out[t].arg && text.endsWith(out[t].arg))) {
          echoed = true;
          break;
        }
        if (isTextKind(out[t].kind)) break;
      }
      if (echoed) continue;
      let grown = false;
      for (let i = out.length - 1; i >= 0; i--) {
        const prev = out[i];
        if (!isTextKind(prev.kind)) continue;
        if (isProgressiveCodingText(prev.text, text)) {
          if (text.length > String(prev.text || "").length) prev.text = text;
          if (kind === "say") prev.kind = "say";
          grown = true;
        }
        break;
      }
      if (grown) continue;
      const last = out[out.length - 1];
      if (last && last.kind === kind) {
        last.text = last.text + (last.text && text ? "\n" : "") + text;
        continue;
      }
      out.push({
        kind,
        text,
        running: !!line.running,
        ...copyToolFields(line, line)
      });
      continue;
    }
    if (kind === "tool") {
      const key = toolDedupeKey(line) || toolDedupeKey({ name: line.name, arg: text });
      if (key && toolAt.has(key)) {
        const prev = out[toolAt.get(key)];
        prev.running = !!line.running;
        const nextSnippet = String(line.snippet || "");
        if (nextSnippet.length >= String(prev.snippet || "").length) {
          Object.assign(prev, copyToolFields(prev, line));
        }
        if (line.command) prev.command = line.command;
        continue;
      }
      if (out.length) {
        const last = out[out.length - 1];
        if (last.kind === "tool" && (last.text === text || last.name && last.name === line.name && last.arg && last.arg === line.arg)) {
          last.running = !!line.running;
          continue;
        }
      }
      if (key) toolAt.set(key, out.length);
      out.push({
        kind,
        text,
        running: !!line.running,
        ...copyToolFields(line, line)
      });
      continue;
    }
    out.push({
      kind,
      text,
      running: !!line.running,
      ...copyToolFields(line, line)
    });
  }
  return out;
}
function codingProcessTick(shown, target) {
  const src = Array.isArray(shown) ? shown.map(copyProcessRow) : [];
  const want = Array.isArray(target) ? target : [];
  let cursor = 0;
  while (cursor < src.length && cursor < want.length) {
    if (!want[cursor] || src[cursor].kind !== want[cursor].kind) {
      src.length = cursor;
      break;
    }
    if (!isProcessLineComplete(src[cursor], want[cursor])) break;
    cursor += 1;
  }
  if (cursor < src.length && cursor < want.length && !isProcessLineComplete(src[cursor], want[cursor])) {
    src.length = cursor + 1;
    const cur = src[cursor];
    const full = want[cursor];
    if (cur.kind === "tool" || cur.kind === "status") {
      src[cursor] = copyProcessRow(full);
    } else {
      cur.text = codingProcessTypeStep(cur.kind, cur.text, full.text);
      if (full.running != null) cur.running = !!full.running;
    }
    return src;
  }
  if (src.length < want.length && cursor === src.length) {
    const add = want[src.length];
    const copy = copyProcessRow(add);
    if (add.kind === "tool" || add.kind === "status") copy.text = String(add.text || "");
    else copy.text = codingProcessTypeStep(add.kind, "", add.text);
    src.push(copy);
  }
  return src;
}
function codingProcessTypeStep(kind, shown, full) {
  const have = String(shown || "");
  const want = String(full || "");
  if (!want) return "";
  if (kind === "tool" || kind === "status") return want;
  const prefix = want.startsWith(have) ? have : "";
  if (prefix.length >= want.length) return want;
  const rest = want.slice(prefix.length);
  const budget = kind === "thinking" ? 2 : want.length > 360 ? 8 : 4;
  let n = 0;
  let count = 0;
  while (n < rest.length && count < budget) {
    const code = rest.codePointAt(n) || 0;
    n += code > 65535 ? 2 : 1;
    count += 1;
  }
  return prefix + rest.slice(0, n);
}
function shouldStreamCodingProcess(status, shownCount, _lineCount) {
  const key = String(status || "");
  if (LIVE_CODING.has(key)) return true;
  return Number(shownCount) > 0;
}

// client-src/apply.js
function installApply(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect, useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession, authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual, resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace, textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage, lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement, WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var bag = ctx;
  var CodeReviewBeginCard = ctx.CodeReviewBeginCard;
  var CodeCommitBeginCard = ctx.CodeCommitBeginCard;
  var CodeDevBeginCard = ctx.CodeDevBeginCard;
  var CodeDeployConfirmCard = ctx.CodeDeployConfirmCard;
  var DevPipelineTimelineCard = ctx.DevPipelineTimelineCard;
  var WorkBuddySettingsSection = ctx.WorkBuddySettingsSection;
  var WorkBuddyHeaderLogout = ctx.WorkBuddyHeaderLogout;
  var WorkBuddyAppLoginGate = ctx.WorkBuddyAppLoginGate;
  var WorkBuddyUsageSection = ctx.WorkBuddyUsageSection;
  var WorkBuddySpaceSection = ctx.WorkBuddySpaceSection;
  var WorkBuddySpaceView = ctx.WorkBuddySpaceView;
  var WorkBuddyUsageView = ctx.WorkBuddyUsageView;
  var WorkBuddySessionSwitchGuard = ctx.WorkBuddySessionSwitchGuard;
  var WorkBuddySidebarViewsNav = ctx.WorkBuddySidebarViewsNav;
  var WorkBuddyLibraryPanelIcon = ctx.WorkBuddyLibraryPanelIcon;
  var WorkBuddyUsagePanelIcon = ctx.WorkBuddyUsagePanelIcon;
  var WorkBuddyLibraryMain = ctx.WorkBuddyLibraryMain;
  var WorkBuddyUsageMain = ctx.WorkBuddyUsageMain;
  var wbSupportsDockedPanels = ctx.wbSupportsDockedPanels;
  var hideWorkbuddyConversationViewTabs = ctx.hideWorkbuddyConversationViewTabs;
  var WorkBuddyMainViewOverlay = ctx.WorkBuddyMainViewOverlay;
  var installWorkBuddySessionSwitchWatcher = ctx.installWorkBuddySessionSwitchWatcher;
  var installProjectProfileWatcher = ctx.installProjectProfileWatcher;
  var registerIntegratedFlowComposerSlots = ctx.registerIntegratedFlowComposerSlots;
  var hideHostSettingsDupes = ctx.hideHostSettingsDupes;
  var borrowChatStore = ctx.borrowChatStore;
  var usageNavIcon = ctx.usageNavIcon;
  var ensureLoginGateMounted = ctx.ensureLoginGateMounted;
  var WB_IFLOW_SS_PREFIX = "wb.integratedFlow.";
  function wbIflowRead(key) {
    var v = "";
    try {
      if (typeof localStorage !== "undefined") {
        v = String(localStorage.getItem(key) || "");
        if (v === "1" || v === "0") return v;
      }
    } catch (e1) {
    }
    try {
      if (typeof sessionStorage !== "undefined") {
        v = String(sessionStorage.getItem(key) || "");
      }
    } catch (e2) {
    }
    return v;
  }
  function wbPersistIntegratedFlow(sessionId, on) {
    try {
      var sid = String(sessionId || "").trim();
      var v = on ? "1" : "0";
      var stores = [];
      try {
        if (typeof localStorage !== "undefined") stores.push(localStorage);
      } catch (eA) {
      }
      try {
        if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);
      } catch (eB) {
      }
      for (var i = 0; i < stores.length; i++) {
        if (sid) stores[i].setItem(WB_IFLOW_SS_PREFIX + sid, v);
        stores[i].setItem(WB_IFLOW_SS_PREFIX + "__last", v);
      }
    } catch (ePersist) {
    }
  }
  function wbRestoreIntegratedFlowClass() {
    if (typeof document === "undefined" || !document.documentElement) return false;
    try {
      var sid = "";
      try {
        sid = String(globalThis.__wbDshSessionId || "").trim();
      } catch (eSid) {
      }
      var cached = "";
      if (sid) cached = wbIflowRead(WB_IFLOW_SS_PREFIX + sid);
      if (cached !== "1" && cached !== "0") {
        cached = wbIflowRead(WB_IFLOW_SS_PREFIX + "__last");
      }
      if (cached === "1") {
        document.documentElement.classList.add("wb-integrated-flow-on");
        try {
          globalThis.__wbIntegratedFlowOn = true;
        } catch (eFlag) {
        }
        return true;
      }
    } catch (eRestore) {
    }
    return false;
  }
  function installIntegratedCodingConfirmMute() {
    if (typeof document === "undefined") return function() {
    };
    var CONFIRM_ONLY = "data-wb-cchat-confirm-only";
    var CONFIRM_SHELL = "data-wb-cchat-confirm-shell";
    wbRestoreIntegratedFlowClass();
    function flowOn() {
      try {
        if (globalThis.__wbIntegratedFlowOn) return true;
      } catch (e0) {
      }
      try {
        return !!(document.documentElement && document.documentElement.classList.contains("wb-integrated-flow-on"));
      } catch (e1) {
        return false;
      }
    }
    function touchesComposer(el) {
      if (!el || !el.querySelector) return true;
      try {
        if (el.matches && el.matches("[data-composer-seat],[data-composer-card]")) return true;
        if (el.closest && el.closest("[data-composer-seat],[data-composer-card]")) return true;
        if (el.querySelector("[data-composer-seat],[data-composer-card]")) return true;
      } catch (e2) {
        return true;
      }
      return false;
    }
    function isConfirmFormCard(card) {
      if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
      if (touchesComposer(card)) return false;
      var text = "";
      try {
        text = String(card.innerText || "");
      } catch (e3) {
        return false;
      }
      if (text.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199") < 0 && text.indexOf("\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u5199\u7801") < 0) {
        return false;
      }
      if (text.indexOf("Cursor \u4ECD\u5728\u5904\u7406") >= 0 || text.indexOf("\u53D6\u6D88\u4EFB\u52A1") >= 0) return false;
      return true;
    }
    function confirmShell(card) {
      var node = card;
      var best = card;
      var depth;
      for (depth = 0; depth < 3; depth++) {
        var parent = node.parentElement;
        if (!parent || parent === document.body || parent === document.documentElement) break;
        if (touchesComposer(parent)) break;
        try {
          if (parent.querySelector(".wb-dp")) break;
          if (parent.querySelectorAll(".cc-card").length !== 1) break;
        } catch (e4) {
          break;
        }
        var kids = parent.children || [];
        var foreign = 0;
        var k;
        for (k = 0; k < kids.length; k++) {
          var kid = kids[k];
          if (kid === node || kid.contains && kid.contains(node)) continue;
          var tx = "";
          try {
            tx = String(kid.innerText || "").trim();
          } catch (e5) {
            tx = "x";
          }
          if (tx.length > 12) foreign++;
        }
        if (foreign > 0) break;
        best = parent;
        node = parent;
      }
      return best;
    }
    function clearMarks(root) {
      var marked;
      try {
        marked = (root || document).querySelectorAll(
          "[" + CONFIRM_ONLY + "],[" + CONFIRM_SHELL + "],[data-wb-mute-cchat-confirm],[data-wb-mute-pipeline-skip]"
        );
      } catch (e6) {
        return;
      }
      var i;
      for (i = 0; i < marked.length; i++) {
        var el = marked[i];
        el.removeAttribute(CONFIRM_ONLY);
        el.removeAttribute(CONFIRM_SHELL);
        el.removeAttribute("data-wb-mute-cchat-confirm");
        el.removeAttribute("data-wb-mute-pipeline-skip");
        try {
          if (el.style && el.style.display === "none" && !(el.matches && el.matches("[data-composer-seat],[data-composer-card]"))) {
            el.style.display = "";
          }
        } catch (e7) {
        }
      }
    }
    function syncMute() {
      wbRestoreIntegratedFlowClass();
      clearMarks(document);
      if (!flowOn()) return;
      var cards;
      try {
        cards = document.querySelectorAll(".cc-card");
      } catch (e8) {
        return;
      }
      var i;
      for (i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (!isConfirmFormCard(card)) continue;
        card.setAttribute(CONFIRM_ONLY, "1");
        var shell = confirmShell(card);
        if (shell && shell !== card && !touchesComposer(shell)) {
          shell.setAttribute(CONFIRM_SHELL, "1");
        }
      }
    }
    syncMute();
    var tick = setInterval(syncMute, 400);
    function onFlowFlag() {
      syncMute();
    }
    try {
      window.addEventListener("wb-integrated-flow-changed", onFlowFlag);
    } catch (e9) {
    }
    return function() {
      try {
        clearInterval(tick);
      } catch (e10) {
      }
      try {
        window.removeEventListener("wb-integrated-flow-changed", onFlowFlag);
      } catch (e11) {
      }
      clearMarks(document);
    };
  }
  function installRevealFoldedToolviews() {
    if (typeof document === "undefined") return function() {
    };
    try {
      var leftover = document.querySelectorAll("[data-wb-cchat-unclip]");
      var ui;
      for (ui = 0; ui < leftover.length; ui++) leftover[ui].removeAttribute("data-wb-cchat-unclip");
      leftover = document.querySelectorAll(".wb-cchat-stick");
      for (ui = 0; ui < leftover.length; ui++) {
        leftover[ui].classList.remove("wb-cchat-stick");
        leftover[ui].style.top = "";
        leftover[ui].style.left = "";
        leftover[ui].style.width = "";
        leftover[ui].style.maxHeight = "";
      }
    } catch (eUnclip) {
    }
    function touchesComposer(el) {
      if (!el || !el.closest) return false;
      try {
        return !!el.closest("[data-composer-seat],[data-composer-card]");
      } catch (e0) {
        return false;
      }
    }
    function unhide(node) {
      if (!node || touchesComposer(node)) return;
      try {
        if (node.getAttribute && node.getAttribute("hidden") != null) {
          node.removeAttribute("hidden");
        }
      } catch (e2) {
      }
      try {
        if (node.tagName === "DETAILS") node.open = true;
      } catch (e3) {
      }
    }
    function scan() {
      var nodes;
      var i;
      try {
        nodes = document.querySelectorAll('[hidden="until-found"]');
      } catch (e1) {
        nodes = [];
      }
      for (i = 0; i < nodes.length; i++) unhide(nodes[i]);
      var cards;
      try {
        cards = document.querySelectorAll(".cc-card");
      } catch (e4) {
        return;
      }
      for (i = 0; i < cards.length; i++) {
        var n = cards[i];
        var depth;
        for (depth = 0; depth < 16 && n; depth++) {
          unhide(n);
          n = n.parentElement;
        }
        revealCodingCard(cards[i]);
      }
      placeLiveCodingCard();
    }
    function chatScroller(card) {
      var best = null;
      var p = card.parentElement;
      var depth = 0;
      while (p && depth < 24) {
        if (touchesComposer(p)) break;
        var st = null;
        try {
          st = window.getComputedStyle(p);
        } catch (eSc) {
          st = null;
        }
        if (st && (st.overflowY === "auto" || st.overflowY === "scroll")) {
          if (p.scrollHeight > p.clientHeight + 40) {
            if (!best || p.clientHeight >= best.clientHeight) best = p;
          }
        }
        p = p.parentElement;
        depth++;
      }
      return best;
    }
    function expandCalledTools(card) {
      var p = card.parentElement;
      var depth = 0;
      while (p && depth < 16) {
        if (touchesComposer(p)) return;
        var buttons = [];
        try {
          buttons = p.querySelectorAll("button[aria-expanded='false']");
        } catch (eBtn) {
          buttons = [];
        }
        var i;
        for (i = 0; i < buttons.length; i++) {
          var b = buttons[i];
          if (b.parentElement !== p) continue;
          if (touchesComposer(b)) continue;
          var label = "";
          try {
            label = String(b.textContent || "");
          } catch (eLab) {
            label = "";
          }
          if (!/Called tools|已调用工具|调用工具|asked questions/.test(label)) continue;
          try {
            b.click();
          } catch (eClick) {
          }
        }
        p = p.parentElement;
        depth++;
      }
    }
    function unclipAncestors() {
    }
    function revealCodingCard(card) {
      if (!card || touchesComposer(card)) return;
      var scroller = chatScroller(card);
      unclipAncestors(card, scroller);
      expandCalledTools(card);
    }
    function atBottom(scroller) {
      if (!scroller) return true;
      return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
    }
    function seatTop() {
      var vh = window.innerHeight || 800;
      try {
        var seat = document.querySelector("[data-composer-seat]");
        if (seat && !seat.closest(".cc-card")) return seat.getBoundingClientRect().top;
      } catch (eSeat) {
      }
      return vh;
    }
    function inWindow(card) {
      if (card.classList && card.classList.contains("wb-cchat-stick")) return true;
      var cr;
      try {
        cr = card.getBoundingClientRect();
      } catch (eCr) {
        return false;
      }
      if (cr.width < 8 || cr.height < 8) return false;
      var top = Math.max(cr.top, 0);
      var bot = Math.min(cr.bottom, seatTop());
      return bot - top > 80;
    }
    function turnLive() {
      var t = "";
      try {
        t = document.body && document.body.innerText ? document.body.innerText : "";
      } catch (eLive) {
        t = "";
      }
      return t.indexOf("\u6DF1\u5EA6\u6C42\u7D22\u4E2D") >= 0;
    }
    function unstick(card) {
      if (!card || !card.classList || !card.classList.contains("wb-cchat-stick")) return;
      card.classList.remove("wb-cchat-stick");
      card.style.top = "";
      card.style.left = "";
      card.style.width = "";
      card.style.maxHeight = "";
    }
    function stick() {
    }
    function placeLiveCodingCard() {
      var cards;
      try {
        cards = document.querySelectorAll(".cc-card");
      } catch (eCards) {
        return;
      }
      var live = null;
      var i;
      for (i = 0; i < cards.length; i++) {
        if (touchesComposer(cards[i])) continue;
        live = cards[i];
      }
      for (i = 0; i < cards.length; i++) {
        if (cards[i] !== live) unstick(cards[i]);
      }
      if (!live || touchesComposer(live)) return;
      var scroller = chatScroller(live);
      var want = turnLive() && atBottom(scroller);
      var stuck = live.classList.contains("wb-cchat-stick");
      if (want && (stuck || !inWindow(live))) stick(live, scroller);
      else unstick(live);
    }
    scan();
    var obs = null;
    try {
      obs = new MutationObserver(scan);
      obs.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden"]
      });
    } catch (e3) {
    }
    var tick = setInterval(scan, 500);
    return function() {
      try {
        clearInterval(tick);
      } catch (e4) {
      }
      try {
        if (obs) obs.disconnect();
      } catch (e5) {
      }
    };
  }
  function installMuteClearCodingAsk() {
    if (typeof document === "undefined") return function() {
    };
    var ATTR = "data-wb-clear-coding-ask-hide";
    function touchesComposer(el) {
      if (!el || !el.closest) return true;
      try {
        if (el.matches && el.matches("[data-composer-seat],[data-composer-card]")) return true;
        if (el.closest("[data-composer-seat],[data-composer-card]")) return true;
        if (el.querySelector && el.querySelector("[data-composer-seat],[data-composer-card]")) return true;
      } catch (e0) {
        return true;
      }
      return false;
    }
    function lastUserClearCoding() {
      var nodes;
      try {
        nodes = document.querySelectorAll(
          "[data-role='user'], [data-message-role='user'], [data-kind='user']"
        );
      } catch (e1) {
        nodes = [];
      }
      var text = "";
      if (nodes && nodes.length) {
        try {
          text = String(nodes[nodes.length - 1].textContent || "");
        } catch (e2) {
          text = "";
        }
      }
      if (!text) {
        try {
          text = String(document.body && document.body.innerText ? document.body.innerText : "");
        } catch (e3) {
          text = "";
        }
        text = text.slice(0, 800);
      }
      return /(创建|新建|增加|新增|添加|加个).{0,24}(界面|页面|菜单|模块|报表|入口|视图|路由)/.test(text) || /(删除|删掉|去掉|移除|下线|隐藏).{0,20}(界面|页面|菜单|报表|模块|入口|视图|路由)/.test(text);
    }
    function isAskNoise(el) {
      var t = "";
      try {
        t = String(el.textContent || "");
      } catch (e5) {
        return false;
      }
      if (t.length < 8 || t.length > 900) return false;
      if (t.indexOf("\u63D0\u95EE") < 0) return false;
      return t.indexOf("ask_user_question") >= 0 || /"questions"\s*:/.test(t) || t.indexOf("\u5165\u53E3\u4F4D\u7F6E") >= 0 || t.indexOf("\u65B0\u589E\u8303\u56F4") >= 0;
    }
    function askShell(el) {
      var node = el;
      var best = el;
      var depth;
      for (depth = 0; depth < 5 && node; depth++) {
        if (touchesComposer(node)) break;
        var t = "";
        try {
          t = String(node.textContent || "");
        } catch (e6) {
          break;
        }
        if (t.length > 900) break;
        best = node;
        node = node.parentElement;
      }
      return best;
    }
    function scan() {
      if (!lastUserClearCoding()) return;
      var nodes;
      try {
        nodes = document.querySelectorAll("li, div, p, section, [data-tool-name], [data-tool-call]");
      } catch (e7) {
        return;
      }
      var i;
      for (i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (!isAskNoise(el)) continue;
        if (touchesComposer(el)) continue;
        var shell = askShell(el);
        if (!shell || touchesComposer(shell)) continue;
        try {
          shell.setAttribute(ATTR, "1");
        } catch (e8) {
        }
      }
    }
    var obs = null;
    try {
      obs = new MutationObserver(function() {
        scan();
      });
      obs.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
      });
    } catch (e9) {
    }
    var tick = setInterval(scan, 400);
    scan();
    return function() {
      try {
        clearInterval(tick);
      } catch (e10) {
      }
      try {
        if (obs) obs.disconnect();
      } catch (e11) {
      }
    };
  }
  function installCodingProcessFeed() {
    if (typeof document === "undefined") return function() {
    };
    var FEED = "wb-cchat-feed";
    var streamJob = "";
    var shown = [];
    var pendingLines = null;
    var raf = 0;
    function flowOn() {
      try {
        if (globalThis.__wbIntegratedFlowOn) return true;
      } catch (e0) {
      }
      try {
        return !!(document.documentElement && document.documentElement.classList.contains("wb-integrated-flow-on"));
      } catch (e1) {
        return false;
      }
    }
    function chatBase() {
      try {
        var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
        if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
      } catch (e2) {
      }
      return "http://127.0.0.1:18791";
    }
    function sessionId() {
      try {
        return String(globalThis.__wbDshSessionId || "").trim();
      } catch (e3) {
        return "";
      }
    }
    function lastCard() {
      var cards;
      try {
        cards = document.querySelectorAll(".cc-card");
      } catch (e4) {
        return null;
      }
      return cards && cards.length ? cards[cards.length - 1] : null;
    }
    function cardText(card) {
      try {
        return String(card.textContent || "");
      } catch (e5) {
        return "";
      }
    }
    function workspaceFrom(card) {
      var hints;
      try {
        hints = card.querySelectorAll(".cc-set-hint");
      } catch (e6) {
        hints = [];
      }
      var i;
      for (i = 0; i < hints.length; i++) {
        var t = String(hints[i].textContent || "").trim();
        if (/^[A-Za-z]:[\\/]/.test(t) || t.indexOf("/") === 0) return t;
      }
      return "";
    }
    function callIdFrom(card) {
      try {
        var el = card.closest("[data-chat-call-id]");
        return el ? String(el.getAttribute("data-chat-call-id") || "").trim() : "";
      } catch (e7) {
        return "";
      }
    }
    function reqFrom(card) {
      var q = null;
      try {
        q = card.querySelector(".cc-quote");
      } catch (e8) {
      }
      return q ? String(q.textContent || "").trim() : "";
    }
    function jobIdFrom(card) {
      var m = cardText(card).match(/cch-\d{8}-\d{6}-[a-z0-9]+/);
      return m ? m[0] : "";
    }
    function composerSeat() {
      try {
        return document.querySelector("[data-composer-seat]");
      } catch (e9) {
        return null;
      }
    }
    function messageColumn() {
      var seat = composerSeat();
      var card = lastCard();
      var col = null;
      try {
        col = card && card.closest ? card.closest("[class*='_column']") : null;
      } catch (e10) {
        col = null;
      }
      if (col && seat && (col === seat || col.contains(seat) || seat.contains(col))) col = null;
      if (col) return col;
      var nodes;
      try {
        nodes = document.querySelectorAll("[class*='_column']");
      } catch (e11) {
        return null;
      }
      var i;
      for (i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (seat && (el === seat || el.contains(seat) || seat.contains(el))) continue;
        var t = "";
        try {
          t = String(el.innerText || "");
        } catch (e12) {
          t = "";
        }
        if (t.indexOf("Think") < 0 && t.indexOf("\u6DF1\u5EA6\u6C42\u7D22") < 0 && t.indexOf("Deep diving") < 0) continue;
        return el;
      }
      return null;
    }
    function divingFlowItem(root) {
      return divingStatus(root);
    }
    function divingStatus(root) {
      var scope = root;
      if (!scope || !scope.querySelectorAll) {
        try {
          scope = document;
        } catch (e13) {
          return null;
        }
      }
      var nodes = null;
      try {
        nodes = scope.querySelectorAll("[class*='turnStatus'], [role='status']");
      } catch (e14) {
        nodes = null;
      }
      var hit = null;
      var i;
      if (nodes) {
        for (i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          try {
            if (el.closest && (el.closest("." + FEED) || el.closest("[data-composer-seat]"))) continue;
          } catch (e15) {
            continue;
          }
          var text = "";
          try {
            text = String(el.innerText || "");
          } catch (e16) {
            text = "";
          }
          if (text.indexOf("\u6DF1\u5EA6\u6C42\u7D22") < 0 && text.indexOf("Deep diving") < 0) continue;
          hit = el;
        }
      }
      if (!hit) {
        try {
          nodes = scope.querySelectorAll("button, div, span, p");
        } catch (e17) {
          return null;
        }
        for (i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          try {
            if (node.closest && (node.closest("." + FEED) || node.closest("[data-composer-seat]"))) continue;
          } catch (e18) {
            continue;
          }
          var raw = "";
          try {
            raw = String(node.innerText || "");
          } catch (e19) {
            raw = "";
          }
          if (raw.length > 80) continue;
          if (raw.indexOf("\u6DF1\u5EA6\u6C42\u7D22") < 0 && raw.indexOf("Deep diving") < 0) continue;
          hit = node;
        }
      }
      if (!hit) return null;
      try {
        if (hit.parentElement && String(hit.parentElement.className || "").indexOf("turnStatus") >= 0) {
          return hit.parentElement;
        }
      } catch (e20) {
      }
      return hit;
    }
    function ensureFeed() {
      var host = messageColumn();
      if (!host) return null;
      var feed = null;
      try {
        feed = document.querySelector("." + FEED);
      } catch (e21) {
        feed = null;
      }
      if (!feed) {
        feed = document.createElement("div");
        feed.className = FEED;
        feed.setAttribute("data-wb-cchat-feed", "1");
      }
      var anchor = divingStatus(host) || divingStatus(document);
      if (anchor && anchor.parentElement) {
        if (feed.nextElementSibling !== anchor || feed.parentElement !== anchor.parentElement) {
          anchor.parentElement.insertBefore(feed, anchor);
        }
        return feed;
      }
      if (host && !host.contains(feed)) host.appendChild(feed);
      return feed;
    }
    function stopStream() {
      if (raf) {
        try {
          cancelAnimationFrame(raf);
        } catch (e22) {
        }
        raf = 0;
      }
      pendingLines = null;
      shown = [];
      streamJob = "";
    }
    function clearFeed() {
      stopStream();
      var nodes;
      try {
        nodes = document.querySelectorAll("." + FEED);
      } catch (e11) {
        return;
      }
      var i;
      for (i = 0; i < nodes.length; i++) {
        try {
          nodes[i].remove();
        } catch (e12) {
        }
      }
    }
    function lineClassName(line) {
      var cls = "wb-cchat-line";
      if (line.kind === "thinking") cls += " is-think";
      else if (line.kind === "say") cls += " is-say";
      else if (line.kind === "tool") {
        cls += " is-tool";
        if (line.variant === "run") cls += " is-run-card";
        else if (line.variant === "code") cls += " is-code-card";
        else cls += " is-chip";
      } else cls += " is-status";
      if (line.running) cls += " is-run";
      return cls;
    }
    function copyProcessLine(line) {
      return {
        kind: line.kind,
        text: String(line.text || ""),
        running: !!line.running,
        variant: line.variant || "",
        name: line.name || "",
        path: line.path || "",
        file: line.file || "",
        lang: line.lang || "",
        command: line.command || "",
        snippet: line.snippet || "",
        arg: line.arg || "",
        added: Number(line.added || 0),
        removed: Number(line.removed || 0)
      };
    }
    function makeEl(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null && text !== "") n.textContent = text;
      return n;
    }
    function paintInlineCode(host, text) {
      var parts = String(text || "").split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
      var i;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!p) continue;
        if (p.indexOf("**") === 0 && p.slice(-2) === "**" && p.length >= 4) {
          host.appendChild(makeEl("strong", "", p.slice(2, -2)));
        } else if (p.charAt(0) === "`" && p.length >= 2 && p.charAt(p.length - 1) === "`") {
          host.appendChild(makeEl("code", "wb-cchat-inline", p.slice(1, -1)));
        } else {
          host.appendChild(document.createTextNode(p));
        }
      }
    }
    function paintProseBlocks(host, text) {
      var blocks = splitProcessProse(text);
      var i;
      var r;
      var c;
      for (i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.type === "heading") {
          var h2 = makeEl("div", "wb-cchat-h");
          paintInlineCode(h2, b.text || "");
          host.appendChild(h2);
        } else if (b.type === "list") {
          var ul = makeEl("ul", "wb-cchat-ul");
          var items = b.items || [];
          for (r = 0; r < items.length; r++) {
            var li = makeEl("li", "");
            paintInlineCode(li, items[r]);
            ul.appendChild(li);
          }
          host.appendChild(ul);
        } else if (b.type === "table") {
          var wrap = makeEl("div", "wb-cchat-table-wrap");
          var table = makeEl("table", "wb-cchat-table");
          var rows = b.rows || [];
          for (r = 0; r < rows.length; r++) {
            var tr = makeEl("tr", "");
            var cells = rows[r] || [];
            for (c = 0; c < cells.length; c++) {
              var cell = makeEl(r === 0 ? "th" : "td", "");
              paintInlineCode(cell, cells[c]);
              tr.appendChild(cell);
            }
            table.appendChild(tr);
          }
          wrap.appendChild(table);
          host.appendChild(wrap);
        } else if (String(b.text || "").trim()) {
          var p = makeEl("div", "wb-cchat-prose");
          paintInlineCode(p, b.text);
          host.appendChild(p);
        }
      }
    }
    function paintSayRich(el, text) {
      el.textContent = "";
      var blocks = splitSayBlocks(text);
      var i;
      for (i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.type === "code") {
          var card = makeEl("div", "wb-cchat-code");
          var head = makeEl("div", "wb-cchat-code-head");
          if (b.lang) head.appendChild(makeEl("span", "wb-cchat-code-lang", b.lang));
          head.appendChild(makeEl("span", "wb-cchat-code-file", "\u4EE3\u7801"));
          card.appendChild(head);
          card.appendChild(makeEl("pre", "wb-cchat-code-plain", b.text));
          el.appendChild(card);
        } else if (String(b.text || "").trim()) {
          paintProseBlocks(el, b.text);
        }
      }
      if (!el.childNodes.length) paintInlineCode(el, text);
    }
    function paintRunCard(el, line) {
      var box = makeEl("details", "wb-cchat-run");
      box.open = true;
      var sum = makeEl("summary", "wb-cchat-run-head");
      sum.appendChild(makeEl("span", "wb-cchat-run-chevron", ""));
      sum.appendChild(makeEl("span", "wb-cchat-run-title", shellCommandTitle(line.command || line.text || "\u8FD0\u884C\u547D\u4EE4")));
      box.appendChild(sum);
      var body = makeEl("pre", "wb-cchat-run-body", line.command || line.text || "");
      box.appendChild(body);
      el.appendChild(box);
    }
    function paintCodeCard(el, line) {
      var parsed = parseCodingSnippet(line.snippet);
      var card = makeEl("div", "wb-cchat-code");
      var head = makeEl("div", "wb-cchat-code-head");
      var lang = line.lang || fileLangFromPath(line.file || line.path);
      if (lang) head.appendChild(makeEl("span", "wb-cchat-code-lang", lang));
      head.appendChild(makeEl("span", "wb-cchat-code-file", line.file || line.path || "\u6587\u4EF6"));
      if (parsed.added || parsed.removed) {
        var stat = makeEl("span", "wb-cchat-code-stat");
        if (parsed.added) stat.appendChild(makeEl("span", "is-add", "+" + parsed.added));
        if (parsed.removed) stat.appendChild(makeEl("span", "is-del", "-" + parsed.removed));
        head.appendChild(stat);
      }
      card.appendChild(head);
      var body = makeEl("div", "wb-cchat-code-body");
      var rows = parsed.rows.slice(0, 48);
      var i;
      if (!rows.length) {
        body.appendChild(makeEl("div", "wb-cchat-code-empty", "\u6B63\u5728\u5199\u5165\u2026"));
      }
      for (i = 0; i < rows.length; i++) {
        var row = rows[i];
        var tr = makeEl("div", "wb-cchat-code-row is-" + row.type);
        tr.appendChild(makeEl("span", "wb-cchat-code-ln", row.type === "omit" ? "" : String(i + 1)));
        tr.appendChild(
          makeEl(
            "span",
            "wb-cchat-code-mk",
            row.type === "add" ? "+" : row.type === "del" ? "-" : row.type === "omit" ? "\u2026" : ""
          )
        );
        tr.appendChild(makeEl("span", "wb-cchat-code-tx", row.text));
        body.appendChild(tr);
      }
      if (parsed.rows.length > rows.length) {
        body.appendChild(makeEl("div", "wb-cchat-code-more", "\u2026 \u8FD8\u6709 " + (parsed.rows.length - rows.length) + " \u884C"));
      }
      card.appendChild(body);
      el.appendChild(card);
    }
    function paintToolChip(el, line) {
      var chip = makeEl("div", "wb-cchat-chip");
      var label = "\u5DE5\u5177";
      if (line.name === "grep") label = "\u641C\u7D22";
      else if (line.name === "glob") label = "\u67E5\u627E";
      else if (line.name === "read") label = "\u8BFB\u53D6";
      else if (line.name === "delete") label = "\u5220\u9664";
      else if (line.name === "edit" || line.name === "write") label = "\u7F16\u8F91";
      else if (line.text) label = String(line.text).split(" ")[0] || "\u5DE5\u5177";
      chip.appendChild(makeEl("span", "wb-cchat-chip-label", label));
      chip.appendChild(makeEl("span", "wb-cchat-chip-arg", line.arg || line.text || ""));
      el.appendChild(chip);
    }
    function paintProcessLine(el, line, streaming) {
      el.className = lineClassName(line) + (streaming ? " is-stream" : "");
      el.textContent = "";
      if (line.kind === "tool" && line.variant === "run") {
        paintRunCard(el, line);
        return;
      }
      if (line.kind === "tool" && line.variant === "code") {
        paintCodeCard(el, line);
        return;
      }
      if (line.kind === "tool") {
        paintToolChip(el, line);
        return;
      }
      if (line.kind === "say" && !streaming) {
        paintSayRich(el, line.text);
        return;
      }
      el.textContent = line.text || "";
    }
    function bodyNodes(feed) {
      try {
        return feed.querySelectorAll(".wb-cchat-line");
      } catch (e23) {
        return [];
      }
    }
    function syncFeed(feed, prevLen) {
      var nodes = bodyNodes(feed);
      while (nodes.length > shown.length) {
        try {
          nodes[nodes.length - 1].remove();
        } catch (e29) {
        }
        nodes = bodyNodes(feed);
      }
      var i;
      for (i = 0; i < shown.length; i++) {
        var streaming = pendingLines && pendingLines[i] && String(shown[i].text || "").length < String(pendingLines[i].text || "").length;
        if (i >= nodes.length) {
          var el = document.createElement("div");
          paintProcessLine(el, shown[i], streaming);
          feed.appendChild(el);
          continue;
        }
        if (i >= prevLen - 1 || i === shown.length - 1) {
          paintProcessLine(nodes[i], shown[i], streaming);
        }
      }
    }
    function pump(feed) {
      raf = 0;
      if (!feed || !pendingLines) return;
      try {
        feed.removeAttribute("data-wb-cchat-static");
      } catch (e28) {
      }
      var target = pendingLines;
      var prevLen = shown.length;
      shown = codingProcessTick(shown, target);
      syncFeed(feed, prevLen);
      var last = shown.length ? shown[shown.length - 1] : null;
      var lastFull = last && target[shown.length - 1];
      var busy = shown.length < target.length || last && lastFull && !isProcessLineComplete(last, lastFull);
      if (busy) {
        raf = requestAnimationFrame(function() {
          pump(feed);
        });
        return;
      }
      var done = bodyNodes(feed);
      var i;
      for (i = 0; i < shown.length && i < target.length; i++) {
        shown[i].running = !!target[i].running;
        if (done[i] && shown[i].kind === "tool") {
          var richer = String(target[i].snippet || "") !== String(shown[i].snippet || "") || String(target[i].command || "") !== String(shown[i].command || "");
          if (richer) {
            shown[i] = copyProcessLine(target[i]);
            paintProcessLine(done[i], shown[i], false);
          } else {
            done[i].className = lineClassName(shown[i]);
          }
        }
      }
    }
    function render(feed, job) {
      var id = String(job.id || "");
      if (id !== streamJob) {
        stopStream();
        streamJob = id;
        try {
          feed.textContent = "";
        } catch (e24) {
        }
      }
      var lines = mergeCodingProcessLines(codingProcessLines(job && job.transcript));
      var st = String(job && job.status || "");
      if (st && st !== "running" && st !== "queued" && st !== "pending_review") {
        var closeout = userFacingCodingConclusion(job);
        var sayIdx = -1;
        var si;
        for (si = lines.length - 1; si >= 0; si--) {
          if (lines[si].kind === "say") {
            sayIdx = si;
            break;
          }
        }
        if (closeout) {
          if (sayIdx >= 0 && isProgressiveCodingText(lines[sayIdx].text, closeout)) {
            if (closeout.length > lines[sayIdx].text.length) lines[sayIdx].text = closeout;
          } else if (sayIdx < 0 || lines[sayIdx].text !== closeout) {
            lines.push({ kind: "say", text: closeout });
          }
        }
      }
      if (!shouldStreamCodingProcess(job.status, shown.length, lines.length)) return;
      if (!lines.length && !shown.length) {
        if (feed.querySelector("[data-wb-cchat-wait]")) return;
        var wait = document.createElement("div");
        wait.className = "wb-cchat-line is-status";
        wait.setAttribute("data-wb-cchat-wait", "1");
        wait.textContent = "\u6B63\u5728\u51C6\u5907\u5199\u7801\u2026";
        feed.appendChild(wait);
        return;
      }
      var waitEl = null;
      try {
        waitEl = feed.querySelector("[data-wb-cchat-wait]");
      } catch (e25) {
      }
      if (waitEl) {
        try {
          waitEl.remove();
        } catch (e26) {
        }
      }
      pendingLines = lines;
      if (!raf) {
        raf = requestAnimationFrame(function() {
          pump(feed);
        });
      }
    }
    function paintStaticConclusion(job) {
      var closeout = userFacingCodingConclusion(job);
      if (!closeout) {
        clearFeed();
        return;
      }
      var feed = ensureFeed();
      if (!feed) return;
      var mark = String(job && job.id || "");
      if (feed.getAttribute("data-wb-cchat-static") === mark && feed.querySelector(".wb-cchat-line")) return;
      try {
        feed.setAttribute("data-wb-cchat-static", mark);
      } catch (e30) {
      }
      feed.textContent = "";
      var el = document.createElement("div");
      paintProcessLine(el, { kind: "say", text: closeout }, false);
      feed.appendChild(el);
    }
    function loadJob(id) {
      return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(id) + "?view=card").then(function(r) {
        return r.json();
      }).then(function(body) {
        var job = body && (body.job || body);
        if (!job || !job.id) return;
        if (!shouldStreamCodingProcess(job.status, shown.length, 0)) {
          if (!shown.length) paintStaticConclusion(job);
          return;
        }
        var feed = ensureFeed();
        if (feed) render(feed, job);
      });
    }
    function resolveJobId(card) {
      var known = jobIdFrom(card);
      if (known) return Promise.resolve(known);
      var ws = workspaceFrom(card);
      var callId = callIdFrom(card);
      var req = reqFrom(card);
      var sid = sessionId();
      if (!ws || !callId && !(sid && req)) return Promise.resolve("");
      var qs = "workspace=" + encodeURIComponent(ws) + (callId ? "&call_id=" + encodeURIComponent(callId) : "") + (sid ? "&session_id=" + encodeURIComponent(sid) : "") + (req ? "&requirement=" + encodeURIComponent(req) : "");
      return fetch(chatBase() + "/api/cursor-chat/pending-latest?" + qs).then(function(r) {
        return r.json();
      }).then(function(body) {
        var pending = body && body.pending;
        if (pending && pending.job_id) return String(pending.job_id);
        return fallbackJobId(ws, req);
      }).catch(function() {
        return fallbackJobId(ws, req);
      });
    }
    function fallbackJobId(ws, req) {
      var want = String(ws || "").replace(/\\/g, "/").toLowerCase();
      if (!want) return Promise.resolve("");
      return fetch(chatBase() + "/api/cursor-chat/jobs").then(function(r) {
        return r.json();
      }).then(function(body) {
        var items = body && body.items || [];
        var mine = [];
        var i;
        for (i = 0; i < items.length; i++) {
          var w = String(items[i].workspace || "").replace(/\\/g, "/").toLowerCase();
          if (w === want) mine.push(items[i]);
        }
        mine.sort(function(a, b) {
          return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
        });
        mine = mine.slice(0, 4);
        return Promise.all(
          mine.map(function(item) {
            return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(item.id) + "?view=card").then(function(r2) {
              return r2.json();
            }).then(function(body2) {
              return body2 && (body2.job || body2);
            }).catch(function() {
              return null;
            });
          })
        );
      }).then(function(jobs) {
        var hit = pickCodingInlineJob(req, jobs || []);
        return hit && hit.id ? String(hit.id) : "";
      }).catch(function() {
        return "";
      });
    }
    function columnText() {
      var host = messageColumn();
      if (!host) return "";
      try {
        return String(host.innerText || "").slice(0, 4e3);
      } catch (e18) {
        return "";
      }
    }
    function resolveLiveJobId() {
      return fetch(chatBase() + "/api/cursor-chat/jobs").then(function(r) {
        return r.json();
      }).then(function(body) {
        var items = body && body.items || [];
        items.sort(function(a, b) {
          return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
        });
        items = items.slice(0, 4);
        return Promise.all(
          items.map(function(item) {
            return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(item.id) + "?view=card").then(function(r2) {
              return r2.json();
            }).then(function(body2) {
              return body2 && (body2.job || body2);
            }).catch(function() {
              return null;
            });
          })
        );
      }).then(function(jobs) {
        var hit = pickLiveCodingJob(columnText(), jobs || []);
        return hit && hit.id ? String(hit.id) : "";
      }).catch(function() {
        return "";
      });
    }
    function tick() {
      if (flowOn()) {
        clearFeed();
        return;
      }
      var card = lastCard();
      var pending = card ? resolveJobId(card) : divingFlowItem(document) ? resolveLiveJobId() : null;
      if (!pending) return;
      pending.then(function(id) {
        if (!id) return;
        return loadJob(id);
      }).catch(function() {
      });
    }
    var timer = setInterval(tick, 400);
    tick();
    return function() {
      try {
        clearInterval(timer);
      } catch (e13) {
      }
      clearFeed();
    };
  }
  function installAutoStartClearCoding() {
    if (typeof document === "undefined") return function() {
    };
    var HIDE = "data-wb-cchat-autostart-hide";
    var STARTED = "data-wb-cchat-autostarted";
    var CLICKED = "data-wb-cchat-autoclicked";
    var inflight = {};
    function flowOn() {
      try {
        if (globalThis.__wbIntegratedFlowOn) return true;
      } catch (e0) {
      }
      try {
        return !!(document.documentElement && document.documentElement.classList.contains("wb-integrated-flow-on"));
      } catch (e1) {
        return false;
      }
    }
    function chatBase() {
      try {
        var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
        if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
      } catch (e2) {
      }
      return "http://127.0.0.1:18791";
    }
    function sessionId() {
      try {
        return String(globalThis.__wbDshSessionId || "").trim();
      } catch (e3) {
        return "";
      }
    }
    function touchesComposer(el) {
      if (!el || !el.closest) return false;
      try {
        return !!el.closest("[data-composer-seat],[data-composer-card]");
      } catch (e4) {
        return false;
      }
    }
    function cardText(card) {
      try {
        return String(card.textContent || "");
      } catch (e5) {
        return "";
      }
    }
    function isWaitingConfirm(card) {
      if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
      if (touchesComposer(card)) return false;
      var text = cardText(card);
      if (text.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199") < 0 && text.indexOf("\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u5199\u7801") < 0) {
        return false;
      }
      if (text.indexOf("Cursor \u4ECD\u5728\u5904\u7406") >= 0 || text.indexOf("\u53D6\u6D88\u4EFB\u52A1") >= 0) return false;
      if (text.indexOf("\u672C\u5361\u53EA\u5C55\u793A\u8FC7\u7A0B") >= 0) return false;
      if (text.indexOf("Cursor \u6B63\u5728\u6539\u7801") >= 0 || text.indexOf("\u5199\u7801\u4E2D") >= 0 || text.indexOf("\u5DF2\u540C\u6B65") >= 0 || text.indexOf("\u8BF4\u660E\u65B9\u6848") >= 0 || text.indexOf("\u672C\u8F6E\u7ED3\u8BBA") >= 0 || text.indexOf("\u6C99\u7BB1") >= 0) {
        return false;
      }
      return true;
    }
    function isProgressCard(card) {
      var text = cardText(card);
      return text.indexOf("\u672C\u5361\u53EA\u5C55\u793A\u8FC7\u7A0B") >= 0 || text.indexOf("\u5199\u7801\u4E2D") >= 0;
    }
    function hideConfirm(card) {
      card.setAttribute(HIDE, "1");
    }
    function showCard(card) {
      if (card.getAttribute(HIDE) === "1") card.removeAttribute(HIDE);
    }
    function revealFold(card) {
      var node = card;
      var depth;
      for (depth = 0; depth < 14 && node && node !== document.body && node !== document.documentElement; depth++) {
        if (touchesComposer(node)) return;
        try {
          if (node.getAttribute && node.getAttribute("hidden") === "until-found") {
            node.removeAttribute("hidden");
          }
        } catch (e6) {
        }
        node = node.parentElement;
      }
    }
    function workspaceFromCard(card) {
      var hints;
      try {
        hints = card.querySelectorAll(".cc-set-hint");
      } catch (e7) {
        hints = [];
      }
      var i;
      for (i = 0; i < hints.length; i++) {
        var t = String(hints[i].textContent || "").trim();
        if (/^[A-Za-z]:[\\/]/.test(t) || t.indexOf("/") === 0) return t;
      }
      var m = cardText(card).match(/[A-Za-z]:[\\/][^\s]+/);
      return m ? m[0] : "";
    }
    function requirementFromCard(card) {
      var q;
      try {
        q = card.querySelector(".cc-quote");
      } catch (e8) {
        q = null;
      }
      var t = q ? String(q.textContent || "").trim() : "";
      if (t && t.indexOf("\uFF08\u7A7A") !== 0) return t;
      return "";
    }
    function callIdFromCard(card) {
      try {
        var el = card.closest("[data-chat-call-id]");
        return el ? String(el.getAttribute("data-chat-call-id") || "").trim() : "";
      } catch (e9) {
        return "";
      }
    }
    function confirmBusy(card) {
      var btns;
      try {
        btns = card.querySelectorAll("button");
      } catch (e10a) {
        return false;
      }
      var i;
      for (i = 0; i < btns.length; i++) {
        var t = String(btns[i].textContent || "");
        if (t.indexOf("\u63D0\u4EA4\u4E2D") >= 0) return true;
        if (btns[i].disabled && t.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199") >= 0) return true;
      }
      return false;
    }
    function clickConfirm(card) {
      var btns;
      try {
        btns = card.querySelectorAll("button");
      } catch (e10) {
        return false;
      }
      var i;
      for (i = 0; i < btns.length; i++) {
        var b = btns[i];
        var t = String(b.textContent || "");
        if (t.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199") < 0) continue;
        if (b.disabled) return false;
        try {
          b.click();
        } catch (e11) {
          return false;
        }
        return true;
      }
      return false;
    }
    function apiConfirm(card, done) {
      var ws = workspaceFromCard(card);
      var req = requirementFromCard(card);
      var callId = callIdFromCard(card);
      var sid = sessionId();
      if (!ws || !callId && !(sid && req)) {
        done(false);
        return;
      }
      var qs = "workspace=" + encodeURIComponent(ws) + (callId ? "&call_id=" + encodeURIComponent(callId) : "") + (sid ? "&session_id=" + encodeURIComponent(sid) : "") + (req ? "&requirement=" + encodeURIComponent(req) : "");
      fetch(chatBase() + "/api/cursor-chat/pending-latest?" + qs).then(function(r) {
        return r.json();
      }).then(function(d) {
        var pending = d && d.pending;
        var tok = pending && String(pending.confirm_token || "").trim();
        if (!tok || String(pending.status || "") !== "waiting") {
          done(false);
          return null;
        }
        var requirement = String(pending.requirement || req || "").trim();
        var workspace = String(pending.workspace || ws || "").trim();
        return fetch(chatBase() + "/api/hitl/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cursor-chat.confirm",
            workspace,
            requirement,
            confirm_token: tok
          })
        }).then(function(r2) {
          return r2.json();
        }).then(function(issued) {
          if (!issued || !issued.ok || !issued.nonce) throw new Error("hitl");
          var body = {
            workspace,
            requirement,
            nonce: issued.nonce,
            confirm_token: tok
          };
          if (pending.parent_job_id) body.parent_job_id = pending.parent_job_id;
          return fetch(chatBase() + "/api/cursor-chat/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          }).then(function(r3) {
            return r3.json();
          });
        });
      }).then(function(res) {
        done(!!(res && res.ok));
      }).catch(function() {
        done(false);
      });
    }
    var reqByJob = {};
    var jobPoll = null;
    function directChild(host, selector) {
      if (!host || !host.querySelector) return null;
      try {
        return host.querySelector(":scope > " + selector);
      } catch (e12a) {
        var nodes = host.querySelectorAll(selector);
        var i;
        for (i = 0; i < nodes.length; i++) {
          if (nodes[i].parentElement === host) return nodes[i];
        }
        return null;
      }
    }
    function ensureInline(card) {
      if (!card || !card.parentElement || touchesComposer(card)) return;
      var host = card.parentElement;
      if (touchesComposer(host)) return;
      hideConfirm(card);
      revealFold(card);
      var panel = directChild(host, ".wb-cchat-inline");
      if (!panel) {
        panel = document.createElement("div");
        panel.className = "wb-cchat-inline";
        panel.setAttribute("data-wb-cchat-inline", "1");
        panel.innerHTML = '<div class="wb-cchat-inline-kicker">\u5199\u7801</div><div class="wb-cchat-inline-req"></div><div class="wb-cchat-inline-status">\u6B63\u5728\u5F00\u5DE5\u2026</div>';
        try {
          host.insertBefore(panel, card);
        } catch (e12b) {
          return;
        }
      }
      var req = codingInlineRequirement(requirementFromCard(card));
      panel.setAttribute("data-wb-cchat-req", req);
      var reqEl = panel.querySelector(".wb-cchat-inline-req");
      if (reqEl && req && reqEl.textContent !== req) reqEl.textContent = req;
    }
    function sweepInline() {
      var panels;
      try {
        panels = document.querySelectorAll(".wb-cchat-inline");
      } catch (e12c) {
        return;
      }
      var i;
      for (i = 0; i < panels.length; i++) {
        var panel = panels[i];
        var host = panel.parentElement;
        var card = host ? directChild(host, ".cc-card") : null;
        if (!card || !isWaitingConfirm(card)) {
          try {
            panel.remove();
          } catch (e12d) {
          }
        }
      }
    }
    function paintInline(panel, job) {
      var statusEl = panel.querySelector(".wb-cchat-inline-status");
      if (!statusEl || !job) return;
      var line = codingInlineStatusLine(job.status, job.detail);
      if (statusEl.textContent !== line) statusEl.textContent = line;
    }
    function refreshInlineJobs() {
      var panels;
      try {
        panels = document.querySelectorAll(".wb-cchat-inline");
      } catch (e12e) {
        return;
      }
      if (!panels || !panels.length) return;
      fetch(chatBase() + "/api/cursor-chat/jobs").then(function(r) {
        return r.json();
      }).then(function(data) {
        var items = (data && data.items || []).slice().sort(function(a, b) {
          return String(b && b.updated_at || "").localeCompare(String(a && a.updated_at || ""));
        });
        var pending = [];
        var i;
        for (i = 0; i < items.length && i < 6; i++) {
          var id = String(items[i] && items[i].id || "").trim();
          if (!id || reqByJob[id]) continue;
          pending.push(id);
        }
        return Promise.all(
          pending.map(function(id2) {
            return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(id2) + "?view=card").then(function(r2) {
              return r2.json();
            }).then(function(body) {
              var job = body && body.job;
              if (job && job.requirement) reqByJob[id2] = String(job.requirement);
            }).catch(function() {
            });
          })
        ).then(function() {
          return items;
        });
      }).then(function(items) {
        var rows = (items || []).map(function(item) {
          var id = String(item && item.id || "").trim();
          return {
            id,
            requirement: reqByJob[id] || "",
            status: item && item.status,
            detail: item && item.detail,
            updated_at: item && item.updated_at
          };
        });
        var i;
        for (i = 0; i < panels.length; i++) {
          var panel = panels[i];
          if (!panel || !panel.isConnected) continue;
          var picked = pickCodingInlineJob(panel.getAttribute("data-wb-cchat-req") || "", rows);
          if (picked) paintInline(panel, picked);
        }
      }).catch(function() {
      });
    }
    function isCodingPluginCard(card) {
      if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
      if (touchesComposer(card)) return false;
      var text = cardText(card);
      if (text.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199") >= 0) return true;
      if (text.indexOf("\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u5199\u7801") >= 0) return true;
      if (text.indexOf("\u672C\u5361\u53EA\u5C55\u793A\u8FC7\u7A0B") >= 0) return true;
      if (text.indexOf("Cursor \u6B63\u5728\u6539\u7801") >= 0) return true;
      return false;
    }
    function scan() {
      if (flowOn()) return;
      var cards;
      try {
        cards = document.querySelectorAll(".cc-card");
      } catch (e12) {
        return;
      }
      var i;
      for (i = 0; i < cards.length; i++) {
        if (touchesComposer(cards[i])) continue;
        if (isCodingPluginCard(cards[i])) hideConfirm(cards[i]);
        else showCard(cards[i]);
        revealFold(cards[i]);
      }
      var panels;
      try {
        panels = document.querySelectorAll(".wb-cchat-inline");
      } catch (e12f) {
        panels = [];
      }
      for (i = 0; i < panels.length; i++) {
        try {
          panels[i].remove();
        } catch (e12g) {
        }
      }
    }
    scan();
    var obs = null;
    try {
      obs = new MutationObserver(scan);
      obs.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["hidden", "class"]
      });
    } catch (e14) {
    }
    var tick = setInterval(scan, 400);
    return function() {
      try {
        clearInterval(tick);
      } catch (e15) {
      }
      try {
        clearInterval(jobPoll);
      } catch (e15b) {
      }
      try {
        if (obs) obs.disconnect();
      } catch (e16) {
      }
    };
  }
  function installContinueConfirmClarify() {
    if (typeof document === "undefined") return function() {
    };
    var ATTR = "data-wb-continue-clarify";
    var BANNER = "data-wb-continue-clarify-banner";
    var fetching = {};
    function chatBase() {
      try {
        var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
        if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
      } catch (e0) {
      }
      return "http://127.0.0.1:18791";
    }
    function cardText(card) {
      try {
        return String(card.innerText || "");
      } catch (e1) {
        return "";
      }
    }
    function isContinueConfirmCard(card) {
      if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
      var text = cardText(card);
      if (text.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199") < 0) return false;
      if (text.indexOf("\u7EED\u6539\u786E\u8BA4") < 0 && text.indexOf("\u7EED\u6539") < 0) return false;
      if (text.indexOf("Cursor \u4ECD\u5728\u5904\u7406") >= 0) return false;
      if (text.indexOf("\u7EED\u6539\u8FDB\u5EA6") >= 0 && text.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199") < 0) return false;
      return true;
    }
    function parentJobIdNear(card) {
      var scopes = [card];
      try {
        if (card.parentElement) scopes.push(card.parentElement);
        if (card.parentElement && card.parentElement.parentElement) {
          scopes.push(card.parentElement.parentElement);
        }
      } catch (e2) {
      }
      var i;
      for (i = 0; i < scopes.length; i++) {
        var text = "";
        try {
          text = String(scopes[i] && scopes[i].innerText || "");
        } catch (e3) {
          continue;
        }
        var m = text.match(/\b(cch-[0-9a-z-]+)\b/i);
        if (m) return m[1];
      }
      return "";
    }
    function setBanner(card, kind, title, body) {
      var prevKind = card.getAttribute(ATTR) || "";
      var el = null;
      try {
        el = card.querySelector("[" + BANNER + "]");
      } catch (e4) {
        el = null;
      }
      if (el && prevKind === kind) {
        try {
          var bodyEl = el.querySelector(".wb-continue-clarify-body");
          if (bodyEl && body) bodyEl.textContent = body;
        } catch (e5) {
        }
        return;
      }
      card.setAttribute(ATTR, kind);
      if (el) {
        try {
          el.remove();
        } catch (e6) {
        }
      }
      el = document.createElement("div");
      el.setAttribute(BANNER, "1");
      el.className = "wb-continue-clarify" + (String(kind).indexOf("failed") === 0 ? " is-failed" : kind === "missing" ? " is-warn" : "");
      var h2 = document.createElement("div");
      h2.className = "wb-continue-clarify-title";
      h2.textContent = title;
      var p = document.createElement("div");
      p.className = "wb-continue-clarify-body";
      p.textContent = body;
      el.appendChild(h2);
      el.appendChild(p);
      try {
        card.insertBefore(el, card.firstChild);
      } catch (e7) {
        try {
          card.appendChild(el);
        } catch (e8) {
        }
      }
    }
    function applyGeneric(card) {
      setBanner(
        card,
        "continue",
        "\u8FD9\u662F\u7EED\u6539\u786E\u8BA4\uFF08\u4E0D\u662F\u65B0\u5F00\u65E0\u5173\u4EFB\u52A1\uFF09",
        "\u5C06\u5728\u4E0A\u4E00\u8F6E\u5199\u7801\u57FA\u7840\u4E0A\u7EE7\u7EED\u6539\u540C\u4E00\u5DE5\u7A0B\u4E0E\u8BC9\u6C42\u3002\u70B9\u300C\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199\u300D\u540E\u624D\u4F1A\u7EE7\u7EED\u5199\u7801\uFF1B\u672A\u70B9\u786E\u8BA4\u524D\u4E0D\u4F1A\u6539\u4EE3\u7801\u3002"
      );
    }
    function applyFailed(card, detail) {
      var kind = classifyCodingFailKind(detail);
      var copy = codingFailContinueCopy(kind, detail);
      setBanner(card, "failed-" + kind, copy.title, copy.body);
    }
    function applyMissing(card, jid) {
      setBanner(
        card,
        "missing",
        "\u4E0A\u4E00\u8F6E\u4EFB\u52A1\u5DF2\u5931\u6548\uFF0C\u9700\u8981\u91CD\u65B0\u786E\u8BA4\u540E\u7EED\u6539",
        "\u627E\u4E0D\u5230\u4EFB\u52A1 " + String(jid || "").trim() + "\uFF08\u53EF\u80FD\u5DF2\u6E05\u7406\u6216\u8FC7\u671F\uFF09\u3002\u70B9\u300C\u786E\u8BA4\u5E76\u7528 Cursor \u5F00\u5199\u300D\u5C06\u6309\u5361\u4E0A\u8BC9\u6C42\u91CD\u65B0\u5F00\u5199\u7EE7\u7EED\u5904\u7406\u3002"
      );
    }
    function maybeClarify(card) {
      if (!isContinueConfirmCard(card)) return;
      var jid = parentJobIdNear(card);
      if (!jid) {
        applyGeneric(card);
        return;
      }
      if (fetching[jid]) {
        if (!card.getAttribute(ATTR)) applyGeneric(card);
        return;
      }
      var prevAttr = card.getAttribute(ATTR) || "";
      if (prevAttr.indexOf("failed") === 0 || prevAttr === "missing") return;
      if (!prevAttr) applyGeneric(card);
      fetching[jid] = true;
      var url = chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(jid);
      fetch(url, { method: "GET", credentials: "omit" }).then(function(r) {
        return r.json().then(function(body) {
          return { okHttp: r.ok, status: r.status, body };
        });
      }).then(function(pack) {
        fetching[jid] = false;
        var st = String(
          pack.body && (pack.body.status || pack.body.job && pack.body.job.status) || ""
        );
        var detail = String(
          pack.body && (pack.body.detail || pack.body.error || pack.body.job && (pack.body.job.detail || pack.body.job.error)) || ""
        );
        if (pack.status === 404 || /任务不存在/.test(String(pack.body && pack.body.detail || ""))) {
          applyMissing(card, jid);
          return;
        }
        if (!pack.okHttp && !(pack.body && pack.body.ok !== false && st)) {
          applyGeneric(card);
          return;
        }
        if (st === "failed" || st === "cancelled" || st === "canceled") {
          applyFailed(card, detail);
          return;
        }
        applyGeneric(card);
      }).catch(function() {
        fetching[jid] = false;
        applyGeneric(card);
      });
    }
    function scan() {
      var cards;
      try {
        cards = document.querySelectorAll(".cc-card");
      } catch (e9) {
        return;
      }
      var i;
      for (i = 0; i < cards.length; i++) maybeClarify(cards[i]);
    }
    scan();
    var tick = setInterval(scan, 600);
    return function() {
      try {
        clearInterval(tick);
      } catch (e10) {
      }
    };
  }
  function installDbSyncFailAutoRecover() {
    if (typeof document === "undefined") return function() {
    };
    var ATTR = "data-wb-db-sync-recover";
    var BANNER = "data-wb-db-sync-recover-banner";
    var triedRecover = {};
    var triedCloseout = {};
    function chatBase() {
      try {
        var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
        if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
      } catch (e0) {
      }
      return "http://127.0.0.1:18791";
    }
    function looksLikeProgressFailCard(card) {
      if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
      var text = "";
      try {
        text = String(card.textContent || card.innerText || "");
      } catch (e1) {
        return false;
      }
      if (text.indexOf("\u5931\u8D25") < 0 && text.indexOf("failed") < 0) return false;
      if (!/\bcch-[0-9a-z-]+\b/i.test(text)) return false;
      return true;
    }
    function looksLikeProgressSuccessCard(card) {
      if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
      var text = "";
      try {
        text = String(card.textContent || card.innerText || "");
      } catch (e1b) {
        return false;
      }
      if (text.indexOf("\u5931\u8D25") >= 0 || /\bfailed\b/i.test(text)) return false;
      if (text.indexOf("\u7EED\u6539\u786E\u8BA4") >= 0 && text.indexOf("\u786E\u8BA4\u5E76\u7528 Cursor") >= 0) return false;
      var looksDone = text.indexOf("\u5B8C\u6210") >= 0 || text.indexOf("\u6210\u529F") >= 0 || text.indexOf("succeeded") >= 0 || text.indexOf("\u672C\u8F6E\u7ED3\u8BBA") >= 0 || /已同步\s*\d+\s*个文件/.test(text);
      if (!looksDone) return false;
      if (!/\bcch-[0-9a-z-]+\b/i.test(text)) return false;
      return true;
    }
    function jobIdFrom(card) {
      var text = "";
      try {
        text = String(card.textContent || card.innerText || "");
      } catch (e2) {
        return "";
      }
      var m = text.match(/\b(cch-[0-9a-z-]+)\b/i);
      return m ? m[1] : "";
    }
    function setBanner(card, kind, title, body) {
      card.setAttribute(ATTR, kind);
      var el = null;
      try {
        el = card.querySelector("[" + BANNER + "]");
      } catch (e3) {
        el = null;
      }
      if (el) {
        try {
          el.remove();
        } catch (e4) {
        }
      }
      el = document.createElement("div");
      el.setAttribute(BANNER, "1");
      el.className = "wb-db-sync-recover" + (kind === "ok" ? " is-ok" : kind === "busy" ? " is-busy" : " is-warn");
      var h2 = document.createElement("div");
      h2.className = "wb-db-sync-recover-title";
      h2.textContent = title;
      var p = document.createElement("div");
      p.className = "wb-db-sync-recover-body";
      p.textContent = body;
      el.appendChild(h2);
      el.appendChild(p);
      try {
        card.insertBefore(el, card.firstChild);
      } catch (e5) {
        try {
          card.appendChild(el);
        } catch (e6) {
        }
      }
    }
    function maybeRecover(card) {
      if (!looksLikeProgressFailCard(card)) return;
      var jid = jobIdFrom(card);
      if (!jid || triedRecover[jid]) return;
      var doneAttr = card.getAttribute(ATTR) || "";
      if (doneAttr === "ok" || doneAttr === "skip" || doneAttr === "closeout" || doneAttr === "hollow" || doneAttr === "network" || doneAttr === "url_images" || doneAttr === "agent_missing" || doneAttr === "other" || doneAttr === "db_eperm") {
        return;
      }
      triedRecover[jid] = true;
      setBanner(
        card,
        "busy",
        "\u6B63\u5728\u8BC6\u522B\u5199\u7801\u5931\u8D25\u539F\u56E0\u2026",
        "\u5C06\u533A\u5206\u7F51\u7EDC / \u6570\u636E\u5E93\u6587\u4EF6 / \u9644\u56FE / Agent \u5931\u6548\u7B49\uFF0C\u5E76\u7ED9\u51FA\u4E0B\u4E00\u6B65\uFF1B*.db \u5360\u7528\u65F6\u4F1A\u5C1D\u8BD5\u81EA\u52A8\u56DE\u6536\u6E90\u7801\u3002"
      );
      var jobUrl = chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(jid);
      fetch(jobUrl, { method: "GET", credentials: "omit" }).then(function(r) {
        return r.json().then(function(body) {
          return { okHttp: r.ok, body };
        });
      }).then(function(pack) {
        var detail = String(
          pack.body && (pack.body.detail || pack.body.error || pack.body.job && (pack.body.job.detail || pack.body.job.error)) || ""
        );
        var st = String(
          pack.body && (pack.body.status || pack.body.job && pack.body.job.status) || ""
        );
        if (st !== "failed" && st !== "error") {
          if (st === "succeeded") {
            triedRecover[jid] = false;
            try {
              card.removeAttribute(ATTR);
              var stuck = card.querySelector("[" + BANNER + "]");
              if (stuck) stuck.remove();
            } catch (eSkip) {
            }
            return;
          }
          card.setAttribute(ATTR, "skip");
          return;
        }
        var failKind = classifyCodingFailKind(detail);
        if (failKind !== "db_eperm") {
          var copy = codingFailProgressCopy(failKind, detail);
          setBanner(card, "warn", copy.title, copy.body);
          card.setAttribute(ATTR, failKind);
          return;
        }
        var dbCopy = codingFailProgressCopy("db_eperm", detail);
        setBanner(card, "busy", dbCopy.title, "\u6B63\u5728\u56DE\u6536\u6E90\u7801\uFF08\u5FFD\u7565 *.db\uFF09\u2026 " + dbCopy.body);
        var eng = "";
        try {
          eng = String(engineBase() || "").replace(/\/$/, "");
        } catch (e8) {
          eng = "";
        }
        if (!eng) {
          setBanner(card, "warn", "\u65E0\u6CD5\u81EA\u52A8\u56DE\u6536", "\u5F15\u64CE\u5730\u5740\u672A\u77E5\uFF0C\u8BF7\u91CD\u542F WorkBuddy \u540E\u518D\u8BD5\u3002");
          return;
        }
        return fetch(eng + "/api/cursor-chat/recover-db-sync", {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jid })
        }).then(function(r2) {
          return r2.json().then(function(body2) {
            return { okHttp: r2.ok, body: body2 };
          });
        });
      }).then(function(pack2) {
        if (!pack2) return;
        var files = pack2.body && pack2.body.changed_files || [];
        if (pack2.body && pack2.body.ok && files && files.length) {
          setBanner(
            card,
            "ok",
            "\u5DF2\u81EA\u52A8\u56DE\u6536\u6E90\u7801\uFF08\u5DF2\u5FFD\u7565 *.db\uFF09",
            "\u5DF2\u5199\u5165 " + files.length + " \u4E2A\u6587\u4EF6\uFF1A" + files.slice(0, 6).join("\u3001") + (files.length > 6 ? "\u2026" : "") + "\u3002\u8BF7\u91CD\u542F\u4E1A\u52A1\u540E\u7AEF\u540E\u5237\u65B0\u9875\u9762\u9A8C\u6536\uFF1B\u5E93\u7ED3\u6784\u7531 migrate/\u6E90\u7801\u91CD\u5EFA\uFF0C\u4E0D\u8981\u624B\u5DE5\u62F7 db\u3002"
          );
          console.log("[dsh-mes-bridge] db EPERM \u5DF2\u56DE\u6536\u6E90\u7801 job=" + jid + " n=" + files.length);
          return;
        }
        setBanner(
          card,
          "warn",
          "\u672A\u80FD\u81EA\u52A8\u56DE\u6536\u6E90\u7801",
          String(pack2.body && pack2.body.detail || "\u8BF7\u505C\u6389\u5360\u7528\u5E93\u7684\u540E\u7AEF\u540E\uFF0C\u8BF4\u300C\u4E0D\u8981\u78B0 db\uFF0C\u53EA\u540C\u6B65\u6E90\u7801\u518D\u8DD1\u300D\u7EE7\u7EED\u3002")
        );
      }).catch(function() {
        triedRecover[jid] = false;
        setBanner(card, "warn", "\u56DE\u6536\u8BF7\u6C42\u5931\u8D25", "\u8BF7\u786E\u8BA4\u5F15\u64CE\u5728\u8DD1\u540E\u5237\u65B0\u9875\u9762\u91CD\u8BD5\u3002");
      });
    }
    function maybeSuccessCloseout(card) {
      if (!looksLikeProgressSuccessCard(card)) return;
      var jid = jobIdFrom(card);
      if (!jid || triedCloseout[jid]) return;
      var doneAttr = card.getAttribute(ATTR) || "";
      if (doneAttr === "ok" || doneAttr === "hollow" || doneAttr === "closeout" || doneAttr === "network" || doneAttr === "url_images" || doneAttr === "agent_missing" || doneAttr === "other" || doneAttr === "db_eperm" || doneAttr === "busy") {
        return;
      }
      triedCloseout[jid] = true;
      var jobUrl = chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(jid);
      fetch(jobUrl, { method: "GET", credentials: "omit" }).then(function(r) {
        return r.json().then(function(body) {
          return { okHttp: r.ok, body };
        });
      }).then(function(pack) {
        var job = (pack.body && pack.body.job && typeof pack.body.job === "object" ? pack.body.job : pack.body) || {};
        if (!job.id) job.id = jid;
        var st = String(job.status || pack.body && pack.body.status || "");
        if (st !== "succeeded") {
          triedCloseout[jid] = false;
          return;
        }
        var banner = formatCodingCloseoutBanner(job);
        if (!banner) {
          triedCloseout[jid] = false;
          return;
        }
        setBanner(card, banner.kind, banner.title, banner.body);
        card.setAttribute(ATTR, isHollowCodingSuccess(job) ? "hollow" : "closeout");
      }).catch(function() {
        triedCloseout[jid] = false;
      });
    }
    function scan() {
      var cards;
      try {
        cards = document.querySelectorAll(".cc-card");
      } catch (e9) {
        return;
      }
      var i;
      for (i = 0; i < cards.length; i++) {
        maybeRecover(cards[i]);
        maybeSuccessCloseout(cards[i]);
      }
    }
    scan();
    var tick = setInterval(scan, 1200);
    return function() {
      try {
        clearInterval(tick);
      } catch (e10) {
      }
    };
  }
  function apply(ctx2) {
    bag._wbClientCtx = ctx2 || null;
    try {
      if (typeof window !== "undefined") window.__wbClientCtx = ctx2 || null;
    } catch (eWb) {
    }
    ensureCss();
    discoverEngine();
    ensureLoginGateMounted();
    if (ctx2 && typeof ctx2.effect === "function" && bag._loginGateUnmount) {
      ctx2.effect(function() {
        return function() {
          if (bag._loginGateUnmount) {
            try {
              bag._loginGateUnmount();
            } catch (e0) {
            }
            bag._loginGateUnmount = null;
          }
        };
      }, "workbuddy-app-login-gate");
    }
    if (!ctx2 || !ctx2.slots || typeof ctx2.slots.inject !== "function") {
      console.error("[dsh-mes-bridge] \u65E0 slots \u670D\u52A1\uFF1A\u65E0\u6CD5\u6CE8\u518C WorkBuddy \u5BA2\u6237\u7AEF\u80FD\u529B");
      return;
    }
    try {
      if (bag._wbMuteCchatDispose) {
        try {
          bag._wbMuteCchatDispose();
        } catch (eMute0) {
        }
        bag._wbMuteCchatDispose = null;
      }
      bag._wbMuteCchatDispose = installIntegratedCodingConfirmMute();
      if (bag._wbKeepConfirmDispose) {
        try {
          bag._wbKeepConfirmDispose();
        } catch (eKeep0) {
        }
        bag._wbKeepConfirmDispose = null;
      }
      bag._wbKeepConfirmDispose = installAutoStartClearCoding();
      if (bag._wbRevealFoldDispose) {
        try {
          bag._wbRevealFoldDispose();
        } catch (eReveal0) {
        }
        bag._wbRevealFoldDispose = null;
      }
      bag._wbRevealFoldDispose = installRevealFoldedToolviews();
      if (bag._wbProcessFeedDispose) {
        try {
          bag._wbProcessFeedDispose();
        } catch (eFeed0) {
        }
        bag._wbProcessFeedDispose = null;
      }
      bag._wbProcessFeedDispose = installCodingProcessFeed();
      if (bag._wbMuteAskDispose) {
        try {
          bag._wbMuteAskDispose();
        } catch (eAsk0) {
        }
        bag._wbMuteAskDispose = null;
      }
      bag._wbMuteAskDispose = installMuteClearCodingAsk();
      if (bag._wbContinueClarifyDispose) {
        try {
          bag._wbContinueClarifyDispose();
        } catch (eFc0) {
        }
        bag._wbContinueClarifyDispose = null;
      }
      bag._wbContinueClarifyDispose = installContinueConfirmClarify();
      if (bag._wbDbSyncRecoverDispose) {
        try {
          bag._wbDbSyncRecoverDispose();
        } catch (eDb0) {
        }
        bag._wbDbSyncRecoverDispose = null;
      }
      bag._wbDbSyncRecoverDispose = installDbSyncFailAutoRecover();
      if (ctx2 && typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return function() {
            if (bag._wbMuteCchatDispose) {
              try {
                bag._wbMuteCchatDispose();
              } catch (eMute1) {
              }
              bag._wbMuteCchatDispose = null;
            }
            if (bag._wbKeepConfirmDispose) {
              try {
                bag._wbKeepConfirmDispose();
              } catch (eKeep1) {
              }
              bag._wbKeepConfirmDispose = null;
            }
            if (bag._wbRevealFoldDispose) {
              try {
                bag._wbRevealFoldDispose();
              } catch (eReveal1) {
              }
              bag._wbRevealFoldDispose = null;
            }
            if (bag._wbMuteAskDispose) {
              try {
                bag._wbMuteAskDispose();
              } catch (eAsk1) {
              }
              bag._wbMuteAskDispose = null;
            }
            if (bag._wbContinueClarifyDispose) {
              try {
                bag._wbContinueClarifyDispose();
              } catch (eFc1) {
              }
              bag._wbContinueClarifyDispose = null;
            }
            if (bag._wbDbSyncRecoverDispose) {
              try {
                bag._wbDbSyncRecoverDispose();
              } catch (eDb1) {
              }
              bag._wbDbSyncRecoverDispose = null;
            }
          };
        }, "workbuddy-mute-cchat-confirm");
      }
    } catch (eMute) {
      console.warn("[dsh-mes-bridge] \u4E00\u4F53\u5316\u5199\u7801\u786E\u8BA4\u5361\u9759\u9ED8\u6302\u8F7D\u5931\u8D25", eMute);
    }
    var WB_BRAND_LABEL = "\u6C5F\u897F\u4E2D\u8F6F\u5DE5\u4F5C\u52A9\u624B";
    var WB_HERO_LABEL = "\u6C5F\u897F\u4E2D\u8F6F\uFF0C\u8BA9\u5236\u9020\u66F4\u667A\u80FD";
    var WB_BRAND_LOGO_URL = engineBase() + "/zr-logo.png";
    var WB_BRANDING_LOADED = false;
    function resolveBrandLogoAbs() {
      var u = String(WB_BRAND_LOGO_URL || "");
      var base = engineBase();
      if (!u) return base + "/zr-logo.png";
      if (u.indexOf("http://") === 0 || u.indexOf("https://") === 0) {
        if (u.indexOf(base) === 0) return u;
        return base + "/zr-logo.png";
      }
      if (u.charAt(0) === "/") return base + u;
      return base + "/" + u;
    }
    function applyDocumentChrome() {
      try {
        if (!document) return;
        document.title = WB_BRAND_LABEL;
        var href = resolveBrandLogoAbs();
        var links = document.querySelectorAll(
          "link[rel~='icon'], link[rel='shortcut icon']"
        );
        var i;
        for (i = 0; i < links.length; i++) {
          links[i].setAttribute("href", href);
          links[i].setAttribute("type", "image/png");
        }
        if (!links.length && document.head) {
          var link = document.createElement("link");
          link.rel = "icon";
          link.type = "image/png";
          link.href = href;
          document.head.appendChild(link);
        }
      } catch (_eChrome) {
      }
    }
    function installDocumentChromeWatcher() {
      applyDocumentChrome();
      try {
        var titleEl = document.querySelector("title");
        if (titleEl && typeof MutationObserver !== "undefined") {
          new MutationObserver(function() {
            if (document.title !== WB_BRAND_LABEL) {
              document.title = WB_BRAND_LABEL;
            }
          }).observe(titleEl, {
            childList: true,
            characterData: true,
            subtree: true
          });
        }
      } catch (_eWatch) {
      }
    }
    function fetchBrandingConfig() {
      try {
        fetch(engineBase() + "/api/branding").then(function(r) {
          return r.json();
        }).then(function(d) {
          if (d && d.ok && d.branding && d.branding.enabled) {
            var b = d.branding;
            if (b.app_name) WB_BRAND_LABEL = String(b.app_name).slice(0, 64);
            if (b.app_overview) WB_HERO_LABEL = String(b.app_overview).slice(0, 200);
            var logo = String(b.logo_url || "");
            if (logo.indexOf("/api/branding/logo") >= 0) {
              WB_BRAND_LOGO_URL = logo;
            }
            WB_BRANDING_LOADED = true;
          }
          applyDocumentChrome();
        }).catch(function() {
          applyDocumentChrome();
        });
      } catch (e) {
        applyDocumentChrome();
      }
    }
    fetchBrandingConfig();
    installDocumentChromeWatcher();
    function WorkBuddyBrandName() {
      return h(
        "span",
        { className: "wb-brand-wordmark", "data-wb-brand": "1" },
        WB_BRAND_LABEL
      );
    }
    function WorkBuddyBrandMark(props) {
      var s = Math.min(36, Math.max(18, Number(props && props.size || 24) || 24));
      return h(
        "span",
        {
          className: "wb-brand-mark",
          "data-wb-brand-mark": "1",
          style: { ["--wb-mark-size"]: s + "px" }
        },
        h("img", {
          src: WB_BRAND_LOGO_URL,
          alt: "",
          width: s,
          height: s
        })
      );
    }
    function installZhongruanBrandPatch() {
      if (typeof document === "undefined") return function() {
      };
      var WB_MARK_SELECTOR = "[data-wb-brand-mark='1'], [class*='wb-brand-mark']";
      function isOurs(c) {
        return c.getAttribute && (c.getAttribute("data-wb-brand") === "1" || c.getAttribute("data-wb-brand-mark") === "1");
      }
      function hideOfficialKids(el) {
        var kids = el.children;
        for (var i = 0; i < kids.length; i++) {
          var c = kids[i];
          if (isOurs(c)) continue;
          c.setAttribute("data-wb-brand-hide", "1");
        }
        for (var n = el.firstChild; n; ) {
          var next = n.nextSibling;
          if (n.nodeType === 3 && String(n.textContent || "").trim()) {
            el.removeChild(n);
          }
          n = next;
        }
      }
      function ensureLabel(el) {
        hideOfficialKids(el);
        var spans = el.querySelectorAll("[data-wb-brand='1']");
        var span = spans[0];
        if (!span) {
          span = document.createElement("span");
          span.setAttribute("data-wb-brand", "1");
          span.className = "wb-brand-wordmark";
          el.appendChild(span);
        }
        for (var d = 1; d < spans.length; d++) {
          if (spans[d].parentNode) spans[d].parentNode.removeChild(spans[d]);
        }
        if (span.textContent !== WB_BRAND_LABEL) span.textContent = WB_BRAND_LABEL;
      }
      function ensureMark(el, size) {
        if (el.getAttribute && el.getAttribute("data-wb-brand-mark") === "1") return;
        var s = size || 24;
        var wrap = el.querySelector("[data-wb-brand-mark='1']");
        if (!wrap) {
          wrap = document.createElement("span");
          wrap.setAttribute("data-wb-brand-mark", "1");
          wrap.className = "wb-brand-mark";
          var img = document.createElement("img");
          img.alt = "";
          wrap.appendChild(img);
          if (el.firstChild) el.insertBefore(wrap, el.firstChild);
          else el.appendChild(wrap);
        }
        wrap.style.setProperty("--wb-mark-size", s + "px");
        var imgEl = wrap.querySelector("img");
        if (imgEl) {
          imgEl.width = s;
          imgEl.height = s;
          var src = WB_BRAND_LOGO_URL;
          if (imgEl.src !== src) imgEl.src = src;
        }
      }
      function dedupeMarks() {
        var ours = document.querySelectorAll("[data-wb-brand-mark='1']");
        var seen = [];
        for (var i = 0; i < ours.length; i++) {
          var p = ours[i].parentElement;
          if (!p) continue;
          if (seen.indexOf(p) >= 0) {
            if (p.removeChild) p.removeChild(ours[i]);
          } else {
            seen.push(p);
          }
        }
      }
      function ensureHeroHeadline() {
        var heads = document.querySelectorAll("[class*='headlineText']");
        for (var h2 = 0; h2 < heads.length; h2++) {
          if (heads[h2].textContent !== WB_HERO_LABEL) heads[h2].textContent = WB_HERO_LABEL;
        }
        var badges = document.querySelectorAll("[class*='previewBadge']");
        for (var b = 0; b < badges.length; b++) {
          badges[b].setAttribute("data-wb-brand-hide", "1");
        }
      }
      function scan() {
        var names = document.querySelectorAll("[class*='brandName'], [class*='_brandName']");
        for (var i = 0; i < names.length; i++) {
          if (names[i].closest && names[i].closest("[data-wb-brand-mark='1']")) continue;
          hideOfficialKids(names[i]);
          ensureMark(names[i], 24);
          ensureLabel(names[i]);
        }
        var marks = document.querySelectorAll(
          "[class*='brandMark'], [class*='_brandMark'], [class*='railMark']"
        );
        for (var j = 0; j < marks.length; j++) {
          var markEl = marks[j];
          if (markEl.getAttribute && markEl.getAttribute("data-wb-brand-mark") === "1") continue;
          if (markEl.className && String(markEl.className).indexOf("wb-brand-mark") >= 0) continue;
          markEl.setAttribute("data-wb-brand-hide", "1");
        }
        var fish = document.querySelectorAll("[class*='fishHitbox']");
        for (var f = 0; f < fish.length; f++) {
          fish[f].setAttribute("data-wb-brand-hide", "1");
        }
        dedupeMarks();
        ensureHeroHeadline();
      }
      scan();
      var scheduled = false;
      var stopped = false;
      var obs = typeof MutationObserver !== "undefined" ? new MutationObserver(function() {
        if (scheduled || stopped) return;
        scheduled = true;
        setTimeout(function() {
          scheduled = false;
          if (!stopped) scan();
        }, 120);
      }) : null;
      if (obs && document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true });
      }
      return function() {
        stopped = true;
        if (obs) obs.disconnect();
      };
    }
    function pinRunningCodingCard() {
      if (typeof document === "undefined") return function() {
      };
      var ATTR = "data-wb-coding-hold";
      var stopped = false;
      function classText(el) {
        return String(el && el.className || "");
      }
      function isComposer(el) {
        if (!el || !el.closest) return false;
        return !!el.closest("[data-composer-seat],[data-composer-card]");
      }
      function isRunningCoding(el) {
        if (!el || !el.querySelector) return false;
        if (el.querySelector(".wb-cd-think.is-live, .wb-cd-dot-live, .wb-cd-spin")) return true;
        var card = el.querySelector(".cc-card");
        if (!card) return false;
        var text = String(card.textContent || "");
        return text.indexOf("\u672C\u5361\u53EA\u5C55\u793A\u8FC7\u7A0B") >= 0 || text.indexOf("\u5199\u7801\u4E2D") >= 0 || text.indexOf("Cursor \u6B63\u5728") >= 0 || text.indexOf("Cursor \u4ECD\u5728\u5904\u7406") >= 0;
      }
      function rowOf(el) {
        var n = el;
        while (n && n.parentElement) {
          if (classText(n).indexOf("flowItem") >= 0) return n;
          n = n.parentElement;
        }
        return null;
      }
      function looksLikeCodingChatter(el) {
        var text = String(el && (el.innerText || el.textContent) || "").slice(0, 800);
        if (/zr_cchat_|写码仍在进行|Deep diving|Tool call|上下文注入/.test(text)) return true;
        if (/^\s*Think\b/.test(text)) return true;
        return false;
      }
      function scan() {
        var lives = document.querySelectorAll(
          ".wb-cd-think.is-live, .wb-cd-dot-live, .wb-cd-spin"
        );
        var rows = [];
        for (var i = 0; i < lives.length; i++) {
          var row = rowOf(lives[i]);
          if (row && rows.indexOf(row) < 0) rows.push(row);
        }
        var statuses = document.querySelectorAll("[class*='turnStatus']");
        for (var s = 0; s < statuses.length; s++) {
          if (isComposer(statuses[s])) continue;
          statuses[s].removeAttribute(ATTR);
        }
        for (var r = 0; r < rows.length; r++) {
          var sib = rows[r].nextElementSibling;
          while (sib) {
            if (isComposer(sib) || isRunningCoding(sib)) break;
            if (sib.querySelector && sib.querySelector("[data-composer-seat],[data-composer-card]")) {
              break;
            }
            if (looksLikeCodingChatter(sib)) sib.setAttribute(ATTR, "1");
            sib = sib.nextElementSibling;
          }
        }
      }
      scan();
      var scheduled = false;
      var obs = typeof MutationObserver !== "undefined" ? new MutationObserver(function() {
        if (scheduled || stopped) return;
        scheduled = true;
        setTimeout(function() {
          scheduled = false;
          if (!stopped) scan();
        }, 80);
      }) : null;
      if (obs && document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      }
      return function() {
        stopped = true;
        if (obs) obs.disconnect();
      };
    }
    function markSidebarRootForPluginOrder() {
      if (typeof document === "undefined") return function() {
      };
      var stopped = false;
      function scan() {
        var feet = document.querySelectorAll("[class*='footArea']");
        for (var i = 0; i < feet.length; i++) {
          var root = feet[i].parentElement;
          if (!root || !root.querySelector("[class*='regionArea']")) continue;
          if (root.getAttribute("data-wb-sidebar-root") !== "1") {
            root.setAttribute("data-wb-sidebar-root", "1");
          }
        }
      }
      scan();
      var scheduled = false;
      var obs = typeof MutationObserver !== "undefined" ? new MutationObserver(function() {
        if (scheduled || stopped) return;
        scheduled = true;
        setTimeout(function() {
          scheduled = false;
          if (!stopped) scan();
        }, 120);
      }) : null;
      if (obs && document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true });
      }
      return function() {
        stopped = true;
        if (obs) obs.disconnect();
      };
    }
    function hideOfficialAccountMore() {
      if (typeof document === "undefined") return function() {
      };
      var stopped = false;
      function isOfficialSettingsText(text) {
        var compact = String(text || "").replace(/\s+/g, "");
        return (compact.indexOf("\u8BBE\u7F6E") === 0 || compact.indexOf("Settings") === 0) && (compact.indexOf("Ctrl") >= 0 || compact.indexOf("Alt") >= 0 || compact.indexOf(",") >= 0);
      }
      function isOfficialDropText(text) {
        return text === "\u610F\u89C1\u53CD\u9988" || text === "Feedback" || text === "\u767B\u5F55" || text === "Sign in";
      }
      function markLauncher() {
        var buttons = document.querySelectorAll("button[aria-haspopup='menu']");
        for (var i = 0; i < buttons.length; i++) {
          var btn = buttons[i];
          var label = btn.getAttribute("aria-label") || "";
          if (label !== "\u8D26\u53F7\u83DC\u5355" && label !== "Account menu") continue;
          if (btn.closest && btn.closest(".wb-sidebar-account, [data-composer-seat], [data-composer-card]")) {
            continue;
          }
          var node = btn;
          var parent = btn.parentElement;
          while (parent && parent !== document.body && parent !== document.documentElement) {
            if (parent.matches && parent.matches(".wb-sidebar-account, [data-composer-seat], [data-composer-card]")) {
              break;
            }
            var inner = parent.querySelectorAll("button");
            var extra = 0;
            for (var b = 0; b < inner.length; b++) {
              if (inner[b] !== btn && !btn.contains(inner[b])) extra += 1;
            }
            if (extra > 0) break;
            node = parent;
            parent = parent.parentElement;
          }
          if (node.getAttribute("data-wb-hide-official-more") !== "1") {
            node.setAttribute("data-wb-hide-official-more", "1");
          }
        }
      }
      function markMenu() {
        var menus = document.querySelectorAll("[role='menu']");
        for (var i = 0; i < menus.length; i++) {
          var menu = menus[i];
          if (menu.classList && menu.classList.contains("wb-account-menu")) continue;
          if (menu.closest && menu.closest(".wb-header-logout, .wb-sidebar-account")) continue;
          var items = menu.querySelectorAll("[role='menuitem']");
          var official = false;
          for (var j = 0; j < items.length; j++) {
            var text = String(items[j].textContent || "").replace(/\s+/g, " ").trim();
            if (isOfficialSettingsText(text)) official = true;
            if (isOfficialDropText(text) && items[j].getAttribute("data-wb-official-drop") !== "1") {
              items[j].setAttribute("data-wb-official-drop", "1");
            }
          }
          if (official && menu.getAttribute("data-wb-official-account-menu") !== "1") {
            menu.setAttribute("data-wb-official-account-menu", "1");
          }
        }
      }
      function scan() {
        markLauncher();
        markMenu();
      }
      scan();
      var obs = typeof MutationObserver !== "undefined" ? new MutationObserver(function() {
        if (stopped) return;
        scan();
      }) : null;
      if (obs && document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true });
      }
      return function() {
        stopped = true;
        if (obs) obs.disconnect();
      };
    }
    function renameCompanyAutomationLauncher() {
      if (typeof document === "undefined") return function() {
      };
      var stopped = false;
      function scan() {
        var roots = document.querySelectorAll(".za-launcher");
        for (var i = 0; i < roots.length; i++) {
          var root = roots[i];
          if (root.getAttribute("aria-label") === "\u81EA\u52A8\u5316\u5165\u53E3") {
            root.setAttribute("aria-label", "\u5B9A\u65F6\u4EFB\u52A1\u5165\u53E3");
          }
          var btn = root.querySelector(".za-trigger");
          if (!btn) continue;
          if (btn.getAttribute("aria-label") === "\u6253\u5F00\u81EA\u52A8\u5316") {
            btn.setAttribute("aria-label", "\u6253\u5F00\u5B9A\u65F6\u4EFB\u52A1");
          }
          if (btn.getAttribute("title") === "\u81EA\u52A8\u5316") {
            btn.setAttribute("title", "\u5B9A\u65F6\u4EFB\u52A1");
          }
          var spans = btn.querySelectorAll("span");
          for (var s = 0; s < spans.length; s++) {
            if (String(spans[s].textContent || "").trim() === "\u81EA\u52A8\u5316") {
              spans[s].textContent = "\u5B9A\u65F6\u4EFB\u52A1";
            }
          }
        }
      }
      scan();
      var obs = typeof MutationObserver !== "undefined" ? new MutationObserver(function() {
        if (stopped) return;
        scan();
      }) : null;
      if (obs && document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true });
      }
      return function() {
        stopped = true;
        if (obs) obs.disconnect();
      };
    }
    function installCommandMenuZhPatch() {
      if (typeof document === "undefined") return function() {
      };
      var CMD_DESC_ZH = {
        "Compact older conversation history": "\u538B\u7F29\u8F83\u65E9\u7684\u5BF9\u8BDD\u5386\u53F2",
        "Download this Session log as a ZIP archive": "\u5C06\u4F1A\u8BDD\u65E5\u5FD7\u4E0B\u8F7D\u4E3A ZIP \u538B\u7F29\u5305",
        "record feedback about this session": "\u8BB0\u5F55\u5BF9\u672C\u4F1A\u8BDD\u7684\u53CD\u9988",
        "set or view the goal for a long-running task": "\u8BBE\u7F6E\u6216\u67E5\u770B\u957F\u4EFB\u52A1\u7684\u8FD0\u884C\u76EE\u6807",
        "Switch the permission preset (sandbox mode + approval policy)": "\u5207\u6362\u6743\u9650\u9884\u8BBE\uFF08\u6C99\u7BB1\u6A21\u5F0F\u4E0E\u5BA1\u6279\u7B56\u7565\uFF09",
        "Enter or leave plan mode": "\u8FDB\u5165\u6216\u9000\u51FA\u89C4\u5212\u6A21\u5F0F"
      };
      var CMD_NAME_ZH = {
        compact: "\u538B\u7F29",
        export: "\u5BFC\u51FA",
        feedback: "\u53CD\u9988",
        goal: "\u76EE\u6807",
        permission: "\u6743\u9650",
        plan: "\u89C4\u5212",
        model: "\u6A21\u578B"
      };
      var PERM_PRESET_ZH = {
        "Read Only": "\u53EA\u8BFB",
        "Workspace Write": "\u5DE5\u4F5C\u533A\u5199\u5165",
        "Full access": "\u5B8C\u5168\u8BBF\u95EE"
      };
      function patchPermTextNode(node) {
        if (!node || node.nodeType !== 3) return;
        var t = (node.textContent || "").trim();
        if (PERM_PRESET_ZH[t] && node.textContent !== PERM_PRESET_ZH[t]) {
          node.textContent = PERM_PRESET_ZH[t];
        }
      }
      function scanPermLabels(root) {
        if (!root || typeof document === "undefined") return;
        var walker = document.createTreeWalker(
          root,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        var nodes = [];
        var n;
        while (n = walker.nextNode()) nodes.push(n);
        for (var i = 0; i < nodes.length; i++) patchPermTextNode(nodes[i]);
      }
      var stopped = false;
      function scan() {
        var descs = document.querySelectorAll("[class*='itemDescription']");
        for (var i = 0; i < descs.length; i++) {
          var d = descs[i];
          var raw = (d.textContent || "").trim();
          var zh = CMD_DESC_ZH[raw];
          if (zh && d.textContent !== zh) d.textContent = zh;
        }
        var names = document.querySelectorAll("[class*='itemName']");
        for (var j = 0; j < names.length; j++) {
          var n = names[j];
          var key = (n.textContent || "").trim().toLowerCase();
          var label = CMD_NAME_ZH[key];
          if (label && n.textContent !== label) n.textContent = label;
        }
        scanPermLabels(document.body);
      }
      scan();
      var scheduled = false;
      var obs = typeof MutationObserver !== "undefined" ? new MutationObserver(function() {
        if (scheduled || stopped) return;
        scheduled = true;
        setTimeout(function() {
          scheduled = false;
          if (!stopped) scan();
        }, 80);
      }) : null;
      if (obs && document.documentElement) {
        obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      }
      return function() {
        stopped = true;
        if (obs) obs.disconnect();
      };
    }
    try {
      ctx2.slots.inject("sidebar.brand.mark", function() {
        return ctx2.slots.register(
          {
            name: "sidebar.brand.mark",
            id: "workbuddy-brand-mark",
            order: 0,
            priority: 100
          },
          WorkBuddyBrandMark
        );
      });
    } catch (eMark) {
      console.warn("[dsh-mes-bridge] sidebar.brand.mark \u4E0D\u53EF\u7528", eMark);
    }
    try {
      ctx2.slots.inject("conversation.hero.brand.mark", function() {
        return ctx2.slots.register(
          {
            name: "conversation.hero.brand.mark",
            id: "workbuddy-hero-brand-mark",
            order: 0,
            priority: 100
          },
          WorkBuddyBrandMark
        );
      });
    } catch (eHeroMark) {
      console.warn("[dsh-mes-bridge] conversation.hero.brand.mark \u4E0D\u53EF\u7528", eHeroMark);
    }
    try {
      ctx2.slots.inject("sidebar.brand.name", function() {
        return ctx2.slots.register(
          {
            name: "sidebar.brand.name",
            id: "workbuddy-brand-name",
            order: 0,
            priority: 100
          },
          WorkBuddyBrandName
        );
      });
    } catch (eBrand) {
      console.warn("[dsh-mes-bridge] sidebar.brand.name \u4E0D\u53EF\u7528", eBrand);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return installZhongruanBrandPatch();
        }, "workbuddy-brand-name-dom");
      } else {
        installZhongruanBrandPatch();
      }
    } catch (eBrandDom) {
      console.warn("[dsh-mes-bridge] \u54C1\u724C DOM \u8865\u4E01\u5931\u8D25", eBrandDom);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return pinRunningCodingCard();
        }, "workbuddy-pin-coding-card");
      } else {
        pinRunningCodingCard();
      }
    } catch (ePin) {
      console.warn("[dsh-mes-bridge] \u5199\u7801\u8FDB\u5EA6\u5361\u6536\u8D77\u4E0B\u65B9\u8FC7\u7A0B\u5931\u8D25", ePin);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return markSidebarRootForPluginOrder();
        }, "workbuddy-sidebar-plugin-order");
      } else {
        markSidebarRootForPluginOrder();
      }
    } catch (eDock) {
      console.warn("[dsh-mes-bridge] \u4FA7\u680F\u63D2\u4EF6\u5165\u53E3\u4E0A\u79FB\u5931\u8D25", eDock);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return hideOfficialAccountMore();
        }, "workbuddy-hide-official-more");
      } else {
        hideOfficialAccountMore();
      }
    } catch (eOfficialMore) {
      console.warn("[dsh-mes-bridge] \u6536\u8D77\u5B98\u65B9\u66F4\u591A\u83DC\u5355\u5931\u8D25", eOfficialMore);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return renameCompanyAutomationLauncher();
        }, "workbuddy-rename-company-automation");
      } else {
        renameCompanyAutomationLauncher();
      }
    } catch (eZaRename) {
      console.warn("[dsh-mes-bridge] \u4FA7\u680F\u5B9A\u65F6\u4EFB\u52A1\u6539\u540D\u5931\u8D25", eZaRename);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return hideWorkbuddyConversationViewTabs();
        }, "workbuddy-hide-view-tabs");
      } else {
        hideWorkbuddyConversationViewTabs();
      }
    } catch (eHideTabs) {
      console.warn("[dsh-mes-bridge] \u4F1A\u8BDD\u9876\u90E8\u6807\u7B7E\u9690\u85CF\u5931\u8D25", eHideTabs);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return installCommandMenuZhPatch();
        }, "workbuddy-command-menu-zh");
      } else {
        installCommandMenuZhPatch();
      }
    } catch (eCmdZh) {
      console.warn("[dsh-mes-bridge] \u547D\u4EE4\u83DC\u5355\u6C49\u5316\u5931\u8D25", eCmdZh);
    }
    try {
      if (typeof registerIntegratedFlowComposerSlots === "function") {
        registerIntegratedFlowComposerSlots(ctx2);
      }
    } catch (eDpDock) {
      console.warn("[dsh-mes-bridge] \u4E00\u4F53\u5316 composer \u69FD\u4F4D\u6CE8\u518C\u5931\u8D25", eDpDock);
    }
    try {
      if (typeof ctx2.installVisionChatThumbnails === "function") {
        ctx2.installVisionChatThumbnails();
      }
    } catch (eVisionThumbs) {
      console.warn("[dsh-mes-bridge] \u9644\u56FE\u9884\u89C8\u589E\u5F3A\u5931\u8D25", eVisionThumbs);
    }
    try {
      ctx2.slots.inject("shell.overlay", function() {
        var regs = [
          ctx2.slots.register(
            {
              name: "shell.overlay",
              id: "workbuddy-login",
              order: 1,
              priority: 1
            },
            WorkBuddyAppLoginGate
          )
        ];
        if (typeof WorkBuddyMainViewOverlay === "function") {
          regs.push(
            ctx2.slots.register(
              {
                name: "shell.overlay",
                id: "workbuddy-main-views",
                order: 2
              },
              WorkBuddyMainViewOverlay
            )
          );
        }
        return regs;
      });
    } catch (eOverlay) {
      console.warn("[dsh-mes-bridge] shell.overlay \u4E0D\u53EF\u7528\uFF0C\u4EC5\u7528 DOM \u767B\u5F55\u6321\u677F", eOverlay);
    }
    try {
      ctx2.slots.inject("conversation.session.header.utilities", function() {
        var chatStore = borrowChatStore(ctx2.slots);
        var regs = [
          ctx2.slots.register(
            {
              name: "conversation.session.header.utilities",
              id: "workbuddy-session-switch-guard",
              order: 0,
              store: chatStore || void 0
            },
            WorkBuddySessionSwitchGuard
          )
        ];
        return regs;
      });
    } catch (eHeader) {
      console.warn("[dsh-mes-bridge] header.utilities \u4E0D\u53EF\u7528", eHeader);
    }
    var dockedPanels = typeof wbSupportsDockedPanels === "function" ? !!wbSupportsDockedPanels(ctx2) : false;
    if (dockedPanels) {
      try {
        ctx2.slots.inject("main", function() {
          var regs = [];
          if (typeof WorkBuddyLibraryMain === "function") {
            regs.push(
              ctx2.slots.register({ name: "main", key: "workbuddy-library" }, WorkBuddyLibraryMain)
            );
          }
          if (typeof WorkBuddyUsageMain === "function") {
            regs.push(
              ctx2.slots.register({ name: "main", key: "workbuddy-usage" }, WorkBuddyUsageMain)
            );
          }
          return regs;
        });
        ctx2.slots.inject("sidebar.panellist", function() {
          var regs = [];
          if (typeof WorkBuddyLibraryPanelIcon === "function") {
            regs.push(
              ctx2.slots.register(
                {
                  name: "sidebar.panellist",
                  id: "workbuddy-library",
                  order: 80,
                  label: function() {
                    return "\u8D44\u6599\u5E93";
                  }
                },
                WorkBuddyLibraryPanelIcon
              )
            );
          }
          if (typeof WorkBuddyUsagePanelIcon === "function") {
            regs.push(
              ctx2.slots.register(
                {
                  name: "sidebar.panellist",
                  id: "workbuddy-usage",
                  order: 90,
                  label: function() {
                    return "\u7528\u91CF";
                  }
                },
                WorkBuddyUsagePanelIcon
              )
            );
          }
          return regs;
        });
      } catch (ePanel) {
        console.warn("[dsh-mes-bridge] sidebar.panellist \u8D44\u6599\u5E93/\u7528\u91CF\u4E0D\u53EF\u7528", ePanel);
        dockedPanels = false;
      }
    }
    try {
      ctx2.slots.inject("sidebar.footer.action", function() {
        var regs = [];
        if (!dockedPanels && typeof WorkBuddySidebarViewsNav === "function") {
          regs.push(
            ctx2.slots.register(
              {
                name: "sidebar.footer.action",
                id: "workbuddy-sidebar-views",
                order: 600,
                label: "\u8D44\u6599\u5E93\u4E0E\u7528\u91CF"
              },
              WorkBuddySidebarViewsNav
            )
          );
        }
        regs.push(
          ctx2.slots.register(
            {
              name: "sidebar.footer.action",
              id: "workbuddy-account",
              order: 1e3,
              label: "\u8D26\u53F7"
            },
            WorkBuddyHeaderLogout
          )
        );
        return regs;
      });
    } catch (eAccount) {
      console.warn("[dsh-mes-bridge] sidebar.footer.action \u4E0D\u53EF\u7528", eAccount);
    }
    try {
      if (typeof ctx2.effect === "function") {
        ctx2.effect(function() {
          return installWorkBuddySessionSwitchWatcher(ctx2);
        }, "workbuddy-session-switch-watcher");
      } else {
        installWorkBuddySessionSwitchWatcher(ctx2);
      }
    } catch (eWatch) {
      console.warn("[dsh-mes-bridge] session-switch watcher \u5B89\u88C5\u5931\u8D25", eWatch);
    }
    try {
      if (typeof installProjectProfileWatcher === "function") {
        if (typeof ctx2.effect === "function") {
          ctx2.effect(function() {
            return installProjectProfileWatcher(ctx2);
          }, "workbuddy-project-profile-watcher");
        } else {
          installProjectProfileWatcher(ctx2);
        }
      }
    } catch (eProfile) {
      console.warn("[dsh-mes-bridge] \u9879\u76EE\u753B\u50CF\u76D1\u542C\u5B89\u88C5\u5931\u8D25", eProfile);
    }
    try {
      var handoff = typeof ctx2.installWorkbuddyPluginWorkspaceHandoff === "function" ? ctx2.installWorkbuddyPluginWorkspaceHandoff : null;
      if (handoff) {
        if (typeof ctx2.effect === "function") {
          ctx2.effect(function() {
            return handoff(ctx2);
          }, "workbuddy-plugin-workspace-handoff");
        } else {
          handoff(ctx2);
        }
      }
    } catch (eHandoff) {
      console.warn("[dsh-mes-bridge] \u8D44\u6599\u5E93/\u7528\u91CF \u2194 \u63D2\u4EF6\u5DE5\u4F5C\u533A\u4E92\u65A5\u5931\u8D25", eHandoff);
    }
    ctx2.slots.inject("settings.section", function() {
      return ctx2.slots.register(
        {
          name: "settings.section",
          id: "workbuddy",
          order: 5,
          label: "\u5DE5\u4F5C\u52A9\u624B"
        },
        WorkBuddySettingsSection
      );
    });
    try {
      hideHostSettingsDupes();
    } catch (eHide) {
      console.warn("[dsh-mes-bridge] hideHostSettingsDupes", eHide);
    }
    try {
      ctx2.slots.inject("conversation.view", function() {
        var regs = [];
        if (typeof WorkBuddySpaceView === "function") {
          regs.push(
            ctx2.slots.register(
              {
                name: "conversation.view",
                id: "workbuddy-library",
                order: 15,
                label: "\u8D44\u6599\u5E93"
              },
              WorkBuddySpaceView
            )
          );
        } else {
          console.warn("[dsh-mes-bridge] WorkBuddySpaceView \u672A\u5C31\u7EEA\uFF0C\u8DF3\u8FC7\u8D44\u6599\u5E93\u9875\u7B7E");
        }
        if (typeof WorkBuddyUsageView === "function") {
          regs.push(
            ctx2.slots.register(
              {
                name: "conversation.view",
                id: "workbuddy-usage",
                order: 20,
                label: "\u7528\u91CF"
              },
              WorkBuddyUsageView
            )
          );
        } else {
          console.warn("[dsh-mes-bridge] WorkBuddyUsageView \u672A\u5C31\u7EEA\uFF0C\u8DF3\u8FC7\u7528\u91CF\u9875\u7B7E");
        }
        return regs;
      });
    } catch (eViews) {
      console.warn("[dsh-mes-bridge] conversation.view \u8D44\u6599\u5E93/\u7528\u91CF\u9875\u4E0D\u53EF\u7528", eViews);
    }
    ctx2.slots.inject("tool.call.toolview", function() {
      return ctx2.slots.register(
        { name: "tool.call.toolview", key: "mes_code_review_begin" },
        CodeReviewBeginCard
      );
    });
    ctx2.slots.inject("tool.call.toolview", function() {
      return ctx2.slots.register(
        { name: "tool.call.toolview", key: "mes_code_commit_begin" },
        CodeCommitBeginCard
      );
    });
    ctx2.slots.inject("tool.call.toolview", function() {
      return ctx2.slots.register(
        { name: "tool.call.toolview", key: "mes_code_dev_begin" },
        CodeDevBeginCard
      );
    });
    ctx2.slots.inject("tool.call.toolview", function() {
      return ctx2.slots.register(
        { name: "tool.call.toolview", key: "mes_code_deploy_begin" },
        CodeDeployConfirmCard
      );
    });
    ctx2.slots.inject("tool.call.toolview", function() {
      return ctx2.slots.register(
        { name: "tool.call.toolview", key: "mes_code_deploy_prepare" },
        CodeDeployConfirmCard
      );
    });
    ctx2.slots.inject("tool.call.toolview", function() {
      return ctx2.slots.register(
        { name: "tool.call.toolview", key: "mes_code_deploy_confirm" },
        CodeDeployConfirmCard
      );
    });
    if (typeof DevPipelineTimelineCard === "function") {
      ctx2.slots.inject("tool.call.toolview", function() {
        return ctx2.slots.register(
          { name: "tool.call.toolview", key: "mes_dev_pipeline_begin" },
          DevPipelineTimelineCard
        );
      });
    }
    console.log(
      "[dsh-mes-bridge] app-login-gate + settings.section=WorkBuddy + conversation.view=\u8D44\u6599\u5E93/\u7528\u91CF + toolview review/commit/code_dev/deploy/dev_pipeline"
    );
  }
  try {
    ensureLoginGateMounted();
  } catch (eEager) {
    console.error("[dsh-mes-bridge] \u767B\u5F55\u6321\u677F\u9884\u6302\u8F7D\u5931\u8D25", eEager);
  }
  ctx.apply = apply;
}

// client-src/entry.js
function createBridgeModule(require2) {
  var ctx = createCtx(require2);
  installPreamble(ctx);
  installCss(ctx);
  installSharedHelpers(ctx);
  installCodeReview(ctx);
  installCodeCommit(ctx);
  installCodeDev(ctx);
  installCodeDeploy(ctx);
  installDevPipeline(ctx);
  installSettings(ctx);
  installUsageHelpers(ctx);
  installLogin(ctx);
  installUsageSection(ctx);
  installSpace(ctx);
  installProjectProfile(ctx);
  installUsageView(ctx);
  installLoginMount(ctx);
  installApply(ctx);
  return { inject: ["slots", "layout"], apply: ctx.apply };
}

    var __wbFactory =
      (exports && exports.createBridgeModule) ||
      (module.exports && module.exports.createBridgeModule);
    if (typeof __wbFactory !== "function") {
      throw new Error("[dsh-mes-bridge] createBridgeModule missing after bundle");
    }
    module.exports = __wbFactory(require);
    return module.exports;
  },
});
