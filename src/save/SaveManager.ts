import type { VNEngine } from '@/types/engine';
import type {
  GameStateSnapshot,
  ISaveManager,
  SaveData,
  SaveSlotInfo,
} from '@/types/save';
import type { StorageProvider } from './SaveStorage';

/** 存档格式版本（架构文档 §9.3 / §14.3） */
export const SAVE_VERSION = 1;

const SLOT_KEY_PREFIX = 'save_';
const DEFAULT_SLOT_COUNT = 12;
const LABEL_MAX_LENGTH = 30;

export interface SaveManagerOptions {
  storage: StorageProvider;
  /** 槽位总数，list() 会补全空槽；缺省 12 */
  slotCount?: number;
  /** 时间源，缺省 Date.now，便于测试 */
  now?: () => number;
}

/**
 * 版本迁移：校验存档结构并（未来）按版本逐级升级。
 * 当前仅 v1，无升级步骤；未来在末尾按 version 循环转换数据结构。
 */
export function migrate(raw: unknown): SaveData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid save data');
  }
  const data = raw as Partial<SaveData>;
  if (typeof data.version !== 'number') {
    throw new Error('Save data is missing a version');
  }
  if (data.version > SAVE_VERSION) {
    throw new Error(
      `Save version ${data.version} is newer than supported ${SAVE_VERSION}`,
    );
  }
  return data as SaveData;
}

/**
 * 存档管理器：遍历各子系统收集状态组装 SaveData，或反向恢复。
 *
 * 已知限制：仅按脚本 pc 保存执行位置。在 `@call`/`@if` 块内或被 `@wait` 阻塞时
 * 存档，读档会丢失调用栈/分支匹配态（Interpreter 未暴露这些状态）。
 * thumbnail/history/playTime 亦尚未接线，暂存空值。
 */
class SaveManager implements ISaveManager {
  private readonly storage: StorageProvider;
  private readonly slotCount: number;
  private readonly now: () => number;

  constructor(options: SaveManagerOptions) {
    this.storage = options.storage;
    this.slotCount = options.slotCount ?? DEFAULT_SLOT_COUNT;
    this.now = options.now ?? Date.now;
  }

  public async capture(engine: VNEngine, slot: number): Promise<SaveData> {
    this.assertSlot(slot);

    const script = engine.script.getState();
    const renderer = engine.renderer.getState();
    const audio = engine.audio.getState();
    const store = engine.variableStore.dump();
    const label = engine.ui?.dialogueBox.currentText ?? '';

    const gameState: GameStateSnapshot = {
      currentScript: script.currentScript,
      scriptPC: script.pc,
      variables: store.variables,
      flags: store.flags,
      bgImage: renderer.bgImage,
      characters: renderer.characters,
      bgm: audio && audio.id !== '' ? audio : null,
      history: [...(engine.ui?.history?.entries() ?? [])],
      playTime: 0,
    };

    const data: SaveData = {
      version: SAVE_VERSION,
      timestamp: this.now(),
      thumbnail: '',
      slotLabel: label.slice(0, LABEL_MAX_LENGTH),
      gameState,
    };

    this.storage.setItem(this.keyFor(slot), JSON.stringify(data));
    return data;
  }

  public async restore(engine: VNEngine, slot: number): Promise<void> {
    this.assertSlot(slot);

    const raw = this.storage.getItem(this.keyFor(slot));
    if (raw === null) {
      throw new Error(`Save slot ${slot} is empty`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`Save slot ${slot} is corrupted`);
    }
    const data = migrate(parsed);
    const gs = data.gameState;

    // 变量先于脚本 load：分支条件按恢复后的变量求值
    engine.variableStore.restore({ variables: gs.variables, flags: gs.flags });
    engine.ui?.history?.restore(gs.history);
    engine.renderer.setState({
      bgImage: gs.bgImage,
      characters: gs.characters,
    });

    if (gs.bgm && gs.bgm.id !== '') {
      // 先触发加载 buffer，再回填进度（否则 setState 的 progress 会被忽略）
      engine.eventBus.emit('audio:play', {
        id: gs.bgm.id,
        type: 'bgm',
        loop: true,
      });
      engine.audio.setState(gs.bgm);
    } else {
      engine.eventBus.emit('audio:stop', { type: 'bgm' });
      engine.audio.setState(null);
    }

    const script = await engine.resource.loadScript(gs.currentScript);
    engine.script.load(gs.currentScript, script, gs.scriptPC);
  }

  public list(): SaveSlotInfo[] {
    const saved = new Map<number, SaveSlotInfo>();
    for (const key of this.storage.keys()) {
      const suffix = key.slice(SLOT_KEY_PREFIX.length);
      if (!key.startsWith(SLOT_KEY_PREFIX) || !/^\d+$/.test(suffix)) continue;
      const slot = Number(suffix);
      const raw = this.storage.getItem(key);
      if (raw === null) continue;
      try {
        const data = migrate(JSON.parse(raw));
        saved.set(slot, {
          slot,
          label: data.slotLabel || undefined,
          timestamp: data.timestamp,
        });
      } catch {
        // 跳过损坏槽，避免一个坏档拖垮整个菜单
      }
    }

    const slots: SaveSlotInfo[] = [];
    for (let i = 0; i < this.slotCount; i += 1) {
      slots.push(saved.get(i) ?? { slot: i });
    }
    for (const [slot, info] of saved) {
      if (slot >= this.slotCount) slots.push(info);
    }
    return slots.sort((a, b) => a.slot - b.slot);
  }

  private keyFor(slot: number): string {
    return `${SLOT_KEY_PREFIX}${slot}`;
  }

  private assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0) {
      throw new Error(`Invalid save slot: ${slot}`);
    }
  }
}

export { SaveManager };
export default SaveManager;
