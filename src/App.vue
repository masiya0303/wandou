<!-- ============================================================
 wandou v0.4 — 豌豆星际漂流 · 根组件
 视图路由：start | setup | playing
 SettingsPanel 全局可打开
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from './stores/gameStore'
import StartScreen from './components/StartScreen.vue'
import SetupScreen from './components/SetupScreen.vue'
import GameMain from './components/GameMain.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const store = useGameStore()
const showSettings = ref(false)
</script>

<template>
  <div class="app-root">
    <!-- 主菜单 -->
    <StartScreen v-if="store.phase === 'start'" @open-settings="showSettings = true" />

    <!-- 启程准备 -->
    <SetupScreen v-else-if="store.phase === 'setup'" />

    <!-- 游戏主界面 -->
    <GameMain v-else @open-settings="showSettings = true" />

    <!-- 全局设置面板 -->
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  min-height: 100vh;
  background: #0a0a1a;
}
</style>
