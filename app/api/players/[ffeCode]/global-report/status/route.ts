import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `status:${code}`, 60)) return apiError("Trop de requêtes", 429);
  const result = await getGlobalReport(code);
  return NextResponse.json({ state: result.report ? (result.stale ? "partial" : "ready") : result.metadata?.status ?? "missing", metadata: result.metadata });
}
