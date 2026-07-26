import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `report:${code}`)) return apiError("Trop de requêtes", 429);
  const result = await getGlobalReport(code);
  if (!result.report) return NextResponse.json({ state: result.metadata?.status ?? "missing", metadata: result.metadata }, { status: 202 });
  return NextResponse.json({ state: result.stale ? "partial" : "ready", ...result }, {
    headers: { "cache-control": "public, max-age=300, stale-while-revalidate=86400" },
  });
}
