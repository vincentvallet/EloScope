import { FfePlayersClient } from "./client";
import { identityConfidence, normalizePlayerName, playerNameIndexSegment } from "./identity";
import type { FfePlayerProfile, PlayerStorage, PlayerTournamentParticipation } from "./types";

const PROFILE_TTL = 24 * 60 * 60_000;

function score(profile: FfePlayerProfile, query: string) {
  const q = normalizePlayerName(query);
  if (profile.ffeCode === query.toUpperCase()) return 0;
  if (profile.normalizedName === q) return 1;
  if (normalizePlayerName(profile.lastName) === q) return 2;
  if (profile.normalizedName.startsWith(q) || normalizePlayerName(profile.lastName).startsWith(q)) return 3;
  return 4;
}

export async function savePlayerProfiles(storage: PlayerStorage, profiles: FfePlayerProfile[]) {
  for (const profile of profiles) {
    await storage.setJSON(`players/profiles/${profile.ffeCode}.json`, profile);
    const tokens = new Set(normalizePlayerName(`${profile.lastName} ${profile.firstName ?? ""}`).split(" ").filter((token) => token.length >= 3));
    for (const token of tokens) {
      await storage.setJSON(`indexes/player-prefix/${token.slice(0, 3)}/${profile.ffeCode}.json`, { ffeCode: profile.ffeCode });
    }
    const participationKeys = await storage.list(`participations/by-name/${playerNameIndexSegment(profile.displayName)}/`);
    for (const key of participationKeys) {
      const participation = await storage.getJSON<PlayerTournamentParticipation>(key);
      if (!participation) continue;
      const confidence = identityConfidence(profile, {
        name: participation.playerNameAtTournament,
        club: participation.clubAtTournament,
        rating: participation.playerRatingAtTournament,
      });
      if (confidence === "ambiguous") continue;
      await storage.setJSON(`players/by-code/${profile.ffeCode}/participations/${participation.tournamentRef}.json`, {
        ...participation,
        playerKey: profile.ffeCode,
        ffeCode: profile.ffeCode,
        ffeInternalId: profile.ffeInternalId,
        fideId: profile.fideId,
        identityConfidence: confidence,
      });
    }
  }
}

export async function localPlayerProfiles(storage: PlayerStorage) {
  const keys = await storage.list("players/profiles/");
  return (await Promise.all(keys.map((key) => storage.getJSON<FfePlayerProfile>(key)))).filter(Boolean) as FfePlayerProfile[];
}

export async function profilesForName(storage: PlayerStorage, name: string) {
  const prefixes = new Set(normalizePlayerName(name).split(" ").filter((token) => token.length >= 3).map((token) => token.slice(0, 3)));
  const indexKeys = (await Promise.all([...prefixes].map((prefix) => storage.list(`indexes/player-prefix/${prefix}/`)))).flat();
  const codes = [...new Set(indexKeys.map((key) => key.match(/\/([A-Z]\d{5})\.json$/)?.[1]).filter(Boolean))] as string[];
  return (await Promise.all(codes.map((code) => storage.getJSON<FfePlayerProfile>(`players/profiles/${code}.json`)))).filter(Boolean) as FfePlayerProfile[];
}

export async function searchPlayers(
  storage: PlayerStorage,
  client: FfePlayersClient,
  query: string,
  options: { club?: string; federation?: string; maxResults?: number } = {},
) {
  const q = normalizePlayerName(query);
  const exact = /^[A-Z]\d{5}$/i.test(query)
    ? await storage.getJSON<FfePlayerProfile>(`players/profiles/${query.toUpperCase()}.json`)
    : null;
  const candidates = exact ? [exact] : await profilesForName(storage, query);
  const local = candidates.filter((profile) =>
    profile.ffeCode === query.toUpperCase() || profile.normalizedName.includes(q)
  );
  const freshExact = local.some((profile) =>
    profile.ffeCode === query.toUpperCase() && Date.now() - new Date(profile.fetchedAt).getTime() < PROFILE_TTL
  );
  let remote: FfePlayerProfile[] = [];
  if (!freshExact && local.length < (options.maxResults ?? 20)) {
    remote = await client.search(query, options.maxResults ?? 20);
    await savePlayerProfiles(storage, remote);
  }
  const unique = new Map([...local, ...remote].map((profile) => [profile.ffeCode, profile]));
  return [...unique.values()]
    .filter((profile) => !options.club || normalizePlayerName(profile.currentClubName ?? "").includes(normalizePlayerName(options.club)))
    .filter((profile) => !options.federation || profile.federation === options.federation.toUpperCase())
    .sort((a, b) => score(a, query) - score(b, query) || a.displayName.localeCompare(b.displayName, "fr"));
}
