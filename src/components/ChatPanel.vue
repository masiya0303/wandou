<!-- ============================================================
 wandou v0.3 — 豌豆星际漂流 · 聊天面板
 消息卡片 + 玻璃拟态 + 四角微标 + 双语头 + 渐变分隔
============================================================ -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const store = useGameStore()
const chatContainer = ref<HTMLElement | null>(null)

watch(() => store.messages.length, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
})
watch(() => {
  const msgs = store.messages
  return msgs.length > 0 ? msgs[msgs.length - 1].content.length : 0
}, async () => {
  await nextTick()
  if (chatContainer.value) chatContainer.value.scrollTop = chatContainer.value.scrollHeight
})

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
    <!-- 空状态 -->
    <div v-if="store.messages.length === 0 && !store.isGenerating" class="chat-empty">
      <div class="empty-icon-wrapper">
        <span class="orbit-ring-sm"></span>
        <span class="empty-icon">📡</span>
      </div>
      <p class="empty-title">通讯频道静默中</p>
      <p class="empty-sub">COMMUNICATION CHANNEL · STANDBY</p>
      <hr class="accent-divider" />
      <p class="empty-hint">输入指令开始</p>
    </div>

    <template v-for="(msg, idx) in store.messages" :key="msg.id">
      <!-- 消息间分隔线（非第一条） -->
      <hr v-if="idx > 0 && msg.role === 'assistant'" class="msg-separator" />

      <div :class="['message', `message-${msg.role}`]">
        <!-- 消息头 -->
        <div class="msg-header">
          <template v-if="msg.role === 'user'">
            <span class="msg-icon">👨‍🚀</span>
            <span class="msg-role-cn">{{ store.character.name || '玩家' }}</span>
            <span class="msg-role-en">CAPTAIN</span>
          </template>
          <template v-else>
            <span class="msg-icon">🤖</span>
            <span class="msg-role-cn">乌拉</span>
            <span class="msg-role-en">AI · DOUDOU</span>
          </template>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
        </div>

        <!-- 消息体 -->
        <div class="msg-body glass-panel corner-deco" v-html="renderMarkdown(msg.content)"></div>

        <!-- 流式光标 -->
        <span v-if="store.isGenerating && msg.id === store.messages[store.messages.length-1]?.id && msg.role === 'assistant'" class="cursor-blink">▌</span>
      </div>
    </template>

    <!-- 加载 -->
    <div v-if="store.isGenerating && store.messages.length === 0" class="loading-indicator">
      <span class="dot-pulse"></span>
      <span>乌拉正在思考...</span>
    </div>

    <!-- 错误 -->
    <div v-if="store.error" class="error-banner">
      ⚠️ {{ store.error }}
      <button @click="store.error = ''">✕</button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel { flex: 1; overflow-y: auto; padding: 1rem 1rem 0.5rem; scroll-behavior: smooth; }

/* ===== 空状态 ===== */
.chat-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
.empty-icon-wrapper { position: relative; margin-bottom: 0.8rem; }
.empty-icon { font-size: 3rem; opacity: 0.6; z-index: 1; position: relative; }
.orbit-ring-sm {
  position: absolute; inset: -10px; border-radius: 50%;
  border: 1px solid rgba(0,229,255,0.12);
  animation: orbit-spin 10s linear infinite;
}
.empty-title { font-size: 0.95rem; color: var(--text-secondary); font-weight: 500; margin: 0; }
.empty-sub { font-size: 0.55rem; color: var(--text-muted); letter-spacing: 0.15em; margin: 0.15rem 0 0; }
.empty-hint { font-size: 0.75rem; color: #2e4460; margin-top: 0.3rem; }

/* ===== 消息分隔线 ===== */
.msg-separator {
  width: 50%; height: 1px; margin: 0.6rem auto;
  background: var(--gradient-accent); border: none; opacity: 0.5;
}

/* ===== 消息卡片 ===== */
.message { margin-bottom: 0.75rem; animation: slide-up 0.35s ease; }

.msg-header { display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.35rem; }
.msg-icon { font-size: 0.85rem; }
.msg-role-cn { font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); }
.msg-role-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; }
.msg-time { font-size: 0.6rem; color: #3a5070; margin-left: auto; }

/* 消息体 — 玻璃卡片 */
.msg-body {
  padding: 0.65rem 0.8rem; font-size: 0.9rem; line-height: 1.7; color: var(--text-primary);
  border-radius: 10px;
}

/* AI 消息增强 */
.message-assistant .msg-body {
  border-left: 3px solid var(--accent-cyan);
  box-shadow: inset 1px 0 8px rgba(0, 229, 255, 0.04);
}

/* 用户消息 */
.message-user { display: flex; flex-direction: column; align-items: flex-end; }
.message-user .msg-header { flex-direction: row-reverse; }
.message-user .msg-body {
  color: #90b8e0; max-width: 88%; text-align: left;
  border-right: 2px solid var(--accent);
  background: rgba(30, 60, 100, 0.2);
}

/* ===== Markdown ===== */
.msg-body :deep(p) { margin: 0.35rem 0; }
.msg-body :deep(strong) { color: #e0c060; }
.msg-body :deep(em) { color: #80c0e0; }
.msg-body :deep(code) { background: rgba(0,0,0,0.4); padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.85em; border: 1px solid rgba(30,58,95,0.4); }
.msg-body :deep(pre) { background: rgba(0,0,0,0.5); border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem; overflow-x: auto; margin: 0.5rem 0; }
.msg-body :deep(pre code) { background: none; border: none; padding: 0; }
.msg-body :deep(blockquote) { border-left: 2px solid var(--accent-cyan); padding-left: 0.75rem; margin: 0.4rem 0; color: var(--text-secondary); }

/* ===== 光标 ===== */
.cursor-blink { color: var(--accent-cyan); animation: blink 0.8s step-end infinite; }
@keyframes blink { 50%{opacity:0} }

/* ===== 加载 ===== */
.loading-indicator { display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); font-size: 0.85rem; padding: 1rem; }
.dot-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-cyan); animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }

/* ===== 错误 ===== */
.error-banner { display: flex; align-items: center; justify-content: space-between; padding: 0.55rem 0.7rem; margin: 0.4rem 0; background: rgba(180,40,40,0.25); border: 1px solid #6b2a2a; border-radius: 6px; color: #e08080; font-size: 0.78rem; }
.error-banner button { background: none; border: none; color: #e08080; cursor: pointer; font-size: 1rem; }
</style>
