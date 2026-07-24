import type { Club, DemoEntry, Player, TournamentReport } from "@/lib/domain";
import { estimatePerformance } from "@/lib/rating/engine";

export const demoReport: TournamentReport = {
  id: "demo-opale-2026",
  slug: "open-cote-opale-2026",
  title: "Open de la Côte d’Opale 2026",
  sourceType: "DEMO",
  startDate: "2026-07-18",
  endDate: "2026-07-24",
  location: "Le Touquet-Paris-Plage",
  currentRound: 9,
  totalRounds: 9,
  status: "COMPLETED",
  timeControl: "90 min + 30 s / coup",
  ratingType: "STANDARD",
  importedAt: "2026-07-24T07:42:00+02:00",
  sourceUpdatedAt: "2026-07-24T07:42:00+02:00",
  warnings: [],
};

const clubNames = [
  "Échiquier du Touquet",
  "Cercle Boulonnais",
  "Lille Métropole Échecs",
  "Tour Blanche de Calais",
  "Échiquier Amiénois",
  "Cavalier Dunkerquois",
  "Arras Échecs",
  "Club de Saint-Omer",
];

export const clubs: Club[] = clubNames.map((displayName, index) => ({
  id: `club-${index + 1}`,
  displayName,
  normalizedName: displayName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
}));

const firstNames = [
  "Maëlle","Nolan","Inès","Sacha","Camille","Noham","Lina","Malo","Élise","Raphaël","Anaïs","Bastien",
  "Lucie","Yanis","Salomé","Gabin","Apolline","Théo","Mélissa","Noé","Zoé","Mathis","Louna","Émile",
];
const lastNames = [
  "Delcourt","Renard","Mercier","Leroux","Dumont","Roussel","Perrin","Gauthier","Fontaine","Morel",
  "Caron","Lemoine","Petit","Fournier","Leclerc","Masson","Colin","Picard","Boucher","Joly","Rivière",
  "Marchand","Dubois","Barbier",
];

const resultFor = (seed: number, round: number): 0 | 0.5 | 1 => {
  const value = (seed * 7 + round * 11 + (seed % 5) * round) % 10;
  return value < 5 ? 1 : value < 7 ? 0.5 : 0;
};

function makePlayer(index: number): Player {
  const displayName = `${firstNames[index % firstNames.length]} ${lastNames[(index * 5 + Math.floor(index / firstNames.length) + 3) % lastNames.length]}`;
  return {
    id: `player-${index + 1}`,
    displayName,
    normalizedName: displayName.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
    federation: ["FRA", "BEL", "SUI", "LUX"][index % 4],
    title: index === 0 ? "MF" : index < 4 ? "CM" : undefined,
    category: ["U18", "Senior", "U16", "Vétéran", "U20", "Senior"][index % 6],
  };
}

export const demoEntries: DemoEntry[] = Array.from({ length: 72 }, (_, index) => {
  const player = makePlayer(index);
  const startingRating = index > 66 ? undefined : 2198 - index * 13 + ((index * 17) % 29);
  const rounds = Array.from({ length: 9 }, (_, roundIndex) => {
    const round = roundIndex + 1;
    const isBye = (index === 18 && round === 3) || (index === 41 && round === 7);
    const isForfeit = index === 27 && round === 9;
    const opponentIndex = (index + round * 7 + 5) % 72;
    const opponent = makePlayer(opponentIndex);
    const opponentRating = opponentIndex > 66 ? undefined : 2198 - opponentIndex * 13 + ((opponentIndex * 17) % 29);
    const result = isBye ? 1 : isForfeit ? 0 : resultFor(index + 1, round);
    return {
      round,
      opponentEntryId: isBye ? undefined : `entry-${opponentIndex + 1}`,
      opponentName: isBye ? undefined : opponent.displayName,
      opponentRating: isBye ? undefined : opponentRating,
      color: isBye || isForfeit ? "NONE" as const : round % 2 === index % 2 ? "WHITE" as const : "BLACK" as const,
      result,
      tournamentPoints: result,
      played: !isBye && !isForfeit,
      rated: !isBye && !isForfeit && opponentRating != null,
      bye: isBye,
      forfeit: isForfeit,
      sourceNotation: isBye ? "EXE" : isForfeit ? "0F" : result === 1 ? "1" : result === .5 ? "½" : "0",
    };
  });
  const score = rounds.reduce((sum, round) => sum + round.tournamentPoints, 0);
  const startingRank = index + 1;
  const performance = estimatePerformance(rounds) ?? startingRating;
  const strength = performance ?? 800;
  return {
    id: `entry-${index + 1}`,
    tournamentId: demoReport.id,
    playerId: player.id,
    clubId: clubs[index % clubs.length].id,
    startingRating,
    startingRank,
    finalRank: 0,
    score,
    tieBreaks: { buchholz: Math.round((32 + ((index * 19) % 25)) * 10) / 10 },
    providedPerformance: index % 5 === 0 ? strength : undefined,
    estimatedPerformance: index % 5 === 0 ? undefined : strength,
    rounds,
    player,
    club: clubs[index % clubs.length],
  };
});

demoEntries
  .sort((a, b) => b.score - a.score || (b.tieBreaks.buchholz ?? 0) - (a.tieBreaks.buchholz ?? 0))
  .forEach((entry, index) => { entry.finalRank = index + 1; });

export const entriesByInitialRank = [...demoEntries].sort(
  (a, b) => (a.startingRank ?? 999) - (b.startingRank ?? 999),
);

export const featuredEntries = [...demoEntries]
  .sort((a, b) => (a.finalRank ?? 999) - (b.finalRank ?? 999))
  .slice(0, 8);

export const getEntry = (id?: string) =>
  demoEntries.find((entry) => entry.id === id || entry.playerId === id) ?? featuredEntries[0];

export const getClubEntries = (clubId?: string) =>
  demoEntries.filter((entry) => entry.clubId === (clubId ?? clubs[0].id));
