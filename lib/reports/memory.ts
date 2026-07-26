import type { NormalizedTournament } from "@/lib/importers/types";
import type { CachedTournamentReportMetadata, TournamentReportStore } from "./types";

export class MemoryTournamentReportStore implements TournamentReportStore {
  private readonly reports = new Map<string, NormalizedTournament>();
  private readonly metadata = new Map<string, CachedTournamentReportMetadata>();
  private readonly locks = new Map<string, { owner: string; expiresAt: string }>();

  async getMetadata(ref: string) { return structuredClone(this.metadata.get(ref) ?? null); }
  async getReport(ref: string) { return structuredClone(this.reports.get(ref) ?? null); }
  async acquireLock(ref: string, ttlMs = 90_000) {
    const existing = this.locks.get(ref);
    if (existing && new Date(existing.expiresAt).getTime() > Date.now()) {
      return { acquired: false, expiresAt: existing.expiresAt };
    }
    const lock = { owner: crypto.randomUUID(), expiresAt: new Date(Date.now() + ttlMs).toISOString() };
    this.locks.set(ref, lock);
    return { acquired: true, ...lock };
  }
  async updateStatus(ref: string, metadata: CachedTournamentReportMetadata) {
    this.metadata.set(ref, structuredClone(metadata));
  }
  async saveReportAtomically(ref: string, report: NormalizedTournament, metadata: CachedTournamentReportMetadata) {
    this.reports.set(ref, structuredClone(report));
    this.metadata.set(ref, structuredClone(metadata));
  }
  async releaseLock(ref: string, owner?: string) {
    const lock = this.locks.get(ref);
    if (!lock || (owner && lock.owner !== owner)) return;
    this.locks.delete(ref);
  }
}
