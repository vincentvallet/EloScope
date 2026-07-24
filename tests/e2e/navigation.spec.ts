import { expect, test } from "@playwright/test";

const ffeUrl = "https://echecs.asso.fr/Resultats.aspx?URL=Tournois/Id/68186/68186&Action=Cl";

test("importe un lien FFE de classement et ouvre le rapport réel", async ({ page }) => {
  await page.goto("/importer");
  await page.getByLabel("Lien FFE du tournoi").fill(ffeUrl);
  await page.getByRole("button", { name: "Analyser le tournoi" }).click();
  await expect(page.getByRole("heading", { name: "Grille FFE reconnue" })).toBeVisible();
  await page.getByRole("button", { name: "Générer le rapport" }).click();
  await expect(page.getByText("Source FFE")).toBeVisible();
  await expect(page.getByText("Champ International de Lyon Henri Rinck 2026 blitz")).toBeVisible();
});

test("recalcule le rapport joueur et ouvre la comparaison", async ({ page }) => {
  await page.goto("/tournoi/importe/classement");
  await page.getByRole("row").nth(1).click();
  await page.getByRole("button", { name: "40" }).click();
  await expect(page.getByText("Variation Elo estimée")).toBeVisible();
  await page.goto("/tournoi/importe/comparer");
  await expect(page.getByRole("heading", { name: "Comparer les joueurs" })).toBeVisible();
});
