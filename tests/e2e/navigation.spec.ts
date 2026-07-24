import { expect, test } from "@playwright/test";

test("parcours principal de la démonstration", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Utiliser la démonstration/i }).click();
  await expect(page.getByRole("heading", { name: "Open de la Côte d’Opale 2026" })).toBeVisible();
  await page.getByRole("link", { name: "Classement" }).click();
  await page.getByRole("row").nth(1).click();
  await expect(page.getByText("Estimation Elo")).toBeVisible();
  await page.getByRole("button", { name: "40" }).click();
  await page.getByRole("link", { name: /Suivant/i }).click();
  await expect(page.getByText("Variation Elo estimée")).toBeVisible();
});

test("club, comparaison et export CSV", async ({ page }) => {
  await page.goto("/tournoi/open-cote-opale-2026/clubs/club-1");
  await expect(page.getByRole("heading", { name: "Échiquier du Touquet" })).toBeVisible();
  await page.getByPlaceholder("Nom du joueur").fill("Ma");
  await page.goto("/tournoi/open-cote-opale-2026/comparer");
  await expect(page.getByRole("heading", { name: "Comparer les parcours" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /CSV/i }).click();
  await download;
});
