'use strict'

/** 从 Electron additionalArguments 解析一体包注入的引擎地址。 */
function parseEngineArgv(argv) {
  const prefix = '--workbuddy-engine='
  const raw = (argv || []).find((a) => String(a).startsWith(prefix))
  if (!raw) return { host: '127.0.0.1', port: 0 }
  try {
    const u = new URL(raw.slice(prefix.length))
    const port = Number(u.port)
    const host = u.hostname || '127.0.0.1'
    if (!Number.isFinite(port) || port <= 0) return { host, port: 0 }
    return { host, port }
  } catch {
    return { host: '127.0.0.1', port: 0 }
  }
}

module.exports = { parseEngineArgv }
