import { randomUUID } from "node:crypto";
import { FfeCatalogClient } from "../client";
import { rebuildYearIndex } from "../indexes";
import { addUtcMonths, monthKey } from "../normalizers/dates";
import { dedupeTournaments } from "../merge";
import { readCatalog } from "../search";
import type { CatalogBatch, CatalogStorage, CatalogSyncStatus } from "../types";

type SyncMode = "daily" | "initial";
const STATUS_KEY = "metadata/sync-status.json";
const LOCK_KEY = "locks/catalog-sync.json";

export async function runCatalogSync(storage: CatalogStorage, mode: SyncMode = "daily", now = new Date()) {
  const owner = randomUUID();
  const existingLock = await storage.getJSON<{ owner: string; createdAt?: string; expiresAt: string }>(LOCK_KEY);
  const inferredCreatedAt = existingLock?.createdAt
    ? new Date(existingLock.createdAt).getTime()
    : existingLock
      ? new Date(existingLock.expiresAt).getTime() - 14 * 60_000
      : 0;
  if (existingLock && existingLock.expiresAt > now.toISOString() && now.getTime() - inferredCreatedAt < 10 * 60_000) {
    return { skipped: "locked" as const };
  }
  await storage.setJSON(LOCK_KEY, {
    owner,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 14 * 60_000).toISOString(),
  });
  const verifiedLock = await storage.getJSON<{ owner: string }>(LOCK_KEY);
  if (verifiedLock?.owner !== owner) return { skipped: "locked" as const };
  const previousStatus = await storage.getJSON<CatalogSyncStatus>(STATUS_KEY);
  const lastAttemptAt = now.toISOString();
  if (mode === "daily" && previousStatus?.lastAttemptAt && now.getTime() - new Date(previousStatus.lastAttemptAt).getTime() < 20 * 60 * 60_000) {
    await storage.setJSON(LOCK_KEY, { owner, expiresAt: new Date(0).toISOString() });
    return { skipped: "rate_limited" as const };
  }
  await storage.setJSON(STATUS_KEY, { ...(previousStatus ?? { itemCount: 0, updatedMonths: [] }), isRefreshing: true, lastAttemptAt });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8 * 60_000);
  const client = new FfeCatalogClient();
  const updatedMonths: string[] = [];
  try {
    const targetMonths = mode === "initial"
      ? Array.from({ length: Math.min(3, now.getUTCMonth() + 1) }, (_, index) => addUtcMonths(now, -index))
      : [addUtcMonths(now, 0), addUtcMonths(now, -1), addUtcMonths(now, -2)];
    for (const date of targetMonths) {
      const key = monthKey(date);
      const items = dedupeTournaments(await client.resultsMonth(date.getUTCFullYear(), date.getUTCMonth() + 1, controller.signal));
      const batch: CatalogBatch = {
        key, items, fetchedAt: new Date().toISOString(),
        sourceUrl: `https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES&Annee=${date.getUTCFullYear()}&Mois=${date.getUTCMonth() + 1}`,
      };
      await storage.setJSON(`months/${key}.json`, batch);
      await rebuildYearIndex(storage, date.getUTCFullYear());
      updatedMonths.push(key);
    }
    const all = await readCatalog(storage);
    const success: CatalogSyncStatus = {
      lastAttemptAt,
      lastSuccessfulSyncAt: new Date().toISOString(),
      isRefreshing: false,
      itemCount: all.length,
      updatedMonths,
    };
    await storage.setJSON(STATUS_KEY, success);
    await storage.setJSON(LOCK_KEY, { owner, expiresAt: new Date(0).toISOString() });
    return { ok: true as const, itemCount: all.length, updatedMonths };
  } catch (error) {
    const failed: CatalogSyncStatus = {
      ...(previousStatus ?? { itemCount: 0, updatedMonths: [] }),
      lastAttemptAt,
      isRefreshing: false,
      lastError: error instanceof Error ? error.message : "Erreur de synchronisation",
    };
    await storage.setJSON(STATUS_KEY, failed);
    await storage.setJSON(LOCK_KEY, { owner, expiresAt: new Date(0).toISOString() });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAnnouncementSync(storage: CatalogStorage, now = new Date()) {
  const lockKey = "locks/announcement-sync.json";
  const owner = randomUUID();
  const lock = await storage.getJSON<{ owner: string; createdAt: string }>(lockKey);
  if (lock && now.getTime() - new Date(lock.createdAt).getTime() < 10 * 60_000) return { skipped: "locked" as const };
  await storage.setJSON(lockKey, { owner, createdAt: now.toISOString() });
  const verified = await storage.getJSON<{ owner: string }>(lockKey);
  if (verified?.owner !== owner) return { skipped: "locked" as const };
  const statusKey = "metadata/announcement-status.json";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8 * 60_000);
  const cadences = ["Lent", "UneHeure", "Rapide", "Blitz"] as const;
  const cursor = await storage.getJSON<{ index: number }>("metadata/announcement-cursor.json");
  const cadenceIndex = (cursor?.index ?? 0) % cadences.length;
  const cadence = cadences[cadenceIndex];
  await storage.setJSON(statusKey, { isRefreshing: true, lastAttemptAt: now.toISOString(), cadence });
  try {
    const items = dedupeTournaments(await new FfeCatalogClient().announcements(cadence, controller.signal))
      .filter((item) => !item.startDate || item.startDate <= addUtcMonths(now, 7).toISOString().slice(0, 10));
    await storage.setJSON(`upcoming/${cadence.toLowerCase()}.json`, {
      key: `upcoming-${cadence}`, items, fetchedAt: new Date().toISOString(),
      sourceUrl: "https://www.echecs.asso.fr/Tournois.aspx",
    } satisfies CatalogBatch);
    await storage.setJSON("metadata/announcement-cursor.json", { index: (cadenceIndex + 1) % cadences.length });
    await storage.setJSON(statusKey, {
      isRefreshing: false, lastAttemptAt: now.toISOString(),
      lastSuccessfulSyncAt: new Date().toISOString(), cadence, itemCount: items.length,
    });
    await storage.setJSON(lockKey, { owner: "", createdAt: new Date(0).toISOString() });
    return { ok: true as const, cadence, itemCount: items.length };
  } catch (error) {
    await storage.setJSON(statusKey, {
      isRefreshing: false, lastAttemptAt: now.toISOString(), cadence,
      lastError: error instanceof Error ? error.message : "Erreur de synchronisation",
    });
    await storage.setJSON(lockKey, { owner: "", createdAt: new Date(0).toISOString() });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function ensureInternalSecret(storage: CatalogStorage) {
  const key = "metadata/internal-secret.json";
  const existing = await storage.getJSON<{ secret: string }>(key);
  if (existing?.secret) return existing.secret;
  const secret = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  await storage.setJSON(key, { secret, createdAt: new Date().toISOString() });
  return secret;
}
