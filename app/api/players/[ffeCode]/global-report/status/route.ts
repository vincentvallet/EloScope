import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `status:${code}`, 60)) return apiError("Trop de requêtes", 429);
  const result = await getGlobalReport(code);
  const state = result.stale && result.metadata?.status === "ready"
    ? "partial_ready"
    : result.metadata?.status ?? (result.report ? (result.stale ? "partial_ready" : "ready") : "missing");
  return NextResponse.json({
    state,
    metadata: result.metadata,
  });
}
