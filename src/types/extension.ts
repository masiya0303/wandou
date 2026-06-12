// ============================================================
// wandou · 扩展系统类型
// ============================================================

/** 扩展清单 */
export interface ExtensionManifest {
  id: string              // 唯一标识，如 "regex"、"tts"
  name: string            // 显示名称
  version: string
  author: string
  description: string     // 一行描述
  icon: string            // emoji 图标
  js?: string             // JS 代码（函数体字符串，接收 ctx）
  css?: string            // CSS 代码
  homepage?: string       // 项目主页
  events?: string[]       // 监听的事件列表（handler 名 = on + 事件名驼峰）
}

/** 已安装扩展的运行时状态 */
export interface InstalledExtension {
  manifest: ExtensionManifest
  enabled: boolean
  installedAt: number
  // 运行时（不持久化）
  _styleEl?: HTMLStyleElement | null
  _unsubs?: (() => void)[]
}
