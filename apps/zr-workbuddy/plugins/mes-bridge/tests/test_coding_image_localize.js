import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  IMAGE_LOCATE_MARKER,
  enrichCodingExecImageLocate,
  extractVimgId,
  loadVisionImageAsDataUrl,
  localizeCodingImagesArg,
  rewriteCodingExecImages,
} from "../lib/coding-image-localize.js";

function seedVision(engineDir, imageId) {
  const uploads = path.join(engineDir, "data", "vision", "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  const name = imageId + "_shot.png";
  const fp = path.join(uploads, name);
  // 最小合法 PNG 头 + 一点填充
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
    0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
    0xff, 0xff, 0x3f, 0x00, 0x05, 0xfe, 0x02, 0xfe, 0xa7, 0x35, 0x81, 0x84, 0x00, 0x00, 0x00,
    0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  fs.writeFileSync(fp, png);
  fs.writeFileSync(
    path.join(uploads, imageId + ".json"),
    JSON.stringify({
      image_id: imageId,
      rel_path: "vision/uploads/" + name,
      mime: "image/png",
    }),
    "utf8",
  );
  return fp;
}

test("extractVimgId 识别 id 与引擎 URL", () => {
  assert.equal(extractVimgId("vimg-0123456789abcdef"), "vimg-0123456789abcdef");
  assert.equal(
    extractVimgId("http://127.0.0.1:18791/api/vision/images/vimg-0123456789abcdef"),
    "vimg-0123456789abcdef",
  );
  assert.equal(
    extractVimgId("/api/vision/images/vimg-0123456789abcdef"),
    "vimg-0123456789abcdef",
  );
  assert.equal(extractVimgId("https://example.com/x.png"), "");
});

test("localizeCodingImagesArg 把 vision URL 转成 data URL", () => {
  const engineDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-vision-"));
  const iid = "vimg-0123456789abcdef";
  seedVision(engineDir, iid);
  const loaded = loadVisionImageAsDataUrl(engineDir, iid);
  assert.equal(loaded.ok, true);
  assert.match(loaded.dataUrl, /^data:image\/png;base64,/);

  const out = localizeCodingImagesArg(
    ["http://127.0.0.1:8000/api/vision/images/" + iid, "D:\\ok\\shot.png"],
    engineDir,
  );
  assert.equal(out.changed, true);
  assert.match(String(out.images[0]), /^data:image\/png;base64,/);
  assert.equal(out.images[1], "D:\\ok\\shot.png");

  const exec = {
    arguments: {
      images: [{ url: "http://127.0.0.1:3081/api/vision/images/" + iid }],
    },
  };
  const rw = rewriteCodingExecImages(exec, engineDir);
  assert.equal(rw.changed, true);
  assert.match(String(exec.arguments.images[0].data), /^data:image\/png;base64,/);
  assert.equal(exec.arguments.images[0].url, undefined);
});

test("拒绝对 uploads 外的 rel_path / 穿越", () => {
  const engineDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-vision-esc-"));
  const uploads = path.join(engineDir, "data", "vision", "uploads");
  fs.mkdirSync(uploads, { recursive: true });
  const iid = "vimg-fedcba9876543210";
  const outside = path.join(engineDir, "data", "secret.bin");
  fs.writeFileSync(outside, Buffer.from("secret"));
  fs.writeFileSync(
    path.join(uploads, iid + ".json"),
    JSON.stringify({
      image_id: iid,
      rel_path: "vision/uploads/../../secret.bin",
      mime: "image/png",
    }),
    "utf8",
  );
  const bad = loadVisionImageAsDataUrl(engineDir, iid);
  assert.equal(bad.ok, false);
  assert.match(String(bad.detail), /非法路径|图片/);
});

test("有附图钉贴图定位；无图不钉；幂等", () => {
  const withImg = {
    arguments: {
      message: "修一下这个报错",
      images: ["vimg-0123456789abcdef"],
    },
  };
  const once = enrichCodingExecImageLocate(withImg);
  assert.equal(once.changed, true);
  assert.match(String(withImg.arguments.message), new RegExp(IMAGE_LOCATE_MARKER));
  assert.match(String(withImg.arguments.message), /问题区域|先.*指/);
  const twice = enrichCodingExecImageLocate(withImg);
  assert.equal(twice.changed, false);

  const noImg = { arguments: { message: "改按钮颜色" } };
  assert.equal(enrichCodingExecImageLocate(noImg).changed, false);
  assert.equal(String(noImg.arguments.message).includes(IMAGE_LOCATE_MARKER), false);
});
