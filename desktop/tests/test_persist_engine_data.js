'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')
const {
  stashEngineData,
  restoreEngineData,
  mergePluginsJson,
  durableDataDir,
} = require('../lib/persist-engine-data')

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body, 'utf8')
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-persist-eng-'))
const eng = path.join(tmp, 'engine')
const persist = path.join(tmp, 'persist')

try {
  // --- merge: 旧 persist 缺 dev-pipeline，包默认有 → 合并后必须有 ---
  const merged = mergePluginsJson(
    { enabled: ['mes-ask', 'code-review'] },
    { enabled: ['mes-ask', 'dev-pipeline', 'vision'] },
  )
  assert.ok(merged.enabled.includes('dev-pipeline'))
  assert.ok(merged.enabled.includes('mes-ask'))
  assert.ok(merged.enabled.includes('code-review'))
  assert.ok(merged.enabled.includes('vision'))

  // --- 模拟：用户有一体化账本 → 升级 rm runtime-app → 必须恢复 ---
  const runFile = path.join(eng, 'data', 'dev_pipeline', 'runs', 'dpj-abc.json')
  const modeFile = path.join(
    eng,
    'data',
    'dev_pipeline',
    'session_modes',
    'sess-1.json',
  )
  write(
    runFile,
    JSON.stringify({ run_id: 'dpj-abc', dsh_session_id: 'sess-1', status: 'done' }),
  )
  write(
    modeFile,
    JSON.stringify({ integrated_flow_enabled: true, updated_at: 1 }),
  )
  write(
    path.join(eng, 'data', 'plugins.json'),
    JSON.stringify({ enabled: ['mes-ask', 'dev-pipeline'] }),
  )

  const stashed = stashEngineData({ liveEngineDir: eng, persistDir: persist })
  assert.ok(stashed.ok)
  assert.ok(fs.existsSync(path.join(durableDataDir(persist), 'dev_pipeline', 'runs', 'dpj-abc.json')))

  // 模拟打包刷新：整树删掉再换成「出厂包」
  rmrf(eng)
  write(
    path.join(eng, 'data', 'plugins.json'),
    JSON.stringify({ enabled: ['mes-ask', 'dev-pipeline', 'vision'] }),
  )
  write(path.join(eng, 'data', 'dev_pipeline', '.keep'), '')
  assert.ok(!fs.existsSync(runFile))

  const packagePlugins = JSON.parse(
    fs.readFileSync(path.join(eng, 'data', 'plugins.json'), 'utf8'),
  )
  const restored = restoreEngineData({
    liveEngineDir: eng,
    persistDir: persist,
    packagePlugins,
  })
  assert.ok(restored.ok)
  assert.ok(fs.existsSync(runFile), 'run ledger must survive pack refresh')
  assert.ok(fs.existsSync(modeFile), 'session switch must survive pack refresh')
  const mode = JSON.parse(fs.readFileSync(modeFile, 'utf8'))
  assert.strictEqual(mode.integrated_flow_enabled, true)
  const plugins = JSON.parse(fs.readFileSync(path.join(eng, 'data', 'plugins.json'), 'utf8'))
  assert.ok(plugins.enabled.includes('dev-pipeline'))
  assert.ok(plugins.enabled.includes('vision'), 'new package defaults merged in')

  console.log('ok: persist-engine-data')
} finally {
  rmrf(tmp)
}
