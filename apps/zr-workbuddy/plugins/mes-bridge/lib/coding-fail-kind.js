/**
 * 对话写码失败原因分类（P1-1）+ 落盘诚实（Q0-1）
 * 进度卡 / 续改确认卡 / closeout 共用同一判定顺序，避免文案串类。
 *
 * 优先序：db_eperm → url_images → agent_missing → network → other
 */

function isDbOrBinaryRel(rel) {
  const p = String(rel || "")
    .replace(/\\/g, "/")
    .toLowerCase()
    .trim();
  if (!p) return true;
  if (p.endsWith(".db") || p.endsWith(".sqlite") || p.endsWith(".sqlite3")) return true;
  if (p.endsWith(".db-journal") || p.endsWith(".db-wal") || p.endsWith(".db-shm")) return true;
  const name = p.split("/").pop() || "";
  if (name === "erp.db" || name === "data.db" || name === "app.db") return true;
  return false;
}

/** 剔 *.db 等后的源码相对路径列表（供落盘计数；无 Node 依赖，可进 client bundle） */
export function codeFilesOnlyForSync(files) {
  const out = [];
  const seen = new Set();
  for (const raw of files || []) {
    const rel = String(raw || "")
      .replace(/\\/g, "/")
      .trim()
      .replace(/^\.\//, "");
    if (!rel || isDbOrBinaryRel(rel) || seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * 插件标 succeeded 但有效源码 synced 为空 → 假成功 / 未落盘。
 */
export function isHollowCodingSuccess(job) {
  if (!job || typeof job !== "object") return false;
  if (String(job.status || "").trim() !== "succeeded") return false;
  const synced = codeFilesOnlyForSync(
    job.synced_files || job.last_synced_files || [],
  );
  return synced.length === 0;
}

/**
 * 写完自检闭环（Q1-4）：按已同步路径启发式区分前端刷新 / 后端重启。
 * 只产文案，不在 bridge 内 spawn 测试或起 Vite。
 * @returns {{ frontend: boolean, backend: boolean, n: number }}
 */
export function classifySyncedTouch(files) {
  const list = codeFilesOnlyForSync(files);
  let frontend = false;
  let backend = false;
  for (const rel of list) {
    const p = String(rel || "")
      .replace(/\\/g, "/")
      .toLowerCase();
    if (!p) continue;
    const fePath =
      /(^|\/)(frontend|web|client|src\/views|src\/components|src\/pages|src\/router)\//.test(
        p,
      ) || /\.(vue|tsx|jsx|css|scss|less|html|svelte)$/.test(p);
    const bePath =
      /(^|\/)(backend|server|api|engine\/app|app\/)\//.test(p) ||
      /\.(py|go|rs|java|cs)$/.test(p) ||
      /(migrate|alembic|sqlalchemy|uvicorn)/.test(p);
    if (fePath) frontend = true;
    if (bePath) backend = true;
    if (/\.(ts|js|mjs|cjs)$/.test(p) && !fePath && !bePath) {
      // 模糊脚本：默认当前端触达，避免过度要求重启后端
      frontend = true;
    }
  }
  return { frontend, backend, n: list.length };
}

/** 成功收尾用的自检一句（无文件则空串） */
export function formatPostCodingSelfCheck(files) {
  const touch = classifySyncedTouch(files);
  if (!touch.n) return "";
  if (touch.backend && touch.frontend) {
    return (
      "自检：本次前后端都有改动——请先重启业务后端，再硬刷新页面，点一遍刚改的功能确认。" +
      "若输入框旁绿色「需求→上线」开着，可对照过程流里的验证步结果；本仓不会代跑测试或起 Vite。"
    );
  }
  if (touch.backend) {
    return (
      "自检：本次偏后端改动——请重启业务后端后再调接口/打开相关页确认。" +
      "不要在聊天里让我代跑测试或起开发服务器。"
    );
  }
  return (
    "自检：本次偏前端改动——请硬刷新页面（必要时清缓存）后点一遍刚改的功能确认。" +
    "若仍不对，直接说具体哪里不对即可。"
  );
}

export function classifyCodingFailKind(detail) {
  const blob = String(detail || "");
  if (
    /EPERM|operation not permitted/i.test(blob) &&
    /\.db|sqlite|erp\.db|pcb_procurement\.db/i.test(blob)
  ) {
    return "db_eperm";
  }
  if (/URL images are only supported for cloud SDK agents/i.test(blob)) {
    return "url_images";
  }
  if (/Agent .+ not found|父 Agent 不可用|unknown agent|no such agent/i.test(blob)) {
    return "agent_missing";
  }
  if (
    /Network request failed/i.test(blob) ||
    (/retryable\s*=\s*true/i.test(blob) &&
      /network|fetch|ECONN|ETIMEDOUT|ENOTFOUND/i.test(blob))
  ) {
    return "network";
  }
  return "other";
}

function shortDetail(detail, n) {
  const s = String(detail || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return "";
  return s.length > (n || 160) ? s.slice(0, n || 160) + "…" : s;
}

/** 失败进度卡横幅（不自动点确认） */
export function codingFailProgressCopy(kind, detail) {
  const d = shortDetail(detail, 120);
  switch (kind) {
    case "network":
      return {
        title: "【网络】抖动，本轮未改到工程",
        body:
          "写码云/出网失败（常带 retryable），不是业务需求写错。请点「续改确认」用同一诉求再试；若多次仍失败，先检查本机出网。",
      };
    case "db_eperm":
      return {
        title: "【数据库文件】同步被占用（*.db EPERM）",
        body:
          "库文件不是写码产物。将尝试自动回收业务源码（忽略 *.db）；也可说「不要碰 db，只同步源码再跑」。",
      };
    case "url_images":
      return {
        title: "【附图】本地 Agent 不支持 http 图 URL",
        body:
          "传图方式问题，不是业务需求写错。请再发一次（可带同一张图）；系统会本地化附图。或说「不要附图、按文字描述再修」。",
      };
    case "agent_missing":
      return {
        title: "【会话】上一轮 Agent 已失效",
        body:
          "常见于重启/清理后。请点「续改确认」再跑；或新开一句具体修改点重新 begin，不要死盯旧任务 id。",
      };
    default:
      return {
        title: "【写码失败】本轮未完成",
        body:
          (d ? "原因：" + d + "。" : "未记录具体原因。") +
          " 可点「续改确认」继续，或补充一句具体问题后再试。",
      };
  }
}

/** 续改确认卡横幅（HITL 仍须用户点确认） */
export function codingFailContinueCopy(kind, detail) {
  const d = shortDetail(detail, 140);
  switch (kind) {
    case "network":
      return {
        title: "上一轮因【网络】失败，点确认后同句重试",
        body:
          "出网/写码云抖动，通常未改到工程，不是需求写错。" +
          (d ? " 细节：" + d + "。" : "") +
          " 点「确认并用 Cursor 开写」按同一诉求继续；未点确认前不会改代码。",
      };
    case "db_eperm":
      return {
        title: "上一轮因【*.db 占用】失败，点确认后继续（勿再同步库）",
        body:
          "同步撞到被占用的数据库文件。" +
          (d ? " 细节：" + d + "。" : "") +
          " 续改应只动源码/migrate。点「确认并用 Cursor 开写」继续；未点确认前不会改代码。",
      };
    case "url_images":
      return {
        title: "上一轮因【附图 URL】失败，点确认后将按本地化方式再试",
        body:
          "本地 Agent 不能吃 http(s) 附图 URL。" +
          (d ? " 细节：" + d + "。" : "") +
          " 点「确认并用 Cursor 开写」继续；未点确认前不会改代码。",
      };
    case "agent_missing":
      return {
        title: "上一轮【Agent 已失效】，点确认后开新会话续改",
        body:
          "旧 Agent 找不到时插件会换新 Agent + 复用沙箱。" +
          (d ? " 细节：" + d + "。" : "") +
          " 点「确认并用 Cursor 开写」继续；未点确认前不会改代码。",
      };
    default:
      return {
        title: "上一轮写码未完成，需要继续处理",
        body:
          (d ? "失败原因：" + d + "。" : "上一轮任务已失败或中断。") +
          " 点「确认并用 Cursor 开写」将按同一诉求继续；不是重新开一个无关的新任务。",
      };
  }
}
