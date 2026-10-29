/**
 * 验收标准进诉求（Q1-3 / 原表 A）
 * 从用户原话启发式抽出「怎么验」短句，钉进写码 message / 续改交接。
 * 抽不出则跳过，不阻断写码。不做复杂 NLP。
 */

export const ACCEPTANCE_MARKER = "【验收标准（来自用户原话）】";

const HINT_RE =
  /打开|点一下|点击|验收|刷新|看效果|看到|应该|预期|验证|确认能|不要再|不再出现|能正常|显示正确|报错消失/;

/** 去掉系统块，只保留用户原话段 */
export function userUtteranceForAcceptance(text) {
  const raw = String(text || "");
  const cut = raw.split(
    /【(?:系统续改交接|工作区目录画像|硬规则|项目画像|验收标准)/,
  );
  return String(cut[0] || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * @returns {string[]} 最多 3 条，每条 ≤80 字
 */
export function extractAcceptanceHints(text) {
  const user = userUtteranceForAcceptance(text);
  if (!user) return [];
  const parts = user
    .split(/[。；;！!？?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
  const out = [];
  const seen = new Set();
  for (const p of parts) {
    if (!HINT_RE.test(p)) continue;
    // 纯改需求、无验收味道的跳过
    if (
      /^(请)?(改|修|做|加|删|去掉|实现)/.test(p) &&
      !/打开|点|验收|刷新|看|验证|预期|应该|确认|不要再|不再/.test(p)
    ) {
      continue;
    }
    const clip = p.length > 80 ? p.slice(0, 80) + "…" : p;
    if (seen.has(clip)) continue;
    seen.add(clip);
    out.push(clip);
    if (out.length >= 3) break;
  }
  if (!out.length && user.length <= 120 && HINT_RE.test(user)) {
    out.push(user.length > 80 ? user.slice(0, 80) + "…" : user);
  }
  return out;
}

export function formatAcceptanceBlock(hints) {
  const list = Array.isArray(hints) ? hints.filter(Boolean) : [];
  if (!list.length) return "";
  const lines = [ACCEPTANCE_MARKER, "写完须对照下列标准自检（来自用户原话，非系统臆造）："];
  for (const h of list) lines.push("- " + h);
  return lines.join("\n");
}

export function messageHasAcceptanceBlock(message) {
  return String(message || "").includes(ACCEPTANCE_MARKER);
}

/**
 * 若原话含验收句且尚未钉过，追加到 message 末尾。
 * @returns {{ text: string, changed: boolean, hints: string[] }}
 */
export function enrichMessageWithAcceptanceHints(message) {
  const prev = String(message || "");
  if (!prev.trim()) return { text: prev, changed: false, hints: [] };
  if (messageHasAcceptanceBlock(prev)) {
    return { text: prev, changed: false, hints: [] };
  }
  const hints = extractAcceptanceHints(prev);
  if (!hints.length) return { text: prev, changed: false, hints: [] };
  const block = formatAcceptanceBlock(hints);
  if (!block) return { text: prev, changed: false, hints: [] };
  return {
    text: prev.replace(/\s+$/, "") + "\n\n" + block,
    changed: true,
    hints,
  };
}
