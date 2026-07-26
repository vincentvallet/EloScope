import { describe, expect, it } from "vitest";
import { MemoryCatalogStorage } from "@/lib/ffe-catalog/storage/memory";
import { MemoryPlayerStorage } from "@/lib/ffe-players/storage";
import { catalogWorkIsActive, runCoordinatedPlayerBackfill } from "@/lib/ffe-players/coordinator";
import type { CatalogBatch, HistoricalBackfillState } from "@/lib/ffe-catalog/types";

const now = "2026-07-26T00:00:00.000Z";
const item = {
  ffeRef: "67414",
  title: "Cappelle",
  normalizedTitle: "cappelle",
  status: "results_available" as const,
  hasResults: true,
  sourceListUrl: "https://echecs.asso.fr/ListeTournois.aspx",
  sourceDetailUrl: "https://echecs.asso.fr/FicheTournoi.aspx?Ref=67414",
  firstSeenAt: now,
  lastSeenAt: now,
};

function history(pendingMonths: string[] = []): HistoricalBackfillState {
  return {
    version: 1,
    targetStart: "2000-01",
    targetEnd: "2026-07",
    pendingMonths,
    completedMonths: pendingMonths.length ? [] : ["2000-01"],
    emptyMonths: [],
    failedMonths: {},
    running: pendingMonths.length > 0,
    startedAt: now,
    updatedAt: now,
    completedAt: pendingMonths.length ? undefined : now,
    chainBatches: 1,
  };
}

describe("coordination du backfill des participations", () => {
  it("laisse la priorité au catalogue historique", async () => {
    const catalog = new MemoryCatalogStorage();
    await catalog.setJSON("backfill/history-state.json", history(["2000-01"]));
    expect(await catalogWorkIsActive(catalog)).toBe(true);
    await expect(runCoordinatedPlayerBackfill({
      catalogStorage: catalog,
      playerStorage: new MemoryPlayerStorage(),
    })).resolves.toEqual({ skipped: "catalog-priority" });
  });

  it("reprend progressivement après la fin du catalogue sans régénérer un rapport existant", async () => {
    const catalog = new MemoryCatalogStorage();
    const players = new MemoryPlayerStorage();
    await catalog.setJSON("backfill/history-state.json", history());
    await catalog.setJSON("months/2026-07.json", {
      key: "2026-07", items: [item], fetchedAt: now, sourceUrl: item.sourceListUrl,
    } satisfies CatalogBatch);
    await players.setJSON("participations/by-tournament/67414.json", []);
    const result = await runCoordinatedPlayerBackfill({
      catalogStorage: catalog,
      playerStorage: players,
      requestBudget: 1,
    });
    expect(result).toMatchObject({ processed: 1 });
    if (!("state" in result) || !result.state) throw new Error("État du backfill absent");
    expect(result.state.completedAt).toBeTruthy();
  });
});
