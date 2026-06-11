// ============================================================
// wandou v0.6 — 豌豆星际漂流 · 入口
// 先初始化 IndexedDB，再挂载 App
// ============================================================

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import { useGameStore } from './stores/gameStore'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // 先挂载（显示 loading），再异步初始化
  app.mount('#app')

  // 异步检查 IndexedDB 存档
  const store = useGameStore()
  await store.initStore()

  // 退出前自动保存
  window.addEventListener('beforeunload', () => {
    if (store.phase === 'playing' && store.messages.length > 0) {
      store.autoSave()
    }
  })
  window.addEventListener('pagehide', () => {
    if (store.phase === 'playing' && store.messages.length > 0) {
      store.autoSave()
    }
  })
}

bootstrap()
