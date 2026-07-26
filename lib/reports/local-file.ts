import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NormalizedTournament } from "@/lib/importers/types";
import type { CachedTournamentReportMetadata, TournamentReportStore } from "./types";

export class LocalFileTournamentReportStore implements TournamentReportStore {
  constructor(private readonly root: string) {}
  private file(ref: string, name: string) {
    if (!/^\d+$/.test(ref)) throw new Error("Référence FFE invalide");
    return path.join(this.root, "reports", ref, name);
  }
  private async read<T>(file: string) {
    try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return null; }
  }
  private async atomic(file: string, value: unknown) {
    await mkdir(path.dirname(file), { recursive: true });
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value), "utf8");
    await rename(temp, file);
  }
  async getMetadata(ref: string) { return this.read<CachedTournamentReportMetadata>(this.file(ref, "metadata.json")); }
  async getReport(ref: string) { return this.read<NormalizedTournament>(this.file(ref, "report.json")); }
  async acquireLock(ref: string, ttlMs = 90_000) {
    const file = this.file(ref, "lock.json");
    const existing = await this.read<{ owner: string; expiresAt: string }>(file);
    if (existing && new Date(existing.expiresAt).getTime() > Date.now()) return { acquired: false, expiresAt: existing.expiresAt };
    const lock = { owner: crypto.randomUUID(), expiresAt: new Date(Date.now() + ttlMs).toISOString() };
    await this.atomic(file, lock);
    const verified = await this.read<typeof lock>(file);
    return verified?.owner === lock.owner ? { acquired: true, ...lock } : { acquired: false, expiresAt: verified?.expiresAt };
  }
  async updateStatus(ref: string, metadata: CachedTournamentReportMetadata) {
    await this.atomic(this.file(ref, "metadata.json"), metadata);
  }
  async saveReportAtomically(ref: string, report: NormalizedTournament, metadata: CachedTournamentReportMetadata) {
    await this.atomic(this.file(ref, "report.json"), report);
    await this.atomic(this.file(ref, "metadata.json"), metadata);
  }
  async releaseLock(ref: string, owner?: string) {
    const file = this.file(ref, "lock.json");
    const lock = await this.read<{ owner: string }>(file);
    if (owner && lock?.owner !== owner) return;
    try { await unlink(file); } catch {}
  }
}
