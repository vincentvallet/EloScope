import { NextResponse } from "next/server";
import { apiError, fideApiAllowed, pageParams, paginate, validateFfeCode } from "@/lib/fide/api";
import { getGlobalReport } from "@/lib/fide/report";

export async function GET(request: Request, context: { params: Promise<{ ffeCode: string }> }) {
  const code = validateFfeCode((await context.params).ffeCode);
  if (!code) return apiError("Code FFE invalide", 400);
  if (!fideApiAllowed(request, `events:${code}`)) return apiError("Trop de requêtes", 429);
  const report = (await getGlobalReport(code)).report;
  if (!report) return apiError("Rapport non généré", 404);
  const url = new URL(request.url);
  const source = url.searchParams.get("source");
  const year = url.searchParams.get("year");
  const ratingType = url.searchParams.get("ratingType");
  const eventType = url.searchParams.get("eventType");
  const catalogStatus = url.searchParams.get("catalogStatus");
  const reportStatus = url.searchParams.get("reportStatus");
  const sort = url.searchParams.get("sort") ?? "desc";
  if (sort !== "asc" && sort !== "desc") return apiError("Tri invalide", 400);
  let items = report.careerEvents ?? [];
  items = items.filter((item) =>
    (!source || item.sources.some((entry) => entry.type === source))
    && (!year || item.year === Number(year))
    && (!ratingType || item.ratingType === ratingType)
    && (!eventType || item.eventType === eventType)
    && (!catalogStatus || item.catalogStatus === catalogStatus)
    && (!reportStatus || item.reportStatus === reportStatus));
  items.sort((a, b) => {
    const result = (a.startDate || a.ratingPeriod || String(a.year || "")).localeCompare(b.startDate || b.ratingPeriod || String(b.year || ""));
    return sort === "asc" ? result : -result;
  });
  const { page, pageSize } = pageParams(request);
  return NextResponse.json(paginate(items, page, pageSize));
}
