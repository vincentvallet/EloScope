import { expect, test } from "@playwright/test";

const ffeUrl = "https://echecs.asso.fr/FicheTournoi.aspx?Ref=70244";

test("importe une fiche tournoi FFE et ouvre le rapport réel", async ({ page }) => {
  await page.goto("/importer");
  await page.getByLabel("Lien de la fiche tournoi FFE").fill(ffeUrl);
  await page.getByRole("button", { name: "Analyser le tournoi" }).click();
  await expect(page.getByRole("heading", { name: "Tournoi FFE reconnu" })).toBeVisible();
  await page.getByRole("button", { name: "Générer le rapport" }).click();
  await expect(page.getByText("Source FFE")).toBeVisible();
  await expect(page.getByText("12ème open de parties rapides de l'Echiquier Montl")).toBeVisible();
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
