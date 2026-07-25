import { dedupeTournaments } from "./merge";
import type {
  CatalogBatch, CatalogIndexMetadata, CatalogStorage, CatalogYearIndexMetadata,
  FfeTournamentCatalogItem,
} from "./types";

export const INDEX_METADATA_KEY = "indexes/metadata.json";

function dateBounds(items: FfeTournamentCatalogItem[]) {
  const dates = items.flatMap((item) => [item.startDate, item.endDate]).filter(Boolean) as string[];
  dates.sort();
  return { earliestIndexedDate: dates[0], latestIndexedDate: dates.at(-1) };
}

export async function rebuildYearIndex(storage: CatalogStorage, year: number, now = new Date()) {
  const keys = (await storage.list(`months/${year}-`)).filter((key) => key.endsWith(".json"));
  const batches = await Promise.all(keys.map((key) => storage.getJSON<CatalogBatch>(key)));
  const items = dedupeTournaments(batches.flatMap((batch) => batch?.items ?? []));
  const updatedAt = now.toISOString();
  await storage.setJSON(`indexes/by-year/${year}.json`, {
    key: String(year),
    items,
    fetchedAt: updatedAt,
    sourceUrl: "https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES",
  } satisfies CatalogBatch);

  const previous = await storage.getJSON<CatalogIndexMetadata>(INDEX_METADATA_KEY);
  const years: Record<string, CatalogYearIndexMetadata> = {
    ...(previous?.years ?? {}),
    [year]: { count: items.length, ...dateBounds(items), updatedAt },
  };
  const values = Object.values(years);
  const earliest = values.map((value) => value.earliestIndexedDate).filter(Boolean).sort()[0];
  const latest = values.map((value) => value.latestIndexedDate).filter(Boolean).sort().at(-1);
  const metadata: CatalogIndexMetadata = {
    version: 1,
    years,
    catalogCount: values.reduce((sum, value) => sum + value.count, 0),
    earliestIndexedDate: earliest,
    latestIndexedDate: latest,
    updatedAt,
  };
  await storage.setJSON(INDEX_METADATA_KEY, metadata);
  return { items, metadata };
}

export async function ensureIndexesForStoredMonths(storage: CatalogStorage, now = new Date()) {
  const monthKeys = (await storage.list("months/"))
    .map((key) => key.match(/^months\/(\d{4})-\d{2}\.json$/)?.[1])
    .filter(Boolean) as string[];
  const indexedYears = new Set((await storage.list("indexes/by-year/"))
    .map((key) => key.match(/\/(\d{4})\.json$/)?.[1])
    .filter(Boolean) as string[]);
  const years = [...new Set(monthKeys)].filter((year) => !indexedYears.has(year)).sort();
  for (const year of years) await rebuildYearIndex(storage, Number(year), now);
  return years;
}
