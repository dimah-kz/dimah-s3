/** A size-bounded cache that evicts the least recently used entry. */
export type LruCache<K, V> = {
  /** The value for `key`, marking it as the most recently used. */
  get: (key: K) => V | undefined;
  /** Stores `value` as the most recently used entry, evicting the oldest past `maxSize`. */
  set: (key: K, value: V) => void;
  delete: (key: K) => boolean;
  clear: () => void;
  readonly size: number;
};

/** Creates an empty {@link LruCache} holding at most `maxSize` entries. */
export function createLruCache<K, V>(maxSize: number): LruCache<K, V> {
  if (!Number.isInteger(maxSize) || maxSize < 1) {
    throw new RangeError(
      "[dimah-s3] LRU cache size must be a positive integer.",
    );
  }

  // A Map iterates in insertion order, so the first key is the oldest.
  const entries = new Map<K, V>();

  return {
    get(key) {
      if (!entries.has(key)) return undefined;
      const value = entries.get(key) as V;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      for (const oldest of entries.keys()) {
        if (entries.size <= maxSize) break;
        entries.delete(oldest);
      }
    },
    delete: (key) => entries.delete(key),
    clear: () => entries.clear(),
    get size() {
      return entries.size;
    },
  };
}
