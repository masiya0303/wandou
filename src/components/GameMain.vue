<!-- ============================================================
 wandou v0.1 — 豌豆星际漂流 · 游戏主界面
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import ChatPanel from './ChatPanel.vue'
import InputBar from './InputBar.vue'
import SettingsPanel from './SettingsPanel.vue'

const store = useGameStore()
const showSettings = ref(false)
</script>

<template>
  <div class="game-main">
    <!-- 粒子背景 -->
    <div class="particles-bg">
      <span v-for="n in 8" :key="n" class="particle" :style="{ left: `${n * 13 + 5}%`, animationDelay: `${n * 1.2}s`, animationDuration: `${8 + n * 2}s` }"></span>
    </div>

    <!-- 顶部栏 -->
    <header class="top-bar">
      <div class="scanline"></div>
      <div class="top-left">
        <span class="logo">🛸 豌豆号</span>
        <span class="ship-status" title="飞船状态">🟢 系统正常</span>
      </div>
      <div class="top-center">
        <span class="location">📍 开普勒-186f 星系</span>
      </div>
      <div class="top-right">
        <span class="char-name">👨‍🚀 {{ store.character.name || '舰长' }}</span>
        <button
          class="btn-icon"
          title="设置"
          @click="showSettings = true"
        >
          ⚙️
        </button>
        <button
          class="btn-icon"
          title="返回主菜单"
          @click="store.phase = 'start'; store.resetGame()"
        >
          🏠
        </button>
      </div>
    </header>

    <!-- 聊天区域 -->
    <ChatPanel />

    <!-- 输入区域 -->
    <InputBar />

    <!-- 设置面板 -->
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.game-main {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(20, 60, 100, 0.15) 0%, transparent 60%),
    linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #0f1d2d 100%);
  position: relative;
  overflow: hidden;
}

/* 粒子背景 */
.particles-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.particle {
  position: absolute;
  bottom: -4px;
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: rgba(74, 144, 217, 0.5);
  animation: float-particle linear infinite;
}

/* 顶部栏 */
.top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background: rgba(8, 16, 28, 0.95);
  border-bottom: 1px solid #1e3a5f;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
  overflow: hidden;
}

.scanline {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 60%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(74, 144, 217, 0.6), transparent);
  animation: scan-line 4s linear infinite;
}

.top-left,
.top-center,
.top-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.logo {
  font-weight: 700;
  color: #90b8e0;
  font-size: 0.9rem;
}

.ship-status {
  font-size: 0.7rem;
  color: #40a060;
}

.location {
  font-size: 0.75rem;
  color: #6b8db5;
}

.char-name {
  font-size: 0.8rem;
  color: #8ba4c0;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  background: rgba(13, 27, 42, 0.8);
  color: #8ba4c0;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-icon:hover {
  background: rgba(30, 60, 100, 0.4);
  border-color: #4a90d9;
  color: #c8dcff;
}
</style>
