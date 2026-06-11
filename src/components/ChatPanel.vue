<!-- ============================================================
 wandou v0.1 — 豌豆星际漂流 · 聊天面板
============================================================ -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const store = useGameStore()
const chatContainer = ref<HTMLElement | null>(null)

// 自动滚动到底部
watch(
  () => store.messages.length,
  async () => {
    await nextTick()
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  },
)

// 流式更新也触发滚动
watch(
  () => {
    const msgs = store.messages
    return msgs.length > 0 ? msgs[msgs.length - 1].content.length : 0
  },
  async () => {
    await nextTick()
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  },
)

function renderMarkdown(text: string): string {
  if (!text) return ''
  const raw = marked.parse(text, { breaks: true }) as string
  return DOMPurify.sanitize(raw)
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div ref="chatContainer" class="chat-panel">
    <div v-if="store.messages.length === 0" class="chat-empty">
      <div class="empty-icon">📡</div>
      <p>通讯频道静默中...</p>
      <p class="empty-hint">输入指令开始你的星际冒险</p>
    </div>

    <div
      v-for="msg in store.messages"
      :key="msg.id"
      :class="['message', `message-${msg.role}`]"
    >
      <div class="msg-header">
        <span class="msg-role">
          {{ msg.role === 'user' ? `👨‍🚀 ${store.character.name || '舰长'}` : '🤖 豆豆' }}
        </span>
        <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
      </div>
      <div
        class="msg-content"
        v-html="renderMarkdown(msg.content)"
      ></div>
      <!-- 流式生成中的闪烁光标 -->
      <span
        v-if="store.isGenerating && msg.id === store.messages[store.messages.length - 1]?.id && msg.role === 'assistant'"
        class="cursor-blink"
      >▌</span>
    </div>

    <!-- 加载指示器 -->
    <div v-if="store.isGenerating && store.messages.length === 0" class="loading-indicator">
      <span class="dot-pulse"></span>
      <span>AI 正在思考...</span>
    </div>

    <!-- 错误提示 -->
    <div v-if="store.error" class="error-banner">
      ⚠️ {{ store.error }}
      <button @click="store.error = ''">✕</button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1rem 0.5rem;
  scroll-behavior: smooth;
}

/* 空状态 */
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #4a6380;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 0.8rem;
  opacity: 0.6;
}

.chat-empty p {
  margin: 0.2rem 0;
}

.empty-hint {
  font-size: 0.8rem;
  color: #2e4460;
}

/* 消息 */
.message {
  margin-bottom: 1rem;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
}

.msg-role {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b8db5;
}

.msg-time {
  font-size: 0.65rem;
  color: #3a5070;
}

.msg-content {
  font-size: 0.9rem;
  line-height: 1.7;
  color: #c8dcff;
}

/* 用户消息样式 */
.message-user .msg-content {
  color: #90b8e0;
  padding: 0.5rem 0.75rem;
  background: rgba(30, 60, 100, 0.3);
  border-left: 2px solid #4a90d9;
  border-radius: 0 6px 6px 0;
}

/* Markdown 渲染 */
.msg-content :deep(p) {
  margin: 0.4rem 0;
}

.msg-content :deep(strong) {
  color: #e0c060;
}

.msg-content :deep(em) {
  color: #80c0e0;
}

.msg-content :deep(code) {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  font-size: 0.85em;
}

/* 光标闪烁 */
.cursor-blink {
  color: #4a90d9;
  animation: blink 0.8s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* 加载 */
.loading-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #6b8db5;
  font-size: 0.85rem;
  padding: 1rem;
}

.dot-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a90d9;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

/* 错误 */
.error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.75rem;
  margin: 0.5rem 0;
  background: rgba(180, 40, 40, 0.3);
  border: 1px solid #6b2a2a;
  border-radius: 6px;
  color: #e08080;
  font-size: 0.8rem;
}

.error-banner button {
  background: none;
  border: none;
  color: #e08080;
  cursor: pointer;
  font-size: 1rem;
}
</style>
