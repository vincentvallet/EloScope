import { NextResponse } from "next/server";
import { z } from "zod";
import { FfePlayersClient } from "@/lib/ffe-players/client";
import { searchPlayers } from "@/lib/ffe-players/search";
import { playerStorage } from "@/lib/ffe-players/storage";
import { checkRateLimit } from "@/lib/server-rate-limit";

const schema = z.object({
  q: z.string().trim().min(3).max(80),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(20).default(20),
  club: z.string().trim().max(80).optional(),
  federation: z.string().trim().max(3).optional(),
  hasParticipations: z.enum(["true", "false"]).optional(),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Recherche invalide", details: parsed.error.flatten() }, { status: 400 });
  const ip = request.headers.get("x-nf-client-connection-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  if (!checkRateLimit(`players:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Trop de recherches. Réessayez dans une minute." }, { status: 429 });
  }
  const { q, page, pageSize, club, federation, hasParticipations } = parsed.data;
  try {
    const storage = playerStorage();
    const found = await searchPlayers(storage, new FfePlayersClient(), q, { club, federation, maxResults: 20 });
    const enriched = await Promise.all(found.map(async (profile) => {
      const keys = await storage.list(`players/by-code/${profile.ffeCode}/participations/`);
      return {
        ...profile,
        clubName: profile.currentClubName,
        indexedTournamentCount: keys.length,
        coverage: { complete: false },
      };
    }));
    const filtered = hasParticipations === "true" ? enriched.filter((item) => item.indexedTournamentCount > 0) : enriched;
    const total = filtered.length;
    const items = filtered.slice((page - 1) * pageSize, page * pageSize);
    return NextResponse.json({
      items,
      pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) },
    }, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=86400" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recherche FFE indisponible" }, { status: 502 });
  }
}
