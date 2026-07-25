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
});

test("importe une fiche tournoi FFE et ouvre le rapport réel", async ({ page }) => {
  await page.goto("/importer");
  await page.getByLabel("Lien de la fiche tournoi FFE").fill(ffeUrl);
  await page.getByRole("button", { name: "Analyser le tournoi" }).click();
  await expect(page.getByRole("heading", { name: "Tournoi FFE reconnu" })).toBeVisible();
  await page.getByRole("button", { name: "Générer le rapport" }).click();
  await expect(page.getByRole("main").getByText("Source FFE", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "12ème open de parties rapides de l'Echiquier Montl", exact: true })).toBeVisible();
});

test("recalcule le rapport joueur et affiche les clubs", async ({ page }) => {
  await page.goto("/importer");
  await page.getByLabel("Lien de la fiche tournoi FFE").fill(ffeUrl);
  await page.getByRole("button", { name: "Analyser le tournoi" }).click();
  await page.getByRole("button", { name: "Générer le rapport" }).click();
  await page.goto("/tournoi/importe/classement");
  await page.getByRole("row").nth(1).click();
  await page.getByRole("button", { name: "40" }).click();
  await expect(page.getByText("Variation Elo estimée")).toBeVisible();
  await page.goto("/tournoi/importe/clubs");
  await expect(page.getByText("Clubs représentés")).toBeVisible();
});
