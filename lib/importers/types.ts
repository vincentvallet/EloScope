import type { TournamentReport } from "@/lib/domain";

export type RawTournamentSource = {
  kind: "html";
  content: string;
  fetchedAt: string;
};

export type ParsedTournament = {
  title?: string;
  currentRound?: number;
  headers: string[];
  rows: string[][];
  warnings: string[];
};

export type ImportedRound = {
  round: number;
  notation: string;
  opponentRank?: number;
  opponentName?: string;
  opponentRating?: number;
  color: "WHITE" | "BLACK" | "UNKNOWN";
  result: 1 | 0.5 | 0 | null;
  played: boolean;
};

export type ImportedPlayer = {
  id: string;
  rank: number;
  name: string;
  rating?: number;
  category?: string;
  federation?: string;
  league?: string;
  score: number;
  tieBreaks: Record<string, number | null>;
  performance?: number;
  rounds: ImportedRound[];
};

export type NormalizedTournament = {
  report: Partial<TournamentReport> & {
    title: string;
    sourceType: "FFE";
    currentRound: number;
    totalRounds: number;
    importedAt: string;
  };
  players: ImportedPlayer[];
  warnings: string[];
};

export interface TournamentSourceAdapter {
  id: string;
  name: string;
  canHandle(input: string): boolean;
  fetchSource(input: string): Promise<RawTournamentSource>;
  parseSource(source: RawTournamentSource): Promise<ParsedTournament>;
  normalize(parsed: ParsedTournament): NormalizedTournament;
}
