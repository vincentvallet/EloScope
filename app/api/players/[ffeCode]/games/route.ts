import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, pageParams, paginate, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `games:${code}`)) return apiError("Trop de requêtes", 429);
  const report = (await getGlobalReport(code)).report;
  if (!report) return apiError("Rapport non généré", 404);
  const { page, pageSize } = pageParams(request);
  return NextResponse.json({ ...paginate(report.games, page, pageSize), note: "Résultats classés officiels, sans notation PGN." });
}
