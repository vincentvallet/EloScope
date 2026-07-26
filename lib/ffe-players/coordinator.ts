import { HISTORY_STATE_KEY } from "@/lib/ffe-catalog/backfill";
import { readCatalog } from "@/lib/ffe-catalog/search";
import type { CatalogStorage, CatalogSyncStatus, FfeTournamentCatalogItem, HistoricalBackfillState } from "@/lib/ffe-catalog/types";
import { FfeResultsAdapter } from "@/lib/importers/ffe";
import { indexTournamentParticipations } from "./participation-index";
import { runPlayerParticipationBackfill } from "./backfill";
import type { PlayerStorage } from "./types";

type RefreshStatus = { isRefreshing?: boolean };

export async function catalogWorkIsActive(storage: CatalogStorage, now = new Date()) {
  const [history, sync, announcements, historyLock, syncLock] = await Promise.all([
    storage.getJSON<HistoricalBackfillState>(HISTORY_STATE_KEY),
    storage.getJSON<CatalogSyncStatus>("metadata/sync-status.json"),
    storage.getJSON<RefreshStatus>("metadata/announcement-status.json"),
    storage.getJSON<{ expiresAt?: string }>("locks/history-backfill.json"),
    storage.getJSON<{ expiresAt?: string }>("locks/catalog-sync.json"),
  ]);
  const timestamp = now.toISOString();
  return !history
    || history.running
    || history.pendingMonths.length > 0
    || Object.keys(history.failedMonths).length > 0
    || !history.completedAt
    || !!sync?.isRefreshing
    || !!announcements?.isRefreshing
    || !!historyLock?.expiresAt && historyLock.expiresAt > timestamp
    || !!syncLock?.expiresAt && syncLock.expiresAt > timestamp;
}

async function indexTournament(storage: PlayerStorage, item: FfeTournamentCatalogItem) {
  const existing = await storage.getJSON(`participations/by-tournament/${item.ffeRef}.json`);
  if (existing) return;
  const adapter = new FfeResultsAdapter();
  const source = await adapter.fetchSource(item.sourceDetailUrl);
  const parsed = await adapter.parseSource(source);
  await indexTournamentParticipations(storage, item.ffeRef, adapter.normalize(parsed), item);
}

export async function runCoordinatedPlayerBackfill({
  catalogStorage,
  playerStorage,
  requestBudget = 8,
  timeBudgetMs = 8 * 60_000,
}: {
  catalogStorage: CatalogStorage;
  playerStorage: PlayerStorage;
  requestBudget?: number;
  timeBudgetMs?: number;
}) {
  if (await catalogWorkIsActive(catalogStorage)) return { skipped: "catalog-priority" as const };
  const tournaments = (await readCatalog(catalogStorage))
    .filter((item) => item.hasResults)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? "") || a.ffeRef.localeCompare(b.ffeRef));
  const byRef = new Map(tournaments.map((item) => [item.ffeRef, item]));
  return runPlayerParticipationBackfill({
    storage: playerStorage,
    tournamentRefs: tournaments.map((item) => item.ffeRef),
    requestBudget,
    timeBudgetMs,
    catalogBackfillRunning: () => catalogWorkIsActive(catalogStorage),
    indexTournament: async (ref) => {
      const item = byRef.get(ref);
      if (!item) throw new Error(`Tournoi FFE ${ref} absent du catalogue`);
      await indexTournament(playerStorage, item);
    },
  });
}
