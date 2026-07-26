import type { FideRatingPoint, FideRatingType } from "../types";

export type FideChartRow = {
  date_2?: string;
  rating?: string | number | null;
  period_games?: string | number | null;
  rapid_rtng?: string | number | null;
  rapid_games?: string | number | null;
  blitz_rtng?: string | number | null;
  blitz_games?: string | number | null;
};

const months: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const value = (input: unknown) => {
  if (input == null || input === "") return undefined;
  const number = Number(input);
  return Number.isFinite(number) ? number : undefined;
};

export function parseFideRatingHistory(rows: FideChartRow[], fideId: string): FideRatingPoint[] {
  const sourceUrl = `https://ratings.fide.com/profile/${fideId}/chart`;
  const points: FideRatingPoint[] = [];
  for (const row of rows) {
    const match = row.date_2?.match(/^(\d{4})-([A-Za-z]{3})$/);
    if (!match || !months[match[2]]) continue;
    const period = `${match[1]}-${months[match[2]]}-01`;
    const definitions: Array<[FideRatingType, unknown, unknown]> = [
      ["standard", row.rating, row.period_games],
      ["rapid", row.rapid_rtng, row.rapid_games],
      ["blitz", row.blitz_rtng, row.blitz_games],
    ];
    for (const [ratingType, rawRating, rawGames] of definitions) {
      const rating = value(rawRating);
      const games = value(rawGames);
      if (rating == null && games == null) continue;
      points.push({
        fideId,
        period,
        ratingType,
        rating,
        games,
        isPublishedOfficialRating: true,
        sourceUrl,
      });
    }
  }
  return points.sort((a, b) => b.period.localeCompare(a.period) || a.ratingType.localeCompare(b.ratingType));
}
