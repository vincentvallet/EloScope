import type { FideStorage } from "./storage/interface";

export type CachedValue<T> = { value: T; fetchedAt: string; expiresAt: string; sourceUrl: string };

export async function readFideCache<T>(storage: FideStorage, key: string, allowStale = false) {
  const cached = await storage.getJSON<CachedValue<T>>(key);
  if (!cached) return null;
  return allowStale || Date.parse(cached.expiresAt) > Date.now() ? cached : null;
}

export async function writeFideCache<T>(storage: FideStorage, key: string, value: T, sourceUrl: string, ttlMs: number) {
  const fetchedAt = new Date().toISOString();
  const cached = { value, fetchedAt, expiresAt: new Date(Date.now() + ttlMs).toISOString(), sourceUrl };
  await storage.setJSON(key, cached);
  return cached;
}
