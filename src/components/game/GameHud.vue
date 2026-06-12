<!-- wandou · 底部功能栏 + 世界状态显示 + 物品 toast 通知（AI 驱动状态同步） -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'
import { useStateStore } from '@/stores/stateStore'
import { bus } from '@/utils/events'
import type { InventoryItem, Quest } from '@/types/world'
import type { NpcEntry } from '@/types/npc'

const player = usePlayerStore()
const npc = useNpcStore()
const stateStore = useStateStore()
const tab = ref<'chat' | 'inventory' | 'npc' | 'quest'>('chat')

const locationLabel = computed(() => stateStore.locationString())
const timeLabel = computed(() => stateStore.worldTime)
const weatherLabel = computed(() => stateStore.weather)
const memoryCount = computed(() => stateStore.memories.filter(m => m.state === 'active').length)

const invCategories = ['weapon','armor','consumable','material','key','other'] as const
const catLabels: Record<string, string> = { weapon:'⚔️武器', armor:'🛡️防具', consumable:'🧪消耗品', material:'📦材料', key:'🔑关键', other:'📌其他' }
const grouped = computed(() => {
  const m: Record<string, InventoryItem[]> = {}
  for (const c of invCategories) m[c] = player.inventory.filter((i: InventoryItem) => i.type === c)
  return m
})
const activeNpcs = computed(() => npc.npcs.filter((n: NpcEntry) => n.enabled))
const activeQ = computed(() => player.quests.filter((q: Quest) => q.status === 'active'))
const doneQ = computed(() => player.quests.filter((q: Quest) => q.status === 'completed'))
const gold = computed(() => player.character.gold ?? 0)
const attrs = computed(() => player.character.attributes ?? {})

// ---- Toast 通知 ----
const toastVisible = ref(false)
const toastMessage = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toastMessage.value = msg
  toastVisible.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastVisible.value = false
    toastTimer = null
  }, 3000)
}

function switchTab(t: typeof tab.value) {
  if (tab.value === t) {
    tab.value = 'chat'
  } else {
    tab.value = t
    // 打开背包时清除红点
    if (t === 'inventory') {
      player.clearNewItemBadge()
    }
  }
}

onMounted(() => {
  bus.on('inventory:toast', (payload: any) => {
    if (payload?.message) {
      showToast(payload.message)
    }
  })
})

onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
})
</script>

<template>
  <!-- Toast 通知 -->
  <Transition name="toast">
    <div v-if="toastVisible" class="toast glass-panel">
      {{ toastMessage }}
    </div>
  </Transition>

  <!-- overlay panel -->
  <div v-if="tab !== 'chat'" class="panel glass-panel">
    <div class="panel-top">
      <span class="panel-title">{{ { inventory: '🎒 背包', npc: '👥 NPC', quest: '📋 任务' }[tab] }}</span>
      <button class="panel-close" @click="tab = 'chat'">✕</button>
    </div>
    <div class="panel-inner">
      <!-- inventory -->
      <template v-if="tab === 'inventory'">
        <!-- 金币 & 属性 -->
        <div class="stats-row">
          <span class="stat-coins">🪙 {{ gold }} G</span>
          <span v-for="(v, k) in attrs" :key="k" class="stat-attr">{{ k }}: {{ v }}</span>
        </div>
        <div v-if="player.inventory.length === 0" class="none">背包空空如也</div>
        <div v-for="c in invCategories" :key="c">
          <div v-if="grouped[c].length" class="cat">
            <div class="cat-head">{{ catLabels[c] }} <span class="cat-n">{{ grouped[c].length }}</span></div>
            <div v-for="it in grouped[c]" :key="it.id" class="inv-item glass-panel">
              <div class="inv-left">
                <span class="inv-name">{{ it.name }}</span>
                <span v-if="it.description" class="inv-desc">{{ it.description }}</span>
              </div>
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
    <div class="status-row">
      <span class="status-time" :title="timeLabel">🕐 {{ timeLabel || '时间未知' }}</span>
      <span class="status-loc" :title="locationLabel">📍 {{ locationLabel || '地点未知' }}</span>
      <span v-if="weatherLabel" class="status-weather">{{ weatherLabel }}</span>
      <span v-if="memoryCount > 0" class="status-memory" title="已记录的关键记忆">🧠 {{ memoryCount }}</span>
    </div>
    <div class="tab-row">
      <button
        v-for="t in [
          { k:'chat' as const, e:'💬' },
          { k:'inventory' as const, e:'🎒' },
          { k:'npc' as const, e:'👥' },
          { k:'quest' as const, e:'📋' }
        ]"
        :key="t.k"
        :class="['tb', { on: tab === t.k }]"
        @click="switchTab(t.k)"
      >
        <span class="tb-ico-wrap">
          <span class="tb-ico">{{ t.e }}</span>
          <!-- 背包红点 -->
          <span v-if="t.k === 'inventory' && player.newItemCount > 0" class="tb-dot"></span>
        </span>
        <span class="tb-txt">{{ {chat:'聊天',inventory:'背包',npc:'NPC',quest:'任务'}[t.k] }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* toast */
.toast {
  position: fixed;
  top: 52px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  padding: 8px 20px;
  border-radius: 20px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-main);
  box-shadow: 0 2px 12px rgba(255,128,168,0.12);
  white-space: nowrap;
}
.toast-enter-active { transition: all 0.25s ease-out; }
.toast-leave-active { transition: all 0.2s ease-in; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
.toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-4px); }

/* panel */
.panel { position: absolute; bottom: 48px; left: 0; right: 0; top: 44px; z-index: 10; border-radius: 0; display: flex; flex-direction: column; overflow: hidden; background: var(--theme-panel-bg) center/cover no-repeat, rgba(255,255,255,0.85); background-blend-mode: overlay; }
.panel-top { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-bottom: 1px solid var(--theme-border-ice); flex-shrink: 0; }
.panel-title { font-size: 15px; font-weight: 600; color: var(--theme-text-main); }
.panel-close { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--theme-border-light); background: none; color: var(--theme-text-main); cursor: pointer; font-size: 13px; display: flex; align-items: center; justify-content: center; }
.panel-close:active { color: #e55; }
.panel-inner { flex: 1; overflow-y: auto; padding: 12px; }

/* bar */
.bar { display: flex; flex-direction: column; flex-shrink: 0; z-index: 20; background: var(--theme-bubble-bg); border-top: 1px solid var(--theme-border-ice); }
.tab-row { display: flex; align-items: center; justify-content: space-evenly; height: 44px; }
.tb { display: flex; flex-direction: column; align-items: center; gap: 1px; border: none; background: none; color: var(--theme-text-main); cursor: pointer; font-family: inherit; padding: 4px 12px; border-radius: 8px; transition: all 0.15s; opacity: 0.6; }
.tb.on { color: var(--theme-text-accent); background: rgba(255,128,168,0.08); opacity: 1; }
.tb:active { transform: scale(0.94); }
.tb-ico-wrap { position: relative; display: inline-flex; }
.tb-ico { font-size: 16px; }
.tb-dot {
  position: absolute;
  top: -3px;
  right: -6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff4d6a;
  border: 1px solid #fff;
}
.tb-txt { font-size: 10px; font-weight: 500; }

/* status row */
.status-row { display: flex; align-items: center; gap: 8px; padding: 3px 12px; font-size: 10px; color: var(--theme-text-main); opacity: 0.7; overflow-x: auto; white-space: nowrap; border-bottom: 1px solid var(--theme-border-ice); }
.status-time, .status-loc, .status-weather, .status-memory { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.status-time { font-variant-numeric: tabular-nums; }
.status-weather { font-size: 11px; }
.status-memory { color: var(--theme-text-accent); }

/* stats */
.stats-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.stat-coins { font-size: 14px; font-weight: 700; color: var(--theme-text-accent); background: rgba(255,215,0,0.12); border: 1px solid rgba(255,215,0,0.2); border-radius: 8px; padding: 3px 10px; }
.stat-attr { font-size: 11px; color: var(--theme-text-main); background: rgba(255,255,255,0.4); border-radius: 6px; padding: 2px 8px; }

/* inventory */
.none { text-align: center; padding: 32px 16px; color: var(--theme-text-main); font-size: 13px; opacity: 0.6; }
.cat { margin-bottom: 8px; }
.cat-head { font-size: 12px; font-weight: 600; color: var(--theme-text-accent); margin-bottom: 4px; display: flex; align-items: baseline; gap: 4px; }
.cat-n { font-size: 11px; color: var(--theme-text-main); font-weight: 400; opacity: 0.6; }
.inv-item { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; border-radius: 8px; background: rgba(255,182,193,0.1); margin-bottom: 3px; font-size: 13px; }
.inv-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.inv-name { color: var(--theme-text-main); font-weight: 500; }
.inv-desc { font-size: 10px; color: var(--theme-text-main); opacity: 0.5; line-height: 1.3; }
.inv-qty { color: var(--theme-text-accent); font-size: 11px; font-weight: 600; flex-shrink: 0; }
.card { padding: 8px 10px; border-radius: 8px; margin-bottom: 6px; background: rgba(255,182,193,0.1); }
.card-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
.card-name { font-size: 13px; font-weight: 600; color: var(--theme-text-main); }
.card-sub { font-size: 11px; color: var(--theme-text-accent); }
.card-text { font-size: 12px; color: var(--theme-text-main); opacity: 0.7; margin: 0; line-height: 1.4; }
</style>
