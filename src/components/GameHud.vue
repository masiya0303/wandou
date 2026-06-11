<!-- ============================================================
 wandou v1.1 — GameHud: bottom tab bar → Chat / Backpack / NPC / Quest
============================================================ -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import type { InventoryItem, Quest } from '../types/world'
import type { NpcEntry } from '../types/npc'

const store = useGameStore()
const tab = ref<'chat' | 'inventory' | 'npc' | 'quest'>('chat')

const TABS = [
  { key: 'chat' as const, icon: '💬', cn: '聊天', en: 'CHAT' },
  { key: 'inventory' as const, icon: '🎒', cn: '背包', en: 'INV' },
  { key: 'npc' as const, icon: '👥', cn: 'NPC', en: 'NPC' },
  { key: 'quest' as const, icon: '📋', cn: '任务', en: 'QUEST' },
]

const invCategories = ['weapon','armor','consumable','material','key','other'] as const
const catLabels: Record<string, string> = { weapon: '武器', armor: '防具', consumable: '消耗品', material: '材料', key: '关键物品', other: '其他' }
const groupedInv = computed(() => {
  const m: Record<string, InventoryItem[]> = {}
  for (const c of invCategories) m[c] = store.inventory.filter((i: InventoryItem) => i.type === c)
  return m
})

const activeNpcs = computed(() => store.npcs.filter((n: NpcEntry) => n.enabled))
const activeQuests = computed(() => store.quests.filter((q: Quest) => q.status === 'active'))
const completedQuests = computed(() => store.quests.filter((q: Quest) => q.status === 'completed'))
</script>

<template>
  <!-- ===== 底部 Tab 栏 ===== -->
  <div class="tab-bar">
    <button v-for="t in TABS" :key="t.key" :class="['tab', { on: tab === t.key }]" @click="tab = t.key">
      <span class="tab-icon">{{ t.icon }}</span>
      <span class="tab-cn">{{ t.cn }}</span>
      <span class="tab-en">{{ t.en }}</span>
    </button>
  </div>

  <!-- ===== 面板区 ===== -->
  <div v-if="tab !== 'chat'" class="panel glass-panel">
    <div class="panel-head">
      <span class="ph-cn">{{ TABS.find(t=>t.key===tab)?.cn }}</span>
      <button class="ph-close" @click="tab = 'chat'">✕</button>
    </div>

    <!-- 🎒 背包 -->
    <div v-if="tab === 'inventory'" class="panel-body">
      <div v-if="store.inventory.length === 0" class="empty">空空如也</div>
      <template v-for="c in invCategories" :key="c">
        <div v-if="groupedInv[c].length" class="cat-section">
          <div class="cat-title">{{ catLabels[c] }} <span class="cat-n">{{ groupedInv[c].length }}</span></div>
          <div v-for="item in groupedInv[c]" :key="item.id" class="item-row">
            <span class="item-name">{{ item.name }}</span>
            <span v-if="item.quantity > 1" class="item-qty">×{{ item.quantity }}</span>
            <span class="item-desc">{{ item.description.slice(0, 40) }}{{ item.description.length > 40 ? '...' : '' }}</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 👥 NPC -->
    <div v-if="tab === 'npc'" class="panel-body">
      <div v-if="activeNpcs.length === 0" class="empty">暂无活跃 NPC</div>
      <div v-for="n in activeNpcs" :key="n.id" class="npc-card glass-panel corner-deco">
        <div class="npc-h">
          <span class="npc-name">{{ n.name }}</span>
          <span v-if="n.role" class="npc-role">{{ n.role }}</span>
        </div>
        <p v-if="n.personality" class="npc-p">{{ n.personality.slice(0, 100) }}{{ n.personality.length > 100 ? '...' : '' }}</p>
      </div>
    </div>

    <!-- 📋 任务 -->
    <div v-if="tab === 'quest'" class="panel-body">
      <div class="q-section">
        <div class="cat-title">进行中 <span class="cat-n">{{ activeQuests.length }}</span></div>
        <div v-if="activeQuests.length === 0" class="empty">暂无进行中的任务</div>
        <div v-for="q in activeQuests" :key="q.id" class="quest-card glass-panel corner-deco">
          <div class="q-title">{{ q.title }}</div>
          <p class="q-desc">{{ q.description.slice(0, 120) }}{{ q.description.length > 120 ? '...' : '' }}</p>
          <div class="q-objs">
            <span v-for="(o, i) in q.objectives" :key="i" class="q-obj">▸ {{ o }}</span>
          </div>
        </div>
      </div>
      <div v-if="completedQuests.length" class="q-section">
        <div class="cat-title">已完成 <span class="cat-n">{{ completedQuests.length }}</span></div>
        <div v-for="q in completedQuests" :key="q.id" class="quest-card done glass-panel">
          <div class="q-title">✅ {{ q.title }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-bar { display: flex; border-top: 1px solid var(--glass-border); background: rgba(8,16,28,0.95); flex-shrink: 0; }
.tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.05rem; padding: 0.4rem 0.2rem; border: none; border-top: 2px solid transparent; background: none; color: var(--text-muted); cursor: pointer; font-family: inherit; transition: all 0.2s; }
.tab.on { color: var(--accent-cyan); border-top-color: var(--accent-cyan); }
.tab-icon { font-size: 1rem; }
.tab-cn { font-size: 0.58rem; font-weight: 500; }
.tab-en { font-size: 0.42rem; color: var(--text-muted); letter-spacing: 0.08em; }
.tab.on .tab-en { color: var(--accent-cyan); }

.panel { position: absolute; bottom: 50px; left: 0; right: 0; top: 48px; z-index: 10; margin: 0; border-radius: 0; display: flex; flex-direction: column; overflow: hidden; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.8rem; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
.ph-cn { font-size: 0.85rem; font-weight: 600; color: var(--text-primary); }
.ph-close { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--glass-border); background: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
.ph-close:hover { color: #e55; border-color: #e55; }

.panel-body { flex: 1; overflow-y: auto; padding: 0.6rem; }
.empty { text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: 0.75rem; }

/* 背包 */
.cat-section { margin-bottom: 0.6rem; }
.cat-title { font-size: 0.65rem; font-weight: 600; color: var(--accent-cyan); margin-bottom: 0.25rem; display: flex; align-items: baseline; gap: 0.25rem; }
.cat-n { font-size: 0.55rem; color: var(--text-muted); }
.item-row { display: flex; align-items: center; gap: 0.3rem; padding: 0.25rem 0.35rem; border-radius: 4px; background: rgba(8,16,28,0.3); margin-bottom: 0.15rem; font-size: 0.68rem; }
.item-name { color: var(--text-primary); font-weight: 500; }
.item-qty { color: var(--accent-cyan); font-size: 0.6rem; }
.item-desc { color: var(--text-muted); font-size: 0.58rem; margin-left: auto; max-width: 180px; text-align: right; }

/* NPC */
.npc-card { padding: 0.45rem 0.55rem; border-radius: 8px; margin-bottom: 0.35rem; }
.npc-h { display: flex; align-items: baseline; gap: 0.3rem; margin-bottom: 0.15rem; }
.npc-name { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); }
.npc-role { font-size: 0.58rem; color: var(--accent-cyan); }
.npc-p { font-size: 0.62rem; color: var(--text-muted); margin: 0; line-height: 1.4; }

/* 任务 */
.q-section { margin-bottom: 0.6rem; }
.quest-card { padding: 0.45rem 0.55rem; border-radius: 8px; margin-bottom: 0.35rem; }
.quest-card.done { opacity: 0.5; }
.q-title { font-size: 0.72rem; font-weight: 600; color: var(--text-primary); margin-bottom: 0.15rem; }
.q-desc { font-size: 0.62rem; color: var(--text-muted); margin: 0 0 0.2rem; line-height: 1.4; }
.q-objs { display: flex; flex-direction: column; gap: 0.08rem; }
.q-obj { font-size: 0.6rem; color: var(--text-secondary); }
</style>
