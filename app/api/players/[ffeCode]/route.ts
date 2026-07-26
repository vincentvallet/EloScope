import { NextResponse } from "next/server";
import { z } from "zod";
import { FfePlayersClient } from "@/lib/ffe-players/client";
import { savePlayerProfiles, searchPlayers } from "@/lib/ffe-players/search";
import { playerStorage } from "@/lib/ffe-players/storage";
import type { FfePlayerProfile, PlayerTournamentParticipation } from "@/lib/ffe-players/types";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  ratingType: z.enum(["standard", "rapid", "blitz", "unknown"]).optional(),
  includeUnplayed: z.enum(["true", "false"]).default("false"),
  includeAmbiguous: z.enum(["true", "false"]).default("false"),
});

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const { ffeCode: raw } = await context.params;
  const ffeCode = raw.toUpperCase();
  if (!/^[A-Z]\d{5}$/.test(ffeCode)) return NextResponse.json({ error: "Code FFE invalide" }, { status: 400 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Filtres invalides" }, { status: 400 });
  const storage = playerStorage();
  let profile = await storage.getJSON<FfePlayerProfile>(`players/profiles/${ffeCode}.json`);
  if (!profile) {
    const matches = await searchPlayers(storage, new FfePlayersClient(), ffeCode);
    profile = matches.find((item) => item.ffeCode === ffeCode) ?? null;
  }
  if (!profile) return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });
  if (profile.sourceUrl && !profile.fideId) {
    try {
      profile = await new FfePlayersClient().enrich(profile);
      await savePlayerProfiles(storage, [profile]);
    } catch {}
  }
  const keys = await storage.list(`players/by-code/${ffeCode}/participations/`);
  let participations = (await Promise.all(keys.map((key) => storage.getJSON<PlayerTournamentParticipation>(key))))
    .filter(Boolean) as PlayerTournamentParticipation[];
  const filters = parsed.data;
  participations = participations
    .filter((item) => filters.includeUnplayed === "true" || (item.playedRounds ?? 0) > 0)
    .filter((item) => filters.includeAmbiguous === "true" || item.identityConfidence !== "ambiguous")
    .filter((item) => !filters.year || item.year === filters.year)
    .filter((item) => !filters.ratingType || item.ratingType === filters.ratingType)
    .sort((a, b) => (b.tournamentStartDate ?? b.indexedAt).localeCompare(a.tournamentStartDate ?? a.indexedAt));
  const total = participations.length;
  const items = participations.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize);
  return NextResponse.json({
    profile,
    participations: items,
    pagination: { page: filters.page, pageSize: filters.pageSize, total, pageCount: Math.max(1, Math.ceil(total / filters.pageSize)) },
    coverage: { complete: false },
  });
}
