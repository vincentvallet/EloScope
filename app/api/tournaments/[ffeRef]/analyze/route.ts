import { NextResponse } from "next/server";
import { generateSharedReport } from "@/lib/reports/orchestrator";
import { tournamentReportStore } from "@/lib/reports/storage";
import { checkRateLimit } from "@/lib/server-rate-limit";

export async function POST(request: Request, context: { params: Promise<{ ffeRef: string }> }) {
  const { ffeRef } = await context.params;
  if (!/^\d+$/.test(ffeRef)) return NextResponse.json({ error: "Référence FFE invalide" }, { status: 400 });
  const ip = request.headers.get("x-nf-client-connection-ip") ?? request.headers.get("x-forwarded-for") ?? "local";
  if (!checkRateLimit(`report:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Trop de préparations demandées." }, { status: 429 });
  }
  const force = new URL(request.url).searchParams.get("refresh") === "true";
  const result = await generateSharedReport(tournamentReportStore(), ffeRef, force);
  if (result.kind === "ready") {
    return NextResponse.json({ ok: true, state: "ready", data: result.report, metadata: result.metadata, stale: result.stale });
  }
  if (result.kind === "pending") {
    return NextResponse.json({ ok: true, state: "pending", metadata: result.metadata }, { status: 202 });
  }
  return NextResponse.json({
    error: result.metadata?.error ?? "Préparation impossible",
    state: "error",
    metadata: result.metadata,
  }, { status: 503 });
}
