import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, validateFfeCode } from "@/lib/fide/api";
import { catalogStorage } from "@/lib/ffe-catalog/storage";
import { ensureInternalSecret } from "@/lib/ffe-catalog/sync";
import { buildGlobalReport, queueGlobalReport } from "@/lib/fide/report";
import { fideStorage } from "@/lib/fide/storage";

export async function POST(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `generate:${code}`, 5)) return apiError("Trop de générations demandées", 429);
  const storage = fideStorage();
  const queued = await queueGlobalReport(code, storage);
  if (queued.state === "ready" || queued.state === "pending") {
    return NextResponse.json(queued, { status: queued.state === "pending" ? 202 : 200 });
  }
  const netlify = process.env.NETLIFY === "true" || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  if (netlify) {
    const secret = await ensureInternalSecret(catalogStorage());
    const response = await fetch(new URL("/.netlify/functions/fide-player-report-worker", request.url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-eloscope-sync-secret": secret },
      body: JSON.stringify({ ffeCode: code, attemptId: queued.metadata?.attemptId }),
    });
    if (!response.ok) return apiError("Worker de génération indisponible", 503);
    return NextResponse.json(queued, { status: 202 });
  }
  const result = await buildGlobalReport(code, { attemptId: queued.metadata?.attemptId });
  if (result.state === "failed") return NextResponse.json(result, { status: 503 });
  return NextResponse.json(result, { status: result.state === "pending" ? 202 : 200 });
}
