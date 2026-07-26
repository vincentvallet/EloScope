import { load } from "cheerio";
import type { FidePlayer, FideRatingPoint, FideRatingType } from "../types";
import { normalizeFideId } from "../identity/normalize-fide-id";
import { FIDE_TITLE_LABELS, normalizeFideTitle, resolveFederation, validBirthYear } from "../federations";

const months: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

function number(value: string) {
  const parsed = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function period(value: string) {
  const match = value.trim().match(/^(\d{4})-([A-Za-z]{3})$/);
  return match && months[match[2]] ? `${match[1]}-${months[match[2]]}-01` : undefined;
}

export function parseFideProfile(html: string, requestedId: string, fetchedAt = new Date().toISOString()): FidePlayer {
  const $ = load(html);
  const fideId = normalizeFideId($(".profile-info-id").first().text() || requestedId);
  const rawName = $(".player-title").first().text().trim();
  if (!rawName || !fideId) throw new Error("Profil FIDE non reconnu");
  const title = $(".profile-info-title p").first().text().trim();
  const federation = $(".profile-info-country").first().text().trim();
  const federationFromName = resolveFederation(undefined, federation);
  const flagIso = $(".profile-info-country img").first().attr("src")?.match(/\/flags\/([a-z]{2})\./i)?.[1]?.toUpperCase();
  const federationInfo = federationFromName ?? (flagIso === "FR" ? resolveFederation("FRA") : undefined);
  const fideTitle = normalizeFideTitle(title);
  const birthYear = validBirthYear($(".profile-info-byear").first().text());
  const sourceUrl = `https://ratings.fide.com/profile/${fideId}`;
  const ratings: FideRatingPoint[] = [];
  $(".profile-table_calc tbody tr").each((_, row) => {
    const cells = $(row).find("td").map((__, cell) => $(cell).text().replace(/\u00a0/g, " ").trim()).get();
    const ratingPeriod = period(cells[0] ?? "");
    if (!ratingPeriod) return;
    const columns: Array<[FideRatingType, number, number]> = [
      ["standard", 1, 2], ["rapid", 3, 4], ["blitz", 5, 6],
    ];
    for (const [ratingType, ratingIndex, gamesIndex] of columns) {
      const rating = number(cells[ratingIndex] ?? "");
      const games = Number(cells[gamesIndex]);
      if (rating == null && !Number.isFinite(games)) continue;
      ratings.push({
        fideId, period: ratingPeriod, ratingType, rating,
        games: Number.isFinite(games) ? games : undefined,
        isPublishedOfficialRating: true, sourceUrl,
      });
    }
  });
  const latest = (type: FideRatingType) => ratings.find((item) => item.ratingType === type)?.rating;
  return {
    fideId,
    name: rawName.includes(",") ? rawName.split(",").reverse().map((item) => item.trim()).join(" ") : rawName,
    federation: federation || undefined,
    title: fideTitle,
    federationCode: federationInfo?.fideCode,
    federationName: federationInfo?.displayName ?? (federation || undefined),
    federationFlag: federationInfo?.flagCode,
    ...(birthYear ? { birthYear } : {}),
    fideTitle,
    fideTitleLabel: fideTitle ? FIDE_TITLE_LABELS[fideTitle] : undefined,
    active: ratings.some((item) => (item.games ?? 0) > 0),
    standardRating: latest("standard"),
    rapidRating: latest("rapid"),
    blitzRating: latest("blitz"),
    ratings,
    sourceUrl,
    fetchedAt,
  };
}
