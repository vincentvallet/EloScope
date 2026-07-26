import { FfeResultsAdapter } from "@/lib/importers/ffe";
import { indexTournamentParticipations } from "@/lib/ffe-players/participation-index";
import { playerStorage } from "@/lib/ffe-players/storage";
import { tournamentReportFingerprint } from "./fingerprint";
import type { CachedTournamentReportMetadata, TournamentReportStore } from "./types";

const OLD_TOURNAMENT_TTL = 30 * 24 * 60 * 60_000;
const FAILURE_TTL = 60_000;
const MAX_CONCURRENT_GENERATIONS = 2;
let activeGenerations = 0;

function status(ref: string, state: CachedTournamentReportMetadata["status"], progress: number, message: string): CachedTournamentReportMetadata {
  return { ffeRef: ref, status: state, progress, message, updatedAt: new Date().toISOString(), version: 1 };
}

export async function readSharedReport(store: TournamentReportStore, ref: string) {
  const [metadata, report] = await Promise.all([store.getMetadata(ref), store.getReport(ref)]);
  const stale = !!metadata?.staleAt && new Date(metadata.staleAt).getTime() <= Date.now();
  return { metadata, report, stale };
}

export async function generateSharedReport(store: TournamentReportStore, ref: string, force = false) {
  const existing = await readSharedReport(store, ref);
  if (existing.report && !existing.stale && !force) return { kind: "ready" as const, ...existing };
  if (!force && existing.metadata?.retryAfter && new Date(existing.metadata.retryAfter).getTime() > Date.now()) {
    return { kind: "error" as const, ...existing };
  }
  const lock = await store.acquireLock(ref);
  if (!lock.acquired) return { kind: existing.report ? "ready" as const : "pending" as const, ...existing };
  if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) {
    await store.releaseLock(ref, lock.owner);
    return { kind: "pending" as const, ...existing };
  }
  activeGenerations += 1;
  try {
    await store.updateStatus(ref, status(ref, "fetching", 15, "Récupération des résultats officiels"));
    const adapter = new FfeResultsAdapter();
    const source = await adapter.fetchSource(`https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=${ref}`);
    await store.updateStatus(ref, { ...status(ref, "parsing", 45, "Lecture de la grille et des participants"), sourceFetchedAt: source.fetchedAt });
    const parsed = await adapter.parseSource(source);
    await store.updateStatus(ref, { ...status(ref, "calculating", 70, "Calcul des indicateurs du rapport"), sourceFetchedAt: source.fetchedAt });
    const report = adapter.normalize(parsed);
    const fingerprint = tournamentReportFingerprint(ref, report);
    const generatedAt = new Date().toISOString();
    const ready: CachedTournamentReportMetadata = {
      ...status(ref, "ready", 100, "Rapport prêt"),
      generatedAt,
      sourceFetchedAt: source.fetchedAt,
      fingerprint,
      staleAt: new Date(Date.now() + OLD_TOURNAMENT_TTL).toISOString(),
    };
    await store.updateStatus(ref, { ...ready, status: "saving", progress: 90, message: "Enregistrement du rapport partagé" });
    await store.saveReportAtomically(ref, report, ready);
    await indexTournamentParticipations(playerStorage(), ref, report);
    return { kind: "ready" as const, report, metadata: ready, stale: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Préparation impossible";
    const failed = {
      ...status(ref, "error", 0, message),
      error: message,
      retryAfter: new Date(Date.now() + FAILURE_TTL).toISOString(),
    };
    await store.updateStatus(ref, failed);
    if (existing.report) return { kind: "ready" as const, ...existing, refreshError: message };
    return { kind: "error" as const, metadata: failed, report: null, stale: false };
  } finally {
    activeGenerations -= 1;
    await store.releaseLock(ref, lock.owner);
  }
}
