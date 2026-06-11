<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useGameStore } from './stores/gameStore'
import { sound } from './utils/sound'
import StartScreen from './components/StartScreen.vue'
import WorldListScreen from './components/WorldListScreen.vue'
import WorldDetailScreen from './components/WorldDetailScreen.vue'
import GameMain from './components/GameMain.vue'
import SettingsPanel from './components/SettingsPanel.vue'

const store = useGameStore()
const showSettings = ref(false)

function onEsc() { if (showSettings.value) { showSettings.value = false; sound.toggle() } }
onMounted(() => window.addEventListener('wandou:esc', onEsc))
onUnmounted(() => window.removeEventListener('wandou:esc', onEsc))
</script>

<template>
  <div class="app-root">
    <StartScreen v-if="store.phase === 'start'" @open-settings="showSettings = true" />
    <WorldListScreen v-else-if="store.phase === 'worldList'" @back="store.phase = 'start'" />
    <WorldDetailScreen v-else-if="store.phase === 'worldDetail'" />
    <GameMain v-else-if="store.phase === 'playing'" @open-settings="showSettings = true" />
    <SettingsPanel v-if="showSettings" @close="showSettings = false" />
  </div>
</template>

<style scoped>
.app-root { width: 100%; min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); }
</style>
