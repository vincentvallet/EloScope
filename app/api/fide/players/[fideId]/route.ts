import { NextResponse } from "next/server";
import { apiError, fideApiAllowed } from "@/lib/fide/api";
import { normalizeFideId } from "@/lib/fide/identity/normalize-fide-id";
import { fideStorage } from "@/lib/fide/storage";
import type { FidePlayer } from "@/lib/fide/types";

export async function GET(request: Request, context: { params: Promise<{ fideId: string }> }) {
  let fideId: string;
  try { fideId = normalizeFideId((await context.params).fideId); } catch { return apiError("Identifiant FIDE invalide", 400); }
  if (!fideApiAllowed(request, `player:${fideId}`, 20)) return apiError("Trop de requêtes", 429);
  const player = await fideStorage().getJSON<FidePlayer>(`fide/players/${fideId}/profile.json`);
  if (!player) return apiError("Profil non présent dans le cache partagé", 404);
  return NextResponse.json({ player }, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=86400" } });
}
