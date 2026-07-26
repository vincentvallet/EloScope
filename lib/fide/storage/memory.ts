import type { FideStorage } from "./interface";

export class MemoryFideStorage implements FideStorage {
  private readonly values = new Map<string, unknown>();
  async getJSON<T>(key: string) { return structuredClone((this.values.get(key) as T | undefined) ?? null); }
  async setJSON(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async setJSONIfNew(key: string, value: unknown) {
    if (this.values.has(key)) return false;
    this.values.set(key, structuredClone(value));
    return true;
  }
  async acquireLock(key: string, value: { owner: string; expiresAt: string }, now: Date) {
    const current = this.values.get(key) as { expiresAt?: string } | undefined;
    if (current?.expiresAt && Date.parse(current.expiresAt) > now.getTime()) return false;
    this.values.set(key, structuredClone(value));
    return true;
  }
  async delete(key: string) { this.values.delete(key); }
  async list(prefix = "") { return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort(); }
}
