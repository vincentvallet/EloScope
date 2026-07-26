import type { FidePlayer } from "../types";
import { normalizeFideId } from "../identity/normalize-fide-id";

export function parseFideFixedWidthLine(line: string, fetchedAt = new Date().toISOString()): FidePlayer | null {
  const fideIdRaw = line.slice(0, 15).trim();
  if (!/^\d+$/.test(fideIdRaw)) return null;
  const fideId = normalizeFideId(fideIdRaw);
  const name = line.slice(15, 76).trim().replace(/\s+/g, " ");
  if (!name) return null;
  const federation = line.slice(76, 79).trim() || undefined;
  const standardRating = Number(line.slice(113, 117).trim()) || undefined;
  return {
    fideId, name, federation,
    title: line.slice(84, 89).trim() || undefined,
    active: !/i/i.test(line.slice(158, 159)),
    standardRating,
    ratings: [],
    sourceUrl: "https://ratings.fide.com/download_lists.phtml",
    fetchedAt,
  };
}

export async function* parseFideRatingList(lines: AsyncIterable<string>, fetchedAt?: string) {
  for await (const line of lines) {
    const player = parseFideFixedWidthLine(line, fetchedAt);
    if (player) yield player;
  }
}
