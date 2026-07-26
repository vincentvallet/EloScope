import { NextResponse } from "next/server";
import { readSharedReport } from "@/lib/reports/orchestrator";
import { tournamentReportStore } from "@/lib/reports/storage";

export async function GET(_request: Request, context: { params: Promise<{ ffeRef: string }> }) {
  const { ffeRef } = await context.params;
  if (!/^\d+$/.test(ffeRef)) return NextResponse.json({ error: "Référence FFE invalide" }, { status: 400 });
  const result = await readSharedReport(tournamentReportStore(), ffeRef);
  if (result.report) {
    return NextResponse.json({ state: "ready", data: result.report, metadata: result.metadata, stale: result.stale }, {
      headers: { "cache-control": "public, max-age=30, stale-while-revalidate=300" },
    });
  }
  if (result.metadata?.status === "error") return NextResponse.json({ state: "error", metadata: result.metadata }, { status: 503 });
  return NextResponse.json({ state: result.metadata?.status ?? "missing", metadata: result.metadata }, { status: 202 });
}
