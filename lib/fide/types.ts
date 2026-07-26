export type FideRatingType = "standard" | "rapid" | "blitz";
export type FideEventType = "individual" | "team" | "cup" | "unknown";

export type FideRatingPoint = {
  fideId: string;
  period: string;
  ratingType: FideRatingType;
  rating?: number;
  games?: number;
  isPublishedOfficialRating: true;
  sourceUrl: string;
};

export type FidePlayer = {
  fideId: string;
  name: string;
  federation?: string;
  title?: string;
  active?: boolean;
  standardRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  ratings: FideRatingPoint[];
  sourceUrl: string;
  fetchedAt: string;
};

export type FideRatedGame = {
  id: string;
  fideId: string;
  opponentFideId?: string;
  opponentName: string;
  result?: 0 | 0.5 | 1;
  color?: "white" | "black" | "unknown";
  playerRatingBefore?: number;
  opponentRating?: number;
  eventId?: string;
  eventName: string;
  eventType: FideEventType;
  ratingPeriod: string;
  ratingType: FideRatingType;
  sourceUrl: string;
};

export type FideEventResult = {
  eventId: string;
  eventName: string;
  city?: string;
  federation?: string;
  ratingPeriod?: string;
  ratingType: FideRatingType;
  eventType: FideEventType;
  fideId: string;
  playerName: string;
  playerRating?: number;
  score?: number;
  games?: number;
  ratingChange?: number;
  sourceUrl: string;
};

export type GlobalReportStatus = "missing" | "queued" | "building" | "ready" | "partial" | "error";

export type PlayerGlobalReport = {
  version: 1;
  ffeCode: string;
  fideId: string;
  player: FidePlayer;
  ratings: FideRatingPoint[];
  events: FideEventResult[];
  games: FideRatedGame[];
  participations: Array<{
    tournamentRef: string;
    title: string;
    date?: string;
    year?: number;
    ratingType?: string;
    score?: number;
    playedRounds?: number;
    rank?: number;
    sourceUrl: string;
  }>;
  statistics: {
    ratedGames: number;
    wins: number;
    draws: number;
    losses: number;
    scorePercent?: number;
    last12MonthsGames: number;
    standardChange12Months?: number;
    peakStandard?: number;
    peakRapid?: number;
    peakBlitz?: number;
    expectedScore?: number;
  };
  summary: string[];
  coverage: {
    recentYears: number[];
    completeYears: number[];
    oldestPeriod?: string;
    newestPeriod?: string;
    fideAvailable: boolean;
    ffeComplete: boolean;
  };
  provenance: Array<{ source: "FFE" | "FIDE"; url: string; fetchedAt: string; note: string }>;
  generatedAt: string;
  staleAt: string;
};

export type PlayerReportMetadata = {
  status: GlobalReportStatus;
  ffeCode: string;
  fideId?: string;
  progress: number;
  currentStep?: string;
  completedYears: number[];
  requestedAt: string;
  updatedAt: string;
  retryAfter?: string;
  error?: string;
};
