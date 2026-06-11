<!-- ============================================================
 wandou v0.7 — NPC 角色书管理面板
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()

const importText = ref('')
const showImport = ref(false)
const importResult = ref<{ imported: number; errors: string[] } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function handleImport() {
  importResult.value = null
  if (!importText.value.trim()) return
  const result = store.importNpcsFromJson(importText.value)
  if (result.success && result.entries.length > 0) store.addNpcEntries(result.entries)
  importResult.value = { imported: result.imported, errors: result.errors }
  if (result.imported > 0) importText.value = ''
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = reader.result as string; showImport.value = true; handleImport() }
  reader.readAsText(file); input.value = ''
}
</script>

<template>
  <div class="npc-manager">
    <div class="header">
      <span class="count">👥 {{ store.enabledNpcs }} / {{ store.npcs.length }} 个 NPC</span>
      <div class="actions">
        <button class="btn glass-panel" @click="showImport = !showImport">📥 {{ showImport ? '收起' : '导入' }}</button>
        <button class="btn glass-panel" @click="fileInput?.click()">📁 文件</button>
        <input ref="fileInput" type="file" accept=".json" style="display:none" @change="onFile" />
      </div>
    </div>

    <div v-if="showImport" class="import-area glass-panel">
      <textarea v-model="importText" class="ta" placeholder="粘贴 NPC JSON（自有格式或 ST 角色卡）..." rows="4"></textarea>
      <div class="import-row">
        <button class="btn btn-go" @click="handleImport" :disabled="!importText.trim()">导入</button>
        <span v-if="importResult" class="imp-fb" :class="{ warn: importResult.errors.length }">
          <template v-if="importResult.imported">✅ {{ importResult.imported }} 个</template>
          <template v-if="importResult.errors.length"> ⚠️ {{ importResult.errors.length }} 失败</template>
        </span>
      </div>
    </div>

    <div v-if="store.npcs.length === 0" class="empty">📭 暂无 NPC · 导入 JSON 添加角色</div>

    <div class="list">
      <div v-for="n in store.npcs" :key="n.id" :class="['card glass-panel corner-deco', { off: !n.enabled }]">
        <div class="r1">
          <button class="tg" @click="store.toggleNpc(n.id)">{{ n.enabled ? '✅' : '⛔' }}</button>
          <div class="i">
            <span class="nm">{{ n.name }}</span>
            <span v-if="n.role" class="rl">{{ n.role }}</span>
          </div>
          <button class="del" @click="store.removeNpc(n.id)" title="删除">🗑️</button>
        </div>
        <div class="r2">
          <span v-for="k in n.keys.slice(0,4)" :key="k" class="tag">{{ k }}</span>
        </div>
        <p v-if="n.personality" class="pre">{{ n.personality.slice(0, 80) }}{{ n.personality.length > 80 ? '...' : '' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.npc-manager { display: flex; flex-direction: column; gap: 0.6rem; }
.header { display: flex; align-items: center; justify-content: space-between; }
.count { font-size: 0.75rem; color: var(--text-secondary); }
.actions { display: flex; gap: 0.3rem; }
.btn { padding: 0.3rem 0.6rem; border-radius: 5px; font-size: 0.7rem; cursor: pointer; border: 1px solid var(--glass-border); color: var(--text-secondary); font-family: inherit; }
.btn:hover { border-color: var(--accent); color: var(--text-primary); }
.btn-go { background: rgba(0,229,255,0.08); border-color: rgba(0,229,255,0.25); color: var(--accent-cyan); }
.btn-go:disabled { opacity: 0.3; }

.import-area { padding: 0.5rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.4rem; }
.ta { width: 100%; padding: 0.4rem; border: 1px solid var(--border); border-radius: 4px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.7rem; font-family: 'Courier New', monospace; resize: vertical; box-sizing: border-box; }
.ta:focus { outline: none; border-color: var(--accent-cyan); }
.import-row { display: flex; align-items: center; gap: 0.5rem; }
.imp-fb { font-size: 0.65rem; color: var(--success); }
.imp-fb.warn { color: var(--warning); }

.empty { text-align: center; padding: 1rem; font-size: 0.75rem; color: var(--text-muted); }

.list { display: flex; flex-direction: column; gap: 0.4rem; max-height: 350px; overflow-y: auto; }
.card { padding: 0.5rem 0.6rem; border-radius: 8px; transition: all 0.2s; }
.card.off { opacity: 0.4; }
.card:hover:not(.off) { background: var(--glass-bg-hover); transform: translateY(-1px); }
.r1 { display: flex; align-items: center; gap: 0.4rem; }
.tg { background: none; border: none; font-size: 0.85rem; cursor: pointer; padding: 0; }
.i { flex: 1; display: flex; flex-direction: column; gap: 0.05rem; }
.nm { font-size: 0.78rem; font-weight: 600; color: var(--text-primary); }
.rl { font-size: 0.6rem; color: var(--accent-cyan); }
.del { background: none; border: none; cursor: pointer; font-size: 0.7rem; opacity: 0.35; }
.del:hover { opacity: 1; }
.r2 { display: flex; flex-wrap: wrap; gap: 0.15rem; margin-top: 0.2rem; padding-left: 1.4rem; }
.tag { font-size: 0.5rem; padding: 0.08rem 0.3rem; background: rgba(0,229,255,0.07); border: 1px solid rgba(0,229,255,0.2); border-radius: 3px; color: var(--accent-cyan); }
.pre { font-size: 0.62rem; color: var(--text-muted); margin: 0.2rem 0 0; padding-left: 1.4rem; line-height: 1.35; }
</style>
