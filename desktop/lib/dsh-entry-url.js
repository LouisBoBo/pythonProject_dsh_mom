/**
 * DSH 0.2 起，裸开 http://127.0.0.1:<port>/ 会返回
 * "dsh web authentication required"。只有启动日志里
 * `dsh web: http://…?token=` 这一下能种下 Cookie。
 *
 * 安全：只认回环主机 + 非空 token；禁止把任意 http://evil/?token= 当入口。
 */

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])

function entryUrlHasToken(url) {
  try {
    const u = new URL(String(url || ''))
    const tok = u.searchParams.get('token')
    return typeof tok === 'string' && tok.length > 0
  } catch {
    return /[?&]token=[^&\s#]+/.test(String(url || ''))
  }
}

function isLoopbackHost(hostname) {
  const h = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
  return LOOPBACK_HOSTS.has(h)
}

/** 可持久化 / loadURL 的宿主入口：http(s) + 回环 + 非空 token。 */
function isSafeDshEntryUrl(url) {
  const text = String(url || '').trim()
  if (!text) return false
  try {
    const u = new URL(text)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (!isLoopbackHost(u.hostname)) return false
    const tok = u.searchParams.get('token')
    return typeof tok === 'string' && tok.length > 0
  } catch {
    return false
  }
}

function extractDshTokenUrl(logText) {
  const m = String(logText || '').match(/dsh web: (https?:\/\/\S+)/)
  if (!m) return ''
  const url = m[1].replace(/[)\].,;]+$/, '')
  return isSafeDshEntryUrl(url) ? url : ''
}

/** 弹窗 / 控制台 / 用户可见 detail：去掉 token 与整段带 token 的 URL。 */
function redactHostSecrets(text) {
  let s = String(text || '')
  s = s.replace(/([?&]token=)[^&\s"'<>]*/gi, '$1***')
  s = s.replace(/dsh web:\s*https?:\/\/\S+/gi, 'dsh web: [redacted]')
  return s
}

module.exports = {
  extractDshTokenUrl,
  entryUrlHasToken,
  isSafeDshEntryUrl,
  isLoopbackHost,
  redactHostSecrets,
}
