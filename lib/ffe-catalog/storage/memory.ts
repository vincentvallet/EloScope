import type { CatalogStorage } from "../types";

export class MemoryCatalogStorage implements CatalogStorage {
  private readonly values = new Map<string, unknown>();

  async getJSON<T>(key: string) {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async setJSON(key: string, value: unknown) {
    this.values.set(key, structuredClone(value));
  }

  async list(prefix = "") {
    return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort();
  }
}
