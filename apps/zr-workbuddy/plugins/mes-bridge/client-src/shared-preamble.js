export function installPreamble(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect,
      useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;

/**
 * 远程访问时把 http://127.0.0.1:<port>/<path> 改写成 /proxy/<port>/<path>，
 * 由 nginx 通配代理转发到服务器本机端口。
 * 本机桌面（hostname 是 localhost/127.0.0.1）不改写，127.0.0.1 直通。
 * 覆盖所有 @zhongruan/* 插件（dsh-esc:18786 / dsh-automations:18789 / …），
 * 无需逐个配 nginx location。
 */
function installLoopbackProxy() {
  try {
    var loc = window.location || {};
    var host = String(loc.hostname || "");
    var isLocal = host === "127.0.0.1" || host === "localhost" || host === "0.0.0.0" || host === "";
    if (isLocal) return; /* 本机：不改写，127.0.0.1 直通 */
    if (window.__WB_LOOPBACK_PROXY__) return; /* 防重复 */
    window.__WB_LOOPBACK_PROXY__ = true;
    var of = window.fetch;
    window.fetch = function (u, o) {
      try {
        if (typeof u === "string" && u.indexOf("http://127.0.0.1:") === 0) {
          var rest = u.slice("http://127.0.0.1:".length);
          var slash = rest.indexOf("/");
          var port = slash === -1 ? rest : rest.slice(0, slash);
          var path = slash === -1 ? "/" : rest.slice(slash);
          if (/^\d+$/.test(port)) u = "/proxy/" + port + path;
        }
      } catch (e) {}
      return of.call(window, u, o || {});
    };
  } catch (e) {}
}
installLoopbackProxy();

/**
 * 对话写码默认口 18789 与 dsh-automations 冲突 → 确认卡拉不到 confirm_token。
 * WorkBuddy 侧把浏览器 localStorage 钉到专用口 18791（与引擎 sync 写入的 config 一致）。
 */
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
  } catch (eAlign) {}
}
alignCursorChatServicePort();

var _engineResolved = null;

/** 引擎只绑回环：拒绝 localStorage / 配置把登录请求打到外网。 */
function sanitizeEngineHost(host) {
  var h = String(host || "").trim().toLowerCase();
  if (!h || h === "localhost" || h === "127.0.0.1" || h === "::1") {
    return h === "localhost" ? "localhost" : "127.0.0.1";
  }
  return "127.0.0.1";
}

function markEngineResolved(host, port) {
  var h = sanitizeEngineHost(host);
  var p = String(port == null ? "" : port).trim();
  if (!/^\d+$/.test(p) || Number(p) <= 0) return;
  // 桌面一体包引擎口由主进程 argv 钉死；禁止探测把 UI 锁到开发壳 :8000（资料库/用量会 401 清会话）
  try {
    var desk = desktopEngine();
    if (desk && desk.port && String(p) !== String(desk.port)) {
      h = desk.host;
      p = String(desk.port);
    }
  } catch (eDesk) {}
  _engineResolved = { host: h, port: p };
  try {
    localStorage.setItem("dsh-mes-engine-host", h);
    localStorage.setItem("dsh-mes-engine-port", p);
  } catch (e0) {}
  try {
    window.__APP_ENGINE__ = Object.assign({}, window.__APP_ENGINE__ || {}, { host: h, port: Number(p) });
  } catch (e1) {}
}

function isDesktopShell() {
  try {
    return !!(typeof window !== "undefined" && window.workbuddyDesktop);
  } catch (eDs) {
    return false;
  }
}

/**
 * 桌面一体包引擎口。冷启窗口时 argv 可能仍是 port=0，须回落 __APP_ENGINE__/localStorage/18000。
 * 只要在桌面壳内就不得返回 null（否则候选口会掺进开发壳 :8000 → 资料库 401 退登）。
 */
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
    } catch (eLs) {}
    // 桌面默认口；禁止再回落 null 去探测 :8000
    return { host: "127.0.0.1", port: "18000" };
  } catch (e) {
    return isDesktopShell() ? { host: "127.0.0.1", port: "18000" } : null;
  }
}

function isPublicWebEntry() {
  /* 公网一体入口（如 https://主机:8093/ → 3081 壳）：禁止再打用户本机 :8000 */
  try {
    var loc = window.location || {};
    var pageHost = String(loc.hostname || "");
    return !!(pageHost && !isLoopbackOrPrivateHost(pageHost));
  } catch (ePub) {
    return false;
  }
}

function isBrowserDevShell() {
  /* 浏览器本机 :3081 开发壳 ≠ 桌面一体包（后者有 workbuddyDesktop，引擎默认 18000）
   * 公网入口也不是「开发壳」——登录须走同源 /api（经 nginx）。 */
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
  /* 桌面壳：只认一体包引擎口 + 18000，绝对禁止掺 :8000（jwt_secret 不同 → 资料库一开就退登） */
  if (isDesktopShell()) {
    var dDesk = desktopEngine();
    if (dDesk) add(dDesk.port);
    add(18000);
    return out;
  }
  /* 浏览器开发壳：永远优先 8000。桌面旧引擎常占 18000 且 /api/runtime 也 200，
   * 但没有合并后的 /api/dev-pipeline → 一体化开关 alert「Not Found」。 */
  if (isBrowserDevShell()) {
    add(8000);
    if (_engineResolved && String(_engineResolved.port) !== "18000") add(_engineResolved.port);
    try {
      var ls = localStorage.getItem("dsh-mes-engine-port");
      if (ls && ls !== "18000") add(ls);
    } catch (e2) {}
    var cfgB = window.__APP_ENGINE__ || {};
    if (String(cfgB.port || "") !== "18000") add(cfgB.port);
    add(18000); /* 仅当 8000 全挂时才兜底 */
    return out;
  }
  if (_engineResolved) add(_engineResolved.port);
  try {
    add(localStorage.getItem("dsh-mes-engine-port"));
  } catch (e2b) {}
  var cfg = window.__APP_ENGINE__ || {};
  add(cfg.port);
  add(18000);
  add(8000);
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
  /* 旧桌面引擎对合并后的 API 一律 404；探活路径本身 404 也换口 */
  return (
    p.indexOf("/api/dev-pipeline") === 0 ||
    p.indexOf("/api/vision") === 0 ||
    p.indexOf("/api/workbuddy") === 0 ||
    p === "/api/runtime" ||
    p.indexOf("/api/auth/") === 0
  );
}

/** 本机多端口探测（8000 / 18000）；公网入口走 /workbuddy/api（勿占 DSH 的 /api）。 */
function publicEngineBase() {
  var cfg = window.__APP_ENGINE__ || {};
  if (cfg.webBase) return String(cfg.webBase).replace(/\/$/, "");
  return String((window.location && window.location.origin) || "").replace(/\/$/, "") + "/workbuddy";
}

function fetchEngineApi(path, opts) {
  var o = opts || {};
  if (isPublicWebEntry()) {
    return fetch(publicEngineBase() + path, o);
  }
  var host = engineHost();
  var ports = enginePortCandidates();
  /* 桌面冷启：界面已开、引擎仍在后台预热。网络失败 / 502–504 时等待重试，不立刻报错打断流程。 */
  var desktopWaitMs = isDesktopShell() ? 120000 : 0;
  var waitStarted = Date.now();
  var waitRound = 0;
  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }
  function canWaitMore() {
    return desktopWaitMs > 0 && Date.now() - waitStarted < desktopWaitMs;
  }
  function waitThenRetry() {
    waitRound += 1;
    var delay = Math.min(800, 200 + waitRound * 40);
    return sleep(delay).then(function () {
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
    return fetch(url, o)
      .then(function (r) {
        if (shouldTryNextEnginePort(r, path, i, ports.length)) return attempt(i + 1);
        if (isEngineWarmingStatus(r.status)) {
          if (i + 1 < ports.length) return attempt(i + 1);
          if (canWaitMore()) return waitThenRetry();
        }
        markEngineResolved(host, port);
        return r;
      })
      .catch(function (err) {
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
  } catch (e) {}
  var cfg = window.__APP_ENGINE__ || {};
  return sanitizeEngineHost(cfg.host || "127.0.0.1");
}
function enginePort() {
  var d = desktopEngine();
  if (d) return d.port;
  /* 浏览器开发壳：不要被桌面 18000 / 错误 localStorage 锁死 */
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
    } catch (eClr) {}
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
  } catch (e) {}
  if (/^\d+$/.test(cfgPort) && Number(cfgPort) > 0) return cfgPort;
  return "8000";
}
function isLoopbackOrPrivateHost(host) {
  var h = String(host || "").toLowerCase();
  if (!h || h === "localhost" || h === "0.0.0.0") return true;
  if (h === "127.0.0.1" || h === "::1") return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}
function engineBase() {
  var cfg = window.__APP_ENGINE__ || {};
  if (cfg.webBase) return String(cfg.webBase).replace(/\/$/, "");
  /* 公网：/workbuddy = 引擎；/ 与 /api/* = DSH 聊天壳，不可混用 */
  if (isPublicWebEntry()) {
    return publicEngineBase();
  }
  /* 桌面：永远跟主进程引擎口，禁止被 _engineResolved / localStorage 拐到 :8000 */
  var desk = desktopEngine();
  if (desk) return "http://" + desk.host + ":" + desk.port;
  if (isBrowserDevShell()) {
    /* 勿让已错误解析的 18000 继续主导 EventSource / 直链 */
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
      return "无法连接引擎（:18000 / :8000 均无响应）。请完全退出后重新打开「江西中软」，或确认托盘里引擎已启动。";
    }
    return "无法连接引擎（:8000 / :18000 均无响应）。请先执行：scripts/engine.sh zr-workbuddy ensure";
  }
  return msg || "登录失败";
}

/** 与引擎 SPA / simplified 对齐的本机会话（:3081 与 :8000 localStorage 不同源，各存一份） */
var AUTH_LS_KEY = "mes_auth_session";
var AUTH_ENTERPRISES = [
  { key: "jsry", label: "江苏软云", code: "" },
  { key: "jxzr", label: "江西中软", code: "" },
  { key: "qhzr", label: "前海中软", code: "" },
];
var AUTH_EVENT = "wb-auth-changed";

function readAuthSession() {
  try {
    var raw = localStorage.getItem(AUTH_LS_KEY);
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || !data.access_token) return null;
    if (data.expires_at && Date.now() / 1000 > Number(data.expires_at) - 30) {
      try {
        localStorage.removeItem(AUTH_LS_KEY);
      } catch (e0) {}
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
  } catch (e2) {}
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT));
  } catch (e3) {}
}
function authHeaders(extra) {
  var headers = Object.assign({}, extra || {});
  var s = readAuthSession();
  if (s && s.access_token) headers.Authorization = "Bearer " + s.access_token;
  return headers;
}
/**
 * 资料库/用量偶发打错引擎口会 401；禁止立刻清会话。
 * 仅当 /api/auth/me 确认未登录才 writeAuthSession(null)。网络抖动不注销。
 * @returns {Promise<boolean>} true=已确认失效并清除
 */
function confirmAuthExpiredAndClear() {
  if (!readAuthSession()) return Promise.resolve(true);
  return fetchEngineApi("/api/auth/me", { headers: authHeaders() })
    .then(function (r) {
      return r.text().then(function (t) {
        var d = null;
        try {
          d = t ? JSON.parse(t) : null;
        } catch (eParse) {
          d = null;
        }
        return { status: r.status, d: d };
      });
    })
    .then(function (pack) {
      var d = pack.d || {};
      if (d && d.ok && d.authenticated && d.user) {
        return false;
      }
      // 引擎明确说未登录 / token 无效才清；非 JSON 或 5xx 不当退登
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
    })
    .catch(function () {
      return false;
    });
}
function notifyAuthChanged() {
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT));
  } catch (e4) {}
}
function doAppLogout() {
  return fetchEngineApi("/api/auth/logout", {
    method: "POST",
    headers: authHeaders(),
  })
    .catch(function () {})
    .then(function () {
      writeAuthSession(null);
    });
}

/** 公网入口文案：引擎与浏览器不同机，不能选用户电脑磁盘。 */
function workspaceDirFieldLabel() {
  if (typeof window !== "undefined" && window.workbuddyDesktop) return "本机工程目录";
  if (isPublicWebEntry()) return "工程目录（服务器）";
  return "本机工程目录";
}

function workspaceDirFieldHint() {
  if (typeof window !== "undefined" && window.workbuddyDesktop) return "";
  if (!isPublicWebEntry()) return "";
  return "公网入口的引擎跑在服务器上：路径必须是服务器磁盘上的目录。要选你电脑里的工程，请用桌面版或本机打开 http://127.0.0.1:3081 。";
}

var REMOTE_ENGINE_NO_LOCAL_PICK =
  "当前是公网入口，引擎在服务器上运行：「浏览」不能打开你电脑上的文件夹（只会落到服务器磁盘）。" +
  "请在输入框填写服务器上的工程绝对路径；要选本机工程请用 ZR WorkBuddy 桌面版，或在本机打开 http://127.0.0.1:3081 。";

/** 一体包走 Electron 原生选目录，避免 osascript→Finder 报 -1743。 */
function pickLocalFolder(prompt, signal) {
  var p = prompt || "选择工程目录";
  try {
    var desk = typeof window !== "undefined" ? window.workbuddyDesktop : null;
    if (desk && typeof desk.pickFolder === "function") {
      return Promise.resolve(desk.pickFolder(p)).then(function (d) {
        if (d && typeof d === "object") return d;
        return { ok: false, path: "", error: "选文件夹失败" };
      });
    }
  } catch (e0) {}
  /* 公网浏览器 → 远端引擎：禁止调 /api/pick-folder（对话框出在服务器上，极易误当成「选本机」） */
  if (isPublicWebEntry()) {
    return Promise.resolve({
      ok: false,
      path: "",
      code: "remote_engine_no_local_pick",
      error: REMOTE_ENGINE_NO_LOCAL_PICK,
    });
  }
  return fetch(engineBase() + "/api/pick-folder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: p }),
    signal: signal,
  }).then(function (r) {
    return r.json();
  });
}

/** 确认卡点击前签发一次性 HITL nonce；失败抛错（带 detail）。 */
function issueHitl(action, bind) {
  var body = Object.assign({ action: action }, bind || {});
  return fetch(engineBase() + "/api/hitl/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-WorkBuddy-Hitl": "ui",
    },
    body: JSON.stringify(body),
  }).then(function (r) {
    return r.json().then(function (d) {
      if (!r.ok || !d || !d.ok || !d.nonce) {
        var msg = (d && (d.detail || d.reply)) || "HITL 签发失败 HTTP " + r.status;
        var err = new Error(msg);
        err.hitl = d;
        throw err;
      }
      return d.nonce;
    });
  });
}

function discoverEngine() {
  fetchEngineApi("/api/runtime")
    .then(function (r) {
      return r.json();
    })
    .then(function (d) {
      if (d && d.ok && d.port) markEngineResolved(d.host || engineHost(), d.port);
    })
    .catch(function () {});
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
