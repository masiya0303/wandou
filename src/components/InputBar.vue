<!-- wandou · 输入栏 -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const input = ref('')

function send() {
  if (!input.value.trim() || store.isGenerating) return
  store.sendMessage(input.value)
  input.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}
</script>

<template>
  <div class="input-area">
    <div class="input-row">
      <textarea
        v-model="input" class="input"
        placeholder="输入行动或对话... (Enter 发送)"
        rows="1" :disabled="store.isGenerating"
        @keydown="onKey"
      ></textarea>

      <button class="btn btn-send" :disabled="!input.trim() || store.isGenerating" @click="send">
        发送
      </button>
      <button class="btn btn-retry" :disabled="store.isGenerating || store.messages.length < 2" @click="store.regenerate()">
        重试
      </button>
    </div>
    <div class="hint">
      {{ store.isGenerating ? '豆豆正在思考......' : 'Enter 发送 · Shift+Enter 换行' }}
    </div>
  </div>
</template>

<style scoped>
.input-area { padding: 8px 14px 12px; flex-shrink: 0; }

.input-row {
  display: flex; align-items: flex-end; gap: 6px;
  padding: 8px 12px; border-radius: 12px;
  background: rgba(12,22,38,0.6);
  border: 1px solid var(--border);
}

.input {
  flex: 1; padding: 4px 0; border: none; background: none;
  color: var(--text-primary); font-size: 14px; font-family: inherit;
  resize: none; line-height: 1.5; outline: none;
}
.input::placeholder { color: #3a5070; }
.input:disabled { opacity: 0.4; }

.btn {
  padding: 5px 12px; border-radius: 8px; cursor: pointer;
  font-size: 12px; font-family: inherit; flex-shrink: 0;
  border: 1px solid var(--border); transition: all 0.15s;
}
.btn:active:not(:disabled) { transform: scale(0.95); }
.btn:disabled { opacity: 0.3; cursor: not-allowed; }

.btn-send {
  background: rgba(34,211,238,0.12); border-color: rgba(34,211,238,0.3);
  color: var(--accent-cyan); font-weight: 600;
}
.btn-retry {
  background: rgba(12,22,38,0.6); color: var(--text-secondary);
}

.hint { text-align: center; margin-top: 4px; font-size: 11px; color: var(--text-muted); }
</style>
