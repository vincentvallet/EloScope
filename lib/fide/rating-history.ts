import type { FideRatingPoint, FideRatingType } from "./types";

export type RatingRange = 1 | 3 | 5 | 10 | "career";

export function filterRatingsByRange(points: FideRatingPoint[], range: RatingRange) {
  if (range === "career" || !points.length) return points;
  const newest = points.reduce((date, point) => point.period > date ? point.period : date, points[0].period);
  const threshold = new Date(newest);
  threshold.setUTCFullYear(threshold.getUTCFullYear() - range);
  const from = threshold.toISOString().slice(0, 10);
  return points.filter((point) => point.period >= from);
}

export function careerRatingSeries(points: FideRatingPoint[], visible: Record<FideRatingType, boolean>) {
  const periods = [...new Set(points.map((point) => point.period))].sort();
  const types: FideRatingType[] = ["standard", "rapid", "blitz"];
  return {
    periods,
    series: types.filter((type) => visible[type]).map((type) => ({
      type,
      data: periods.map((period) => points.find((point) => point.period === period && point.ratingType === type)?.rating ?? null),
    })),
  };
}
