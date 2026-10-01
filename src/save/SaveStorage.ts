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

/** 基于 Web Storage 的实现，缺省使用浏览器的 `localStorage` */
export class LocalStorageProvider implements StorageProvider {
  private readonly storage: Storage;

  constructor(storage: Storage = globalThis.localStorage) {
    this.storage = storage;
  }

  public getItem(key: string): string | null {
    return this.storage.getItem(key);
  }

  public setItem(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  public keys(): string[] {
    const result: string[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (key !== null) result.push(key);
    }
    return result;
  }
}

export default LocalStorageProvider;
