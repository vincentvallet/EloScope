import { getStore } from "@netlify/blobs";
import type { NormalizedTournament } from "@/lib/importers/types";
import type { CachedTournamentReportMetadata, TournamentReportStore } from "./types";

export class NetlifyBlobTournamentReportStore implements TournamentReportStore {
  private readonly store = getStore({ name: "eloscope-tournament-reports", consistency: "strong" });
  private key(ref: string, name: string) { return `reports/${ref}/${name}.json`; }
  async getMetadata(ref: string) {
    return this.store.get(this.key(ref, "metadata"), { type: "json" }) as Promise<CachedTournamentReportMetadata | null>;
  }
  async getReport(ref: string) {
    return this.store.get(this.key(ref, "report"), { type: "json" }) as Promise<NormalizedTournament | null>;
  }
  async acquireLock(ref: string, ttlMs = 90_000) {
    const key = this.key(ref, "lock");
    const current = await this.store.get(key, { type: "json" }) as { owner: string; expiresAt: string } | null;
    if (current && new Date(current.expiresAt).getTime() > Date.now()) return { acquired: false, expiresAt: current.expiresAt };
    const lock = { owner: crypto.randomUUID(), expiresAt: new Date(Date.now() + ttlMs).toISOString() };
    await this.store.setJSON(key, lock);
    const verified = await this.store.get(key, { type: "json" }) as typeof lock | null;
    return verified?.owner === lock.owner ? { acquired: true, ...lock } : { acquired: false, expiresAt: verified?.expiresAt };
  }
  async updateStatus(ref: string, metadata: CachedTournamentReportMetadata) {
    await this.store.setJSON(this.key(ref, "metadata"), metadata);
  }
  async saveReportAtomically(ref: string, report: NormalizedTournament, metadata: CachedTournamentReportMetadata) {
    await this.store.setJSON(this.key(ref, "report"), report);
    await this.store.setJSON(this.key(ref, "metadata"), metadata);
  }
  async releaseLock(ref: string, owner?: string) {
    const key = this.key(ref, "lock");
    const lock = await this.store.get(key, { type: "json" }) as { owner: string } | null;
    if (!owner || lock?.owner === owner) await this.store.delete(key);
  }
}
