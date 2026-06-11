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

  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') window.dispatchEvent(new CustomEvent('wandou:esc'))
  })
}

bootstrap()
