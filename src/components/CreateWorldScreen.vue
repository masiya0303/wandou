<!-- ============================================================
 wandou v0.7 — 创建世界页
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const name = ref('')
const description = ref('')
const error = ref('')

async function handleCreate() {
  error.value = ''
  if (!name.value.trim()) { error.value = '请输入世界名称'; return }
  if (!description.value.trim()) { error.value = '请输入世界描述'; return }
  await store.createWorld(name.value.trim(), description.value.trim())
  store.phase = 'setup'
}

function handleBack() { store.phase = 'worldList' }
</script>

<template>
  <div class="screen">
    <div class="bg-base"></div>
    <div class="bg-orbs"><div class="orb orb-cyan"></div><div class="orb orb-blue"></div></div>

    <div class="container">
      <header class="top-row">
        <button class="btn-back glass-panel" @click="handleBack">← 返回</button>
        <div class="title-area">
          <h1>🪐 创建新世界</h1>
          <p class="sub">NEW WORLD</p>
        </div>
        <span></span>
      </header>

      <div class="form-card glass-panel corner-deco">
        <div class="form-group">
          <label class="form-label">🌍 世界名称 <span class="l-en">WORLD NAME</span></label>
          <input v-model="name" type="text" class="form-input" placeholder="例如：赛博边缘 2077" @keydown.enter="handleCreate" />
        </div>
        <div class="form-group">
          <label class="form-label">📝 世界描述 <span class="l-en">DESCRIPTION</span></label>
          <textarea v-model="description" class="form-input form-textarea" placeholder="描述这个世界的背景、科技水平、势力格局...&#10;&#10;例如：公元 2077 年，巨型企业掌控了一切。夜之城是最后一块自由之地，也是世界上最危险的城市。玩家是一名街头佣兵，在霓虹灯下挣扎求生。" rows="6"></textarea>
        </div>
        <p v-if="error" class="error-msg">{{ error }}</p>
        <button class="btn-create-world corner-deco" @click="handleCreate">
          <span class="btn-cn">✨ 创建世界</span>
          <span class="btn-en">CREATE WORLD</span>
        </button>
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
.orb-cyan { width: 300px; height: 300px; top: 15%; right: 10%; background: rgba(0,229,255,0.06); }
.orb-blue { width: 350px; height: 350px; bottom: 10%; left: 5%; background: rgba(74,144,217,0.05); animation-delay: -3s; }

.container { position: relative; z-index: 1; padding: 1.5rem; max-width: 520px; width: 100%; margin: 0 auto; }
.top-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.2rem; }
.title-area { text-align: center; }
.title-area h1 { font-size: 1.4rem; color: var(--text-primary); margin: 0; }
.sub { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.15em; margin: 0.1rem 0 0; }
.btn-back { padding: 0.4rem 0.8rem; border-radius: 8px; border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; font-family: inherit; }
.btn-back:hover { border-color: var(--accent); color: var(--text-primary); }

.form-card { padding: 1.5rem; border-radius: 14px; }
.form-group { margin-bottom: 1rem; }
.form-label { display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.3rem; font-weight: 500; }
.l-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; margin-left: 0.25rem; }
.form-input { width: 100%; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 6px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.88rem; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
.form-input:focus { outline: none; border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(0,229,255,0.1), 0 0 10px rgba(0,229,255,0.06); }
.form-textarea { resize: vertical; min-height: 100px; }
.error-msg { color: #e05555; font-size: 0.78rem; text-align: center; margin: 0.3rem 0; }

.btn-create-world { width: 100%; padding: 0.7rem; border: 1px solid var(--accent-cyan); border-radius: 10px; background: rgba(0,229,255,0.08); color: #e0f0ff; font-size: 1rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.3s; display: flex; flex-direction: column; align-items: center; gap: 0.1rem; }
.btn-create-world:hover { background: rgba(0,229,255,0.15); border-color: var(--accent-cyan); box-shadow: 0 0 25px var(--accent-cyan-glow); transform: translateY(-2px); }
.btn-cn { font-size: 0.95rem; }
.btn-en { font-size: 0.55rem; letter-spacing: 0.15em; color: var(--accent-cyan); }
</style>
