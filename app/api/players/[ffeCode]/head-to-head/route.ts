import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";
import { normalizeFideId } from "@/lib/fide/identity/normalize-fide-id";
import { headToHead } from "@/lib/fide/statistics";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `h2h:${code}`)) return apiError("Trop de requêtes", 429);
  const raw = new URL(request.url).searchParams.get("opponentFideId");
  if (!raw) return apiError("Adversaire requis", 400);
  let opponentFideId: string;
  try { opponentFideId = normalizeFideId(raw); } catch { return apiError("Identifiant adverse invalide", 400); }
  const report = (await getGlobalReport(code)).report;
  if (!report) return apiError("Rapport non généré", 404);
  return NextResponse.json(headToHead(report.games, opponentFideId));
}
