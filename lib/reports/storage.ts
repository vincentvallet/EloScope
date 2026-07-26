import { MemoryTournamentReportStore } from "./memory";
import { NetlifyBlobTournamentReportStore } from "./netlify";
import type { TournamentReportStore } from "./types";

const memory = new MemoryTournamentReportStore();

export function tournamentReportStore(): TournamentReportStore {
  const netlify = process.env.NETLIFY === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.NETLIFY_DEV;
  return netlify ? new NetlifyBlobTournamentReportStore() : memory;
}
