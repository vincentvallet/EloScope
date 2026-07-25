import { normalizeSearchText } from "../normalizers/text";
import { dedupeTournaments } from "../merge";
import { getCatalogStatus } from "../status";
import type { CatalogBatch, CatalogStorage, FfeTournamentCatalogItem, TournamentSearchParams } from "../types";

export async function readCatalog(storage: CatalogStorage) {
  const indexKeys = (await storage.list("indexes/by-year/")).filter((key) => key.endsWith(".json"));
  const sourceKeys = indexKeys.length
    ? indexKeys
    : (await storage.list("months/")).filter((key) => key.endsWith(".json"));
  const upcomingKeys = (await storage.list("upcoming/")).filter((key) => key.endsWith(".json"));
  const keys = [...sourceKeys, ...upcomingKeys];
  const batches = await Promise.all(keys.map((key) => storage.getJSON<CatalogBatch>(key)));
  return dedupeTournaments(batches.flatMap((batch) => batch?.items ?? []));
}

function relevance(item: FfeTournamentCatalogItem, query: string) {
  if (!query) return 0;
  const title = item.normalizedTitle;
  const city = normalizeSearchText(item.city ?? "");
  const department = normalizeSearchText(`${item.departmentCode ?? ""} ${item.departmentName ?? ""}`);
  const words = query.split(" ").filter(Boolean);
  if (title === query) return 600;
  if (title.startsWith(query)) return 500;
  if (words.every((word) => title.includes(word))) return 400 + words.length;
  if (city === query) return 350;
  if (city.includes(query)) return 300;
  if (words.every((word) => `${title} ${city} ${department}`.includes(word))) return 200 + words.length;
  return 0;
}

export async function searchCatalog(storage: CatalogStorage, params: TournamentSearchParams) {
  const query = normalizeSearchText(params.q ?? "");
  const catalogItems = await readCatalog(storage);
  let items = catalogItems.map((item) => ({ item, score: relevance(item, query) }));
  if (query) items = items.filter(({ score }) => score > 0);
  if (params.from) items = items.filter(({ item }) => (item.endDate ?? item.startDate ?? "") >= params.from!);
  if (params.to) items = items.filter(({ item }) => (item.startDate ?? "9999-12-31") <= params.to!);
  if (params.year) items = items.filter(({ item }) => item.year === params.year);
  if (params.month) items = items.filter(({ item }) => item.month === params.month);
  if (params.region) items = items.filter(({ item }) => item.regionCode === params.region || item.regionName === params.region);
  if (params.department) items = items.filter(({ item }) => item.departmentCode === params.department || item.departmentName === params.department);
  if (params.cadence) items = items.filter(({ item }) => item.cadence === params.cadence);
  if (params.status) items = items.filter(({ item }) => item.status === params.status);
  if (params.hasResults !== undefined) items = items.filter(({ item }) => item.hasResults === params.hasResults);
  const allFiltered = items.map(({ item }) => item);
  const sort = params.sort ?? (query ? "relevance" : "date_desc");
  items.sort((a, b) => {
    if (sort === "relevance") return b.score - a.score || (b.item.startDate ?? "").localeCompare(a.item.startDate ?? "");
    if (sort === "date_asc") return (a.item.startDate ?? "9999").localeCompare(b.item.startDate ?? "9999");
    if (sort === "title") return a.item.title.localeCompare(b.item.title, "fr");
    return (b.item.startDate ?? "").localeCompare(a.item.startDate ?? "");
  });
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));
  const total = items.length;
  const status = await getCatalogStatus(storage, catalogItems);
  const facet = (values: Array<string | number | undefined>) =>
    Object.entries(values.filter((value) => value !== undefined).reduce<Record<string, number>>((acc, value) => {
      acc[String(value)] = (acc[String(value)] ?? 0) + 1;
      return acc;
    }, {})).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "fr"));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize).map(({ item }) => item),
    pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    facets: {
      regions: facet(allFiltered.map((item) => item.regionName)),
      departments: facet(allFiltered.map((item) => item.departmentCode)),
      years: facet(allFiltered.map((item) => item.year)),
      statuses: facet(allFiltered.map((item) => item.status)),
      cadences: facet(allFiltered.map((item) => item.cadence)),
    },
    catalog: {
      catalogCount: status.catalogCount,
      earliestIndexedDate: status.earliestIndexedDate,
      latestIndexedDate: status.latestIndexedDate,
      lastSuccessfulSyncAt: status.lastSuccessfulSyncAt,
      lastAttemptAt: status.lastAttemptAt,
      isRefreshing: status.isRefreshing,
      historicalBackfill: status.historicalBackfill,
      source: "FFE" as const,
    },
  };
}
