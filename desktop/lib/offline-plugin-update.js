'use strict'

/**
 * Windows: dshmarket updates fail when the running DSH host holds plugin files
 * open (EPERM rename →「请完全退出 DSH 后再更新」). Electron does not load those
 * modules — only the host Node process does. Stop the host, run pnpm here,
 * then the shell can respawn the host.
 */
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const { hideWin } = require('./win-hide')

function execFileSync(file, args, opts) {
  return childProcess.execFileSync(file, args, hideWin(opts))
}

function cleanStalePackageDirs(profileDir, scopePkg) {
  const scope = scopePkg.startsWith('@') ? scopePkg.split('/')[0] : null
  const base = scope
    ? path.join(profileDir, 'node_modules', scope)
    : path.join(profileDir, 'node_modules')
  if (!fs.existsSync(base)) return []
  const removed = []
  const prefix = scopePkg.startsWith('@') ? scopePkg.split('/')[1] : scopePkg
  for (const name of fs.readdirSync(base)) {
    if (name === prefix) continue
    if (!name.startsWith(prefix + '_tmp_') && !name.startsWith(prefix + '.bak')) continue
    const p = path.join(base, name)
    try {
      fs.rmSync(p, { recursive: true, force: true, maxRetries: 8, retryDelay: 120 })
      removed.push(p)
    } catch (err) {
      removed.push(`${p} (fail: ${err && err.message ? err.message : err})`)
    }
  }
  return removed
}

/**
 * @param {{
 *   profileDir: string,
 *   nodeBin: string,
 *   pnpmCjs: string,
 *   packageSpec: string,
 *   env?: NodeJS.ProcessEnv,
 *   timeoutMs?: number,
 * }} opts
 */
function updatePluginOffline(opts) {
  const profileDir = opts.profileDir
  const nodeBin = opts.nodeBin
  const pnpmCjs = opts.pnpmCjs
  const packageSpec = String(opts.packageSpec || '').trim()
  if (!profileDir || !fs.existsSync(path.join(profileDir, 'package.json'))) {
    throw new Error(`profile 无效: ${profileDir}`)
  }
  if (!nodeBin || !fs.existsSync(nodeBin)) throw new Error(`缺少 node: ${nodeBin}`)
  if (!pnpmCjs || !fs.existsSync(pnpmCjs)) throw new Error(`缺少 pnpm: ${pnpmCjs}`)
  if (!packageSpec) throw new Error('缺少 packageSpec（如 @zhongruan/dsh-cursor-chat@0.1.4）')

  // packageSpec forms: @scope/name@version | @scope/name | name@version
  let pkgName = packageSpec
  const m = packageSpec.match(/^(@[^/]+\/[^@]+|[^@]+)(?:@.+)?$/)
  if (m) pkgName = m[1]

  const cleaned = cleanStalePackageDirs(profileDir, pkgName)
  const env = { ...(opts.env || process.env) }
  delete env.ELECTRON_RUN_AS_NODE

  const args = [pnpmCjs, 'add', packageSpec]
  const out = execFileSync(nodeBin, args, {
    cwd: profileDir,
    env,
    encoding: 'utf8',
    timeout: opts.timeoutMs || 600000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const installedPkg = path.join(
    profileDir,
    'node_modules',
    ...pkgName.split('/')
  )
  const pj = path.join(installedPkg, 'package.json')
  if (!fs.existsSync(pj)) {
    throw new Error(`pnpm add 结束但未找到 ${pj}`)
  }
  let version = ''
  try {
    version = JSON.parse(fs.readFileSync(pj, 'utf8')).version || ''
  } catch {
    version = ''
  }
  return {
    ok: true,
    packageName: pkgName,
    version,
    cleaned,
    log: String(out || '').slice(-2000),
  }
}

module.exports = {
  updatePluginOffline,
  cleanStalePackageDirs,
}
