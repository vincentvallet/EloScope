import { describe, expect, it } from "vitest";
import {
  ensureHistoricalBackfillState, generateMonthKeys, HISTORY_STATE_KEY,
  runHistoricalBackfillBatch,
} from "../lib/ffe-catalog/backfill";
import { rebuildYearIndex } from "../lib/ffe-catalog/indexes";
import { searchCatalog } from "../lib/ffe-catalog/search";
import { MemoryCatalogStorage } from "../lib/ffe-catalog/storage/memory";
import { getCatalogStatus } from "../lib/ffe-catalog/status";
import type {
  FfeTournamentCatalogItem, HistoricalBackfillState,
} from "../lib/ffe-catalog/types";

const now = new Date("2026-07-25T12:00:00.000Z");

function item(year: number, month = 1, ref = `${year}${month}`): FfeTournamentCatalogItem {
  const date = `${year}-${String(month).padStart(2, "0")}-15`;
  return {
    ffeRef: ref,
    title: `Open historique ${year}`,
    normalizedTitle: `open historique ${year}`,
    city: "PARIS",
    departmentCode: "75",
    departmentName: "Paris",
    regionCode: "11",
    regionName: "Île-de-France",
    startDate: date,
    endDate: date,
    year,
    month,
    cadence: "standard",
    status: "results_available",
    hasResults: true,
    sourceListUrl: `https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES&Annee=${year}&Mois=${month}`,
    sourceDetailUrl: `https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=${ref}`,
    firstSeenAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
  };
}

function state(pendingMonths: string[]): HistoricalBackfillState {
  const pending = new Set(pendingMonths);
  return {
    version: 1,
    targetStart: "2000-01",
    targetEnd: "2026-07",
    pendingMonths,
    completedMonths: generateMonthKeys("2000-01", "2026-07").filter((key) => !pending.has(key)),
    emptyMonths: [],
    failedMonths: {},
    running: false,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    chainBatches: 0,
  };
}

function client(handler: (year: number, month: number) => Promise<FfeTournamentCatalogItem[]>) {
  let requests = 0;
  return {
    get requestCount() { return requests; },
    async resultsMonth(year: number, month: number) {
      requests += 1;
      return handler(year, month);
    },
  };
}

describe("backfill historique FFE", () => {
  it("génère tous les mois de janvier 2000 à juillet 2026", () => {
    const months = generateMonthKeys("2000-01", "2026-07");
    expect(months).toHaveLength(319);
    expect(months[0]).toBe("2000-01");
    expect(months.at(-1)).toBe("2026-07");
  });

  it("exclut les lots mensuels déjà validés lors de l'initialisation", async () => {
    const storage = new MemoryCatalogStorage();
    await storage.setJSON("months/2000-01.json", {
      key: "2000-01", items: [item(2000)], fetchedAt: now.toISOString(), sourceUrl: "fixture",
    });
    const history = await ensureHistoricalBackfillState(storage, now);
    expect(history.completedMonths).toContain("2000-01");
    expect(history.pendingMonths).not.toContain("2000-01");
    expect(history.pendingMonths).toHaveLength(318);
  });

  it("reprend après interruption, enregistre un mois vide et déclenche la suite", async () => {
    const storage = new MemoryCatalogStorage();
    await storage.setJSON(HISTORY_STATE_KEY, state(["2000-01", "2000-02"]));
    const first = await runHistoricalBackfillBatch(storage, {
      now, maxMonths: 1, client: client(async () => []),
    });
    expect(first.processedMonths).toEqual(["2000-01"]);
    expect(first.shouldContinue).toBe(true);
    const saved = await storage.getJSON<HistoricalBackfillState>(HISTORY_STATE_KEY);
    expect(saved?.emptyMonths).toContain("2000-01");
    expect(saved?.pendingMonths).toEqual(["2000-02"]);
  });

  it("met un mois en quarantaine après trois échecs", async () => {
    const storage = new MemoryCatalogStorage();
    await storage.setJSON(HISTORY_STATE_KEY, state(["2000-01"]));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await runHistoricalBackfillBatch(storage, {
        now: new Date(now.getTime() + attempt * 60_000),
        client: client(async () => { throw new Error("HTML FFE invalide"); }),
      });
    }
    const saved = await storage.getJSON<HistoricalBackfillState>(HISTORY_STATE_KEY);
    expect(saved?.pendingMonths).toEqual([]);
    expect(saved?.failedMonths["2000-01"].attempts).toBe(3);
    expect(saved?.completedAt).toBeUndefined();
  });

  it("refuse deux workers et reprend après expiration du verrou", async () => {
    const storage = new MemoryCatalogStorage();
    await storage.setJSON(HISTORY_STATE_KEY, state(["2000-01"]));
    await storage.setJSON("locks/history-backfill.json", {
      owner: "other", expiresAt: "2026-07-25T12:10:00.000Z",
    });
    expect(await runHistoricalBackfillBatch(storage, { now })).toEqual({ skipped: "locked" });
    const resumed = await runHistoricalBackfillBatch(storage, {
      now: new Date("2026-07-25T12:11:00.000Z"),
      client: client(async () => [item(2000)]),
    });
    expect(resumed.processedMonths).toEqual(["2000-01"]);
  });

  it("respecte les limites de requêtes et de temps", async () => {
    const requestStorage = new MemoryCatalogStorage();
    await requestStorage.setJSON(HISTORY_STATE_KEY, state(["2000-01", "2000-02"]));
    const requestClient = client(async (year, month) => [item(year, month)]);
    const byRequests = await runHistoricalBackfillBatch(requestStorage, {
      now, maxRequests: 1, client: requestClient,
    });
    expect(byRequests.processedMonths).toHaveLength(1);
    expect(byRequests.shouldContinue).toBe(true);

    const timeStorage = new MemoryCatalogStorage();
    await timeStorage.setJSON(HISTORY_STATE_KEY, state(["2000-01", "2000-02"]));
    let elapsed = 0;
    const timeClient = client(async (year, month) => {
      elapsed = 100;
      return [item(year, month)];
    });
    const byTime = await runHistoricalBackfillBatch(timeStorage, {
      now, timeBudgetMs: 50, clock: () => elapsed, client: timeClient,
    });
    expect(byTime.processedMonths).toHaveLength(1);
    expect(byTime.shouldContinue).toBe(true);
  });

  it("termine le backfill et ne le relance pas", async () => {
    const storage = new MemoryCatalogStorage();
    await storage.setJSON(HISTORY_STATE_KEY, state(["2000-01"]));
    const completed = await runHistoricalBackfillBatch(storage, {
      now, client: client(async () => [item(2000)]),
    });
    expect(completed.completed).toBe(true);
    const second = await runHistoricalBackfillBatch(storage, {
      now: new Date("2026-07-25T13:00:00.000Z"),
      client: client(async () => { throw new Error("ne doit pas être appelé"); }),
    });
    expect(second.processedMonths).toEqual([]);
    expect(second.shouldContinue).toBe(false);
  });

  it("met à jour les index annuels, le statut et la recherche 2000/2010/2020", async () => {
    const storage = new MemoryCatalogStorage();
    for (const year of [2000, 2010, 2020]) {
      await storage.setJSON(`months/${year}-01.json`, {
        key: `${year}-01`, items: [item(year)], fetchedAt: now.toISOString(), sourceUrl: "fixture",
      });
      await rebuildYearIndex(storage, year, now);
    }
    await storage.setJSON(HISTORY_STATE_KEY, {
      ...state([]),
      completedMonths: ["2000-01", "2010-01", "2020-01"],
      completedAt: now.toISOString(),
    });
    for (const year of [2000, 2010, 2020]) {
      const result = await searchCatalog(storage, { year, pageSize: 10 });
      expect(result.pagination.total).toBe(1);
      expect(result.items[0].year).toBe(year);
    }
    const status = await getCatalogStatus(storage);
    expect(status.catalogCount).toBe(3);
    expect(status.earliestIndexedDate).toBe("2000-01-15");
    expect(status.historicalBackfill?.completedMonths).toBe(3);
  });
});
