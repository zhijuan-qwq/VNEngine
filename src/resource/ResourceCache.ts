import type { IResourceCache } from '@/types/resource';

interface CacheEntry<T> {
  value: T;
  lastAccessed: number;
}

class ResourceCache<T> implements IResourceCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private readonly maxEntries: number;
  constructor(maxEntries: number = 100) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
  }

  public get(id: string): T | null {
    const res = this.cache.get(id);
    if (!res) {
      return null;
    }
    res.lastAccessed = Date.now();
    return res.value;
  }
  public set(id: string, value: T): void {
    if (this.cache.size >= this.maxEntries) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = key;
        }
      }
      if (oldestKey !== null) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(id, { value, lastAccessed: Date.now() });
  }
  public has(id: string): boolean {
    return this.cache.has(id);
  }
  public delete(id: string): void {
    this.cache.delete(id);
  }
  public clear(): void {
    this.cache.clear();
  }
}

export default ResourceCache;
