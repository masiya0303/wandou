<!-- wandou · 记忆运行时调试面板 -->
<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { getMemoryRuntime, type MemoryRuntimeConfig } from '@/utils/memoryRuntime'
import type { CompilerRuntimeState } from '@/utils/compilerRuntime'

const mr = getMemoryRuntime()

// ---- 标签页 ----
const tab = ref<'overview' | 'events' | 'archives' | 'checkpoints' | 'debug'>('overview')

// ---- 自动刷新 ----
const refreshKey = ref(0)
let interval: ReturnType<typeof setInterval> | null = null
onMounted(() => { interval = setInterval(() => refreshKey.value++, 2000) })
onUnmounted(() => { if (interval) clearInterval(interval) })

// ---- 运行时状态 ----
const rt = computed<CompilerRuntimeState>(() => { void refreshKey.value; return mr?.compilerRuntime || null as any })
const config = computed<MemoryRuntimeConfig>(() => mr?.config)

// ---- 存储用量 ----
const storageUsage = ref({ eventCards: 0, archiveCards: 0, checkpoints: 0, summaries: 0, totalBytes: 0 })
async function refreshStorage() {
  if (mr) storageUsage.value = await mr.estimateStorageUsage()
}
void refreshStorage()

// ---- 操作 ----
async function handleSaveCheckpoint() {
  const label = prompt('检查点标签（可选）：')
  await mr.saveCheckpoint([], label || undefined)
  refreshKey.value++
  void refreshStorage()
}

async function handleRestoreCheckpoint(id: string) {
  if (!confirm(`恢复到检查点 ${id}？当前进度会丢失。`)) return
  const result = await mr.loadCheckpoint(id)
  if (result) {
    alert(`检查点已加载：${result.messages.length} 条消息，运行时已恢复`)
    window.location.reload()
  } else {
    alert('加载失败')
  }
}

async function handleClearWorld() {
  if (!confirm('清除这个世界的所有记忆运行时数据？此操作不可撤销。')) return
  await mr.clearWorld()
  refreshKey.value++
  void refreshStorage()
}

async function handleRunLifecycle() {
  const result = mr.runLifecycle()
  alert(`生命周期：过期 ${result.expired.length} / 归档 ${result.archived.length} / 裁剪 ${result.pruned}`)
  refreshKey.value++
}

// ---- 格式化 ----
function fmtTime(ts: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
function fmtBytes(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
function stateColor(state: string) {
  return state === 'active' ? '#4caf50' : state === 'resolved' ? '#ffa726' : state === 'expired' ? '#9e9e9e' : '#666'
}

// ---- 计算属性 ----
const eventStats = computed(() => {
  if (!rt.value) return { active: 0, resolved: 0, expired: 0 }
  const events = rt.value.eventCards
  return {
    active: events.filter(e => e.state === 'active').length,
    resolved: events.filter(e => e.state === 'resolved').length,
    expired: events.filter(e => e.state === 'expired').length,
    total: events.length,
  }
})

const archiveStats = computed(() => ({
  total: rt.value?.archiveCards?.length || 0,
}))

const checkpointList = computed(() => mr?.checkpoints || [])
</script>

<template>
  <div class="mem-debug">
    <!-- 顶部状态栏 -->
    <div class="status-bar">
      <span class="stat">
        <span class="stat-label">事件卡</span>
        <span class="stat-value">{{ eventStats.total }}</span>
        <span class="stat-sub">活跃:{{ eventStats.active }} 已解析:{{ eventStats.resolved }}</span>
      </span>
      <span class="stat">
        <span class="stat-label">档案卡</span>
        <span class="stat-value">{{ archiveStats.total }}</span>
      </span>
      <span class="stat">
        <span class="stat-label">检查点</span>
        <span class="stat-value">{{ checkpointList.length }}</span>
      </span>
      <span class="stat">
        <span class="stat-label">存储</span>
        <span class="stat-value">{{ fmtBytes(storageUsage.totalBytes) }}</span>
      </span>
      <span class="stat">
        <span class="stat-label">世界轮次</span>
        <span class="stat-value">第{{ mr?.turnIndex || 0 }}轮</span>
      </span>
      <span class="stat" v-if="mr?.summary">
        <span class="stat-label">摘要</span>
        <span class="stat-value">{{ mr.summary.text.length }}字</span>
      </span>
    </div>

    <!-- 标签页 -->
    <div class="tabs">
      <button :class="{ active: tab === 'overview' }" @click="tab = 'overview'">概览</button>
      <button :class="{ active: tab === 'events' }" @click="tab = 'events'">事件 ({{ eventStats.total }})</button>
      <button :class="{ active: tab === 'archives' }" @click="tab = 'archives'">档案 ({{ archiveStats.total }})</button>
      <button :class="{ active: tab === 'checkpoints' }" @click="tab = 'checkpoints'">检查点 ({{ checkpointList.length }})</button>
      <button :class="{ active: tab === 'debug' }" @click="tab = 'debug'">调试日志</button>
    </div>

    <!-- 概览 -->
    <div v-if="tab === 'overview'" class="panel">
      <div class="section">
        <div class="section-title">📋 场景</div>
        <div class="card">{{ rt?.sceneAnchor?.location || '未知' }} | {{ rt?.sceneAnchor?.time || '未知' }} | {{ rt?.sceneAnchor?.weather || '晴朗' }}</div>
      </div>

      <div class="section">
        <div class="section-title">🎯 活跃线程</div>
        <div class="card" v-if="!rt?.activeThreads?.length">无活跃线程</div>
        <div v-for="t in rt?.activeThreads || []" :key="t.id" class="card card-sm">
          <span>[{{ t.questType }}]</span>
          <strong>{{ t.title }}</strong>
          <span class="dim">来源:{{ t.source }}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">📊 状态槽</div>
        <div class="card" v-if="!rt?.stateSlots?.length">无状态槽</div>
        <div v-for="s in (rt?.stateSlots || []).slice(0, 12)" :key="s.id" class="card card-sm">
          <span>{{ s.scopeName }}</span>
          <span class="dim">{{ s.slotType }}: {{ s.value }}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">👤 实体卡</div>
        <div v-for="e in (rt?.entityCards || []).filter(c => c.category !== '离场')" :key="e.id" class="card card-sm">
          <strong>{{ e.name }}</strong>
          <span class="dim">{{ e.role }}</span>
          <span class="tag" :class="e.category === '重点' ? 'tag-focus' : 'tag-present'">{{ e.category }}</span>
        </div>
        <div v-if="(rt?.entityCards || []).filter(c => c.category !== '离场').length === 0" class="card">无活跃实体</div>
      </div>

      <div class="actions">
        <button @click="handleRunLifecycle">🔄 运行生命周期</button>
        <button @click="handleSaveCheckpoint">💾 保存检查点</button>
        <button @click="handleClearWorld" class="danger">🗑️ 清除运行时数据</button>
        <button @click="refreshStorage">🔍 刷新存储用量</button>
      </div>
    </div>

    <!-- 事件卡 -->
    <div v-if="tab === 'events'" class="panel">
      <div v-if="!rt?.eventCards?.length" class="card">无事件卡</div>
      <div v-for="e in rt?.eventCards || []" :key="e.id" class="card event-card">
        <div class="event-head">
          <span class="event-state" :style="{ color: stateColor(e.state) }">● {{ e.state }}</span>
          <span class="event-importance">⭐{{ e.importance }}</span>
          <span class="event-time">[{{ e.timeLabel }}]</span>
        </div>
        <div class="event-summary">{{ e.summary }}</div>
        <div class="event-meta">
          <span v-if="e.entities.length">实体: {{ e.entities.join('、') }}</span>
          <span v-if="e.keywords.length">关键词: {{ e.keywords.join('、') }}</span>
          <span class="dim">分类: {{ e.category }}</span>
        </div>
      </div>
    </div>

    <!-- 档案卡 -->
    <div v-if="tab === 'archives'" class="panel">
      <div v-if="!rt?.archiveCards?.length" class="card">无档案卡</div>
      <div v-for="a in rt?.archiveCards || []" :key="a.id" class="card">
        <div class="event-head">
          <span class="event-importance">⭐{{ a.importance }}</span>
          <span class="event-time">[{{ a.timeSpan }}]</span>
          <span class="tag tag-archive">{{ a.source === 'vector_retrieval' ? '🔍向量' : a.source === 'world_book' ? '📖世界书' : '🧠记忆' }}</span>
        </div>
        <div class="event-summary">{{ a.arcTitle }}</div>
        <div class="event-summary dim">{{ a.summary }}</div>
        <div class="event-meta" v-if="a.entities.length || a.keywords.length">
          <span v-if="a.entities.length">实体: {{ a.entities.join('、') }}</span>
          <span v-if="a.keywords.length">关键词: {{ a.keywords.join('、') }}</span>
        </div>
      </div>
    </div>

    <!-- 检查点 -->
    <div v-if="tab === 'checkpoints'" class="panel">
      <div v-if="checkpointList.length === 0" class="card">无检查点（每 12 轮自动保存）</div>
      <div v-for="cp in checkpointList" :key="cp.id" class="card checkpoint-card">
        <div class="cp-head">
          <strong>{{ cp.label || cp.id }}</strong>
          <span class="dim">{{ fmtTime(cp.createdAt) }}</span>
        </div>
        <div class="cp-meta">
          <span>第 {{ cp.turnIndex }} 轮</span>
          <span>{{ cp.messageCount }} 条消息</span>
          <span>{{ cp.memoryCount }} 张卡片</span>
        </div>
        <button class="cp-restore" @click="handleRestoreCheckpoint(cp.id)">📂 恢复</button>
      </div>
    </div>

    <!-- 调试日志 -->
    <div v-if="tab === 'debug'" class="panel">
      <div v-if="(mr?.debugLogs || []).length === 0" class="card">无调试日志</div>
      <div v-for="log in (mr?.debugLogs || []).slice(-50)" :key="log.ts" class="card debug-line">
        <span class="dim">{{ fmtTime(log.ts) }}</span>
        <span class="tag tag-stage">{{ log.stage }}</span>
        <span>{{ log.message }}</span>
      </div>
    </div>

    <!-- 配置摘要 -->
    <div class="config-summary">
      <span class="dim">持久化: {{ config?.persistenceEnabled ? '✅IndexedDB' : '❌内存' }}</span>
      <span class="dim">DB: {{ config?.dbName }}</span>
      <span class="dim">检查点间隔: {{ config?.lifecycle?.checkpointInterval }}轮</span>
      <span class="dim">最大热事件: {{ config?.lifecycle?.maxHotEventCards }}</span>
    </div>
  </div>
</template>

<style scoped>
.mem-debug {
  display: flex; flex-direction: column; gap: 10px;
  font-size: 12px; color: var(--theme-text-main);
  height: 100%; overflow-y: auto; overflow-x: hidden;
}

.status-bar {
  display: flex; flex-wrap: wrap; gap: 8px;
  padding: 10px 12px; border-radius: 10px;
  background: rgba(255,255,255,0.6); border: 1px solid var(--theme-border-ice);
}
.stat { display: flex; flex-direction: column; gap: 2px; min-width: 60px; }
.stat-label { font-size: 10px; color: var(--theme-text-main); opacity: 0.5; text-transform: uppercase; }
.stat-value { font-size: 16px; font-weight: 700; color: var(--theme-text-accent); }
.stat-sub { font-size: 10px; opacity: 0.5; }

.tabs {
  display: flex; gap: 4px; flex-wrap: wrap;
}
.tabs button {
  padding: 5px 12px; border: 1px solid var(--theme-border-ice);
  border-radius: 8px; background: rgba(255,255,255,0.5);
  color: var(--theme-text-main); cursor: pointer; font-size: 11px; font-family: inherit;
  transition: all 0.15s;
}
.tabs button.active { background: var(--theme-text-accent); color: #fff; border-color: transparent; }
.tabs button:active { transform: scale(0.96); }

.panel { display: flex; flex-direction: column; gap: 6px; }
.section { display: flex; flex-direction: column; gap: 4px; }
.section-title { font-size: 11px; font-weight: 600; color: var(--theme-text-accent); opacity: 0.7; padding: 4px 0; }

.card {
  padding: 8px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.5); border: 1px solid var(--theme-border-ice);
  font-size: 11px; line-height: 1.5;
}
.card-sm { padding: 4px 10px; }
.event-card { display: flex; flex-direction: column; gap: 4px; }

.event-head, .cp-head { display: flex; align-items: center; gap: 8px; }
.event-state { font-size: 10px; }
.event-importance { font-size: 10px; opacity: 0.6; }
.event-time { font-size: 10px; opacity: 0.4; }
.event-summary { color: var(--theme-text-main); }
.event-meta { font-size: 10px; opacity: 0.5; }

.tag { padding: 1px 6px; border-radius: 4px; font-size: 9px; }
.tag-focus { background: rgba(149,117,205,0.15); color: #9575cd; }
.tag-present { background: rgba(76,175,80,0.1); color: #4caf50; }
.tag-archive { background: rgba(255,167,38,0.1); color: #ffa726; }
.tag-stage { background: rgba(33,150,243,0.1); color: #2196f3; }

.dim { opacity: 0.5; }

.actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.actions button {
  padding: 6px 14px; border: 1px solid var(--theme-border-light); border-radius: 8px;
  background: rgba(255,255,255,0.6); color: var(--theme-text-main);
  font-size: 11px; cursor: pointer; font-family: inherit;
  transition: all 0.15s;
}
.actions button:active { transform: scale(0.96); }
.actions button.danger { border-color: #e88; color: #e55; }

.checkpoint-card { display: flex; flex-direction: column; gap: 4px; }
.cp-meta { font-size: 10px; opacity: 0.5; display: flex; gap: 8px; }
.cp-restore {
  align-self: flex-start; padding: 3px 10px; border-radius: 6px;
  border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.7);
  color: var(--theme-text-main); font-size: 10px; cursor: pointer; font-family: inherit;
}
.cp-restore:active { background: #2196f3; color: #fff; }

.debug-line { display: flex; gap: 8px; align-items: baseline; }

.config-summary {
  padding: 8px 12px; border-radius: 8px;
  background: rgba(255,255,255,0.3); border: 1px dashed var(--theme-border-ice);
  display: flex; flex-wrap: wrap; gap: 12px; font-size: 10px; margin-top: 8px;
}
</style>
