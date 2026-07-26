import { FfePlayersClient } from "@/lib/ffe-players/client";
import { PLAYER_BACKFILL_STATE_KEY, type PlayerBackfillState } from "@/lib/ffe-players/backfill";
import { playerStorage } from "@/lib/ffe-players/storage";
import type { FfePlayerProfile, PlayerStorage, PlayerTournamentParticipation } from "@/lib/ffe-players/types";
import { savePlayerProfiles, searchPlayers } from "@/lib/ffe-players/search";
import { FideClient } from "./client";
import { classifyFideError, FideSourceError } from "./errors";
import { linkFfeToFide } from "./identity/ffe-fide-link";
import { parseFideProfile } from "./parsers/profile";
import { parseFideCalculations } from "./parsers/calculations";
import { parseFideEventReport } from "./parsers/event-report";
import { computeStatistics, deterministicSummary } from "./statistics";
import { buildPlayerCareerEvents, careerStatistics } from "./career-events";
import { fideStorage } from "./storage";
import type { FideStorage } from "./storage/interface";
import type {
  FideEventResult,
  FidePlayer,
  FideRatedGame,
  PlayerGlobalReport,
  PlayerReportMetadata,
} from "./types";

const key = (ffeCode: string, name: string) => `fide/player-reports/${ffeCode}/${name}.json`;
const checkpointKey = (ffeCode: string, stage: string) => key(ffeCode, `checkpoints/${stage}`);
export const REPORT_LOCK_MS = 5 * 60_000;
export const MAX_CLOSE_RETRIES = 3;

const stages = {
  identity: { progress: 5, label: "Identité FFE chargée" },
  fide_identity: { progress: 15, label: "Identifiant FIDE résolu" },
  fide_profile: { progress: 25, label: "Profil FIDE chargé" },
  ratings: { progress: 35, label: "Historique Elo chargé" },
  calculations: { progress: 50, label: "Calculs FIDE récents chargés" },
  events: { progress: 65, label: "Événements FIDE chargés" },
  participations: { progress: 75, label: "Participations FFE rapprochées" },
  statistics: { progress: 85, label: "Statistiques calculées" },
  report: { progress: 95, label: "Rapport validé" },
} as const;
type Stage = keyof typeof stages;

type Checkpoints = {
  identity: FfePlayerProfile;
  fide_identity: { fideId: string };
  fide_profile: FidePlayer;
  ratings: FidePlayer["ratings"];
  calculations: FideRatedGame[];
  events: FideEventResult[];
  participations: PlayerTournamentParticipation[];
  statistics: PlayerGlobalReport["statistics"];
  report: PlayerGlobalReport;
};

type Logger = (entry: Record<string, unknown>) => void;
const defaultLogger: Logger = (entry) => console.log(JSON.stringify(entry));

function normalizeMetadata(
  value: unknown,
  ffeCode: string,
  now = new Date(),
): PlayerReportMetadata | null {
  if (!isObject(value)) return null;
  const raw = value as Partial<Omit<PlayerReportMetadata, "status">> & {
    status?: string;
    retryAfter?: string;
    error?: string;
    requestedAt?: string;
  };
  const legacyStatus = raw.status;
  const status = legacyStatus === "partial" ? "partial_ready"
    : legacyStatus === "error" ? "retry_wait"
      : legacyStatus === "missing" ? "idle"
        : legacyStatus;
  const createdAt = raw.createdAt ?? raw.requestedAt ?? raw.updatedAt ?? now.toISOString();
  return {
    playerKey: raw.playerKey ?? ffeCode,
    ffeCode: raw.ffeCode ?? ffeCode,
    fideId: raw.fideId,
    status: (status ?? "idle") as PlayerReportMetadata["status"],
    attemptId: raw.attemptId,
    progress: Math.max(0, Math.min(100, raw.progress ?? 0)),
    currentStage: raw.currentStage,
    currentStep: raw.currentStep,
    lastSuccessfulStage: raw.lastSuccessfulStage,
    completedYears: raw.completedYears ?? [],
    retryCount: raw.retryCount ?? (legacyStatus === "error" ? 1 : 0),
    nextRetryAt: raw.nextRetryAt ?? raw.retryAfter,
    lockOwner: raw.lockOwner,
    lockExpiresAt: raw.lockExpiresAt,
    lastErrorCode: raw.lastErrorCode ?? (raw.error ? "NETWORK" : undefined),
    lastErrorMessage: raw.lastErrorMessage ?? raw.error,
    createdAt,
    updatedAt: raw.updatedAt ?? createdAt,
    completedAt: raw.completedAt,
  };
}

async function writeValidated<T>(
  storage: FideStorage,
  activeKey: string,
  value: T,
  attemptId: string,
  validate: (candidate: unknown) => candidate is T,
) {
  const temporaryKey = `${activeKey}.tmp-${attemptId}`;
  try {
    await storage.setJSON(temporaryKey, value);
    const candidate = await storage.getJSON<unknown>(temporaryKey);
    if (!validate(candidate)) throw new FideSourceError("STORAGE_WRITE", `Checkpoint invalide: ${activeKey}`);
    await storage.setJSON(activeKey, candidate);
  } catch (error) {
    throw error instanceof FideSourceError
      ? error
      : new FideSourceError("STORAGE_WRITE", `Écriture impossible: ${activeKey}`, undefined, undefined, undefined, { cause: error });
  } finally {
    await storage.delete(temporaryKey).catch(() => {});
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object";
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

export async function getGlobalReport(ffeCodeValue: string, storage: FideStorage = fideStorage()) {
  const ffeCode = ffeCodeValue.toUpperCase();
  const [report, rawMetadata] = await Promise.all([
    storage.getJSON<PlayerGlobalReport>(key(ffeCode, "report")),
    storage.getJSON<PlayerReportMetadata>(key(ffeCode, "metadata")),
  ]);
  const metadata = normalizeMetadata(rawMetadata, ffeCode);
  if (report && !report.careerEvents) {
    report.careerEvents = buildPlayerCareerEvents({
      ffeCode,
      fideId: report.fideId,
      displayName: report.player.name,
      games: report.games,
      events: report.events,
      participations: report.participations,
      fetchedAt: report.generatedAt,
    });
    report.statistics = { ...report.statistics, ...careerStatistics(report.careerEvents) };
  }
  return { report, metadata, stale: !!report && (report.version !== 2 || Date.parse(report.staleAt) <= Date.now()) };
}

export async function queueGlobalReport(ffeCodeValue: string, storage: FideStorage = fideStorage(), now = new Date()) {
  const ffeCode = ffeCodeValue.toUpperCase();
  const existing = await getGlobalReport(ffeCode, storage);
  if (existing.report?.version === 2 && !existing.stale && existing.metadata?.status === "ready") return { state: "ready" as const, ...existing };
  if (
    existing.metadata?.status === "retry_wait"
    && existing.metadata.nextRetryAt
    && Date.parse(existing.metadata.nextRetryAt) > now.getTime()
  ) return { state: "pending" as const, ...existing };
  const lock = await storage.getJSON<{ owner?: string; expiresAt?: string }>(key(ffeCode, "lock"));
  if (
    existing.metadata
    && (
      (existing.metadata.status === "queued" && Date.parse(existing.metadata.updatedAt) > now.getTime() - REPORT_LOCK_MS)
      || (existing.metadata.status === "building" && !!lock?.expiresAt && Date.parse(lock.expiresAt) > now.getTime())
    )
  ) return { state: "pending" as const, ...existing };
  const attemptId = crypto.randomUUID();
  const metadata: PlayerReportMetadata = {
    playerKey: ffeCode,
    ffeCode,
    fideId: existing.metadata?.fideId,
    status: "queued",
    attemptId,
    progress: existing.metadata?.progress ?? 0,
    currentStage: existing.metadata?.currentStage,
    currentStep: existing.metadata?.progress
      ? "Reprise du rapport depuis le dernier checkpoint"
      : "Rapport placé dans la file de construction",
    lastSuccessfulStage: existing.metadata?.lastSuccessfulStage,
    completedYears: existing.metadata?.completedYears ?? [],
    retryCount: existing.metadata?.retryCount ?? 0,
    createdAt: existing.metadata?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await writeValidated(storage, key(ffeCode, "metadata"), metadata, attemptId, isObject);
  return { state: "queued" as const, report: existing.report, metadata, stale: existing.stale };
}

async function resolveProfile(ffeCode: string, storage: PlayerStorage) {
  let profile = await storage.getJSON<FfePlayerProfile>(`players/profiles/${ffeCode}.json`);
  if (!profile) profile = (await searchPlayers(storage, new FfePlayersClient(), ffeCode)).find((item) => item.ffeCode === ffeCode) ?? null;
  if (profile?.sourceUrl && !profile.fideId) {
    profile = await new FfePlayersClient().enrich(profile);
    await savePlayerProfiles(storage, [profile]);
  }
  return profile;
}

function retryDelay(retryCount: number, errorCode: string) {
  if (errorCode === "HTTP_403" || errorCode === "HTTP_429") return retryCount === 1 ? 5 * 60_000 : 30 * 60_000;
  return [60_000, 5 * 60_000, 30 * 60_000][Math.min(retryCount - 1, 2)] ?? 24 * 60 * 60_000;
}

export function shouldDispatchReport(
  metadata: PlayerReportMetadata,
  lock: { expiresAt?: string } | null,
  now = new Date(),
) {
  const validLock = !!lock?.expiresAt && Date.parse(lock.expiresAt) > now.getTime();
  if (validLock) return false;
  if (metadata.status === "queued") return true;
  if (metadata.status === "building") return true;
  return metadata.status === "retry_wait"
    && metadata.retryCount < MAX_CLOSE_RETRIES
    && !!metadata.nextRetryAt
    && Date.parse(metadata.nextRetryAt) <= now.getTime();
}

export async function buildGlobalReport(
  ffeCodeValue: string,
  dependencies: {
    fide?: FideStorage;
    players?: PlayerStorage;
    client?: FideClient;
    now?: Date;
    attemptId?: string;
    logger?: Logger;
  } = {},
) {
  const ffeCode = ffeCodeValue.toUpperCase();
  const fide = dependencies.fide ?? fideStorage();
  const players = dependencies.players ?? playerStorage();
  const now = dependencies.now ?? new Date();
  const logger = dependencies.logger ?? defaultLogger;
  const existing = await getGlobalReport(ffeCode, fide);
  if (existing.report && !existing.stale && existing.metadata?.status === "ready") return { state: "ready" as const, ...existing };
  if (dependencies.attemptId && existing.metadata?.attemptId && dependencies.attemptId !== existing.metadata.attemptId) {
    return { state: "pending" as const, ...existing };
  }
  const attemptId = existing.metadata?.attemptId ?? dependencies.attemptId ?? crypto.randomUUID();
  const owner = attemptId;
  const lockKey = key(ffeCode, "lock");
  const lockExpiresAt = new Date(now.getTime() + REPORT_LOCK_MS).toISOString();
  const acquired = await fide.acquireLock(lockKey, { owner, expiresAt: lockExpiresAt }, now);
  if (!acquired) return { state: "pending" as const, ...existing };

  let metadata = normalizeMetadata(existing.metadata, ffeCode, now) ?? {
    playerKey: ffeCode,
    ffeCode,
    status: "idle",
    progress: 0,
    completedYears: [],
    retryCount: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const persistMetadata = async (patch: Partial<PlayerReportMetadata>) => {
    const previousProgress = metadata.progress;
    metadata = {
      ...metadata,
      ...patch,
      playerKey: ffeCode,
      ffeCode,
      attemptId,
      progress: Math.max(previousProgress, patch.progress ?? previousProgress),
      updatedAt: new Date().toISOString(),
    };
    await writeValidated(fide, key(ffeCode, "metadata"), metadata, attemptId, isObject);
    logger({
      event: "fide_player_report_transition",
      attemptId,
      playerKey: ffeCode,
      ffeCode,
      fideId: metadata.fideId,
      currentStage: metadata.currentStage,
      progress: metadata.progress,
      previousProgress,
      retryCount: metadata.retryCount,
      lockOwner: metadata.lockOwner,
      lockExpiresAt: metadata.lockExpiresAt,
      lastSuccessfulStage: metadata.lastSuccessfulStage,
      lastErrorCode: metadata.lastErrorCode,
      nextRetryAt: metadata.nextRetryAt,
    });
    return metadata;
  };
  const readCheckpoint = <S extends Stage>(stage: S) => fide.getJSON<Checkpoints[S]>(checkpointKey(ffeCode, stage));
  const saveCheckpoint = async <S extends Stage>(stage: S, value: Checkpoints[S], validate: (candidate: unknown) => candidate is Checkpoints[S]) => {
    await writeValidated(fide, checkpointKey(ffeCode, stage), value, attemptId, validate);
    await persistMetadata({
      status: "building",
      progress: stages[stage].progress,
      currentStage: stage,
      currentStep: stages[stage].label,
      lastSuccessfulStage: stage,
      lockOwner: owner,
      lockExpiresAt,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      nextRetryAt: undefined,
    });
    return value;
  };
  try {
    await persistMetadata({ status: "building", lockOwner: owner, lockExpiresAt, currentStep: "Reprise de la construction" });

    let profile = await readCheckpoint("identity");
    if (!profile) {
      profile = await resolveProfile(ffeCode, players);
      if (!profile) throw new FideSourceError("NOT_FOUND", "Joueur FFE introuvable");
      await saveCheckpoint("identity", profile, isObject as (candidate: unknown) => candidate is FfePlayerProfile);
    }

    let link = await readCheckpoint("fide_identity");
    if (!link) {
      const resolved = linkFfeToFide(profile);
      if (!resolved) throw new FideSourceError("NOT_FOUND", "Identifiant FIDE officiel non publié par la FFE");
      link = await saveCheckpoint("fide_identity", { fideId: resolved.fideId }, isObject as (candidate: unknown) => candidate is { fideId: string });
    }
    metadata.fideId = link.fideId;
    const client = dependencies.client ?? new FideClient({ storage: fide, logger });

    let fidePlayer = await readCheckpoint("fide_profile");
    if (!fidePlayer || (existing.report?.version !== 2 && (!fidePlayer.birthYear || !fidePlayer.federationCode))) {
      await persistMetadata({ currentStage: "fide_profile", currentStep: "Lecture du profil FIDE officiel" });
      const url = `https://ratings.fide.com/profile/${link.fideId}`;
      const response = await client.html(url, {
        cacheKey: `fide/players/${link.fideId}/profile-html.json`,
        ttlMs: 24 * 60 * 60_000,
      });
      try {
        fidePlayer = parseFideProfile(response.body, link.fideId, response.fetchedAt);
      } catch (error) {
        throw new FideSourceError("PARSE_PROFILE", "Profil FIDE non reconnu", url, undefined, "profile", { cause: error });
      }
      await saveCheckpoint("fide_profile", fidePlayer, isObject as (candidate: unknown) => candidate is FidePlayer);
      await fide.setJSON(`fide/players/${link.fideId}/profile.json`, fidePlayer);
    }
    profile = {
      ...profile,
      fideId: fidePlayer.fideId,
      federationCode: fidePlayer.federationCode,
      federationName: fidePlayer.federationName,
      federationFlag: fidePlayer.federationFlag,
      birthYear: fidePlayer.birthYear,
      fideTitle: fidePlayer.fideTitle,
      fideTitleLabel: fidePlayer.fideTitleLabel,
      otherFideTitles: fidePlayer.otherFideTitles,
    };
    await savePlayerProfiles(players, [profile]);
    if (!(await readCheckpoint("ratings"))) {
      await saveCheckpoint("ratings", fidePlayer.ratings, isArray as (candidate: unknown) => candidate is FidePlayer["ratings"]);
    }

    let games = existing.report?.version !== 2 ? null : await readCheckpoint("calculations");
    if (!games) {
      await persistMetadata({ currentStage: "calculations", currentStep: "Lecture des calculs FIDE récents" });
      const activePeriods = fidePlayer.ratings.filter((item) => (item.games ?? 0) > 0)
        .sort((a, b) => b.period.localeCompare(a.period));
      games = [];
      let lastError: unknown;
      for (const item of activePeriods) {
        const t = item.ratingType === "rapid" ? 1 : item.ratingType === "blitz" ? 2 : 0;
        const url = `https://ratings.fide.com/a_indv_calculation.php?id_number=${link.fideId}&rating_period=${item.period}&t=${t}`;
        try {
          const calculation = await client.html(url, {
            cacheKey: `fide/players/${link.fideId}/calculations/${item.period}-${item.ratingType}.json`,
            ttlMs: item.period.startsWith(String(now.getUTCFullYear())) ? 24 * 60 * 60_000 : 365 * 24 * 60 * 60_000,
            headers: {
              "x-requested-with": "XMLHttpRequest",
              referer: `https://ratings.fide.com/calculations.phtml?id_number=${link.fideId}&period=${item.period}&rating=${t}`,
            },
          });
          games.push(...parseFideCalculations(calculation.body, link.fideId, item.period, item.ratingType));
        } catch (error) {
          lastError ??= error;
        }
      }
      if (activePeriods.length && !games.length && lastError) throw lastError;
      await saveCheckpoint("calculations", games, isArray as (candidate: unknown) => candidate is FideRatedGame[]);
    }

    let events = existing.report?.version !== 2 ? null : await readCheckpoint("events");
    if (!events) {
      await persistMetadata({ currentStage: "events", currentStep: "Lecture des rapports de compétitions FIDE" });
      events = [];
      const eventKeys = [...new Map(games.filter((game) => game.eventId).map((game) => [`${game.eventId}:${game.ratingType}`, game])).values()];
      for (const game of eventKeys) {
        const t = game.ratingType === "rapid" ? 1 : game.ratingType === "blitz" ? 2 : 0;
        const eventUrl = `https://ratings.fide.com/report.phtml?event=${game.eventId}&t=${t}`;
        try {
          const event = await client.html(eventUrl, {
            cacheKey: `fide/events/${game.eventId}-${game.ratingType}.json`,
            ttlMs: 365 * 24 * 60 * 60_000,
          });
          const row = parseFideEventReport(event.body, game.eventId!, game.ratingType).find((item) => item.fideId === link.fideId);
          if (row) events.push(row);
        } catch (error) {
          logger({ event: "fide_event_skipped", attemptId, ffeCode, fideId: link.fideId, url: eventUrl, error: classifyFideError(error).code });
        }
      }
      await saveCheckpoint("events", events, isArray as (candidate: unknown) => candidate is FideEventResult[]);
    }

    let participations = await readCheckpoint("participations");
    const backfill = await players.getJSON<PlayerBackfillState>(PLAYER_BACKFILL_STATE_KEY);
    if (!participations) {
      await persistMetadata({ currentStage: "participations", currentStep: "Rapprochement des participations FFE" });
      // Rejoue uniquement les deux index de nom de ce joueur afin de rattacher
      // les tournois déjà traités, sans rescanner le catalogue.
      await savePlayerProfiles(players, [profile]);
      const participationKeys = await players.list(`players/by-code/${ffeCode}/participations/`);
      participations = (await Promise.all(participationKeys.map((item) => players.getJSON<PlayerTournamentParticipation>(item))))
        .filter(Boolean) as PlayerTournamentParticipation[];
      await saveCheckpoint("participations", participations, isArray as (candidate: unknown) => candidate is PlayerTournamentParticipation[]);
    }

    const years = [...new Set(fidePlayer.ratings.map((item) => Number(item.period.slice(0, 4))).filter(Boolean))].sort((a, b) => b - a);
    const recentYears = years.slice(0, 5);
    for (const year of recentYears) {
      await fide.setJSON(key(ffeCode, `years/${year}`), {
        ratings: fidePlayer.ratings.filter((item) => item.period.startsWith(String(year))),
        participations: participations.filter((item) => item.year === year),
      });
    }
    const reportParticipations = participations.map((item) => ({
      tournamentRef: item.tournamentRef,
      title: item.tournamentTitle,
      date: item.tournamentStartDate,
      year: item.year,
      ratingType: item.ratingType,
      score: item.score,
      playedRounds: item.playedRounds,
      rank: item.finalRank,
      sourceUrl: item.sourceUrl,
    }));
    const careerEvents = buildPlayerCareerEvents({
      ffeCode,
      fideId: link.fideId,
      displayName: profile.displayName,
      games,
      events,
      participations: reportParticipations,
      fetchedAt: now.toISOString(),
    });
    let statistics = await readCheckpoint("statistics");
    if (!statistics) {
      statistics = computeStatistics(fidePlayer.ratings, games, now);
    }
    statistics = { ...statistics, ...careerStatistics(careerEvents) };
    await saveCheckpoint("statistics", statistics, isObject as (candidate: unknown) => candidate is PlayerGlobalReport["statistics"]);
    const report: PlayerGlobalReport = {
      version: 2,
      ffeCode,
      fideId: link.fideId,
      player: fidePlayer,
      ratings: fidePlayer.ratings,
      events,
      games,
      participations: reportParticipations,
      careerEvents,
      statistics,
      summary: deterministicSummary(statistics),
      coverage: {
        recentYears,
        completeYears: recentYears,
        oldestPeriod: fidePlayer.ratings.at(-1)?.period,
        newestPeriod: fidePlayer.ratings[0]?.period,
        fideAvailable: true,
        ffeComplete: !!backfill?.completedAt && backfill.failedTournamentCount === 0,
      },
      provenance: [
        { source: "FFE", url: profile.sourceUrl ?? "https://www.echecs.asso.fr", fetchedAt: profile.fetchedAt, note: "Identité, club et participations publiées." },
        { source: "FIDE", url: fidePlayer.sourceUrl, fetchedAt: fidePlayer.fetchedAt, note: "Classements officiels mensuels ; aucune donnée personnelle sensible conservée." },
      ],
      generatedAt: now.toISOString(),
      staleAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    };
    await writeValidated(fide, key(ffeCode, "report"), report, attemptId, isObject as (candidate: unknown) => candidate is PlayerGlobalReport);
    await saveCheckpoint("report", report, isObject as (candidate: unknown) => candidate is PlayerGlobalReport);
    metadata = await persistMetadata({
      status: "ready",
      currentStage: "report",
      currentStep: "Rapport disponible",
      progress: 100,
      completedYears: recentYears,
      retryCount: 0,
      completedAt: new Date().toISOString(),
      lockOwner: undefined,
      lockExpiresAt: undefined,
      nextRetryAt: undefined,
    });
    return { state: "ready" as const, report, metadata, stale: false };
  } catch (error) {
    const classified = classifyFideError(error);
    const retryCount = metadata.retryCount + 1;
    let partialReport = await readCheckpoint("report") ?? existing.report;
    if (!partialReport) {
      const [profile, fidePlayer, games, events, participations, checkpointStatistics] = await Promise.all([
        readCheckpoint("identity"),
        readCheckpoint("fide_profile"),
        readCheckpoint("calculations"),
        readCheckpoint("events"),
        readCheckpoint("participations"),
        readCheckpoint("statistics"),
      ]);
      if (profile && fidePlayer) {
        const availableGames = games ?? [];
        const availableEvents = events ?? [];
        const availableParticipations = participations ?? [];
        const statistics = checkpointStatistics ?? computeStatistics(fidePlayer.ratings, availableGames, now);
        const years = [...new Set(fidePlayer.ratings.map((item) => Number(item.period.slice(0, 4))).filter(Boolean))].sort((a, b) => b - a);
        partialReport = {
          version: 2,
          ffeCode,
          fideId: fidePlayer.fideId,
          player: fidePlayer,
          ratings: fidePlayer.ratings,
          events: availableEvents,
          games: availableGames,
          participations: availableParticipations.map((item) => ({
            tournamentRef: item.tournamentRef,
            title: item.tournamentTitle,
            date: item.tournamentStartDate,
            year: item.year,
            ratingType: item.ratingType,
            score: item.score,
            playedRounds: item.playedRounds,
            rank: item.finalRank,
            sourceUrl: item.sourceUrl,
          })),
          careerEvents: buildPlayerCareerEvents({
            ffeCode,
            fideId: fidePlayer.fideId,
            displayName: profile.displayName,
            games: availableGames,
            events: availableEvents,
            participations: availableParticipations.map((item) => ({
              tournamentRef: item.tournamentRef,
              title: item.tournamentTitle,
              date: item.tournamentStartDate,
              year: item.year,
              ratingType: item.ratingType,
              score: item.score,
              playedRounds: item.playedRounds,
              rank: item.finalRank,
              sourceUrl: item.sourceUrl,
            })),
            fetchedAt: now.toISOString(),
          }),
          statistics,
          summary: deterministicSummary(statistics),
          coverage: {
            recentYears: years.slice(0, 5),
            completeYears: [],
            oldestPeriod: fidePlayer.ratings.at(-1)?.period,
            newestPeriod: fidePlayer.ratings[0]?.period,
            fideAvailable: true,
            ffeComplete: false,
          },
          provenance: [
            { source: "FFE", url: profile.sourceUrl ?? "https://www.echecs.asso.fr", fetchedAt: profile.fetchedAt, note: "Identité FFE validée ; participations éventuellement incomplètes." },
            { source: "FIDE", url: fidePlayer.sourceUrl, fetchedAt: fidePlayer.fetchedAt, note: "Données FIDE disponibles avant l’interruption de la source." },
          ],
          generatedAt: now.toISOString(),
          staleAt: now.toISOString(),
        };
        try {
          await writeValidated(fide, key(ffeCode, "report"), partialReport, attemptId, isObject as (candidate: unknown) => candidate is PlayerGlobalReport);
        } catch (writeError) {
          logger({ event: "fide_partial_report_write_failed", attemptId, ffeCode, error: classifyFideError(writeError).code });
          partialReport = null;
        }
      }
    }
    const terminal = retryCount >= MAX_CLOSE_RETRIES;
    const status = terminal ? (metadata.progress > 0 || partialReport ? "partial_ready" : "failed") : "retry_wait";
    const nextRetryAt = new Date(Date.now() + (terminal ? 24 * 60 * 60_000 : retryDelay(retryCount, classified.code))).toISOString();
    metadata = await persistMetadata({
      status,
      currentStep: status === "partial_ready" ? "Rapport partiellement disponible" : "Source temporairement indisponible",
      retryCount,
      nextRetryAt,
      lastErrorCode: classified.code,
      lastErrorMessage: classified.message,
      lockOwner: undefined,
      lockExpiresAt: undefined,
    });
    logger({
      event: "fide_player_report_error",
      attemptId,
      ffeCode,
      fideId: metadata.fideId,
      stage: metadata.currentStage,
      progress: metadata.progress,
      errorCode: classified.code,
      message: classified.message,
      url: classified.url,
      status: classified.status,
      parser: classified.parser,
      retryCount,
      nextRetryAt,
    });
    return { state: status, report: partialReport, metadata, stale: !!partialReport };
  } finally {
    const lock = await fide.getJSON<{ owner: string }>(lockKey);
    if (lock?.owner === owner) await fide.delete(lockKey);
  }
}
