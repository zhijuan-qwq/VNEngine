import { getStorage } from '@/utils/APIHelper';

/**
 * 存档持久化后端。采用同步契约：localStorage 本身同步，且 `SaveLoadMenu` 的
 * `getSlots`/`onSave`/`onLoad` 都是同步签名。将来接入异步的 IndexedDB 时，
 * 在 `SaveManager` 内维护一份内存元数据索引即可继续保持同步接口。
 */
export interface StorageProvider {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  /** 返回全部键，供 SaveManager 扫描存档槽 */
  keys(): string[];
}

/**
 * 基于 Web Storage 的实现，缺省经 `getStorage()` 取浏览器 `localStorage`。
 * 存储不可用（node / 隐私模式）时静默降级：读恒为 null、写为空操作、键列表为空，
 * 引擎照常启动，只是不持久化。
 */
export class LocalStorageProvider implements StorageProvider {
  private readonly storage: Storage | null;

  constructor(storage?: Storage) {
    this.storage = storage ?? getStorage();
  }

  public getItem(key: string): string | null {
    return this.storage?.getItem(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.storage?.setItem(key, value);
  }

  public keys(): string[] {
    if (!this.storage) return [];
    const result: string[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (key !== null) result.push(key);
    }
    return result;
  }
}

export default LocalStorageProvider;
