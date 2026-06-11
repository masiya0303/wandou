<!-- ============================================================
 wandou v0.3 — 豌豆星际漂流 · 游戏主界面
 顶栏角标 + 双语标签 + 信号指示器 + 粒子背景
============================================================ -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'
import ChatPanel from './ChatPanel.vue'
import InputBar from './InputBar.vue'

const store = useGameStore()
const emit = defineEmits<{ openSettings: [] }>()
</script>

<template>
  <div class="game-main">
    <!-- 粒子背景 -->
    <div class="particles-bg">
      <span v-for="n in 10" :key="n" class="particle" :style="{
        left: `${n * 10 + 3}%`,
        animationDelay: `${n * 1.4}s`,
        animationDuration: `${10 + n * 2.5}s`
      }"></span>
    </div>

    <!-- 顶部栏 -->
    <header class="top-bar corner-deco">
      <div class="scanline"></div>

      <div class="top-left">
        <span class="logo-cn">🛸 豌豆号</span>
        <span class="logo-en">PEA-1</span>
      </div>

      <div class="top-center">
        <span class="signal-dot" title="通讯信号"></span>
        <span class="location-cn">📍 开普勒-186f 星系</span>
        <span class="location-en">KEPLER-186F · OUTER RIM</span>
      </div>

      <div class="top-right">
        <span class="crew-label">
          <span class="crew-cn">👨‍🚀 {{ store.character.name || '舰长' }}</span>
          <span class="crew-en">CAPTAIN</span>
        </span>
        <button class="btn-icon glass-panel" title="世界管理 · WORLD" @click="store.openWorldDetail(store.currentWorldId!)">📋</button>
        <button class="btn-icon glass-panel" title="设置 · SETTINGS" @click="emit('openSettings')">⚙️</button>
        <button class="btn-icon glass-panel" title="返回主菜单 · HOME" @click="store.phase = 'start'">🏠</button>
      </div>
    </header>

    <!-- 聊天区域 -->
    <ChatPanel />

    <!-- 输入区域 -->
    <InputBar />

  </div>
</template>

<style scoped>
.game-main {
  display: flex; flex-direction: column; height: 100vh;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(20, 60, 100, 0.12) 0%, transparent 60%),
    linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #0f1d2d 100%);
  position: relative; overflow: hidden;
}

/* 粒子背景 */
.particles-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
.particle {
  position: absolute; bottom: -4px; width: 2px; height: 2px; border-radius: 50%;
  background: rgba(74, 144, 217, 0.4);
  animation: float-particle linear infinite;
}

/* 顶部栏 */
.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.45rem 1rem; background: rgba(8, 16, 28, 0.95);
  border-bottom: 1px solid var(--glass-border);
  flex-shrink: 0; position: relative; z-index: 2; overflow: visible;
}

.scanline {
  position: absolute; bottom: 0; left: 0; width: 60%; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(0, 229, 255, 0.5), transparent);
  animation: scan-line 4s linear infinite;
}

.top-left, .top-center, .top-right {
  display: flex; align-items: center; gap: 0.5rem;
}

.logo-cn { font-weight: 700; color: #90b8e0; font-size: 0.9rem; }
.logo-en { font-size: 0.55rem; color: var(--accent-cyan); letter-spacing: 0.15em; background: rgba(0,229,255,0.08); padding: 0.1rem 0.4rem; border-radius: 3px; }

/* 信号指示器 */
.signal-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #40a060;
  animation: signal-pulse 2s ease-in-out infinite;
}

.location-cn { font-size: 0.75rem; color: var(--text-secondary); }
.location-en { font-size: 0.55rem; color: var(--text-muted); letter-spacing: 0.1em; }

.crew-label { display: flex; flex-direction: column; align-items: flex-end; gap: 0.05rem; }
.crew-cn { font-size: 0.8rem; color: var(--text-secondary); }
.crew-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.12em; }

.btn-icon {
  width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--glass-border);
  color: var(--text-secondary); font-size: 1rem; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.btn-icon:hover { background: var(--glass-bg-hover); border-color: var(--accent-cyan); color: var(--text-primary); transform: translateY(-1px); }
</style>
