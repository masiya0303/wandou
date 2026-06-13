<!-- wandou · 底部功能栏 + 世界状态显示 + 物品 toast 通知（AI 驱动状态同步） -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'
import { useStateStore } from '@/stores/stateStore'
import { bus } from '@/utils/events'
import type { InventoryItem, Quest } from '@/types/world'
import type { NpcEntry } from '@/types/npc'
import NpcDetailModal from './NpcDetailModal.vue'

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
const typeIcons: Record<string, string> = { weapon:'⚔️', armor:'🛡️', consumable:'🧪', material:'📦', key:'🔑', other:'📌' }
const typeLabels: Record<string, string> = { weapon:'武器', armor:'防具', consumable:'消耗品', material:'材料', key:'关键物品', other:'其他' }

// 物品详情弹窗
const detailItem = ref<InventoryItem | null>(null)

function openItemDetail(item: InventoryItem) {
  detailItem.value = item
}

// NPC 详情弹窗
const detailNpc = ref<NpcEntry | null>(null)

function openNpcDetail(n: NpcEntry) {
  detailNpc.value = n
}
const grouped = computed(() => {
  const m: Record<string, InventoryItem[]> = {}
  for (const c of invCategories) m[c] = player.inventory.filter((i: InventoryItem) => i.type === c)
  return m
})
const activeNpcs = computed(() => npc.getActiveNpcs())

const CATEGORY_LABELS: Record<string, string> = { '在场': '', '离场': '💤', '重点': '⭐' }
const CATEGORY_CLASSES: Record<string, string> = { '在场': 'cat-present', '离场': 'cat-away', '重点': 'cat-key' }
const activeQ = computed(() => player.quests.filter((q: Quest) => q.status === 'active'))
const doneQ = computed(() => player.quests.filter((q: Quest) => q.status === 'completed'))
const gold = computed(() => player.character.gold ?? 0)
const attrs = computed(() => player.character.attributes ?? {})

// 空格子数量 — 最少显示一排空槽
const SLOTS_PER_ROW = 4
const MIN_SLOTS = 20
const emptySlots = computed(() =>
  Math.max(0, Math.max(MIN_SLOTS, Math.ceil(player.inventory.length / SLOTS_PER_ROW) * SLOTS_PER_ROW) - player.inventory.length)
)

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
  bus.on('quest:added', (q: any) => {
    if (q?.title) showToast(`📋 新任务：${q.title}`)
  })
  bus.on('quest:updated', (q: any) => {
    if (q?.title && q?.status === 'completed') showToast(`✅ 任务完成：${q.title}`)
    else if (q?.title && q?.status === 'failed') showToast(`❌ 任务失败：${q.title}`)
  })
  bus.on('npc:identityRevealed', (payload: any) => {
    if (payload?.newName && payload?.oldName) {
      showToast(`🪪 身份揭示：${payload.oldName} → ${payload.newName}`)
    }
  })
  bus.on('npc:renamed', (payload: any) => {
    if (payload?.newName && payload?.oldName) {
      showToast(`📝 ${payload.oldName} → ${payload.newName}`)
    }
  })
  bus.on('chat:thinking_missing', () => {
    showToast('⚠️ AI 本轮未输出思考过程（可能遗漏变量更新）')
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

        <!-- 背包统一槽位网格 -->
        <div class="inv-slot-grid">
          <div
            v-for="(it, idx) in player.inventory"
            :key="it.id"
            class="inv-slot"
            @click="openItemDetail(it)"
          >
            <span class="inv-slot-icon">{{ it.icon || typeIcons[it.type] }}</span>
            <span class="inv-slot-name">{{ it.name }}</span>
            <span class="inv-slot-qty" :class="{ solo: it.quantity === 1 }">{{ it.quantity }}</span>
          </div>
          <!-- 空格子 -->
          <div
            v-for="n in emptySlots"
            :key="'e'+n"
            class="inv-slot inv-slot--empty"
          ></div>
        </div>
        <div v-if="player.inventory.length === 0" class="none">背包空空如也</div>

        <!-- 物品详情弹窗 -->
        <Teleport to="body">
          <Transition name="modal">
            <div v-if="detailItem" class="modal-overlay" @click.self="detailItem = null">
              <div class="modal-card glass-panel">
                <div class="modal-top">
                  <span class="modal-icon">{{ detailItem.icon || typeIcons[detailItem.type] }}</span>
                  <span class="modal-name">{{ detailItem.name }}</span>
                  <button class="modal-close" @click="detailItem = null">✕</button>
                </div>
                <div class="modal-body">
                  <div class="modal-meta">
                    <span class="modal-type-tag">{{ typeLabels[detailItem.type] }}</span>
                    <span class="modal-qty">数量: {{ detailItem.quantity }}</span>
                  </div>
                  <p class="modal-desc">{{ detailItem.description || '暂无描述' }}</p>
                </div>
              </div>
            </div>
          </Transition>
        </Teleport>
      </template>
      <!-- npc -->
      <template v-if="tab === 'npc'">
        <div v-if="activeNpcs.length === 0" class="none">暂无活跃 NPC</div>
        <div v-for="n in activeNpcs" :key="n.id" class="card glass-panel"
          :class="{
            'card-revealed': n.identityRevealed,
            'card-key': npc.getNpcCategory(n) === '重点',
            'card-away': npc.getNpcCategory(n) === '离场',
          }"
          @click="openNpcDetail(n)">
          <div class="card-head">
            <span class="card-cat-badge" :class="CATEGORY_CLASSES[npc.getNpcCategory(n)]">{{ CATEGORY_LABELS[npc.getNpcCategory(n)] }}</span>
            <span class="card-name">{{ n.name }}</span>
            <span v-if="n.identityRevealed" class="card-reveal-badge" title="身份已揭示">🪪</span>
            <span v-if="n.role" class="card-sub">{{ n.role }}</span>
            <span class="card-id">ID: {{ n.id.slice(0, 12) }}...</span>
          </div>
          <p v-if="n.personality" class="card-text">{{ n.personality.slice(0, 100) }}{{ n.personality.length > 100 ? '...' : '' }}</p>
          <div v-if="n.aliases && n.aliases.length > 0" class="card-aliases">
            <span class="alias-label">别名：</span>
            <span v-for="a in n.aliases" :key="a" class="alias-tag">{{ a }}</span>
          </div>
          <div v-if="n.identityHistory && n.identityHistory.length > 0" class="card-history">
            <span class="history-label">改名：</span>
            <span v-for="(h, i) in n.identityHistory" :key="i" class="history-item">{{ h.from }} → {{ h.to }}</span>
          </div>
          <div v-if="n.人物事迹 && n.人物事迹.length > 0" class="card-chronicles">
            <span class="history-label">事迹：</span>
            <div class="chronicle-list">
              <span v-for="(c, i) in npc.getRecentChronicles(n.id, 3)" :key="i" class="chronicle-item">{{ c }}</span>
            </div>
          </div>
        </div>
      </template>
      <!-- quest -->
      <template v-if="tab === 'quest'">
        <div class="cat-head">进行中 <span class="cat-n">{{ activeQ.length }}</span></div>
        <div v-if="activeQ.length === 0" class="none">暂无任务</div>
        <div v-for="q in activeQ" :key="q.id" class="card glass-panel" :style="{ borderLeft: '3px solid ' + (q.color || '#ffa726') }">
          <div class="card-head">
            <span class="card-name">{{ q.title }}</span>
            <span class="quest-type-tag" :style="{ background: (q.color || '#ffa726') + '22', color: q.color || '#ffa726', borderColor: q.color || '#ffa726' }">{{ q.questType || '支线' }}</span>
          </div>
          <p class="card-text">{{ q.description.slice(0, 80) }}{{ q.description.length > 80 ? '...' : '' }}</p>
          <p v-if="q.reward" class="card-reward">🎁 {{ q.reward }}</p>
        </div>
        <div v-if="doneQ.length" class="cat-head" style="margin-top:12px">已完成 <span class="cat-n">{{ doneQ.length }}</span></div>
        <div v-for="q in doneQ" :key="q.id" class="card glass-panel" style="opacity:0.5">
          <div class="card-name">✅ {{ q.title }}</div>
        </div>
      </template>
    </div>

    <!-- NPC 详情弹窗（放在面板内但不受标签切换影响） -->
    <NpcDetailModal v-if="detailNpc" :npc="detailNpc" @close="detailNpc = null" />
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
.cat { margin-bottom: 0; }
.cat-head { font-size: 11px; font-weight: 600; color: var(--theme-text-accent); margin-bottom: 4px; display: flex; align-items: baseline; gap: 4px; }
.cat-n { font-size: 11px; color: var(--theme-text-main); font-weight: 400; opacity: 0.6; }

/* ===== 游戏网状槽位背包 ===== */
.inv-slot-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 2px;
}
.inv-slot {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
  /* 游戏风格边框 — 外暗内亮 */
  border: 2px solid #c4a0a8;
  background:
    linear-gradient(145deg, rgba(255,245,248,0.95), rgba(255,225,235,0.85));
  box-shadow:
    inset 0 1px 2px rgba(255,255,255,0.7),
    inset 0 -2px 3px rgba(180,140,148,0.25),
    0 1px 0 rgba(255,255,255,0.6),
    0 2px 4px rgba(0,0,0,0.06);
  transition: transform 0.1s, box-shadow 0.1s, border-color 0.1s;
}
.inv-slot:active {
  transform: scale(0.94);
  border-color: var(--theme-text-accent);
  box-shadow:
    inset 0 1px 2px rgba(255,255,255,0.5),
    0 0 0 2px rgba(255,128,168,0.35);
}

/* 空格子 */
.inv-slot--empty {
  border: 2px solid rgba(196,160,168,0.3);
  background:
    linear-gradient(145deg, rgba(255,245,248,0.35), rgba(255,225,235,0.2));
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.3),
    0 1px 0 rgba(255,255,255,0.2);
  cursor: default;
  pointer-events: none;
}

.inv-slot-icon {
  font-size: 26px;
  line-height: 1;
  filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1));
}
.inv-slot-name {
  font-size: 9px;
  font-weight: 500;
  color: #5a3e44;
  text-align: center;
  line-height: 1.15;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inv-slot-qty {
  position: absolute;
  bottom: 3px;
  right: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  min-width: 18px;
  height: 17px;
  line-height: 17px;
  text-align: center;
  border-radius: 8px;
  padding: 0 5px;
  background: var(--theme-text-accent);
  box-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.inv-slot-qty.solo {
  background: rgba(180,140,148,0.55);
  font-size: 9px;
  min-width: 15px;
  height: 15px;
  line-height: 15px;
}

/* 物品详情弹窗 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.modal-card {
  width: 100%;
  max-width: 320px;
  border-radius: 20px;
  padding: 20px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.modal-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.modal-icon {
  font-size: 36px;
  line-height: 1;
}
.modal-name {
  flex: 1;
  font-size: 18px;
  font-weight: 700;
  color: var(--theme-text-main);
}
.modal-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--theme-border-light);
  background: none;
  color: var(--theme-text-main);
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.modal-close:active { color: #e55; }
.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.modal-meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.modal-type-tag {
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  background: var(--theme-text-accent);
  padding: 2px 10px;
  border-radius: 10px;
}
.modal-qty {
  font-size: 13px;
  color: var(--theme-text-main);
  font-weight: 500;
}
.modal-desc {
  font-size: 14px;
  color: var(--theme-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* modal transition */
.modal-enter-active { transition: all 0.2s ease-out; }
.modal-leave-active { transition: all 0.15s ease-in; }
.modal-enter-from { opacity: 0; }
.modal-enter-from .modal-card { transform: scale(0.9); }
.modal-leave-to { opacity: 0; }
.modal-leave-to .modal-card { transform: scale(0.95); }
.card { padding: 8px 10px; border-radius: 8px; margin-bottom: 6px; background: rgba(255,182,193,0.1); cursor: pointer; transition: transform 0.1s, box-shadow 0.1s; }
.card:hover { transform: translateY(-1px); box-shadow: 0 2px 8px rgba(255,128,168,0.12); }
.card:active { transform: scale(0.98); }
.card-revealed { border-left: 3px solid #c9b1ff; }
.card-key { border-left: 3px solid #ffb74d; background: rgba(255,183,77,0.06); }
.card-away { opacity: 0.4; }
.card-head { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; flex-wrap: wrap; }
.card-name { font-size: 13px; font-weight: 600; color: var(--theme-text-main); }
.card-cat-badge {
  font-size: 10px; flex-shrink: 0; border-radius: 4px; padding: 1px 4px; line-height: 1.3;
}
.cat-present { }
.cat-away { color: var(--theme-text-main); opacity: 0.35; background: rgba(0,0,0,0.04); }
.cat-key { color: #fff; background: #ffb74d; font-weight: 600; }
.card-id {
  font-size: 8px; color: var(--theme-text-main); opacity: 0.25; margin-left: auto; flex-shrink: 0;
  font-family: monospace;
}
.card-reveal-badge { font-size: 12px; flex-shrink: 0; }
.card-sub { font-size: 11px; color: var(--theme-text-accent); }
.card-text { font-size: 12px; color: var(--theme-text-main); opacity: 0.7; margin: 0; line-height: 1.4; }
.card-aliases { margin-top: 4px; display: flex; flex-wrap: wrap; align-items: center; gap: 3px; }
.alias-label { font-size: 10px; color: var(--theme-text-main); opacity: 0.4; }
.alias-tag {
  font-size: 9px; color: var(--theme-text-accent); background: rgba(255,182,193,0.12);
  padding: 1px 6px; border-radius: 6px; border: 1px solid var(--theme-border-ice);
}
.card-history { margin-top: 3px; display: flex; flex-wrap: wrap; align-items: center; gap: 3px; }
.card-chronicles { margin-top: 4px; }
.chronicle-list { display: flex; flex-direction: column; gap: 1px; margin-top: 2px; }
.chronicle-item {
  font-size: 10px; color: var(--theme-text-main); opacity: 0.55;
  padding: 1px 0; line-height: 1.4;
}
.history-label { font-size: 10px; color: var(--theme-text-main); opacity: 0.4; }
.history-item {
  font-size: 9px; color: #9575cd; background: rgba(149,117,205,0.08);
  padding: 1px 6px; border-radius: 6px;
}
.quest-type-tag {
  font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 8px; border: 1px solid; white-space: nowrap;
}
.card-reward { font-size: 11px; color: var(--theme-text-accent); margin: 4px 0 0; font-weight: 500; }
</style>
