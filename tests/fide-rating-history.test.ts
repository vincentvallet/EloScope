import { describe, expect, it } from "vitest";
import { parseFideRatingHistory } from "@/lib/fide/parsers/rating-history";

describe("historique FIDE toute la carrière", () => {
  it("conserve les points trimestriels anciens et les trois cadences sans inventer de valeurs", () => {
    const points = parseFideRatingHistory([
      { date_2: "2004-Jul", rating: "1929", period_games: "9", rapid_rtng: null, blitz_rtng: null },
      { date_2: "2026-Jul", rating: "1867", period_games: "0", rapid_rtng: "1815", rapid_games: "0", blitz_rtng: "1800", blitz_games: "0" },
    ], "637610");
    expect(points).toHaveLength(4);
    expect(points.at(-1)).toMatchObject({ period: "2004-07-01", ratingType: "standard", rating: 1929, games: 9 });
    expect(points.filter((point) => point.period === "2026-07-01").map((point) => point.ratingType)).toEqual(["blitz", "rapid", "standard"]);
  });
});
