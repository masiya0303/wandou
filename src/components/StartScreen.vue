<!-- wandou · 主菜单 -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const emit = defineEmits<{ openSettings: [] }>()

function handleWorlds() { store.phase = 'worldList' }
function handleSettings() { emit('openSettings') }
</script>

<template>
  <div class="start-screen">
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
        <hr class="accent-divider" />
      </div>

      <div class="menu-list">
        <button class="pill-btn" @click="handleWorlds">
          <span class="pill-ico">🌍</span>
          <div class="pill-labels">
            <span class="pill-cn">我的世界</span>
            <span class="pill-en">MY WORLDS</span>
          </div>
          <span class="pill-arrow">→</span>
        </button>

        <button class="pill-btn" @click="handleSettings">
          <span class="pill-ico">⚙️</span>
          <div class="pill-labels">
            <span class="pill-cn">设置面板</span>
            <span class="pill-en">SETTINGS</span>
          </div>
          <span class="pill-arrow">→</span>
        </button>
      </div>

      <div class="footer-info">
        <hr class="accent-divider" />
        <span>AI 文字冒险 · WANDOU v1.3</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.start-screen { height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.bg-base { position: fixed; inset: 0; z-index: -4; background: rgba(8,14,24,0.5); }
.bg-orbs { position: fixed; inset: 0; z-index: -3; pointer-events: none; overflow: hidden; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan  { width: 400px; height: 400px; top: 10%; right: 15%; background: rgba(0,229,255,0.08); }
.orb-blue  { width: 500px; height: 500px; bottom: 5%; left: 10%; background: rgba(74,144,217,0.07); animation-delay: -3s; }
.bg-particles { position: fixed; inset: 0; z-index: -2; pointer-events: none; }
.star-dot { position: absolute; border-radius: 50%; background: var(--accent-cyan); box-shadow: 0 0 6px var(--accent-cyan-glow); animation: twinkle ease-in-out infinite; }

.start-container { width: 90vw; max-width: 420px; padding: 2rem 0; z-index: 1; }
.title-section { text-align: center; margin-bottom: 2.5rem; }
.title-icon-wrapper { position: relative; display: inline-block; margin-bottom: 0.3rem; }
.title-icon { font-size: 56px; position: relative; z-index: 1; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
.orbit-ring { position: absolute; inset: -12px; border-radius: 50%; border: 1px solid rgba(0,229,255,0.15); animation: orbit-spin 8s linear infinite; }
.title { font-size: 28px; font-weight: 700; color: #e0e8ff; margin: 0.3rem 0 0; letter-spacing: 0.05em; animation: glow-pulse 4s ease-in-out infinite; }
.subtitle { font-size: 11px; color: #6b8db5; margin: 0.1rem 0 0; letter-spacing: 0.2em; }

.menu-list { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.pill-btn {
  display: flex; align-items: center; gap: 12px;
  width: 85%; max-width: 380px; padding: 14px 20px;
  border-radius: 9999px; cursor: pointer; font-family: inherit;
  text-align: left; transition: all 0.3s;
  background: var(--glass-bg); border: 1px solid var(--glass-border);
}
.pill-btn:active { transform: scale(0.97); }
.pill-ico { font-size: 24px; flex-shrink: 0; }
.pill-arrow { font-size: 16px; flex-shrink: 0; color: var(--text-muted); transition: all 0.3s; }
.pill-labels { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.pill-cn { font-size: 16px; font-weight: 600; color: var(--text-primary); }
.pill-en { font-size: 10px; color: var(--text-muted); letter-spacing: 0.1em; }

.footer-info { text-align: center; margin-top: 2.5rem; font-size: 11px; color: #405570; }
</style>
