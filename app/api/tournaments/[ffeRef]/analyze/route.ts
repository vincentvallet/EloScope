import { NextResponse } from "next/server";
import { FfeResultsAdapter } from "@/lib/importers/ffe";

export async function POST(_request: Request, context: { params: Promise<{ ffeRef: string }> }) {
  const { ffeRef } = await context.params;
  if (!/^\d+$/.test(ffeRef)) return NextResponse.json({ error: "Référence FFE invalide" }, { status: 400 });
  try {
    const adapter = new FfeResultsAdapter();
    const input = `https://www.echecs.asso.fr/FicheTournoi.aspx?Ref=${ffeRef}`;
    const source = await adapter.fetchSource(input);
    const parsed = await adapter.parseSource(source);
    return NextResponse.json({ ok: true, data: adapter.normalize(parsed), fetchedAt: source.fetchedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analyse impossible" }, { status: 400 });
  }
}
