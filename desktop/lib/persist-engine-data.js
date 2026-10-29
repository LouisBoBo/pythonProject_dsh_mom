/**
 * 桌面升级刷新 runtime-app 时保住引擎可变数据（一体化账本/开关/用量/资料库等）。
 * 真相目录：userData/persist/engine-data （不在会被 rm 的 runtime-app 内）。
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ENGINE_DATA_REL = 'engine-data'

function durableDataDir(persistDir) {
  return path.join(persistDir, ENGINE_DATA_REL)
}

function liveDataDir(liveEngineDir) {
  return path.join(liveEngineDir, 'data')
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

/** 合并 plugins.json：用户名单 ∪ 安装包默认 enabled（避免升级后丢 dev-pipeline 等） */
function mergePluginsJson(persistPlugins, packagePlugins) {
  const base =
    persistPlugins && typeof persistPlugins === 'object' ? { ...persistPlugins } : {}
  const pkg =
    packagePlugins && typeof packagePlugins === 'object' ? packagePlugins : {}
  const a = Array.isArray(base.enabled) ? base.enabled.map(String) : []
  const b = Array.isArray(pkg.enabled) ? pkg.enabled.map(String) : []
  const seen = new Set()
  const enabled = []
  for (const id of [...a, ...b]) {
    const s = String(id || '').trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    enabled.push(s)
  }
  return { ...pkg, ...base, enabled }
}

function copyTree(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.cpSync(src, dst, { recursive: true, force: true })
}

/**
 * 启动刷新前：把当前运行中的 engine/data 整树同步到 persist/engine-data。
 */
function stashEngineData({ liveEngineDir, persistDir }) {
  if (!liveEngineDir || !persistDir) return { ok: false, reason: 'bad-args' }
  const live = liveDataDir(liveEngineDir)
  if (!isDir(live)) return { ok: false, reason: 'no-live-data' }
  const durable = durableDataDir(persistDir)
  copyTree(live, durable)
  // 兼容旧路径：同步一份 plugins.json 到 persist 根
  const plugins = path.join(durable, 'plugins.json')
  if (fs.existsSync(plugins)) {
    try {
      fs.copyFileSync(plugins, path.join(persistDir, 'plugins.json'))
    } catch {
      /* ignore */
    }
  }
  return { ok: true, durable }
}

/**
 * 刷完安装包后：用 durable 盖回 live；再与包内 plugins 默认做并集合并。
 * @param {object} [packagePlugins] 新包 data/plugins.json 解析结果
 */
function restoreEngineData({ liveEngineDir, persistDir, packagePlugins }) {
  if (!liveEngineDir || !persistDir) return { ok: false, reason: 'bad-args' }
  const durable = durableDataDir(persistDir)
  if (!isDir(durable)) return { ok: false, reason: 'no-durable' }
  const live = liveDataDir(liveEngineDir)
  fs.mkdirSync(path.dirname(live), { recursive: true })
  copyTree(durable, live)

  const pluginsPath = path.join(live, 'plugins.json')
  const persistPlugins = readJson(pluginsPath, { enabled: [] })
  const merged = mergePluginsJson(persistPlugins, packagePlugins || null)
  writeJson(pluginsPath, merged)
  writeJson(path.join(durable, 'plugins.json'), merged)
  try {
    fs.copyFileSync(pluginsPath, path.join(persistDir, 'plugins.json'))
  } catch {
    /* ignore */
  }
  return { ok: true, enabled: merged.enabled }
}

module.exports = {
  ENGINE_DATA_REL,
  durableDataDir,
  liveDataDir,
  mergePluginsJson,
  stashEngineData,
  restoreEngineData,
}
