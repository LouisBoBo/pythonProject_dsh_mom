'use strict'

/**
 * 把安装包内嵌的 dshmarket（及它需要的 undici≥7）拷进隔离 profile。
 * 旧 profile 常残留 undici@5；dshmarket 1.66 要 ESM 命名导出 EnvHttpProxyAgent，
 * 若跳过已存在的 undici，宿主会启动失败，启动页停在「正在启动服务…」。
 */

const MARKET_PKG = 'dshmarket'
const FORCE_DEPS = new Set([MARKET_PKG, 'undici'])

function readPkgVersion(pkgJsonPath) {
  try {
    return String(JSON.parse(require('fs').readFileSync(pkgJsonPath, 'utf8')).version || '')
  } catch {
    return ''
  }
}

function undiciMajor(profileNm) {
  const ver = readPkgVersion(require('path').join(profileNm, 'undici', 'package.json'))
  const major = Number(String(ver).split('.')[0])
  return Number.isFinite(major) ? major : 0
}

function marketReady(profile, wantVer, exists) {
  const path = require('path')
  const present = typeof exists === 'function' ? exists : require('fs').existsSync
  const marker = path.join(profile, '.workbuddy-market')
  const destClient = path.join(profile, 'node_modules', MARKET_PKG, 'client', 'client.js')
  let have = ''
  try {
    have = require('fs').readFileSync(marker, 'utf8').trim()
  } catch {
    have = ''
  }
  if (have !== wantVer || !wantVer || !present(destClient)) return false
  return undiciMajor(path.join(profile, 'node_modules')) >= 7
}

/**
 * @param {string} srcNm market/node_modules
 * @param {string} profile profile 根目录
 * @param {{ exists?: (p:string)=>boolean, cpSync?: Function, rmSync?: Function, mkdirSync?: Function, readdirSync?: Function, lstatSync?: Function, writeFileSync?: Function, readFileSync?: Function }} [fsApi]
 * @returns {{ installed: boolean, reason: string, wantVer: string }}
 */
function installMarketIntoProfile(srcNm, profile, fsApi) {
  const fs = fsApi || require('fs')
  const path = require('path')
  const exists = fs.existsSync ? fs.existsSync.bind(fs) : require('fs').existsSync
  const srcPkg = path.join(srcNm, MARKET_PKG, 'package.json')
  if (!exists(srcPkg)) {
    return { installed: false, reason: 'missing-source', wantVer: '' }
  }
  const wantVer = readPkgVersion(srcPkg)
  if (marketReady(profile, wantVer, exists)) {
    return { installed: false, reason: 'already-ready', wantVer }
  }

  const dstNm = path.join(profile, 'node_modules')
  fs.mkdirSync(dstNm, { recursive: true })
  for (const name of fs.readdirSync(srcNm)) {
    if (name === '.bin' || name.startsWith('.')) continue
    const src = path.join(srcNm, name)
    let st
    try {
      st = fs.lstatSync(src)
    } catch {
      continue
    }
    if (name.startsWith('@') && st.isDirectory()) {
      const dstScope = path.join(dstNm, name)
      fs.mkdirSync(dstScope, { recursive: true })
      for (const pkg of fs.readdirSync(src)) {
        const s = path.join(src, pkg)
        const d = path.join(dstScope, pkg)
        if (exists(d) && !FORCE_DEPS.has(`${name}/${pkg}`)) continue
        if (exists(d)) fs.rmSync(d, { recursive: true, force: true })
        fs.cpSync(s, d, { recursive: true })
      }
      continue
    }
    const dst = path.join(dstNm, name)
    const force = FORCE_DEPS.has(name)
    if (exists(dst)) {
      if (!force) continue
      fs.rmSync(dst, { recursive: true, force: true })
    }
    fs.cpSync(src, dst, { recursive: true })
  }
  fs.writeFileSync(path.join(profile, '.workbuddy-market'), wantVer, 'utf8')
  return { installed: true, reason: 'copied', wantVer }
}

module.exports = {
  MARKET_PKG,
  FORCE_DEPS,
  undiciMajor,
  marketReady,
  installMarketIntoProfile,
  readPkgVersion,
}
