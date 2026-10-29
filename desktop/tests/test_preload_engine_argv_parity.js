'use strict'

// 防漂移：preload.js 在沙箱里不能 require 本地文件（./lib/read-engine-argv 会报
// module not found），所以 parseEngineArgv 被内联了一份进 preload.js。
// 两份逻辑必须一致——改一边忘了另一边，上线就是「引擎地址解析错 / preload 崩」。
// 本测试抽取 preload.js 里的内联副本，与 lib 版在同样用例下逐一比对。

const assert = require('assert')
const fs = require('fs')
const path = require('path')

const { parseEngineArgv: fromLib } = require('../lib/read-engine-argv')

// 不能 require('../preload')——它顶层 require('electron')，纯 Node 下会挂。
// 故从源码抽出 `function parseEngineArgv(...) { ... }`（平衡大括号），eval 成函数。
function extractPreloadParseEngineArgv() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8')
  const start = src.indexOf('function parseEngineArgv')
  assert.notStrictEqual(start, -1, 'preload.js 缺少内联 parseEngineArgv（若改为 require 则本测试需同步调整）')
  let depth = 0
  let end = -1
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  assert.notStrictEqual(end, -1, 'preload.js 内联 parseEngineArgv 大括号不配对')
  const fnSrc = src.slice(start, end)
  // 包成函数表达式求值；函数体内只依赖全局 URL，无外部闭包。
  // eslint-disable-next-line no-eval
  return eval(`(${fnSrc})`)
}

const fromPreload = extractPreloadParseEngineArgv()

const cases = [
  [],
  ['--workbuddy-engine=http://127.0.0.1:18000/'],
  ['--foo', '--workbuddy-engine=http://localhost:13081'],
  ['--workbuddy-engine=not-a-url'],
  ['--workbuddy-engine=http://127.0.0.1:0/'],
  ['--workbuddy-engine=https://example.com:9999/path'],
  ['--workbuddy-engine=http://127.0.0.1:18000'], // 无尾斜杠
]
for (const c of cases) {
  assert.deepStrictEqual(
    fromPreload(c),
    fromLib(c),
    `preload 内联副本与 lib/read-engine-argv 输出不一致：${JSON.stringify(c)}`
  )
}

console.log('ok: preload 内联 parseEngineArgv 与 lib/read-engine-argv 行为一致')
