<!-- ============================================================
 wandou v0.1 — 豌豆星际漂流 · 根组件
 视图切换：start | setup | playing
============================================================ -->
<script setup lang="ts">
import { useGameStore } from './stores/gameStore'
import StartScreen from './components/StartScreen.vue'
import GameMain from './components/GameMain.vue'

const store = useGameStore()
</script>

<template>
  <div class="app-root">
    <!-- 开始画面 / 设置画面 -->
    <StartScreen v-if="store.phase !== 'playing'" />

    <!-- 游戏主界面 -->
    <GameMain v-else />
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  min-height: 100vh;
  background: #0a0a1a;
}
</style>
