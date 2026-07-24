import type { TournamentReport } from "@/lib/domain";

export type RawTournamentSource = {
  kind: "html" | "csv" | "demo";
  content: string;
  fetchedAt: string;
};

export type ParsedTournament = {
  title?: string;
  headers: string[];
  rows: string[][];
  warnings: string[];
};

export type NormalizedTournament = {
  report: Partial<TournamentReport>;
  players: Array<Record<string, unknown>>;
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
