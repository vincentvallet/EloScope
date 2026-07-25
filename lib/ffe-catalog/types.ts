export type FfeCadence = "standard" | "rapid" | "blitz" | "unknown";
export type FfeTournamentStatus =
  | "upcoming"
  | "in_progress"
  | "results_available"
  | "completed_without_results"
  | "unknown";

export type FfeTournamentCatalogItem = {
  ffeRef: string;
  title: string;
  normalizedTitle: string;
  city?: string;
  departmentCode?: string;
  departmentName?: string;
  regionCode?: string;
  regionName?: string;
  startDate?: string;
  endDate?: string;
  year?: number;
  month?: number;
  federation?: string;
  cadence?: FfeCadence;
  status: FfeTournamentStatus;
  hasResults: boolean;
  hasStandardResults?: boolean;
  hasRapidResults?: boolean;
  sourceListUrl: string;
  sourceDetailUrl: string;
  resultUrl?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  sourceUpdatedAt?: string;
  rounds?: number;
  organizer?: string;
  arbiter?: string;
  address?: string;
};

export type CatalogSyncStatus = {
  lastAttemptAt?: string;
  lastSuccessfulSyncAt?: string;
  isRefreshing: boolean;
  lastError?: string;
  itemCount: number;
  updatedMonths: string[];
};

export type CatalogBatch = {
  key: string;
  items: FfeTournamentCatalogItem[];
  fetchedAt: string;
  sourceUrl: string;
};

export interface CatalogStorage {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export type TournamentSearchParams = {
  q?: string;
  from?: string;
  to?: string;
  year?: number;
  month?: number;
  region?: string;
  department?: string;
  cadence?: FfeCadence;
  status?: FfeTournamentStatus;
  hasResults?: boolean;
  page?: number;
  pageSize?: number;
  sort?: "relevance" | "date_asc" | "date_desc" | "title";
};
