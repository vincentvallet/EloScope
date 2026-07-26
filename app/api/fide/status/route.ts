import { NextResponse } from "next/server";
import { fideApiAllowed, apiError } from "@/lib/fide/api";
import { fideStorage } from "@/lib/fide/storage";

export async function GET(request: Request) {
  if (!fideApiAllowed(request, "status", 60)) return apiError("Trop de requêtes", 429);
  const storage = fideStorage();
  const [latest, sync] = await Promise.all([
    storage.getJSON("fide/rating-lists/latest.json"),
    storage.getJSON("fide/metadata/sync-status.json"),
  ]);
  return NextResponse.json({ available: true, latestRatingList: latest, sync, policy: { maxConcurrency: 1, delayMs: "800–1500", scan: false } });
}
