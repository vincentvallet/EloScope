import { demoEntries, demoReport } from "@/data/demo-tournament";
import type { TournamentSourceAdapter } from "./types";

export class DemoTournamentAdapter implements TournamentSourceAdapter {
  id = "demo-tournament"; name = "Tournoi de démonstration";
  canHandle(input: string) { return input === "demo"; }
  async fetchSource() { return { kind: "demo" as const, content: "demo", fetchedAt: new Date().toISOString() }; }
  async parseSource() { return { title: demoReport.title, headers: [], rows: [], warnings: [] }; }
  normalize() {
    return {
      report: demoReport,
      players: demoEntries.map((entry) => ({ name: entry.player.displayName, rating: entry.startingRating ?? null, score: entry.score })),
      warnings: [],
    };
  }
}

export class ChessResultsAdapterPlaceholder {
  id = "chess-results"; name = "Chess-Results (à venir)"; enabled = false;
}
