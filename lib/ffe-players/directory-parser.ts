import { load } from "cheerio";
import { normalizePlayerName, splitFfeDisplayName } from "./identity";
import type { FfePlayerProfile } from "./types";

const number = (value: string) => Number(value.replace(/\D/g, "")) || undefined;
const text = (value: string) => value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

export function parsePlayerDirectory(html: string, fetchedAt = new Date().toISOString()) {
  const $ = load(html);
  const items: FfePlayerProfile[] = [];
  $("tr.liste_clair, tr.liste_fonce").each((_, row) => {
    const cells = $(row).find("td").toArray().map((cell) => text($(cell).text()));
    const ffeCode = cells[0]?.toUpperCase();
    if (!/^[A-Z]\d{5}$/.test(ffeCode ?? "")) return;
    const rawName = cells[1] ?? "";
    const identity = splitFfeDisplayName(rawName);
    const href = $(row).find("a[href*='FicheJoueur.aspx']").attr("href");
    const sourceUrl = href ? new URL(href, "https://www.echecs.asso.fr/").toString() : undefined;
    const ffeInternalId = sourceUrl ? new URL(sourceUrl).searchParams.get("Id") ?? undefined : undefined;
    items.push({
      ffeCode,
      ffeInternalId,
      ...identity,
      normalizedName: normalizePlayerName(identity.displayName),
      affiliationStatus: cells[2] || undefined,
      standardRating: number(cells[4] ?? ""),
      rapidRating: number(cells[5] ?? ""),
      blitzRating: number(cells[6] ?? ""),
      category: cells[7] || undefined,
      currentClubName: cells[9] || undefined,
      federation: "FRA",
      sourceUrl,
      fetchedAt,
    });
  });
  return items;
}
