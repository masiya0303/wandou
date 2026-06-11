<!-- ============================================================
 wandou v0.4 — 豌豆星际漂流 · 主菜单
 纯主菜单：开始游戏 / 继续游戏 / 设置面板
============================================================ -->
<script setup lang="ts">
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const emit = defineEmits<{ openSettings: [] }>()

function handleWorlds() {
  store.phase = 'worldList'
}
</script>

<template>
  <div class="start-screen">
    <!-- Layer 1: 深空 -->
    <div class="bg-base"></div>

    <!-- Layer 2: 光球 -->
    <div class="bg-orbs">
      <div class="orb orb-cyan"></div>
      <div class="orb orb-blue"></div>
      <div class="orb orb-purple"></div>
    </div>

    <!-- Layer 3: 星点 -->
    <div class="bg-particles">
      <span v-for="n in 30" :key="'p'+n" class="star-dot" :style="{
        left: ((n * 37 + 13) % 100) + '%', top: ((n * 53 + 7) % 100) + '%',
        width: (2 + (n % 3)) + 'px', height: (2 + (n % 3)) + 'px',
        animationDelay: (n * 0.23) + 's', animationDuration: (2.5 + (n % 4) * 1.3) + 's'
      }"></span>
    </div>

    <!-- Layer 4: 浮光 -->
    <div class="floating-lights">
      <span v-for="n in 15" :key="'f'+n" class="float-light" :style="{
        left: ((n * 79 + 11) % 100) + '%',
        width: (4 + (n % 7)) + 'px', height: (4 + (n % 7)) + 'px',
        animationDelay: (n * 1.7) + 's', animationDuration: (8 + n * 1.5) + 's'
      }"></span>
    </div>

    <!-- 主内容 -->
    <div class="start-container">
      <!-- 标题 -->
      <div class="title-section">
        <div class="title-icon-wrapper">
          <span class="orbit-ring"></span>
          <span class="title-icon">🛸</span>
        </div>
        <h1 class="title glow-text">豌豆星际漂流</h1>
        <p class="subtitle">WANDOU · COSMIC DRIFTER</p>
        <hr class="cyan-divider" />
      </div>

      <!-- 菜单按钮 -->
      <div class="menu-buttons">
        <button class="menu-btn glass-panel corner-deco" @click="handleWorlds">
          <span class="btn-icon">🌍</span>
          <div class="btn-labels">
            <span class="btn-cn">我的世界</span>
            <span class="btn-en">MY WORLDS</span>
          </div>
          <span class="btn-arrow">→</span>
        </button>

        <button class="menu-btn glass-panel corner-deco" @click="emit('openSettings')">
          <span class="btn-icon">⚙️</span>
          <div class="btn-labels">
            <span class="btn-cn">设置面板</span>
            <span class="btn-en">SETTINGS</span>
          </div>
          <span class="btn-arrow">→</span>
        </button>
      </div>

      <!-- 底部 -->
      <div class="footer-info">
        <hr class="accent-divider" />
        <span>AI 驱动的星际文字冒险游戏</span>
        <span class="dot">·</span>
        <span>WANDOU v0.4</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.start-screen {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}

/* ===== 背景系统 ===== */
.bg-base { position: fixed; inset: 0; z-index: -4;
  background: radial-gradient(ellipse at 30% 20%, rgba(10, 40, 80, 0.3) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 80%, rgba(20, 10, 50, 0.25) 0%, transparent 55%),
              linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #111d2d 100%); }

.bg-orbs { position: fixed; inset: 0; z-index: -3; overflow: hidden; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan  { width: 400px; height: 400px; top: 10%; left: 15%; background: rgba(0, 229, 255, 0.12); animation-delay: 0s; }
.orb-blue  { width: 500px; height: 500px; bottom: 5%; right: 10%; background: rgba(74, 144, 217, 0.1); animation-delay: -3s; }
.orb-purple { width: 350px; height: 350px; top: 50%; left: 55%; background: rgba(130, 80, 220, 0.07); animation-delay: -5s; }

.bg-particles { position: fixed; inset: 0; z-index: -2; pointer-events: none; }
.star-dot { position: absolute; border-radius: 50%; background: var(--accent-cyan); box-shadow: 0 0 6px var(--accent-cyan-glow); animation: twinkle ease-in-out infinite; }

.floating-lights { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.float-light { position: absolute; top: -10px; border-radius: 50%; background: radial-gradient(circle, rgba(200, 230, 255, 0.7), transparent); animation: float-down linear infinite; }

/* ===== 主容器 ===== */
.start-container { width: 100%; max-width: 440px; padding: 1.5rem 2rem; z-index: 1; }

/* 标题 */
.title-section { text-align: center; margin-bottom: 2rem; }
.title-icon-wrapper { position: relative; display: inline-block; margin-bottom: 0.3rem; }
.title-icon { font-size: 3.5rem; position: relative; z-index: 1; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
.orbit-ring { position: absolute; inset: -12px; border-radius: 50%; border: 1px solid rgba(0, 229, 255, 0.2); animation: orbit-spin 8s linear infinite; }
.title { font-size: 2.2rem; font-weight: 700; color: #e0e8ff; margin: 0.3rem 0 0; letter-spacing: 0.05em; animation: glow-pulse 4s ease-in-out infinite; }
.subtitle { font-size: 0.7rem; color: #6b8db5; margin: 0.15rem 0 0; letter-spacing: 0.22em; }

/* ===== 菜单按钮 ===== */
.menu-buttons { display: flex; flex-direction: column; gap: 0.75rem; }

.menu-btn {
  display: flex; align-items: center; gap: 0.75rem;
  width: 100%; padding: 1rem 1.2rem; border-radius: 14px;
  cursor: pointer; font-family: inherit; text-align: left;
  transition: all 0.3s;
}
.menu-btn:hover:not(:disabled) {
  transform: translateY(-3px);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 20px var(--accent-cyan-glow);
}
.menu-btn.disabled, .menu-btn:disabled {
  opacity: 0.3; cursor: not-allowed;
}

.btn-icon { font-size: 1.8rem; flex-shrink: 0; width: 48px; text-align: center; }

.btn-labels { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.btn-cn { font-size: 1.05rem; font-weight: 600; color: var(--text-primary); }
.btn-en { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.12em; }
.menu-btn:hover:not(:disabled) .btn-cn { color: #e0f0ff; }
.menu-btn:hover:not(:disabled) .btn-en { color: var(--accent-cyan); }

.btn-arrow { font-size: 1.2rem; color: var(--text-muted); transition: all 0.3s; }
.menu-btn:hover:not(:disabled) .btn-arrow { color: var(--accent-cyan); transform: translateX(4px); }

/* 底部 */
.footer-info { text-align: center; margin-top: 2rem; font-size: 0.65rem; color: #405570; }
.dot { margin: 0 0.4rem; }
</style>
