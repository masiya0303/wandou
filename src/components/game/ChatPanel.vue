<!-- wandou · 聊天面板 — bjd粉色主题 -->
<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useChatStore, getErrorHint, type ErrorType } from '@/stores/chatStore'
import { usePlayerStore } from '@/stores/playerStore'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const chat = useChatStore()
const player = usePlayerStore()
const el = ref<HTMLElement | null>(null)

watch(() => chat.messages.length, scrollDown)
watch(() => chat.messages[chat.messages.length - 1]?.content.length, scrollDown)

async function scrollDown() { await nextTick(); if (el.value) el.value.scrollTop = el.value.scrollHeight }

function time(ts: number) { return new Date(ts).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }

// 渲染缓存：消息 id → 渲染后 HTML
const renderCache = new Map<string, string>()
function renderedHtml(id: string, content: string): string {
  if (!content) return ''
  const prev = renderCache.get(id)
  if (prev !== undefined) return prev
  const html = DOMPurify.sanitize(marked.parse(content, { breaks: true }) as string)
  renderCache.set(id, html)
  return html
}

// 流式输出中自动刷新最后一条 assistant 的缓存
const lastAssistantId = computed(() => {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === 'assistant') return chat.messages[i].id
  }
  return null
})
watch(() => {
  const msg = chat.messages[chat.messages.length - 1]
  return msg?.role === 'assistant' ? msg.content : null
}, () => {
  if (lastAssistantId.value) renderCache.delete(lastAssistantId.value)
})

// 消息数量变化时清理已移除消息的缓存
watch(() => chat.messages.length, () => {
  const ids = new Set(chat.messages.map(m => m.id))
  for (const key of renderCache.keys()) { if (!ids.has(key)) renderCache.delete(key) }
})

// /retry 也会触发行数变化，上面的 watch 自动清理缓存 — 额外兜底：
watch(() => chat.messages.length, (n, o) => {
  if (n < (o ?? 0)) renderCache.clear() // messages 减少说明有 pop，清缓存重建
})

const ERROR_LABELS: Record<ErrorType, string> = {
  auth: '🔑 认证失败',
  rate_limit: '⏳ 请求过频',
  server: '🔧 服务异常',
  network: '🌐 网络不通',
  timeout: '⏱️ 连接超时',
  unknown: '⚠️ 请求失败',
}

function handleErrorAction() {
  if (chat.errorType === 'auth') {
    chat.dismissError()
    return // 去设置改 key，不用重试
  }
  chat.retry()
}
</script>

<template>
  <div ref="el" class="chat">
    <div v-if="chat.messages.length === 0 && !chat.isGenerating" class="empty">
      <div class="empty-diamond">◆</div>
      <p class="empty-cn">通讯频道静默中</p>
      <p class="empty-en">COMMUNICATION CHANNEL</p>
      <div class="empty-line"></div>
      <p class="empty-hint">输入指令，启程星际冒险</p>
    </div>

    <template v-for="(m, idx) in chat.messages" :key="m.id">
      <div v-if="idx > 0 && m.role === 'assistant'" class="sep">
        <span class="sep-line"></span><span class="sep-mark">◆</span><span class="sep-line"></span>
      </div>

      <!-- system -->
      <div v-if="m.role === 'system'" class="sys-msg">
        <span class="sys-time">· {{ time(m.timestamp) }} ·</span>
        <div class="sys-body" v-html="renderedHtml(m.id, m.content)"></div>
      </div>

      <!-- AI -->
      <div v-else-if="m.role === 'assistant'" class="ai-msg">
        <div class="ai-head">
          <span class="ai-dot"></span>
          <span class="ai-name">乌拉</span>
          <span class="ai-time">{{ time(m.timestamp) }}</span>
        </div>
        <div class="ai-body glass-pink" v-html="renderedHtml(m.id, m.content)"></div>
      </div>

      <!-- user -->
      <div v-else class="user-msg">
        <div class="user-head">
          <span class="user-time">{{ time(m.timestamp) }}</span>
          <span class="user-name">{{ player.character.name || '玩家' }}</span>
        </div>
        <div class="user-body glass-pink" v-html="renderedHtml(m.id, m.content)"></div>
      </div>
    </template>

    <div v-if="chat.isGenerating && chat.messages.length === 0" class="loading">
      <span class="loading-dot"></span> 乌拉正在思考...
    </div>

    <div v-if="chat.error" class="err-box">
      <div class="err-top">
        <span class="err-label">{{ ERROR_LABELS[chat.errorType] }}</span>
        <button class="err-close" @click="chat.dismissError()">✕</button>
      </div>
      <p class="err-msg">{{ chat.error }}</p>
      <p v-if="getErrorHint(chat.errorType)" class="err-hint">{{ getErrorHint(chat.errorType) }}</p>
      <div class="err-acts">
        <button class="err-retry" @click="handleErrorAction" :disabled="chat.isGenerating">
          {{ chat.errorType === 'auth' ? '⚙️ 去设置' : '🔄 重试' }}
        </button>
        <button v-if="chat.errorType !== 'auth'" class="err-dismiss" @click="chat.dismissError()">忽略</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat { flex: 1; overflow-y: auto; padding: 20px 20px 8px; background-image: var(--theme-chat-bg); background-size: cover; background-attachment: fixed; background-position: center; }

/* scrollbar pink */
.chat::-webkit-scrollbar { width: 4px; }
.chat::-webkit-scrollbar-track { background: transparent; }
.chat::-webkit-scrollbar-thumb { background: var(--theme-border-light); border-radius: 2px; }
.chat { scrollbar-width: thin; scrollbar-color: var(--theme-border-light) transparent; }

/* empty */
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
.empty-diamond { font-size: 20px; color: var(--theme-text-accent); opacity: 0.45; margin-bottom: 16px; }
.empty-cn { font-size: 15px; color: var(--theme-text-main); font-weight: 500; margin: 0; }
.empty-en { font-size: 10px; color: rgba(112,88,98,0.4); letter-spacing: 0.15em; margin: 4px 0 0; }
.empty-line { width: 100px; height: 1px; background: linear-gradient(90deg, transparent, var(--theme-border-light), transparent); margin: 16px auto; }
.empty-hint { font-size: 12px; color: rgba(112,88,98,0.45); margin: 0; }

/* sep */
.sep { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 24px 0; }
.sep-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--theme-border-light), transparent); max-width: 120px; }
.sep-mark { font-size: 10px; color: var(--theme-text-accent); opacity: 0.4; }

/* system */
.sys-msg { margin-bottom: 18px; text-align: center; }
.sys-time { font-size: 10px; color: var(--theme-text-main); letter-spacing: 0.1em; opacity: 0.6; }
.sys-body { font-size: 13px; color: var(--theme-text-main); font-style: italic; margin-top: 4px; line-height: 1.6; }
.sys-body :deep(p) { margin: 4px 0; }

/* AI */
.ai-msg { margin-bottom: 22px; position: relative; padding-left: 16px; }
.ai-msg::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: var(--theme-text-accent); border-radius: 2px; opacity: 0.5; }
.ai-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.ai-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--theme-text-accent); }
.ai-name { font-size: 12px; font-weight: 600; color: var(--theme-text-accent); }
.ai-time { font-size: 10px; color: rgba(112,88,98,0.45); }

/* user */
.user-msg { margin-bottom: 18px; display: flex; flex-direction: column; align-items: flex-end; }
.user-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.user-time { font-size: 10px; color: rgba(112,88,98,0.45); }
.user-name { font-size: 12px; font-weight: 600; color: var(--theme-text-main); }

/* bubble */
.ai-body, .user-body {
  font-size: 14px; line-height: 1.8;
  padding: 14px 18px;
  color: var(--theme-text-main);
  font-family: inherit;
  background: var(--theme-bubble-img) center/cover no-repeat, var(--theme-bubble-bg);
}
.user-body { max-width: 85%; }

/* markdown on pink bubbles */
.ai-body :deep(p), .user-body :deep(p) { margin: 6px 0; }
.ai-body :deep(strong), .user-body :deep(strong) { color: var(--theme-text-accent); }
.ai-body :deep(em), .user-body :deep(em) { color: var(--theme-text-secondary); }
.ai-body :deep(code), .user-body :deep(code) { background: rgba(255,182,193,0.15); padding: 1px 5px; border-radius: 3px; font-size: 0.88em; color: var(--theme-text-accent); }
.ai-body :deep(pre), .user-body :deep(pre) { background: rgba(255,230,238,0.3); border: 1px solid var(--theme-border-ice); border-radius: 6px; padding: 10px 14px; overflow-x: auto; margin: 8px 0; }
.ai-body :deep(pre code), .user-body :deep(pre code) { background: none; padding: 0; }
.ai-body :deep(blockquote), .user-body :deep(blockquote) { border-left: 3px solid var(--theme-border-light); padding-left: 12px; margin: 6px 0; color: var(--theme-text-main); }

/* loading */
.loading { display: flex; align-items: center; gap: 8px; color: var(--theme-text-main); font-size: 13px; padding: 16px; }
.loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--theme-text-accent); animation: dotPulse 1s ease-in-out infinite; }
@keyframes dotPulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }

/* error box */
.err-box {
  margin: 8px 0 16px; padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255,128,168,0.06);
  border: 1px solid var(--theme-border-ice);
}
.err-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.err-label { font-size: 13px; font-weight: 600; color: #e88888; }
.err-close { background: none; border: none; color: var(--theme-text-main); cursor: pointer; font-size: 14px; opacity: 0.4; }
.err-close:hover { opacity: 1; }
.err-msg { font-size: 11px; color: var(--theme-text-main); opacity: 0.55; margin: 0 0 4px; line-height: 1.5; }
.err-hint { font-size: 11px; color: var(--theme-text-accent); margin: 0 0 8px; font-weight: 500; }
.err-acts { display: flex; gap: 8px; }
.err-retry {
  padding: 5px 16px; border: none; border-radius: 20px;
  background: var(--theme-text-accent); color: #fff;
  font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.2s;
}
.err-retry:active:not(:disabled) { transform: scale(0.96); }
.err-retry:disabled { opacity: 0.4; cursor: not-allowed; }
.err-dismiss {
  padding: 4px 14px; border: 1px solid var(--theme-border-light); border-radius: 20px;
  background: transparent; color: var(--theme-text-main); font-size: 11px;
  cursor: pointer; font-family: inherit; opacity: 0.5;
}
.err-dismiss:active { opacity: 0.8; }
</style>
