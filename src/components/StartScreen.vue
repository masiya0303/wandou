<!-- ============================================================
 wandou v1.2 — 主菜单
 对齐 mimi: 药丸按钮 + SVG图标 + 紫色高亮 + 扫描线
============================================================ -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const emit = defineEmits<{ openSettings: [] }>()

function handleWorlds() { store.phase = 'worldList' }
function handleSettings() { emit('openSettings') }
</script>

<template>
  <div class="start-screen">
    <div class="scanline-overlay"></div>

    <div class="bg-base"></div>
    <div class="bg-orbs">
      <div class="orb orb-cyan"></div>
      <div class="orb orb-blue"></div>
    </div>
    <div class="bg-particles">
      <span v-for="n in 20" :key="'p'+n" class="star-dot" :style="{
        left: ((n*37+13)%100)+'%', top: ((n*53+7)%100)+'%',
        width: (2+(n%3))+'px', height: (2+(n%3))+'px',
        animationDelay: (n*0.23)+'s', animationDuration: (2.5+(n%4)*1.3)+'s'
      }"></span>
    </div>

    <div class="start-container">
      <div class="title-section">
        <div class="title-icon-wrapper">
          <span class="orbit-ring"></span>
          <span class="title-icon">🛸</span>
        </div>
        <h1 class="title glow-text">豌豆星际漂流</h1>
        <p class="subtitle">WANDOU · COSMIC DRIFTER</p>
        <hr class="cyan-divider" />
      </div>

      <div class="menu-list">
        <button class="pill-btn glass-panel" @click="handleWorlds">
          <img src="/world.svg" alt="" class="pill-icon" />
          <div class="pill-labels">
            <span class="pill-cn">我的世界</span>
            <span class="pill-en">MY WORLDS</span>
          </div>
          <img src="/forward.svg" alt="" class="pill-arrow" />
        </button>

        <button class="pill-btn glass-panel" @click="handleSettings">
          <img src="/search.svg" alt="" class="pill-icon" />
          <div class="pill-labels">
            <span class="pill-cn">设置面板</span>
            <span class="pill-en">SETTINGS</span>
          </div>
          <img src="/forward.svg" alt="" class="pill-arrow" />
        </button>
      </div>

      <div class="footer-info">
        <hr class="accent-divider" />
        <span>AI 驱动的星际文字冒险游戏</span>
        <span class="dot">·</span>
        <span>WANDOU v1.2</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.start-screen {
  height: 100vh; display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}

.bg-base { position: fixed; inset: 0; z-index: -4;
  background: radial-gradient(ellipse at 30% 20%, rgba(10,40,80,0.3) 0%, transparent 60%),
              linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #111d2d 100%); }

.bg-orbs { position: fixed; inset: 0; z-index: -3; pointer-events: none; overflow: hidden; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan  { width: 400px; height: 400px; top: 10%; right: 15%; background: rgba(0,229,255,0.08); }
.orb-blue  { width: 500px; height: 500px; bottom: 5%; left: 10%; background: rgba(74,144,217,0.07); animation-delay: -3s; }

.bg-particles { position: fixed; inset: 0; z-index: -2; pointer-events: none; }
.star-dot { position: absolute; border-radius: 50%; background: var(--accent-cyan); box-shadow: 0 0 6px var(--accent-cyan-glow); animation: twinkle ease-in-out infinite; }

.start-container { width: 90vw; max-width: 440px; padding: 2rem 0; z-index: 1; }

.title-section { text-align: center; margin-bottom: 2.5rem; }
.title-icon-wrapper { position: relative; display: inline-block; margin-bottom: 0.3rem; }
.title-icon { font-size: 3.5rem; position: relative; z-index: 1; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
.orbit-ring {
  position: absolute; inset: -12px; border-radius: 50%;
  border: 1px solid rgba(0,229,255,0.15); animation: orbit-spin 8s linear infinite;
}
.title { font-size: var(--font-lg); font-weight: 700; color: #e0e8ff; margin: 0.3rem 0 0; letter-spacing: 0.05em; animation: glow-pulse 4s ease-in-out infinite; }
.subtitle { font-size: var(--font-xs); color: #6b8db5; margin: 0.1rem 0 0; letter-spacing: 0.2em; }

/* ===== 药丸按钮 ===== */
.menu-list { display: flex; flex-direction: column; gap: var(--space-xs); align-items: center; }

.pill-btn {
  display: flex; align-items: center; gap: 0.6rem;
  width: 85%; max-width: 380px; padding: 0.7rem 1.2rem;
  border-radius: var(--radius-pill); cursor: pointer; font-family: inherit;
  text-align: left; transition: all 0.3s;
}
.pill-btn:active { transform: scale(0.97); }

.pill-icon { width: 22px; height: 22px; flex-shrink: 0; opacity: 0.8; }
.pill-arrow { width: 16px; height: 16px; flex-shrink: 0; opacity: 0.35; transition: all 0.3s; }

.pill-labels { flex: 1; display: flex; flex-direction: column; gap: 0.05rem; }
.pill-cn { font-size: var(--font-sm); font-weight: 600; color: var(--text-primary); }
.pill-en { font-size: var(--font-xs); color: var(--text-muted); letter-spacing: 0.1em; }

.footer-info { text-align: center; margin-top: 2.5rem; font-size: var(--font-xs); color: #405570; }
.dot { margin: 0 0.4rem; }
</style>
