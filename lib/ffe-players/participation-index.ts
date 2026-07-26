import type { NormalizedTournament } from "@/lib/importers/types";
import type { FfeTournamentCatalogItem } from "@/lib/ffe-catalog/types";
import { identityConfidence, normalizePlayerName, playerNameIndexSegment } from "./identity";
import { profilesForName } from "./search";
import type { PlayerStorage, PlayerTournamentParticipation } from "./types";

export async function indexTournamentParticipations(
  storage: PlayerStorage,
  ffeRef: string,
  report: NormalizedTournament,
  tournament?: FfeTournamentCatalogItem,
) {
  const indexedAt = new Date().toISOString();
  const items: PlayerTournamentParticipation[] = [];
  for (const player of report.players) {
    const profiles = await profilesForName(storage, player.name);
    const matches = profiles
      .map((profile) => ({ profile, confidence: identityConfidence(profile, {
        name: player.name, club: player.club, rating: player.rating,
      }) }))
      .filter((match) => match.confidence !== "ambiguous");
    const unique = matches.length === 1 ? matches[0] : undefined;
    const playedRounds = player.rounds.filter((round) => round.played).length;
    const participation: PlayerTournamentParticipation = {
      id: `${ffeRef}:${player.id}`,
      playerKey: unique?.profile.ffeCode ?? `name:${normalizePlayerName(player.name)}`,
      ffeCode: unique?.profile.ffeCode,
      ffeInternalId: unique?.profile.ffeInternalId,
      fideId: unique?.profile.fideId,
      playerNameAtTournament: player.name,
      normalizedPlayerName: normalizePlayerName(player.name),
      tournamentRef: ffeRef,
      tournamentTitle: report.report.title,
      tournamentStartDate: tournament?.startDate,
      tournamentEndDate: tournament?.endDate,
      year: tournament?.year,
      city: tournament?.city,
      departmentCode: tournament?.departmentCode,
      departmentName: tournament?.departmentName,
      regionCode: tournament?.regionCode,
      regionName: tournament?.regionName,
      ratingType: report.report.ratingType?.toLowerCase() as PlayerTournamentParticipation["ratingType"] ?? "unknown",
      playerRatingAtTournament: player.rating,
      clubAtTournament: player.club,
      federationAtTournament: player.federation,
      categoryAtTournament: player.category,
      finalRank: player.rank,
      score: player.score,
      totalRounds: report.report.totalRounds,
      playedRounds,
      hasOfficialResults: playedRounds > 0,
      canOpenReport: true,
      identityConfidence: unique?.confidence ?? "ambiguous",
      reportEntryId: player.id,
      sourceUrl: report.report.sourceUrl ?? `https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=${ffeRef}`,
      indexedAt,
    };
    items.push(participation);
    await storage.setJSON(
      `participations/by-name/${playerNameIndexSegment(player.name)}/${ffeRef}-${player.id}.json`,
      participation,
    );
    if (unique) {
      await storage.setJSON(`players/by-code/${unique.profile.ffeCode}/participations/${ffeRef}.json`, participation);
    }
  }
  await storage.setJSON(`participations/by-tournament/${ffeRef}.json`, items);
}
