<!-- wandou · 输入栏 — 粉色主题 + 斜杠命令 -->
<script setup lang="ts">
import { ref } from 'vue'
import { useChatStore } from '@/stores/chatStore'
import { runCommand } from '@/utils/commands'

const chat = useChatStore()
const input = ref('')
const ta = ref<HTMLTextAreaElement | null>(null)
const cmdFeedback = ref('')
let fbTimer: ReturnType<typeof setTimeout> | null = null

function showFeedback(text: string) {
  cmdFeedback.value = text
  if (fbTimer) clearTimeout(fbTimer)
  fbTimer = setTimeout(() => cmdFeedback.value = '', 3000)
}

function send() {
  const text = input.value.trim()
  if (!text || chat.isGenerating) return

  // 斜杠命令
  if (text.startsWith('/')) {
    const { handled, feedback } = runCommand(text)
    if (handled) {
      input.value = ''
      if (feedback) showFeedback(feedback)
      return
    }
  }

  chat.sendMessage(input.value)
  input.value = ''
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

function autoResize() {
  const el = ta.value; if (!el) return
  el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'
}
</script>

<template>
  <div class="input-area">
    <div class="input-row">
      <textarea ref="ta" v-model="input" class="input" placeholder="输入行动或对话，/help 查看命令..." rows="1" :disabled="chat.isGenerating" @keydown="onKey" @input="autoResize"></textarea>
      <button v-if="chat.isGenerating" class="stop-btn" @click="chat.stopGeneration()">⏹ 停止</button>
      <button v-else class="send-btn" :disabled="!input.trim()" @click="send">发送</button>
    </div>
    <div v-if="cmdFeedback" class="cmd-fb">{{ cmdFeedback }}</div>
    <div v-else class="hint">{{ chat.isGenerating ? '乌拉正在思考......' : 'Enter 发送 · Shift+Enter 换行 · /help 命令' }}</div>
  </div>
</template>

<style scoped>
.input-area { padding: 8px 20px 12px; flex-shrink: 0; }

.input-row {
  display: flex; align-items: flex-end; gap: 8px; padding: 6px 12px; border-radius: 15px;
  background: var(--theme-input-bg);
  border: 4px solid var(--theme-border-ice);
  border-left: none; border-top: none;
  border-right: 4px solid var(--theme-border-light);
  box-shadow: 0 2px 12px rgba(0,0,0,0.05);
  transition: all 0.3s;
}
.input-row:focus-within {
  border-right-color: var(--theme-text-accent);
  border-bottom-color: var(--theme-border-light);
  box-shadow: 0 2px 16px rgba(0,0,0,0.08);
}

.input {
  flex: 1; padding: 6px 4px; height: 36px; min-height: 36px;
  border: none; background: none;
  color: var(--theme-text-main); font-size: 14px; font-family: inherit;
  resize: none; line-height: 1.5; outline: none;
}
.input::placeholder { color: rgba(112,88,98,0.35); font-style: italic; }
.input:disabled { opacity: 0.4; }

.send-btn {
  width: 52px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--theme-border-light); color: #fff; border: none; border-radius: 10px;
  cursor: pointer; font-size: 13px; font-weight: 600; font-family: inherit;
  transition: all 0.2s;
}
.send-btn:active:not(:disabled) { background: var(--theme-text-accent); transform: scale(0.96); }
.send-btn:disabled { background: var(--theme-border-ice); color: rgba(255,255,255,0.5); cursor: not-allowed; }

.stop-btn {
  width: 52px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: #e55555; color: #fff; border: none; border-radius: 10px;
  cursor: pointer; font-size: 12px; font-weight: 600; font-family: inherit;
  transition: all 0.2s;
}
.stop-btn:active { background: #c33; transform: scale(0.96); }

.hint { text-align: center; margin-top: 4px; font-size: 10px; color: rgba(112,88,98,0.35); }
.cmd-fb { text-align: center; margin-top: 4px; font-size: 11px; color: var(--theme-text-accent); font-weight: 500; }
</style>
