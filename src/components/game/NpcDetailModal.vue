<!-- wandou · NPC 详情弹窗 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useNpcStore } from '@/stores/npcStore'
import type { NpcEntry, NpcCategory } from '@/types/npc'

const props = defineProps<{ npc: NpcEntry }>()
const emit = defineEmits<{ close: [] }>()

const npcStore = useNpcStore()

const category = computed(() => npcStore.getNpcCategory(props.npc))
const recentChronicles = computed(() => npcStore.getRecentChronicles(props.npc.id, 10))

const CAT_LABEL: Record<string, string> = { '在场': '🟢 在场', '离场': '💤 离场', '重点': '⭐ 重点角色' }
const FAVOR_LABEL = (f: number) => {
  if (f >= 80) return '❤️‍🔥 挚爱'
  if (f >= 50) return '❤️ 信赖'
  if (f >= 30) return '💛 友好'
  if (f >= 0) return '🤝 中立'
  if (f >= -30) return '💙 冷淡'
  if (f >= -50) return '💜 警惕'
  return '🖤 敌视'
}

// 是否有任何额外内容（性格/外貌/背景/关系/介绍/性经历/世界属性/事迹）
const hasExtra = computed(() =>
  !!(props.npc.personality || props.npc.appearance || props.npc.background ||
     props.npc.relationToPlayer || props.npc.characterIntro || props.npc.sexualExperience ||
     (props.npc.extraAttributes && Object.keys(props.npc.extraAttributes).length > 0) ||
     (props.npc.人物事迹 && props.npc.人物事迹.length > 0))
)
</script>

<template>
  <Teleport to="body">
    <div class="npc-overlay" @click.self="emit('close')">
      <div class="npc-card">
        <!-- 头部 -->
        <div class="npc-header">
          <div class="npc-head-top">
            <span class="npc-cat-badge" :class="{
              'cat-present': category === '在场',
              'cat-away': category === '离场',
              'cat-key': category === '重点',
            }">{{ CAT_LABEL[category] || category }}</span>
            <span class="npc-name">{{ npc.name }}</span>
            <span v-if="npc.identityRevealed" class="npc-reveal-badge">🪪 身份已揭示</span>
            <span class="npc-spacer"></span>
            <button class="npc-close" @click="emit('close')">✕</button>
          </div>
          <div class="npc-head-sub">
            <span v-if="npc.role" class="npc-role">{{ npc.role }}</span>
            <span class="npc-favor">{{ FAVOR_LABEL(npc.favor ?? 0) }} ❤{{ npc.favor ?? 0 }}</span>
            <span class="npc-id">ID: {{ npc.id }}</span>
          </div>
        </div>

        <!-- 基本信息 -->
        <div class="npc-section">
          <div class="npc-section-title">📋 基本信息</div>
          <div class="npc-grid">
            <div class="npc-field" v-if="npc.age">
              <span class="npc-field-key">年龄</span>
              <span class="npc-field-val">{{ npc.age }} 岁</span>
            </div>
            <div class="npc-field" v-if="npc.gender">
              <span class="npc-field-key">性别</span>
              <span class="npc-field-val">{{ npc.gender }}</span>
            </div>
            <div class="npc-field" v-if="npc.characterIntro" style="grid-column: 1 / -1">
              <span class="npc-field-key">人物介绍</span>
              <span class="npc-field-val">{{ npc.characterIntro }}</span>
            </div>
            <div class="npc-field" v-if="npc.sexualExperience" style="grid-column: 1 / -1">
              <span class="npc-field-key">性经历</span>
              <span class="npc-field-val npc-sensitive">{{ npc.sexualExperience }}</span>
            </div>
          </div>
        </div>

        <!-- 性格 / 外貌 / 背景 / 关系 -->
        <div class="npc-section" v-if="hasExtra">
          <div class="npc-section-title">📝 角色详情</div>
          <div class="npc-grid">
            <div class="npc-field" v-if="npc.personality" style="grid-column: 1 / -1">
              <span class="npc-field-key">性格</span>
              <span class="npc-field-val">{{ npc.personality }}</span>
            </div>
            <div class="npc-field" v-if="npc.appearance" style="grid-column: 1 / -1">
              <span class="npc-field-key">外貌</span>
              <span class="npc-field-val">{{ npc.appearance }}</span>
            </div>
            <div class="npc-field" v-if="npc.background" style="grid-column: 1 / -1">
              <span class="npc-field-key">背景</span>
              <span class="npc-field-val">{{ npc.background }}</span>
            </div>
            <div class="npc-field" v-if="npc.relationToPlayer" style="grid-column: 1 / -1">
              <span class="npc-field-key">与玩家关系</span>
              <span class="npc-field-val">{{ npc.relationToPlayer }}</span>
            </div>
          </div>
        </div>

        <!-- 世界特定属性 -->
        <div class="npc-section" v-if="npc.extraAttributes && Object.keys(npc.extraAttributes).length > 0">
          <div class="npc-section-title">🔮 世界特定属性</div>
          <div class="npc-grid">
            <div class="npc-field" v-for="[k, v] in Object.entries(npc.extraAttributes)" :key="k">
              <span class="npc-field-key">{{ k }}</span>
              <span class="npc-field-val">{{ v }}</span>
            </div>
          </div>
        </div>

        <!-- 人物事迹 -->
        <div class="npc-section" v-if="recentChronicles.length > 0">
          <div class="npc-section-title">📜 人物事迹</div>
          <div class="npc-chronicles">
            <div v-for="(c, i) in recentChronicles" :key="i" class="npc-chronicle">{{ c }}</div>
          </div>
        </div>

        <!-- 改名记录 -->
        <div class="npc-section" v-if="npc.identityHistory && npc.identityHistory.length > 0">
          <div class="npc-section-title">🔄 改名记录</div>
          <div class="npc-aliases">
            <span v-for="(h, i) in npc.identityHistory" :key="i" class="npc-alias-tag">
              {{ h.from }} → {{ h.to }}
              <span class="npc-alias-turn">(第{{ h.turnIndex >= 0 ? h.turnIndex : '?' }}轮)</span>
            </span>
          </div>
        </div>

        <!-- 别名 -->
        <div class="npc-section" v-if="npc.aliases && npc.aliases.length > 0">
          <div class="npc-section-title">🏷️ 曾用名/别称</div>
          <div class="npc-aliases">
            <span v-for="a in npc.aliases" :key="a" class="npc-alias-tag">{{ a }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* overlay */
.npc-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
}

/* card */
.npc-card {
  width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto;
  border-radius: 20px;
  background: linear-gradient(170deg, rgba(255,250,252,0.96), rgba(255,235,242,0.94));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 12px 48px rgba(0,0,0,0.15), 0 2px 8px rgba(255,128,168,0.1);
  padding: 0;
}
.npc-card::-webkit-scrollbar { width: 4px; }
.npc-card::-webkit-scrollbar-thumb { background: var(--theme-border-light); border-radius: 2px; }

/* header */
.npc-header {
  padding: 20px 22px 14px;
  border-bottom: 1px solid var(--theme-border-ice);
  position: sticky; top: 0; z-index: 2;
  background: linear-gradient(170deg, rgba(255,250,252,0.98), rgba(255,235,242,0.96));
  backdrop-filter: blur(20px);
}
.npc-head-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.npc-name { font-size: 22px; font-weight: 700; color: var(--theme-text-main); }
.npc-cat-badge { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
.cat-present { background: rgba(76,175,80,0.12); color: #4caf50; }
.cat-away { background: rgba(0,0,0,0.04); color: #999; }
.cat-key { background: #ffb74d; color: #fff; }
.npc-reveal-badge { font-size: 11px; color: #9575cd; }
.npc-spacer { flex: 1; }
.npc-close {
  width: 32px; height: 32px; border-radius: 50%;
  border: 1px solid var(--theme-border-light); background: rgba(255,255,255,0.8);
  font-size: 16px; cursor: pointer; color: var(--theme-text-main);
  display: flex; align-items: center; justify-content: center;
}
.npc-close:hover { background: rgba(255,100,100,0.08); color: #e55; }

.npc-head-sub { display: flex; align-items: baseline; gap: 12px; margin-top: 6px; flex-wrap: wrap; }
.npc-role { font-size: 14px; color: var(--theme-text-accent); font-weight: 600; }
.npc-favor { font-size: 13px; color: var(--theme-text-main); }
.npc-id { font-size: 9px; color: var(--theme-text-main); opacity: 0.25; font-family: monospace; margin-left: auto; }

/* sections */
.npc-section { padding: 14px 22px; border-bottom: 1px solid rgba(255,182,193,0.08); }
.npc-section:last-child { border-bottom: none; }
.npc-section-title { font-size: 12px; font-weight: 600; color: var(--theme-text-accent); margin-bottom: 10px; letter-spacing: 0.05em; }

/* grid */
.npc-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.npc-field { display: flex; flex-direction: column; gap: 2px; }
.npc-field-key { font-size: 10px; color: var(--theme-text-main); opacity: 0.45; text-transform: uppercase; letter-spacing: 0.05em; }
.npc-field-val { font-size: 14px; color: var(--theme-text-main); line-height: 1.5; }
.npc-sensitive { color: var(--theme-text-secondary); font-style: italic; opacity: 0.8; }

/* chronicles */
.npc-chronicles { display: flex; flex-direction: column; gap: 6px; }
.npc-chronicle {
  font-size: 12px; color: var(--theme-text-main); opacity: 0.65;
  padding: 6px 10px; background: rgba(255,182,193,0.06); border-radius: 8px; line-height: 1.5;
}

/* aliases */
.npc-aliases { display: flex; flex-wrap: wrap; gap: 6px; }
.npc-alias-tag {
  font-size: 11px; padding: 3px 10px; border-radius: 12px;
  background: rgba(255,182,193,0.1); border: 1px solid var(--theme-border-ice);
  color: var(--theme-text-main);
}
.npc-alias-turn { font-size: 9px; opacity: 0.4; }
</style>
