import { getStore } from "@netlify/blobs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlayerStorage } from "./types";

export class MemoryPlayerStorage implements PlayerStorage {
  private readonly values = new Map<string, unknown>();
  async getJSON<T>(key: string) { return structuredClone((this.values.get(key) as T | undefined) ?? null); }
  async setJSON(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async list(prefix = "") { return [...this.values.keys()].filter((key) => key.startsWith(prefix)).sort(); }
}

export class LocalFilePlayerStorage implements PlayerStorage {
  constructor(private readonly root: string) {}
  private file(key: string) {
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Clé de stockage invalide");
    return resolved;
  }
  async getJSON<T>(key: string) {
    try { return JSON.parse(await readFile(this.file(key), "utf8")) as T; } catch { return null; }
  }
  async setJSON(key: string, value: unknown) {
    const target = this.file(key);
    await mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(value), "utf8");
    await rename(temporary, target);
  }
  async list(prefix = "") {
    const base = this.file(prefix || ".");
    const found: string[] = [];
    const walk = async (directory: string) => {
      try {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const full = path.join(directory, entry.name);
          if (entry.isDirectory()) await walk(full);
          else found.push(path.relative(this.root, full).replaceAll("\\", "/"));
        }
      } catch {}
    };
    await walk(base);
    return found.sort();
  }
}

export class NetlifyBlobPlayerStorage implements PlayerStorage {
  private readonly store = getStore({ name: "eloscope-ffe-players", consistency: "strong" });
  async getJSON<T>(key: string) { return this.store.get(key, { type: "json" }) as Promise<T | null>; }
  async setJSON(key: string, value: unknown) { await this.store.setJSON(key, value); }
  async list(prefix = "") {
    const { blobs } = await this.store.list({ prefix });
    return blobs.map((blob) => blob.key).sort();
  }
}

const memory = new MemoryPlayerStorage();
export function playerStorage(): PlayerStorage {
  const netlify = process.env.NETLIFY === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.NETLIFY_DEV;
  return netlify ? new NetlifyBlobPlayerStorage() : memory;
}
