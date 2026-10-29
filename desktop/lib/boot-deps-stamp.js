'use strict'

/**
 * 冷启动依赖门禁戳记。
 * 上一轮完整检查已通过、且版本 / 内嵌 Python 依赖 / 宿主 Node / profile 清单都没变时，
 * 不再为同一件事新开 Python。任一输入变了，戳记对不上，仍走完整 ensure_runtime。
 */
const BOOT_STAMP_NAME = 'boot-deps.stamp'

function normalizeStamp(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\n+$/g, '')
}

function canSkipBootDeps(saved, current) {
  const want = normalizeStamp(current)
  if (!want) return false
  return normalizeStamp(saved) === want
}

module.exports = {
  BOOT_STAMP_NAME,
  canSkipBootDeps,
  normalizeStamp,
}
