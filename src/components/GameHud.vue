<!-- wandou · 底部功能栏 -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import type { InventoryItem, Quest } from '../types/world'
import type { NpcEntry } from '../types/npc'

const store = useGameStore()
const tab = ref<'chat' | 'inventory' | 'npc' | 'quest'>('chat')

const invCategories = ['weapon','armor','consumable','material','key','other'] as const
const catLabels: Record<string, string> = { weapon:'武器', armor:'防具', consumable:'消耗品', material:'材料', key:'关键物品', other:'其他' }
const grouped = computed(() => {
  const m: Record<string, InventoryItem[]> = {}
  for (const c of invCategories) m[c] = store.inventory.filter((i: InventoryItem) => i.type === c)
  return m
})
const activeNpcs = computed(() => store.npcs.filter((n: NpcEntry) => n.enabled))
const activeQ = computed(() => store.quests.filter((q: Quest) => q.status === 'active'))
const doneQ = computed(() => store.quests.filter((q: Quest) => q.status === 'completed'))
</script>

<template>
  <!-- overlay panel -->
  <div v-if="tab !== 'chat'" class="panel glass-panel">
    <div class="panel-top">
      <span class="panel-title">{{ { inventory: '🎒 背包', npc: '👥 NPC', quest: '📋 任务' }[tab] }}</span>
      <button class="panel-close" @click="tab = 'chat'">✕</button>
    </div>
    <div class="panel-inner">
      <!-- inventory -->
      <template v-if="tab === 'inventory'">
        <div v-if="store.inventory.length === 0" class="none">空空如也</div>
        <div v-for="c in invCategories" :key="c">
          <div v-if="grouped[c].length" class="cat">
            <div class="cat-head">{{ catLabels[c] }} <span class="cat-n">{{ grouped[c].length }}</span></div>
            <div v-for="it in grouped[c]" :key="it.id" class="inv-item glass-panel">
              <span class="inv-name">{{ it.name }}</span>
              <span v-if="it.quantity > 1" class="inv-qty">×{{ it.quantity }}</span>
            </div>
          </div>
        </div>
      </template>
      <!-- npc -->
      <template v-if="tab === 'npc'">
        <div v-if="activeNpcs.length === 0" class="none">暂无活跃 NPC</div>
        <div v-for="n in activeNpcs" :key="n.id" class="card glass-panel">
          <div class="card-head"><span class="card-name">{{ n.name }}</span><span v-if="n.role" class="card-sub">{{ n.role }}</span></div>
          <p v-if="n.personality" class="card-text">{{ n.personality.slice(0, 100) }}{{ n.personality.length > 100 ? '...' : '' }}</p>
        </div>
      </template>
      <!-- quest -->
      <template v-if="tab === 'quest'">
        <div class="cat-head">进行中 <span class="cat-n">{{ activeQ.length }}</span></div>
        <div v-if="activeQ.length === 0" class="none">暂无任务</div>
        <div v-for="q in activeQ" :key="q.id" class="card glass-panel">
          <div class="card-name">{{ q.title }}</div>
          <p class="card-text">{{ q.description.slice(0, 120) }}{{ q.description.length > 120 ? '...' : '' }}</p>
        </div>
        <div v-if="doneQ.length" class="cat-head" style="margin-top:12px">已完成 <span class="cat-n">{{ doneQ.length }}</span></div>
        <div v-for="q in doneQ" :key="q.id" class="card glass-panel" style="opacity:0.5">
          <div class="card-name">✅ {{ q.title }}</div>
        </div>
      </template>
    </div>
  </div>

  <!-- tab bar -->
  <div class="bar glass-panel">
    <button v-for="t in [
      { k:'chat' as const, e:'💬' },
      { k:'inventory' as const, e:'🎒' },
      { k:'npc' as const, e:'👥' },
      { k:'quest' as const, e:'📋' }
    ]" :key="t.k" :class="['tb', { on: tab === t.k }]" @click="tab = tab === t.k ? 'chat' : t.k">
      <span class="tb-ico">{{ t.e }}</span>
      <span class="tb-txt">{{ {chat:'聊天',inventory:'背包',npc:'NPC',quest:'任务'}[t.k] }}</span>
    </button>
  </div>
</template>

<style scoped>
/* panel */
.panel { position: absolute; bottom: 52px; left: 0; right: 0; top: 44px; z-index: 10; border-radius: 0; display: flex; flex-direction: column; overflow: hidden; }
.panel-top { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
.panel-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
.panel-close { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--glass-border); background: none; color: var(--text-muted); cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.panel-close:active { color: #e55; }
.panel-inner { flex: 1; overflow-y: auto; padding: 12px; }

/* bar */
.bar { display: flex; align-items: center; justify-content: space-evenly; height: 44px; flex-shrink: 0; z-index: 20; border-radius: 0; border-left: none; border-right: none; border-bottom: none; }
.tb { display: flex; flex-direction: column; align-items: center; gap: 1px; border: none; background: none; color: var(--text-muted); cursor: pointer; font-family: inherit; padding: 4px 12px; border-radius: 8px; transition: all 0.15s; }
.tb.on { color: var(--accent-cyan); background: rgba(34,211,238,0.06); }
.tb:active { transform: scale(0.94); }
.tb-ico { font-size: 16px; }
.tb-txt { font-size: 10px; font-weight: 500; }

/* shared */
.none { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 13px; }
.cat { margin-bottom: 8px; }
.cat-head { font-size: 12px; font-weight: 600; color: var(--accent-cyan); margin-bottom: 4px; display: flex; align-items: baseline; gap: 4px; }
.cat-n { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.inv-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; margin-bottom: 3px; font-size: 13px; }
.inv-name { color: var(--text-primary); font-weight: 500; }
.inv-qty { color: var(--accent-cyan); font-size: 11px; }
.card { padding: 8px 10px; border-radius: 8px; margin-bottom: 6px; }
.card-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
.card-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.card-sub { font-size: 11px; color: var(--accent-cyan); }
.card-text { font-size: 12px; color: var(--text-muted); margin: 0; line-height: 1.4; }
</style>
