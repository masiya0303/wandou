<!-- ============================================================
 wandou v0.3 — 豌豆星际漂流 · 输入栏
 玻璃面板 + 霓虹聚焦 + 角标 + 双语 hint
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { sound } from '../utils/sound'

const store = useGameStore()
const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function handleSubmit() {
  if (!input.value.trim() || store.isGenerating) return
  sound.send()
  store.sendMessage(input.value)
  input.value = ''
}
function handleKeydown(e: KeyboardEvent) {
  // Enter 发送 / Shift+Enter 换行 / Ctrl+Enter 也发送
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
}
function autoResize() {
  const el = textareaRef.value; if (!el) return
  el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 150) + 'px'
}
</script>

<template>
  <div class="input-area">
    <div class="input-panel glass-panel corner-deco">
      <div class="input-row">
        <textarea
          ref="textareaRef" v-model="input" class="input-field"
          placeholder="输入行动或对话... (Enter 发送 / Shift+Enter 换行)"
          rows="1" :disabled="store.isGenerating"
          @keydown="handleKeydown" @input="autoResize"
        ></textarea>

        <button class="btn-send corner-deco" :disabled="!input.trim() || store.isGenerating" @click="handleSubmit"
          :title="store.isGenerating ? '生成中...' : '发送 · SEND'">
          {{ store.isGenerating ? '⏳' : '🚀' }}
        </button>

        <button class="btn-regen" :disabled="store.isGenerating || store.messages.length < 2" @click="store.regenerate()"
          title="重新生成 · RETRY">
          🔄
        </button>
      </div>

      <div class="input-hint">
        <template v-if="store.isGenerating">
          <span class="hint-cn">豆豆正在思考...</span>
          <span class="hint-en">AI PROCESSING</span>
        </template>
        <template v-else>
          <span class="hint-cn">Enter 发送 · Shift+Enter 换行 · 🔄 重试</span>
          <span class="hint-en">SEND · NEWLINE · RETRY</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-area { padding: 0.5rem 1rem 0.75rem; flex-shrink: 0; position: relative; z-index: 2; }

.input-panel { padding: 0.6rem; border-radius: 12px; }

.input-row { display: flex; gap: 0.4rem; align-items: flex-end; }

.input-field {
  flex: 1; padding: 0.55rem 0.65rem;
  border: 1px solid var(--glass-border); border-radius: 8px;
  background: rgba(8, 16, 28, 0.7); color: var(--text-primary);
  font-size: 0.9rem; font-family: inherit; resize: none; line-height: 1.5;
  transition: border-color 0.25s, box-shadow 0.25s;
}
.input-field:focus {
  outline: none; border-color: var(--accent-cyan);
  box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.1), 0 0 18px rgba(0, 229, 255, 0.08);
}
.input-field::placeholder { color: #3a5070; }
.input-field:disabled { opacity: 0.5; }

.btn-send, .btn-regen {
  width: 38px; height: 38px; border-radius: 8px; font-size: 1.1rem;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  flex-shrink: 0; transition: all 0.2s; border: 1px solid var(--glass-border);
}
.btn-send { background: rgba(0, 229, 255, 0.1); color: #c0e8ff; }
.btn-send:hover:not(:disabled) {
  background: rgba(0, 229, 255, 0.2); border-color: var(--accent-cyan);
  box-shadow: 0 0 15px var(--accent-cyan-glow); transform: translateY(-1px);
}
.btn-send:active:not(:disabled) { animation: pulse-ring 0.4s ease-out; }
.btn-send:disabled { opacity: 0.3; cursor: not-allowed; }

.btn-regen { background: rgba(13, 27, 42, 0.8); color: var(--text-secondary); }
.btn-regen:hover:not(:disabled) { background: var(--glass-bg-hover); border-color: var(--accent); color: var(--text-primary); }
.btn-regen:disabled { opacity: 0.3; cursor: not-allowed; }

/* ===== Hint ===== */
.input-hint { margin-top: 0.35rem; display: flex; justify-content: center; gap: 0.5rem; }
.hint-cn { font-size: 0.6rem; color: #3a5070; }
.hint-en { font-size: 0.5rem; color: #2a4060; letter-spacing: 0.1em; }
</style>
