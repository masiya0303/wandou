<!-- wandou · 世界列表 -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const emit = defineEmits<{ back: [] }>()

async function handleEnter(id: string) {
  const ok = await store.openWorldDetailFromList(id)
  if (ok && store.character.name) { store.phase = 'playing' }
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`确定删除世界「${name}」？`)) return
  await store.deleteWorld(id)
}

async function handleCreate() {
  await store.createWorld('新世界', '')
  store.phase = 'worldDetail'
}

function fmt(ts: number) { return new Date(ts).toLocaleDateString('zh-CN', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) }
</script>

<template>
  <div class="screen">
    <div class="bg-base"></div>
    <div class="bg-orbs"><div class="orb orb-cyan"></div><div class="orb orb-blue"></div></div>

    <div class="container">
      <header class="head">
        <button class="btn-back" @click="emit('back')">← 返回</button>
        <div class="title"><h1>🌍 我的世界</h1><p>MY WORLDS</p></div>
        <button class="btn-create" @click="handleCreate">＋ 创建</button>
      </header>

      <div v-if="store.worldList.length === 0" class="empty">
        <p>🌌 暂无世界</p>
        <p class="hint">点击上方「创建」开始</p>
      </div>

      <div v-else class="list">
        <div v-for="w in store.worldList" :key="w.id" class="card glass-panel corner-deco" @click="handleEnter(w.id)">
          <div class="c-top">
            <span class="c-icon">🌍</span>
            <div class="c-info">
              <span class="c-name">{{ w.name }}</span>
              <span class="c-meta">{{ w.characterName || '未创建角色' }} · {{ w.messageCount }} 条消息</span>
            </div>
            <span class="c-time">{{ fmt(w.updatedAt) }}</span>
          </div>
          <p v-if="w.description" class="c-desc">{{ w.description.slice(0, 80) }}{{ w.description.length > 80 ? '...' : '' }}</p>
          <div class="c-acts">
            <button class="a-enter" @click.stop="handleEnter(w.id)">进入 ▸</button>
            <button class="a-del" @click.stop="handleDelete(w.id, w.name)">🗑️</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen { min-height: 100vh; position: relative; overflow: hidden; display: flex; flex-direction: column; }
.bg-base { position: fixed; inset: 0; z-index: -4; background: rgba(8,14,24,0.5); }
.bg-orbs { position: fixed; inset: 0; z-index: -3; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan { width: 300px; height: 300px; top: 20%; right: 10%; background: rgba(0,229,255,0.06); }
.orb-blue { width: 400px; height: 400px; bottom: 10%; left: 5%; background: rgba(74,144,217,0.05); animation-delay: -3s; }

.container { position: relative; z-index: 1; padding: 20px; max-width: 640px; width: 100%; margin: 0 auto; }

.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
.title { text-align: center; }
.title h1 { font-size: 22px; color: var(--text-primary); margin: 0; font-weight: 700; }
.title p { font-size: 10px; color: var(--text-muted); letter-spacing: 0.15em; margin: 2px 0 0; }
.btn-back { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.btn-back:active { border-color: var(--accent); color: var(--text-primary); }
.btn-create { padding: 6px 14px; border-radius: 8px; border: 1px solid var(--accent-cyan); background: var(--glass-bg); color: var(--accent-cyan); font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.btn-create:active { background: rgba(0,229,255,0.15); }

.empty { text-align: center; padding: 48px 16px; color: var(--text-muted); }
.empty p { margin: 2px; }
.empty .hint { font-size: 12px; color: var(--text-muted); }

.list { display: flex; flex-direction: column; gap: 12px; }
.card { padding: 14px 16px; border-radius: 12px; cursor: pointer; transition: all 0.25s; }
.card:active { border-color: var(--accent-cyan); transform: translateY(-2px); box-shadow: 0 0 15px var(--accent-cyan-glow); }
.c-top { display: flex; align-items: center; gap: 10px; }
.c-icon { font-size: 22px; }
.c-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.c-name { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.c-meta { font-size: 11px; color: var(--text-muted); }
.c-time { font-size: 10px; color: var(--text-muted); }
.c-desc { font-size: 12px; color: var(--text-secondary); margin: 6px 0 0; line-height: 1.4; }
.c-acts { display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end; }
.a-enter { padding: 4px 10px; border-radius: 5px; background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.25); color: var(--accent-cyan); font-size: 12px; cursor: pointer; font-family: inherit; }
.a-enter:active { background: rgba(0,229,255,0.2); }
.a-del { padding: 4px 6px; border: none; background: none; color: #5a3030; font-size: 12px; cursor: pointer; }
.a-del:active { color: #e55; }
</style>
