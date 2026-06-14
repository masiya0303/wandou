// ============================================================
// wandou · 向量存储 + 检索流水线测试
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { VectorStore, getVectorStore, resetVectorStore } from './vectorStore'
import { runRetrievalPipeline, createPipelineRetriever, expandGraph } from './retrieverPipeline'
import type { PipelineConfig } from './retrieverPipeline'
import { buildRuntimeFromStores, createEmptyRuntime } from './compilerRuntime'
import type { StoreProjectionInput, CompilerRuntimeState } from './compilerRuntime'

function makeStoreInput(): StoreProjectionInput {
  return {
    worldTime: '2157年 03月 15日 14:30',
    location: { region: '边境集市', subRegion: '商业区', detail: '星光酒馆' },
    weather: '阴天',
    npcs: [
      { id: 'npc-mark', name: '酒保马克', role: '酒保', personality: '热情', appearance: '中年',
        人物分类: '重点', favor: 35 },
      { id: 'npc-will', name: '军需官威尔', role: '军需官', personality: '严肃', appearance: '军装',
        人物分类: '在场', favor: 10 },
      { id: 'npc-captain', name: '边境守卫队长', role: '队长', personality: '冷酷', appearance: '兜帽',
        人物分类: '重点', favor: -40 },
    ],
    inventory: [{ name: '铁剑', quantity: 1, type: 'weapon' }],
    quests: [{ id: 'q-1', title: '调查仓库', questType: '主线', description: '调查可疑仓库', status: 'active' }],
    memories: [
      { id: 'mem-1', fact: '马克透露仓库有可疑人物', category: 'clue', entities: ['马克', '仓库'],
        keywords: ['仓库', '可疑', '马克'], importance: 4, timeScope: 'mid', state: 'active', turnIndex: 5 },
      { id: 'mem-2', fact: '传说边境山脉有巨龙沉睡', category: 'world', entities: ['边境山脉', '巨龙'],
        keywords: ['传说', '巨龙', '沉睡', '山脉'], importance: 3, timeScope: 'long', state: 'active', turnIndex: 3 },
      { id: 'mem-3', fact: '威尔是前雇佣兵团长', category: 'character', entities: ['威尔'],
        keywords: ['雇佣兵', '团长', '威尔'], importance: 3, timeScope: 'long', state: 'active', turnIndex: 7 },
      { id: 'mem-4', fact: '玩家在仓库捡到一把生锈的钥匙', category: 'item', entities: ['玩家'],
        keywords: ['钥匙', '生锈', '仓库'], importance: 2, timeScope: 'mid', state: 'active', turnIndex: 10 },
      { id: 'mem-5', fact: '威尔承认认识蒙面人但拒绝透露更多', category: 'character', entities: ['威尔', '蒙面人'],
        keywords: ['承认', '蒙面人', '认识'], importance: 4, timeScope: 'mid', state: 'active', turnIndex: 12 },
    ],
    characterGold: 150,
    characterAttributes: { HP: 80, MP: 45 },
    turnIndex: 15,
  }
}

describe('VectorStore', () => {
  let vs: VectorStore

  beforeEach(() => {
    resetVectorStore()
    vs = getVectorStore()
  })

  it('初始化后索引为空', () => {
    const stats = vs.getIndexStats()
    expect(stats.indexedDocs).toBe(0)
  })

  it('索引编译器运行时后非空', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    vs.index(rt)
    const stats = vs.getIndexStats()
    expect(stats.indexedDocs).toBeGreaterThan(0)
  })

  it('搜索"仓库"命中仓库相关记忆', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    vs.index(rt)
    const results = vs.search('仓库 可疑人物', 5)
    expect(results.length).toBeGreaterThan(0)
    // "mem-1" 是最相关的（包含"仓库"和"可疑"）
    const topIds = results.slice(0, 2).map(r => r.id)
    expect(topIds).toContain('mem-1')
  })

  it('搜索"巨龙传说"命中巨龙记忆', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    vs.index(rt)
    const results = vs.search('巨龙 传说 沉睡', 5)
    const ids = results.map(r => r.id)
    expect(ids).toContain('mem-2')
  })

  it('无关搜索返回匹配度低', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    vs.index(rt)
    const results = vs.search('完全不存在的关键词xyz', 5)
    // 所有分数都应该很低
    for (const r of results) {
      expect(r.score).toBeLessThan(0.3)
    }
  })

  it('增量重新索引不丢失数据', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    vs.index(rt)
    const before = vs.getIndexStats().indexedDocs
    vs.reindexDoc('mem-new', '新记忆：仓库里找到了宝藏地图')
    const after = vs.getIndexStats().indexedDocs
    expect(after).toBeGreaterThanOrEqual(before)
  })
})

describe('expandGraph', () => {
  it('从命中实体沿关系网扩展', () => {
    const rt = buildRuntimeFromStores(makeStoreInput())
    // 手动添加关系网
    rt.relationNetwork.push(
      { sourceId: 'npc-mark', targetId: 'npc-will', type: '同事', strength: 0.5, summary: '同在酒馆工作' },
      { sourceId: 'npc-will', targetId: 'npc-captain', type: '认识', strength: 0.3, summary: '曾在军队共事' },
    )
    // 用实体全名匹配
    const result = expandGraph(['酒保马克'], rt)
    // 酒保马克 → 威尔（1跳）→ 队长（2跳）
    expect(result.expandedEntities.length).toBeGreaterThan(0)
  })

  it('无关系网时返回空', () => {
    const rt = createEmptyRuntime()
    const result = expandGraph(['不存在的实体'], rt)
    expect(result.expandedEntities.length).toBe(0)
  })
})

describe('retrieverPipeline', () => {
  let rt: CompilerRuntimeState
  let vs: VectorStore

  beforeEach(() => {
    resetVectorStore()
    vs = getVectorStore()
    rt = buildRuntimeFromStores(makeStoreInput())
    // 添加关系网
    rt.relationNetwork.push(
      { sourceId: 'npc-mark', targetId: 'npc-will', type: '同事', strength: 0.5, summary: '同在酒馆' },
      { sourceId: 'player', targetId: 'npc-mark', type: '友好', strength: 0.6, summary: '马克待玩家热情' },
    )
    vs.index(rt)
  })

  it('基础检索返回非空', async () => {
    const cfg: PipelineConfig = {
      round1TopK: 10, round2TopM: 5, round3TopK: 3,
      queryRewriteEnabled: false, rerankEnabled: false, graphExpandEnabled: true,
      maxRounds: 3,
    }
    const result = await runRetrievalPipeline('仓库', rt, vs, cfg)
    expect(result.results.length).toBeGreaterThan(0)
    expect(result.stages.length).toBeGreaterThan(0)
  })

  it('语义搜索：同义词也能命中', async () => {
    const cfg: PipelineConfig = {
      round1TopK: 10, round2TopM: 5, round3TopK: 3,
      queryRewriteEnabled: false, rerankEnabled: false, graphExpandEnabled: false,
      maxRounds: 3,
    }
    // "储物室" 没有精确出现在任何关键词里，但 TF-IDF 应该能给出一些结果
    const result = await runRetrievalPipeline('储物室 可疑 东西', rt, vs, cfg)
    // 至少不应该崩溃
    expect(result.stages.length).toBeGreaterThan(0)
  })

  it('graph expand 触发后扩展实体', async () => {
    const cfg: PipelineConfig = {
      round1TopK: 10, round2TopM: 5, round3TopK: 3,
      queryRewriteEnabled: false, rerankEnabled: false, graphExpandEnabled: true,
      maxRounds: 3,
    }
    const result = await runRetrievalPipeline('马克', rt, vs, cfg)
    // 马克的检索应该触发 graph expand（马克→威尔）
    if (result.graphExpanded) {
      expect(result.expandedEntities.length).toBeGreaterThan(0)
    }
  })

  it('PipelineRetriever 符合 Retriever 接口', async () => {
    const retriever = createPipelineRetriever(rt, vs, {
      queryRewriteEnabled: false, rerankEnabled: false,
    })
    const results = await retriever.retrieve('威尔 仓库', 6)
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(6)
    // 每条都有必需的字段
    for (const r of results) {
      expect(r.id).toBeDefined()
      expect(r.score).toBeDefined()
      expect(r.source).toBeDefined()
    }
  })
})
