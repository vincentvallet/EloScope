import { HISTORY_STATE_KEY } from "./backfill";
import { INDEX_METADATA_KEY } from "./indexes";
import type {
  CatalogIndexMetadata, CatalogStorage, CatalogSyncStatus, HistoricalBackfillState,
} from "./types";

export async function getCatalogStatus(storage: CatalogStorage) {
  const [sync, history, indexes] = await Promise.all([
    storage.getJSON<CatalogSyncStatus>("metadata/sync-status.json"),
    storage.getJSON<HistoricalBackfillState>(HISTORY_STATE_KEY),
    storage.getJSON<CatalogIndexMetadata>(INDEX_METADATA_KEY),
  ]);
  const failedCount = history ? Object.keys(history.failedMonths).length : 0;
  return {
    catalogCount: Math.max(sync?.itemCount ?? 0, indexes?.catalogCount ?? 0),
    earliestIndexedDate: indexes?.earliestIndexedDate,
    latestIndexedDate: indexes?.latestIndexedDate,
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

