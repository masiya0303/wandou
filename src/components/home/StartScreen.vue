<!-- wandou · 主菜单 -->
<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
function handleWorlds() { router.push('/worlds') }
function handleSettings() { router.push('/settings') }
</script>

<template>
  <div class="ss">
    <div class="bg-vignette"></div>
    <div class="bg-orbs"><div class="orb orb-cyan"></div><div class="orb orb-blue"></div></div>
    <div class="bg-particles"><span v-for="n in 20" :key="'p'+n" class="star-dot" :style="{left:((n*37+13)%100)+'%',top:((n*53+7)%100)+'%',width:(2+(n%3))+'px',height:(2+(n%3))+'px',animationDelay:(n*0.23)+'s',animationDuration:(2.5+(n%4)*1.3)+'s'}"></span></div>
    <div class="container">
      <div class="title-sec"><div class="icon-w"><span class="ring"></span><span class="ico">🌍</span></div><h1 class="t">地球online</h1><p class="st">EARTH ONLINE</p><hr class="accent-divider" /></div>
      <div class="menu">
        <button class="pb" @click="handleWorlds"><span class="pb-ico">🌍</span><div class="pb-l"><span class="pb-cn">我的世界</span><span class="pb-en">MY WORLDS</span></div><span class="pb-ar">→</span></button>
        <button class="pb" @click="handleSettings"><span class="pb-ico">⚙️</span><div class="pb-l"><span class="pb-cn">设置面板</span><span class="pb-en">SETTINGS</span></div><span class="pb-ar">→</span></button>
      </div>
      <div class="foot"><hr class="accent-divider" /><span>AI 文字冒险 · 地球online</span></div>
    </div>
  </div>
</template>

<style scoped>
.ss { height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; background: var(--theme-chat-bg, var(--theme-chat-bg)) center/cover no-repeat; }
.bg-orbs { position: fixed; inset: 0; z-index: -3; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan { width: 400px; height: 400px; top: 10%; right: 15%; background: rgba(255,128,168,0.06); }
.orb-blue { width: 500px; height: 500px; bottom: 5%; left: 10%; background: rgba(255,182,193,0.05); animation-delay: -3s; }
.bg-particles { position: fixed; inset: 0; z-index: -2; pointer-events: none; }
.star-dot { position: absolute; border-radius: 50%; background: var(--theme-text-accent); box-shadow: 0 0 6px rgba(255,128,168,0.3); animation: twinkle ease-in-out infinite; }
.container { width: 90vw; max-width: 420px; padding: 2rem 0; z-index: 1; }
.title-sec { text-align: center; margin-bottom: 2.5rem; }
.icon-w { position: relative; display: inline-block; margin-bottom: 0.3rem; }
.ico { font-size: 56px; position: relative; z-index: 1; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
.ring { position: absolute; inset: -12px; border-radius: 50%; border: 1px solid rgba(255,128,168,0.2); animation: orbit-spin 8s linear infinite; }
.t { font-size: 28px; font-weight: 700; color: #e0e8ff; margin: 0.3rem 0 0; letter-spacing: 0.05em; }
.st { font-size: 11px; color: var(--theme-border-light); margin: 0.1rem 0 0; letter-spacing: 0.2em; }
.menu { display: flex; flex-direction: column; gap: 12px; align-items: center; }
.pb { display: flex; align-items: center; gap: 12px; width: 85%; max-width: 380px; padding: 14px 20px; border-radius: 9999px; cursor: pointer; font-family: inherit; text-align: left; transition: all 0.3s; background: rgba(255,255,255,0.7); border: 1px solid var(--theme-border-ice); }
.pb:active { transform: scale(0.97); }
.pb-ico { font-size: 24px; }
.pb-ar { font-size: 16px; color: var(--theme-text-main); opacity: 0.4; }
.pb-l { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.pb-cn { font-size: 16px; font-weight: 600; color: var(--theme-text-main); }
.pb-en { font-size: 10px; color: var(--theme-text-main); opacity: 0.5; letter-spacing: 0.1em; }
.foot { text-align: center; margin-top: 2.5rem; font-size: 11px; color: var(--theme-text-main); opacity: 0.4; }
</style>
