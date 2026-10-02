import type { EventBus } from '@/core/EventBus';
import type { EngineEvents } from '@/types/events';
import type { DialogueEntry } from '@/types/engine';

/** 历史缓冲上限：超出后丢弃最旧条目以限制内存 */
export const DEFAULT_HISTORY_LIMIT = 200;

/**
 * 对话历史缓冲（见架构文档 §8）：订阅 `script:say` 追加条目，
 * 并作为 HistoryView 的数据源；支持读档时整体替换与清空。
 */
export class DialogueHistory {
  private readonly bus: EventBus<EngineEvents>;
  private readonly limit: number;
  private buffer: DialogueEntry[] = [];

  constructor(bus: EventBus<EngineEvents>, limit = DEFAULT_HISTORY_LIMIT) {
    this.bus = bus;
    this.limit = limit;
    this.bus.on('script:say', this.handleSay);
  }

  /** 只读视图：返回当前缓冲（按追加顺序，最旧在前） */
  public entries(): readonly DialogueEntry[] {
    return this.buffer;
  }

  public record(entry: DialogueEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.limit) {
      this.buffer.splice(0, this.buffer.length - this.limit);
    }
  }

  /** 读档恢复：以给定条目整体替换缓冲（同样受上限约束） */
  public restore(entries: DialogueEntry[]): void {
    this.buffer = this.limit > 0 ? entries.slice(-this.limit) : [];
  }

  public clear(): void {
    this.buffer = [];
  }

  /** 退订事件并清空缓冲 */
  public destroy(): void {
    this.bus.off('script:say', this.handleSay);
    this.buffer = [];
  }

  private readonly handleSay = (payload: EngineEvents['script:say']): void => {
    this.record({
      speaker: payload.speaker,
      text: payload.text,
      timestamp: Date.now(),
    });
  };
}

export default DialogueHistory;
