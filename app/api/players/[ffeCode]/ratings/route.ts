import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, pageParams, paginate, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";
import type { FideRatingType } from "@/lib/fide/types";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `ratings:${code}`)) return apiError("Trop de requêtes", 429);
  const report = (await getGlobalReport(code)).report;
  if (!report) return apiError("Rapport non généré", 404);
  const type = new URL(request.url).searchParams.get("type") as FideRatingType | null;
  if (type && !["standard", "rapid", "blitz"].includes(type)) return apiError("Cadence invalide", 400);
  const items = report.ratings.filter((item) => !type || item.ratingType === type);
  const { page, pageSize } = pageParams(request);
  return NextResponse.json(paginate(items, page, pageSize));
}
