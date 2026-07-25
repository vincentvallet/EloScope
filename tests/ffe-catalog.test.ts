import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { AspNetPostBackClient, extractHiddenFields, extractPostBacks } from "@/lib/ffe-catalog/aspnet-postback";
import { parseTournamentList } from "@/lib/ffe-catalog/parsers/results-list";
import { parseTournamentDetails } from "@/lib/ffe-catalog/parsers/tournament-details";
import { normalizeSearchText } from "@/lib/ffe-catalog/normalizers/text";
import { parsePartialFrenchDate } from "@/lib/ffe-catalog/normalizers/dates";
import { mergeTournament } from "@/lib/ffe-catalog/merge";
import { MemoryCatalogStorage } from "@/lib/ffe-catalog/storage/memory";
import { searchCatalog } from "@/lib/ffe-catalog/search";
import type { CatalogBatch } from "@/lib/ffe-catalog/types";

const fixture = (name: string) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("catalogue FFE", () => {
  it("lit une liste mensuelle, les résultats, la Corse et l'outre-mer", async () => {
    const html = await fixture("ffe-results.html");
    const items = parseTournamentList(html, "https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES", new Date("2026-02-28T12:00:00Z"));
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      ffeRef: "67414", startDate: "2026-02-21", departmentCode: "59",
      regionName: "Hauts-de-France", hasResults: true, cadence: "unknown",
    });
    expect(items[1]).toMatchObject({ departmentCode: "2A", regionName: "Corse", cadence: "rapid" });
    expect(items[2]).toMatchObject({ departmentCode: "971", regionName: "Guadeloupe", cadence: "blitz" });
  });

  it("conserve les champs ASP.NET et suit un postback sans boucle", async () => {
    const [page1, page2] = await Promise.all([fixture("ffe-results.html"), fixture("ffe-results-page-2.html")]);
    expect(extractHiddenFields(page1)).toMatchObject({ __VIEWSTATE: "fixture-state", __EVENTVALIDATION: "fixture-validation" });
    expect(extractPostBacks(page1)).toEqual([{ target: "ctl00$ContentPlaceHolderMain$PagerHeader", argument: "2" }]);
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      new Response(init?.method === "POST" ? page2 : page1, { status: 200, headers: { "content-type": "text/html" } }));
    const pages = await new AspNetPostBackClient(fetcher as typeof fetch, 0).pages("https://www.echecs.asso.fr/ListeTournois.aspx", { maxPages: 5 });
    expect(pages).toHaveLength(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const postBody = String(fetcher.mock.calls[1][1]?.body);
    expect(postBody).toContain("__VIEWSTATE=fixture-state");
    expect(postBody).toContain("__EVENTTARGET=ctl00%24ContentPlaceHolderMain%24PagerHeader");
  });

  it("parse une fiche complète et n'invente pas les champs absents", async () => {
    const detail = parseTournamentDetails(await fixture("ffe-detail.html"), "https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=67414", new Date("2026-02-22T12:00:00Z"));
    expect(detail).toMatchObject({
      ffeRef: "67414", startDate: "2026-02-21", endDate: "2026-02-27",
      cadence: "standard", rounds: 9, organizer: "FERYN Alexandre",
      status: "results_available", hasResults: true,
    });
    expect(parseTournamentDetails((await fixture("ffe-detail.html")).replace("Organisateur : FERYN Alexandre", ""), "https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=67414").organizer).toBeUndefined();
  });

  it("normalise accents, apostrophes, tirets et dates françaises", () => {
    expect(normalizeSearchText("Cappelle‑la‑Grande — Échecs")).toBe("cappelle la grande echecs");
    expect(parsePartialFrenchDate("31 déc.", 2025, 12)).toBe("2025-12-31");
    expect(parsePartialFrenchDate("1 janv.", 2026, 1)).toBe("2026-01-01");
  });

  it("fusionne calendrier et résultats par référence avec changement de statut", async () => {
    const result = parseTournamentList(await fixture("ffe-results.html"), "https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES")[0];
    const announced = { ...result, sourceListUrl: "https://www.echecs.asso.fr/Calendrier.aspx", hasResults: false, status: "upcoming" as const };
    expect(mergeTournament(announced, result)).toMatchObject({ ffeRef: "67414", hasResults: true, status: "results_available" });
  });

  it("classe une recherche accentuée et multi-mots avec filtres et pagination", async () => {
    const storage = new MemoryCatalogStorage();
    const items = parseTournamentList(await fixture("ffe-results.html"), "https://www.echecs.asso.fr/ListeTournois.aspx?Action=RES");
    await storage.setJSON("months/2026-02.json", { key: "2026-02", items, fetchedAt: new Date().toISOString(), sourceUrl: "fixture" } satisfies CatalogBatch);
    const cappelle = await searchCatalog(storage, { q: "cappelle grande", region: "Hauts-de-France", department: "59", pageSize: 1 });
    expect(cappelle.pagination).toMatchObject({ total: 1, pageCount: 1 });
    expect(cappelle.items[0].ffeRef).toBe("67414");
    const accentless = await searchCatalog(storage, { q: "echecs", page: 1, pageSize: 1 });
    expect(accentless.pagination.total).toBe(1);
  });
});
