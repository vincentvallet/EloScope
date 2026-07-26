import { describe, expect, it } from "vitest";
import { buildPlayerCareerEvents, careerStatistics } from "@/lib/fide/career-events";
import { careerRatingSeries, filterRatingsByRange } from "@/lib/fide/rating-history";
import { FIDE_TITLE_LABELS, normalizeFideTitle, resolveFederation, validBirthYear } from "@/lib/fide/federations";
import type { FideRatedGame, FideRatingPoint } from "@/lib/fide/types";

const game: FideRatedGame = {
  id: "g1", fideId: "637610", opponentName: "Adversaire", result: 1,
  opponentRating: 1800, eventId: "123", eventName: "Open de Test",
  eventType: "individual", ratingPeriod: "2024-03-01", ratingType: "standard",
  sourceUrl: "https://ratings.fide.com/calculations.phtml",
};

describe("événements de carrière joueur", () => {
  it("conserve un événement FIDE sans référence FFE", () => {
    const events = buildPlayerCareerEvents({ ffeCode: "W16194", fideId: "637610", displayName: "Vincent VALLET", games: [game], events: [], participations: [], fetchedAt: "2026-07-01T00:00:00Z" });
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("ffeTournamentRef");
    expect(events[0]).toMatchObject({ catalogStatus: "not_matched", ratedGames: 1 });
    expect(careerStatistics(events)).toMatchObject({ knownEvents: 1, unmatchedFideEvents: 1 });
  });

  it("rapproche ultérieurement FFE et FIDE sans doublon et conserve les sources", () => {
    const events = buildPlayerCareerEvents({
      ffeCode: "W16194", fideId: "637610", displayName: "Vincent VALLET", games: [game], events: [],
      participations: [{ tournamentRef: "FFE42", title: "Open de Test", year: 2024, ratingType: "standard", score: 1, playedRounds: 1, sourceUrl: "https://ffe.test/42" }],
      fetchedAt: "2026-07-01T00:00:00Z",
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ ffeTournamentRef: "FFE42", catalogStatus: "matched", matchConfidence: "strong" });
    expect(events[0].sources.map((source) => source.type)).toEqual(["fide_calculations", "ffe_results"]);
  });
});

describe("historique Elo complet", () => {
  const points: FideRatingPoint[] = [
    { fideId: "1", period: "2015-01-01", ratingType: "standard", rating: 1500, isPublishedOfficialRating: true, sourceUrl: "x" },
    { fideId: "1", period: "2024-01-01", ratingType: "standard", rating: 1700, isPublishedOfficialRating: true, sourceUrl: "x" },
    { fideId: "1", period: "2026-01-01", ratingType: "rapid", rating: 1800, isPublishedOfficialRating: true, sourceUrl: "x" },
  ];
  it.each([[1, 1], [3, 2], [5, 2], [10, 2], ["career", 3]] as const)("filtre la période %s", (range, count) => {
    expect(filterRatingsByRange(points, range)).toHaveLength(count);
  });
  it("préserve les lacunes et les trois cadences", () => {
    const chart = careerRatingSeries(points, { standard: true, rapid: true, blitz: true });
    expect(chart.periods).toHaveLength(3);
    expect(chart.series.find((series) => series.type === "standard")?.data).toEqual([1500, 1700, null]);
    expect(chart.series.map((series) => series.type)).toEqual(["standard", "rapid", "blitz"]);
  });
});

describe("métadonnées FIDE", () => {
  it.each(Object.keys(FIDE_TITLE_LABELS))("reconnaît le titre %s", (title) => {
    expect(normalizeFideTitle(title)).toBe(title);
  });
  it("sépare les titres absents et valide uniquement une année plausible", () => {
    expect(normalizeFideTitle("IA")).toBeUndefined();
    expect(validBirthYear("1986")).toBe(1986);
    expect(validBirthYear("9999")).toBeUndefined();
    expect(validBirthYear("")).toBeUndefined();
  });
  it.each([["FRA", "🇫🇷"], ["ENG", "🏴"], ["SCO", "🏴"], ["FID", "FIDE"], ["XYZ", "🌐"]])("résout %s avec un fallback sûr", (code, flag) => {
    expect(resolveFederation(code)?.flagCode).toBe(flag);
  });
});
