import { expect, test } from "@playwright/test";

const item = {
  ffeRef: "67414",
  title: "42e Open International d'échecs de Cappelle-la-Grande",
  normalizedTitle: "42e open international d echecs de cappelle la grande",
  city: "CAPPELLE LA GRANDE",
  departmentCode: "59",
  departmentName: "Nord",
  regionCode: "32",
  regionName: "Hauts-de-France",
  startDate: "2026-02-21",
  endDate: "2026-02-27",
  year: 2026,
  month: 2,
  cadence: "standard",
  status: "results_available",
  hasResults: true,
  sourceListUrl: "https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES",
  sourceDetailUrl: "https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=67414",
  resultUrl: "https://www.echecs.asso.fr/Resultats.aspx?URL=Tournois/Id/67414/67414&Action=Ga",
  firstSeenAt: "2026-02-21T00:00:00.000Z",
  lastSeenAt: "2026-07-25T00:00:00.000Z",
  rounds: 9,
};

test("recherche Cappelle, combine les filtres et les conserve au retour", async ({ page }) => {
  await page.route("**/api/tournaments/search**", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      items: [item],
      pagination: { page: 1, pageSize: 20, total: 1, pageCount: 1 },
      facets: {
        regions: [{ value: "Hauts-de-France", count: 1 }],
        departments: [{ value: "59", count: 1 }],
        years: [{ value: "2026", count: 1 }],
      },
      catalog: {
        catalogCount: 31900,
        earliestIndexedDate: "2000-01-15",
        latestIndexedDate: "2026-07-25",
        lastSuccessfulSyncAt: "2026-07-25T00:00:00.000Z",
        isRefreshing: false,
        historicalBackfill: {
          targetStart: "2000-01", targetEnd: "2026-07", totalMonths: 319,
          completedMonths: 120, emptyMonths: 3, failedMonths: 0, pendingMonths: 199,
          running: true, completed: false, updatedAt: "2026-07-25T00:00:00.000Z",
        },
      },
    }),
  }));
  await page.route("**/api/tournaments/67414", async (route) => route.fulfill({
    contentType: "application/json", body: JSON.stringify(item),
  }));
  await page.route("**/api/tournaments/67414/report**", async (route) => route.fulfill({
    status: 202, contentType: "application/json", body: JSON.stringify({ state: "missing" }),
  }));
  await page.route("**/api/tournaments/67414/analyze**", async (route) => route.fulfill({
    status: 202, contentType: "application/json", body: JSON.stringify({ state: "pending", metadata: { status: "fetching", progress: 15 } }),
  }));
  await page.goto("/tournois");
  await expect(page.getByText("Archives historiques en cours d’indexation")).toBeVisible();
  await page.getByRole("button", { name: "Années 2000" }).click();
  await expect(page).toHaveURL(/from=2000-01-01/);
  await expect(page).toHaveURL(/to=2009-12-31/);
  await page.getByLabel("Nom du tournoi, ville ou département").fill("Cappelle");
  await page.getByRole("button", { name: "Filtres avancés" }).click();
  await page.getByLabel("Région").selectOption("Hauts-de-France");
  await page.getByLabel("Département", { exact: true }).selectOption("59");
  await page.getByLabel("Du", { exact: true }).fill("2026-02-01");
  await page.getByLabel("Au", { exact: true }).fill("2026-02-28");
  await expect(page).toHaveURL(/q=Cappelle/);
  await expect(page).toHaveURL(/region=Hauts-de-France/);
  await page.getByRole("link", { name: item.title }).click();
  await expect(page.getByRole("heading", { name: "Préparation de votre rapport" })).toBeVisible({ timeout: 15_000 });
  await page.goBack();
  await expect(page).toHaveURL(/department=59/);
  await expect(page.getByLabel("Nom du tournoi, ville ou département")).toHaveValue("Cappelle", { timeout: 15_000 });
});
