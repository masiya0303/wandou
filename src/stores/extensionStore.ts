// ============================================================
// wandou · 扩展 Store（安装/卸载/启用/禁用）
// ============================================================
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ExtensionManifest, InstalledExtension } from '@/types/extension'
import { MARKETPLACE } from '@/marketplace'
import { storage } from '@/utils/storage'
import { hotToggle, unloadExtension } from '@/utils/extensionEngine'

const EXT_KEY = 'wandou_extensions'

export const useExtensionStore = defineStore('extensions', () => {
  /** 已安装扩展 */
  const installed = ref<InstalledExtension[]>(storage.getConfig(EXT_KEY, []))

  const enabledCount = computed(() => installed.value.filter(e => e.enabled).length)
  const totalCount = computed(() => installed.value.length)

  function _save() { storage.saveConfig(EXT_KEY, installed.value.map(e => ({ manifest: e.manifest, enabled: e.enabled, installedAt: e.installedAt }))) }

  /** 清理本地已安装但市场不再提供的扩展 */
  function pruneOrphans() {
    const ids = new Set(MARKETPLACE.map(m => m.id))
    const before = installed.value.length
    installed.value = installed.value.filter(e => ids.has(e.manifest.id))
    if (installed.value.length !== before) _save()
  }

  /** 从市场查找 */
  function findInMarketplace(id: string): ExtensionManifest | undefined {
    return MARKETPLACE.find(m => m.id === id)
  }

  /** 安装 */
  function install(id: string): boolean {
    if (isInstalled(id)) return false
    const manifest = findInMarketplace(id)
    if (!manifest) return false
    installed.value.push({ manifest: { ...manifest }, enabled: false, installedAt: Date.now() })
    _save()
    return true
  }

  /** 卸载（同时卸载运行时） */
  function uninstall(id: string) {
    const e = installed.value.find(x => x.manifest.id === id)
    if (e) unloadExtension(e)
    installed.value = installed.value.filter(e => e.manifest.id !== id)
    _save()
  }

  /** 切换启用（自动加载/卸载） */
  function toggle(id: string) {
    const e = installed.value.find(x => x.manifest.id === id)
    if (e) {
      e.enabled = !e.enabled
      hotToggle(e)
      _save()
    }
  }

  function setEnabled(id: string, val: boolean) {
    const e = installed.value.find(x => x.manifest.id === id)
    if (e) {
      if (e.enabled !== val) {
        e.enabled = val
        hotToggle(e)
        _save()
      }
    }
  }

  function isInstalled(id: string): boolean {
    return installed.value.some(e => e.manifest.id === id)
  }

  function isEnabled(id: string): boolean {
    return installed.value.some(e => e.manifest.id === id && e.enabled)
  }

  /** 一键安装所有预装扩展 */
  function installBundled() {
    pruneOrphans()
    for (const m of MARKETPLACE) {
      if (!isInstalled(m.id)) {
        installed.value.push({ manifest: { ...m }, enabled: true, installedAt: Date.now() })
      }
    }
    _save()
  }

  return {
    installed, enabledCount, totalCount,
    install, uninstall, toggle, setEnabled,
    isInstalled, isEnabled, findInMarketplace, installBundled,
  }
})
