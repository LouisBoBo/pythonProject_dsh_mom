# vendor/zod

钉选 **带 `dist/`** 的 `zod-3.25.67.tgz`，供 `scripts/lib/ensure_cursor_sdk_zod.py` 离线修复。

## 为何需要

官方 `zod@3.25.0` npm 包误发（只有 `src`、无 `dist`）。  
`@cursor/sdk` import `zod/dist/esm/index.js` → 写码 Job 沙箱一就绪就 `ERR_MODULE_NOT_FOUND`。  
插件市场更新常把残包装回 profile。

## 用法

- 启动门禁 / `restart-web` / 写码前 gate 会读本目录 tarball（`WORKBUDDY_ZOD_TARBALL` 或默认路径）。  
- 勿改成无 dist 的 3.25.0。升级须先确认 tarball 内含 `package/dist/esm/index.js`。
