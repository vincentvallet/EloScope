import { getStore } from "@netlify/blobs";
import type { FideStorage } from "./interface";

export class NetlifyBlobFideStorage implements FideStorage {
  private readonly store = getStore({ name: "eloscope-fide", consistency: "strong" });
  async getJSON<T>(key: string) { return this.store.get(key, { type: "json" }) as Promise<T | null>; }
  async setJSON(key: string, value: unknown) { await this.store.setJSON(key, value); }
  async setJSONIfNew(key: string, value: unknown) {
    return (await this.store.setJSON(key, value, { onlyIfNew: true })).modified;
  }
  async acquireLock(key: string, value: { owner: string; expiresAt: string }, now: Date) {
    const current = await this.store.getWithMetadata(key, { type: "json" });
    if (!current) return (await this.store.setJSON(key, value, { onlyIfNew: true })).modified;
    const lock = current.data as { expiresAt?: string };
    if (lock.expiresAt && Date.parse(lock.expiresAt) > now.getTime()) return false;
    if (!current.etag) return false;
    return (await this.store.setJSON(key, value, { onlyIfMatch: current.etag })).modified;
  }
  async delete(key: string) { await this.store.delete(key); }
  async list(prefix = "") {
    const keys: string[] = [];
    for await (const page of this.store.list({ prefix, paginate: true })) {
      keys.push(...page.blobs.map((blob) => blob.key));
    }
    return keys.sort();
  }
}
