import { FfePlayersClient } from "@/lib/ffe-players/client";
import { PLAYER_BACKFILL_STATE_KEY, type PlayerBackfillState } from "@/lib/ffe-players/backfill";
import { playerStorage } from "@/lib/ffe-players/storage";
import type { FfePlayerProfile, PlayerStorage, PlayerTournamentParticipation } from "@/lib/ffe-players/types";
import { savePlayerProfiles, searchPlayers } from "@/lib/ffe-players/search";
import { FideClient } from "./client";
import { linkFfeToFide } from "./identity/ffe-fide-link";
import { parseFideProfile } from "./parsers/profile";
import { parseFideCalculations } from "./parsers/calculations";
import { parseFideEventReport } from "./parsers/event-report";
import { computeStatistics, deterministicSummary } from "./statistics";
import { fideStorage } from "./storage";
import type { FideStorage } from "./storage/interface";
import type { FideEventResult, FideRatedGame, PlayerGlobalReport, PlayerReportMetadata } from "./types";

const key = (ffeCode: string, name: string) => `fide/player-reports/${ffeCode}/${name}.json`;
const REPORT_LOCK_MS = 5 * 60_000;

export async function getGlobalReport(ffeCode: string, storage: FideStorage = fideStorage()) {
  const [report, metadata] = await Promise.all([
    storage.getJSON<PlayerGlobalReport>(key(ffeCode, "report")),
    storage.getJSON<PlayerReportMetadata>(key(ffeCode, "metadata")),
  ]);
  return { report, metadata, stale: !!report && Date.parse(report.staleAt) <= Date.now() };
}

export async function queueGlobalReport(ffeCodeValue: string, storage: FideStorage = fideStorage(), now = new Date()) {
  const ffeCode = ffeCodeValue.toUpperCase();
  const existing = await getGlobalReport(ffeCode, storage);
  if (existing.report && !existing.stale) return { state: "ready" as const, ...existing };
  if (
    existing.metadata
    && ["queued", "building"].includes(existing.metadata.status)
    && Date.parse(existing.metadata.updatedAt) > now.getTime() - REPORT_LOCK_MS
  ) return { state: "pending" as const, ...existing };
  const metadata: PlayerReportMetadata = {
    status: "queued",
    ffeCode,
    fideId: existing.metadata?.fideId,
    progress: existing.metadata?.progress ?? 0,
    currentStep: "Rapport placé dans la file de construction",
    completedYears: existing.metadata?.completedYears ?? [],
    requestedAt: existing.metadata?.requestedAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await storage.setJSON(key(ffeCode, "metadata"), metadata);
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

export async function buildGlobalReport(
  ffeCodeValue: string,
  dependencies: {
    fide?: FideStorage;
    players?: PlayerStorage;
    client?: FideClient;
    now?: Date;
  } = {},
) {
  const ffeCode = ffeCodeValue.toUpperCase();
  const fide = dependencies.fide ?? fideStorage();
  const players = dependencies.players ?? playerStorage();
  const now = dependencies.now ?? new Date();
  const existing = await getGlobalReport(ffeCode, fide);
  if (existing.report && !existing.stale) return { state: "ready" as const, ...existing };
  const requestedAt = existing.metadata?.requestedAt ?? now.toISOString();
  const owner = crypto.randomUUID();
  const lockKey = key(ffeCode, "lock");
  const acquired = await fide.acquireLock(
    lockKey,
    { owner, expiresAt: new Date(now.getTime() + REPORT_LOCK_MS).toISOString() },
    now,
  );
  if (!acquired) return { state: "pending" as const, ...existing };
  const update = async (patch: Partial<PlayerReportMetadata>) => {
    const metadata: PlayerReportMetadata = {
      status: "building", ffeCode, progress: 5, completedYears: [], requestedAt,
      updatedAt: new Date().toISOString(), ...existing.metadata, ...patch,
    };
    await fide.setJSON(key(ffeCode, "metadata"), metadata);
    return metadata;
  };
  try {
    await update({ currentStep: "Résolution de l’identité FFE/FIDE", progress: 10 });
    const profile = await resolveProfile(ffeCode, players);
    if (!profile) throw new Error("Joueur FFE introuvable");
    const link = linkFfeToFide(profile);
    if (!link) throw new Error("Identifiant FIDE officiel non publié par la FFE");
    await update({ fideId: link.fideId, currentStep: "Lecture du profil FIDE officiel", progress: 35 });
    const client = dependencies.client ?? new FideClient({ storage: fide });
    const response = await client.html(`https://ratings.fide.com/profile/${link.fideId}`, {
      cacheKey: `fide/players/${link.fideId}/profile-html.json`, ttlMs: 24 * 60 * 60_000,
    });
    const fidePlayer = parseFideProfile(response.body, link.fideId, response.fetchedAt);
    await fide.setJSON(`fide/players/${link.fideId}/profile.json`, fidePlayer);
    await update({ currentStep: "Calculs FIDE récents", progress: 50 });
    const activePeriods = fidePlayer.ratings.filter((item) => (item.games ?? 0) > 0)
      .sort((a, b) => b.period.localeCompare(a.period))
      .slice(0, 3);
    const games: FideRatedGame[] = [];
    for (const item of activePeriods) {
      const type = item.ratingType;
      const t = type === "rapid" ? 1 : type === "blitz" ? 2 : 0;
      try {
        const calculationUrl = `https://ratings.fide.com/a_indv_calculation.php?id_number=${link.fideId}&rating_period=${item.period}&t=${t}`;
        const calculation = await client.html(calculationUrl, {
          cacheKey: `fide/players/${link.fideId}/calculations/${item.period}-${type}.json`,
          ttlMs: item.period.startsWith(String(now.getUTCFullYear())) ? 24 * 60 * 60_000 : 365 * 24 * 60 * 60_000,
          headers: {
            "x-requested-with": "XMLHttpRequest",
            referer: `https://ratings.fide.com/calculations.phtml?id_number=${link.fideId}&period=${item.period}&rating=${t}`,
          },
        });
        games.push(...parseFideCalculations(calculation.body, link.fideId, item.period, type));
      } catch {}
    }
    await update({ currentStep: "Rapports de compétitions FIDE", progress: 62 });
    const events: FideEventResult[] = [];
    const eventKeys = [...new Map(games.filter((game) => game.eventId).map((game) => [`${game.eventId}:${game.ratingType}`, game])).values()].slice(0, 3);
    for (const game of eventKeys) {
      try {
        const t = game.ratingType === "rapid" ? 1 : game.ratingType === "blitz" ? 2 : 0;
        const eventUrl = `https://ratings.fide.com/report.phtml?event=${game.eventId}&t=${t}`;
        const event = await client.html(eventUrl, {
          cacheKey: `fide/events/${game.eventId}-${game.ratingType}.json`,
          ttlMs: 365 * 24 * 60 * 60_000,
        });
        const row = parseFideEventReport(event.body, game.eventId!, game.ratingType).find((item) => item.fideId === link.fideId);
        if (row) events.push(row);
      } catch {}
    }
    await update({ currentStep: "Agrégation des participations FFE", progress: 72 });
    const [participationKeys, backfill] = await Promise.all([
      players.list(`players/by-code/${ffeCode}/participations/`),
      players.getJSON<PlayerBackfillState>(PLAYER_BACKFILL_STATE_KEY),
    ]);
    const participations = (await Promise.all(participationKeys.map((item) => players.getJSON<PlayerTournamentParticipation>(item))))
      .filter(Boolean) as PlayerTournamentParticipation[];
    const years = [...new Set(fidePlayer.ratings.map((item) => Number(item.period.slice(0, 4))).filter(Boolean))].sort((a, b) => b - a);
    const recentYears = years.slice(0, 5);
    for (const year of recentYears) {
      await fide.setJSON(key(ffeCode, `years/${year}`), {
        ratings: fidePlayer.ratings.filter((item) => item.period.startsWith(String(year))),
        participations: participations.filter((item) => item.year === year),
      });
    }
    const statistics = computeStatistics(fidePlayer.ratings, games, now);
    const report: PlayerGlobalReport = {
      version: 1, ffeCode, fideId: link.fideId, player: fidePlayer,
      ratings: fidePlayer.ratings, events, games,
      participations: participations.map((item) => ({
        tournamentRef: item.tournamentRef, title: item.tournamentTitle,
        date: item.tournamentStartDate, year: item.year, ratingType: item.ratingType,
        score: item.score, playedRounds: item.playedRounds, rank: item.finalRank, sourceUrl: item.sourceUrl,
      })),
      statistics,
      summary: deterministicSummary(statistics),
      coverage: {
        recentYears, completeYears: recentYears,
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
    await fide.setJSON(key(ffeCode, "report"), report);
    const metadata = await update({ status: "ready", currentStep: "Rapport disponible", progress: 100, completedYears: recentYears });
    return { state: "ready" as const, report, metadata, stale: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Construction impossible";
    const metadata = await update({
      status: existing.report ? "partial" : "error",
      currentStep: "Source temporairement indisponible",
      progress: existing.report ? 80 : 0,
      error: message,
      retryAfter: new Date(Date.now() + 30 * 60_000).toISOString(),
    });
    if (existing.report) return { state: "ready" as const, report: existing.report, metadata, stale: true };
    return { state: "error" as const, report: null, metadata, stale: false };
  } finally {
    const lock = await fide.getJSON<{ owner: string }>(lockKey);
    if (lock?.owner === owner) await fide.delete(lockKey);
  }
}
