// ============================================================
// wandou · TF-IDF 向量存储 (VectorStore)
//
// 纯本地语义检索，对标 yijiekkk 的 embedding + rerank + graph expand：
// - TF-IDF 向量化（中文分词友好）
// - IndexedDB 持久化（突破 localStorage 5MB）
// - 余弦相似度检索
// - 增量索引（新卡片自动加入，无需重建全库）
// ============================================================

import type { CompilerRuntimeState, EventCard, ArchiveCard } from './compilerRuntime'

// ============================================================
// 分词（与编译器一致）
// ============================================================

function tokenize(text: string): string[] {
  const cleaned = text.replace(/[，,。\.！!？?；;：:、\s]+/g, ' ').toLowerCase().trim()
  if (!cleaned) return []
  const tokens: string[] = []
  let buffer = ''
  for (const ch of cleaned) {
    if (/[a-z0-9]/.test(ch)) { buffer += ch }
    else if (/[一-鿿]/.test(ch)) { if (buffer) { tokens.push(buffer); buffer = '' } tokens.push(ch) }
    else { if (buffer) { tokens.push(buffer); buffer = '' } }
  }
  if (buffer) tokens.push(buffer)
  // N-gram: also add bigrams for Chinese
  const result = [...tokens]
  for (let i = 0; i < tokens.length - 1; i++) {
    if (/[一-鿿]/.test(tokens[i]) && /[一-鿿]/.test(tokens[i + 1])) {
      result.push(tokens[i] + tokens[i + 1])
    }
    if (i < tokens.length - 2 && /[一-鿿]/.test(tokens[i]) && /[一-鿿]/.test(tokens[i + 2])) {
      if (/[一-鿿]/.test(tokens[i + 1])) result.push(tokens[i] + tokens[i + 2])
    }
  }
  return result.filter(t => t.length >= 1)
}

// ============================================================
// TF-IDF 核心
// ============================================================

interface TfIdfDocument {
  id: string
  text: string
  tokens: string[]
  /** token → term frequency */
  tf: Map<string, number>
}

interface VectorIndex {
  /** token → inverse document frequency */
  idf: Map<string, number>
  documents: TfIdfDocument[]
  totalDocs: number
}

function buildTfIdfIndex(docs: Array<{ id: string; text: string }>): VectorIndex {
  const documents: TfIdfDocument[] = docs.map(d => {
    const tokens = tokenize(d.text)
    const tf = new Map<string, number>()
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1)
    }
    // normalize TF by total tokens
    const maxFreq = Math.max(1, ...tf.values())
    for (const [t, f] of tf) {
      tf.set(t, f / maxFreq)
    }
    return { id: d.id, text: d.text, tokens, tf }
  })

  // Compute IDF
  const docFreq = new Map<string, number>()
  for (const doc of documents) {
    const seen = new Set<string>()
    for (const t of doc.tokens) {
      if (!seen.has(t)) { docFreq.set(t, (docFreq.get(t) || 0) + 1); seen.add(t) }
    }
  }

  const totalDocs = documents.length
  const idf = new Map<string, number>()
  for (const [t, df] of docFreq) {
    idf.set(t, Math.log((totalDocs + 1) / (df + 1)) + 1)
  }

  return { idf, documents, totalDocs }
}

function cosineSimilarity(
  queryTokens: string[],
  doc: TfIdfDocument,
  idf: Map<string, number>,
): number {
  // Query TF-IDF
  const queryVec = new Map<string, number>()
  for (const t of queryTokens) {
    queryVec.set(t, (queryVec.get(t) || 0) + 1)
  }
  const queryMax = Math.max(1, ...queryVec.values())
  for (const [t, f] of queryVec) {
    queryVec.set(t, (f / queryMax) * (idf.get(t) || 0))
  }

  // Doc TF-IDF
  const docVec = new Map<string, number>()
  for (const [t, tf] of doc.tf) {
    docVec.set(t, tf * (idf.get(t) || 0))
  }

  // Cosine similarity
  let dot = 0, qNorm = 0, dNorm = 0
  for (const [t, qv] of queryVec) {
    dot += qv * (docVec.get(t) || 0)
    qNorm += qv * qv
  }
  for (const [, dv] of docVec) {
    dNorm += dv * dv
  }

  qNorm = Math.sqrt(qNorm)
  dNorm = Math.sqrt(dNorm)
  if (qNorm === 0 || dNorm === 0) return 0
  return dot / (qNorm * dNorm)
}

// ============================================================
// IndexedDB 持久化
// ============================================================

interface StoredDoc {
  id: string
  text: string
  updatedAt: number
}

function openVectorDB(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('docs')) {
        const store = db.createObjectStore('docs', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ============================================================
// VectorStore 主类
// ============================================================

export class VectorStore {
  private _db: IDBDatabase | null = null
  private _index: VectorIndex | null = null
  private _worldId: string = ''
  private _dbName: string = 'wandou_vector'

  // 统计
  indexedDocs: number = 0
  lastIndexedAt: number = 0

  async init(worldId: string) {
    this._worldId = worldId
    try {
      this._db = await openVectorDB(this._dbName)
      await this._loadDocs()
    } catch (e: any) {
      console.warn('[VectorStore] IndexedDB 不可用:', e.message)
      this._db = null
    }
  }

  /** 从编译器运行时重建索引 */
  index(runtime: CompilerRuntimeState) {
    const docs: Array<{ id: string; text: string }> = []

    for (const e of runtime.eventCards) {
      if (e.state === 'expired') continue
      // 构建丰富的索引文本：标题 + 摘要 + 关键词 + 实体
      const text = [
        e.title,
        e.summary,
        ...e.keywords.map(k => `#${k}`),
        ...e.entities.map(e => `@${e}`),
        e.timeLabel,
        e.category,
      ].filter(Boolean).join(' ')
      docs.push({ id: e.id, text })
    }

    for (const a of runtime.archiveCards) {
      const text = [
        a.arcTitle,
        a.summary,
        a.excerpt,
        ...a.keywords.map(k => `#${k}`),
        ...a.entities.map(e => `@${e}`),
        a.timeSpan,
        a.source,
      ].filter(Boolean).join(' ')
      docs.push({ id: a.id, text })
    }

    this._index = buildTfIdfIndex(docs)
    this.indexedDocs = docs.length
    this.lastIndexedAt = Date.now()

    // 异步持久化
    this._persistDocs(docs)
  }

  /** TF-IDF 语义检索 */
  search(queryText: string, topK: number = 10): Array<{ id: string; score: number }> {
    if (!this._index || this._index.documents.length === 0) return []

    const queryTokens = tokenize(queryText)
    if (queryTokens.length === 0) return []

    const results = this._index.documents.map(doc => ({
      id: doc.id,
      score: cosineSimilarity(queryTokens, doc, this._index!.idf),
    }))

    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  /** 重新索引单个文档（增量更新） */
  reindexDoc(id: string, text: string) {
    if (!this._index) return
    // Remove old
    this._index.documents = this._index.documents.filter(d => d.id !== id)
    // Add new
    const tokens = tokenize(text)
    const tf = new Map<string, number>()
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1)
    const maxFreq = Math.max(1, ...tf.values())
    for (const [t, f] of tf) tf.set(t, f / maxFreq)

    this._index.documents.push({ id, text, tokens, tf })
    this._index.totalDocs = this._index.documents.length
    this.indexedDocs = this._index.documents.length

    // Async persist
    this._persistOneDoc(id, text)
  }

  getIndexStats() {
    return {
      indexedDocs: this.indexedDocs,
      lastIndexedAt: this.lastIndexedAt,
      vocabularySize: this._index?.idf.size || 0,
    }
  }

  async close() {
    this._db?.close()
    this._db = null
    this._index = null
  }

  // ---- IndexedDB 持久化 ----

  private async _loadDocs() {
    if (!this._db) return
    const all = await new Promise<StoredDoc[]>((resolve, reject) => {
      const tx = this._db!.transaction('docs', 'readonly')
      const req = tx.objectStore('docs').getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })

    if (all.length > 0) {
      this._index = buildTfIdfIndex(all.map(d => ({ id: d.id, text: d.text })))
      this.indexedDocs = all.length
      this.lastIndexedAt = Math.max(...all.map(d => d.updatedAt), 0)
    }
  }

  private async _persistDocs(docs: Array<{ id: string; text: string }>) {
    if (!this._db) return
    const now = Date.now()
    const tx = this._db.transaction('docs', 'readwrite')
    const store = tx.objectStore('docs')
    for (const d of docs) {
      store.put({ id: d.id, text: d.text, updatedAt: now })
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private async _persistOneDoc(id: string, text: string) {
    if (!this._db) return
    const tx = this._db.transaction('docs', 'readwrite')
    tx.objectStore('docs').put({ id, text, updatedAt: Date.now() })
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve() })
  }
}

// ============================================================
// 全局单例
// ============================================================

let _vectorStore: VectorStore | null = null

export function getVectorStore(): VectorStore {
  if (!_vectorStore) _vectorStore = new VectorStore()
  return _vectorStore
}

export function resetVectorStore() {
  _vectorStore = null
}
