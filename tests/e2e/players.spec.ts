import { expect, test } from "@playwright/test";

const profile = {
  ffeCode: "A12345", ffeInternalId: "101", fideId: "990001",
  lastName: "DUPONT", firstName: "Alice", displayName: "Alice DUPONT",
  normalizedName: "ALICE DUPONT", federation: "FRA", currentClubName: "Échiquier Exemple",
  standardRating: 1720, rapidRating: 1680, blitzRating: 1600, category: "SenF",
  sourceUrl: "https://www.echecs.asso.fr/FicheJoueur.aspx?Id=101", fetchedAt: "2026-01-01T00:00:00.000Z",
};
const participation = {
  id: "67414:ffe-2", playerKey: "A12345", ffeCode: "A12345",
  playerNameAtTournament: "Alice DUPONT", normalizedPlayerName: "ALICE DUPONT",
  tournamentRef: "67414", tournamentTitle: "Open des Tests", year: 2026,
  ratingType: "standard", playerRatingAtTournament: 1700, finalRank: 2, score: 4.5,
  playedRounds: 7, hasOfficialResults: true, canOpenReport: true,
  identityConfidence: "exact_ffe_code", reportEntryId: "ffe-2",
  sourceUrl: "https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=67414", indexedAt: "2026-01-01T00:00:00.000Z",
};
const globalReport = {
  version: 1, ffeCode: "A12345", fideId: "990001",
  player: {
    fideId: "990001", name: "Alice MARTIN", federation: "France", title: "WFM", active: true,
    standardRating: 1812, rapidRating: 1760, blitzRating: 1695,
    ratings: [
      { fideId: "990001", period: "2025-07-01", ratingType: "standard", rating: 1750, games: 3, isPublishedOfficialRating: true, sourceUrl: "https://ratings.fide.com/profile/990001" },
      { fideId: "990001", period: "2026-07-01", ratingType: "standard", rating: 1812, games: 4, isPublishedOfficialRating: true, sourceUrl: "https://ratings.fide.com/profile/990001" },
      { fideId: "990001", period: "2026-07-01", ratingType: "rapid", rating: 1760, games: 2, isPublishedOfficialRating: true, sourceUrl: "https://ratings.fide.com/profile/990001" },
    ],
    sourceUrl: "https://ratings.fide.com/profile/990001", fetchedAt: "2026-07-01T00:00:00.000Z",
  },
  ratings: [
    { fideId: "990001", period: "2025-07-01", ratingType: "standard", rating: 1750, games: 3, isPublishedOfficialRating: true, sourceUrl: "https://ratings.fide.com/profile/990001" },
    { fideId: "990001", period: "2026-07-01", ratingType: "standard", rating: 1812, games: 4, isPublishedOfficialRating: true, sourceUrl: "https://ratings.fide.com/profile/990001" },
    { fideId: "990001", period: "2026-07-01", ratingType: "rapid", rating: 1760, games: 2, isPublishedOfficialRating: true, sourceUrl: "https://ratings.fide.com/profile/990001" },
  ],
  events: [{ eventId: "777001", eventName: "Coupe FIDE des Tests", ratingPeriod: "2026-06-01", ratingType: "standard", eventType: "cup", fideId: "990001", playerName: "Alice MARTIN", score: 4.5, games: 7, ratingChange: 12, sourceUrl: "https://ratings.fide.com/report.phtml?event=777001&t=0" }],
  games: [], participations: [{ tournamentRef: "67414", title: "Open des Tests", date: "2026-06-01", year: 2026, ratingType: "standard", score: 4.5, playedRounds: 7, rank: 2, sourceUrl: "https://example.test" }],
  statistics: { ratedGames: 0, wins: 0, draws: 0, losses: 0, last12MonthsGames: 0, standardChange12Months: 62, peakStandard: 1812, peakRapid: 1760, peakBlitz: 1695 },
  summary: ["Aucune partie classée détaillée n’est encore disponible dans le cache partagé.", "Sur la période comparable, le classement standard a progressé de 62 points."],
  coverage: { recentYears: [2026, 2025], completeYears: [2026, 2025], oldestPeriod: "2025-07-01", newestPeriod: "2026-07-01", fideAvailable: true, ffeComplete: false },
  provenance: [{ source: "FFE", url: "https://example.test/ffe", fetchedAt: "2026-07-01T00:00:00.000Z", note: "Identité et participations." }, { source: "FIDE", url: "https://ratings.fide.com/profile/990001", fetchedAt: "2026-07-01T00:00:00.000Z", note: "Classements officiels." }],
  generatedAt: "2026-07-01T00:00:00.000Z", staleAt: "2099-01-01T00:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/players/search**", async (route) => {
    const opponent = new URL(route.request().url()).searchParams.get("q")?.toLowerCase().includes("bernard");
    const item = opponent
      ? { ...profile, ffeCode: "B54321", fideId: "990002", displayName: "Louis BERNARD", firstName: "Louis", lastName: "BERNARD" }
      : profile;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ items: [{ ...item, indexedTournamentCount: 1 }], pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 } }),
    });
  });
  await page.route(/\/api\/players\/A12345(?:\?.*)?$/, async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ profile, participations: [participation], pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 }, coverage: { complete: false } }),
  }));
  await page.route("**/api/players/A12345/global-report", async (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ state: "ready", report: globalReport, stale: false }),
  }));
  await page.route("**/api/players/A12345/global-report/generate", async (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({ state: "ready", report: globalReport, stale: false }),
  }));
  await page.route("**/api/players/A12345/compare/B54321", async (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify({
      players: [globalReport.player, { ...globalReport.player, fideId: "990002", name: "Louis BERNARD", standardRating: 1812 }],
      expectedScore: 0.5,
      headToHead: { total: 0, wins: 0, draws: 0, losses: 0 },
      competitions: { players: [{ ffeParticipations: 1, fideEvents: 1, ratedGames: 0 }, { ffeParticipations: 2, fideEvents: 3, ratedGames: 4 }], commonFideEvents: [] },
      commonOpponents: [],
    }),
  }));
});

test("recherche un joueur, ouvre son profil et conserve des filtres accessibles", async ({ page }) => {
  await page.goto("/joueurs");
  await page.getByLabel("Nom, prénom ou numéro FFE").fill("Dupont");
  await expect(page.getByRole("link", { name: /Alice DUPONT/ })).toBeVisible();
  await page.getByRole("link", { name: /Alice DUPONT/ }).click();
  await expect(page.getByRole("heading", { name: "Alice DUPONT" })).toBeVisible();
  await expect(page.getByText(/index des participations est progressif/i)).toBeVisible();
  await page.getByLabel("Inclure les inscriptions sans partie jouée").check();
  await page.getByLabel("Cadence").selectOption("standard");
  await expect(page.getByRole("link", { name: "Voir le rapport" })).toHaveAttribute("href", "/tournoi/67414/joueurs/ffe-2");
  await expect(page.getByRole("link", { name: /Signaler une erreur/ })).toHaveAttribute("href", /mailto:/);
});

test("reste utilisable au clavier sur mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "scénario mobile");
  await page.goto("/joueurs");
  await page.getByLabel("Nom, prénom ou numéro FFE").focus();
  await page.keyboard.type("A12345");
  await expect(page.getByRole("link", { name: /Alice DUPONT/ })).toBeVisible();
  await page.keyboard.press("Tab");
});

test("affiche le profil FIDE officiel dans le rapport global", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await expect(page.getByText("Elo FIDE standard")).toBeVisible();
  await expect(page.getByText("1812", { exact: true }).first()).toBeVisible();
});

test("affiche les six onglets du rapport", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await expect(page.getByRole("tab")).toHaveCount(6);
});

test("ouvre la progression Elo", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Progression Elo" }).click();
  await expect(page.getByRole("img", { name: /Évolution du classement FIDE standard/ })).toBeVisible();
});

test("filtre standard rapide et blitz", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Progression Elo" }).click();
  await page.getByLabel("Cadence FIDE").selectOption("rapid");
  await expect(page.getByRole("img", { name: /rapid/ })).toBeVisible();
  await page.getByLabel("Cadence FIDE").selectOption("blitz");
  await expect(page.getByText("Aucun classement publié")).toBeVisible();
});

test("affiche les années récentes validées", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await expect(page.getByText(/Années récentes validées : 2026, 2025/)).toBeVisible();
});

test("ouvre les compétitions FFE agrégées", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Tournois et compétitions" }).click();
  await expect(page.getByRole("tabpanel").getByRole("heading", { name: "Open des Tests" })).toBeVisible();
});

test("affiche aussi les compétitions FIDE homologuées", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Tournois et compétitions" }).click();
  await expect(page.getByRole("heading", { name: "Coupe FIDE des Tests" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Source FIDE" })).toHaveAttribute("href", /ratings\.fide\.com/);
});

test("conserve le lien vers le rapport tournoi", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Tournois et compétitions" }).click();
  await expect(page.getByRole("link", { name: "Rapport FFE" })).toHaveAttribute("href", "/tournoi/67414");
});

test("distingue les résultats classés des PGN", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Parties classées" }).click();
  await expect(page.getByText(/aucune notation de partie n’est inventée/i)).toBeVisible();
});

test("ouvre la comparaison et calcule le score théorique", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Comparaison" }).click();
  await page.getByLabel("Code FFE adverse").fill("B54321");
  await page.getByRole("button", { name: "Comparer" }).click();
  await expect(page.getByText(/Score théorique du premier joueur : 50 %/)).toBeVisible();
  await expect(page.getByText(/Compétitions recensées : 1 FFE \+ 1 FIDE contre 2 FFE \+ 3 FIDE/)).toBeVisible();
  await expect(page.getByText(/Face-à-face classé : 0 partie/)).toBeVisible();
});

test("recherche un adversaire dans l'annuaire FFE", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Adversaire" }).click();
  await page.getByLabel("Rechercher un adversaire").fill("Bernard");
  await expect(page.getByRole("link", { name: /Louis BERNARD/ })).toBeVisible();
});

test("affiche la synthèse issue des statistiques", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await expect(page.getByText(/classement standard a progressé de 62 points/)).toBeVisible();
});

test("affiche la provenance FFE et FIDE", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await expect(page.getByText(/Identité et participations/)).toBeVisible();
  await expect(page.getByText(/Classements officiels/)).toBeVisible();
});

test("réutilise le rapport partagé après rechargement", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/players/A12345/global-report", async (route) => {
    calls += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ state: "ready", report: globalReport, stale: false }) });
  });
  await page.goto("/joueurs/A12345");
  await page.reload();
  await expect(page.getByText("Carrière FFE + FIDE")).toBeVisible();
  expect(calls).toBe(1);
});

test("affiche une progression en cas de source FIDE lente", async ({ page }) => {
  await page.route("**/api/players/A12345/global-report", async (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ state: "building", metadata: { status: "building", progress: 35, currentStep: "Lecture du profil FIDE officiel" } }) }));
  await page.goto("/joueurs/A12345");
  await expect(page.getByText(/Lecture du profil FIDE officiel · 35 %/)).toBeVisible();
});

test("reprend le polling après la mise en file du worker", async ({ page }) => {
  let reads = 0;
  await page.route("**/api/players/A12345/global-report", async (route) => {
    reads += 1;
    await route.fulfill({
      status: reads === 1 ? 202 : 200,
      contentType: "application/json",
      body: JSON.stringify(reads === 1
        ? { state: "missing" }
        : { state: "ready", report: globalReport, stale: false }),
    });
  });
  await page.route("**/api/players/A12345/global-report/generate", async (route) => route.fulfill({
    status: 202,
    contentType: "application/json",
    body: JSON.stringify({ state: "queued", metadata: { status: "queued", progress: 0, currentStep: "Rapport placé dans la file de construction" } }),
  }));
  await page.goto("/joueurs/A12345");
  await page.getByRole("button", { name: "Construire le rapport global" }).click();
  await expect(page.getByText("Carrière FFE + FIDE")).toBeVisible();
  expect(reads).toBeGreaterThan(1);
});

test("permet de reprendre après une panne FIDE", async ({ page }) => {
  await page.route("**/api/players/A12345/global-report", async (route) => route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ state: "error", metadata: { status: "error", progress: 0, currentStep: "Source temporairement indisponible" } }) }));
  await page.goto("/joueurs/A12345");
  await expect(page.getByRole("button", { name: "Reprendre la construction" })).toBeVisible();
});

test("garde la page joueur en noindex follow", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("le tab actif expose aria-selected", async ({ page }) => {
  await page.goto("/joueurs/A12345");
  await page.getByRole("tab", { name: "Adversaire" }).click();
  await expect(page.getByRole("tab", { name: "Adversaire" })).toHaveAttribute("aria-selected", "true");
});

test("le rapport reste lisible sur mobile", async ({ page, isMobile }) => {
  test.skip(!isMobile, "scénario mobile");
  await page.goto("/joueurs/A12345");
  await expect(page.getByText("Carrière FFE + FIDE")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Vue d’ensemble" })).toBeVisible();
});
