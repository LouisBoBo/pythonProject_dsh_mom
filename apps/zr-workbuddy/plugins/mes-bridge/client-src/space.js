export function installSpace(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect,
      useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession,
      authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout,
      confirmAuthExpiredAndClear = ctx.confirmAuthExpiredAndClear;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine,
      fetchEngineApi = ctx.fetchEngineApi, ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual,
      resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace,
      textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage,
      lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement,
      WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
  var bag = ctx;

function spaceFmtTime(ts) {
  var n = Number(ts) || 0;
  if (!n) return "";
  try {
    return new Date(n * 1000).toLocaleString("zh-CN");
  } catch (e) {
    return String(n);
  }
}

function spaceEscapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      rows.forEach(function (row, idx) {
        if (idx === 1 && /---/.test(row)) return;
        var cells = row.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|");
        var tag = idx === 0 ? "th" : "td";
        tbl.push(
          "<tr>" +
            cells
              .map(function (c) {
                return "<" + tag + ">" + inlineFmt(c.trim()) + "</" + tag + ">";
              })
              .join("") +
            "</tr>",
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
  return html.join("\n") || "<p>（无正文）</p>";
}

function spaceGuessFormat(kind, id, relpath, body) {
  var rel = String(relpath || id || "").toLowerCase();
  var k = String(kind || "").toLowerCase();
  if (k === "code_file" || /\.(py|js|jsx|ts|tsx|vue|css|scss|go|rs|java|c|cpp|h|hpp|sh|sql|toml|ya?ml)$/i.test(rel)) {
    return "code";
  }
  if (rel.indexOf(".json") >= 0 || (body && body.trim().charAt(0) === "{")) return "json";
  if (rel.indexOf(".html") >= 0 || k === "html") return "html";
  if (k.indexOf("8d") >= 0 || k.indexOf("review") >= 0 || k.indexOf("delivery") >= 0 || rel.indexOf(".md") >= 0) {
    return "md";
  }
  return "md";
}

function spaceTypeLabel(kind, format) {
  var k = String(kind || "").toLowerCase();
  if (k === "code_file" || format === "code") return "代码";
  return "文档";
}

function tryClickSidebarSession(title, sessionId, extraTitle) {
  var skip = /^(资料库|用量|设置|新会话|记忆|工作区)$/;
  var bare = String(sessionId || "").replace(/^session-/, "");
  var nodes = document.querySelectorAll("button, a, [role='button']");
  var i;
  var el;
  var t;
  var names = [title, extraTitle].filter(function (x) {
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
      if (t === want || (want.length >= 8 && t.indexOf(want) >= 0)) {
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

/** 与中软知识库/自动化/ESC 共用的互斥事件：换会话时关掉它们盖住的主面板。 */
var WB_WORKSPACE_ACTIVATE = "@lemoncat7/dsh-plugin-ui/workspace-activate";

function foreignPluginWorkspaceVisible() {
  try {
    if (typeof document === "undefined") return false;
    return !!(
      document.querySelector(".dsh-knowledge-workspace") ||
      document.querySelector("[data-knowledge-surface='workspace']") ||
      document.querySelector(".za-root") ||
      document.querySelector(".esc-root")
    );
  } catch (eVis) {
    return false;
  }
}

/** DOM 兜底：只点工作区内部关闭钮，绝不点侧栏 launcher（toggle 会把刚关掉的面板又打开）。 */
function clickCloseForeignPluginWorkspaces() {
  try {
    if (typeof document === "undefined") return false;
    var closed = false;
    var knClose = document.querySelector(
      ".dsh-knowledge-workspace [data-knowledge-workspace-close], [data-knowledge-surface='workspace'] [data-knowledge-workspace-close]",
    );
    if (knClose && typeof knClose.click === "function") {
      knClose.click();
      closed = true;
    }
    var roots = document.querySelectorAll(
      ".dsh-knowledge-workspace, [data-knowledge-surface='workspace'], .za-root, .esc-root",
    );
    for (var r = 0; r < roots.length; r++) {
      var btns = roots[r].querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (b.closest && b.closest(".dsh-knowledge-launcher, .za-launcher, .esc-launcher")) continue;
        var lab = String(
          b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent || "",
        )
          .replace(/\s+/g, " ")
          .trim();
        if (lab === "返回对话" || lab.indexOf("返回会话") === 0 || lab === "关闭") {
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

function trySelectHostConversationPanel(ctx) {
  try {
    var layout =
      (ctx && ctx.layout) ||
      (bag._wbClientCtx && typeof bag._wbClientCtx.get === "function" ? bag._wbClientCtx.get("layout") : null);
    if (!layout || typeof layout.selectPanel !== "function") return false;
    var candidates = ["conversation", "chat", "main"];
    for (var i = 0; i < candidates.length; i++) {
      try {
        layout.selectPanel(candidates[i]);
        return true;
      } catch (eSel) {}
    }
  } catch (eLayout) {}
  return false;
}

/**
 * 关掉知识库/自动化/ESC 主面板。
 * opts.preserveActivePanel：正在打开资料库/用量自身时禁止 selectPanel(conversation)，
 * 否则会把宿主刚选中的 workbuddy-* 面板立刻切走，表现为「点了没反应」。
 */
function dismissForeignPluginWorkspaces(ctx, opts) {
  opts = opts || {};
  try {
    if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
    window.dispatchEvent(
      new CustomEvent(WB_WORKSPACE_ACTIVATE, {
        detail: { pluginId: "workbuddy-session-switch" },
      }),
    );
  } catch (eDismiss) {}
  if (!opts.preserveActivePanel) {
    trySelectHostConversationPanel(ctx);
  }
  // 等 React 卸掉主面板后再 DOM 兜底；多刷几次覆盖自动化/ESC 慢卸载
  var runDomFallback = function () {
    if (foreignPluginWorkspaceVisible()) clickCloseForeignPluginWorkspaces();
  };
  try {
    runDomFallback();
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
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
  } catch (eBorrow) {}
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
  } catch (ePatch) {}
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
      if (
        joined.indexOf("对话") < 0 &&
        joined.indexOf("Chat") < 0 &&
        joined.indexOf("轨迹") < 0 &&
        joined.indexOf("用量") < 0 &&
        joined.indexOf("资料库") < 0
      ) {
        continue;
      }
      for (j = 0; j < tabs.length; j++) {
        var t = labels[j];
        if (t === "对话" || t === "Chat") {
          tabs[j].click();
          return true;
        }
      }
    }
    var all = document.querySelectorAll('[role="tab"]');
    for (var i = 0; i < all.length; i++) {
      var tx = (all[i].textContent || "").replace(/\s+/g, " ").trim();
      if (tx === "对话" || tx === "Chat") {
        all[i].click();
        return true;
      }
    }
  } catch (eTab) {}
  return false;
}

function ensureConversationChatView(actions) {
  try {
    if (actions && typeof actions.setView === "function") {
      actions.setView("chat");
      activateHostChatTab();
      return true;
    }
  } catch (eSet) {}
  return activateHostChatTab();
}

/** 收起资料库/用量（docked main / overlay + conversation.view 粘性），不抢点「对话」tab（避免关掉刚开的知识库/自动化）。 */
function clearWorkbuddyLibraryUsagePresentation(actions, sessionId) {
  setWorkbuddyMainView(null);
  try {
    var layout = wbLayout();
    if (layout && typeof layout.selectPanel === "function" && layout.panelInfo) {
      var snap =
        typeof layout.panelInfo.getSnapshot === "function" ? layout.panelInfo.getSnapshot() : null;
      var active = snap && snap.activePanelId;
      if (active === "workbuddy-library" || active === "workbuddy-usage") {
        try {
          layout.selectPanel(null);
        } catch (_eSel) {
          /* already cleared */
        }
      }
    }
  } catch (_eLayout) {}
  patchPersistedChatView(sessionId);
  var acts = actions || bag._wbChatActions || null;
  try {
    if (acts && typeof acts.setView === "function") {
      acts.setView("chat");
    }
  } catch (eClear) {}
}

function forceLeaveStickyWorkbuddyViews(actions, sessionId) {
  clearWorkbuddyLibraryUsagePresentation(actions, sessionId);
  ensureConversationChatView(actions);
  setTimeout(function () {
    activateHostChatTab();
  }, 0);
  setTimeout(function () {
    activateHostChatTab();
  }, 80);
}

function isWorkbuddyStickyView(viewId) {
  return viewId === "workbuddy-usage" || viewId === "workbuddy-library";
}

function wbReadCurrentSessionIdFromCtx(clientCtx) {
  try {
    var ctx = clientCtx || bag._wbClientCtx;
    var sessions =
      (ctx && ctx.sessions) ||
      (ctx && typeof ctx.get === "function" ? ctx.get("sessions") : null);
    if (!sessions) return null;
    var list = sessions.list;
    if (list && typeof list.getSnapshot === "function") {
      var snap = list.getSnapshot();
      var cur = snap && snap.current;
      return cur == null || cur === "" ? null : String(cur);
    }
    if (typeof sessions.current === "string") return sessions.current;
  } catch (eRead) {}
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
      if (
        joined.indexOf("对话") < 0 &&
        joined.indexOf("Chat") < 0 &&
        joined.indexOf("轨迹") < 0 &&
        joined.indexOf("用量") < 0 &&
        joined.indexOf("资料库") < 0
      ) {
        continue;
      }
      for (j = 0; j < tabs.length; j++) {
        if (labels[j] === label) {
          tabs[j].click();
          return true;
        }
      }
    }
  } catch (eTab) {}
  return false;
}

var WB_MAIN_VIEW_EVENT = "wb-main-view-change";
var WB_PLUGIN_LAUNCHER_SEL =
  ".dsh-knowledge-launcher, .dsh-knowledge-trigger, .za-launcher, .esc-launcher";
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
  } catch (eEv) {}
}

function wbSupportsDockedPanels(ctx) {
  try {
    var c = ctx || bag._wbClientCtx;
    var layout =
      (c && c.layout) ||
      (c && typeof c.get === "function" ? c.get("layout") : null);
    return !!(layout && typeof layout.selectPanel === "function");
  } catch (_e) {
    return false;
  }
}

function wbLayout(ctx) {
  try {
    var c = ctx || bag._wbClientCtx;
    return (
      (c && c.layout) ||
      (c && typeof c.get === "function" ? c.get("layout") : null) ||
      null
    );
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
      /* fall through to overlay */
    }
    setWorkbuddyMainView(viewId);
    return;
  }
  // 无 docked panel：空白欢迎页宿主会卸 conversation.view，走主区 overlay
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
      strokeWidth: "1.2",
    }),
    h("path", {
      d: "M5.5 4V3.2A1.2 1.2 0 0 1 6.7 2h2.6A1.2 1.2 0 0 1 10.5 3.2V4",
      stroke: "currentColor",
      strokeWidth: "1.2",
    }),
  );
}

function wbUsageIcon(size) {
  size = size || 18;
  return h(
    "svg",
    { width: size, height: size, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
    h("rect", { x: "2", y: "8", width: "3", height: "6", rx: "0.5", fill: "currentColor" }),
    h("rect", { x: "6.5", y: "4", width: "3", height: "10", rx: "0.5", fill: "currentColor" }),
    h("rect", { x: "11", y: "6", width: "3", height: "8", rx: "0.5", fill: "currentColor" }),
  );
}

function WorkBuddyLibraryPanelIcon(props) {
  return wbLibraryIcon((props && props.size) || 18);
}

function WorkBuddyUsagePanelIcon(props) {
  return wbUsageIcon((props && props.size) || 18);
}

function WorkBuddyLibraryMain() {
  useEffect(function () {
    // 宿主已 selectPanel(workbuddy-library)；勿再切回 conversation
    dismissForeignPluginWorkspaces(bag._wbClientCtx, { preserveActivePanel: true });
    setWorkbuddyMainView("workbuddy-library");
    return function () {
      if (getWorkbuddyMainView() === "workbuddy-library") setWorkbuddyMainView(null);
    };
  }, []);
  return h(
    "div",
    { className: "wb-docked-main-scroll", "data-wb-docked-main": "library" },
    h(WorkBuddySpaceView, null),
  );
}

function WorkBuddyUsageMain() {
  useEffect(function () {
    dismissForeignPluginWorkspaces(bag._wbClientCtx, { preserveActivePanel: true });
    setWorkbuddyMainView("workbuddy-usage");
    return function () {
      if (getWorkbuddyMainView() === "workbuddy-usage") setWorkbuddyMainView(null);
    };
  }, []);
  var Usage = bag.WorkBuddyUsageView;
  return h(
    "div",
    { className: "wb-docked-main-scroll", "data-wb-docked-main": "usage" },
    typeof Usage === "function" ? h(Usage, null) : null,
  );
}

function WorkBuddyMainViewOverlay() {
  // DSH 0.2.1+ docked：资料库/用量走 sidebar.panellist + main，勿再叠 overlay
  if (wbSupportsDockedPanels()) return null;
  ensureCss();
  var viewState = useState(_wbMainView);
  var view = viewState[0];
  var setView = viewState[1];
  var leftState = useState(56);
  var left = leftState[0];
  var setLeft = leftState[1];

  useEffect(function () {
    function on(ev) {
      setView((ev && ev.detail && ev.detail.viewId) || null);
    }
    window.addEventListener(WB_MAIN_VIEW_EVENT, on);
    return function () {
      window.removeEventListener(WB_MAIN_VIEW_EVENT, on);
    };
  }, []);

  useEffect(
    function () {
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
      } catch (eRo) {}
      window.addEventListener("resize", measure);
      return function () {
        window.removeEventListener("resize", measure);
        if (ro) ro.disconnect();
      };
    },
    [view],
  );

  if (!view) return null;
  var body =
    view === "workbuddy-usage" && typeof bag.WorkBuddyUsageView === "function"
      ? h(bag.WorkBuddyUsageView, null)
      : h(WorkBuddySpaceView, null);
  return h(
    "div",
    {
      className: "wb-main-view-overlay",
      "data-wb-main-view-overlay": "1",
      style: { left: left + "px" },
    },
    body,
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
      if (t === "资料库" || t === "用量") {
        tabs[i].setAttribute("data-wb-hide-view-tab", "1");
        if (!initialScanDone && isActiveTab(tabs[i])) hiddenActive = true;
      }
    }
    if (hiddenActive) {
      for (var j = 0; j < tabs.length; j++) {
        var tj = (tabs[j].textContent || "").replace(/\s+/g, " ").trim();
        if (tj === "对话" || tj === "Chat") {
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
    var obs = new MutationObserver(function () {
      if (scheduled || stopped) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        if (!stopped) scan();
      }, 80);
    });
    obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    return function () {
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
  useEffect(function () {
    function on() {
      bump(function (n) {
        return n + 1;
      });
    }
    window.addEventListener(WB_MAIN_VIEW_EVENT, on);
    return function () {
      window.removeEventListener(WB_MAIN_VIEW_EVENT, on);
    };
  }, []);
  var sid = wbReadCurrentSessionIdFromCtx(bag._wbClientCtx);
  var view = sid ? wbReadPersistedChatView(sid) : null;
  void tick;

  function isTabActive(label) {
    var cur = getWorkbuddyMainView();
    if (label === "资料库") return cur === "workbuddy-library";
    if (label === "用量") return cur === "workbuddy-usage";
    return false;
  }

  function row(label, viewId, iconFn) {
    var active = isTabActive(label);
    return h(
      "button",
      {
        type: "button",
        className:
          "wb-sidebar-view-btn" +
          (wide ? "" : " wb-sidebar-view-btn--rail") +
          (active ? " is-active" : ""),
        "aria-pressed": active,
        title: label,
        onClick: function () {
          openWorkbuddySidebarView(viewId);
          bump(function (n) {
            return n + 1;
          });
        },
      },
      iconFn(wide ? 16 : 18),
      wide ? h("span", null, label) : null,
    );
  }

  return h(
    "div",
    {
      className: "wb-sidebar-views-nav" + (wide ? "" : " wb-sidebar-views-nav--rail"),
      role: "group",
      "aria-label": "资料库与用量",
    },
    row("资料库", "workbuddy-library", wbLibraryIcon),
    row("用量", "workbuddy-usage", wbUsageIcon),
  );
}

/** 跨 fiber 记住上一会话：header utilities 换会话会重挂，不能用组件内 primed。 */
var _wbGuardLastSessionId = null;

/**
 * 资料库/用量打开时，侧栏点「知识库 / 自动化 / 专家技能」须先收起 overlay（否则白层盖住插件工作区）。
 * 不绑 header.utilities：落在粘性 view 时顶栏守卫可能被卸。
 */
function installWorkbuddyPluginWorkspaceHandoff(ctx) {
  function sessionIdForClear() {
    return wbReadCurrentSessionIdFromCtx(ctx) || _wbGuardLastSessionId || null;
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
    } catch (ePtr) {}
  }
  if (typeof window !== "undefined") {
    window.addEventListener(WB_WORKSPACE_ACTIVATE, onWorkspaceActivate);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", onPointerDown, true);
  }
  return function () {
    try {
      if (typeof window !== "undefined") {
        window.removeEventListener(WB_WORKSPACE_ACTIVATE, onWorkspaceActivate);
      }
    } catch (eW) {}
    try {
      if (typeof document !== "undefined") {
        document.removeEventListener("pointerdown", onPointerDown, true);
      }
    } catch (eD) {}
  };
}

/**
 * 不依赖 header.utilities：知识库/自动化盖住 conversation 时顶栏守卫会被卸掉，
 * 必须在 apply() 里订阅 sessions.list.current。
 */
function installWorkBuddySessionSwitchWatcher(ctx) {
  var lastId = null;
  var primed = false;
  var unsubList = null;
  var retryTimer = null;
  var disposed = false;

  function readCurrentSessionId() {
    try {
      var sessions =
        (ctx && ctx.sessions) ||
        (ctx && typeof ctx.get === "function" ? ctx.get("sessions") : null);
      if (!sessions) return null;
      var list = sessions.list;
      if (list && typeof list.getSnapshot === "function") {
        var snap = list.getSnapshot();
        var cur = snap && snap.current;
        return cur == null || cur === "" ? null : String(cur);
      }
      if (typeof sessions.current === "string") return sessions.current;
    } catch (eRead) {}
    return null;
  }

  function onSessionCurrentChanged(reason) {
    var sid = readCurrentSessionId();
    dismissForeignPluginWorkspaces(ctx);
    forceLeaveStickyWorkbuddyViews(null, sid);
    setTimeout(function () {
      dismissForeignPluginWorkspaces(ctx);
      forceLeaveStickyWorkbuddyViews(null, sid || readCurrentSessionId());
      activateHostChatTab();
    }, 0);
    setTimeout(function () {
      if (foreignPluginWorkspaceVisible()) dismissForeignPluginWorkspaces(ctx);
      activateHostChatTab();
    }, 160);
    try {
      console.debug("[dsh-mes-bridge] session-switch", reason || "", sid);
    } catch (eLog) {}
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
      var sessions =
        (ctx && ctx.sessions) ||
        (ctx && typeof ctx.get === "function" ? ctx.get("sessions") : null);
      var list = sessions && sessions.list;
      if (list && typeof list.subscribe === "function") {
        syncFromList();
        unsubList = list.subscribe(syncFromList);
        return true;
      }
    } catch (eSub) {}
    return false;
  }

  if (!tryBindList()) {
    var attempts = 0;
    retryTimer = setInterval(function () {
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
      // 排除侧栏底部知识库/自动化/ESC 入口（toggle，不能当会话点）
      if (
        el.closest(
          WB_PLUGIN_LAUNCHER_SEL + ", [data-knowledge-workspace-close]",
        )
      ) {
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
      } catch (eSt) {}
      if (
        !foreign &&
        !stickyNow &&
        !document.querySelector(".wb-usage-view, .wb-space-view, [data-wb-usage-view], [data-wb-space-view]")
      ) {
        return;
      }

      var hit =
        el.closest("[data-session-id]") ||
        el.closest('[role="treeitem"]') ||
        el.closest('[role="option"]') ||
        el.closest("a[href*='session']");
      if (!hit) {
        var btn = el.closest("button, a, [role='button']");
        if (!btn) return;
        var side = btn.closest(
          "aside, nav, [class*='sidebar'], [class*='Sidebar'], [class*='session'], [data-slot*='sidebar']",
        );
        if (!side) return;
        var bt = (btn.textContent || "").replace(/\s+/g, " ").trim();
        if (!bt || bt.length > 120) return;
        if (/^(资料库|用量|设置|知识库|自动化|定时任务|专家)/.test(bt)) return;
        hit = btn;
      }
      // 捕获阶段先关面板+回对话，再让宿主完成 sessions.open
      onSessionCurrentChanged("sidebar-pointer");
    } catch (ePtr) {}
  }

  if (typeof document !== "undefined") {
    document.addEventListener("pointerdown", onSidebarPointerDown, true);
  }

  return function () {
    disposed = true;
    try {
      if (retryTimer) clearInterval(retryTimer);
    } catch (eT) {}
    try {
      if (typeof unsubList === "function") unsubList();
    } catch (eU) {}
    try {
      if (typeof document !== "undefined") {
        document.removeEventListener("pointerdown", onSidebarPointerDown, true);
      }
    } catch (eR) {}
  };
}

/**
 * 会话切换守卫（header 仍在时的辅助）：
 * - 关掉知识库/自动化/专家技能盖住的主面板
 * - 换会话时若落在用量/资料库粘性页签则切回对话
 * - 整页刷新首次进入不改 view
 * 主路径已改为 apply() 订阅 sessions.list（见 installWorkBuddySessionSwitchWatcher）。
 */
function WorkBuddySessionSwitchGuard(props) {
  var sessionId = props && props.sessionId;
  var actions = props && props.actions;
  var useStore = props && props.useStore;
  // 全局缓存 actions，供 openWorkbuddySidebarView 直接调用 setView
  try { bag._wbChatActions = actions || bag._wbChatActions || null; } catch (eBag) {}
  var view = useStore
    ? useStore(function (s) {
        return s && s.view;
      })
    : null;

  useEffect(
    function () {
      var prev = _wbGuardLastSessionId;
      _wbGuardLastSessionId = sessionId || null;
      if (sessionId) {
        try {
          globalThis.__wbDshSessionId = sessionId;
        } catch (eSid) {}
      }
      if (prev == null || prev === sessionId) return;
      dismissForeignPluginWorkspaces(bag._wbClientCtx);
      if (isWorkbuddyStickyView(view) || getWorkbuddyMainView()) {
        forceLeaveStickyWorkbuddyViews(actions, sessionId);
        return;
      }
      var acts = actions;
      var storeHook = useStore;
      setTimeout(function () {
        try {
          var cur =
            storeHook && typeof storeHook.getState === "function"
              ? storeHook.getState().view
              : null;
          if (isWorkbuddyStickyView(cur)) ensureConversationChatView(acts);
          else if (!cur) activateHostChatTab();
        } catch (eLate) {
          activateHostChatTab();
        }
      }, 0);
    },
    [sessionId, view, actions, useStore],
  );

  return null;
}

/** 优先走 DSH 官方 sessions.open；失败再点侧栏标题。 */
function tryOpenDshSession(sessionId, title, extraTitle) {
  var sid = String(sessionId || "").trim();
  if (sid) {
    try {
      var svc =
        bag._wbClientCtx && typeof bag._wbClientCtx.get === "function"
          ? bag._wbClientCtx.get("sessions")
          : null;
      if (svc && typeof svc.open === "function") {
        svc.open(sid);
        dismissForeignPluginWorkspaces(bag._wbClientCtx);
        setTimeout(function () {
          activateHostChatTab();
          forceLeaveStickyWorkbuddyViews(null);
        }, 0);
        return "opened";
      }
    } catch (eOpen) {}
  }
  if (tryClickSidebarSession(title, sid, extraTitle)) {
    dismissForeignPluginWorkspaces(bag._wbClientCtx);
    setTimeout(function () {
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
    setMenuPos({ top: top, left: left });
    setMenuId(aid);
  }

  function spaceFetch(path, opts) {
    // 须走 fetchEngineApi：裸 engineBase()+fetch 在桌面易打到错误口 → 401 → 误清会话
    return fetchEngineApi(
      path,
      Object.assign({}, opts || {}, {
        headers: authHeaders((opts && opts.headers) || {}),
      }),
    ).then(function (r) {
      return r.json().then(function (d) {
        if (r.status === 401) {
          var confirm =
            typeof confirmAuthExpiredAndClear === "function"
              ? confirmAuthExpiredAndClear()
              : Promise.resolve(true).then(function () {
                  writeAuthSession(null);
                  return true;
                });
          return confirm.then(function (cleared) {
            throw new Error(
              cleared ? "登录已失效，请重新登录" : "资料库暂时不可用，请稍后重试",
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
    var ext =
      fmt === "json"
        ? ".json"
        : fmt === "html"
          ? ".html"
          : fmt === "code"
            ? ""
            : ".md";
    var mime =
      fmt === "json"
        ? "application/json;charset=utf-8"
        : fmt === "html"
          ? "text/html;charset=utf-8"
          : "text/plain;charset=utf-8";
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
    setTimeout(function () {
      try {
        document.body.removeChild(a);
      } catch (e0) {}
      try {
        URL.revokeObjectURL(url);
      } catch (e1) {}
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
    var qs =
      "/api/space/library?page=" +
      encodeURIComponent(String(pg)) +
      "&page_size=" +
      PAGE_SIZE;
    var qTrim = String(qv || "").trim();
    if (qTrim) qs += "&q=" + encodeURIComponent(qTrim);
    return spaceFetch(qs)
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.detail) || "列表失败");
        var list = d.sessions || [];
        setSessions(list);
        setMeName(d.display_name || "");
        setTotal(Number(d.total) || 0);
        setPage(Number(d.page) || pg);
        // 多文档会话默认可折叠，初始展开
        setCollapsed(function (prev) {
          var next = Object.assign({}, prev || {});
          list.forEach(function (s) {
            var sid = String((s && s.id) || "");
            if (!sid) return;
            var n = (s.artifacts || []).length;
            if (n <= 1) delete next[sid];
            else if (next[sid] == null) next[sid] = false;
          });
          return next;
        });
      })
      .catch(function (e) {
        setSessions([]);
        setTotal(0);
        setErr((e && e.message) || String(e));
      })
      .then(function () {
        // 列表（含外部同步）完成后再读计数，避免与 status 双倍扫盘且计数滞后
        return loadStatus().catch(function () {});
      })
      .then(function () {
        setBusy(false);
      });
  }

  function loadStatus() {
    return spaceFetch("/api/space/status").then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.detail) || "状态失败");
      var cfg = d.config || {};
      setStatusText(
        (d.sessions || 0) +
          " 个会话 · " +
          (d.artifacts || 0) +
          " 份文档 · 约 " +
          Math.round((d.bytes || 0) / 1024) +
          " KB · 保留 " +
          (cfg.retention_days == null ? "—" : cfg.retention_days) +
          " 天",
      );
    });
  }

  useEffect(
    function () {
      var t = setTimeout(function () {
        loadLibrary(1, query);
      }, 320);
      return function () {
        clearTimeout(t);
      };
    },
    [query],
  );

  useEffect(
    function () {
      if (!menuId) return undefined;
      function onDocClick() {
        closeLibMenu();
      }
      function onScrollOrResize() {
        closeLibMenu();
      }
      document.addEventListener("click", onDocClick);
      window.addEventListener("resize", onScrollOrResize);
      window.addEventListener("scroll", onScrollOrResize, true);
      return function () {
        document.removeEventListener("click", onDocClick);
        window.removeEventListener("resize", onScrollOrResize);
        window.removeEventListener("scroll", onScrollOrResize, true);
      };
    },
    [menuId],
  );

  useEffect(
    function () {
      if (!preview) return undefined;
      function onKey(ev) {
        if (ev.key === "Escape") {
          ev.stopPropagation();
          setPreview(null);
        }
      }
      document.addEventListener("keydown", onKey, true);
      return function () {
        document.removeEventListener("keydown", onKey, true);
      };
    },
    [preview],
  );

  function openLinkedSession(s) {
    if (!s || !s.id || s.id === "unassigned") return;
    var bound = String(s.dsh_session_id || "").trim();
    if (!bound && !s.openable) {
      window.alert(
        "该档案未绑定 DSH 会话，无法跳转。\n\n" +
          "审码/写码须在任务开始时带上当前 sessionId 才会写入绑定；" +
          "PCB 8D 等从草稿目录扫入的条目没有聊天会话 id。\n" +
          "不会再用内容去猜相似会话，以免点错。",
      );
      return;
    }
    setBusy(true);
    setErr("");
    spaceFetch("/api/space/sessions/" + encodeURIComponent(s.id) + "/locate-dsh")
      .then(function (d) {
        var sid = (d && d.dsh_session_id) || bound || "";
        var title = (d && d.dsh_title) || "";
        if (!sid) {
          window.alert(
            "未绑定 DSH 会话（detail: " +
              ((d && d.detail) || "no-binding") +
              "）。请重新跑一遍审码/写码以写入绑定。",
          );
          return;
        }
        if (props && typeof props.onClose === "function") props.onClose();
        setTimeout(function () {
          var how = tryOpenDshSession(sid, title, s.title || "");
          if (how === "failed") {
            window.alert(
              "已绑定会话 " +
                sid +
                "，但当前侧栏未能打开。\n可能不在当前工作区，请切换工作区后再试。",
            );
          }
        }, 160);
      })
      .catch(function (e) {
        setErr((e && e.message) || String(e));
      })
      .then(function () {
        setBusy(false);
      });
  }

  function openArtifactPreview(id) {
    setBusy(true);
    setErr("");
    spaceFetch("/api/space/artifacts/" + encodeURIComponent(id))
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.detail) || "预览失败");
        var art = d.artifact || {};
        setPreview({
          kind: "artifact",
          id: art.id || id,
          title: art.title || art.id || "文档",
          body: d.body || "",
          format: spaceGuessFormat(art.kind, art.id, art.relpath, d.body || ""),
        });
      })
      .catch(function (e) {
        setErr((e && e.message) || String(e));
      })
      .then(function () {
        setBusy(false);
      });
  }

  function downloadArtifact(id) {
    setBusy(true);
    spaceFetch("/api/space/artifacts/" + encodeURIComponent(id))
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.detail) || "下载失败");
        var art = d.artifact || {};
        var fmt = spaceGuessFormat(art.kind, art.id, art.relpath, d.body || "");
        var name = String(art.title || art.id || id || "report");
        downloadMarkdownFile(name, d.body || "", fmt);
      })
      .catch(function (e) {
        setErr((e && e.message) || String(e));
      })
      .then(function () {
        setBusy(false);
      });
  }

  function deleteSession(id) {
    if (!id || !window.confirm("删除该会话档案及其文档？不会删除左侧 DSH 原会话。")) return;
    setBusy(true);
    spaceFetch("/api/space/sessions/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.detail) || "删除失败");
        setPreview(null);
        return loadLibrary();
      })
      .catch(function (e) {
        setErr((e && e.message) || String(e));
        setBusy(false);
      });
  }

  function deleteArtifact(id) {
    if (!id || !window.confirm("删除该文档？")) return;
    setBusy(true);
    spaceFetch("/api/space/artifacts/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.detail) || "删除失败");
        setPreview(null);
        return loadLibrary();
      })
      .catch(function (e) {
        setErr((e && e.message) || String(e));
        setBusy(false);
      });
  }

  function purge(dry) {
    if (!dry && !window.confirm("按保留策略清理过期档案？")) return;
    setBusy(true);
    spaceFetch("/api/space/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: !!dry }),
    })
      .then(function (d) {
        if (!d || !d.ok) throw new Error((d && d.detail) || "清理失败");
        window.alert(
          (dry ? "将清理约 " : "已清理 ") +
            (d.purged_sessions || 0) +
            " 个会话（保留 " +
            (d.retention_days != null ? d.retention_days : "—") +
            " 天）",
        );
        return dry ? loadStatus() : loadLibrary();
      })
      .catch(function (e) {
        setErr((e && e.message) || String(e));
      })
      .then(function () {
        setBusy(false);
      });
  }

  var pageCount = Math.max(1, Math.ceil((Number(total) || 0) / PAGE_SIZE));
  var rows = [];
  (sessions || []).forEach(function (s) {
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
            multi
              ? h(
                  "button",
                  {
                    type: "button",
                    className: "wb-lib-fold",
                    title: isCollapsed ? "展开文档" : "折叠文档",
                    "aria-expanded": !isCollapsed,
                    onClick: function (ev) {
                      ev.stopPropagation();
                      setCollapsed(function (prev) {
                        var next = Object.assign({}, prev || {});
                        next[s.id] = !next[s.id];
                        return next;
                      });
                    },
                  },
                  isCollapsed ? "▶" : "▼",
                )
              : h("span", { className: "wb-lib-fold-spacer", "aria-hidden": "true" }),
            h("span", { className: "wb-lib-ico chat", "aria-hidden": "true" }, "会"),
            h(
              "span",
              {
                className: "t " + (canOpen ? "sess-link" : "sess-muted"),
                title: canOpen
                  ? "打开已绑定的 DSH 会话"
                  : "未绑定 DSH 会话，无法跳转（审码/写码新跑才会写入绑定）",
                onClick: function () {
                  openLinkedSession(s);
                },
              },
              s.title || s.id,
            ),
            arts.length
              ? h("span", { className: "wb-lib-count" }, arts.length + " 份文档")
              : null,
          ),
        ),
      ),
    );
    if (isCollapsed) return;
    arts.forEach(function (a) {
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
            onClick: function () {
              openArtifactPreview(a.id);
            },
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
                  "aria-hidden": "true",
                },
                icoLetter,
              ),
              h("span", { className: "t" }, a.title || a.id),
            ),
          ),
          h("td", { className: "col-type" }, typeLabel),
          h("td", { className: "col-who" }, a.display_name || who),
          h("td", { className: "col-time" }, spaceFmtTime(a.created_at || s.updated_at)),
          h("td", { className: "col-size" }, spaceFmtBytes(a.bytes)),
          h(
            "td",
            {
              className: "col-act",
              onClick: function (ev) {
                ev.stopPropagation();
              },
            },
            h(
              "div",
              { className: "wb-lib-actions" },
              h(
                "button",
                {
                  type: "button",
                  className: "wb-lib-more" + (menuId === a.id ? " open" : ""),
                  "aria-label": "更多操作",
                  "aria-haspopup": "menu",
                  "aria-expanded": menuId === a.id,
                  disabled: busy,
                  onClick: function (ev) {
                    ev.stopPropagation();
                    openLibMenu(a.id, ev.currentTarget);
                  },
                },
                "···",
              ),
              menuId === a.id && menuPos
                ? h(
                    "div",
                    {
                      className: "wb-lib-menu",
                      role: "menu",
                      style: {
                        top: menuPos.top + "px",
                        left: menuPos.left + "px",
                      },
                      onClick: function (ev) {
                        ev.stopPropagation();
                      },
                    },
                    h(
                      "button",
                      {
                        type: "button",
                        role: "menuitem",
                        onClick: function () {
                          closeLibMenu();
                          openArtifactPreview(a.id);
                        },
                      },
                      "预览",
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        role: "menuitem",
                        onClick: function () {
                          closeLibMenu();
                          downloadArtifact(a.id);
                        },
                      },
                      "下载",
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        role: "menuitem",
                        className: "danger",
                        onClick: function () {
                          closeLibMenu();
                          deleteArtifact(a.id);
                        },
                      },
                      "删除",
                    ),
                  )
                : null,
            ),
          ),
        ),
      );
    });
  });

  var loadingNode = h(
    "div",
    { className: "wb-lib-loading", role: "status", "aria-live": "polite", "aria-label": "资料库加载中" },
    h(
      "div",
      { className: "wb-lib-orbit", "aria-hidden": "true" },
      h("div", { className: "ring" }),
      h("div", { className: "ring r2" }),
      h("div", { className: "core" }),
      h("div", { className: "dot" }),
      h("div", { className: "dot d2" }),
      h("div", { className: "dot d3" }),
    ),
    h("p", { className: "hint" }, "整理资料中"),
  );

  var tableNode;
  if (busy) {
    // 首屏与翻页共用同一套加载动画
    tableNode = loadingNode;
  } else if (!sessions.length) {
    tableNode = h(
      "div",
      { className: "wb-space-empty" },
      String(query || "").trim()
        ? "没有匹配的会话或文档。"
        : "暂无资料。审码报告、写码源码、PCB 8D 会按会话出现在这里。",
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
          h("th", { className: "col-name" }, "名称"),
          h("th", { className: "col-type" }, "类型"),
          h("th", { className: "col-who" }, "更新人"),
          h("th", { className: "col-time" }, "更新时间"),
          h("th", { className: "col-size" }, "大小"),
          h("th", { className: "col-act" }, ""),
        ),
      ),
      h("tbody", null, rows),
    );
  }

  var pagerNode =
    total > 0
      ? h(
          "div",
          { className: "wb-lib-pager" },
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn",
              disabled: busy || page <= 1,
              onClick: function () {
                loadLibrary(page - 1);
              },
            },
            "上一页",
          ),
          h("span", null, "第 " + page + " / " + pageCount + " 页 · 共 " + total + " 个会话"),
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn",
              disabled: busy || page >= pageCount,
              onClick: function () {
                loadLibrary(page + 1);
              },
            },
            "下一页",
          ),
        )
      : null;

  var previewFmt = preview ? preview.format || "md" : "md";
  var previewInner = null;
  var previewNode = null;
  if (preview) {
    if (previewFmt === "json") {
      var pretty = preview.body || "";
      try {
        pretty = JSON.stringify(JSON.parse(preview.body || ""), null, 2);
      } catch (eJson) {}
      previewInner = h("pre", null, pretty || "（无正文）");
    } else if (previewFmt === "code") {
      previewInner = h("pre", null, preview.body || "（无正文）");
    } else if (previewFmt === "html") {
      previewInner = h("iframe", {
        className: "wb-lib-html",
        sandbox: "",
        srcDoc: preview.body || "<p>（无正文）</p>",
        title: "HTML 预览",
      });
    } else {
      previewInner = h("div", {
        className: "wb-lib-md",
        dangerouslySetInnerHTML: { __html: spaceMdToHtml(preview.body || "") },
      });
    }
    previewNode = h(
      "div",
      { className: "wb-lib-fs", role: "dialog", "aria-label": "预览" },
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
            "正在预览 · " +
              (previewFmt === "md"
                ? "Markdown"
                : previewFmt === "code"
                  ? "代码"
                  : previewFmt.toUpperCase()),
          ),
        ),
        h(
          "div",
          { className: "wb-space-actions" },
          h(
            "button",
            {
              type: "button",
              className: "wb-cr-btn",
              onClick: function () {
                downloadMarkdownFile(preview.title || preview.id || "preview", preview.body || "", previewFmt);
              },
            },
            previewFmt === "json"
              ? "下载 .json"
              : previewFmt === "html"
                ? "下载 .html"
                : previewFmt === "code"
                  ? "下载源码"
                  : "下载 .md",
          ),
          h(
            "button",
            {
              type: "button",
              className: "wb-usage-panel-x",
              "aria-label": "关闭预览",
              onClick: function () {
                setPreview(null);
              },
            },
            "×",
          ),
        ),
      ),
      h("div", { className: "wb-lib-fs-body" }, previewInner),
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
      "点蓝色会话名打开已绑定聊天。资料库收创作/测试用例、审码与 8D；写码成功后只挂本任务改动并已同步的源码（未改动的不入库）。知识库检索问答不进资料库。",
    ),
    h(
      "div",
      { className: "wb-lib-toolbar" },
      h("input", {
        className: "wb-lib-search",
        placeholder: "搜索文件、会话",
        value: query,
        onChange: function (ev) {
          setQuery(ev.target.value);
        },
      }),
      h(
        "button",
        {
          type: "button",
          className: "wb-cr-btn",
          disabled: busy,
          onClick: function () {
            loadLibrary();
          },
        },
        busy ? "刷新中…" : "刷新",
      ),
      h(
        "button",
        {
          type: "button",
          className: "wb-cr-btn",
          disabled: busy,
          onClick: function () {
            purge(true);
          },
        },
        "预览清理",
      ),
      h(
        "button",
        {
          type: "button",
          className: "wb-cr-btn",
          disabled: busy,
          onClick: function () {
            purge(false);
          },
        },
        "清理过期",
      ),
    ),
    statusText && !busy ? h("div", { className: "wb-lib-meta" }, statusText) : null,
    err ? h("div", { className: "wb-cr-err" }, err) : null,
    h("div", { className: "wb-lib-scroll" }, tableNode),
    pagerNode,
  );
}

function WorkBuddySpaceView(_props) {
  ensureCss();
  return h(
    "div",
    { className: "wb-space-view", "data-wb-space-view": "1" },
    h("div", { className: "wb-space-view-body" }, h(WorkBuddySpaceSection, null)),
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

  ctx.readWorkbuddyCurrentSessionId = function () {
    try {
      var c = bag._wbClientCtx || ctx;
      var sessions =
        (c && c.sessions) ||
        (c && typeof c.get === "function" ? c.get("sessions") : null);
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
    } catch (eRead) {}
    if (_wbGuardLastSessionId) return String(_wbGuardLastSessionId);
    try {
      return String(globalThis.__wbDshSessionId || "").trim() || null;
    } catch (eG) {
      return null;
    }
  };
}
