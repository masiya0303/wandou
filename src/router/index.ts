// wandou · 路由
import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/components/home/StartScreen.vue'),
    },
    {
      path: '/worlds',
      name: 'worldList',
      component: () => import('@/components/world/WorldListScreen.vue'),
    },
    {
      path: '/world/:id',
      name: 'worldDetail',
      component: () => import('@/components/world/WorldDetailScreen.vue'),
      props: true,
    },
    {
      path: '/play/:id',
      name: 'playing',
      component: () => import('@/components/game/GameMain.vue'),
      props: true,
    },
    {
      path: '/settings/:section?',
      name: 'settings',
      component: () => import('@/components/settings/SettingsPanel.vue'),
      props: true,
    },
  ],
})

export default router
