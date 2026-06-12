// ============================================================
// wandou · 扩展加载引擎
// ============================================================
import type { InstalledExtension } from '@/types/extension'
import { bus } from '@/utils/events'
import { useGameStore } from '@/stores/gameStore'
import { useChatStore } from '@/stores/chatStore'
import { useWorldStore } from '@/stores/worldStore'
import { useWorldBookStore } from '@/stores/worldBookStore'
import { useNpcStore } from '@/stores/npcStore'
import { useApiStore } from '@/stores/apiStore'
import { useThemeStore } from '@/stores/themeStore'
import { useRegexStore } from '@/stores/regexStore'
import { usePlayerStore } from '@/stores/playerStore'
import { applyRegexList } from '@/utils/regexEngine'

/** 传给扩展 JS 的上下文 */
function buildContext() {
  return {
    bus,
    useGameStore, useChatStore, useWorldStore, useWorldBookStore,
    useNpcStore, useApiStore, useThemeStore, useRegexStore, usePlayerStore,
    applyRegexList,
  }
}

/**
 * 加载单个扩展：注入 CSS + 执行 JS + 注册事件
 * 将运行时对象挂到 ext._styleEl / ext._unsubs
 */
export function loadExtension(ext: InstalledExtension) {
  // 先清理旧运行态防止重复注册
  unloadExtension(ext)

  // CSS 注入
  if (ext.manifest.css) {
    const el = document.createElement('style')
    el.id = `wandou-ext-${ext.manifest.id}`
    el.textContent = ext.manifest.css
    document.head.appendChild(el)
    ext._styleEl = el
  }

  // JS 执行
  if (ext.manifest.js) {
    try {
      const ctx = buildContext()
      // 工厂函数：扩展代码 return 一个 setup 函数
      const factory = new Function('ctx', ext.manifest.js)
      const setup = factory(ctx)
      if (typeof setup === 'function') {
        // setup 返回清理函数列表（或单个清理函数）
        const result = setup(ctx)
        ext._unsubs = Array.isArray(result) ? result : []
      }
    } catch (e) {
      console.warn(`[wandou] 扩展 ${ext.manifest.id} 加载失败:`, e)
    }
  }
}

/**
 * 卸载单个扩展：移除 CSS + 移除事件监听
 */
export function unloadExtension(ext: InstalledExtension) {
  if (ext._styleEl) {
    ext._styleEl.remove()
    ext._styleEl = null
  }
  if (ext._unsubs) {
    ext._unsubs.forEach(fn => { try { fn() } catch { /* ignore */ } })
    ext._unsubs = []
  }
}

/**
 * 加载所有已启用扩展
 */
export function loadAllEnabled(installed: InstalledExtension[]) {
  for (const ext of installed) {
    // 跳过已加载的
    if (ext._styleEl || ext._unsubs?.length) continue
    if (ext.enabled) loadExtension(ext)
  }
}

/**
 * 卸载所有扩展
 */
export function unloadAll(installed: InstalledExtension[]) {
  for (const ext of installed) unloadExtension(ext)
}

/**
 * 热切换：禁用时卸载、启用时加载
 */
export function hotToggle(ext: InstalledExtension) {
  if (ext.enabled) {
    loadExtension(ext)
  } else {
    unloadExtension(ext)
  }
}
