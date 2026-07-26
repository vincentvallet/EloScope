import { FideClient } from "../client";
import { normalizeFideId } from "../identity/normalize-fide-id";
import { parseFideProfile } from "../parsers/profile";
import type { FideStorage } from "../storage/interface";

export async function syncFidePlayer(storage: FideStorage, fideIdValue: string, client = new FideClient({ storage })) {
  const fideId = normalizeFideId(fideIdValue);
  const response = await client.html(`https://ratings.fide.com/profile/${fideId}`, {
    cacheKey: `fide/players/${fideId}/profile-html.json`,
    ttlMs: 24 * 60 * 60_000,
  });
  const player = parseFideProfile(response.body, fideId, response.fetchedAt);
  await storage.setJSON(`fide/players/${fideId}/profile.json`, player);
  return player;
}
