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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/players/search**", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ items: [{ ...profile, indexedTournamentCount: 1 }], pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 } }),
  }));
  await page.route("**/api/players/A12345**", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ profile, participations: [participation], pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 }, coverage: { complete: false } }),
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
