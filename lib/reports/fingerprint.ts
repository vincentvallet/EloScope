import { createHash } from "node:crypto";
import type { NormalizedTournament } from "@/lib/importers/types";

export function tournamentReportFingerprint(ref: string, report: NormalizedTournament) {
  const stable = {
    ref,
    currentRound: report.report.currentRound,
    totalRounds: report.report.totalRounds,
    players: report.players.map((player) => ({
      name: player.name,
      rank: player.rank,
      rating: player.rating,
      score: player.score,
      rounds: player.rounds.map((round) => round.notation),
    })),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
