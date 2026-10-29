import {
  classifyCodingFailKind,
  codingFailContinueCopy,
  codingFailProgressCopy,
  isHollowCodingSuccess,
} from "../lib/coding-fail-kind.js";
import { userFacingCodingConclusion } from "../lib/coding-closeout.js";
import {
  codingInlineRequirement,
  codingInlineStatusLine,
  codingProcessLines,
  codingProcessTick,
  fileLangFromPath,
  isProcessLineComplete,
  isProgressiveCodingText,
  mergeCodingProcessLines,
  parseCodingSnippet,
  pickCodingInlineJob,
  pickLiveCodingJob,
  shellCommandTitle,
  shouldStreamCodingProcess,
  splitProcessProse,
  splitSayBlocks,
} from "../lib/coding-inline-card.js";

export function installApply(ctx) {
  var React = ctx.React, h = ctx.h, useState = ctx.useState, useEffect = ctx.useEffect,
      useLayoutEffect = ctx.useLayoutEffect, useRef = ctx.useRef, useMemo = ctx.useMemo;
  var engineBase = ctx.engineBase, engineHost = ctx.engineHost, enginePort = ctx.enginePort;
  var AUTH_LS_KEY = ctx.AUTH_LS_KEY, AUTH_ENTERPRISES = ctx.AUTH_ENTERPRISES, AUTH_EVENT = ctx.AUTH_EVENT;
  var readAuthSession = ctx.readAuthSession, writeAuthSession = ctx.writeAuthSession,
      authHeaders = ctx.authHeaders, notifyAuthChanged = ctx.notifyAuthChanged, doAppLogout = ctx.doAppLogout;
  var pickLocalFolder = ctx.pickLocalFolder, issueHitl = ctx.issueHitl, discoverEngine = ctx.discoverEngine,
      ensureCss = ctx.ensureCss;
  var readMeta = ctx.readMeta, expandHomePath = ctx.expandHomePath, pathsEqual = ctx.pathsEqual,
      resolveDshCwd = ctx.resolveDshCwd, initialWorkspace = ctx.initialWorkspace,
      textFromContentBlocks = ctx.textFromContentBlocks, toolArgsMessage = ctx.toolArgsMessage,
      lastUserUtterance = ctx.lastUserUtterance, initialRequirement = ctx.initialRequirement,
      WorkspaceMismatchHint = ctx.WorkspaceMismatchHint;
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


/** 一体化开关本地缓存：须挺过应用冷启（sessionStorage 会丢，改用 localStorage 优先） */
var WB_IFLOW_SS_PREFIX = "wb.integratedFlow.";
function wbIflowRead(key) {
  var v = "";
  try {
    if (typeof localStorage !== "undefined") {
      v = String(localStorage.getItem(key) || "");
      if (v === "1" || v === "0") return v;
    }
  } catch (e1) {}
  try {
    if (typeof sessionStorage !== "undefined") {
      v = String(sessionStorage.getItem(key) || "");
    }
  } catch (e2) {}
  return v;
}
function wbPersistIntegratedFlow(sessionId, on) {
  try {
    var sid = String(sessionId || "").trim();
    var v = on ? "1" : "0";
    var stores = [];
    try {
      if (typeof localStorage !== "undefined") stores.push(localStorage);
    } catch (eA) {}
    try {
      if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);
    } catch (eB) {}
    for (var i = 0; i < stores.length; i++) {
      if (sid) stores[i].setItem(WB_IFLOW_SS_PREFIX + sid, v);
      stores[i].setItem(WB_IFLOW_SS_PREFIX + "__last", v);
    }
  } catch (ePersist) {}
}
function wbRestoreIntegratedFlowClass() {
  if (typeof document === "undefined" || !document.documentElement) return false;
  try {
    var sid = "";
    try {
      sid = String(globalThis.__wbDshSessionId || "").trim();
    } catch (eSid) {}
    var cached = "";
    if (sid) cached = wbIflowRead(WB_IFLOW_SS_PREFIX + sid);
    if (cached !== "1" && cached !== "0") {
      cached = wbIflowRead(WB_IFLOW_SS_PREFIX + "__last");
    }
    if (cached === "1") {
      document.documentElement.classList.add("wb-integrated-flow-on");
      try {
        globalThis.__wbIntegratedFlowOn = true;
      } catch (eFlag) {}
      return true;
    }
  } catch (eRestore) {}
  return false;
}

/**
 * 一体化开着时，对话写码确认表单仍会先挂上 toolview（guard 只拦执行，拦不住这张卡）。
 * 只给插件自己的 `.cc-card` 打标记，由 CSS 隐藏该节点。
 * 禁止往父节点打 display:none：父级常常包住底栏，会把系统输入框一起藏掉。
 */
function installIntegratedCodingConfirmMute() {
  if (typeof document === "undefined") return function () {};
  var CONFIRM_ONLY = "data-wb-cchat-confirm-only";
  var CONFIRM_SHELL = "data-wb-cchat-confirm-shell";
  wbRestoreIntegratedFlowClass();

  function flowOn() {
    try {
      if (globalThis.__wbIntegratedFlowOn) return true;
    } catch (e0) {}
    try {
      return !!(
        document.documentElement &&
        document.documentElement.classList.contains("wb-integrated-flow-on")
      );
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
    // 只认「点确认才开写」的表单。进行中 / 结论卡没有这句，不能藏。
    if (text.indexOf("确认并用 Cursor 开写") < 0 && text.indexOf("点确认前不会写码") < 0) {
      return false;
    }
    if (text.indexOf("Cursor 仍在处理") >= 0 || text.indexOf("取消任务") >= 0) return false;
    return true;
  }

  /** 最多上溯 3 层，且父级不得包住底栏、过程流卡或别的正文。 */
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
        if (kid === node || (kid.contains && kid.contains(node))) continue;
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
        "[" +
          CONFIRM_ONLY +
          "],[" +
          CONFIRM_SHELL +
          "],[data-wb-mute-cchat-confirm],[data-wb-mute-pipeline-skip]",
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
      // 旧版本把 display:none 打在父节点上，会连底栏一起藏。这里只清标记，不改 composer 的 style。
      try {
        if (
          el.style &&
          el.style.display === "none" &&
          !(el.matches && el.matches("[data-composer-seat],[data-composer-card]"))
        ) {
          el.style.display = "";
        }
      } catch (e7) {}
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
  } catch (e9) {}
  return function () {
    try {
      clearInterval(tick);
    } catch (e10) {}
    try {
      window.removeEventListener("wb-integrated-flow-changed", onFlowFlag);
    } catch (e11) {}
    clearMarks(document);
  };
}

/**
 * DSH 0.2 把工具卡折成 hidden=until-found，innerText 为空 → 写码结束/问卷后聊天空白。
 * 底栏输入框不碰。
 */
function installRevealFoldedToolviews() {
  if (typeof document === "undefined") return function () {};
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
  } catch (eUnclip) {}
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
    } catch (e2) {}
    try {
      if (node.tagName === "DETAILS") node.open = true;
    } catch (e3) {}
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
      // 进度卡画在「已调用工具」里。该组默认收起，展开后外层仍只有约 200px
      // 且 overflow:auto，主聊天停在底部「深度求索」时整张卡在视口外。
      // 展开工具组、取消这层裁剪，卡不在视口里时滚一次。不点确认按钮，不藏卡。
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
        } catch (eClick) {}
      }
      p = p.parentElement;
      depth++;
    }
  }
  function unclipAncestors() {
    /* 不再改祖先 height/overflow：会把主栏撑塌、系统输入框顶到页面上方。 */
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
    } catch (eSeat) {}
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
    return t.indexOf("深度求索中") >= 0;
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
    /* 禁止把对话卡 position:fixed，会打乱主栏高度和系统输入框位置。 */
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
      attributeFilter: ["hidden"],
    });
  } catch (e3) {}
  var tick = setInterval(scan, 500);
  return function () {
    try {
      clearInterval(tick);
    } catch (e4) {}
    try {
      if (obs) obs.disconnect();
    } catch (e5) {}
  };
}

/**
 * 清晰写码时模型仍可能先吐 ask_user_question（「提问 · 入口位置」）。
 * 宿主已拦截并直接开工；这里只藏问卷行，不碰底栏输入框。
 */
function installMuteClearCodingAsk() {
  if (typeof document === "undefined") return function () {};
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
        "[data-role='user'], [data-message-role='user'], [data-kind='user']",
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
    return (
      /(创建|新建|增加|新增|添加|加个).{0,24}(界面|页面|菜单|模块|报表|入口|视图|路由)/.test(text) ||
      /(删除|删掉|去掉|移除|下线|隐藏).{0,20}(界面|页面|菜单|报表|模块|入口|视图|路由)/.test(text)
    );
  }

  function isAskNoise(el) {
    var t = "";
    try {
      t = String(el.textContent || "");
    } catch (e5) {
      return false;
    }
    if (t.length < 8 || t.length > 900) return false;
    if (t.indexOf("提问") < 0) return false;
    return (
      t.indexOf("ask_user_question") >= 0 ||
      /"questions"\s*:/.test(t) ||
      t.indexOf("入口位置") >= 0 ||
      t.indexOf("新增范围") >= 0
    );
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
      } catch (e8) {}
    }
  }

  var obs = null;
  try {
    obs = new MutationObserver(function () {
      scan();
    });
    obs.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  } catch (e9) {}
  var tick = setInterval(scan, 400);
  scan();
  return function () {
    try {
      clearInterval(tick);
    } catch (e10) {}
    try {
      if (obs) obs.disconnect();
    } catch (e11) {}
  };
}

/**
 * 普通写码不再展示确认卡和进度卡。
 * 进行中的 Cursor 过程（思考、搜索、读文件、改文件）直接写进对话底部。
 * 一体化过程流不走这里。
 */
function installCodingProcessFeed() {
  if (typeof document === "undefined") return function () {};
  var FEED = "wb-cchat-feed";
  var streamJob = "";
  var shown = [];
  var pendingLines = null;
  var raf = 0;

  function flowOn() {
    try {
      if (globalThis.__wbIntegratedFlowOn) return true;
    } catch (e0) {}
    try {
      return !!(
        document.documentElement &&
        document.documentElement.classList.contains("wb-integrated-flow-on")
      );
    } catch (e1) {
      return false;
    }
  }

  function chatBase() {
    try {
      var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
      if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
    } catch (e2) {}
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
    } catch (e8) {}
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
      if (t.indexOf("Think") < 0 && t.indexOf("深度求索") < 0 && t.indexOf("Deep diving") < 0) continue;
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
        if (text.indexOf("深度求索") < 0 && text.indexOf("Deep diving") < 0) continue;
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
        if (raw.indexOf("深度求索") < 0 && raw.indexOf("Deep diving") < 0) continue;
        hit = node;
      }
    }
    if (!hit) return null;
    try {
      if (hit.parentElement && String(hit.parentElement.className || "").indexOf("turnStatus") >= 0) {
        return hit.parentElement;
      }
    } catch (e20) {}
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
      } catch (e22) {}
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
      } catch (e12) {}
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
      removed: Number(line.removed || 0),
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
        var h = makeEl("div", "wb-cchat-h");
        paintInlineCode(h, b.text || "");
        host.appendChild(h);
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
        head.appendChild(makeEl("span", "wb-cchat-code-file", "代码"));
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
    sum.appendChild(makeEl("span", "wb-cchat-run-title", shellCommandTitle(line.command || line.text || "运行命令")));
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
    head.appendChild(makeEl("span", "wb-cchat-code-file", line.file || line.path || "文件"));
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
      body.appendChild(makeEl("div", "wb-cchat-code-empty", "正在写入…"));
    }
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var tr = makeEl("div", "wb-cchat-code-row is-" + row.type);
      tr.appendChild(makeEl("span", "wb-cchat-code-ln", row.type === "omit" ? "" : String(i + 1)));
      tr.appendChild(
        makeEl(
          "span",
          "wb-cchat-code-mk",
          row.type === "add" ? "+" : row.type === "del" ? "-" : row.type === "omit" ? "…" : "",
        ),
      );
      tr.appendChild(makeEl("span", "wb-cchat-code-tx", row.text));
      body.appendChild(tr);
    }
    if (parsed.rows.length > rows.length) {
      body.appendChild(makeEl("div", "wb-cchat-code-more", "… 还有 " + (parsed.rows.length - rows.length) + " 行"));
    }
    card.appendChild(body);
    el.appendChild(card);
  }

  function paintToolChip(el, line) {
    var chip = makeEl("div", "wb-cchat-chip");
    var label = "工具";
    if (line.name === "grep") label = "搜索";
    else if (line.name === "glob") label = "查找";
    else if (line.name === "read") label = "读取";
    else if (line.name === "delete") label = "删除";
    else if (line.name === "edit" || line.name === "write") label = "编辑";
    else if (line.text) label = String(line.text).split(" ")[0] || "工具";
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
      } catch (e29) {}
      nodes = bodyNodes(feed);
    }
    var i;
    for (i = 0; i < shown.length; i++) {
      var streaming =
        pendingLines &&
        pendingLines[i] &&
        String(shown[i].text || "").length < String(pendingLines[i].text || "").length;
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
    } catch (e28) {}
    var target = pendingLines;
    var prevLen = shown.length;
    shown = codingProcessTick(shown, target);
    syncFeed(feed, prevLen);
    var last = shown.length ? shown[shown.length - 1] : null;
    var lastFull = last && target[shown.length - 1];
    var busy =
      shown.length < target.length ||
      (last && lastFull && !isProcessLineComplete(last, lastFull));
    if (busy) {
      raf = requestAnimationFrame(function () {
        pump(feed);
      });
      return;
    }
    var done = bodyNodes(feed);
    var i;
    for (i = 0; i < shown.length && i < target.length; i++) {
      shown[i].running = !!target[i].running;
      if (done[i] && shown[i].kind === "tool") {
        var richer =
          String(target[i].snippet || "") !== String(shown[i].snippet || "") ||
          String(target[i].command || "") !== String(shown[i].command || "");
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
      } catch (e24) {}
    }
    var lines = mergeCodingProcessLines(codingProcessLines(job && job.transcript));
    var st = String((job && job.status) || "");
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
      wait.textContent = "正在准备写码…";
      feed.appendChild(wait);
      return;
    }
    var waitEl = null;
    try {
      waitEl = feed.querySelector("[data-wb-cchat-wait]");
    } catch (e25) {}
    if (waitEl) {
      try {
        waitEl.remove();
      } catch (e26) {}
    }
    pendingLines = lines;
    if (!raf) {
      raf = requestAnimationFrame(function () {
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
    var mark = String((job && job.id) || "");
    if (feed.getAttribute("data-wb-cchat-static") === mark && feed.querySelector(".wb-cchat-line")) return;
    try {
      feed.setAttribute("data-wb-cchat-static", mark);
    } catch (e30) {}
    feed.textContent = "";
    var el = document.createElement("div");
    paintProcessLine(el, { kind: "say", text: closeout }, false);
    feed.appendChild(el);
  }

  function loadJob(id) {
    return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(id) + "?view=card")
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
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
    if (!ws || (!callId && !(sid && req))) return Promise.resolve("");
    var qs =
      "workspace=" +
      encodeURIComponent(ws) +
      (callId ? "&call_id=" + encodeURIComponent(callId) : "") +
      (sid ? "&session_id=" + encodeURIComponent(sid) : "") +
      (req ? "&requirement=" + encodeURIComponent(req) : "");
    return fetch(chatBase() + "/api/cursor-chat/pending-latest?" + qs)
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        var pending = body && body.pending;
        if (pending && pending.job_id) return String(pending.job_id);
        return fallbackJobId(ws, req);
      })
      .catch(function () {
        return fallbackJobId(ws, req);
      });
  }

  function fallbackJobId(ws, req) {
    var want = String(ws || "").replace(/\\/g, "/").toLowerCase();
    if (!want) return Promise.resolve("");
    return fetch(chatBase() + "/api/cursor-chat/jobs")
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        var items = (body && body.items) || [];
        var mine = [];
        var i;
        for (i = 0; i < items.length; i++) {
          var w = String(items[i].workspace || "").replace(/\\/g, "/").toLowerCase();
          if (w === want) mine.push(items[i]);
        }
        mine.sort(function (a, b) {
          return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
        });
        mine = mine.slice(0, 4);
        return Promise.all(
          mine.map(function (item) {
            return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(item.id) + "?view=card")
              .then(function (r2) {
                return r2.json();
              })
              .then(function (body2) {
                return body2 && (body2.job || body2);
              })
              .catch(function () {
                return null;
              });
          }),
        );
      })
      .then(function (jobs) {
        var hit = pickCodingInlineJob(req, jobs || []);
        return hit && hit.id ? String(hit.id) : "";
      })
      .catch(function () {
        return "";
      });
  }

  function columnText() {
    var host = messageColumn();
    if (!host) return "";
    try {
      return String(host.innerText || "").slice(0, 4000);
    } catch (e18) {
      return "";
    }
  }

  function resolveLiveJobId() {
    return fetch(chatBase() + "/api/cursor-chat/jobs")
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        var items = (body && body.items) || [];
        items.sort(function (a, b) {
          return String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
        });
        items = items.slice(0, 4);
        return Promise.all(
          items.map(function (item) {
            return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(item.id) + "?view=card")
              .then(function (r2) {
                return r2.json();
              })
              .then(function (body2) {
                return body2 && (body2.job || body2);
              })
              .catch(function () {
                return null;
              });
          }),
        );
      })
      .then(function (jobs) {
        var hit = pickLiveCodingJob(columnText(), jobs || []);
        return hit && hit.id ? String(hit.id) : "";
      })
      .catch(function () {
        return "";
      });
  }

  function tick() {
    if (flowOn()) {
      clearFeed();
      return;
    }
    var card = lastCard();
    var pending = card
      ? resolveJobId(card)
      : divingFlowItem(document)
        ? resolveLiveJobId()
        : null;
    if (!pending) return;
    pending
      .then(function (id) {
        if (!id) return;
        return loadJob(id);
      })
      .catch(function () {});
  }

  var timer = setInterval(tick, 400);
  tick();
  return function () {
    try {
      clearInterval(timer);
    } catch (e13) {}
    clearFeed();
  };
}

/**
 * 普通写码：需求已明确时不再等人点确认框，自动 HITL 开工。
 * 不改写码插件；一体化过程流仍走自己的代签，这里跳过。
 * 审码 / 提交 / 部署确认卡不碰。
 */
function installAutoStartClearCoding() {
  if (typeof document === "undefined") return function () {};
  var HIDE = "data-wb-cchat-autostart-hide";
  var STARTED = "data-wb-cchat-autostarted";
  var CLICKED = "data-wb-cchat-autoclicked";
  var inflight = {};

  function flowOn() {
    try {
      if (globalThis.__wbIntegratedFlowOn) return true;
    } catch (e0) {}
    try {
      return !!(
        document.documentElement &&
        document.documentElement.classList.contains("wb-integrated-flow-on")
      );
    } catch (e1) {
      return false;
    }
  }

  function chatBase() {
    try {
      var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
      if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
    } catch (e2) {}
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
    if (text.indexOf("确认并用 Cursor 开写") < 0 && text.indexOf("点确认前不会写码") < 0) {
      return false;
    }
    if (text.indexOf("Cursor 仍在处理") >= 0 || text.indexOf("取消任务") >= 0) return false;
    if (text.indexOf("本卡只展示过程") >= 0) return false;
    // 已经在改码 / 已有结论：这是进度卡，不是待点的确认框。藏掉后主聊天只剩「深度求索」。
    if (
      text.indexOf("Cursor 正在改码") >= 0 ||
      text.indexOf("写码中") >= 0 ||
      text.indexOf("已同步") >= 0 ||
      text.indexOf("说明方案") >= 0 ||
      text.indexOf("本轮结论") >= 0 ||
      text.indexOf("沙箱") >= 0
    ) {
      return false;
    }
    return true;
  }

  function isProgressCard(card) {
    var text = cardText(card);
    return text.indexOf("本卡只展示过程") >= 0 || text.indexOf("写码中") >= 0;
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
      } catch (e6) {}
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
    if (t && t.indexOf("（空") !== 0) return t;
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
      if (t.indexOf("提交中") >= 0) return true;
      if (btns[i].disabled && t.indexOf("确认并用 Cursor 开写") >= 0) return true;
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
      if (t.indexOf("确认并用 Cursor 开写") < 0) continue;
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
    if (!ws || (!callId && !(sid && req))) {
      done(false);
      return;
    }
    var qs =
      "workspace=" +
      encodeURIComponent(ws) +
      (callId ? "&call_id=" + encodeURIComponent(callId) : "") +
      (sid ? "&session_id=" + encodeURIComponent(sid) : "") +
      (req ? "&requirement=" + encodeURIComponent(req) : "");
    fetch(chatBase() + "/api/cursor-chat/pending-latest?" + qs)
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
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
            workspace: workspace,
            requirement: requirement,
            confirm_token: tok,
          }),
        })
          .then(function (r2) {
            return r2.json();
          })
          .then(function (issued) {
            if (!issued || !issued.ok || !issued.nonce) throw new Error("hitl");
            var body = {
              workspace: workspace,
              requirement: requirement,
              nonce: issued.nonce,
              confirm_token: tok,
            };
            if (pending.parent_job_id) body.parent_job_id = pending.parent_job_id;
            return fetch(chatBase() + "/api/cursor-chat/confirm", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }).then(function (r3) {
              return r3.json();
            });
          });
      })
      .then(function (res) {
        done(!!(res && res.ok));
      })
      .catch(function () {
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
      panel.innerHTML =
        '<div class="wb-cchat-inline-kicker">写码</div>' +
        '<div class="wb-cchat-inline-req"></div>' +
        '<div class="wb-cchat-inline-status">正在开工…</div>';
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
        } catch (e12d) {}
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
    fetch(chatBase() + "/api/cursor-chat/jobs")
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var items = ((data && data.items) || []).slice().sort(function (a, b) {
          return String((b && b.updated_at) || "").localeCompare(String((a && a.updated_at) || ""));
        });
        var pending = [];
        var i;
        for (i = 0; i < items.length && i < 6; i++) {
          var id = String((items[i] && items[i].id) || "").trim();
          if (!id || reqByJob[id]) continue;
          pending.push(id);
        }
        return Promise.all(
          pending.map(function (id) {
            return fetch(chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(id) + "?view=card")
              .then(function (r2) {
                return r2.json();
              })
              .then(function (body) {
                var job = body && body.job;
                if (job && job.requirement) reqByJob[id] = String(job.requirement);
              })
              .catch(function () {});
          }),
        ).then(function () {
          return items;
        });
      })
      .then(function (items) {
        var rows = (items || []).map(function (item) {
          var id = String((item && item.id) || "").trim();
          return {
            id: id,
            requirement: reqByJob[id] || "",
            status: item && item.status,
            detail: item && item.detail,
            updated_at: item && item.updated_at,
          };
        });
        var i;
        for (i = 0; i < panels.length; i++) {
          var panel = panels[i];
          if (!panel || !panel.isConnected) continue;
          var picked = pickCodingInlineJob(panel.getAttribute("data-wb-cchat-req") || "", rows);
          if (picked) paintInline(panel, picked);
        }
      })
      .catch(function () {});
  }

  function isCodingPluginCard(card) {
    if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
    if (touchesComposer(card)) return false;
    var text = cardText(card);
    if (text.indexOf("确认并用 Cursor 开写") >= 0) return true;
    if (text.indexOf("点确认前不会写码") >= 0) return true;
    if (text.indexOf("本卡只展示过程") >= 0) return true;
    if (text.indexOf("Cursor 正在改码") >= 0) return true;
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
      } catch (e12g) {}
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
      attributeFilter: ["hidden", "class"],
    });
  } catch (e14) {}
  var tick = setInterval(scan, 400);
  return function () {
    try {
      clearInterval(tick);
    } catch (e15) {}
    try {
      clearInterval(jobPoll);
    } catch (e15b) {}
    try {
      if (obs) obs.disconnect();
    } catch (e16) {}
  };
}

/**
 * 「续改确认」卡补充说明（不改 DSH 插件、不自动点确认）。
 * 写码插件对 continue 固定走 HITL；失败后 Agent 再 continue 也会出同一张确认卡，
 * 原文案像「新开写码」，用户容易蒙蔽。此处只加醒目说明。
 */
function installContinueConfirmClarify() {
  if (typeof document === "undefined") return function () {};
  var ATTR = "data-wb-continue-clarify";
  var BANNER = "data-wb-continue-clarify-banner";
  var fetching = {};

  function chatBase() {
    try {
      var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
      if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
    } catch (e0) {}
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
    if (text.indexOf("确认并用 Cursor 开写") < 0) return false;
    if (text.indexOf("续改确认") < 0 && text.indexOf("续改") < 0) return false;
    if (text.indexOf("Cursor 仍在处理") >= 0) return false;
    if (text.indexOf("续改进度") >= 0 && text.indexOf("确认并用 Cursor 开写") < 0) return false;
    return true;
  }

  function parentJobIdNear(card) {
    var scopes = [card];
    try {
      if (card.parentElement) scopes.push(card.parentElement);
      if (card.parentElement && card.parentElement.parentElement) {
        scopes.push(card.parentElement.parentElement);
      }
    } catch (e2) {}
    var i;
    for (i = 0; i < scopes.length; i++) {
      var text = "";
      try {
        text = String((scopes[i] && scopes[i].innerText) || "");
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
      } catch (e5) {}
      return;
    }
    card.setAttribute(ATTR, kind);
    if (el) {
      try {
        el.remove();
      } catch (e6) {}
    }
    el = document.createElement("div");
    el.setAttribute(BANNER, "1");
    el.className =
      "wb-continue-clarify" +
      (String(kind).indexOf("failed") === 0
        ? " is-failed"
        : kind === "missing"
          ? " is-warn"
          : "");
    var h = document.createElement("div");
    h.className = "wb-continue-clarify-title";
    h.textContent = title;
    var p = document.createElement("div");
    p.className = "wb-continue-clarify-body";
    p.textContent = body;
    el.appendChild(h);
    el.appendChild(p);
    try {
      card.insertBefore(el, card.firstChild);
    } catch (e7) {
      try {
        card.appendChild(el);
      } catch (e8) {}
    }
  }

  function applyGeneric(card) {
    setBanner(
      card,
      "continue",
      "这是续改确认（不是新开无关任务）",
      "将在上一轮写码基础上继续改同一工程与诉求。点「确认并用 Cursor 开写」后才会继续写码；未点确认前不会改代码。",
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
      "上一轮任务已失效，需要重新确认后续改",
      "找不到任务 " +
        String(jid || "").trim() +
        "（可能已清理或过期）。点「确认并用 Cursor 开写」将按卡上诉求重新开写继续处理。",
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
    fetch(url, { method: "GET", credentials: "omit" })
      .then(function (r) {
        return r.json().then(function (body) {
          return { okHttp: r.ok, status: r.status, body: body };
        });
      })
      .then(function (pack) {
        fetching[jid] = false;
        var st = String(
          (pack.body && (pack.body.status || (pack.body.job && pack.body.job.status))) || "",
        );
        var detail = String(
          (pack.body &&
            (pack.body.detail ||
              pack.body.error ||
              (pack.body.job && (pack.body.job.detail || pack.body.job.error)))) ||
            "",
        );
        if (pack.status === 404 || /任务不存在/.test(String((pack.body && pack.body.detail) || ""))) {
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
      })
      .catch(function () {
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
  return function () {
    try {
      clearInterval(tick);
    } catch (e10) {}
  };
}

/**
 * 对话写码进度卡失败且原因为 *.db EPERM：自动调引擎从沙箱回收非 db 源码。
 * （插件同步撞库会整单中断，源码可能未落盘——提示词禁 db 挡不住 Agent 仍改库文件。）
 */
function installDbSyncFailAutoRecover() {
  if (typeof document === "undefined") return function () {};
  var ATTR = "data-wb-db-sync-recover";
  var BANNER = "data-wb-db-sync-recover-banner";
  /** 失败回收 / 成功结论分账，避免互相 tried 堵死 */
  var triedRecover = {};
  var triedCloseout = {};

  function chatBase() {
    try {
      var ls = window.localStorage && window.localStorage.getItem("wb.cursorChatBase");
      if (ls && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(ls)) return ls.replace(/\/$/, "");
    } catch (e0) {}
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
    if (text.indexOf("失败") < 0 && text.indexOf("failed") < 0) return false;
    if (!/\bcch-[0-9a-z-]+\b/i.test(text)) return false;
    return true;
  }

  /**
   * 进度卡像成功终态。插件完成态常见文案是「本轮结论」+「已同步 N 个文件」，
   * 不一定含「完成/成功」——只认后者会导致结论横幅永远不挂。
   */
  function looksLikeProgressSuccessCard(card) {
    if (!card || !card.classList || !card.classList.contains("cc-card")) return false;
    var text = "";
    try {
      text = String(card.textContent || card.innerText || "");
    } catch (e1b) {
      return false;
    }
    if (text.indexOf("失败") >= 0 || /\bfailed\b/i.test(text)) return false;
    if (text.indexOf("续改确认") >= 0 && text.indexOf("确认并用 Cursor") >= 0) return false;
    var looksDone =
      text.indexOf("完成") >= 0 ||
      text.indexOf("成功") >= 0 ||
      text.indexOf("succeeded") >= 0 ||
      text.indexOf("本轮结论") >= 0 ||
      /已同步\s*\d+\s*个文件/.test(text);
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
      } catch (e4) {}
    }
    el = document.createElement("div");
    el.setAttribute(BANNER, "1");
    el.className =
      "wb-db-sync-recover" + (kind === "ok" ? " is-ok" : kind === "busy" ? " is-busy" : " is-warn");
    var h = document.createElement("div");
    h.className = "wb-db-sync-recover-title";
    h.textContent = title;
    var p = document.createElement("div");
    p.className = "wb-db-sync-recover-body";
    p.textContent = body;
    el.appendChild(h);
    el.appendChild(p);
    try {
      card.insertBefore(el, card.firstChild);
    } catch (e5) {
      try {
        card.appendChild(el);
      } catch (e6) {}
    }
  }

  function maybeRecover(card) {
    if (!looksLikeProgressFailCard(card)) return;
    var jid = jobIdFrom(card);
    if (!jid || triedRecover[jid]) return;
    var doneAttr = card.getAttribute(ATTR) || "";
    if (
      doneAttr === "ok" ||
      doneAttr === "skip" ||
      doneAttr === "closeout" ||
      doneAttr === "hollow" ||
      doneAttr === "network" ||
      doneAttr === "url_images" ||
      doneAttr === "agent_missing" ||
      doneAttr === "other" ||
      doneAttr === "db_eperm"
    ) {
      return;
    }
    triedRecover[jid] = true;
    setBanner(
      card,
      "busy",
      "正在识别写码失败原因…",
      "将区分网络 / 数据库文件 / 附图 / Agent 失效等，并给出下一步；*.db 占用时会尝试自动回收源码。",
    );
    var jobUrl = chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(jid);
    fetch(jobUrl, { method: "GET", credentials: "omit" })
      .then(function (r) {
        return r.json().then(function (body) {
          return { okHttp: r.ok, body: body };
        });
      })
      .then(function (pack) {
        var detail = String(
          (pack.body &&
            (pack.body.detail ||
              pack.body.error ||
              (pack.body.job && (pack.body.job.detail || pack.body.job.error)))) ||
            "",
        );
        var st = String(
          (pack.body && (pack.body.status || (pack.body.job && pack.body.job.status))) || "",
        );
        if (st !== "failed" && st !== "error") {
          // 误判失败卡但 Job 已成功：留给 closeout，勿永久 skip
          if (st === "succeeded") {
            triedRecover[jid] = false;
            try {
              card.removeAttribute(ATTR);
              var stuck = card.querySelector("[" + BANNER + "]");
              if (stuck) stuck.remove();
            } catch (eSkip) {}
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
        setBanner(card, "busy", dbCopy.title, "正在回收源码（忽略 *.db）… " + dbCopy.body);
        var eng = "";
        try {
          eng = String(engineBase() || "").replace(/\/$/, "");
        } catch (e8) {
          eng = "";
        }
        if (!eng) {
          setBanner(card, "warn", "无法自动回收", "引擎地址未知，请重启 WorkBuddy 后再试。");
          return;
        }
        return fetch(eng + "/api/cursor-chat/recover-db-sync", {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ job_id: jid }),
        }).then(function (r2) {
          return r2.json().then(function (body2) {
            return { okHttp: r2.ok, body: body2 };
          });
        });
      })
      .then(function (pack2) {
        if (!pack2) return;
        var files = (pack2.body && pack2.body.changed_files) || [];
        if (pack2.body && pack2.body.ok && files && files.length) {
          setBanner(
            card,
            "ok",
            "已自动回收源码（已忽略 *.db）",
            "已写入 " +
              files.length +
              " 个文件：" +
              files.slice(0, 6).join("、") +
              (files.length > 6 ? "…" : "") +
              "。请重启业务后端后刷新页面验收；库结构由 migrate/源码重建，不要手工拷 db。",
          );
          console.log("[dsh-mes-bridge] db EPERM 已回收源码 job=" + jid + " n=" + files.length);
          return;
        }
        setBanner(
          card,
          "warn",
          "未能自动回收源码",
          String((pack2.body && pack2.body.detail) || "请停掉占用库的后端后，说「不要碰 db，只同步源码再跑」继续。"),
        );
      })
      .catch(function () {
        triedRecover[jid] = false;
        setBanner(card, "warn", "回收请求失败", "请确认引擎在跑后刷新页面重试。");
      });
  }

  /**
   * 成功进度卡：插件原生「本轮结论」常只剩 detail=「已同步 N 个文件」（assistant_text 空）。
   * 拉 Job 后挂完整横幅（改了啥 + 文件清单 + 怎么验）。结论生成逻辑未删，是展示没挂上。
   */
  function maybeSuccessCloseout(card) {
    if (!looksLikeProgressSuccessCard(card)) return;
    var jid = jobIdFrom(card);
    if (!jid || triedCloseout[jid]) return;
    var doneAttr = card.getAttribute(ATTR) || "";
    if (
      doneAttr === "ok" ||
      doneAttr === "hollow" ||
      doneAttr === "closeout" ||
      doneAttr === "network" ||
      doneAttr === "url_images" ||
      doneAttr === "agent_missing" ||
      doneAttr === "other" ||
      doneAttr === "db_eperm" ||
      doneAttr === "busy"
    ) {
      return;
    }
    // skip 可能是失败误判留下的；成功卡允许再试 closeout
    triedCloseout[jid] = true;
    var jobUrl = chatBase() + "/api/cursor-chat/jobs/" + encodeURIComponent(jid);
    fetch(jobUrl, { method: "GET", credentials: "omit" })
      .then(function (r) {
        return r.json().then(function (body) {
          return { okHttp: r.ok, body: body };
        });
      })
      .then(function (pack) {
        var job =
          (pack.body && pack.body.job && typeof pack.body.job === "object"
            ? pack.body.job
            : pack.body) || {};
        if (!job.id) job.id = jid;
        var st = String(job.status || (pack.body && pack.body.status) || "");
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
      })
      .catch(function () {
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
  return function () {
    try {
      clearInterval(tick);
    } catch (e10) {}
  };
}


function apply(ctx) {
  bag._wbClientCtx = ctx || null;
  try {
    if (typeof window !== "undefined") window.__wbClientCtx = ctx || null;
  } catch (eWb) {}
  ensureCss();
  discoverEngine();
  ensureLoginGateMounted();
  if (ctx && typeof ctx.effect === "function" && bag._loginGateUnmount) {
    ctx.effect(function () {
      return function () {
        if (bag._loginGateUnmount) {
          try {
            bag._loginGateUnmount();
          } catch (e0) {}
          bag._loginGateUnmount = null;
        }
      };
    }, "workbuddy-app-login-gate");
  }
  if (!ctx || !ctx.slots || typeof ctx.slots.inject !== "function") {
    console.error("[dsh-mes-bridge] 无 slots 服务：无法注册 WorkBuddy 客户端能力");
    return;
  }
  try {
    if (bag._wbMuteCchatDispose) {
      try {
        bag._wbMuteCchatDispose();
      } catch (eMute0) {}
      bag._wbMuteCchatDispose = null;
    }
    bag._wbMuteCchatDispose = installIntegratedCodingConfirmMute();
    if (bag._wbKeepConfirmDispose) {
      try {
        bag._wbKeepConfirmDispose();
      } catch (eKeep0) {}
      bag._wbKeepConfirmDispose = null;
    }
    bag._wbKeepConfirmDispose = installAutoStartClearCoding();
    if (bag._wbRevealFoldDispose) {
      try {
        bag._wbRevealFoldDispose();
      } catch (eReveal0) {}
      bag._wbRevealFoldDispose = null;
    }
    bag._wbRevealFoldDispose = installRevealFoldedToolviews();
    if (bag._wbProcessFeedDispose) {
      try {
        bag._wbProcessFeedDispose();
      } catch (eFeed0) {}
      bag._wbProcessFeedDispose = null;
    }
    bag._wbProcessFeedDispose = installCodingProcessFeed();
    if (bag._wbMuteAskDispose) {
      try {
        bag._wbMuteAskDispose();
      } catch (eAsk0) {}
      bag._wbMuteAskDispose = null;
    }
    bag._wbMuteAskDispose = installMuteClearCodingAsk();
    if (bag._wbContinueClarifyDispose) {
      try {
        bag._wbContinueClarifyDispose();
      } catch (eFc0) {}
      bag._wbContinueClarifyDispose = null;
    }
    bag._wbContinueClarifyDispose = installContinueConfirmClarify();
    if (bag._wbDbSyncRecoverDispose) {
      try {
        bag._wbDbSyncRecoverDispose();
      } catch (eDb0) {}
      bag._wbDbSyncRecoverDispose = null;
    }
    bag._wbDbSyncRecoverDispose = installDbSyncFailAutoRecover();
    if (ctx && typeof ctx.effect === "function") {
      ctx.effect(function () {
        return function () {
          if (bag._wbMuteCchatDispose) {
            try {
              bag._wbMuteCchatDispose();
            } catch (eMute1) {}
            bag._wbMuteCchatDispose = null;
          }
          if (bag._wbKeepConfirmDispose) {
            try {
              bag._wbKeepConfirmDispose();
            } catch (eKeep1) {}
            bag._wbKeepConfirmDispose = null;
          }
          if (bag._wbRevealFoldDispose) {
            try {
              bag._wbRevealFoldDispose();
            } catch (eReveal1) {}
            bag._wbRevealFoldDispose = null;
          }
          if (bag._wbMuteAskDispose) {
            try {
              bag._wbMuteAskDispose();
            } catch (eAsk1) {}
            bag._wbMuteAskDispose = null;
          }
          if (bag._wbContinueClarifyDispose) {
            try {
              bag._wbContinueClarifyDispose();
            } catch (eFc1) {}
            bag._wbContinueClarifyDispose = null;
          }
          if (bag._wbDbSyncRecoverDispose) {
            try {
              bag._wbDbSyncRecoverDispose();
            } catch (eDb1) {}
            bag._wbDbSyncRecoverDispose = null;
          }
        };
      }, "workbuddy-mute-cchat-confirm");
    }
  } catch (eMute) {
    console.warn("[dsh-mes-bridge] 一体化写码确认卡静默挂载失败", eMute);
  }
  // 侧栏品牌名：官方槽 + DOM 兜底（官方 brand-official 单槽常后装，会盖掉 inject）
  var WB_BRAND_LABEL = "江西中软工作助手";
  var WB_HERO_LABEL = "江西中软，让制造更智能";
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
        "link[rel~='icon'], link[rel='shortcut icon']",
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
    } catch (_eChrome) {}
  }

  function installDocumentChromeWatcher() {
    applyDocumentChrome();
    try {
      var titleEl = document.querySelector("title");
      if (titleEl && typeof MutationObserver !== "undefined") {
        new MutationObserver(function () {
          if (document.title !== WB_BRAND_LABEL) {
            document.title = WB_BRAND_LABEL;
          }
        }).observe(titleEl, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    } catch (_eWatch) {}
  }

  function fetchBrandingConfig() {
    try {
      fetch(engineBase() + "/api/branding")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok && d.branding && d.branding.enabled) {
            var b = d.branding;
            if (b.app_name) WB_BRAND_LABEL = String(b.app_name).slice(0, 64);
            if (b.app_overview) WB_HERO_LABEL = String(b.app_overview).slice(0, 200);
            // 只接受本引擎 branding logo，拒绝任意外链（防 XSS / 追踪图）
            var logo = String(b.logo_url || "");
            if (logo.indexOf("/api/branding/logo") >= 0) {
              WB_BRAND_LOGO_URL = logo;
            }
            WB_BRANDING_LOADED = true;
          }
          applyDocumentChrome();
        })
        .catch(function () {
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
      WB_BRAND_LABEL,
    );
  }
  function WorkBuddyBrandMark(props) {
    var s = Math.min(36, Math.max(18, Number((props && props.size) || 24) || 24));
    return h(
      "span",
      {
        className: "wb-brand-mark",
        "data-wb-brand-mark": "1",
        style: { ["--wb-mark-size"]: s + "px" },
      },
      h("img", {
        src: WB_BRAND_LOGO_URL,
        alt: "",
        width: s,
        height: s,
      }),
    );
  }
  function installZhongruanBrandPatch() {
    if (typeof document === "undefined") return function () {};
    var WB_MARK_SELECTOR =
      "[data-wb-brand-mark='1'], [class*='wb-brand-mark']";
    function isOurs(c) {
      return (
        c.getAttribute &&
        (c.getAttribute("data-wb-brand") === "1" || c.getAttribute("data-wb-brand-mark") === "1")
      );
    }
    function hideOfficialKids(el) {
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (isOurs(c)) continue;
        c.setAttribute("data-wb-brand-hide", "1");
      }
      // 官方常把文案放在文本节点里；只藏 element 会叠字/半截显示
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
      // 去重：官方槽与 DOM 兜底可能各挂一份
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
      for (var h = 0; h < heads.length; h++) {
        if (heads[h].textContent !== WB_HERO_LABEL) heads[h].textContent = WB_HERO_LABEL;
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
        "[class*='brandMark'], [class*='_brandMark'], [class*='railMark']",
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
    var obs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(function () {
            if (scheduled || stopped) return;
            scheduled = true;
            setTimeout(function () {
              scheduled = false;
              if (!stopped) scan();
            }, 120);
          })
        : null;
    if (obs && document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    return function () {
      stopped = true;
      if (obs) obs.disconnect();
    };
  }
  /**
   * 写码进度卡还在跑时，收起它后面新冒出来的思考、工具和 Deep diving。
   * 只加标记，不搬节点，不碰底栏输入框。标记保留，结束后也不把这堆过程再撑开。
   */
  function pinRunningCodingCard() {
    if (typeof document === "undefined") return function () {};
    var ATTR = "data-wb-coding-hold";
    var stopped = false;
    function classText(el) {
      return String((el && el.className) || "");
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
      return (
        text.indexOf("本卡只展示过程") >= 0 ||
        text.indexOf("写码中") >= 0 ||
        text.indexOf("Cursor 正在") >= 0 ||
        text.indexOf("Cursor 仍在处理") >= 0
      );
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
      var text = String((el && (el.innerText || el.textContent)) || "").slice(0, 800);
      if (/zr_cchat_|写码仍在进行|Deep diving|Tool call|上下文注入/.test(text)) return true;
      if (/^\s*Think\b/.test(text)) return true;
      return false;
    }
    function scan() {
      var lives = document.querySelectorAll(
        ".wb-cd-think.is-live, .wb-cd-dot-live, .wb-cd-spin",
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
    var obs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(function () {
            if (scheduled || stopped) return;
            scheduled = true;
            setTimeout(function () {
              scheduled = false;
              if (!stopped) scan();
            }, 80);
          })
        : null;
    if (obs && document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
    return function () {
      stopped = true;
      if (obs) obs.disconnect();
    };
  }
  /**
   * 只给侧栏根打标记，供 CSS flex order 把插件入口排到会话列表上方。
   * 禁止 insertBefore / appendChild 搬走 React 节点：插件更新会重绘侧栏，
   * 节点已不在原父级时 commit 的 removeChild 会失败，整条 sidebar 槽被卸掉，左侧空白。
   */
  function markSidebarRootForPluginOrder() {
    if (typeof document === "undefined") return function () {};
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
    var obs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(function () {
            if (scheduled || stopped) return;
            scheduled = true;
            setTimeout(function () {
              scheduled = false;
              if (!stopped) scan();
            }, 120);
          })
        : null;
    if (obs && document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    return function () {
      stopped = true;
      if (obs) obs.disconnect();
    };
  }
  /**
   * 官方侧栏「更多」（aria-label 账号菜单 / Account menu）与 WorkBuddy 账号菜单撞在一起。
   * 只藏这个按钮，以及它弹出的意见反馈 / 登录。设置仍由账号菜单「设置」点开。
   * 不碰会话标题「更多操作」、不碰底栏输入框。
   */
  function hideOfficialAccountMore() {
    if (typeof document === "undefined") return function () {};
    var stopped = false;
    function isOfficialSettingsText(text) {
      var compact = String(text || "").replace(/\s+/g, "");
      return (
        (compact.indexOf("设置") === 0 || compact.indexOf("Settings") === 0) &&
        (compact.indexOf("Ctrl") >= 0 || compact.indexOf("Alt") >= 0 || compact.indexOf(",") >= 0)
      );
    }
    function isOfficialDropText(text) {
      return text === "意见反馈" || text === "Feedback" || text === "登录" || text === "Sign in";
    }
    function markLauncher() {
      var buttons = document.querySelectorAll("button[aria-haspopup='menu']");
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var label = btn.getAttribute("aria-label") || "";
        if (label !== "账号菜单" && label !== "Account menu") continue;
        if (
          btn.closest &&
          btn.closest(".wb-sidebar-account, [data-composer-seat], [data-composer-card]")
        ) {
          continue;
        }
        var node = btn;
        var parent = btn.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
          if (
            parent.matches &&
            parent.matches(".wb-sidebar-account, [data-composer-seat], [data-composer-card]")
          ) {
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
    var obs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(function () {
            if (stopped) return;
            scan();
          })
        : null;
    if (obs && document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    return function () {
      stopped = true;
      if (obs) obs.disconnect();
    };
  }
  /**
   * 侧栏下面的中软「自动化」（.za-launcher）与官方「自动化任务」撞名。
   * 只改这一条入口的可见名和悬停文案为「定时任务」。不改插件包，不动官方那一条。
   */
  function renameCompanyAutomationLauncher() {
    if (typeof document === "undefined") return function () {};
    var stopped = false;
    function scan() {
      var roots = document.querySelectorAll(".za-launcher");
      for (var i = 0; i < roots.length; i++) {
        var root = roots[i];
        if (root.getAttribute("aria-label") === "自动化入口") {
          root.setAttribute("aria-label", "定时任务入口");
        }
        var btn = root.querySelector(".za-trigger");
        if (!btn) continue;
        if (btn.getAttribute("aria-label") === "打开自动化") {
          btn.setAttribute("aria-label", "打开定时任务");
        }
        if (btn.getAttribute("title") === "自动化") {
          btn.setAttribute("title", "定时任务");
        }
        var spans = btn.querySelectorAll("span");
        for (var s = 0; s < spans.length; s++) {
          if (String(spans[s].textContent || "").trim() === "自动化") {
            spans[s].textContent = "定时任务";
          }
        }
      }
    }
    scan();
    var obs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(function () {
            if (stopped) return;
            scan();
          })
        : null;
    if (obs && document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true });
    }
    return function () {
      stopped = true;
      if (obs) obs.disconnect();
    };
  }
  /** 输入框「+」命令菜单：宿主插件描述为英文，DOM 层汉化（不改 DSH 插件包） */
  function installCommandMenuZhPatch() {
    if (typeof document === "undefined") return function () {};
    var CMD_DESC_ZH = {
      "Compact older conversation history": "压缩较早的对话历史",
      "Download this Session log as a ZIP archive": "将会话日志下载为 ZIP 压缩包",
      "record feedback about this session": "记录对本会话的反馈",
      "set or view the goal for a long-running task": "设置或查看长任务的运行目标",
      "Switch the permission preset (sandbox mode + approval policy)":
        "切换权限预设（沙箱模式与审批策略）",
      "Enter or leave plan mode": "进入或退出规划模式",
    };
    var CMD_NAME_ZH = {
      compact: "压缩",
      export: "导出",
      feedback: "反馈",
      goal: "目标",
      permission: "权限",
      plan: "规划",
      model: "模型",
    };
    /** PermissionSelect：宿主硬编码英文 optionLabel（触发按钮 + 弹框菜单项） */
    var PERM_PRESET_ZH = {
      "Read Only": "只读",
      "Workspace Write": "工作区写入",
      "Full access": "完全访问",
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
        false,
      );
      var nodes = [];
      var n;
      while ((n = walker.nextNode())) nodes.push(n);
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
    var obs =
      typeof MutationObserver !== "undefined"
        ? new MutationObserver(function () {
            if (scheduled || stopped) return;
            scheduled = true;
            setTimeout(function () {
              scheduled = false;
              if (!stopped) scan();
            }, 80);
          })
        : null;
    if (obs && document.documentElement) {
      obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    return function () {
      stopped = true;
      if (obs) obs.disconnect();
    };
  }
  try {
    ctx.slots.inject("sidebar.brand.mark", function () {
      return ctx.slots.register(
        {
          name: "sidebar.brand.mark",
          id: "workbuddy-brand-mark",
          order: 0,
          priority: 100,
        },
        WorkBuddyBrandMark,
      );
    });
  } catch (eMark) {
    console.warn("[dsh-mes-bridge] sidebar.brand.mark 不可用", eMark);
  }
  try {
    ctx.slots.inject("conversation.hero.brand.mark", function () {
      return ctx.slots.register(
        {
          name: "conversation.hero.brand.mark",
          id: "workbuddy-hero-brand-mark",
          order: 0,
          priority: 100,
        },
        WorkBuddyBrandMark,
      );
    });
  } catch (eHeroMark) {
    console.warn("[dsh-mes-bridge] conversation.hero.brand.mark 不可用", eHeroMark);
  }
  try {
    ctx.slots.inject("sidebar.brand.name", function () {
      return ctx.slots.register(
        {
          name: "sidebar.brand.name",
          id: "workbuddy-brand-name",
          order: 0,
          priority: 100,
        },
        WorkBuddyBrandName,
      );
    });
  } catch (eBrand) {
    console.warn("[dsh-mes-bridge] sidebar.brand.name 不可用", eBrand);
  }
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return installZhongruanBrandPatch();
      }, "workbuddy-brand-name-dom");
    } else {
      installZhongruanBrandPatch();
    }
  } catch (eBrandDom) {
    console.warn("[dsh-mes-bridge] 品牌 DOM 补丁失败", eBrandDom);
  }
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return pinRunningCodingCard();
      }, "workbuddy-pin-coding-card");
    } else {
      pinRunningCodingCard();
    }
  } catch (ePin) {
    console.warn("[dsh-mes-bridge] 写码进度卡收起下方过程失败", ePin);
  }
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return markSidebarRootForPluginOrder();
      }, "workbuddy-sidebar-plugin-order");
    } else {
      markSidebarRootForPluginOrder();
    }
  } catch (eDock) {
    console.warn("[dsh-mes-bridge] 侧栏插件入口上移失败", eDock);
  }
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return hideOfficialAccountMore();
      }, "workbuddy-hide-official-more");
    } else {
      hideOfficialAccountMore();
    }
  } catch (eOfficialMore) {
    console.warn("[dsh-mes-bridge] 收起官方更多菜单失败", eOfficialMore);
  }
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return renameCompanyAutomationLauncher();
      }, "workbuddy-rename-company-automation");
    } else {
      renameCompanyAutomationLauncher();
    }
  } catch (eZaRename) {
    console.warn("[dsh-mes-bridge] 侧栏定时任务改名失败", eZaRename);
  }
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return hideWorkbuddyConversationViewTabs();
      }, "workbuddy-hide-view-tabs");
    } else {
      hideWorkbuddyConversationViewTabs();
    }
  } catch (eHideTabs) {
    console.warn("[dsh-mes-bridge] 会话顶部标签隐藏失败", eHideTabs);
  }
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return installCommandMenuZhPatch();
      }, "workbuddy-command-menu-zh");
    } else {
      installCommandMenuZhPatch();
    }
  } catch (eCmdZh) {
    console.warn("[dsh-mes-bridge] 命令菜单汉化失败", eCmdZh);
  }
  try {
    if (typeof registerIntegratedFlowComposerSlots === "function") {
      registerIntegratedFlowComposerSlots(ctx);
    }
  } catch (eDpDock) {
    console.warn("[dsh-mes-bridge] 一体化 composer 槽位注册失败", eDpDock);
  }
  // 附图缩略图 + 点击放大：即使 composer 槽注册失败也要装上（看历史气泡）
  try {
    if (typeof ctx.installVisionChatThumbnails === "function") {
      ctx.installVisionChatThumbnails();
    }
  } catch (eVisionThumbs) {
    console.warn("[dsh-mes-bridge] 附图预览增强失败", eVisionThumbs);
  }
  // 宿主 official overlay 槽（若本版 DSH 有声明则双保险）
  try {
    ctx.slots.inject("shell.overlay", function () {
      var regs = [
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "workbuddy-login",
            order: 1,
            priority: 1,
          },
          WorkBuddyAppLoginGate,
        ),
      ];
      if (typeof WorkBuddyMainViewOverlay === "function") {
        regs.push(
          ctx.slots.register(
            {
              name: "shell.overlay",
              id: "workbuddy-main-views",
              order: 2,
            },
            WorkBuddyMainViewOverlay,
          ),
        );
      }
      return regs;
    });
  } catch (eOverlay) {
    console.warn("[dsh-mes-bridge] shell.overlay 不可用，仅用 DOM 登录挡板", eOverlay);
  }
  // 会话切换守卫留在顶栏（不占视觉）；账号头像改挂侧栏底部
  try {
    ctx.slots.inject("conversation.session.header.utilities", function () {
      var chatStore = borrowChatStore(ctx.slots);
      var regs = [
        ctx.slots.register(
          {
            name: "conversation.session.header.utilities",
            id: "workbuddy-session-switch-guard",
            order: 0,
            store: chatStore || undefined,
          },
          WorkBuddySessionSwitchGuard,
        ),
      ];
      return regs;
    });
  } catch (eHeader) {
    console.warn("[dsh-mes-bridge] header.utilities 不可用", eHeader);
  }
  var dockedPanels =
    typeof wbSupportsDockedPanels === "function" ? !!wbSupportsDockedPanels(ctx) : false;
  // DSH 0.2.1+：资料库/用量进 sidebar.panellist，与知识库同槽对齐；无 docked 时回退 footer
  if (dockedPanels) {
    try {
      ctx.slots.inject("main", function () {
        var regs = [];
        if (typeof WorkBuddyLibraryMain === "function") {
          regs.push(
            ctx.slots.register({ name: "main", key: "workbuddy-library" }, WorkBuddyLibraryMain),
          );
        }
        if (typeof WorkBuddyUsageMain === "function") {
          regs.push(
            ctx.slots.register({ name: "main", key: "workbuddy-usage" }, WorkBuddyUsageMain),
          );
        }
        return regs;
      });
      ctx.slots.inject("sidebar.panellist", function () {
        var regs = [];
        if (typeof WorkBuddyLibraryPanelIcon === "function") {
          regs.push(
            ctx.slots.register(
              {
                name: "sidebar.panellist",
                id: "workbuddy-library",
                order: 80,
                label: function () {
                  return "资料库";
                },
              },
              WorkBuddyLibraryPanelIcon,
            ),
          );
        }
        if (typeof WorkBuddyUsagePanelIcon === "function") {
          regs.push(
            ctx.slots.register(
              {
                name: "sidebar.panellist",
                id: "workbuddy-usage",
                order: 90,
                label: function () {
                  return "用量";
                },
              },
              WorkBuddyUsagePanelIcon,
            ),
          );
        }
        return regs;
      });
    } catch (ePanel) {
      console.warn("[dsh-mes-bridge] sidebar.panellist 资料库/用量不可用", ePanel);
      dockedPanels = false;
    }
  }
  try {
    ctx.slots.inject("sidebar.footer.action", function () {
      var regs = [];
      if (!dockedPanels && typeof WorkBuddySidebarViewsNav === "function") {
        regs.push(
          ctx.slots.register(
            {
              name: "sidebar.footer.action",
              id: "workbuddy-sidebar-views",
              order: 600,
              label: "资料库与用量",
            },
            WorkBuddySidebarViewsNav,
          ),
        );
      }
      regs.push(
        ctx.slots.register(
          {
            name: "sidebar.footer.action",
            id: "workbuddy-account",
            order: 1000,
            label: "账号",
          },
          WorkBuddyHeaderLogout,
        ),
      );
      return regs;
    });
  } catch (eAccount) {
    console.warn("[dsh-mes-bridge] sidebar.footer.action 不可用", eAccount);
  }
  // 主路径：订阅 sessions.list，不依赖 header（知识库盖住 conversation 时顶栏守卫不存在）
  try {
    if (typeof ctx.effect === "function") {
      ctx.effect(function () {
        return installWorkBuddySessionSwitchWatcher(ctx);
      }, "workbuddy-session-switch-watcher");
    } else {
      installWorkBuddySessionSwitchWatcher(ctx);
    }
  } catch (eWatch) {
    console.warn("[dsh-mes-bridge] session-switch watcher 安装失败", eWatch);
  }
  try {
    if (typeof installProjectProfileWatcher === "function") {
      if (typeof ctx.effect === "function") {
        ctx.effect(function () {
          return installProjectProfileWatcher(ctx);
        }, "workbuddy-project-profile-watcher");
      } else {
        installProjectProfileWatcher(ctx);
      }
    }
  } catch (eProfile) {
    console.warn("[dsh-mes-bridge] 项目画像监听安装失败", eProfile);
  }
  try {
    var handoff =
      typeof ctx.installWorkbuddyPluginWorkspaceHandoff === "function"
        ? ctx.installWorkbuddyPluginWorkspaceHandoff
        : null;
    if (handoff) {
      if (typeof ctx.effect === "function") {
        ctx.effect(function () {
          return handoff(ctx);
        }, "workbuddy-plugin-workspace-handoff");
      } else {
        handoff(ctx);
      }
    }
  } catch (eHandoff) {
    console.warn("[dsh-mes-bridge] 资料库/用量 ↔ 插件工作区互斥失败", eHandoff);
  }
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      {
        name: "settings.section",
        id: "workbuddy",
        order: 5,
        label: "工作助手",
      },
      WorkBuddySettingsSection,
    );
  });
  // 宿主侧栏「远端审码 / Cursor 写码」并入 WorkBuddy 后常驻隐藏，避免双入口
  try {
    hideHostSettingsDupes();
  } catch (eHide) {
    console.warn("[dsh-mes-bridge] hideHostSettingsDupes", eHide);
  }
  // 「资料库」「用量」均为 conversation.view，与对话/轨迹同级 tab（不再弹框）
  // 宿主同一槽位多次 inject 会互相覆盖（与当初 sidebar.footer 丢「用量」同类）；必须一次 inject 返回多项 register
  try {
    ctx.slots.inject("conversation.view", function () {
      var regs = [];
      if (typeof WorkBuddySpaceView === "function") {
        regs.push(
          ctx.slots.register(
            {
              name: "conversation.view",
              id: "workbuddy-library",
              order: 15,
              label: "资料库",
            },
            WorkBuddySpaceView,
          ),
        );
      } else {
        console.warn("[dsh-mes-bridge] WorkBuddySpaceView 未就绪，跳过资料库页签");
      }
      if (typeof WorkBuddyUsageView === "function") {
        regs.push(
          ctx.slots.register(
            {
              name: "conversation.view",
              id: "workbuddy-usage",
              order: 20,
              label: "用量",
            },
            WorkBuddyUsageView,
          ),
        );
      } else {
        console.warn("[dsh-mes-bridge] WorkBuddyUsageView 未就绪，跳过用量页签");
      }
      return regs;
    });
  } catch (eViews) {
    console.warn("[dsh-mes-bridge] conversation.view 资料库/用量页不可用", eViews);
  }
  ctx.slots.inject("tool.call.toolview", function () {
    return ctx.slots.register(
      { name: "tool.call.toolview", key: "mes_code_review_begin" },
      CodeReviewBeginCard,
    );
  });
  ctx.slots.inject("tool.call.toolview", function () {
    return ctx.slots.register(
      { name: "tool.call.toolview", key: "mes_code_commit_begin" },
      CodeCommitBeginCard,
    );
  });
  ctx.slots.inject("tool.call.toolview", function () {
    return ctx.slots.register(
      { name: "tool.call.toolview", key: "mes_code_dev_begin" },
      CodeDevBeginCard,
    );
  });
  ctx.slots.inject("tool.call.toolview", function () {
    return ctx.slots.register(
      { name: "tool.call.toolview", key: "mes_code_deploy_begin" },
      CodeDeployConfirmCard,
    );
  });
  ctx.slots.inject("tool.call.toolview", function () {
    return ctx.slots.register(
      { name: "tool.call.toolview", key: "mes_code_deploy_prepare" },
      CodeDeployConfirmCard,
    );
  });
  ctx.slots.inject("tool.call.toolview", function () {
    return ctx.slots.register(
      { name: "tool.call.toolview", key: "mes_code_deploy_confirm" },
      CodeDeployConfirmCard,
    );
  });
  // 对话框内只挂 begin 一张流式卡；advance / confirm 不再出第二张
  if (typeof DevPipelineTimelineCard === "function") {
    ctx.slots.inject("tool.call.toolview", function () {
      return ctx.slots.register(
        { name: "tool.call.toolview", key: "mes_dev_pipeline_begin" },
        DevPipelineTimelineCard,
      );
    });
  }
  console.log(
    "[dsh-mes-bridge] app-login-gate + settings.section=WorkBuddy + conversation.view=资料库/用量 + toolview review/commit/code_dev/deploy/dev_pipeline",
  );
}

// 模块一加载就挂登录挡板（不等 slots / apply），保证打开 :3081 就能看到
try {
  ensureLoginGateMounted();
} catch (eEager) {
  console.error("[dsh-mes-bridge] 登录挡板预挂载失败", eEager);
}

  ctx.apply = apply;
}
