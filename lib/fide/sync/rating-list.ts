import { parseFideRatingList } from "../parsers/rating-list";
import type { FideStorage } from "../storage/interface";
import type { FidePlayer } from "../types";

export async function syncFideRatingList(
  storage: FideStorage,
  period: string,
  lines: AsyncIterable<string>,
  options: { federation?: string; sourceUrl: string; fetchedAt?: string },
) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new Error("Période FIDE invalide");
  const fetchedAt = options.fetchedAt ?? new Date().toISOString();
  const segments = new Map<string, FidePlayer[]>();
  let imported = 0;
  for await (const player of parseFideRatingList(lines, fetchedAt)) {
    if (options.federation && player.federation !== options.federation) continue;
    const segment = `${player.federation ?? "UNK"}-${player.fideId.slice(0, 2).padEnd(2, "0")}`;
    const items = segments.get(segment) ?? [];
    items.push(player);
    segments.set(segment, items);
    imported += 1;
  }
  for (const [segment, players] of segments) {
    await storage.setJSON(`fide/rating-lists/${period}/players/${segment}.json`, players);
  }
  const metadata = { period, imported, segments: segments.size, sourceUrl: options.sourceUrl, fetchedAt, status: "ready" };
  await storage.setJSON(`fide/rating-lists/${period}/metadata.json`, metadata);
  await storage.setJSON("fide/rating-lists/latest.json", metadata);
  return metadata;
}
