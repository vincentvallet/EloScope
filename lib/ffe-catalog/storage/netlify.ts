import { getStore } from "@netlify/blobs";
import type { CatalogStorage } from "../types";

export class NetlifyBlobCatalogStorage implements CatalogStorage {
  private readonly store = getStore({ name: "eloscope-ffe-catalog", consistency: "strong" });

  async getJSON<T>(key: string) {
    return this.store.get(key, { type: "json" }) as Promise<T | null>;
  }

  async setJSON(key: string, value: unknown) {
    await this.store.setJSON(key, value);
  }

  async list(prefix = "") {
    const { blobs } = await this.store.list({ prefix });
    return blobs.map((blob) => blob.key).sort();
  }
}
