import federations from "@/data/fide-federations.json";

export type FidePlayerTitle = "GM" | "IM" | "FM" | "CM" | "WGM" | "WIM" | "WFM" | "WCM";

export type PlayerFederation = {
  fideCode: string;
  displayName: string;
  isoCountryCode?: string;
  flagCode: string;
};

export const FIDE_TITLE_LABELS: Record<FidePlayerTitle, string> = {
  GM: "Grand maître international",
  IM: "Maître international",
  FM: "Maître FIDE",
  CM: "Candidat maître",
  WGM: "Grand maître féminin",
  WIM: "Maître international féminin",
  WFM: "Maître FIDE féminin",
  WCM: "Candidate maître féminin",
};

export function normalizeFideTitle(value?: string): FidePlayerTitle | undefined {
  const code = value?.trim().toUpperCase() as FidePlayerTitle | undefined;
  return code && code in FIDE_TITLE_LABELS ? code : undefined;
}

export function validBirthYear(value: unknown, currentYear = new Date().getUTCFullYear()) {
  const year = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isInteger(year) && year >= 1900 && year <= currentYear ? year : undefined;
}

export function resolveFederation(code?: string, displayName?: string): PlayerFederation | undefined {
  const normalizedCode = code?.trim().toUpperCase();
  if (normalizedCode) {
    const entry = (federations as Record<string, { nameFr: string; iso2?: string; flag: string }>)[normalizedCode];
    return entry
      ? { fideCode: normalizedCode, displayName: entry.nameFr, isoCountryCode: entry.iso2, flagCode: entry.flag }
      : { fideCode: normalizedCode, displayName: displayName?.trim() || normalizedCode, flagCode: "🌐" };
  }
  const normalizedName = displayName?.trim().toLocaleLowerCase("fr");
  if (!normalizedName) return undefined;
  const match = Object.entries(federations).find(([, entry]) => entry.nameFr.toLocaleLowerCase("fr") === normalizedName);
  return match
    ? { fideCode: match[0], displayName: match[1].nameFr, isoCountryCode: "iso2" in match[1] ? match[1].iso2 : undefined, flagCode: match[1].flag }
    : { fideCode: displayName!.trim().toUpperCase().slice(0, 3), displayName: displayName!.trim(), flagCode: "🌐" };
}
