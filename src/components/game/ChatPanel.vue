<!-- wandou · 聊天面板 — bjd粉色主题 -->
<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
import { useChatStore, getErrorHint, type ErrorType } from '@/stores/chatStore'
import { usePlayerStore } from '@/stores/playerStore'
import { useNpcStore } from '@/stores/npcStore'
import NpcDetailModal from './NpcDetailModal.vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const chat = useChatStore()
const player = usePlayerStore()
const npc = useNpcStore()
const el = ref<HTMLElement | null>(null)

/** NPC 详情弹窗 */
const detailNpcId = ref<string | null>(null)
const detailNpc = computed(() => detailNpcId.value ? npc.npcs.find(n => n.id === detailNpcId.value) || null : null)

function cakeThinkingHtml(thinkingText: string): string {
  const escaped = thinkingText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<div class="cake-cot"><details><summary><span class="cake-icon">🍰</span><span>奶油思维 · 掀开尝一口</span></summary><div class="cake-slice"><span class="cake-strawberry">🍓</span><pre class="cake-content">${escaped}</pre></div></details></div>`
}

watch(() => chat.messages[chat.messages.length - 1]?.content.length, scrollDown)

async function scrollDown() { await nextTick(); if (el.value) el.value.scrollTop = el.value.scrollHeight }

function time(ts: number) { return new Date(ts).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' }) }

function highlightNpcNames(html: string): string {
  const activeNpcs = npc.npcs.filter(n => npc.getNpcCategory(n) !== '离场')
  if (activeNpcs.length === 0) return html

  // 按名字长度降序（长名优先，防止"远坂凛子"被"远坂凛"误匹配）
  const sorted = activeNpcs
    .filter(n => n.name && n.name.length >= 1 && n.name !== '???')
    .sort((a, b) => b.name.length - a.name.length)

  if (sorted.length === 0) return html

  // 构建正则：用 | 连接所有名字，每个名字都转义正则特殊字符
  const escapedNames = sorted.map(n => n.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const namePattern = escapedNames.join('|')
  const nameRe = new RegExp(namePattern, 'g')

  // 构建名字 → id 查找
  const idByLowerName = new Map<string, string>()
  for (const n of sorted) idByLowerName.set(n.name.toLowerCase(), n.id)

  // DOMParser 解析 → 遍历文本节点 → 替换
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (!doc.body) return html

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      if (!text.trim() || !nameRe.test(text)) return
      nameRe.lastIndex = 0 // reset

      const parent = node.parentNode
      if (!parent) return

      // 用 split + intersperse 重建，避免 regex 替换破坏 DOM
      const frag = document.createDocumentFragment()
      let lastIdx = 0
      let m: RegExpExecArray | null
      while ((m = nameRe.exec(text)) !== null) {
        // 匹配前的纯文本
        if (m.index > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)))
        }
        // 匹配的 NPC 名 → 可点击 span
        const matchedName = m[0]
        const npcId = idByLowerName.get(matchedName.toLowerCase()) || ''
        const span = document.createElement('span')
        span.className = 'npc-mention'
        span.dataset.npcId = npcId
        span.title = '点击查看 NPC 详情'
        span.textContent = matchedName
        frag.appendChild(span)
        lastIdx = m.index + matchedName.length
      }
      // 末尾剩余文本
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)))
      }

      parent.replaceChild(frag, node)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      if (el.classList?.contains('npc-mention')) return
      const tag = el.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style' || tag === 'code' || tag === 'pre') return
      for (const child of Array.from(node.childNodes)) walk(child)
    }
  }

  walk(doc.body)
  return doc.body.innerHTML
}

// 渲染缓存：消息 id → 渲染后 HTML
const renderCache = new Map<string, string>()
function renderedHtml(id: string, content: string): string {
  if (!content) return ''
  const prev = renderCache.get(id)
  if (prev !== undefined) return prev
  const html = DOMPurify.sanitize(marked.parse(content, { breaks: true }) as string)
  const highlighted = highlightNpcNames(html)
  renderCache.set(id, highlighted)
  return highlighted
}

// 事件委托：点击 NPC 名字 → 打开详情面板
function handleChatClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest('.npc-mention') as HTMLElement | null
  if (target?.dataset.npcId) {
    detailNpcId.value = target.dataset.npcId
  }
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
  <div ref="el" class="chat" @click="handleChatClick">
    <div v-if="chat.messages.length === 0 && !chat.isGenerating" class="empty">
      <div class="empty-diamond">◆</div>
      <p class="empty-cn">通讯频道静默中</p>
      <p class="empty-en">COMMUNICATION CHANNEL</p>
      <div class="empty-line"></div>
      <p class="empty-hint">输入指令，开始冒险</p>
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
          <span class="ai-spacer"></span>
          <button
            v-if="!chat.isGenerating"
            class="ai-regenerate"
            title="重新生成此回复"
            @click="chat.regenerate(m.id)"
          >🔄</button>
        </div>
        <div class="ai-body glass-pink" v-html="renderedHtml(m.id, m.content)"></div>
        <!-- 思考过程 — 奶油蛋糕折叠卡片 -->
        <div v-if="chat.thinkingMap[m.id]" class="ai-thinking" v-html="cakeThinkingHtml(chat.thinkingMap[m.id])"></div>
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

    <!-- NPC 详情弹窗（点名字触发） -->
    <NpcDetailModal v-if="detailNpc" :npc="detailNpc" @close="detailNpcId = null" />
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
.ai-spacer { flex: 1; }
.ai-regenerate {
  background: none; border: 1px solid var(--theme-border-ice); border-radius: 12px;
  color: var(--theme-text-main); font-size: 11px; cursor: pointer;
  padding: 1px 8px; opacity: 0; transition: opacity 0.2s;
  font-family: inherit;
}
.ai-msg:hover .ai-regenerate { opacity: 0.5; }
.ai-regenerate:hover { opacity: 1 !important; border-color: var(--theme-text-accent); background: rgba(255,182,193,0.1); }
.ai-regenerate:active { transform: scale(0.95); }

/* thinking box — cake renders via v-html, styled in unscoped block below */
.ai-thinking { margin-top: 8px; }
</style>

<!-- 蛋糕卡片（v-html 渲染，必须用非 scoped 样式） -->
<style>
.cake-cot {
  margin: 1.8rem 0 3rem;
  font-family: 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  position: relative;
}

/* === 折叠按钮：悬浮糖霜胶囊 === */
.cake-cot details summary {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 7px 20px 7px 8px;
  background: linear-gradient(180deg, #FFFFFF 0%, #FFF0F5 100%);
  border-radius: 40px;
  color: #D47A9A;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  list-style: none;
  box-shadow:
    0 6px 14px rgba(255, 182, 193, 0.28),
    inset 0 -2px 0 rgba(255, 228, 232, 0.9),
    inset 0 2px 3px #FFFFFF;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
  -webkit-user-select: none;
}
.cake-cot summary::-webkit-details-marker { display: none; }
.cake-cot summary:hover { transform: translateY(-2px) rotate(-1deg); }

.cake-cot .cake-icon {
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 30% 30%, #FFD1DC, #FF8FA8);
  border-radius: 50%;
  font-size: 15px;
  box-shadow:
    inset 0 -3px 4px rgba(180, 80, 110, 0.25),
    inset 0 2px 2px rgba(255, 255, 255, 0.8);
}

/* 展开时按钮微动 */
.cake-cot details[open] summary .cake-icon { animation: cake-wiggle 0.7s ease; }
.cake-cot details[open] summary { margin-bottom: 0; }

/* === 灵魂：展开后的「奶油蛋糕切片」 === */
.cake-cot .cake-slice {
  position: relative;
  margin-top: 32px;
  padding: 38px 32px 34px;
  background:
    radial-gradient(ellipse at 20% 0%, #FFE4EC 0%, transparent 50%),
    radial-gradient(ellipse at 90% 100%, #FFD6E0 0%, transparent 60%),
    linear-gradient(165deg, #FFF5F8 0%, #FFE0E8 100%);
  clip-path: polygon(0 6%, 3% 2%, 8% 5%, 15% 1%, 22% 5%, 30% 1%, 38% 4%, 46% 1%, 54% 5%, 62% 1%, 70% 4%, 78% 2%, 85% 5%, 92% 1%, 100% 5%, 100% 96%, 98% 100%, 2% 100%, 0 96%);
  filter: drop-shadow(0 12px 18px rgba(255, 150, 180, 0.28)) drop-shadow(0 2px 4px rgba(255, 150, 180, 0.15));
  animation: cake-unroll 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* 顶部奶油层 */
.cake-cot .cake-slice::before {
  content: '';
  position: absolute;
  top: 6px; left: 0; right: 0;
  height: 60px;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.95), rgba(255,240,245,0.5) 70%, transparent 100%);
  pointer-events: none;
  z-index: 1;
}

/* 内部便签纸 */
.cake-cot .cake-content {
  position: relative;
  z-index: 2;
  padding: 22px 24px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 14px;
  color: #8A5A6E;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Courier New', 'Source Code Pro', monospace;
  box-shadow:
    0 4px 16px rgba(255, 182, 193, 0.18),
    inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(6px);
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
}

/* 装饰：左侧悬浮的小草莓 */
.cake-cot .cake-strawberry {
  position: absolute;
  top: -8px; left: -6px;
  font-size: 28px;
  transform: rotate(-18deg);
  filter: drop-shadow(0 4px 6px rgba(255, 100, 130, 0.35));
  z-index: 5;
  animation: cake-float 3s ease-in-out infinite;
}

/* === 动画 === */
@keyframes cake-unroll {
  0% { opacity: 0; transform: translateY(-20px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes cake-wiggle {
  0%, 100% { transform: rotate(0); }
  25% { transform: rotate(-12deg) scale(1.1); }
  75% { transform: rotate(12deg) scale(1.1); }
}
@keyframes cake-float {
  0%, 100% { transform: rotate(-18deg) translateY(0); }
  50% { transform: rotate(-15deg) translateY(-4px); }
}

@media (max-width: 480px) {
  .cake-cot .cake-slice { padding: 32px 18px 24px; }
  .cake-cot .cake-content { padding: 16px 16px; font-size: 12px; }
}
</style>

<style scoped>
.user-msg { margin-bottom: 18px; display: flex; flex-direction: column; align-items: flex-end; }
.user-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
.user-time { font-size: 10px; color: rgba(112,88,98,0.45); }
.user-name { font-size: 12px; font-weight: 600; color: var(--theme-text-main); }

/* NPC 名字高亮 */
.ai-body :deep(.npc-mention), .user-body :deep(.npc-mention), .sys-body :deep(.npc-mention) {
  color: #9575cd;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 1px dashed rgba(149,117,205,0.4);
  padding: 0 1px;
  transition: background 0.15s;
}
.ai-body :deep(.npc-mention:hover), .user-body :deep(.npc-mention:hover), .sys-body :deep(.npc-mention:hover) {
  background: rgba(149,117,205,0.1);
  border-bottom-color: #9575cd;
}

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
