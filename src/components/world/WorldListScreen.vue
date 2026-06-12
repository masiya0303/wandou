<!-- wandou · 世界列表 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useWorldStore } from '@/stores/worldStore'

const router = useRouter()
const game = useGameStore()
const world = useWorldStore()

async function handleEnter(id: string) {
  const ok = await game.enterWorld(id)
  if (ok) router.push({ name: 'playing', params: { id } })
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`确定删除世界「${name}」？`)) return
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
    <div class="container">
      <header class="head">
        <button class="btn-back" @click="router.push('/')">← 返回</button>
        <div class="title"><h1>🌍 我的世界</h1><p>MY WORLDS</p></div>
        <button class="btn-create" @click="handleCreate">＋ 创建</button>
      </header>
      <div v-if="world.worldList.length === 0" class="empty"><p>🌌 暂无世界</p><p class="hint">点击上方「创建」开始</p></div>
      <div v-else class="list">
        <div v-for="w in world.worldList" :key="w.id" class="card" @click="handleEnter(w.id)">
          <div class="c-top"><span class="c-icon">🌍</span><div class="c-info"><span class="c-name">{{ w.name }}</span><span class="c-meta">{{ w.characterName || '未创建角色' }} · {{ w.messageCount }} 条消息</span></div><span class="c-time">{{ fmt(w.updatedAt) }}</span></div>
          <p v-if="w.description" class="c-desc">{{ w.description.slice(0,80) }}{{ w.description.length>80?'...':'' }}</p>
          <div class="c-acts"><button class="a-enter" @click.stop="handleEnter(w.id)">进入 ▸</button><button class="a-del" @click.stop="handleDelete(w.id,w.name)">🗑️</button></div>
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
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
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
</style>
