<!-- ============================================================
 wandou v1.2 — 输入栏
 大圆角 + 玻璃 + SVG 图标
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const input = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)

function handleSubmit() {
  if (!input.value.trim() || store.isGenerating) return
  store.sendMessage(input.value)
  input.value = ''
}
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
}
function autoResize() {
  const el = textareaRef.value; if (!el) return
  el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}
</script>

<template>
  <div class="input-area">
    <div class="input-row glass-panel">
      <textarea
        ref="textareaRef" v-model="input" class="input-field"
        placeholder="输入行动或对话..."
        rows="1" :disabled="store.isGenerating"
        @keydown="handleKeydown" @input="autoResize"
      ></textarea>

      <button class="send-btn" :disabled="!input.trim() || store.isGenerating" @click="handleSubmit">
        <img src="/play.svg" alt="" class="s-icon" />
      </button>

      <button class="aux-btn" :disabled="store.isGenerating || store.messages.length < 2" @click="store.regenerate()">
        <img src="/new.svg" alt="" class="a-icon" />
      </button>
    </div>

    <div class="input-hint">
      <template v-if="store.isGenerating">
        <span class="hint-cn">思考中...</span><span class="hint-en">PROCESSING</span>
      </template>
      <template v-else>
        <span class="hint-cn">Enter 发送</span><span class="hint-en">·</span><span class="hint-cn">↻ 重新生成</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.input-area { padding: 0.4rem 0.8rem 0.5rem; flex-shrink: 0; position: relative; z-index: 20; }

.input-row {
  display: flex; align-items: flex-end; gap: 0.4rem;
  padding: 0.5rem 0.6rem; border-radius: var(--radius-lg);
}

.input-field {
  flex: 1; padding: 0.4rem 0;
  border: none; background: transparent; color: var(--text-primary);
  font-size: var(--font-sm); font-family: inherit; resize: none; line-height: 1.5;
  outline: none;
}
.input-field::placeholder { color: #3a5070; }
.input-field:disabled { opacity: 0.5; }

.send-btn, .aux-btn {
  width: 34px; height: 34px; border-radius: 50%; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.2s; flex-shrink: 0;
  border: 1px solid var(--glass-border); background: transparent;
}
.send-btn { background: var(--glass-bg); }
.send-btn:active:not(:disabled) { transform: scale(0.92); }
.send-btn:disabled, .aux-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.aux-btn:active:not(:disabled) { transform: scale(0.92); }

.s-icon { width: 16px; height: 16px; opacity: 0.7; }
.a-icon { width: 14px; height: 14px; opacity: 0.5; }

.input-hint { display: flex; justify-content: center; gap: 0.4rem; margin-top: 0.3rem; }
.hint-cn { font-size: var(--font-xs); color: #2e4460; }
.hint-en { font-size: var(--font-xs); color: #2a4060; letter-spacing: 0.08em; }
</style>
