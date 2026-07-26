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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/import", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ ok: true, data: importedTournament, fetchedAt: "2026-07-25T00:00:00.000Z" }),
  }));
  await page.route("**/api/tournaments/70244/report**", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ state: "ready", data: importedTournament, stale: false, metadata: { status: "ready", progress: 100 } }),
  }));
});

test("ouvre la recherche par défaut et adapte le menu au rapport actif", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trouver un tournoi" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(navigation.getByRole("link", { name: "Accueil" })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Recherche" })).toHaveClass(/active/);
  await expect(navigation.getByRole("link", { name: "Lien FFE" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Classement" })).toHaveCount(0);

  await page.evaluate((stored) => {
    sessionStorage.setItem("eloscope:session-reports", JSON.stringify([stored]));
    sessionStorage.setItem("eloscope:active-report", "ffe:70244");
  }, importedTournament);
  await page.goto("/tournoi/70244/vue-ensemble");
  await expect(navigation.getByRole("link", { name: "Classement" })).toBeVisible({ timeout: 15_000 });
  await expect(navigation.getByRole("link", { name: "Clubs" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Rondes" })).toBeVisible();

  await page.goto("/tournoi/70244/clubs");
  await expect(navigation.getByRole("link", { name: "Clubs" })).toHaveClass(/active/);
  await expect(navigation.getByRole("link", { name: "Rondes" })).not.toHaveClass(/active/);
  await page.goto("/tournoi/70244/rondes");
  await expect(navigation.getByRole("link", { name: "Rondes" })).toHaveClass(/active/);
  await expect(navigation.getByRole("link", { name: "Clubs" })).not.toHaveClass(/active/);
});

test("ouvre une fiche tournoi FFE sans étape technique", async ({ page }) => {
  await page.unroute("**/api/tournaments/70244/report**");
  await page.route("**/api/tournaments/70244/report**", async (route) => route.fulfill({
    status: 202, contentType: "application/json", body: JSON.stringify({ state: "missing" }),
  }));
  await page.route("**/api/tournaments/70244/analyze**", async (route) => route.fulfill({
    status: 202, contentType: "application/json", body: JSON.stringify({ state: "pending", metadata: { status: "fetching", progress: 15 } }),
  }));
  await page.goto("/importer");
  await page.getByLabel("Lien de la fiche tournoi FFE").fill(ffeUrl);
  await expect(page.getByText("Analyser le tournoi")).toHaveCount(0);
  await page.getByRole("button", { name: "Voir le rapport" }).click();
  await expect(page.getByRole("heading", { name: "Préparation de votre rapport" })).toBeVisible();
  await page.evaluate((stored) => {
    sessionStorage.setItem("eloscope:session-reports", JSON.stringify([stored]));
    sessionStorage.setItem("eloscope:active-report", "ffe:70244");
  }, importedTournament);
  await page.goto("/tournoi/70244/vue-ensemble");
  await expect(page.getByRole("main").getByText("Source FFE", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "12ème open de parties rapides de l'Echiquier Montl", exact: true })).toBeVisible();
});

test("recalcule le rapport joueur et affiche les clubs", async ({ page }) => {
  await page.goto("/importer");
  await page.getByLabel("Lien de la fiche tournoi FFE").fill(ffeUrl);
  await page.getByRole("button", { name: "Voir le rapport" }).click();
  await page.goto("/tournoi/70244/classement");
  await page.getByRole("row").nth(1).click();
  await page.getByRole("button", { name: "40" }).click();
  await expect(page.getByText("Variation Elo estimée")).toBeVisible();
  await page.goto("/tournoi/70244/clubs");
  await expect(page.getByText("Clubs représentés")).toBeVisible();
});
