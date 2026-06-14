// ============================================================
// wandou · 全局事件总线（轻量 EventEmitter）
// ============================================================

export type WandouEvent =
  | 'init:done'
  | 'world:loaded'
  | 'world:created'
  | 'world:deleted'
  | 'chat:message_sent'
  | 'chat:message_received'
  | 'chat:generation_start'
  | 'chat:generation_token'
  | 'chat:generation_stop'
  | 'chat:generation_end'
  | 'chat:error'
  | 'chat:thinking_missing'
  | 'state:world_changed'
  | 'state:player_changed'
  | 'state:memory_added'
  | 'inventory:changed'
  | 'inventory:toast'
  | 'quest:added'
  | 'quest:removed'
  | 'quest:updated'
  | 'npc:identityRevealed'
  | 'npc:renamed'
  | 'npc:favorChanged'
  | 'npc:categoryChanged'

type Handler = (...args: any[]) => void

class EventBus {
  private _map = new Map<string, Set<Handler>>()

  on(event: WandouEvent, fn: Handler): () => void {
    if (!this._map.has(event)) this._map.set(event, new Set())
    this._map.get(event)!.add(fn)
    return () => this._map.get(event)?.delete(fn)
  }

  emit(event: WandouEvent, ...args: any[]): void {
    this._map.get(event)?.forEach(fn => { try { fn(...args) } catch { /* 不中断其他监听器 */ } })
  }
}

/** 全局单例 */
export const bus = new EventBus()
