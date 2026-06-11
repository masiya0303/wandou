<!-- wandou · 聊天面板 — yijiekkk 风格 -->
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

function md(text: string) { if (!text) return ''; return DOMPurify.sanitize(marked.parse(text, { breaks: true }) as string) }
function time(ts: number) { return new Date(ts).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }
</script>

<template>
  <div ref="el" class="chat">
    <!-- 空状态 -->
    <div v-if="store.messages.length === 0 && !store.isGenerating" class="chat-empty">
      <div class="empty-frame">
        <div class="empty-diamond">◆</div>
        <p class="empty-cn">通讯频道静默中</p>
        <p class="empty-en">COMMUNICATION CHANNEL</p>
        <div class="empty-line"></div>
        <p class="empty-hint">输入指令，启程星际冒险</p>
      </div>
    </div>

    <!-- 消息列表 -->
    <template v-for="(m, idx) in store.messages" :key="m.id">
      <!-- 分段装饰线 -->
      <div v-if="idx > 0 && m.role === 'assistant'" class="sep">
        <span class="sep-line"></span>
        <span class="sep-mark">◆</span>
        <span class="sep-line"></span>
      </div>

      <!-- 系统消息 -->
      <div v-if="m.role === 'system'" class="sys-msg">
        <span class="sys-time">· {{ time(m.timestamp) }} ·</span>
        <div class="sys-body" v-html="md(m.content)"></div>
      </div>

      <!-- AI 消息 -->
      <div v-else-if="m.role === 'assistant'" class="ai-msg">
        <div class="ai-head">
          <span class="ai-dot"></span>
          <span class="ai-name">乌拉</span>
          <span class="ai-time">{{ time(m.timestamp) }}</span>
        </div>
        <div class="ai-body" v-html="md(m.content)"></div>
      </div>

      <!-- 用户消息 -->
      <div v-else class="user-msg">
        <div class="user-head">
          <span class="user-time">{{ time(m.timestamp) }}</span>
          <span class="user-name">{{ store.character.name || '玩家' }}</span>
        </div>
        <div class="user-body" v-html="md(m.content)"></div>
      </div>
    </template>

    <!-- 加载 -->
    <div v-if="store.isGenerating && store.messages.length === 0" class="loading">
      <span class="loading-dot"></span> 乌拉正在思考...
    </div>

    <!-- 错误 -->
    <div v-if="store.error" class="err">
      ⚠️ {{ store.error }}
      <button class="err-close" @click="store.error = ''">✕</button>
    </div>
  </div>
</template>

<style scoped>
/* ===== 容器 ===== */
.chat { flex: 1; overflow-y: auto; padding: 20px 20px 8px; }

/* WEBKIT SCROLLBAR — 青色主题 */
.chat::-webkit-scrollbar { width: 6px; }
.chat::-webkit-scrollbar-track { background: transparent; }
.chat::-webkit-scrollbar-thumb { background: linear-gradient(180deg, rgba(34,211,238,0.4) 0%, rgba(34,211,238,0.2) 50%, rgba(34,211,238,0.4) 100%); border-radius: 3px; }
.chat::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, rgba(34,211,238,0.6) 0%, rgba(34,211,238,0.35) 50%, rgba(34,211,238,0.6) 100%); }
.chat { scrollbar-width: thin; scrollbar-color: rgba(34,211,238,0.3) transparent; }

/* ===== 空状态 ===== */
.chat-empty { display: flex; align-items: center; justify-content: center; height: 100%; }
.empty-frame { text-align: center; }
.empty-diamond { font-size: 20px; color: var(--accent-cyan); opacity: 0.3; margin-bottom: 16px; }
.empty-cn { font-size: 15px; color: var(--text-secondary); font-weight: 500; margin: 0; }
.empty-en { font-size: 10px; color: var(--text-muted); letter-spacing: 0.15em; margin: 4px 0 0; }
.empty-line { width: 100px; height: 1px; background: linear-gradient(90deg, transparent, var(--accent-cyan), transparent); margin: 16px auto; opacity: 0.3; }
.empty-hint { font-size: 12px; color: var(--text-muted); margin: 0; }

/* ===== 分段装饰线 ===== */
.sep { display: flex; align-items: center; justify-content: center; gap: 10px; margin: 24px 0; }
.sep-line { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(34,211,238,0.25), transparent); max-width: 120px; }
.sep-mark { font-size: 10px; color: var(--accent-cyan); opacity: 0.35; }

/* ===== 系统消息 ===== */
.sys-msg { margin-bottom: 18px; text-align: center; }
.sys-time { font-size: 10px; color: var(--text-muted); letter-spacing: 0.1em; }
.sys-body { font-size: 13px; color: var(--text-secondary); font-style: italic; margin-top: 4px; line-height: 1.6; }
.sys-body :deep(p) { margin: 4px 0; }

/* ===== AI 消息 ===== */
.ai-msg { margin-bottom: 22px; position: relative; padding-left: 16px; }
.ai-msg::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 3px; background: rgba(34,211,238,0.3); border-radius: 2px; }
.ai-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.ai-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-cyan); }
.ai-name { font-size: 12px; font-weight: 600; color: var(--accent-cyan); }
.ai-time { font-size: 10px; color: var(--text-muted); }
.ai-body { font-size: 15px; line-height: 1.8; color: var(--text-primary); }

/* ===== 用户消息 ===== */
.user-msg { margin-bottom: 18px; display: flex; flex-direction: column; align-items: flex-end; }
.user-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.user-time { font-size: 10px; color: var(--text-muted); }
.user-name { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.user-body {
  font-size: 14px; line-height: 1.6; color: var(--text-secondary);
  max-width: 88%; padding: 10px 14px;
  background: rgba(34,211,238,0.04);
  border-right: 2px solid rgba(34,211,238,0.3);
  border-radius: 6px 0 0 6px;
  font-style: italic;
}

/* ===== Markdown ===== */
.ai-body :deep(p), .user-body :deep(p) { margin: 6px 0; }
.ai-body :deep(strong), .user-body :deep(strong) { color: #e0c060; }
.ai-body :deep(em), .user-body :deep(em) { color: #88c8e8; }
.ai-body :deep(code), .user-body :deep(code) { background: rgba(0,0,0,0.35); padding: 1px 5px; border-radius: 3px; font-size: 0.88em; }
.ai-body :deep(pre), .user-body :deep(pre) { background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 6px; padding: 10px 14px; overflow-x: auto; margin: 8px 0; }
.ai-body :deep(pre code), .user-body :deep(pre code) { background: none; padding: 0; }
.ai-body :deep(blockquote), .user-body :deep(blockquote) { border-left: 2px solid var(--accent-cyan); padding-left: 12px; margin: 6px 0; color: var(--text-secondary); }

/* ===== 加载 ===== */
.loading { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 13px; padding: 16px; }
.loading-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-cyan); animation: dot-pulse 1s ease-in-out infinite; }
@keyframes dot-pulse { 0%,100%{opacity:0.3;transform:scale(0.8)} 50%{opacity:1;transform:scale(1.2)} }

/* ===== 错误 ===== */
.err { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; margin: 8px 0; background: rgba(200,40,40,0.2); border: 1px solid rgba(200,40,40,0.3); border-radius: 6px; color: #e88888; font-size: 12px; }
.err-close { background: none; border: none; color: #e88888; cursor: pointer; font-size: 14px; }
</style>
