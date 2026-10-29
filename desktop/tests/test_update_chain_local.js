'use strict'

/**
 * 不依赖云服务器：用本机 release/latest-windows.json 起临时 HTTP，
 * 走与桌面壳相同的 self-update 拉清单 → 比版本 → 拼下载 URL。
 * 用于「先不上传」时确认检查更新链路仍正常。
 */
const assert = require('assert')
const http = require('http')
const fs = require('fs')
const path = require('path')
const su = require('../lib/self-update')

const releaseDir = path.join(__dirname, '..', 'release')
const feedPath = path.join(releaseDir, 'latest-windows.json')

assert.ok(fs.existsSync(feedPath), '缺少 release/latest-windows.json（请先完整打包一次）')
const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'))
assert.ok(feed.version && feed.artifact && feed.artifact.file, '清单字段不完整')

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler)
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}

async function main() {
  const raw = fs.readFileSync(feedPath)
  const srv = await listen((req, res) => {
    const u = String(req.url || '').split('?')[0]
    if (u === '/latest-windows.json' || u === '/') {
      // only exact feed path; /missing/... must 404
      if (u === '/latest-windows.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
        res.end(raw)
        return
      }
    }
    res.writeHead(404)
    res.end('no')
  })
  const port = srv.address().port
  const prev = process.env.WORKBUDDY_UPDATE_FEED_BASE
  process.env.WORKBUDDY_UPDATE_FEED_BASE = `http://127.0.0.1:${port}/`
  try {
    const base = su.feedBase()
    const latest = await su.fetchLatest(base, 'win32')
    assert.strictEqual(latest.version, feed.version)
    assert.strictEqual(latest.artifact.sha256, String(feed.artifact.sha256).toLowerCase())
    assert.strictEqual(latest.artifact.file, feed.artifact.file)
    const url = su.resolveArtifactUrl(base, latest.artifact.file)
    assert.ok(url, 'resolveArtifactUrl 失败')
    assert.ok(url.startsWith(`http://127.0.0.1:${port}/`), '下载 URL 未落在 feedBase')
    // 旧版应发现更新；同版应不更新
    assert.ok(su.compareVersions(latest.version, '0.0.1') > 0)
    assert.strictEqual(su.compareVersions(latest.version, latest.version), 0)

    // 404 路径：换端口无清单 → 应抛错（主进程 catch 落成「当前已是最新版本（v…）」）
    let threw = false
    process.env.WORKBUDDY_UPDATE_FEED_BASE = `http://127.0.0.1:${port}/missing/`
    try {
      await su.fetchLatest(su.feedBase(), 'win32')
    } catch (e) {
      threw = true
      assert.ok(/HTTP 404|清单/.test(String(e && e.message)), String(e && e.message))
    }
    assert.ok(threw, '缺清单时应失败')
  } finally {
    if (prev === undefined) delete process.env.WORKBUDDY_UPDATE_FEED_BASE
    else process.env.WORKBUDDY_UPDATE_FEED_BASE = prev
    srv.close()
  }
  console.log('test_update_chain_local.js OK (feed v' + feed.version + ')')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
