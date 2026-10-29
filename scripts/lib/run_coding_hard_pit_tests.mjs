#!/usr/bin/env node
/**
 * 对话写码硬坑回归门禁（P0-2）
 * 改 mes-bridge 写码桥接 / 引擎 db 回收相关代码后必跑。
 *
 * 用法（仓根）:
 *   node scripts/lib/run_coding_hard_pit_tests.mjs
 *
 * 分项:
 *   npm --prefix apps/zr-workbuddy/plugins/mes-bridge run test:coding
 *   py -3 -m unittest tests.test_implement_db_sync_recover
 *   （后者 cwd = apps/zr-workbuddy/engine）
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BRIDGE = path.join(ROOT, "apps/zr-workbuddy/plugins/mes-bridge");
const ENGINE = path.join(ROOT, "apps/zr-workbuddy/engine");
const TEST_DIR = path.join(BRIDGE, "tests");

function die(msg) {
  console.error("[coding-hard-pit] " + msg);
  process.exit(1);
}

function listCodingTests() {
  if (!fs.existsSync(TEST_DIR)) die("缺少 " + TEST_DIR);
  return fs
    .readdirSync(TEST_DIR)
    .filter((n) => /^test_coding_.*\.js$/i.test(n))
    .sort()
    .map((n) => path.join(TEST_DIR, n));
}

function run(label, cmd, args, cwd) {
  console.log("\n==> " + label);
  console.log("    " + [cmd, ...args].join(" "));
  console.log("    cwd=" + cwd);
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    env: process.env,
  });
  if (r.error) die(label + " 启动失败: " + r.error.message);
  if (r.status !== 0) die(label + " 失败 exit=" + r.status);
  console.log("OK " + label);
}

const codingFiles = listCodingTests();
if (!codingFiles.length) die("未找到 test_coding_*.js");

run(
  "mes-bridge test_coding_*",
  "node",
  ["--test", ...codingFiles.map((f) => path.relative(BRIDGE, f))],
  BRIDGE,
);

const py = process.env.WORKBUDDY_PYTHON || (process.platform === "win32" ? "py" : "python3");
const pyArgs =
  process.platform === "win32" && py === "py"
    ? ["-3", "-m", "unittest", "tests.test_implement_db_sync_recover", "-v"]
    : ["-m", "unittest", "tests.test_implement_db_sync_recover", "-v"];

run("engine test_implement_db_sync_recover", py, pyArgs, ENGINE);

console.log("\n[coding-hard-pit] 全部通过（" + codingFiles.length + " 个 JS 文件 + db recover）");
