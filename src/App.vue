<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

function onEsc() {
  if (router.currentRoute.value.name === 'settings') {
    router.back()
  }
}

onMounted(() => window.addEventListener('wandou:esc', onEsc))
onUnmounted(() => window.removeEventListener('wandou:esc', onEsc))
</script>

<template>
  <div class="app-root">
    <RouterView />
  </div>
</template>

<style scoped>
.app-root { width: 100%; min-height: 100vh; color: var(--text-primary); }
</style>
