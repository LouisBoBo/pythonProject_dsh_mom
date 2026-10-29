'use strict'

/**
 * Windows exe 图标写入：绕过 app-builder rcedit（依赖 winCodeSign 解压与 PATH 上的 7za）。
 * 使用 npm rcedit 自带二进制；Unicode 安装路径时先复制到 ASCII 临时目录再写回。
 */
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

function appBuilderPath(projectDir) {
  return path.join(projectDir, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe')
}

function pngToIco(projectDir, buildDir, outIcoDir) {
  const appBuilder = appBuilderPath(projectDir)
  if (!fs.existsSync(appBuilder)) {
    throw new Error('[win-exe-icon] 未找到 app-builder.exe，无法从 icon.png 生成 ico')
  }
  fs.mkdirSync(outIcoDir, { recursive: true })
  const iconStdout = execFileSync(
    appBuilder,
    ['icon', '--format', 'ico', '--root', buildDir, '--root', projectDir, '--out', outIcoDir, '--input', 'icon.png'],
    { encoding: 'utf8' },
  )
  const parsed = JSON.parse(String(iconStdout || '{}'))
  const ico = parsed.icons && parsed.icons[0] && parsed.icons[0].file
  if (!ico || !fs.existsSync(ico)) {
    throw new Error('[win-exe-icon] 无法从 icon.png 生成 icon.ico')
  }
  return ico
}

function resolveRceditBin(projectDir) {
  if (!projectDir) return null
  const candidates = [
    path.join(projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe'),
    path.join(projectDir, 'node_modules', 'rcedit', 'bin', 'rcedit.exe'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function loadRcedit() {
  try {
    return require('rcedit')
  } catch (err) {
    throw new Error(
      `[win-exe-icon] 缺少 devDependency rcedit（请在 desktop 目录 npm install）。${err && err.message ? err.message : err}`,
    )
  }
}

function applyIconWithBinary(rceditBin, exePath, icoPath) {
  execFileSync(rceditBin, [exePath, '--set-icon', icoPath], {
    windowsHide: true,
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function needsAsciiStaging(filePath) {
  return /[^\x00-\x7f]/.test(filePath)
}

/**
 * @param {string} exePath
 * @param {string} icoPath
 */
async function setWinExeIcon(exePath, icoPath, projectDir) {
  if (!fs.existsSync(exePath)) {
    throw new Error(`[win-exe-icon] 找不到 exe: ${exePath}`)
  }
  if (!fs.existsSync(icoPath)) {
    throw new Error(`[win-exe-icon] 找不到 ico: ${icoPath}`)
  }

  const rceditBin = resolveRceditBin(projectDir)
  const stageDir = path.join(os.tmpdir(), `wb-rcedit-${crypto.randomBytes(4).toString('hex')}`)
  fs.mkdirSync(stageDir, { recursive: true })

  const workExe = needsAsciiStaging(exePath) ? path.join(stageDir, 'app.exe') : exePath
  if (workExe !== exePath) {
    fs.copyFileSync(exePath, workExe)
  }

  try {
    if (rceditBin) {
      applyIconWithBinary(rceditBin, workExe, icoPath)
    } else {
      const rcedit = loadRcedit()
      await rcedit(workExe, { icon: icoPath })
    }
    if (workExe !== exePath) {
      fs.copyFileSync(workExe, exePath)
    }
  } finally {
    try {
      fs.rmSync(stageDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

module.exports = {
  appBuilderPath,
  pngToIco,
  resolveRceditBin,
  setWinExeIcon,
}
