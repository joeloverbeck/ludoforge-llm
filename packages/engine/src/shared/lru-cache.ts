export class LruCache<K, V> {
  readonly evictionLimit: number;
  private readonly entries = new Map<K, V>();

  constructor(evictionLimit: number) {
    if (!Number.isSafeInteger(evictionLimit) || evictionLimit < 0) {
      throw new Error('LRU_CACHE_EVICTION_LIMIT_INVALID');
    }
    this.evictionLimit = evictionLimit;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: K): V | undefined {
    if (!this.entries.has(key)) {
      return undefined;
    }
    const value = this.entries.get(key)!;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.evictionLimit === 0) {
      return;
    }
    if (this.entries.has(key)) {
      this.entries.delete(key);
    }
    this.entries.set(key, value);
    while (this.entries.size > this.evictionLimit) {
      const oldest = this.entries.keys().next().value as K | undefined;
      if (oldest === undefined) {
        return;
      }
      this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
