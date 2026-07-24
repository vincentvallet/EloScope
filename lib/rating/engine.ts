import type { RatingScenario, RoundResult } from "@/lib/domain";

export type RatingRuleset = {
  id: string;
  label: string;
  version: string;
  maxDifference: number | null;
  allowUnratedOpponents: boolean;
};

export const RULESETS: Record<string, RatingRuleset> = {
  "fide-standard-2024": {
    id: "fide-standard-2024",
    label: "Estimation FIDE standard actuelle",
    version: "2024.1",
    maxDifference: 400,
    allowUnratedOpponents: false,
  },
  "fide-table-unbounded": {
    id: "fide-table-unbounded",
    label: "Table FIDE sans plafond",
    version: "2024.1-unbounded",
    maxDifference: null,
    allowUnratedOpponents: false,
  },
};

const TABLE: Array<[number, number]> = [
  [3,.50],[10,.51],[17,.52],[25,.53],[32,.54],[39,.55],[46,.56],[53,.57],
  [61,.58],[68,.59],[76,.60],[83,.61],[91,.62],[98,.63],[106,.64],[113,.65],
  [121,.66],[129,.67],[137,.68],[145,.69],[153,.70],[162,.71],[170,.72],[179,.73],
  [188,.74],[197,.75],[206,.76],[215,.77],[225,.78],[235,.79],[245,.80],[256,.81],
  [267,.82],[278,.83],[290,.84],[302,.85],[315,.86],[328,.87],[344,.88],[357,.89],
  [374,.90],[391,.91],[411,.92],[432,.93],[456,.94],[484,.95],[517,.96],[559,.97],
  [619,.98],[735,.99],[Number.POSITIVE_INFINITY,1],
];

export function expectedScore(
  playerRating: number,
  opponentRating: number,
  ruleset: RatingRuleset = RULESETS["fide-standard-2024"],
): number {
  const signedDifference = playerRating - opponentRating;
  const absoluteDifference = Math.min(
    Math.abs(signedDifference),
    ruleset.maxDifference ?? Number.POSITIVE_INFINITY,
  );
  const higherExpected = TABLE.find(([max]) => absoluteDifference <= max)?.[1] ?? 1;
  return signedDifference >= 0 ? higherExpected : 1 - higherExpected;
}

export function calculateGameDelta(
  playerRating: number,
  opponentRating: number,
  result: 0 | 0.5 | 1,
  kFactor: number,
  ruleset: RatingRuleset = RULESETS["fide-standard-2024"],
): number {
  return kFactor * (result - expectedScore(playerRating, opponentRating, ruleset));
}

export function calculateTournamentDelta(
  playerRating: number,
  rounds: RoundResult[],
  kFactor: number,
  ruleset: RatingRuleset = RULESETS["fide-standard-2024"],
): RatingScenario {
  let cumulative = 0;
  const perRound = rounds.map((round) => {
    const excluded =
      !round.played || !round.rated || round.bye || round.forfeit ||
      round.result === null || round.opponentRating == null;
    if (excluded) {
      return {
        round: round.round,
        expected: null,
        rawDelta: 0,
        cumulative,
        included: false,
        reason: round.bye ? "Exempt" : round.forfeit ? "Forfait" : "Partie non cotée",
      };
    }
    const expected = expectedScore(playerRating, round.opponentRating!, ruleset);
    const rawDelta = kFactor * (round.result! - expected);
    cumulative += rawDelta;
    return { round: round.round, expected, rawDelta, cumulative, included: true };
  });
  return {
    playerRating,
    kFactor,
    ruleset: `${ruleset.id}@${ruleset.version}`,
    perRound,
    rawTotalDelta: cumulative,
    roundedTotalDelta: Math.round(cumulative),
    estimatedNewRating: playerRating + Math.round(cumulative),
  };
}

export function estimatePerformance(rounds: RoundResult[]): number | undefined {
  const rated = rounds.filter(
    (r) => r.played && !r.bye && !r.forfeit && r.opponentRating != null && r.result != null,
  );
  if (!rated.length) return undefined;
  const average = rated.reduce((sum, r) => sum + r.opponentRating!, 0) / rated.length;
  const score = rated.reduce((sum, r) => sum + r.result!, 0) / rated.length;
  const bounded = Math.min(.999, Math.max(.001, score));
  const offset = -400 * Math.log10(1 / bounded - 1);
  return Math.round(Math.min(3200, Math.max(800, average + offset)));
}
