<!-- ============================================================
 wandou v0.1 — 豌豆星际漂流 · 输入栏
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
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

// 自动调整高度
function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 150) + 'px'
}
</script>

<template>
  <div class="input-bar">
    <div class="input-row">
      <textarea
        ref="textareaRef"
        v-model="input"
        class="input-field"
        placeholder="输入你的行动或对话... (Enter 发送, Shift+Enter 换行)"
        rows="1"
        :disabled="store.isGenerating"
        @keydown="handleKeydown"
        @input="autoResize"
      ></textarea>

      <button
        class="btn-send"
        :disabled="!input.trim() || store.isGenerating"
        @click="handleSubmit"
        :title="store.isGenerating ? '生成中...' : '发送'"
      >
        {{ store.isGenerating ? '⏳' : '🚀' }}
      </button>

      <button
        class="btn-regenerate"
        :disabled="store.isGenerating || store.messages.length < 2"
        @click="store.regenerate()"
        title="重新生成"
      >
        🔄
      </button>
    </div>

    <div class="input-hint">
      <span v-if="store.isGenerating">豆豆正在思考...</span>
      <span v-else>Enter 发送 · Shift+Enter 换行 · 🔄 重试</span>
    </div>
  </div>
</template>

<style scoped>
.input-bar {
  border-top: 1px solid #1e3a5f;
  padding: 0.75rem 1rem;
  background: rgba(8, 16, 28, 0.9);
}

.input-row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
}

.input-field {
  flex: 1;
  padding: 0.6rem 0.75rem;
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  background: rgba(13, 27, 42, 0.8);
  color: #d0dcf0;
  font-size: 0.9rem;
  font-family: inherit;
  resize: none;
  line-height: 1.5;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-field:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.15), 0 0 15px rgba(74, 144, 217, 0.1);
}

.input-field::placeholder {
  color: #3a5070;
}

.input-field:disabled {
  opacity: 0.5;
}

.btn-send,
.btn-regenerate {
  width: 40px;
  height: 40px;
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  background: rgba(30, 60, 100, 0.4);
  color: #8ba4c0;
  font-size: 1.1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.btn-send:hover:not(:disabled),
.btn-regenerate:hover:not(:disabled) {
  background: rgba(74, 144, 217, 0.3);
  border-color: #4a90d9;
  color: #c8dcff;
}

.btn-send:active:not(:disabled) {
  animation: pulse-ring 0.4s ease-out;
}

.btn-send:disabled,
.btn-regenerate:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.input-hint {
  margin-top: 0.35rem;
  font-size: 0.65rem;
  color: #2e4460;
  text-align: center;
}
</style>
