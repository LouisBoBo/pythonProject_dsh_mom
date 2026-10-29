'use strict'

/**
 * 安装包里 Python 与宿主 node_modules 各是一个 zip。
 * NSIS 在安装时展开并删掉 zip，已安装的冷启动不会再走进这里。
 * 便携目录 / 未经过安装程序的解包目录才在第一次启动时展开。
 */
const childProcess = require('child_process')
const fs = require('fs')
const path = require('path')
const { hideWin } = require('./win-hide')

function jobsFor(resourcesRoot) {
  const pyName = process.platform === 'win32' ? 'python.exe' : path.join('bin', 'python3')
  return [
    {
      id: 'python',
      zip: path.join(resourcesRoot, 'runtime', 'python.zip'),
      dest: path.join(resourcesRoot, 'runtime', 'python'),
      sentinel: path.join(resourcesRoot, 'runtime', 'python', pyName),
    },
    {
      id: 'host',
      zip: path.join(resourcesRoot, 'host', 'node_modules.zip'),
      dest: path.join(resourcesRoot, 'host', 'node_modules'),
      sentinel: path.join(resourcesRoot, 'host', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
    },
  ]
}

function planExpand(resourcesRoot, exists) {
  const present = typeof exists === 'function' ? exists : (p) => fs.existsSync(p)
  const expand = []
  const ready = []
  for (const job of jobsFor(resourcesRoot)) {
    if (present(job.sentinel)) {
      ready.push(job.id)
      continue
    }
    if (present(job.zip)) expand.push(job)
  }
  return { expand, ready }
}

function tarBin() {
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || 'C:\\Windows'
    return path.join(root, 'System32', 'tar.exe')
  }
  return 'tar'
}

function expandZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true })
  childProcess.execFileSync(tarBin(), ['-xf', zipPath, '-C', destDir], hideWin({
    stdio: 'pipe',
    timeout: 600000,
    windowsHide: true,
  }))
}

function expandPackagedRuntime(resourcesRoot) {
  const plan = planExpand(resourcesRoot)
  const expanded = []
  for (const job of plan.expand) {
    expandZip(job.zip, job.dest)
    if (!fs.existsSync(job.sentinel)) {
      throw new Error(`展开 ${job.id} 后仍缺少 ${job.sentinel}`)
    }
    try {
      fs.unlinkSync(job.zip)
    } catch {
      /* 留下 zip 不影响运行，下次哨兵已在会跳过 */
    }
    expanded.push(job.id)
  }
  for (const job of jobsFor(resourcesRoot)) {
    if (fs.existsSync(job.sentinel) && fs.existsSync(job.zip)) {
      try {
        fs.unlinkSync(job.zip)
      } catch {
        /* ignore */
      }
    }
  }
  return expanded
}

module.exports = {
  jobsFor,
  planExpand,
  expandZip,
  expandPackagedRuntime,
  tarBin,
}
