<!-- ============================================================
 wandou v0.7.2 — 根组件
 phase: start | worldList | createWorld | worldDetail | setup | playing
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from './stores/gameStore'
import StartScreen from './components/StartScreen.vue'
import WorldListScreen from './components/WorldListScreen.vue'
import CreateWorldScreen from './components/CreateWorldScreen.vue'
import WorldDetailScreen from './components/WorldDetailScreen.vue'
import SetupScreen from './components/SetupScreen.vue'
import GameMain from './components/GameMain.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const store = useGameStore()
const showSettings = ref(false)
</script>

<template>
  <div class="app-root">
    <StartScreen v-if="store.phase === 'start'" @open-settings="showSettings = true" />
    <WorldListScreen v-else-if="store.phase === 'worldList'" />
    <CreateWorldScreen v-else-if="store.phase === 'createWorld'" />
    <WorldDetailScreen v-else-if="store.phase === 'worldDetail'" />
    <SetupScreen v-else-if="store.phase === 'setup'" />
    <GameMain v-else-if="store.phase === 'playing'" @open-settings="showSettings = true" />
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.app-root { width: 100%; min-height: 100vh; background: #0a0a1a; }
</style>
