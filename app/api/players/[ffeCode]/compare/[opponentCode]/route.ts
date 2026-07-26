import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";
import { expectedScore, headToHead } from "@/lib/fide/statistics";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string; opponentCode: string }> }) {
  const params = await context.params;
  const code = validateFfeCode(params.ffeCode);
  const opponentCode = validateFfeCode(params.opponentCode);
  if (!code || !opponentCode || code === opponentCode) return apiError("Comparaison invalide", 400);
  if (!fideApiAllowed(request, `compare:${code}`)) return apiError("Trop de requêtes", 429);
  const [left, right] = await Promise.all([getGlobalReport(code), getGlobalReport(opponentCode)]);
  if (!left.report || !right.report) return apiError("Les deux rapports doivent être générés", 404);
  const leftRating = left.report.player.standardRating;
  const rightRating = right.report.player.standardRating;
  const competitionSummary = (report: NonNullable<typeof left.report>) => ({
    ffeParticipations: report.participations.length,
    fideEvents: report.events.length,
    ratedGames: report.statistics.ratedGames,
    wins: report.statistics.wins,
    draws: report.statistics.draws,
    losses: report.statistics.losses,
  });
  return NextResponse.json({
    players: [left.report.player, right.report.player],
    expectedScore: leftRating && rightRating ? expectedScore(leftRating, rightRating) : undefined,
    headToHead: headToHead(left.report.games, right.report.fideId),
    competitions: {
      players: [competitionSummary(left.report), competitionSummary(right.report)],
      commonFideEvents: [...new Set(left.report.events.map((event) => event.eventId).filter((eventId) =>
        right.report!.events.some((event) => event.eventId === eventId)
      ))],
    },
    commonOpponents: [...new Set(left.report.games.map((item) => item.opponentFideId).filter((id) =>
      id && right.report!.games.some((game) => game.opponentFideId === id)
    ))],
  });
}
