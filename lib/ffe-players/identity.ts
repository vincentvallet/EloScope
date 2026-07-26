import type { FfePlayerProfile, IdentityConfidence } from "./types";

export function normalizePlayerName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’`]/g, "'")
    .replace(/[^\p{L}\p{N}' -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("fr");
}

export function playerNameIndexSegment(value: string) {
  return normalizePlayerName(value).replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function playerNameIndexSegments(value: string) {
  const normalized = normalizePlayerName(value);
  const direct = playerNameIndexSegment(normalized);
  const reversed = playerNameIndexSegment(normalized.split(" ").reverse().join(" "));
  return [...new Set([direct, reversed])];
}

export function samePlayerName(left: string, right: string) {
  const normalizeTokens = (value: string) => normalizePlayerName(value).split(" ").filter(Boolean).sort().join("|");
  return normalizeTokens(left) === normalizeTokens(right);
}

export function splitFfeDisplayName(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ");
  let boundary = parts.findIndex((part) => /[a-zà-ÿ]/.test(part));
  if (boundary < 1) boundary = Math.max(1, parts.length - 1);
  const lastName = parts.slice(0, boundary).join(" ");
  const firstName = parts.slice(boundary).join(" ") || undefined;
  return {
    lastName,
    firstName,
    displayName: firstName ? `${firstName} ${lastName}` : lastName,
  };
}

export function identityConfidence(
  profile: FfePlayerProfile,
  candidate: {
    ffeCode?: string;
    ffeInternalId?: string;
    fideId?: string;
    name: string;
    club?: string;
    rating?: number;
  },
): IdentityConfidence {
  if (candidate.ffeCode && candidate.ffeCode === profile.ffeCode) return "exact_ffe_code";
  if (candidate.ffeInternalId && candidate.ffeInternalId === profile.ffeInternalId) return "exact_internal_id";
  if (candidate.fideId && candidate.fideId === profile.fideId) return "exact_fide_id";
  if (!samePlayerName(candidate.name, profile.displayName)) return "ambiguous";
  const clubMatches = candidate.club && profile.currentClubName
    && normalizePlayerName(candidate.club) === normalizePlayerName(profile.currentClubName);
  const ratingMatches = candidate.rating && profile.standardRating
    && Math.abs(candidate.rating - profile.standardRating) <= 100;
  return clubMatches || ratingMatches ? "strong_name_match" : "ambiguous";
}
