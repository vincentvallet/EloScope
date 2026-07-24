export type SourceType = "FFE" | "CHESS_RESULTS";
export type TournamentStatus = "UPCOMING" | "IN_PROGRESS" | "COMPLETED" | "UNKNOWN";
export type RatingType = "STANDARD" | "RAPID" | "BLITZ" | "UNKNOWN";

export type ImportWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "error";
};

export type TournamentReport = {
  id: string;
  slug: string;
  title: string;
  sourceType: SourceType;
  sourceUrl?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  currentRound: number;
  totalRounds: number;
  status: TournamentStatus;
  timeControl?: string;
  ratingType: RatingType;
  importedAt: string;
  sourceUpdatedAt?: string;
  warnings: ImportWarning[];
};

export type Player = {
  id: string;
  displayName: string;
  normalizedName: string;
  fideId?: string;
  federation?: string;
  league?: string;
  title?: string;
  category?: string;
};

export type Club = { id: string; displayName: string; normalizedName: string };

export type RoundResult = {
  round: number;
  opponentEntryId?: string;
  opponentName?: string;
  opponentRating?: number;
  color: "WHITE" | "BLACK" | "NONE" | "UNKNOWN";
  result: 1 | 0.5 | 0 | null;
  tournamentPoints: number;
  played: boolean;
  rated: boolean;
  bye: boolean;
  forfeit: boolean;
  sourceNotation?: string;
};

export type TournamentEntry = {
  id: string;
  tournamentId: string;
  playerId: string;
  clubId?: string;
  startingRating?: number;
  startingRank?: number;
  finalRank?: number;
  score: number;
  tieBreaks: Record<string, number | null>;
  providedPerformance?: number;
  estimatedPerformance?: number;
  rounds: RoundResult[];
};

export type RatingRoundCalculation = {
  round: number;
  expected: number | null;
  rawDelta: number;
  cumulative: number;
  included: boolean;
  reason?: string;
};

export type RatingScenario = {
  playerRating: number;
  kFactor: number;
  ruleset: string;
  perRound: RatingRoundCalculation[];
  rawTotalDelta: number;
  roundedTotalDelta: number;
  estimatedNewRating: number;
};
