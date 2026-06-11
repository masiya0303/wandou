<!-- wandou · 聊天面板 — bjd粉色主题 -->
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const store = useGameStore()
const el = ref<HTMLElement | null>(null)

watch(() => store.messages.length, scrollDown)
watch(() => store.messages[store.messages.length - 1]?.content.length, scrollDown)

async function scrollDown() { await nextTick(); if (el.value) el.value.scrollTop = el.value.scrollHeight }

function md(t: string) { if (!t) return ''; return DOMPurify.sanitize(marked.parse(t, { breaks: true }) as string) }
function time(ts: number) { return new Date(ts).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }
</script>

<template>
  <div ref="el" class="chat">
    <div v-if="store.messages.length === 0 && !store.isGenerating" class="empty">
      <div class="empty-diamond">◆</div>
      <p class="empty-cn">通讯频道静默中</p>
      <p class="empty-en">COMMUNICATION CHANNEL</p>
      <div class="empty-line"></div>
      <p class="empty-hint">输入指令，启程星际冒险</p>
    </div>

    <template v-for="(m, idx) in store.messages" :key="m.id">
      <div v-if="idx > 0 && m.role === 'assistant'" class="sep">
        <span class="sep-line"></span><span class="sep-mark">◆</span><span class="sep-line"></span>
      </div>

      <!-- system -->
      <div v-if="m.role === 'system'" class="sys-msg">
        <span class="sys-time">· {{ time(m.timestamp) }} ·</span>
        <div class="sys-body" v-html="md(m.content)"></div>
      </div>

      <!-- AI -->
      <div v-else-if="m.role === 'assistant'" class="ai-msg">
        <div class="ai-head">
          <span class="ai-dot"></span>
          <span class="ai-name">乌拉</span>
          <span class="ai-time">{{ time(m.timestamp) }}</span>
        </div>
        <div class="ai-body glass-pink" v-html="md(m.content)"></div>
      </div>

      <!-- user -->
      <div v-else class="user-msg">
        <div class="user-head">
          <span class="user-time">{{ time(m.timestamp) }}</span>
          <span class="user-name">{{ store.character.name || '玩家' }}</span>
        </div>
        <div class="user-body glass-pink" v-html="md(m.content)"></div>
      </div>
    </template>

    <div v-if="store.isGenerating && store.messages.length === 0" class="loading">
      <span class="loading-dot"></span> 乌拉正在思考...
    </div>

    <div v-if="store.error" class="err">
      ⚠️ {{ store.error }}
      <button class="err-close" @click="store.error = ''">✕</button>
    </div>
  </div>
</template>

<style scoped>
.chat { flex: 1; overflow-y: auto; padding: 20px 20px 8px; }

/* scrollbar pink */
.chat::-webkit-scrollbar { width: 4px; }
.chat::-webkit-scrollbar-track { background: transparent; }
.chat::-webkit-scrollbar-thumb { background: var(--pink-light); border-radius: 2px; }
.chat { scrollbar-width: thin; scrollbar-color: var(--pink-light) transparent; }

/* empty */
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; }
.empty-diamond { font-size: 20px; color: var(--pink-accent); opacity: 0.45; margin-bottom: 16px; }
.empty-cn { font-size: 15px; color: var(--pink-primary); font-weight: 500; margin: 0; }
.empty-en { font-size: 10px; color: rgba(112,88,98,0.4); letter-spacing: 0.15em; margin: 4px 0 0; }
.empty-line { width: 100px; height: 1px; background: linear-gradient(90deg, transparent, var(--pink-light), transparent); margin: 16px auto; }
.empty-hint { font-size: 12px; color: rgba(112,88,98,0.45); margin: 0; }

/* sep */
.sep { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 24px 0; }
.sep-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, var(--pink-light), transparent); max-width: 120px; }
.sep-mark { font-size: 10px; color: var(--pink-accent); opacity: 0.4; }

/* system */
.sys-msg { margin-bottom: 18px; text-align: center; }
.sys-time { font-size: 10px; color: var(--pink-primary); letter-spacing: 0.1em; opacity: 0.6; }
.sys-body { font-size: 13px; color: var(--pink-primary); font-style: italic; margin-top: 4px; line-height: 1.6; }
.sys-body :deep(p) { margin: 4px 0; }

/* AI */
.ai-msg { margin-bottom: 22px; position: relative; padding-left: 16px; }
.ai-msg::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: var(--pink-accent); border-radius: 2px; opacity: 0.5; }
.ai-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.ai-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pink-accent); }
.ai-name { font-size: 12px; font-weight: 600; color: var(--pink-accent); }
.ai-time { font-size: 10px; color: rgba(112,88,98,0.45); }

/* user */
.user-msg { margin-bottom: 18px; display: flex; flex-direction: column; align-items: flex-end; }
.user-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.user-time { font-size: 10px; color: rgba(112,88,98,0.45); }
.user-name { font-size: 12px; font-weight: 600; color: var(--pink-primary); }

/* bubble */
.ai-body, .user-body {
  font-size: 14px; line-height: 1.8;
  padding: 14px 18px;
  color: var(--pink-primary);
  font-family: inherit;
}
.user-body { max-width: 85%; }

/* markdown on pink bubbles */
.ai-body :deep(p), .user-body :deep(p) { margin: 6px 0; }
.ai-body :deep(strong), .user-body :deep(strong) { color: var(--pink-accent); }
.ai-body :deep(em), .user-body :deep(em) { color: var(--pink-italic); }
.ai-body :deep(code), .user-body :deep(code) { background: rgba(255,182,193,0.15); padding: 1px 5px; border-radius: 3px; font-size: 0.88em; color: var(--pink-accent); }
.ai-body :deep(pre), .user-body :deep(pre) { background: rgba(255,230,238,0.3); border: 1px solid var(--pink-ice); border-radius: 6px; padding: 10px 14px; overflow-x: auto; margin: 8px 0; }
.ai-body :deep(pre code), .user-body :deep(pre code) { background: none; padding: 0; }
.ai-body :deep(blockquote), .user-body :deep(blockquote) { border-left: 3px solid var(--pink-light); padding-left: 12px; margin: 6px 0; color: var(--pink-primary); }

/* loading */
.loading { display: flex; align-items: center; gap: 8px; color: var(--pink-primary); font-size: 13px; padding: 16px; }
.loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pink-accent); animation: dotPulse 1s ease-in-out infinite; }
@keyframes dotPulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }

/* error */
.err { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; margin: 8px 0; background: rgba(200,40,40,0.2); border-radius: 6px; color: #e88888; font-size: 12px; }
.err-close { background: none; border: none; color: #e88888; cursor: pointer; font-size: 14px; }
</style>
