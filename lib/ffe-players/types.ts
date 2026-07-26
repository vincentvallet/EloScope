export type FfePlayerProfile = {
  ffeCode: string;
  ffeInternalId?: string;
  fideId?: string;
  lastName: string;
  firstName?: string;
  displayName: string;
  normalizedName: string;
  title?: string;
  federation?: string;
  affiliationStatus?: string;
  currentClubName?: string;
  currentClubCode?: string;
  standardRating?: number;
  rapidRating?: number;
  blitzRating?: number;
  category?: string;
  sourceUrl?: string;
  fetchedAt: string;
  sourceUpdatedAt?: string;
};

export type IdentityConfidence =
  | "exact_ffe_code"
  | "exact_internal_id"
  | "exact_fide_id"
  | "strong_name_match"
  | "ambiguous";

export type PlayerTournamentParticipation = {
  id: string;
  playerKey: string;
  ffeCode?: string;
  ffeInternalId?: string;
  fideId?: string;
  playerNameAtTournament: string;
  normalizedPlayerName: string;
  tournamentRef: string;
  tournamentTitle: string;
  tournamentStartDate?: string;
  tournamentEndDate?: string;
  year?: number;
  city?: string;
  departmentCode?: string;
  departmentName?: string;
  regionCode?: string;
  regionName?: string;
  ratingType?: "standard" | "rapid" | "blitz" | "unknown";
  playerRatingAtTournament?: number;
  clubAtTournament?: string;
  federationAtTournament?: string;
  categoryAtTournament?: string;
  startingRank?: number;
  finalRank?: number;
  score?: number;
  totalRounds?: number;
  playedRounds?: number;
  hasOfficialResults: boolean;
  canOpenReport: boolean;
  identityConfidence: IdentityConfidence;
  reportEntryId?: string;
  sourceUrl: string;
  indexedAt: string;
};

export type PlayerCoverage = {
  from?: string;
  to?: string;
  complete: boolean;
};

export interface PlayerStorage {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}
