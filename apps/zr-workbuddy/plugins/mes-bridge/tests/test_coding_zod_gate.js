import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  blockCodingIfZodBroken,
  codingZodGateDenyMessage,
  codingZodProfileDirs,
  resolveAppRoot,
  zodDistReady,
  zodEsmIndex,
} from "../lib/coding-zod-gate.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../../..");

test("zodDistReady 认 dist/esm/index.js", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-zod-gate-"));
  assert.equal(zodDistReady(dir), false);
  const esm = zodEsmIndex(dir);
  fs.mkdirSync(path.dirname(esm), { recursive: true });
  fs.writeFileSync(esm, "export{}\n");
  assert.equal(zodDistReady(dir), true);
});

test("deny 文案含修复命令且不说需求错", () => {
  const msg = codingZodGateDenyMessage("demo");
  assert.match(msg, /zod/);
  assert.match(msg, /ensure_cursor_sdk_zod|Mom-x|冷启/);
  assert.match(msg, /不是.*需求写错/);
});

test("已有 dist 时 block 返回 null", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-zod-ok-"));
  const esm = zodEsmIndex(dir);
  fs.mkdirSync(path.dirname(esm), { recursive: true });
  fs.writeFileSync(esm, "export{}\n");
  assert.equal(blockCodingIfZodBroken({ profileDir: dir }), null);
});

test("resolveAppRoot 能找到 ensure_cursor_sdk_zod.py（禁止停在 apps/）", () => {
  const root = resolveAppRoot();
  const script = path.join(root, "scripts", "lib", "ensure_cursor_sdk_zod.py");
  assert.ok(fs.existsSync(script), "appRoot=" + root);
  assert.notEqual(path.basename(root), "apps");
  // 开发仓：应落到仓根
  if (fs.existsSync(path.join(REPO_ROOT, "scripts", "lib", "ensure_cursor_sdk_zod.py"))) {
    assert.equal(path.resolve(root), path.resolve(REPO_ROOT));
  }
});

test("codingZodProfileDirs 含主 profile 与 ~/.dsh 兜底", () => {
  const primary = path.join(os.tmpdir(), "wb-primary-web");
  const dirs = codingZodProfileDirs(primary);
  assert.ok(dirs.some((d) => path.resolve(d) === path.resolve(primary)));
  assert.ok(
    dirs.some((d) => d.replace(/\\/g, "/").endsWith(".dsh/profiles/web")),
  );
});
