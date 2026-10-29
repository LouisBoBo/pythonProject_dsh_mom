/**
 * 写码前 zod dist 门禁：zod@3.25.0 官方残包无 dist 时 @cursor/sdk 立刻 ERR_MODULE_NOT_FOUND。
 * 确认卡前/执行前探测；缺则用仓内/包内 vendor/zod tarball 经 ensure_cursor_sdk_zod 补齐。
 * 不改 DSH 插件；修不了则 deny 并给出可读说明（禁止空跑写码 Job）。
 *
 * 注意：mes-bridge 在 desktop 布局下位于 runtime-app/apps/.../mes-bridge/lib，
 * 必须向上找到含 scripts/lib/ensure_cursor_sdk_zod.py 的应用根（多为 runtime-app），
 * 禁止写死「上跳 4 层」（会落到 …/apps，自动补齐永远失败）。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 应用根：含 scripts/lib/ensure_cursor_sdk_zod.py（仓根或桌面 runtime-app） */
export function resolveAppRoot() {
  const envRoot = String(process.env.WORKBUDDY_APP_ROOT || "").trim();
  if (envRoot) {
    const script = path.join(envRoot, "scripts", "lib", "ensure_cursor_sdk_zod.py");
    if (fs.existsSync(script)) return path.resolve(envRoot);
  }
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const script = path.join(dir, "scripts", "lib", "ensure_cursor_sdk_zod.py");
    if (fs.existsSync(script)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 最后兜底：mes-bridge/lib → 上 5 层（仓根 / runtime-app）
  return path.resolve(__dirname, "..", "..", "..", "..", "..");
}

export function dshProfilesWeb() {
  const home = process.env.DSH_HOME
    ? String(process.env.DSH_HOME)
    : path.join(os.homedir(), ".dsh");
  return path.join(home, "profiles", "web");
}

/** 写码实际可能碰到的 profile：当前 DSH_HOME + 本机 ~/.dsh（防桌面壳与系统 home 串线） */
export function codingZodProfileDirs(primary) {
  const out = [];
  const seen = new Set();
  const add = (p) => {
    const abs = path.resolve(String(p || ""));
    if (!abs || seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };
  add(primary || dshProfilesWeb());
  add(path.join(os.homedir(), ".dsh", "profiles", "web"));
  const desktopHome = process.env.APPDATA
    ? path.join(process.env.APPDATA, "zr-workbuddy-desktop", "dsh-home", "profiles", "web")
    : "";
  if (desktopHome) add(desktopHome);
  return out;
}

export function zodEsmIndex(profileDir) {
  return path.join(
    String(profileDir || dshProfilesWeb()),
    "node_modules",
    "zod",
    "dist",
    "esm",
    "index.js",
  );
}

export function zodDistReady(profileDir) {
  try {
    return fs.existsSync(zodEsmIndex(profileDir));
  } catch {
    return false;
  }
}

function findPython() {
  for (const c of ["py", "python", "python3"]) {
    const r = spawnSync(c, ["-3", "-c", "print(1)"], {
      encoding: "utf8",
      timeout: 5000,
      windowsHide: true,
    });
    if (c === "py" && r.status === 0) return { cmd: "py", prefix: ["-3"] };
    if (c !== "py" && r.status === 0) return { cmd: c, prefix: [] };
  }
  const r2 = spawnSync("py", ["-c", "print(1)"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  if (r2.status === 0) return { cmd: "py", prefix: ["-3"] };
  return null;
}

/**
 * 缺 dist 时本地补齐（优先 vendor/zod tarball，不依赖联网）。
 * @returns {{ ok: boolean, fixed: boolean, detail: string }}
 */
export function ensureZodDistForCoding(opts = {}) {
  const profile = String(opts.profileDir || dshProfilesWeb());
  if (zodDistReady(profile)) {
    return { ok: true, fixed: false, detail: "zod dist 已就绪" };
  }
  const appRoot = resolveAppRoot();
  const script = path.join(appRoot, "scripts", "lib", "ensure_cursor_sdk_zod.py");
  if (!fs.existsSync(script)) {
    return {
      ok: false,
      fixed: false,
      detail:
        "缺少 ensure_cursor_sdk_zod.py（应用根=" +
        appRoot +
        "），无法自动补齐 zod dist",
    };
  }
  const py = findPython();
  if (!py) {
    return {
      ok: false,
      fixed: false,
      detail: "找不到 Python（py/python），无法自动补齐 zod dist",
    };
  }
  const vendorTb = path.join(appRoot, "vendor", "zod", "zod-3.25.67.tgz");
  const env = { ...process.env, WORKBUDDY_APP_ROOT: appRoot };
  if (fs.existsSync(vendorTb)) {
    env.WORKBUDDY_ZOD_TARBALL = vendorTb;
  }
  const args = [...py.prefix, script, "--fix", "--require", profile];
  const r = spawnSync(py.cmd, args, {
    encoding: "utf8",
    timeout: 90000,
    windowsHide: true,
    env,
    cwd: appRoot,
  });
  const out = String(r.stdout || "") + String(r.stderr || "");
  const ok = zodDistReady(profile);
  return {
    ok,
    fixed: ok,
    detail: ok
      ? "已自动补齐 zod dist（写码依赖）"
      : "自动补齐 zod dist 失败：" + (out.trim().slice(0, 240) || `exit=${r.status}`),
  };
}

/** 给 Agent / 用户的拦截文案（仍须 HITL；本函数只拦工具，不点确认） */
export function codingZodGateDenyMessage(detail) {
  return (
    "【写码环境未就绪 · zod】本机 DSH profile 缺少 zod/dist（常见于插件市场装回 zod@3.25.0 残包）。" +
    "已尝试自动修复但仍失败。" +
    (detail ? " 细节：" + detail + "。" : "") +
    " 桌面版：托盘退出后重开 MOM（冷启会跑 ensure）。" +
    " 浏览器壳：本机执行 py -3 scripts/lib/ensure_cursor_sdk_zod.py --fix --require 后 scripts\\restart-web.ps1，再刷新 http://127.0.0.1:3081。" +
    " 这不是数字业务需求写错。"
  );
}

/**
 * 写码 begin/continue：相关 profile 缺 zod 先修；任一修不好则返回 deny 文案，否则 null。
 */
export function blockCodingIfZodBroken(opts = {}) {
  const profiles = codingZodProfileDirs(opts.profileDir || dshProfilesWeb());
  for (const profile of profiles) {
    if (!fs.existsSync(profile)) continue;
    if (zodDistReady(profile)) continue;
    const r = ensureZodDistForCoding({ profileDir: profile });
    if (!r.ok) return codingZodGateDenyMessage(r.detail + "；profile=" + profile);
  }
  return null;
}
