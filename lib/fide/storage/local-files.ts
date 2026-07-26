import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FideStorage } from "./interface";

export class LocalFileFideStorage implements FideStorage {
  constructor(private readonly root: string) {}
  private file(key: string) {
    const root = path.resolve(this.root);
    const resolved = path.resolve(root, key);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("Clé FIDE invalide");
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
  async setJSONIfNew(key: string, value: unknown) {
    const target = this.file(key);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      const handle = await open(target, "wx");
      try { await handle.writeFile(JSON.stringify(value), "utf8"); } finally { await handle.close(); }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  }
  async acquireLock(key: string, value: { owner: string; expiresAt: string }, now: Date) {
    const target = this.file(key);
    await mkdir(path.dirname(target), { recursive: true });
    try {
      const handle = await open(target, "wx");
      try { await handle.writeFile(JSON.stringify(value), "utf8"); } finally { await handle.close(); }
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const current = await this.getJSON<{ expiresAt?: string }>(key);
    if (current?.expiresAt && Date.parse(current.expiresAt) > now.getTime()) return false;
    await this.setJSON(key, value);
    return true;
  }
  async delete(key: string) { try { await unlink(this.file(key)); } catch {} }
  async list(prefix = "") {
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
    await walk(this.file(prefix || "."));
    return found.sort();
  }
}
