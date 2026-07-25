import { load } from "cheerio";
import { departmentInfo } from "../departments";
import { isoDate, parseFrenchMonth, parsePartialFrenchDate } from "../normalizers/dates";
import { cleanText, inferCadence, normalizeSearchText } from "../normalizers/text";
import type { FfeTournamentCatalogItem } from "../types";

export function parseTournamentList(
  html: string,
  sourceListUrl: string,
  now = new Date(),
  sourceKind: "results" | "calendar" | "committee" = "results",
) {
  const $ = load(html);
  const items: FfeTournamentCatalogItem[] = [];
  let contextYear: number | undefined;
  let contextMonth: number | undefined;
  $("tr").each((_, element) => {
    const row = $(element);
    const cells = row.children("td");
    if (cells.length === 1) {
      const heading = cleanText(cells.text());
      const match = normalizeSearchText(heading).match(/([a-z]+)\s+(\d{4})/);
      if (match) {
        contextMonth = parseFrenchMonth(match[1]);
        contextYear = Number(match[2]);
      }
      return;
    }
    const link = row.find("a[href*='FicheTournoi.aspx?Ref=']").first();
    const href = link.attr("href");
    const ref = href?.match(/[?&]Ref=(\d+)/i)?.[1];
    if (!ref) return;
    const values = cells.toArray().map((cell) => cleanText($(cell).text()));
    const title = cleanText(link.text());
    const city = values[1] || undefined;
    const departmentCode = values[2]?.toUpperCase() || undefined;
    const geography = departmentInfo(departmentCode);
    const startDate = parsePartialFrenchDate(values[4] ?? "", contextYear, contextMonth);
    const hasStandardResults = values[6] === "X" ? true : undefined;
    const hasRapidResults = values[7] === "X" ? true : undefined;
    const hasResults = sourceKind === "results" || !!hasStandardResults || !!hasRapidResults;
    const today = now.toISOString().slice(0, 10);
    const status = hasResults
      ? "results_available"
      : startDate && startDate > today
        ? "upcoming"
        : startDate === today
          ? "in_progress"
          : startDate
            ? "completed_without_results"
            : "unknown";
    const seenAt = now.toISOString();
    items.push({
      ffeRef: ref,
      title,
      normalizedTitle: normalizeSearchText(title),
      city,
      departmentCode,
      departmentName: geography?.name,
      regionCode: geography?.regionCode,
      regionName: geography?.regionName,
      startDate,
      endDate: startDate,
      year: startDate ? Number(startDate.slice(0, 4)) : contextYear,
      month: startDate ? Number(startDate.slice(5, 7)) : contextMonth,
      federation: values[5] || undefined,
      cadence: inferCadence(title),
      status,
      hasResults,
      hasStandardResults,
      hasRapidResults,
      sourceListUrl,
      sourceDetailUrl: new URL(href!, sourceListUrl).toString(),
      resultUrl: hasResults ? `https://www.echecs.asso.fr/Resultats.aspx?URL=Tournois/Id/${ref}/${ref}&Action=Ga` : undefined,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
    });
  });
  return [...new Map(items.map((item) => [item.ffeRef, item])).values()];
}

export function dateFromParts(year: number, month: number, day: number) {
  return isoDate(year, month, day);
}
