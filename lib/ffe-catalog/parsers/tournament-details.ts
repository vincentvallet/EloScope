import { load } from "cheerio";
import { parseFrenchDateRange } from "../normalizers/dates";
import { cleanText, inferCadence, normalizeSearchText } from "../normalizers/text";
import type { FfeTournamentCatalogItem } from "../types";

function field(text: string, label: string) {
  const pattern = new RegExp(`${label}\\s*:\\s*(.+?)(?=\\s+(?:Dates|Prise en compte|Homologu[eé] par|Nombre de rondes|Cadence|Appariements|Organisateur|Arbitre|Adresse|Contact|Total des prix|Inscription|Annonce)\\s*:|$)`, "i");
  return cleanText(text.match(pattern)?.[1] ?? "") || undefined;
}

export function parseTournamentDetails(html: string, sourceDetailUrl: string, now = new Date()) {
  const $ = load(html);
  const container = $("table").filter((_, table) => /Dates\s*:|Nombre de rondes\s*:/i.test($(table).text())).first();
  if (!container.length) throw new Error("Fiche tournoi FFE non reconnue");
  const text = cleanText(container.text());
  const rows = container.find("tr").toArray().map((row) => cleanText($(row).text()));
  const title = rows[0]?.replace(/\s+(?:2[AB]|\d{2,3})\s*-\s*.+$/, "") || cleanText($("h1").first().text());
  const location = rows.map((row) => row.match(/(?:^|\s)(2[AB]|\d{2,3})\s*-\s*(.+)$/i)).find(Boolean);
  const range = parseFrenchDateRange(field(text, "Dates") ?? text);
  const cadenceText = field(text, "Cadence");
  const resultsLink = container.find("a[href*='Resultats.aspx'][href*='Action=Ga']").attr("href");
  const ref = new URL(sourceDetailUrl).searchParams.get("Ref") ?? "";
  const today = now.toISOString().slice(0, 10);
  const hasResults = !!resultsLink;
  return {
    ffeRef: ref,
    title,
    normalizedTitle: normalizeSearchText(title),
    city: location?.[2],
    departmentCode: location?.[1]?.toUpperCase(),
    ...range,
    year: range.startDate ? Number(range.startDate.slice(0, 4)) : undefined,
    month: range.startDate ? Number(range.startDate.slice(5, 7)) : undefined,
    cadence: inferCadence(cadenceText, title),
    status: hasResults
      ? "results_available"
      : range.startDate && range.startDate > today
        ? "upcoming"
        : range.endDate && range.endDate >= today
          ? "in_progress"
          : range.endDate
            ? "completed_without_results"
            : "unknown",
    hasResults,
    sourceListUrl: sourceDetailUrl,
    sourceDetailUrl,
    resultUrl: resultsLink ? new URL(resultsLink, sourceDetailUrl).toString() : undefined,
    firstSeenAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    rounds: Number(field(text, "Nombre de rondes")?.match(/\d+/)?.[0]) || undefined,
    organizer: field(text, "Organisateur"),
    arbiter: field(text, "Arbitre"),
    address: field(text, "Adresse"),
  } satisfies FfeTournamentCatalogItem;
}
