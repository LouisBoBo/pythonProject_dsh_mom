'use strict'

/**
 * Replace a directory with a junction/symlink to hostTools.
 *
 * Windows often returns EPERM/EBUSY when renaming a tree that antivirus,
 * Search Indexer, or a leftover host process still touches. Boot must not
 * die on the first rename failure — retry, unique bak names, then rm.
 */
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const { hideWin } = require('./win-hide')

function execFileSync(file, args, opts) {
  return childProcess.execFileSync(file, args, hideWin(opts))
}

function winCmdArg(p) {
  const s = String(p || '')
  if (!s) return '""'
  if (/[\s&()[\]{}^=;!'+,`~%]/.test(s) || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function sleepSync(ms) {
  const end = Date.now() + Math.max(0, ms)
  while (Date.now() < end) {
    /* spin — boot path has no async event loop guarantee here */
  }
}

function isDirLink(p) {
  try {
    const st = fs.lstatSync(p)
    if (st.isSymbolicLink()) return true
  } catch {
    return false
  }
  if (process.platform !== 'win32') return false
  try {
    return fs.realpathSync(p) !== path.resolve(p)
  } catch {
    return false
  }
}

function pathExists(p) {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

function removeLinkOnly(dst) {
  try {
    fs.unlinkSync(dst)
    return
  } catch {
    /* fall through */
  }
  try {
    fs.rmdirSync(dst)
    return
  } catch {
    /* fall through */
  }
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/d', '/s', '/c', `rmdir ${winCmdArg(dst)}`], {
      stdio: 'ignore',
      windowsHide: true,
    })
  }
}

function isBusyErr(err) {
  if (!err) return false
  const code = err.code || ''
  if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' || code === 'ENOTEMPTY') {
    return true
  }
  const msg = String(err.message || err)
  return /EPERM|EBUSY|EACCES|operation not permitted|being used by another process/i.test(msg)
}

/** Best-effort delete of leftover *.bak-copy* trees; never throws. */
function purgeBakCopies(dst) {
  const parent = path.dirname(dst)
  const base = path.basename(dst) + '.bak-copy'
  let names = []
  try {
    names = fs.readdirSync(parent)
  } catch {
    return
  }
  for (const name of names) {
    if (name !== base && !name.startsWith(base + '-')) continue
    const p = path.join(parent, name)
    try {
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    } catch {
      /* leave for next boot */
    }
  }
}

function moveAsideOrRemove(dst, opts) {
  const retries = (opts && opts.retries) || 8
  const delayMs = (opts && opts.delayMs) || 120

  if (isDirLink(dst)) {
    removeLinkOnly(dst)
    return { method: 'unlink' }
  }

  for (let i = 0; i < retries; i++) {
    const bak = `${dst}.bak-copy-${Date.now()}-${i}`
    try {
      fs.renameSync(dst, bak)
      // Deleting the bak tree can also EPERM; never block the junction on that.
      try {
        fs.rmSync(bak, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 })
      } catch {
        /* orphan bak is harmless; next boot purgeBakCopies */
      }
      return { method: 'rename', bak }
    } catch (err) {
      if (!isBusyErr(err) && err && err.code !== 'EEXIST') throw err
      sleepSync(delayMs * (i + 1))
    }
  }

  for (let i = 0; i < retries; i++) {
    try {
      fs.rmSync(dst, { recursive: true, force: true, maxRetries: 5, retryDelay: delayMs })
      if (!pathExists(dst)) return { method: 'rm' }
    } catch (err) {
      if (!isBusyErr(err)) throw err
    }
    sleepSync(delayMs * (i + 1))
  }

  if (process.platform === 'win32' && pathExists(dst)) {
    try {
      execFileSync(
        'cmd.exe',
        ['/d', '/s', '/c', `rmdir /s /q ${winCmdArg(dst)}`],
        { stdio: 'ignore', windowsHide: true, timeout: 20000 }
      )
    } catch {
      /* ignore */
    }
    if (!pathExists(dst)) return { method: 'rd' }
  }

  if (pathExists(dst)) {
    const err = new Error(
      `无法腾出目录以对接宿主（文件被占用）: ${dst}\n` +
        '请托盘退出「江西中软」后重开；若仍失败再重启电脑后打开。'
    )
    err.code = 'EPERM'
    throw err
  }
  return { method: 'gone' }
}

function makeJunction(dst, hostReal) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  if (process.platform === 'win32') {
    try {
      fs.symlinkSync(hostReal, dst, 'junction')
      return
    } catch {
      execFileSync(
        'cmd.exe',
        ['/d', '/s', '/c', `mklink /J ${winCmdArg(dst)} ${winCmdArg(hostReal)}`],
        { stdio: 'pipe', windowsHide: true }
      )
    }
    return
  }
  fs.symlinkSync(hostReal, dst)
}

/**
 * @param {string} dst
 * @param {string} hostTools
 * @param {{ retries?: number, delayMs?: number }} [opts]
 */
function relinkDirToHost(dst, hostTools, opts) {
  const hostReal = fs.realpathSync(hostTools)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  purgeBakCopies(dst)

  if (pathExists(dst)) {
    let same = false
    try {
      same = fs.realpathSync(dst) === hostReal
    } catch {
      same = false
    }
    if (same && isDirLink(dst)) return { skipped: true, reason: 'already-linked' }
    moveAsideOrRemove(dst, opts)
  }

  makeJunction(dst, hostReal)
  let linked = false
  try {
    linked = fs.realpathSync(dst) === hostReal && isDirLink(dst)
  } catch {
    linked = false
  }
  if (!linked) {
    throw new Error(`对接宿主失败: ${dst} → ${hostReal}`)
  }
  return { skipped: false, hostReal }
}

/**
 * 把宿主 node_modules 的每一层目录接到 appRoot/node_modules。
 * 已接好的 junction 直接跳过。禁止每次启动删掉再整树复制。
 */
function linkHostClosure(appRoot, hostNested) {
  if (!hostNested || !fs.existsSync(hostNested)) {
    return { linked: 0, skipped: 0, copied: 0 }
  }
  const dstNm = path.join(appRoot, 'node_modules')
  fs.mkdirSync(dstNm, { recursive: true })
  let linked = 0
  let skipped = 0
  let copied = 0
  for (const name of fs.readdirSync(hostNested)) {
    if (name === '.bin') continue
    const src = path.join(hostNested, name)
    let st
    try {
      st = fs.lstatSync(src)
    } catch {
      continue
    }
    if (!st.isDirectory()) continue
    const dst = path.join(dstNm, name)
    try {
      const res = relinkDirToHost(dst, src)
      if (res.skipped) skipped += 1
      else linked += 1
    } catch (err) {
      if (fs.existsSync(dst)) throw err
      fs.cpSync(src, dst, { recursive: true })
      copied += 1
    }
  }
  return { linked, skipped, copied }
}

module.exports = {
  relinkDirToHost,
  linkHostClosure,
  moveAsideOrRemove,
  isDirLink,
  isBusyErr,
  purgeBakCopies,
  winCmdArg,
}
