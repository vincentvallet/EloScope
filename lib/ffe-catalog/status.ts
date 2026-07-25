import { HISTORY_STATE_KEY } from "./backfill";
import { INDEX_METADATA_KEY } from "./indexes";
import { dedupeTournaments } from "./merge";
import type {
  CatalogBatch, CatalogIndexMetadata, CatalogStorage, CatalogSyncStatus,
  FfeTournamentCatalogItem, HistoricalBackfillState,
} from "./types";

async function loadIndexedItems(storage: CatalogStorage) {
  const indexKeys = (await storage.list("indexes/by-year/")).filter((key) => key.endsWith(".json"));
  const sourceKeys = indexKeys.length
    ? indexKeys
    : (await storage.list("months/")).filter((key) => key.endsWith(".json"));
  const upcomingKeys = (await storage.list("upcoming/")).filter((key) => key.endsWith(".json"));
  const batches = await Promise.all([...sourceKeys, ...upcomingKeys].map((key) => storage.getJSON<CatalogBatch>(key)));
  return dedupeTournaments(batches.flatMap((batch) => batch?.items ?? []));
}

export async function getCatalogStatus(storage: CatalogStorage, catalogItems?: FfeTournamentCatalogItem[]) {
  const [sync, history, indexes] = await Promise.all([
    storage.getJSON<CatalogSyncStatus>("metadata/sync-status.json"),
    storage.getJSON<HistoricalBackfillState>(HISTORY_STATE_KEY),
    storage.getJSON<CatalogIndexMetadata>(INDEX_METADATA_KEY),
  ]);
  const items = catalogItems ?? await loadIndexedItems(storage);
  const dates = items.flatMap((item) => [item.startDate, item.endDate]).filter(Boolean).sort() as string[];
  const failedCount = history ? Object.keys(history.failedMonths).length : 0;
  return {
    catalogCount: items.length,
    earliestIndexedDate: dates[0] ?? indexes?.earliestIndexedDate,
    latestIndexedDate: dates.at(-1) ?? indexes?.latestIndexedDate,
    lastAttemptAt: sync?.lastAttemptAt,
    lastSuccessfulSyncAt: sync?.lastSuccessfulSyncAt,
    isRefreshing: sync?.isRefreshing ?? false,
    lastError: sync?.lastError,
    updatedMonths: sync?.updatedMonths ?? [],
    historicalBackfill: history ? {
      targetStart: history.targetStart,
      targetEnd: history.targetEnd,
      totalMonths: history.completedMonths.length + history.pendingMonths.length + failedCount,
      completedMonths: history.completedMonths.length,
      emptyMonths: history.emptyMonths.length,
      failedMonths: failedCount,
      pendingMonths: history.pendingMonths.length,
      running: history.running,
      completed: !!history.completedAt && failedCount === 0,
      lastProcessedMonth: history.lastProcessedMonth,
      startedAt: history.startedAt,
      updatedAt: history.updatedAt,
      completedAt: history.completedAt,
      nextResumeAt: history.nextResumeAt,
    } : undefined,
    source: "FFE" as const,
  };
}
