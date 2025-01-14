// LRUCache.ts
type CacheValue = {
    size: number;  // approximate memory usage for this entry
    data: unknown; // compiled module or whatever
    onEvict?: () => void; // optional cleanup callback
  };
  
  export class LRUCache {
    #map = new Map<string, CacheValue>();
    #currentSize = 0;
    #maxSize: number;
  
    constructor(maxSize: number) {
      this.#maxSize = maxSize;
    }
  
    get(key: string): unknown | undefined {
      const entry = this.#map.get(key);
      if (!entry) return undefined;
  
      // Mark entry as recently used by re-inserting it
      this.#map.delete(key);
      this.#map.set(key, entry);
      return entry.data;
    }
  
    has(key: string): boolean {
      return this.#map.has(key);
    }
  
    set(key: string, value: CacheValue): void {
      // If key already exists, remove old entry so we don’t double-count usage
      if (this.#map.has(key)) {
        this.delete(key);
      }
  
      // Evict items until there is enough room
      while (this.#currentSize + value.size > this.#maxSize && this.#map.size > 0) {
        this.evictLeastRecentlyUsed();
      }
  
      // Insert new entry
      this.#map.set(key, value);
      this.#currentSize += value.size;
    }
  
    delete(key: string): void {
      const entry = this.#map.get(key);
      if (entry) {
        this.#map.delete(key);
        this.#currentSize -= entry.size;
        entry.onEvict?.();
      }
    }
  
    private evictLeastRecentlyUsed(): void {
      const firstKey = this.#map.keys().next().value;
      if (firstKey !== undefined) {
        this.delete(firstKey);
      }
    }
  }
  