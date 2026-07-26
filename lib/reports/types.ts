import type { NormalizedTournament } from "@/lib/importers/types";

export type ReportGenerationState = "pending" | "fetching" | "parsing" | "calculating" | "saving" | "ready" | "error";

export type CachedTournamentReportMetadata = {
  ffeRef: string;
  status: ReportGenerationState;
  progress: number;
  message: string;
  generatedAt?: string;
  updatedAt: string;
  sourceFetchedAt?: string;
  fingerprint?: string;
  staleAt?: string;
  error?: string;
  retryAfter?: string;
  version: 1;
};

export type LockResult = { acquired: boolean; owner?: string; expiresAt?: string };

export interface TournamentReportStore {
  getMetadata(ref: string): Promise<CachedTournamentReportMetadata | null>;
  getReport(ref: string): Promise<NormalizedTournament | null>;
  acquireLock(ref: string, ttlMs?: number): Promise<LockResult>;
  updateStatus(ref: string, metadata: CachedTournamentReportMetadata): Promise<void>;
  saveReportAtomically(ref: string, report: NormalizedTournament, metadata: CachedTournamentReportMetadata): Promise<void>;
  releaseLock(ref: string, owner?: string): Promise<void>;
}
