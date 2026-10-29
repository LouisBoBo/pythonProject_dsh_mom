'use strict'

const assert = require('assert')
const {
  DEFAULT_FEED_BASE,
  feedBase,
  feedNameForPlatform,
  compareVersions,
  resolveArtifactUrl,
  validateLatest,
} = require('../lib/self-update')

// --- 版本比较：用户只看安装包号（desktop/package.json version） ---
assert.strictEqual(compareVersions('0.2.27', '0.2.26'), 1)
assert.strictEqual(compareVersions('0.2.26', '0.2.26'), 0)
assert.strictEqual(compareVersions('0.2.26', '0.2.27'), -1)
assert.strictEqual(compareVersions('v0.3.0', '0.2.99'), 1)
assert.strictEqual(compareVersions('1.0', '1.0.0'), 0)
assert.strictEqual(compareVersions('', '0.0.1'), -1)

// --- 平台清单文件名：两台打包机各产各的，无需合并 ---
assert.strictEqual(feedNameForPlatform('win32'), 'latest-windows.json')
assert.strictEqual(feedNameForPlatform('darwin'), 'latest-macos.json')
assert.strictEqual(feedNameForPlatform('linux'), '')

// --- 清单根地址：默认公司服务器另起路径；env 仅运维覆盖 ---
assert.strictEqual(feedBase({}), DEFAULT_FEED_BASE)
assert.ok(DEFAULT_FEED_BASE.endsWith('/workbuddy-desktop/'))
assert.ok(!DEFAULT_FEED_BASE.includes('dsh-plugins'))
assert.strictEqual(feedBase({ WORKBUDDY_UPDATE_FEED_BASE: 'http://x.test/upd' }), 'http://x.test/upd/')
assert.strictEqual(feedBase({ WORKBUDDY_UPDATE_FEED_BASE: 'http://x.test/upd/' }), 'http://x.test/upd/')

// --- 安装包 URL：只允许 feedBase + 纯文件名；路径/编码/外站一律拒绝 ---
const base = 'http://175.178.238.31/workbuddy-desktop/'
assert.strictEqual(
  resolveArtifactUrl(base, 'MOM-0.2.65.exe'),
  'http://175.178.238.31/workbuddy-desktop/MOM-0.2.65.exe'
)
assert.strictEqual(
  resolveArtifactUrl(base, 'Mom-x-0.2.27.exe'),
  'http://175.178.238.31/workbuddy-desktop/Mom-x-0.2.27.exe'
)
assert.strictEqual(resolveArtifactUrl(base, '../evil.exe'), '')
assert.strictEqual(resolveArtifactUrl(base, 'sub/dir.exe'), '')
assert.strictEqual(resolveArtifactUrl(base, 'a%2fb.exe'), '')
assert.strictEqual(resolveArtifactUrl(base, ''), '')
assert.strictEqual(resolveArtifactUrl('ftp://x/upd/', 'a.exe'), '')
assert.strictEqual(resolveArtifactUrl('not a url', 'a.exe'), '')

// --- 清单校验：fail-closed ---
const good = {
  product: 'MOM',
  platform: 'windows',
  version: '0.2.27',
  notes: '修复若干问题',
  artifact: { file: 'MOM-0.2.27.exe', sha256: 'a'.repeat(64), size: 1024 },
}
const v = validateLatest(good, 'win32')
assert.ok(v)
assert.strictEqual(v.version, '0.2.27')
assert.strictEqual(v.artifact.sha256, 'a'.repeat(64))
assert.strictEqual(v.notes, '修复若干问题')

// 平台不符
assert.strictEqual(validateLatest(good, 'darwin'), null)
// 版本号不合法
assert.strictEqual(validateLatest({ ...good, version: '0.2' }, 'win32'), null)
assert.strictEqual(validateLatest({ ...good, version: '' }, 'win32'), null)
// 缺 sha256 → fail-closed
assert.strictEqual(
  validateLatest({ ...good, artifact: { file: 'x.exe', sha256: '', size: 1 } }, 'win32'),
  null
)
// sha256 大写归一为小写
const upper = validateLatest(
  { ...good, artifact: { file: 'x.exe', sha256: 'A'.repeat(64), size: 1 } },
  'win32'
)
assert.ok(upper)
assert.strictEqual(upper.artifact.sha256, 'a'.repeat(64))
// size 非法
assert.strictEqual(
  validateLatest({ ...good, artifact: { file: 'x.exe', sha256: 'a'.repeat(64), size: -1 } }, 'win32'),
  null
)
assert.strictEqual(
  validateLatest(
    { ...good, artifact: { file: 'x.exe', sha256: 'a'.repeat(64), size: 5 * 1024 * 1024 * 1024 } },
    'win32'
  ),
  null
)
// 整体不是对象 / 缺 artifact
assert.strictEqual(validateLatest(null, 'win32'), null)
assert.strictEqual(validateLatest({ version: '0.2.27' }, 'win32'), null)
// 不支持的平台
assert.strictEqual(validateLatest(good, 'linux'), null)
// 清单不带 platform 字段也接受（按请求的文件名已区分平台）
const noPlat = validateLatest({ version: '0.2.27', artifact: good.artifact }, 'win32')
assert.ok(noPlat && noPlat.version === '0.2.27')

console.log('test_self_update.js OK')
