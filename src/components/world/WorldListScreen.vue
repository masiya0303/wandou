<!-- wandou · 世界列表 -->
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useWorldStore } from '@/stores/worldStore'

const router = useRouter()
const game = useGameStore()
const world = useWorldStore()

// ---- 槽位选择弹窗 ----
const slotPicker = ref<{ worldId: string; worldName: string } | null>(null)
const slotList = ref<{ name: string; timestamp: number; preview: string }[]>([])

async function handleCardClick(id: string) {
  const slots = game.listSlots(id)
  if (slots.length > 1) {
    // 有多个槽位 → 弹窗选择
    slotList.value = slots
    slotPicker.value = { worldId: id, worldName: world.worldList.find(w => w.id === id)?.name || '' }
  } else {
    // 只有一个槽位（或无）→ 直接进入
    await handleEnter(id)
  }
}

async function handleEnter(id: string, slot?: string) {
  const ok = slot ? await game.loadFromSlot(slot, id) : await game.enterWorld(id)
  if (ok) {
    const query = slot ? { slot } : {}
    router.push({ name: 'playing', params: { id }, query })
  }
}

async function handleSlotPick(slotName: string) {
  const p = slotPicker.value
  if (!p) return
  slotPicker.value = null
  await handleEnter(p.worldId, slotName)
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`确定删除世界「${name}」？这将删除该世界的所有存档槽位。`)) return
  await world.deleteWorld(id)
}

function handleCreate() {
  const id = world.createWorld('新世界', '')
  router.push({ name: 'worldDetail', params: { id } })
}

function fmt(ts: number) {
  return new Date(ts).toLocaleDateString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
}
</script>

<template>
  <div class="screen">
    <div class="bg-vignette"></div>
    <div class="bg-orbs"><div class="orb orb-pink"></div><div class="orb orb-rose"></div></div>
    <!-- 槽位选择弹窗 -->
    <Teleport to="body">
      <div v-if="slotPicker" class="slot-overlay" @click.self="slotPicker = null">
        <div class="slot-card">
          <div class="slot-head">
            <span class="slot-title">📂 {{ slotPicker.worldName }}</span>
            <button class="slot-close" @click="slotPicker = null">✕</button>
          </div>
          <p class="slot-hint">选择存档槽位</p>
          <div class="slot-list">
            <button
              v-for="s in slotList"
              :key="s.name"
              class="slot-item"
              @click="handleSlotPick(s.name)"
            >
              <span class="slot-name">{{ s.name }}</span>
              <span class="slot-preview">{{ s.preview }}</span>
              <span class="slot-time">{{ fmt(s.timestamp) }}</span>
            </button>
          </div>
          <!-- 快捷操作：删除旧槽位 -->
          <div v-if="slotList.length > 3" class="slot-manage">
            <span class="slot-hint2">💡 可在世界详情页管理存档槽位</span>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="container">
      <header class="head">
        <button class="btn-back" @click="router.push('/')">← 返回</button>
        <div class="title"><h1>🌍 我的世界</h1><p>MY WORLDS</p></div>
        <button class="btn-create" @click="handleCreate">＋ 创建</button>
      </header>
      <div v-if="world.worldList.length === 0" class="empty"><p>🌌 暂无世界</p><p class="hint">点击上方「创建」开始</p></div>
      <div v-else class="list">
        <div v-for="w in world.worldList" :key="w.id" class="card" @click="handleCardClick(w.id)">
          <div class="c-top"><span class="c-icon">🌍</span><div class="c-info"><span class="c-name">{{ w.name }}</span><span class="c-meta">{{ w.characterName || '未创建角色' }} · {{ w.messageCount }} 条消息</span></div><span class="c-time">{{ fmt(w.updatedAt) }}</span></div>
          <p v-if="w.description" class="c-desc">{{ w.description.slice(0,80) }}{{ w.description.length>80?'...':'' }}</p>
          <div v-if="w.slots && w.slots.length > 1" class="c-slots">
            <span class="c-slot-label">存档：</span>
            <span v-for="s in w.slots.slice(0, 4)" :key="s.name" class="c-slot-tag">{{ s.name }}</span>
            <span v-if="w.slots.length > 4" class="c-slot-tag">+{{ w.slots.length - 4 }}...</span>
          </div>
          <div class="c-acts"><button class="a-enter" @click.stop="handleCardClick(w.id)">进入 ▸</button><button class="a-del" @click.stop="handleDelete(w.id,w.name)">🗑️</button></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen { min-height: 100vh; position: relative; overflow: hidden; display: flex; flex-direction: column; background: var(--theme-chat-bg) center/cover no-repeat; }
.bg-orbs { position: fixed; inset: 0; z-index: -3; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-pink { width: 300px; height: 300px; top: 20%; right: 10%; background: rgba(255,128,168,0.04); }
.orb-rose { width: 400px; height: 400px; bottom: 10%; left: 5%; background: rgba(255,182,193,0.04); animation-delay: -3s; }
.container { position: relative; z-index: 1; padding: 20px; max-width: 640px; width: 100%; margin: 0 auto; }
.head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; margin-bottom: 24px; }
.title { text-align: center; }
.title h1 { font-size: 22px; color: #e0e8ff; margin: 0; font-weight: 700; }
.title p { font-size: 10px; color: var(--theme-border-light); letter-spacing: 0.15em; margin: 2px 0 0; }
.btn-back { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.6); color: var(--theme-text-main); font-size: 13px; cursor: pointer; font-family: inherit; }
.btn-back:active { background: var(--theme-border-ice); }
.btn-create { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--theme-text-accent); background: rgba(255,255,255,0.6); color: var(--theme-text-accent); font-size: 13px; cursor: pointer; font-family: inherit; }
.btn-create:active { background: var(--theme-border-ice); }
.empty { text-align: center; padding: 48px 16px; color: var(--theme-text-main); opacity: 0.6; }
.empty .hint { font-size: 12px; opacity: 0.6; }
.list { display: flex; flex-direction: column; gap: 12px; }
.card { padding: 14px 16px; border-radius: 16px; cursor: pointer; transition: all 0.25s; background: rgba(255,255,255,0.7); border: 1px solid var(--theme-border-ice); }
.card:active { border-color: var(--theme-text-accent); transform: translateY(-2px); box-shadow: 0 0 15px rgba(255,128,168,0.15); }
.c-top { display: flex; align-items: center; gap: 10px; }
.c-icon { font-size: 22px; }
.c-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.c-name { font-size: 16px; font-weight: 600; color: var(--theme-text-main); }
.c-meta { font-size: 11px; color: var(--theme-text-main); opacity: 0.55; }
.c-time { font-size: 10px; color: var(--theme-text-main); opacity: 0.4; }
.c-desc { font-size: 12px; color: var(--theme-text-main); opacity: 0.6; margin: 6px 0 0; line-height: 1.4; }
.c-acts { display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end; }
.a-enter { padding: 4px 10px; border-radius: 6px; background: rgba(255,128,168,0.08); border: 1px solid rgba(255,128,168,0.25); color: var(--theme-text-accent); font-size: 12px; cursor: pointer; font-family: inherit; }
.a-enter:active { background: rgba(255,128,168,0.2); }
.a-del { padding: 4px 6px; border: none; background: none; color: #c88; font-size: 12px; cursor: pointer; opacity: 0.5; }
.a-del:active { opacity: 1; }
/* slot tags on card */
.c-slots { display: flex; flex-wrap: wrap; align-items: center; gap: 3px; margin-top: 4px; }
.c-slot-label { font-size: 10px; color: var(--theme-text-main); opacity: 0.45; }
.c-slot-tag { font-size: 9px; padding: 1px 6px; border-radius: 8px; background: rgba(255,182,193,0.1); border: 1px solid var(--theme-border-ice); color: var(--theme-text-main); opacity: 0.6; }
/* slot picker modal */
.slot-overlay { position: fixed; inset: 0; z-index: 400; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 20px; }
.slot-card { width: 100%; max-width: 400px; max-height: 80vh; overflow-y: auto; border-radius: 20px; background: linear-gradient(170deg, rgba(255,250,252,0.97), rgba(255,235,242,0.95)); padding: 20px; box-shadow: 0 12px 48px rgba(0,0,0,0.15); }
.slot-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.slot-title { font-size: 17px; font-weight: 700; color: var(--theme-text-main); }
.slot-close { width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--theme-border-light); background: none; cursor: pointer; font-size: 14px; color: var(--theme-text-main); display: flex; align-items: center; justify-content: center; }
.slot-close:hover { color: #e55; }
.slot-hint { font-size: 12px; color: var(--theme-text-main); opacity: 0.45; margin: 4px 0 12px; }
.slot-hint2 { font-size: 11px; color: var(--theme-text-main); opacity: 0.4; }
.slot-list { display: flex; flex-direction: column; gap: 6px; }
.slot-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 14px; border: 1px solid var(--theme-border-ice); border-radius: 12px; background: rgba(255,255,255,0.6); cursor: pointer; font-family: inherit; transition: all 0.15s; text-align: left; }
.slot-item:hover { border-color: var(--theme-text-accent); background: rgba(255,128,168,0.06); }
.slot-item:active { transform: scale(0.98); }
.slot-name { font-size: 14px; font-weight: 600; color: var(--theme-text-main); flex-shrink: 0; }
.slot-preview { flex: 1; font-size: 11px; color: var(--theme-text-main); opacity: 0.55; }
.slot-time { font-size: 10px; color: var(--theme-text-main); opacity: 0.35; flex-shrink: 0; }
.slot-manage { margin-top: 12px; text-align: center; }
</style>
