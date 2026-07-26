import type { FfePlayerProfile } from "@/lib/ffe-players/types";
import { normalizeFideId } from "./normalize-fide-id";

export type FfeFideLink = {
  ffeCode: string;
  fideId: string;
  confidence: "official-profile-link" | "official-grid" | "corroborated";
};

export function linkFfeToFide(profile: FfePlayerProfile): FfeFideLink | null {
  if (!profile.fideId) return null;
  return {
    ffeCode: profile.ffeCode,
    fideId: normalizeFideId(profile.fideId),
    confidence: "official-profile-link",
  };
}
