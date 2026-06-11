<!-- wandou · 世界详情页 -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import type { WorldBookEntry } from '../types/worldBook'
import { importWorldBook } from '../utils/worldBookEngine'
import { importNpcJson } from '../utils/npcEngine'

const store = useGameStore()
const error = ref(''); const saving = ref(false)
const editName = ref(store.worldName)
const editDesc = ref(store.worldDescription)
const pcJson = ref(''); const showPc = ref(false); const pcFi = ref<HTMLInputElement | null>(null)
const npcJson = ref(''); const showNpc = ref(false); const npcFi = ref<HTMLInputElement | null>(null)
const wbJson = ref(''); const showWb = ref(false); const wbFi = ref<HTMLInputElement | null>(null)

function handleFile(r: string, e: Event) {
  const i = e.target as HTMLInputElement; const f = i.files?.[0]; if (!f) return
  const reader = new FileReader()
  reader.onload = () => { if (r==='pc'){pcJson.value=reader.result as string;showPc.value=true;importPc()} else if(r==='npc'){npcJson.value=reader.result as string;showNpc.value=true;importNpcs()} else{wbJson.value=reader.result as string;showWb.value=true;importWb()} }
  reader.readAsText(f); i.value=''
}
function importPc() { if(!pcJson.value.trim())return;const r=importNpcJson(pcJson.value);if(r.success&&r.entries.length>0){const c=r.entries[0];const bg=[c.personality,c.appearance,c.role,c.background].filter(Boolean).join('\n');store.updateCharacter({name:c.name||'探险者',age:store.character.age,gender:store.character.gender,background:bg||store.character.background});pcJson.value='';showPc.value=false}else{error.value='角色卡导入失败'} }
function importNpcs() { if(!npcJson.value.trim())return;const r=importNpcJson(npcJson.value);if(r.success&&r.entries.length>0)store.addNpcEntries(r.entries);npcJson.value='';showNpc.value=false }
function importWb() { if(!wbJson.value.trim())return;const r=importWorldBook(wbJson.value);if(r.success&&r.entries.length>0)store.addWorldBookEntries(r.entries);wbJson.value='';showWb.value=false }
const editingWbId = ref<string|null>(null); const editWbComment=ref(''); const editWbKeys=ref(''); const editWbContent=ref('')
function startEditWb(e: WorldBookEntry){editingWbId.value=e.id;editWbComment.value=e.comment||'';editWbKeys.value=e.keys.join(', ');editWbContent.value=e.content}
function saveEditWb(){const id=editingWbId.value;if(!id)return;const e=store.worldBook.find(x=>x.id===id);if(!e)return;e.comment=editWbComment.value.trim();e.keys=editWbKeys.value.split(',').map(k=>k.trim()).filter(Boolean);e.content=editWbContent.value.trim();autoSave();cancelEditWb()}
function cancelEditWb(){editingWbId.value=null}
function autoSave(){store.autoSave()}
const apiKey=ref(store.apiConfig.apiKey||''); const apiUrl=ref(store.apiConfig.baseUrl||'https://api.openai.com'); const apiModel=ref(store.apiConfig.model||'gpt-4o-mini'); const showApi=ref(false)
async function handleEnterGame(){error.value='';if(!editName.value.trim()){error.value='请输入世界名称';return};saving.value=true;store.updateWorldInfo(editName.value.trim(),editDesc.value.trim());store.updateApiConfig({apiKey:apiKey.value.trim(),baseUrl:apiUrl.value.trim()||'https://api.openai.com',model:apiModel.value.trim()||'gpt-4o-mini'});await store.autoSave();store.startPlaying()}
async function handleDeleteWorld(){if(!confirm(`确定删除世界「${store.worldName}」？`))return;await store.deleteWorld(store.currentWorldId!);store.phase='worldList'}
function handleExport(){const json=store.exportWorld();if(!json){error.value='导出失败';return};const blob=new Blob([json],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${store.worldName||'world'}.json`;a.click();URL.revokeObjectURL(url)}
async function goBack(){saving.value=true;store.updateWorldInfo(editName.value.trim()||store.worldName,editDesc.value.trim());store.updateApiConfig({apiKey:apiKey.value.trim(),baseUrl:apiUrl.value.trim()||'https://api.openai.com',model:apiModel.value.trim()||'gpt-4o-mini'});await store.autoSave();saving.value=false;store.previousPhase==='playing'?store.phase='playing':store.phase='worldList'}
</script>

<template>
  <div class="screen">
    <div class="bg-vignette"></div>
    <div class="container">
      <header class="top">
        <button class="btn-back" @click="goBack" :disabled="saving">← 返回</button>
        <h1>🪐 {{ store.worldName || '新世界' }}</h1>
        <span></span>
      </header>

      <div class="sec">
        <div class="sec-title"><span class="cn">📝 世界信息</span><span class="en">WORLD INFO</span></div>
        <input v-model="editName" class="fi" placeholder="世界名称" />
        <textarea v-model="editDesc" class="fi ta" rows="2" placeholder="世界描述..."></textarea>
      </div>

      <div class="sec">
        <div class="sec-title"><span class="cn">🎭 玩家角色</span><span class="en">PLAYER</span><span class="badge" v-if="store.character.name">{{ store.character.name }}</span></div>
        <div class="btns"><button class="act" @click="showPc=!showPc">📥 导入</button><button class="act" @click="pcFi?.click()">📁 文件</button><input ref="pcFi" type="file" accept=".json" hidden @change="handleFile('pc',$event)" /></div>
        <div v-if="showPc" class="imp"><textarea v-model="pcJson" class="ita" placeholder="粘贴角色卡 JSON..." rows="2"></textarea><button class="act go" @click="importPc" :disabled="!pcJson.trim()">导入</button></div>
        <div v-if="store.character.name" class="char-card"><span class="cc-name">{{ store.character.name }}</span><p v-if="store.character.background" class="cc-bg">{{ store.character.background }}</p></div>
        <div v-else class="empty">导入角色卡 JSON 设置玩家角色</div>
      </div>

      <div class="sec">
        <div class="sec-title"><span class="cn">👥 NPC 角色书</span><span class="en">NPC CARDS</span><span class="badge">{{ store.npcs.filter(n=>n.enabled).length }}/{{ store.npcs.length }}</span></div>
        <div class="btns"><button class="act" @click="showNpc=!showNpc">📥 导入</button><button class="act" @click="npcFi?.click()">📁 文件</button><input ref="npcFi" type="file" accept=".json" hidden @change="handleFile('npc',$event)" /></div>
        <div v-if="showNpc" class="imp"><textarea v-model="npcJson" class="ita" placeholder="粘贴 NPC JSON..." rows="2"></textarea><button class="act go" @click="importNpcs" :disabled="!npcJson.trim()">导入</button></div>
        <div v-if="store.npcs.length===0" class="empty">暂无 NPC</div>
        <div v-for="n in store.npcs" :key="n.id" :class="['entry',{off:!n.enabled}]">
          <div class="er"><button class="tg" @click="store.toggleNpc(n.id)">{{n.enabled?'✅':'⛔'}}</button><div class="ei"><span class="enm">{{n.name}}</span><span v-if="n.role" class="erl">{{n.role}}</span></div><button class="edel" @click="store.removeNpc(n.id)">🗑️</button></div>
        </div>
      </div>

      <div class="sec">
        <div class="sec-title"><span class="cn">📖 世界书</span><span class="en">WORLD BOOK</span><span class="badge">{{ store.worldBook.filter(e=>e.enabled).length }}/{{ store.worldBook.length }}</span></div>
        <div class="btns"><button class="act" @click="showWb=!showWb">📥 导入</button><button class="act" @click="wbFi?.click()">📁 文件</button><input ref="wbFi" type="file" accept=".json" hidden @change="handleFile('wb',$event)" /></div>
        <div v-if="showWb" class="imp"><textarea v-model="wbJson" class="ita" placeholder="粘贴世界书 JSON..." rows="2"></textarea><button class="act go" @click="importWb" :disabled="!wbJson.trim()">导入</button></div>
        <div v-if="store.worldBook.length===0" class="empty">暂无世界书条目</div>
        <div v-for="e in store.worldBook" :key="e.id" :class="['entry',{off:!e.enabled}]">
          <div class="er">
            <button class="tg" @click="store.toggleWorldBookEntry(e.id)">{{e.enabled?'✅':'⛔'}}</button>
            <div class="ei" style="flex:1;min-width:0"><span class="enm">{{e.comment||'未命名'}}</span><span style="font-size:10px;color:var(--pink-primary);opacity:0.5">{{e.keys.slice(0,3).join(' / ')}}{{e.keys.length>3?'...':''}}</span></div>
            <span class="pri">{{e.position==='at_constant'?'📌':'#'+e.priority}}</span>
            <button class="edl" @click="editingWbId===e.id?cancelEditWb():startEditWb(e)">{{editingWbId===e.id?'✕':'✏️'}}</button>
            <button class="edel" @click="store.removeWorldBookEntry(e.id)">🗑️</button>
          </div>
          <div v-if="editingWbId===e.id" class="edit-row">
            <input v-model="editWbComment" class="edit-fi" placeholder="条目名称" />
            <input v-model="editWbKeys" class="edit-fi" placeholder="关键词，逗号分隔" />
            <textarea v-model="editWbContent" class="edit-ta" rows="4" placeholder="内容..."></textarea>
            <div class="edit-btns"><button class="edit-save" @click="saveEditWb">💾 保存</button><span class="edit-hint">关键词逗号分隔</span></div>
          </div>
          <p v-else class="ep">{{e.content.slice(0,80)}}{{e.content.length>80?'...':''}}</p>
        </div>
      </div>

      <div class="sec">
        <div class="sec-title clickable" @click="showApi=!showApi"><span class="cn">🔌 API 配置</span><span class="en">API CONFIG</span><span class="badge">{{apiKey?'●●●'+apiKey.slice(-4):'未配置'}}</span></div>
        <div v-if="showApi"><input v-model="apiKey" type="password" class="fi" placeholder="API Key (sk-...)" /><div class="fi-row"><input v-model="apiUrl" class="fi flex-2" placeholder="https://api.openai.com" /><input v-model="apiModel" class="fi flex-1" placeholder="gpt-4o-mini" /></div></div>
      </div>

      <p v-if="error" class="err">{{error}}</p>
      <div class="bottom">
        <button class="btn-enter" @click="handleEnterGame" :disabled="saving"><span class="cn">{{saving?'⏳ 保存中...':'🚀 启程'}}</span><span class="en">START ADVENTURE</span></button>
        <button class="btn-exp" @click="handleExport">📤 导出世界</button>
        <button class="btn-del" @click="handleDeleteWorld">🗑️ 删除世界</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen { height: 100vh; position: relative; overflow-y: auto; overflow-x: hidden; background: url('/splash-bg.png') center/cover no-repeat; }
.container { position: relative; z-index: 1; max-width: 640px; width: 100%; margin: 0 auto; padding: 16px 18px 32px; display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; align-items: center; justify-content: space-between; }
.top h1 { font-size: 20px; color: #e0e8ff; margin: 0; }
.btn-back { padding: 6px 14px; border-radius: 9999px; border: 1px solid var(--pink-ice); background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 13px; cursor: pointer; font-family: inherit; }
.btn-back:disabled { opacity: 0.4; }

.sec { padding: 14px 16px; border-radius: 16px; background: rgba(255,255,255,0.7); border: 1px solid var(--pink-ice); }
.sec-title { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.clickable { cursor: pointer; }
.cn { font-size: 14px; font-weight: 600; color: var(--pink-primary); }
.en { font-size: 10px; color: var(--pink-primary); opacity: 0.4; letter-spacing: 0.1em; }
.badge { font-size: 11px; color: var(--pink-primary); opacity: 0.45; margin-left: auto; }

.fi { width: 100%; padding: 8px 10px; border: 1px solid var(--pink-ice); border-radius: 10px; background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 14px; font-family: inherit; box-sizing: border-box; margin-bottom: 6px; }
.fi:focus { outline: none; border-color: var(--pink-accent); }
.ta { resize: vertical; min-height: 36px; }
.fi-row { display: flex; gap: 6px; }
.flex-1 { flex: 1; } .flex-2 { flex: 2; }

.btns { display: flex; gap: 6px; margin-bottom: 6px; }
.act { padding: 4px 10px; border-radius: 9999px; border: 1px solid var(--pink-light); background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.act:active { transform: scale(0.96); }
.go { background: rgba(255,128,168,0.08); border-color: rgba(255,128,168,0.25); color: var(--pink-accent); }
.go:disabled { opacity: 0.3; }
.imp { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; padding: 8px; background: rgba(255,255,255,0.4); border-radius: 10px; }
.ita { width: 100%; padding: 6px 8px; border: 1px solid var(--pink-ice); border-radius: 8px; background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; font-family: monospace; resize: vertical; box-sizing: border-box; }

.char-card { padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.5); }
.cc-name { font-size: 14px; font-weight: 600; color: var(--pink-primary); }
.cc-bg { font-size: 12px; color: var(--pink-primary); opacity: 0.65; line-height: 1.5; margin: 4px 0 0; white-space: pre-wrap; }

.empty { text-align: center; padding: 8px; font-size: 12px; color: var(--pink-primary); opacity: 0.4; }
.entry { padding: 6px 8px; border-radius: 10px; background: rgba(255,255,255,0.4); margin-bottom: 4px; transition: transform 0.2s; }
.entry:active { transform: scale(0.98); }
.entry.off { opacity: 0.4; }
.er { display: flex; align-items: center; gap: 6px; }
.tg { background: none; border: none; font-size: 14px; cursor: pointer; padding: 0; }
.ei { flex: 1; display: flex; flex-direction: column; gap: 1px; }
.enm { font-size: 13px; font-weight: 600; color: var(--pink-primary); }
.erl { font-size: 11px; color: var(--pink-accent); }
.pri { font-size: 11px; color: var(--pink-primary); opacity: 0.4; }
.edel { background: none; border: none; cursor: pointer; font-size: 12px; opacity: 0.3; padding: 0; }
.edel:active { opacity: 0.8; }
.edl { background: none; border: none; cursor: pointer; font-size: 12px; opacity: 0.35; padding: 0; margin-right: 2px; }
.edl:active { opacity: 0.8; }

.edit-row { margin-top: 8px; padding-left: 24px; display: flex; flex-direction: column; gap: 6px; }
.edit-fi { width: 100%; padding: 5px 8px; border: 1px solid var(--pink-ice); border-radius: 6px; background: rgba(255,255,255,0.7); color: var(--pink-primary); font-size: 12px; font-family: inherit; box-sizing: border-box; }
.edit-fi:focus { outline: none; border-color: var(--pink-accent); }
.edit-ta { width: 100%; padding: 6px 8px; border: 1px solid var(--pink-ice); border-radius: 6px; background: rgba(255,255,255,0.7); color: var(--pink-primary); font-size: 12px; font-family: monospace; resize: vertical; box-sizing: border-box; min-height: 60px; }
.edit-ta:focus { outline: none; border-color: var(--pink-accent); }
.edit-btns { display: flex; align-items: center; gap: 8px; }
.edit-save { padding: 4px 12px; border: none; border-radius: 6px; background: var(--pink-accent); color: #fff; font-size: 12px; cursor: pointer; font-family: inherit; }
.edit-save:active { transform: scale(0.96); }
.edit-hint { font-size: 10px; color: var(--pink-primary); opacity: 0.4; }
.ep { font-size: 11px; color: var(--pink-primary); opacity: 0.55; margin: 4px 0 0; padding-left: 24px; line-height: 1.4; }
.err { color: #e55; font-size: 12px; text-align: center; margin: 0; }

.bottom { display: flex; flex-direction: column; gap: 8px; align-items: center; padding-top: 8px; }
.btn-enter { width: 100%; padding: 12px; border: 2px solid var(--pink-accent); border-radius: 9999px; background: rgba(255,128,168,0.1); color: var(--pink-accent); cursor: pointer; font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 2px; transition: all 0.3s; }
.btn-enter:active:not(:disabled) { background: rgba(255,128,168,0.2); transform: scale(0.97); }
.btn-enter:disabled { opacity: 0.5; }
.btn-enter .cn { font-size: 16px; font-weight: 600; }
.btn-enter .en { font-size: 10px; letter-spacing: 0.15em; }
.btn-exp { padding: 6px 16px; border: 1px solid var(--pink-light); border-radius: 9999px; background: rgba(255,255,255,0.5); color: var(--pink-primary); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-exp:active { background: var(--pink-ice); }
.btn-del { padding: 6px 16px; border: 1px solid #ecc; border-radius: 9999px; background: transparent; color: #c88; font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-del:active { background: rgba(200,80,80,0.1); }
</style>
