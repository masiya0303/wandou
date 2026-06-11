<!-- ============================================================
 wandou v0.7 — 世界列表页
============================================================ -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const emit = defineEmits<{ back: [] }>()

async function handleEnter(id: string) {
  await store.enterWorld(id)
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`确定删除世界「${name}」？此操作不可撤销。`)) return
  await store.deleteWorld(id)
}

function handleCreate() {
  store.phase = 'createWorld'
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="screen">
    <div class="bg-base"></div>
    <div class="bg-orbs"><div class="orb orb-cyan"></div><div class="orb orb-blue"></div></div>

    <div class="container">
      <header class="top-row">
        <button class="btn-back glass-panel" @click="emit('back')">← 返回</button>
        <div class="title-area">
          <h1>🌍 我的世界</h1>
          <p class="sub">MY WORLDS</p>
        </div>
        <button class="btn-create glass-panel corner-deco" @click="handleCreate">＋ 创建</button>
      </header>

      <div v-if="store.worldList.length === 0" class="empty">
        <p>🌌 暂无世界</p>
        <p class="hint">点击上方「创建」开始你的第一个冒险</p>
      </div>

      <div v-else class="list">
        <div
          v-for="w in store.worldList" :key="w.id"
          class="world-card glass-panel corner-deco"
          @click="handleEnter(w.id)"
        >
          <div class="card-top">
            <span class="card-icon">🌍</span>
            <div class="card-info">
              <span class="card-name">{{ w.name }}</span>
              <span class="card-meta">{{ w.characterName || '未创建角色' }} · {{ w.messageCount }} 条消息</span>
            </div>
            <span class="card-time">{{ formatDate(w.updatedAt) }}</span>
          </div>
          <p v-if="w.description" class="card-desc">{{ w.description.slice(0, 80) }}{{ w.description.length > 80 ? '...' : '' }}</p>
          <div class="card-actions">
            <button class="act-enter" @click.stop="handleEnter(w.id)">进入 ▸</button>
            <button class="act-delete" @click.stop="handleDelete(w.id, w.name)">🗑️</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen { min-height: 100vh; position: relative; overflow: hidden; display: flex; flex-direction: column; }
.bg-base { position: fixed; inset: 0; z-index: -4;
  background: radial-gradient(ellipse at 30% 20%, rgba(10,40,80,0.3) 0%, transparent 60%),
              linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #111d2d 100%); }
.bg-orbs { position: fixed; inset: 0; z-index: -3; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan { width: 300px; height: 300px; top: 20%; right: 10%; background: rgba(0,229,255,0.06); }
.orb-blue { width: 400px; height: 400px; bottom: 10%; left: 5%; background: rgba(74,144,217,0.05); animation-delay: -3s; }

.container { position: relative; z-index: 1; padding: 1.5rem; max-width: 640px; width: 100%; margin: 0 auto; }

.top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
.title-area { text-align: center; }
.title-area h1 { font-size: 1.4rem; color: var(--text-primary); margin: 0; }
.sub { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.15em; margin: 0.1rem 0 0; }
.btn-back { padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; font-family: inherit; }
.btn-back:hover { border-color: var(--accent); color: var(--text-primary); }
.btn-create { padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid var(--accent-cyan); color: var(--accent-cyan); font-size: 0.8rem; cursor: pointer; font-family: inherit; background: rgba(0,229,255,0.06); }
.btn-create:hover { background: rgba(0,229,255,0.15); }

.empty { text-align: center; padding: 3rem 1rem; color: var(--text-muted); }
.empty p { margin: 0.2rem; }
.empty .hint { font-size: 0.75rem; color: #2e4460; }

.list { display: flex; flex-direction: column; gap: 0.75rem; }

.world-card { padding: 0.85rem 1rem; border-radius: 12px; cursor: pointer; transition: all 0.25s; }
.world-card:hover { border-color: var(--accent-cyan); transform: translateY(-2px); box-shadow: 0 0 15px var(--accent-cyan-glow); }
.card-top { display: flex; align-items: center; gap: 0.6rem; }
.card-icon { font-size: 1.3rem; }
.card-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.card-name { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); }
.card-meta { font-size: 0.65rem; color: var(--text-muted); }
.card-time { font-size: 0.6rem; color: #3a5070; }
.card-desc { font-size: 0.7rem; color: var(--text-secondary); margin: 0.4rem 0 0; line-height: 1.4; }
.card-actions { display: flex; gap: 0.3rem; margin-top: 0.5rem; justify-content: flex-end; }
.act-enter { padding: 0.25rem 0.6rem; border-radius: 5px; background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.25); color: var(--accent-cyan); font-size: 0.7rem; cursor: pointer; font-family: inherit; }
.act-enter:hover { background: rgba(0,229,255,0.2); }
.act-delete { padding: 0.25rem 0.4rem; border: none; background: none; color: #5a3030; font-size: 0.7rem; cursor: pointer; }
.act-delete:hover { color: #e55; }
</style>
