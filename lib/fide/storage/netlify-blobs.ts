import { getStore } from "@netlify/blobs";
import type { FideStorage } from "./interface";

const BLOB_TIMEOUT_MS = 15_000;

async function withBlobRetry<T>(operation: () => Promise<T>, label: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Netlify Blob timeout: ${label}`)), BLOB_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      lastError = error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError;
}

export class NetlifyBlobFideStorage implements FideStorage {
  private readonly store = getStore({ name: "eloscope-fide", consistency: "strong" });
  async getJSON<T>(key: string) {
    return withBlobRetry(() => this.store.get(key, { type: "json" }) as Promise<T | null>, `get ${key}`);
  }
  async setJSON(key: string, value: unknown) {
    await withBlobRetry(() => this.store.setJSON(key, value), `set ${key}`);
  }
  async setJSONIfNew(key: string, value: unknown) {
    return (await withBlobRetry(() => this.store.setJSON(key, value, { onlyIfNew: true }), `set-if-new ${key}`)).modified;
  }
  async acquireLock(key: string, value: { owner: string; expiresAt: string }, now: Date) {
    const current = await withBlobRetry(() => this.store.getWithMetadata(key, { type: "json" }), `lock-read ${key}`);
    if (!current) {
      return (await withBlobRetry(() => this.store.setJSON(key, value, { onlyIfNew: true }), `lock-create ${key}`)).modified;
    }
    const lock = current.data as { expiresAt?: string };
    if (lock.expiresAt && Date.parse(lock.expiresAt) > now.getTime()) return false;
    if (!current.etag) return false;
    return (await withBlobRetry(() => this.store.setJSON(key, value, { onlyIfMatch: current.etag }), `lock-replace ${key}`)).modified;
  }
  async delete(key: string) {
    await withBlobRetry(() => this.store.delete(key), `delete ${key}`);
  }
  async list(prefix = "") {
    const keys: string[] = [];
    const pages = this.store.list({ prefix, paginate: true })[Symbol.asyncIterator]();
    while (true) {
      const entry = await withBlobRetry(() => pages.next(), `list ${prefix}`);
      if (entry.done) break;
      const page = entry.value;
      keys.push(...page.blobs.map((blob) => blob.key));
    }
    return keys.sort();
  }
}
