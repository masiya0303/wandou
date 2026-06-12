// wandou · 入口
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { useGameStore } from '@/stores/gameStore'
import { useExtensionStore } from '@/stores/extensionStore'
import { loadAllEnabled } from '@/utils/extensionEngine'
import { bus } from '@/utils/events'

function bootstrap() {
  try {
    const app = createApp(App)
    const pinia = createPinia()
    app.use(pinia)
    app.use(router)

    // 先初始化 store（主题、世界列表等），再挂载——避免首帧闪变
    const store = useGameStore()
    store.initStore()

    // 扩展系统：首次自动安装预装，然后加载所有已启用
    const extStore = useExtensionStore()
    extStore.installBundled()
    loadAllEnabled(extStore.installed)

    // 一切就绪后再渲染
    app.mount('#app')

    bus.emit('init:done')

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') window.dispatchEvent(new CustomEvent('wandou:esc'))
    })
  } catch (err) {
    console.error('[wandou] 启动失败:', err)
  }
}

bootstrap()
