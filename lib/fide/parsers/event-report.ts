import { load } from "cheerio";
import type { FideEventResult, FideEventType, FideRatingType } from "../types";
import { normalizeFideId } from "../identity/normalize-fide-id";

function num(value: string) {
  const cleaned = value.replace(/\u00a0/g, " ").trim();
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function inferEventType(name: string): FideEventType {
  if (/coupe|cup/i.test(name)) return "cup";
  if (/team|équipe|equipe|interclub/i.test(name)) return "team";
  return name ? "individual" : "unknown";
}

export function parseFideEventReport(
  html: string,
  eventId: string,
  ratingType: FideRatingType = "standard",
): FideEventResult[] {
  const $ = load(html);
  const title = $("title").text().replace(/\s+FIDE Chess Tournament report.*$/i, "").trim();
  const period = $("a[href*='period=']").first().attr("href")?.match(/period=(\d{4}-\d{2}-\d{2})/)?.[1];
  const sourceUrl = `https://ratings.fide.com/report.phtml?event=${encodeURIComponent(eventId)}&t=${ratingType === "rapid" ? 1 : ratingType === "blitz" ? 2 : 0}`;
  const results: FideEventResult[] = [];
  $("table.table2 tr").slice(1).each((_, row) => {
    const cells = $(row).find("td").map((__, cell) => $(cell).text().replace(/\u00a0/g, " ").trim()).get();
    if (!/^\d+$/.test(cells[0] ?? "")) return;
    results.push({
      eventId,
      eventName: title || `Compétition FIDE ${eventId}`,
      ratingPeriod: $(row).find("a[href*='period=']").attr("href")?.match(/period=(\d{4}-\d{2}-\d{2})/)?.[1] ?? period,
      ratingType,
      eventType: inferEventType(title),
      fideId: normalizeFideId(cells[0]),
      playerName: cells[1],
      federation: cells[2] || undefined,
      playerRating: num(cells[4]),
      score: num(cells[6]),
      games: num(cells[7]),
      ratingChange: num(cells[8]),
      sourceUrl,
    });
  });
  if (!results.length) throw new Error("Rapport FIDE non reconnu");
  return results;
}
