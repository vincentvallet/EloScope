import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { NormalizedTournament } from "@/lib/importers/types";
import { tournamentReportFingerprint } from "@/lib/reports/fingerprint";
import { LocalFileTournamentReportStore } from "@/lib/reports/local-file";
import { MemoryTournamentReportStore } from "@/lib/reports/memory";
import type { CachedTournamentReportMetadata } from "@/lib/reports/types";

const report: NormalizedTournament = {
  report: {
    title: "Open des Tests",
    sourceType: "FFE",
    sourceUrl: "https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=123",
    currentRound: 1,
    totalRounds: 1,
    importedAt: "2026-01-01T00:00:00.000Z",
  },
  players: [{
    id: "ffe-1", rank: 1, name: "Alice Exemple", rating: 1700, score: 1,
    tieBreaks: {}, rounds: [{ round: 1, notation: "+ 2B", opponentRank: 2, color: "WHITE", result: 1, played: true }],
  }],
  warnings: [],
};
const metadata: CachedTournamentReportMetadata = {
  ffeRef: "123", status: "ready", progress: 100, message: "Rapport prêt",
  generatedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  staleAt: "2027-01-01T00:00:00.000Z", fingerprint: "abc", version: 1,
};
const temporaryRoots: string[] = [];
afterEach(async () => Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("cache partagé des rapports", () => {
  it("partage le même rapport entre deux clients et ne laisse acquérir qu'un verrou", async () => {
    const store = new MemoryTournamentReportStore();
    const [first, second] = await Promise.all([store.acquireLock("123"), store.acquireLock("123")]);
    expect([first.acquired, second.acquired].filter(Boolean)).toHaveLength(1);
    await store.saveReportAtomically("123", report, metadata);
    expect(await store.getReport("123")).toEqual(report);
    expect(await store.getReport("123")).toEqual(report);
  });

  it("permet la reprise après expiration et protège la libération par propriétaire", async () => {
    const store = new MemoryTournamentReportStore();
    const first = await store.acquireLock("123", -1);
    const second = await store.acquireLock("123");
    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(true);
    if (!("owner" in first) || !("owner" in second)) throw new Error("Verrou attendu");
    await store.releaseLock("123", first.owner);
    expect((await store.acquireLock("123")).acquired).toBe(false);
    await store.releaseLock("123", second.owner);
    expect((await store.acquireLock("123")).acquired).toBe(true);
  });

  it("écrit atomiquement dans un stockage local isolé", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eloscope-reports-"));
    temporaryRoots.push(root);
    const firstClient = new LocalFileTournamentReportStore(root);
    const secondClient = new LocalFileTournamentReportStore(root);
    await firstClient.saveReportAtomically("123", report, metadata);
    expect(await secondClient.getReport("123")).toEqual(report);
    expect(await secondClient.getMetadata("123")).toEqual(metadata);
  });

  it("détecte une source modifiée avec une empreinte déterministe", () => {
    const initial = tournamentReportFingerprint("123", report);
    expect(tournamentReportFingerprint("123", structuredClone(report))).toBe(initial);
    const changed = structuredClone(report);
    changed.players[0].score = 0.5;
    expect(tournamentReportFingerprint("123", changed)).not.toBe(initial);
  });
});
