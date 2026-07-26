import { normalizePlayerName } from "@/lib/ffe-players/identity";
import type { FideEventResult, FideRatedGame, PlayerCareerEvent } from "./types";

type Participation = {
  tournamentRef: string;
  title: string;
  date?: string;
  year?: number;
  ratingType?: string;
  score?: number;
  playedRounds?: number;
  rank?: number;
  sourceUrl: string;
};

const eventType = (value?: string): PlayerCareerEvent["eventType"] =>
  value === "individual" ? "individual_tournament"
    : value === "team" ? "team_match"
      : value === "cup" ? "cup" : value ? "rated_event" : "unknown";

const ratingType = (value?: string): PlayerCareerEvent["ratingType"] =>
  value === "standard" || value === "rapid" || value === "blitz" ? value : "unknown";

function similarNames(a: string, b: string) {
  const left = new Set(normalizePlayerName(a).split(" ").filter((part) => part.length > 2));
  const right = new Set(normalizePlayerName(b).split(" ").filter((part) => part.length > 2));
  return [...left].filter((part) => right.has(part)).length >= Math.min(2, left.size, right.size);
}

export function buildPlayerCareerEvents(input: {
  ffeCode: string;
  fideId: string;
  displayName: string;
  games: FideRatedGame[];
  events: FideEventResult[];
  participations: Participation[];
  fetchedAt: string;
}) {
  const groups = new Map<string, FideRatedGame[]>();
  for (const game of input.games) {
    const id = game.eventId || normalizePlayerName(game.eventName);
    const key = `${id}:${game.ratingPeriod}:${game.ratingType}`;
    groups.set(key, [...(groups.get(key) ?? []), game]);
  }
  const result: PlayerCareerEvent[] = [];
  for (const games of groups.values()) {
    const first = games[0];
    const report = input.events.find((item) =>
      item.eventId === first.eventId && item.ratingType === first.ratingType);
    const ratings = games.map((game) => game.opponentRating).filter((value): value is number => value != null);
    const score = games.reduce((sum, game) => sum + (game.result ?? 0), 0);
    const id = first.eventId || normalizePlayerName(first.eventName).replaceAll(" ", "-");
    result.push({
      canonicalEventId: `fide:${id}:${input.fideId}:${first.ratingPeriod}:${first.ratingType}`,
      playerKey: input.ffeCode,
      ffeCode: input.ffeCode,
      fideId: input.fideId,
      displayName: report?.eventName || first.eventName,
      normalizedName: normalizePlayerName(report?.eventName || first.eventName),
      ratingPeriod: first.ratingPeriod,
      year: Number(first.ratingPeriod.slice(0, 4)) || undefined,
      eventType: eventType(report?.eventType || first.eventType),
      ratingType: first.ratingType,
      fideEventId: first.eventId,
      city: report?.city,
      country: report?.federation,
      score: report?.score ?? score,
      ratedGames: new Set(games.map((game) => game.id)).size,
      averageOpponentRating: ratings.length ? Math.round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length) : undefined,
      officialRatingChange: report?.ratingChange,
      sources: [
        { type: "fide_calculations", url: first.sourceUrl, fetchedAt: input.fetchedAt },
        ...(report ? [{ type: "fide_event_report" as const, url: report.sourceUrl, fetchedAt: input.fetchedAt }] : []),
      ],
      catalogStatus: "not_matched",
      reportStatus: "insufficient_data",
      matchConfidence: "unmatched",
    });
  }
  for (const participation of input.participations) {
    const candidate = result.find((item) =>
      item.ratingType === ratingType(participation.ratingType)
      && (!participation.year || !item.year || participation.year === item.year)
      && similarNames(item.displayName, participation.title)
      && (!participation.playedRounds || !item.ratedGames || participation.playedRounds === item.ratedGames));
    if (candidate) {
      candidate.ffeTournamentRef = participation.tournamentRef;
      candidate.catalogStatus = "matched";
      candidate.reportStatus = "available_to_generate";
      candidate.matchConfidence = "strong";
      candidate.sources.push({ type: "ffe_results", url: participation.sourceUrl, fetchedAt: input.fetchedAt });
      candidate.startDate ??= participation.date;
      candidate.finalRank ??= participation.rank;
      continue;
    }
    result.push({
      canonicalEventId: `ffe:${participation.tournamentRef}:${input.ffeCode}`,
      playerKey: input.ffeCode,
      ffeCode: input.ffeCode,
      fideId: input.fideId,
      displayName: participation.title,
      normalizedName: normalizePlayerName(participation.title),
      startDate: participation.date,
      year: participation.year,
      eventType: "individual_tournament",
      ratingType: ratingType(participation.ratingType),
      ffeTournamentRef: participation.tournamentRef,
      score: participation.score,
      ratedGames: participation.playedRounds,
      finalRank: participation.rank,
      sources: [{ type: "ffe_results", url: participation.sourceUrl, fetchedAt: input.fetchedAt }],
      catalogStatus: "matched",
      reportStatus: "available_to_generate",
      matchConfidence: "exact",
    });
  }
  return result.sort((a, b) => (b.startDate || b.ratingPeriod || String(b.year || "")).localeCompare(a.startDate || a.ratingPeriod || String(a.year || "")));
}

export function careerStatistics(events: PlayerCareerEvent[]) {
  const performances = events.map((event) => event.performanceRating).filter((value): value is number => value != null);
  return {
    knownEvents: events.length,
    individualEvents: events.filter((event) => event.eventType === "individual_tournament").length,
    teamEvents: events.filter((event) => event.eventType === "team_match").length,
    cupEvents: events.filter((event) => event.eventType === "cup").length,
    matchedCatalogEvents: events.filter((event) => event.catalogStatus === "matched").length,
    unmatchedFideEvents: events.filter((event) => event.catalogStatus === "not_matched" && event.sources.some((source) => source.type.startsWith("fide_"))).length,
    officialRatingChange: events.reduce((sum, event) => sum + (event.officialRatingChange ?? 0), 0),
    averagePerformance: performances.length ? Math.round(performances.reduce((sum, value) => sum + value, 0) / performances.length) : undefined,
    activityByYear: events.reduce<Record<string, number>>((years, event) => {
      if (event.year) years[event.year] = (years[event.year] ?? 0) + 1;
      return years;
    }, {}),
  };
}
