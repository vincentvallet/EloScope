import { describe, expect, it } from "vitest";
import { calculateGameDelta, calculateTournamentDelta, expectedScore, RULESETS } from "@/lib/rating/engine";
import type { RoundResult } from "@/lib/domain";

const round = (overrides: Partial<RoundResult> = {}): RoundResult => ({
  round: 1, opponentRating: 1800, color: "WHITE", result: 1, tournamentPoints: 1,
  played: true, rated: true, bye: false, forfeit: false, ...overrides,
});

describe("score attendu FIDE", () => {
  it("vaut 0,5 à Elo identiques", () => expect(expectedScore(1800, 1800)).toBe(.5));
  it("favorise le joueur mieux classé", () => expect(expectedScore(1900, 1800)).toBe(.64));
  it("est complémentaire pour le joueur moins classé", () => expect(expectedScore(1800, 1900)).toBe(.36));
  it("applique le plafond configuré", () => {
    expect(expectedScore(2400, 1200, RULESETS["fide-standard-2024"])).toBe(.92);
    expect(expectedScore(2400, 1200, RULESETS["fide-table-unbounded"])).toBe(1);
  });
});

describe("variation Elo", () => {
  it.each([10,20,40,27])("respecte K=%s", (k) => {
    expect(calculateGameDelta(1800, 1800, 1, k)).toBe(k * .5);
  });
  it("calcule victoire surprise, nulle et défaite", () => {
    expect(calculateGameDelta(1600, 2000, 1, 20)).toBeCloseTo(18.4);
    expect(calculateGameDelta(1800, 1800, .5, 20)).toBe(0);
    expect(calculateGameDelta(1800, 1800, 0, 20)).toBe(-10);
  });
});

describe("tournoi", () => {
  it("exclut exempts, forfaits, adversaires non classés et parties non cotées", () => {
    const scenario = calculateTournamentDelta(1800, [
      round({ bye: true, played: false }),
      round({ forfeit: true, played: false }),
      round({ opponentRating: undefined }),
      round({ rated: false }),
      round({ result: null }),
    ], 20);
    expect(scenario.rawTotalDelta).toBe(0);
    expect(scenario.perRound.every((item) => !item.included)).toBe(true);
  });
  it("additionne les valeurs brutes et arrondit une seule fois", () => {
    const scenario = calculateTournamentDelta(1800, [round(), round({ round: 2, result: 0 })], 20);
    expect(scenario.rawTotalDelta).toBe(0);
    expect(scenario.roundedTotalDelta).toBe(0);
    expect(scenario.estimatedNewRating).toBe(1800);
  });
});
