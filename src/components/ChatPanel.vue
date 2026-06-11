<!-- wandou · 聊天面板 -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const store = useGameStore()
const el = ref<HTMLElement | null>(null)

watch(() => store.messages.length, scrollDown)
watch(() => store.messages[store.messages.length - 1]?.content.length, scrollDown)

async function scrollDown() {
  await nextTick()
  if (el.value) el.value.scrollTop = el.value.scrollHeight
}

function md(text: string) {
  if (!text) return ''
  return DOMPurify.sanitize(marked.parse(text, { breaks: true }) as string)
}

function time(ts: number) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div ref="el" class="chat">
    <div v-if="store.messages.length === 0 && !store.isGenerating" class="empty">
      <div class="empty-icon">📡</div>
      <p class="empty-title">通讯频道静默中</p>
      <p class="empty-sub">COMMUNICATION CHANNEL · STANDBY</p>
    </div>

    <div v-for="m in store.messages" :key="m.id" :class="['msg', m.role === 'user' ? 'msg-user' : 'msg-ai']">
      <div class="msg-head">
        <span class="msg-who">{{ m.role === 'user' ? '👨‍🚀 ' + (store.character.name || '舰长') : '🤖 乌拉' }}</span>
        <span class="msg-time">{{ time(m.timestamp) }}</span>
      </div>
      <div class="msg-body" v-html="md(m.content)"></div>
    </div>

    <div v-if="store.isGenerating && store.messages.length === 0" class="loading">
      <span class="dot"></span> 乌拉正在思考...
    </div>

    <div v-if="store.error" class="err">
      ⚠️ {{ store.error }}
      <button class="err-close" @click="store.error = ''">✕</button>
    </div>
  </div>
</template>

<style scoped>
.chat { flex: 1; overflow-y: auto; padding: 16px 16px 8px; }

/* empty */
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
.empty-icon { font-size: 48px; opacity: 0.35; margin-bottom: 12px; }
.empty-title { font-size: 15px; color: var(--text-secondary); font-weight: 500; margin: 0; }
.empty-sub { font-size: 10px; color: var(--text-muted); letter-spacing: 0.12em; margin: 4px 0 0; }

/* message */
.msg { margin-bottom: 20px; }
.msg:last-child { margin-bottom: 0; }

.msg-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.msg-who { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.msg-time { font-size: 10px; color: var(--text-muted); margin-left: auto; }

.msg-body { font-size: 15px; line-height: 1.75; color: var(--text-primary); }

/* user */
.msg-user .msg-body {
  color: #b0d0f0;
  padding: 10px 14px;
  background: rgba(30,60,110,0.2);
  border-right: 2px solid var(--accent);
  border-radius: 0 8px 8px 0;
}

/* markdown */
.msg-body :deep(p) { margin: 6px 0; }
.msg-body :deep(strong) { color: #e0c060; }
.msg-body :deep(em) { color: #88c8e8; }
.msg-body :deep(code) { background: rgba(0,0,0,0.35); padding: 1px 5px; border-radius: 3px; font-size: 0.88em; }
.msg-body :deep(pre) { background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; overflow-x: auto; margin: 8px 0; }
.msg-body :deep(pre code) { background: none; padding: 0; }
.msg-body :deep(blockquote) { border-left: 2px solid var(--accent-cyan); padding-left: 12px; margin: 6px 0; color: var(--text-secondary); }

/* loading */
.loading { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; padding: 16px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-cyan); animation: dot-pulse 1s ease-in-out infinite; }
@keyframes dot-pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }

/* error */
.err { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; margin: 8px 0; background: rgba(200,40,40,0.2); border: 1px solid rgba(200,40,40,0.3); border-radius: 6px; color: #e88888; font-size: 12px; }
.err-close { background: none; border: none; color: #e88888; cursor: pointer; font-size: 14px; }
</style>
