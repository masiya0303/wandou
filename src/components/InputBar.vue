<!-- wandou · 输入栏 — yijiekkk 风格 -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const input = ref('')
const ta = ref<HTMLTextAreaElement | null>(null)

function send() { if (!input.value.trim() || store.isGenerating) return; store.sendMessage(input.value); input.value = '' }
function onKey(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }
function autoResize() { const el = ta.value; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px' }
</script>

<template>
  <div class="input-area">
    <div class="input-row">
      <textarea ref="ta" v-model="input" class="input" placeholder="输入行动或对话... (Enter 发送)" rows="1" :disabled="store.isGenerating" @keydown="onKey" @input="autoResize"></textarea>
      <button class="send-btn" :disabled="!input.trim() || store.isGenerating" @click="send">
        {{ store.isGenerating ? '⏳' : '发送' }}
      </button>
    </div>
    <div class="hint">{{ store.isGenerating ? '乌拉正在思考......' : 'Enter 发送 · Shift+Enter 换行' }}</div>
  </div>
</template>

<style scoped>
.input-area { padding: 8px 20px 12px; flex-shrink: 0; }
.input-row { display: flex; align-items: flex-end; gap: 8px; padding: 6px 8px; border-radius: 8px; background: rgba(255,255,255,0.7); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 2px 12px rgba(0,0,0,0.06); transition: all 0.3s; }
.input-row:focus-within { background: rgba(255,255,255,0.85); border-color: var(--accent-cyan); box-shadow: 0 2px 16px rgba(0,0,0,0.1), 0 0 10px rgba(34,211,238,0.15); }
.input { flex: 1; padding: 6px 4px; height: 36px; min-height: 36px; border: none; background: none; color: #1a2a3a; font-size: 14px; font-family: inherit; resize: none; line-height: 1.5; outline: none; }
.input::placeholder { color: #8a9ab0; font-style: italic; }
.input:disabled { opacity: 0.4; }
.send-btn { width: 48px; height: 36px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: var(--accent-cyan); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit; transition: all 0.2s; }
.send-btn:active:not(:disabled) { background: #0cc0d8; transform: scale(0.96); }
.send-btn:disabled { background: rgba(34,211,238,0.2); color: rgba(255,255,255,0.3); cursor: not-allowed; }
.hint { text-align: center; margin-top: 4px; font-size: 10px; color: rgba(0,0,0,0.3); }
</style>
