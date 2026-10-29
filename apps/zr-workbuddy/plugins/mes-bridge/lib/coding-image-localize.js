/**
 * 对话写码附图本地化：把引擎 vimg /api/vision/images URL 转成 data URL，
 * 避免本地 Cursor SDK 报「URL images are only supported for cloud SDK agents」。
 * 不改 DSH 插件；仅在 mes-bridge 调 zr_cchat_* 前改写 arguments.images。
 */
import fs from "node:fs";
import path from "node:path";

const VIMG_RE = /^vimg-[a-f0-9]{16}$/i;
const VISION_URL_RE =
  /(?:https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?)?\/api\/vision\/images\/(vimg-[a-f0-9]{16})\b/i;
const MAX_IMAGES = 8;
const MAX_BYTES = 8 * 1024 * 1024;

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

export function visionUploadsDir(engineDir) {
  return path.join(String(engineDir || ""), "data", "vision", "uploads");
}

export function extractVimgId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (VIMG_RE.test(s)) return s.toLowerCase();
  const m = VISION_URL_RE.exec(s);
  if (m) return m[1].toLowerCase();
  return "";
}

function mimeFromPath(p) {
  const ext = path.extname(p).toLowerCase();
  return MIME_BY_EXT[ext] || "image/png";
}

/**
 * 读 engine/data/vision/uploads 下已落盘附图 → data URL。
 * @returns {{ ok: true, dataUrl: string, imageId: string } | { ok: false, detail: string, imageId?: string }}
 */
export function loadVisionImageAsDataUrl(engineDir, imageId) {
  const iid = String(imageId || "").trim().toLowerCase();
  if (!VIMG_RE.test(iid)) {
    return { ok: false, detail: "无效 image_id", imageId: iid };
  }
  const uploads = visionUploadsDir(engineDir);
  const metaPath = path.join(uploads, iid + ".json");
  if (!fs.existsSync(metaPath)) {
    return { ok: false, detail: "图片不存在或已过期", imageId: iid };
  }
  let meta = {};
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return { ok: false, detail: "图片元数据损坏", imageId: iid };
  }
  const rel = String(meta.rel_path || "").replace(/\\/g, "/");
  if (!rel || rel.includes("..") || !rel.startsWith("vision/uploads/")) {
    return { ok: false, detail: "非法路径", imageId: iid };
  }
  const dataRoot = path.join(String(engineDir || ""), "data");
  const fp = path.join(dataRoot, ...rel.split("/"));
  // 防穿越/符号链接逃逸：realpath 必须仍落在 uploads 目录下
  let resolvedFp = "";
  let resolvedUploads = "";
  try {
    resolvedUploads = fs.realpathSync.native
      ? fs.realpathSync.native(uploads)
      : fs.realpathSync(uploads);
    resolvedFp = fs.realpathSync.native
      ? fs.realpathSync.native(fp)
      : fs.realpathSync(fp);
  } catch {
    return { ok: false, detail: "图片文件缺失", imageId: iid };
  }
  const uploadsPrefix = resolvedUploads.endsWith(path.sep)
    ? resolvedUploads
    : resolvedUploads + path.sep;
  if (resolvedFp !== resolvedUploads && !resolvedFp.startsWith(uploadsPrefix)) {
    return { ok: false, detail: "非法路径", imageId: iid };
  }
  let buf;
  try {
    buf = fs.readFileSync(resolvedFp);
  } catch (e) {
    return { ok: false, detail: "读图失败：" + String(e && e.message ? e.message : e), imageId: iid };
  }
  if (!buf || !buf.length) {
    return { ok: false, detail: "图片为空", imageId: iid };
  }
  if (buf.length > MAX_BYTES) {
    return { ok: false, detail: "图片过大", imageId: iid };
  }
  const mime = String(meta.mime || "").trim() || mimeFromPath(fp);
  if (!/^image\//i.test(mime)) {
    return { ok: false, detail: "非 image/*", imageId: iid };
  }
  return {
    ok: true,
    imageId: iid,
    dataUrl: "data:" + mime + ";base64," + buf.toString("base64"),
  };
}

function localizeOne(item, engineDir, notes) {
  if (item == null || item === "") return item;
  if (typeof item === "string") {
    const t = item.trim();
    if (t.startsWith("data:image/")) return t;
    const iid = extractVimgId(t);
    if (!iid) return item;
    const loaded = loadVisionImageAsDataUrl(engineDir, iid);
    if (loaded.ok) {
      notes.push("localized:" + iid);
      return loaded.dataUrl;
    }
    notes.push("fail:" + iid + ":" + loaded.detail);
    return item;
  }
  if (typeof item === "object" && !Array.isArray(item)) {
    const o = { ...item };
    const fromUrl = extractVimgId(o.url || o.src || "");
    const fromId = extractVimgId(o.image_id || o.id || "");
    const fromPath = extractVimgId(o.path || "");
    const iid = fromUrl || fromId || fromPath;
    if (!iid) return item;
    if (String(o.data || o.base64 || "").startsWith("data:image/")) return item;
    const loaded = loadVisionImageAsDataUrl(engineDir, iid);
    if (loaded.ok) {
      notes.push("localized:" + iid);
      delete o.url;
      delete o.src;
      delete o.path;
      o.data = loaded.dataUrl;
      o.mimeType = String(loaded.dataUrl.split(";")[0] || "").replace(/^data:/, "") || o.mimeType;
      return o;
    }
    notes.push("fail:" + iid + ":" + loaded.detail);
    return item;
  }
  return item;
}

/**
 * 改写工具参数里的 images，使本地 Cursor SDK 可消费。
 * @returns {{ images: any, changed: boolean, notes: string[] }}
 */
export function localizeCodingImagesArg(rawImages, engineDir) {
  const notes = [];
  if (rawImages == null || rawImages === "") {
    return { images: rawImages, changed: false, notes };
  }
  let parsed = rawImages;
  if (typeof rawImages === "string") {
    const t = rawImages.trim();
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        parsed = JSON.parse(t);
      } catch {
        parsed = t;
      }
    }
  }
  if (Array.isArray(parsed)) {
    const next = parsed.slice(0, MAX_IMAGES).map((it) => localizeOne(it, engineDir, notes));
    const changed = notes.some((n) => n.startsWith("localized:"));
    return { images: next, changed, notes };
  }
  const one = localizeOne(parsed, engineDir, notes);
  const changed = notes.some((n) => n.startsWith("localized:"));
  return { images: one, changed, notes };
}

/**
 * 就地改写 exec.arguments.images（若存在）。
 * @returns {{ changed: boolean, notes: string[] }}
 */
export function rewriteCodingExecImages(exec, engineDir) {
  const args = exec && exec.arguments;
  if (!args || typeof args !== "object") {
    return { changed: false, notes: [] };
  }
  const key =
    args.images != null
      ? "images"
      : args.image != null
        ? "image"
        : args.attachments != null
          ? "attachments"
          : "";
  if (!key) return { changed: false, notes: [] };
  const out = localizeCodingImagesArg(args[key], engineDir);
  if (out.changed) {
    args[key] = out.images;
  }
  return { changed: out.changed, notes: out.notes };
}

/** 贴图→定位（Q1-2）：有附图时钉进 message，先指区域再改；不改识图/SDK */
export const IMAGE_LOCATE_MARKER = "【贴图定位】";

export const IMAGE_LOCATE_HINT =
  IMAGE_LOCATE_MARKER +
  "\n有附图：请先根据截图指出问题区域/控件/文案（大概位置与现象），再做最小相关改动；" +
  "禁止不看图整页重写或瞎猜组件。" +
  "识图由对话写码 Agent 完成，勿另调 mes_vision_understand 当主入口。";

function execHasCodingImages(exec) {
  const args = exec && exec.arguments;
  if (!args || typeof args !== "object") return false;
  const raw = args.images ?? args.image ?? args.attachments;
  if (raw == null) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  const s = String(raw).trim();
  return s.length > 2 && s !== "[]" && s !== "null";
}

/**
 * 有附图时在 message 末尾钉「先指区域再改」（幂等）。
 * @returns {{ changed: boolean }}
 */
export function enrichCodingExecImageLocate(exec) {
  if (!execHasCodingImages(exec)) return { changed: false };
  const args = exec && exec.arguments;
  if (!args || typeof args !== "object") return { changed: false };
  let key = "";
  if (typeof args.message === "string") key = "message";
  else if (typeof args.requirement === "string") key = "requirement";
  else if (typeof args.prompt === "string") key = "prompt";
  else if (typeof args.text === "string") key = "text";
  else key = "message";
  const prev = String(args[key] || "");
  if (prev.includes(IMAGE_LOCATE_MARKER)) return { changed: false };
  const base = prev.trim();
  args[key] = base ? base + "\n\n" + IMAGE_LOCATE_HINT : IMAGE_LOCATE_HINT;
  return { changed: true };
}
