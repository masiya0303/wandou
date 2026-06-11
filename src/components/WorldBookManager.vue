<!-- wandou · 世界书管理 -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'

const store = useGameStore()
const view = ref('list')
const loadingBook = ref(false)
const searchText = ref('')
const filteredEntries = computed(() => {
  const q = searchText.value.toLowerCase().trim()
  if (!q) return activeEntries.value
  return activeEntries.value.filter((e: any) =>
    (e.comment||'').toLowerCase().includes(q) || e.keys.some((k:string)=>k.toLowerCase().includes(q)) || e.content.toLowerCase().includes(q)
  )
})

async function openBook(target: string) {
  if (target !== 'global') { loadingBook.value = true; await store.loadWorldBookOnly(target); loadingBook.value = false }
  view.value = target
}
function backToList() { view.value = 'list' }

const importText = ref(''); const showImport = ref(false); const importResult = ref<{imported:number;errors:string[]}|null>(null); const fileInput = ref<HTMLInputElement|null>(null)
function handleImport() { importResult.value = null; if(!importText.value.trim())return; const result = importWorldBook(importText.value); if(result.success&&result.entries.length>0){if(view.value==='global')store.addGlobalWorldBookEntries(result.entries);else store.addWorldBookEntries(result.entries)} importResult.value = {imported:result.imported,errors:result.errors}; if(result.imported>0)importText.value='' }
function onFile(e:Event) { const input=e.target as HTMLInputElement; const file=input.files?.[0]; if(!file)return; const reader=new FileReader(); reader.onload=()=>{importText.value=reader.result as string;showImport.value=true;handleImport()}; reader.readAsText(file); input.value='' }

const activeEntries = computed(() => view.value==='global'?store.globalWorldBook:store.worldBook)
const activeTitle = computed(() => { if(view.value==='global')return'🌐 全局世界书'; const w=store.worldList.find(x=>x.id===view.value); return w?`📖 ${w.name}`:'世界书' })
function toggle(id:string){view.value==='global'?store.toggleGlobalWorldBookEntry(id):store.toggleWorldBookEntry(id)}
function remove(id:string){view.value==='global'?store.removeGlobalWorldBookEntry(id):store.removeWorldBookEntry(id)}
function reset(){view.value==='global'?store.resetGlobalWorldBook():store.resetWorldBook()}
const activeEnabledCount = computed(() => activeEntries.value.filter((e:any)=>e.enabled).length)
</script>

<template>
  <div class="wb">
    <!-- 书列表 -->
    <template v-if="view==='list'">
      <div class="book-list">
        <button class="book-card" @click="openBook('global')">
          <span class="bk-icon">🌐</span>
          <div class="bk-info">
            <span class="bk-name">全局世界书</span>
            <span class="bk-meta">{{ store.globalWorldBook.filter((e:any)=>e.enabled).length }}/{{ store.globalWorldBook.length }} 条 · 所有世界生效</span>
          </div>
          <span class="bk-arrow">→</span>
        </button>
        <button v-for="w in store.worldList" :key="w.id" class="book-card" @click="openBook(w.id)">
          <span class="bk-icon">📖</span>
          <div class="bk-info"><span class="bk-name">{{ w.name }}</span><span class="bk-meta">世界书（点击查看条目）</span></div>
          <span class="bk-arrow">→</span>
        </button>
        <div v-if="store.worldList.length===0" class="empty">暂无世界，创建世界后这里会出现对应的世界书</div>
      </div>
    </template>

    <!-- 条目列表 -->
    <template v-else>
      <div class="entry-view">
        <div class="ev-header">
          <button class="btn-back" @click="backToList">← 返回书列表</button>
          <h3>{{ activeTitle }}</h3>
          <span class="cnt">{{ activeEnabledCount }}/{{ activeEntries.length }}</span>
        </div>
        <div class="bar">
          <input v-model="searchText" class="search-fi" placeholder="搜索关键词..." />
        </div>
        <div class="bar">
          <button class="act" @click="showImport=!showImport">📥 导入</button>
          <button class="act" @click="fileInput?.click()">📁 文件</button>
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="onFile" />
          <button class="act" @click="reset">🔄 重置</button>
        </div>
        <div v-if="showImport" class="imp">
          <textarea v-model="importText" class="ta" placeholder="粘贴 JSON 数组..." rows="3"></textarea>
          <div class="ir">
            <button class="act go" @click="handleImport" :disabled="!importText.trim()">导入</button>
            <span v-if="importResult" class="fb" :class="{w:importResult.errors.length}">
              <template v-if="importResult.imported">✅ {{ importResult.imported }} 条</template>
              <template v-if="importResult.errors.length"> ⚠️ {{ importResult.errors.length }} 失败</template>
            </span>
          </div>
        </div>
        <div v-if="activeEntries.length===0" class="empty">📭 暂无条目</div>
        <div class="list">
          <div v-for="e in filteredEntries" :key="e.id" :class="['card',{off:!e.enabled}]">
            <div class="r1">
              <button class="tg" @click="toggle(e.id)">{{ e.enabled?'✅':'⛔' }}</button>
              <div class="i">
                <span class="nm">{{ e.comment||'（未命名条目）' }}</span>
                <div class="ks">
                  <span v-for="k in e.keys.slice(0,5)" :key="k" class="kt">{{ k }}</span>
                  <span v-if="e.keys.length>5" class="kt">+{{ e.keys.length-5 }}</span>
                </div>
              </div>
              <span class="pri">{{ e.position==='at_constant'?'📌':'#'+e.priority }}</span>
              <button class="del" @click="remove(e.id)">🗑️</button>
            </div>
            <p class="pre">{{ e.content.slice(0,100) }}{{ e.content.length>100?'...':'' }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb { height: 100%; color: var(--pink-primary); }

/* ---- 书列表 ---- */
.book-list { display: flex; flex-direction: column; gap: 10px; }
.book-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; border-radius: 16px; cursor: pointer; transition: all 0.25s;
  width: 100%; font-family: inherit; text-align: left;
  background: rgba(255,255,255,0.55); border: 1px solid var(--pink-ice);
}
.book-card:active { border-color: var(--pink-accent); background: rgba(255,255,255,0.75); }
.bk-icon { font-size: 22px; }
.bk-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.bk-name { font-size: 15px; font-weight: 600; color: var(--pink-primary); }
.bk-meta { font-size: 11px; color: var(--pink-primary); opacity: 0.5; }
.bk-arrow { font-size: 14px; color: var(--pink-primary); opacity: 0.35; transition: all 0.3s; }
.book-card:active .bk-arrow { opacity: 0.8; transform: translateX(4px); }

/* ---- 条目视图 ---- */
.entry-view { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.ev-header { display: flex; align-items: center; gap: 10px; }
.ev-header h3 { font-size: 16px; color: var(--pink-primary); margin: 0; flex: 1; }
.cnt { font-size: 12px; color: var(--pink-primary); opacity: 0.45; }
.btn-back { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--pink-ice); background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-back:active { background: var(--pink-ice); }

.bar { display: flex; gap: 6px; }
.search-fi { flex: 1; padding: 6px 10px; border: 1px solid var(--pink-ice); border-radius: 20px; background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; font-family: inherit; }
.search-fi:focus { outline: none; border-color: var(--pink-accent); }
.search-fi::placeholder { color: var(--pink-primary); opacity: 0.3; }
.act { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--pink-ice); background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.act:active { background: var(--pink-ice); }
.go { background: rgba(255,128,168,0.08); border-color: rgba(255,128,168,0.25); color: var(--pink-accent); }
.go:disabled { opacity: 0.3; }

.imp { padding: 8px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.4); }
.ta { width: 100%; padding: 6px 8px; border: 1px solid var(--pink-ice); border-radius: 8px; background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; font-family: monospace; resize: vertical; box-sizing: border-box; }
.ta:focus { outline: none; border-color: var(--pink-accent); }
.ir { display: flex; align-items: center; gap: 8px; }
.fb { font-size: 11px; color: var(--success); }
.fb.w { color: var(--warning); }

.empty { text-align: center; padding: 32px 16px; font-size: 13px; opacity: 0.5; }
.list { display: flex; flex-direction: column; gap: 5px; flex: 1; overflow-y: auto; }
.card { padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,0.4); border: 1px solid var(--pink-ice); transition: all 0.15s; }
.card.off { opacity: 0.4; }
.card:active:not(.off) { background: rgba(255,255,255,0.6); }
.r1 { display: flex; align-items: flex-start; gap: 6px; }
.tg { background: none; border: none; font-size: 14px; cursor: pointer; padding: 0; line-height: 1; }
.i { flex: 1; min-width: 0; }
.nm { font-size: 13px; font-weight: 600; color: var(--pink-primary); }
.ks { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.kt { font-size: 10px; padding: 2px 6px; background: rgba(255,128,168,0.06); border: 1px solid rgba(255,128,168,0.18); border-radius: 10px; color: var(--pink-accent); }
.pri { font-size: 11px; color: var(--pink-primary); opacity: 0.4; }
.del { background: none; border: none; cursor: pointer; font-size: 12px; opacity: 0.3; }
.del:active { opacity: 1; }
.pre { font-size: 11px; color: var(--pink-primary); opacity: 0.5; margin: 4px 0 0; padding-left: 22px; line-height: 1.4; }
</style>
