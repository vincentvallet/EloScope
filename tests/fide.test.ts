import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { normalizeFideId, isFideId } from "@/lib/fide/identity/normalize-fide-id";
import { parseFideProfile } from "@/lib/fide/parsers/profile";
import { inferEventType, parseFideEventReport } from "@/lib/fide/parsers/event-report";
import { parseFideCalculations } from "@/lib/fide/parsers/calculations";
import { parseFideFixedWidthLine } from "@/lib/fide/parsers/rating-list";
import { expectedScore, ratingChange, computeStatistics, deterministicSummary, headToHead } from "@/lib/fide/statistics";
import { MemoryFideStorage } from "@/lib/fide/storage/memory";
import { readFideCache, writeFideCache } from "@/lib/fide/cache";
import { syncFideRatingList } from "@/lib/fide/sync/rating-list";
import { buildGlobalReport, queueGlobalReport, shouldDispatchReport } from "@/lib/fide/report";
import { FideClient, FIDE_USER_AGENT } from "@/lib/fide/client";
import type { FideRatedGame, FideRatingPoint } from "@/lib/fide/types";
import { fideStorage } from "@/lib/fide/storage";
import { MemoryPlayerStorage } from "@/lib/ffe-players/storage";
import { FideSourceError } from "@/lib/fide/errors";
import { LocalFileFideStorage } from "@/lib/fide/storage/local-files";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = (name: string) => readFile(new URL(`fixtures/${name}`, import.meta.url), "utf8");

describe("identité FIDE", () => {
  it("supprime les zéros de tête sans changer l'identité", () => {
    expect(normalizeFideId("00637610")).toBe("637610");
    expect(normalizeFideId(637610)).toBe("637610");
  });
  it("rejette un identifiant vide ou trop long", () => {
    expect(() => normalizeFideId("abc")).toThrow();
    expect(isFideId("0000990001")).toBe(true);
    expect(isFideId("12")).toBe(false);
  });
});

describe("parseurs FIDE isolés", () => {
  it("lit le profil et les trois cadences sans données privées", async () => {
    const player = parseFideProfile(await fixture("fide-profile.html"), "990001", "2026-07-01T00:00:00.000Z");
    expect(player).toMatchObject({ fideId: "990001", name: "Alice Martin", federation: "France", title: "WFM", standardRating: 1812, rapidRating: 1760, blitzRating: 1695 });
    expect(player.ratings).toHaveLength(9);
    expect(player).not.toHaveProperty("birthYear");
    expect(player).not.toHaveProperty("gender");
    expect(player).not.toHaveProperty("photo");
  });
  it("préserve les mois sans partie comme classements publiés", async () => {
    const player = parseFideProfile(await fixture("fide-profile.html"), "990001");
    expect(player.ratings.find((item) => item.period === "2024-06-01" && item.ratingType === "standard")).toMatchObject({ rating: 1700, games: 0, isPublishedOfficialRating: true });
  });
  it("échoue proprement si la structure essentielle change", () => {
    expect(() => parseFideProfile("<html><p>maintenance</p></html>", "990001")).toThrow("non reconnu");
  });
  it("lit un rapport individuel et normalise les identifiants", async () => {
    const rows = parseFideEventReport(await fixture("fide-event.html"), "123456", "standard");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ fideId: "990001", score: 4.5, games: 7, ratingChange: 12.4, eventType: "individual" });
    expect(rows[1].playerRating).toBeUndefined();
  });
  it("reconnaît équipe et coupe indépendamment de la cadence", () => {
    expect(inferEventType("Championnat interclubs par équipe")).toBe("team");
    expect(inferEventType("Coupe du Département")).toBe("cup");
    expect(inferEventType("Open classique")).toBe("individual");
  });
  it("lit les adversaires d'un calcul et ne prétend pas fournir du PGN", async () => {
    const games = parseFideCalculations(await fixture("fide-calculations.html"), "00990001", "2026-06-01", "standard");
    expect(games).toHaveLength(2);
    expect(games[0]).toMatchObject({ fideId: "990001", opponentName: "Bernard, Louis", result: 1, color: "white", eventId: "777001", eventType: "cup" });
    expect(games[0].opponentFideId).toBeUndefined();
    expect(games[0]).not.toHaveProperty("pgn");
  });
});

describe("statistiques de carrière et scout", () => {
  const ratings: FideRatingPoint[] = [
    { fideId: "990001", period: "2026-07-01", ratingType: "standard", rating: 1812, games: 4, isPublishedOfficialRating: true, sourceUrl: "https://example.test" },
    { fideId: "990001", period: "2025-07-01", ratingType: "standard", rating: 1750, games: 3, isPublishedOfficialRating: true, sourceUrl: "https://example.test" },
    { fideId: "990001", period: "2026-07-01", ratingType: "rapid", rating: 1760, games: 2, isPublishedOfficialRating: true, sourceUrl: "https://example.test" },
  ];
  const games: FideRatedGame[] = [
    { id: "1", fideId: "990001", opponentFideId: "990002", opponentName: "Louis Bernard", result: 1, playerRatingBefore: 1800, opponentRating: 1900, eventName: "Open Test", eventType: "individual", ratingPeriod: "2026-06-01", ratingType: "standard", sourceUrl: "https://example.test" },
    { id: "2", fideId: "990001", opponentFideId: "990002", opponentName: "Louis Bernard", result: 0.5, playerRatingBefore: 1800, opponentRating: 1800, eventName: "Interclubs Test", eventType: "team", ratingPeriod: "2026-05-01", ratingType: "standard", sourceUrl: "https://example.test" },
    { id: "3", fideId: "990001", opponentFideId: "990003", opponentName: "Emma Petit", result: 0, playerRatingBefore: 1800, opponentRating: 1700, eventName: "Coupe Test", eventType: "cup", ratingPeriod: "2025-01-01", ratingType: "standard", sourceUrl: "https://example.test" },
  ];
  it("calcule le score théorique Elo", () => {
    expect(expectedScore(1800, 1800)).toBe(0.5);
    expect(expectedScore(1900, 1800)).toBeCloseTo(1 - expectedScore(1800, 1900));
  });
  it("calcule la variation officielle sur douze mois", () => expect(ratingChange(ratings, "standard")).toBe(62));
  it("agrège victoires, nulles, défaites et pics", () => {
    expect(computeStatistics(ratings, games)).toMatchObject({ ratedGames: 3, wins: 1, draws: 1, losses: 1, scorePercent: 50, peakStandard: 1812 });
  });
  it("calcule un face-à-face sans homonyme", () => {
    expect(headToHead(games, "990002")).toMatchObject({ total: 2, wins: 1, draws: 1, losses: 0, score: 1.5 });
  });
  it("produit une synthèse déterministe, sans psychologie", () => {
    const summary = deterministicSummary(computeStatistics(ratings, games)).join(" ");
    expect(summary).toContain("3 parties classées");
    expect(summary).not.toMatch(/motivation|confiance|stress/i);
  });
});

describe("cache, flux et résilience", () => {
  it("écrit et relit un cache partagé", async () => {
    const storage = new MemoryFideStorage();
    await writeFideCache(storage, "cache/x", { ok: true }, "https://example.test", 60_000);
    expect((await readFideCache<{ ok: boolean }>(storage, "cache/x"))?.value.ok).toBe(true);
  });
  it("isole aussi les checkpoints dans un stockage fichiers local", async () => {
    const storage = new LocalFileFideStorage(join(tmpdir(), `eloscope-fide-test-${crypto.randomUUID()}`));
    const queued = await queueGlobalReport("A12345", storage, new Date("2026-07-01T00:00:00.000Z"));
    expect(queued.metadata).toMatchObject({ playerKey: "A12345", status: "queued", progress: 0 });
    expect(await storage.getJSON("fide/player-reports/A12345/metadata.json")).toMatchObject({ status: "queued" });
  });
  it("ignore un cache expiré mais peut servir sa version stale", async () => {
    const storage = new MemoryFideStorage();
    await storage.setJSON("cache/x", { value: 7, fetchedAt: "2020-01-01T00:00:00Z", expiresAt: "2020-01-01T00:00:01Z", sourceUrl: "https://example.test" });
    expect(await readFideCache(storage, "cache/x")).toBeNull();
    expect((await readFideCache<number>(storage, "cache/x", true))?.value).toBe(7);
  });
  it("importe une liste en flux, segmentée et idempotente", async () => {
    const storage = new MemoryFideStorage();
    const line = `${"990001".padEnd(15)}${"MARTIN, Alice".padEnd(61)}FRA${"".padEnd(34)}1812`;
    async function* lines() { yield line; yield "entête invalide"; }
    await syncFideRatingList(storage, "2026-07", lines(), { federation: "FRA", sourceUrl: "https://example.test/list.zip" });
    await syncFideRatingList(storage, "2026-07", lines(), { federation: "FRA", sourceUrl: "https://example.test/list.zip" });
    expect((await storage.list("fide/rating-lists/2026-07/players/")).length).toBe(1);
    expect((await storage.getJSON<{ imported: number }>("fide/rating-lists/2026-07/metadata.json"))?.imported).toBe(1);
  });
  it("parse un joueur non classé depuis la liste mensuelle", () => {
    const line = `${"990004".padEnd(15)}${"SANSCLASSE, Camille".padEnd(61)}FRA`;
    expect(parseFideFixedWidthLine(line)).toMatchObject({ fideId: "990004", standardRating: undefined });
  });
  it("respecte le User-Agent et le cache réseau", async () => {
    const storage = new MemoryFideStorage();
    let calls = 0;
    const fetcher: typeof fetch = async (_input, init) => {
      calls += 1;
      expect(new Headers(init?.headers).get("user-agent")).toBe(FIDE_USER_AGENT);
      return new Response("<html>ok</html>", { headers: { "content-type": "text/html" } });
    };
    const client = new FideClient({ storage, fetch: fetcher, minDelayMs: 0, maxDelayMs: 0 });
    await client.html("https://ratings.fide.com/profile/990001", { cacheKey: "profile", ttlMs: 60_000 });
    await client.html("https://ratings.fide.com/profile/990001", { cacheKey: "profile", ttlMs: 60_000 });
    expect(calls).toBe(1);
  });
  it("sert le cache stale pendant une panne réseau", async () => {
    const storage = new MemoryFideStorage();
    await storage.setJSON("profile", { value: "<html>cached</html>", fetchedAt: "2020-01-01T00:00:00Z", expiresAt: "2020-01-01T00:00:01Z", sourceUrl: "https://ratings.fide.com" });
    const client = new FideClient({ storage, fetch: async () => { throw new Error("network"); }, retries: 0, minDelayMs: 0, maxDelayMs: 0 });
    expect((await client.html("https://ratings.fide.com/profile/990001", { cacheKey: "profile" })).source).toBe("stale-cache");
  });
  it("refuse les hôtes et types de contenu inattendus", async () => {
    const client = new FideClient({ storage: new MemoryFideStorage(), fetch: async () => new Response("{}", { headers: { "content-type": "application/json" } }), retries: 0, minDelayMs: 0, maxDelayMs: 0 });
    await expect(client.html("https://example.test/profile/990001")).rejects.toThrow("non autorisée");
    await expect(client.html("https://ratings.fide.com/profile/990001")).rejects.toThrow("Type");
  });
  it("rejette une réponse supérieure à la taille maximale", async () => {
    const client = new FideClient({ storage: new MemoryFideStorage(), fetch: async () => new Response("123456", { headers: { "content-type": "text/html" } }), maxBytes: 5, retries: 0, minDelayMs: 0, maxDelayMs: 0 });
    await expect(client.html("https://ratings.fide.com/profile/990001")).rejects.toThrow("volumineuse");
  });
  it("retourne pending si un verrou de rapport est actif", async () => {
    const storage = new MemoryFideStorage();
    await storage.setJSON("fide/player-reports/A12345/lock.json", { owner: "other", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect((await buildGlobalReport("A12345", { fide: storage })).state).toBe("pending");
  });
  it("n'accorde le verrou qu'à un seul constructeur concurrent", async () => {
    const storage = new MemoryFideStorage();
    const now = new Date("2026-07-01T00:00:00.000Z");
    const results = await Promise.all([
      storage.acquireLock("lock", { owner: "a", expiresAt: "2026-07-01T00:05:00.000Z" }, now),
      storage.acquireLock("lock", { owner: "b", expiresAt: "2026-07-01T00:05:00.000Z" }, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
  it("met une génération en file de façon idempotente", async () => {
    const storage = new MemoryFideStorage();
    const now = new Date("2026-07-01T00:00:00.000Z");
    expect((await queueGlobalReport("a12345", storage, now)).state).toBe("queued");
    expect((await queueGlobalReport("A12345", storage, new Date("2026-07-01T00:01:00.000Z"))).state).toBe("pending");
  });
  it("conserve 35 % et reprend au checkpoint après une panne FIDE", async () => {
    const fide = new MemoryFideStorage();
    const players = new MemoryPlayerStorage();
    await players.setJSON("players/profiles/A12345.json", {
      ffeCode: "A12345",
      ffeInternalId: "101",
      fideId: "990001",
      lastName: "MARTIN",
      firstName: "Alice",
      displayName: "Alice MARTIN",
      normalizedName: "ALICE MARTIN",
      sourceUrl: "https://www.echecs.asso.fr/FicheJoueur.aspx?Id=101",
      fetchedAt: "2026-07-01T00:00:00.000Z",
    });
    const profileHtml = await fixture("fide-profile.html");
    const failingClient = new FideClient({
      storage: fide,
      retries: 0,
      minDelayMs: 0,
      maxDelayMs: 0,
      fetch: async (input) => String(input).includes("/profile/")
        ? new Response(profileHtml, { headers: { "content-type": "text/html" } })
        : (() => { throw new TypeError("fetch failed"); })(),
    });
    const first = await buildGlobalReport("A12345", { fide, players, client: failingClient });
    expect(first).toMatchObject({
      state: "retry_wait",
      report: { ffeCode: "A12345", fideId: "990001", coverage: { completeYears: [] } },
      metadata: { progress: 35, lastSuccessfulStage: "ratings", retryCount: 1, lastErrorCode: "NETWORK" },
    });
    expect(await fide.getJSON("fide/player-reports/A12345/checkpoints/ratings.json")).not.toBeNull();

    const calculationsHtml = await fixture("fide-calculations.html");
    const eventHtml = await fixture("fide-event.html");
    let profileRequests = 0;
    const healthyClient = new FideClient({
      storage: fide,
      retries: 0,
      minDelayMs: 0,
      maxDelayMs: 0,
      fetch: async (input) => {
        const url = String(input);
        if (url.includes("/profile/")) profileRequests += 1;
        return new Response(url.includes("report.phtml") ? eventHtml : calculationsHtml, {
          headers: { "content-type": "text/html" },
        });
      },
    });
    const resumed = await buildGlobalReport("A12345", { fide, players, client: healthyClient });
    expect(resumed).toMatchObject({ state: "ready", metadata: { progress: 100, retryCount: 0 } });
    expect(profileRequests).toBe(0);
  });

  it("classe les erreurs HTTP et timeout sans réessai immédiat", async () => {
    for (const [status, code] of [[403, "HTTP_403"], [429, "HTTP_429"], [503, "HTTP_503"]] as const) {
      const client = new FideClient({
        storage: new MemoryFideStorage(),
        fetch: async () => new Response("panne", { status, headers: { "content-type": "text/html" } }),
        retries: 0,
        minDelayMs: 0,
        maxDelayMs: 0,
      });
      await expect(client.html("https://ratings.fide.com/profile/990001")).rejects.toMatchObject({ code });
    }
    const timeout = new FideClient({
      storage: new MemoryFideStorage(),
      fetch: async (_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
      timeoutMs: 1,
      retries: 0,
      minDelayMs: 0,
      maxDelayMs: 0,
    });
    await expect(timeout.html("https://ratings.fide.com/profile/990001")).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("le watchdog respecte verrou, backoff et maximum de tentatives", () => {
    const base = {
      playerKey: "A12345",
      ffeCode: "A12345",
      progress: 35,
      completedYears: [],
      retryCount: 1,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      status: "retry_wait" as const,
      nextRetryAt: "2026-07-01T00:05:00.000Z",
    };
    const before = new Date("2026-07-01T00:04:00.000Z");
    const after = new Date("2026-07-01T00:06:00.000Z");
    expect(shouldDispatchReport(base, null, before)).toBe(false);
    expect(shouldDispatchReport(base, null, after)).toBe(true);
    expect(shouldDispatchReport(base, { expiresAt: "2026-07-01T00:07:00.000Z" }, after)).toBe(false);
    expect(shouldDispatchReport({ ...base, retryCount: 3 }, null, after)).toBe(false);
    expect(shouldDispatchReport({ ...base, status: "partial_ready" }, null, after)).toBe(false);
  });

  it("refuse aussi un clic de reprise avant nextRetryAt", async () => {
    const storage = new MemoryFideStorage();
    await storage.setJSON("fide/player-reports/A12345/metadata.json", {
      playerKey: "A12345",
      ffeCode: "A12345",
      status: "retry_wait",
      progress: 35,
      completedYears: [],
      retryCount: 1,
      nextRetryAt: "2026-07-01T00:05:00.000Z",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:01:00.000Z",
    });
    expect((await queueGlobalReport("A12345", storage, new Date("2026-07-01T00:04:00.000Z"))).state).toBe("pending");
  });

  it("passe en rapport partiel au troisième échec sans perdre 35 %", async () => {
    const fide = new MemoryFideStorage();
    const fidePlayer = parseFideProfile(await fixture("fide-profile.html"), "990001");
    const prefix = "fide/player-reports/A12345";
    await fide.setJSON(`${prefix}/metadata.json`, {
      playerKey: "A12345",
      ffeCode: "A12345",
      fideId: "990001",
      status: "retry_wait",
      progress: 35,
      currentStage: "calculations",
      lastSuccessfulStage: "ratings",
      completedYears: [],
      retryCount: 2,
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:05:00.000Z",
    });
    await fide.setJSON(`${prefix}/checkpoints/identity.json`, {
      ffeCode: "A12345",
      fideId: "990001",
      lastName: "MARTIN",
      firstName: "Alice",
      displayName: "Alice MARTIN",
      normalizedName: "ALICE MARTIN",
      fetchedAt: "2026-07-01T00:00:00.000Z",
    });
    await fide.setJSON(`${prefix}/checkpoints/fide_identity.json`, { fideId: "990001" });
    await fide.setJSON(`${prefix}/checkpoints/fide_profile.json`, fidePlayer);
    await fide.setJSON(`${prefix}/checkpoints/ratings.json`, fidePlayer.ratings);
    const failingClient = new FideClient({
      storage: fide,
      retries: 0,
      minDelayMs: 0,
      maxDelayMs: 0,
      fetch: async () => { throw new TypeError("fetch failed"); },
    });
    const result = await buildGlobalReport("A12345", {
      fide,
      players: new MemoryPlayerStorage(),
      client: failingClient,
    });
    expect(result).toMatchObject({
      state: "partial_ready",
      metadata: { status: "partial_ready", retryCount: 3, progress: 35, lastSuccessfulStage: "ratings" },
    });
    expect(shouldDispatchReport(result.metadata!, null, new Date("2099-01-01"))).toBe(false);
  });

  it("expose une erreur d'écriture sans remplacer le checkpoint valide", async () => {
    class FailingStorage extends MemoryFideStorage {
      fail = false;
      override async setJSON(storageKey: string, value: unknown) {
        if (this.fail && storageKey.endsWith("/metadata.json")) throw new Error("blob write failed");
        await super.setJSON(storageKey, value);
      }
    }
    const storage = new FailingStorage();
    await queueGlobalReport("A12345", storage, new Date("2026-07-01T00:00:00.000Z"));
    const previous = await storage.getJSON("fide/player-reports/A12345/metadata.json");
    storage.fail = true;
    await expect(queueGlobalReport("A12345", storage, new Date("2026-07-01T00:06:00.000Z"))).rejects.toBeInstanceOf(FideSourceError);
    expect(await storage.getJSON("fide/player-reports/A12345/metadata.json")).toEqual(previous);
  });

  it("force le stockage mémoire pendant les tests même sous variables Netlify", () => {
    const previous = process.env.NETLIFY;
    process.env.NETLIFY = "true";
    try { expect(fideStorage()).toBeInstanceOf(MemoryFideStorage); }
    finally {
      if (previous == null) delete process.env.NETLIFY;
      else process.env.NETLIFY = previous;
    }
  });
});
