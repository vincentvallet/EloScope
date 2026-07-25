import { randomUUID } from "node:crypto";
import { FfeCatalogClient } from "./client";
import { ensureIndexesForStoredMonths, rebuildYearIndex } from "./indexes";
import { dedupeTournaments } from "./merge";
import { monthKey } from "./normalizers/dates";
import type {
  CatalogBatch, CatalogStorage, HistoricalBackfillState, HistoricalMonthFailure,
  FfeTournamentCatalogItem,
} from "./types";

export const HISTORY_STATE_KEY = "backfill/history-state.json";
const HISTORY_LOCK_KEY = "locks/history-backfill.json";
const TARGET_START = "2000-01";

type HistoryClient = {
  readonly requestCount: number;
  resultsMonth(year: number, month: number, signal?: AbortSignal): Promise<FfeTournamentCatalogItem[]>;
};

type BackfillOptions = {
  now?: Date;
  maxMonths?: number;
  maxRequests?: number;
  timeBudgetMs?: number;
  client?: HistoryClient;
  clock?: () => number;
  owner?: string;
};

function monthNumber(key: string) {
  const match = key.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Mois historique invalide : ${key}`);
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function generateMonthKeys(start: string, end: string) {
  const first = monthNumber(start);
  const last = monthNumber(end);
  const keys: string[] = [];
  for (
    let date = new Date(Date.UTC(first.year, first.month - 1, 1));
    date <= new Date(Date.UTC(last.year, last.month - 1, 1));
    date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))
  ) {
    keys.push(monthKey(date));
  }
  return keys;
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

export async function ensureHistoricalBackfillState(storage: CatalogStorage, now = new Date()) {
  const targetEnd = monthKey(now);
  const required = generateMonthKeys(TARGET_START, targetEnd);
  const existing = await storage.getJSON<HistoricalBackfillState>(HISTORY_STATE_KEY);
  if (existing) {
    const known = new Set([
      ...existing.pendingMonths,
      ...existing.completedMonths,
      ...Object.keys(existing.failedMonths),
    ]);
    const added = required.filter((key) => !known.has(key));
    const updated: HistoricalBackfillState = {
      ...existing,
      targetEnd,
      pendingMonths: uniqueSorted([...existing.pendingMonths, ...added]),
      completedMonths: uniqueSorted(existing.completedMonths),
      emptyMonths: uniqueSorted(existing.emptyMonths),
      completedAt: added.length ? undefined : existing.completedAt,
      updatedAt: added.length ? now.toISOString() : existing.updatedAt,
    };
    if (added.length) await storage.setJSON(HISTORY_STATE_KEY, updated);
    await ensureIndexesForStoredMonths(storage, now);
    return updated;
  }

  const keys = (await storage.list("months/"))
    .map((key) => key.match(/^months\/(\d{4}-\d{2})\.json$/)?.[1])
    .filter((key): key is string => !!key && required.includes(key));
  const batches = await Promise.all(keys.map((key) => storage.getJSON<CatalogBatch>(`months/${key}.json`)));
  const completedMonths = uniqueSorted(keys);
  const emptyMonths = uniqueSorted(keys.filter((_, index) => (batches[index]?.items.length ?? 0) === 0));
  const completed = new Set(completedMonths);
  const timestamp = now.toISOString();
  const state: HistoricalBackfillState = {
    version: 1,
    targetStart: TARGET_START,
    targetEnd,
    pendingMonths: required.filter((key) => !completed.has(key)),
    completedMonths,
    emptyMonths,
    failedMonths: {},
    running: false,
    startedAt: timestamp,
    updatedAt: timestamp,
    chainBatches: 0,
  };
  await ensureIndexesForStoredMonths(storage, now);
  await storage.setJSON(HISTORY_STATE_KEY, state);
  return state;
}

async function saveState(storage: CatalogStorage, state: HistoricalBackfillState, now: Date) {
  state.pendingMonths = [...new Set(state.pendingMonths)];
  state.completedMonths = uniqueSorted(state.completedMonths);
  state.emptyMonths = uniqueSorted(state.emptyMonths);
  state.updatedAt = now.toISOString();
  await storage.setJSON(HISTORY_STATE_KEY, state);
}

export async function runHistoricalBackfillBatch(storage: CatalogStorage, options: BackfillOptions = {}) {
  const now = options.now ?? new Date();
  const clock = options.clock ?? Date.now;
  const started = clock();
  const maxMonths = options.maxMonths ?? 12;
  const maxRequests = options.maxRequests ?? 100;
  const timeBudgetMs = options.timeBudgetMs ?? 10 * 60_000;
  const owner = options.owner ?? randomUUID();
  const lock = await storage.getJSON<{ owner: string; expiresAt: string }>(HISTORY_LOCK_KEY);
  if (lock && lock.expiresAt > now.toISOString()) return { skipped: "locked" as const };
  await storage.setJSON(HISTORY_LOCK_KEY, {
    owner,
    expiresAt: new Date(now.getTime() + 12 * 60_000).toISOString(),
  });
  const verified = await storage.getJSON<{ owner: string }>(HISTORY_LOCK_KEY);
  if (verified?.owner !== owner) return { skipped: "locked" as const };

  const state = await ensureHistoricalBackfillState(storage, now);
  if (!state.pendingMonths.length) {
    state.running = false;
    if (!Object.keys(state.failedMonths).length) state.completedAt ??= now.toISOString();
    await saveState(storage, state, now);
    await storage.setJSON(HISTORY_LOCK_KEY, { owner: "", expiresAt: new Date(0).toISOString() });
    return { completed: true as const, processedMonths: [], shouldContinue: false, state };
  }

  const client = options.client ?? new FfeCatalogClient(fetch, 700, 300);
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), timeBudgetMs);
  const processedMonths: string[] = [];
  state.running = true;
  state.chainId ??= randomUUID();
  state.chainBatches += 1;
  state.nextResumeAt = undefined;
  await saveState(storage, state, now);

  try {
    while (
      state.pendingMonths.length
      && processedMonths.length < maxMonths
      && client.requestCount < maxRequests
      && clock() - started < timeBudgetMs
    ) {
      const key = state.pendingMonths[0];
      const { year, month } = monthNumber(key);
      try {
        const items = dedupeTournaments(await client.resultsMonth(year, month, controller.signal));
        const writtenAt = new Date().toISOString();
        await storage.setJSON(`months/${key}.json`, {
          key,
          items,
          fetchedAt: writtenAt,
          sourceUrl: `https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES&Annee=${year}&Mois=${month}`,
        } satisfies CatalogBatch);
        await rebuildYearIndex(storage, year, new Date(writtenAt));
        state.pendingMonths.shift();
        state.completedMonths.push(key);
        if (!items.length) state.emptyMonths.push(key);
        delete state.failedMonths[key];
        state.lastProcessedMonth = key;
        processedMonths.push(key);
        await saveState(storage, state, new Date(writtenAt));
      } catch (error) {
        const previous = state.failedMonths[key];
        const failure: HistoricalMonthFailure = {
          attempts: (previous?.attempts ?? 0) + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: error instanceof Error ? error.message : String(error),
        };
        state.failedMonths[key] = failure;
        state.pendingMonths.shift();
        if (failure.attempts < 3) state.pendingMonths.push(key);
        const transient = /429|503|abort|timeout|timed out/i.test(failure.lastError);
        if (transient) state.nextResumeAt = new Date(Date.now() + 30 * 60_000).toISOString();
        await saveState(storage, state, new Date());
        if (transient) break;
      }
    }
    state.running = false;
    if (!state.pendingMonths.length && !Object.keys(state.failedMonths).length) {
      state.completedAt = new Date().toISOString();
    }
    await saveState(storage, state, new Date());
    return {
      completed: !state.pendingMonths.length && !Object.keys(state.failedMonths).length,
      processedMonths,
      requests: client.requestCount,
      shouldContinue: state.pendingMonths.length > 0 && !state.nextResumeAt,
      state,
    };
  } finally {
    clearTimeout(abortTimer);
    await storage.setJSON(HISTORY_LOCK_KEY, { owner: "", expiresAt: new Date(0).toISOString() });
  }
}

export async function requeueOneFailedMonth(storage: CatalogStorage, now = new Date()) {
  const state = await ensureHistoricalBackfillState(storage, now);
  const entry = Object.entries(state.failedMonths)
    .sort((a, b) => a[1].lastAttemptAt.localeCompare(b[1].lastAttemptAt))[0];
  if (!entry || now.getTime() - new Date(entry[1].lastAttemptAt).getTime() < 20 * 60 * 60_000) return state;
  const [key] = entry;
  delete state.failedMonths[key];
  state.pendingMonths.push(key);
  await saveState(storage, state, now);
  return state;
}
