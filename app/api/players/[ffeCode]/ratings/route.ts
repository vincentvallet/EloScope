import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";
import type { FideRatingType } from "@/lib/fide/types";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `ratings:${code}`)) return apiError("Trop de requêtes", 429);
  const report = (await getGlobalReport(code)).report;
  if (!report) return apiError("Rapport non généré", 404);
  const params = new URL(request.url).searchParams;
  const type = (params.get("ratingType") ?? params.get("type")) as FideRatingType | null;
  if (type && !["standard", "rapid", "blitz"].includes(type)) return apiError("Cadence invalide", 400);
  const from = params.get("from");
  const to = params.get("to");
  if ((from && !/^\d{4}-\d{2}(?:-\d{2})?$/.test(from)) || (to && !/^\d{4}-\d{2}(?:-\d{2})?$/.test(to))) return apiError("Période invalide", 400);
  const items = report.ratings.filter((item) =>
    (!type || item.ratingType === type)
    && (!from || item.period >= from)
    && (!to || item.period <= to));
  return NextResponse.json({ items, pagination: { page: 1, pageSize: items.length, total: items.length, pageCount: items.length ? 1 : 0 } });
}
