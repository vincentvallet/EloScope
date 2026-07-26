import type { FideRatedGame, FideRatingPoint, FideRatingType, PlayerGlobalReport } from "./types";

export function expectedScore(rating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export function ratingChange(ratings: FideRatingPoint[], type: FideRatingType, months = 12) {
  const points = ratings.filter((item) => item.ratingType === type && item.rating != null)
    .sort((a, b) => b.period.localeCompare(a.period));
  if (points.length < 2) return undefined;
  const latest = points[0];
  const cutoff = new Date(`${latest.period}T00:00:00Z`);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const previous = points.find((item) => new Date(`${item.period}T00:00:00Z`) <= cutoff) ?? points.at(-1);
  return previous?.rating == null ? undefined : latest.rating! - previous.rating;
}

export function computeStatistics(ratings: FideRatingPoint[], games: FideRatedGame[], now = new Date()): PlayerGlobalReport["statistics"] {
  const completed = games.filter((game) => game.result != null);
  const wins = completed.filter((game) => game.result === 1).length;
  const draws = completed.filter((game) => game.result === 0.5).length;
  const losses = completed.filter((game) => game.result === 0).length;
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
  const latest = (type: FideRatingType) => ratings.filter((item) => item.ratingType === type && item.rating != null)
    .sort((a, b) => b.period.localeCompare(a.period))[0]?.rating;
  const expected = games.filter((game) => game.opponentRating != null).map((game) =>
    expectedScore(game.playerRatingBefore ?? latest(game.ratingType) ?? game.opponentRating!, game.opponentRating!)
  );
  return {
    ratedGames: completed.length,
    wins, draws, losses,
    scorePercent: completed.length ? (wins + draws * 0.5) / completed.length * 100 : undefined,
    last12MonthsGames: completed.filter((game) => new Date(`${game.ratingPeriod}T00:00:00Z`) >= cutoff).length,
    standardChange12Months: ratingChange(ratings, "standard"),
    peakStandard: Math.max(...ratings.filter((item) => item.ratingType === "standard").map((item) => item.rating ?? 0)) || undefined,
    peakRapid: Math.max(...ratings.filter((item) => item.ratingType === "rapid").map((item) => item.rating ?? 0)) || undefined,
    peakBlitz: Math.max(...ratings.filter((item) => item.ratingType === "blitz").map((item) => item.rating ?? 0)) || undefined,
    expectedScore: expected.length ? expected.reduce((sum, item) => sum + item, 0) / expected.length * 100 : undefined,
  };
}

export function deterministicSummary(statistics: PlayerGlobalReport["statistics"]) {
  const lines: string[] = [];
  if (statistics.ratedGames) {
    lines.push(`Les données disponibles recensent ${statistics.ratedGames} partie${statistics.ratedGames > 1 ? "s" : ""} classée${statistics.ratedGames > 1 ? "s" : ""}, avec un score de ${Math.round(statistics.scorePercent ?? 0)} %.`);
    lines.push(`${statistics.last12MonthsGames} partie${statistics.last12MonthsGames > 1 ? "s" : ""} classée${statistics.last12MonthsGames > 1 ? "s" : ""} figure${statistics.last12MonthsGames > 1 ? "nt" : ""} sur les douze derniers mois.`);
  } else {
    lines.push("Aucune partie classée détaillée n’est encore disponible dans le cache partagé.");
  }
  if (statistics.standardChange12Months != null) {
    const direction = statistics.standardChange12Months > 0 ? "progressé" : statistics.standardChange12Months < 0 ? "reculé" : "été stable";
    lines.push(`Sur la période comparable, le classement standard a ${direction}${statistics.standardChange12Months ? ` de ${Math.abs(statistics.standardChange12Months)} points` : ""}.`);
  }
  return lines;
}

export function headToHead(games: FideRatedGame[], opponentFideId: string) {
  const selected = games.filter((game) => game.opponentFideId === opponentFideId && game.result != null);
  return {
    games: selected,
    total: selected.length,
    wins: selected.filter((game) => game.result === 1).length,
    draws: selected.filter((game) => game.result === 0.5).length,
    losses: selected.filter((game) => game.result === 0).length,
    score: selected.reduce((sum, game) => sum + (game.result ?? 0), 0),
  };
}
