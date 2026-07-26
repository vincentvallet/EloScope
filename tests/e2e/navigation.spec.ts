import { expect, test } from "@playwright/test";

const ffeUrl = "https://echecs.asso.fr/FicheTournoi.aspx?Ref=70244";
const importedTournament = {
  report: {
    title: "12ème open de parties rapides de l'Echiquier Montl",
    sourceType: "FFE",
    sourceUrl: ffeUrl,
    currentRound: 2,
    totalRounds: 2,
    status: "COMPLETED",
    ratingType: "RAPID",
    importedAt: "2026-07-25T00:00:00.000Z",
  },
  players: [
    {
      id: "ffe-1", rank: 1, name: "Élodie Martin", rating: 1842, club: "Échiquier du Nord",
      federation: "FRA", league: "HDF", score: 1.5, performance: 1910, tieBreaks: { Buchholz: 1 },
      rounds: [
        { round: 1, notation: "+ 2B", opponentRank: 2, opponentName: "Hugo Bernard", opponentRating: 1798, color: "WHITE", result: 1, played: true },
        { round: 2, notation: "= 2N", opponentRank: 2, opponentName: "Hugo Bernard", opponentRating: 1798, color: "BLACK", result: 0.5, played: true },
      ],
    },
    {
      id: "ffe-2", rank: 2, name: "Hugo Bernard", rating: 1798, club: "Club de Lille",
      federation: "FRA", league: "HDF", score: 0.5, performance: 1710, tieBreaks: { Buchholz: 1.5 },
      rounds: [
        { round: 1, notation: "- 1N", opponentRank: 1, opponentName: "Élodie Martin", opponentRating: 1842, color: "BLACK", result: 0, played: true },
        { round: 2, notation: "= 1B", opponentRank: 1, opponentName: "Élodie Martin", opponentRating: 1842, color: "WHITE", result: 0.5, played: true },
      ],
    },
  ],
  warnings: [],
};

const emptyCatalog = {
  items: [],
  pagination: { page: 1, pageSize: 20, total: 0, pageCount: 0 },
  facets: { regions: [], departments: [], years: [] },
  catalog: { catalogCount: 0, isRefreshing: false },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/tournaments/search**", (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify(emptyCatalog),
  }));
  await page.route("**/api/tournaments/70244/report**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ state: "ready", data: importedTournament, stale: false, metadata: { status: "ready", progress: 100 } }),
  }));
});

test("simplifie la navigation et réserve Paramètres aux routes de rapport", async ({ page }) => {
  await page.goto("/tournois");
  await expect(page.getByRole("heading", { name: "Trouver un tournoi" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation.getByRole("link", { name: "Recherche" })).toHaveClass(/active/);
  await expect(navigation.getByRole("link", { name: "Lien FFE" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Importer un tournoi/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Importer un tournoi/i })).toHaveCount(0);

  await page.goto("/tournoi/70244/vue-ensemble");
  await expect(page.getByRole("heading", { name: importedTournament.report.title })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Vue d’ensemble" })).toHaveClass(/active/);
  await expect(navigation.getByRole("link", { name: "Paramètres" })).toBeVisible();
  await page.reload();
  await expect(navigation.getByRole("link", { name: "Paramètres" })).toBeVisible();

  await page.goto("/tournoi/70244/parametres");
  await expect(navigation.getByRole("link", { name: "Paramètres" })).toHaveClass(/active/);
  await expect(navigation.locator("a.active")).toHaveCount(1);
  await page.goto("/joueurs");
  await expect(navigation.getByRole("link", { name: "Paramètres" })).toHaveCount(0);
});

test("valide le lien sur Recherche et ouvre le cache sans second clic", async ({ page }) => {
  await page.goto("/tournois");
  await expect(page.getByRole("heading", { name: "Lien du tournoi FFE" })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Lien du tournoi FFE" });
  await input.fill("https://example.com/FicheTournoi.aspx?Ref=70244");
  await page.getByRole("button", { name: "Voir le rapport" }).click();
  await expect(page.getByRole("alert")).toHaveText("Ce lien ne correspond pas à une fiche de tournoi FFE valide.");

  await input.fill("http://www.echecs.asso.fr/FicheTournoi.aspx?extra=1&Ref=70244");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/tournoi\/70244\/vue-ensemble$/);
});

test("affiche la préparation puis redirige automatiquement quand le rapport est absent", async ({ page }) => {
  let reportReady = false;
  await page.unroute("**/api/tournaments/70244/report**");
  await page.route("**/api/tournaments/70244/report**", (route) => route.fulfill({
    status: reportReady ? 200 : 202,
    contentType: "application/json",
    body: JSON.stringify(reportReady
      ? { state: "ready", data: importedTournament, metadata: { status: "ready", progress: 100 } }
      : { state: "missing" }),
  }));
  await page.route("**/api/tournaments/70244/analyze**", (route) => {
    reportReady = true;
    return route.fulfill({
      status: 202, contentType: "application/json",
      body: JSON.stringify({ state: "pending", metadata: { status: "fetching", progress: 15 } }),
    });
  });
  await page.goto("/tournois");
  await page.getByRole("textbox", { name: "Lien du tournoi FFE" }).fill(ffeUrl);
  await page.getByRole("button", { name: "Voir le rapport" }).click();
  await expect(page.getByRole("heading", { name: "Préparation de votre rapport" })).toBeVisible();
  await expect(page).toHaveURL(/\/tournoi\/70244\/vue-ensemble$/, { timeout: 15_000 });
});

test("conserve la navigation mobile sans entrée obsolète", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Navigation mobile uniquement");
  await page.goto("/tournois");
  const mobile = page.getByRole("navigation", { name: "Navigation mobile" });
  await expect(mobile.getByRole("link", { name: "Recherche" })).toBeVisible();
  await expect(mobile.getByRole("link", { name: "Lien FFE" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Paramètres" })).toHaveCount(0);
});
