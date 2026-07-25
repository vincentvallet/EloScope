import type { FfeTournamentCatalogItem } from "./types";

const SOURCE_PRIORITY = { committee: 1, calendar: 2, results: 3, detail: 4 };

function priority(item: FfeTournamentCatalogItem) {
  if (item.sourceListUrl === item.sourceDetailUrl) return SOURCE_PRIORITY.detail;
  if (/Action=RES/i.test(item.sourceListUrl)) return SOURCE_PRIORITY.results;
  if (/Calendrier|Tournois\.aspx/i.test(item.sourceListUrl)) return SOURCE_PRIORITY.calendar;
  return SOURCE_PRIORITY.committee;
}

export function mergeTournament(
  current: FfeTournamentCatalogItem | undefined,
  incoming: FfeTournamentCatalogItem,
) {
  if (!current) return incoming;
  const preferred = priority(incoming) >= priority(current) ? incoming : current;
  const fallback = preferred === incoming ? current : incoming;
  return {
    ...fallback,
    ...Object.fromEntries(Object.entries(preferred).filter(([, value]) => value !== undefined && value !== null && value !== "")),
    firstSeenAt: current.firstSeenAt < incoming.firstSeenAt ? current.firstSeenAt : incoming.firstSeenAt,
    lastSeenAt: current.lastSeenAt > incoming.lastSeenAt ? current.lastSeenAt : incoming.lastSeenAt,
    hasResults: current.hasResults || incoming.hasResults,
    hasStandardResults: current.hasStandardResults || incoming.hasStandardResults || undefined,
    hasRapidResults: current.hasRapidResults || incoming.hasRapidResults || undefined,
    status: current.hasResults || incoming.hasResults ? "results_available" : preferred.status,
  } satisfies FfeTournamentCatalogItem;
}

export function dedupeTournaments(items: FfeTournamentCatalogItem[]) {
  const byRef = new Map<string, FfeTournamentCatalogItem>();
  for (const item of items) byRef.set(item.ffeRef, mergeTournament(byRef.get(item.ffeRef), item));
  return [...byRef.values()];
}
