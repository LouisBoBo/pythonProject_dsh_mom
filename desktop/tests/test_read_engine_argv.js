'use strict'

const assert = require('assert')
const { parseEngineArgv } = require('../lib/read-engine-argv')

assert.deepStrictEqual(parseEngineArgv([]), { host: '127.0.0.1', port: 0 })
assert.deepStrictEqual(parseEngineArgv(['--workbuddy-engine=http://127.0.0.1:18000/']), {
  host: '127.0.0.1',
  port: 18000,
})
assert.deepStrictEqual(parseEngineArgv(['--foo', '--workbuddy-engine=http://localhost:13081']), {
  host: 'localhost',
  port: 13081,
})
assert.strictEqual(parseEngineArgv(['--workbuddy-engine=not-a-url']).port, 0)

console.log('ok: parseEngineArgv')
