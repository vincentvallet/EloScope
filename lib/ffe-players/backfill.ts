import type { PlayerStorage } from "./types";

export type PlayerBackfillState = {
  targetStart: string;
  targetEnd: string;
  completedTournamentCount: number;
  pendingTournamentCount: number;
  failedTournamentCount: number;
  running: boolean;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  cursor?: string;
  pausedReason?: string;
};

export type PlayerBackfillOptions = {
  storage: PlayerStorage;
  tournamentRefs: string[];
  indexTournament: (ref: string) => Promise<void>;
  catalogBackfillRunning: () => Promise<boolean>;
  requestBudget?: number;
  timeBudgetMs?: number;
  now?: () => Date;
};

const STATE_KEY = "metadata/player-backfill-status.json";
const LOCK_KEY = "locks/player-backfill.json";

export async function runPlayerParticipationBackfill(options: PlayerBackfillOptions) {
  const now = options.now ?? (() => new Date());
  if (await options.catalogBackfillRunning()) return { skipped: "catalog-priority" as const };
  const current = now();
  const existingLock = await options.storage.getJSON<{ owner: string; expiresAt: string }>(LOCK_KEY);
  if (existingLock && existingLock.expiresAt > current.toISOString()) return { skipped: "locked" as const };
  const owner = crypto.randomUUID();
  await options.storage.setJSON(LOCK_KEY, { owner, expiresAt: new Date(current.getTime() + 10 * 60_000).toISOString() });
  const verified = await options.storage.getJSON<{ owner: string }>(LOCK_KEY);
  if (verified?.owner !== owner) return { skipped: "locked" as const };
  const initial = await options.storage.getJSON<PlayerBackfillState>(STATE_KEY) ?? {
    targetStart: "2000-01",
    targetEnd: current.toISOString().slice(0, 7),
    completedTournamentCount: 0,
    pendingTournamentCount: options.tournamentRefs.length,
    failedTournamentCount: 0,
    running: false,
    startedAt: null,
    updatedAt: null,
    completedAt: null,
  };
  const started = Date.now();
  const budget = Math.min(options.requestBudget ?? 20, 50);
  let processed = 0;
  const state: PlayerBackfillState = { ...initial, running: true, startedAt: initial.startedAt ?? current.toISOString(), updatedAt: current.toISOString() };
  try {
    const startIndex = state.cursor ? Math.max(0, options.tournamentRefs.indexOf(state.cursor) + 1) : 0;
    for (const ref of options.tournamentRefs.slice(startIndex)) {
      if (processed >= budget || Date.now() - started >= (options.timeBudgetMs ?? 45_000)) break;
      if (await options.catalogBackfillRunning()) { state.pausedReason = "catalog-priority"; break; }
      try {
        await options.indexTournament(ref);
        state.completedTournamentCount += 1;
      } catch {
        state.failedTournamentCount += 1;
        const failures = await options.storage.getJSON<{ attempts: number; lastAttemptAt: string }>(`quarantine/player-backfill/${ref}.json`);
        await options.storage.setJSON(`quarantine/player-backfill/${ref}.json`, {
          attempts: (failures?.attempts ?? 0) + 1,
          lastAttemptAt: now().toISOString(),
        });
      }
      processed += 1;
      state.cursor = ref;
      state.pendingTournamentCount = Math.max(0, options.tournamentRefs.length - startIndex - processed);
      state.updatedAt = now().toISOString();
      await options.storage.setJSON(STATE_KEY, state);
    }
    state.running = false;
    if (state.pendingTournamentCount === 0) state.completedAt = now().toISOString();
    await options.storage.setJSON(STATE_KEY, state);
    return { processed, state };
  } finally {
    const lock = await options.storage.getJSON<{ owner: string }>(LOCK_KEY);
    if (lock?.owner === owner) await options.storage.setJSON(LOCK_KEY, { owner: "", expiresAt: new Date(0).toISOString() });
  }
}
