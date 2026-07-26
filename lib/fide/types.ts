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
  federationCode?: string;
  federationName?: string;
  federationFlag?: string;
  birthYear?: number;
  fideTitle?: import("./federations").FidePlayerTitle;
  fideTitleLabel?: string;
  otherFideTitles?: string[];
  active?: boolean;
  standardRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  ratings: FideRatingPoint[];
  sourceUrl: string;
  fetchedAt: string;
};

export type PlayerCareerEvent = {
  canonicalEventId: string;
  playerKey: string;
  ffeCode?: string;
  fideId?: string;
  displayName: string;
  normalizedName: string;
  startDate?: string;
  endDate?: string;
  ratingPeriod?: string;
  year?: number;
  eventType: "individual_tournament" | "team_match" | "cup" | "rated_event" | "unknown";
  ratingType: FideRatingType | "unknown";
  ffeTournamentRef?: string;
  fideEventId?: string;
  city?: string;
  country?: string;
  score?: number;
  ratedGames?: number;
  averageOpponentRating?: number;
  performanceRating?: number;
  officialRatingChange?: number;
  finalRank?: number;
  sources: Array<{
    type: "ffe_catalog" | "ffe_results" | "fide_calculations" | "fide_event_report";
    url: string;
    fetchedAt: string;
  }>;
  catalogStatus: "matched" | "not_matched" | "not_applicable";
  reportStatus: "ready" | "available_to_generate" | "insufficient_data" | "not_generated";
  matchConfidence?: "exact" | "strong" | "probable" | "unmatched";
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

export type GlobalReportStatus =
  | "idle"
  | "queued"
  | "building"
  | "partial_ready"
  | "ready"
  | "retry_wait"
  | "failed";

export type PlayerGlobalReport = {
  version: 1 | 2 | 3 | 4;
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
  careerEvents?: PlayerCareerEvent[];
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
    knownEvents?: number;
    individualEvents?: number;
    teamEvents?: number;
    cupEvents?: number;
    matchedCatalogEvents?: number;
    unmatchedFideEvents?: number;
    officialRatingChange?: number;
    averagePerformance?: number;
    activityByYear?: Record<string, number>;
  };
  summary: string[];
  coverage: {
    recentYears: number[];
    completeYears: number[];
    oldestPeriod?: string;
    newestPeriod?: string;
    fideAvailable: boolean;
    ffeComplete: boolean;
    unavailableCalculationPeriods?: number;
  };
  provenance: Array<{ source: "FFE" | "FIDE"; url: string; fetchedAt: string; note: string }>;
  generatedAt: string;
  staleAt: string;
};

export type PlayerReportMetadata = {
  playerKey: string;
  status: GlobalReportStatus;
  ffeCode?: string;
  fideId?: string;
  attemptId?: string;
  progress: number;
  currentStage?: string;
  currentStep?: string;
  lastSuccessfulStage?: string;
  completedYears: number[];
  retryCount: number;
  nextRetryAt?: string;
  lockOwner?: string;
  lockExpiresAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};
