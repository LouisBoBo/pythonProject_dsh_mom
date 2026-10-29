import { maskVendorUiText } from "../ui-vendor-mask.js";

export function installDevPipeline(ctx) {
  var React = ctx.React,
    h = ctx.h,
    useState = ctx.useState,
    useEffect = ctx.useEffect,
    useMemo = ctx.useMemo,
    useRef = ctx.useRef;
  var engineBase = ctx.engineBase,
    fetchEngineApi = ctx.fetchEngineApi,
    ensureCss = ctx.ensureCss,
    readMeta = ctx.readMeta,
    authHeaders = ctx.authHeaders,
    resolveDshCwd = ctx.resolveDshCwd;

  function engineApi(path, opts) {
    var p = path.charAt(0) === "/" ? path : "/" + path;
    if (typeof fetchEngineApi === "function") return fetchEngineApi(p, opts || {});
    return fetch(String(engineBase()).replace(/\/$/, "") + p, opts || {});
  }

  function formatApiDetail(d, status) {
    if (!d) return status === 404 ? "引擎 API 不存在（请重启引擎并 Ctrl+F5）" : "切换失败";
    var det = d.detail;
    if (typeof det === "string") return det;
    if (Array.isArray(det) && det.length) return String(det[0].msg || det[0] || "切换失败");
    return String(d.detail || d.reply || "切换失败");
  }

  var DP_UI_REV = "2026-09-30p04-closing-md-body";

  /** 终态总结：嵌进助手 Markdown 正文（与普通聊天气泡同款 p/ul），禁止绿卡/独立报告块 */
  function dpClosingTextId(runId) {
    return "wb-dp-closing-text-" + String(runId || "anon").replace(/[^\w.-]/g, "_");
  }

  function dpRemoveClosingHost(runId) {
    if (typeof document === "undefined") return;
    try {
      var id = dpClosingTextId(runId);
      var el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      document.querySelectorAll("[data-wb-dp-closing-body],[data-wb-dp-closing-text]").forEach(function (n) {
        if (String(n.getAttribute("data-run-id") || "") === String(runId || "")) {
          if (n.parentNode) n.parentNode.removeChild(n);
        }
      });
    } catch (eRm) {}
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
      if (
        el.closest &&
        (el.closest("[data-wb-dp-closing-text]") ||
          el.closest(".wb-dp") ||
          el.closest("[data-wb-dp-closing-body]") ||
          el.closest("[data-composer-seat],[data-composer-card]"))
      ) {
        continue;
      }
      var t = String(el.textContent || "");
      if (t.indexOf(rid) < 0) continue;
      if (t.indexOf("需求") < 0 && t.indexOf("run_id") < 0 && t.indexOf("一体化") < 0) continue;
      if (t.indexOf("关键成果") >= 0 && t.indexOf("如何验证") >= 0) continue;
      if (t.length > 400) continue;
      if (!hit || t.length <= String(hit.textContent || "").length) hit = el;
    }
    return hit;
  }

  /** 找到与图二一致的 Markdown 正文容器（含 p/ul 的那一层） */
  function dpFindMarkdownRoot(hit) {
    if (!hit) return null;
    var el = hit;
    for (var d = 0; d < 12 && el; d++) {
      var cls = String(el.className || "");
      var hasBlockKids = false;
      try {
        hasBlockKids = !!(
          el.querySelector &&
          el.querySelector(":scope > p, :scope > ul, :scope > ol, :scope > h1, :scope > h2, :scope > h3")
        );
      } catch (eQ) {
        hasBlockKids = !!(el.querySelector && el.querySelector("p, ul"));
      }
      if (
        hasBlockKids ||
        /markdown|prose|md-body|message-content|MessageContent|bubble|chat-content/i.test(cls)
      ) {
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

    // 优先：插在「启动说明」段落后、操作栏前；宿主 display:contents，子节点吃 Markdown 样式
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
        var cls =
          String(sib.className || "") +
          " " +
          String(sib.getAttribute("role") || "");
        var hasBtn = false;
        try {
          hasBtn =
            !!(sib.matches && sib.matches("button")) ||
            !!sib.querySelector("button, [role='button']");
        } catch (eM) {}
        if (hasBtn || /action|feedback|toolbar|reaction|thumb|copy|footer/i.test(cls)) {
          return { parent: md, before: sib };
        }
        // 不要插到后续大段助手正文前面误伤；若下一段已是普通 p 且不含 run_id，插在 hit 后即可
        break;
      }
      return { parent: md, before: after.nextSibling };
    }
    return { parent: md, before: null };
  }

  function dpEnsureClosingTextHost(runId) {
    if (typeof document === "undefined") return null;
    try {
      document.querySelectorAll("[data-wb-dp-closing-body]").forEach(function (n) {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
    } catch (eOld) {}

    var id = dpClosingTextId(runId);
    var host = document.getElementById(id);
    var anchor = dpFindMessageTextAnchor(runId);
    // 找不到真正的消息 Markdown 根：不挂到输入框前（会变成整页报告，不像正文）
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
    items.forEach(function (line) {
      var li = document.createElement("li");
      var raw = maskVendorUiText(String(line || ""));
      // 「标签：内容」→ 标签加粗，贴近普通 Markdown 正文
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
      dpAppendText(host, "p", "关键成果：");
      dpAppendList(host, highlights);
    }
    if (verify.length) {
      dpAppendText(host, "p", "如何验证：");
      dpAppendList(host, verify);
    }
  }

  /** 底部时间线节点文案：第 5 步只显示「写代码」，不展示括号补充说明 */
  function dpRailCapLabel(title, stepId) {
    var t = maskVendorUiText(String(title || "").trim());
    if (String(stepId) === "5") {
      t = t.replace(/\s*[（(][^）)]*[）)]\s*/g, " ").replace(/\s+/g, " ").trim();
    }
    return t || "步骤 " + String(stepId || "");
  }

  // 同一 run 只允许对话框里挂一张流式卡（防 begin 连调 / 旧 advance 槽位叠卡）
  var dpLiveOwners =
    (typeof globalThis !== "undefined" && globalThis.__wbDpLiveOwners) ||
    (typeof globalThis !== "undefined"
      ? (globalThis.__wbDpLiveOwners = Object.create(null))
      : Object.create(null));

  function dpStatusLabel(st) {
    var s = String(st || "");
    if (s === "pass") return "完成";
    if (s === "running") return "执行中";
    if (s === "waiting_hitl") return "待你确认";
    if (s === "waiting_user") return "待处理";
    if (s === "fail" || s === "failed") return "失败";
    if (s === "pending") return "未开始";
    if (s === "skipped") return "跳过";
    if (s === "queued") return "排队中";
    if (s === "paused") return "已暂停";
    if (s === "cancelling") return "正在停止";
    if (s === "cancelled" || s === "canceled") return "已停止";
    if (s === "rollback") return "回退";
    if (s === "done") return "已结束";
    if (s === "syncing") return "同步中";
    return s || "未开始";
  }

  function dpRunLiveLike(status) {
    var s = String(status || "");
    return (
      s === "running" ||
      s === "queued" ||
      s === "paused" ||
      s === "cancelling"
    );
  }

  function dpRunFinished(status, outcome) {
    var st = String(status || "");
    var oc = String(outcome || "");
    return (
      st === "done" ||
      st === "failed" ||
      st === "cancelled" ||
      st === "canceled" ||
      oc === "success" ||
      oc === "failed" ||
      oc === "cancelled"
    );
  }

  /** 聊天落库的旧 toolview 勿盖掉引擎已拉到的更新（历史卡假「执行中 0/10」根因） */
  function dpUiDoneCount(ui) {
    var steps = (ui && ui.steps) || [];
    var n = 0;
    for (var i = 0; i < steps.length; i++) {
      var st = String((steps[i] && steps[i].status) || "");
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
    var prevUp = Number(prev.updated_at || (prev.run_summary && prev.run_summary.finished_at) || 0) || 0;
    var nextUp = Number(next.updated_at || (next.run_summary && next.run_summary.finished_at) || 0) || 0;
    if (nextUp > prevUp) return next;
    if (prevUp > nextUp) return prev;
    // 引擎侧有真实 status，聊天快照常缺省/pending
    if (dpRunLiveLike(prev.status) && !dpRunLiveLike(next.status) && String(next.status || "")) {
      return next;
    }
    if (!String(prev.status || "") && String(next.status || "")) return next;
    return next;
  }

  /** 单步起点缓存：引擎未下发 started_at 时，卡片首次见到 running 起算 */
  var dpStepStartCache =
    (typeof globalThis !== "undefined" && globalThis.__wbDpStepStartCache) ||
    (typeof globalThis !== "undefined"
      ? (globalThis.__wbDpStepStartCache = Object.create(null))
      : Object.create(null));

  function dpStepStartKey(runId, sid, visitSeq) {
    return String(runId || "") + ":" + String(sid || "") + ":" + String(visitSeq || "");
  }

  function dpStepElapsedSec(st, receipt, stStatus, runId, visitSeq) {
    var rec = receipt || {};
    if (rec.duration_sec != null && String(rec.duration_sec) !== "") {
      var done = Math.floor(Number(rec.duration_sec));
      if (!isNaN(done) && done >= 0) return done;
    }
    var start =
      Number(rec.started_at || (st && st.started_at) || 0) || 0;
    var key = dpStepStartKey(runId, st && st.step_id, visitSeq);
    var live =
      stStatus === "running" ||
      stStatus === "waiting_hitl" ||
      stStatus === "waiting_user" ||
      stStatus === "queued";
    if (start) {
      dpStepStartCache[key] = start;
    } else if (live) {
      if (!dpStepStartCache[key]) {
        dpStepStartCache[key] = Math.floor(Date.now() / 1000);
      }
      start = dpStepStartCache[key];
    } else {
      start = Number(dpStepStartCache[key] || 0) || 0;
    }
    if (!start) return null;
    var end = Number(rec.finished_at || 0) || 0;
    if (end > start) return end - start;
    if (live) return Math.max(0, Math.floor(Date.now() / 1000) - start);
    return null;
  }

  function dpStepStatusTerminal(stStatus) {
    var s = String(stStatus || "");
    return (
      s === "pass" ||
      s === "fail" ||
      s === "failed" ||
      s === "cancelled" ||
      s === "canceled" ||
      s === "rollback" ||
      s === "done"
    );
  }

  function dpStatusWithDuration(stStatus, st, receipt, runId, visitSeq) {
    var label = dpStatusLabel(stStatus);
    if (
      stStatus === "pending" ||
      stStatus === "skipped" ||
      !stStatus
    ) {
      return label;
    }
    var sec = dpStepElapsedSec(st, receipt, stStatus, runId, visitSeq);
    if (sec == null) return label;
    if (dpStepStatusTerminal(stStatus) && sec < 1) sec = 1;
    return label + " · " + dpFmtDuration(sec);
  }

  function dpFormatReviewDisplay(text) {
    var t = String(text || "")
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n")
      .trim();
    if (!t) return "";
    var lineCount = t.split("\n").length;
    if (lineCount >= 4) return t;
    var labels = [
      "代码审核汇总报告",
      "一、总体评价",
      "二、详细问题清单",
      "三、",
      "四、审核结论",
      "审核文件：",
      "审核日期：",
      "审核人：",
      "工程路径：",
      "状态：",
      "摘要：",
      "判定说明：",
      "失败对照：",
      "报告 ID：",
      "范围：",
      "文件：",
    ];
    for (var i = 0; i < labels.length; i++) {
      var lab = labels[i];
      if (t.indexOf(lab) < 0) continue;
      t = t.split(lab).join("\n" + lab);
    }
    t = t.replace(/\s*---\s*/g, "\n---\n");
    t = t.replace(/审核文件：([^\n]{80,})/g, function (_m, files) {
      var parts = files.split("、").map(function (x) {
        return x.trim();
      }).filter(Boolean);
      if (parts.length <= 4) return "审核文件：" + files;
      return "审核文件：\n" + parts.map(function (p) {
        return "· " + p;
      }).join("\n");
    });
    t = t.replace(/文件：([^\n]{60,})/g, function (_m, files) {
      if (files.indexOf("、") < 0) return "文件：" + files;
      var parts = files.split("、").map(function (x) {
        return x.trim();
      }).filter(Boolean);
      return "文件：\n" + parts.map(function (p) {
        return "· " + p;
      }).join("\n");
    });
    t = t.replace(/([。；])\s*(?=-\s*[🔴🟡🟢])/g, "$1\n");
    t = t.replace(/-\s*(🔴|🟡|🟢)/g, "\n- $1");
    t = t.replace(/(🟡|🟢|🔴)\s*(中危|低危|高危)\s*问题/g, "\n$1 $2 问题");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.replace(/^\n+/, "").trim();
  }

  function dpExtractReviewOverall(text) {
    var t = String(text || "").trim();
    if (!t) return "";
    var marker = "一、总体评价";
    var pos = t.indexOf(marker);
    if (pos < 0) {
      // 仅识别风险三行 / 完整报告；「执行中…」等占位不得当 overall（会与 body 双份）
      if (/高危问题/.test(t) && /中危问题/.test(t)) return t.slice(0, 800);
      if (t.indexOf("代码审核汇总报告") >= 0) return t.slice(0, 480);
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
      if (ln.indexOf("---") === 0 || ln.indexOf("二、") === 0) break;
      // 跳过 Viprasol 技术元信息，只留高/中/低危
      if (/^已按\s/.test(ln) || /^>\s*审码元信息/.test(ln)) continue;
      if (/本次审核共发现/.test(ln) || /^所有问题均基于/.test(ln)) break;
      lines.push(ln);
    }
    return lines.join("\n") || t.slice(0, 480);
  }

  /** 图二：高/中/低危三行 + 彩色圆点 */
  function dpParseRiskRows(text) {
    var rows = [];
    String(text || "")
      .split("\n")
      .forEach(function (ln) {
        var s = ln.trim().replace(/^[-•]\s*/, "");
        s = s.replace(/^[🔴🟡🟢]\s*/, "");
        var m = s.match(/^(高危|中危|低危)问题[：:]\s*(.+)$/);
        if (!m) return;
        var band = m[1];
        var level =
          band === "高危" ? "high" : band === "中危" ? "medium" : "low";
        rows.push({ level: level, label: band + "问题", body: m[2] });
      });
    return rows;
  }

  function dpRenderRiskOverview(text) {
    var rows = dpParseRiskRows(text);
    if (!rows.length) return null;
    return h(
      "div",
      { className: "wb-dp-risk-overview" },
      rows.map(function (r, i) {
        return h(
          "div",
          {
            key: "risk-" + r.level + "-" + i,
            className: "wb-dp-risk-row is-" + r.level,
          },
          [
            h("span", {
              className: "wb-dp-risk-orb is-" + r.level,
              "aria-hidden": "true",
            }),
            h("div", { className: "wb-dp-risk-text" }, [
              h("b", { className: "wb-dp-risk-label" }, r.label + "："),
              h(
                "span",
                { className: "wb-dp-risk-body" },
                String(r.body || "")
                  .split(/(\d+)/)
                  .map(function (p, j) {
                    if (/^\d+$/.test(p)) return h("b", { key: "n-" + j }, p);
                    return p;
                  }),
              ),
            ]),
          ],
        );
      }),
    );
  }

  function dpDedupeReviewDetail(detail) {
    var t = String(detail || "");
    if (!t) return "";
    var head = "代码审核汇总报告";
    var second = t.indexOf(head, head.length);
    if (second > 0) return t.slice(0, second).trim();
    var marker = "一、总体评价";
    var first = t.indexOf(marker);
    if (first < 0) return t;
    var again = t.indexOf(marker, first + marker.length);
    if (again > 0) return t.slice(0, again).trim();
    return t;
  }

  function dpExtractReviewReportBlob(text) {
    var t = String(text || "")
      .replace(/\\n/g, "\n")
      .replace(/\r\n/g, "\n");
    var marker = "代码审核汇总报告";
    var pos = t.indexOf(marker);
    if (pos >= 0) return t.slice(pos).trim();
    var sumPos = t.indexOf("摘要：");
    if (sumPos >= 0) {
      var after = t.slice(sumPos + 3).trim();
      if (after.indexOf(marker) >= 0) return after;
    }
    return "";
  }

  function dpResolveReviewStepStatus(st, receipt, resultDetail) {
    var s = String(
      (st && st.status) || (receipt && receipt.status) || "",
    ).trim();
    if (
      s === "pass" ||
      s === "skipped" ||
      s === "fail" ||
      s === "failed" ||
      s === "running" ||
      s === "waiting_hitl" ||
      s === "waiting_user"
    ) {
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
    if (s === "pass" || s === "skipped") return "审核结果：通过";
    if (s === "fail" || s === "failed") return "审核结果：不通过";
    if (s === "running") return "审核结果：审阅中…";
    if (s === "waiting_hitl" || s === "waiting_user") return "审核结果：待确认";
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
      if (
        last === "所有问题均基于" ||
        (last.indexOf("所有问题均基于") === 0 &&
          last.length < 48 &&
          last.indexOf("。") < 0)
      ) {
        lines.pop();
        continue;
      }
      if (/^已按 .+重审/.test(last) && last.indexOf("。") < 0) {
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
      if (trim === "一、总体评价") {
        out.push(ln);
        if (verdict) out.push(verdict);
        // 保留图二高/中/低危行，丢掉 Viprasol「已按…重审」技术摘要
        i += 1;
        while (i < lines.length) {
          var cur = lines[i].trim();
          if (
            cur === "---" ||
            cur.indexOf("二、") === 0 ||
            cur.indexOf("本次审核共发现") === 0 ||
            cur.indexOf("四、审核结论") === 0
          ) {
            break;
          }
          if (
            /高危问题|中危问题|低危问题/.test(cur) ||
            /^[🔴🟡🟢]/.test(cur)
          ) {
            out.push(lines[i]);
          }
          i += 1;
        }
        continue;
      }
      // 结论区再出现的风险行保留；跳过审码元信息脚注
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
      lines.map(function (ln, i) {
        return h(
          "div",
          { key: "ln-" + i, className: "wb-dp-text-line" },
          ln === "" ? "\u00a0" : ln,
        );
      }),
    );
  }

  function dpStepResultView(sid, st, evidence, resultDetail, stepStatus) {
    var stepId = String(sid || "");
    var summaryRaw = String((st && st.summary) || "").trim();
    var detail = dpDedupeReviewDetail(resultDetail);
    var reportBody = String((evidence && evidence.report_body) || "").trim();
    if (stepId === "7") {
      var embedded = dpExtractReviewReportBlob(detail);
      // 报告优先；禁止把「执行中…」占位塞进 riskText/body（会双份）
      var source = String(reportBody || embedded || "").trim();
      if (
        !source &&
        /高危问题|代码审核汇总报告|一、总体评价|存在\s*\d+\s*处高危/.test(
          summaryRaw,
        )
      ) {
        source = summaryRaw;
      }
      var fullReport = source
        ? dpFormatReviewDisplay(maskVendorUiText(source))
        : "";
      var resolved = stepStatus;
      // 有高危文案时前端也不得显示「通过」
      if (
        /高危问题：共\s*[1-9]|❌\s*审核不通过|存在高危/.test(
          fullReport + "\n" + summaryRaw,
        )
      ) {
        resolved = "fail";
      }
      var verdict = dpReviewVerdict(resolved);
      var riskText = fullReport ? dpExtractReviewOverall(fullReport) : "";
      if (!dpParseRiskRows(riskText).length) {
        riskText =
          /高危问题/.test(summaryRaw) && dpParseRiskRows(summaryRaw).length
            ? summaryRaw
            : "";
      }
      var body = fullReport
        ? dpPipelineReviewReport(fullReport, resolved)
        : "";
      // 风险卡已展示三行时，正文去掉总体评价区，避免重复；保留「二、详细问题」
      if (body && dpParseRiskRows(riskText).length) {
        body = body
          .split("\n")
          .filter(function (ln) {
            var t = ln.trim().replace(/^[🔴🟡🟢]\s*/, "");
            if (t === "一、总体评价") return false;
            if (/^审核结果[：:]/.test(t)) return false;
            if (/^(高危|中危|低危)问题/.test(t)) return false;
            return true;
          })
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      }
      return {
        lead: maskVendorUiText(verdict),
        riskText: maskVendorUiText(riskText),
        body: maskVendorUiText(body),
        meta: "",
        isReview: true,
      };
    }
    return {
      lead: maskVendorUiText(summaryRaw),
      riskText: "",
      body: "",
      meta: maskVendorUiText(detail),
      isReview: false,
    };
  }

  function dpFmtDuration(sec) {
    var n = Math.max(0, Math.floor(Number(sec) || 0));
    if (n < 60) return n + " 秒";
    var m = Math.floor(n / 60);
    var s = n % 60;
    if (m < 60) return s ? m + " 分 " + s + " 秒" : m + " 分";
    var h = Math.floor(m / 60);
    m = m % 60;
    return h + " 小时 " + m + " 分";
  }

  function dpMergeTraceStep(entry, stepsById) {
    var sid = String((entry && entry.step_id) || "");
    var base = (stepsById && stepsById[sid]) || {};
    var rec = entry.receipt || base.receipt || {};
    var ev = rec.evidence || {};
    var entrySt = String((entry && entry.status) || "");
    var baseSt = String(base.status || "");
    // 账本已终态时优先用 steps（取消后 trace 可能仍残留 running）
    var status = entrySt || baseSt;
    if (
      (baseSt === "cancelled" ||
        baseSt === "canceled" ||
        baseSt === "pass" ||
        baseSt === "fail" ||
        baseSt === "failed") &&
      (entrySt === "running" ||
        entrySt === "queued" ||
        entrySt === "waiting_hitl" ||
        entrySt === "waiting_user" ||
        !entrySt)
    ) {
      status = baseSt;
    }
    return {
      step_id: sid,
      visit_seq: entry.seq,
      implement_attempt: entry.implement_attempt || 1,
      title: maskVendorUiText(entry.title || base.title || ""),
      status: status,
      summary: maskVendorUiText(
        status === "cancelled" || status === "canceled"
          ? base.summary || entry.summary || "已停止"
          : entry.summary || base.summary,
      ),
      receipt: rec,
      skill_id: base.skill_id || rec.skill_id || (ev.skill && ev.skill.id) || "",
      skill_title: maskVendorUiText(
        base.skill_title || rec.skill_title || (ev.skill && ev.skill.title_zh) || "",
      ),
      flow_brief: maskVendorUiText(
        base.flow_brief || (ev.skill && ev.skill.flow_brief) || "",
      ),
      result_detail: maskVendorUiText(rec.result_detail || ev.result_detail || ""),
    };
  }

  function dpRailNodeHappened(st) {
    var s = String(st || "");
    return (
      !!s &&
      s !== "pending" &&
      s !== "queued"
    );
  }

  /** 轨道：按访问顺序展示已发生节点（含回退后重跑）；禁止按 step_id 去重抹掉 6/7/8。 */
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
            display_step: "↩",
          }),
        );
        continue;
      }
      var sid = String(n.step_id || "");
      if (!sid || sid === "rollback") continue;
      if (!dpRailNodeHappened(n.status)) continue;
      out.push(
        Object.assign({}, n, {
          display_step: String(n.display_step || sid),
          kind: "step",
        }),
      );
    }
    return out;
  }

  function dpTrimRailNodes(nodes, finished) {
    void finished;
    return dpCollapseRailNodes(nodes);
  }

  /**
   * 过程流：按时间顺序保留全部访问（含回退后再次写码）；
   * 打回横幅保留；禁止 splice 掉已走过的 6/7/8。
   */
  function dpCollapseStreamItems(items) {
    var out = [];
    (items || []).forEach(function (item) {
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
      else if (
        rs === "running" ||
        rs === "waiting_hitl" ||
        rs === "waiting_user"
      ) {
        filled += 0.45;
        break;
      } else if (rs === "fail" || rs === "failed" || rs === "cancelled" || rs === "canceled") {
        filled += 0.45;
        break;
      } else break;
    }
    if (!stepCount) stepCount = nodesLen;
    var pct = stepCount ? Math.min(100, Math.round((filled / stepCount) * 100)) : 0;
    return { pct: pct, stepCount: stepCount };
  }

  function dpBuildStreamItems(ui, steps) {
    var trace = (ui && ui.timeline_trace) || [];
    var byId = {};
    (steps || []).forEach(function (s) {
      if (s && s.step_id) byId[String(s.step_id)] = s;
    });
    if (!trace.length) {
      return dpCollapseStreamItems(
        (steps || [])
          .filter(function (s) {
            return s.status && s.status !== "pending";
          })
          .map(function (s) {
            return { kind: "step", visit_seq: s.step_id, step: s };
          }),
      );
    }
    var out = [];
    trace.forEach(function (e) {
      if (!e) return;
      if (e.kind === "rollback") {
        out.push({
          kind: "rollback",
          visit_seq: e.seq,
          label: e.label || "打回写码",
        });
        return;
      }
      if (e.kind !== "step") return;
      if (!e.status || e.status === "pending") return;
      out.push({
        kind: "step",
        visit_seq: e.seq,
        step: dpMergeTraceStep(e, byId),
      });
    });
    return dpCollapseStreamItems(out);
  }

  function dpStepLogs(st, logsMap) {
    var sid = st && st.step_id;
    var fromLive = (logsMap && sid && logsMap[sid]) || [];
    var fromReceipt =
      (st &&
        st.receipt &&
        st.receipt.evidence &&
        st.receipt.evidence.process_log) ||
      [];
    var picked =
      fromLive.length >= fromReceipt.length ? fromLive : fromReceipt.slice();
    return picked.map(function (ln) {
      return maskVendorUiText(ln);
    });
  }

  function dpFmtTs(ts) {
    var n = Number(ts) || 0;
    if (!n) return "";
    try {
      return new Date(n * 1000).toLocaleString("zh-CN", { hour12: false });
    } catch (e) {
      return String(n);
    }
  }

  function DevPipelineTimelineCard(props) {
    ensureCss();
    var block = props.block;
    var wb = useMemo(function () {
      return readMeta(block);
    }, [block]);
    var ui0 = (wb && wb.ui) || {};
    var runId = String(
      (ui0 && ui0.run_id) || (wb && wb.run_id) || props.runId || "",
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
    // 用户点时间线查看某步后禁止再自动贴底，避免滚到步骤卡又被拽回底部
    var followStreamRef = useRef(true);
    var followRailRef = useRef(true);
    var ownerRef = useRef("dp-" + Math.random().toString(36).slice(2, 10));
    var serverSyncedRef = useRef(false);
    var alignToggleOnceRef = useRef("");

    useEffect(
      function () {
        followStreamRef.current = true;
        followRailRef.current = true;
        serverSyncedRef.current = false;
        alignToggleOnceRef.current = "";
      },
      [runId],
    );

    useEffect(
      function () {
        if (!runId) {
          setPrimary(true);
          return;
        }
        var owner = ownerRef.current;
        var cur = dpLiveOwners[runId];
        if (!cur) {
          dpLiveOwners[runId] = owner;
          setPrimary(true);
        } else if (cur === owner) {
          setPrimary(true);
        } else {
          setPrimary(false);
        }
        return function () {
          if (dpLiveOwners[runId] === owner) {
            delete dpLiveOwners[runId];
          }
        };
      },
      [runId],
    );

    function alignToggleWithPipelineUi(nextUi) {
      try {
        var rid = String((nextUi && nextUi.run_id) || runId || "").trim();
        if (!rid || alignToggleOnceRef.current === rid) return;
        var sid = "";
        try {
          sid = String(
            (nextUi && nextUi.dsh_session_id) ||
              resolveIntegratedFlowSessionId({}) ||
              "",
          ).trim();
        } catch (eSid) {
          sid = "";
        }
        if (!sid) return;
        var runSid = String((nextUi && nextUi.dsh_session_id) || "").trim();
        if (runSid && runSid !== sid) return;
        alignToggleOnceRef.current = rid;
        writeIntegratedFlowCache(sid, true);
        try {
          globalThis.__wbIntegratedFlowOn = true;
          if (typeof document !== "undefined" && document.documentElement) {
            document.documentElement.classList.add("wb-integrated-flow-on");
          }
        } catch (eFlag) {}
        try {
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent("wb-integrated-flow-changed", {
                detail: { on: true, fromPipelineCard: true, sessionId: sid },
              }),
            );
          }
        } catch (eEv) {}
        engineApi(
          "/api/dev-pipeline/sessions/" + encodeURIComponent(sid) + "/integrated",
          {
            method: "PUT",
            headers: Object.assign(
              { "Content-Type": "application/json" },
              authHeaders(),
            ),
            body: JSON.stringify({ enabled: true }),
          },
        ).catch(function () {});
      } catch (eAlign) {}
    }

    function mergeUiFromServer(d) {
      if (d && d.dev_pipeline_ui) {
        serverSyncedRef.current = true;
        setUi(function (prev) {
          return dpPreferUi(prev, d.dev_pipeline_ui);
        });
        seedLogsFromUi(d.dev_pipeline_ui);
        alignToggleWithPipelineUi(d.dev_pipeline_ui);
        return;
      }
      if (d && d.ok === false) {
        serverSyncedRef.current = true;
        setUi(function (prev) {
          var base = prev && typeof prev === "object" ? Object.assign({}, prev) : {};
          base.status = "cancelled";
          base.outcome = "cancelled";
          base.run_summary = Object.assign({}, base.run_summary || {}, {
            title: "已停止 · 记录不可用",
            tone: "warn",
            status: "cancelled",
            outcome: "cancelled",
            live: false,
          });
          return base;
        });
      }
    }

    function seedLogsFromUi(nextUi) {
      var steps = (nextUi && nextUi.steps) || [];
      setLogs(function (prev) {
        var out = Object.assign({}, prev);
        steps.forEach(function (st) {
          var sid = st.step_id;
          var pl =
            (st.receipt && st.receipt.evidence && st.receipt.evidence.process_log) ||
            [];
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
      // 顶栏已选工作区：账本空时一并带上，避免「明明选了却报本地目录不能为空」
      if (!String(body.workspace || "").trim()) {
        var dshWs =
          (typeof resolveDshCwd === "function" && resolveDshCwd(props)) ||
          String((ui && ui.workspace) || "").trim();
        if (dshWs) body.workspace = dshWs;
      }
      engineApi(
        "/api/dev-pipeline/runs/" +
          encodeURIComponent(runId) +
          "/confirm-step",
        {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify(body),
        },
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d && d.ok === false) {
            setErrMsg(String(d.detail || "确认失败"));
            return;
          }
          mergeUiFromServer(d);
        })
        .catch(function () {
          setErrMsg("确认请求失败，请稍后重试");
        })
        .finally(function () {
          setBusy("");
        });
    }

    function cancelRun() {
      if (!runId || busy) return;
      setBusy("cancel");
      setErrMsg("");
      engineApi(
        "/api/dev-pipeline/runs/" +
          encodeURIComponent(runId) +
          "/cancel",
        {
          method: "POST",
          headers: Object.assign(
            { "Content-Type": "application/json" },
            authHeaders(),
          ),
          body: JSON.stringify({ reason: "用户点击停止任务" }),
        },
      )
        .then(function (r) {
          return r.json().then(function (d) {
            return { okHttp: r.ok, d: d };
          });
        })
        .then(function (x) {
          if (x.d && x.d.dev_pipeline_ui) mergeUiFromServer(x.d);
          else if (!x.okHttp || (x.d && x.d.ok === false)) {
            setErrMsg(
              String((x.d && (x.d.detail || x.d.reply)) || "停止失败"),
            );
          }
        })
        .catch(function (e) {
          setErrMsg(String((e && e.message) || e || "停止失败"));
        })
        .finally(function () {
          setBusy("");
        });
    }

    function retryStep(stepId) {
      if (!runId || busy) return;
      setBusy("retry-" + stepId);
      setErrMsg("");
      var retryBody = { step_id: stepId };
      var dshWs =
        (typeof resolveDshCwd === "function" && resolveDshCwd(props)) ||
        String((ui && ui.workspace) || "").trim();
      if (dshWs) retryBody.workspace = dshWs;
      engineApi(
        "/api/dev-pipeline/runs/" +
          encodeURIComponent(runId) +
          "/advance",
        {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, authHeaders()),
          body: JSON.stringify(retryBody),
        },
      )
        .then(function (r) {
          return r.json();
        })
        .then(function (d) {
          if (d && d.ok === false) {
            setErrMsg(String(d.detail || "重试失败"));
            return;
          }
          mergeUiFromServer(d);
        })
        .catch(function () {
          setErrMsg("重试请求失败，请稍后重试");
        })
        .finally(function () {
          setBusy("");
        });
    }

    useEffect(function () {
      if (!ui0 || !ui0.run_id) return;
      if (serverSyncedRef.current) {
        setUi(function (prev) {
          return dpPreferUi(prev, ui0);
        });
        return;
      }
      setUi(ui0);
      seedLogsFromUi(ui0);
    }, [ui0]);

    useEffect(function () {
      if (!runId || !isPrimary) return;
      var es = null;
      function connectStream() {
        var url =
          String(engineBase()).replace(/\/$/, "") +
          "/api/dev-pipeline/runs/" +
          encodeURIComponent(runId) +
          "/stream";
        try {
          if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
          }
        } catch (e0) {}
        es = new EventSource(url);
        esRef.current = es;
        es.onmessage = function (ev) {
        try {
          var data = JSON.parse(ev.data || "{}");
          if (data.type === "snapshot" && data.ui) {
            serverSyncedRef.current = true;
            setUi(function (prev) {
              return dpPreferUi(prev, data.ui);
            });
            seedLogsFromUi(data.ui);
            alignToggleWithPipelineUi(data.ui);
            return;
          }
          if (data.type === "step" && data.step_id && data.phase === "running") {
            setUi(function (prev) {
              var base = Object.assign({}, prev || {});
              base.current_step = data.step_id;
              base.status = "running";
              base.steps = (base.steps || []).map(function (st) {
                if (st.step_id === data.step_id) {
                  return Object.assign({}, st, { status: "running", summary: "执行中…" });
                }
                return st;
              });
              return base;
            });
            return;
          }
          if (data.type === "log" && data.step_id) {
            var sid = data.step_id;
            setLogs(function (prev) {
              var next = Object.assign({}, prev);
              var arr = (next[sid] || []).slice();
              arr.push(String(data.message || ""));
              next[sid] = arr;
              return next;
            });
            return;
          }
          if (data.type === "receipt" && data.receipt) {
            setUi(function (prev) {
              var base = prev && typeof prev === "object" ? Object.assign({}, prev) : {};
              var steps = (base.steps || []).map(function (st) {
                if (st.step_id === data.receipt.step_id) {
                  return Object.assign({}, st, {
                    status: data.receipt.status,
                    summary: data.receipt.summary,
                    receipt: data.receipt,
                  });
                }
                return st;
              });
              base.steps = steps;
              base.current_step = data.receipt.step_id;
              return base;
            });
            var pl =
              (data.receipt.evidence && data.receipt.evidence.process_log) || [];
            if (pl.length) {
              setLogs(function (prev) {
                var next = Object.assign({}, prev);
                next[data.receipt.step_id] = pl.slice();
                return next;
              });
            }
            return;
          }
          if (data.type === "run") {
            setUi(function (prev) {
              var base = Object.assign({}, prev || {});
              if (data.phase) base.status = data.phase;
              if (data.outcome) base.outcome = data.outcome;
              if (data.current_step) base.current_step = data.current_step;
              if (data.run_summary) base.run_summary = data.run_summary;
              // 终态：同步当前步摘要，避免总标题已「已停止」而结果仍「执行中…」
              var phase = String(data.phase || "");
              if (
                (phase === "cancelled" ||
                  phase === "canceled" ||
                  phase === "done" ||
                  phase === "failed") &&
                data.current_step
              ) {
                base.steps = (base.steps || []).map(function (st) {
                  if (String(st.step_id) !== String(data.current_step)) return st;
                  if (
                    st.status === "running" ||
                    st.status === "waiting_hitl" ||
                    st.status === "waiting_user" ||
                    st.status === "queued" ||
                    st.summary === "执行中…"
                  ) {
                    return Object.assign({}, st, {
                      status:
                        phase === "cancelled" || phase === "canceled"
                          ? "cancelled"
                          : phase === "failed"
                            ? "fail"
                            : st.status,
                      summary:
                        phase === "cancelled" || phase === "canceled"
                          ? String(
                              (data.run_summary && data.run_summary.title) ||
                                st.summary ||
                                "已停止",
                            )
                          : st.summary,
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
            setUi(function (prev) {
              return Object.assign({}, prev || {}, {
                status: data.run.status,
                outcome: data.run.outcome,
                steps: data.run.steps || (prev && prev.steps),
                current_step: data.run.current_step,
                run_summary: data.run_summary || data.run.run_summary || (prev && prev.run_summary),
              });
            });
            if (data.run && data.run.steps) seedLogsFromUi({ steps: data.run.steps });
          }
        } catch (eParse) {}
        };
      }
      if (typeof fetchEngineApi === "function") {
        fetchEngineApi("/api/runtime").finally(connectStream);
      } else {
        connectStream();
      }
      return function () {
        try {
          if (es) es.close();
        } catch (e1) {}
        esRef.current = null;
      };
    }, [runId, isPrimary]);

    // 历史卡也必须拉引擎真相：禁止仅 primary 才 GET（叠卡/重挂会永远停在 toolview 开跑瞬间）
    useEffect(function () {
      if (!runId) return;
      var cancelled = false;
      function pullOnce() {
        return engineApi("/api/dev-pipeline/runs/" + encodeURIComponent(runId), {
          headers: authHeaders(),
        })
          .then(function (r) {
            return r.json().then(function (d) {
              return { okHttp: r.ok, status: r.status, d: d };
            });
          })
          .then(function (pack) {
            if (cancelled) return;
            var d = pack.d || {};
            if (d && d.dev_pipeline_ui) {
              mergeUiFromServer(d);
              return;
            }
            if (!pack.okHttp || (d && d.ok === false)) {
              mergeUiFromServer({
                ok: false,
                detail: (d && d.detail) || "run 不存在",
              });
            }
          })
          .catch(function () {});
      }
      pullOnce();
      var poll = setInterval(function () {
        if (cancelled) return;
        var st = "";
        try {
          st = String((ui && ui.status) || "");
        } catch (eSt) {}
        // 用闭包外最新：进行中才轮询；终态停
        engineApi("/api/dev-pipeline/runs/" + encodeURIComponent(runId), {
          headers: authHeaders(),
        })
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            if (cancelled) return;
            if (d && d.dev_pipeline_ui) {
              mergeUiFromServer(d);
              var st2 = String(d.dev_pipeline_ui.status || "");
              if (dpRunFinished(st2, d.dev_pipeline_ui.outcome)) {
                try {
                  clearInterval(poll);
                } catch (eClr) {}
              }
            }
          })
          .catch(function () {});
        void st;
      }, 2500);
      return function () {
        cancelled = true;
        try {
          clearInterval(poll);
        } catch (eP) {}
      };
    }, [runId]);

    var _tick = useState(0);
    var tick = _tick[0];
    var setTick = _tick[1];

    useEffect(
      function () {
        if (!isPrimary) return undefined;
        var st = (ui && ui.status) || "";
        var oc = (ui && ui.outcome) || "";
        // 取消/失败终态必须停表，否则步骤头会一直「执行中 · N 分」
        var live =
          st === "running" ||
          st === "queued" ||
          st === "paused" ||
          st === "cancelling";
        if (
          st === "done" ||
          st === "failed" ||
          st === "cancelled" ||
          st === "canceled" ||
          oc === "success" ||
          oc === "failed" ||
          oc === "cancelled"
        ) {
          live = false;
        }
        if (!live) return undefined;
        var t = setInterval(function () {
          setTick(function (n) {
            return (n + 1) % 100000;
          });
        }, 1000);
        return function () {
          clearInterval(t);
        };
      },
      [isPrimary, ui && ui.status, ui && ui.outcome],
    );

    var steps = (ui && ui.steps) || [];
    var outcome = ui && ui.outcome;
    var status = ui && ui.status;
    var cur = ui && ui.current_step;
    var runSummary = (ui && ui.run_summary) || {};
    var doneCount = steps.filter(function (s) {
      return s.status === "pass" || s.status === "skipped";
    }).length;
    var total = steps.length || 10;
    var finished = dpRunFinished(status, outcome);
    var liveLike = dpRunLiveLike(status);
    var canCancel = !finished && liveLike;
    var streamItems = dpBuildStreamItems(ui, steps);
    var visibleSteps = streamItems
      .filter(function (it) {
        return it.kind === "step";
      })
      .map(function (it) {
        return it.step;
      });
    // 禁止 status 空/pending 时写成「正在执行」却徽章「未开始」（历史 toolview 未同步）
    var statusForBadge = String(status || runSummary.status || "").trim();
    if (!statusForBadge) {
      statusForBadge = serverSyncedRef.current
        ? finished
          ? "done"
          : "syncing"
        : "syncing";
    } else if (statusForBadge === "pending" && !liveLike && !finished) {
      statusForBadge = serverSyncedRef.current ? "cancelled" : "syncing";
    }
    var headLine = finished
      ? runSummary.title ||
        (outcome === "success"
          ? "全流程完成"
          : outcome === "cancelled" ||
              status === "cancelled" ||
              status === "canceled"
            ? "已停止"
            : "已结束")
      : status === "cancelling"
        ? "正在停止…"
        : status === "paused"
          ? "已停在第 " + (cur || "—") + " 步"
          : liveLike
            ? "正在执行第 " +
              (cur || "—") +
              " 步 · 已完成 " +
              doneCount +
              "/" +
              total
            : runSummary.title ||
              (serverSyncedRef.current
                ? "过程流已结束或不可用"
                : "过程流 · 正在同步状态…");

    var startedAt =
      Number(runSummary.started_at || ui.created_at || 0) || 0;
    var elapsedSec = 0;
    if (startedAt) {
      if (finished && runSummary.duration_sec != null) {
        elapsedSec = Number(runSummary.duration_sec) || 0;
      } else {
        elapsedSec = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
      }
    }
    // tick 仅用于触发重渲染
    void tick;

    // 优先用访问轨迹扁平时间线（含回退后 1…8→5…）；禁止用标准 1～10 抹掉已走过的步
    var railNodesRaw =
      (runSummary.timeline_flat && runSummary.timeline_flat.length
        ? runSummary.timeline_flat
        : runSummary.timeline_trace_display &&
            runSummary.timeline_trace_display.length
          ? runSummary.timeline_trace_display
          : runSummary.timeline && runSummary.timeline.length
            ? runSummary.timeline
            : steps.map(function (s) {
                return {
                  kind: "step",
                  step_id: s.step_id,
                  title: s.title,
                  status: s.status,
                  duration_sec: (s.receipt && s.receipt.duration_sec) || null,
                };
              })) || [];
    var railNodes = dpTrimRailNodes(railNodesRaw, finished);
    var railProg = dpRailProgress(railNodes);
    var progressPct = railProg.pct;
    var railStepCount = railProg.stepCount;

    var toneClass =
      runSummary.tone === "ok"
        ? " is-ok"
        : runSummary.tone === "error"
          ? " is-error"
          : runSummary.tone === "warn"
            ? " is-warn"
            : finished
              ? outcome === "success"
                ? " is-ok"
                : " is-error"
              : " is-live";

    useEffect(
      function () {
        if (!isPrimary) return;
        // 已结束或用户主动点时间线查看某步：不再自动贴底
        if (finished || !followStreamRef.current) return;
        try {
          if (streamEndRef.current && streamEndRef.current.scrollIntoView) {
            streamEndRef.current.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }
        } catch (eScroll) {}
      },
      [isPrimary, streamItems.length, cur, logs, status, finished],
    );

    // 节点 >10 时轨道可横滑；执行中自动滚到当前步，保证可见
    useEffect(
      function () {
        if (!isPrimary) return;
        if (!finished) followRailRef.current = true;
        if (!followRailRef.current) return;
        var sc = railScrollRef.current;
        if (!sc) return;
        var active =
          sc.querySelector(".wb-dp-rail-node.is-active") ||
          (!finished ? null : sc.querySelector(".wb-dp-rail-node.is-fail")) ||
          null;
        if (!active) {
          var nodes = sc.querySelectorAll(".wb-dp-rail-node");
          if (nodes && nodes.length) {
            active = nodes[nodes.length - 1];
          }
        }
        if (!active) return;
        try {
          var left =
            active.offsetLeft -
            sc.clientWidth / 2 +
            active.offsetWidth / 2;
          var max = Math.max(0, sc.scrollWidth - sc.clientWidth);
          var next = Math.max(0, Math.min(max, left));
          if (typeof sc.scrollTo === "function") {
            sc.scrollTo({ left: next, behavior: finished ? "auto" : "smooth" });
          } else {
            sc.scrollLeft = next;
          }
        } catch (eRail) {}
      },
      [
        isPrimary,
        finished,
        cur,
        progressPct,
        railNodes.length,
        status,
        tick,
      ],
    );

    // 终态：总结嵌进助手 Markdown 正文（p/ul，display:contents），不要独立卡片/报告块
    useEffect(
      function () {
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
          } catch (eClose) {}
          return false;
        }
        if (!mountOnce()) {
          // 助手「已按需求→上线…」正文可能稍晚才进 DOM，短重试几次
          var timer = setInterval(function () {
            tries += 1;
            if (mountOnce() || tries >= 12) clearInterval(timer);
          }, 500);
          return function () {
            cancelled = true;
            clearInterval(timer);
          };
        }
        return function () {
          cancelled = true;
        };
      },
      [
        isPrimary,
        runId,
        finished,
        runSummary && runSummary.closing && runSummary.closing.body,
        runSummary && runSummary.closing && runSummary.closing.conclusion,
      ],
    );

    if (!isPrimary) return null;

    return h(
      "div",
      { className: "wb-dp wb-dp-stream", "data-dp-rev": DP_UI_REV },
      h("div", { className: "wb-dp-stream-head" }, [
        h("span", { className: "wb-dp-badge" }, "需求→上线"),
        h("span", { className: "wb-dp-stream-head-text" }, headLine),
        canCancel
          ? h(
              "button",
              {
                type: "button",
                className: "wb-dp-btn wb-dp-btn-stop",
                disabled: !!busy || status === "cancelling",
                title: "停止本流水线（输入框发「暂停」/「取消」也可）",
                onClick: function () {
                  cancelRun();
                },
              },
              busy === "cancel" || status === "cancelling"
                ? "停止中…"
                : "停止任务",
            )
          : null,
      ]),
      h(
        "div",
        { className: "wb-dp-stream-body", "aria-live": "polite" },
        streamItems.length
          ? streamItems.map(function (item) {
              if (item.kind === "rollback") {
                return h(
                  "div",
                  {
                    key: "rollback-" + (item.visit_seq || ""),
                    className: "wb-dp-rollback-banner",
                    "data-dp-visit": String(item.visit_seq || ""),
                  },
                  item.label || "打回写码（各步轮次独立计）",
                );
              }
              var st = item.step || {};
              var sid = st.step_id;
              var visitSeq = st.visit_seq || item.visit_seq;
              var attempt = st.implement_attempt || 1;
              var isCur =
                sid === cur &&
                !finished &&
                (st.status === "running" ||
                  st.status === "waiting_hitl" ||
                  st.status === "waiting_user");
              var receipt = st.receipt || {};
              var evidence = receipt.evidence || {};
              var resultDetailEarly =
                st.result_detail ||
                receipt.result_detail ||
                evidence.result_detail ||
                "";
              var stStatus = dpResolveReviewStepStatus(
                st,
                receipt,
                resultDetailEarly,
              );
              // Run 已取消时强制收口，避免 trace 残留 running + 计时狂涨
              if (
                finished &&
                (status === "cancelled" ||
                  status === "canceled" ||
                  outcome === "cancelled") &&
                (stStatus === "running" ||
                  stStatus === "queued" ||
                  stStatus === "waiting_hitl" ||
                  stStatus === "waiting_user")
              ) {
                stStatus = "cancelled";
              }
              var stepLogs = dpStepLogs(st, logs);
              var valResults = evidence.results || [];
              var hitlSteps = { "5": 1, "7": 1, "8": 1, "9": 1, "10": 1 };
              var arts = receipt.artifacts || {};
              var artKeys = Object.keys(arts).filter(function (k) {
                return arts[k] !== true && arts[k] !== false;
              });
              var skillId =
                st.skill_id ||
                receipt.skill_id ||
                (evidence.skill && evidence.skill.id) ||
                "";
              var skillTitle = maskVendorUiText(
                st.skill_title ||
                  receipt.skill_title ||
                  (evidence.skill && evidence.skill.title_zh) ||
                  "",
              );
              var flowBrief = maskVendorUiText(
                st.flow_brief ||
                  (evidence.skill && evidence.skill.flow_brief) ||
                  "",
              );
              var stepTitle = maskVendorUiText(st.title || "");
              var resultDetail =
                st.result_detail ||
                receipt.result_detail ||
                evidence.result_detail ||
                "";
              var resultView = dpStepResultView(
                sid,
                st,
                evidence,
                resultDetail,
                stStatus,
              );
              if (
                resultView.isReview &&
                /审核结果：不通过/.test(String(resultView.lead || ""))
              ) {
                stStatus = "fail";
              }
              return h(
                "article",
                {
                  key: "visit-" + String(visitSeq || sid),
                  className:
                    "wb-dp-msg" +
                    (isCur ? " is-current" : "") +
                    (stStatus === "running" ? " is-running" : "") +
                    (stStatus === "pass" ? " is-pass" : "") +
                    (stStatus === "waiting_hitl" ? " is-wait" : "") +
                    (stStatus === "waiting_user" ? " is-wait" : "") +
                    (stStatus === "fail" || stStatus === "failed" ? " is-fail" : "") +
                    (attempt > 1 ? " is-retry" : ""),
                  "data-dp-step": sid,
                  "data-dp-visit": String(visitSeq || ""),
                },
                [
                  h("header", { className: "wb-dp-msg-head" }, [
                    h(
                      "span",
                      { className: "wb-dp-msg-title" },
                      "第 " +
                        sid +
                        " 步 · " +
                        stepTitle +
                        (attempt > 1 ? "（第 " + attempt + " 轮）" : ""),
                    ),
                    h(
                      "span",
                      {
                        className: "wb-dp-msg-st " + stStatus,
                        title: "本步用时",
                      },
                      dpStatusWithDuration(
                        stStatus,
                        st,
                        receipt,
                        runId,
                        visitSeq,
                      ),
                    ),
                  ]),
                  skillId || skillTitle
                    ? h("div", { className: "wb-dp-msg-skill" }, [
                        h("span", { className: "wb-dp-skill-tag" }, "Skill"),
                        h(
                          "span",
                          { className: "wb-dp-skill-name", title: skillId },
                          (skillTitle || skillId) +
                            (skillId && skillTitle ? "（" + skillId + "）" : ""),
                        ),
                      ])
                    : null,
                  flowBrief
                    ? h("div", { className: "wb-dp-msg-sec" }, [
                        h("div", { className: "wb-dp-msg-label" }, "这一步在干什么"),
                        h("p", { className: "wb-dp-msg-flow" }, flowBrief),
                      ])
                    : null,
                  h("div", { className: "wb-dp-msg-sec" }, [
                    h("div", { className: "wb-dp-msg-label" }, "处理过程"),
                    stepLogs.length
                      ? h(
                          "ul",
                          { className: "wb-dp-msg-log" },
                          stepLogs.map(function (ln, i) {
                            return h("li", { key: i }, ln);
                          }),
                        )
                      : h(
                          "p",
                          { className: "wb-dp-msg-muted" },
                          stStatus === "running" ? "正在处理…" : "暂无过程记录",
                        ),
                  ]),
                  h("div", { className: "wb-dp-msg-sec" }, [
                    h("div", { className: "wb-dp-msg-label" }, "结果"),
                    resultView.isReview
                      ? resultView.lead
                        ? dpRenderMultiline(
                            resultView.lead,
                            "wb-dp-msg-result is-wrap wb-dp-multiline is-lead",
                          )
                        : null
                      : h(
                          "p",
                          { className: "wb-dp-msg-result" },
                          resultView.lead ||
                            (stStatus === "running"
                              ? "执行中，完成后会写在这里"
                              : stStatus === "waiting_hitl"
                                ? "本步需你确认后才能继续"
                                : stStatus === "cancelled" ||
                                    stStatus === "canceled"
                                  ? maskVendorUiText(
                                      String(st.summary || "用户已停止任务"),
                                    )
                                  : "—"),
                        ),
                    resultView.isReview && resultView.riskText
                      ? dpRenderRiskOverview(resultView.riskText)
                      : null,
                    resultView.meta
                      ? dpRenderMultiline(
                          resultView.meta,
                          "wb-dp-msg-result-detail is-meta is-review wb-dp-multiline",
                        )
                      : null,
                    resultView.body
                      ? dpRenderMultiline(
                          resultView.body,
                          "wb-dp-msg-result-detail is-report is-review wb-dp-multiline",
                        )
                      : null,
                    receipt.started_at || receipt.finished_at
                      ? h(
                          "p",
                          { className: "wb-dp-msg-muted" },
                          (receipt.started_at
                            ? "开始 " + dpFmtTs(receipt.started_at)
                            : "") +
                            (receipt.finished_at
                              ? " · 结束 " + dpFmtTs(receipt.finished_at)
                              : "") +
                            (receipt.duration_sec != null
                              ? " · 耗时 " +
                                dpFmtDuration(
                                  dpStepStatusTerminal(stStatus)
                                    ? Math.max(1, Number(receipt.duration_sec) || 0)
                                    : receipt.duration_sec,
                                )
                              : ""),
                        )
                      : null,
                    artKeys.length
                      ? h(
                          "ul",
                          { className: "wb-dp-msg-arts" },
                          artKeys.map(function (k) {
                            var v = arts[k];
                            var shown =
                              typeof v === "string" || typeof v === "number"
                                ? String(v)
                                : JSON.stringify(v);
                            return h("li", { key: k }, k + "：" + shown);
                          }),
                        )
                      : null,
                    valResults.length
                      ? h(
                          "ul",
                          { className: "wb-dp-msg-val" },
                          valResults.map(function (vr, vi) {
                            return h(
                              "li",
                              { key: vi, className: vr.ok ? "ok" : "bad" },
                              (vr.name || "命令") +
                                (vr.ok ? " · 通过" : " · 失败") +
                                "（exit " +
                                vr.exit_code +
                                "）",
                            );
                          }),
                        )
                      : null,
                  ]),
                  stStatus === "waiting_hitl" && hitlSteps[sid]
                    ? h(
                        "button",
                        {
                          type: "button",
                          className: "wb-dp-btn",
                          disabled: !!busy,
                          onClick: function () {
                            if (sid === "5") {
                              confirmStep("5", {
                                no_code_change: false,
                                note: "写码已完成",
                              });
                            } else {
                              confirmStep(sid, { note: "车道步骤已人工完成" });
                            }
                          },
                        },
                        busy === sid
                          ? "提交中…"
                          : sid === "5"
                            ? "写码已完成，继续验证"
                            : "本步已完成，继续",
                      )
                    : null,
                  stStatus === "waiting_user" && sid === "6"
                    ? h(
                        "button",
                        {
                          type: "button",
                          className: "wb-dp-btn",
                          disabled: !!busy,
                          onClick: function () {
                            retryStep("6");
                          },
                        },
                        busy === "retry-6"
                          ? "重试中…"
                          : "已配置，重试验证",
                      )
                    : null,
                  (function () {
                    var canRetryCommit =
                      sid === "8" &&
                      (arts.can_manual_retry ||
                        (evidence && evidence.can_manual_retry) ||
                        (st.can_manual_retry));
                    if (!canRetryCommit) return null;
                    return h(
                      "button",
                      {
                        type: "button",
                        className: "wb-dp-btn",
                        disabled: !!busy,
                        onClick: function () {
                          retryStep("8");
                        },
                      },
                      busy === "retry-8" ? "重试提交中…" : "重试提交",
                    );
                  })(),
                ],
              );
            })
          : h(
              "p",
              { className: "wb-dp-msg-muted wb-dp-stream-empty" },
              finished
                ? "本 Run 无过程明细（可能已停止或记录不完整）"
                : liveLike
                  ? "已开跑，第一步过程马上出现在这里…"
                  : serverSyncedRef.current
                    ? "暂无过程明细"
                    : "正在从引擎同步过程流状态…",
            ),
        h("div", { ref: streamEndRef, className: "wb-dp-stream-end" }),
      ),
      errMsg
        ? h("p", { className: "wb-dp-stream-err" }, errMsg)
        : null,
      h(
        "div",
        {
          className: "wb-dp-stream-summary" + toneClass,
        },
        [
          h("div", { className: "wb-dp-sum-top" }, [
            h("p", { className: "wb-dp-sum-headline" }, [
              h("span", { className: "wb-dp-sum-head-k" }, "总结果"),
              h("span", { className: "wb-dp-sum-head-sep" }, "·"),
              h(
                "span",
                { className: "wb-dp-sum-head-v" },
                maskVendorUiText(runSummary.title || headLine || "进行中"),
              ),
            ]),
            h("div", { className: "wb-dp-sum-meta" }, [
              h("span", { className: "wb-dp-sum-chip" }, [
                h("i", { className: "wb-dp-sum-dot" }),
                "状态 · " + dpStatusLabel(statusForBadge),
              ]),
              h(
                "span",
                { className: "wb-dp-sum-chip wb-dp-sum-chip-time" },
                "总用时 · " +
                  (elapsedSec
                    ? dpFmtDuration(elapsedSec)
                    : runSummary.duration_label || "—"),
              ),
              h(
                "span",
                { className: "wb-dp-sum-chip" },
                "进度 · " +
                  (railStepCount ||
                    runSummary.trace_node_count ||
                    railNodes.length ||
                    total) +
                  " 节点" +
                  (runSummary.fix_round || (ui && ui.fix_round)
                    ? " · 已回退 " +
                      (runSummary.fix_round || ui.fix_round) +
                      " 次"
                    : ""),
              ),
            ]),
          ]),
          h(
            "div",
            {
              className: "wb-dp-rail",
              role: "list",
              "aria-label": "步骤时间线（含回退重跑，超过 10 步可左右滑动）",
            },
            [
              h(
                "div",
                {
                  className: "wb-dp-rail-scroll",
                  ref: railScrollRef,
                  onWheel: function (ev) {
                    // 允许用滚轮横滑查看更多节点
                    try {
                      var sc = railScrollRef.current;
                      if (!sc || sc.scrollWidth <= sc.clientWidth + 2) return;
                      if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
                        sc.scrollLeft += ev.deltaY;
                        if (ev.cancelable) ev.preventDefault();
                      }
                    } catch (eW) {}
                  },
                },
                h(
                  "div",
                  {
                    className: "wb-dp-rail-inner",
                    style: (function () {
                      var totalN = Math.max(1, railNodes.length || 1);
                      var visibleN = 10;
                      return {
                        "--wb-dp-rail-fill": String(progressPct) + "%",
                        "--wb-dp-rail-n": String(totalN),
                        "--wb-dp-rail-total": String(totalN),
                        "--wb-dp-rail-visible": String(visibleN),
                      };
                    })(),
                  },
                  [
                    h("div", { className: "wb-dp-rail-track" }, [
                      h("div", {
                        className: "wb-dp-rail-fill",
                        style: { width: progressPct + "%" },
                      }),
                    ]),
                    h(
                      "div",
                      { className: "wb-dp-rail-nodes" },
                      railNodes.map(function (node, ni) {
                  var ns = String(node.status || "pending");
                  if (node.kind === "rollback" || ns === "rollback") {
                    return h(
                      "div",
                      {
                        key: "rb-" + (node.seq || ni),
                        className: "wb-dp-rail-node is-rollback",
                        role: "listitem",
                        title: maskVendorUiText(node.title || "打回写码"),
                      },
                      [
                        h("div", { className: "wb-dp-rail-dot" }, "↩"),
                        h(
                          "div",
                          { className: "wb-dp-rail-cap" },
                          "回退",
                        ),
                      ],
                    );
                  }
                  var done = ns === "pass" || ns === "skipped";
                  var sid = String(node.step_id || "");
                  // 同 step_id 可能出现多次（回退后重跑）；仅最后一次访问可标 active
                  var isLastVisitOfSid = true;
                  for (var lj = ni + 1; lj < railNodes.length; lj++) {
                    var later = railNodes[lj];
                    if (
                      later &&
                      later.kind !== "rollback" &&
                      later.status !== "rollback" &&
                      String(later.step_id || "") === sid
                    ) {
                      isLastVisitOfSid = false;
                      break;
                    }
                  }
                  var isActive =
                    isLastVisitOfSid &&
                    !done &&
                    !finished &&
                    (ns === "running" ||
                      ns === "waiting_hitl" ||
                      ns === "waiting_user" ||
                      (sid === String(cur) &&
                        ns !== "fail" &&
                        ns !== "failed" &&
                        ns !== "cancelled" &&
                        ns !== "canceled"));
                  var bad =
                    ns === "fail" ||
                    ns === "failed" ||
                    ns === "cancelled" ||
                    ns === "canceled";
                  var cls =
                    "wb-dp-rail-node" +
                    (done ? " is-done" : "") +
                    (isActive ? " is-active" : "") +
                    (bad ? " is-fail" : "") +
                    (ns === "pending" ? " is-pending" : "") +
                    (node.implement_attempt > 1 ? " is-retry" : "");
                  var dotLabel =
                    node.display_step ||
                    (node.implement_attempt > 1
                      ? sid + "·" + node.implement_attempt
                      : sid || String(ni + 1));
                  var visitKey = String(node.seq || ni);
                  return h(
                    "button",
                    {
                      type: "button",
                      key: "visit-" + visitKey,
                      className: cls,
                      role: "listitem",
                      title:
                        "第 " +
                        sid +
                        " 步" +
                        (node.implement_attempt > 1
                          ? "（第 " + node.implement_attempt + " 轮）"
                          : "") +
                        " · " +
                        maskVendorUiText(node.title || "") +
                        " · " +
                        dpStatusLabel(ns) +
                        "（点击查看详情）",
                      style: {
                        animationDelay: Math.min(ni * 0.04, 0.4) + "s",
                      },
                      onClick: function () {
                        followStreamRef.current = false;
                        try {
                          var root =
                            (streamEndRef.current &&
                              streamEndRef.current.parentElement) ||
                            null;
                          var sel =
                            '[data-dp-visit="' +
                            visitKey +
                            '"]';
                          var el =
                            (root && root.querySelector(sel)) ||
                            document.querySelector(
                              ".wb-dp-stream " + sel,
                            );
                          if (!el && sid) {
                            el =
                              (root &&
                                root.querySelector(
                                  '[data-dp-step="' + sid + '"]',
                                )) ||
                              document.querySelector(
                                '.wb-dp-stream [data-dp-step="' + sid + '"]',
                              );
                          }
                          if (el && el.scrollIntoView) {
                            el.scrollIntoView({
                              behavior: "smooth",
                              block: "center",
                            });
                            el.classList.add("is-flash");
                            setTimeout(function () {
                              try {
                                el.classList.remove("is-flash");
                              } catch (e2) {}
                            }, 1200);
                          }
                        } catch (eScroll) {}
                      },
                    },
                    [
                      h(
                        "div",
                        { className: "wb-dp-rail-dot" },
                        done ? "✓" : bad ? "!" : dotLabel,
                      ),
                      h(
                        "div",
                        { className: "wb-dp-rail-cap" },
                        dpRailCapLabel(node.title, sid),
                      ),
                    ],
                  );
                }),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  ctx.DevPipelineTimelineCard = DevPipelineTimelineCard;

  function resolveIntegratedFlowSessionId(props) {
    var sid = "";
    if (props) {
      sid =
        props.sessionId ||
        (props.session && (props.session.id || props.session.sessionId)) ||
        "";
    }
    sid = String(sid || "").trim();
    if (sid) return sid;
    if (typeof ctx.readWorkbuddyCurrentSessionId === "function") {
      try {
        sid = String(ctx.readWorkbuddyCurrentSessionId() || "").trim();
        if (sid) return sid;
      } catch (eRead) {}
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
    } catch (eL) {}
    try {
      if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);
    } catch (eS) {}
    // 有明确 sessionId 时只认该会话 key；禁止用 __last=0 把「别的会话关掉」污染到本会话
    if (sid) {
      var keySid = "wb.integratedFlow." + sid;
      for (var s = 0; s < stores.length; s++) {
        try {
          var v = String(stores[s].getItem(keySid) || "");
          if (v === "1") return true;
          if (v === "0") return false;
        } catch (eR) {}
      }
      return null;
    }
    for (var s2 = 0; s2 < stores.length; s2++) {
      try {
        var v2 = String(stores[s2].getItem("wb.integratedFlow.__last") || "");
        if (v2 === "1") return true;
        if (v2 === "0") return false;
      } catch (eR2) {}
    }
    return null;
  }

  /**
   * API 说关着时：
   * - 有进行中 Run → 强制开
   * - 历史已结束 Run：不在此冲掉用户主动关闭；由过程流卡 fromPipelineCard 对齐开关
   */
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
            authHeaders(),
          ),
          body: JSON.stringify({ enabled: true }),
        },
      )
        .then(function () {
          return true;
        })
        .catch(function () {
          return true;
        });
    }
    return engineApi(
      "/api/dev-pipeline/sessions/" + encodeURIComponent(sid) + "/active-run",
      { headers: authHeaders() },
    )
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.ok && d.run) return forceOn();
        // 引擎已 heal（force_ordinary / 缺 mode）时 integrated API 会直接 true；
        // 此处仅兜底：latest 仍为 live 状态（竞态下 active-run 空窗）
        return engineApi(
          "/api/dev-pipeline/sessions/" +
            encodeURIComponent(sid) +
            "/latest-run",
          { headers: authHeaders() },
        )
          .then(function (r2) {
            return r2.json();
          })
          .then(function (d2) {
            var run = d2 && d2.run;
            if (d2 && d2.ok && run && dpRunLiveLike(run.status)) {
              return forceOn();
            }
            return false;
          });
      })
      .catch(function () {
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
    } catch (eA) {}
    try {
      if (typeof sessionStorage !== "undefined") stores.push(sessionStorage);
    } catch (eB) {}
    for (var i = 0; i < stores.length; i++) {
      try {
        if (sid) stores[i].setItem("wb.integratedFlow." + sid, v);
        stores[i].setItem("wb.integratedFlow.__last", v);
      } catch (eW) {}
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
        } catch (eSs) {}
        try {
          if (typeof window !== "undefined" && window.dispatchEvent) {
            window.dispatchEvent(
              new CustomEvent("wb-integrated-flow-changed", { detail: { on: v } }),
            );
          }
        } catch (eEv) {}
      } catch (eSetOn) {}
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
      function () {
        if (!sessionId) return;
        try {
          globalThis.__wbDshSessionId = sessionId;
        } catch (eSid) {}
        // 冷启/刷新 API 返回前：localStorage 先恢复 class，避免过程流卡还在、开关却关着
        try {
          var cached = readIntegratedFlowCache(sessionId);
          if (cached === true) setOn(true);
          else if (cached === false) setOn(false);
        } catch (eCache) {}
      },
      [sessionId],
    );

    useEffect(
      function () {
        if (typeof window === "undefined" || !window.addEventListener) return;
        function onFlowFlag(ev) {
          try {
            var d = (ev && ev.detail) || {};
            // 仅过程流卡对齐事件：避免与 setOn 自身派发形成回环
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
            } catch (eFlag) {}
          } catch (eF) {}
        }
        window.addEventListener("wb-integrated-flow-changed", onFlowFlag);
        return function () {
          try {
            window.removeEventListener("wb-integrated-flow-changed", onFlowFlag);
          } catch (eR) {}
        };
      },
      [sessionId],
    );

    useEffect(
      function () {
        if (!sessionId) {
          // sessionId 尚未就绪时勿强行关：冷启常见，关了会清掉 class、过程流界面乱
          try {
            var keepBoot = readIntegratedFlowCache("");
            if (keepBoot === true) setOn(true);
          } catch (eBoot) {}
          return;
        }
        engineApi(
          "/api/dev-pipeline/sessions/" +
            encodeURIComponent(sessionId) +
            "/integrated",
          { headers: authHeaders() },
        )
          .then(function (r) {
            return r.json().then(function (d) {
              return { status: r.status, d: d };
            });
          })
          .then(function (pack) {
            var d = pack.d || {};
            if (d && d.ok) {
              setBlocked(false);
              setHint("");
              // 引擎可能 healed_from_* 把旧一体化会话开关写回为开：以 API 为准并刷本地缓存
              var onApi = !!d.integrated_flow_enabled;
              setOn(onApi);
              try {
                writeIntegratedFlowCache(sessionId, onApi);
              } catch (eW) {}
              try {
                globalThis.__wbIntegratedFlowOn = onApi;
                if (typeof document !== "undefined" && document.documentElement) {
                  document.documentElement.classList.toggle(
                    "wb-integrated-flow-on",
                    onApi,
                  );
                }
              } catch (eFlag) {}
              // API 仍关：本会话有过程流 Run（含历史已结束）则强制开
              if (!onApi) {
                syncToggleFromSessionRuns(sessionId, setOn);
              }
              return;
            }
            // 功能插件停用等：开关仍可点，但要点明原因
            var detail = String((d && d.detail) || "").trim();
            if (detail.indexOf("停用") >= 0 || (d && d.source === "disabled")) {
              setBlocked(true);
              setHint("请先在左侧「功能插件」启用「需求到上线一体化」");
              setOn(false);
              return;
            }
            if (detail) {
              setHint(detail.slice(0, 80));
            }
            // 引擎短暂失败时勿强行关掉：保留本地缓存，避免重启后过程流界面混乱
            var keep = readIntegratedFlowCache(sessionId);
            if (keep === true) setOn(true);
            else if (keep === false) setOn(false);
          })
          .catch(function () {
            setHint("引擎未就绪，稍后再试");
            var keep2 = readIntegratedFlowCache(sessionId);
            if (keep2 === true) setOn(true);
          });
      },
      [sessionId],
    );

    if (!sessionId) return null;

    var compact = props && props.compact;
    return h(
      "label",
      {
        className:
          "wb-dp-session-toggle" +
          (on ? " is-on" : "") +
          (blocked ? " is-blocked" : "") +
          (compact ? " wb-dp-session-toggle--compact" : ""),
        title:
          hint ||
          "仅本会话有效：开启走「需求→上线」过程流；关闭为普通写码/四车道。两种模式均可贴图（附图走智谱识图，文字仍用当前聊天模型）",
      },
      h("input", {
        type: "checkbox",
        checked: !!on,
        disabled: busy,
        onChange: function (ev) {
          var next = !!ev.target.checked;
          setBusy(true);
          setHint("");
          engineApi(
            "/api/dev-pipeline/sessions/" +
              encodeURIComponent(sessionId) +
              "/integrated",
            {
              method: "PUT",
              headers: Object.assign(
                { "Content-Type": "application/json" },
                authHeaders(),
              ),
              body: JSON.stringify({ enabled: next }),
            },
          )
            .then(function (r) {
              return r.json().then(function (d) {
                return { status: r.status, d: d };
              });
            })
            .then(function (pack) {
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
                      !!d.integrated_flow_enabled,
                    );
                  }
                } catch (eFlag2) {}
                return;
              }
              // 保存失败：回弹 checkbox，并给出可读原因
              setOn(false);
              try {
                globalThis.__wbIntegratedFlowOn = false;
                if (typeof document !== "undefined" && document.documentElement) {
                  document.documentElement.classList.remove("wb-integrated-flow-on");
                }
              } catch (eFlag3) {}
              var detail = formatApiDetail(d, pack.status).trim();
              if (detail.indexOf("停用") >= 0 || (d && d.source === "disabled")) {
                setBlocked(true);
                setHint("请先在左侧「功能插件」启用「需求到上线一体化」");
              } else {
                setHint(detail.slice(0, 100));
              }
              try {
                if (typeof window !== "undefined" && window.alert) {
                  window.alert(detail);
                }
              } catch (eAlert) {}
            })
            .catch(function () {
              setOn(false);
              setHint("引擎未就绪，无法切换");
            })
            .finally(function () {
              setBusy(false);
            });
        },
      }),
      h(
        "span",
        { className: "wb-dp-session-toggle-label" },
        blocked ? "需启用插件" : on ? "需求→上线" : "普通写码",
      ),
    );
  }

  function WorkBuddyIntegratedFlowInputChip(props) {
    ensureCss();
    var sessionId = resolveIntegratedFlowSessionId(props);
    if (!sessionId) return null;
    return h(WorkBuddyIntegratedFlowToggle, {
      sessionId: sessionId,
      compact: true,
    });
  }

  /** 输入框旁仅保留「需求→上线」开关；进度在对话框 toolview 流式输出，不再挂 input.dock 大卡 */
  ctx.WorkBuddyIntegratedFlowToggle = WorkBuddyIntegratedFlowToggle;
  ctx.WorkBuddyIntegratedFlowInputChip = WorkBuddyIntegratedFlowInputChip;

  function registerIntegratedFlowComposerSlots(ctx2) {
    if (!ctx2 || !ctx2.slots || typeof ctx2.slots.inject !== "function") return;
    if (ctx2.__wbDpComposerSlotsRegistered) return;
    ctx2.__wbDpComposerSlotsRegistered = true;
    try {
      ctx2.slots.inject("conversation.input.right", function () {
        return ctx2.slots.register(
          {
            name: "conversation.input.right",
            id: "workbuddy-integrated-flow-chip",
            order: 40,
          },
          WorkBuddyIntegratedFlowInputChip,
        );
      });
    } catch (eRight) {
      ctx2.__wbDpComposerSlotsRegistered = false;
      console.warn("[dsh-mes-bridge] conversation.input.right 一体化开关不可用", eRight);
    }
    try {
      installIntegratedComposerVisionBridge(ctx2);
    } catch (ePaste) {
      console.warn("[dsh-mes-bridge] 一体化贴图桥不可用", ePaste);
    }
  }

  /**
   * 贴图日常路径（普通写码 / 「需求→上线」均可用）：
   * 1) 允许照常粘贴进输入框（缩略图仍由 DSH 显示）
   * 2) 同步把图上传到引擎 vision pending（智谱识图）
   * 3) 点发送 / Enter 时：先卸掉草稿附图再放行文字给 DeepSeek，
   *    避免宿主「当前模型不支持图片」拦截（DeepSeek 文本模型不能吃图）
   * 不再要求先开绿色「需求→上线」。
   */
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
      } catch (e1) {}
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
      } catch (eH) {}
      if (headers["Content-Type"]) delete headers["Content-Type"];
      if (headers["content-type"]) delete headers["content-type"];
      return engineApi("/api/vision/upload", {
        method: "POST",
        headers: headers,
        body: fd,
      })
        .then(function (r) {
          return r.json().catch(function () {
            return { ok: r.ok, image_ids: [] };
          });
        })
        .catch(function () {
          return { ok: false, image_ids: [] };
        });
    }

    /** 最近一次上传的 id：旧标记无 id 时兜底；新标记为【附图:vimg-…】供气泡替换成缩略图 */
    var lastUploadIds = [];

    function visionMarkerFromIds(imageIds) {
      var ids = (imageIds || []).map(String).filter(function (id) {
        return /^vimg-/.test(id);
      });
      if (!ids.length) return "";
      return "【附图:" + ids.join(",") + "】";
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
          "value",
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

    /** 把气泡/确认卡里的附图标记换成引擎缩略图；点击放大预览，可关闭 */
    function installVisionChatThumbnails() {
      if (typeof document === "undefined") return;
      if (document.documentElement.getAttribute("data-wb-vision-thumbs") === "1") {
        return;
      }
      document.documentElement.setAttribute("data-wb-vision-thumbs", "1");

      var MARKER_RE =
        /【\s*(?:已附图(?:×\d+)?(?:\s*[·•]\s*交智谱识图)?(?::([^\】]*))?|附图\s*:\s*([^\】]+))\s*】|!\[需求附图\]\((https?:\/\/[^)\s]+\/api\/vision\/images\/(vimg-[a-zA-Z0-9_-]+))\)|(?:^|[\s\n])(vimg-[a-f0-9]{16})(?=[\s\n】]|$)/gi;

      var lightboxEl = null;
      var lightboxEsc = null;

      function closeVisionLightbox() {
        if (lightboxEsc) {
          try {
            document.removeEventListener("keydown", lightboxEsc, true);
          } catch (eRm) {}
          lightboxEsc = null;
        }
        if (lightboxEl && lightboxEl.parentNode) {
          try {
            lightboxEl.parentNode.removeChild(lightboxEl);
          } catch (eRm2) {}
        }
        lightboxEl = null;
      }

      function openVisionLightbox(url, alt) {
        closeVisionLightbox();
        var overlay = document.createElement("div");
        overlay.className = "wb-vision-lightbox";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "附图预览");
        var inner = document.createElement("div");
        inner.className = "wb-vision-lightbox-inner";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wb-vision-lightbox-x";
        btn.setAttribute("aria-label", "关闭预览");
        btn.textContent = "×";
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          closeVisionLightbox();
        });
        var img = document.createElement("img");
        img.src = url;
        img.alt = alt || "需求附图";
        inner.appendChild(btn);
        inner.appendChild(img);
        overlay.appendChild(inner);
        overlay.addEventListener("click", function (ev) {
          if (ev.target === overlay) closeVisionLightbox();
        });
        lightboxEsc = function (ev) {
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
        } catch (eF) {}
      }

      function parseIdsFromMatch(m) {
        var raw = String(m[1] || m[2] || "").trim();
        var fromUrl = m[4] ? String(m[4]) : "";
        var bare = m[5] ? String(m[5]) : "";
        var ids = [];
        if (raw) {
          raw.split(/[,\s，、]+/).forEach(function (id) {
            id = String(id || "")
              .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
              .trim();
            if (/^vimg-[a-zA-Z0-9_-]+$/.test(id)) ids.push(id);
          });
        }
        if (fromUrl && /^vimg-/.test(fromUrl)) ids.push(fromUrl);
        if (bare && /^vimg-/.test(bare)) ids.push(bare);
        if (!ids.length && lastUploadIds.length) ids = lastUploadIds.slice();
        return ids;
      }

      function imgUrl(id) {
        return (
          String(engineBase() || "").replace(/\/$/, "") +
          "/api/vision/images/" +
          encodeURIComponent(id)
        );
      }

      function buildThumbStrip(ids) {
        var wrap = document.createElement("span");
        wrap.className = "wb-vision-atts";
        wrap.setAttribute("data-wb-vision-enhanced", "1");
        wrap.setAttribute("contenteditable", "false");
        for (var i = 0; i < ids.length; i++) {
          (function (id) {
            var a = document.createElement("button");
            a.type = "button";
            a.className = "wb-vision-thumb";
            a.title = "点击放大预览";
            a.setAttribute("aria-label", "点击放大预览附图");
            var img = document.createElement("img");
            img.src = imgUrl(id);
            img.alt = "需求附图";
            img.loading = "lazy";
            img.draggable = false;
            img.onerror = function () {
              a.classList.add("is-broken");
              a.textContent = "附图加载失败";
            };
            a.appendChild(img);
            a.addEventListener("click", function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              if (a.classList.contains("is-broken")) return;
              openVisionLightbox(imgUrl(id), "需求附图");
            });
            wrap.appendChild(a);
          })(ids[i]);
        }
        return wrap;
      }

      function replaceTextWithThumbs(text) {
        var cleaned = String(text || "").replace(/[\u200b\u200c\u200d\ufeff]/g, "");
        if (
          cleaned.indexOf("附图") < 0 &&
          cleaned.indexOf("vision/images") < 0 &&
          cleaned.indexOf("vimg-") < 0
        ) {
          return null;
        }
        MARKER_RE.lastIndex = 0;
        if (!MARKER_RE.test(cleaned)) return null;
        MARKER_RE.lastIndex = 0;
        var frag = document.createDocumentFragment();
        var last = 0;
        var m;
        var any = false;
        while ((m = MARKER_RE.exec(cleaned))) {
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

      /** 铁律：绝不改写系统底栏输入（粘贴后仍可编辑） */
      function isInsideComposer(node) {
        var el = node && node.nodeType === 3 ? node.parentElement : node;
        if (!el) return false;
        try {
          if (el.isContentEditable) return true;
        } catch (eCe) {}
        try {
          if (el.closest) {
            if (el.closest("[data-composer-seat],[data-composer-card]")) return true;
            // 宿主底栏多为 contenteditable，禁止缩略图替换拆坏可编辑态
            if (el.closest('[contenteditable="true"],[contenteditable=""]')) return true;
          }
        } catch (eC) {}
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

      /** 宿主把标记拆成多段文本节点时：合并同父节点后整段替换 */
      function enhanceFragmentedParent(parent) {
        if (!parent || parent.nodeType !== 1) return false;
        if (isInsideComposer(parent)) return false;
        if (parent.querySelector && parent.querySelector(".wb-vision-atts")) return false;
        if (
          parent.tagName === "TEXTAREA" ||
          parent.tagName === "INPUT" ||
          parent.tagName === "SCRIPT" ||
          parent.tagName === "STYLE" ||
          parent.tagName === "BUTTON" ||
          parent.tagName === "A"
        ) {
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
          } catch (eT) {}
          return;
        }
        if (root.nodeType !== 1) return;
        if (root.classList && root.classList.contains("wb-vision-atts")) return;
        if (root.classList && root.classList.contains("wb-vision-lightbox")) return;
        if (root.closest && root.closest(".wb-vision-atts")) return;
        if (
          root.tagName === "TEXTAREA" ||
          root.tagName === "INPUT" ||
          root.tagName === "SCRIPT" ||
          root.tagName === "STYLE"
        ) {
          return;
        }
        try {
          enhanceFragmentedParent(root);
        } catch (eF) {}
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var nodes = [];
        var n;
        while ((n = walker.nextNode())) {
          if (isInsideComposer(n)) continue;
          var v = n.nodeValue || "";
          if (
            v.indexOf("附图") >= 0 ||
            v.indexOf("vision/images") >= 0 ||
            v.indexOf("vimg-") >= 0
          ) {
            nodes.push(n);
          }
        }
        for (var i = 0; i < nodes.length; i++) {
          try {
            enhanceTextNode(nodes[i]);
          } catch (eEnh) {}
        }
      }

      var scheduled = false;
      var pendingRoot = null;
      function schedule(root) {
        pendingRoot = root || document.body;
        if (scheduled) return;
        scheduled = true;
        setTimeout(function () {
          scheduled = false;
          var r = pendingRoot || document.body;
          pendingRoot = null;
          try {
            walk(r);
            if (r !== document.body) walk(document.body);
          } catch (eW) {}
        }, 60);
      }

      schedule(document.body);
      // 聊天壳 React 重绘会冲掉节点：短时轮询 + MutationObserver 双保险
      var pulses = 0;
      var pulseTimer = setInterval(function () {
        pulses += 1;
        schedule(document.body);
        if (pulses >= 40) {
          try {
            clearInterval(pulseTimer);
          } catch (eC) {}
        }
      }, 750);
      try {
        var mo = new MutationObserver(function (mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var mu = mutations[i];
            if (mu.type === "childList") {
              for (var j = 0; j < mu.addedNodes.length; j++) {
                var node = mu.addedNodes[j];
                if (isInsideComposer(node)) continue;
                if (node.nodeType === 1) {
                  if (
                    node.classList &&
                    (node.classList.contains("wb-vision-atts") ||
                      node.classList.contains("wb-vision-lightbox"))
                  ) {
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
          characterData: true,
        });
      } catch (eMo) {}
    }

    ctx.installVisionChatThumbnails = installVisionChatThumbnails;

    function collectBlobFilesFromComposer() {
      var card = composerCard();
      if (!card) return Promise.resolve([]);
      var imgs = card.querySelectorAll('img[src^="blob:"]');
      var tasks = [];
      for (var i = 0; i < imgs.length && i < 6; i++) {
        (function (img) {
          var src = img.getAttribute("src") || "";
          var alt = String(img.getAttribute("alt") || "paste.png").trim() || "paste.png";
          tasks.push(
            fetch(src)
              .then(function (r) {
                return r.blob();
              })
              .then(function (blob) {
                var type = blob.type || "image/png";
                var name = alt.indexOf(".") > 0 ? alt : alt + ".png";
                return new File([blob], name, { type: type });
              })
              .catch(function () {
                return null;
              }),
          );
        })(imgs[i]);
      }
      return Promise.all(tasks).then(function (arr) {
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
        if (
          label.indexOf("移除图片") === 0 ||
          label.indexOf("Remove image") === 0
        ) {
          try {
            buttons[i].click();
            n += 1;
          } catch (eClick) {}
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
        if (label === "发送消息" || label === "Send message") {
          try {
            buttons[i].click();
          } catch (eSend) {}
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
              cancelable: true,
            }),
          );
        } catch (eKey) {}
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
      collectBlobFilesFromComposer()
        .then(function (fromBlob) {
          var files = fromBlob.length ? fromBlob : fromEager;
          return uploadPending(files);
        })
        .then(function (up) {
          var ids = (up && up.image_ids) || [];
          // 先卸二进制附件（避免 DeepSeek「不支持图片」），再把可回显的 Markdown 图链写进正文
          stripComposerDraftImages();
          return new Promise(function (resolve) {
            setTimeout(function () {
              stripComposerDraftImages();
              if (ids.length) injectVisionMarkdownIntoDraft(ids);
              resolve(ids);
            }, 60);
          });
        })
        .then(function () {
          return new Promise(function (resolve) {
            // 给 React 受控输入一帧时间吃掉 input 事件，再点发送
            setTimeout(resolve, 80);
          });
        })
        .then(function () {
          diverting = false;
          clickSendAgain();
        })
        .catch(function () {
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
      if (ev.isComposing || (ev.nativeEvent && ev.nativeEvent.isComposing)) return;
      var card = composerCard();
      if (!card) return;
      var ta = card.querySelector("textarea");
      if (!ta || (ev.target !== ta && !card.contains(ev.target))) return;
      if (!composerHasDraftImages() && !eagerFiles.length) return;
      divertSendThenRelease(ev);
    }

    function onClick(ev) {
      if (diverting) return;
      var btn = ev.target && ev.target.closest ? ev.target.closest("button[aria-label]") : null;
      if (!btn) return;
      var label = String(btn.getAttribute("aria-label") || "");
      if (label !== "发送消息" && label !== "Send message") return;
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
      console.warn("[dsh-mes-bridge] 附图缩略图增强不可用", eThumbs);
    }
  }

  ctx.registerIntegratedFlowComposerSlots = registerIntegratedFlowComposerSlots;

  /** @deprecated */
  function installIntegratedFlowComposerDock(_ctx2) {
    return function () {};
  }

  ctx.installIntegratedFlowComposerDock = installIntegratedFlowComposerDock;
}
