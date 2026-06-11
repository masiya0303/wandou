<!-- ============================================================
 wandou v1.2 — 游戏主界面
 扫描线 + 顶栏 + 聊天 + 输入 + 浮球导航
============================================================ -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'
import ChatPanel from './ChatPanel.vue'
import InputBar from './InputBar.vue'
import GameHud from './GameHud.vue'

const store = useGameStore()
const emit = defineEmits<{ openSettings: [] }>()

async function goHome() { await store.autoSave(); store.phase = 'start' }
</script>

<template>
  <div class="game-main">
    <div class="scanline-overlay"></div>

    <header class="top-bar glass-panel">
      <div class="top-left">
        <img src="/home.svg" alt="" class="h-icon" @click="goHome()" />
        <span class="logo-cn">{{ store.worldName || '豌豆号' }}</span>
      </div>
      <div class="top-right">
        <img src="/world.svg" alt="" class="h-icon" @click="store.goToWorldDetail()" title="世界管理" />
        <img src="/search.svg" alt="" class="h-icon" @click="emit('openSettings')" title="设置" />
      </div>
    </header>

    <ChatPanel />
    <InputBar />
    <GameHud />
  </div>
</template>

<style scoped>
.game-main {
  display: flex; flex-direction: column; height: 100vh;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(20,60,100,0.12) 0%, transparent 60%),
    linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #0f1d2d 100%);
  position: relative; overflow: hidden;
}

.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 0.8rem; border-radius: 0; z-index: 20; flex-shrink: 0;
  border-left: none; border-right: none; border-top: none;
}
.top-left, .top-right { display: flex; align-items: center; gap: 0.5rem; }
.logo-cn { font-size: var(--font-sm); font-weight: 700; color: #90b8e0; }
.h-icon { width: 22px; height: 22px; opacity: 0.6; cursor: pointer; transition: opacity 0.2s; }
.h-icon:active { opacity: 1; transform: scale(0.92); }
</style>
