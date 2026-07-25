import { NextResponse } from "next/server";
import { FfeCatalogClient } from "@/lib/ffe-catalog/client";
import { departmentInfo } from "@/lib/ffe-catalog/departments";
import { mergeTournament } from "@/lib/ffe-catalog/merge";
import { readCatalog } from "@/lib/ffe-catalog/search";
import { catalogStorage } from "@/lib/ffe-catalog/storage";
import type { FfeTournamentCatalogItem } from "@/lib/ffe-catalog/types";

export async function GET(_request: Request, context: { params: Promise<{ ffeRef: string }> }) {
  const { ffeRef } = await context.params;
  if (!/^\d+$/.test(ffeRef)) return NextResponse.json({ error: "Référence FFE invalide" }, { status: 400 });
  const storage = catalogStorage();
  try {
    const cached = await storage.getJSON<FfeTournamentCatalogItem>(`details/${ffeRef}.json`);
    const listItem = (await readCatalog(storage)).find((item) => item.ffeRef === ffeRef);
    if (cached) return NextResponse.json(mergeTournament(listItem, cached));
    const detail = await new FfeCatalogClient().detail(ffeRef);
    const geo = departmentInfo(detail.departmentCode);
    const enriched = { ...detail, departmentName: geo?.name, regionCode: geo?.regionCode, regionName: geo?.regionName };
    await storage.setJSON(`details/${ffeRef}.json`, enriched);
    return NextResponse.json(mergeTournament(listItem, enriched), {
      headers: { "cache-control": "public, max-age=300, stale-while-revalidate=21600" },
    });
  } catch (error) {
    const listItem = (await readCatalog(storage)).find((item) => item.ffeRef === ffeRef);
    if (listItem) return NextResponse.json({ ...listItem, partial: true });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tournoi introuvable" }, { status: 404 });
  }
}
