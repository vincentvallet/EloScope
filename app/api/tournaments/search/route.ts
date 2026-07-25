import { NextResponse } from "next/server";
import { catalogStorage } from "@/lib/ffe-catalog/storage";
import { searchCatalog } from "@/lib/ffe-catalog/search";
import type { FfeCadence, FfeTournamentStatus, TournamentSearchParams } from "@/lib/ffe-catalog/types";

function optionalNumber(value: string | null) {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const q = query.get("q")?.trim();
  if (q && q.length < 2) {
    return NextResponse.json({ error: "Saisissez au moins deux caractères." }, { status: 400 });
  }
  const params: TournamentSearchParams = {
    q,
    from: query.get("from") || undefined,
    to: query.get("to") || undefined,
    year: optionalNumber(query.get("year")),
    month: optionalNumber(query.get("month")),
    region: query.get("region") || undefined,
    department: query.get("department") || undefined,
    cadence: (query.get("cadence") || undefined) as FfeCadence | undefined,
    status: (query.get("status") || undefined) as FfeTournamentStatus | undefined,
    hasResults: query.has("hasResults") ? query.get("hasResults") === "true" : undefined,
    page: optionalNumber(query.get("page")),
    pageSize: optionalNumber(query.get("pageSize")),
    sort: (query.get("sort") || undefined) as TournamentSearchParams["sort"],
  };
  try {
    return NextResponse.json(await searchCatalog(catalogStorage(), params), {
      headers: { "cache-control": "public, max-age=30, stale-while-revalidate=300" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Recherche indisponible" }, { status: 503 });
  }
}
