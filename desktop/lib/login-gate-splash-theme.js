'use strict'
/**
 * 与 mes-bridge client-src/styles.css 中 `.wb-app-login-gate` 背景严格一致。
 * 修改登录页背景时须同步此处与 splash.css / splash.html。
 */
const BASE = '#f6faf7'
const BACKGROUND =
  'radial-gradient(1200px 600px at 10% -10%,#d8f3e4 0%,transparent 55%),' +
  'radial-gradient(900px 500px at 100% 0%,#eef7f1 0%,transparent 50%),' +
  BASE

module.exports = { BASE, BACKGROUND }
