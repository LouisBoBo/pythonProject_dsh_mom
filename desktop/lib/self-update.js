/**
 * WorkBuddy 桌面壳自升级（一期）：检查 + 全量下载 + 人确认后拉起安装包。
 * 方案：docs/功能实现/桌面应用版本升级方案.md
 *
 * 安全约束（fail-closed）：
 * - 清单与安装包必须同源：host 必须等于 feed base 的 host，仅 http/https
 * - artifact.file 只允许纯文件名（拒绝路径与 % 编码），下载 URL 由 feedBase 拼出
 * - sha256 必填；下载后校验不过即删除临时文件
 * - 本模块不执行渲染层传来的任何路径；安装包路径只来自本会话已校验的下载
 */
'use strict'

const fs = require('fs')
const path = require('path')
const http = require('http')
const https = require('https')
const crypto = require('crypto')

/** 与公司私有插件市场同一台服务器，另起路径（不共用 dsh-plugins/）。 */
const DEFAULT_FEED_BASE = 'http://175.178.238.31/workbuddy-desktop/'
const FEED_BASE_ENV = 'WORKBUDDY_UPDATE_FEED_BASE'
const MAX_REDIRECTS = 5
const MAX_JSON_BYTES = 1024 * 1024
const MAX_PACKAGE_BYTES = 3 * 1024 * 1024 * 1024
const FEED_TIMEOUT_MS = 15000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000
const VERSION_RE = /^\d+\.\d+\.\d+$/
const SHA256_RE = /^[0-9a-f]{64}$/

/** 清单根地址：默认公司服务器另起路径；环境变量仅运维/调试用，禁止写进发版默认。 */
function feedBase(env) {
  const bag = env || process.env
  const raw = String(bag[FEED_BASE_ENV] || DEFAULT_FEED_BASE)
  return raw.endsWith('/') ? raw : raw + '/'
}

/** 两台打包机各产各的清单，客户端按平台各取一份，无需合并。 */
function feedNameForPlatform(platform) {
  if (platform === 'win32') return 'latest-windows.json'
  if (platform === 'darwin') return 'latest-macos.json'
  return ''
}

function platformKey(platform) {
  if (platform === 'win32') return 'windows'
  if (platform === 'darwin') return 'macos'
  return ''
}

/** 只比数字段：0.2.27 > 0.2.26；返回 -1 / 0 / 1。 */
function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.')
  const pb = String(b || '').replace(/^v/i, '').split('.')
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const x = parseInt(pa[i] || '0', 10)
    const y = parseInt(pb[i] || '0', 10)
    const nx = Number.isFinite(x) ? x : 0
    const ny = Number.isFinite(y) ? y : 0
    if (nx !== ny) return nx < ny ? -1 : 1
  }
  return 0
}

/** 安装包 URL 只能由 feedBase + 纯文件名拼出；任何路径、编码、跨 host 一律拒绝。 */
function resolveArtifactUrl(base, file) {
  const f = String(file || '')
  if (!f || f.includes('/') || f.includes('\\') || f.includes('..') || f.includes('%')) return ''
  let b
  try {
    b = new URL(base)
  } catch {
    return ''
  }
  if (b.protocol !== 'http:' && b.protocol !== 'https:') return ''
  let u
  try {
    u = new URL(encodeURIComponent(f), b)
  } catch {
    return ''
  }
  if (u.host !== b.host) return ''
  return u.toString()
}

/** 清单 schema 校验：缺 sha256 / 版本不合法 / 平台不符 → null（fail-closed）。 */
function validateLatest(raw, platform) {
  if (!raw || typeof raw !== 'object') return null
  const want = platformKey(platform)
  if (!want) return null
  if (raw.platform != null && String(raw.platform) !== want) return null
  const version = String(raw.version || '').trim()
  if (!VERSION_RE.test(version)) return null
  const art = raw.artifact
  if (!art || typeof art !== 'object') return null
  const file = String(art.file || '').trim()
  const sha256 = String(art.sha256 || '').trim().toLowerCase()
  const size = Number(art.size)
  if (!file || !SHA256_RE.test(sha256)) return null
  if (!Number.isFinite(size) || size <= 0 || size > MAX_PACKAGE_BYTES) return null
  return {
    version,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt : '',
    artifact: { file, sha256, size },
  }
}

/** GET 并跟随重定向（限同 host）；成功 resolve { res, url }。 */
function openStream(url, timeout, redirectsLeft) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(url)
    } catch {
      reject(new Error('地址不合法'))
      return
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      reject(new Error('仅支持 http/https'))
      return
    }
    const mod = u.protocol === 'https:' ? https : http
    const req = mod.get(u, { timeout }, (res) => {
      const code = res.statusCode || 0
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume()
        if (redirectsLeft <= 0) {
          reject(new Error('重定向次数过多'))
          return
        }
        let next
        try {
          next = new URL(res.headers.location, u)
        } catch {
          reject(new Error('重定向地址不合法'))
          return
        }
        if (next.host !== u.host) {
          reject(new Error('重定向到其它服务器，已拒绝'))
          return
        }
        openStream(next.toString(), timeout, redirectsLeft - 1).then(resolve, reject)
        return
      }
      if (code !== 200) {
        res.resume()
        reject(new Error('HTTP ' + code))
        return
      }
      resolve({ res, url: u })
    })
    req.on('timeout', () => req.destroy(new Error('请求超时')))
    req.on('error', reject)
  })
}

async function fetchJson(url) {
  const { res } = await openStream(url, FEED_TIMEOUT_MS, MAX_REDIRECTS)
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    res.on('data', (c) => {
      total += c.length
      if (total > MAX_JSON_BYTES) {
        res.destroy(new Error('清单过大'))
        return
      }
      chunks.push(c)
    })
    res.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('清单不是合法 JSON'))
      }
    })
    res.on('error', reject)
  })
}

/** 拉取并校验本平台的更新清单；任何异常由调用方兜底成「向管理员要包」。 */
async function fetchLatest(base, platform) {
  const name = feedNameForPlatform(platform)
  if (!name) throw new Error('当前平台不支持在线升级')
  const url = new URL(name, base).toString()
  const raw = await fetchJson(url)
  const latest = validateLatest(raw, platform)
  if (!latest) throw new Error('更新清单格式异常')
  return latest
}

/** 全量下载到 dest，进度回调（200ms 节流）；超限/出错即删除半成品。 */
async function downloadFile(url, dest, expectedSize, onProgress) {
  const { res } = await openStream(url, DOWNLOAD_TIMEOUT_MS, MAX_REDIRECTS)
  const total = Number(res.headers['content-length'] || expectedSize || 0)
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  return new Promise((resolve, reject) => {
    let received = 0
    let lastEmit = 0
    const out = fs.createWriteStream(dest)
    const fail = (e) => {
      out.destroy()
      try {
        fs.rmSync(dest, { force: true })
      } catch {
        /* ignore */
      }
      reject(e)
    }
    res.on('data', (c) => {
      received += c.length
      if (received > MAX_PACKAGE_BYTES) {
        res.destroy(new Error('安装包超过大小上限'))
        return
      }
      const now = Date.now()
      if (onProgress && now - lastEmit > 200) {
        lastEmit = now
        onProgress(received, total)
      }
    })
    res.pipe(out)
    res.on('error', fail)
    out.on('error', fail)
    out.on('finish', () => {
      if (onProgress) onProgress(received, total || received)
      resolve({ received })
    })
  })
}

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const s = fs.createReadStream(p)
    s.on('data', (c) => hash.update(c))
    s.on('end', () => resolve(hash.digest('hex')))
    s.on('error', reject)
  })
}

module.exports = {
  DEFAULT_FEED_BASE,
  FEED_BASE_ENV,
  MAX_PACKAGE_BYTES,
  feedBase,
  feedNameForPlatform,
  compareVersions,
  resolveArtifactUrl,
  validateLatest,
  fetchLatest,
  downloadFile,
  sha256File,
}
