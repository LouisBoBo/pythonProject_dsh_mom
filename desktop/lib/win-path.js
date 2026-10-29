'use strict'

const path = require('path')

/** Read PATH regardless of Windows key case (`Path` vs `PATH`). */
function readPath(env) {
  if (!env || typeof env !== 'object') return ''
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path' && typeof env[key] === 'string') return env[key]
  }
  return ''
}

function windowsSystemDirs() {
  if (process.platform !== 'win32') return []
  const root = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows'
  return [
    path.join(root, 'System32', 'WindowsPowerShell', 'v1.0'),
    path.join(root, 'System32'),
    root,
  ]
}

/**
 * Write exactly one PATH key.
 *
 * `{...process.env}` on Windows keeps the key `Path`. Assigning `env.PATH`
 * on that plain object adds a second key. Node then builds a case-insensitive
 * environment block and the short `PATH` wins, so `powershell.exe` is ENOENT.
 * dsh-market's restart helper wraps the new host in powershell and treats that
 * as a boot failure (`helper exiting (code 0)`).
 */
function assignPath(env, extraDirs) {
  const prev = readPath(env)
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path') delete env[key]
  }
  const seen = new Set()
  const parts = []
  const incoming = []
  for (const dir of extraDirs || []) {
    if (dir) incoming.push(String(dir))
  }
  for (const dir of windowsSystemDirs()) incoming.push(dir)
  for (const dir of prev.split(path.delimiter)) incoming.push(dir)
  for (const raw of incoming) {
    const dir = String(raw || '').trim()
    if (!dir) continue
    const id = process.platform === 'win32' ? dir.toLowerCase() : dir
    if (seen.has(id)) continue
    seen.add(id)
    parts.push(dir)
  }
  env.PATH = parts.join(path.delimiter)
  return env
}

module.exports = { assignPath, readPath }
