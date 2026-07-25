import { randomUUID } from "node:crypto";
import { FfeCatalogClient } from "../client";
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
  if (existingLock && existingLock.expiresAt > now.toISOString() && now.getTime() - inferredCreatedAt < 8 * 60_000) {
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
  const timeout = setTimeout(() => controller.abort(), 13 * 60_000);
  const client = new FfeCatalogClient();
  const updatedMonths: string[] = [];
  try {
    const targetMonths = mode === "initial"
      ? Array.from({ length: now.getUTCMonth() + 1 }, (_, index) => addUtcMonths(now, -index))
      : [addUtcMonths(now, 0), addUtcMonths(now, -1), addUtcMonths(now, -2)];
    const cursor = await storage.getJSON<{ year: number; month: number }>("metadata/backfill-cursor.json");
    const historical = cursor
      ? new Date(Date.UTC(cursor.year, cursor.month - 1, 1))
      : addUtcMonths(now, -3);
    if (mode === "daily") targetMonths.push(historical);
    for (const date of targetMonths) {
      const key = monthKey(date);
      const items = dedupeTournaments(await client.resultsMonth(date.getUTCFullYear(), date.getUTCMonth() + 1, controller.signal));
      const batch: CatalogBatch = {
        key, items, fetchedAt: new Date().toISOString(),
        sourceUrl: `https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES&Annee=${date.getUTCFullYear()}&Mois=${date.getUTCMonth() + 1}`,
      };
      await storage.setJSON(`months/${key}.json`, batch);
      updatedMonths.push(key);
    }
    if (mode === "daily") {
      const next = addUtcMonths(historical, -1);
      await storage.setJSON("metadata/backfill-cursor.json", { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 });
    }
    const announcementItems = [];
    for (const cadence of ["Lent", "UneHeure", "Rapide", "Blitz"] as const) {
      announcementItems.push(...await client.announcements(cadence, controller.signal));
    }
    const upcoming = dedupeTournaments(announcementItems)
      .filter((item) => !item.startDate || item.startDate <= addUtcMonths(now, 7).toISOString().slice(0, 10));
    await storage.setJSON("upcoming/all.json", {
      key: "upcoming", items: upcoming, fetchedAt: new Date().toISOString(),
      sourceUrl: "https://www.echecs.asso.fr/Tournois.aspx",
    } satisfies CatalogBatch);
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

export async function ensureInternalSecret(storage: CatalogStorage) {
  const key = "metadata/internal-secret.json";
  const existing = await storage.getJSON<{ secret: string }>(key);
  if (existing?.secret) return existing.secret;
  const secret = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  await storage.setJSON(key, { secret, createdAt: new Date().toISOString() });
  return secret;
}
