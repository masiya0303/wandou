// wandou · 入口
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
import { useGameStore } from './stores/gameStore'

async function bootstrap() {
  const app = createApp(App)
  app.use(createPinia())
  app.mount('#app')

  const store = useGameStore()
  await store.initStore()

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') window.dispatchEvent(new CustomEvent('wandou:esc'))
  })
}

bootstrap()
