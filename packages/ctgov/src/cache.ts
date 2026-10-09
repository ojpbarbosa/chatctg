/** Insertion-ordered map with a size cap and a TTL; `get` refreshes recency. */
export class LruCache<V> {
  private readonly map = new Map<string, { value: V; at: number }>();
  constructor(private readonly max: number, private readonly ttlMs: number, private readonly now: () => number = Date.now) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (this.now() - hit.at > this.ttlMs) { this.map.delete(key); return undefined; }
    this.map.delete(key); this.map.set(key, hit);
    return hit.value;
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { value, at: this.now() });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
}
