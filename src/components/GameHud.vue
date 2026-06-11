<!-- ============================================================
 wandou v1.2 — GameHud
 仿 mimi BottomNav: 浮球药丸导航 + SVG 图标
============================================================ -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import type { InventoryItem, Quest } from '../types/world'
import type { NpcEntry } from '../types/npc'

const store = useGameStore()
const tab = ref<'chat' | 'inventory' | 'npc' | 'quest'>('chat')

const TABS = [
  { key: 'chat' as const, icon: '/book.svg', cn: '聊天', en: 'CHAT' },
  { key: 'inventory' as const, icon: '/bill.svg', cn: '背包', en: 'INV' },
  { key: 'npc' as const, icon: '/world.svg', cn: 'NPC', en: 'NPC' },
  { key: 'quest' as const, icon: '/tab.svg', cn: '任务', en: 'QUEST' },
]

const invCategories = ['weapon','armor','consumable','material','key','other'] as const
const catLabels: Record<string, string> = { weapon:'武器', armor:'防具', consumable:'消耗品', material:'材料', key:'关键物品', other:'其他' }
const groupedInv = computed(() => {
  const m: Record<string, InventoryItem[]> = {}
  for (const c of invCategories) m[c] = store.inventory.filter((i: InventoryItem) => i.type === c)
  return m
})

const activeQuests = computed(() => store.quests.filter((q: Quest) => q.status === 'active'))
const completedQuests = computed(() => store.quests.filter((q: Quest) => q.status === 'completed'))
</script>

<template>
  <!-- 面板 -->
  <div v-if="tab !== 'chat'" class="panel glass-panel">
    <div class="panel-head">
      <span class="ph-cn">{{ TABS.find(t=>t.key===tab)?.cn }}</span>
      <button class="ph-close" @click="tab = 'chat'">✕</button>
    </div>

    <div class="panel-body">
      <!-- 背包 -->
      <template v-if="tab === 'inventory'">
        <div v-if="store.inventory.length === 0" class="empty">空空如也</div>
        <div v-for="c in invCategories" :key="c">
          <div v-if="groupedInv[c].length" class="cat-section">
            <div class="cat-title">{{ catLabels[c] }} <span class="cat-n">{{ groupedInv[c].length }}</span></div>
            <div v-for="item in groupedInv[c]" :key="item.id" class="item-row glass-panel">
              <span class="item-name">{{ item.name }}</span>
              <span v-if="item.quantity > 1" class="item-qty">×{{ item.quantity }}</span>
              <span class="item-desc">{{ item.description.slice(0,40) }}{{ item.description.length>40?'...':'' }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- NPC -->
      <template v-if="tab === 'npc'">
        <div v-if="store.npcs.filter((n: NpcEntry)=>n.enabled).length === 0" class="empty">暂无活跃 NPC</div>
        <div v-for="n in store.npcs.filter((n: NpcEntry)=>n.enabled)" :key="n.id" class="npc-card glass-panel">
          <div class="npc-h"><span class="npc-name">{{ n.name }}</span><span v-if="n.role" class="npc-role">{{ n.role }}</span></div>
          <p v-if="n.personality" class="npc-p">{{ n.personality.slice(0, 100) }}{{ n.personality.length>100?'...':'' }}</p>
        </div>
      </template>

      <!-- 任务 -->
      <template v-if="tab === 'quest'">
        <div class="cat-title">进行中 <span class="cat-n">{{ activeQuests.length }}</span></div>
        <div v-if="activeQuests.length === 0" class="empty">暂无任务</div>
        <div v-for="q in activeQuests" :key="q.id" class="quest-card glass-panel">
          <div class="q-title">{{ q.title }}</div>
          <p class="q-desc">{{ q.description.slice(0,120) }}{{ q.description.length>120?'...':'' }}</p>
          <div class="q-objs"><span v-for="(o,i) in q.objectives" :key="i" class="q-obj">▸ {{ o }}</span></div>
        </div>
        <div v-if="completedQuests.length" class="cat-title" style="margin-top:1rem">已完成 <span class="cat-n">{{ completedQuests.length }}</span></div>
        <div v-for="q in completedQuests" :key="q.id" class="quest-card done glass-panel">
          <div class="q-title">✅ {{ q.title }}</div>
        </div>
      </template>
    </div>
  </div>

  <!-- 底部浮球导航 -->
  <div class="bottom-nav glass-panel">
    <button v-for="t in TABS" :key="t.key" :class="['nav-btn', { on: tab === t.key }]" @click="tab = tab === t.key ? 'chat' : (t.key as any)">
      <img :src="t.icon" alt="" class="nav-icon" />
      <span class="nav-label">{{ t.en }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 面板 */
.panel { position: absolute; bottom: 80px; left: 0; right: 0; top: 48px; z-index: 10; border-radius: 0; display: flex; flex-direction: column; overflow: hidden; }
.panel-head { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1rem; border-bottom: 1px solid var(--glass-border); flex-shrink: 0; }
.ph-cn { font-size: var(--font-sm); font-weight: 600; color: var(--text-primary); }
.ph-close { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--glass-border); background: none; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; display: flex; align-items: center; justify-content: center; }
.ph-close:active { color: #e55; border-color: #e55; }
.panel-body { flex: 1; overflow-y: auto; padding: 0.8rem; }

.empty { text-align: center; padding: 2rem 1rem; color: var(--text-muted); font-size: var(--font-xs); }

/* 背包 */
.cat-section { margin-bottom: 0.6rem; }
.cat-title { font-size: var(--font-xs); font-weight: 600; color: var(--accent-cyan); margin-bottom: 0.3rem; display: flex; align-items: baseline; gap: 0.3rem; }
.cat-n { font-size: var(--font-xs); color: var(--text-muted); font-weight: 400; }
.item-row { display: flex; align-items: center; gap: 0.3rem; padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); margin-bottom: 0.2rem; font-size: var(--font-xs); }
.item-name { color: var(--text-primary); font-weight: 500; }
.item-qty { color: var(--accent-cyan); font-size: var(--font-xs); }
.item-desc { color: var(--text-muted); margin-left: auto; max-width: 180px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* NPC */
.npc-card { padding: 0.5rem 0.6rem; border-radius: var(--radius-sm); margin-bottom: 0.4rem; }
.npc-h { display: flex; align-items: baseline; gap: 0.3rem; margin-bottom: 0.15rem; }
.npc-name { font-size: var(--font-sm); font-weight: 600; color: var(--text-primary); }
.npc-role { font-size: var(--font-xs); color: var(--accent-cyan); }
.npc-p { font-size: var(--font-xs); color: var(--text-muted); margin: 0; line-height: 1.4; }

/* 任务 */
.quest-card { padding: 0.5rem 0.6rem; border-radius: var(--radius-sm); margin-bottom: 0.4rem; }
.quest-card.done { opacity: 0.5; }
.q-title { font-size: var(--font-xs); font-weight: 600; color: var(--text-primary); margin-bottom: 0.1rem; }
.q-desc { font-size: var(--font-xs); color: var(--text-muted); margin: 0 0 0.2rem; line-height: 1.4; }
.q-objs { display: flex; flex-direction: column; gap: 0.06rem; }
.q-obj { font-size: var(--font-xs); color: var(--text-secondary); }

/* ===== 浮球导航 ===== */
.bottom-nav {
  display: flex; align-items: center; justify-content: space-evenly;
  width: 85%; max-width: 360px; padding: 0.4rem 0.5rem;
  border-radius: var(--radius-pill);
  position: relative; z-index: 20; flex-shrink: 0;
  margin: 0 auto 0.6rem;
}
.nav-btn {
  display: flex; flex-direction: column; align-items: center; gap: 0.1rem;
  border: none; background: none; color: var(--text-muted); cursor: pointer;
  font-family: inherit; transition: all 0.2s; padding: 0.25rem 0.4rem;
  border-radius: var(--radius-pill);
}
.nav-btn.on { color: var(--accent-cyan); background: rgba(0,229,255,0.06); }
.nav-btn:active { transform: scale(0.92); }
.nav-icon { width: 20px; height: 20px; opacity: 0.7; transition: opacity 0.2s; }
.nav-btn.on .nav-icon { opacity: 1; filter: drop-shadow(0 0 4px var(--accent-cyan-glow)); }
.nav-label { font-size: 2.4vw; font-weight: 500; letter-spacing: 0.05em; }
@media (min-width: 768px) { .nav-label { font-size: 10px; } }
</style>
