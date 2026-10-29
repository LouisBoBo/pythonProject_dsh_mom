'use strict'

const { app, Menu, dialog } = require('electron')

/** 与窗口 title / 托盘文案一致的产品名 */
const APP_MENU_NAME = 'MOM'

function setupChineseApplicationMenu() {
  const isMac = process.platform === 'darwin'
  /** 正式安装包不提供菜单入口打开 DevTools（与默认 Electron 英文菜单能力对齐，略收紧） */
  const viewSubmenu = [
    { role: 'reload', label: '重新加载' },
    { role: 'forceReload', label: '强制重新加载' },
    ...(app.isPackaged
      ? []
      : [{ role: 'toggleDevTools', label: '切换开发者工具' }, { type: 'separator' }]),
    { role: 'resetZoom', label: '实际大小' },
    { role: 'zoomIn', label: '放大' },
    { role: 'zoomOut', label: '缩小' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: '切换全屏' },
  ]

  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const template = [
    ...(isMac
      ? [
          {
            label: APP_MENU_NAME,
            submenu: [
              { role: 'about', label: `关于 ${APP_MENU_NAME}` },
              { type: 'separator' },
              { role: 'services', label: '服务' },
              { type: 'separator' },
              { role: 'hide', label: `隐藏 ${APP_MENU_NAME}` },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: `退出 ${APP_MENU_NAME}` },
            ],
          },
        ]
      : []),
    {
      label: '文件',
      submenu: [isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        ...(isMac
          ? [
              { role: 'pasteAndMatchStyle', label: '粘贴并匹配样式' },
              { role: 'delete', label: '删除' },
              { role: 'selectAll', label: '全选' },
              { type: 'separator' },
              {
                label: '语音',
                submenu: [
                  { role: 'startSpeaking', label: '开始朗读' },
                  { role: 'stopSpeaking', label: '停止朗读' },
                ],
              },
            ]
          : [
              { role: 'delete', label: '删除' },
              { role: 'selectAll', label: '全选' },
            ]),
      ],
    },
    {
      label: '视图',
      submenu: viewSubmenu,
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: isMac ? '缩放' : '最大化' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front', label: '全部置于顶层' }]
          : [{ role: 'close', label: '关闭' }]),
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: `关于 ${APP_MENU_NAME}`,
          click: async (_item, browserWindow) => {
            await dialog.showMessageBox(browserWindow ?? undefined, {
              type: 'info',
              title: '关于',
              message: APP_MENU_NAME,
              detail: `版本 ${app.getVersion()}`,
            })
          },
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

module.exports = { setupChineseApplicationMenu, APP_MENU_NAME }
