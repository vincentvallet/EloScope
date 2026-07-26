import { load } from "cheerio";
import type { FideRatedGame, FideRatingType } from "../types";
import { inferEventType } from "./event-report";
import { normalizeFideId } from "../identity/normalize-fide-id";

const resultValue = (value: string): 0 | 0.5 | 1 | undefined => {
  const normalized = value.replace(",", ".").trim();
  const numeric = Number(normalized);
  if (numeric === 1) return 1;
  if (numeric === 0.5 || normalized.includes("½")) return 0.5;
  if (numeric === 0) return 0;
  return undefined;
};

export function parseFideCalculations(
  html: string,
  fideIdValue: string,
  ratingPeriod: string,
  ratingType: FideRatingType,
): FideRatedGame[] {
  const $ = load(html);
  const fideId = normalizeFideId(fideIdValue);
  const games: FideRatedGame[] = [];
  $("table.calc_table").each((tableIndex, table) => {
    const eventBlock = $(table).prevAll(".default_div_full").first();
    const eventLink = eventBlock.find("a[href*='report.phtml']").first();
    const eventName = eventLink.text().trim() || "Calcul FIDE";
    const eventId = eventLink.attr("href")?.match(/event=(\d+)/)?.[1];
    const summary = $(table).find("tr").eq(1).find("td").map((_, cell) => $(cell).text().trim()).get();
    const playerRatingBefore = Number(summary[1]) || undefined;
    $(table).find("tr").slice(3).each((rowIndex, row) => {
      const cells = $(row).find("td");
      if (!cells.first().hasClass("list4")) return;
      const opponentName = cells.first().clone().children().remove().end().text().replace(/\u00a0/g, " ").trim();
      if (!opponentName) return;
      const result = resultValue(cells.eq(5).text());
      const color = cells.first().find(".white_note").length ? "white" : cells.first().find(".black_note").length ? "black" : "unknown";
      games.push({
        id: `${fideId}:${ratingPeriod}:${ratingType}:${tableIndex}:${rowIndex}`,
        fideId, opponentName, result, color,
        playerRatingBefore,
        opponentRating: Number(cells.eq(3).text().trim()) || undefined,
        eventId, eventName, eventType: inferEventType(eventName),
        ratingPeriod, ratingType,
        sourceUrl: `https://ratings.fide.com/calculations.phtml?id_number=${fideId}&period=${ratingPeriod}&rating=${ratingType === "rapid" ? 1 : ratingType === "blitz" ? 2 : 0}`,
      });
    });
  });
  if (games.length) return games;
  let eventName = "Calcul FIDE";
  $("tr").each((index, row) => {
    const cells = $(row).find("td").map((_, cell) => $(cell).text().replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()).get();
    const joined = cells.join(" ");
    if (cells.length < 4) return;
    if (/tournament|event|comp(e|é)tition/i.test(joined) && cells.length < 7) {
      eventName = cells.find((cell) => cell.length > 4) ?? eventName;
      return;
    }
    const opponentLink = $(row).find("a[href*='id_number='], a[href*='/profile/']").first();
    const opponentFideId = opponentLink.attr("href")?.match(/(?:id_number=|profile\/)(\d+)/)?.[1];
    const opponentName = opponentLink.text().trim() || cells.find((cell) => /[A-Za-zÀ-ÿ]{3}/.test(cell));
    if (!opponentName || !opponentFideId) return;
    const ratings = cells.map((cell) => Number(cell)).filter((value) => Number.isFinite(value) && value >= 100 && value <= 4000);
    games.push({
      id: `${fideId}:${ratingPeriod}:${ratingType}:${index}:${opponentFideId}`,
      fideId,
      opponentFideId: normalizeFideId(opponentFideId),
      opponentName,
      result: resultValue(joined),
      playerRatingBefore: ratings[0],
      opponentRating: ratings[1] ?? ratings[0],
      eventName,
      eventType: inferEventType(eventName),
      ratingPeriod,
      ratingType,
      sourceUrl: `https://ratings.fide.com/calculations.phtml?id_number=${fideId}&period=${ratingPeriod}&rating=${ratingType === "rapid" ? 1 : ratingType === "blitz" ? 2 : 0}`,
    });
  });
  return games;
}
