/**
 * 写码「本轮结论」文案（无 Node 依赖，可进 client bundle）。
 * Agent 侧 closeout 与进度卡横幅共用同一生成逻辑。
 */
import {
  classifyCodingFailKind,
  codeFilesOnlyForSync,
  formatPostCodingSelfCheck,
  isHollowCodingSuccess,
} from "./coding-fail-kind.js";

function clipAssistant(text, max) {
  let t = String(text || "").trim();
  if (!t) return "";
  if (t.length > max) t = t.slice(0, max).trim() + "…";
  return t;
}

/**
 * 进度卡横幅用：去掉「请转告用户」指令行，只留面向用户正文。
 * @returns {{ kind: "ok"|"warn", title: string, body: string } | null}
 */
export function formatCodingCloseoutBanner(job) {
  const raw = formatFriendlyCodingCloseout(job);
  if (!raw) return null;
  const st = String((job && job.status) || "").trim();
  const body = raw
    .split("\n")
    .filter(function (line) {
      return !/^【请把下面这段/.test(String(line || "").trim());
    })
    .join("\n")
    .replace(/^\s+/, "")
    .trim();
  if (!body) return null;
  if (st === "succeeded" && isHollowCodingSuccess(job)) {
    return {
      kind: "warn",
      title: "显示完成，但未检测到源码落盘",
      body: body,
    };
  }
  if (st === "succeeded") {
    return { kind: "ok", title: "本轮结论", body: body };
  }
  if (st === "failed" || st === "cancelled" || st === "canceled") {
    return { kind: "warn", title: "本轮结论（未完成）", body: body };
  }
  return null;
}

/**
 * Cursor IDE 风格：面向用户的本轮结论（成功讲结果，失败讲原因）。
 * 含给 Agent 的「请转告用户」指令行；进度卡请用 formatCodingCloseoutBanner。
 */
export function formatFriendlyCodingCloseout(job) {
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
      job.synced_files || job.last_synced_files || [],
    );
    const nCode = syncedCode.length;
    if (isHollowCodingSuccess(job)) {
      lines.push("【请把下面这段用自然口语转告用户；引导续改，不要说已经修好】");
      lines.push("");
      lines.push(
        "这次「" +
          (req || "写码") +
          "」任务显示完成，但**未检测到源码落盘到工程**（有效同步文件为 0）。不能当成已经改好了。",
      );
      if (detail) {
        lines.push("");
        lines.push("技术细节：" + detail.slice(0, 280));
      }
      lines.push("");
      lines.push(
        "请点「续改确认」卡用同一诉求再跑（带 parent_job_id）；或说明具体要改哪里。修好的标准是工程里能看到对应源码变更。",
      );
      if (jid) lines.push("（任务 " + jid + "）");
      return lines.join("\n");
    }
    lines.push("【请把下面这段用自然口语转告用户，不要再调写码工具、不要再开确认卡】");
    lines.push("");
    lines.push("这次「" + (req || "写码") + "」已经做完了。");
    if (asst) {
      lines.push("");
      lines.push(asst);
    } else if (detail && !/^已同步\s*\d+\s*个文件/.test(detail)) {
      // 插件常把 detail 写成「已同步 N 个文件」——下面会单独列文件，这里勿重复当「结论」
      lines.push("");
      lines.push(detail);
    }
    if (nCode > 0) {
      lines.push("");
      lines.push(
        "已同步到本机 " +
          nCode +
          " 个文件" +
          (detail && /Vite|5173|刷新/.test(detail) ? "，并尝试刷新了前端。" : "："),
      );
      for (const f of syncedCode.slice(0, 12)) {
        lines.push("- " + f);
      }
      if (nCode > 12) lines.push("- …另有 " + (nCode - 12) + " 个");
    } else if (n > 0) {
      lines.push("");
      lines.push("已同步到本机 " + n + " 个文件。");
    }
    lines.push("");
    const selfCheck = formatPostCodingSelfCheck(
      job.synced_files || job.last_synced_files || [],
    );
    if (selfCheck) {
      lines.push(selfCheck);
    } else {
      lines.push(
        "请按下面方式验收：打开相关页面，点一遍刚改的功能确认效果。",
      );
    }
    lines.push(
      "如果还要改，直接说具体哪里不对（例如按钮颜色、接口报错），我会按新的修改点继续。",
    );
    if (jid) lines.push("（任务 " + jid + "）");
    return lines.join("\n");
  }

  if (st === "failed" || st === "cancelled" || st === "canceled") {
    const blob = detail + "\n" + asst;
    const recovered = Array.isArray(job.recovered_files) ? job.recovered_files : [];
    const recoveredDeleted = Array.isArray(job.recovered_deleted) ? job.recovered_deleted : [];
    if (recovered.length) {
      lines.push(
        "同步库文件时被本机后端占用（*.db EPERM），但这不是整单作废：源码已从沙箱写回工程（跳过库文件，共 " +
          recovered.length +
          " 个）。",
      );
      lines.push("");
      lines.push("已落盘：");
      for (const f of recovered.slice(0, 20)) lines.push("- " + f);
      if (recovered.length > 20) {
        lines.push("- …另有 " + (recovered.length - 20) + " 个");
      }
      if (recoveredDeleted.length) {
        lines.push("");
        lines.push("已按沙箱删除清单从工程移除：");
        for (const f of recoveredDeleted.slice(0, 20)) lines.push("- " + f);
      }
      lines.push("");
      lines.push("请重启后端验收。库文件本来就不该当写码产物同步。");
      if (jid) lines.push("（任务 " + jid + "）");
      return lines.join("\n");
    }
    const failKind = classifyCodingFailKind(blob);
    const dbEperm = failKind === "db_eperm";
    const urlImages = failKind === "url_images";
    const agentMissing = failKind === "agent_missing";
    const networkFail = failKind === "network";
    lines.push("【请把下面这段用自然口语转告用户，说明原因；不要用同一原话再开确认卡】");
    lines.push("");
    lines.push(
      (st === "failed" ? "这次写码没有完成。" : "这次写码已取消。") +
        (req ? "诉求是「" + req + "」。" : ""),
    );
    lines.push("");
    if (dbEperm) {
      lines.push(
        "原因：同步时试图回写正在被本机后端占用的数据库文件（*.db），Windows 下原子替换会报 EPERM——这属于预期风险，不是「改库结构方案本身错了」。",
      );
      lines.push("");
      lines.push(
        "正确做法：只同步 migrate / 业务源码，不要同步 *.db；先停掉占用库的后端，确认源码已落地后，再本机重启后端走 lifespan/migrate 重建或迁移表结构。",
      );
      if (detail) {
        lines.push("");
        lines.push("技术细节：" + detail.slice(0, 280));
      }
    } else if (urlImages) {
      lines.push(
        "原因：本机写码用的是 Cursor 本地 Agent，不能把引擎附图当成 http(s) URL 传进去（云端 Agent 才支持 URL 图）。这是传图方式问题，不是你的业务需求写错了。",
      );
      lines.push("");
      lines.push(
        "请再发一次（可带同一张截图）。系统会把附图转成本地可用形态后再开写；若仍失败，说「不要附图、按文字描述再修」。",
      );
    } else if (agentMissing) {
      lines.push(
        "原因：上一轮写码会话的 Agent 已过期或不在（重启/清理后），续跑找不到旧 Agent。插件一般会改用新 Agent + 复用沙箱；若仍失败，多半是连带的其它错误（如传图方式）。",
      );
      lines.push("");
      lines.push(
        "请点「续改确认」再跑一轮；或新开一句具体修改点让我重新 begin，不要依赖已失效的旧任务 id。",
      );
      if (detail) {
        lines.push("");
        lines.push("技术细节：" + detail.slice(0, 280));
      }
    } else if (networkFail) {
      lines.push(
        "原因：写码云/本机出网出现网络抖动（常见文案 Network request failed，常带 retryable=true）。这不是你的业务需求写错了；本轮通常还没建起 Agent、工程里也没有改动。",
      );
      lines.push("");
      lines.push(
        "请点「续改确认」卡用同一诉求再试一轮。若连续多次仍是网络失败，先检查本机能否正常出网，再说「再跑一遍」。",
      );
      if (detail) {
        lines.push("");
        lines.push("技术细节：" + detail.slice(0, 280));
      }
    } else {
      lines.push("原因：" + (detail || asst || "未记录具体原因，请看进度卡或稍后重试。"));
    }
    lines.push("");
    lines.push(
      dbEperm
        ? "源码若已在工程里，你直接重启后端验收即可；若还缺 migrate 文件，说「不要碰 db，只补源码再同步」我继续。"
        : urlImages || agentMissing || networkFail
          ? "点续改确认卡继续即可；我会按同一诉求再处理。"
          : "你可以补充一句具体问题，或说明「按刚才方案再跑一遍」，我再继续帮你处理。",
    );
    if (jid) lines.push("（任务 " + jid + "）");
    return lines.join("\n");
  }

  return "";
}

/**
 * 给对话流式正文用的完整结论（不含「请转告」指令行）。
 */
export function userFacingCodingConclusion(job) {
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
  const banner = formatCodingCloseoutBanner(
    asst && asst !== job.assistant_text ? Object.assign({}, job, { assistant_text: asst }) : job,
  );
  return banner && banner.body ? banner.body : "";
}
